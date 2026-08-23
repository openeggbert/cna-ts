import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { Texture } from "./Texture.js";

export class Texture3D extends Texture {
  public constructor(
    graphicsDevice: GraphicsDevice, width: number, height: number, depth: number,
    mipMap: boolean, format: SurfaceFormat,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    if (Math.trunc(width) <= 0) throw new ArgumentOutOfRangeException("width");
    if (Math.trunc(height) <= 0) throw new ArgumentOutOfRangeException("height");
    if (Math.trunc(depth) <= 0) throw new ArgumentOutOfRangeException("depth");
    void [mipMap, format];
    throw new NativeUnavailableError("Texture3D requires CNA volume-texture device routes");
  }

  public get Depth(): number { throw new NativeUnavailableError("Texture3D is unavailable"); }
  public get Height(): number { throw new NativeUnavailableError("Texture3D is unavailable"); }
  public get Width(): number { throw new NativeUnavailableError("Texture3D is unavailable"); }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    level: number, left: number, top: number, right: number, bottom: number, front: number,
    back: number, data: T[], startIndex: number, elementCount: number,
  ): void;
  public GetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("Texture3D.GetData requires CNA transfer routes"); }

  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    level: number, left: number, top: number, right: number, bottom: number, front: number,
    back: number, data: T[], startIndex: number, elementCount: number,
  ): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("Texture3D.SetData requires CNA transfer routes"); }
}
