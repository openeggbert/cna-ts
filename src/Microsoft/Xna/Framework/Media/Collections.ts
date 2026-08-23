import { ArgumentOutOfRangeException, ObjectDisposedException } from "../../../../internal/exceptions.js";
import type { IDisposable } from "../Contracts.js";
import type { Album, Artist, Genre, Picture, PictureAlbum, Playlist, Song } from "./MediaObjects.js";

type CollectionState<T> = { readonly Items: readonly T[]; Disposed: boolean };

function access<T>(state: CollectionState<T> | undefined, label: string): CollectionState<T> {
  if (!state || state.Disposed) throw new ObjectDisposedException(label);
  return state;
}

function item<T>(state: CollectionState<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= state.Items.length) {
    throw new ArgumentOutOfRangeException("index");
  }
  return state.Items[index];
}

const albumStates = new WeakMap<AlbumCollection, CollectionState<Album>>();
const artistStates = new WeakMap<ArtistCollection, CollectionState<Artist>>();
const genreStates = new WeakMap<GenreCollection, CollectionState<Genre>>();
const playlistStates = new WeakMap<PlaylistCollection, CollectionState<Playlist>>();
const songStates = new WeakMap<SongCollection, CollectionState<Song>>();
const pictureStates = new WeakMap<PictureCollection, CollectionState<Picture>>();
const pictureAlbumStates = new WeakMap<PictureAlbumCollection, CollectionState<PictureAlbum>>();

export class AlbumCollection implements Iterable<Album>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(albumStates.get(this), "AlbumCollection").Items.length; }
  public get IsDisposed(): boolean { return albumStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Album { const state = access(albumStates.get(this), "AlbumCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Album> { return access(albumStates.get(this), "AlbumCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Album> { return this.GetEnumerator(); }
  public Dispose(): void { const state = albumStates.get(this); if (state) state.Disposed = true; }
}

export class ArtistCollection implements Iterable<Artist>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(artistStates.get(this), "ArtistCollection").Items.length; }
  public get IsDisposed(): boolean { return artistStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Artist { const state = access(artistStates.get(this), "ArtistCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Artist> { return access(artistStates.get(this), "ArtistCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Artist> { return this.GetEnumerator(); }
  public Dispose(): void { const state = artistStates.get(this); if (state) state.Disposed = true; }
}

export class GenreCollection implements Iterable<Genre>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(genreStates.get(this), "GenreCollection").Items.length; }
  public get IsDisposed(): boolean { return genreStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Genre { const state = access(genreStates.get(this), "GenreCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Genre> { return access(genreStates.get(this), "GenreCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Genre> { return this.GetEnumerator(); }
  public Dispose(): void { const state = genreStates.get(this); if (state) state.Disposed = true; }
}

export class PlaylistCollection implements Iterable<Playlist>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(playlistStates.get(this), "PlaylistCollection").Items.length; }
  public get IsDisposed(): boolean { return playlistStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Playlist { const state = access(playlistStates.get(this), "PlaylistCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Playlist> { return access(playlistStates.get(this), "PlaylistCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Playlist> { return this.GetEnumerator(); }
  public Dispose(): void { const state = playlistStates.get(this); if (state) state.Disposed = true; }
}

export class SongCollection implements Iterable<Song>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(songStates.get(this), "SongCollection").Items.length; }
  public get IsDisposed(): boolean { return songStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Song { const state = access(songStates.get(this), "SongCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Song> { return access(songStates.get(this), "SongCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Song> { return this.GetEnumerator(); }
  public Dispose(): void { const state = songStates.get(this); if (state) state.Disposed = true; }
}

export class PictureCollection implements Iterable<Picture>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(pictureStates.get(this), "PictureCollection").Items.length; }
  public get IsDisposed(): boolean { return pictureStates.get(this)?.Disposed ?? true; }
  public Get(index: number): Picture { const state = access(pictureStates.get(this), "PictureCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<Picture> { return access(pictureStates.get(this), "PictureCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<Picture> { return this.GetEnumerator(); }
  public Dispose(): void { const state = pictureStates.get(this); if (state) state.Disposed = true; }
}

export class PictureAlbumCollection implements Iterable<PictureAlbum>, IDisposable {
  private constructor() {}
  public get Count(): number { return access(pictureAlbumStates.get(this), "PictureAlbumCollection").Items.length; }
  public get IsDisposed(): boolean { return pictureAlbumStates.get(this)?.Disposed ?? true; }
  public Get(index: number): PictureAlbum { const state = access(pictureAlbumStates.get(this), "PictureAlbumCollection"); return item(state, index); }
  public GetEnumerator(): IterableIterator<PictureAlbum> { return access(pictureAlbumStates.get(this), "PictureAlbumCollection").Items[Symbol.iterator](); }
  public [Symbol.iterator](): IterableIterator<PictureAlbum> { return this.GetEnumerator(); }
  public Dispose(): void { const state = pictureAlbumStates.get(this); if (state) state.Disposed = true; }
}

function create<TCollection extends object, TItem>(
  prototype: object,
  states: WeakMap<TCollection, CollectionState<TItem>>,
  values: readonly TItem[],
): TCollection {
  const result = Object.create(prototype) as TCollection;
  states.set(result, { Items: Object.freeze([...values]), Disposed: false });
  return result;
}

export function createAlbumCollectionForInternalUse(values: readonly Album[] = []): AlbumCollection {
  return create(AlbumCollection.prototype, albumStates, values);
}
export function createArtistCollectionForInternalUse(values: readonly Artist[] = []): ArtistCollection {
  return create(ArtistCollection.prototype, artistStates, values);
}
export function createGenreCollectionForInternalUse(values: readonly Genre[] = []): GenreCollection {
  return create(GenreCollection.prototype, genreStates, values);
}
export function createPlaylistCollectionForInternalUse(values: readonly Playlist[] = []): PlaylistCollection {
  return create(PlaylistCollection.prototype, playlistStates, values);
}
export function createSongCollectionForInternalUse(values: readonly Song[] = []): SongCollection {
  return create(SongCollection.prototype, songStates, values);
}
export function createPictureCollectionForInternalUse(values: readonly Picture[] = []): PictureCollection {
  return create(PictureCollection.prototype, pictureStates, values);
}
export function createPictureAlbumCollectionForInternalUse(values: readonly PictureAlbum[] = []): PictureAlbumCollection {
  return create(PictureAlbumCollection.prototype, pictureAlbumStates, values);
}

export function songCollectionItemsForInternalUse(value: SongCollection): readonly Song[] {
  return access(songStates.get(value), "SongCollection").Items;
}
