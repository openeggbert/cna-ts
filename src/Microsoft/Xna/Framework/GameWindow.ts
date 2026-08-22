import { ArgumentNullException } from "../../../internal/exceptions.js";
import { EventDispatcher } from "../../../internal/events.js";
import { NativeUnavailableError } from "../../../internal/native-error.js";
import type { XnaEvent } from "./Contracts.js";
import type { DisplayOrientation } from "./DisplayOrientation.js";
import { EventArgs } from "./EventArgs.js";
import type { Rectangle } from "./Rectangle.js";

/**
 * Managed portion of XNA's system-window contract.
 *
 * Concrete CNA platform windows provide the abstract state and device-transition operations.
 */
export abstract class GameWindow {
  readonly #clientSizeChanged = new EventDispatcher<unknown, EventArgs>();
  readonly #orientationChanged = new EventDispatcher<unknown, EventArgs>();
  readonly #screenDeviceNameChanged = new EventDispatcher<unknown, EventArgs>();
  #title = "";

  public readonly ClientSizeChanged: XnaEvent<unknown, EventArgs> = this.#clientSizeChanged;
  public readonly OrientationChanged: XnaEvent<unknown, EventArgs> = this.#orientationChanged;
  public readonly ScreenDeviceNameChanged: XnaEvent<unknown, EventArgs> = this.#screenDeviceNameChanged;

  public get Title(): string { return this.#title; }
  public set Title(value: string) {
    if (value == null) throw new ArgumentNullException("value");
    if (this.#title === value) return;
    this.#title = value;
    this.SetTitle(value);
  }

  public abstract get Handle(): bigint;
  public abstract get AllowUserResizing(): boolean;
  public abstract set AllowUserResizing(value: boolean);
  public abstract get ClientBounds(): Rectangle;
  public abstract get CurrentOrientation(): DisplayOrientation;
  public abstract get ScreenDeviceName(): string;

  public abstract BeginScreenDeviceChange(willBeFullScreen: boolean): void;

  public EndScreenDeviceChange(screenDeviceName: string): void;
  public EndScreenDeviceChange(
    screenDeviceName: string,
    clientWidth: number,
    clientHeight: number,
  ): void;
  public EndScreenDeviceChange(
    screenDeviceName: string,
    clientWidth?: number,
    clientHeight?: number,
  ): void {
    if (clientWidth === undefined && clientHeight === undefined) {
      this.EndScreenDeviceChange(
        screenDeviceName,
        this.ClientBounds.Width,
        this.ClientBounds.Height,
      );
      return;
    }
    throw new NativeUnavailableError(
      "The concrete CNA GameWindow must implement the three-argument device transition",
    );
  }

  protected abstract SetSupportedOrientations(orientations: DisplayOrientation): void;
  protected abstract SetTitle(title: string): void;

  protected OnActivated(): void {}
  protected OnClientSizeChanged(): void {
    this.#clientSizeChanged.Dispatch(this, EventArgs.Empty);
  }
  protected OnDeactivated(): void {}
  protected OnOrientationChanged(): void {
    this.#orientationChanged.Dispatch(this, EventArgs.Empty);
  }
  protected OnPaint(): void {}
  protected OnScreenDeviceNameChanged(): void {
    this.#screenDeviceNameChanged.Dispatch(this, EventArgs.Empty);
  }
}
