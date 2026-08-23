import type {
  CnaBackend,
  CnaAudioBackend,
  CnaXactBackend,
  CnaMediaBackend,
  CnaVideoBackend,
  CnaStorageBackend,
  BackendRendererInfo,
  CnaGameCallbacks,
  CnaGameConfiguration,
  GraphicsManagerConfiguration,
  SpriteBatchCommand,
  Texture2DInfo,
  Texture2DTransfer,
  VertexElementSnapshot,
  AudioListenerSnapshot,
  AudioEmitterSnapshot,
  SoundEffectInstanceSnapshot,
  MicrophoneSnapshot,
  RendererDetailSnapshot,
  CueSnapshot,
  MediaSourceSnapshot,
  MediaSongPlaybackSnapshot,
  VideoPlayerSnapshot,
  StorageDeviceSnapshot,
} from "./backend.js";
import { NativeUnavailableError } from "./native-error.js";
import type { NativeHandle, NativeResourceLifetime } from "./ownership.js";
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
  getTexture2DInfo(texture: bigint): Texture2DInfo;
  createTexture2DFromEncodedMemory(
    device: bigint,
    encoded: Uint8Array,
    hasDecode: boolean,
    width: number,
    height: number,
    zoom: boolean,
  ): bigint;
  setTexture2DData(
    texture: bigint,
    dataType: number,
    level: number,
    hasRectangle: boolean,
    rectangleX: number,
    rectangleY: number,
    rectangleWidth: number,
    rectangleHeight: number,
    startIndex: number,
    elementCount: number,
    capacity: number,
    elementSize: number,
    bytes: Uint8Array,
  ): void;
  getTexture2DData(
    texture: bigint,
    dataType: number,
    level: number,
    hasRectangle: boolean,
    rectangleX: number,
    rectangleY: number,
    rectangleWidth: number,
    rectangleHeight: number,
    startIndex: number,
    elementCount: number,
    capacity: number,
    elementSize: number,
  ): Uint8Array;
  encodeTexture2D(texture: bigint, imageFormat: number, width: number, height: number): Uint8Array;
  destroyTexture2D(texture: bigint): void;
  createSpriteBatch(device: bigint): bigint;
  beginSpriteBatch(spriteBatch: bigint, sortMode: number): void;
  submitSpriteBatch(spriteBatch: bigint, commands: readonly SpriteBatchCommand[]): void;
  endSpriteBatch(spriteBatch: bigint): void;
  destroySpriteBatch(spriteBatch: bigint): void;
  createVertexBuffer(
    device: bigint, vertexStride: number, elements: readonly VertexElementSnapshot[],
    vertexCount: number, usage: number, dynamic: boolean,
  ): bigint;
  setVertexBufferRaw(buffer: bigint, bytes: Uint8Array, vertexCount: number, vertexStride: number): void;
  getVertexBufferRaw(buffer: bigint, vertexCount: number, vertexStride: number): Uint8Array;
  destroyVertexBuffer(buffer: bigint): void;
  createIndexBuffer(
    device: bigint, elementSize: number, indexCount: number, usage: number, dynamic: boolean,
  ): bigint;
  setIndexBufferRaw(buffer: bigint, elementSize: number, bytes: Uint8Array): void;
  getIndexBufferRaw(buffer: bigint, elementSize: number, indexCount: number): Uint8Array;
  destroyIndexBuffer(buffer: bigint): void;
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
  createSoundEffectPcm(
    game: bigint, bytes: Uint8Array, offset: number, count: number,
    sampleRate: number, channels: number, loopStart: number, loopLength: number,
  ): bigint;
  createSoundEffectEncoded(game: bigint, bytes: Uint8Array): bigint;
  getSoundEffectDurationTicks(soundEffect: bigint): bigint;
  getSoundEffectName(soundEffect: bigint): string;
  setSoundEffectName(soundEffect: bigint, value: string): void;
  createSoundEffectInstance(soundEffect: bigint): bigint;
  playSoundEffect(soundEffect: bigint, volume: number, pitch: number, pan: number): boolean;
  destroySoundEffect(soundEffect: bigint): void;
  getMasterVolume(game: bigint): number;
  setMasterVolume(game: bigint, value: number): void;
  getDistanceScale(game: bigint): number;
  setDistanceScale(game: bigint, value: number): void;
  getDopplerScale(game: bigint): number;
  setDopplerScale(game: bigint, value: number): void;
  getSpeedOfSound(game: bigint): number;
  setSpeedOfSound(game: bigint, value: number): void;
  playSoundEffectInstance(instance: bigint): void;
  pauseSoundEffectInstance(instance: bigint): void;
  resumeSoundEffectInstance(instance: bigint): void;
  stopSoundEffectInstance(instance: bigint, immediate: boolean): void;
  getSoundEffectInstanceInfo(instance: bigint): SoundEffectInstanceSnapshot;
  setSoundEffectInstanceVolume(instance: bigint, value: number): void;
  setSoundEffectInstancePitch(instance: bigint, value: number): void;
  setSoundEffectInstancePan(instance: bigint, value: number): void;
  setSoundEffectInstanceLooped(instance: bigint, value: boolean): void;
  applySoundEffectInstance3D(
    instance: bigint, listeners: readonly AudioListenerSnapshot[], emitter: AudioEmitterSnapshot,
  ): void;
  destroySoundEffectInstance(instance: bigint): void;
  createDynamicSoundEffectInstance(game: bigint, sampleRate: number, channels: number): bigint;
  getDynamicPendingBufferCount(instance: bigint): number;
  submitDynamicBuffer(instance: bigint, buffer: Uint8Array, offset: number, count: number): void;
  getMicrophones(game: bigint): MicrophoneSnapshot[];
  setMicrophoneBufferDurationTicks(game: bigint, index: number, ticks: bigint): void;
  startMicrophone(game: bigint, index: number): void;
  stopMicrophone(game: bigint, index: number): void;
  getMicrophoneData(game: bigint, index: number, count: number): Uint8Array;
  createAudioEngine(
    game: bigint, settingsFile: string, extended: boolean, lookAheadTicks: bigint, rendererId: string,
  ): bigint;
  destroyAudioEngine(engine: bigint): void;
  getAudioEngineIsDisposed(engine: bigint): boolean;
  getAudioEngineRendererDetails(engine: bigint): RendererDetailSnapshot[];
  getAudioEngineGlobalVariable(engine: bigint, name: string): number;
  setAudioEngineGlobalVariable(engine: bigint, name: string, value: number): void;
  updateAudioEngine(engine: bigint): void;
  getAudioCategory(engine: bigint, name: string): bigint;
  destroyAudioCategory(category: bigint): void;
  getAudioCategoryName(category: bigint): string;
  pauseAudioCategory(category: bigint): void;
  resumeAudioCategory(category: bigint): void;
  setAudioCategoryVolume(category: bigint, value: number): void;
  stopAudioCategory(category: bigint, options: number): void;
  audioCategoriesEqual(left: bigint, right: bigint): boolean;
  getAudioCategoryHashCode(category: bigint): number;
  createWaveBank(engine: bigint, filename: string): bigint;
  createStreamingWaveBank(engine: bigint, filename: string, offset: number, packetSize: number): bigint;
  destroyWaveBank(bank: bigint): void;
  getWaveBankIsDisposed(bank: bigint): boolean;
  getWaveBankIsPrepared(bank: bigint): boolean;
  getWaveBankIsInUse(bank: bigint): boolean;
  createSoundBank(engine: bigint, filename: string): bigint;
  destroySoundBank(bank: bigint): void;
  getSoundBankIsDisposed(bank: bigint): boolean;
  getSoundBankIsInUse(bank: bigint): boolean;
  getCue(bank: bigint, name: string): bigint;
  playSoundBankCue(bank: bigint, name: string): void;
  playSoundBankCue3D(
    bank: bigint, name: string, listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot,
  ): void;
  destroyCue(cue: bigint): void;
  getCueInfo(cue: bigint): CueSnapshot;
  getCueName(cue: bigint): string;
  applyCue3D(cue: bigint, listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot): void;
  getCueVariable(cue: bigint, name: string): number;
  setCueVariable(cue: bigint, name: string, value: number): void;
  playCue(cue: bigint): void;
  pauseCue(cue: bigint): void;
  resumeCue(cue: bigint): void;
  stopCue(cue: bigint, options: number): void;
  getAvailableMediaSources(game: bigint): MediaSourceSnapshot[];
  playMediaSongs(game: bigint, songs: readonly MediaSongPlaybackSnapshot[], index: number): void;
  pauseMedia(game: bigint): void;
  resumeMedia(game: bigint): void;
  stopMedia(game: bigint): void;
  moveNextMedia(game: bigint): void;
  movePreviousMedia(game: bigint): void;
  setMediaVolume(game: bigint, value: number): void;
  setMediaMuted(game: bigint, value: boolean): void;
  setMediaRepeating(game: bigint, value: boolean): void;
  setMediaShuffled(game: bigint, value: boolean): void;
  setMediaVisualizationEnabled(game: bigint, value: boolean): void;
  getMediaGameHasControl(game: bigint): boolean;
  getMediaPlayPositionTicks(game: bigint): bigint;
  getMediaVisualizationData(game: bigint): {
    readonly Frequencies: readonly number[];
    readonly Samples: readonly number[];
  };
  updateMedia(game: bigint): void;
  createVideoPlayer(game: bigint): bigint;
  destroyVideoPlayer(player: bigint): void;
  getVideoPlayerInfo(player: bigint): VideoPlayerSnapshot;
  setVideoPlayerLooped(player: bigint, value: boolean): void;
  setVideoPlayerMuted(player: bigint, value: boolean): void;
  setVideoPlayerVolume(player: bigint, value: number): void;
  playVideo(player: bigint, video: bigint): void;
  pauseVideo(player: bigint): void;
  resumeVideo(player: bigint): void;
  stopVideo(player: bigint): void;
  selectStorageDevice(
    hasPlayer: boolean, player: number, hasSpace: boolean, sizeInBytes: number, directoryCount: number,
  ): bigint;
  destroyStorageDevice(device: bigint): void;
  getStorageDeviceInfo(device: bigint): StorageDeviceSnapshot;
  deleteStorageContainer(device: bigint, name: string): void;
  openStorageContainer(device: bigint, name: string): bigint;
  destroyStorageContainer(container: bigint): void;
  getStorageContainerDisplayName(container: bigint): string;
  createStorageDirectory(container: bigint, path: string): void;
  storageDirectoryExists(container: bigint, path: string): boolean;
  deleteStorageDirectory(container: bigint, path: string): void;
  getStorageDirectoryNames(container: bigint, pattern: string): string[];
  createStorageFile(container: bigint, path: string): void;
  storageFileExists(container: bigint, path: string): boolean;
  deleteStorageFile(container: bigint, path: string): void;
  getStorageFileNames(container: bigint, pattern: string): string[];
  openStorageFile(container: bigint, path: string, mode: number, access: number, share: number): Uint8Array;
}

export class NodeNativeBackend implements CnaBackend {
  public readonly Kind = "node-native";
  public readonly IsAvailable = true;
  public readonly AbiVersion = "0.7.0";
  public readonly Detail: string;
  public readonly ImportedSymbolCount: number;
  public RendererInfo: BackendRendererInfo | null = null;
  public readonly Audio: CnaAudioBackend = this;
  public readonly Xact: CnaXactBackend = this;
  public readonly Media: CnaMediaBackend = this;
  public readonly Video: CnaVideoBackend = this;
  public readonly Storage: CnaStorageBackend = this;
  readonly #bridge: NativeBridge;
  #activeGame: NativeHandle | null = null;
  #boundGameLifetime: NativeResourceLifetime | null = null;

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
  public bindGameLifetimeForInternalUse(lifetime: NativeResourceLifetime | null): void {
    this.#boundGameLifetime = lifetime;
  }
  public get ParentLifetime(): NativeResourceLifetime {
    if (this.#boundGameLifetime == null) {
      throw new NativeUnavailableError("CNA audio resources require an active native Game lifetime");
    }
    return this.#boundGameLifetime;
  }
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
  public getTexture2DInfo(texture: NativeHandle): Texture2DInfo {
    return this.#bridge.getTexture2DInfo(texture);
  }
  public createTexture2DFromEncodedMemory(
    device: NativeHandle,
    encoded: Uint8Array,
    decode: { readonly Width: number; readonly Height: number; readonly Zoom: boolean } | null,
  ): NativeHandle {
    return this.#bridge.createTexture2DFromEncodedMemory(
      device,
      encoded,
      decode != null,
      decode?.Width ?? 0,
      decode?.Height ?? 0,
      decode?.Zoom ?? false,
    );
  }
  public setTexture2DData(
    texture: NativeHandle,
    transfer: Texture2DTransfer,
    bytes: Uint8Array,
  ): void {
    const rectangle = transfer.Rectangle;
    this.#bridge.setTexture2DData(
      texture,
      transfer.DataType,
      transfer.Level,
      rectangle != null,
      rectangle?.X ?? 0,
      rectangle?.Y ?? 0,
      rectangle?.Width ?? 0,
      rectangle?.Height ?? 0,
      transfer.StartIndex,
      transfer.ElementCount,
      transfer.Capacity,
      transfer.ElementSize,
      bytes,
    );
  }
  public getTexture2DData(texture: NativeHandle, transfer: Texture2DTransfer): Uint8Array {
    const rectangle = transfer.Rectangle;
    return this.#bridge.getTexture2DData(
      texture,
      transfer.DataType,
      transfer.Level,
      rectangle != null,
      rectangle?.X ?? 0,
      rectangle?.Y ?? 0,
      rectangle?.Width ?? 0,
      rectangle?.Height ?? 0,
      transfer.StartIndex,
      transfer.ElementCount,
      transfer.Capacity,
      transfer.ElementSize,
    );
  }
  public encodeTexture2D(
    texture: NativeHandle,
    imageFormat: number,
    width: number,
    height: number,
  ): Uint8Array {
    return this.#bridge.encodeTexture2D(texture, imageFormat, width, height);
  }
  public destroyTexture2D(texture: NativeHandle): void { this.#bridge.destroyTexture2D(texture); }
  public createSpriteBatch(device: NativeHandle): NativeHandle {
    return this.#bridge.createSpriteBatch(device);
  }
  public beginSpriteBatch(spriteBatch: NativeHandle, sortMode: number): void {
    this.#bridge.beginSpriteBatch(spriteBatch, sortMode);
  }
  public submitSpriteBatch(
    spriteBatch: NativeHandle,
    commands: readonly SpriteBatchCommand[],
  ): void {
    this.#bridge.submitSpriteBatch(spriteBatch, commands);
  }
  public endSpriteBatch(spriteBatch: NativeHandle): void {
    this.#bridge.endSpriteBatch(spriteBatch);
  }
  public destroySpriteBatch(spriteBatch: NativeHandle): void {
    this.#bridge.destroySpriteBatch(spriteBatch);
  }
  public createVertexBuffer(
    device: NativeHandle, vertexStride: number, elements: readonly VertexElementSnapshot[],
    vertexCount: number, usage: number, dynamic: boolean,
  ): NativeHandle {
    return this.#bridge.createVertexBuffer(
      device, vertexStride, elements, vertexCount, usage, dynamic,
    );
  }
  public setVertexBufferRaw(
    buffer: NativeHandle, bytes: Uint8Array, vertexCount: number, vertexStride: number,
  ): void { this.#bridge.setVertexBufferRaw(buffer, bytes, vertexCount, vertexStride); }
  public getVertexBufferRaw(
    buffer: NativeHandle, vertexCount: number, vertexStride: number,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.getVertexBufferRaw(buffer, vertexCount, vertexStride));
  }
  public destroyVertexBuffer(buffer: NativeHandle): void { this.#bridge.destroyVertexBuffer(buffer); }
  public createIndexBuffer(
    device: NativeHandle, elementSize: number, indexCount: number,
    usage: number, dynamic: boolean,
  ): NativeHandle {
    return this.#bridge.createIndexBuffer(device, elementSize, indexCount, usage, dynamic);
  }
  public setIndexBufferRaw(
    buffer: NativeHandle, elementSize: number, bytes: Uint8Array,
  ): void { this.#bridge.setIndexBufferRaw(buffer, elementSize, bytes); }
  public getIndexBufferRaw(
    buffer: NativeHandle, elementSize: number, indexCount: number,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.getIndexBufferRaw(buffer, elementSize, indexCount));
  }
  public destroyIndexBuffer(buffer: NativeHandle): void { this.#bridge.destroyIndexBuffer(buffer); }

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

  public createSoundEffect(
    pcmBytes: Uint8Array, offset: number, count: number, sampleRate: number,
    channels: number, loopStart: number, loopLength: number,
  ): NativeHandle {
    return this.#bridge.createSoundEffectPcm(
      this.#game(), pcmBytes, offset, count, sampleRate, channels, loopStart, loopLength,
    );
  }
  public createSoundEffectFromEncoded(encoded: Uint8Array): NativeHandle {
    return this.#bridge.createSoundEffectEncoded(this.#game(), encoded);
  }
  public getSoundEffectDurationTicks(soundEffect: NativeHandle): bigint {
    return this.#bridge.getSoundEffectDurationTicks(soundEffect);
  }
  public getSoundEffectName(soundEffect: NativeHandle): string {
    return this.#bridge.getSoundEffectName(soundEffect);
  }
  public setSoundEffectName(soundEffect: NativeHandle, value: string): void {
    this.#bridge.setSoundEffectName(soundEffect, value);
  }
  public createSoundEffectInstance(soundEffect: NativeHandle): NativeHandle {
    return this.#bridge.createSoundEffectInstance(soundEffect);
  }
  public playSoundEffect(
    soundEffect: NativeHandle, volume: number, pitch: number, pan: number,
  ): boolean { return this.#bridge.playSoundEffect(soundEffect, volume, pitch, pan); }
  public destroySoundEffect(soundEffect: NativeHandle): void {
    this.#bridge.destroySoundEffect(soundEffect);
  }
  public getMasterVolume(): number { return this.#bridge.getMasterVolume(this.#game()); }
  public setMasterVolume(value: number): void { this.#bridge.setMasterVolume(this.#game(), value); }
  public getDistanceScale(): number { return this.#bridge.getDistanceScale(this.#game()); }
  public setDistanceScale(value: number): void { this.#bridge.setDistanceScale(this.#game(), value); }
  public getDopplerScale(): number { return this.#bridge.getDopplerScale(this.#game()); }
  public setDopplerScale(value: number): void { this.#bridge.setDopplerScale(this.#game(), value); }
  public getSpeedOfSound(): number { return this.#bridge.getSpeedOfSound(this.#game()); }
  public setSpeedOfSound(value: number): void { this.#bridge.setSpeedOfSound(this.#game(), value); }
  public playSoundEffectInstance(instance: NativeHandle): void {
    this.#bridge.playSoundEffectInstance(instance);
  }
  public pauseSoundEffectInstance(instance: NativeHandle): void {
    this.#bridge.pauseSoundEffectInstance(instance);
  }
  public resumeSoundEffectInstance(instance: NativeHandle): void {
    this.#bridge.resumeSoundEffectInstance(instance);
  }
  public stopSoundEffectInstance(instance: NativeHandle, immediate: boolean): void {
    this.#bridge.stopSoundEffectInstance(instance, immediate);
  }
  public getSoundEffectInstanceInfo(instance: NativeHandle): SoundEffectInstanceSnapshot {
    return this.#bridge.getSoundEffectInstanceInfo(instance);
  }
  public setSoundEffectInstanceVolume(instance: NativeHandle, value: number): void {
    this.#bridge.setSoundEffectInstanceVolume(instance, value);
  }
  public setSoundEffectInstancePitch(instance: NativeHandle, value: number): void {
    this.#bridge.setSoundEffectInstancePitch(instance, value);
  }
  public setSoundEffectInstancePan(instance: NativeHandle, value: number): void {
    this.#bridge.setSoundEffectInstancePan(instance, value);
  }
  public setSoundEffectInstanceLooped(instance: NativeHandle, value: boolean): void {
    this.#bridge.setSoundEffectInstanceLooped(instance, value);
  }
  public applySoundEffectInstance3D(
    instance: NativeHandle,
    listeners: readonly AudioListenerSnapshot[],
    emitter: AudioEmitterSnapshot,
  ): void { this.#bridge.applySoundEffectInstance3D(instance, listeners, emitter); }
  public destroySoundEffectInstance(instance: NativeHandle): void {
    this.#bridge.destroySoundEffectInstance(instance);
  }
  public createDynamicSoundEffectInstance(sampleRate: number, channels: number): NativeHandle {
    return this.#bridge.createDynamicSoundEffectInstance(this.#game(), sampleRate, channels);
  }
  public getDynamicPendingBufferCount(instance: NativeHandle): number {
    return this.#bridge.getDynamicPendingBufferCount(instance);
  }
  public submitDynamicBuffer(
    instance: NativeHandle, buffer: Uint8Array, offset: number, count: number,
  ): void { this.#bridge.submitDynamicBuffer(instance, buffer, offset, count); }
  public getMicrophones(): readonly MicrophoneSnapshot[] {
    return Object.freeze(this.#bridge.getMicrophones(this.#game()).map((value) => Object.freeze(value)));
  }
  public setMicrophoneBufferDurationTicks(index: number, ticks: bigint): void {
    this.#bridge.setMicrophoneBufferDurationTicks(this.#game(), index, ticks);
  }
  public startMicrophone(index: number): void { this.#bridge.startMicrophone(this.#game(), index); }
  public stopMicrophone(index: number): void { this.#bridge.stopMicrophone(this.#game(), index); }
  public getMicrophoneData(index: number, count: number): Uint8Array {
    return new Uint8Array(this.#bridge.getMicrophoneData(this.#game(), index, count));
  }

  public createAudioEngine(
    settingsFile: string, lookAheadTicks?: bigint, rendererId = "",
  ): NativeHandle {
    return this.#bridge.createAudioEngine(
      this.#game(), settingsFile, lookAheadTicks !== undefined, lookAheadTicks ?? 0n, rendererId,
    );
  }
  public destroyAudioEngine(engine: NativeHandle): void { this.#bridge.destroyAudioEngine(engine); }
  public getAudioEngineIsDisposed(engine: NativeHandle): boolean {
    return this.#bridge.getAudioEngineIsDisposed(engine);
  }
  public getAudioEngineRendererDetails(engine: NativeHandle): readonly RendererDetailSnapshot[] {
    return Object.freeze(this.#bridge.getAudioEngineRendererDetails(engine).map((value) => Object.freeze(value)));
  }
  public getAudioEngineGlobalVariable(engine: NativeHandle, name: string): number {
    return this.#bridge.getAudioEngineGlobalVariable(engine, name);
  }
  public setAudioEngineGlobalVariable(engine: NativeHandle, name: string, value: number): void {
    this.#bridge.setAudioEngineGlobalVariable(engine, name, value);
  }
  public updateAudioEngine(engine: NativeHandle): void { this.#bridge.updateAudioEngine(engine); }
  public getAudioCategory(engine: NativeHandle, name: string): NativeHandle {
    return this.#bridge.getAudioCategory(engine, name);
  }
  public destroyAudioCategory(category: NativeHandle): void {
    this.#bridge.destroyAudioCategory(category);
  }
  public getAudioCategoryName(category: NativeHandle): string {
    return this.#bridge.getAudioCategoryName(category);
  }
  public pauseAudioCategory(category: NativeHandle): void { this.#bridge.pauseAudioCategory(category); }
  public resumeAudioCategory(category: NativeHandle): void { this.#bridge.resumeAudioCategory(category); }
  public setAudioCategoryVolume(category: NativeHandle, value: number): void {
    this.#bridge.setAudioCategoryVolume(category, value);
  }
  public stopAudioCategory(category: NativeHandle, options: number): void {
    this.#bridge.stopAudioCategory(category, options);
  }
  public audioCategoriesEqual(left: NativeHandle, right: NativeHandle): boolean {
    return this.#bridge.audioCategoriesEqual(left, right);
  }
  public getAudioCategoryHashCode(category: NativeHandle): number {
    return this.#bridge.getAudioCategoryHashCode(category);
  }
  public createWaveBank(engine: NativeHandle, filename: string): NativeHandle {
    return this.#bridge.createWaveBank(engine, filename);
  }
  public createStreamingWaveBank(
    engine: NativeHandle, filename: string, offset: number, packetSize: number,
  ): NativeHandle { return this.#bridge.createStreamingWaveBank(engine, filename, offset, packetSize); }
  public destroyWaveBank(bank: NativeHandle): void { this.#bridge.destroyWaveBank(bank); }
  public getWaveBankIsDisposed(bank: NativeHandle): boolean {
    return this.#bridge.getWaveBankIsDisposed(bank);
  }
  public getWaveBankIsPrepared(bank: NativeHandle): boolean {
    return this.#bridge.getWaveBankIsPrepared(bank);
  }
  public getWaveBankIsInUse(bank: NativeHandle): boolean {
    return this.#bridge.getWaveBankIsInUse(bank);
  }
  public createSoundBank(engine: NativeHandle, filename: string): NativeHandle {
    return this.#bridge.createSoundBank(engine, filename);
  }
  public destroySoundBank(bank: NativeHandle): void { this.#bridge.destroySoundBank(bank); }
  public getSoundBankIsDisposed(bank: NativeHandle): boolean {
    return this.#bridge.getSoundBankIsDisposed(bank);
  }
  public getSoundBankIsInUse(bank: NativeHandle): boolean {
    return this.#bridge.getSoundBankIsInUse(bank);
  }
  public getCue(bank: NativeHandle, name: string): NativeHandle {
    return this.#bridge.getCue(bank, name);
  }
  public playCue(bank: NativeHandle, name: string): void { this.#bridge.playSoundBankCue(bank, name); }
  public playCue3D(
    bank: NativeHandle, name: string,
    listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot,
  ): void { this.#bridge.playSoundBankCue3D(bank, name, listener, emitter); }
  public destroyCue(cue: NativeHandle): void { this.#bridge.destroyCue(cue); }
  public getCueInfo(cue: NativeHandle): CueSnapshot { return this.#bridge.getCueInfo(cue); }
  public getCueName(cue: NativeHandle): string { return this.#bridge.getCueName(cue); }
  public applyCue3D(
    cue: NativeHandle, listener: AudioListenerSnapshot, emitter: AudioEmitterSnapshot,
  ): void { this.#bridge.applyCue3D(cue, listener, emitter); }
  public getCueVariable(cue: NativeHandle, name: string): number {
    return this.#bridge.getCueVariable(cue, name);
  }
  public setCueVariable(cue: NativeHandle, name: string, value: number): void {
    this.#bridge.setCueVariable(cue, name, value);
  }
  public playCueHandle(cue: NativeHandle): void { this.#bridge.playCue(cue); }
  public pauseCue(cue: NativeHandle): void { this.#bridge.pauseCue(cue); }
  public resumeCue(cue: NativeHandle): void { this.#bridge.resumeCue(cue); }
  public stopCue(cue: NativeHandle, options: number): void { this.#bridge.stopCue(cue, options); }

  public getAvailableMediaSources(): readonly MediaSourceSnapshot[] {
    return Object.freeze(this.#bridge.getAvailableMediaSources(this.#game()).map((value) => Object.freeze(value)));
  }
  public playSongs(songs: readonly MediaSongPlaybackSnapshot[], index: number): void {
    this.#bridge.playMediaSongs(this.#game(), songs, index);
  }
  public pause(): void { this.#bridge.pauseMedia(this.#game()); }
  public resume(): void { this.#bridge.resumeMedia(this.#game()); }
  public stop(): void { this.#bridge.stopMedia(this.#game()); }
  public moveNext(): void { this.#bridge.moveNextMedia(this.#game()); }
  public movePrevious(): void { this.#bridge.movePreviousMedia(this.#game()); }
  public setVolume(value: number): void { this.#bridge.setMediaVolume(this.#game(), value); }
  public setMuted(value: boolean): void { this.#bridge.setMediaMuted(this.#game(), value); }
  public setRepeating(value: boolean): void { this.#bridge.setMediaRepeating(this.#game(), value); }
  public setShuffled(value: boolean): void { this.#bridge.setMediaShuffled(this.#game(), value); }
  public setVisualizationEnabled(value: boolean): void {
    this.#bridge.setMediaVisualizationEnabled(this.#game(), value);
  }
  public getGameHasControl(): boolean { return this.#bridge.getMediaGameHasControl(this.#game()); }
  public getPlayPositionTicks(): bigint { return this.#bridge.getMediaPlayPositionTicks(this.#game()); }
  public getVisualizationData(): {
    readonly Frequencies: readonly number[];
    readonly Samples: readonly number[];
  } {
    const value = this.#bridge.getMediaVisualizationData(this.#game());
    return Object.freeze({
      Frequencies: Object.freeze([...value.Frequencies]),
      Samples: Object.freeze([...value.Samples]),
    });
  }
  public update(): void { this.#bridge.updateMedia(this.#game()); }

  public createVideoPlayer(): NativeHandle { return this.#bridge.createVideoPlayer(this.#game()); }
  public destroyVideoPlayer(player: NativeHandle): void { this.#bridge.destroyVideoPlayer(player); }
  public getVideoPlayerInfo(player: NativeHandle): VideoPlayerSnapshot {
    return this.#bridge.getVideoPlayerInfo(player);
  }
  public setVideoPlayerLooped(player: NativeHandle, value: boolean): void {
    this.#bridge.setVideoPlayerLooped(player, value);
  }
  public setVideoPlayerMuted(player: NativeHandle, value: boolean): void {
    this.#bridge.setVideoPlayerMuted(player, value);
  }
  public setVideoPlayerVolume(player: NativeHandle, value: number): void {
    this.#bridge.setVideoPlayerVolume(player, value);
  }
  public playVideo(player: NativeHandle, video: NativeHandle): void {
    this.#bridge.playVideo(player, video);
  }
  public pauseVideo(player: NativeHandle): void { this.#bridge.pauseVideo(player); }
  public resumeVideo(player: NativeHandle): void { this.#bridge.resumeVideo(player); }
  public stopVideo(player: NativeHandle): void { this.#bridge.stopVideo(player); }

  public selectStorageDevice(
    player: number | null, sizeInBytes: number | null, directoryCount: number | null,
  ): NativeHandle {
    return this.#bridge.selectStorageDevice(
      player != null, player ?? 0, sizeInBytes != null, sizeInBytes ?? 0, directoryCount ?? 0,
    );
  }
  public destroyStorageDevice(device: NativeHandle): void { this.#bridge.destroyStorageDevice(device); }
  public getStorageDeviceInfo(device: NativeHandle): StorageDeviceSnapshot {
    return this.#bridge.getStorageDeviceInfo(device);
  }
  public deleteStorageContainer(device: NativeHandle, name: string): void {
    this.#bridge.deleteStorageContainer(device, name);
  }
  public openStorageContainer(device: NativeHandle, name: string): NativeHandle {
    return this.#bridge.openStorageContainer(device, name);
  }
  public destroyStorageContainer(container: NativeHandle): void {
    this.#bridge.destroyStorageContainer(container);
  }
  public getStorageContainerDisplayName(container: NativeHandle): string {
    return this.#bridge.getStorageContainerDisplayName(container);
  }
  public createStorageDirectory(container: NativeHandle, path: string): void {
    this.#bridge.createStorageDirectory(container, path);
  }
  public storageDirectoryExists(container: NativeHandle, path: string): boolean {
    return this.#bridge.storageDirectoryExists(container, path);
  }
  public deleteStorageDirectory(container: NativeHandle, path: string): void {
    this.#bridge.deleteStorageDirectory(container, path);
  }
  public getStorageDirectoryNames(container: NativeHandle, pattern: string): readonly string[] {
    return Object.freeze(this.#bridge.getStorageDirectoryNames(container, pattern));
  }
  public createStorageFile(container: NativeHandle, path: string): void {
    this.#bridge.createStorageFile(container, path);
  }
  public storageFileExists(container: NativeHandle, path: string): boolean {
    return this.#bridge.storageFileExists(container, path);
  }
  public deleteStorageFile(container: NativeHandle, path: string): void {
    this.#bridge.deleteStorageFile(container, path);
  }
  public getStorageFileNames(container: NativeHandle, pattern: string): readonly string[] {
    return Object.freeze(this.#bridge.getStorageFileNames(container, pattern));
  }
  public openStorageFile(
    container: NativeHandle, path: string, mode: number, access: number, share: number,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.openStorageFile(container, path, mode, access, share));
  }

  #game(): NativeHandle {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("CNA input polling requires an active native Game");
    }
    return this.#activeGame;
  }
}
