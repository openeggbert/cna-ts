import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "./abi.js";
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

export interface BlendStateSnapshot {
  readonly AlphaBlendFunction: number;
  readonly AlphaDestinationBlend: number;
  readonly AlphaSourceBlend: number;
  readonly ColorBlendFunction: number;
  readonly ColorDestinationBlend: number;
  readonly ColorSourceBlend: number;
  readonly ColorWriteChannels: number;
  readonly ColorWriteChannels1: number;
  readonly ColorWriteChannels2: number;
  readonly ColorWriteChannels3: number;
  readonly BlendFactor: number;
  readonly MultiSampleMask: number;
}

export interface DepthStencilStateSnapshot {
  readonly DepthBufferEnable: boolean;
  readonly DepthBufferWriteEnable: boolean;
  readonly StencilEnable: boolean;
  readonly TwoSidedStencilMode: boolean;
  readonly DepthBufferFunction: number;
  readonly StencilFunction: number;
  readonly StencilMask: number;
  readonly StencilWriteMask: number;
  readonly ReferenceStencil: number;
  readonly StencilFail: number;
  readonly StencilDepthBufferFail: number;
  readonly StencilPass: number;
  readonly CounterClockwiseStencilFunction: number;
  readonly CounterClockwiseStencilFail: number;
  readonly CounterClockwiseStencilDepthBufferFail: number;
  readonly CounterClockwiseStencilPass: number;
}

export interface RasterizerStateSnapshot {
  readonly CullMode: number;
  readonly FillMode: number;
  readonly DepthBias: number;
  readonly SlopeScaleDepthBias: number;
  readonly MultiSampleAntiAlias: boolean;
  readonly ScissorTestEnable: boolean;
}

export interface SamplerStateSnapshot {
  readonly AddressU: number;
  readonly AddressV: number;
  readonly AddressW: number;
  readonly Filter: number;
  readonly MaxAnisotropy: number;
  readonly MaxMipLevel: number;
  readonly MipMapLevelOfDetailBias: number;
}

export interface VertexBufferBindingSnapshot {
  readonly VertexBuffer: NativeHandle;
  readonly VertexOffset: number;
  readonly InstanceFrequency: number;
}

export interface Texture3DInfo {
  readonly Width: number;
  readonly Height: number;
  readonly Depth: number;
  readonly LevelCount: number;
  readonly Format: number;
}

export interface TextureCubeInfo {
  readonly Size: number;
  readonly LevelCount: number;
  readonly Format: number;
}

export interface RenderTargetInfo {
  readonly Kind: number;
  readonly Width: number;
  readonly Height: number;
  readonly LevelCount: number;
  readonly Format: number;
  readonly DepthFormat: number;
  readonly MultiSampleCount: number;
  readonly Usage: number;
  readonly IsContentLost: boolean;
  readonly RendererAvailable: boolean;
}

export interface RenderTargetBindingSnapshot {
  readonly RenderTarget: NativeHandle;
  readonly ArraySlice: number;
  readonly CubeMapFace: number;
}

export interface GameWindowBoundsSnapshot {
  readonly X: number;
  readonly Y: number;
  readonly Width: number;
  readonly Height: number;
}

/** Game-owned borrowed window facade and same-thread removable event registrations. */
export interface CnaGameWindowBackend {
  getGameWindowAllowUserResizing(): boolean;
  setGameWindowAllowUserResizing(value: boolean): void;
  getGameWindowClientBounds(): GameWindowBoundsSnapshot;
  getGameWindowCurrentOrientation(): number;
  getGameWindowHandle(): bigint;
  getGameWindowScreenDeviceName(): string;
  getGameWindowTitle(): string;
  setGameWindowTitle(value: string): void;
  beginGameWindowScreenDeviceChange(willBeFullScreen: boolean): void;
  endGameWindowScreenDeviceChange(name: string, width: number, height: number): void;
  subscribeGameWindowEvent(event: number, callback: () => void): NativeHandle;
  unsubscribeGameWindowEvent(registration: NativeHandle): void;
}

/** Optional dependency-complete graphics slice beyond the minimal 2D backend. */
/** Which resource family a ContentLost subscription is for. */
export type ContentLostResourceKind = "render-target" | "vertex-buffer" | "index-buffer";

export interface CnaGraphicsBackend {
  getGraphicsDeviceStatus(device: NativeHandle): number;
  setGraphicsDeviceBlendFactor(device: NativeHandle, packedColor: number): void;
  setGraphicsDeviceBlendState(device: NativeHandle, state: BlendStateSnapshot): void;
  setGraphicsDeviceDepthStencilState(device: NativeHandle, state: DepthStencilStateSnapshot): void;
  setGraphicsDeviceRasterizerState(device: NativeHandle, state: RasterizerStateSnapshot): void;
  setGraphicsDeviceSamplerState(
    device: NativeHandle, shaderStage: number, slot: number, state: SamplerStateSnapshot,
  ): void;
  setGraphicsDeviceTexture(
    device: NativeHandle, shaderStage: number, slot: number, texture: NativeHandle | null,
  ): void;
  setGraphicsDeviceMultiSampleMask(device: NativeHandle, value: number): void;
  setGraphicsDeviceReferenceStencil(device: NativeHandle, value: number): void;
  setGraphicsDeviceScissorRectangle(
    device: NativeHandle, x: number, y: number, width: number, height: number,
  ): void;
  setGraphicsDeviceViewport(
    device: NativeHandle, x: number, y: number, width: number, height: number,
    minDepth: number, maxDepth: number,
  ): void;
  setGraphicsDeviceVertexBuffers(
    device: NativeHandle, bindings: readonly VertexBufferBindingSnapshot[],
  ): void;
  setGraphicsDeviceIndexBuffer(device: NativeHandle, buffer: NativeHandle | null): void;
  drawPrimitives(device: NativeHandle, primitiveType: number, startVertex: number, primitiveCount: number): void;
  drawIndexedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void;
  drawInstancedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number, instanceCount: number,
  ): void;
  drawUserPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
  ): void;
  drawUserIndexedPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
    indexBytes: Uint8Array, indexElementSize: number, indexCapacity: number, indexOffset: number,
  ): void;
  beginSpriteBatchWithStates(
    spriteBatch: NativeHandle, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, transform: readonly number[] | null,
  ): void;
  setVertexBufferData(
    buffer: NativeHandle, vertexType: number, options: number, startIndex: number,
    elementCount: number, capacity: number, bytes: Uint8Array,
  ): void;
  setVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, bytes: Uint8Array,
    vertexCount: number, vertexStride: number, options: number,
  ): void;
  getVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, vertexCount: number, vertexStride: number,
  ): Uint8Array;
  getVertexBufferIsContentLost(buffer: NativeHandle): boolean;
  /**
   * Subscribes to a resource's ContentLost event. ABI 0.9 made the event real on the renderers
   * whose API can lose a device, so a registration has a producer behind it rather than only
   * preserving the shape of the public contract.
   */
  subscribeContentLost(
    kind: ContentLostResourceKind, resource: NativeHandle, callback: () => void,
  ): NativeHandle;
  unsubscribeContentLost(registration: NativeHandle): void;
  setIndexBufferData(
    buffer: NativeHandle, elementSize: number, options: number, offsetInBytes: number | null,
    startIndex: number, elementCount: number, capacity: number, bytes: Uint8Array,
  ): void;
  getIndexBufferIsContentLost(buffer: NativeHandle): boolean;
  createTexture3D(
    device: NativeHandle, width: number, height: number, depth: number,
    mipMap: boolean, format: number,
  ): NativeHandle;
  getTexture3DInfo(texture: NativeHandle): Texture3DInfo;
  setTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, packedColors: Uint32Array,
  ): void;
  getTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, capacity: number,
  ): Uint32Array;
  destroyTexture3D(texture: NativeHandle): void;
  createTextureCube(device: NativeHandle, size: number, mipMap: boolean, format: number): NativeHandle;
  getTextureCubeInfo(texture: NativeHandle): TextureCubeInfo;
  setTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, packedColors: Uint32Array,
  ): void;
  getTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, capacity: number,
  ): Uint32Array;
  destroyTextureCube(texture: NativeHandle): void;
  createRenderTarget2D(
    device: NativeHandle, width: number, height: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle;
  createRenderTargetCube(
    device: NativeHandle, size: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle;
  getRenderTargetInfo(target: NativeHandle): RenderTargetInfo;
  destroyRenderTarget(target: NativeHandle): void;
  setGraphicsDeviceRenderTargets(
    device: NativeHandle, bindings: readonly RenderTargetBindingSnapshot[],
  ): void;
  createOcclusionQuery(device: NativeHandle): NativeHandle;
  beginOcclusionQuery(query: NativeHandle): void;
  endOcclusionQuery(query: NativeHandle): void;
  getOcclusionQueryIsComplete(query: NativeHandle): boolean;
  getOcclusionQueryPixelCount(query: NativeHandle): number;
  destroyOcclusionQuery(query: NativeHandle): void;
}

export interface NativeEffectPassSnapshot {
  readonly Handle: NativeHandle;
  readonly Name: string;
}

export interface NativeEffectTechniqueSnapshot {
  readonly Handle: NativeHandle;
  readonly Name: string;
  readonly Passes: readonly NativeEffectPassSnapshot[];
}

export interface NativeEffectReflectionSnapshot {
  readonly CurrentTechnique: number;
  readonly Techniques: readonly NativeEffectTechniqueSnapshot[];
}

export interface StockEffectSnapshot {
  readonly World: readonly number[];
  readonly View: readonly number[];
  readonly Projection: readonly number[];
  readonly FogColor: readonly number[];
  readonly FogEnabled: boolean;
  readonly FogStart: number;
  readonly FogEnd: number;
  readonly Alpha: number;
  readonly DiffuseColor: readonly number[];
  readonly EmissiveColor: readonly number[];
  readonly SpecularColor: readonly number[];
  readonly SpecularPower: number;
  readonly AmbientLightColor: readonly number[];
  readonly LightingEnabled: boolean;
  readonly PreferPerPixelLighting: boolean;
  readonly VertexColorEnabled: boolean;
  readonly TextureEnabled: boolean;
  readonly Texture: NativeHandle;
  readonly Texture2: NativeHandle;
  readonly EnvironmentMap: NativeHandle;
  readonly EnvironmentMapAmount: number;
  readonly EnvironmentMapSpecular: readonly number[];
  readonly FresnelFactor: number;
  readonly AlphaFunction: number;
  readonly ReferenceAlpha: number;
  readonly WeightsPerVertex: number;
  readonly BoneTransforms: readonly (readonly number[])[];
  readonly Lights: readonly {
    readonly Direction: readonly number[];
    readonly DiffuseColor: readonly number[];
    readonly SpecularColor: readonly number[];
    readonly Enabled: boolean;
  }[];
}

/** Optional dependency-complete ABI-0.7 Effect ownership and execution slice. */
export interface CnaEffectBackend {
  createEffectEmpty(device: NativeHandle): NativeHandle;
  createEffectCompiled(device: NativeHandle, bytes: Uint8Array): NativeHandle;
  cloneEffect(effect: NativeHandle): NativeHandle;
  createStockEffect(device: NativeHandle, kind: number): NativeHandle;
  getEffectReflection(effect: NativeHandle): NativeEffectReflectionSnapshot;
  setEffectCurrentTechnique(effect: NativeHandle, technique: NativeHandle): void;
  applyEffect(effect: NativeHandle): void;
  applyEffectPass(pass: NativeHandle): void;
  syncStockEffect(effect: NativeHandle, kind: number, snapshot: StockEffectSnapshot): void;
  destroyEffectTechnique(technique: NativeHandle): void;
  destroyEffectPass(pass: NativeHandle): void;
  destroyEffect(effect: NativeHandle): void;
  beginSpriteBatchWithEffect(
    spriteBatch: NativeHandle, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, effect: NativeHandle,
    transform: readonly number[] | null,
  ): void;
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
/**
 * The frame a VideoPlayer holds, and the identity that makes it trackable.
 *
 * `Texture` is **borrowed** and valid only until the next call on that player. `Generation` is what
 * distinguishes "the same frame, asked for twice" from "the frame advanced": it counts decoded
 * frames, never restarts, and is a `bigint` because a frame count that outgrew a double would start
 * comparing equal to itself.
 */
export interface VideoFrameSnapshot {
  readonly Texture: NativeHandle;
  readonly Generation: bigint;
  readonly PresentationTimeSeconds: number;
  readonly IsAvailable: boolean;
}

export interface CnaVideoBackend {
  readonly ParentLifetime: NativeResourceLifetime;
  createVideoPlayer(): NativeHandle;
  destroyVideoPlayer(player: NativeHandle): void;
  getVideoPlayerInfo(player: NativeHandle): VideoPlayerSnapshot;
  getVideoPlayerFrame(player: NativeHandle): VideoFrameSnapshot;
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

/**
 * One renderer identity as the CNA runtime describes it. There is deliberately no `Name`: the C ABI
 * names the *current* renderer, a backend category, a maturity and a fallback reason, but has no
 * route that names an arbitrary renderer identity. The public facade supplies that spelling from
 * the identity enumeration, which the ABI contract proves against the canonical constants.
 */
export interface RendererIdentitySnapshot {
  readonly Type: number;
  readonly Category: number;
  readonly CategoryName: string;
  readonly Maturity: number;
  readonly MaturityName: string;
  readonly IsAvailable: boolean;
}

/** The CNA runtime's own account of which renderer it is running and how it got there. */
export interface RendererSelectionSnapshot {
  readonly Selected: number;
  /** Null until a renderer has actually been created; CNA refuses to invent one. */
  readonly Active: number | null;
  readonly Current: number | null;
  readonly CurrentName: string | null;
  readonly IsLatched: boolean;
  readonly AutomaticFallback: boolean;
}

/** One renderer CNA tried and rejected, with the reason it gave. */
export interface RendererFallbackSnapshot {
  readonly Type: number;
  readonly Reason: number;
  readonly ReasonName: string;
  readonly Message: string;
}

/** The host CNA reports itself running on. */
export interface PlatformSnapshot {
  readonly Platform: number;
  readonly Name: string;
  readonly IsApple: boolean;
  readonly IsMobile: boolean;
  /** Null where the platform is not a desktop; CNA refuses the question rather than answering it. */
  readonly DesktopOperatingSystem: number | null;
}

/**
 * Process-wide CNA services with no Microsoft.Xna.Framework counterpart: which host the runtime is
 * on, which renderer it selected and why, and its log sink. None of these take a handle, so they
 * answer before a Game exists and are the same operations on every backend.
 */
export interface CnaRuntimeServicesBackend {
  getPlatform(): PlatformSnapshot;
  getRendererSelection(): RendererSelectionSnapshot;
  getAvailableRendererTypes(): readonly number[];
  isRendererAvailable(type: number): boolean;
  describeRenderer(type: number): RendererIdentitySnapshot;
  setPreferredRenderer(type: number): void;
  setPreferredRendererByName(name: string): void;
  tryParseRendererName(name: string): number | null;
  setRendererFallbackChain(types: readonly number[]): void;
  setAutomaticRendererFallback(enabled: boolean): void;
  getRendererFallbacks(): readonly RendererFallbackSnapshot[];
  getMinimumLogLevel(): number;
  setMinimumLogLevel(level: number): void;
  writeLog(level: number, category: number, message: string): void;
  isGraphicsExtensionLayerAvailable(): boolean;
}

/** CNA's default PBR material, as the runtime seeds it. */
export interface PbrMaterialDefaults {
  readonly MetallicFactor: number;
  readonly RoughnessFactor: number;
  readonly NormalScale: number;
  readonly OcclusionStrength: number;
  readonly AlphaCutoff: number;
  readonly AlphaBlendEnabled: boolean;
  readonly AlbedoColor: number;
  readonly EmissiveColor: number;
}

/** CNA's default render-pipeline settings, as the runtime seeds them. */
export interface RenderPipelineSettingsDefaults {
  readonly Exposure: number;
  readonly Gamma: number;
  readonly BloomIntensity: number;
  readonly TonemappingMode: number;
  readonly RenderQuality: number;
  readonly ShadowQuality: number;
  readonly HdrEnabled: boolean;
  readonly BloomEnabled: boolean;
  readonly SsaoEnabled: boolean;
  readonly ShadowsEnabled: boolean;
}

/** What one render-pipeline frame did. */
export interface RenderPipelineStatisticsSnapshot {
  readonly PassesRun: number;
  readonly TargetSwitches: number;
  readonly LastFramePassCount: number;
  readonly UsedSceneTarget: boolean;
  readonly DrewSkybox: boolean;
  readonly GpuMemoryEstimateBytes: bigint;
}

/**
 * CNA's extended graphics layer. The two default-value routes are pure value operations and answer
 * in every build; everything that needs a native pipeline object answers `NOT_SUPPORTED` where the
 * layer was compiled out, which is why the facade asks before offering the feature.
 */

/** One frame's inputs to a post-process pass or chain, with every texture as a handle. */
export interface PostProcessFrameSnapshot {
  readonly Source: NativeHandle;
  readonly SourceDepth: NativeHandle;
  readonly SourceNormals: NativeHandle;
  readonly SourceVelocity: NativeHandle;
  readonly Destination: NativeHandle;
  readonly Width: number;
  readonly Height: number;
  readonly ElapsedSeconds: number;
  readonly NearPlane: number;
  readonly FarPlane: number;
}

/** How long one post-process pass took on the GPU, averaged over its samples. */
export interface PassTimingSnapshot {
  readonly Name: string;
  readonly SampleCount: number;
  readonly Milliseconds: number;
}

export interface CnaGraphicsExtensionBackend {
  getDefaultPbrMaterial(): PbrMaterialDefaults;
  getDefaultRenderPipelineSettings(): RenderPipelineSettingsDefaults;
  createRenderPipeline(device: NativeHandle): NativeHandle;
  destroyRenderPipeline(pipeline: NativeHandle): void;
  resizeRenderPipeline(pipeline: NativeHandle, width: number, height: number): void;
  beginRenderPipeline(pipeline: NativeHandle, packedClearColor: number): void;
  endRenderPipeline(pipeline: NativeHandle): void;
  getRenderPipelineStatistics(pipeline: NativeHandle): RenderPipelineStatisticsSnapshot;
  createBlitPass(device: NativeHandle): NativeHandle;
  createBloomPass(device: NativeHandle): NativeHandle;
  createTonemapPass(device: NativeHandle): NativeHandle;
  createFxaaPass(device: NativeHandle): NativeHandle;
  createSsaoPass(device: NativeHandle): NativeHandle;
  createSsrPass(device: NativeHandle): NativeHandle;
  getBloomIntensity(pass: NativeHandle): number;
  setBloomIntensity(pass: NativeHandle, value: number): void;
  getBloomThreshold(pass: NativeHandle): number;
  setBloomThreshold(pass: NativeHandle, value: number): void;
  getTonemapExposure(pass: NativeHandle): number;
  setTonemapExposure(pass: NativeHandle, value: number): void;
  getTonemapGamma(pass: NativeHandle): number;
  setTonemapGamma(pass: NativeHandle, value: number): void;
  getTonemapDebandStrength(pass: NativeHandle): number;
  setTonemapDebandStrength(pass: NativeHandle, value: number): void;
  getFxaaEdgeThreshold(pass: NativeHandle): number;
  setFxaaEdgeThreshold(pass: NativeHandle, value: number): void;
  getSsaoRadius(pass: NativeHandle): number;
  setSsaoRadius(pass: NativeHandle, value: number): void;
  getSsaoIntensity(pass: NativeHandle): number;
  setSsaoIntensity(pass: NativeHandle, value: number): void;
  getSsrIntensity(pass: NativeHandle): number;
  setSsrIntensity(pass: NativeHandle, value: number): void;
  getSsrMaxDistance(pass: NativeHandle): number;
  setSsrMaxDistance(pass: NativeHandle, value: number): void;
  getSsrThickness(pass: NativeHandle): number;
  setSsrThickness(pass: NativeHandle, value: number): void;
  getSsrDepthBias(pass: NativeHandle): number;
  setSsrDepthBias(pass: NativeHandle, value: number): void;
  getSsrEdgeFade(pass: NativeHandle): number;
  setSsrEdgeFade(pass: NativeHandle, value: number): void;
  getSsrRoughnessBlur(pass: NativeHandle): number;
  setSsrRoughnessBlur(pass: NativeHandle, value: number): void;
  getBloomIterations(pass: NativeHandle): number;
  setBloomIterations(pass: NativeHandle, value: number): void;
  getSsaoSampleCount(pass: NativeHandle): number;
  setSsaoSampleCount(pass: NativeHandle, value: number): void;
  getSsrStepCount(pass: NativeHandle): number;
  setSsrStepCount(pass: NativeHandle, value: number): void;
  getSsaoHalfResolution(pass: NativeHandle): boolean;
  setSsaoHalfResolution(pass: NativeHandle, value: boolean): void;
  getTonemapMode(pass: NativeHandle): number;
  setTonemapMode(pass: NativeHandle, mode: number): void;
  getTonemapDebandEnabled(pass: NativeHandle): boolean;
  setTonemapDebandEnabled(pass: NativeHandle, value: boolean): void;
  bloomIterationsForQuality(quality: number): number;
  ssaoSampleCountForQuality(quality: number): number;
  fxaaEdgeThresholdForQuality(quality: number): number;
  resetBloomTargets(pass: NativeHandle): void;
  resetSsaoTargets(pass: NativeHandle): void;
  applyPostProcessPass(pass: NativeHandle, frame: PostProcessFrameSnapshot): void;
  getPostProcessPassName(pass: NativeHandle): string;
  isPostProcessPassSupported(pass: NativeHandle, device: NativeHandle): boolean;
  destroyPostProcessPass(pass: NativeHandle): void;
  createPostProcessChain(device: NativeHandle): NativeHandle;
  destroyPostProcessChain(chain: NativeHandle): void;
  clearPostProcessChain(chain: NativeHandle): void;
  resetPostProcessChainTargets(chain: NativeHandle): void;
  addPostProcessPass(chain: NativeHandle, pass: NativeHandle): void;
  addOwnedPostProcessPass(chain: NativeHandle, pass: NativeHandle): void;
  getPostProcessChainPassCount(chain: NativeHandle): number;
  getPostProcessChainGpuTimingEnabled(chain: NativeHandle): boolean;
  setPostProcessChainGpuTimingEnabled(chain: NativeHandle, value: boolean): void;
  applyPostProcessChain(chain: NativeHandle, frame: PostProcessFrameSnapshot): void;
  getPostProcessChainPassTimings(chain: NativeHandle): readonly PassTimingSnapshot[];
}


/** One parsed `.cnb` table-of-contents entry, exactly as CNA reports it. */
export interface CnbChunkEntrySnapshot {
  readonly Offset: number;
  readonly StoredByteLength: number;
  readonly ByteLength: number;
  readonly Type: number;
  readonly Flags: number;
  readonly Checksum: number;
  readonly Compression: number;
  readonly Alignment: number;
}

/** A `.cnb` container's identities, counts and `CMET` metadata in one read. */
export interface CnbDocumentSnapshot {
  readonly ContainerMajor: number;
  readonly ContainerMinor: number;
  readonly AssetTypeId: number;
  readonly AssetSchemaVersion: number;
  readonly ChunkCount: number;
  readonly ExternalReferenceCount: number;
  readonly Origin: string;
  readonly MetadataPresent: boolean;
  readonly MetadataFlags: number;
  readonly MetadataAssetTypeName: string;
  readonly MetadataContentName: string;
}

/** One `XREF` entry: the logical name of an asset this file refers to but does not embed. */
export interface CnbExternalReferenceSnapshot {
  readonly Name: string;
  readonly Flags: number;
  readonly ExpectedAssetTypeId: number;
}

/** A decoded texture's shape, independent of any GPU object. */
export interface CnbTextureInfoSnapshot {
  readonly Width: number;
  readonly Height: number;
  readonly Depth: number;
  readonly FaceCount: number;
  readonly MipCount: number;
  readonly RepresentationCount: number;
}

/** One glyph of a compiled font, in the shape the sprite-font family already publishes. */
export interface CnbGlyphSnapshot {
  readonly Bounds: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number };
  readonly Cropping: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number };
  readonly Character: number;
  readonly KerningLeft: number;
  readonly KerningWidth: number;
  readonly KerningRight: number;
}

/** A compiled font's whole-font metrics. */
export interface CnbSpriteFontInfoSnapshot {
  readonly GlyphCount: number;
  readonly LineSpacing: number;
  readonly Spacing: number;
  readonly DefaultCharacter: number;
  readonly HasDefaultCharacter: boolean;
}

/**
 * CNB, CNA's own compiled content format.
 *
 * Unlike the rest of this boundary, most of the family is pure functions over caller-owned bytes.
 * Three things own something and are handles with one release each: the parsed document, a decoded
 * texture description and a decoded font description. Nothing here touches a `GraphicsDevice` --
 * turning a description into a real resource is the extension layer's job, above this line.
 */
/** What a `.cnb` model's top level declares, before any node is addressed. */
export interface CnbModelInfoSnapshot {
  readonly BoneCount: number;
  readonly PartCount: number;
  readonly MeshCount: number;
  readonly AnimationCount: number;
  readonly LightCount: number;
  readonly HasSkeleton: boolean;
  readonly AppliesGltfLightingPolicy: boolean;
  readonly HasBoneHierarchy: boolean;
}

/** One drawable part's numeric description. Its payloads are fetched separately. */
export interface CnbModelPartSnapshot {
  readonly VertexStride: number;
  readonly VertexCount: number;
  readonly IndexCount: number;
  readonly IndexElementSize: number;
  readonly PrimitiveTopology: number;
  readonly PrimitiveCount: number;
  readonly EffectKind: number;
  readonly VertexColorEnabled: boolean;
  readonly Unlit: boolean;
}

/** A part's material state, without its eight texture names. */
export interface CnbMaterialSnapshot {
  readonly BaseColorFactor: readonly number[];
  readonly EmissiveFactor: readonly number[];
  readonly SpecularColorFactor: readonly number[];
  readonly MetallicFactor: number;
  readonly RoughnessFactor: number;
  readonly Ior: number;
  readonly SpecularFactor: number;
  readonly NormalScale: number;
  readonly OcclusionStrength: number;
  readonly AlphaCutoff: number;
  readonly AlphaMode: number;
  readonly DoubleSided: boolean;
}

/** A `.cnb` sound effect's description: format, rate, channels, frames and its loop region. */
export interface CnbSoundEffectInfoSnapshot {
  readonly Format: number;
  readonly SampleRate: number;
  readonly Channels: number;
  readonly FrameCount: number;
  readonly LoopStart: number;
  readonly LoopLength: number;
}

/** A `.cnb` video's description. The media itself is a stream reference, not an embedded payload. */
export interface CnbVideoInfoSnapshot {
  readonly DurationMilliseconds: number;
  readonly Width: number;
  readonly Height: number;
  readonly FramesPerSecond: number;
  readonly SoundtrackType: number;
}

export interface CnaContentBackend {
  cnbHasMagic(bytes: Uint8Array): boolean;
  cnbFormatMagic(): Uint8Array;
  cnbCrc32c(bytes: Uint8Array): number;
  cnbIsCompressionSupported(codec: number): boolean;
  cnbCompressionName(codec: number): string;
  cnbAssetTypeName(assetTypeId: number): string;
  cnbAssetTypeIdFromName(name: string): number;
  cnbIsCustomAssetTypeId(assetTypeId: number): boolean;
  cnbMakeChunkId(a: number, b: number, c: number, d: number): number;
  cnbChunkIdString(id: number): string;
  cnbIsWellFormedChunkId(id: number): boolean;
  cnbTextureFormatName(format: number): string;
  cnbIsBlockCompressedTextureFormat(format: number): boolean;
  cnbTextureFormatUnitBytes(format: number): number;
  cnbTextureLevelByteSize(format: number, width: number, height: number, depth: number): number;
  cnbTextureFormatToSurfaceFormat(format: number): number;
  cnbDocumentParse(bytes: Uint8Array, origin: string): NativeHandle;
  cnbDocumentDestroy(document: NativeHandle): void;
  cnbDocumentGetInfo(document: NativeHandle): CnbDocumentSnapshot;
  cnbDocumentGetChunk(document: NativeHandle, index: number): CnbChunkEntrySnapshot;
  cnbDocumentCopyChunkData(document: NativeHandle, index: number): Uint8Array;
  cnbDocumentFindAll(document: NativeHandle, type: number): readonly number[];
  cnbDocumentRequireMandatoryChunksUnderstood(document: NativeHandle, known: readonly number[]): void;
  cnbDocumentGetExternalReference(document: NativeHandle, index: number): CnbExternalReferenceSnapshot;
  cnbDecodeTexture2D(document: NativeHandle): NativeHandle;
  cnbTextureDataDestroy(texture: NativeHandle): void;
  cnbTextureDataGetInfo(texture: NativeHandle): CnbTextureInfoSnapshot;
  cnbTextureDataGetLevelDimensions(
    texture: NativeHandle, level: number,
  ): { readonly Width: number; readonly Height: number; readonly Depth: number };
  cnbTextureDataGetRepresentationFormat(texture: NativeHandle, representation: number): number;
  cnbTextureDataGetLevelCount(texture: NativeHandle, representation: number): number;
  cnbTextureDataCopyLevel(texture: NativeHandle, representation: number, level: number): Uint8Array;
  cnbTextureDataCreate(
    width: number, height: number, depth: number, faceCount: number, mipCount: number,
  ): NativeHandle;
  cnbTextureDataCreateRgba8(width: number, height: number, rgba: Uint8Array): NativeHandle;
  cnbTextureDataAddRepresentation(texture: NativeHandle, format: number): number;
  cnbTextureDataSetLevel(
    texture: NativeHandle, representation: number, level: number, bytes: Uint8Array,
  ): void;
  cnbEncodeTexture2D(texture: NativeHandle, contentName: string): Uint8Array;
  cnbDecodeSpriteFont(document: NativeHandle): NativeHandle;
  cnbSpriteFontDataCreate(): NativeHandle;
  cnbSpriteFontDataDestroy(font: NativeHandle): void;
  cnbSpriteFontDataGetInfo(font: NativeHandle): CnbSpriteFontInfoSnapshot;
  cnbSpriteFontDataSetInfo(font: NativeHandle, info: {
    readonly LineSpacing: number;
    readonly Spacing: number;
    readonly DefaultCharacter: number;
    readonly HasDefaultCharacter: boolean;
  }): void;
  cnbSpriteFontDataGetGlyph(font: NativeHandle, index: number): CnbGlyphSnapshot;
  cnbSpriteFontDataAddGlyph(font: NativeHandle, glyph: CnbGlyphSnapshot): number;
  cnbSpriteFontDataSetAtlas(font: NativeHandle, atlas: NativeHandle): void;
  cnbSpriteFontDataCopyAtlas(font: NativeHandle): NativeHandle;
  cnbEncodeSpriteFont(font: NativeHandle, contentName: string): Uint8Array;
  cnbSoundEffectDataCreate(info: CnbSoundEffectInfoSnapshot, samples: Uint8Array): NativeHandle;
  cnbSoundEffectDataDestroy(sound: NativeHandle): void;
  cnbSoundEffectDataGetInfo(sound: NativeHandle): CnbSoundEffectInfoSnapshot;
  cnbSoundEffectDataCopySamples(sound: NativeHandle): Uint8Array;
  cnbEncodeSoundEffect(sound: NativeHandle, contentName: string): Uint8Array;
  cnbDecodeSoundEffect(document: NativeHandle): NativeHandle;
  cnbDecodeWavAsSoundEffect(bytes: Uint8Array, origin: string): NativeHandle;
  cnbEncodeSong(
    streamReference: string, name: string, durationMilliseconds: number, contentName: string,
  ): Uint8Array;
  cnbDecodeSongDuration(document: NativeHandle): number;
  cnbDecodeSongName(document: NativeHandle): string;
  cnbDecodeSongStreamReference(document: NativeHandle): string;
  cnbEncodeVideo(
    streamReference: string, info: CnbVideoInfoSnapshot, contentName: string,
  ): Uint8Array;
  cnbDecodeVideo(document: NativeHandle): CnbVideoInfoSnapshot;
  cnbDecodeVideoStreamReference(document: NativeHandle): string;
  cnbModelCreate(): NativeHandle;
  cnbModelDestroy(model: NativeHandle): void;
  cnbModelSetFlags(
    model: NativeHandle, appliesGltfLightingPolicy: boolean, hasBoneHierarchy: boolean,
  ): void;
  cnbModelGetInfo(model: NativeHandle): CnbModelInfoSnapshot;
  cnbModelAddBone(
    model: NativeHandle, name: string, parent: number, transform: readonly number[],
  ): number;
  cnbModelGetBone(
    model: NativeHandle, index: number,
  ): { readonly Parent: number; readonly Transform: readonly number[] };
  cnbModelGetBoneName(model: NativeHandle, index: number): string;
  cnbModelAddPart(
    model: NativeHandle, info: CnbModelPartSnapshot, name: string, externalEffect: string,
  ): number;
  cnbModelGetPart(model: NativeHandle, index: number): CnbModelPartSnapshot;
  cnbModelGetPartName(model: NativeHandle, index: number): string;
  cnbModelGetPartExternalEffect(model: NativeHandle, index: number): string;
  cnbModelSetPartVertexBytes(model: NativeHandle, index: number, bytes: Uint8Array): void;
  cnbModelCopyPartVertexBytes(model: NativeHandle, index: number): Uint8Array;
  cnbModelSetPartIndexBytes(model: NativeHandle, index: number, bytes: Uint8Array): void;
  cnbModelCopyPartIndexBytes(model: NativeHandle, index: number): Uint8Array;
  cnbModelGetMaterial(model: NativeHandle, part: number): CnbMaterialSnapshot;
  cnbModelSetMaterial(model: NativeHandle, part: number, material: CnbMaterialSnapshot): void;
  cnbModelGetMaterialTexture(model: NativeHandle, part: number, slot: number): string;
  cnbModelSetMaterialTexture(
    model: NativeHandle, part: number, slot: number, assetName: string,
  ): void;
  cnbModelAddMesh(
    model: NativeHandle, name: string, parentBone: number, partIndices: readonly number[],
  ): number;
  cnbModelGetMesh(
    model: NativeHandle, index: number,
  ): { readonly ParentBone: number; readonly PartIndexCount: number };
  cnbModelGetMeshName(model: NativeHandle, index: number): string;
  cnbModelCopyMeshPartIndices(model: NativeHandle, index: number): readonly number[];
  cnbModelSetSkeleton(
    model: NativeHandle,
    hierarchy: readonly number[],
    bindPose: readonly number[],
    inverseBindPose: readonly number[],
    rootPrefix: readonly number[],
  ): void;
  cnbModelGetSkeleton(
    model: NativeHandle,
  ): { readonly JointCount: number; readonly HasRootPrefix: boolean };
  cnbModelCopySkeletonHierarchy(model: NativeHandle): readonly number[];
  cnbModelCopySkeletonMatrices(model: NativeHandle, set: number): readonly number[];
  cnbModelAddLight(
    model: NativeHandle, direction: readonly number[], diffuseColor: readonly number[],
  ): number;
  cnbModelGetLight(
    model: NativeHandle, index: number,
  ): { readonly Direction: readonly number[]; readonly DiffuseColor: readonly number[] };
  cnbEncodeModel(model: NativeHandle, contentName: string): Uint8Array;
  cnbDecodeModel(document: NativeHandle): NativeHandle;
}


/** Host facts a game reads once, from CNA's extended device layer. */
export interface HostDeviceSnapshot {
  readonly LogicalCpuCoreCount: number;
  readonly SystemRamMegabytes: number;
  readonly PowerState: number;
  readonly BatteryPercent: number;
  readonly SecondsRemaining: number;
  readonly ContentScale: number;
  readonly SafeArea: {
    readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number;
  };
}

/** One entry of the user's preferred-locale list, in preference order. */
export interface PreferredLocaleSnapshot {
  readonly Language: string;
  readonly Country: string;
}

/** What the host's cameras are, and whether the platform has any camera concept at all. */
export interface CameraInventorySnapshot {
  readonly IsSupported: boolean;
  readonly Devices: readonly { readonly Name: string; readonly Position: number }[];
}

/**
 * CNA's extended device layer: the host itself rather than anything XNA modelled.
 *
 * Every route is exported in both build states and answers `NOT_SUPPORTED` where the layer is
 * compiled out, so {@link isDeviceExtensionLayerAvailable} is asked first rather than a refusal
 * being read as a device that is missing.
 */
export interface CnaDeviceBackend {
  isDeviceExtensionLayerAvailable(): boolean;
  getHostDeviceInfo(): HostDeviceSnapshot;
  getPreferredLocales(): readonly PreferredLocaleSnapshot[];
  setClipboardText(text: string): boolean;
  getCameras(): CameraInventorySnapshot;
}


/**
 * The parts of gamer services a host without platform services can answer honestly.
 *
 * The dispatcher's own lifetime and the Guide's state are real CNA state that any native component
 * would see. Everything that needs a signed-in user, a friends list or a platform overlay is
 * deliberately absent: a fabricated gamer would be worse than the
 * `GamerServicesNotAvailableException` XNA itself raises where the platform is missing.
 */
export interface CnaGamerServicesBackend {
  initializeGamerServices(): void;
  getGamerServicesIsInitialized(): boolean;
  updateGamerServices(): void;
  getGamerServicesWindowHandle(): bigint;
  setGamerServicesWindowHandle(handle: bigint): void;
  getGuideIsVisible(): boolean;
  getGuideIsTrialMode(): boolean;
  getGuideSimulateTrialMode(): boolean;
  setGuideSimulateTrialMode(value: boolean): void;
  getGuideIsScreenSaverEnabled(): boolean;
  setGuideIsScreenSaverEnabled(value: boolean): void;
  getGuideNotificationPosition(): number;
  setGuideNotificationPosition(position: number): void;
}


/** Which of CNA's sensor families the platform has at all. */
export interface SensorSupportSnapshot {
  readonly Accelerometer: boolean;
  readonly Compass: boolean;
  readonly Gyroscope: boolean;
  readonly Motion: boolean;
}

/** A sensor's state, plus how often it is asked to update. */
export interface SensorStateSnapshot {
  readonly State: number;
  readonly IsDataValid: boolean;
  readonly TimeBetweenUpdatesTicks: bigint;
}

/** One accelerometer reading, in g per axis, with the timestamp that identifies it. */
export interface AccelerometerReadingSnapshot {
  readonly X: number;
  readonly Y: number;
  readonly Z: number;
  readonly TimestampTicks: bigint;
  readonly TimestampOffsetTicks: bigint;
}

/**
 * CNA's sensors.
 *
 * The rule that shapes this boundary: a sensor that is not there is not a sensor reading zero.
 * Support is asked separately from state, and a host without an accelerometer says so rather than
 * handing back three zeroes a game would integrate into a wrong orientation.
 */
export interface CnaSensorBackend {
  getSensorSupport(): SensorSupportSnapshot;
  createAccelerometer(): NativeHandle;
  destroyAccelerometer(sensor: NativeHandle): void;
  startAccelerometer(sensor: NativeHandle): void;
  stopAccelerometer(sensor: NativeHandle): void;
  getAccelerometerState(sensor: NativeHandle): SensorStateSnapshot;
  setAccelerometerInterval(sensor: NativeHandle, ticks: bigint): void;
  getAccelerometerReading(sensor: NativeHandle): AccelerometerReadingSnapshot;
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
  readonly Graphics?: CnaGraphicsBackend;
  readonly Effects?: CnaEffectBackend;
  readonly Window?: CnaGameWindowBackend;
  readonly RuntimeServices?: CnaRuntimeServicesBackend;
  readonly GraphicsExtensions?: CnaGraphicsExtensionBackend;
  readonly Content?: CnaContentBackend;
  readonly Devices?: CnaDeviceBackend;
  readonly GamerServices?: CnaGamerServicesBackend;
  readonly Sensors?: CnaSensorBackend;
  openTitleStream?(name: string): Uint8Array;

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
    `CNA publishes experimental C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x headers, but this package ` +
    "has no loaded WebAssembly or Node backend artifact";

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
