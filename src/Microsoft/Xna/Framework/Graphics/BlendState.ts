import { Color } from "../Color.js";
import { InvalidOperationException } from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
} from "./GraphicsResource.js";
import { Blend, BlendFunction, ColorWriteChannels } from "./StateEnums.js";

const locked = new WeakSet<BlendState>();
const presets = new WeakSet<BlendState>();

function mutable(state: BlendState): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (locked.has(state)) {
    throw new InvalidOperationException("The BlendState cannot be modified after it has been bound to a GraphicsDevice");
  }
}

export class BlendState extends GraphicsResource {
  #alphaBlendFunction = BlendFunction.Add;
  #alphaDestinationBlend = Blend.Zero;
  #alphaSourceBlend = Blend.One;
  #blendFactor = Color.White;
  #colorBlendFunction = BlendFunction.Add;
  #colorDestinationBlend = Blend.Zero;
  #colorSourceBlend = Blend.One;
  #colorWriteChannels = ColorWriteChannels.All;
  #colorWriteChannels1 = ColorWriteChannels.All;
  #colorWriteChannels2 = ColorWriteChannels.All;
  #colorWriteChannels3 = ColorWriteChannels.All;
  #multiSampleMask = -1;

  public constructor() { super(); }

  public static readonly Opaque = preset(this, "BlendState.Opaque", Blend.One, Blend.Zero);
  public static readonly AlphaBlend = preset(this, "BlendState.AlphaBlend", Blend.One, Blend.InverseSourceAlpha);
  public static readonly Additive = preset(this, "BlendState.Additive", Blend.SourceAlpha, Blend.One);
  public static readonly NonPremultiplied = preset(
    this, "BlendState.NonPremultiplied", Blend.SourceAlpha, Blend.InverseSourceAlpha,
  );

  public get AlphaBlendFunction(): BlendFunction { return this.#alphaBlendFunction; }
  public set AlphaBlendFunction(value: BlendFunction) { mutable(this); this.#alphaBlendFunction = value; }
  public get AlphaDestinationBlend(): Blend { return this.#alphaDestinationBlend; }
  public set AlphaDestinationBlend(value: Blend) { mutable(this); this.#alphaDestinationBlend = value; }
  public get AlphaSourceBlend(): Blend { return this.#alphaSourceBlend; }
  public set AlphaSourceBlend(value: Blend) { mutable(this); this.#alphaSourceBlend = value; }
  public get BlendFactor(): Color {
    return new Color(this.#blendFactor.R, this.#blendFactor.G, this.#blendFactor.B, this.#blendFactor.A);
  }
  public set BlendFactor(value: Color) {
    mutable(this);
    this.#blendFactor = new Color(value.R, value.G, value.B, value.A);
  }
  public get ColorBlendFunction(): BlendFunction { return this.#colorBlendFunction; }
  public set ColorBlendFunction(value: BlendFunction) { mutable(this); this.#colorBlendFunction = value; }
  public get ColorDestinationBlend(): Blend { return this.#colorDestinationBlend; }
  public set ColorDestinationBlend(value: Blend) { mutable(this); this.#colorDestinationBlend = value; }
  public get ColorSourceBlend(): Blend { return this.#colorSourceBlend; }
  public set ColorSourceBlend(value: Blend) { mutable(this); this.#colorSourceBlend = value; }
  public get ColorWriteChannels(): ColorWriteChannels { return this.#colorWriteChannels; }
  public set ColorWriteChannels(value: ColorWriteChannels) { mutable(this); this.#colorWriteChannels = value; }
  public get ColorWriteChannels1(): ColorWriteChannels { return this.#colorWriteChannels1; }
  public set ColorWriteChannels1(value: ColorWriteChannels) { mutable(this); this.#colorWriteChannels1 = value; }
  public get ColorWriteChannels2(): ColorWriteChannels { return this.#colorWriteChannels2; }
  public set ColorWriteChannels2(value: ColorWriteChannels) { mutable(this); this.#colorWriteChannels2 = value; }
  public get ColorWriteChannels3(): ColorWriteChannels { return this.#colorWriteChannels3; }
  public set ColorWriteChannels3(value: ColorWriteChannels) { mutable(this); this.#colorWriteChannels3 = value; }
  public get MultiSampleMask(): number { return this.#multiSampleMask; }
  public set MultiSampleMask(value: number) { mutable(this); this.#multiSampleMask = Math.trunc(value); }

}

function preset(
  type: new () => BlendState,
  name: string,
  source: Blend,
  destination: Blend,
): BlendState {
  const state = new type();
  state.ColorSourceBlend = source;
  state.AlphaSourceBlend = source;
  state.ColorDestinationBlend = destination;
  state.AlphaDestinationBlend = destination;
  state.Name = name;
  locked.add(state);
  presets.add(state);
  return state;
}

export function bindBlendStateForInternalUse(state: BlendState, device: GraphicsDevice): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (!presets.has(state)) attachGraphicsResourceForInternalUse(state, device);
  locked.add(state);
}
