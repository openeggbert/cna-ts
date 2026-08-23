import type { PlayerIndex } from "../Microsoft/Xna/Framework/PlayerIndex.js";
import type { NativeHandle } from "./ownership.js";
import type { NativeResourceLifetime } from "./ownership.js";
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

export interface Texture2DInfo {
  readonly Width: number;
  readonly Height: number;
  readonly LevelCount: number;
  readonly Format: number;
}

export interface Texture2DTransfer {
  readonly DataType: number;
  readonly ElementSize: number;
  readonly Level: number;
  readonly Rectangle: {
    readonly X: number;
    readonly Y: number;
    readonly Width: number;
    readonly Height: number;
  } | null;
  readonly StartIndex: number;
  readonly ElementCount: number;
  readonly Capacity: number;
}

export interface SpriteBatchCommand {
  readonly Texture: NativeHandle;
  readonly PositionX: number;
  readonly PositionY: number;
  readonly SourceX: number;
  readonly SourceY: number;
  readonly SourceWidth: number;
  readonly SourceHeight: number;
  readonly ColorR: number;
  readonly ColorG: number;
  readonly ColorB: number;
  readonly ColorA: number;
  readonly Rotation: number;
  readonly OriginX: number;
  readonly OriginY: number;
  readonly ScaleX: number;
  readonly ScaleY: number;
  readonly Effects: number;
  readonly LayerDepth: number;
}

export interface VertexElementSnapshot {
  readonly Offset: number;
  readonly VertexElementFormat: number;
  readonly VertexElementUsage: number;
  readonly UsageIndex: number;
}

export interface AudioVectorSnapshot {
  readonly X: number;
  readonly Y: number;
  readonly Z: number;
}

export interface AudioListenerSnapshot {
  readonly Forward: AudioVectorSnapshot;
  readonly Position: AudioVectorSnapshot;
  readonly Up: AudioVectorSnapshot;
  readonly Velocity: AudioVectorSnapshot;
}

export interface AudioEmitterSnapshot extends AudioListenerSnapshot {
  readonly DopplerScale: number;
}

export interface SoundEffectInstanceSnapshot {
  readonly State: number;
  readonly IsLooped: boolean;
  readonly Volume: number;
  readonly Pitch: number;
  readonly Pan: number;
}

export interface MicrophoneSnapshot {
  readonly Index: number;
  readonly Name: string;
  readonly IsHeadset: boolean;
  readonly SampleRate: number;
  readonly State: number;
  readonly BufferDurationTicks: bigint;
  readonly IsDefault: boolean;
}

export interface RendererDetailSnapshot {
  readonly FriendlyName: string;
  readonly RendererId: string;
}

export interface CueSnapshot {
  readonly IsCreated: boolean;
  readonly IsDisposed: boolean;
  readonly IsPaused: boolean;
  readonly IsPlaying: boolean;
  readonly IsPrepared: boolean;
  readonly IsPreparing: boolean;
  readonly IsStopped: boolean;
  readonly IsStopping: boolean;
}

/** Optional typed CNA XACT slice. Authored-bank success still requires legal XGS/XSB/XWB assets. */
export interface CnaXactBackend {
  readonly ParentLifetime: NativeResourceLifetime;
  createAudioEngine(settingsFile: string, lookAheadTicks?: bigint, rendererId?: string): NativeHandle;
  destroyAudioEngine(engine: NativeHandle): void;
  getAudioEngineIsDisposed(engine: NativeHandle): boolean;
  getAudioEngineRendererDetails(engine: NativeHandle): readonly RendererDetailSnapshot[];
  getAudioEngineGlobalVariable(engine: NativeHandle, name: string): number;
  setAudioEngineGlobalVariable(engine: NativeHandle, name: string, value: number): void;
  updateAudioEngine(engine: NativeHandle): void;
  getAudioCategory(engine: NativeHandle, name: string): NativeHandle;
  destroyAudioCategory(category: NativeHandle): void;
  getAudioCategoryName(category: NativeHandle): string;
  pauseAudioCategory(category: NativeHandle): void;
  resumeAudioCategory(category: NativeHandle): void;
  setAudioCategoryVolume(category: NativeHandle, value: number): void;
  stopAudioCategory(category: NativeHandle, options: number): void;
  audioCategoriesEqual(left: NativeHandle, right: NativeHandle): boolean;
  getAudioCategoryHashCode(category: NativeHandle): number;
  createSoundBank(engine: NativeHandle, filename: string): NativeHandle;
  destroySoundBank(bank: NativeHandle): void;
  getSoundBankIsDisposed(bank: NativeHandle): boolean;
  getSoundBankIsInUse(bank: NativeHandle): boolean;
  getCue(bank: NativeHandle, name: string): NativeHandle;
  playCue(bank: NativeHandle, name: string): void;
  playCue3D(
    bank: NativeHandle,
    name: string,
    listener: AudioListenerSnapshot,
    emitter: AudioEmitterSnapshot,
  ): void;
  createWaveBank(engine: NativeHandle, filename: string): NativeHandle;
  createStreamingWaveBank(
    engine: NativeHandle,
    filename: string,
    offset: number,
    packetSize: number,
  ): NativeHandle;
  destroyWaveBank(bank: NativeHandle): void;
  getWaveBankIsDisposed(bank: NativeHandle): boolean;
  getWaveBankIsInUse(bank: NativeHandle): boolean;
  getWaveBankIsPrepared(bank: NativeHandle): boolean;
  destroyCue(cue: NativeHandle): void;
  getCueInfo(cue: NativeHandle): CueSnapshot;
  getCueName(cue: NativeHandle): string;
  applyCue3D(cue: NativeHandle, listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot): void;
  getCueVariable(cue: NativeHandle, name: string): number;
  setCueVariable(cue: NativeHandle, name: string, value: number): void;
  playCueHandle(cue: NativeHandle): void;
  pauseCue(cue: NativeHandle): void;
  resumeCue(cue: NativeHandle): void;
  stopCue(cue: NativeHandle, options: number): void;
}

export interface MediaSourceSnapshot {
  readonly Index: number;
  readonly Name: string;
  readonly Type: number;
}

export interface MediaSongPlaybackSnapshot {
  readonly Name: string;
  readonly Uri: string;
}

/** Optional typed process-global media-player slice. */
export interface CnaMediaBackend {
  getAvailableMediaSources(): readonly MediaSourceSnapshot[];
  playSongs(songs: readonly MediaSongPlaybackSnapshot[], index: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  moveNext(): void;
  movePrevious(): void;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  setRepeating(value: boolean): void;
  setShuffled(value: boolean): void;
  setVisualizationEnabled(value: boolean): void;
  getGameHasControl(): boolean;
  getPlayPositionTicks(): bigint;
  getVisualizationData(): {
    readonly Frequencies: readonly number[];
    readonly Samples: readonly number[];
  };
  update(): void;
}

export interface VideoPlayerSnapshot {
  readonly State: number;
  readonly PlayPositionTicks: bigint;
}

/** Optional typed video-player slice. Frame textures remain player-owned transient aliases. */
export interface CnaVideoBackend {
  readonly ParentLifetime: NativeResourceLifetime;
  createVideoPlayer(): NativeHandle;
  destroyVideoPlayer(player: NativeHandle): void;
  getVideoPlayerInfo(player: NativeHandle): VideoPlayerSnapshot;
  setVideoPlayerLooped(player: NativeHandle, value: boolean): void;
  setVideoPlayerMuted(player: NativeHandle, value: boolean): void;
  setVideoPlayerVolume(player: NativeHandle, value: number): void;
  playVideo(player: NativeHandle, video: NativeHandle): void;
  pauseVideo(player: NativeHandle): void;
  resumeVideo(player: NativeHandle): void;
  stopVideo(player: NativeHandle): void;
}

export interface StorageDeviceSnapshot {
  readonly IsConnected: boolean;
  readonly FreeSpace: bigint;
  readonly TotalSpace: bigint;
}

/** Optional typed CNA storage slice. Paths remain private to the storage backend. */
export interface CnaStorageBackend {
  readonly ParentLifetime: NativeResourceLifetime;
  selectStorageDevice(player: number | null, sizeInBytes: number | null, directoryCount: number | null): NativeHandle;
  destroyStorageDevice(device: NativeHandle): void;
  getStorageDeviceInfo(device: NativeHandle): StorageDeviceSnapshot;
  deleteStorageContainer(device: NativeHandle, name: string): void;
  openStorageContainer(device: NativeHandle, name: string): NativeHandle;
  destroyStorageContainer(container: NativeHandle): void;
  getStorageContainerDisplayName(container: NativeHandle): string;
  createStorageDirectory(container: NativeHandle, path: string): void;
  storageDirectoryExists(container: NativeHandle, path: string): boolean;
  deleteStorageDirectory(container: NativeHandle, path: string): void;
  getStorageDirectoryNames(container: NativeHandle, pattern: string): readonly string[];
  createStorageFile(container: NativeHandle, path: string): void;
  storageFileExists(container: NativeHandle, path: string): boolean;
  deleteStorageFile(container: NativeHandle, path: string): void;
  getStorageFileNames(container: NativeHandle, pattern: string): readonly string[];
  openStorageFile(
    container: NativeHandle, path: string, mode: number, access: number, share: number,
  ): Uint8Array;
}

/** Optional typed CNA audio slice. Absence means the loaded backend cannot execute audio. */
export interface CnaAudioBackend {
  readonly ParentLifetime: NativeResourceLifetime;
  createSoundEffect(
    pcmBytes: Uint8Array,
    offset: number,
    count: number,
    sampleRate: number,
    channels: number,
    loopStart: number,
    loopLength: number,
  ): NativeHandle;
  createSoundEffectFromEncoded(encoded: Uint8Array): NativeHandle;
  getSoundEffectDurationTicks(soundEffect: NativeHandle): bigint;
  getSoundEffectName(soundEffect: NativeHandle): string;
  setSoundEffectName(soundEffect: NativeHandle, value: string): void;
  createSoundEffectInstance(soundEffect: NativeHandle): NativeHandle;
  playSoundEffect(soundEffect: NativeHandle, volume: number, pitch: number, pan: number): boolean;
  destroySoundEffect(soundEffect: NativeHandle): void;
  getMasterVolume(): number;
  setMasterVolume(value: number): void;
  getDistanceScale(): number;
  setDistanceScale(value: number): void;
  getDopplerScale(): number;
  setDopplerScale(value: number): void;
  getSpeedOfSound(): number;
  setSpeedOfSound(value: number): void;
  playSoundEffectInstance(instance: NativeHandle): void;
  pauseSoundEffectInstance(instance: NativeHandle): void;
  resumeSoundEffectInstance(instance: NativeHandle): void;
  stopSoundEffectInstance(instance: NativeHandle, immediate: boolean): void;
  getSoundEffectInstanceInfo(instance: NativeHandle): SoundEffectInstanceSnapshot;
  setSoundEffectInstanceVolume(instance: NativeHandle, value: number): void;
  setSoundEffectInstancePitch(instance: NativeHandle, value: number): void;
  setSoundEffectInstancePan(instance: NativeHandle, value: number): void;
  setSoundEffectInstanceLooped(instance: NativeHandle, value: boolean): void;
  applySoundEffectInstance3D(
    instance: NativeHandle,
    listeners: readonly AudioListenerSnapshot[],
    emitter: AudioEmitterSnapshot,
  ): void;
  destroySoundEffectInstance(instance: NativeHandle): void;
  createDynamicSoundEffectInstance(sampleRate: number, channels: number): NativeHandle;
  getDynamicPendingBufferCount(instance: NativeHandle): number;
  submitDynamicBuffer(instance: NativeHandle, buffer: Uint8Array, offset: number, count: number): void;
  getMicrophones?(): readonly MicrophoneSnapshot[];
  setMicrophoneBufferDurationTicks?(index: number, ticks: bigint): void;
  startMicrophone?(index: number): void;
  stopMicrophone?(index: number): void;
  getMicrophoneData?(index: number, count: number): Uint8Array;
}

export interface CnaBackend {
  readonly Kind: BackendKind;
  readonly IsAvailable: boolean;
  readonly AbiVersion: string | null;
  readonly Detail: string;
  readonly Audio?: CnaAudioBackend;
  readonly Xact?: CnaXactBackend;
  readonly Media?: CnaMediaBackend;
  readonly Video?: CnaVideoBackend;
  readonly Storage?: CnaStorageBackend;

  initialize(): Promise<void>;
  bindGameLifetimeForInternalUse?(lifetime: NativeResourceLifetime | null): void;
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
  getTexture2DInfo(texture: NativeHandle): Texture2DInfo;
  createTexture2DFromEncodedMemory(
    device: NativeHandle,
    encoded: Uint8Array,
    decode: { readonly Width: number; readonly Height: number; readonly Zoom: boolean } | null,
  ): NativeHandle;
  setTexture2DData(texture: NativeHandle, transfer: Texture2DTransfer, bytes: Uint8Array): void;
  getTexture2DData(texture: NativeHandle, transfer: Texture2DTransfer): Uint8Array;
  encodeTexture2D(
    texture: NativeHandle,
    imageFormat: number,
    width: number,
    height: number,
  ): Uint8Array;
  destroyTexture2D(texture: NativeHandle): void;
  createSpriteBatch(device: NativeHandle): NativeHandle;
  beginSpriteBatch(spriteBatch: NativeHandle, sortMode: number): void;
  submitSpriteBatch(spriteBatch: NativeHandle, commands: readonly SpriteBatchCommand[]): void;
  endSpriteBatch(spriteBatch: NativeHandle): void;
  destroySpriteBatch(spriteBatch: NativeHandle): void;
  createVertexBuffer(
    device: NativeHandle, vertexStride: number, elements: readonly VertexElementSnapshot[],
    vertexCount: number, usage: number, dynamic: boolean,
  ): NativeHandle;
  setVertexBufferRaw(buffer: NativeHandle, bytes: Uint8Array, vertexCount: number, vertexStride: number): void;
  getVertexBufferRaw(buffer: NativeHandle, vertexCount: number, vertexStride: number): Uint8Array;
  destroyVertexBuffer(buffer: NativeHandle): void;
  createIndexBuffer(
    device: NativeHandle, elementSize: number, indexCount: number, usage: number, dynamic: boolean,
  ): NativeHandle;
  setIndexBufferRaw(buffer: NativeHandle, elementSize: number, bytes: Uint8Array): void;
  getIndexBufferRaw(buffer: NativeHandle, elementSize: number, indexCount: number): Uint8Array;
  destroyIndexBuffer(buffer: NativeHandle): void;

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
  public getTexture2DInfo(_texture: NativeHandle): Texture2DInfo { return this.fail(); }
  public createTexture2DFromEncodedMemory(
    _device: NativeHandle,
    _encoded: Uint8Array,
    _decode: { readonly Width: number; readonly Height: number; readonly Zoom: boolean } | null,
  ): NativeHandle { return this.fail(); }
  public setTexture2DData(
    _texture: NativeHandle,
    _transfer: Texture2DTransfer,
    _bytes: Uint8Array,
  ): void { this.fail(); }
  public getTexture2DData(
    _texture: NativeHandle,
    _transfer: Texture2DTransfer,
  ): Uint8Array { return this.fail(); }
  public encodeTexture2D(
    _texture: NativeHandle,
    _imageFormat: number,
    _width: number,
    _height: number,
  ): Uint8Array { return this.fail(); }
  public destroyTexture2D(_texture: NativeHandle): void { this.fail(); }
  public createSpriteBatch(_device: NativeHandle): NativeHandle { return this.fail(); }
  public beginSpriteBatch(_spriteBatch: NativeHandle, _sortMode: number): void { this.fail(); }
  public submitSpriteBatch(
    _spriteBatch: NativeHandle,
    _commands: readonly SpriteBatchCommand[],
  ): void { this.fail(); }
  public endSpriteBatch(_spriteBatch: NativeHandle): void { this.fail(); }
  public destroySpriteBatch(_spriteBatch: NativeHandle): void { this.fail(); }
  public createVertexBuffer(
    _device: NativeHandle, _vertexStride: number, _elements: readonly VertexElementSnapshot[],
    _vertexCount: number, _usage: number, _dynamic: boolean,
  ): NativeHandle { return this.fail(); }
  public setVertexBufferRaw(
    _buffer: NativeHandle, _bytes: Uint8Array, _vertexCount: number, _vertexStride: number,
  ): void { this.fail(); }
  public getVertexBufferRaw(
    _buffer: NativeHandle, _vertexCount: number, _vertexStride: number,
  ): Uint8Array { return this.fail(); }
  public destroyVertexBuffer(_buffer: NativeHandle): void { this.fail(); }
  public createIndexBuffer(
    _device: NativeHandle, _elementSize: number, _indexCount: number,
    _usage: number, _dynamic: boolean,
  ): NativeHandle { return this.fail(); }
  public setIndexBufferRaw(
    _buffer: NativeHandle, _elementSize: number, _bytes: Uint8Array,
  ): void { this.fail(); }
  public getIndexBufferRaw(
    _buffer: NativeHandle, _elementSize: number, _indexCount: number,
  ): Uint8Array { return this.fail(); }
  public destroyIndexBuffer(_buffer: NativeHandle): void { this.fail(); }

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
