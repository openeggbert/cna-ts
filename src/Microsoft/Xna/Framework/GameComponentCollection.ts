import {
  ArgumentException,
  ArgumentOutOfRangeException,
  NotSupportedException,
} from "../../../internal/exceptions.js";
import { EventDispatcher } from "../../../internal/events.js";
import type { XnaEvent } from "./Contracts.js";
import { GameComponentCollectionEventArgs } from "./GameComponentCollectionEventArgs.js";
import type { IGameComponent } from "./IGameComponent.js";

/** XNA component collection, including inherited Collection<T> operations. */
export class GameComponentCollection {
  readonly #items: IGameComponent[] = [];
  readonly #componentAdded = new EventDispatcher<unknown, GameComponentCollectionEventArgs>();
  readonly #componentRemoved = new EventDispatcher<unknown, GameComponentCollectionEventArgs>();

  public readonly ComponentAdded: XnaEvent<unknown, GameComponentCollectionEventArgs> = this.#componentAdded;
  public readonly ComponentRemoved: XnaEvent<unknown, GameComponentCollectionEventArgs> = this.#componentRemoved;

  public constructor() {}

  public get Count(): number { return this.#items.length; }

  public Get(index: number): IGameComponent {
    this.#validateExistingIndex(index);
    return this.#items[index];
  }

  public Set(index: number, value: IGameComponent): void {
    this.#validateExistingIndex(index);
    this.SetItem(index, value);
  }

  public Add(item: IGameComponent): void { this.InsertItem(this.Count, item); }

  public Clear(): void { this.ClearItems(); }

  public Contains(item: IGameComponent): boolean { return this.IndexOf(item) >= 0; }

  public CopyTo(array: IGameComponent[], arrayIndex: number): void {
    if (array == null) throw new TypeError("array cannot be null");
    arrayIndex = Math.trunc(arrayIndex);
    if (arrayIndex < 0 || arrayIndex + this.Count > array.length) {
      throw new ArgumentException("The destination array is too small");
    }
    for (let index = 0; index < this.Count; index += 1) array[arrayIndex + index] = this.#items[index];
  }

  public GetEnumerator(): IterableIterator<IGameComponent> { return this.#items.values(); }

  public IndexOf(item: IGameComponent): number { return this.#items.indexOf(item); }

  public Insert(index: number, item: IGameComponent): void {
    index = Math.trunc(index);
    if (index < 0 || index > this.Count) throw new ArgumentOutOfRangeException("index");
    this.InsertItem(index, item);
  }

  public Remove(item: IGameComponent): boolean {
    const index = this.IndexOf(item);
    if (index < 0) return false;
    this.RemoveItem(index);
    return true;
  }

  public RemoveAt(index: number): void {
    this.#validateExistingIndex(index);
    this.RemoveItem(index);
  }

  protected ClearItems(): void {
    for (let index = 0; index < this.#items.length; index += 1) {
      this.#componentRemoved.Dispatch(this, new GameComponentCollectionEventArgs(this.#items[index]));
    }
    this.#items.length = 0;
  }

  protected InsertItem(index: number, item: IGameComponent): void {
    if (this.IndexOf(item) !== -1) throw new ArgumentException("A component cannot be added more than once");
    this.#items.splice(index, 0, item);
    if (item != null) {
      this.#componentAdded.Dispatch(this, new GameComponentCollectionEventArgs(item));
    }
  }

  protected RemoveItem(index: number): void {
    const item = this.#items[index];
    this.#items.splice(index, 1);
    if (item != null) {
      this.#componentRemoved.Dispatch(this, new GameComponentCollectionEventArgs(item));
    }
  }

  protected SetItem(index: number, item: IGameComponent): void {
    void index;
    void item;
    throw new NotSupportedException("Items cannot be replaced in a GameComponentCollection");
  }

  #validateExistingIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) {
      throw new ArgumentOutOfRangeException("index");
    }
  }
}
