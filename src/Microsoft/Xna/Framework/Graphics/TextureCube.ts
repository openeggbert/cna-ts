import { ArgumentNullException, ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { Rectangle } from "../Rectangle.js";
import { SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { Texture } from "./Texture.js";
import { CubeMapFace } from "./TextureEnums.js";

export class TextureCube extends Texture {
  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean, format: SurfaceFormat,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    if (Math.trunc(size) <= 0) throw new ArgumentOutOfRangeException("size");
    void [mipMap, format];
    throw new NativeUnavailableError("TextureCube requires CNA cube-texture device routes");
  }

  public get Size(): number { throw new NativeUnavailableError("TextureCube is unavailable"); }

  public GetData<T>(cubeMapFace: CubeMapFace, data: T[]): void;
  public GetData<T>(cubeMapFace: CubeMapFace, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    cubeMapFace: CubeMapFace, level: number, rect: Rectangle | null,
    data: T[], startIndex: number, elementCount: number,
  ): void;
  public GetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("TextureCube.GetData requires CNA transfer routes"); }

  public SetData<T>(cubeMapFace: CubeMapFace, data: T[]): void;
  public SetData<T>(cubeMapFace: CubeMapFace, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    cubeMapFace: CubeMapFace, level: number, rect: Rectangle | null,
    data: T[], startIndex: number, elementCount: number,
  ): void;
  public SetData<T>(...args: unknown[]): void { void args; throw new NativeUnavailableError("TextureCube.SetData requires CNA transfer routes"); }
}
