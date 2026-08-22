import { DisplayOrientation } from "../DisplayOrientation.js";
import { Rectangle } from "../Rectangle.js";
import {
  DepthFormat,
  PresentInterval,
  RenderTargetUsage,
  SurfaceFormat,
} from "./DeviceEnums.js";

/** Runtime-independent XNA swap-chain settings value. */
export class PresentationParameters {
  #backBufferWidth = 0;
  #backBufferHeight = 0;
  #backBufferFormat = SurfaceFormat.Color;
  #depthStencilFormat = DepthFormat.None;
  #multiSampleCount = 0;
  #displayOrientation = DisplayOrientation.Default;
  #presentationInterval = PresentInterval.Default;
  #renderTargetUsage = RenderTargetUsage.DiscardContents;
  #deviceWindowHandle = 0n;
  #isFullScreen = true;

  public constructor() {}

  public get BackBufferWidth(): number { return this.#backBufferWidth; }
  public set BackBufferWidth(value: number) { this.#backBufferWidth = Math.trunc(value); }

  public get BackBufferHeight(): number { return this.#backBufferHeight; }
  public set BackBufferHeight(value: number) { this.#backBufferHeight = Math.trunc(value); }

  public get BackBufferFormat(): SurfaceFormat { return this.#backBufferFormat; }
  public set BackBufferFormat(value: SurfaceFormat) { this.#backBufferFormat = value; }

  public get DepthStencilFormat(): DepthFormat { return this.#depthStencilFormat; }
  public set DepthStencilFormat(value: DepthFormat) { this.#depthStencilFormat = value; }

  public get MultiSampleCount(): number { return this.#multiSampleCount; }
  public set MultiSampleCount(value: number) { this.#multiSampleCount = Math.trunc(value); }

  public get DisplayOrientation(): DisplayOrientation { return this.#displayOrientation; }
  public set DisplayOrientation(value: DisplayOrientation) { this.#displayOrientation = value; }

  public get PresentationInterval(): PresentInterval { return this.#presentationInterval; }
  public set PresentationInterval(value: PresentInterval) { this.#presentationInterval = value; }

  public get RenderTargetUsage(): RenderTargetUsage { return this.#renderTargetUsage; }
  public set RenderTargetUsage(value: RenderTargetUsage) { this.#renderTargetUsage = value; }

  public get DeviceWindowHandle(): bigint { return this.#deviceWindowHandle; }
  public set DeviceWindowHandle(value: bigint) { this.#deviceWindowHandle = value; }

  public get IsFullScreen(): boolean { return this.#isFullScreen; }
  public set IsFullScreen(value: boolean) { this.#isFullScreen = Boolean(value); }

  public get Bounds(): Rectangle {
    return new Rectangle(0, 0, this.#backBufferWidth, this.#backBufferHeight);
  }

  public Clone(): PresentationParameters {
    const result = new PresentationParameters();
    result.#backBufferWidth = this.#backBufferWidth;
    result.#backBufferHeight = this.#backBufferHeight;
    result.#backBufferFormat = this.#backBufferFormat;
    result.#depthStencilFormat = this.#depthStencilFormat;
    result.#multiSampleCount = this.#multiSampleCount;
    result.#displayOrientation = this.#displayOrientation;
    result.#presentationInterval = this.#presentationInterval;
    result.#renderTargetUsage = this.#renderTargetUsage;
    result.#deviceWindowHandle = this.#deviceWindowHandle;
    result.#isFullScreen = this.#isFullScreen;
    return result;
  }
}
