import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { assertGraphicsResourceCompatibleForInternalUse } from "./GraphicsResource.js";
import { bindSamplerStateForInternalUse, SamplerState } from "./SamplerState.js";

type CollectionState = {
  readonly Device: GraphicsDevice;
  readonly Values: SamplerState[];
  readonly Apply: (index: number, value: SamplerState) => void;
};

const states = new WeakMap<SamplerStateCollection, CollectionState>();

function stateOf(collection: SamplerStateCollection): CollectionState {
  const state = states.get(collection);
  if (!state) throw new TypeError("Invalid SamplerStateCollection");
  return state;
}

export class SamplerStateCollection {
  private constructor() {}

  public Get(index: number): SamplerState {
    const state = stateOf(this);
    index = validateIndex(index, state.Values.length);
    return state.Values[index];
  }

  public Set(index: number, value: SamplerState): void {
    if (value == null) throw new ArgumentNullException("value");
    const state = stateOf(this);
    index = validateIndex(index, state.Values.length);
    assertGraphicsResourceCompatibleForInternalUse(value, state.Device);
    state.Apply(index, value);
    bindSamplerStateForInternalUse(value, state.Device);
    state.Values[index] = value;
  }
}

function validateIndex(index: number, count: number): number {
  index = Math.trunc(index);
  if (index < 0 || index >= count) throw new ArgumentOutOfRangeException("index");
  return index;
}

export function createSamplerStateCollectionForInternalUse(
  device: GraphicsDevice,
  count: number,
  initial: SamplerState,
  apply: (index: number, value: SamplerState) => void,
): SamplerStateCollection {
  const result = Object.create(SamplerStateCollection.prototype) as SamplerStateCollection;
  states.set(result, { Device: device, Values: new Array(count).fill(initial), Apply: apply });
  return result;
}
