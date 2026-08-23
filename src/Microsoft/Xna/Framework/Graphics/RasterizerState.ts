import { InvalidOperationException } from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
} from "./GraphicsResource.js";
import { CullMode, FillMode } from "./StateEnums.js";

const locked = new WeakSet<RasterizerState>();
const presets = new WeakSet<RasterizerState>();
function mutable(state: RasterizerState): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (locked.has(state)) throw new InvalidOperationException("The RasterizerState cannot be modified after it has been bound to a GraphicsDevice");
}

export class RasterizerState extends GraphicsResource {
  #cullMode = CullMode.CullCounterClockwiseFace;
  #depthBias = 0;
  #fillMode = FillMode.Solid;
  #multiSampleAntiAlias = true;
  #scissorTestEnable = false;
  #slopeScaleDepthBias = 0;

  public constructor() { super(); }
  public static readonly CullClockwise = preset(this, "RasterizerState.CullClockwise", CullMode.CullClockwiseFace);
  public static readonly CullCounterClockwise = preset(this, "RasterizerState.CullCounterClockwise", CullMode.CullCounterClockwiseFace);
  public static readonly CullNone = preset(this, "RasterizerState.CullNone", CullMode.None);

  public get CullMode(): CullMode { return this.#cullMode; }
  public set CullMode(value: CullMode) { mutable(this); this.#cullMode = value; }
  public get DepthBias(): number { return this.#depthBias; }
  public set DepthBias(value: number) { mutable(this); this.#depthBias = Math.fround(value); }
  public get FillMode(): FillMode { return this.#fillMode; }
  public set FillMode(value: FillMode) { mutable(this); this.#fillMode = value; }
  public get MultiSampleAntiAlias(): boolean { return this.#multiSampleAntiAlias; }
  public set MultiSampleAntiAlias(value: boolean) { mutable(this); this.#multiSampleAntiAlias = Boolean(value); }
  public get ScissorTestEnable(): boolean { return this.#scissorTestEnable; }
  public set ScissorTestEnable(value: boolean) { mutable(this); this.#scissorTestEnable = Boolean(value); }
  public get SlopeScaleDepthBias(): number { return this.#slopeScaleDepthBias; }
  public set SlopeScaleDepthBias(value: number) { mutable(this); this.#slopeScaleDepthBias = Math.fround(value); }

}

function preset(type: new () => RasterizerState, name: string, cullMode: CullMode): RasterizerState {
  const state = new type();
  state.CullMode = cullMode;
  state.Name = name;
  locked.add(state);
  presets.add(state);
  return state;
}

export function bindRasterizerStateForInternalUse(state: RasterizerState, device: GraphicsDevice): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (!presets.has(state)) attachGraphicsResourceForInternalUse(state, device);
  locked.add(state);
}
