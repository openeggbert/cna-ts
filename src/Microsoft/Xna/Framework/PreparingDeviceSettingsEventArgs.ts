import { ArgumentNullException } from "../../../internal/exceptions.js";
import { EventArgs } from "./EventArgs.js";
import type { GraphicsDeviceInformation } from "./GraphicsDeviceInformation.js";

export class PreparingDeviceSettingsEventArgs extends EventArgs {
  readonly #graphicsDeviceInformation: GraphicsDeviceInformation;

  public constructor(graphicsDeviceInformation: GraphicsDeviceInformation) {
    super();
    if (graphicsDeviceInformation == null) throw new ArgumentNullException("graphicsDeviceInformation");
    this.#graphicsDeviceInformation = graphicsDeviceInformation;
  }

  public get GraphicsDeviceInformation(): GraphicsDeviceInformation {
    return this.#graphicsDeviceInformation;
  }
}
