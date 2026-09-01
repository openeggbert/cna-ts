import { ObjectDisposedException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { IDisposable, IEquatable } from "../Contracts.js";
import { TimeSpan } from "../TimeSpan.js";
import {
  type AlbumCollection,
  type ArtistCollection,
  createAlbumCollectionForInternalUse,
  createPictureAlbumCollectionForInternalUse,
  createPictureCollectionForInternalUse,
  createSongCollectionForInternalUse,
  type PictureAlbumCollection,
  type PictureCollection,
  type SongCollection,
} from "./Collections.js";

type ObjectKind = "Album" | "Artist" | "Genre" | "Playlist" | "Song" | "Picture" | "PictureAlbum";

type ObjectState = {
  readonly Kind: ObjectKind;
  readonly Id: string;
  readonly Name: string;
  Disposed: boolean;
  Duration: TimeSpan;
  Songs: SongCollection | null;
  Albums: AlbumCollection | null;
  Artist: Artist | null;
  Album: Album | null;
  Genre: Genre | null;
  HasArt: boolean;
  AlbumArt: Uint8Array | null;
  Thumbnail: Uint8Array | null;
  Image: Uint8Array | null;
  Date: Date;
  Width: number;
  Height: number;
  ParentPictureAlbum: PictureAlbum | null;
  PictureAlbums: PictureAlbumCollection | null;
  Pictures: PictureCollection | null;
  IsProtected: boolean;
  IsRated: boolean;
  Rating: number;
  PlayCount: number;
  TrackNumber: number;
  Uri: URL | null;
  /**
   * Bytes CNA holds but has not been asked for yet. A media library can be thousands of
   * photographs, and XNA asks for the pixels with a *method* rather than a property precisely so
   * that opening the library does not read them all. A resolver keeps that true.
   */
  ResolveAlbumArt: (() => Uint8Array) | null;
  ResolveThumbnail: (() => Uint8Array) | null;
  ResolveImage: (() => Uint8Array) | null;
};

const states = new WeakMap<object, ObjectState>();
let nextIdentity = 1;

function stateOf(value: object, active = true): ObjectState {
  const state = states.get(value);
  if (!state || (active && state.Disposed)) throw new ObjectDisposedException(value.constructor.name);
  return state;
}

function hash(value: string): number {
  let result = 17;
  for (let index = 0; index < value.length; index += 1) result = (Math.imul(result, 31) + value.charCodeAt(index)) | 0;
  return result;
}

function equals(left: object, right: unknown, type: Function): boolean {
  return right instanceof type && stateOf(left, false).Id === stateOf(right, false).Id;
}

function bytes(
  value: Uint8Array | null, operation: string, resolve: (() => Uint8Array) | null = null,
): Uint8Array {
  const resolved = value ?? resolve?.() ?? null;
  if (!resolved) {
    throw new NativeUnavailableError(`${operation} is unavailable for this media object`);
  }
  return new Uint8Array(resolved);
}

function dispose(value: object): void { const state = states.get(value); if (state) state.Disposed = true; }

export class Album implements IDisposable, IEquatable<Album> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Artist(): Artist { return stateOf(this).Artist as Artist; }
  public get Songs(): SongCollection { const s = stateOf(this); return s.Songs ??= createSongCollectionForInternalUse(); }
  public get Genre(): Genre { return stateOf(this).Genre as Genre; }
  public get Duration(): TimeSpan { return TimeSpan.FromTicks(stateOf(this).Duration.Ticks); }
  public get HasArt(): boolean { return stateOf(this).HasArt; }
  public GetAlbumArt(): Uint8Array {
    const state = stateOf(this);
    return bytes(state.AlbumArt, "Album art", state.ResolveAlbumArt);
  }
  public GetThumbnail(): Uint8Array {
    const state = stateOf(this);
    return bytes(state.Thumbnail, "Album thumbnail", state.ResolveThumbnail);
  }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Album): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Album); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class Artist implements IDisposable, IEquatable<Artist> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Songs(): SongCollection { const s = stateOf(this); return s.Songs ??= createSongCollectionForInternalUse(); }
  public get Albums(): AlbumCollection { const s = stateOf(this); return s.Albums ??= createAlbumCollectionForInternalUse(); }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Artist): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Artist); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class Genre implements IDisposable, IEquatable<Genre> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Songs(): SongCollection { const s = stateOf(this); return s.Songs ??= createSongCollectionForInternalUse(); }
  public get Albums(): AlbumCollection { const s = stateOf(this); return s.Albums ??= createAlbumCollectionForInternalUse(); }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Genre): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Genre); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class Playlist implements IDisposable, IEquatable<Playlist> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Songs(): SongCollection { const s = stateOf(this); return s.Songs ??= createSongCollectionForInternalUse(); }
  public get Duration(): TimeSpan { return TimeSpan.FromTicks(stateOf(this).Duration.Ticks); }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Playlist): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Playlist); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class Song implements IDisposable, IEquatable<Song> {
  private constructor() {}
  public static FromUri(name: string, uri: URL): Song {
    if (name == null) throw new TypeError("name cannot be null");
    if (!(uri instanceof URL)) throw new TypeError("uri must be a URL");
    return createSongForInternalUse({ Name: name, Id: `uri:${uri.href}`, Uri: new URL(uri.href) });
  }
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Artist(): Artist { return stateOf(this).Artist as Artist; }
  public get Album(): Album { return stateOf(this).Album as Album; }
  public get Genre(): Genre { return stateOf(this).Genre as Genre; }
  public get Duration(): TimeSpan { return TimeSpan.FromTicks(stateOf(this).Duration.Ticks); }
  public get IsRated(): boolean { return stateOf(this).IsRated; }
  public get Rating(): number { return stateOf(this).Rating; }
  public get PlayCount(): number { return stateOf(this).PlayCount; }
  public get TrackNumber(): number { return stateOf(this).TrackNumber; }
  public get IsProtected(): boolean { return stateOf(this).IsProtected; }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Song): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Song); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class Picture implements IDisposable, IEquatable<Picture> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Album(): PictureAlbum { return stateOf(this).ParentPictureAlbum as PictureAlbum; }
  public get Width(): number { return stateOf(this).Width; }
  public get Height(): number { return stateOf(this).Height; }
  public get Date(): Date { return new Date(stateOf(this).Date.getTime()); }
  public GetImage(): Uint8Array {
    const state = stateOf(this);
    return bytes(state.Image, "Picture image", state.ResolveImage);
  }
  public GetThumbnail(): Uint8Array {
    const state = stateOf(this);
    return bytes(state.Thumbnail, "Picture thumbnail", state.ResolveThumbnail);
  }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: Picture): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, Picture); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export class PictureAlbum implements IDisposable, IEquatable<PictureAlbum> {
  private constructor() {}
  public get IsDisposed(): boolean { return states.get(this)?.Disposed ?? true; }
  public get Name(): string { return stateOf(this).Name; }
  public get Albums(): PictureAlbumCollection { const s = stateOf(this); return s.PictureAlbums ??= createPictureAlbumCollectionForInternalUse(); }
  public get Pictures(): PictureCollection { const s = stateOf(this); return s.Pictures ??= createPictureCollectionForInternalUse(); }
  public get Parent(): PictureAlbum { return stateOf(this).ParentPictureAlbum as PictureAlbum; }
  public Dispose(): void { dispose(this); }
  public Equals(obj: unknown): boolean;
  public Equals(other: PictureAlbum): boolean;
  public Equals(obj: unknown): boolean { return equals(this, obj, PictureAlbum); }
  public GetHashCode(): number { return hash(stateOf(this, false).Id); }
  public ToString(): string { return stateOf(this).Name; }
}

export type MediaObjectOptions = Partial<Omit<ObjectState, "Kind" | "Disposed">> & { readonly Name: string; readonly Id?: string };

function initialize<T extends object>(prototype: object, kind: ObjectKind, options: MediaObjectOptions): T {
  const result = Object.create(prototype) as T;
  states.set(result, {
    Kind: kind,
    Id: options.Id ?? `${kind}:${nextIdentity++}`,
    Name: options.Name,
    Disposed: false,
    Duration: options.Duration ?? TimeSpan.Zero,
    Songs: options.Songs ?? null,
    Albums: options.Albums ?? null,
    Artist: options.Artist ?? null,
    Album: options.Album ?? null,
    Genre: options.Genre ?? null,
    HasArt: options.HasArt ?? false,
    AlbumArt: options.AlbumArt ? new Uint8Array(options.AlbumArt) : null,
    Thumbnail: options.Thumbnail ? new Uint8Array(options.Thumbnail) : null,
    Image: options.Image ? new Uint8Array(options.Image) : null,
    Date: options.Date ? new Date(options.Date) : new Date(0),
    Width: options.Width ?? 0,
    Height: options.Height ?? 0,
    ParentPictureAlbum: options.ParentPictureAlbum ?? null,
    PictureAlbums: options.PictureAlbums ?? null,
    Pictures: options.Pictures ?? null,
    IsProtected: options.IsProtected ?? false,
    IsRated: options.IsRated ?? false,
    Rating: options.Rating ?? 0,
    PlayCount: options.PlayCount ?? 0,
    TrackNumber: options.TrackNumber ?? 0,
    Uri: options.Uri ? new URL(options.Uri.href) : null,
    ResolveAlbumArt: options.ResolveAlbumArt ?? null,
    ResolveThumbnail: options.ResolveThumbnail ?? null,
    ResolveImage: options.ResolveImage ?? null,
  });
  return result;
}

export const createAlbumForInternalUse = (options: MediaObjectOptions): Album => initialize(Album.prototype, "Album", options);
/**
 * Internal: fills in the songs of an album, artist, genre or playlist after construction.
 *
 * The graph is cyclic — a song names its album and an album lists its songs — so the songs cannot
 * be supplied when the album is built. Everything is created first, then linked.
 */
export function setSongsForInternalUse(target: object, songs: SongCollection): void {
  const state = states.get(target);
  if (state) state.Songs = songs;
}

export const createArtistForInternalUse = (options: MediaObjectOptions): Artist => initialize(Artist.prototype, "Artist", options);
export const createGenreForInternalUse = (options: MediaObjectOptions): Genre => initialize(Genre.prototype, "Genre", options);
export const createPlaylistForInternalUse = (options: MediaObjectOptions): Playlist => initialize(Playlist.prototype, "Playlist", options);
export const createSongForInternalUse = (options: MediaObjectOptions): Song => initialize(Song.prototype, "Song", options);
export const createPictureForInternalUse = (options: MediaObjectOptions): Picture => initialize(Picture.prototype, "Picture", options);
export const createPictureAlbumForInternalUse = (options: MediaObjectOptions): PictureAlbum => initialize(PictureAlbum.prototype, "PictureAlbum", options);

export function songUriForInternalUse(song: Song): URL | null {
  const value = stateOf(song).Uri;
  return value ? new URL(value.href) : null;
}
