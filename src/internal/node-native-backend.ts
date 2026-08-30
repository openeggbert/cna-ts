import type {
  CnaBackend,
  CnaAudioBackend,
  CnaXactBackend,
  CnaMediaBackend,
  CnaVideoBackend,
  CnaStorageBackend,
  CnaGraphicsBackend,
  CnaEffectBackend,
  CnaGameWindowBackend,
  BackendRendererInfo,
  CnaGraphicsExtensionBackend,
  CnaContentBackend,
  CnaDeviceBackend,
  CnaGamerServicesBackend,
  CameraInventorySnapshot,
  HostDeviceSnapshot,
  PreferredLocaleSnapshot,
  PassTimingSnapshot,
  PostProcessFrameSnapshot,
  CnbChunkEntrySnapshot,
  CnbDocumentSnapshot,
  CnbExternalReferenceSnapshot,
  CnbGlyphSnapshot,
  CnbSpriteFontInfoSnapshot,
  CnbTextureInfoSnapshot,
  ContentLostResourceKind,
  PbrMaterialDefaults,
  PlatformSnapshot,
  RenderPipelineSettingsDefaults,
  RenderPipelineStatisticsSnapshot,
  RendererFallbackSnapshot,
  RendererIdentitySnapshot,
  RendererSelectionSnapshot,
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
  VideoFrameSnapshot,
  StorageDeviceSnapshot,
  BlendStateSnapshot,
  DepthStencilStateSnapshot,
  RasterizerStateSnapshot,
  SamplerStateSnapshot,
  VertexBufferBindingSnapshot,
  Texture3DInfo,
  TextureCubeInfo,
  RenderTargetInfo,
  RenderTargetBindingSnapshot,
  GameWindowBoundsSnapshot,
  NativeEffectReflectionSnapshot,
  StockEffectSnapshot,
  CnaRuntimeServicesBackend,
} from "./backend.js";
import { decodeAbiVersion, describeAbiWindow, isSupportedAbiVersion } from "./abi.js";
import { fromCnaGamePadType, toCnaBlendState } from "./cna-enums.js";
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
  getPlatformSnapshot(): PlatformSnapshot;
  getRendererSelection(): RendererSelectionSnapshot;
  getAvailableRendererTypes(): number[];
  describeRenderer(type: number): RendererIdentitySnapshot;
  setPreferredRenderer(type: number): void;
  setPreferredRendererByName(name: string): void;
  tryParseRendererName(name: string): number | null;
  setRendererFallbackChain(types: readonly number[]): void;
  setAutomaticRendererFallback(enabled: boolean): void;
  getRendererFallbacks(): RendererFallbackSnapshot[];
  getMinimumLogLevel(): number;
  setMinimumLogLevel(level: number): void;
  writeLog(level: number, category: number, message: string): void;
  isGraphicsExtensionLayerAvailable(): boolean;
  getDefaultPbrMaterial(): PbrMaterialDefaults;
  getDefaultRenderPipelineSettings(): RenderPipelineSettingsDefaults;
  createRenderPipeline(device: bigint): bigint;
  destroyRenderPipeline(pipeline: bigint): void;
  resizeRenderPipeline(pipeline: bigint, width: number, height: number): void;
  beginRenderPipeline(pipeline: bigint, packedClearColor: number): void;
  endRenderPipeline(pipeline: bigint): void;
  getRenderPipelineStatistics(pipeline: bigint): RenderPipelineStatisticsSnapshot;
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
  getGraphicsDeviceStatus(device: bigint): number;
  setGraphicsDeviceBlendFactor(device: bigint, packedColor: number): void;
  setGraphicsDeviceBlendState(device: bigint, state: BlendStateSnapshot): void;
  setGraphicsDeviceDepthStencilState(device: bigint, state: DepthStencilStateSnapshot): void;
  setGraphicsDeviceRasterizerState(device: bigint, state: RasterizerStateSnapshot): void;
  setGraphicsDeviceSamplerState(
    device: bigint, shaderStage: number, slot: number, state: SamplerStateSnapshot,
  ): void;
  setGraphicsDeviceTexture(
    device: bigint, shaderStage: number, slot: number, texture: bigint,
  ): void;
  setGraphicsDeviceMultiSampleMask(device: bigint, value: number): void;
  setGraphicsDeviceReferenceStencil(device: bigint, value: number): void;
  setGraphicsDeviceScissorRectangle(
    device: bigint, x: number, y: number, width: number, height: number,
  ): void;
  setGraphicsDeviceViewport(
    device: bigint, x: number, y: number, width: number, height: number,
    minDepth: number, maxDepth: number,
  ): void;
  setGraphicsDeviceVertexBuffers(
    device: bigint, bindings: readonly VertexBufferBindingSnapshot[],
  ): void;
  setGraphicsDeviceIndexBuffer(device: bigint, buffer: bigint): void;
  drawPrimitives(device: bigint, primitiveType: number, startVertex: number, primitiveCount: number): void;
  drawIndexedPrimitives(
    device: bigint, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void;
  drawInstancedPrimitives(
    device: bigint, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number, instanceCount: number,
  ): void;
  drawUserPrimitives(
    device: bigint, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, hasDeclaration: boolean,
    declaration: readonly VertexElementSnapshot[] | null,
  ): void;
  drawUserIndexedPrimitives(
    device: bigint, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, hasDeclaration: boolean,
    declaration: readonly VertexElementSnapshot[] | null, indexBytes: Uint8Array,
    indexElementSize: number, indexCapacity: number, indexOffset: number,
  ): void;
  beginSpriteBatchWithStates(
    spriteBatch: bigint, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, transform: readonly number[] | null,
  ): void;
  createEffectEmpty(device: bigint): bigint;
  createEffectCompiled(device: bigint, bytes: Uint8Array): bigint;
  cloneEffect(effect: bigint): bigint;
  createStockEffect(device: bigint, kind: number): bigint;
  getEffectReflection(effect: bigint): NativeEffectReflectionSnapshot;
  setEffectCurrentTechnique(effect: bigint, technique: bigint): void;
  applyEffect(effect: bigint): void;
  applyEffectPass(pass: bigint): void;
  syncStockEffect(effect: bigint, kind: number, snapshot: StockEffectSnapshot): void;
  destroyEffectTechnique(technique: bigint): void;
  destroyEffectPass(pass: bigint): void;
  destroyEffect(effect: bigint): void;
  beginSpriteBatchWithEffect(
    spriteBatch: bigint, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, effect: bigint,
    transform: readonly number[] | null,
  ): void;
  setVertexBufferData(
    buffer: bigint, vertexType: number, options: number, startIndex: number,
    elementCount: number, capacity: number, bytes: Uint8Array,
  ): void;
  setVertexBufferRawAt(
    buffer: bigint, offsetInBytes: number, bytes: Uint8Array,
    vertexCount: number, vertexStride: number, options: number,
  ): void;
  getVertexBufferRawAt(
    buffer: bigint, offsetInBytes: number, vertexCount: number, vertexStride: number,
  ): Uint8Array;
  getVertexBufferIsContentLost(buffer: bigint): boolean;
  subscribeRenderTargetContentLost(target: bigint, callback: () => void): bigint;
  subscribeVertexBufferContentLost(buffer: bigint, callback: () => void): bigint;
  subscribeIndexBufferContentLost(buffer: bigint, callback: () => void): bigint;
  unsubscribeContentLost(registration: bigint): void;
  setIndexBufferData(
    buffer: bigint, elementSize: number, options: number, hasOffset: boolean,
    offsetInBytes: number, startIndex: number, elementCount: number,
    capacity: number, bytes: Uint8Array,
  ): void;
  getIndexBufferIsContentLost(buffer: bigint): boolean;
  createTexture3D(
    device: bigint, width: number, height: number, depth: number, mipMap: boolean, format: number,
  ): bigint;
  getTexture3DInfo(texture: bigint): Texture3DInfo;
  setTexture3DColors(
    texture: bigint, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, packedColors: Uint32Array,
  ): void;
  getTexture3DColors(
    texture: bigint, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, capacity: number,
  ): Uint32Array;
  destroyTexture3D(texture: bigint): void;
  createTextureCube(device: bigint, size: number, mipMap: boolean, format: number): bigint;
  getTextureCubeInfo(texture: bigint): TextureCubeInfo;
  setTextureCubeColors(
    texture: bigint, face: number, level: number, hasRectangle: boolean,
    x: number, y: number, width: number, height: number, startIndex: number,
    elementCount: number, packedColors: Uint32Array,
  ): void;
  getTextureCubeColors(
    texture: bigint, face: number, level: number, hasRectangle: boolean,
    x: number, y: number, width: number, height: number, startIndex: number,
    elementCount: number, capacity: number,
  ): Uint32Array;
  destroyTextureCube(texture: bigint): void;
  createRenderTarget2D(
    device: bigint, width: number, height: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): bigint;
  createRenderTargetCube(
    device: bigint, size: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): bigint;
  getRenderTargetInfo(target: bigint): RenderTargetInfo;
  destroyRenderTarget(target: bigint): void;
  setGraphicsDeviceRenderTargets(
    device: bigint, bindings: readonly RenderTargetBindingSnapshot[],
  ): void;
  createOcclusionQuery(device: bigint): bigint;
  beginOcclusionQuery(query: bigint): void;
  endOcclusionQuery(query: bigint): void;
  getOcclusionQueryIsComplete(query: bigint): boolean;
  getOcclusionQueryPixelCount(query: bigint): number;
  destroyOcclusionQuery(query: bigint): void;
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
  cnbDocumentParse(bytes: Uint8Array, origin: string): bigint;
  cnbDocumentDestroy(document: bigint): void;
  cnbDocumentGetInfo(document: bigint): CnbDocumentSnapshot;
  cnbDocumentGetChunk(document: bigint, index: number): CnbChunkEntrySnapshot;
  cnbDocumentCopyChunkData(document: bigint, index: number): Uint8Array;
  cnbDocumentFindAll(document: bigint, type: number): number[];
  cnbDocumentRequireMandatoryChunksUnderstood(document: bigint, known: readonly number[]): void;
  cnbDocumentGetExternalReference(document: bigint, index: number): CnbExternalReferenceSnapshot;
  cnbDecodeTexture2D(document: bigint): bigint;
  cnbTextureDataDestroy(texture: bigint): void;
  cnbTextureDataGetInfo(texture: bigint): CnbTextureInfoSnapshot;
  cnbTextureDataGetLevelDimensions(
    texture: bigint, level: number,
  ): { readonly Width: number; readonly Height: number; readonly Depth: number };
  cnbTextureDataGetRepresentationFormat(texture: bigint, representation: number): number;
  cnbTextureDataGetLevelCount(texture: bigint, representation: number): number;
  cnbTextureDataCopyLevel(texture: bigint, representation: number, level: number): Uint8Array;
  cnbTextureDataCreate(
    width: number, height: number, depth: number, faceCount: number, mipCount: number,
  ): bigint;
  cnbTextureDataCreateRgba8(width: number, height: number, rgba: Uint8Array): bigint;
  cnbTextureDataAddRepresentation(texture: bigint, format: number): number;
  cnbTextureDataSetLevel(texture: bigint, representation: number, level: number, bytes: Uint8Array): void;
  cnbEncodeTexture2D(texture: bigint, contentName: string): Uint8Array;
  cnbDecodeSpriteFont(document: bigint): bigint;
  cnbSpriteFontDataCreate(): bigint;
  cnbSpriteFontDataDestroy(font: bigint): void;
  cnbSpriteFontDataGetInfo(font: bigint): CnbSpriteFontInfoSnapshot;
  cnbSpriteFontDataSetInfo(font: bigint, info: {
    readonly LineSpacing: number;
    readonly Spacing: number;
    readonly DefaultCharacter: number;
    readonly HasDefaultCharacter: boolean;
  }): void;
  cnbSpriteFontDataGetGlyph(font: bigint, index: number): CnbGlyphSnapshot;
  cnbSpriteFontDataAddGlyph(font: bigint, glyph: CnbGlyphSnapshot): number;
  cnbSpriteFontDataSetAtlas(font: bigint, atlas: bigint): void;
  cnbSpriteFontDataCopyAtlas(font: bigint): bigint;
  cnbEncodeSpriteFont(font: bigint, contentName: string): Uint8Array;
  createBlitPass(device: bigint): bigint;
  createBloomPass(device: bigint): bigint;
  createTonemapPass(device: bigint): bigint;
  createFxaaPass(device: bigint): bigint;
  createSsaoPass(device: bigint): bigint;
  createSsrPass(device: bigint): bigint;
  getBloomIntensity(pass: bigint): number;
  setBloomIntensity(pass: bigint, value: number): void;
  getBloomThreshold(pass: bigint): number;
  setBloomThreshold(pass: bigint, value: number): void;
  getTonemapExposure(pass: bigint): number;
  setTonemapExposure(pass: bigint, value: number): void;
  getTonemapGamma(pass: bigint): number;
  setTonemapGamma(pass: bigint, value: number): void;
  getTonemapDebandStrength(pass: bigint): number;
  setTonemapDebandStrength(pass: bigint, value: number): void;
  getFxaaEdgeThreshold(pass: bigint): number;
  setFxaaEdgeThreshold(pass: bigint, value: number): void;
  getSsaoRadius(pass: bigint): number;
  setSsaoRadius(pass: bigint, value: number): void;
  getSsaoIntensity(pass: bigint): number;
  setSsaoIntensity(pass: bigint, value: number): void;
  getSsrIntensity(pass: bigint): number;
  setSsrIntensity(pass: bigint, value: number): void;
  getSsrMaxDistance(pass: bigint): number;
  setSsrMaxDistance(pass: bigint, value: number): void;
  getSsrThickness(pass: bigint): number;
  setSsrThickness(pass: bigint, value: number): void;
  getSsrDepthBias(pass: bigint): number;
  setSsrDepthBias(pass: bigint, value: number): void;
  getSsrEdgeFade(pass: bigint): number;
  setSsrEdgeFade(pass: bigint, value: number): void;
  getSsrRoughnessBlur(pass: bigint): number;
  setSsrRoughnessBlur(pass: bigint, value: number): void;
  getBloomIterations(pass: bigint): number;
  setBloomIterations(pass: bigint, value: number): void;
  getSsaoSampleCount(pass: bigint): number;
  setSsaoSampleCount(pass: bigint, value: number): void;
  getSsrStepCount(pass: bigint): number;
  setSsrStepCount(pass: bigint, value: number): void;
  getSsaoHalfResolution(pass: bigint): boolean;
  setSsaoHalfResolution(pass: bigint, value: boolean): void;
  getTonemapMode(pass: bigint): number;
  setTonemapMode(pass: bigint, mode: number): void;
  getTonemapDebandEnabled(pass: bigint): boolean;
  setTonemapDebandEnabled(pass: bigint, value: boolean): void;
  bloomIterationsForQuality(quality: number): number;
  ssaoSampleCountForQuality(quality: number): number;
  fxaaEdgeThresholdForQuality(quality: number): number;
  resetBloomTargets(pass: bigint): void;
  resetSsaoTargets(pass: bigint): void;
  applyPostProcessPass(pass: bigint, frame: PostProcessFrameSnapshot): void;
  getPostProcessPassName(pass: bigint): string;
  isPostProcessPassSupported(pass: bigint, device: bigint): boolean;
  destroyPostProcessPass(pass: bigint): void;
  createPostProcessChain(device: bigint): bigint;
  destroyPostProcessChain(chain: bigint): void;
  clearPostProcessChain(chain: bigint): void;
  resetPostProcessChainTargets(chain: bigint): void;
  addPostProcessPass(chain: bigint, pass: bigint): void;
  addOwnedPostProcessPass(chain: bigint, pass: bigint): void;
  getPostProcessChainPassCount(chain: bigint): number;
  getPostProcessChainGpuTimingEnabled(chain: bigint): boolean;
  setPostProcessChainGpuTimingEnabled(chain: bigint, value: boolean): void;
  applyPostProcessChain(chain: bigint, frame: PostProcessFrameSnapshot): void;
  getPostProcessChainPassTimings(chain: bigint): PassTimingSnapshot[];
  initializeGamerServices(game: bigint): void;
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
  isDeviceExtensionLayerAvailable(): boolean;
  getHostDeviceInfo(game: bigint): HostDeviceSnapshot;
  getPreferredLocales(game: bigint): PreferredLocaleSnapshot[];
  setClipboardText(game: bigint, text: string): boolean;
  getCameras(game: bigint): CameraInventorySnapshot;
  openTitleStream(game: bigint, name: string): Uint8Array;
  getGameWindowAllowUserResizing(game: bigint): boolean;
  setGameWindowAllowUserResizing(game: bigint, value: boolean): void;
  getGameWindowClientBounds(game: bigint): GameWindowBoundsSnapshot;
  getGameWindowCurrentOrientation(game: bigint): number;
  getGameWindowHandle(game: bigint): bigint;
  getGameWindowScreenDeviceName(game: bigint): string;
  getGameWindowTitle(game: bigint): string;
  setGameWindowTitle(game: bigint, value: string): void;
  beginGameWindowScreenDeviceChange(game: bigint, fullscreen: boolean): void;
  endGameWindowScreenDeviceChange(game: bigint, name: string, width: number, height: number): void;
  subscribeGameWindowEvent(game: bigint, event: number, callback: () => void): bigint;
  unsubscribeGameWindowEvent(registration: bigint): void;
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
  getVideoPlayerFrame(player: bigint): VideoFrameSnapshot;
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

export class NodeNativeBackend
  implements CnaBackend, CnaGraphicsBackend, CnaEffectBackend, CnaGameWindowBackend,
    CnaRuntimeServicesBackend, CnaGraphicsExtensionBackend, CnaContentBackend,
    CnaDeviceBackend, CnaGamerServicesBackend {
  public readonly Kind = "node-native";
  public readonly IsAvailable = true;
  public readonly AbiVersion: string;
  public readonly Detail: string;
  public readonly ImportedSymbolCount: number;
  public RendererInfo: BackendRendererInfo | null = null;
  public readonly Audio: CnaAudioBackend = this;
  public readonly Xact: CnaXactBackend = this;
  public readonly Media: CnaMediaBackend = this;
  public readonly Video: CnaVideoBackend = this;
  public readonly Storage: CnaStorageBackend = this;
  public readonly Graphics: CnaGraphicsBackend = this;
  public readonly Effects: CnaEffectBackend = this;
  public readonly Window: CnaGameWindowBackend = this;
  public readonly RuntimeServices: CnaRuntimeServicesBackend = this;
  public readonly GraphicsExtensions: CnaGraphicsExtensionBackend = this;
  public readonly Content: CnaContentBackend = this;
  public readonly Devices: CnaDeviceBackend = this;
  public readonly GamerServices: CnaGamerServicesBackend = this;
  readonly #bridge: NativeBridge;
  #activeGame: NativeHandle | null = null;
  #boundGameLifetime: NativeResourceLifetime | null = null;

  public constructor(bridge: NativeBridge, libraryPath: string) {
    bridge.loadLibrary(libraryPath);
    const version = decodeAbiVersion(bridge.abiVersion());
    if (!isSupportedAbiVersion(version)) {
      throw new NativeUnavailableError(
        `CNA library reports ABI ${version.Text} (0x${version.Encoded.toString(16).padStart(8, "0")}), ` +
        `which is outside the ${describeAbiWindow()} window this package targets`,
      );
    }
    this.#bridge = bridge;
    this.AbiVersion = version.Text;
    this.ImportedSymbolCount = bridge.importedSymbolCount();
    this.Detail =
      `CNA ABI ${version.Text} loaded through the Node-API bridge (${this.ImportedSymbolCount} symbols)`;
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

  public getGraphicsDeviceStatus(device: NativeHandle): number {
    return this.#bridge.getGraphicsDeviceStatus(device);
  }
  public setGraphicsDeviceBlendFactor(device: NativeHandle, packedColor: number): void {
    this.#bridge.setGraphicsDeviceBlendFactor(device, packedColor);
  }
  public setGraphicsDeviceBlendState(device: NativeHandle, state: BlendStateSnapshot): void {
    this.#bridge.setGraphicsDeviceBlendState(device, toCnaBlendState(state));
  }
  public setGraphicsDeviceDepthStencilState(
    device: NativeHandle, state: DepthStencilStateSnapshot,
  ): void { this.#bridge.setGraphicsDeviceDepthStencilState(device, state); }
  public setGraphicsDeviceRasterizerState(
    device: NativeHandle, state: RasterizerStateSnapshot,
  ): void { this.#bridge.setGraphicsDeviceRasterizerState(device, state); }
  public setGraphicsDeviceSamplerState(
    device: NativeHandle, shaderStage: number, slot: number, state: SamplerStateSnapshot,
  ): void { this.#bridge.setGraphicsDeviceSamplerState(device, shaderStage, slot, state); }
  public setGraphicsDeviceTexture(
    device: NativeHandle, shaderStage: number, slot: number, texture: NativeHandle | null,
  ): void { this.#bridge.setGraphicsDeviceTexture(device, shaderStage, slot, texture ?? 0n); }
  public setGraphicsDeviceMultiSampleMask(device: NativeHandle, value: number): void {
    this.#bridge.setGraphicsDeviceMultiSampleMask(device, value);
  }
  public setGraphicsDeviceReferenceStencil(device: NativeHandle, value: number): void {
    this.#bridge.setGraphicsDeviceReferenceStencil(device, value);
  }
  public setGraphicsDeviceScissorRectangle(
    device: NativeHandle, x: number, y: number, width: number, height: number,
  ): void { this.#bridge.setGraphicsDeviceScissorRectangle(device, x, y, width, height); }
  public setGraphicsDeviceViewport(
    device: NativeHandle, x: number, y: number, width: number, height: number,
    minDepth: number, maxDepth: number,
  ): void {
    this.#bridge.setGraphicsDeviceViewport(
      device, x, y, width, height, minDepth, maxDepth,
    );
  }
  public setGraphicsDeviceVertexBuffers(
    device: NativeHandle, bindings: readonly VertexBufferBindingSnapshot[],
  ): void { this.#bridge.setGraphicsDeviceVertexBuffers(device, bindings); }
  public setGraphicsDeviceIndexBuffer(device: NativeHandle, buffer: NativeHandle | null): void {
    this.#bridge.setGraphicsDeviceIndexBuffer(device, buffer ?? 0n);
  }
  public drawPrimitives(
    device: NativeHandle, primitiveType: number, startVertex: number, primitiveCount: number,
  ): void { this.#bridge.drawPrimitives(device, primitiveType, startVertex, primitiveCount); }
  public drawIndexedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void {
    this.#bridge.drawIndexedPrimitives(
      device, primitiveType, baseVertex, minVertexIndex, numVertices, startIndex, primitiveCount,
    );
  }
  public drawInstancedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number, instanceCount: number,
  ): void {
    this.#bridge.drawInstancedPrimitives(
      device, primitiveType, baseVertex, minVertexIndex, numVertices, startIndex,
      primitiveCount, instanceCount,
    );
  }
  public drawUserPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
  ): void {
    this.#bridge.drawUserPrimitives(
      device, primitiveType, vertexSource, bytes, vertexStride, vertexCapacity,
      vertexOffset, numVertices, primitiveCount, declaration != null, declaration,
    );
  }
  public drawUserIndexedPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
    indexBytes: Uint8Array, indexElementSize: number, indexCapacity: number, indexOffset: number,
  ): void {
    this.#bridge.drawUserIndexedPrimitives(
      device, primitiveType, vertexSource, bytes, vertexStride, vertexCapacity,
      vertexOffset, numVertices, primitiveCount, declaration != null, declaration,
      indexBytes, indexElementSize, indexCapacity, indexOffset,
    );
  }
  public beginSpriteBatchWithStates(
    spriteBatch: NativeHandle, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, transform: readonly number[] | null,
  ): void {
    this.#bridge.beginSpriteBatchWithStates(
      spriteBatch, sortMode, toCnaBlendState(blend), sampler, depth, rasterizer, transform,
    );
  }
  public createEffectEmpty(device: NativeHandle): NativeHandle {
    return this.#bridge.createEffectEmpty(device);
  }
  public createEffectCompiled(device: NativeHandle, bytes: Uint8Array): NativeHandle {
    return this.#bridge.createEffectCompiled(device, bytes);
  }
  public cloneEffect(effect: NativeHandle): NativeHandle {
    return this.#bridge.cloneEffect(effect);
  }
  public createStockEffect(device: NativeHandle, kind: number): NativeHandle {
    return this.#bridge.createStockEffect(device, kind);
  }
  public getEffectReflection(effect: NativeHandle): NativeEffectReflectionSnapshot {
    return this.#bridge.getEffectReflection(effect);
  }
  public setEffectCurrentTechnique(effect: NativeHandle, technique: NativeHandle): void {
    this.#bridge.setEffectCurrentTechnique(effect, technique);
  }
  public applyEffect(effect: NativeHandle): void { this.#bridge.applyEffect(effect); }
  public applyEffectPass(pass: NativeHandle): void { this.#bridge.applyEffectPass(pass); }
  public syncStockEffect(
    effect: NativeHandle, kind: number, snapshot: StockEffectSnapshot,
  ): void { this.#bridge.syncStockEffect(effect, kind, snapshot); }
  public destroyEffectTechnique(technique: NativeHandle): void {
    this.#bridge.destroyEffectTechnique(technique);
  }
  public destroyEffectPass(pass: NativeHandle): void { this.#bridge.destroyEffectPass(pass); }
  public destroyEffect(effect: NativeHandle): void { this.#bridge.destroyEffect(effect); }
  public beginSpriteBatchWithEffect(
    spriteBatch: NativeHandle, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, effect: NativeHandle,
    transform: readonly number[] | null,
  ): void {
    this.#bridge.beginSpriteBatchWithEffect(
      spriteBatch, sortMode, toCnaBlendState(blend), sampler, depth, rasterizer, effect, transform,
    );
  }
  public setVertexBufferData(
    buffer: NativeHandle, vertexType: number, options: number, startIndex: number,
    elementCount: number, capacity: number, bytes: Uint8Array,
  ): void {
    this.#bridge.setVertexBufferData(
      buffer, vertexType, options, startIndex, elementCount, capacity, bytes,
    );
  }
  public setVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, bytes: Uint8Array,
    vertexCount: number, vertexStride: number, options: number,
  ): void {
    this.#bridge.setVertexBufferRawAt(
      buffer, offsetInBytes, bytes, vertexCount, vertexStride, options,
    );
  }
  public getVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, vertexCount: number, vertexStride: number,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.getVertexBufferRawAt(
      buffer, offsetInBytes, vertexCount, vertexStride,
    ));
  }
  public subscribeContentLost(
    kind: ContentLostResourceKind, resource: NativeHandle, callback: () => void,
  ): NativeHandle {
    if (kind === "render-target") return this.#bridge.subscribeRenderTargetContentLost(resource, callback);
    if (kind === "vertex-buffer") return this.#bridge.subscribeVertexBufferContentLost(resource, callback);
    return this.#bridge.subscribeIndexBufferContentLost(resource, callback);
  }
  public unsubscribeContentLost(registration: NativeHandle): void {
    this.#bridge.unsubscribeContentLost(registration);
  }
  public getVertexBufferIsContentLost(buffer: NativeHandle): boolean {
    return this.#bridge.getVertexBufferIsContentLost(buffer);
  }
  public setIndexBufferData(
    buffer: NativeHandle, elementSize: number, options: number, offsetInBytes: number | null,
    startIndex: number, elementCount: number, capacity: number, bytes: Uint8Array,
  ): void {
    this.#bridge.setIndexBufferData(
      buffer, elementSize, options, offsetInBytes != null, offsetInBytes ?? 0,
      startIndex, elementCount, capacity, bytes,
    );
  }
  public getIndexBufferIsContentLost(buffer: NativeHandle): boolean {
    return this.#bridge.getIndexBufferIsContentLost(buffer);
  }
  public createTexture3D(
    device: NativeHandle, width: number, height: number, depth: number,
    mipMap: boolean, format: number,
  ): NativeHandle {
    return this.#bridge.createTexture3D(device, width, height, depth, mipMap, format);
  }
  public getTexture3DInfo(texture: NativeHandle): Texture3DInfo {
    return this.#bridge.getTexture3DInfo(texture);
  }
  public setTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, packedColors: Uint32Array,
  ): void {
    this.#bridge.setTexture3DColors(
      texture, level, left, top, right, bottom, front, back,
      startIndex, elementCount, packedColors,
    );
  }
  public getTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number,
    elementCount: number, capacity: number,
  ): Uint32Array {
    return new Uint32Array(this.#bridge.getTexture3DColors(
      texture, level, left, top, right, bottom, front, back,
      startIndex, elementCount, capacity,
    ));
  }
  public destroyTexture3D(texture: NativeHandle): void { this.#bridge.destroyTexture3D(texture); }
  public createTextureCube(
    device: NativeHandle, size: number, mipMap: boolean, format: number,
  ): NativeHandle { return this.#bridge.createTextureCube(device, size, mipMap, format); }
  public getTextureCubeInfo(texture: NativeHandle): TextureCubeInfo {
    return this.#bridge.getTextureCubeInfo(texture);
  }
  public setTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, packedColors: Uint32Array,
  ): void {
    this.#bridge.setTextureCubeColors(
      texture, face, level, rectangle != null, rectangle?.X ?? 0, rectangle?.Y ?? 0,
      rectangle?.Width ?? 0, rectangle?.Height ?? 0, startIndex, elementCount, packedColors,
    );
  }
  public getTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, capacity: number,
  ): Uint32Array {
    return new Uint32Array(this.#bridge.getTextureCubeColors(
      texture, face, level, rectangle != null, rectangle?.X ?? 0, rectangle?.Y ?? 0,
      rectangle?.Width ?? 0, rectangle?.Height ?? 0, startIndex, elementCount, capacity,
    ));
  }
  public destroyTextureCube(texture: NativeHandle): void { this.#bridge.destroyTextureCube(texture); }
  public createRenderTarget2D(
    device: NativeHandle, width: number, height: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle {
    return this.#bridge.createRenderTarget2D(
      device, width, height, mipMap, format, depthFormat, multiSampleCount, usage,
    );
  }
  public createRenderTargetCube(
    device: NativeHandle, size: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle {
    return this.#bridge.createRenderTargetCube(
      device, size, mipMap, format, depthFormat, multiSampleCount, usage,
    );
  }
  public getRenderTargetInfo(target: NativeHandle): RenderTargetInfo {
    return this.#bridge.getRenderTargetInfo(target);
  }
  public destroyRenderTarget(target: NativeHandle): void { this.#bridge.destroyRenderTarget(target); }
  public setGraphicsDeviceRenderTargets(
    device: NativeHandle, bindings: readonly RenderTargetBindingSnapshot[],
  ): void { this.#bridge.setGraphicsDeviceRenderTargets(device, bindings); }
  public createOcclusionQuery(device: NativeHandle): NativeHandle {
    return this.#bridge.createOcclusionQuery(device);
  }
  public beginOcclusionQuery(query: NativeHandle): void { this.#bridge.beginOcclusionQuery(query); }
  public endOcclusionQuery(query: NativeHandle): void { this.#bridge.endOcclusionQuery(query); }
  public getOcclusionQueryIsComplete(query: NativeHandle): boolean {
    return this.#bridge.getOcclusionQueryIsComplete(query);
  }
  public getOcclusionQueryPixelCount(query: NativeHandle): number {
    return this.#bridge.getOcclusionQueryPixelCount(query);
  }
  public destroyOcclusionQuery(query: NativeHandle): void { this.#bridge.destroyOcclusionQuery(query); }
  // CNB, CNA's own compiled content format. Every member here is a direct delegation: the family is
  // pure functions plus three owned handles, so there is nothing for this layer to decide.
  public cnbHasMagic(bytes: Uint8Array): boolean { return this.#bridge.cnbHasMagic(bytes); }
  public cnbFormatMagic(): Uint8Array { return new Uint8Array(this.#bridge.cnbFormatMagic()); }
  public cnbCrc32c(bytes: Uint8Array): number { return this.#bridge.cnbCrc32c(bytes); }
  public cnbIsCompressionSupported(codec: number): boolean {
    return this.#bridge.cnbIsCompressionSupported(codec);
  }
  public cnbCompressionName(codec: number): string { return this.#bridge.cnbCompressionName(codec); }
  public cnbAssetTypeName(assetTypeId: number): string {
    return this.#bridge.cnbAssetTypeName(assetTypeId);
  }
  public cnbAssetTypeIdFromName(name: string): number {
    return this.#bridge.cnbAssetTypeIdFromName(name);
  }
  public cnbIsCustomAssetTypeId(assetTypeId: number): boolean {
    return this.#bridge.cnbIsCustomAssetTypeId(assetTypeId);
  }
  public cnbMakeChunkId(a: number, b: number, c: number, d: number): number {
    return this.#bridge.cnbMakeChunkId(a, b, c, d);
  }
  public cnbChunkIdString(id: number): string { return this.#bridge.cnbChunkIdString(id); }
  public cnbIsWellFormedChunkId(id: number): boolean { return this.#bridge.cnbIsWellFormedChunkId(id); }
  public cnbTextureFormatName(format: number): string {
    return this.#bridge.cnbTextureFormatName(format);
  }
  public cnbIsBlockCompressedTextureFormat(format: number): boolean {
    return this.#bridge.cnbIsBlockCompressedTextureFormat(format);
  }
  public cnbTextureFormatUnitBytes(format: number): number {
    return this.#bridge.cnbTextureFormatUnitBytes(format);
  }
  public cnbTextureLevelByteSize(format: number, width: number, height: number, depth: number): number {
    return this.#bridge.cnbTextureLevelByteSize(format, width, height, depth);
  }
  public cnbTextureFormatToSurfaceFormat(format: number): number {
    return this.#bridge.cnbTextureFormatToSurfaceFormat(format);
  }
  public cnbDocumentParse(bytes: Uint8Array, origin: string): NativeHandle {
    return this.#bridge.cnbDocumentParse(bytes, origin);
  }
  public cnbDocumentDestroy(document: NativeHandle): void { this.#bridge.cnbDocumentDestroy(document); }
  public cnbDocumentGetInfo(document: NativeHandle): CnbDocumentSnapshot {
    return this.#bridge.cnbDocumentGetInfo(document);
  }
  public cnbDocumentGetChunk(document: NativeHandle, index: number): CnbChunkEntrySnapshot {
    return this.#bridge.cnbDocumentGetChunk(document, index);
  }
  public cnbDocumentCopyChunkData(document: NativeHandle, index: number): Uint8Array {
    return new Uint8Array(this.#bridge.cnbDocumentCopyChunkData(document, index));
  }
  public cnbDocumentFindAll(document: NativeHandle, type: number): readonly number[] {
    return this.#bridge.cnbDocumentFindAll(document, type);
  }
  public cnbDocumentRequireMandatoryChunksUnderstood(
    document: NativeHandle, known: readonly number[],
  ): void {
    this.#bridge.cnbDocumentRequireMandatoryChunksUnderstood(document, known);
  }
  public cnbDocumentGetExternalReference(
    document: NativeHandle, index: number,
  ): CnbExternalReferenceSnapshot {
    return this.#bridge.cnbDocumentGetExternalReference(document, index);
  }
  public cnbDecodeTexture2D(document: NativeHandle): NativeHandle {
    return this.#bridge.cnbDecodeTexture2D(document);
  }
  public cnbTextureDataDestroy(texture: NativeHandle): void {
    this.#bridge.cnbTextureDataDestroy(texture);
  }
  public cnbTextureDataGetInfo(texture: NativeHandle): CnbTextureInfoSnapshot {
    return this.#bridge.cnbTextureDataGetInfo(texture);
  }
  public cnbTextureDataGetLevelDimensions(
    texture: NativeHandle, level: number,
  ): { readonly Width: number; readonly Height: number; readonly Depth: number } {
    return this.#bridge.cnbTextureDataGetLevelDimensions(texture, level);
  }
  public cnbTextureDataGetRepresentationFormat(texture: NativeHandle, representation: number): number {
    return this.#bridge.cnbTextureDataGetRepresentationFormat(texture, representation);
  }
  public cnbTextureDataGetLevelCount(texture: NativeHandle, representation: number): number {
    return this.#bridge.cnbTextureDataGetLevelCount(texture, representation);
  }
  public cnbTextureDataCopyLevel(
    texture: NativeHandle, representation: number, level: number,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.cnbTextureDataCopyLevel(texture, representation, level));
  }
  public cnbTextureDataCreate(
    width: number, height: number, depth: number, faceCount: number, mipCount: number,
  ): NativeHandle {
    return this.#bridge.cnbTextureDataCreate(width, height, depth, faceCount, mipCount);
  }
  public cnbTextureDataCreateRgba8(width: number, height: number, rgba: Uint8Array): NativeHandle {
    return this.#bridge.cnbTextureDataCreateRgba8(width, height, rgba);
  }
  public cnbTextureDataAddRepresentation(texture: NativeHandle, format: number): number {
    return this.#bridge.cnbTextureDataAddRepresentation(texture, format);
  }
  public cnbTextureDataSetLevel(
    texture: NativeHandle, representation: number, level: number, bytes: Uint8Array,
  ): void {
    this.#bridge.cnbTextureDataSetLevel(texture, representation, level, bytes);
  }
  public cnbEncodeTexture2D(texture: NativeHandle, contentName: string): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeTexture2D(texture, contentName));
  }
  public cnbDecodeSpriteFont(document: NativeHandle): NativeHandle {
    return this.#bridge.cnbDecodeSpriteFont(document);
  }
  public cnbSpriteFontDataCreate(): NativeHandle { return this.#bridge.cnbSpriteFontDataCreate(); }
  public cnbSpriteFontDataDestroy(font: NativeHandle): void {
    this.#bridge.cnbSpriteFontDataDestroy(font);
  }
  public cnbSpriteFontDataGetInfo(font: NativeHandle): CnbSpriteFontInfoSnapshot {
    return this.#bridge.cnbSpriteFontDataGetInfo(font);
  }
  public cnbSpriteFontDataSetInfo(font: NativeHandle, info: {
    readonly LineSpacing: number;
    readonly Spacing: number;
    readonly DefaultCharacter: number;
    readonly HasDefaultCharacter: boolean;
  }): void {
    this.#bridge.cnbSpriteFontDataSetInfo(font, info);
  }
  public cnbSpriteFontDataGetGlyph(font: NativeHandle, index: number): CnbGlyphSnapshot {
    return this.#bridge.cnbSpriteFontDataGetGlyph(font, index);
  }
  public cnbSpriteFontDataAddGlyph(font: NativeHandle, glyph: CnbGlyphSnapshot): number {
    return this.#bridge.cnbSpriteFontDataAddGlyph(font, glyph);
  }
  public cnbSpriteFontDataSetAtlas(font: NativeHandle, atlas: NativeHandle): void {
    this.#bridge.cnbSpriteFontDataSetAtlas(font, atlas);
  }
  public cnbSpriteFontDataCopyAtlas(font: NativeHandle): NativeHandle {
    return this.#bridge.cnbSpriteFontDataCopyAtlas(font);
  }
  public cnbEncodeSpriteFont(font: NativeHandle, contentName: string): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeSpriteFont(font, contentName));
  }

  public createBlitPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createBlitPass(device);
  }
  public createBloomPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createBloomPass(device);
  }
  public createTonemapPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createTonemapPass(device);
  }
  public createFxaaPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createFxaaPass(device);
  }
  public createSsaoPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createSsaoPass(device);
  }
  public createSsrPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createSsrPass(device);
  }
  public getBloomIntensity(pass: NativeHandle): number { return this.#bridge.getBloomIntensity(pass); }
  public setBloomIntensity(pass: NativeHandle, value: number): void { this.#bridge.setBloomIntensity(pass, value); }
  public getBloomThreshold(pass: NativeHandle): number { return this.#bridge.getBloomThreshold(pass); }
  public setBloomThreshold(pass: NativeHandle, value: number): void { this.#bridge.setBloomThreshold(pass, value); }
  public getTonemapExposure(pass: NativeHandle): number { return this.#bridge.getTonemapExposure(pass); }
  public setTonemapExposure(pass: NativeHandle, value: number): void { this.#bridge.setTonemapExposure(pass, value); }
  public getTonemapGamma(pass: NativeHandle): number { return this.#bridge.getTonemapGamma(pass); }
  public setTonemapGamma(pass: NativeHandle, value: number): void { this.#bridge.setTonemapGamma(pass, value); }
  public getTonemapDebandStrength(pass: NativeHandle): number { return this.#bridge.getTonemapDebandStrength(pass); }
  public setTonemapDebandStrength(pass: NativeHandle, value: number): void { this.#bridge.setTonemapDebandStrength(pass, value); }
  public getFxaaEdgeThreshold(pass: NativeHandle): number { return this.#bridge.getFxaaEdgeThreshold(pass); }
  public setFxaaEdgeThreshold(pass: NativeHandle, value: number): void { this.#bridge.setFxaaEdgeThreshold(pass, value); }
  public getSsaoRadius(pass: NativeHandle): number { return this.#bridge.getSsaoRadius(pass); }
  public setSsaoRadius(pass: NativeHandle, value: number): void { this.#bridge.setSsaoRadius(pass, value); }
  public getSsaoIntensity(pass: NativeHandle): number { return this.#bridge.getSsaoIntensity(pass); }
  public setSsaoIntensity(pass: NativeHandle, value: number): void { this.#bridge.setSsaoIntensity(pass, value); }
  public getSsrIntensity(pass: NativeHandle): number { return this.#bridge.getSsrIntensity(pass); }
  public setSsrIntensity(pass: NativeHandle, value: number): void { this.#bridge.setSsrIntensity(pass, value); }
  public getSsrMaxDistance(pass: NativeHandle): number { return this.#bridge.getSsrMaxDistance(pass); }
  public setSsrMaxDistance(pass: NativeHandle, value: number): void { this.#bridge.setSsrMaxDistance(pass, value); }
  public getSsrThickness(pass: NativeHandle): number { return this.#bridge.getSsrThickness(pass); }
  public setSsrThickness(pass: NativeHandle, value: number): void { this.#bridge.setSsrThickness(pass, value); }
  public getSsrDepthBias(pass: NativeHandle): number { return this.#bridge.getSsrDepthBias(pass); }
  public setSsrDepthBias(pass: NativeHandle, value: number): void { this.#bridge.setSsrDepthBias(pass, value); }
  public getSsrEdgeFade(pass: NativeHandle): number { return this.#bridge.getSsrEdgeFade(pass); }
  public setSsrEdgeFade(pass: NativeHandle, value: number): void { this.#bridge.setSsrEdgeFade(pass, value); }
  public getSsrRoughnessBlur(pass: NativeHandle): number { return this.#bridge.getSsrRoughnessBlur(pass); }
  public setSsrRoughnessBlur(pass: NativeHandle, value: number): void { this.#bridge.setSsrRoughnessBlur(pass, value); }
  public getBloomIterations(pass: NativeHandle): number { return this.#bridge.getBloomIterations(pass); }
  public setBloomIterations(pass: NativeHandle, value: number): void { this.#bridge.setBloomIterations(pass, value); }
  public getSsaoSampleCount(pass: NativeHandle): number { return this.#bridge.getSsaoSampleCount(pass); }
  public setSsaoSampleCount(pass: NativeHandle, value: number): void { this.#bridge.setSsaoSampleCount(pass, value); }
  public getSsrStepCount(pass: NativeHandle): number { return this.#bridge.getSsrStepCount(pass); }
  public setSsrStepCount(pass: NativeHandle, value: number): void { this.#bridge.setSsrStepCount(pass, value); }
  public getSsaoHalfResolution(pass: NativeHandle): boolean { return this.#bridge.getSsaoHalfResolution(pass); }
  public setSsaoHalfResolution(pass: NativeHandle, value: boolean): void { this.#bridge.setSsaoHalfResolution(pass, value); }
  public getTonemapMode(pass: NativeHandle): number { return this.#bridge.getTonemapMode(pass); }
  public setTonemapMode(pass: NativeHandle, mode: number): void { this.#bridge.setTonemapMode(pass, mode); }
  public getTonemapDebandEnabled(pass: NativeHandle): boolean {
    return this.#bridge.getTonemapDebandEnabled(pass);
  }
  public setTonemapDebandEnabled(pass: NativeHandle, value: boolean): void {
    this.#bridge.setTonemapDebandEnabled(pass, value);
  }
  public bloomIterationsForQuality(quality: number): number {
    return this.#bridge.bloomIterationsForQuality(quality);
  }
  public ssaoSampleCountForQuality(quality: number): number {
    return this.#bridge.ssaoSampleCountForQuality(quality);
  }
  public fxaaEdgeThresholdForQuality(quality: number): number {
    return this.#bridge.fxaaEdgeThresholdForQuality(quality);
  }
  public resetBloomTargets(pass: NativeHandle): void { this.#bridge.resetBloomTargets(pass); }
  public resetSsaoTargets(pass: NativeHandle): void { this.#bridge.resetSsaoTargets(pass); }
  public applyPostProcessPass(pass: NativeHandle, frame: PostProcessFrameSnapshot): void {
    this.#bridge.applyPostProcessPass(pass, frame);
  }
  public getPostProcessPassName(pass: NativeHandle): string {
    return this.#bridge.getPostProcessPassName(pass);
  }
  public isPostProcessPassSupported(pass: NativeHandle, device: NativeHandle): boolean {
    return this.#bridge.isPostProcessPassSupported(pass, device);
  }
  public destroyPostProcessPass(pass: NativeHandle): void { this.#bridge.destroyPostProcessPass(pass); }
  public createPostProcessChain(device: NativeHandle): NativeHandle {
    return this.#bridge.createPostProcessChain(device);
  }
  public destroyPostProcessChain(chain: NativeHandle): void { this.#bridge.destroyPostProcessChain(chain); }
  public clearPostProcessChain(chain: NativeHandle): void { this.#bridge.clearPostProcessChain(chain); }
  public resetPostProcessChainTargets(chain: NativeHandle): void {
    this.#bridge.resetPostProcessChainTargets(chain);
  }
  public addPostProcessPass(chain: NativeHandle, pass: NativeHandle): void {
    this.#bridge.addPostProcessPass(chain, pass);
  }
  public addOwnedPostProcessPass(chain: NativeHandle, pass: NativeHandle): void {
    this.#bridge.addOwnedPostProcessPass(chain, pass);
  }
  public getPostProcessChainPassCount(chain: NativeHandle): number {
    return this.#bridge.getPostProcessChainPassCount(chain);
  }
  public getPostProcessChainGpuTimingEnabled(chain: NativeHandle): boolean {
    return this.#bridge.getPostProcessChainGpuTimingEnabled(chain);
  }
  public setPostProcessChainGpuTimingEnabled(chain: NativeHandle, value: boolean): void {
    this.#bridge.setPostProcessChainGpuTimingEnabled(chain, value);
  }
  public applyPostProcessChain(chain: NativeHandle, frame: PostProcessFrameSnapshot): void {
    this.#bridge.applyPostProcessChain(chain, frame);
  }
  public getPostProcessChainPassTimings(chain: NativeHandle): readonly PassTimingSnapshot[] {
    return this.#bridge.getPostProcessChainPassTimings(chain);
  }

  // Gamer services, in the two shapes a host with no platform services can answer.
  public initializeGamerServices(): void { this.#bridge.initializeGamerServices(this.#game()); }
  public getGamerServicesIsInitialized(): boolean {
    return this.#bridge.getGamerServicesIsInitialized();
  }
  public updateGamerServices(): void { this.#bridge.updateGamerServices(); }
  public getGamerServicesWindowHandle(): bigint { return this.#bridge.getGamerServicesWindowHandle(); }
  public setGamerServicesWindowHandle(handle: bigint): void {
    this.#bridge.setGamerServicesWindowHandle(handle);
  }
  public getGuideIsVisible(): boolean { return this.#bridge.getGuideIsVisible(); }
  public getGuideIsTrialMode(): boolean { return this.#bridge.getGuideIsTrialMode(); }
  public getGuideSimulateTrialMode(): boolean { return this.#bridge.getGuideSimulateTrialMode(); }
  public setGuideSimulateTrialMode(value: boolean): void {
    this.#bridge.setGuideSimulateTrialMode(value);
  }
  public getGuideIsScreenSaverEnabled(): boolean {
    return this.#bridge.getGuideIsScreenSaverEnabled();
  }
  public setGuideIsScreenSaverEnabled(value: boolean): void {
    this.#bridge.setGuideIsScreenSaverEnabled(value);
  }
  public getGuideNotificationPosition(): number { return this.#bridge.getGuideNotificationPosition(); }
  public setGuideNotificationPosition(position: number): void {
    this.#bridge.setGuideNotificationPosition(position);
  }

  // The extended device layer. Each of these needs the active game handle, because CNA addresses
  // the host's window and power through it -- this ABI has no window handle of its own.
  public isDeviceExtensionLayerAvailable(): boolean {
    return this.#bridge.isDeviceExtensionLayerAvailable();
  }
  public getHostDeviceInfo(): HostDeviceSnapshot { return this.#bridge.getHostDeviceInfo(this.#game()); }
  public getPreferredLocales(): readonly PreferredLocaleSnapshot[] {
    return this.#bridge.getPreferredLocales(this.#game());
  }
  public setClipboardText(text: string): boolean {
    return this.#bridge.setClipboardText(this.#game(), text);
  }
  public getCameras(): CameraInventorySnapshot { return this.#bridge.getCameras(this.#game()); }

  public openTitleStream(name: string): Uint8Array {
    return new Uint8Array(this.#bridge.openTitleStream(this.#game(), name));
  }
  public getGameWindowAllowUserResizing(): boolean {
    return this.#bridge.getGameWindowAllowUserResizing(this.#game());
  }
  public setGameWindowAllowUserResizing(value: boolean): void {
    this.#bridge.setGameWindowAllowUserResizing(this.#game(), value);
  }
  public getGameWindowClientBounds(): GameWindowBoundsSnapshot {
    return this.#bridge.getGameWindowClientBounds(this.#game());
  }
  public getGameWindowCurrentOrientation(): number {
    return this.#bridge.getGameWindowCurrentOrientation(this.#game());
  }
  public getGameWindowHandle(): bigint {
    return this.#bridge.getGameWindowHandle(this.#game());
  }
  public getGameWindowScreenDeviceName(): string {
    return this.#bridge.getGameWindowScreenDeviceName(this.#game());
  }
  public getGameWindowTitle(): string { return this.#bridge.getGameWindowTitle(this.#game()); }
  public setGameWindowTitle(value: string): void {
    this.#bridge.setGameWindowTitle(this.#game(), value);
  }
  public beginGameWindowScreenDeviceChange(willBeFullScreen: boolean): void {
    this.#bridge.beginGameWindowScreenDeviceChange(this.#game(), willBeFullScreen);
  }
  public endGameWindowScreenDeviceChange(name: string, width: number, height: number): void {
    this.#bridge.endGameWindowScreenDeviceChange(this.#game(), name, width, height);
  }
  public subscribeGameWindowEvent(event: number, callback: () => void): NativeHandle {
    return this.#bridge.subscribeGameWindowEvent(this.#game(), event, callback);
  }
  public unsubscribeGameWindowEvent(registration: NativeHandle): void {
    this.#bridge.unsubscribeGameWindowEvent(registration);
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
      GamePadType: fromCnaGamePadType(snapshot.GamePadType),
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
  public getVideoPlayerFrame(player: NativeHandle): VideoFrameSnapshot {
    return this.#bridge.getVideoPlayerFrame(player);
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

  // ---- Process-wide CNA runtime services -------------------------------------------------------
  // None of these take a handle, so they answer before a Game exists. They are the private side of
  // the cna-ts/extensions/runtime facade and have no Microsoft.Xna.Framework counterpart.

  public getPlatform(): PlatformSnapshot {
    return Object.freeze(this.#bridge.getPlatformSnapshot());
  }
  public getRendererSelection(): RendererSelectionSnapshot {
    return Object.freeze(this.#bridge.getRendererSelection());
  }
  public getAvailableRendererTypes(): readonly number[] {
    return Object.freeze(this.#bridge.getAvailableRendererTypes());
  }
  public isRendererAvailable(type: number): boolean {
    return this.#bridge.describeRenderer(type).IsAvailable;
  }
  public describeRenderer(type: number): RendererIdentitySnapshot {
    return Object.freeze(this.#bridge.describeRenderer(type));
  }
  public setPreferredRenderer(type: number): void { this.#bridge.setPreferredRenderer(type); }
  public setPreferredRendererByName(name: string): void {
    this.#bridge.setPreferredRendererByName(name);
  }
  public tryParseRendererName(name: string): number | null {
    return this.#bridge.tryParseRendererName(name);
  }
  public setRendererFallbackChain(types: readonly number[]): void {
    this.#bridge.setRendererFallbackChain(types);
  }
  public setAutomaticRendererFallback(enabled: boolean): void {
    this.#bridge.setAutomaticRendererFallback(enabled);
  }
  public getRendererFallbacks(): readonly RendererFallbackSnapshot[] {
    return Object.freeze(this.#bridge.getRendererFallbacks().map((row) => Object.freeze(row)));
  }
  public getMinimumLogLevel(): number { return this.#bridge.getMinimumLogLevel(); }
  public setMinimumLogLevel(level: number): void { this.#bridge.setMinimumLogLevel(level); }
  public writeLog(level: number, category: number, message: string): void {
    this.#bridge.writeLog(level, category, message);
  }
  public isGraphicsExtensionLayerAvailable(): boolean {
    return this.#bridge.isGraphicsExtensionLayerAvailable();
  }


  // ---- CNA extended graphics layer ------------------------------------------------------------

  public getDefaultPbrMaterial(): PbrMaterialDefaults {
    return Object.freeze(this.#bridge.getDefaultPbrMaterial());
  }
  public getDefaultRenderPipelineSettings(): RenderPipelineSettingsDefaults {
    return Object.freeze(this.#bridge.getDefaultRenderPipelineSettings());
  }
  public createRenderPipeline(device: NativeHandle): NativeHandle {
    return this.#bridge.createRenderPipeline(device);
  }
  public destroyRenderPipeline(pipeline: NativeHandle): void {
    this.#bridge.destroyRenderPipeline(pipeline);
  }
  public resizeRenderPipeline(pipeline: NativeHandle, width: number, height: number): void {
    this.#bridge.resizeRenderPipeline(pipeline, width, height);
  }
  public beginRenderPipeline(pipeline: NativeHandle, packedClearColor: number): void {
    this.#bridge.beginRenderPipeline(pipeline, packedClearColor);
  }
  public endRenderPipeline(pipeline: NativeHandle): void {
    this.#bridge.endRenderPipeline(pipeline);
  }
  public getRenderPipelineStatistics(pipeline: NativeHandle): RenderPipelineStatisticsSnapshot {
    return Object.freeze(this.#bridge.getRenderPipelineStatistics(pipeline));
  }

}
