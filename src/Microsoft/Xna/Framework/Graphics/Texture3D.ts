import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../../../../internal/abi.js";
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

type Texture3DState = {
  readonly Backend: CnaGraphicsBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly Width: number;
  readonly Height: number;
  readonly Depth: number;
  readonly LevelCount: number;
};

type TransferRequest = {
  readonly Level: number;
  readonly Left: number;
  readonly Top: number;
  readonly Right: number;
  readonly Bottom: number;
  readonly Front: number;
  readonly Back: number;
  readonly Data: unknown[];
  readonly StartIndex: number;
  readonly ElementCount: number;
};

const states = new WeakMap<Texture3D, Texture3DState>();

function stateOf(texture: Texture3D): Texture3DState {
  assertGraphicsResourceActiveForInternalUse(texture);
  const state = states.get(texture);
  if (!state) throw new NativeUnavailableError("Texture3D construction did not complete");
  return state;
}

export class Texture3D extends Texture {
  public constructor(
    graphicsDevice: GraphicsDevice, width: number, height: number, depth: number,
    mipMap: boolean, format: SurfaceFormat,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    width = positiveInteger(width, "width");
    height = positiveInteger(height, "height");
    depth = positiveInteger(depth, "depth");
    validateSurfaceFormat(format);
    const rootBackend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const backend = rootBackend.Graphics;
    if (!backend) throw new NativeUnavailableError("Texture3D requires CNA volume-texture routes");
    const handle = backend.createTexture3D(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      width, height, depth, Boolean(mipMap), format,
    );
    let lifetime: NativeResourceLifetime | null = null;
    try {
      lifetime = new NativeResourceLifetime({
        Handle: handle,
        Ownership: "owned",
        Parent: graphicsDeviceParentLifetimeForInternalUse(graphicsDevice),
        Release: (value) => backend.destroyTexture3D(value),
        Label: "Texture3D",
      });
      const info = backend.getTexture3DInfo(handle);
      if (info.Width !== width || info.Height !== height || info.Depth !== depth ||
          info.Format !== format || info.LevelCount <= 0) {
        throw new NativeUnavailableError("CNA Texture3D creation returned inconsistent metadata");
      }
      initializeTextureForInternalUse(this, format, info.LevelCount, () => lifetime!.Handle);
      states.set(this, {
        Backend: backend, Lifetime: lifetime,
        Width: info.Width, Height: info.Height, Depth: info.Depth, LevelCount: info.LevelCount,
      });
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
      else backend.destroyTexture3D(handle);
      throw error;
    }
  }

  public get Depth(): number { return stateOf(this).Depth; }
  public get Height(): number { return stateOf(this).Height; }
  public get Width(): number { return stateOf(this).Width; }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    level: number, left: number, top: number, right: number, bottom: number, front: number,
    back: number, data: T[], startIndex: number, elementCount: number,
  ): void;
  public GetData<T>(...args: unknown[]): void {
    const state = stateOf(this);
    const request = prepareTransfer(state, this.Format, args, true);
    const packed = state.Backend.getTexture3DColors(
      state.Lifetime.Handle,
      request.Level, request.Left, request.Top, request.Right, request.Bottom,
      request.Front, request.Back, request.StartIndex, request.ElementCount, request.Data.length,
    );
    if (packed.length !== request.Data.length) {
      throw new NativeUnavailableError("CNA Texture3D readback returned an inconsistent capacity");
    }
    for (let index = request.StartIndex;
      index < request.StartIndex + request.ElementCount; index += 1) {
      const color = new Color(0, 0, 0, 0);
      color.PackedValue = packed[index];
      request.Data[index] = color;
    }
  }

  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    level: number, left: number, top: number, right: number, bottom: number, front: number,
    back: number, data: T[], startIndex: number, elementCount: number,
  ): void;
  public SetData<T>(...args: unknown[]): void {
    const state = stateOf(this);
    const request = prepareTransfer(state, this.Format, args, false);
    const packed = new Uint32Array(request.Data.length);
    for (let index = request.StartIndex;
      index < request.StartIndex + request.ElementCount; index += 1) {
      packed[index] = (request.Data[index] as Color).PackedValue;
    }
    state.Backend.setTexture3DColors(
      state.Lifetime.Handle,
      request.Level, request.Left, request.Top, request.Right, request.Bottom,
      request.Front, request.Back, request.StartIndex, request.ElementCount, packed,
    );
  }
}

export function resolveTexture3DHandleForInternalUse(texture: Texture3D): NativeHandle {
  return stateOf(texture).Lifetime.Handle;
}

function prepareTransfer(
  state: Texture3DState,
  format: SurfaceFormat,
  args: readonly unknown[],
  forReadback: boolean,
): TransferRequest {
  if (format !== SurfaceFormat.Color) {
    throw new NotSupportedException(
      `CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR} Texture3D transfers expose only exact Color elements`,
    );
  }
  let level = 0;
  let left = 0;
  let top = 0;
  let front = 0;
  let right: number;
  let bottom: number;
  let back: number;
  let data: unknown;
  let startIndex: number;
  let elementCount: number;
  if (args.length === 1 || args.length === 3) {
    data = args[0];
    const values = arrayData(data);
    startIndex = args.length === 1 ? 0 : integer(args[1], "startIndex");
    elementCount = args.length === 1 ? values.length : integer(args[2], "elementCount");
    right = state.Width;
    bottom = state.Height;
    back = state.Depth;
  } else if (args.length === 10) {
    level = integer(args[0], "level");
    left = integer(args[1], "left");
    top = integer(args[2], "top");
    right = integer(args[3], "right");
    bottom = integer(args[4], "bottom");
    front = integer(args[5], "front");
    back = integer(args[6], "back");
    data = args[7];
    startIndex = integer(args[8], "startIndex");
    elementCount = integer(args[9], "elementCount");
  } else {
    throw new ArgumentException("invalid Texture3D data overload");
  }
  const values = arrayData(data);
  if (level < 0 || level >= state.LevelCount) throw new ArgumentOutOfRangeException("level");
  if (startIndex < 0) throw new ArgumentOutOfRangeException("startIndex");
  if (elementCount < 0) throw new ArgumentOutOfRangeException("elementCount");
  if (startIndex > values.length || elementCount > values.length - startIndex) {
    throw new ArgumentException("data is too small for startIndex and elementCount");
  }
  const levelWidth = mipDimension(state.Width, level);
  const levelHeight = mipDimension(state.Height, level);
  const levelDepth = mipDimension(state.Depth, level);
  if (args.length !== 10) {
    right = levelWidth;
    bottom = levelHeight;
    back = levelDepth;
  }
  if (left < 0 || top < 0 || front < 0 || right <= left || bottom <= top || back <= front ||
      right > levelWidth || bottom > levelHeight || back > levelDepth) {
    throw new ArgumentException("Texture3D box is empty, negative, or outside the selected mip level");
  }
  const required = (right - left) * (bottom - top) * (back - front);
  if (elementCount !== required) {
    throw new ArgumentException("elementCount does not exactly cover the selected Texture3D box");
  }
  if (!forReadback) {
    for (let index = startIndex; index < startIndex + elementCount; index += 1) {
      if (!(values[index] instanceof Color)) {
        throw new ArgumentException("Texture3D Color data contains a different value type");
      }
    }
  }
  return {
    Level: level, Left: left, Top: top, Right: right, Bottom: bottom,
    Front: front, Back: back, Data: values, StartIndex: startIndex, ElementCount: elementCount,
  };
}

function arrayData(value: unknown): unknown[] {
  if (value == null) throw new ArgumentNullException("data");
  if (!Array.isArray(value)) {
    throw new NotSupportedException("Texture3D transfers require an array of mapped Color values");
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

function mipDimension(value: number, level: number): number {
  return Math.max(1, Math.floor(value / 2 ** level));
}
