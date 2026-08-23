import { ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import type { Texture } from "./Texture.js";

type CollectionState = {
  readonly Device: GraphicsDevice;
  readonly Values: (Texture | null)[];
  readonly Apply: (index: number, value: Texture | null) => void;
};

const states = new WeakMap<TextureCollection, CollectionState>();

function stateOf(collection: TextureCollection): CollectionState {
  const state = states.get(collection);
  if (!state) throw new TypeError("Invalid TextureCollection");
  return state;
}

export class TextureCollection {
  private constructor() {}

  public Get(index: number): Texture {
    const state = stateOf(this);
    index = validateIndex(index, state.Values.length);
    if (state.Values[index]?.IsDisposed) state.Values[index] = null;
    return state.Values[index] as Texture;
  }

  public Set(index: number, value: Texture): void {
    const state = stateOf(this);
    index = validateIndex(index, state.Values.length);
    state.Apply(index, value ?? null);
    state.Values[index] = value;
  }
}

function validateIndex(index: number, count: number): number {
  index = Math.trunc(index);
  if (index < 0 || index >= count) throw new ArgumentOutOfRangeException("index");
  return index;
}

export function createTextureCollectionForInternalUse(
  device: GraphicsDevice,
  count: number,
  apply: (index: number, value: Texture | null) => void,
): TextureCollection {
  const result = Object.create(TextureCollection.prototype) as TextureCollection;
  states.set(result, { Device: device, Values: new Array(count).fill(null), Apply: apply });
  return result;
}
