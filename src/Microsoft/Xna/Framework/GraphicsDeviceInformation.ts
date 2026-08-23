import { ArgumentNullException } from "../../../internal/exceptions.js";
import { GraphicsAdapter } from "./Graphics/GraphicsAdapter.js";
import { GraphicsProfile } from "./Graphics/DeviceEnums.js";
import { PresentationParameters } from "./Graphics/PresentationParameters.js";

export class GraphicsDeviceInformation {
  #adapter: GraphicsAdapter | null = null;
  #graphicsProfile = GraphicsProfile.Reach;
  #presentationParameters = new PresentationParameters();

  public constructor() {}

  public get Adapter(): GraphicsAdapter { return this.#adapter ?? GraphicsAdapter.DefaultAdapter; }
  public set Adapter(value: GraphicsAdapter) { this.#adapter = value; }
  public get GraphicsProfile(): GraphicsProfile { return this.#graphicsProfile; }
  public set GraphicsProfile(value: GraphicsProfile) { this.#graphicsProfile = value; }
  public get PresentationParameters(): PresentationParameters { return this.#presentationParameters; }
  public set PresentationParameters(value: PresentationParameters) {
    if (value == null) throw new ArgumentNullException("value");
    this.#presentationParameters = value;
  }

  public Clone(): GraphicsDeviceInformation {
    const result = new GraphicsDeviceInformation();
    result.#adapter = this.#adapter;
    result.#graphicsProfile = this.#graphicsProfile;
    result.#presentationParameters = this.#presentationParameters.Clone();
    return result;
  }

  public Equals(obj: unknown): boolean {
    if (!(obj instanceof GraphicsDeviceInformation)) return false;
    const left = this.#presentationParameters;
    const right = obj.#presentationParameters;
    return this.#adapter === obj.#adapter && this.#graphicsProfile === obj.#graphicsProfile &&
      left.BackBufferWidth === right.BackBufferWidth && left.BackBufferHeight === right.BackBufferHeight &&
      left.BackBufferFormat === right.BackBufferFormat && left.DepthStencilFormat === right.DepthStencilFormat &&
      left.MultiSampleCount === right.MultiSampleCount && left.DisplayOrientation === right.DisplayOrientation &&
      left.PresentationInterval === right.PresentationInterval && left.RenderTargetUsage === right.RenderTargetUsage &&
      left.DeviceWindowHandle === right.DeviceWindowHandle && left.IsFullScreen === right.IsFullScreen;
  }

  public GetHashCode(): number {
    const parameters = this.#presentationParameters;
    let hash = this.#graphicsProfile | 0;
    for (const value of [
      parameters.BackBufferWidth, parameters.BackBufferHeight, parameters.BackBufferFormat,
      parameters.DepthStencilFormat, parameters.MultiSampleCount, parameters.DisplayOrientation,
      parameters.PresentationInterval, parameters.RenderTargetUsage, parameters.IsFullScreen ? 1 : 0,
    ]) hash ^= value | 0;
    hash ^= Number(parameters.DeviceWindowHandle & 0xffffffffn) | 0;
    return hash | 0;
  }
}
