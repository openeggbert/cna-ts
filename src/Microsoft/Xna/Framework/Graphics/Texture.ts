import type { SurfaceFormat } from "./DeviceEnums.js";
import { GraphicsResource } from "./GraphicsResource.js";

type TextureState = { readonly Format: SurfaceFormat; readonly LevelCount: number };
const states = new WeakMap<Texture, TextureState>();

export class Texture extends GraphicsResource {
  public get Format(): SurfaceFormat {
    const state = states.get(this);
    if (!state) throw new TypeError("Texture has not been initialized");
    return state.Format;
  }
  public get LevelCount(): number {
    const state = states.get(this);
    if (!state) throw new TypeError("Texture has not been initialized");
    return state.LevelCount;
  }
}

export function initializeTextureForInternalUse(
  texture: Texture,
  format: SurfaceFormat,
  levelCount: number,
): void {
  states.set(texture, { Format: format, LevelCount: levelCount });
}
