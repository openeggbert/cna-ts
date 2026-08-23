import { EventDispatcher } from "../../../../internal/events.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import { DepthFormat, RenderTargetUsage, SurfaceFormat } from "./DeviceEnums.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { Texture2D } from "./Texture2D.js";
import { TextureCube } from "./TextureCube.js";

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
    super(graphicsDevice, width, height, mipMap, preferredFormat);
    this.Dispose();
    void [preferredDepthFormat, preferredMultiSampleCount, usage];
    throw new NativeUnavailableError("RenderTarget2D requires CNA render-target creation routes");
  }

  public get DepthStencilFormat(): DepthFormat { throw new NativeUnavailableError("RenderTarget2D is unavailable"); }
  public get IsContentLost(): boolean { throw new NativeUnavailableError("RenderTarget2D is unavailable"); }
  public get MultiSampleCount(): number { throw new NativeUnavailableError("RenderTarget2D is unavailable"); }
  public get RenderTargetUsage(): RenderTargetUsage { throw new NativeUnavailableError("RenderTarget2D is unavailable"); }
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
    super(graphicsDevice, size, mipMap, preferredFormat);
    void [preferredDepthFormat, preferredMultiSampleCount, usage];
    throw new NativeUnavailableError("RenderTargetCube requires CNA render-target creation routes");
  }

  public get DepthStencilFormat(): DepthFormat { throw new NativeUnavailableError("RenderTargetCube is unavailable"); }
  public get IsContentLost(): boolean { throw new NativeUnavailableError("RenderTargetCube is unavailable"); }
  public get MultiSampleCount(): number { throw new NativeUnavailableError("RenderTargetCube is unavailable"); }
  public get RenderTargetUsage(): RenderTargetUsage { throw new NativeUnavailableError("RenderTargetCube is unavailable"); }
}
