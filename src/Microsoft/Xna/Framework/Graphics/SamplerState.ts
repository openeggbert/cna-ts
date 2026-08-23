import { InvalidOperationException } from "../../../../internal/exceptions.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
} from "./GraphicsResource.js";
import { TextureAddressMode, TextureFilter } from "./StateEnums.js";

const locked = new WeakSet<SamplerState>();
function mutable(state: SamplerState): void {
  assertGraphicsResourceActiveForInternalUse(state);
  if (locked.has(state)) throw new InvalidOperationException("The SamplerState cannot be modified after it has been bound to a GraphicsDevice");
}

export class SamplerState extends GraphicsResource {
  #addressU = TextureAddressMode.Wrap;
  #addressV = TextureAddressMode.Wrap;
  #addressW = TextureAddressMode.Wrap;
  #filter = TextureFilter.Linear;
  #maxAnisotropy = 4;
  #maxMipLevel = 0;
  #mipMapLevelOfDetailBias = 0;

  public constructor() { super(); }
  public static readonly AnisotropicClamp = preset(this, "SamplerState.AnisotropicClamp", TextureFilter.Anisotropic, TextureAddressMode.Clamp);
  public static readonly AnisotropicWrap = preset(this, "SamplerState.AnisotropicWrap", TextureFilter.Anisotropic, TextureAddressMode.Wrap);
  public static readonly LinearClamp = preset(this, "SamplerState.LinearClamp", TextureFilter.Linear, TextureAddressMode.Clamp);
  public static readonly LinearWrap = preset(this, "SamplerState.LinearWrap", TextureFilter.Linear, TextureAddressMode.Wrap);
  public static readonly PointClamp = preset(this, "SamplerState.PointClamp", TextureFilter.Point, TextureAddressMode.Clamp);
  public static readonly PointWrap = preset(this, "SamplerState.PointWrap", TextureFilter.Point, TextureAddressMode.Wrap);

  public get AddressU(): TextureAddressMode { return this.#addressU; }
  public set AddressU(value: TextureAddressMode) { mutable(this); this.#addressU = value; }
  public get AddressV(): TextureAddressMode { return this.#addressV; }
  public set AddressV(value: TextureAddressMode) { mutable(this); this.#addressV = value; }
  public get AddressW(): TextureAddressMode { return this.#addressW; }
  public set AddressW(value: TextureAddressMode) { mutable(this); this.#addressW = value; }
  public get Filter(): TextureFilter { return this.#filter; }
  public set Filter(value: TextureFilter) { mutable(this); this.#filter = value; }
  public get MaxAnisotropy(): number { return this.#maxAnisotropy; }
  public set MaxAnisotropy(value: number) { mutable(this); this.#maxAnisotropy = Math.trunc(value); }
  public get MaxMipLevel(): number { return this.#maxMipLevel; }
  public set MaxMipLevel(value: number) { mutable(this); this.#maxMipLevel = Math.trunc(value); }
  public get MipMapLevelOfDetailBias(): number { return this.#mipMapLevelOfDetailBias; }
  public set MipMapLevelOfDetailBias(value: number) { mutable(this); this.#mipMapLevelOfDetailBias = Math.fround(value); }

}

function preset(
  type: new () => SamplerState,
  name: string,
  filter: TextureFilter,
  address: TextureAddressMode,
): SamplerState {
  const state = new type();
  state.Filter = filter;
  state.AddressU = address;
  state.AddressV = address;
  state.AddressW = address;
  state.Name = name;
  locked.add(state);
  return state;
}

export function bindSamplerStateForInternalUse(state: SamplerState, device: GraphicsDevice): void {
  assertGraphicsResourceActiveForInternalUse(state);
  attachGraphicsResourceForInternalUse(state, device);
  locked.add(state);
}
