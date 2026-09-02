import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  NotSupportedException,
} from "../../../../internal/exceptions.js";
import type { CnaBackend, Texture2DTransfer } from "../../../../internal/backend.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import {
  canonicalTextureCodecFor,
  decodeTextureTransfer,
  encodeTextureTransfer,
  resolveTextureElementCodec,
  textureRegionByteCount,
  textureTransferArrayLength,
} from "../../../../internal/texture-transfer.js";
import { Rectangle } from "../Rectangle.js";
import { SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  attachGraphicsResourceForInternalUse,
  assertGraphicsResourceActiveForInternalUse,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";
import { initializeTextureForInternalUse, Texture } from "./Texture.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  notifyGraphicsResourceCreatedForInternalUse,
  notifyGraphicsResourceDestroyedForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "../../../../internal/graphics-device-registry.js";

type Texture2DState = {
  readonly Width: number;
  readonly Height: number;
  readonly LevelCount: number;
  readonly Lifetime: NativeResourceLifetime;
  readonly Backend: CnaBackend;
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
    adopted?: {
      readonly Handle: NativeHandle;
      readonly LevelCount: number;
      readonly Release?: (handle: NativeHandle) => void;
      readonly Label?: string;
      /**
       * `"borrowed"` for a texture some other native object owns -- a VideoPlayer's decoded frame
       * is the case this exists for. A borrowed lifetime releases nothing, so the facade going away
       * cannot destroy an object its real owner is still using.
       */
      readonly Ownership?: "owned" | "borrowed";
    },
  ) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    width = positiveInteger(width, "width");
    height = positiveInteger(height, "height");
    if (!Number.isInteger(format) || format < SurfaceFormat.Color || format > SurfaceFormat.HdrBlendable) {
      throw new ArgumentOutOfRangeException("format");
    }
    const parent = graphicsDeviceParentLifetimeForInternalUse(graphicsDevice);
    const deviceHandle = resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
    const activeBackend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const handle = adopted?.Handle ??
      activeBackend.createTexture2D(deviceHandle, width, height, Boolean(mipMap), format);
    const borrowed = adopted?.Ownership === "borrowed";
    const lifetime = new NativeResourceLifetime(borrowed
      ? {
        Handle: handle,
        Ownership: "borrowed",
        Parent: parent,
        Label: adopted?.Label ?? "Texture2D",
      }
      : {
        Handle: handle,
        Ownership: "owned",
        Parent: parent,
        Release: adopted?.Release ?? ((value) => activeBackend.destroyTexture2D(value)),
        Label: adopted?.Label ?? "Texture2D",
      });
    initializeTextureForInternalUse(
      this,
      format,
      adopted?.LevelCount ?? (mipMap ? mipLevelCount(width, height) : 1),
      () => lifetime.Handle,
    );
    const levelCount = adopted?.LevelCount ?? (mipMap ? mipLevelCount(width, height) : 1);
    states.set(this, {
      Width: width,
      Height: height,
      LevelCount: levelCount,
      Lifetime: lifetime,
      Backend: activeBackend,
    });
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
    if (!(stream instanceof Uint8Array)) {
      throw new ArgumentException("stream must be a Uint8Array byte snapshot");
    }
    if (stream.byteLength === 0) throw new ArgumentException("stream contains no encoded image data");
    if ((width === undefined) !== (height === undefined)) {
      throw new ArgumentException("width and height must either both be supplied or both be omitted");
    }
    const decode = width === undefined && height === undefined
      ? null
      : {
          Width: positiveInteger(width as number, "width"),
          Height: positiveInteger(height as number, "height"),
          Zoom: Boolean(zoom),
        };
    const activeBackend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const deviceHandle = resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
    const encoded = new Uint8Array(stream);
    const handle = activeBackend.createTexture2DFromEncodedMemory(deviceHandle, encoded, decode);
    try {
      const info = activeBackend.getTexture2DInfo(handle);
      type AdoptedConstructor = new (
        device: GraphicsDevice,
        textureWidth: number,
        textureHeight: number,
        mipMap: boolean,
        textureFormat: SurfaceFormat,
        adoptedState: { readonly Handle: NativeHandle; readonly LevelCount: number },
      ) => Texture2D;
      return new (Texture2D as unknown as AdoptedConstructor)(
        graphicsDevice,
        info.Width,
        info.Height,
        info.LevelCount > 1,
        info.Format as SurfaceFormat,
        { Handle: handle, LevelCount: info.LevelCount },
      );
    } catch (error) {
      activeBackend.destroyTexture2D(handle);
      throw error;
    }
  }

  public GetData<T>(data: T[]): void;
  public GetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(level: number, rect: Rectangle | null, data: T[], startIndex: number, elementCount: number): void;
  public GetData<T>(
    levelOrData: number | T[], rectOrStart?: Rectangle | null | number,
    dataOrCount?: T[] | number, startIndex?: number, elementCount?: number,
  ): void {
    const request = parseTransfer(levelOrData, rectOrStart, dataOrCount, startIndex, elementCount);
    const state = stateOf(this);
    const prepared = prepareTransfer(state, this.Format, request, true);
    const bytes = state.Backend.getTexture2DData(state.Lifetime.Handle, prepared.Transfer);
    const expectedBytes = prepared.Transfer.Capacity * prepared.Transfer.ElementSize;
    if (bytes.byteLength !== expectedBytes) {
      throw new NativeUnavailableError(
        `CNA Texture2D readback returned ${bytes.byteLength} bytes; expected ${expectedBytes}`,
      );
    }
    decodeTextureTransfer(
      request.Data,
      prepared.Codec,
      bytes,
      request.StartIndex,
      request.ElementCount,
    );
  }

  public SetData<T>(data: T[]): void;
  public SetData<T>(data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(level: number, rect: Rectangle | null, data: T[], startIndex: number, elementCount: number): void;
  public SetData<T>(
    levelOrData: number | T[], rectOrStart?: Rectangle | null | number,
    dataOrCount?: T[] | number, startIndex?: number, elementCount?: number,
  ): void {
    const request = parseTransfer(levelOrData, rectOrStart, dataOrCount, startIndex, elementCount);
    const state = stateOf(this);
    const prepared = prepareTransfer(state, this.Format, request, false);
    const bytes = encodeTextureTransfer(
      request.Data,
      prepared.Codec,
      request.StartIndex,
      request.ElementCount,
      prepared.Transfer.Capacity,
    );
    state.Backend.setTexture2DData(state.Lifetime.Handle, prepared.Transfer, bytes);
  }

  public SaveAsJpeg(stream: Uint8Array, width: number, height: number): void {
    this.#saveAs(stream, width, height, 1);
  }
  public SaveAsPng(stream: Uint8Array, width: number, height: number): void {
    this.#saveAs(stream, width, height, 0);
  }

  #saveAs(stream: Uint8Array, width: number, height: number, imageFormat: number): void {
    const state = stateOf(this);
    if (stream == null) throw new ArgumentNullException("stream");
    if (!(stream instanceof Uint8Array)) {
      throw new ArgumentException("stream must be a writable Uint8Array byte view");
    }
    width = positiveInteger(width, "width");
    height = positiveInteger(height, "height");
    const encoded = state.Backend.encodeTexture2D(
      state.Lifetime.Handle,
      imageFormat,
      width,
      height,
    );
    if (stream.byteLength < encoded.byteLength) {
      throw new ArgumentException(
        `stream capacity ${stream.byteLength} is smaller than the ${encoded.byteLength}-byte image`,
      );
    }
    stream.set(encoded, 0);
  }
}

export function resolveTexture2DHandleForInternalUse(texture: Texture2D): NativeHandle {
  return stateOf(texture).Lifetime.Handle;
}

/**
 * Uploads one whole mip level from bytes already laid out in the texture's own surface format.
 *
 * XNA's `SetData<T>` is typed for element arrays, and widening it to accept a byte view would
 * change a strictly projected signature. A decoded content payload -- CNB hands one back per level
 * -- is already exactly those bytes, so this goes through the same transfer preparation and the
 * same element-codec resolution (which picks the byte codec for a `Uint8Array`) without touching
 * the public shape.
 */
export function setTexture2DLevelBytesForInternalUse(
  texture: Texture2D, level: number, bytes: Uint8Array,
): void {
  if (bytes == null) throw new ArgumentNullException("bytes");
  const state = stateOf(texture);
  if (!Number.isInteger(level) || level < 0 || level >= state.LevelCount) {
    throw new ArgumentOutOfRangeException("level");
  }
  const width = Math.max(1, state.Width >> level);
  const height = Math.max(1, state.Height >> level);
  const required = textureRegionByteCount(texture.Format, width, height);
  if (bytes.byteLength !== required) {
    throw new ArgumentException(
      `mip level ${level} of this texture is ${required} bytes; ${bytes.byteLength} were supplied`,
    );
  }
  // The bytes go through unchanged; what the descriptor says is how CNA should *read* them. That
  // has to be the format's canonical element type rather than the byte one -- CNA refuses byte data
  // for anything but a ByteEXT surface, which is right: a byte count carries no evidence about the
  // layout it describes.
  const codec = canonicalTextureCodecFor(texture.Format);
  if (codec == null) {
    throw new NotSupportedException(`SurfaceFormat ${texture.Format} has no element representation`);
  }
  const transfer: Texture2DTransfer = {
    DataType: codec.DataType,
    ElementSize: codec.ElementSize,
    Level: level,
    Rectangle: null,
    StartIndex: 0,
    ElementCount: required / codec.ElementSize,
    Capacity: required / codec.ElementSize,
  };
  state.Backend.setTexture2DData(state.Lifetime.Handle, transfer, bytes);
}

type TransferRequest = {
  readonly Level: number;
  readonly Rectangle: Rectangle | null;
  readonly Data: unknown;
  readonly StartIndex: number;
  readonly ElementCount: number;
};

function integer(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  value = integer(value, name);
  if (value <= 0 || value > 0x7fff_ffff) throw new ArgumentOutOfRangeException(name);
  return value;
}

function parseTransfer<T>(
  levelOrData: number | T[],
  rectOrStart?: Rectangle | null | number,
  dataOrCount?: T[] | number,
  startIndex?: number,
  elementCount?: number,
): TransferRequest {
  if (typeof levelOrData === "number") {
    if (rectOrStart !== null && !(rectOrStart instanceof Rectangle)) {
      throw new ArgumentException("rect must be a Rectangle or null");
    }
    if (dataOrCount == null) throw new ArgumentNullException("data");
    return {
      Level: integer(levelOrData, "level"),
      Rectangle: rectOrStart == null
        ? null
        : new Rectangle(rectOrStart.X, rectOrStart.Y, rectOrStart.Width, rectOrStart.Height),
      Data: dataOrCount,
      StartIndex: integer(startIndex as number, "startIndex"),
      ElementCount: integer(elementCount as number, "elementCount"),
    };
  }
  if (levelOrData == null) throw new ArgumentNullException("data");
  const capacity = textureTransferArrayLength(levelOrData);
  if (typeof rectOrStart === "number") {
    return {
      Level: 0,
      Rectangle: null,
      Data: levelOrData,
      StartIndex: integer(rectOrStart, "startIndex"),
      ElementCount: integer(dataOrCount as number, "elementCount"),
    };
  }
  return { Level: 0, Rectangle: null, Data: levelOrData, StartIndex: 0, ElementCount: capacity };
}

function prepareTransfer(
  state: Texture2DState,
  format: SurfaceFormat,
  request: TransferRequest,
  forReadback: boolean,
) {
  if (request.Level < 0 || request.Level >= state.LevelCount) {
    throw new ArgumentOutOfRangeException("level");
  }
  if (request.StartIndex < 0) throw new ArgumentOutOfRangeException("startIndex");
  if (request.ElementCount < 0) throw new ArgumentOutOfRangeException("elementCount");
  const capacity = textureTransferArrayLength(request.Data);
  if (request.StartIndex > capacity || request.ElementCount > capacity - request.StartIndex) {
    throw new ArgumentException("data is too small for startIndex and elementCount");
  }

  const levelWidth = Math.max(1, state.Width >> request.Level);
  const levelHeight = Math.max(1, state.Height >> request.Level);
  const rectangle = request.Rectangle == null
    ? null
    : {
        X: integer(request.Rectangle.X, "rect"),
        Y: integer(request.Rectangle.Y, "rect"),
        Width: integer(request.Rectangle.Width, "rect"),
        Height: integer(request.Rectangle.Height, "rect"),
      };
  if (rectangle != null && (
    rectangle.X < 0 || rectangle.Y < 0 || rectangle.Width <= 0 || rectangle.Height <= 0 ||
    rectangle.X > levelWidth - rectangle.Width || rectangle.Y > levelHeight - rectangle.Height
  )) {
    throw new ArgumentException("rect is empty, negative, or outside the selected mip level");
  }
  const regionWidth = rectangle?.Width ?? levelWidth;
  const regionHeight = rectangle?.Height ?? levelHeight;
  const requiredBytes = textureRegionByteCount(format, regionWidth, regionHeight);
  const codec = resolveTextureElementCodec(
    request.Data,
    request.StartIndex,
    request.ElementCount,
    format,
    requiredBytes,
    forReadback,
  );
  const transfer: Texture2DTransfer = {
    DataType: codec.DataType,
    ElementSize: codec.ElementSize,
    Level: request.Level,
    Rectangle: rectangle,
    StartIndex: request.StartIndex,
    ElementCount: request.ElementCount,
    Capacity: capacity,
  };
  return { Transfer: transfer, Codec: codec };
}

function mipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}
