import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../../../internal/abi.js";
import type { CnaGameWindowBackend } from "../../../internal/backend.js";
import { ArgumentNullException } from "../../../internal/exceptions.js";
import { EventDispatcher } from "../../../internal/events.js";
import { NativeUnavailableError } from "../../../internal/native-error.js";
import type { NativeResourceLifetime } from "../../../internal/ownership.js";
import type { XnaEvent } from "./Contracts.js";
import { DisplayOrientation } from "./DisplayOrientation.js";
import { EventArgs } from "./EventArgs.js";
import { Rectangle } from "./Rectangle.js";

const titleReaders = new WeakMap<GameWindow, () => string>();
const endScreenChangeRoutes = new WeakMap<
GameWindow,
(name: string, width: number, height: number) => void
>();

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

  public get Title(): string { return titleReaders.get(this)?.() ?? this.#title; }
  public set Title(value: string) {
    if (value == null) throw new ArgumentNullException("value");
    if (this.Title === value) return;
    this.SetTitle(value);
    this.#title = value;
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
    const apply = endScreenChangeRoutes.get(this);
    if (clientWidth === undefined && clientHeight === undefined) {
      if (apply) apply(screenDeviceName, 0, 0);
      else this.EndScreenDeviceChange(
        screenDeviceName, this.ClientBounds.Width, this.ClientBounds.Height,
      );
      return;
    }
    if (apply) apply(screenDeviceName, clientWidth!, clientHeight!);
    else throw new NativeUnavailableError(
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

class NativeGameWindow extends GameWindow {
  readonly #backend: CnaGameWindowBackend;

  public constructor(backend: CnaGameWindowBackend, parent: NativeResourceLifetime) {
    super();
    this.#backend = backend;
    titleReaders.set(this, () => backend.getGameWindowTitle());
    endScreenChangeRoutes.set(this, (name, width, height) => {
      if (name == null) throw new ArgumentNullException("screenDeviceName");
      backend.endGameWindowScreenDeviceChange(name, Math.trunc(width), Math.trunc(height));
    });
    const registrations: bigint[] = [];
    try {
      registrations.push(backend.subscribeGameWindowEvent(0, () => this.OnClientSizeChanged()));
      registrations.push(backend.subscribeGameWindowEvent(1, () => this.OnOrientationChanged()));
      registrations.push(backend.subscribeGameWindowEvent(2, () => this.OnScreenDeviceNameChanged()));
      for (const registration of registrations) {
        parent.TrackCallback(() => backend.unsubscribeGameWindowEvent(registration));
      }
    } catch (error) {
      for (const registration of registrations.reverse()) {
        try { backend.unsubscribeGameWindowEvent(registration); } catch { /* preserve construction failure */ }
      }
      throw error;
    }
  }

  public get Handle(): bigint { return this.#backend.getGameWindowHandle(); }
  public get AllowUserResizing(): boolean { return this.#backend.getGameWindowAllowUserResizing(); }
  public set AllowUserResizing(value: boolean) {
    this.#backend.setGameWindowAllowUserResizing(Boolean(value));
  }
  public get ClientBounds(): Rectangle {
    const value = this.#backend.getGameWindowClientBounds();
    return new Rectangle(value.X, value.Y, value.Width, value.Height);
  }
  public get CurrentOrientation(): DisplayOrientation {
    return this.#backend.getGameWindowCurrentOrientation() as DisplayOrientation;
  }
  public get ScreenDeviceName(): string { return this.#backend.getGameWindowScreenDeviceName(); }

  public BeginScreenDeviceChange(willBeFullScreen: boolean): void {
    this.#backend.beginGameWindowScreenDeviceChange(Boolean(willBeFullScreen));
  }

  protected override SetSupportedOrientations(_orientations: DisplayOrientation): void {
    throw new NativeUnavailableError(
      "GameWindow supported-orientation mutation is owned by GraphicsDeviceManager; the CNA C ABI " +
      `${CNA_ABI_MAJOR}.${CNA_ABI_MINOR} window family exposes only the read-only current orientation`,
    );
  }

  protected override SetTitle(title: string): void { this.#backend.setGameWindowTitle(title); }
}

export function createGameWindowForInternalUse(
  backend: CnaGameWindowBackend,
  parent: NativeResourceLifetime,
): GameWindow {
  return new NativeGameWindow(backend, parent);
}
