import type { XnaEvent } from "../Contracts.js";
import type { EventArgs } from "../EventArgs.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";

export interface IGraphicsDeviceService {
  readonly DeviceCreated: XnaEvent<unknown, EventArgs>;
  readonly DeviceDisposing: XnaEvent<unknown, EventArgs>;
  readonly DeviceReset: XnaEvent<unknown, EventArgs>;
  readonly DeviceResetting: XnaEvent<unknown, EventArgs>;
  get GraphicsDevice(): GraphicsDevice;
}
