import { InvalidOperationException } from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
} from "./GraphicsResource.js";
import { CompareFunction, StencilOperation } from "./StateEnums.js";

const locked = new WeakSet<DepthStencilState>();
const presets = new WeakSet<DepthStencilState>();
function mutable(state: DepthStencilState): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (locked.has(state)) throw new InvalidOperationException("The DepthStencilState cannot be modified after it has been bound to a GraphicsDevice");
}

export class DepthStencilState extends GraphicsResource {
  #counterClockwiseStencilDepthBufferFail = StencilOperation.Keep;
  #counterClockwiseStencilFail = StencilOperation.Keep;
  #counterClockwiseStencilFunction = CompareFunction.Always;
  #counterClockwiseStencilPass = StencilOperation.Keep;
  #depthBufferEnable = true;
  #depthBufferFunction = CompareFunction.LessEqual;
  #depthBufferWriteEnable = true;
  #referenceStencil = 0;
  #stencilDepthBufferFail = StencilOperation.Keep;
  #stencilEnable = false;
  #stencilFail = StencilOperation.Keep;
  #stencilFunction = CompareFunction.Always;
  #stencilMask = 0x7fffffff;
  #stencilPass = StencilOperation.Keep;
  #stencilWriteMask = 0x7fffffff;
  #twoSidedStencilMode = false;

  public constructor() { super(); }
  public static readonly Default = preset(this, "DepthStencilState.Default", true, true);
  public static readonly DepthRead = preset(this, "DepthStencilState.DepthRead", true, false);
  public static readonly None = preset(this, "DepthStencilState.None", false, false);

  public get CounterClockwiseStencilDepthBufferFail(): StencilOperation { return this.#counterClockwiseStencilDepthBufferFail; }
  public set CounterClockwiseStencilDepthBufferFail(value: StencilOperation) { mutable(this); this.#counterClockwiseStencilDepthBufferFail = value; }
  public get CounterClockwiseStencilFail(): StencilOperation { return this.#counterClockwiseStencilFail; }
  public set CounterClockwiseStencilFail(value: StencilOperation) { mutable(this); this.#counterClockwiseStencilFail = value; }
  public get CounterClockwiseStencilFunction(): CompareFunction { return this.#counterClockwiseStencilFunction; }
  public set CounterClockwiseStencilFunction(value: CompareFunction) { mutable(this); this.#counterClockwiseStencilFunction = value; }
  public get CounterClockwiseStencilPass(): StencilOperation { return this.#counterClockwiseStencilPass; }
  public set CounterClockwiseStencilPass(value: StencilOperation) { mutable(this); this.#counterClockwiseStencilPass = value; }
  public get DepthBufferEnable(): boolean { return this.#depthBufferEnable; }
  public set DepthBufferEnable(value: boolean) { mutable(this); this.#depthBufferEnable = Boolean(value); }
  public get DepthBufferFunction(): CompareFunction { return this.#depthBufferFunction; }
  public set DepthBufferFunction(value: CompareFunction) { mutable(this); this.#depthBufferFunction = value; }
  public get DepthBufferWriteEnable(): boolean { return this.#depthBufferWriteEnable; }
  public set DepthBufferWriteEnable(value: boolean) { mutable(this); this.#depthBufferWriteEnable = Boolean(value); }
  public get ReferenceStencil(): number { return this.#referenceStencil; }
  public set ReferenceStencil(value: number) { mutable(this); this.#referenceStencil = Math.trunc(value); }
  public get StencilDepthBufferFail(): StencilOperation { return this.#stencilDepthBufferFail; }
  public set StencilDepthBufferFail(value: StencilOperation) { mutable(this); this.#stencilDepthBufferFail = value; }
  public get StencilEnable(): boolean { return this.#stencilEnable; }
  public set StencilEnable(value: boolean) { mutable(this); this.#stencilEnable = Boolean(value); }
  public get StencilFail(): StencilOperation { return this.#stencilFail; }
  public set StencilFail(value: StencilOperation) { mutable(this); this.#stencilFail = value; }
  public get StencilFunction(): CompareFunction { return this.#stencilFunction; }
  public set StencilFunction(value: CompareFunction) { mutable(this); this.#stencilFunction = value; }
  public get StencilMask(): number { return this.#stencilMask; }
  public set StencilMask(value: number) { mutable(this); this.#stencilMask = Math.trunc(value); }
  public get StencilPass(): StencilOperation { return this.#stencilPass; }
  public set StencilPass(value: StencilOperation) { mutable(this); this.#stencilPass = value; }
  public get StencilWriteMask(): number { return this.#stencilWriteMask; }
  public set StencilWriteMask(value: number) { mutable(this); this.#stencilWriteMask = Math.trunc(value); }
  public get TwoSidedStencilMode(): boolean { return this.#twoSidedStencilMode; }
  public set TwoSidedStencilMode(value: boolean) { mutable(this); this.#twoSidedStencilMode = Boolean(value); }

}

function preset(
  type: new () => DepthStencilState,
  name: string,
  enabled: boolean,
  writeEnabled: boolean,
): DepthStencilState {
  const state = new type();
  state.DepthBufferEnable = enabled;
  state.DepthBufferWriteEnable = writeEnabled;
  state.Name = name;
  locked.add(state);
  presets.add(state);
  return state;
}

export function bindDepthStencilStateForInternalUse(state: DepthStencilState, device: GraphicsDevice): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (!presets.has(state)) attachGraphicsResourceForInternalUse(state, device);
  locked.add(state);
}
