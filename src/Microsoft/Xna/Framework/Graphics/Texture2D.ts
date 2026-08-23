import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
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

type Texture2DState = {
  readonly Width: number;
  readonly Height: number;
  readonly Lifetime: NativeResourceLifetime;
};
const states = new WeakMap<Texture2D, Texture2DState>();

function stateOf(texture: Texture2D): Texture2DState {
  assertGraphicsResourceActiveForInternalUse(texture);
  const state = states.get(texture);
  if (!state) throw new NativeUnavailableError("Texture2D construction did not complete");
  return state;
}

export class Texture2D extends Texture {
  public constructor(graphicsDevice: GraphicsDevice, width: number, height: number);
  public constructor(
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    mipMap: boolean,
    format: SurfaceFormat,
  );
  public constructor(
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    mipMap = false,
    format = SurfaceFormat.Color,
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    width = Math.trunc(width);
    height = Math.trunc(height);
    if (width <= 0) throw new ArgumentOutOfRangeException("width");
    if (height <= 0) throw new ArgumentOutOfRangeException("height");
    const parent = graphicsDeviceParentLifetimeForInternalUse(graphicsDevice);
    const deviceHandle = resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
    const activeBackend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const handle = activeBackend.createTexture2D(deviceHandle, width, height, Boolean(mipMap), format);
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: parent,
      Release: (value) => activeBackend.destroyTexture2D(value),
      Label: "Texture2D",
    });
    initializeTextureForInternalUse(this, format, mipMap ? mipLevelCount(width, height) : 1);
    states.set(this, { Width: width, Height: height, Lifetime: lifetime });
    attachGraphicsResourceForInternalUse(
      this,
      graphicsDevice,
      (name, tag) => notifyGraphicsResourceDestroyedForInternalUse(graphicsDevice, name, tag),
    );
    setGraphicsResourceLifetimeForInternalUse(
      this,
      () => lifetime.Dispose(),
      () => lifetime.State === "active",
    );
    notifyGraphicsResourceCreatedForInternalUse(graphicsDevice, this);
  }

  public get Bounds(): Rectangle { return new Rectangle(0, 0, this.Width, this.Height); }
  public get Height(): number { return stateOf(this).Height; }
  public get Width(): number { return stateOf(this).Width; }

  public static FromStream(graphicsDevice: GraphicsDevice, stream: Uint8Array): Texture2D;
  public static FromStream(
    graphicsDevice: GraphicsDevice,
    stream: Uint8Array,
    width: number,
    height: number,
    zoom: boolean,
  ): Texture2D;
  public static FromStream(
    graphicsDevice: GraphicsDevice,
    stream: Uint8Array,
    width?: number,
    height?: number,
    zoom?: boolean,
  ): Texture2D {
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    if (stream == null) throw new ArgumentNullException("stream");
    void [width, height, zoom];
    throw new NativeUnavailableError("Texture2D.FromStream requires the audited encoded-memory CNA route");
  }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(level: number, rect: Rectangle | null, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    levelOrData: number | T[], rectOrStart?: Rectangle | null | number,
    dataOrCount?: T[] | number, startIndex?: number, elementCount?: number,
  ): void {
    stateOf(this);
    void [levelOrData, rectOrStart, dataOrCount, startIndex, elementCount];
    throw new NativeUnavailableError("Texture2D.GetData requires a typed CNA transfer route");
  }

  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(level: number, rect: Rectangle | null, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    levelOrData: number | T[], rectOrStart?: Rectangle | null | number,
    dataOrCount?: T[] | number, startIndex?: number, elementCount?: number,
  ): void {
    stateOf(this);
    void [levelOrData, rectOrStart, dataOrCount, startIndex, elementCount];
    throw new NativeUnavailableError("Texture2D.SetData requires a typed CNA transfer route");
  }

  public SaveAsJpeg(stream: Uint8Array, width: number, height: number): void {
    stateOf(this); void [stream, width, height];
    throw new NativeUnavailableError("Texture2D.SaveAsJpeg requires the audited CNA encoded-copy route");
  }
  public SaveAsPng(stream: Uint8Array, width: number, height: number): void {
    stateOf(this); void [stream, width, height];
    throw new NativeUnavailableError("Texture2D.SaveAsPng requires the audited CNA encoded-copy route");
  }
}

function mipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}
