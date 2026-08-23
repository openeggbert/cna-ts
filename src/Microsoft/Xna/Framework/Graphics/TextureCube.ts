import type { CnaGraphicsBackend } from "../../../../internal/backend.js";
import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  NotSupportedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import { Color } from "../Color.js";
import { Rectangle } from "../Rectangle.js";
import { SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  notifyGraphicsResourceCreatedForInternalUse,
  notifyGraphicsResourceDestroyedForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "./GraphicsDevice.js";
import {
  attachGraphicsResourceForInternalUse,
  assertGraphicsResourceActiveForInternalUse,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";
import { initializeTextureForInternalUse, Texture } from "./Texture.js";
import { CubeMapFace } from "./TextureEnums.js";

export type AdoptedTextureCubeState = {
  readonly Handle: NativeHandle;
  readonly LevelCount: number;
  readonly Release?: (handle: NativeHandle) => void;
  readonly Label?: string;
};

type TextureCubeState = {
  readonly Backend: CnaGraphicsBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly Size: number;
  readonly LevelCount: number;
};

type TransferRequest = {
  readonly Face: CubeMapFace;
  readonly Level: number;
  readonly Rectangle: Rectangle | null;
  readonly Data: unknown[];
  readonly StartIndex: number;
  readonly ElementCount: number;
};

const states = new WeakMap<TextureCube, TextureCubeState>();

function stateOf(texture: TextureCube): TextureCubeState {
  assertGraphicsResourceActiveForInternalUse(texture);
  const state = states.get(texture);
  if (!state) throw new NativeUnavailableError("TextureCube construction did not complete");
  return state;
}

export class TextureCube extends Texture {
  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean, format: SurfaceFormat,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean, format: SurfaceFormat,
    adopted?: AdoptedTextureCubeState,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    size = positiveInteger(size, "size");
    validateSurfaceFormat(format);
    const rootBackend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const backend = rootBackend.Graphics;
    if (!backend) throw new NativeUnavailableError("TextureCube requires CNA cube-texture routes");
    const handle = adopted?.Handle ?? backend.createTextureCube(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), size, Boolean(mipMap), format,
    );
    let lifetime: NativeResourceLifetime | null = null;
    try {
      lifetime = new NativeResourceLifetime({
        Handle: handle,
        Ownership: "owned",
        Parent: graphicsDeviceParentLifetimeForInternalUse(graphicsDevice),
        Release: adopted?.Release ?? ((value) => backend.destroyTextureCube(value)),
        Label: adopted?.Label ?? "TextureCube",
      });
      const info = backend.getTextureCubeInfo(handle);
      if (info.Size !== size || info.Format !== format || info.LevelCount <= 0 ||
          (adopted && adopted.LevelCount !== info.LevelCount)) {
        throw new NativeUnavailableError("CNA TextureCube creation returned inconsistent metadata");
      }
      initializeTextureForInternalUse(this, format, info.LevelCount, () => lifetime!.Handle);
      states.set(this, { Backend: backend, Lifetime: lifetime, Size: info.Size, LevelCount: info.LevelCount });
      attachGraphicsResourceForInternalUse(
        this, graphicsDevice,
        (name, tag) => notifyGraphicsResourceDestroyedForInternalUse(graphicsDevice, name, tag),
      );
      setGraphicsResourceLifetimeForInternalUse(
        this, () => lifetime!.Dispose(), () => lifetime!.State === "active",
      );
      notifyGraphicsResourceCreatedForInternalUse(graphicsDevice, this);
    } catch (error) {
      if (lifetime) lifetime.Dispose();
      else (adopted?.Release ?? ((value) => backend.destroyTextureCube(value)))(handle);
      throw error;
    }
  }

  public get Size(): number { return stateOf(this).Size; }

  public GetData<T>(cubeMapFace: CubeMapFace, data: T[]): void;
  public GetData<T>(cubeMapFace: CubeMapFace, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    cubeMapFace: CubeMapFace, level: number, rect: Rectangle | null,
    data: T[], startIndex: number, elementCount: number,
  ): void;
  public GetData<T>(...args: unknown[]): void {
    const state = stateOf(this);
    const request = prepareTransfer(state, this.Format, args, true);
    const packed = state.Backend.getTextureCubeColors(
      state.Lifetime.Handle, request.Face, request.Level, request.Rectangle,
      request.StartIndex, request.ElementCount, request.Data.length,
    );
    if (packed.length !== request.Data.length) {
      throw new NativeUnavailableError("CNA TextureCube readback returned an inconsistent capacity");
    }
    for (let index = request.StartIndex;
      index < request.StartIndex + request.ElementCount; index += 1) {
      const color = new Color(0, 0, 0, 0);
      color.PackedValue = packed[index];
      request.Data[index] = color;
    }
  }

  public SetData<T>(cubeMapFace: CubeMapFace, data: T[]): void;
  public SetData<T>(cubeMapFace: CubeMapFace, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    cubeMapFace: CubeMapFace, level: number, rect: Rectangle | null,
    data: T[], startIndex: number, elementCount: number,
  ): void;
  public SetData<T>(...args: unknown[]): void {
    const state = stateOf(this);
    const request = prepareTransfer(state, this.Format, args, false);
    const packed = new Uint32Array(request.Data.length);
    for (let index = request.StartIndex;
      index < request.StartIndex + request.ElementCount; index += 1) {
      packed[index] = (request.Data[index] as Color).PackedValue;
    }
    state.Backend.setTextureCubeColors(
      state.Lifetime.Handle, request.Face, request.Level, request.Rectangle,
      request.StartIndex, request.ElementCount, packed,
    );
  }
}

export function resolveTextureCubeHandleForInternalUse(texture: TextureCube): NativeHandle {
  return stateOf(texture).Lifetime.Handle;
}

function prepareTransfer(
  state: TextureCubeState,
  format: SurfaceFormat,
  args: readonly unknown[],
  forReadback: boolean,
): TransferRequest {
  if (format !== SurfaceFormat.Color) {
    throw new NotSupportedException("CNA ABI 0.7 TextureCube transfers expose only exact Color elements");
  }
  if (args.length !== 2 && args.length !== 4 && args.length !== 6) {
    throw new ArgumentException("invalid TextureCube data overload");
  }
  const face = integer(args[0], "cubeMapFace") as CubeMapFace;
  if (face < CubeMapFace.PositiveX || face > CubeMapFace.NegativeZ) {
    throw new ArgumentOutOfRangeException("cubeMapFace");
  }
  let level = 0;
  let rectangle: Rectangle | null = null;
  let data: unknown;
  let startIndex: number;
  let elementCount: number;
  if (args.length === 2 || args.length === 4) {
    data = args[1];
    const values = arrayData(data);
    startIndex = args.length === 2 ? 0 : integer(args[2], "startIndex");
    elementCount = args.length === 2 ? values.length : integer(args[3], "elementCount");
  } else {
    level = integer(args[1], "level");
    if (args[2] != null && !(args[2] instanceof Rectangle)) {
      throw new ArgumentException("rect must be a Rectangle or null");
    }
    rectangle = args[2] == null ? null : new Rectangle(
      args[2].X, args[2].Y, args[2].Width, args[2].Height,
    );
    data = args[3];
    startIndex = integer(args[4], "startIndex");
    elementCount = integer(args[5], "elementCount");
  }
  const values = arrayData(data);
  if (level < 0 || level >= state.LevelCount) throw new ArgumentOutOfRangeException("level");
  if (startIndex < 0) throw new ArgumentOutOfRangeException("startIndex");
  if (elementCount < 0) throw new ArgumentOutOfRangeException("elementCount");
  if (startIndex > values.length || elementCount > values.length - startIndex) {
    throw new ArgumentException("data is too small for startIndex and elementCount");
  }
  const size = Math.max(1, Math.floor(state.Size / 2 ** level));
  if (rectangle != null && (
    !Number.isInteger(rectangle.X) || !Number.isInteger(rectangle.Y) ||
    !Number.isInteger(rectangle.Width) || !Number.isInteger(rectangle.Height) ||
    rectangle.X < 0 || rectangle.Y < 0 || rectangle.Width <= 0 || rectangle.Height <= 0 ||
    rectangle.X > size - rectangle.Width || rectangle.Y > size - rectangle.Height
  )) {
    throw new ArgumentException("rect is empty, negative, or outside the selected cube mip level");
  }
  const required = (rectangle?.Width ?? size) * (rectangle?.Height ?? size);
  if (elementCount !== required) {
    throw new ArgumentException("elementCount does not exactly cover the selected TextureCube region");
  }
  if (!forReadback) {
    for (let index = startIndex; index < startIndex + elementCount; index += 1) {
      if (!(values[index] instanceof Color)) {
        throw new ArgumentException("TextureCube Color data contains a different value type");
      }
    }
  }
  return {
    Face: face, Level: level, Rectangle: rectangle, Data: values,
    StartIndex: startIndex, ElementCount: elementCount,
  };
}

function arrayData(value: unknown): unknown[] {
  if (value == null) throw new ArgumentNullException("data");
  if (!Array.isArray(value)) {
    throw new NotSupportedException("TextureCube transfers require an array of mapped Color values");
  }
  return value;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  const result = integer(value, name);
  if (result <= 0 || result > 0x7fff_ffff) throw new ArgumentOutOfRangeException(name);
  return result;
}

function validateSurfaceFormat(format: SurfaceFormat): void {
  if (!Number.isInteger(format) || format < SurfaceFormat.Color || format > SurfaceFormat.HdrBlendable) {
    throw new ArgumentOutOfRangeException("format");
  }
}
