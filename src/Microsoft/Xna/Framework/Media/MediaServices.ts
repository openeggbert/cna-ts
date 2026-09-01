import type {
  CnaMediaBackend,
  CnaMediaLibraryBackend,
  MediaLibrarySnapshot,
  MediaNamedSnapshot,
  MediaPictureSnapshot,
  MediaSongSnapshot,
  MediaSourceSnapshot,
} from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { ArgumentOutOfRangeException, ObjectDisposedException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { IDisposable } from "../Contracts.js";
import {
  AlbumCollection,
  ArtistCollection,
  createAlbumCollectionForInternalUse,
  createArtistCollectionForInternalUse,
  createGenreCollectionForInternalUse,
  createPictureCollectionForInternalUse,
  createPlaylistCollectionForInternalUse,
  createSongCollectionForInternalUse,
  GenreCollection,
  PictureCollection,
  PlaylistCollection,
  SongCollection,
} from "./Collections.js";
import { MediaSourceType } from "./Enums.js";
import {
  Album,
  Artist,
  createAlbumForInternalUse,
  createArtistForInternalUse,
  createGenreForInternalUse,
  createPictureAlbumForInternalUse,
  createPictureForInternalUse,
  createPlaylistForInternalUse,
  createSongForInternalUse,
  Genre,
  setSongsForInternalUse,
  Picture,
  PictureAlbum,
  Playlist,
  Song,
} from "./MediaObjects.js";
import { TimeSpan } from "../TimeSpan.js";

const sourceStates = new WeakMap<MediaSource, MediaSourceSnapshot>();

export class MediaSource {
  private constructor() {}
  public get MediaSourceType(): MediaSourceType { return sourceStates.get(this)?.Type as MediaSourceType; }
  public get Name(): string { return sourceStates.get(this)?.Name as string; }
  public ToString(): string { return this.Name; }

  public static GetAvailableMediaSources(): Array<MediaSource> {
    const backend = getBackend().Media;
    if (!backend) return [];
    return backend.getAvailableMediaSources().map(createMediaSourceForInternalUse);
  }
}

function createMediaSourceForInternalUse(snapshot: MediaSourceSnapshot): MediaSource {
  const result = Object.create(MediaSource.prototype) as MediaSource;
  sourceStates.set(result, Object.freeze({ ...snapshot }));
  return result;
}

type LibraryState = {
  Disposed: boolean;
  /** CNA's own library, held for the lifetime of this one so art can be fetched on demand. */
  Native: bigint | null;
  readonly Backend: CnaMediaLibraryBackend | null;
  readonly Source: MediaSource | null;
  readonly Songs: SongCollection;
  readonly Albums: AlbumCollection;
  readonly Artists: ArtistCollection;
  readonly Genres: GenreCollection;
  readonly Playlists: PlaylistCollection;
  readonly Pictures: PictureCollection;
  readonly SavedPictures: PictureCollection;
  /** The tokens of {@link SavedPictures}, in the same order, so a token lookup keeps identity. */
  readonly SavedPictureTokens: readonly string[];
};

const libraryStates = new WeakMap<MediaLibrary, LibraryState>();

function libraryState(library: MediaLibrary): LibraryState {
  const state = libraryStates.get(library);
  if (!state || state.Disposed) throw new ObjectDisposedException("MediaLibrary");
  return state;
}

export class MediaLibrary implements IDisposable {
  public constructor();
  public constructor(mediaSource: MediaSource);
  public constructor(mediaSource?: MediaSource) {
    if (mediaSource === undefined) mediaSource = MediaSource.GetAvailableMediaSources()[0];
    else if (!sourceStates.has(mediaSource)) throw new TypeError("mediaSource is invalid");
    libraryStates.set(this, buildLibraryState(mediaSource ?? null));
  }

  public get IsDisposed(): boolean { return libraryStates.get(this)?.Disposed ?? true; }
  public get MediaSource(): MediaSource { return libraryState(this).Source as MediaSource; }
  public get Songs(): SongCollection { return libraryState(this).Songs; }
  public get Albums(): AlbumCollection { return libraryState(this).Albums; }
  public get Artists(): ArtistCollection { return libraryState(this).Artists; }
  public get Genres(): GenreCollection { return libraryState(this).Genres; }
  public get Playlists(): PlaylistCollection { return libraryState(this).Playlists; }
  public get Pictures(): PictureCollection { return libraryState(this).Pictures; }
  public get SavedPictures(): PictureCollection { return libraryState(this).SavedPictures; }
  public get RootPictureAlbum(): PictureAlbum { return null as unknown as PictureAlbum; }

  /**
   * The picture a token names, or null when nothing has that token.
   *
   * An unknown token is an ordinary answer rather than a failure, which is what the canonical
   * lookup does and what CNA's own route documents.
   */
  public GetPictureFromToken(token: string): Picture {
    const state = libraryState(this);
    if (token == null) throw new TypeError("token cannot be null");
    if (state.Backend == null || state.Native == null) return null as unknown as Picture;
    const found = state.Backend.getMediaLibraryPictureFromToken(state.Native, token);
    if (found == null) return null as unknown as Picture;
    // A token that names a picture already in this library's snapshot answers *that object*, so
    // two lookups of one token are the same Picture and its lazy bytes still work.
    const index = state.SavedPictureTokens.indexOf(found.Token);
    if (index >= 0) return state.SavedPictures.Get(index);
    return buildPicture(state, found, null);
  }

  public SavePicture(name: string, imageBuffer: number[]): Picture;
  public SavePicture(name: string, source: Uint8Array): Picture;
  public SavePicture(name: string, source: number[] | Uint8Array): Picture {
    const state = libraryState(this);
    if (name == null) throw new TypeError("name cannot be null");
    if (source == null) throw new TypeError("source cannot be null");
    if (Array.isArray(source)) {
      for (const value of source) {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new ArgumentOutOfRangeException("imageBuffer");
        }
      }
      source = new Uint8Array(source);
    } else {
      source = new Uint8Array(source);
    }
    if (state.Backend == null || state.Native == null) {
      throw new NativeUnavailableError(
        `Saving picture '${name}' is unavailable: the loaded CNA backend has no media library`,
      );
    }
    const saved = state.Backend.saveMediaLibraryPicture(state.Native, name, source);
    // The picture is on disk and in CNA's saved collection now, but this library's snapshot was
    // taken when it was constructed -- XNA's is a snapshot too -- so the new picture is returned
    // without being spliced into a collection that describes an earlier moment.
    return buildPicture(state, saved, null);
  }

  public Dispose(): void {
    const state = libraryStates.get(this);
    if (!state || state.Disposed) return;
    if (state.Backend != null && state.Native != null) {
      state.Backend.destroyMediaLibrary(state.Native);
      state.Native = null;
    }
    state.Songs.Dispose();
    state.Albums.Dispose();
    state.Artists.Dispose();
    state.Genres.Dispose();
    state.Playlists.Dispose();
    state.Pictures.Dispose();
    state.SavedPictures.Dispose();
    state.Disposed = true;
  }
}

/** A picture built from one snapshot row; `index` supplies lazy bytes when it has one. */
function buildPicture(
  state: LibraryState, row: MediaPictureSnapshot, savedIndex: number | null,
): Picture {
  const backend = state.Backend;
  const native = state.Native;
  const lazy = backend != null && native != null && savedIndex != null
    ? {
      ResolveImage: () => backend.getMediaLibraryPictureBytes(native, true, savedIndex, false),
      ResolveThumbnail: () => backend.getMediaLibraryPictureBytes(native, true, savedIndex, true),
    }
    : {};
  return createPictureForInternalUse({
    Name: row.Name,
    Id: `picture:${row.Token}`,
    Date: new Date(Number(row.DateUnixTicks)),
    Width: row.Width,
    Height: row.Height,
    ParentPictureAlbum: null,
    ...lazy,
  });
}

/**
 * Reads CNA's index of the user's Music and Pictures folders into the managed graph.
 *
 * XNA's `MediaLibrary` is a *snapshot* of what the device holds when it is constructed, and so is
 * this: CNA scans once, everything below is copied out of that scan, and no CNA handle other than
 * the library's own is kept. The library handle is kept because album art and picture pixels are
 * fetched on demand — XNA asks for those with a method rather than a property precisely so that
 * opening a library of photographs does not read them all.
 *
 * With no media backend the collections are empty and `SavePicture` still refuses, which is what a
 * browser and any CNA without the media module report — an empty library rather than a fabricated
 * one.
 */
function buildLibraryState(source: MediaSource | null): LibraryState {
  const backend = getBackend().MediaLibrary ?? null;
  if (backend == null) {
    return {
      Disposed: false, Native: null, Backend: null, Source: source,
      Songs: createSongCollectionForInternalUse(),
      Albums: createAlbumCollectionForInternalUse(),
      Artists: createArtistCollectionForInternalUse(),
      Genres: createGenreCollectionForInternalUse(),
      Playlists: createPlaylistCollectionForInternalUse(),
      Pictures: createPictureCollectionForInternalUse(),
      SavedPictures: createPictureCollectionForInternalUse(),
      SavedPictureTokens: [],
    };
  }
  const native = backend.createMediaLibrary();
  let snapshot: MediaLibrarySnapshot;
  try {
    snapshot = backend.getMediaLibrarySnapshot(native);
  } catch (error) {
    backend.destroyMediaLibrary(native);
    throw error;
  }
  return { Disposed: false, Native: native, Backend: backend, Source: source,
    ...buildCollections(backend, native, snapshot) };
}

/**
 * CNA reports relationships by *name*, not by handle — measured: two handles for one song differ,
 * and a song's album handle never equals the album collection's. Interning by name is therefore
 * what gives the managed graph the object identity a consumer relies on, so that
 * `song.Album === library.Albums.Get(0)` holds for songs of that album.
 */
function buildCollections(
  backend: CnaMediaLibraryBackend, native: bigint, snapshot: MediaLibrarySnapshot,
) {
  const artists = new Map<string, Artist>();
  const genres = new Map<string, Genre>();
  const albums = new Map<string, Album>();

  const artistOf = (name: string): Artist | null => {
    if (name.length === 0) return null;
    let value = artists.get(name);
    if (!value) { value = createArtistForInternalUse({ Name: name, Id: `artist:${name}` }); artists.set(name, value); }
    return value;
  };
  const genreOf = (name: string): Genre | null => {
    if (name.length === 0) return null;
    let value = genres.get(name);
    if (!value) { value = createGenreForInternalUse({ Name: name, Id: `genre:${name}` }); genres.set(name, value); }
    return value;
  };

  // Albums first, in CNA's own order, so their index matches the one the art routes take.
  snapshot.Albums.forEach((row: MediaNamedSnapshot, index: number) => {
    albums.set(row.Name, createAlbumForInternalUse({
      Name: row.Name,
      Id: `album:${row.Name}`,
      Duration: TimeSpan.FromTicks(row.DurationTicks ?? 0n),
      Artist: artistOf(row.ArtistName ?? ""),
      Genre: genreOf(row.GenreName ?? ""),
      HasArt: row.HasArt ?? false,
      ResolveAlbumArt: () => backend.getMediaLibraryAlbumBytes(native, index, false),
      ResolveThumbnail: () => backend.getMediaLibraryAlbumBytes(native, index, true),
    }));
  });
  for (const row of snapshot.Artists) artistOf(row.Name);
  for (const row of snapshot.Genres) genreOf(row.Name);

  const songOf = (row: MediaSongSnapshot): Song => createSongForInternalUse({
    Name: row.Name,
    // The file path, because two handles for one song differ and a name is not unique.
    Id: `song:${row.Handle}`,
    Duration: TimeSpan.FromTicks(row.DurationTicks),
    Album: albums.get(row.AlbumName) ?? null,
    Artist: artistOf(row.ArtistName),
    Genre: genreOf(row.GenreName),
    TrackNumber: row.TrackNumber,
    PlayCount: row.PlayCount,
    Rating: row.Rating,
    IsProtected: row.IsProtected,
    IsRated: row.IsRated,
  });

  const songs = snapshot.Songs.map(songOf);
  const byAlbum = new Map<string, Song[]>();
  const byArtist = new Map<string, Song[]>();
  const byGenre = new Map<string, Song[]>();
  snapshot.Songs.forEach((row: MediaSongSnapshot, index: number) => {
    const song = songs[index]!;
    for (const [key, map] of [
      [row.AlbumName, byAlbum], [row.ArtistName, byArtist], [row.GenreName, byGenre],
    ] as const) {
      if (key.length === 0) continue;
      const list = map.get(key) ?? [];
      list.push(song);
      map.set(key, list);
    }
  });
  for (const [name, album] of albums) {
    setSongsForInternalUse(album, createSongCollectionForInternalUse(byAlbum.get(name) ?? []));
  }
  for (const [name, artist] of artists) {
    setSongsForInternalUse(artist, createSongCollectionForInternalUse(byArtist.get(name) ?? []));
  }
  for (const [name, genre] of genres) {
    setSongsForInternalUse(genre, createSongCollectionForInternalUse(byGenre.get(name) ?? []));
  }

  const playlists = snapshot.Playlists.map((row: MediaNamedSnapshot, index: number) => {
    const playlist = createPlaylistForInternalUse({
      Name: row.Name,
      Id: `playlist:${row.Name}`,
      Duration: TimeSpan.FromTicks(row.DurationTicks ?? 0n),
    });
    // A playlist's songs are the one relation a name cannot express: two playlists may hold the
    // same song, so they are read per playlist rather than grouped.
    const members = backend.getMediaLibraryPlaylistSongs(native, index)
      .map((member) => songs.find((song, position) =>
        snapshot.Songs[position]!.Handle === member.Handle) ?? songOf(member));
    setSongsForInternalUse(playlist, createSongCollectionForInternalUse(members));
    return playlist;
  });

  const pictureAlbums = new Map<string, PictureAlbum>();
  const pictureAlbumOf = (name: string): PictureAlbum | null => {
    if (name.length === 0) return null;
    let value = pictureAlbums.get(name);
    if (!value) {
      value = createPictureAlbumForInternalUse({ Name: name, Id: `picture-album:${name}` });
      pictureAlbums.set(name, value);
    }
    return value;
  };
  const pictureOf = (saved: boolean) =>
    (row: MediaPictureSnapshot, index: number): Picture => createPictureForInternalUse({
      Name: row.Name,
      Id: `picture:${row.Token}`,
      Date: new Date(Number(row.DateUnixTicks)),
      Width: row.Width,
      Height: row.Height,
      ParentPictureAlbum: pictureAlbumOf(row.AlbumName),
      ResolveImage: () => backend.getMediaLibraryPictureBytes(native, saved, index, false),
      ResolveThumbnail: () => backend.getMediaLibraryPictureBytes(native, saved, index, true),
    });

  return {
    Songs: createSongCollectionForInternalUse(songs),
    Albums: createAlbumCollectionForInternalUse(
      snapshot.Albums.map((row) => albums.get(row.Name)!).filter(Boolean)),
    Artists: createArtistCollectionForInternalUse(
      snapshot.Artists.map((row) => artists.get(row.Name)!).filter(Boolean)),
    Genres: createGenreCollectionForInternalUse(
      snapshot.Genres.map((row) => genres.get(row.Name)!).filter(Boolean)),
    Playlists: createPlaylistCollectionForInternalUse(playlists),
    Pictures: createPictureCollectionForInternalUse(snapshot.Pictures.map(pictureOf(false))),
    SavedPictures: createPictureCollectionForInternalUse(
      snapshot.SavedPictures.map(pictureOf(true))),
    SavedPictureTokens: Object.freeze(snapshot.SavedPictures.map((row) => row.Token)),
  };
}

export function mediaBackendForInternalUse(): CnaMediaBackend {
  const backend = getBackend().Media;
  if (!backend) throw new NativeUnavailableError("Media playback is unavailable on the loaded CNA backend");
  return backend;
}
