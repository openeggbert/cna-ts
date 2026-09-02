import type { CnaBackend } from "../../../internal/backend.js";
import { getBackend } from "../../../internal/backend.js";
import { EventDispatcher } from "../../../internal/events.js";
import {
  ArgumentNullException,
  InvalidOperationException,
} from "../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../internal/native-error.js";
import { pumpFrameworkServicesForInternalUse } from "../../../internal/framework-pump.js";
import { NativeResourceLifetime } from "../../../internal/ownership.js";
import type {
  IDisposable,
  XnaEvent,
  XnaEventHandler,
} from "./Contracts.js";
import { ContentManager } from "./Content/ContentManager.js";
import { EventArgs } from "./EventArgs.js";
import { GameComponentCollection } from "./GameComponentCollection.js";
import type { GameComponentCollectionEventArgs } from "./GameComponentCollectionEventArgs.js";
import { GameServiceContainer } from "./GameServiceContainer.js";
import { GameTime } from "./GameTime.js";
import { createGameWindowForInternalUse, type GameWindow } from "./GameWindow.js";
import type { GraphicsDevice } from "./Graphics/GraphicsDevice.js";
import type { GraphicsDeviceManager } from "./GraphicsDeviceManager.js";
import type { IDrawable } from "./IDrawable.js";
import type { IGameComponent } from "./IGameComponent.js";
import type { IUpdateable } from "./IUpdateable.js";
import { LaunchParameters } from "./LaunchParameters.js";
import { TimeSpan } from "./TimeSpan.js";

function hasEvent(value: unknown): value is XnaEvent<unknown, EventArgs> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { Add?: unknown; Remove?: unknown };
  return typeof candidate.Add === "function" && typeof candidate.Remove === "function";
}

function isUpdateable(value: IGameComponent): value is IGameComponent & IUpdateable {
  const candidate = value as IGameComponent & Partial<IUpdateable>;
  return typeof candidate.Update === "function" &&
    typeof candidate.Enabled === "boolean" &&
    typeof candidate.UpdateOrder === "number" &&
    hasEvent(candidate.EnabledChanged) &&
    hasEvent(candidate.UpdateOrderChanged);
}

function isDrawable(value: IGameComponent): value is IGameComponent & IDrawable {
  const candidate = value as IGameComponent & Partial<IDrawable>;
  return typeof candidate.Draw === "function" &&
    typeof candidate.Visible === "boolean" &&
    typeof candidate.DrawOrder === "number" &&
    hasEvent(candidate.VisibleChanged) &&
    hasEvent(candidate.DrawOrderChanged);
}

function isDisposable(value: IGameComponent): value is IGameComponent & IDisposable {
  return typeof (value as IGameComponent & Partial<IDisposable>).Dispose === "function";
}

type NativeGameAccess = {
  readonly Ensure: (backend: CnaBackend) => NativeResourceLifetime;
  readonly Backend: () => CnaBackend | null;
};
const nativeAccess = new WeakMap<Game, NativeGameAccess>();
const graphicsManagers = new WeakMap<Game, GraphicsDeviceManager>();

/** Managed XNA lifecycle and component pipeline with an explicit CNA execution boundary. */
export class Game implements IDisposable {
  readonly #components = new GameComponentCollection();
  readonly #services = new GameServiceContainer();
  readonly #launchParameters = new LaunchParameters();
  #content = new ContentManager(this.#services);
  readonly #updateables: IUpdateable[] = [];
  readonly #drawables: IDrawable[] = [];
  readonly #notYetInitialized: IGameComponent[] = [];
  readonly #updateOrderHandlers = new Map<IUpdateable, XnaEventHandler<unknown, EventArgs>>();
  readonly #drawOrderHandlers = new Map<IDrawable, XnaEventHandler<unknown, EventArgs>>();
  readonly #activated = new EventDispatcher<unknown, EventArgs>();
  readonly #deactivated = new EventDispatcher<unknown, EventArgs>();
  readonly #disposedEvent = new EventDispatcher<unknown, EventArgs>();
  readonly #exiting = new EventDispatcher<unknown, EventArgs>();
  #inactiveSleepTime = TimeSpan.FromMilliseconds(20);
  #targetElapsedTime = TimeSpan.FromTicks(166_667n);
  #isFixedTimeStep = true;
  #isMouseVisible = false;
  #isActive = false;
  #inRun = false;
  #deviceCreated = false;
  #initialized = false;
  #exitRequested = false;
  #exitingRaised = false;
  #suppressDraw = false;
  #disposed = false;
  #gameLifetime: NativeResourceLifetime | null = null;
  #nativeBackend: CnaBackend | null = null;
  #window: GameWindow | null = null;

  public readonly Activated: XnaEvent<unknown, EventArgs> = this.#activated;
  public readonly Deactivated: XnaEvent<unknown, EventArgs> = this.#deactivated;
  public readonly Disposed: XnaEvent<unknown, EventArgs> = this.#disposedEvent;
  public readonly Exiting: XnaEvent<unknown, EventArgs> = this.#exiting;

  public constructor() {
    this.#components.ComponentAdded.Add((_sender, args) => this.#componentAdded(args));
    this.#components.ComponentRemoved.Add((_sender, args) => this.#componentRemoved(args));
    nativeAccess.set(this, {
      Ensure: (backend) => this.#ensureNativeGame(backend),
      Backend: () => this.#nativeBackend,
    });
  }

  public get Components(): GameComponentCollection { return this.#components; }
  public get Services(): GameServiceContainer { return this.#services; }
  public get LaunchParameters(): LaunchParameters { return this.#launchParameters; }
  public get Content(): ContentManager { return this.#content; }
  public set Content(value: ContentManager) {
    if (value == null) throw new ArgumentNullException("value");
    this.#content = value;
  }
  public get Window(): GameWindow {
    this.#ensureUsable();
    if (this.#window) return this.#window;
    const backend = this.#nativeBackend ?? getBackend();
    if (!backend.Window) {
      throw new NativeUnavailableError("Game.Window requires a loaded CNA platform backend");
    }
    const lifetime = this.#ensureNativeGame(backend);
    this.#window = createGameWindowForInternalUse(backend.Window, lifetime);
    return this.#window;
  }
  public get GraphicsDevice(): GraphicsDevice {
    const manager = graphicsManagers.get(this);
    if (!manager) throw new InvalidOperationException("No graphics device manager is registered with this Game");
    return manager.GraphicsDevice;
  }

  public get InactiveSleepTime(): TimeSpan { return this.#inactiveSleepTime; }
  public set InactiveSleepTime(value: TimeSpan) {
    if (value.Ticks < 0n) throw new RangeError("InactiveSleepTime cannot be negative");
    this.#inactiveSleepTime = TimeSpan.FromTicks(value.Ticks);
  }

  public get IsActive(): boolean { return this.#isActive; }

  public get IsFixedTimeStep(): boolean { return this.#isFixedTimeStep; }
  public set IsFixedTimeStep(value: boolean) { this.#isFixedTimeStep = Boolean(value); }

  public get IsMouseVisible(): boolean { return this.#isMouseVisible; }
  public set IsMouseVisible(value: boolean) { this.#isMouseVisible = Boolean(value); }

  public get TargetElapsedTime(): TimeSpan { return this.#targetElapsedTime; }
  public set TargetElapsedTime(value: TimeSpan) {
    if (value.Ticks <= 0n) throw new RangeError("TargetElapsedTime must be positive");
    this.#targetElapsedTime = TimeSpan.FromTicks(value.Ticks);
  }

  public async Run(): Promise<void> {
    this.#ensureUsable();
    if (this.#inRun) throw new InvalidOperationException("Game is already running");
    const backend = getBackend();
    await backend.initialize();
    const lifetime = this.#ensureNativeGame(backend);
    this.#createGraphicsDeviceOnce();
    this.#inRun = true;
    try {
      if (this.#exitRequested) backend.exitGame(lifetime.Handle);
      await backend.runGame(lifetime.Handle);
      this.#raiseExiting();
    } finally {
      this.#inRun = false;
    }
  }

  public RunOneFrame(): void {
    this.#ensureUsable();
    const backend = this.#nativeBackend ?? getBackend();
    const lifetime = this.#ensureNativeGame(backend);
    // A backend whose host owns the event loop -- a browser -- never reaches Run, so the device
    // creation Run performs has to happen here too, once. Doing it on every frame would recreate a
    // live device; doing it never leaves a browser game with no GraphicsDevice at all.
    this.#createGraphicsDeviceOnce();
    backend.runGameOneFrame(lifetime.Handle);
  }

  #createGraphicsDeviceOnce(): void {
    if (this.#deviceCreated) return;
    this.#deviceCreated = true;
    graphicsManagers.get(this)?.CreateDevice();
  }

  public Tick(): void { this.RunOneFrame(); }

  public Exit(): void {
    this.#ensureUsable();
    this.#exitRequested = true;
    if (this.#gameLifetime?.State === "active" && this.#nativeBackend) {
      this.#nativeBackend.exitGame(this.#gameLifetime.Handle);
    }
  }

  public ResetElapsedTime(): void { this.#ensureUsable(); }

  public SuppressDraw(): void {
    this.#ensureUsable();
    this.#suppressDraw = true;
  }

  protected BeginDraw(): boolean { return true; }
  protected BeginRun(): void {}
  protected EndDraw(): void {}
  protected EndRun(): void {}

  protected Initialize(): void {
    while (this.#notYetInitialized.length > 0) {
      this.#notYetInitialized.shift()?.Initialize();
    }
  }

  protected LoadContent(): void {}

  protected Update(gameTime: GameTime): void {
    for (const updateable of [...this.#updateables]) {
      if (updateable.Enabled) updateable.Update(gameTime);
    }
  }

  protected Draw(gameTime: GameTime): void {
    if (this.#suppressDraw) {
      this.#suppressDraw = false;
      return;
    }
    for (const drawable of [...this.#drawables]) {
      if (drawable.Visible) drawable.Draw(gameTime);
    }
  }

  protected UnloadContent(): void {}

  protected OnActivated(sender: unknown, args: EventArgs): void {
    void sender;
    this.#activated.Dispatch(this, args);
  }

  protected OnDeactivated(sender: unknown, args: EventArgs): void {
    void sender;
    this.#deactivated.Dispatch(this, args);
  }

  protected OnExiting(sender: unknown, args: EventArgs): void {
    void sender;
    this.#exiting.Dispatch(null, args);
  }

  protected ShowMissingRequirementMessage(exception: Error): boolean {
    void exception;
    return false;
  }

  public Dispose(): void {
    if (this.#disposed) return;
    const snapshot = new Array<IGameComponent>(this.#components.Count);
    this.#components.CopyTo(snapshot, 0);
    for (const component of snapshot) {
      if (isDisposable(component)) component.Dispose();
    }
    graphicsManagers.get(this)?.Dispose();
    graphicsManagers.delete(this);
    this.#gameLifetime?.Dispose();
    this.#nativeBackend?.bindGameLifetimeForInternalUse?.(null);
    this.#gameLifetime = null;
    this.#nativeBackend = null;
    this.#window = null;
    this.#disposed = true;
    this.#disposedEvent.Dispatch(this, EventArgs.Empty);
  }

  #componentAdded(args: GameComponentCollectionEventArgs): void {
    const component = args.GameComponent;
    if (this.#inRun) component.Initialize();
    else this.#notYetInitialized.push(component);

    if (isUpdateable(component)) {
      this.#insertUpdateable(component);
      const handler: XnaEventHandler<unknown, EventArgs> = () => {
        const index = this.#updateables.indexOf(component);
        if (index >= 0) this.#updateables.splice(index, 1);
        this.#insertUpdateable(component);
      };
      this.#updateOrderHandlers.set(component, handler);
      component.UpdateOrderChanged.Add(handler);
    }
    if (isDrawable(component)) {
      this.#insertDrawable(component);
      const handler: XnaEventHandler<unknown, EventArgs> = () => {
        const index = this.#drawables.indexOf(component);
        if (index >= 0) this.#drawables.splice(index, 1);
        this.#insertDrawable(component);
      };
      this.#drawOrderHandlers.set(component, handler);
      component.DrawOrderChanged.Add(handler);
    }
  }

  #componentRemoved(args: GameComponentCollectionEventArgs): void {
    const component = args.GameComponent;
    if (!this.#inRun) {
      const pending = this.#notYetInitialized.indexOf(component);
      if (pending >= 0) this.#notYetInitialized.splice(pending, 1);
    }
    if (isUpdateable(component)) {
      const index = this.#updateables.indexOf(component);
      if (index >= 0) this.#updateables.splice(index, 1);
      const handler = this.#updateOrderHandlers.get(component);
      if (handler) component.UpdateOrderChanged.Remove(handler);
      this.#updateOrderHandlers.delete(component);
    }
    if (isDrawable(component)) {
      const index = this.#drawables.indexOf(component);
      if (index >= 0) this.#drawables.splice(index, 1);
      const handler = this.#drawOrderHandlers.get(component);
      if (handler) component.DrawOrderChanged.Remove(handler);
      this.#drawOrderHandlers.delete(component);
    }
  }

  #insertUpdateable(component: IUpdateable): void {
    let index = 0;
    while (index < this.#updateables.length && this.#updateables[index].UpdateOrder <= component.UpdateOrder) index += 1;
    this.#updateables.splice(index, 0, component);
  }

  #insertDrawable(component: IDrawable): void {
    let index = 0;
    while (index < this.#drawables.length && this.#drawables[index].DrawOrder <= component.DrawOrder) index += 1;
    this.#drawables.splice(index, 0, component);
  }

  #ensureNativeGame(backend: CnaBackend): NativeResourceLifetime {
    if (this.#gameLifetime?.State === "active") return this.#gameLifetime;
    const handle = backend.createGame({
      initialize: () => {
        if (this.#initialized) return;
        this.Initialize();
        this.#initialized = true;
      },
      loadContent: () => this.LoadContent(),
      beginRun: () => this.BeginRun(),
      update: (time) => {
        this.Update(new GameTime(
          TimeSpan.FromTicks(time.TotalGameTimeTicks),
          TimeSpan.FromTicks(time.ElapsedGameTimeTicks),
          time.IsRunningSlowly,
        ));
        // The native dispatcher is deliberately NOT pumped here. CNA's own `Game::Update` ends
        // with `FrameworkDispatcher::Update()` and the C API's game shim runs that base pass as
        // soon as this callback returns, so calling it here pumped it twice per frame. That is
        // observable, not merely wasteful: CNA ages the touch state machine inside the dispatcher
        // (an explicit deviation from FNA, whose panel is poll-driven), so a second pump advanced
        // `Pressed` to `Moved` again and `TouchLocation.TryGetPreviousLocation` could never report
        // `Pressed`. Measured in a browser: two pumps give a second frame whose previous state is
        // `Moved`, one pump gives XNA's `Pressed`.
        //
        // The managed pump stays: it delivers `BufferNeeded` from the buffer counts the *previous*
        // native pump left behind, which is one frame of latency on a queue that is hundreds of
        // milliseconds deep, and the alternative is the wrong touch semantics for every game.
        pumpFrameworkServicesForInternalUse();
      },
      beginDraw: () => this.BeginDraw(),
      draw: (time) => this.Draw(new GameTime(
        TimeSpan.FromTicks(time.TotalGameTimeTicks),
        TimeSpan.FromTicks(time.ElapsedGameTimeTicks),
        time.IsRunningSlowly,
      )),
      endDraw: () => this.EndDraw(),
      endRun: () => this.EndRun(),
      unloadContent: () => this.UnloadContent(),
      exiting: () => this.#raiseExiting(),
    }, {
      IsFixedTimeStep: this.#isFixedTimeStep,
      TargetElapsedTimeTicks: this.#targetElapsedTime.Ticks,
    });
    this.#nativeBackend = backend;
    this.#gameLifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Release: (value) => backend.destroyGame(value),
      Label: "Game",
    });
    backend.bindGameLifetimeForInternalUse?.(this.#gameLifetime);
    return this.#gameLifetime;
  }

  #raiseExiting(): void {
    if (this.#exitingRaised) return;
    this.#exitingRaised = true;
    this.OnExiting(this, EventArgs.Empty);
  }

  #ensureUsable(): void {
    if (this.#disposed) throw new InvalidOperationException("Game is already disposed");
  }
}

export function ensureNativeGameForInternalUse(
  game: Game,
  backend: CnaBackend,
): NativeResourceLifetime {
  const access = nativeAccess.get(game);
  if (!access) throw new InvalidOperationException("Invalid Game instance");
  return access.Ensure(backend);
}

export function registerGraphicsDeviceManagerForInternalUse(
  game: Game,
  manager: GraphicsDeviceManager,
): void {
  if (graphicsManagers.has(game)) {
    throw new InvalidOperationException("The Game already has a GraphicsDeviceManager");
  }
  graphicsManagers.set(game, manager);
}

export function unregisterGraphicsDeviceManagerForInternalUse(
  game: Game,
  manager: GraphicsDeviceManager,
): void {
  if (graphicsManagers.get(game) === manager) graphicsManagers.delete(game);
}
