import type { CnaBackend, GraphicsManagerConfiguration } from "../../../internal/backend.js";
import { getBackend } from "../../../internal/backend.js";
import { EventDispatcher } from "../../../internal/events.js";
import { ArgumentNullException, InvalidOperationException } from "../../../internal/exceptions.js";
import { NativeResourceLifetime } from "../../../internal/ownership.js";
import type { IDisposable, XnaEvent } from "./Contracts.js";
import { DisplayOrientation } from "./DisplayOrientation.js";
import { EventArgs } from "./EventArgs.js";
import type { Game } from "./Game.js";
import {
  ensureNativeGameForInternalUse,
  registerGraphicsDeviceManagerForInternalUse,
  unregisterGraphicsDeviceManagerForInternalUse,
} from "./Game.js";
import {
  DepthFormat,
  GraphicsProfile,
  SurfaceFormat,
} from "./Graphics/DeviceEnums.js";
import {
  createGraphicsDeviceForInternalUse,
  type GraphicsDevice,
} from "./Graphics/GraphicsDevice.js";
import type { IGraphicsDeviceService } from "./Graphics/IGraphicsDeviceService.js";
import { PresentationParameters } from "./Graphics/PresentationParameters.js";
import { GraphicsDeviceInformation } from "./GraphicsDeviceInformation.js";
import type { IGraphicsDeviceManager } from "./IGraphicsDeviceManager.js";
import { PreparingDeviceSettingsEventArgs } from "./PreparingDeviceSettingsEventArgs.js";

export class GraphicsDeviceManager implements IGraphicsDeviceService, IDisposable, IGraphicsDeviceManager {
  public static readonly DefaultBackBufferHeight = 480;
  public static readonly DefaultBackBufferWidth = 800;

  readonly #game: Game;
  readonly #deviceCreated = new EventDispatcher<unknown, EventArgs>();
  readonly #deviceDisposing = new EventDispatcher<unknown, EventArgs>();
  readonly #deviceReset = new EventDispatcher<unknown, EventArgs>();
  readonly #deviceResetting = new EventDispatcher<unknown, EventArgs>();
  readonly #disposedEvent = new EventDispatcher<unknown, EventArgs>();
  readonly #preparing = new EventDispatcher<unknown, PreparingDeviceSettingsEventArgs>();
  #graphicsProfile = GraphicsProfile.Reach;
  #isFullScreen = false;
  #preferMultiSampling = false;
  #preferredBackBufferFormat = SurfaceFormat.Color;
  #preferredBackBufferHeight = GraphicsDeviceManager.DefaultBackBufferHeight;
  #preferredBackBufferWidth = GraphicsDeviceManager.DefaultBackBufferWidth;
  #preferredDepthStencilFormat = DepthFormat.Depth24;
  #supportedOrientations = DisplayOrientation.Default;
  #synchronizeWithVerticalRetrace = true;
  #backend: CnaBackend | null = null;
  #managerLifetime: NativeResourceLifetime | null = null;
  #graphicsDevice: GraphicsDevice | null = null;
  #disposed = false;

  public readonly DeviceCreated: XnaEvent<unknown, EventArgs> = this.#deviceCreated;
  public readonly DeviceDisposing: XnaEvent<unknown, EventArgs> = this.#deviceDisposing;
  public readonly DeviceReset: XnaEvent<unknown, EventArgs> = this.#deviceReset;
  public readonly DeviceResetting: XnaEvent<unknown, EventArgs> = this.#deviceResetting;
  public readonly Disposed: XnaEvent<unknown, EventArgs> = this.#disposedEvent;
  public readonly PreparingDeviceSettings: XnaEvent<unknown, PreparingDeviceSettingsEventArgs> = this.#preparing;

  public constructor(game: Game) {
    if (game == null) throw new ArgumentNullException("game");
    this.#game = game;
    registerGraphicsDeviceManagerForInternalUse(game, this);
    // XNA's constructor registers the manager in the game's services under
    // `IGraphicsDeviceService` and `IGraphicsDeviceManager`, which is how `ContentManager` finds a
    // device for a texture, font or model without being handed one. A TypeScript interface has no
    // runtime token to key a service by, so the concrete class is the key -- the same substitution
    // `docs/xna-typescript-mapping.md` records for every interface-typed service, and the one the
    // built-in content readers already look for. Without it `Content.Load` inside an ordinary
    // `Game` fails with "Texture content requires a GraphicsDevice service", which is a behavioural
    // gap the structural verifier cannot see.
    game.Services.AddService(GraphicsDeviceManager, this);
  }

  public get GraphicsDevice(): GraphicsDevice {
    this.#ensureUsable();
    if (!this.#graphicsDevice) throw new InvalidOperationException("The graphics device has not been created");
    return this.#graphicsDevice;
  }
  public get GraphicsProfile(): GraphicsProfile { return this.#graphicsProfile; }
  public set GraphicsProfile(value: GraphicsProfile) { this.#ensureUsable(); this.#graphicsProfile = value; }
  public get IsFullScreen(): boolean { return this.#isFullScreen; }
  public set IsFullScreen(value: boolean) { this.#ensureUsable(); this.#isFullScreen = Boolean(value); }
  public get PreferMultiSampling(): boolean { return this.#preferMultiSampling; }
  public set PreferMultiSampling(value: boolean) { this.#ensureUsable(); this.#preferMultiSampling = Boolean(value); }
  public get PreferredBackBufferFormat(): SurfaceFormat { return this.#preferredBackBufferFormat; }
  public set PreferredBackBufferFormat(value: SurfaceFormat) { this.#ensureUsable(); this.#preferredBackBufferFormat = value; }
  public get PreferredBackBufferHeight(): number { return this.#preferredBackBufferHeight; }
  public set PreferredBackBufferHeight(value: number) { this.#ensureUsable(); this.#preferredBackBufferHeight = Math.trunc(value); }
  public get PreferredBackBufferWidth(): number { return this.#preferredBackBufferWidth; }
  public set PreferredBackBufferWidth(value: number) { this.#ensureUsable(); this.#preferredBackBufferWidth = Math.trunc(value); }
  public get PreferredDepthStencilFormat(): DepthFormat { return this.#preferredDepthStencilFormat; }
  public set PreferredDepthStencilFormat(value: DepthFormat) { this.#ensureUsable(); this.#preferredDepthStencilFormat = value; }
  public get SupportedOrientations(): DisplayOrientation { return this.#supportedOrientations; }
  public set SupportedOrientations(value: DisplayOrientation) { this.#ensureUsable(); this.#supportedOrientations = value; }
  public get SynchronizeWithVerticalRetrace(): boolean { return this.#synchronizeWithVerticalRetrace; }
  public set SynchronizeWithVerticalRetrace(value: boolean) { this.#ensureUsable(); this.#synchronizeWithVerticalRetrace = Boolean(value); }

  public ApplyChanges(): void {
    this.#ensureUsable();
    this.CreateDevice();
    const backend = this.#backend as CnaBackend;
    const lifetime = this.#managerLifetime as NativeResourceLifetime;
    backend.configureGraphicsDeviceManager(lifetime.Handle, this.#configuration());
    backend.applyGraphicsDeviceManagerChanges(lifetime.Handle);
  }

  public ToggleFullScreen(): void {
    this.#ensureUsable();
    this.#isFullScreen = !this.#isFullScreen;
    if (this.#managerLifetime?.State === "active" && this.#backend) {
      this.#backend.toggleGraphicsDeviceManagerFullScreen(this.#managerLifetime.Handle);
    }
  }

  public BeginDraw(): boolean {
    this.#ensureUsable();
    this.CreateDevice();
    return (this.#backend as CnaBackend).beginGraphicsDeviceManagerDraw(
      (this.#managerLifetime as NativeResourceLifetime).Handle,
    );
  }

  public CreateDevice(): void {
    this.#ensureUsable();
    if (this.#graphicsDevice && !this.#graphicsDevice.IsDisposed) return;
    const backend = getBackend();
    const gameLifetime = ensureNativeGameForInternalUse(this.#game, backend);
    const managerHandle = backend.createGraphicsDeviceManager(gameLifetime.Handle);
    const managerLifetime = new NativeResourceLifetime({
      Handle: managerHandle,
      Ownership: "owned",
      Parent: gameLifetime,
      Release: (value) => backend.destroyGraphicsDeviceManager(value),
      Label: "GraphicsDeviceManager",
    });
    try {
      const information = this.FindBestDevice(true);
      this.OnPreparingDeviceSettings(this, new PreparingDeviceSettingsEventArgs(information));
      this.#copyInformation(information);
      backend.configureGraphicsDeviceManager(managerLifetime.Handle, this.#configuration());
      backend.createManagedGraphicsDevice(managerLifetime.Handle);
      const parameters = this.#presentationParameters();
      this.#backend = backend;
      this.#managerLifetime = managerLifetime;
      this.#graphicsDevice = createGraphicsDeviceForInternalUse({
        Backend: backend,
        ResolveHandle: () => backend.borrowGraphicsDevice(managerLifetime.Handle),
        ParentLifetime: gameLifetime,
        Adapter: null,
        GraphicsProfile: this.#graphicsProfile,
        PresentationParameters: parameters,
        DisplayMode: null,
      });
      this.OnDeviceCreated(this, EventArgs.Empty);
    } catch (error) {
      managerLifetime.Dispose();
      throw error;
    }
  }

  public EndDraw(): void {
    this.#ensureUsable();
    if (!this.#managerLifetime || !this.#backend) throw new InvalidOperationException("The graphics device has not been created");
    this.#backend.endGraphicsDeviceManagerDraw(this.#managerLifetime.Handle);
  }

  public Dispose(): void {
    if (this.#disposed) return;
    if (this.#graphicsDevice && !this.#graphicsDevice.IsDisposed) {
      this.OnDeviceDisposing(this, EventArgs.Empty);
      this.#graphicsDevice.Dispose();
    }
    this.#managerLifetime?.Dispose();
    this.#managerLifetime = null;
    this.#backend = null;
    this.#disposed = true;
    unregisterGraphicsDeviceManagerForInternalUse(this.#game, this);
    if (this.#game.Services.GetService(GraphicsDeviceManager) === this) {
      this.#game.Services.RemoveService(GraphicsDeviceManager);
    }
    this.#disposedEvent.Dispatch(this, EventArgs.Empty);
  }

  protected CanResetDevice(newDeviceInfo: GraphicsDeviceInformation): boolean {
    if (newDeviceInfo == null) throw new ArgumentNullException("newDeviceInfo");
    return this.#graphicsDevice != null && !this.#graphicsDevice.IsDisposed &&
      this.#graphicsDevice.GraphicsProfile === newDeviceInfo.GraphicsProfile;
  }

  protected FindBestDevice(anySuitableDevice: boolean): GraphicsDeviceInformation {
    void anySuitableDevice;
    const information = new GraphicsDeviceInformation();
    information.GraphicsProfile = this.#graphicsProfile;
    information.PresentationParameters = this.#presentationParameters();
    return information;
  }

  protected OnDeviceCreated(sender: unknown, args: EventArgs): void { this.#deviceCreated.Dispatch(sender, args); }
  protected OnDeviceDisposing(sender: unknown, args: EventArgs): void { this.#deviceDisposing.Dispatch(sender, args); }
  protected OnDeviceReset(sender: unknown, args: EventArgs): void { this.#deviceReset.Dispatch(sender, args); }
  protected OnDeviceResetting(sender: unknown, args: EventArgs): void { this.#deviceResetting.Dispatch(sender, args); }
  protected OnPreparingDeviceSettings(sender: unknown, args: PreparingDeviceSettingsEventArgs): void {
    this.#preparing.Dispatch(sender, args);
  }
  protected RankDevices(foundDevices: Array<GraphicsDeviceInformation>): void {
    if (foundDevices == null) throw new ArgumentNullException("foundDevices");
  }

  #configuration(): GraphicsManagerConfiguration {
    return {
      GraphicsProfile: this.#graphicsProfile,
      IsFullScreen: this.#isFullScreen,
      PreferMultiSampling: this.#preferMultiSampling,
      PreferredBackBufferFormat: this.#preferredBackBufferFormat,
      PreferredBackBufferHeight: this.#preferredBackBufferHeight,
      PreferredBackBufferWidth: this.#preferredBackBufferWidth,
      PreferredDepthStencilFormat: this.#preferredDepthStencilFormat,
      SupportedOrientations: this.#supportedOrientations,
      SynchronizeWithVerticalRetrace: this.#synchronizeWithVerticalRetrace,
    };
  }

  #presentationParameters(): PresentationParameters {
    const parameters = new PresentationParameters();
    parameters.BackBufferWidth = this.#preferredBackBufferWidth;
    parameters.BackBufferHeight = this.#preferredBackBufferHeight;
    parameters.BackBufferFormat = this.#preferredBackBufferFormat;
    parameters.DepthStencilFormat = this.#preferredDepthStencilFormat;
    parameters.IsFullScreen = this.#isFullScreen;
    return parameters;
  }

  #copyInformation(information: GraphicsDeviceInformation): void {
    this.#graphicsProfile = information.GraphicsProfile;
    const parameters = information.PresentationParameters;
    this.#preferredBackBufferWidth = parameters.BackBufferWidth;
    this.#preferredBackBufferHeight = parameters.BackBufferHeight;
    this.#preferredBackBufferFormat = parameters.BackBufferFormat;
    this.#preferredDepthStencilFormat = parameters.DepthStencilFormat;
    this.#isFullScreen = parameters.IsFullScreen;
    this.#supportedOrientations = parameters.DisplayOrientation;
    this.#synchronizeWithVerticalRetrace = parameters.PresentationInterval !== 3;
  }

  #ensureUsable(): void {
    if (this.#disposed) throw new InvalidOperationException("GraphicsDeviceManager is disposed");
  }
}
