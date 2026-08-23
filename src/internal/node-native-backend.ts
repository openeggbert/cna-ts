import type {
  CnaBackend,
  BackendRendererInfo,
  CnaGameCallbacks,
  CnaGameConfiguration,
  GraphicsManagerConfiguration,
} from "./backend.js";
import { NativeUnavailableError } from "./native-error.js";
import type { NativeHandle } from "./ownership.js";
import type { PlayerIndex } from "../Microsoft/Xna/Framework/PlayerIndex.js";
import { ButtonState, type GamePadDeadZone, type Keys } from "../Microsoft/Xna/Framework/Input/Enums.js";
import {
  createGamePadCapabilities,
  createGamePadState,
  type GamePadCapabilities,
  type GamePadState,
} from "../Microsoft/Xna/Framework/Input/GamePadValues.js";
import { KeyboardState } from "../Microsoft/Xna/Framework/Input/KeyboardState.js";
import { MouseState } from "../Microsoft/Xna/Framework/Input/MouseState.js";
import { TimeSpan } from "../Microsoft/Xna/Framework/TimeSpan.js";
import { Vector2 } from "../Microsoft/Xna/Framework/Vector2.js";
import {
  createTouchCollection,
  type TouchCollection,
} from "../Microsoft/Xna/Framework/Input/Touch/TouchCollection.js";
import { TouchLocationState } from "../Microsoft/Xna/Framework/Input/Touch/Enums.js";
import {
  createTouchPanelCapabilities,
  GestureSample,
  TouchLocation,
  type TouchPanelCapabilities,
} from "../Microsoft/Xna/Framework/Input/Touch/TouchValues.js";

interface NativeMouseState {
  readonly X: number; readonly Y: number; readonly ScrollWheelValue: number;
  readonly LeftButton: number; readonly MiddleButton: number; readonly RightButton: number;
  readonly XButton1: number; readonly XButton2: number;
}
interface NativeTouchLocation {
  readonly Id: number; readonly State: number; readonly X: number; readonly Y: number;
  readonly PreviousState: number; readonly PreviousX: number; readonly PreviousY: number;
}
interface NativeTouchState { readonly IsConnected: boolean; readonly Touches: NativeTouchLocation[]; }
interface NativeGestureSample {
  readonly GestureType: number; readonly TimestampTicks: bigint;
  readonly PositionX: number; readonly PositionY: number; readonly Position2X: number; readonly Position2Y: number;
  readonly DeltaX: number; readonly DeltaY: number; readonly Delta2X: number; readonly Delta2Y: number;
}

interface NativeBridge {
  loadLibrary(path: string): void;
  abiVersion(): number;
  importedSymbolCount(): number;
  getLastError(): string | null;
  createGame(fixedTimeStep: boolean, targetElapsedTicks: bigint, callbacks: CnaGameCallbacks): bigint;
  runGame(game: bigint): void;
  runGameOneFrame(game: bigint): void;
  requestExit(game: bigint): void;
  destroyGame(game: bigint): void;
  updateFrameworkDispatcher(game: bigint): void;
  createGraphicsDeviceManager(game: bigint): bigint;
  configureGraphicsDeviceManager(manager: bigint, configuration: GraphicsManagerConfiguration): void;
  applyGraphicsDeviceManagerChanges(manager: bigint): void;
  toggleGraphicsDeviceManagerFullScreen(manager: bigint): void;
  createManagedGraphicsDevice(manager: bigint): void;
  beginGraphicsDeviceManagerDraw(manager: bigint): boolean;
  endGraphicsDeviceManagerDraw(manager: bigint): void;
  destroyGraphicsDeviceManager(manager: bigint): void;
  borrowGraphicsDevice(manager: bigint): bigint;
  clearGraphicsDevice(device: bigint, packedColor: number): void;
  presentGraphicsDevice(device: bigint): void;
  getRendererInfo(device: bigint): BackendRendererInfo;
  createTexture2D(device: bigint, width: number, height: number, mipMap: boolean, format: number): bigint;
  destroyTexture2D(texture: bigint): void;
  createSpriteBatch(device: bigint): bigint;
  destroySpriteBatch(spriteBatch: bigint): void;
  getKeyboardState(game: bigint): number[];
  getMouseState(game: bigint): NativeMouseState;
  setMousePosition(game: bigint, x: number, y: number): void;
  getMouseWindowHandle(game: bigint): bigint;
  setMouseWindowHandle(game: bigint, value: bigint): void;
  getGamePadState(game: bigint, playerIndex: number, deadZoneMode: number): Parameters<typeof createGamePadState>[0];
  getGamePadCapabilities(game: bigint, playerIndex: number): Parameters<typeof createGamePadCapabilities>[0];
  setGamePadVibration(game: bigint, playerIndex: number, leftMotor: number, rightMotor: number): boolean;
  getTouchState(game: bigint): NativeTouchState;
  getTouchCapabilities(game: bigint): Parameters<typeof createTouchPanelCapabilities>[0];
  isGestureAvailable(game: bigint): boolean;
  readGesture(game: bigint): NativeGestureSample;
  getTouchWindowHandle(game: bigint): bigint;
  setTouchWindowHandle(game: bigint, value: bigint): void;
}

export class NodeNativeBackend implements CnaBackend {
  public readonly Kind = "node-native";
  public readonly IsAvailable = true;
  public readonly AbiVersion = "0.7.0";
  public readonly Detail: string;
  public readonly ImportedSymbolCount: number;
  public RendererInfo: BackendRendererInfo | null = null;
  readonly #bridge: NativeBridge;
  #activeGame: NativeHandle | null = null;

  public constructor(bridge: NativeBridge, libraryPath: string) {
    bridge.loadLibrary(libraryPath);
    const encodedVersion = bridge.abiVersion();
    if (encodedVersion !== 0x0000_0700) {
      throw new NativeUnavailableError(
        `CNA library reported incompatible ABI 0x${encodedVersion.toString(16).padStart(8, "0")}`,
      );
    }
    this.#bridge = bridge;
    this.ImportedSymbolCount = bridge.importedSymbolCount();
    this.Detail = `CNA ABI 0.7.0 loaded through the Node-API bridge (${this.ImportedSymbolCount} symbols)`;
  }

  public initialize(): Promise<void> { return Promise.resolve(); }
  public updateFrameworkDispatcher(): void {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("FrameworkDispatcher.Update requires an active native Game");
    }
    this.#bridge.updateFrameworkDispatcher(this.#activeGame);
  }
  public getLastError(): string | null { return this.#bridge.getLastError(); }
  public createGame(callbacks: CnaGameCallbacks, configuration: CnaGameConfiguration): NativeHandle {
    const handle = this.#bridge.createGame(
      configuration.IsFixedTimeStep,
      configuration.TargetElapsedTimeTicks,
      callbacks,
    );
    this.#activeGame = handle;
    return handle;
  }
  public async runGame(game: NativeHandle): Promise<void> { this.#bridge.runGame(game); }
  public runGameOneFrame(game: NativeHandle): void { this.#bridge.runGameOneFrame(game); }
  public exitGame(game: NativeHandle): void { this.#bridge.requestExit(game); }
  public destroyGame(game: NativeHandle): void {
    this.#bridge.destroyGame(game);
    if (this.#activeGame === game) this.#activeGame = null;
  }
  public createGraphicsDeviceManager(game: NativeHandle): NativeHandle {
    return this.#bridge.createGraphicsDeviceManager(game);
  }
  public configureGraphicsDeviceManager(
    manager: NativeHandle,
    configuration: GraphicsManagerConfiguration,
  ): void { this.#bridge.configureGraphicsDeviceManager(manager, configuration); }
  public applyGraphicsDeviceManagerChanges(manager: NativeHandle): void {
    this.#bridge.applyGraphicsDeviceManagerChanges(manager);
  }
  public toggleGraphicsDeviceManagerFullScreen(manager: NativeHandle): void {
    this.#bridge.toggleGraphicsDeviceManagerFullScreen(manager);
  }
  public createManagedGraphicsDevice(manager: NativeHandle): void {
    this.#bridge.createManagedGraphicsDevice(manager);
  }
  public beginGraphicsDeviceManagerDraw(manager: NativeHandle): boolean {
    return this.#bridge.beginGraphicsDeviceManagerDraw(manager);
  }
  public endGraphicsDeviceManagerDraw(manager: NativeHandle): void {
    this.#bridge.endGraphicsDeviceManagerDraw(manager);
  }
  public destroyGraphicsDeviceManager(manager: NativeHandle): void {
    this.#bridge.destroyGraphicsDeviceManager(manager);
  }
  public borrowGraphicsDevice(manager: NativeHandle): NativeHandle {
    const device = this.#bridge.borrowGraphicsDevice(manager);
    this.RendererInfo ??= Object.freeze(this.#bridge.getRendererInfo(device));
    return device;
  }
  public clearGraphicsDevice(device: NativeHandle, packedColor: number): void {
    this.#bridge.clearGraphicsDevice(device, packedColor);
  }
  public presentGraphicsDevice(device: NativeHandle): void {
    this.#bridge.presentGraphicsDevice(device);
  }
  public getRendererInfo(device: NativeHandle): BackendRendererInfo {
    const information = Object.freeze(this.#bridge.getRendererInfo(device));
    this.RendererInfo = information;
    return information;
  }
  public createTexture2D(
    device: NativeHandle,
    width: number,
    height: number,
    mipMap: boolean,
    surfaceFormat: number,
  ): NativeHandle {
    return this.#bridge.createTexture2D(device, width, height, mipMap, surfaceFormat);
  }
  public destroyTexture2D(texture: NativeHandle): void { this.#bridge.destroyTexture2D(texture); }
  public createSpriteBatch(device: NativeHandle): NativeHandle {
    return this.#bridge.createSpriteBatch(device);
  }
  public destroySpriteBatch(spriteBatch: NativeHandle): void {
    this.#bridge.destroySpriteBatch(spriteBatch);
  }

  public getKeyboardState(_playerIndex: PlayerIndex | null): KeyboardState {
    return new KeyboardState(this.#bridge.getKeyboardState(this.#game()) as Keys[]);
  }
  public getMouseState(): MouseState {
    const state = this.#bridge.getMouseState(this.#game());
    return new MouseState(
      state.X, state.Y, state.ScrollWheelValue,
      state.LeftButton as ButtonState, state.MiddleButton as ButtonState,
      state.RightButton as ButtonState, state.XButton1 as ButtonState, state.XButton2 as ButtonState,
    );
  }
  public setMousePosition(x: number, y: number): void {
    this.#bridge.setMousePosition(this.#game(), x, y);
  }
  public get mouseWindowHandle(): bigint { return this.#bridge.getMouseWindowHandle(this.#game()); }
  public setMouseWindowHandle(value: bigint) { this.#bridge.setMouseWindowHandle(this.#game(), value); }
  public getGamePadState(playerIndex: PlayerIndex, deadZoneMode: GamePadDeadZone): GamePadState {
    return createGamePadState(this.#bridge.getGamePadState(this.#game(), playerIndex, deadZoneMode));
  }
  public getGamePadCapabilities(playerIndex: PlayerIndex): GamePadCapabilities {
    const snapshot = this.#bridge.getGamePadCapabilities(this.#game(), playerIndex);
    return createGamePadCapabilities({
      ...snapshot,
      GamePadType: snapshot.GamePadType === 9 ? 0x300 : snapshot.GamePadType,
    });
  }
  public setGamePadVibration(
    _playerIndex: PlayerIndex,
    _leftMotor: number,
    _rightMotor: number,
  ): boolean {
    return this.#bridge.setGamePadVibration(this.#game(), _playerIndex, _leftMotor, _rightMotor);
  }
  public getTouchState(): TouchCollection {
    const state = this.#bridge.getTouchState(this.#game());
    const touches = state.Touches.map((value) => new TouchLocation(
      value.Id,
      value.State as TouchLocationState,
      new Vector2(value.X, value.Y),
      value.PreviousState as TouchLocationState,
      new Vector2(value.PreviousX, value.PreviousY),
    ));
    return createTouchCollection(touches, state.IsConnected);
  }
  public getTouchCapabilities(): TouchPanelCapabilities {
    return createTouchPanelCapabilities(this.#bridge.getTouchCapabilities(this.#game()));
  }
  public isGestureAvailable(): boolean { return this.#bridge.isGestureAvailable(this.#game()); }
  public readGesture(): GestureSample {
    const value = this.#bridge.readGesture(this.#game());
    return new GestureSample(
      value.GestureType,
      TimeSpan.FromTicks(value.TimestampTicks),
      new Vector2(value.PositionX, value.PositionY),
      new Vector2(value.Position2X, value.Position2Y),
      new Vector2(value.DeltaX, value.DeltaY),
      new Vector2(value.Delta2X, value.Delta2Y),
    );
  }
  public get touchWindowHandle(): bigint { return this.#bridge.getTouchWindowHandle(this.#game()); }
  public setTouchWindowHandle(value: bigint) { this.#bridge.setTouchWindowHandle(this.#game(), value); }

  #game(): NativeHandle {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("CNA input polling requires an active native Game");
    }
    return this.#activeGame;
  }
}
