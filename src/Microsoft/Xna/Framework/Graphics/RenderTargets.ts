import type { CnaGraphicsBackend, RenderTargetInfo } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { NativeHandle } from "../../../../internal/ownership.js";
import type { XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { DepthFormat, RenderTargetUsage, SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  graphicsDeviceBackendForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
  isRenderTargetBoundForInternalUse,
} from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  guardGraphicsResourceReleaseForInternalUse,
} from "./GraphicsResource.js";
import { resolveTexture2DHandleForInternalUse, Texture2D } from "./Texture2D.js";
import {
  resolveTextureCubeHandleForInternalUse,
  TextureCube,
  type AdoptedTextureCubeState,
} from "./TextureCube.js";

type RenderTargetState = {
  readonly Backend: CnaGraphicsBackend;
  readonly DepthStencilFormat: DepthFormat;
  readonly MultiSampleCount: number;
  readonly RenderTargetUsage: RenderTargetUsage;
  readonly RendererAvailable: boolean;
};

const twoDimensionalStates = new WeakMap<RenderTarget2D, RenderTargetState>();
const cubeStates = new WeakMap<RenderTargetCube, RenderTargetState>();

export class RenderTarget2D extends Texture2D {
  readonly #contentLost = new EventDispatcher<unknown, EventArgs>();
  public readonly ContentLost: XnaEvent<unknown, EventArgs> = this.#contentLost;

  public constructor(graphicsDevice: GraphicsDevice, width: number, height: number);
  public constructor(
    graphicsDevice: GraphicsDevice, width: number, height: number, mipMap: boolean,
    preferredFormat: SurfaceFormat, preferredDepthFormat: DepthFormat,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, width: number, height: number, mipMap: boolean,
    preferredFormat: SurfaceFormat, preferredDepthFormat: DepthFormat,
    preferredMultiSampleCount: number, usage: RenderTargetUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, width: number, height: number, mipMap = false,
    preferredFormat = SurfaceFormat.Color, preferredDepthFormat = DepthFormat.None,
    preferredMultiSampleCount = 0, usage = RenderTargetUsage.DiscardContents,
  ) {
    // The sixth argument is an implementation-only adoption channel; public overloads remain unchanged.
    // @ts-expect-error Intentionally calling the non-exported implementation signature.
    super(graphicsDevice, width, height, mipMap, preferredFormat, createRenderTarget2D(
      graphicsDevice, width, height, mipMap, preferredFormat, preferredDepthFormat,
      preferredMultiSampleCount, usage,
    ));
    try {
      const state = inspectRenderTarget(
        graphicsDevice, resolveTexture2DHandleForInternalUse(this), 1,
      );
      twoDimensionalStates.set(this, state);
      guardGraphicsResourceReleaseForInternalUse(this, () => {
        if (isRenderTargetBoundForInternalUse(graphicsDevice, this)) {
          throw new InvalidOperationException("A bound RenderTarget2D cannot be disposed");
        }
      });
    } catch (error) {
      this.Dispose();
      throw error;
    }
  }

  public get DepthStencilFormat(): DepthFormat { return state2D(this).DepthStencilFormat; }
  public get IsContentLost(): boolean {
    const state = state2D(this);
    return state.Backend.getRenderTargetInfo(resolveTexture2DHandleForInternalUse(this)).IsContentLost;
  }
  public get MultiSampleCount(): number { return state2D(this).MultiSampleCount; }
  public get RenderTargetUsage(): RenderTargetUsage { return state2D(this).RenderTargetUsage; }
}

export class RenderTargetCube extends TextureCube {
  readonly #contentLost = new EventDispatcher<unknown, EventArgs>();
  public readonly ContentLost: XnaEvent<unknown, EventArgs> = this.#contentLost;

  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean,
    preferredFormat: SurfaceFormat, preferredDepthFormat: DepthFormat,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean,
    preferredFormat: SurfaceFormat, preferredDepthFormat: DepthFormat,
    preferredMultiSampleCount: number, usage: RenderTargetUsage,
  );
  public constructor(
    graphicsDevice: GraphicsDevice, size: number, mipMap: boolean,
    preferredFormat: SurfaceFormat, preferredDepthFormat: DepthFormat,
    preferredMultiSampleCount = 0, usage = RenderTargetUsage.DiscardContents,
  ) {
    // The fifth argument is an implementation-only adoption channel; public overloads remain unchanged.
    // @ts-expect-error Intentionally calling the non-exported implementation signature.
    super(graphicsDevice, size, mipMap, preferredFormat, createRenderTargetCube(
      graphicsDevice, size, mipMap, preferredFormat, preferredDepthFormat,
      preferredMultiSampleCount, usage,
    ));
    try {
      const state = inspectRenderTarget(
        graphicsDevice, resolveTextureCubeHandleForInternalUse(this), 2,
      );
      cubeStates.set(this, state);
      guardGraphicsResourceReleaseForInternalUse(this, () => {
        if (isRenderTargetBoundForInternalUse(graphicsDevice, this)) {
          throw new InvalidOperationException("A bound RenderTargetCube cannot be disposed");
        }
      });
    } catch (error) {
      this.Dispose();
      throw error;
    }
  }

  public get DepthStencilFormat(): DepthFormat { return stateCube(this).DepthStencilFormat; }
  public get IsContentLost(): boolean {
    const state = stateCube(this);
    return state.Backend.getRenderTargetInfo(resolveTextureCubeHandleForInternalUse(this)).IsContentLost;
  }
  public get MultiSampleCount(): number { return stateCube(this).MultiSampleCount; }
  public get RenderTargetUsage(): RenderTargetUsage { return stateCube(this).RenderTargetUsage; }
}

export function renderTargetRendererAvailableForInternalUse(
  target: RenderTarget2D | RenderTargetCube,
): boolean {
  return target instanceof RenderTarget2D
    ? state2D(target).RendererAvailable
    : stateCube(target).RendererAvailable;
}

export function resolveRenderTargetHandleForInternalUse(
  target: RenderTarget2D | RenderTargetCube,
): NativeHandle {
  return target instanceof RenderTarget2D
    ? resolveTexture2DHandleForInternalUse(target)
    : resolveTextureCubeHandleForInternalUse(target);
}

function createRenderTarget2D(
  graphicsDevice: GraphicsDevice,
  width: number,
  height: number,
  mipMap: boolean,
  format: SurfaceFormat,
  depthFormat: DepthFormat,
  multiSampleCount: number,
  usage: RenderTargetUsage,
) {
  if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
  validateCreate(width, "width", format, depthFormat, multiSampleCount, usage);
  positiveInteger(height, "height");
  const backend = requireGraphicsBackend(graphicsDevice);
  const handle = backend.createRenderTarget2D(
    resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    width, height, Boolean(mipMap), format, depthFormat, multiSampleCount, usage,
  );
  try {
    const info = backend.getRenderTargetInfo(handle);
    validateCreatedInfo(info, 1, width, height, format);
    return {
      Handle: handle,
      LevelCount: info.LevelCount,
      Release: (value: NativeHandle) => backend.destroyRenderTarget(value),
      Label: "RenderTarget2D",
    };
  } catch (error) {
    backend.destroyRenderTarget(handle);
    throw error;
  }
}

function createRenderTargetCube(
  graphicsDevice: GraphicsDevice,
  size: number,
  mipMap: boolean,
  format: SurfaceFormat,
  depthFormat: DepthFormat,
  multiSampleCount: number,
  usage: RenderTargetUsage,
): AdoptedTextureCubeState {
  if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
  validateCreate(size, "size", format, depthFormat, multiSampleCount, usage);
  const backend = requireGraphicsBackend(graphicsDevice);
  const handle = backend.createRenderTargetCube(
    resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    size, Boolean(mipMap), format, depthFormat, multiSampleCount, usage,
  );
  try {
    const info = backend.getRenderTargetInfo(handle);
    validateCreatedInfo(info, 2, size, size, format);
    return {
      Handle: handle,
      LevelCount: info.LevelCount,
      Release: (value) => backend.destroyRenderTarget(value),
      Label: "RenderTargetCube",
    };
  } catch (error) {
    backend.destroyRenderTarget(handle);
    throw error;
  }
}

function inspectRenderTarget(
  graphicsDevice: GraphicsDevice,
  handle: NativeHandle,
  expectedKind: number,
): RenderTargetState {
  const backend = requireGraphicsBackend(graphicsDevice);
  const info = backend.getRenderTargetInfo(handle);
  if (info.Kind !== expectedKind) {
    throw new NativeUnavailableError("CNA returned the wrong render-target kind");
  }
  return {
    Backend: backend,
    DepthStencilFormat: info.DepthFormat as DepthFormat,
    MultiSampleCount: info.MultiSampleCount,
    RenderTargetUsage: info.Usage as RenderTargetUsage,
    RendererAvailable: info.RendererAvailable,
  };
}

function state2D(target: RenderTarget2D): RenderTargetState {
  assertGraphicsResourceActiveForInternalUse(target);
  const state = twoDimensionalStates.get(target);
  if (!state) throw new NativeUnavailableError("RenderTarget2D construction did not complete");
  return state;
}

function stateCube(target: RenderTargetCube): RenderTargetState {
  assertGraphicsResourceActiveForInternalUse(target);
  const state = cubeStates.get(target);
  if (!state) throw new NativeUnavailableError("RenderTargetCube construction did not complete");
  return state;
}

function requireGraphicsBackend(graphicsDevice: GraphicsDevice): CnaGraphicsBackend {
  const backend = graphicsDeviceBackendForInternalUse(graphicsDevice).Graphics;
  if (!backend) throw new NativeUnavailableError("Render targets require CNA render-target routes");
  return backend;
}

function validateCreate(
  dimension: number,
  dimensionName: string,
  format: SurfaceFormat,
  depthFormat: DepthFormat,
  multiSampleCount: number,
  usage: RenderTargetUsage,
): void {
  positiveInteger(dimension, dimensionName);
  if (!Number.isInteger(format) || format < SurfaceFormat.Color || format > SurfaceFormat.HdrBlendable) {
    throw new ArgumentOutOfRangeException("preferredFormat");
  }
  if (!Number.isInteger(depthFormat) || depthFormat < DepthFormat.None ||
      depthFormat > DepthFormat.Depth24Stencil8) {
    throw new ArgumentOutOfRangeException("preferredDepthFormat");
  }
  if (!Number.isInteger(multiSampleCount) || multiSampleCount < 0 ||
      multiSampleCount > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException("preferredMultiSampleCount");
  }
  if (!Number.isInteger(usage) || usage < RenderTargetUsage.DiscardContents ||
      usage > RenderTargetUsage.PlatformContents) {
    throw new ArgumentOutOfRangeException("usage");
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new ArgumentOutOfRangeException(name);
  }
  return value;
}

function validateCreatedInfo(
  info: RenderTargetInfo,
  kind: number,
  width: number,
  height: number,
  format: SurfaceFormat,
): void {
  if (info.Kind !== kind || info.Width !== width || info.Height !== height ||
      info.Format !== format || info.LevelCount <= 0) {
    throw new NativeUnavailableError("CNA render-target creation returned inconsistent metadata");
  }
}
