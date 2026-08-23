import type { CnaMediaBackend, MediaSourceSnapshot } from "../../../../internal/backend.js";
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
import { Picture, PictureAlbum } from "./MediaObjects.js";

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
  readonly Source: MediaSource | null;
  readonly Songs: SongCollection;
  readonly Albums: AlbumCollection;
  readonly Artists: ArtistCollection;
  readonly Genres: GenreCollection;
  readonly Playlists: PlaylistCollection;
  readonly Pictures: PictureCollection;
  readonly SavedPictures: PictureCollection;
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
    libraryStates.set(this, {
      Disposed: false,
      Source: mediaSource ?? null,
      Songs: createSongCollectionForInternalUse(),
      Albums: createAlbumCollectionForInternalUse(),
      Artists: createArtistCollectionForInternalUse(),
      Genres: createGenreCollectionForInternalUse(),
      Playlists: createPlaylistCollectionForInternalUse(),
      Pictures: createPictureCollectionForInternalUse(),
      SavedPictures: createPictureCollectionForInternalUse(),
    });
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

  public GetPictureFromToken(token: string): Picture {
    libraryState(this);
    if (token == null) throw new TypeError("token cannot be null");
    return null as unknown as Picture;
  }

  public SavePicture(name: string, imageBuffer: number[]): Picture;
  public SavePicture(name: string, source: Uint8Array): Picture;
  public SavePicture(name: string, source: number[] | Uint8Array): Picture {
    libraryState(this);
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
    throw new NativeUnavailableError(
      `Saving picture '${name}' is unavailable: CNA-TS does not map host directories to XNA MediaLibrary`,
    );
  }

  public Dispose(): void {
    const state = libraryStates.get(this);
    if (!state || state.Disposed) return;
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

export function mediaBackendForInternalUse(): CnaMediaBackend {
  const backend = getBackend().Media;
  if (!backend) throw new NativeUnavailableError("Media playback is unavailable on the loaded CNA backend");
  return backend;
}
