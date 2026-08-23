import { Vector2 } from "../../Vector2.js";
import type { TouchLocationResult } from "./TouchLocationResult.js";
import { TouchLocation, touchLocationsEqual } from "./TouchValues.js";
import { TouchLocationState } from "./Enums.js";
import { createEnumerator, Enumerator as TouchCollectionEnumerator } from "./TouchCollection/Enumerator.js";
import { ArgumentOutOfRangeException } from "../../../../../internal/exceptions.js";

function clone(value: TouchLocation): TouchLocation {
  const previous = value.TryGetPreviousLocation();
  return previous.Success
    ? new TouchLocation(value.Id, value.State, value.Position, previous.Value.State, previous.Value.Position)
    : new TouchLocation(value.Id, value.State, value.Position);
}

const nativeConnection = new WeakMap<TouchCollection, boolean>();

/** Read-only, at-most-eight-contact XNA touch snapshot. */
export class TouchCollection {
  readonly #touches: TouchLocation[];

  public constructor(touches: TouchLocation[]) {
    if (touches == null) throw new TypeError("touches cannot be null");
    if (touches.length > 8) throw new ArgumentOutOfRangeException("touches");
    this.#touches = touches.map(clone);
  }

  public get Count(): number { return this.#touches.length; }
  public get IsConnected(): boolean { return nativeConnection.get(this) ?? true; }
  public get IsReadOnly(): boolean { return true; }

  public Get(index: number): TouchLocation {
    this.validateIndex(index);
    return this.#touches[index];
  }

  public Set(index: number, value: TouchLocation): void {
    void index;
    void value;
    throw new Error("TouchCollection is read-only");
  }

  public FindById(id: number): TouchLocationResult {
    for (const touch of this.#touches) {
      if (touch.Id === (Math.trunc(id) | 0)) return { Success: true, Value: touch };
    }
    return {
      Success: false,
      Value: new TouchLocation(0, TouchLocationState.Invalid, Vector2.Zero),
    };
  }

  public Contains(item: TouchLocation): boolean { return this.IndexOf(item) >= 0; }

  public IndexOf(item: TouchLocation): number {
    return this.#touches.findIndex((value) => touchLocationsEqual(value, item));
  }

  public CopyTo(array: TouchLocation[], arrayIndex: number): void {
    if (array == null) throw new TypeError("array cannot be null");
    arrayIndex = Math.trunc(arrayIndex);
    if (arrayIndex < 0 || arrayIndex + this.Count > array.length) throw new ArgumentOutOfRangeException("arrayIndex");
    for (let index = 0; index < this.Count; index += 1) array[arrayIndex + index] = this.#touches[index];
  }

  public GetEnumerator(): TouchCollectionEnumerator { return createEnumerator(this); }

  public Add(item: TouchLocation): void { void item; throw new Error("TouchCollection is read-only"); }
  public Clear(): void { throw new Error("TouchCollection is read-only"); }
  public Insert(index: number, item: TouchLocation): void {
    void index;
    void item;
    throw new Error("TouchCollection is read-only");
  }
  public Remove(item: TouchLocation): boolean { void item; throw new Error("TouchCollection is read-only"); }
  public RemoveAt(index: number): void { void index; throw new Error("TouchCollection is read-only"); }

  private validateIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.Count) throw new ArgumentOutOfRangeException("index");
  }
}

/** Internal construction boundary for a native touch snapshot's connection flag. */
export function createTouchCollection(touches: TouchLocation[], isConnected: boolean): TouchCollection {
  const result = new TouchCollection(touches);
  nativeConnection.set(result, Boolean(isConnected));
  return result;
}

/** Runtime attachment matching XNA's nested TouchCollection.Enumerator type. */
export namespace TouchCollection {
  export const Enumerator = TouchCollectionEnumerator;
}
