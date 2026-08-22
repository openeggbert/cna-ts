import { CurveKey } from "./CurveKey.js";
import { ArgumentOutOfRangeException } from "../../../internal/exceptions.js";

/** Position-sorted XNA curve-key collection. */
export class CurveKeyCollection {
  readonly #keys: CurveKey[];

  public constructor() { this.#keys = []; }

  public get Count(): number { return this.#keys.length; }
  public get IsReadOnly(): boolean { return false; }

  public Get(index: number): CurveKey {
    CurveKeyCollection.validateIndex(index, this.#keys.length);
    return this.#keys[index];
  }

  public Set(index: number, value: CurveKey): void {
    CurveKeyCollection.validateIndex(index, this.#keys.length);
    if (value == null) throw new TypeError("value cannot be null");
    if (this.#keys[index].Position === value.Position) {
      this.#keys[index] = value;
      return;
    }
    this.#keys.splice(index, 1);
    this.Add(value);
  }

  public Add(item: CurveKey): void {
    if (item == null) throw new TypeError("item cannot be null");
    let low = 0;
    let high = this.#keys.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.#keys[middle].Position <= item.Position) low = middle + 1;
      else high = middle;
    }
    this.#keys.splice(low, 0, item);
  }

  public Clear(): void {
    this.#keys.length = 0;
  }

  public Clone(): CurveKeyCollection {
    const result = new CurveKeyCollection();
    result.#keys.push(...this.#keys);
    return result;
  }

  public Contains(item: CurveKey): boolean { return this.#keys.includes(item); }

  public CopyTo(array: CurveKey[], arrayIndex: number): void {
    if (array == null) throw new TypeError("array cannot be null");
    arrayIndex = Math.trunc(arrayIndex);
    if (arrayIndex < 0 || arrayIndex + this.Count > array.length) throw new ArgumentOutOfRangeException("arrayIndex");
    for (let index = 0; index < this.Count; index += 1) array[arrayIndex + index] = this.#keys[index];
  }

  public GetEnumerator(): IterableIterator<CurveKey> { return this.#keys.values(); }
  public IndexOf(item: CurveKey): number { return this.#keys.indexOf(item); }

  public Remove(item: CurveKey): boolean {
    const index = this.IndexOf(item);
    if (index < 0) return false;
    this.#keys.splice(index, 1);
    return true;
  }

  public RemoveAt(index: number): void {
    CurveKeyCollection.validateIndex(index, this.#keys.length);
    this.#keys.splice(index, 1);
  }

  private static validateIndex(index: number, count: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new ArgumentOutOfRangeException("index");
  }
}
