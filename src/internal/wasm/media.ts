// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaMediaBackend` and `CnaMediaLibraryBackend`: the media player, and
// CNA's index of the host's music and pictures.
//
// ## What a browser has, and what it does not
//
// The media *player* is CNA's own state machine over SDL3 audio, and every transition in it works
// in a browser exactly as it does on a desktop: play, pause, resume, stop, next, previous, volume,
// mute, repeat, shuffle and the queue position. Whether a sample is *audible* depends on the page
// having had a user gesture, which is a browser rule rather than a CNA one -- the same rule the
// sound-effect slice already records. So the state transitions are what this family claims, and
// audibility is not claimed at all.
//
// The media *library* indexes the host's Music and Pictures folders. A browser has neither: the
// module's filesystem is its own, and CNA finds nothing in it. An **empty library is the correct
// answer**, not a failure, and it is a different answer from a library that could not be opened --
// so the browser suite asserts that the library opens, reports zero of each collection, and refuses
// every index rather than asserting a count nobody planted.
//
// ## Ownership, which CNA's own headers split two ways
//
// A song out of a collection is a *new* handle the caller releases; an album, artist, genre,
// playlist or picture out of one is *borrowed* and must not be. Both rules are obeyed here, on this
// side of the boundary, and no media handle reaches a consumer: the snapshot walks the whole graph
// and hands back copied values. Relationships are carried **by name rather than by handle**,
// because handle equality is not identity in this family -- two calls for the same song return
// different handles, which the Node bridge measured and this file inherits.

import { CnaMediaBackendBase, CnaMediaLibraryBackendBase } from "../backend-base.js";
import type {
  MediaLibrarySnapshot,
  MediaNamedSnapshot,
  MediaPictureSnapshot,
  MediaSongPlaybackSnapshot,
  MediaSongSnapshot,
  MediaSourceSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { outBool, outI32, outI64, withStringView } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmMediaBackend extends CnaMediaBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's media player`);
  }

  /** The media sources the platform offers. A browser offers CNA's local one and no more. */
  public override getAvailableMediaSources(): readonly MediaSourceSnapshot[] {
    const count = this.#routes.outU32("cna_media_source_get_available_count", this.#game());
    return Array.from({ length: count }, (_, index) => ({
      Index: index,
      Name: this.#routes.copyString(
        "cna_media_source_get_name_size_at", "cna_media_source_copy_name_at", this.#game(), index,
      ),
      Type: this.#routes.outU32("cna_media_source_get_type_at", this.#game(), index),
    }));
  }

  /**
   * Builds a song collection from names and URIs and plays it from an index.
   *
   * Every handle made here is released here: the songs, then the collection, in the order CNA's
   * header requires. `MediaPlayer` holds what it needs of the queue itself, so a consumer is left
   * owning nothing -- which is what lets `playSongs` take plain values rather than handles.
   */
  public override playSongs(
    songs: readonly MediaSongPlaybackSnapshot[], index: number,
  ): void {
    const created: bigint[] = [];
    let collection: bigint | null = null;
    const scope = this.#routes.scope();
    try {
      const handles = scope.allocate(Math.max(songs.length, 1) * 8);
      const view = this.#routes.view();
      for (const [at, song] of songs.entries()) {
        const handle = withStringView(this.#routes, song.Name, (name) =>
          withStringView(this.#routes, song.Uri, (uri) =>
            this.#routes.outHandle("cna_song_create_from_uri", this.#game(), name, uri)));
        created.push(handle);
        view.setBigUint64(handles + at * 8, handle, true);
      }
      collection = this.#routes.outHandle(
        "cna_song_collection_create", this.#game(), handles, BigInt(songs.length),
      );
      this.#routes.invoke(
        "cna_media_player_play_songs_from", this.#game(), collection, Math.trunc(index),
      );
    } finally {
      if (collection !== null) this.#routes.call("cna_song_collection_destroy", collection);
      for (const song of created) this.#routes.call("cna_song_destroy", song);
      scope.dispose();
    }
  }

  public override pause(): void { this.#routes.invoke("cna_media_player_pause", this.#game()); }
  public override resume(): void { this.#routes.invoke("cna_media_player_resume", this.#game()); }
  public override stop(): void { this.#routes.invoke("cna_media_player_stop", this.#game()); }

  public override moveNext(): void {
    this.#routes.invoke("cna_media_player_move_next", this.#game());
  }

  public override movePrevious(): void {
    this.#routes.invoke("cna_media_player_move_previous", this.#game());
  }

  public override setVolume(value: number): void {
    this.#routes.invoke("cna_media_player_set_volume", this.#game(), value);
  }

  public override setMuted(value: boolean): void {
    this.#routes.invoke("cna_media_player_set_is_muted", this.#game(), value ? 1 : 0);
  }

  public override setRepeating(value: boolean): void {
    this.#routes.invoke("cna_media_player_set_is_repeating", this.#game(), value ? 1 : 0);
  }

  public override setShuffled(value: boolean): void {
    this.#routes.invoke("cna_media_player_set_is_shuffled", this.#game(), value ? 1 : 0);
  }

  public override setVisualizationEnabled(value: boolean): void {
    this.#routes.invoke(
      "cna_media_player_set_is_visualization_enabled", this.#game(), value ? 1 : 0,
    );
  }

  public override getGameHasControl(): boolean {
    return outBool(this.#routes, "cna_media_player_get_game_has_control", this.#game());
  }

  public override getPlayPositionTicks(): bigint {
    return outI64(this.#routes, "cna_media_player_get_play_position_ticks", this.#game());
  }

  /**
   * The visualisation buffers CNA fills, read as two arrays of 256 floats.
   *
   * The counts come from the measured field sizes rather than from a constant written here, so a
   * buffer that changes length is read whole rather than half-read. Silence answers with zeroes,
   * and this file does not dress that up: a spectrum is only meaningful once something is playing,
   * and that is recorded as the family's limit rather than hidden behind a plausible-looking array.
   */
  public override getVisualizationData(): {
    readonly Frequencies: readonly number[];
    readonly Samples: readonly number[];
  } {
    const scope = this.#routes.scope();
    try {
      const data = allocateStruct(this.#routes.module, scope, "CNA_VisualizationData");
      this.#routes.invoke("cna_media_player_get_visualization_data", this.#game(), data.pointer);
      return {
        Frequencies: data.getF32Array("frequencies"),
        Samples: data.getF32Array("samples"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override update(): void {
    this.#routes.invoke("cna_media_player_update_ext", this.#game());
  }
}

export class WasmMediaLibraryBackend extends CnaMediaLibraryBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's media library`);
  }

  public override createMediaLibrary(): NativeHandle {
    return this.#routes.outHandle("cna_media_library_create", this.#game());
  }

  public override destroyMediaLibrary(library: NativeHandle): void {
    this.#routes.invoke("cna_media_library_destroy", library);
  }

  /**
   * The whole index in one call: songs, albums, artists, genres, playlists and both picture
   * collections. Art and image *bytes* are deliberately absent -- XNA asks for those with a
   * method, and a library of photographs would otherwise be read into memory to open it.
   */
  public override getMediaLibrarySnapshot(library: NativeHandle): MediaLibrarySnapshot {
    return {
      Songs: this.#songRows(this.#routes.outHandle("cna_media_library_get_songs", library)),
      Albums: this.#namedRows(
        this.#routes.outHandle("cna_media_library_get_albums", library),
        "cna_album_collection_get_count", "cna_album_collection_get_at",
        "cna_album_get_name_size", "cna_album_copy_name",
        {
          duration: "cna_album_get_duration",
          artist: "cna_album_get_artist",
          genre: "cna_album_get_genre",
          hasArt: "cna_album_get_has_art",
        },
      ),
      Artists: this.#namedRows(
        this.#routes.outHandle("cna_media_library_get_artists", library),
        "cna_artist_collection_get_count", "cna_artist_collection_get_at",
        "cna_artist_get_name_size", "cna_artist_copy_name", {},
      ),
      Genres: this.#namedRows(
        this.#routes.outHandle("cna_media_library_get_genres", library),
        "cna_genre_collection_get_count", "cna_genre_collection_get_at",
        "cna_genre_get_name_size", "cna_genre_copy_name", {},
      ),
      Playlists: this.#namedRows(
        this.#routes.outHandle("cna_media_library_get_playlists", library),
        "cna_playlist_collection_get_count", "cna_playlist_collection_get_at",
        "cna_playlist_get_name_size", "cna_playlist_copy_name",
        { duration: "cna_playlist_get_duration" },
      ),
      Pictures: this.#pictureRows(
        this.#routes.outHandle("cna_media_library_get_pictures", library)),
      SavedPictures: this.#pictureRows(
        this.#routes.outHandle("cna_media_library_get_saved_pictures", library)),
    };
  }

  /**
   * A playlist's songs, by playlist index.
   *
   * Separate from the snapshot because a playlist's contents are the one relation that cannot be
   * carried by name: two playlists may hold the same song.
   */
  public override getMediaLibraryPlaylistSongs(
    library: NativeHandle, index: number,
  ): readonly MediaSongSnapshot[] {
    const playlists = this.#routes.outHandle("cna_media_library_get_playlists", library);
    const playlist = this.#routes.outHandle(
      "cna_playlist_collection_get_at", playlists, Math.trunc(index),
    );
    return this.#songRows(this.#routes.outHandle("cna_playlist_get_songs", playlist));
  }

  public override getMediaLibraryAlbumBytes(
    library: NativeHandle, index: number, thumbnail: boolean,
  ): Uint8Array {
    const albums = this.#routes.outHandle("cna_media_library_get_albums", library);
    const album = this.#routes.outHandle(
      "cna_album_collection_get_at", albums, Math.trunc(index),
    );
    return thumbnail
      ? this.#bytes(album, "cna_album_get_thumbnail_size", "cna_album_copy_thumbnail")
      : this.#bytes(album, "cna_album_get_art_size", "cna_album_copy_art");
  }

  public override getMediaLibraryPictureBytes(
    library: NativeHandle, saved: boolean, index: number, thumbnail: boolean,
  ): Uint8Array {
    const pictures = this.#routes.outHandle(
      saved ? "cna_media_library_get_saved_pictures" : "cna_media_library_get_pictures", library,
    );
    const picture = this.#routes.outHandle(
      "cna_picture_collection_get_at", pictures, Math.trunc(index),
    );
    return thumbnail
      ? this.#bytes(picture, "cna_picture_get_thumbnail_size", "cna_picture_copy_thumbnail")
      : this.#bytes(picture, "cna_picture_get_image_size", "cna_picture_copy_image");
  }

  public override saveMediaLibraryPicture(
    library: NativeHandle, name: string, image: Uint8Array,
  ): MediaPictureSnapshot {
    const scope = this.#routes.scope();
    try {
      const bytes = scope.allocateBytes(image);
      const picture = withStringView(this.#routes, name, (view) => this.#routes.outHandle(
        "cna_media_library_save_picture", library, view, bytes, BigInt(image.byteLength),
      ));
      return this.#pictureRow(picture);
    } finally {
      scope.dispose();
    }
  }

  /** An unknown token is an ordinary answer, which CNA's header says explicitly. */
  public override getMediaLibraryPictureFromToken(
    library: NativeHandle, token: string,
  ): MediaPictureSnapshot | null {
    const scope = this.#routes.scope();
    try {
      const picture = scope.allocate(8);
      const available = scope.allocate(4);
      withStringView(this.#routes, token, (view) => this.#routes.invoke(
        "cna_media_library_get_picture_from_token", library, view, picture, available,
      ));
      const view = this.#routes.view();
      if (view.getUint8(available) === 0) return null;
      const handle = view.getBigUint64(picture, true);
      return handle === 0n ? null : this.#pictureRow(handle);
    } finally {
      scope.dispose();
    }
  }

  // ---- rows ----------------------------------------------------------------------------------

  /** Every song in a collection. A song handle is a *new* handle and is released here. */
  #songRows(collection: bigint): readonly MediaSongSnapshot[] {
    const count = Math.max(outI32(this.#routes, "cna_song_collection_get_count", collection), 0);
    const rows: MediaSongSnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      const song = this.#routes.outHandle("cna_song_collection_get_at", collection, index);
      try {
        rows.push({
          Name: this.#text(song, "cna_song_get_name_size", "cna_song_copy_name"),
          Handle: this.#text(
            song, "cna_song_get_handle_text_size_ext", "cna_song_copy_handle_text_ext",
          ),
          AlbumName: this.#relationName(
            song, "cna_song_get_album", "cna_album_get_name_size", "cna_album_copy_name",
          ),
          ArtistName: this.#relationName(
            song, "cna_song_get_artist", "cna_artist_get_name_size", "cna_artist_copy_name",
          ),
          GenreName: this.#relationName(
            song, "cna_song_get_genre", "cna_genre_get_name_size", "cna_genre_copy_name",
          ),
          DurationTicks: outI64(this.#routes, "cna_song_get_duration", song),
          TrackNumber: outI32(this.#routes, "cna_song_get_track_number", song),
          PlayCount: outI32(this.#routes, "cna_song_get_play_count", song),
          Rating: outI32(this.#routes, "cna_song_get_rating", song),
          IsProtected: outBool(this.#routes, "cna_song_get_is_protected", song),
          IsRated: outBool(this.#routes, "cna_song_get_is_rated", song),
        });
      } finally {
        this.#routes.call("cna_song_destroy", song);
      }
    }
    return rows;
  }

  /**
   * Albums, artists, genres and playlists, which share one shape and differ in which optional
   * columns they carry. The items are **borrowed** from their collection and are not released.
   */
  #namedRows(
    collection: bigint,
    countRoute: string,
    atRoute: string,
    nameSizeRoute: string,
    nameCopyRoute: string,
    extra: {
      duration?: string; artist?: string; genre?: string; hasArt?: string;
    },
  ): readonly MediaNamedSnapshot[] {
    const count = Math.max(outI32(this.#routes, countRoute, collection), 0);
    return Array.from({ length: count }, (_, index) => {
      const item = this.#routes.outHandle(atRoute, collection, index);
      const row: {
        Name: string; DurationTicks?: bigint; ArtistName?: string; GenreName?: string;
        HasArt?: boolean;
      } = { Name: this.#text(item, nameSizeRoute, nameCopyRoute) };
      if (extra.duration) row.DurationTicks = outI64(this.#routes, extra.duration, item);
      if (extra.artist) {
        row.ArtistName = this.#relationName(
          item, extra.artist, "cna_artist_get_name_size", "cna_artist_copy_name",
        );
      }
      if (extra.genre) {
        row.GenreName = this.#relationName(
          item, extra.genre, "cna_genre_get_name_size", "cna_genre_copy_name",
        );
      }
      if (extra.hasArt) row.HasArt = outBool(this.#routes, extra.hasArt, item);
      return row;
    });
  }

  #pictureRows(collection: bigint): readonly MediaPictureSnapshot[] {
    const count = Math.max(
      outI32(this.#routes, "cna_picture_collection_get_count", collection), 0,
    );
    return Array.from({ length: count }, (_, index) =>
      this.#pictureRow(this.#routes.outHandle(
        "cna_picture_collection_get_at", collection, index)));
  }

  #pictureRow(picture: bigint): MediaPictureSnapshot {
    return {
      Name: this.#text(picture, "cna_picture_get_name_size", "cna_picture_copy_name"),
      Token: this.#text(picture, "cna_picture_get_token_size_ext", "cna_picture_copy_token_ext"),
      AlbumName: this.#relationName(
        picture, "cna_picture_get_album",
        "cna_picture_album_get_name_size", "cna_picture_album_copy_name",
      ),
      DateUnixTicks: outI64(this.#routes, "cna_picture_get_date_unix_ticks", picture),
      Width: outI32(this.#routes, "cna_picture_get_width", picture),
      Height: outI32(this.#routes, "cna_picture_get_height", picture),
    };
  }

  /** A media string, which answers empty rather than throwing when CNA has none. */
  #text(item: bigint, sizeRoute: string, copyRoute: string): string {
    try {
      return this.#routes.copyString(sizeRoute, copyRoute, item);
    } catch {
      return "";
    }
  }

  /** The name of a related item, or an empty string when the relation is absent. */
  #relationName(
    item: bigint, relationRoute: string, sizeRoute: string, copyRoute: string,
  ): string {
    const scope = this.#routes.scope();
    try {
      const related = scope.allocate(8);
      const available = scope.allocate(4);
      if (this.#routes.call(relationRoute, item, related, available) !== 0) return "";
      const view = this.#routes.view();
      if (view.getUint8(available) === 0) return "";
      const handle = view.getBigUint64(related, true);
      return handle === 0n ? "" : this.#text(handle, sizeRoute, copyRoute);
    } finally {
      scope.dispose();
    }
  }

  /** A size/copy byte pair: album art, a thumbnail, or a picture's image. */
  #bytes(item: bigint, sizeRoute: string, copyRoute: string): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const size = scope.allocate(8);
      this.#routes.invoke(sizeRoute, item, size);
      const byteLength = Number(this.#routes.view().getBigUint64(size, true));
      if (byteLength === 0) return new Uint8Array();
      const buffer = scope.allocate(byteLength);
      const written = scope.allocate(8);
      this.#routes.invoke(copyRoute, item, buffer, BigInt(byteLength), written);
      const count = Number(this.#routes.view().getBigUint64(written, true));
      return new Uint8Array(this.#routes.module.HEAPU8.subarray(buffer, buffer + count));
    } finally {
      scope.dispose();
    }
  }
}
