import type { PlayerIndex } from "../Microsoft/Xna/Framework/PlayerIndex.js";
import type { NativeHandle } from "./ownership.js";
import type { GamePadDeadZone } from "../Microsoft/Xna/Framework/Input/Enums.js";
import type {
  GamePadCapabilities,
  GamePadState,
} from "../Microsoft/Xna/Framework/Input/GamePadValues.js";
import type { KeyboardState } from "../Microsoft/Xna/Framework/Input/KeyboardState.js";
import type { MouseState } from "../Microsoft/Xna/Framework/Input/MouseState.js";
import type { TouchCollection } from "../Microsoft/Xna/Framework/Input/Touch/TouchCollection.js";
import type {
  GestureSample,
  TouchPanelCapabilities,
} from "../Microsoft/Xna/Framework/Input/Touch/TouchValues.js";
import { NativeUnavailableError } from "./native-error.js";
import type { DisplayOrientation } from "../Microsoft/Xna/Framework/DisplayOrientation.js";
import type {
  DepthFormat,
  GraphicsProfile,
  SurfaceFormat,
} from "../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";

export type BackendKind = "unavailable" | "wasm" | "node-native";

export interface GraphicsManagerConfiguration {
  readonly GraphicsProfile: GraphicsProfile;
  readonly IsFullScreen: boolean;
  readonly PreferMultiSampling: boolean;
  readonly PreferredBackBufferFormat: SurfaceFormat;
  readonly PreferredBackBufferHeight: number;
  readonly PreferredBackBufferWidth: number;
  readonly PreferredDepthStencilFormat: DepthFormat;
  readonly SupportedOrientations: DisplayOrientation;
  readonly SynchronizeWithVerticalRetrace: boolean;
}

export interface CnaGameTimeSnapshot {
  readonly TotalGameTimeTicks: bigint;
  readonly ElapsedGameTimeTicks: bigint;
  readonly IsRunningSlowly: boolean;
}

export interface CnaGameConfiguration {
  readonly IsFixedTimeStep: boolean;
  readonly TargetElapsedTimeTicks: bigint;
}

export interface CnaGameCallbacks {
  readonly initialize: () => void;
  readonly loadContent: () => void;
  readonly beginRun: () => void;
  readonly update: (time: CnaGameTimeSnapshot) => void;
  readonly beginDraw: () => boolean;
  readonly draw: (time: CnaGameTimeSnapshot) => void;
  readonly endDraw: () => void;
  readonly endRun: () => void;
  readonly unloadContent: () => void;
  readonly exiting: () => void;
}

export interface BackendRendererInfo {
  readonly Name: string;
  readonly RendererType: number;
  readonly CapabilityFlags: bigint;
  readonly MaxTextureDimension: number;
}

export interface CnaBackend {
  readonly Kind: BackendKind;
  readonly IsAvailable: boolean;
  readonly AbiVersion: string | null;
  readonly Detail: string;

  initialize(): Promise<void>;
  updateFrameworkDispatcher(): void;
  getLastError(): string | null;
  createGame(callbacks: CnaGameCallbacks, configuration: CnaGameConfiguration): NativeHandle;
  runGame(game: NativeHandle): Promise<void>;
  runGameOneFrame(game: NativeHandle): void;
  exitGame(game: NativeHandle): void;
  destroyGame(game: NativeHandle): void;
  createGraphicsDeviceManager(game: NativeHandle): NativeHandle;
  configureGraphicsDeviceManager(
    manager: NativeHandle,
    configuration: GraphicsManagerConfiguration,
  ): void;
  applyGraphicsDeviceManagerChanges(manager: NativeHandle): void;
  toggleGraphicsDeviceManagerFullScreen(manager: NativeHandle): void;
  createManagedGraphicsDevice(manager: NativeHandle): void;
  beginGraphicsDeviceManagerDraw(manager: NativeHandle): boolean;
  endGraphicsDeviceManagerDraw(manager: NativeHandle): void;
  destroyGraphicsDeviceManager(manager: NativeHandle): void;
  borrowGraphicsDevice(manager: NativeHandle): NativeHandle;
  clearGraphicsDevice(device: NativeHandle, packedColor: number): void;
  presentGraphicsDevice(device: NativeHandle): void;
  getRendererInfo(device: NativeHandle): BackendRendererInfo;
  createTexture2D(
    device: NativeHandle,
    width: number,
    height: number,
    mipMap: boolean,
    surfaceFormat: number,
  ): NativeHandle;
  destroyTexture2D(texture: NativeHandle): void;
  createSpriteBatch(device: NativeHandle): NativeHandle;
  destroySpriteBatch(spriteBatch: NativeHandle): void;

  getKeyboardState(playerIndex: PlayerIndex | null): KeyboardState;
  getMouseState(): MouseState;
  setMousePosition(x: number, y: number): void;
  readonly mouseWindowHandle: bigint;
  setMouseWindowHandle(value: bigint): void;
  getGamePadState(playerIndex: PlayerIndex, deadZoneMode: GamePadDeadZone): GamePadState;
  getGamePadCapabilities(playerIndex: PlayerIndex): GamePadCapabilities;
  setGamePadVibration(playerIndex: PlayerIndex, leftMotor: number, rightMotor: number): boolean;
  getTouchState(): TouchCollection;
  getTouchCapabilities(): TouchPanelCapabilities;
  isGestureAvailable(): boolean;
  readGesture(): GestureSample;
  readonly touchWindowHandle: bigint;
  setTouchWindowHandle(value: bigint): void;
}

class UnavailableBackend implements CnaBackend {
  public readonly Kind = "unavailable";
  public readonly IsAvailable = false;
  public readonly AbiVersion = null;
  public readonly Detail =
    "CNA publishes experimental C ABI 0.7.0 headers, but this package has no loaded WebAssembly or Node backend artifact";

  public initialize(): Promise<void> { return Promise.reject(this.error()); }
  public updateFrameworkDispatcher(): void { this.fail(); }
  public getLastError(): string | null { return this.Detail; }
  public createGame(_callbacks: CnaGameCallbacks, _configuration: CnaGameConfiguration): NativeHandle {
    return this.fail();
  }
  public runGame(_game: NativeHandle): Promise<void> { return Promise.reject(this.error()); }
  public runGameOneFrame(_game: NativeHandle): void { this.fail(); }
  public exitGame(_game: NativeHandle): void { this.fail(); }
  public destroyGame(_game: NativeHandle): void { this.fail(); }
  public createGraphicsDeviceManager(_game: NativeHandle): NativeHandle { return this.fail(); }
  public configureGraphicsDeviceManager(
    _manager: NativeHandle,
    _configuration: GraphicsManagerConfiguration,
  ): void { this.fail(); }
  public applyGraphicsDeviceManagerChanges(_manager: NativeHandle): void { this.fail(); }
  public toggleGraphicsDeviceManagerFullScreen(_manager: NativeHandle): void { this.fail(); }
  public createManagedGraphicsDevice(_manager: NativeHandle): void { this.fail(); }
  public beginGraphicsDeviceManagerDraw(_manager: NativeHandle): boolean { return this.fail(); }
  public endGraphicsDeviceManagerDraw(_manager: NativeHandle): void { this.fail(); }
  public destroyGraphicsDeviceManager(_manager: NativeHandle): void { this.fail(); }
  public borrowGraphicsDevice(_manager: NativeHandle): NativeHandle { return this.fail(); }
  public clearGraphicsDevice(_device: NativeHandle, _packedColor: number): void { this.fail(); }
  public presentGraphicsDevice(_device: NativeHandle): void { this.fail(); }
  public getRendererInfo(_device: NativeHandle): BackendRendererInfo { return this.fail(); }
  public createTexture2D(
    _device: NativeHandle,
    _width: number,
    _height: number,
    _mipMap: boolean,
    _surfaceFormat: number,
  ): NativeHandle { return this.fail(); }
  public destroyTexture2D(_texture: NativeHandle): void { this.fail(); }
  public createSpriteBatch(_device: NativeHandle): NativeHandle { return this.fail(); }
  public destroySpriteBatch(_spriteBatch: NativeHandle): void { this.fail(); }

  public getKeyboardState(_playerIndex: PlayerIndex | null): KeyboardState { return this.fail(); }
  public getMouseState(): MouseState { return this.fail(); }
  public setMousePosition(_x: number, _y: number): void { this.fail(); }
  public get mouseWindowHandle(): bigint { return this.fail(); }
  public setMouseWindowHandle(_value: bigint): void { this.fail(); }
  public getGamePadState(_playerIndex: PlayerIndex, _deadZoneMode: GamePadDeadZone): GamePadState {
    return this.fail();
  }
  public getGamePadCapabilities(_playerIndex: PlayerIndex): GamePadCapabilities { return this.fail(); }
  public setGamePadVibration(
    _playerIndex: PlayerIndex,
    _leftMotor: number,
    _rightMotor: number,
  ): boolean { return this.fail(); }
  public getTouchState(): TouchCollection { return this.fail(); }
  public getTouchCapabilities(): TouchPanelCapabilities { return this.fail(); }
  public isGestureAvailable(): boolean { return this.fail(); }
  public readGesture(): GestureSample { return this.fail(); }
  public get touchWindowHandle(): bigint { return this.fail(); }
  public setTouchWindowHandle(_value: bigint): void { this.fail(); }

  private error(): NativeUnavailableError { return new NativeUnavailableError(this.Detail); }
  private fail(): never { throw this.error(); }
}

let activeBackend: CnaBackend = new UnavailableBackend();

export function getBackend(): CnaBackend {
  return activeBackend;
}

export function setBackendForInternalUse(backend: CnaBackend): void {
  activeBackend = backend;
}
