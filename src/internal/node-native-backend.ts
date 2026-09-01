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
  BoundingSphereSnapshot,
  ClusterBoundsSnapshot,
  ClusteredLightSnapshot,
  PointLightSnapshot,
  SpotLightSnapshot,
  CnaClusteredLightingBackend,
  CnaComputeBackend,
  CnaLodBackend,
  CnaParticleBackend,
  CnaShadowBackend,
  CnaDecalBackend,
  CnaAtmosphereBackend,
  CnaLightProbeBackend,
  SceneFaceDraw,
  CnaDepthNormalPrepassBackend,
  ParticleEmitterSettingsSnapshot,
  ParticleSnapshot,
  DirectionalLightSnapshot,
  StandaloneDeviceParameters,
  CnaGraphicsExtensionBackend,
  RectangleSnapshot,
  SizeSnapshot,
  TextureTransformSnapshot,
  Vector2Snapshot,
  Vector4Snapshot,
  PunctualLightSnapshot,
  IndirectDrawArgumentsSnapshot,
  IndirectDrawIndexedArgumentsSnapshot,
  GpuCullableInstanceSnapshot,
  ShadowCascadeStateSnapshot,
  ImageBasedLightSnapshot,
  Vector3Snapshot,
  ColorSnapshot,
  PackedDepthSnapshot,
  CnaContentBackend,
  CnaDeviceBackend,
  CnaGamerServicesBackend,
  CnaSensorBackend,
  AccelerometerReadingSnapshot,
  SensorStateSnapshot,
  SensorSupportSnapshot,
  CameraInventorySnapshot,
  HostDeviceSnapshot,
  PreferredLocaleSnapshot,
  GltfExtensionSourceSnapshot,
  GltfExtensionTexturesSnapshot,
  GltfMaterialSourceSnapshot,
  GltfMaterialTexturesSnapshot,
  ClusteredContributionSnapshot,
  CullableInstanceSnapshot,
  DebugVertexSnapshot,
  PassTimingSnapshot,
  PipelineSettingsSnapshot,
  PbrMaterialExtSnapshot,
  PostProcessFrameSnapshot,
  CnbChunkEntrySnapshot,
  CnbLimitsSnapshot,
  CnbDocumentSnapshot,
  CnbExternalReferenceSnapshot,
  CnbGlyphSnapshot,
  CnbMaterialSnapshot,
  CnbModelInfoSnapshot,
  CnaGraphicsAdapterBackend,
  CnbCurveSnapshot,
  DisplayModeSnapshot,
  GraphicsAdapterInfoSnapshot,
  GraphicsFormatSelectionSnapshot,
  CompassReadingSnapshot,
  GyroscopeReadingSnapshot,
  MotionReadingSnapshot,
  CnbKeyframeSnapshot,
  CnbSoundEffectInfoSnapshot,
  CnbVideoInfoSnapshot,
  CnaExtendedInputBackend,
  HapticCapabilitiesSnapshot,
  JoystickCapabilitiesSnapshot,
  JoystickInfoSnapshot,
  JoystickStateSnapshot,
  TextEditingCandidatesSnapshot,
  TextEditingSnapshot,
  CnbModelPartSnapshot,
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
  AreaLightBrdfTermsSnapshot,
  AreaLightSnapshot,
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
  cnbWriterGetLimits(writer: bigint): CnbLimitsSnapshot;
  cnbWriterSetLimits(writer: bigint, limits: CnbLimitsSnapshot): void;
  cnbByteWriterCreate(initial: Uint8Array | null): bigint;
  cnbByteWriterDestroy(writer: bigint): void;
  cnbByteWriterWriteU8(writer: bigint, value: number): void;
  cnbByteWriterWriteU16(writer: bigint, value: number): void;
  cnbByteWriterWriteU32(writer: bigint, value: number): void;
  cnbByteWriterWriteU64(writer: bigint, value: bigint): void;
  cnbByteWriterWriteI32(writer: bigint, value: number): void;
  cnbByteWriterWriteF32(writer: bigint, value: number): void;
  cnbByteWriterWriteF64(writer: bigint, value: number): void;
  cnbByteWriterWriteString(writer: bigint, value: string): void;
  cnbByteWriterWriteBytes(writer: bigint, bytes: Uint8Array): void;
  cnbByteWriterWriteZeros(writer: bigint, byteCount: number): void;
  cnbByteWriterGetSize(writer: bigint): number;
  cnbByteWriterCopyBytes(writer: bigint): Uint8Array;
  cnbByteWriterTake(writer: bigint): Uint8Array;
  cnbWriterCreate(assetTypeId: number, assetSchemaVersion: number): bigint;
  cnbWriterDestroy(writer: bigint): void;
  cnbWriterSetMetadata(writer: bigint, assetTypeName: string, contentName: string): void;
  cnbWriterAddExternalReference(
    writer: bigint, flags: number, expectedAssetTypeId: number, logicalName: string,
  ): void;
  cnbWriterClearExternalReferences(writer: bigint): void;
  cnbWriterAddChunk(
    writer: bigint, chunkId: number, data: Uint8Array, flags: number, alignment: number,
  ): void;
  cnbWriterGetSchemaChunkCount(writer: bigint): number;
  cnbWriterSetCompression(writer: bigint, codec: number, level: number): void;
  cnbWriterAppendEmbeddedTexture2D(
    writer: bigint, texture: bigint, label: string,
  ): void;
  cnbWriterBuild(writer: bigint): Uint8Array;
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
  cnbEncodeCurve(curve: CnbCurveSnapshot, contentName: string): Uint8Array;
  cnbDecodeCurve(document: bigint): CnbCurveSnapshot;
  cnbEncodeAnimationClip(
    durationSeconds: number,
    tracks: readonly { readonly BoneIndex: number; readonly Keyframes: readonly CnbKeyframeSnapshot[] }[],
    targetSpace: number,
    contentName: string,
  ): Uint8Array;
  cnbDecodeAnimationClip(document: bigint): bigint;
  cnbAnimationClipDestroy(clip: bigint): void;
  cnbAnimationClipGet(clip: bigint): {
    readonly DurationSeconds: number; readonly TrackCount: number; readonly TargetSpace: number;
  };
  cnbAnimationClipGetTrack(clip: bigint, track: number): {
    readonly BoneIndex: number; readonly KeyframeCount: number;
  };
  cnbAnimationClipCopyKeyframes(clip: bigint, track: number): readonly CnbKeyframeSnapshot[];
  cnbSoundEffectDataCreate(info: CnbSoundEffectInfoSnapshot, samples: Uint8Array): bigint;
  cnbSoundEffectDataDestroy(sound: bigint): void;
  cnbSoundEffectDataGetInfo(sound: bigint): CnbSoundEffectInfoSnapshot;
  cnbSoundEffectDataCopySamples(sound: bigint): Uint8Array;
  cnbEncodeSoundEffect(sound: bigint, contentName: string): Uint8Array;
  cnbDecodeSoundEffect(document: bigint): bigint;
  cnbDecodeWavAsSoundEffect(bytes: Uint8Array, origin: string): bigint;
  cnbEncodeSong(streamReference: string, name: string, durationMilliseconds: number, contentName: string): Uint8Array;
  cnbDecodeSongDuration(document: bigint): number;
  cnbDecodeSongName(document: bigint): string;
  cnbDecodeSongStreamReference(document: bigint): string;
  cnbEncodeVideo(streamReference: string, info: CnbVideoInfoSnapshot, contentName: string): Uint8Array;
  cnbDecodeVideo(document: bigint): CnbVideoInfoSnapshot;
  cnbDecodeVideoStreamReference(document: bigint): string;
  cnbModelCreate(): bigint;
  cnbModelDestroy(model: bigint): void;
  cnbModelSetFlags(model: bigint, lighting: boolean, hierarchy: boolean): void;
  cnbModelGetInfo(model: bigint): CnbModelInfoSnapshot;
  cnbModelAddBone(model: bigint, name: string, parent: number, transform: readonly number[]): number;
  cnbModelGetBone(model: bigint, index: number): { readonly Parent: number; readonly Transform: readonly number[] };
  cnbModelGetBoneName(model: bigint, index: number): string;
  cnbModelAddPart(model: bigint, info: CnbModelPartSnapshot, name: string, externalEffect: string): number;
  cnbModelGetPart(model: bigint, index: number): CnbModelPartSnapshot;
  cnbModelGetPartName(model: bigint, index: number): string;
  cnbModelGetPartExternalEffect(model: bigint, index: number): string;
  cnbModelSetPartVertexBytes(model: bigint, index: number, bytes: Uint8Array): void;
  cnbModelCopyPartVertexBytes(model: bigint, index: number): Uint8Array;
  cnbModelSetPartIndexBytes(model: bigint, index: number, bytes: Uint8Array): void;
  cnbModelCopyPartIndexBytes(model: bigint, index: number): Uint8Array;
  cnbModelGetMaterial(model: bigint, part: number): CnbMaterialSnapshot;
  cnbModelSetMaterial(model: bigint, part: number, material: CnbMaterialSnapshot): void;
  cnbModelGetMaterialTexture(model: bigint, part: number, slot: number): string;
  cnbModelSetMaterialTexture(model: bigint, part: number, slot: number, assetName: string): void;
  cnbModelAddMesh(model: bigint, name: string, parentBone: number, partIndices: readonly number[]): number;
  cnbModelGetMesh(model: bigint, index: number): { readonly ParentBone: number; readonly PartIndexCount: number };
  cnbModelGetMeshName(model: bigint, index: number): string;
  cnbModelCopyMeshPartIndices(model: bigint, index: number): readonly number[];
  cnbModelSetSkeleton(
    model: bigint, hierarchy: readonly number[], bindPose: readonly number[],
    inverseBindPose: readonly number[], rootPrefix: readonly number[],
  ): void;
  cnbModelGetSkeleton(model: bigint): { readonly JointCount: number; readonly HasRootPrefix: boolean };
  cnbModelCopySkeletonHierarchy(model: bigint): readonly number[];
  cnbModelCopySkeletonMatrices(model: bigint, set: number): readonly number[];
  cnbModelAddLight(model: bigint, direction: readonly number[], diffuseColor: readonly number[]): number;
  cnbModelGetLight(model: bigint, index: number): { readonly Direction: readonly number[]; readonly DiffuseColor: readonly number[] };
  cnbEncodeModel(model: bigint, contentName: string): Uint8Array;
  cnbDecodeModel(document: bigint): bigint;
  isClusteredLightUsable(light: ClusteredLightSnapshot): boolean;
  createLodGroup(): bigint;
  createCascadedShadowMap(device: bigint, quality: number, cascadeCount: number): bigint;
  destroyCascadedShadowMap(map: bigint): void;
  updateCascadedShadowMap(map: bigint, light: DirectionalLightSnapshot, cameraView: readonly number[], cameraProjection: readonly number[]): void;
  beginCascadedShadowPass(map: bigint, cascadeIndex: number): void;
  endCascadedShadowPass(map: bigint): void;
  getCascadeMatrix(map: bigint, cascadeIndex: number): readonly number[];
  getCascadeSplitDistance(map: bigint, cascadeIndex: number): number;
  selectCascade(map: bigint, viewDepth: number): number;
  applyCascadesToReceiver(map: bigint, effect: bigint): void;
  snapCascadeToTexelGrid(centre: Vector3Snapshot, radius: number, cascadeSize: number): Vector3Snapshot;
  getCascadeSize(map: bigint): number;
  getCascadeCount(map: bigint): number;
  getCascadeBlendBand(map: bigint): number;
  setCascadeBlendBand(map: bigint, band: number): void;
  getCascadeSplitLambda(map: bigint): number;
  setCascadeSplitLambda(map: bigint, lambda: number): void;
  isCascadeDebugTintEnabled(map: bigint): boolean;
  setCascadeDebugTintEnabled(map: bigint, enabled: boolean): void;
  getCascadedCasterEffect(map: bigint): bigint;
  getCascadedShadowTexture(map: bigint): bigint;
  isCascadedShadowMapSupported(map: bigint): boolean;
  createSpotShadowMap(device: bigint, quality: number): bigint;
  destroySpotShadowMap(map: bigint): void;
  beginSpotShadowPass(map: bigint, light: SpotLightSnapshot): void;
  endSpotShadowPass(map: bigint): void;
  getSpotShadowLightViewProjection(map: bigint): readonly number[];
  getSpotShadowLightPosition(map: bigint): Vector3Snapshot;
  getSpotShadowLightRange(map: bigint): number;
  getSpotShadowQuality(map: bigint): number;
  getSpotShadowSize(map: bigint): number;
  getSpotShadowDepthBias(map: bigint): number;
  setSpotShadowDepthBias(map: bigint, bias: number): void;
  getSpotShadowCasterEffect(map: bigint): bigint;
  getSpotShadowTexture(map: bigint): bigint;
  isSpotShadowMapSupported(map: bigint): boolean;
  createCubeShadowMap(device: bigint, quality: number): bigint;
  destroyCubeShadowMap(map: bigint): void;
  updateCubeShadowMap(map: bigint, light: PointLightSnapshot): void;
  beginCubeShadowPass(map: bigint, faceIndex: number): void;
  endCubeShadowPass(map: bigint): void;
  getCubeShadowLightPosition(map: bigint): Vector3Snapshot;
  getCubeShadowLightRange(map: bigint): number;
  getCubeShadowQuality(map: bigint): number;
  getCubeShadowSize(map: bigint): number;
  getCubeShadowDepthBias(map: bigint): number;
  setCubeShadowDepthBias(map: bigint, bias: number): void;
  getCubeShadowCasterEffect(map: bigint): bigint;
  getCubeShadowTexture(map: bigint): bigint;
  isCubeShadowMapSupported(map: bigint): boolean;
  createShadowMap(device: bigint, quality: number): bigint;
  supportsShadowSampling(device: bigint): boolean;
  beginShadowPass(map: bigint, light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot): void;
  endShadowPass(map: bigint): void;
  applyShadowCaster(map: bigint): void;
  applySkinnedShadowCaster(
    map: bigint, bones: readonly (readonly number[])[], weightsPerVertex: number,
  ): void;
  getShadowCasterEffect(map: bigint): bigint;
  getSkinnedShadowCasterEffect(map: bigint): bigint;
  getShadowMapTexture(map: bigint): bigint;
  createParticleSystem(device: bigint, capacity: number): bigint;
  createParticleSystemAtDefaultCapacity(device: bigint): bigint;
  drawParticleSystem(
    system: bigint, view: readonly number[], projection: readonly number[], texture: bigint,
  ): void;
  setParticleDepthInput(system: bigint, depth: bigint, farPlane: number): void;
  getParticleSoftness(system: bigint): number;
  setParticleSoftness(system: bigint, softness: number): void;
  getParticleLookupGlsl(): string;
  destroyParticleSystem(system: bigint): void;
  resetParticleSystem(system: bigint): void;
  updateParticleSystem(system: bigint, elapsedSeconds: number): void;
  getParticleSystemCapacity(system: bigint): number;
  getParticleSystemActiveCount(system: bigint): number;
  particleSystemUsesCompute(system: bigint): boolean;
  isParticleSimulationForcedOnCpu(system: bigint): boolean;
  setParticleSimulationOnCpu(system: bigint, forced: boolean): void;
  isParticleEmissionRateClamped(system: bigint): boolean;
  getParticleSystemUnsupportedReason(system: bigint): string;
  getParticleEmitterSettings(system: bigint): ParticleEmitterSettingsSnapshot;
  setParticleEmitterSettings(system: bigint, settings: ParticleEmitterSettingsSnapshot): void;
  copyParticles(system: bigint): readonly ParticleSnapshot[];
  getDefaultParticleEmitterSettings(): ParticleEmitterSettingsSnapshot;
  getDefaultParticle(): ParticleSnapshot;
  particleRandom(seed: number): number;
  stepParticle(particle: ParticleSnapshot, index: number, settings: ParticleEmitterSettingsSnapshot, elapsedSeconds: number): ParticleSnapshot;
  destroyShadowMap(map: bigint): void;
  createDepthNormalPrepass(
    device: bigint, width: number, height: number, encoding: number,
  ): bigint;
  destroyDepthNormalPrepass(prepass: bigint): void;
  resizeDepthNormalPrepass(prepass: bigint, width: number, height: number): void;
  getDepthNormalPrepassPassCount(prepass: bigint): number;
  beginDepthNormalPrepass(
    prepass: bigint, passIndex: number, view: readonly number[], projection: readonly number[],
    nearPlane: number, farPlane: number,
  ): void;
  endDepthNormalPrepass(prepass: bigint): void;
  getDepthNormalPrepassEffect(prepass: bigint): bigint;
  getSkinnedDepthNormalPrepassEffect(prepass: bigint): bigint;
  getDepthNormalPrepassDepthTexture(prepass: bigint): bigint;
  getDepthNormalPrepassNormalTexture(prepass: bigint): bigint;
  getDepthNormalPrepassVelocityTexture(prepass: bigint): bigint;
  isDepthNormalPrepassSupported(prepass: bigint, device: bigint): boolean;
  isDepthNormalPrepassUsingMultipleRenderTargets(prepass: bigint): boolean;
  isDepthNormalPrepassDepthPacked(prepass: bigint): boolean;
  deviceUsesPackedDepth(device: bigint): boolean;
  getDepthNormalPrepassRoughness(prepass: bigint): number;
  setDepthNormalPrepassRoughness(prepass: bigint, roughness: number): void;
  isDepthNormalPrepassVelocityEnabled(prepass: bigint): boolean;
  setDepthNormalPrepassVelocityEnabled(prepass: bigint, enabled: boolean): void;
  setDepthNormalPrepassPreviousWorld(prepass: bigint, world: readonly number[]): void;
  setDepthNormalPrepassPreviousCamera(
    prepass: bigint, view: readonly number[], projection: readonly number[],
  ): void;
  getDepthDecodeGlsl(packed: boolean): string;
  getVelocityDecodeGlsl(): string;
  velocityTexelHasVelocity(texel: ColorSnapshot): boolean;
  decodeVelocityTexel(texel: ColorSnapshot): Vector2Snapshot;
  packLinearDepth(value: number): PackedDepthSnapshot;
  unpackLinearDepth(r: number, g: number, b: number, a: number): number;
  createAtmosphericSky(device: bigint): bigint;
  destroyAtmosphericSky(sky: bigint): void;
  isAtmosphericSkySupported(sky: bigint): boolean;
  drawAtmosphericSky(sky: bigint, view: readonly number[], projection: readonly number[], width: number, height: number): void;
  getAtmosphericSkySunDirection(sky: bigint): Vector3Snapshot;
  setAtmosphericSkySunDirection(sky: bigint, direction: Vector3Snapshot): void;
  getAtmosphericSkyTurbidity(sky: bigint): number;
  setAtmosphericSkyTurbidity(sky: bigint, turbidity: number): void;
  getAtmosphericSkyIntensity(sky: bigint): number;
  setAtmosphericSkyIntensity(sky: bigint, intensity: number): void;
  getAtmosphericSkyModelGlsl(): string;
  atmosphericSkyRadiance(viewDirection: Vector3Snapshot, sunDirection: Vector3Snapshot, turbidity: number): Vector3Snapshot;
  createSkybox(device: bigint, environment: bigint): bigint;
  destroySkybox(skybox: bigint): void;
  isSkyboxSupported(skybox: bigint): boolean;
  drawSkybox(skybox: bigint, view: readonly number[], projection: readonly number[], width: number, height: number): void;
  getSkyboxEnvironment(skybox: bigint): bigint;
  setSkyboxEnvironment(skybox: bigint, environment: bigint): void;
  setSkyboxOwnedEnvironment(skybox: bigint, environment: bigint): void;
  getSkyboxYaw(skybox: bigint): number;
  setSkyboxYaw(skybox: bigint, radians: number): void;
  getSkyboxIntensity(skybox: bigint): number;
  setSkyboxIntensity(skybox: bigint, intensity: number): void;
  getSkyboxTint(skybox: bigint): Vector3Snapshot;
  setSkyboxTint(skybox: bigint, tint: Vector3Snapshot): void;
  computeSkyboxViewRay(view: readonly number[], projection: readonly number[], ndcX: number, ndcY: number, yaw: number): Vector3Snapshot;
  createEnvironmentProcessor(device: bigint): bigint;
  destroyEnvironmentProcessor(processor: bigint): void;
  convertEquirectangular(processor: bigint, panorama: bigint, faceSize: number): bigint;
  generateIrradianceCube(processor: bigint, environment: bigint, size: number, sampleCount: number): bigint;
  generatePrefilteredSpecular(processor: bigint, environment: bigint, baseSize: number, mipCount: number, sampleCount: number): bigint;
  generateProbeFromEnvironment(processor: bigint, environment: bigint, position: Vector3Snapshot): bigint;
  generateBrdfLut(processor: bigint, size: number, sampleCount: number): bigint;
  mipForRoughness(roughness: number, mipCount: number): number;
  roughnessForMip(mip: number, mipCount: number): number;
  hammersleyPoint(index: number, count: number): Vector2Snapshot;
  importanceSampleGgx(x: number, y: number, normal: Vector3Snapshot, roughness: number): Vector3Snapshot;
  cubeFaceDirection(face: number, u: number, v: number): Vector3Snapshot;
  directionToEquirectangular(direction: Vector3Snapshot): Vector2Snapshot;
  getRenderPipelineSkybox(pipeline: bigint): bigint;
  setRenderPipelineSkybox(pipeline: bigint, skybox: bigint): void;
  createLightProbe(): bigint;
  createLightProbeAt(position: Vector3Snapshot): bigint;
  destroyLightProbe(probe: bigint): void;
  copyLightProbeFrom(destination: bigint, source: bigint): void;
  getLightProbePosition(probe: bigint): Vector3Snapshot;
  setLightProbePosition(probe: bigint, position: Vector3Snapshot): void;
  getLightProbeCoefficient(probe: bigint, index: number): Vector3Snapshot;
  setLightProbeCoefficient(probe: bigint, index: number, value: Vector3Snapshot): void;
  copyLightProbeCoefficients(probe: bigint): readonly Vector3Snapshot[];
  lightProbeIrradiance(probe: bigint, normal: Vector3Snapshot): Vector3Snapshot;
  setLightProbeVisibility(probe: bigint, direction: number, mean: number, meanSquared: number): void;
  getLightProbeVisibilityMean(probe: bigint, direction: number): number;
  getLightProbeVisibilityMeanSquared(probe: bigint, direction: number): number;
  lightProbeHasVisibility(probe: bigint): boolean;
  lightProbeVisibilityWeight(probe: bigint, direction: Vector3Snapshot, distance: number): number;
  isLightProbeZero(probe: bigint): boolean;
  scaleLightProbe(probe: bigint, factor: number): void;
  lightProbeEquals(first: bigint, second: bigint): boolean;
  getLightProbeEvaluationGlsl(): string;
  createLightProbeVolume(bounds: ClusterBoundsSnapshot, countX: number, countY: number, countZ: number): bigint;
  destroyLightProbeVolume(volume: bigint): void;
  getLightProbeVolumeBounds(volume: bigint): ClusterBoundsSnapshot;
  getLightProbeVolumeCountX(volume: bigint): number;
  getLightProbeVolumeCountY(volume: bigint): number;
  getLightProbeVolumeCountZ(volume: bigint): number;
  getLightProbeVolumeProbeCount(volume: bigint): number;
  getLightProbeVolumeProbePosition(volume: bigint, x: number, y: number, z: number): Vector3Snapshot;
  getLightProbeVolumeProbe(volume: bigint, x: number, y: number, z: number, into: bigint): void;
  setLightProbeVolumeProbe(volume: bigint, x: number, y: number, z: number, probe: bigint): void;
  lightProbeVolumeContains(volume: bigint, position: Vector3Snapshot): boolean;
  sampleLightProbeVolume(volume: bigint, position: Vector3Snapshot, into: bigint): void;
  lightProbeVolumeIrradiance(volume: bigint, position: Vector3Snapshot, normal: Vector3Snapshot): Vector3Snapshot;
  isLightProbeVolumeZero(volume: bigint): boolean;
  createLightProbeBaker(device: bigint): bigint;
  createLightProbeBakerWithFaceSize(device: bigint, faceSize: number): bigint;
  destroyLightProbeBaker(baker: bigint): void;
  isLightProbeBakerSupported(baker: bigint): boolean;
  getLightProbeBakerFaceSize(baker: bigint): number;
  getLightProbeBakerFaceCount(): number;
  getLightProbeBakerNearPlane(baker: bigint): number;
  getLightProbeBakerFarPlane(baker: bigint): number;
  setLightProbeBakerPlanes(baker: bigint, nearPlane: number, farPlane: number): void;
  getLightProbeBakerFaceView(baker: bigint, face: number, position: Vector3Snapshot): readonly number[];
  bakeLightProbe(baker: bigint, position: Vector3Snapshot, draw: SceneFaceDraw): bigint;
  bakeLightProbeVolumeLight(baker: bigint, volume: bigint, draw: SceneFaceDraw): number;
  bakeLightProbeVolumeVisibility(baker: bigint, volume: bigint, draw: SceneFaceDraw): number;
  createDecalPass(device: bigint): bigint;
  destroyDecalPass(pass: bigint): void;
  getDecalOpacity(pass: bigint): number;
  setDecalOpacity(pass: bigint, opacity: number): void;
  getDecalTint(pass: bigint): Vector3Snapshot;
  setDecalTint(pass: bigint, tint: Vector3Snapshot): void;
  getDecalMaxSlopeAngle(pass: bigint): number;
  setDecalMaxSlopeAngle(pass: bigint, radians: number): void;
  setDecalPrepassInputs(pass: bigint, depth: bigint, normals: bigint): void;
  setDecalCamera(
    pass: bigint, view: readonly number[], projection: readonly number[], farPlane: number,
  ): void;
  drawDecal(
    pass: bigint, decal: bigint, decalWorld: readonly number[], width: number, height: number,
  ): void;
  isInsideDecalBox(decalLocalPosition: Vector3Snapshot): boolean;
  isShadowMapSupported(map: bigint): boolean;
  getShadowMapSize(map: bigint): number;
  getShadowMapQuality(map: bigint): number;
  getShadowMapDepthBias(map: bigint): number;
  setShadowMapDepthBias(map: bigint, bias: number): void;
  getShadowMapFilterRadius(map: bigint): number;
  getShadowMapLightViewProjection(map: bigint): readonly number[];
  computeShadowLightView(light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot): readonly number[];
  computeShadowLightProjection(lightView: readonly number[], bounds: ClusterBoundsSnapshot): readonly number[];
  shadowMapSizeForQuality(quality: number): number;
  shadowMapFilterRadiusForQuality(quality: number): number;
  computeCascadeSplitDistances(nearPlane: number, farPlane: number, cascadeCount: number, lambda: number): readonly number[];
  computeCascadeFrustumCorners(view: readonly number[], projection: readonly number[]): readonly Vector3Snapshot[];
  computeCascadeBoundingSphere(corners: readonly Vector3Snapshot[]): { readonly Center: Vector3Snapshot; readonly Radius: number };
  computeSpotShadowLightView(light: SpotLightSnapshot): readonly number[];
  computeSpotShadowLightProjection(light: SpotLightSnapshot): readonly number[];
  computeCubeShadowFaceView(face: number, position: Vector3Snapshot): readonly number[];
  computeCubeShadowFaceProjection(range: number): readonly number[];
  cubeShadowMapSizeForQuality(quality: number): number;
  destroyLodGroup(group: bigint): void;
  addLodLevel(group: bigint, maxDistance: number): void;
  clearLodGroup(group: bigint): void;
  copyLodLevels(group: bigint): readonly number[];
  selectLodIndex(group: bigint, distance: number): number;
  getLodHysteresis(group: bigint): number;
  setLodHysteresis(group: bigint, margin: number): void;
  resetLodHysteresis(group: bigint): void;
  getLodSelectionMode(group: bigint): number;
  setLodSelectionMode(group: bigint, mode: number): void;
  setLodScreenSpaceParameters(group: bigint, radius: number, verticalFov: number, viewportHeight: number): void;
  getLodProjectedRadiusPixels(group: bigint, distance: number): number;
  createClusteredLightSet(device: bigint): bigint;
  addClusteredLight(set: bigint, light: ClusteredLightSnapshot): number;
  addClusteredPointLight(set: bigint, light: PointLightSnapshot): number;
  addClusteredSpotLight(set: bigint, light: SpotLightSnapshot): number;
  replaceClusteredLightAt(set: bigint, index: number, light: ClusteredLightSnapshot): void;
  removeClusteredLightAt(set: bigint, index: number): void;
  clearClusteredLightSet(set: bigint): void;
  getClusteredLightCount(set: bigint): number;
  isClusteredLightSetEmpty(set: bigint): boolean;
  getClusteredLightAt(set: bigint, index: number): ClusteredLightSnapshot;
  copyClusteredLights(set: bigint): readonly ClusteredLightSnapshot[];
  getClusteredLightBoundsAt(set: bigint, index: number): BoundingSphereSnapshot;
  copyClusteredLightBounds(set: bigint): readonly BoundingSphereSnapshot[];
  destroyClusteredLightSet(set: bigint): void;
  createClusterGrid(device: bigint, tilesX: number, tilesY: number, sliceCount: number): bigint;
  getClusterGridTilesX(grid: bigint): number;
  getClusterGridTilesY(grid: bigint): number;
  getClusterGridSliceCount(grid: bigint): number;
  getClusterGridClusterCount(grid: bigint): number;
  getClusterIndex(grid: bigint, x: number, y: number, slice: number): number;
  setClusterGridProjection(grid: bigint, projection: readonly number[], nearPlane: number, farPlane: number): void;
  clusterGridHasProjection(grid: bigint): boolean;
  getClusterGridNearPlane(grid: bigint): number;
  getClusterGridFarPlane(grid: bigint): number;
  getClusterGridInverseProjection(grid: bigint): readonly number[];
  getClusterSliceDistance(grid: bigint, slice: number): number;
  getClusterSliceForViewDistance(grid: bigint, viewDistance: number): number;
  getClusterBounds(grid: bigint, x: number, y: number, slice: number): ClusterBoundsSnapshot;
  destroyClusterGrid(grid: bigint): void;
  createClusteredLightAssignment(device: bigint): bigint;
  assignClusteredLights(assignment: bigint, grid: bigint, view: readonly number[], bounds: readonly BoundingSphereSnapshot[]): void;
  clearClusteredLightAssignment(assignment: bigint): void;
  getAssignmentLightCount(assignment: bigint): number;
  getAssignmentClusterCount(assignment: bigint): number;
  copyLightsInCluster(assignment: bigint, cluster: number): readonly number[];
  copyAssignmentIndices(assignment: bigint): readonly number[];
  copyAssignmentOffsets(assignment: bigint): readonly number[];
  getAssignmentTotalReferenceCount(assignment: bigint): number;
  getAssignmentMaxLightsPerCluster(assignment: bigint): number;
  destroyClusteredLightAssignment(assignment: bigint): void;
  createClusteredShadowPolicy(device: bigint, budget: number): bigint;
  getShadowPolicyBudget(policy: bigint): number;
  setShadowPolicyBudget(policy: bigint, budget: number): void;
  getShadowPolicyHysteresis(policy: bigint): number;
  setShadowPolicyHysteresis(policy: bigint, hysteresis: number): void;
  copyShadowPolicySelected(policy: bigint): readonly number[];
  isShadowPolicySelected(policy: bigint, lightIndex: number): boolean;
  getShadowPolicyScore(policy: bigint, lightIndex: number): number;
  getShadowPolicyRequestCount(policy: bigint): number;
  getShadowPolicyRefusedCount(policy: bigint): number;
  resetShadowPolicy(policy: bigint): void;
  selectShadowCasters(policy: bigint, lights: bigint, view: readonly number[], projection: readonly number[], cameraPosition: Vector3Snapshot): void;
  destroyClusteredShadowPolicy(policy: bigint): void;
  createStandaloneGraphicsDevice(
    adapterIndex: number, graphicsProfile: number, parameters: StandaloneDeviceParameters,
  ): bigint;
  destroyStandaloneGraphicsDevice(device: bigint): void;
  supportsGraphicsCapability(device: bigint, capability: number): boolean;
  getMaxComputeWorkGroupCount(device: bigint, axis: number): number;
  getMaxComputeWorkGroupSize(device: bigint, axis: number): number;
  getMaxComputeWorkGroupInvocations(device: bigint): number;
  createStorageBuffer(device: bigint, byteSize: number): bigint;
  createTypedStorageBuffer(device: bigint, elementCount: number, elementByteSize: number): bigint;
  setStorageBufferBytes(buffer: bigint, bytes: Uint8Array): void;
  getStorageBufferBytes(buffer: bigint, byteLength: number): Uint8Array;
  getStorageBufferByteSize(buffer: bigint): number;
  setStorageBufferElements(buffer: bigint, bytes: Uint8Array, elementByteSize: number): void;
  getStorageBufferElements(buffer: bigint, elementCount: number, elementByteSize: number): Uint8Array;
  getStorageBufferElementCount(buffer: bigint): number;
  getStorageBufferElementByteSize(buffer: bigint): number;
  destroyStorageBuffer(buffer: bigint): void;
  createComputeShader(device: bigint, source: string): bigint;
  setComputeShaderUniformInt(shader: bigint, name: string, value: number): void;
  setComputeShaderUniformFloat(shader: bigint, name: string, value: number): void;
  bindComputeStorageBuffer(shader: bigint, binding: number, buffer: bigint): void;
  bindComputeTexture(shader: bigint, unit: number, samplerName: string, texture: bigint): void;
  isComputeImageBindingSupported(shader: bigint): boolean;
  bindComputeImage(shader: bigint, unit: number, texture: bigint, access: number): void;
  dispatchComputeShader(shader: bigint, x: number, y: number, z: number): void;
  computeShaderBarrier(shader: bigint, bits: number): void;
  isComputeShaderValid(shader: bigint): boolean;
  getComputeShaderCompileError(shader: bigint): string;
  destroyComputeShader(shader: bigint): void;
  createGpuTimer(device: bigint): bigint;
  isGpuTimerSupported(timer: bigint): boolean;
  getGpuTimerUnsupportedReason(timer: bigint): string;
  beginGpuTimer(timer: bigint): void;
  endGpuTimer(timer: bigint): void;
  isGpuTimerResultAvailable(timer: bigint): boolean;
  pollGpuTimer(timer: bigint): boolean;
  getGpuTimerLastMilliseconds(timer: bigint): number;
  getGpuTimerSampleCount(timer: bigint): number;
  isGpuTimerOpen(timer: bigint): boolean;
  destroyGpuTimer(timer: bigint): void;
  createBlitPass(device: bigint): bigint;
  createColorGradePass(device: bigint): bigint;
  createIdentityLutTexture(device: bigint, size: number): bigint;
  getColorGradeInterpolation(pass: bigint): number;
  setColorGradeInterpolation(pass: bigint, interpolation: number): void;
  getColorGradeLut(pass: bigint): bigint;
  setColorGradeLut(pass: bigint, lut: bigint): void;
  getColorGradeVolumeLut(pass: bigint): bigint;
  setColorGradeVolumeLut(pass: bigint, lut: bigint): void;
  getColorGradeStrength(pass: bigint): number;
  setColorGradeStrength(pass: bigint, strength: number): void;
  lutSizeForStrip(width: number, height: number): number;
  parseCubeLut(text: string): bigint;
  destroyCubeLut(lut: bigint): void;
  getCubeLutSize(lut: bigint): number;
  getCubeLutEntry(lut: bigint, red: number, green: number, blue: number): Vector3Snapshot;
  getCubeLutDomainMin(lut: bigint): Vector3Snapshot;
  getCubeLutDomainMax(lut: bigint): Vector3Snapshot;
  isCubeLutUnitDomain(lut: bigint): boolean;
  getCubeLutTitle(lut: bigint): string;
  createCubeLutStripTexture(lut: bigint, device: bigint): bigint;
  createCubeLutVolumeTexture(lut: bigint, device: bigint): bigint;
  createDepthOfFieldPass(device: bigint): bigint;
  getDepthOfFieldFocusDistance(pass: bigint): number;
  setDepthOfFieldFocusDistance(pass: bigint, value: number): void;
  getDepthOfFieldFocalLength(pass: bigint): number;
  setDepthOfFieldFocalLength(pass: bigint, value: number): void;
  getDepthOfFieldFNumber(pass: bigint): number;
  setDepthOfFieldFNumber(pass: bigint, value: number): void;
  getDepthOfFieldMaxRadius(pass: bigint): number;
  setDepthOfFieldMaxRadius(pass: bigint, value: number): void;
  circleOfConfusionMillimetres( depth: number, focusDistance: number, focalLength: number, fNumber: number, ): number;
  createLensFlarePass(device: bigint): bigint;
  getLensFlareThreshold(pass: bigint): number;
  setLensFlareThreshold(pass: bigint, value: number): void;
  getLensFlareIntensity(pass: bigint): number;
  setLensFlareIntensity(pass: bigint, value: number): void;
  getLensFlareDispersal(pass: bigint): number;
  setLensFlareDispersal(pass: bigint, value: number): void;
  createMotionBlurPass(device: bigint): bigint;
  getMotionBlurStrength(pass: bigint): number;
  setMotionBlurStrength(pass: bigint, value: number): void;
  getMotionBlurMaxDistance(pass: bigint): number;
  setMotionBlurMaxDistance(pass: bigint, value: number): void;
  createChromaticAberrationPass(device: bigint): bigint;
  getChromaticAberrationStrength(pass: bigint): number;
  setChromaticAberrationStrength(pass: bigint, value: number): void;
  createFilmGrainPass(device: bigint): bigint;
  getFilmGrainIntensity(pass: bigint): number;
  setFilmGrainIntensity(pass: bigint, value: number): void;
  createAsciiPass(device: bigint): bigint;
  getAsciiPassEffect(pass: bigint): bigint;
  extractBloomChannel(value: number, threshold: number): number;
  tonemapChannel(mode: number, value: number, exposure: number, gamma: number): number;
  getFxaaFragmentGlsl(): string;
  getSsaoKernel(pass: bigint): readonly Vector3Snapshot[];
  getSsaoOcclusionGlsl(packed: boolean): string;
  evaluateThinFilmIridescence( outsideIor: number, filmIor: number, cosTheta: number, thicknessNanometres: number, baseReflectance: Vector3Snapshot, ): Vector3Snapshot;
  getThinFilmIridescenceGlsl(): string;
  createFullscreenPass(device: bigint): bigint;
  destroyFullscreenPass(pass: bigint): void;
  drawFullscreenPass( pass: bigint, source: bigint, destination: bigint, effect: bigint, width: number, height: number, ): void;
  drawFullscreenPassOverCurrentTarget( pass: bigint, source: bigint, effect: bigint, width: number, height: number, ): void;
  createEffectPass(device: bigint, effect: bigint, name: string): bigint;
  createOwningEffectPass(device: bigint, effect: bigint, name: string): bigint;
  getEffectPassEffect(pass: bigint): bigint;
  setEffectPassEffect(pass: bigint, effect: bigint): void;
  beginScopedRenderTarget(device: bigint, destination: bigint): bigint;
  endScopedRenderTarget(scope: bigint): void;
  scopedRenderTargetHasRecordedPrevious(scope: bigint): boolean;
  createAsciiEffect(device: bigint): bigint;
  destroyAsciiEffect(effect: bigint): void;
  getAsciiCellSize(effect: bigint): SizeSnapshot;
  setAsciiCellSize(effect: bigint, width: number, height: number): void;
  getAsciiQuantizeMode(effect: bigint): number;
  setAsciiQuantizeMode(effect: bigint, mode: number): void;
  drawAsciiEffect( effect: bigint, source: bigint, destination: RectangleSnapshot, ): void;
  getAsciiLastGridDimensions(effect: bigint): SizeSnapshot;
  createCrtEffect(device: bigint): bigint;
  getCrtScanlineIntensity(effect: bigint): number;
  setCrtScanlineIntensity(effect: bigint, value: number): void;
  getCrtCurvature(effect: bigint): number;
  setCrtCurvature(effect: bigint, value: number): void;
  getCrtVignetteIntensity(effect: bigint): number;
  setCrtVignetteIntensity(effect: bigint, value: number): void;
  getCrtMaskIntensity(effect: bigint): number;
  setCrtMaskIntensity(effect: bigint, value: number): void;
  getCrtMaskType(effect: bigint): number;
  setCrtMaskType(effect: bigint, maskType: number): void;
  createDepthEffect(device: bigint): bigint;
  getDepthEffectMode(effect: bigint): number;
  setDepthEffectMode(effect: bigint, mode: number): void;
  getDepthEffectDitherMode(effect: bigint): number;
  setDepthEffectDitherMode(effect: bigint, mode: number): void;
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
  getDefaultPbrMaterialExt(): PbrMaterialExtSnapshot;
  getDefaultTextureTransform(): TextureTransformSnapshot;
  pbrMaterialExtEquals(first: PbrMaterialExtSnapshot, second: PbrMaterialExtSnapshot): boolean;
  getPbrMaterialExtHashCode(material: PbrMaterialExtSnapshot): bigint;
  getPbrMaterialExtText(material: PbrMaterialExtSnapshot): string;
  applyPbrMaterialState(material: PbrMaterialExtSnapshot, device: bigint): void;
  getDeviceBlendState(device: bigint): BlendStateSnapshot;
  getDeviceRasterizerState(device: bigint): RasterizerStateSnapshot;
  createAerialPerspectivePass(graphicsDevice: bigint): bigint;
  getAerialPerspectiveSunDirection(pass: bigint): Vector3Snapshot;
  setAerialPerspectiveSunDirection(pass: bigint, value: Vector3Snapshot): void;
  getAerialPerspectiveTurbidity(pass: bigint): number;
  setAerialPerspectiveTurbidity(pass: bigint, value: number): void;
  getAerialPerspectiveIntensity(pass: bigint): number;
  setAerialPerspectiveIntensity(pass: bigint, value: number): void;
  getAerialPerspectiveScaleHeight(pass: bigint): number;
  setAerialPerspectiveScaleHeight(pass: bigint, value: number): void;
  createVolumetricFogPass(graphicsDevice: bigint): bigint;
  getVolumetricFogDensity(pass: bigint): number;
  setVolumetricFogDensity(pass: bigint, value: number): void;
  getVolumetricFogAnisotropy(pass: bigint): number;
  setVolumetricFogAnisotropy(pass: bigint, value: number): void;
  getVolumetricFogRange(pass: bigint): number;
  setVolumetricFogRange(pass: bigint, value: number): void;
  createHeightFogPass(graphicsDevice: bigint): bigint;
  getHeightFogColor(pass: bigint): Vector3Snapshot;
  setHeightFogColor(pass: bigint, value: Vector3Snapshot): void;
  getHeightFogDensity(pass: bigint): number;
  setHeightFogDensity(pass: bigint, value: number): void;
  getHeightFogFalloff(pass: bigint): number;
  setHeightFogFalloff(pass: bigint, value: number): void;
  getHeightFogBaseHeight(pass: bigint): number;
  setHeightFogBaseHeight(pass: bigint, value: number): void;
  createLightShaftPass(graphicsDevice: bigint): bigint;
  getLightShaftLightScreenPosition(pass: bigint): Vector2Snapshot;
  setLightShaftLightScreenPosition(pass: bigint, value: Vector2Snapshot): void;
  getLightShaftThreshold(pass: bigint): number;
  setLightShaftThreshold(pass: bigint, value: number): void;
  getLightShaftIntensity(pass: bigint): number;
  setLightShaftIntensity(pass: bigint, value: number): void;
  getLightShaftDecay(pass: bigint): number;
  setLightShaftDecay(pass: bigint, value: number): void;
  aerialPerspectiveCopyFallbackReason(pass: bigint): string;
  aerialPerspectiveAirMassForDistance(viewDirection: Vector3Snapshot, distance: number, scaleHeight: number): number;
  aerialPerspectiveTransmittance(turbidity: number, airMass: number): Vector3Snapshot;
  heightFogOpticalDepth(cameraHeight: number, rayHeightStep: number, distance: number, density: number, falloff: number, baseHeight: number, ): number;
  setVolumetricFogLight(pass: bigint, shadowMap: bigint, direction: Vector3Snapshot, color: Vector3Snapshot, ): void;
  createFrustumCuller(): bigint;
  destroyFrustumCuller(culler: bigint): void;
  setFrustumCullerViewProjection(culler: bigint, viewProjection: readonly number[]): void;
  setFrustumCullerCamera(culler: bigint, view: readonly number[], projection: readonly number[]): void;
  getFrustumCullerFrustum(culler: bigint): number[];
  isFrustumCullerBoxVisible(culler: bigint, box: ClusterBoundsSnapshot): boolean;
  isFrustumCullerSphereVisible(culler: bigint, sphere: BoundingSphereSnapshot): boolean;
  frustumCullerCullBoxes(culler: bigint, bounds: readonly ClusterBoundsSnapshot[]): number[];
  frustumCullerCullSpheres(culler: bigint, bounds: readonly BoundingSphereSnapshot[]): number[];
  frustumCullerCullTransforms(culler: bigint, transforms: readonly (readonly number[])[], bounds: readonly ClusterBoundsSnapshot[]): (number[])[];
  createGpuInstanceCuller(graphicsDevice: bigint): bigint;
  destroyGpuInstanceCuller(culler: bigint): void;
  isGpuInstanceCullerSupported(culler: bigint): boolean;
  getGpuInstanceCullerUnsupportedReason(culler: bigint): string;
  setGpuInstanceCullerInstances(culler: bigint, instances: readonly CullableInstanceSnapshot[]): void;
  getGpuInstanceCullerInstanceCount(culler: bigint): number;
  gpuInstanceCullerCull(culler: bigint, view: readonly number[], projection: readonly number[], indexCount: number, firstIndex: number, baseVertex: number): void;
  gpuInstanceCullerDraw(culler: bigint, primitiveType: number): void;
  getGpuInstanceCullerVisibleCount(culler: bigint): number;
  getGpuInstanceCullerInstanceLookupGlsl(): string;
  getInstancedRendererInstanceElements(): VertexElementSnapshot[];
  getInstancedRendererInstanceStride(): number;
  getInstancedRendererTintElements(): VertexElementSnapshot[];
  getInstancedRendererTintStride(): number;
  createDebugDraw(graphicsDevice: bigint): bigint;
  destroyDebugDraw(debug: bigint): void;
  beginDebugDraw(debug: bigint, view: readonly number[], projection: readonly number[]): void;
  endDebugDraw(debug: bigint): void;
  clearDebugDraw(debug: bigint): void;
  addDebugDrawLine(debug: bigint, from: Vector3Snapshot, to: Vector3Snapshot, color: number): void;
  addDebugDrawBox(debug: bigint, bounds: ClusterBoundsSnapshot, color: number): void;
  addDebugDrawSphere(debug: bigint, centre: Vector3Snapshot, radius: number, color: number, segments: number): void;
  addDebugDrawBoundingSphere(debug: bigint, sphere: BoundingSphereSnapshot, color: number, segments: number): void;
  addDebugDrawFrustum(debug: bigint, viewProjection: readonly number[], color: number): void;
  addDebugDrawCross(debug: bigint, position: Vector3Snapshot, size: number, color: number): void;
  isDebugDrawDepthTested(debug: bigint): boolean;
  setDebugDrawDepthTested(debug: bigint, value: boolean): void;
  getDebugDrawLineCount(debug: bigint): number;
  getDebugDrawVertices(debug: bigint, depthTested: boolean): DebugVertexSnapshot[];
  addDebugDrawPointLightGizmo(debug: bigint, light: PointLightSnapshot, color: number): void;
  addDebugDrawSpotLightGizmo(debug: bigint, light: SpotLightSnapshot, color: number, segments: number): void;
  addDebugDrawDirectionalLightGizmo(debug: bigint, light: DirectionalLightSnapshot, at: Vector3Snapshot, length: number, color: number): void;
  addDebugDrawProbeVolumeGizmo(debug: bigint, volume: bigint, color: number, crossSize: number): void;
  addDebugDrawCascadeGizmo(debug: bigint, cascades: bigint, color: number): void;
  createSpatialUpscalePass(graphicsDevice: bigint): bigint;
  destroySpatialUpscalePass(pass: bigint): void;
  getSpatialUpscaleSharpness(pass: bigint): number;
  setSpatialUpscaleSharpness(pass: bigint, value: number): void;
  isSpatialUpscaleEdgeAdaptive(pass: bigint): boolean;
  setSpatialUpscaleEdgeAdaptive(pass: bigint, value: boolean): void;
  drawSpatialUpscalePass(pass: bigint, source: bigint, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): void;
  isSpatialUpscaleIdentityScale(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): boolean;
  createHdrDisplayOutput(graphicsDevice: bigint): bigint;
  destroyHdrDisplayOutput(output: bigint): void;
  isHdrDisplayOutputSupported(output: bigint): boolean;
  getHdrDisplayColorSpace(output: bigint): number;
  setHdrDisplayColorSpace(output: bigint, value: number): void;
  getHdrDisplayPaperWhiteNits(output: bigint): number;
  setHdrDisplayPaperWhiteNits(output: bigint, value: number): void;
  getHdrDisplayPeakNits(output: bigint): number;
  setHdrDisplayPeakNits(output: bigint, value: number): void;
  drawHdrDisplayOutput(output: bigint, source: bigint, destination: bigint, width: number, height: number): void;
  hdrEncodePq(nits: number): number;
  hdrDecodePq(encoded: number): number;
  hdrRec709ToRec2020(color: Vector3Snapshot): Vector3Snapshot;
  hdrRollOff(nits: number, peakNits: number): number;
  hdrEncode(space: number, sceneLinear: Vector3Snapshot, paperWhiteNits: number, peakNits: number): Vector3Snapshot;
  createAutoExposure(graphicsDevice: bigint): bigint;
  destroyAutoExposure(autoExposure: bigint): void;
  measureAutoExposureLuminance(autoExposure: bigint, scene: bigint): number;
  updateAutoExposure(autoExposure: bigint, scene: bigint, deltaSeconds: number): number;
  getAutoExposureExposure(autoExposure: bigint): number;
  setAutoExposureExposure(autoExposure: bigint, value: number): void;
  getAutoExposureKeyValue(autoExposure: bigint): number;
  setAutoExposureKeyValue(autoExposure: bigint, value: number): void;
  getAutoExposureBrighteningSpeed(autoExposure: bigint): number;
  getAutoExposureDarkeningSpeed(autoExposure: bigint): number;
  setAutoExposureAdaptationSpeeds(autoExposure: bigint, brighteningPerSecond: number, darkeningPerSecond: number): void;
  setAutoExposureRange(autoExposure: bigint, minimum: number, maximum: number): void;
  getDefaultPipelineSettings(): PipelineSettingsSnapshot;
  normalizePipelineSettings(settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot;
  applyPipelineQualityPreset(settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot;
  getPipelineSettings(pipeline: bigint): PipelineSettingsSnapshot;
  setPipelineSettings(pipeline: bigint, settings: PipelineSettingsSnapshot): void;
  applyAutoExposureToSettings(autoExposure: bigint, settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot;
  addPipelineUserPass(pipeline: bigint, pass: bigint): void;
  clearPipelineUserPasses(pipeline: bigint): void;
  setPipelineDepthNormalInputs(pipeline: bigint, depth: bigint, normals: bigint): void;
  setPipelineVelocityInput(pipeline: bigint, velocity: bigint): void;
  setPipelineCamera(pipeline: bigint, view: readonly number[], projection: readonly number[], nearPlane: number, farPlane: number): void;
  setPipelineSkyboxCamera(pipeline: bigint, view: readonly number[], projection: readonly number[]): void;
  getPipelineTransparencyFallbackReason(pipeline: bigint): string;
  setPipelineGpuTimingEnabled(pipeline: bigint, value: boolean): void;
  isPipelineGpuTimingEnabled(pipeline: bigint): boolean;
  didPipelineSkyboxDraw(pipeline: bigint): boolean;
  didPipelineShadowPassRun(pipeline: bigint): boolean;
  getPipelineShadowMap(pipeline: bigint): bigint;
  getPipelineSceneTarget(pipeline: bigint): bigint;
  getPipelineSceneTargetFormat(pipeline: bigint): number;
  isPipelineUsingSceneTarget(pipeline: bigint): boolean;
  releasePipelineDeviceResources(pipeline: bigint): void;
  getPipelinePassTimingCount(pipeline: bigint): number;
  getPipelinePassTimingName(pipeline: bigint, index: number): string;
  createClusteredLightBuffer(graphicsDevice: bigint): bigint;
  destroyClusteredLightBuffer(buffer: bigint): void;
  uploadClusteredLightBuffer(buffer: bigint, lights: bigint, grid: bigint, assignment: bigint): void;
  bindClusteredLightBuffer(buffer: bigint, effect: bigint, firstUnit: number): void;
  isClusteredLightBufferUploaded(buffer: bigint): boolean;
  getClusteredLightBufferLightCount(buffer: bigint): number;
  getClusteredLightBufferClusterCount(buffer: bigint): number;
  getClusteredLightBufferReferenceCount(buffer: bigint): number;
  getClusteredLightLookupGlsl(): string;
  adoptClusteredLightAssignment(assignment: bigint, lightCount: number, offsets: readonly number[], indices: readonly number[]): void;
  createClusteredLightCompute(graphicsDevice: bigint, stride: number): bigint;
  destroyClusteredLightCompute(compute: bigint): void;
  isClusteredLightComputeSupported(compute: bigint): boolean;
  getClusteredLightComputeUnsupportedReason(compute: bigint): string;
  getClusteredLightComputeStride(compute: bigint): number;
  assignClusteredLightCompute(compute: bigint, grid: bigint, view: readonly number[], bounds: readonly BoundingSphereSnapshot[], assignment: bigint): void;
  didClusteredLightComputeUseCompute(compute: bigint): boolean;
  hasClusteredLightComputeOverflowed(compute: bigint): boolean;
  createClusteredForwardEffect(graphicsDevice: bigint): bigint;
  destroyClusteredForwardEffect(effect: bigint): void;
  isClusteredForwardEffectSupported(effect: bigint): boolean;
  beginClusteredForwardEffect(effect: bigint, world: readonly number[], view: readonly number[], projection: readonly number[], cameraPosition: Vector3Snapshot, lights: bigint): void;
  getClusteredForwardShader(effect: bigint): bigint;
  getClusteredForwardBaseColor(effect: bigint): Vector3Snapshot;
  setClusteredForwardBaseColor(effect: bigint, color: Vector3Snapshot): void;
  getClusteredForwardMetallic(effect: bigint): number;
  setClusteredForwardMetallic(effect: bigint, value: number): void;
  getClusteredForwardRoughness(effect: bigint): number;
  setClusteredForwardRoughness(effect: bigint, value: number): void;
  getClusteredForwardIor(effect: bigint): number;
  setClusteredForwardIor(effect: bigint, value: number): void;
  getClusteredForwardAmbient(effect: bigint): Vector3Snapshot;
  setClusteredForwardAmbient(effect: bigint, value: Vector3Snapshot): void;
  getClusteredForwardOpaqueFrame(effect: bigint): bigint;
  setClusteredForwardOpaqueFrame(effect: bigint, frame: bigint): void;
  getClusteredForwardMaterialExtensions(effect: bigint): bigint;
  setClusteredForwardMaterialExtensions(effect: bigint, extensions: bigint): void;
  hasClusteredForwardLightProbe(effect: bigint): boolean;
  clearClusteredForwardLightProbe(effect: bigint): void;
  setClusteredForwardLightProbe(effect: bigint, probe: bigint): void;
  setClusteredForwardLightProbeVolume(effect: bigint, volume: bigint): void;
  clusteredVolumeAttenuation(attenuationColor: Vector3Snapshot, attenuationDistance: number, thickness: number): Vector3Snapshot;
  clusteredLightContribution(inputs: ClusteredContributionSnapshot): Vector3Snapshot;
  clusteredLightContributionWithExtensions(inputs: ClusteredContributionSnapshot, extensions: bigint): Vector3Snapshot;
  addDebugDrawClusterSliceGizmo(debug: bigint, grid: bigint, inverseView: readonly number[], color: number): void;
  getDefaultAreaLight(): AreaLightSnapshot;
  isAreaLightValid(light: AreaLightSnapshot): boolean;
  createAreaLightBrdfTable(graphicsDevice: bigint): bigint;
  createAreaLightBrdfTableWithSize(graphicsDevice: bigint, size: number, sampleCount: number): bigint;
  destroyAreaLightBrdfTable(table: bigint): void;
  getAreaLightBrdfTableTexture(table: bigint): bigint;
  getAreaLightBrdfTableSize(table: bigint): number;
  getAreaLightBrdfTableSampleCount(table: bigint): number;
  getAreaLightBrdfTableGenerationMilliseconds(table: bigint): number;
  evaluateAreaLightBrdf(roughness: number, cosTheta: number, sampleCount: number): AreaLightBrdfTermsSnapshot;
  getAreaLightBrdfLookupGlsl(): string;
  getAreaLightQuad(light: AreaLightSnapshot, surface: Vector3Snapshot): Vector3Snapshot[];
  getAreaLightCoverage(quad: readonly Vector3Snapshot[], surface: Vector3Snapshot, lobeAxis: Vector3Snapshot, lobeScale: number, twoSided: boolean): number;
  getAreaLightContribution(light: AreaLightSnapshot, surface: Vector3Snapshot, normal: Vector3Snapshot, cameraPosition: Vector3Snapshot, baseColor: Vector3Snapshot, metallic: number, roughness: number): Vector3Snapshot;
  getAreaLightLobeScale(roughness: number): number;
  getAreaLightShadingGlsl(): string;
  setClusteredForwardAreaLight(effect: bigint, light: AreaLightSnapshot, table: bigint): void;
  hasClusteredForwardAreaLight(effect: bigint): boolean;
  clearClusteredForwardAreaLight(effect: bigint): void;
  createContactShadowPass(graphicsDevice: bigint): bigint;
  getContactShadowLightDirection(pass: bigint): Vector3Snapshot;
  setContactShadowLightDirection(pass: bigint, value: Vector3Snapshot): void;
  getContactShadowMaxDistance(pass: bigint): number;
  setContactShadowMaxDistance(pass: bigint, value: number): void;
  getContactShadowStepCount(pass: bigint): number;
  setContactShadowStepCount(pass: bigint, value: number): void;
  getContactShadowThickness(pass: bigint): number;
  setContactShadowThickness(pass: bigint, value: number): void;
  getContactShadowIntensity(pass: bigint): number;
  setContactShadowIntensity(pass: bigint, value: number): void;
  getContactShadowBias(pass: bigint): number;
  setContactShadowBias(pass: bigint, value: number): void;
  getContactShadowFallbackReason(pass: bigint): string;
  isContactShadowOccluded(rayViewDepth: number, sceneViewDepth: number, bias: number, thickness: number): boolean;
  getContactShadowOcclusionGlsl(): string;
  combineContactShadowVisibility(shadowMapVisibility: number, contactVisibility: number): number;
  createTransparentDrawList(): bigint;
  destroyTransparentDrawList(list: bigint): void;
  clearTransparentDrawList(list: bigint): void;
  submitTransparentDraw(list: bigint, bounds: ClusterBoundsSnapshot, draw: () => void): void;
  getTransparentDrawListCount(list: bigint): number;
  drawTransparentDrawListSorted(list: bigint, view: readonly number[]): void;
  getTransparentDrawListSortedOrder(list: bigint, view: readonly number[]): readonly number[];
  getTransparentDrawSortKey(bounds: ClusterBoundsSnapshot, cameraPosition: Vector3Snapshot): number;
  getCameraPositionOfView(view: readonly number[]): Vector3Snapshot;
  createWeightedBlendedTransparency(graphicsDevice: bigint, width: number, height: number): bigint;
  destroyWeightedBlendedTransparency(transparency: bigint): void;
  isWeightedBlendedTransparencySupported(transparency: bigint): boolean;
  getWeightedBlendedTransparencyUnsupportedReason(transparency: bigint): string;
  resizeWeightedBlendedTransparency(transparency: bigint, width: number, height: number): void;
  beginWeightedBlendedTransparency(transparency: bigint, farPlane: number): void;
  endWeightedBlendedTransparency(transparency: bigint): void;
  resolveWeightedBlendedTransparency(transparency: bigint, width: number, height: number): void;
  isWeightedBlendedTransparencyAccumulating(transparency: bigint): boolean;
  getWeightedBlendedAccumulationTexture(transparency: bigint): bigint;
  getWeightedBlendedRevealageTexture(transparency: bigint): bigint;
  getWeightedBlendedAccumulationGlsl(): string;
  getWeightedBlendedWeight(viewDepth: number, alpha: number, farPlane: number): number;
  createShaderEffect(graphicsDevice: bigint, vertexSource: string, fragmentSource: string): bigint;
  isShaderEffectValid(effect: bigint): boolean;
  shaderEffectHasRenderer(effect: bigint): boolean;
  getShaderEffectCompileError(effect: bigint): string;
  setShaderEffectUniformMatrix(effect: bigint, name: string, value: readonly number[]): void;
  setShaderEffectUniformVector4(effect: bigint, name: string, value: Vector4Snapshot): void;
  setShaderEffectUniformVector3(effect: bigint, name: string, value: Vector3Snapshot): void;
  setShaderEffectUniformVector2(effect: bigint, name: string, value: Vector2Snapshot): void;
  setShaderEffectUniformFloat(effect: bigint, name: string, value: number): void;
  setShaderEffectUniformInt32(effect: bigint, name: string, value: number): void;
  declareShaderEffectUniformBlock(effect: bigint, blockSizeBytes: number, names: readonly string[], offsets: readonly number[]): void;
  setShaderEffectUniformFloatArray(effect: bigint, name: string, values: readonly number[]): void;
  setShaderEffectUniformVector2Array(effect: bigint, name: string, values: readonly Vector2Snapshot[]): void;
  setShaderEffectUniformVec3Array(effect: bigint, name: string, values: readonly number[]): void;
  setShaderEffectUniformMat4Array(effect: bigint, name: string, values: readonly number[]): void;
  setShaderEffectTexture2D(effect: bigint, unit: number, texture: bigint): void;
  setShaderEffectTextureCube(effect: bigint, unit: number, texture: bigint): void;
  setShaderEffectTexture3D(effect: bigint, unit: number, texture: bigint): void;
  getShaderEffectWorld(effect: bigint): readonly number[];
  setShaderEffectWorld(effect: bigint, value: readonly number[]): void;
  getShaderEffectView(effect: bigint): readonly number[];
  setShaderEffectView(effect: bigint, value: readonly number[]): void;
  getShaderEffectProjection(effect: bigint): readonly number[];
  setShaderEffectProjection(effect: bigint, value: readonly number[]): void;
  createRenderTargetPool(graphicsDevice: bigint): bigint;
  acquirePooledRenderTarget(pool: bigint, width: number, height: number, format: number, depthFormat: number, slot: number): bigint;
  resetRenderTargetPool(pool: bigint): void;
  getRenderTargetPoolTargetCount(pool: bigint): number;
  getRenderTargetPoolEstimatedBytes(pool: bigint): number;
  destroyRenderTargetPool(pool: bigint): void;
  createShaderEffectFactory(graphicsDevice: bigint): bigint;
  acquireFactoryShaderEffect(factory: bigint, name: string, vertexSource: string, fragmentSource: string): bigint;
  shaderEffectFactoryContains(factory: bigint, name: string): boolean;
  getShaderEffectFactoryCompileCount(factory: bigint): number;
  clearShaderEffectFactory(factory: bigint): void;
  destroyShaderEffectFactory(factory: bigint): void;
  createDefaultPunctualLight(): PunctualLightSnapshot;
  createDefaultShadowCascadeState(): ShadowCascadeStateSnapshot;
  createDefaultImageBasedLight(): ImageBasedLightSnapshot;
  isImageBasedLightValid(light: ImageBasedLightSnapshot): boolean;
  setEffectPunctualLight(effect: bigint, light: PunctualLightSnapshot): void;
  getEffectPunctualLight(effect: bigint): PunctualLightSnapshot;
  setEffectShadowCascades(effect: bigint, state: ShadowCascadeStateSnapshot): void;
  getEffectShadowCascades(effect: bigint): ShadowCascadeStateSnapshot;
  setEffectImageBasedLight(effect: bigint, light: ImageBasedLightSnapshot): void;
  getEffectImageBasedLight(effect: bigint): ImageBasedLightSnapshot;
  setEffectLightViewProjection(effect: bigint, value: readonly number[]): void;
  getEffectLightViewProjection(effect: bigint): readonly number[];
  setEffectShadowsEnabled(effect: bigint, value: boolean): void;
  isEffectShadowsEnabled(effect: bigint): boolean;
  setEffectShadowDepthBias(effect: bigint, value: number): void;
  getEffectShadowDepthBias(effect: bigint): number;
  setEffectShadowFilterRadius(effect: bigint, value: number): void;
  getEffectShadowFilterRadius(effect: bigint): number;
  setEffectShadowMap(effect: bigint, shadowMap: bigint): void;
  getEffectShadowMap(effect: bigint): bigint;
  createDefaultIndirectDrawArguments(): IndirectDrawArgumentsSnapshot;
  createDefaultIndirectDrawIndexedArguments(): IndirectDrawIndexedArgumentsSnapshot;
  drawPrimitivesIndirect(graphicsDevice: bigint, primitiveType: number, argumentBuffer: bigint, argumentByteOffset: number): void;
  drawIndexedPrimitivesIndirect(graphicsDevice: bigint, primitiveType: number, argumentBuffer: bigint, argumentByteOffset: number): void;
  graphicsMemoryBarrierHas(mask: number, bit: number): boolean;
  createDefaultGpuCullableInstance(): GpuCullableInstanceSnapshot;
  getPostProcessChainTargetPool(chain: bigint): bigint;
  loadCubeLutFromFile(path: string): bigint;
  getEngineLayerVersion(): number;
  getEngineLayerVersionString(): string;
  setRenderPipelineShadowScene(pipeline: bigint, shadowMap: bigint, light: DirectionalLightSnapshot, sceneBounds: ClusterBoundsSnapshot, drawCasters: (() => void) | null): void;
  setRenderPipelineTransparentScene(pipeline: bigint, draw: (() => void) | null): void;
  applyPipelineSettingsFromString(settings: PipelineSettingsSnapshot, text: string): { Applied: number; Settings: PipelineSettingsSnapshot };
  getPipelinePassTiming(pipeline: bigint, index: number): { Milliseconds: number; SampleCount: number };
  applyPbrEffectMaterial(effect: bigint, material: PbrMaterialExtSnapshot): void;
  extractPbrEffectMaterial(effect: bigint): PbrMaterialExtSnapshot;
  applySkinnedPbrEffectMaterial(effect: bigint, material: PbrMaterialExtSnapshot): void;
  extractSkinnedPbrEffectMaterial(effect: bigint): PbrMaterialExtSnapshot;
  createPbrMaterialExtensions(): bigint;
  destroyPbrMaterialExtensions(extensions: bigint): void;
  copyPbrMaterialExtensionsFrom(destination: bigint, source: bigint): void;
  pbrMaterialExtensionsEquals(first: bigint, second: bigint): boolean;
  getPbrMaterialExtensionsHashCode(extensions: bigint): bigint;
  getPbrMaterialExtensionsText(extensions: bigint): string;
  getDefaultGltfMaterialSource(): GltfMaterialSourceSnapshot;
  getDefaultGltfMaterialTextures(): GltfMaterialTexturesSnapshot;
  getDefaultGltfExtensionSource(): GltfExtensionSourceSnapshot;
  getDefaultGltfExtensionTextures(): GltfExtensionTexturesSnapshot;
  buildGltfPbrMaterial(source: GltfMaterialSourceSnapshot, textures: GltfMaterialTexturesSnapshot): PbrMaterialExtSnapshot;
  buildGltfPbrMaterialExtensions(source: GltfExtensionSourceSnapshot, textures: GltfExtensionTexturesSnapshot, extensions: bigint): void;
  createPbrEffect(graphicsDevice: bigint): bigint;
  createSkinnedPbrEffect(graphicsDevice: bigint): bigint;
  getPbrEffectAlpha(effect: bigint): number;
  getPbrEffectAlphaCutoff(effect: bigint): number;
  getPbrEffectAlphaMode(effect: bigint): number;
  getPbrEffectDiffuseColor(effect: bigint): Vector3Snapshot;
  getPbrEffectDoubleSided(effect: bigint): boolean;
  getPbrEffectEmissiveFactor(effect: bigint): Vector3Snapshot;
  getPbrEffectEncodeOutputToSrgb(effect: bigint): boolean;
  getPbrEffectIor(effect: bigint): number;
  getPbrEffectMetallicFactor(effect: bigint): number;
  getPbrEffectNormalScale(effect: bigint): number;
  getPbrEffectOcclusionStrength(effect: bigint): number;
  getPbrEffectRoughnessFactor(effect: bigint): number;
  getPbrEffectSpecularColorFactor(effect: bigint): Vector3Snapshot;
  getPbrEffectSpecularFactor(effect: bigint): number;
  getPbrEffectTexture(effect: bigint, slot: number): bigint;
  getPbrEffectTextureCoordinateSet(effect: bigint, slot: number): number;
  getPbrEffectTextureIsSrgb(effect: bigint, slot: number): boolean;
  getPbrEffectTextureTransform(effect: bigint, slot: number): TextureTransformSnapshot;
  getPbrEffectVertexColorEnabled(effect: bigint): boolean;
  getSkinnedPbrEffectBoneTransforms(effect: bigint, count: number): (number[])[];
  getSkinnedPbrEffectWeightsPerVertex(effect: bigint): number;
  setPbrEffectAlpha(effect: bigint, value: number): void;
  setPbrEffectAlphaCutoff(effect: bigint, value: number): void;
  setPbrEffectAlphaMode(effect: bigint, value: number): void;
  setPbrEffectDiffuseColor(effect: bigint, value: Vector3Snapshot): void;
  setPbrEffectDoubleSided(effect: bigint, value: boolean): void;
  setPbrEffectEmissiveFactor(effect: bigint, value: Vector3Snapshot): void;
  setPbrEffectEncodeOutputToSrgb(effect: bigint, value: boolean): void;
  setPbrEffectIor(effect: bigint, value: number): void;
  setPbrEffectMetallicFactor(effect: bigint, value: number): void;
  setPbrEffectNormalScale(effect: bigint, value: number): void;
  setPbrEffectOcclusionStrength(effect: bigint, value: number): void;
  setPbrEffectRoughnessFactor(effect: bigint, value: number): void;
  setPbrEffectSpecularColorFactor(effect: bigint, value: Vector3Snapshot): void;
  setPbrEffectSpecularFactor(effect: bigint, value: number): void;
  setPbrEffectTexture(effect: bigint, slot: number, texture: bigint): void;
  setPbrEffectTextureCoordinateSet(effect: bigint, slot: number, value: number): void;
  setPbrEffectTextureIsSrgb(effect: bigint, slot: number, value: boolean): void;
  setPbrEffectTextureTransform(effect: bigint, slot: number, transform: TextureTransformSnapshot): void;
  setPbrEffectVertexColorEnabled(effect: bigint, value: boolean): void;
  setSkinnedPbrEffectBoneTransforms(effect: bigint, transforms: readonly (readonly number[])[]): void;
  setSkinnedPbrEffectWeightsPerVertex(effect: bigint, value: number): void;
  getPbrExtensionAttenuationColor(extensions: bigint): Vector3Snapshot;
  getPbrExtensionAttenuationDistance(extensions: bigint): number;
  getPbrExtensionClearcoatFactor(extensions: bigint): number;
  getPbrExtensionClearcoatNormalScale(extensions: bigint): number;
  getPbrExtensionClearcoatNormalTexture(extensions: bigint): bigint;
  getPbrExtensionClearcoatRoughness(extensions: bigint): number;
  getPbrExtensionClearcoatRoughnessTexture(extensions: bigint): bigint;
  getPbrExtensionClearcoatTexture(extensions: bigint): bigint;
  getPbrExtensionIridescenceFactor(extensions: bigint): number;
  getPbrExtensionIridescenceIor(extensions: bigint): number;
  getPbrExtensionIridescenceTexture(extensions: bigint): bigint;
  getPbrExtensionIridescenceThicknessMaximum(extensions: bigint): number;
  getPbrExtensionIridescenceThicknessMinimum(extensions: bigint): number;
  getPbrExtensionIridescenceThicknessTexture(extensions: bigint): bigint;
  getPbrExtensionSheenColorFactor(extensions: bigint): Vector3Snapshot;
  getPbrExtensionSheenColorTexture(extensions: bigint): bigint;
  getPbrExtensionSheenRoughness(extensions: bigint): number;
  getPbrExtensionSheenRoughnessTexture(extensions: bigint): bigint;
  getPbrExtensionSubsurfaceColor(extensions: bigint): Vector3Snapshot;
  getPbrExtensionSubsurfaceWrap(extensions: bigint): number;
  getPbrExtensionThicknessFactor(extensions: bigint): number;
  getPbrExtensionThicknessTexture(extensions: bigint): bigint;
  getPbrExtensionTransmissionFactor(extensions: bigint): number;
  getPbrExtensionTransmissionTexture(extensions: bigint): bigint;
  pbrExtensionIsIridescenceEnabled(extensions: bigint): boolean;
  pbrExtensionIsNeutral(extensions: bigint): boolean;
  pbrExtensionIsSheenEnabled(extensions: bigint): boolean;
  pbrExtensionIsSubsurfaceEnabled(extensions: bigint): boolean;
  pbrExtensionIsTransmissionEnabled(extensions: bigint): boolean;
  setPbrExtensionAttenuationColor(extensions: bigint, value: Vector3Snapshot): void;
  setPbrExtensionAttenuationDistance(extensions: bigint, value: number): void;
  setPbrExtensionClearcoatFactor(extensions: bigint, value: number): void;
  setPbrExtensionClearcoatNormalScale(extensions: bigint, value: number): void;
  setPbrExtensionClearcoatNormalTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionClearcoatRoughness(extensions: bigint, value: number): void;
  setPbrExtensionClearcoatRoughnessTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionClearcoatTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionIridescenceFactor(extensions: bigint, value: number): void;
  setPbrExtensionIridescenceIor(extensions: bigint, value: number): void;
  setPbrExtensionIridescenceTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionIridescenceThicknessMaximum(extensions: bigint, value: number): void;
  setPbrExtensionIridescenceThicknessMinimum(extensions: bigint, value: number): void;
  setPbrExtensionIridescenceThicknessTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionSheenColorFactor(extensions: bigint, value: Vector3Snapshot): void;
  setPbrExtensionSheenColorTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionSheenRoughness(extensions: bigint, value: number): void;
  setPbrExtensionSheenRoughnessTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionSubsurfaceColor(extensions: bigint, value: Vector3Snapshot): void;
  setPbrExtensionSubsurfaceWrap(extensions: bigint, value: number): void;
  setPbrExtensionThicknessFactor(extensions: bigint, value: number): void;
  setPbrExtensionThicknessTexture(extensions: bigint, texture: bigint): void;
  setPbrExtensionTransmissionFactor(extensions: bigint, value: number): void;
  setPbrExtensionTransmissionTexture(extensions: bigint, texture: bigint): void;
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
  guideBeginShowMessageBox(
    player: number, title: string, text: string, buttons: readonly string[],
    focusButton: number, icon: number, onCompleted: () => void,
  ): unknown;
  guideEndShowMessageBox(token: unknown): number | null;
  guideHasPendingMessageBox(): boolean;
  guidePendingMessageBoxFocusButton(): number;
  guideSimulateMessageBoxClick(buttonIndex: number): void;
  guideBeginShowKeyboardInput(
    player: number, title: string, description: string, defaultText: string,
    usePasswordMode: boolean, onCompleted: () => void,
  ): unknown;
  guideEndShowKeyboardInput(token: unknown): string | null;
  guideHasPendingKeyboardInput(): boolean;
  guideWasKeyboardInputCanceled(): boolean;
  guidePendingKeyboardInputTitle(): string;
  guidePendingKeyboardInputDescription(): string;
  guidePendingKeyboardInputDisplayText(): string;
  guideSimulateKeyboardInputCancel(): void;
  guideResetPendingKeyboardInput(): void;
  setGuideNotificationPosition(position: number): void;
  textInputSubscribeInput(handler: (character: string) => void): bigint;
  textInputSubscribeEditing(handler: (editing: TextEditingSnapshot) => void): bigint;
  textInputSubscribeCandidates(handler: (value: TextEditingCandidatesSnapshot) => void): bigint;
  textInputUnsubscribe(registration: bigint): void;
  textInputRaiseInput(game: bigint, codeUnit: number): void;
  textInputRaiseEditing(game: bigint, text: string, start: number, length: number): void;
  textInputRaiseCandidates(
    game: bigint, candidates: readonly string[], selected: number, horizontal: boolean,
  ): void;
  textInputStart(game: bigint): void;
  textInputStartWithType(game: bigint, type: number): void;
  textInputStop(game: bigint): void;
  textInputIsActive(game: bigint): boolean;
  textInputIsScreenKeyboardShown(game: bigint): boolean;
  textInputSetRectangle(game: bigint, x: number, y: number, width: number, height: number): void;
  textInputResetForTests(game: bigint): void;
  mouseCursorGetStock(game: bigint, stock: number): bigint;
  mouseCursorCreateFromTexture(game: bigint, texture: bigint, x: number, y: number): bigint;
  mouseCursorDispose(cursor: bigint): void;
  mouseCursorDestroy(cursor: bigint): void;
  mouseSetCursor(game: bigint, cursor: bigint): void;
  joysticksGetCount(game: bigint): number;
  joysticksGetInfoAt(game: bigint, index: number): JoystickInfoSnapshot;
  joysticksGetNameAt(game: bigint, index: number): string;
  joysticksGetCapabilities(game: bigint, id: number): JoystickCapabilitiesSnapshot;
  joysticksGetCapabilitiesName(game: bigint, id: number): string;
  joysticksGetCapabilitiesGuid(game: bigint, id: number): string;
  joysticksCaptureState(game: bigint, id: number): JoystickStateSnapshot;
  hapticsGetCount(game: bigint): number;
  hapticsGetIdAt(game: bigint, index: number): number;
  hapticsGetNameAt(game: bigint, index: number): string;
  hapticsIsJoystickHaptic(game: bigint, joystickId: number): boolean;
  hapticsOpen(game: bigint, id: number): bigint;
  hapticsOpenFromJoystick(game: bigint, joystickId: number): bigint;
  hapticDeviceGetCapabilities(device: bigint): HapticCapabilitiesSnapshot;
  hapticDeviceGetName(device: bigint): string;
  hapticDeviceGetIsOpen(device: bigint): boolean;
  hapticDeviceInitRumble(device: bigint): boolean;
  hapticDevicePlayRumble(device: bigint, strength: number, lengthMilliseconds: number): boolean;
  hapticDeviceStopRumble(device: bigint): boolean;
  hapticDeviceSetGain(device: bigint, gain: number): boolean;
  hapticDeviceDispose(device: bigint): void;
  hapticDeviceDestroy(device: bigint): void;
  getSensorSupport(game: bigint): SensorSupportSnapshot;
  createAccelerometer(game: bigint): bigint;
  destroyAccelerometer(sensor: bigint): void;
  startAccelerometer(sensor: bigint): void;
  stopAccelerometer(sensor: bigint): void;
  getAccelerometerState(sensor: bigint): SensorStateSnapshot;
  setAccelerometerInterval(sensor: bigint, ticks: bigint): void;
  getAccelerometerReading(sensor: bigint): AccelerometerReadingSnapshot;
  graphicsAdapterCount(device: bigint): number;
  graphicsAdaptersRefresh(device: bigint): void;
  graphicsAdapterInfo(device: bigint, index: number): GraphicsAdapterInfoSnapshot;
  graphicsAdapterDescription(device: bigint, index: number): string;
  graphicsAdapterDeviceName(device: bigint, index: number): string;
  graphicsAdapterCurrentDisplayMode(device: bigint, index: number): DisplayModeSnapshot;
  graphicsAdapterDisplayModes(device: bigint, index: number): DisplayModeSnapshot[];
  graphicsAdapterIsProfileSupported(device: bigint, index: number, profile: number): boolean;
  graphicsAdapterQueryBackBufferFormat(
    device: bigint, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot;
  graphicsAdapterQueryRenderTargetFormat(
    device: bigint, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot;
  graphicsAdapterSetDevicePreferences(
    device: bigint, index: number, useNullDevice: boolean, useReferenceDevice: boolean,
  ): void;
  compassCreate(game: bigint): bigint;
  compassDestroy(sensor: bigint): void;
  compassStart(sensor: bigint): void;
  compassStop(sensor: bigint): void;
  compassDispose(sensor: bigint): void;
  compassGetState(sensor: bigint): number;
  compassIsDataValid(sensor: bigint): boolean;
  compassGetReading(sensor: bigint): CompassReadingSnapshot;
  compassGetInterval(sensor: bigint): bigint;
  compassSetInterval(sensor: bigint, ticks: bigint): void;
  compassInject(sensor: bigint, reading: CompassReadingSnapshot): void;
  compassSetTestBackend(sensor: bigint, installed: boolean, supported: boolean): void;
  gyroscopeCreate(game: bigint): bigint;
  gyroscopeDestroy(sensor: bigint): void;
  gyroscopeStart(sensor: bigint): void;
  gyroscopeStop(sensor: bigint): void;
  gyroscopeDispose(sensor: bigint): void;
  gyroscopeGetState(sensor: bigint): number;
  gyroscopeIsDataValid(sensor: bigint): boolean;
  gyroscopeGetReading(sensor: bigint): GyroscopeReadingSnapshot;
  gyroscopeGetInterval(sensor: bigint): bigint;
  gyroscopeSetInterval(sensor: bigint, ticks: bigint): void;
  gyroscopeInject(sensor: bigint, x: number, y: number, z: number): void;
  gyroscopeSetSupported(sensor: bigint, supported: boolean): void;
  motionCreate(game: bigint): bigint;
  motionDestroy(sensor: bigint): void;
  motionStart(sensor: bigint): void;
  motionStop(sensor: bigint): void;
  motionDispose(sensor: bigint): void;
  motionGetState(sensor: bigint): number;
  motionIsDataValid(sensor: bigint): boolean;
  motionIsNorthReferenced(sensor: bigint): boolean;
  motionGetReading(sensor: bigint): MotionReadingSnapshot;
  motionGetInterval(sensor: bigint): bigint;
  motionSetInterval(sensor: bigint, ticks: bigint): void;
  motionInject(sensor: bigint, reading: MotionReadingSnapshot): void;
  motionSetTestBackend(
    sensor: bigint, installed: boolean, supported: boolean, northReferenced: boolean,
  ): void;
  isDeviceExtensionLayerAvailable(): boolean;
  getHostDeviceInfo(game: bigint): HostDeviceSnapshot;
  getPreferredLocales(game: bigint): PreferredLocaleSnapshot[];
  setClipboardText(game: bigint, text: string): boolean;
  getCameras(game: bigint): CameraInventorySnapshot;
  createCamera(game: bigint): bigint;
  createTestCamera(game: bigint): bigint;
  getCameraState(camera: bigint): number;
  getCameraFrameWidth(camera: bigint): number;
  getCameraFrameHeight(camera: bigint): number;
  tryAcquireCameraFrame(camera: bigint, texture: bigint): boolean;
  setTestCameraState(camera: bigint, state: number): void;
  setTestCameraFrame(camera: bigint, width: number, height: number, pixels: Uint8Array | null): void;
  destroyCamera(camera: bigint): void;
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
    CnaDeviceBackend, CnaGamerServicesBackend, CnaSensorBackend,
    CnaDepthNormalPrepassBackend, CnaDecalBackend, CnaLightProbeBackend,
    CnaAtmosphereBackend {
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
  public readonly Compute: CnaComputeBackend = this;
  public readonly ClusteredLighting: CnaClusteredLightingBackend = this;
  public readonly Lod: CnaLodBackend = this;
  public readonly Shadows: CnaShadowBackend = this;
  public readonly DepthNormalPrepass: CnaDepthNormalPrepassBackend = this;
  public readonly Decals: CnaDecalBackend = this;
  public readonly LightProbes: CnaLightProbeBackend = this;
  public readonly Atmosphere: CnaAtmosphereBackend = this;
  public readonly Particles: CnaParticleBackend = this;
  public readonly Content: CnaContentBackend = this;
  public readonly Devices: CnaDeviceBackend = this;
  public readonly GamerServices: CnaGamerServicesBackend = this;
  public readonly Sensors: CnaSensorBackend = this;
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
  public cnbWriterGetLimits(writer: NativeHandle): CnbLimitsSnapshot {
    return this.#bridge.cnbWriterGetLimits(writer);
  }
  public cnbWriterSetLimits(writer: NativeHandle, limits: CnbLimitsSnapshot): void {
    this.#bridge.cnbWriterSetLimits(writer, limits);
  }
  public cnbByteWriterCreate(initial: Uint8Array | null): NativeHandle {
    return this.#bridge.cnbByteWriterCreate(initial);
  }
  public cnbByteWriterDestroy(writer: NativeHandle): void {
    this.#bridge.cnbByteWriterDestroy(writer);
  }
  public cnbByteWriterWriteU8(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteU8(writer, value);
  }
  public cnbByteWriterWriteU16(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteU16(writer, value);
  }
  public cnbByteWriterWriteU32(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteU32(writer, value);
  }
  public cnbByteWriterWriteU64(writer: NativeHandle, value: bigint): void {
    this.#bridge.cnbByteWriterWriteU64(writer, value);
  }
  public cnbByteWriterWriteI32(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteI32(writer, value);
  }
  public cnbByteWriterWriteF32(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteF32(writer, value);
  }
  public cnbByteWriterWriteF64(writer: NativeHandle, value: number): void {
    this.#bridge.cnbByteWriterWriteF64(writer, value);
  }
  public cnbByteWriterWriteString(writer: NativeHandle, value: string): void {
    this.#bridge.cnbByteWriterWriteString(writer, value);
  }
  public cnbByteWriterWriteBytes(writer: NativeHandle, bytes: Uint8Array): void {
    this.#bridge.cnbByteWriterWriteBytes(writer, bytes);
  }
  public cnbByteWriterWriteZeros(writer: NativeHandle, byteCount: number): void {
    this.#bridge.cnbByteWriterWriteZeros(writer, byteCount);
  }
  public cnbByteWriterGetSize(writer: NativeHandle): number {
    return this.#bridge.cnbByteWriterGetSize(writer);
  }
  public cnbByteWriterCopyBytes(writer: NativeHandle): Uint8Array {
    return this.#bridge.cnbByteWriterCopyBytes(writer);
  }
  public cnbByteWriterTake(writer: NativeHandle): Uint8Array {
    return this.#bridge.cnbByteWriterTake(writer);
  }
  public cnbWriterCreate(assetTypeId: number, assetSchemaVersion: number): NativeHandle {
    return this.#bridge.cnbWriterCreate(assetTypeId, assetSchemaVersion);
  }
  public cnbWriterDestroy(writer: NativeHandle): void {
    this.#bridge.cnbWriterDestroy(writer);
  }
  public cnbWriterSetMetadata(writer: NativeHandle, assetTypeName: string, contentName: string): void {
    this.#bridge.cnbWriterSetMetadata(writer, assetTypeName, contentName);
  }
  public cnbWriterAddExternalReference(writer: NativeHandle, flags: number, expectedAssetTypeId: number, logicalName: string): void {
    this.#bridge.cnbWriterAddExternalReference(writer, flags, expectedAssetTypeId, logicalName);
  }
  public cnbWriterClearExternalReferences(writer: NativeHandle): void {
    this.#bridge.cnbWriterClearExternalReferences(writer);
  }
  public cnbWriterAddChunk(writer: NativeHandle, chunkId: number, data: Uint8Array, flags: number, alignment: number): void {
    this.#bridge.cnbWriterAddChunk(writer, chunkId, data, flags, alignment);
  }
  public cnbWriterGetSchemaChunkCount(writer: NativeHandle): number {
    return this.#bridge.cnbWriterGetSchemaChunkCount(writer);
  }
  public cnbWriterSetCompression(writer: NativeHandle, codec: number, level: number): void {
    this.#bridge.cnbWriterSetCompression(writer, codec, level);
  }
  public cnbWriterAppendEmbeddedTexture2D(writer: NativeHandle, texture: NativeHandle, label: string): void {
    this.#bridge.cnbWriterAppendEmbeddedTexture2D(writer, texture, label);
  }
  public cnbWriterBuild(writer: NativeHandle): Uint8Array {
    return this.#bridge.cnbWriterBuild(writer);
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



  // ---- the CNB curve and animation-clip schemas ------------------------------------------------
  // The curve's native handle never reaches TypeScript: the bridge reads the whole thing out and
  // releases it, because XNA's `Curve` is a managed value type this package implements exactly.
  public cnbEncodeCurve(curve: CnbCurveSnapshot, contentName: string): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeCurve(curve, contentName));
  }
  public cnbDecodeCurve(document: NativeHandle): CnbCurveSnapshot {
    return this.#bridge.cnbDecodeCurve(document);
  }
  public cnbEncodeAnimationClip(
    durationSeconds: number,
    tracks: readonly { readonly BoneIndex: number; readonly Keyframes: readonly CnbKeyframeSnapshot[] }[],
    targetSpace: number,
    contentName: string,
  ): Uint8Array {
    return new Uint8Array(
      this.#bridge.cnbEncodeAnimationClip(durationSeconds, tracks, targetSpace, contentName),
    );
  }
  public cnbDecodeAnimationClip(document: NativeHandle): NativeHandle {
    return this.#bridge.cnbDecodeAnimationClip(document);
  }
  public cnbAnimationClipDestroy(clip: NativeHandle): void {
    this.#bridge.cnbAnimationClipDestroy(clip);
  }
  public cnbAnimationClipGet(clip: NativeHandle): {
    readonly DurationSeconds: number; readonly TrackCount: number; readonly TargetSpace: number;
  } {
    return this.#bridge.cnbAnimationClipGet(clip);
  }
  public cnbAnimationClipGetTrack(clip: NativeHandle, track: number): {
    readonly BoneIndex: number; readonly KeyframeCount: number;
  } {
    return this.#bridge.cnbAnimationClipGetTrack(clip, track);
  }
  public cnbAnimationClipCopyKeyframes(
    clip: NativeHandle, track: number,
  ): readonly CnbKeyframeSnapshot[] {
    return this.#bridge.cnbAnimationClipCopyKeyframes(clip, track);
  }
  // ---- the CNB media schemas -------------------------------------------------------------------
  // A song and a video container carry a *stream reference* rather than the media, so both are
  // fully testable with no encoded audio or video at all. The sound effect is the one that carries
  // its own samples.
  public cnbSoundEffectDataCreate(
    info: CnbSoundEffectInfoSnapshot, samples: Uint8Array,
  ): NativeHandle {
    return this.#bridge.cnbSoundEffectDataCreate(info, samples);
  }
  public cnbSoundEffectDataDestroy(sound: NativeHandle): void {
    this.#bridge.cnbSoundEffectDataDestroy(sound);
  }
  public cnbSoundEffectDataGetInfo(sound: NativeHandle): CnbSoundEffectInfoSnapshot {
    return this.#bridge.cnbSoundEffectDataGetInfo(sound);
  }
  public cnbSoundEffectDataCopySamples(sound: NativeHandle): Uint8Array {
    return new Uint8Array(this.#bridge.cnbSoundEffectDataCopySamples(sound));
  }
  public cnbEncodeSoundEffect(sound: NativeHandle, contentName: string): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeSoundEffect(sound, contentName));
  }
  public cnbDecodeSoundEffect(document: NativeHandle): NativeHandle {
    return this.#bridge.cnbDecodeSoundEffect(document);
  }
  public cnbDecodeWavAsSoundEffect(bytes: Uint8Array, origin: string): NativeHandle {
    return this.#bridge.cnbDecodeWavAsSoundEffect(bytes, origin);
  }
  public cnbEncodeSong(
    streamReference: string, name: string, durationMilliseconds: number, contentName: string,
  ): Uint8Array {
    return new Uint8Array(
      this.#bridge.cnbEncodeSong(streamReference, name, durationMilliseconds, contentName),
    );
  }
  public cnbDecodeSongDuration(document: NativeHandle): number {
    return this.#bridge.cnbDecodeSongDuration(document);
  }
  public cnbDecodeSongName(document: NativeHandle): string {
    return this.#bridge.cnbDecodeSongName(document);
  }
  public cnbDecodeSongStreamReference(document: NativeHandle): string {
    return this.#bridge.cnbDecodeSongStreamReference(document);
  }
  public cnbEncodeVideo(
    streamReference: string, info: CnbVideoInfoSnapshot, contentName: string,
  ): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeVideo(streamReference, info, contentName));
  }
  public cnbDecodeVideo(document: NativeHandle): CnbVideoInfoSnapshot {
    return this.#bridge.cnbDecodeVideo(document);
  }
  public cnbDecodeVideoStreamReference(document: NativeHandle): string {
    return this.#bridge.cnbDecodeVideoStreamReference(document);
  }
  // ---- the CNB model schema --------------------------------------------------------------------
  // Straight delegation, because the shaping is already done: the bridge returns plain objects and
  // arrays, and the payload copies are Buffers this wraps as Uint8Array so nothing above holds a
  // Node Buffer it did not ask for.
  public cnbModelCreate(): NativeHandle { return this.#bridge.cnbModelCreate(); }
  public cnbModelDestroy(model: NativeHandle): void { this.#bridge.cnbModelDestroy(model); }
  public cnbModelSetFlags(model: NativeHandle, lighting: boolean, hierarchy: boolean): void {
    this.#bridge.cnbModelSetFlags(model, lighting, hierarchy);
  }
  public cnbModelGetInfo(model: NativeHandle): CnbModelInfoSnapshot {
    return this.#bridge.cnbModelGetInfo(model);
  }
  public cnbModelAddBone(
    model: NativeHandle, name: string, parent: number, transform: readonly number[],
  ): number {
    return this.#bridge.cnbModelAddBone(model, name, parent, transform);
  }
  public cnbModelGetBone(
    model: NativeHandle, index: number,
  ): { readonly Parent: number; readonly Transform: readonly number[] } {
    return this.#bridge.cnbModelGetBone(model, index);
  }
  public cnbModelGetBoneName(model: NativeHandle, index: number): string {
    return this.#bridge.cnbModelGetBoneName(model, index);
  }
  public cnbModelAddPart(
    model: NativeHandle, info: CnbModelPartSnapshot, name: string, externalEffect: string,
  ): number {
    return this.#bridge.cnbModelAddPart(model, info, name, externalEffect);
  }
  public cnbModelGetPart(model: NativeHandle, index: number): CnbModelPartSnapshot {
    return this.#bridge.cnbModelGetPart(model, index);
  }
  public cnbModelGetPartName(model: NativeHandle, index: number): string {
    return this.#bridge.cnbModelGetPartName(model, index);
  }
  public cnbModelGetPartExternalEffect(model: NativeHandle, index: number): string {
    return this.#bridge.cnbModelGetPartExternalEffect(model, index);
  }
  public cnbModelSetPartVertexBytes(model: NativeHandle, index: number, bytes: Uint8Array): void {
    this.#bridge.cnbModelSetPartVertexBytes(model, index, bytes);
  }
  public cnbModelCopyPartVertexBytes(model: NativeHandle, index: number): Uint8Array {
    return new Uint8Array(this.#bridge.cnbModelCopyPartVertexBytes(model, index));
  }
  public cnbModelSetPartIndexBytes(model: NativeHandle, index: number, bytes: Uint8Array): void {
    this.#bridge.cnbModelSetPartIndexBytes(model, index, bytes);
  }
  public cnbModelCopyPartIndexBytes(model: NativeHandle, index: number): Uint8Array {
    return new Uint8Array(this.#bridge.cnbModelCopyPartIndexBytes(model, index));
  }
  public cnbModelGetMaterial(model: NativeHandle, part: number): CnbMaterialSnapshot {
    return this.#bridge.cnbModelGetMaterial(model, part);
  }
  public cnbModelSetMaterial(
    model: NativeHandle, part: number, material: CnbMaterialSnapshot,
  ): void {
    this.#bridge.cnbModelSetMaterial(model, part, material);
  }
  public cnbModelGetMaterialTexture(model: NativeHandle, part: number, slot: number): string {
    return this.#bridge.cnbModelGetMaterialTexture(model, part, slot);
  }
  public cnbModelSetMaterialTexture(
    model: NativeHandle, part: number, slot: number, assetName: string,
  ): void {
    this.#bridge.cnbModelSetMaterialTexture(model, part, slot, assetName);
  }
  public cnbModelAddMesh(
    model: NativeHandle, name: string, parentBone: number, partIndices: readonly number[],
  ): number {
    return this.#bridge.cnbModelAddMesh(model, name, parentBone, partIndices);
  }
  public cnbModelGetMesh(
    model: NativeHandle, index: number,
  ): { readonly ParentBone: number; readonly PartIndexCount: number } {
    return this.#bridge.cnbModelGetMesh(model, index);
  }
  public cnbModelGetMeshName(model: NativeHandle, index: number): string {
    return this.#bridge.cnbModelGetMeshName(model, index);
  }
  public cnbModelCopyMeshPartIndices(model: NativeHandle, index: number): readonly number[] {
    return this.#bridge.cnbModelCopyMeshPartIndices(model, index);
  }
  public cnbModelSetSkeleton(
    model: NativeHandle, hierarchy: readonly number[], bindPose: readonly number[],
    inverseBindPose: readonly number[], rootPrefix: readonly number[],
  ): void {
    this.#bridge.cnbModelSetSkeleton(model, hierarchy, bindPose, inverseBindPose, rootPrefix);
  }
  public cnbModelGetSkeleton(
    model: NativeHandle,
  ): { readonly JointCount: number; readonly HasRootPrefix: boolean } {
    return this.#bridge.cnbModelGetSkeleton(model);
  }
  public cnbModelCopySkeletonHierarchy(model: NativeHandle): readonly number[] {
    return this.#bridge.cnbModelCopySkeletonHierarchy(model);
  }
  public cnbModelCopySkeletonMatrices(model: NativeHandle, set: number): readonly number[] {
    return this.#bridge.cnbModelCopySkeletonMatrices(model, set);
  }
  public cnbModelAddLight(
    model: NativeHandle, direction: readonly number[], diffuseColor: readonly number[],
  ): number {
    return this.#bridge.cnbModelAddLight(model, direction, diffuseColor);
  }
  public cnbModelGetLight(
    model: NativeHandle, index: number,
  ): { readonly Direction: readonly number[]; readonly DiffuseColor: readonly number[] } {
    return this.#bridge.cnbModelGetLight(model, index);
  }
  public cnbEncodeModel(model: NativeHandle, contentName: string): Uint8Array {
    return new Uint8Array(this.#bridge.cnbEncodeModel(model, contentName));
  }
  public cnbDecodeModel(document: NativeHandle): NativeHandle {
    return this.#bridge.cnbDecodeModel(document);
  }

  public createParticleSystem(device: NativeHandle, capacity: number): NativeHandle {
    return this.#bridge.createParticleSystem(device, capacity);
  }
  public createParticleSystemAtDefaultCapacity(device: NativeHandle): NativeHandle {
    return this.#bridge.createParticleSystemAtDefaultCapacity(device);
  }
  public drawParticleSystem(
    system: NativeHandle, view: readonly number[], projection: readonly number[],
    texture: NativeHandle,
  ): void { this.#bridge.drawParticleSystem(system, view, projection, texture); }
  public setParticleDepthInput(
    system: NativeHandle, depth: NativeHandle, farPlane: number,
  ): void { this.#bridge.setParticleDepthInput(system, depth, farPlane); }
  public getParticleSoftness(system: NativeHandle): number {
    return this.#bridge.getParticleSoftness(system);
  }
  public setParticleSoftness(system: NativeHandle, softness: number): void {
    this.#bridge.setParticleSoftness(system, softness);
  }
  public getParticleLookupGlsl(): string { return this.#bridge.getParticleLookupGlsl(); }
  public destroyParticleSystem(system: NativeHandle): void {
    this.#bridge.destroyParticleSystem(system);
  }
  public resetParticleSystem(system: NativeHandle): void {
    this.#bridge.resetParticleSystem(system);
  }
  public updateParticleSystem(system: NativeHandle, elapsedSeconds: number): void {
    this.#bridge.updateParticleSystem(system, elapsedSeconds);
  }
  public getParticleSystemCapacity(system: NativeHandle): number {
    return this.#bridge.getParticleSystemCapacity(system);
  }
  public getParticleSystemActiveCount(system: NativeHandle): number {
    return this.#bridge.getParticleSystemActiveCount(system);
  }
  public particleSystemUsesCompute(system: NativeHandle): boolean {
    return this.#bridge.particleSystemUsesCompute(system);
  }
  public isParticleSimulationForcedOnCpu(system: NativeHandle): boolean {
    return this.#bridge.isParticleSimulationForcedOnCpu(system);
  }
  public setParticleSimulationOnCpu(system: NativeHandle, forced: boolean): void {
    this.#bridge.setParticleSimulationOnCpu(system, forced);
  }
  public isParticleEmissionRateClamped(system: NativeHandle): boolean {
    return this.#bridge.isParticleEmissionRateClamped(system);
  }
  public getParticleSystemUnsupportedReason(system: NativeHandle): string {
    return this.#bridge.getParticleSystemUnsupportedReason(system);
  }
  public getParticleEmitterSettings(system: NativeHandle): ParticleEmitterSettingsSnapshot {
    return this.#bridge.getParticleEmitterSettings(system);
  }
  public setParticleEmitterSettings(system: NativeHandle, settings: ParticleEmitterSettingsSnapshot): void {
    this.#bridge.setParticleEmitterSettings(system, settings);
  }
  public copyParticles(system: NativeHandle): readonly ParticleSnapshot[] {
    return this.#bridge.copyParticles(system);
  }
  public getDefaultParticleEmitterSettings(): ParticleEmitterSettingsSnapshot {
    return this.#bridge.getDefaultParticleEmitterSettings();
  }
  public getDefaultParticle(): ParticleSnapshot {
    return this.#bridge.getDefaultParticle();
  }
  public particleRandom(seed: number): number {
    return this.#bridge.particleRandom(seed);
  }
  public stepParticle(particle: ParticleSnapshot, index: number, settings: ParticleEmitterSettingsSnapshot, elapsedSeconds: number): ParticleSnapshot {
    return this.#bridge.stepParticle(particle, index, settings, elapsedSeconds);
  }
  public createDepthNormalPrepass(
    device: NativeHandle, width: number, height: number, encoding: number,
  ): NativeHandle {
    return this.#bridge.createDepthNormalPrepass(device, width, height, encoding);
  }
  public destroyDepthNormalPrepass(prepass: NativeHandle): void {
    this.#bridge.destroyDepthNormalPrepass(prepass);
  }
  public resizeDepthNormalPrepass(prepass: NativeHandle, width: number, height: number): void {
    this.#bridge.resizeDepthNormalPrepass(prepass, width, height);
  }
  public getDepthNormalPrepassPassCount(prepass: NativeHandle): number {
    return this.#bridge.getDepthNormalPrepassPassCount(prepass);
  }
  public beginDepthNormalPrepass(
    prepass: NativeHandle, passIndex: number, view: readonly number[],
    projection: readonly number[], nearPlane: number, farPlane: number,
  ): void {
    this.#bridge.beginDepthNormalPrepass(
      prepass, passIndex, view, projection, nearPlane, farPlane,
    );
  }
  public endDepthNormalPrepass(prepass: NativeHandle): void {
    this.#bridge.endDepthNormalPrepass(prepass);
  }
  public getDepthNormalPrepassEffect(prepass: NativeHandle): NativeHandle {
    return this.#bridge.getDepthNormalPrepassEffect(prepass);
  }
  public getSkinnedDepthNormalPrepassEffect(prepass: NativeHandle): NativeHandle {
    return this.#bridge.getSkinnedDepthNormalPrepassEffect(prepass);
  }
  public getDepthNormalPrepassDepthTexture(prepass: NativeHandle): NativeHandle {
    return this.#bridge.getDepthNormalPrepassDepthTexture(prepass);
  }
  public getDepthNormalPrepassNormalTexture(prepass: NativeHandle): NativeHandle {
    return this.#bridge.getDepthNormalPrepassNormalTexture(prepass);
  }
  public getDepthNormalPrepassVelocityTexture(prepass: NativeHandle): NativeHandle {
    return this.#bridge.getDepthNormalPrepassVelocityTexture(prepass);
  }
  public isDepthNormalPrepassSupported(prepass: NativeHandle, device: NativeHandle): boolean {
    return this.#bridge.isDepthNormalPrepassSupported(prepass, device);
  }
  public isDepthNormalPrepassUsingMultipleRenderTargets(prepass: NativeHandle): boolean {
    return this.#bridge.isDepthNormalPrepassUsingMultipleRenderTargets(prepass);
  }
  public isDepthNormalPrepassDepthPacked(prepass: NativeHandle): boolean {
    return this.#bridge.isDepthNormalPrepassDepthPacked(prepass);
  }
  public deviceUsesPackedDepth(device: NativeHandle): boolean {
    return this.#bridge.deviceUsesPackedDepth(device);
  }
  public getDepthNormalPrepassRoughness(prepass: NativeHandle): number {
    return this.#bridge.getDepthNormalPrepassRoughness(prepass);
  }
  public setDepthNormalPrepassRoughness(prepass: NativeHandle, roughness: number): void {
    this.#bridge.setDepthNormalPrepassRoughness(prepass, roughness);
  }
  public isDepthNormalPrepassVelocityEnabled(prepass: NativeHandle): boolean {
    return this.#bridge.isDepthNormalPrepassVelocityEnabled(prepass);
  }
  public setDepthNormalPrepassVelocityEnabled(prepass: NativeHandle, enabled: boolean): void {
    this.#bridge.setDepthNormalPrepassVelocityEnabled(prepass, enabled);
  }
  public setDepthNormalPrepassPreviousWorld(
    prepass: NativeHandle, world: readonly number[],
  ): void { this.#bridge.setDepthNormalPrepassPreviousWorld(prepass, world); }
  public setDepthNormalPrepassPreviousCamera(
    prepass: NativeHandle, view: readonly number[], projection: readonly number[],
  ): void { this.#bridge.setDepthNormalPrepassPreviousCamera(prepass, view, projection); }
  public getDepthDecodeGlsl(packed: boolean): string {
    return this.#bridge.getDepthDecodeGlsl(packed);
  }
  public getVelocityDecodeGlsl(): string { return this.#bridge.getVelocityDecodeGlsl(); }
  public velocityTexelHasVelocity(texel: ColorSnapshot): boolean {
    return this.#bridge.velocityTexelHasVelocity(texel);
  }
  public decodeVelocityTexel(texel: ColorSnapshot): Vector2Snapshot {
    return this.#bridge.decodeVelocityTexel(texel);
  }
  public packLinearDepth(value: number): PackedDepthSnapshot {
    return this.#bridge.packLinearDepth(value);
  }
  public unpackLinearDepth(r: number, g: number, b: number, a: number): number {
    return this.#bridge.unpackLinearDepth(r, g, b, a);
  }
  public createAtmosphericSky(device: NativeHandle): NativeHandle { return this.#bridge.createAtmosphericSky(device); }
  public destroyAtmosphericSky(sky: NativeHandle): void { this.#bridge.destroyAtmosphericSky(sky); }
  public isAtmosphericSkySupported(sky: NativeHandle): boolean { return this.#bridge.isAtmosphericSkySupported(sky); }
  public drawAtmosphericSky(sky: NativeHandle, view: readonly number[], projection: readonly number[], width: number, height: number): void { this.#bridge.drawAtmosphericSky(sky, view, projection, width, height); }
  public getAtmosphericSkySunDirection(sky: NativeHandle): Vector3Snapshot { return this.#bridge.getAtmosphericSkySunDirection(sky); }
  public setAtmosphericSkySunDirection(sky: NativeHandle, direction: Vector3Snapshot): void { this.#bridge.setAtmosphericSkySunDirection(sky, direction); }
  public getAtmosphericSkyTurbidity(sky: NativeHandle): number { return this.#bridge.getAtmosphericSkyTurbidity(sky); }
  public setAtmosphericSkyTurbidity(sky: NativeHandle, turbidity: number): void { this.#bridge.setAtmosphericSkyTurbidity(sky, turbidity); }
  public getAtmosphericSkyIntensity(sky: NativeHandle): number { return this.#bridge.getAtmosphericSkyIntensity(sky); }
  public setAtmosphericSkyIntensity(sky: NativeHandle, intensity: number): void { this.#bridge.setAtmosphericSkyIntensity(sky, intensity); }
  public getAtmosphericSkyModelGlsl(): string { return this.#bridge.getAtmosphericSkyModelGlsl(); }
  public atmosphericSkyRadiance(viewDirection: Vector3Snapshot, sunDirection: Vector3Snapshot, turbidity: number): Vector3Snapshot { return this.#bridge.atmosphericSkyRadiance(viewDirection, sunDirection, turbidity); }
  public createSkybox(device: NativeHandle, environment: NativeHandle): NativeHandle { return this.#bridge.createSkybox(device, environment); }
  public destroySkybox(skybox: NativeHandle): void { this.#bridge.destroySkybox(skybox); }
  public isSkyboxSupported(skybox: NativeHandle): boolean { return this.#bridge.isSkyboxSupported(skybox); }
  public drawSkybox(skybox: NativeHandle, view: readonly number[], projection: readonly number[], width: number, height: number): void { this.#bridge.drawSkybox(skybox, view, projection, width, height); }
  public getSkyboxEnvironment(skybox: NativeHandle): NativeHandle { return this.#bridge.getSkyboxEnvironment(skybox); }
  public setSkyboxEnvironment(skybox: NativeHandle, environment: NativeHandle): void { this.#bridge.setSkyboxEnvironment(skybox, environment); }
  public setSkyboxOwnedEnvironment(skybox: NativeHandle, environment: NativeHandle): void { this.#bridge.setSkyboxOwnedEnvironment(skybox, environment); }
  public getSkyboxYaw(skybox: NativeHandle): number { return this.#bridge.getSkyboxYaw(skybox); }
  public setSkyboxYaw(skybox: NativeHandle, radians: number): void { this.#bridge.setSkyboxYaw(skybox, radians); }
  public getSkyboxIntensity(skybox: NativeHandle): number { return this.#bridge.getSkyboxIntensity(skybox); }
  public setSkyboxIntensity(skybox: NativeHandle, intensity: number): void { this.#bridge.setSkyboxIntensity(skybox, intensity); }
  public getSkyboxTint(skybox: NativeHandle): Vector3Snapshot { return this.#bridge.getSkyboxTint(skybox); }
  public setSkyboxTint(skybox: NativeHandle, tint: Vector3Snapshot): void { this.#bridge.setSkyboxTint(skybox, tint); }
  public computeSkyboxViewRay(view: readonly number[], projection: readonly number[], ndcX: number, ndcY: number, yaw: number): Vector3Snapshot { return this.#bridge.computeSkyboxViewRay(view, projection, ndcX, ndcY, yaw); }
  public createEnvironmentProcessor(device: NativeHandle): NativeHandle { return this.#bridge.createEnvironmentProcessor(device); }
  public destroyEnvironmentProcessor(processor: NativeHandle): void { this.#bridge.destroyEnvironmentProcessor(processor); }
  public convertEquirectangular(processor: NativeHandle, panorama: NativeHandle, faceSize: number): NativeHandle { return this.#bridge.convertEquirectangular(processor, panorama, faceSize); }
  public generateIrradianceCube(processor: NativeHandle, environment: NativeHandle, size: number, sampleCount: number): NativeHandle { return this.#bridge.generateIrradianceCube(processor, environment, size, sampleCount); }
  public generatePrefilteredSpecular(processor: NativeHandle, environment: NativeHandle, baseSize: number, mipCount: number, sampleCount: number): NativeHandle { return this.#bridge.generatePrefilteredSpecular(processor, environment, baseSize, mipCount, sampleCount); }
  public generateProbeFromEnvironment(processor: NativeHandle, environment: NativeHandle, position: Vector3Snapshot): NativeHandle { return this.#bridge.generateProbeFromEnvironment(processor, environment, position); }
  public generateBrdfLut(processor: NativeHandle, size: number, sampleCount: number): NativeHandle { return this.#bridge.generateBrdfLut(processor, size, sampleCount); }
  public mipForRoughness(roughness: number, mipCount: number): number { return this.#bridge.mipForRoughness(roughness, mipCount); }
  public roughnessForMip(mip: number, mipCount: number): number { return this.#bridge.roughnessForMip(mip, mipCount); }
  public hammersleyPoint(index: number, count: number): Vector2Snapshot { return this.#bridge.hammersleyPoint(index, count); }
  public importanceSampleGgx(x: number, y: number, normal: Vector3Snapshot, roughness: number): Vector3Snapshot { return this.#bridge.importanceSampleGgx(x, y, normal, roughness); }
  public cubeFaceDirection(face: number, u: number, v: number): Vector3Snapshot { return this.#bridge.cubeFaceDirection(face, u, v); }
  public directionToEquirectangular(direction: Vector3Snapshot): Vector2Snapshot { return this.#bridge.directionToEquirectangular(direction); }
  public getRenderPipelineSkybox(pipeline: NativeHandle): NativeHandle { return this.#bridge.getRenderPipelineSkybox(pipeline); }
  public setRenderPipelineSkybox(pipeline: NativeHandle, skybox: NativeHandle): void { this.#bridge.setRenderPipelineSkybox(pipeline, skybox); }
  public createLightProbe(): NativeHandle { return this.#bridge.createLightProbe(); }
  public createLightProbeAt(position: Vector3Snapshot): NativeHandle { return this.#bridge.createLightProbeAt(position); }
  public destroyLightProbe(probe: NativeHandle): void { this.#bridge.destroyLightProbe(probe); }
  public copyLightProbeFrom(destination: NativeHandle, source: NativeHandle): void { this.#bridge.copyLightProbeFrom(destination, source); }
  public getLightProbePosition(probe: NativeHandle): Vector3Snapshot { return this.#bridge.getLightProbePosition(probe); }
  public setLightProbePosition(probe: NativeHandle, position: Vector3Snapshot): void { this.#bridge.setLightProbePosition(probe, position); }
  public getLightProbeCoefficient(probe: NativeHandle, index: number): Vector3Snapshot { return this.#bridge.getLightProbeCoefficient(probe, index); }
  public setLightProbeCoefficient(probe: NativeHandle, index: number, value: Vector3Snapshot): void { this.#bridge.setLightProbeCoefficient(probe, index, value); }
  public copyLightProbeCoefficients(probe: NativeHandle): readonly Vector3Snapshot[] { return this.#bridge.copyLightProbeCoefficients(probe); }
  public lightProbeIrradiance(probe: NativeHandle, normal: Vector3Snapshot): Vector3Snapshot { return this.#bridge.lightProbeIrradiance(probe, normal); }
  public setLightProbeVisibility(probe: NativeHandle, direction: number, mean: number, meanSquared: number): void { this.#bridge.setLightProbeVisibility(probe, direction, mean, meanSquared); }
  public getLightProbeVisibilityMean(probe: NativeHandle, direction: number): number { return this.#bridge.getLightProbeVisibilityMean(probe, direction); }
  public getLightProbeVisibilityMeanSquared(probe: NativeHandle, direction: number): number { return this.#bridge.getLightProbeVisibilityMeanSquared(probe, direction); }
  public lightProbeHasVisibility(probe: NativeHandle): boolean { return this.#bridge.lightProbeHasVisibility(probe); }
  public lightProbeVisibilityWeight(probe: NativeHandle, direction: Vector3Snapshot, distance: number): number { return this.#bridge.lightProbeVisibilityWeight(probe, direction, distance); }
  public isLightProbeZero(probe: NativeHandle): boolean { return this.#bridge.isLightProbeZero(probe); }
  public scaleLightProbe(probe: NativeHandle, factor: number): void { this.#bridge.scaleLightProbe(probe, factor); }
  public lightProbeEquals(first: NativeHandle, second: NativeHandle): boolean { return this.#bridge.lightProbeEquals(first, second); }
  public getLightProbeEvaluationGlsl(): string { return this.#bridge.getLightProbeEvaluationGlsl(); }
  public createLightProbeVolume(bounds: ClusterBoundsSnapshot, countX: number, countY: number, countZ: number): NativeHandle { return this.#bridge.createLightProbeVolume(bounds, countX, countY, countZ); }
  public destroyLightProbeVolume(volume: NativeHandle): void { this.#bridge.destroyLightProbeVolume(volume); }
  public getLightProbeVolumeBounds(volume: NativeHandle): ClusterBoundsSnapshot { return this.#bridge.getLightProbeVolumeBounds(volume); }
  public getLightProbeVolumeCountX(volume: NativeHandle): number { return this.#bridge.getLightProbeVolumeCountX(volume); }
  public getLightProbeVolumeCountY(volume: NativeHandle): number { return this.#bridge.getLightProbeVolumeCountY(volume); }
  public getLightProbeVolumeCountZ(volume: NativeHandle): number { return this.#bridge.getLightProbeVolumeCountZ(volume); }
  public getLightProbeVolumeProbeCount(volume: NativeHandle): number { return this.#bridge.getLightProbeVolumeProbeCount(volume); }
  public getLightProbeVolumeProbePosition(volume: NativeHandle, x: number, y: number, z: number): Vector3Snapshot { return this.#bridge.getLightProbeVolumeProbePosition(volume, x, y, z); }
  public getLightProbeVolumeProbe(volume: NativeHandle, x: number, y: number, z: number, into: NativeHandle): void { this.#bridge.getLightProbeVolumeProbe(volume, x, y, z, into); }
  public setLightProbeVolumeProbe(volume: NativeHandle, x: number, y: number, z: number, probe: NativeHandle): void { this.#bridge.setLightProbeVolumeProbe(volume, x, y, z, probe); }
  public lightProbeVolumeContains(volume: NativeHandle, position: Vector3Snapshot): boolean { return this.#bridge.lightProbeVolumeContains(volume, position); }
  public sampleLightProbeVolume(volume: NativeHandle, position: Vector3Snapshot, into: NativeHandle): void { this.#bridge.sampleLightProbeVolume(volume, position, into); }
  public lightProbeVolumeIrradiance(volume: NativeHandle, position: Vector3Snapshot, normal: Vector3Snapshot): Vector3Snapshot { return this.#bridge.lightProbeVolumeIrradiance(volume, position, normal); }
  public isLightProbeVolumeZero(volume: NativeHandle): boolean { return this.#bridge.isLightProbeVolumeZero(volume); }
  public createLightProbeBaker(device: NativeHandle): NativeHandle { return this.#bridge.createLightProbeBaker(device); }
  public createLightProbeBakerWithFaceSize(device: NativeHandle, faceSize: number): NativeHandle { return this.#bridge.createLightProbeBakerWithFaceSize(device, faceSize); }
  public destroyLightProbeBaker(baker: NativeHandle): void { this.#bridge.destroyLightProbeBaker(baker); }
  public isLightProbeBakerSupported(baker: NativeHandle): boolean { return this.#bridge.isLightProbeBakerSupported(baker); }
  public getLightProbeBakerFaceSize(baker: NativeHandle): number { return this.#bridge.getLightProbeBakerFaceSize(baker); }
  public getLightProbeBakerFaceCount(): number { return this.#bridge.getLightProbeBakerFaceCount(); }
  public getLightProbeBakerNearPlane(baker: NativeHandle): number { return this.#bridge.getLightProbeBakerNearPlane(baker); }
  public getLightProbeBakerFarPlane(baker: NativeHandle): number { return this.#bridge.getLightProbeBakerFarPlane(baker); }
  public setLightProbeBakerPlanes(baker: NativeHandle, nearPlane: number, farPlane: number): void { this.#bridge.setLightProbeBakerPlanes(baker, nearPlane, farPlane); }
  public getLightProbeBakerFaceView(baker: NativeHandle, face: number, position: Vector3Snapshot): readonly number[] { return this.#bridge.getLightProbeBakerFaceView(baker, face, position); }
  public bakeLightProbe(baker: NativeHandle, position: Vector3Snapshot, draw: SceneFaceDraw): NativeHandle { return this.#bridge.bakeLightProbe(baker, position, draw); }
  public bakeLightProbeVolumeLight(baker: NativeHandle, volume: NativeHandle, draw: SceneFaceDraw): number { return this.#bridge.bakeLightProbeVolumeLight(baker, volume, draw); }
  public bakeLightProbeVolumeVisibility(baker: NativeHandle, volume: NativeHandle, draw: SceneFaceDraw): number { return this.#bridge.bakeLightProbeVolumeVisibility(baker, volume, draw); }
  public createDecalPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createDecalPass(device);
  }
  public destroyDecalPass(pass: NativeHandle): void { this.#bridge.destroyDecalPass(pass); }
  public getDecalOpacity(pass: NativeHandle): number {
    return this.#bridge.getDecalOpacity(pass);
  }
  public setDecalOpacity(pass: NativeHandle, opacity: number): void {
    this.#bridge.setDecalOpacity(pass, opacity);
  }
  public getDecalTint(pass: NativeHandle): Vector3Snapshot {
    return this.#bridge.getDecalTint(pass);
  }
  public setDecalTint(pass: NativeHandle, tint: Vector3Snapshot): void {
    this.#bridge.setDecalTint(pass, tint);
  }
  public getDecalMaxSlopeAngle(pass: NativeHandle): number {
    return this.#bridge.getDecalMaxSlopeAngle(pass);
  }
  public setDecalMaxSlopeAngle(pass: NativeHandle, radians: number): void {
    this.#bridge.setDecalMaxSlopeAngle(pass, radians);
  }
  public setDecalPrepassInputs(
    pass: NativeHandle, depth: NativeHandle, normals: NativeHandle,
  ): void { this.#bridge.setDecalPrepassInputs(pass, depth, normals); }
  public setDecalCamera(
    pass: NativeHandle, view: readonly number[], projection: readonly number[], farPlane: number,
  ): void { this.#bridge.setDecalCamera(pass, view, projection, farPlane); }
  public drawDecal(
    pass: NativeHandle, decal: NativeHandle, decalWorld: readonly number[],
    width: number, height: number,
  ): void { this.#bridge.drawDecal(pass, decal, decalWorld, width, height); }
  public isInsideDecalBox(decalLocalPosition: Vector3Snapshot): boolean {
    return this.#bridge.isInsideDecalBox(decalLocalPosition);
  }
  public createCascadedShadowMap(device: NativeHandle, quality: number, cascadeCount: number): NativeHandle { return this.#bridge.createCascadedShadowMap(device, quality, cascadeCount); }
  public destroyCascadedShadowMap(map: NativeHandle): void { this.#bridge.destroyCascadedShadowMap(map); }
  public updateCascadedShadowMap(map: NativeHandle, light: DirectionalLightSnapshot, cameraView: readonly number[], cameraProjection: readonly number[]): void { this.#bridge.updateCascadedShadowMap(map, light, cameraView, cameraProjection); }
  public beginCascadedShadowPass(map: NativeHandle, cascadeIndex: number): void { this.#bridge.beginCascadedShadowPass(map, cascadeIndex); }
  public endCascadedShadowPass(map: NativeHandle): void { this.#bridge.endCascadedShadowPass(map); }
  public getCascadeMatrix(map: NativeHandle, cascadeIndex: number): readonly number[] { return this.#bridge.getCascadeMatrix(map, cascadeIndex); }
  public getCascadeSplitDistance(map: NativeHandle, cascadeIndex: number): number { return this.#bridge.getCascadeSplitDistance(map, cascadeIndex); }
  public selectCascade(map: NativeHandle, viewDepth: number): number { return this.#bridge.selectCascade(map, viewDepth); }
  public applyCascadesToReceiver(map: NativeHandle, effect: NativeHandle): void { this.#bridge.applyCascadesToReceiver(map, effect); }
  public snapCascadeToTexelGrid(centre: Vector3Snapshot, radius: number, cascadeSize: number): Vector3Snapshot { return this.#bridge.snapCascadeToTexelGrid(centre, radius, cascadeSize); }
  public getCascadeSize(map: NativeHandle): number { return this.#bridge.getCascadeSize(map); }
  public getCascadeCount(map: NativeHandle): number { return this.#bridge.getCascadeCount(map); }
  public getCascadeBlendBand(map: NativeHandle): number { return this.#bridge.getCascadeBlendBand(map); }
  public setCascadeBlendBand(map: NativeHandle, band: number): void { this.#bridge.setCascadeBlendBand(map, band); }
  public getCascadeSplitLambda(map: NativeHandle): number { return this.#bridge.getCascadeSplitLambda(map); }
  public setCascadeSplitLambda(map: NativeHandle, lambda: number): void { this.#bridge.setCascadeSplitLambda(map, lambda); }
  public isCascadeDebugTintEnabled(map: NativeHandle): boolean { return this.#bridge.isCascadeDebugTintEnabled(map); }
  public setCascadeDebugTintEnabled(map: NativeHandle, enabled: boolean): void { this.#bridge.setCascadeDebugTintEnabled(map, enabled); }
  public getCascadedCasterEffect(map: NativeHandle): NativeHandle { return this.#bridge.getCascadedCasterEffect(map); }
  public getCascadedShadowTexture(map: NativeHandle): NativeHandle { return this.#bridge.getCascadedShadowTexture(map); }
  public isCascadedShadowMapSupported(map: NativeHandle): boolean { return this.#bridge.isCascadedShadowMapSupported(map); }
  public createSpotShadowMap(device: NativeHandle, quality: number): NativeHandle { return this.#bridge.createSpotShadowMap(device, quality); }
  public destroySpotShadowMap(map: NativeHandle): void { this.#bridge.destroySpotShadowMap(map); }
  public beginSpotShadowPass(map: NativeHandle, light: SpotLightSnapshot): void { this.#bridge.beginSpotShadowPass(map, light); }
  public endSpotShadowPass(map: NativeHandle): void { this.#bridge.endSpotShadowPass(map); }
  public getSpotShadowLightViewProjection(map: NativeHandle): readonly number[] { return this.#bridge.getSpotShadowLightViewProjection(map); }
  public getSpotShadowLightPosition(map: NativeHandle): Vector3Snapshot { return this.#bridge.getSpotShadowLightPosition(map); }
  public getSpotShadowLightRange(map: NativeHandle): number { return this.#bridge.getSpotShadowLightRange(map); }
  public getSpotShadowQuality(map: NativeHandle): number { return this.#bridge.getSpotShadowQuality(map); }
  public getSpotShadowSize(map: NativeHandle): number { return this.#bridge.getSpotShadowSize(map); }
  public getSpotShadowDepthBias(map: NativeHandle): number { return this.#bridge.getSpotShadowDepthBias(map); }
  public setSpotShadowDepthBias(map: NativeHandle, bias: number): void { this.#bridge.setSpotShadowDepthBias(map, bias); }
  public getSpotShadowCasterEffect(map: NativeHandle): NativeHandle { return this.#bridge.getSpotShadowCasterEffect(map); }
  public getSpotShadowTexture(map: NativeHandle): NativeHandle { return this.#bridge.getSpotShadowTexture(map); }
  public isSpotShadowMapSupported(map: NativeHandle): boolean { return this.#bridge.isSpotShadowMapSupported(map); }
  public createCubeShadowMap(device: NativeHandle, quality: number): NativeHandle { return this.#bridge.createCubeShadowMap(device, quality); }
  public destroyCubeShadowMap(map: NativeHandle): void { this.#bridge.destroyCubeShadowMap(map); }
  public updateCubeShadowMap(map: NativeHandle, light: PointLightSnapshot): void { this.#bridge.updateCubeShadowMap(map, light); }
  public beginCubeShadowPass(map: NativeHandle, faceIndex: number): void { this.#bridge.beginCubeShadowPass(map, faceIndex); }
  public endCubeShadowPass(map: NativeHandle): void { this.#bridge.endCubeShadowPass(map); }
  public getCubeShadowLightPosition(map: NativeHandle): Vector3Snapshot { return this.#bridge.getCubeShadowLightPosition(map); }
  public getCubeShadowLightRange(map: NativeHandle): number { return this.#bridge.getCubeShadowLightRange(map); }
  public getCubeShadowQuality(map: NativeHandle): number { return this.#bridge.getCubeShadowQuality(map); }
  public getCubeShadowSize(map: NativeHandle): number { return this.#bridge.getCubeShadowSize(map); }
  public getCubeShadowDepthBias(map: NativeHandle): number { return this.#bridge.getCubeShadowDepthBias(map); }
  public setCubeShadowDepthBias(map: NativeHandle, bias: number): void { this.#bridge.setCubeShadowDepthBias(map, bias); }
  public getCubeShadowCasterEffect(map: NativeHandle): NativeHandle { return this.#bridge.getCubeShadowCasterEffect(map); }
  public getCubeShadowTexture(map: NativeHandle): NativeHandle { return this.#bridge.getCubeShadowTexture(map); }
  public isCubeShadowMapSupported(map: NativeHandle): boolean { return this.#bridge.isCubeShadowMapSupported(map); }
  public createShadowMap(device: NativeHandle, quality: number): NativeHandle {
    return this.#bridge.createShadowMap(device, quality);
  }
  public supportsShadowSampling(device: NativeHandle): boolean {
    return this.#bridge.supportsShadowSampling(device);
  }
  public beginShadowPass(
    map: NativeHandle, light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot,
  ): void { this.#bridge.beginShadowPass(map, light, bounds); }
  public endShadowPass(map: NativeHandle): void { this.#bridge.endShadowPass(map); }
  public applyShadowCaster(map: NativeHandle): void { this.#bridge.applyShadowCaster(map); }
  public applySkinnedShadowCaster(
    map: NativeHandle, bones: readonly (readonly number[])[], weightsPerVertex: number,
  ): void { this.#bridge.applySkinnedShadowCaster(map, bones, weightsPerVertex); }
  public getShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#bridge.getShadowCasterEffect(map);
  }
  public getSkinnedShadowCasterEffect(map: NativeHandle): NativeHandle {
    return this.#bridge.getSkinnedShadowCasterEffect(map);
  }
  public getShadowMapTexture(map: NativeHandle): NativeHandle {
    return this.#bridge.getShadowMapTexture(map);
  }
  public destroyShadowMap(map: NativeHandle): void {
    this.#bridge.destroyShadowMap(map);
  }
  public isShadowMapSupported(map: NativeHandle): boolean {
    return this.#bridge.isShadowMapSupported(map);
  }
  public getShadowMapSize(map: NativeHandle): number {
    return this.#bridge.getShadowMapSize(map);
  }
  public getShadowMapQuality(map: NativeHandle): number {
    return this.#bridge.getShadowMapQuality(map);
  }
  public getShadowMapDepthBias(map: NativeHandle): number {
    return this.#bridge.getShadowMapDepthBias(map);
  }
  public setShadowMapDepthBias(map: NativeHandle, bias: number): void {
    this.#bridge.setShadowMapDepthBias(map, bias);
  }
  public getShadowMapFilterRadius(map: NativeHandle): number {
    return this.#bridge.getShadowMapFilterRadius(map);
  }
  public getShadowMapLightViewProjection(map: NativeHandle): readonly number[] {
    return this.#bridge.getShadowMapLightViewProjection(map);
  }
  public computeShadowLightView(light: DirectionalLightSnapshot, bounds: ClusterBoundsSnapshot): readonly number[] {
    return this.#bridge.computeShadowLightView(light, bounds);
  }
  public computeShadowLightProjection(lightView: readonly number[], bounds: ClusterBoundsSnapshot): readonly number[] {
    return this.#bridge.computeShadowLightProjection(lightView, bounds);
  }
  public shadowMapSizeForQuality(quality: number): number {
    return this.#bridge.shadowMapSizeForQuality(quality);
  }
  public shadowMapFilterRadiusForQuality(quality: number): number {
    return this.#bridge.shadowMapFilterRadiusForQuality(quality);
  }
  public computeCascadeSplitDistances(nearPlane: number, farPlane: number, cascadeCount: number, lambda: number): readonly number[] {
    return this.#bridge.computeCascadeSplitDistances(nearPlane, farPlane, cascadeCount, lambda);
  }
  public computeCascadeFrustumCorners(view: readonly number[], projection: readonly number[]): readonly Vector3Snapshot[] {
    return this.#bridge.computeCascadeFrustumCorners(view, projection);
  }
  public computeCascadeBoundingSphere(corners: readonly Vector3Snapshot[]): { readonly Center: Vector3Snapshot; readonly Radius: number } {
    return this.#bridge.computeCascadeBoundingSphere(corners);
  }
  public computeSpotShadowLightView(light: SpotLightSnapshot): readonly number[] {
    return this.#bridge.computeSpotShadowLightView(light);
  }
  public computeSpotShadowLightProjection(light: SpotLightSnapshot): readonly number[] {
    return this.#bridge.computeSpotShadowLightProjection(light);
  }
  public computeCubeShadowFaceView(face: number, position: Vector3Snapshot): readonly number[] {
    return this.#bridge.computeCubeShadowFaceView(face, position);
  }
  public computeCubeShadowFaceProjection(range: number): readonly number[] {
    return this.#bridge.computeCubeShadowFaceProjection(range);
  }
  public cubeShadowMapSizeForQuality(quality: number): number {
    return this.#bridge.cubeShadowMapSizeForQuality(quality);
  }
  public createLodGroup(): NativeHandle {
    return this.#bridge.createLodGroup();
  }
  public destroyLodGroup(group: NativeHandle): void {
    this.#bridge.destroyLodGroup(group);
  }
  public addLodLevel(group: NativeHandle, maxDistance: number): void {
    this.#bridge.addLodLevel(group, maxDistance);
  }
  public clearLodGroup(group: NativeHandle): void {
    this.#bridge.clearLodGroup(group);
  }
  public copyLodLevels(group: NativeHandle): readonly number[] {
    return this.#bridge.copyLodLevels(group);
  }
  public selectLodIndex(group: NativeHandle, distance: number): number {
    return this.#bridge.selectLodIndex(group, distance);
  }
  public getLodHysteresis(group: NativeHandle): number {
    return this.#bridge.getLodHysteresis(group);
  }
  public setLodHysteresis(group: NativeHandle, margin: number): void {
    this.#bridge.setLodHysteresis(group, margin);
  }
  public resetLodHysteresis(group: NativeHandle): void {
    this.#bridge.resetLodHysteresis(group);
  }
  public getLodSelectionMode(group: NativeHandle): number {
    return this.#bridge.getLodSelectionMode(group);
  }
  public setLodSelectionMode(group: NativeHandle, mode: number): void {
    this.#bridge.setLodSelectionMode(group, mode);
  }
  public setLodScreenSpaceParameters(group: NativeHandle, radius: number, verticalFov: number, viewportHeight: number): void {
    this.#bridge.setLodScreenSpaceParameters(group, radius, verticalFov, viewportHeight);
  }
  public getLodProjectedRadiusPixels(group: NativeHandle, distance: number): number {
    return this.#bridge.getLodProjectedRadiusPixels(group, distance);
  }
  public isClusteredLightUsable(light: ClusteredLightSnapshot): boolean {
    return this.#bridge.isClusteredLightUsable(light);
  }
  public createClusteredLightSet(device: NativeHandle): NativeHandle {
    return this.#bridge.createClusteredLightSet(device);
  }
  public addClusteredLight(set: NativeHandle, light: ClusteredLightSnapshot): number {
    return this.#bridge.addClusteredLight(set, light);
  }
  public addClusteredPointLight(set: NativeHandle, light: PointLightSnapshot): number {
    return this.#bridge.addClusteredPointLight(set, light);
  }
  public addClusteredSpotLight(set: NativeHandle, light: SpotLightSnapshot): number {
    return this.#bridge.addClusteredSpotLight(set, light);
  }
  public replaceClusteredLightAt(set: NativeHandle, index: number, light: ClusteredLightSnapshot): void {
    this.#bridge.replaceClusteredLightAt(set, index, light);
  }
  public removeClusteredLightAt(set: NativeHandle, index: number): void {
    this.#bridge.removeClusteredLightAt(set, index);
  }
  public clearClusteredLightSet(set: NativeHandle): void {
    this.#bridge.clearClusteredLightSet(set);
  }
  public getClusteredLightCount(set: NativeHandle): number {
    return this.#bridge.getClusteredLightCount(set);
  }
  public isClusteredLightSetEmpty(set: NativeHandle): boolean {
    return this.#bridge.isClusteredLightSetEmpty(set);
  }
  public getClusteredLightAt(set: NativeHandle, index: number): ClusteredLightSnapshot {
    return this.#bridge.getClusteredLightAt(set, index);
  }
  public copyClusteredLights(set: NativeHandle): readonly ClusteredLightSnapshot[] {
    return this.#bridge.copyClusteredLights(set);
  }
  public getClusteredLightBoundsAt(set: NativeHandle, index: number): BoundingSphereSnapshot {
    return this.#bridge.getClusteredLightBoundsAt(set, index);
  }
  public copyClusteredLightBounds(set: NativeHandle): readonly BoundingSphereSnapshot[] {
    return this.#bridge.copyClusteredLightBounds(set);
  }
  public destroyClusteredLightSet(set: NativeHandle): void {
    this.#bridge.destroyClusteredLightSet(set);
  }
  public createClusterGrid(device: NativeHandle, tilesX: number, tilesY: number, sliceCount: number): NativeHandle {
    return this.#bridge.createClusterGrid(device, tilesX, tilesY, sliceCount);
  }
  public getClusterGridTilesX(grid: NativeHandle): number {
    return this.#bridge.getClusterGridTilesX(grid);
  }
  public getClusterGridTilesY(grid: NativeHandle): number {
    return this.#bridge.getClusterGridTilesY(grid);
  }
  public getClusterGridSliceCount(grid: NativeHandle): number {
    return this.#bridge.getClusterGridSliceCount(grid);
  }
  public getClusterGridClusterCount(grid: NativeHandle): number {
    return this.#bridge.getClusterGridClusterCount(grid);
  }
  public getClusterIndex(grid: NativeHandle, x: number, y: number, slice: number): number {
    return this.#bridge.getClusterIndex(grid, x, y, slice);
  }
  public setClusterGridProjection(grid: NativeHandle, projection: readonly number[], nearPlane: number, farPlane: number): void {
    this.#bridge.setClusterGridProjection(grid, projection, nearPlane, farPlane);
  }
  public clusterGridHasProjection(grid: NativeHandle): boolean {
    return this.#bridge.clusterGridHasProjection(grid);
  }
  public getClusterGridNearPlane(grid: NativeHandle): number {
    return this.#bridge.getClusterGridNearPlane(grid);
  }
  public getClusterGridFarPlane(grid: NativeHandle): number {
    return this.#bridge.getClusterGridFarPlane(grid);
  }
  public getClusterGridInverseProjection(grid: NativeHandle): readonly number[] {
    return this.#bridge.getClusterGridInverseProjection(grid);
  }
  public getClusterSliceDistance(grid: NativeHandle, slice: number): number {
    return this.#bridge.getClusterSliceDistance(grid, slice);
  }
  public getClusterSliceForViewDistance(grid: NativeHandle, viewDistance: number): number {
    return this.#bridge.getClusterSliceForViewDistance(grid, viewDistance);
  }
  public getClusterBounds(grid: NativeHandle, x: number, y: number, slice: number): ClusterBoundsSnapshot {
    return this.#bridge.getClusterBounds(grid, x, y, slice);
  }
  public destroyClusterGrid(grid: NativeHandle): void {
    this.#bridge.destroyClusterGrid(grid);
  }
  public createClusteredLightAssignment(device: NativeHandle): NativeHandle {
    return this.#bridge.createClusteredLightAssignment(device);
  }
  public assignClusteredLights(assignment: NativeHandle, grid: NativeHandle, view: readonly number[], bounds: readonly BoundingSphereSnapshot[]): void {
    this.#bridge.assignClusteredLights(assignment, grid, view, bounds);
  }
  public clearClusteredLightAssignment(assignment: NativeHandle): void {
    this.#bridge.clearClusteredLightAssignment(assignment);
  }
  public getAssignmentLightCount(assignment: NativeHandle): number {
    return this.#bridge.getAssignmentLightCount(assignment);
  }
  public getAssignmentClusterCount(assignment: NativeHandle): number {
    return this.#bridge.getAssignmentClusterCount(assignment);
  }
  public copyLightsInCluster(assignment: NativeHandle, cluster: number): readonly number[] {
    return this.#bridge.copyLightsInCluster(assignment, cluster);
  }
  public copyAssignmentIndices(assignment: NativeHandle): readonly number[] {
    return this.#bridge.copyAssignmentIndices(assignment);
  }
  public copyAssignmentOffsets(assignment: NativeHandle): readonly number[] {
    return this.#bridge.copyAssignmentOffsets(assignment);
  }
  public getAssignmentTotalReferenceCount(assignment: NativeHandle): number {
    return this.#bridge.getAssignmentTotalReferenceCount(assignment);
  }
  public getAssignmentMaxLightsPerCluster(assignment: NativeHandle): number {
    return this.#bridge.getAssignmentMaxLightsPerCluster(assignment);
  }
  public destroyClusteredLightAssignment(assignment: NativeHandle): void {
    this.#bridge.destroyClusteredLightAssignment(assignment);
  }
  public createClusteredShadowPolicy(device: NativeHandle, budget: number): NativeHandle {
    return this.#bridge.createClusteredShadowPolicy(device, budget);
  }
  public getShadowPolicyBudget(policy: NativeHandle): number {
    return this.#bridge.getShadowPolicyBudget(policy);
  }
  public setShadowPolicyBudget(policy: NativeHandle, budget: number): void {
    this.#bridge.setShadowPolicyBudget(policy, budget);
  }
  public getShadowPolicyHysteresis(policy: NativeHandle): number {
    return this.#bridge.getShadowPolicyHysteresis(policy);
  }
  public setShadowPolicyHysteresis(policy: NativeHandle, hysteresis: number): void {
    this.#bridge.setShadowPolicyHysteresis(policy, hysteresis);
  }
  public copyShadowPolicySelected(policy: NativeHandle): readonly number[] {
    return this.#bridge.copyShadowPolicySelected(policy);
  }
  public isShadowPolicySelected(policy: NativeHandle, lightIndex: number): boolean {
    return this.#bridge.isShadowPolicySelected(policy, lightIndex);
  }
  public getShadowPolicyScore(policy: NativeHandle, lightIndex: number): number {
    return this.#bridge.getShadowPolicyScore(policy, lightIndex);
  }
  public getShadowPolicyRequestCount(policy: NativeHandle): number {
    return this.#bridge.getShadowPolicyRequestCount(policy);
  }
  public getShadowPolicyRefusedCount(policy: NativeHandle): number {
    return this.#bridge.getShadowPolicyRefusedCount(policy);
  }
  public resetShadowPolicy(policy: NativeHandle): void {
    this.#bridge.resetShadowPolicy(policy);
  }
  public selectShadowCasters(policy: NativeHandle, lights: NativeHandle, view: readonly number[], projection: readonly number[], cameraPosition: Vector3Snapshot): void {
    this.#bridge.selectShadowCasters(policy, lights, view, projection, cameraPosition);
  }
  public destroyClusteredShadowPolicy(policy: NativeHandle): void {
    this.#bridge.destroyClusteredShadowPolicy(policy);
  }
  public createStandaloneGraphicsDevice(
    adapterIndex: number, graphicsProfile: number, parameters: StandaloneDeviceParameters,
  ): NativeHandle {
    return this.#bridge.createStandaloneGraphicsDevice(adapterIndex, graphicsProfile, parameters);
  }
  public destroyStandaloneGraphicsDevice(device: NativeHandle): void {
    this.#bridge.destroyStandaloneGraphicsDevice(device);
  }
  public supportsGraphicsCapability(device: NativeHandle, capability: number): boolean {
    return this.#bridge.supportsGraphicsCapability(device, capability);
  }
  public getMaxComputeWorkGroupCount(device: NativeHandle, axis: number): number {
    return this.#bridge.getMaxComputeWorkGroupCount(device, axis);
  }
  public getMaxComputeWorkGroupSize(device: NativeHandle, axis: number): number {
    return this.#bridge.getMaxComputeWorkGroupSize(device, axis);
  }
  public getMaxComputeWorkGroupInvocations(device: NativeHandle): number {
    return this.#bridge.getMaxComputeWorkGroupInvocations(device);
  }
  public createStorageBuffer(device: NativeHandle, byteSize: number): NativeHandle {
    return this.#bridge.createStorageBuffer(device, byteSize);
  }
  public createTypedStorageBuffer(device: NativeHandle, elementCount: number, elementByteSize: number): NativeHandle {
    return this.#bridge.createTypedStorageBuffer(device, elementCount, elementByteSize);
  }
  public setStorageBufferBytes(buffer: NativeHandle, bytes: Uint8Array): void {
    this.#bridge.setStorageBufferBytes(buffer, bytes);
  }
  public getStorageBufferBytes(buffer: NativeHandle, byteLength: number): Uint8Array {
    return this.#bridge.getStorageBufferBytes(buffer, byteLength);
  }
  public getStorageBufferByteSize(buffer: NativeHandle): number {
    return this.#bridge.getStorageBufferByteSize(buffer);
  }
  public setStorageBufferElements(buffer: NativeHandle, bytes: Uint8Array, elementByteSize: number): void {
    this.#bridge.setStorageBufferElements(buffer, bytes, elementByteSize);
  }
  public getStorageBufferElements(buffer: NativeHandle, elementCount: number, elementByteSize: number): Uint8Array {
    return this.#bridge.getStorageBufferElements(buffer, elementCount, elementByteSize);
  }
  public getStorageBufferElementCount(buffer: NativeHandle): number {
    return this.#bridge.getStorageBufferElementCount(buffer);
  }
  public getStorageBufferElementByteSize(buffer: NativeHandle): number {
    return this.#bridge.getStorageBufferElementByteSize(buffer);
  }
  public destroyStorageBuffer(buffer: NativeHandle): void {
    this.#bridge.destroyStorageBuffer(buffer);
  }
  public createComputeShader(device: NativeHandle, source: string): NativeHandle {
    return this.#bridge.createComputeShader(device, source);
  }
  public setComputeShaderUniformInt(shader: NativeHandle, name: string, value: number): void {
    this.#bridge.setComputeShaderUniformInt(shader, name, value);
  }
  public setComputeShaderUniformFloat(shader: NativeHandle, name: string, value: number): void {
    this.#bridge.setComputeShaderUniformFloat(shader, name, value);
  }
  public bindComputeStorageBuffer(shader: NativeHandle, binding: number, buffer: NativeHandle): void {
    this.#bridge.bindComputeStorageBuffer(shader, binding, buffer);
  }
  public bindComputeTexture(shader: NativeHandle, unit: number, samplerName: string, texture: NativeHandle): void {
    this.#bridge.bindComputeTexture(shader, unit, samplerName, texture);
  }
  public isComputeImageBindingSupported(shader: NativeHandle): boolean {
    return this.#bridge.isComputeImageBindingSupported(shader);
  }
  public bindComputeImage(shader: NativeHandle, unit: number, texture: NativeHandle, access: number): void {
    this.#bridge.bindComputeImage(shader, unit, texture, access);
  }
  public dispatchComputeShader(shader: NativeHandle, x: number, y: number, z: number): void {
    this.#bridge.dispatchComputeShader(shader, x, y, z);
  }
  public computeShaderBarrier(shader: NativeHandle, bits: number): void {
    this.#bridge.computeShaderBarrier(shader, bits);
  }
  public isComputeShaderValid(shader: NativeHandle): boolean {
    return this.#bridge.isComputeShaderValid(shader);
  }
  public getComputeShaderCompileError(shader: NativeHandle): string {
    return this.#bridge.getComputeShaderCompileError(shader);
  }
  public destroyComputeShader(shader: NativeHandle): void {
    this.#bridge.destroyComputeShader(shader);
  }
  public createGpuTimer(device: NativeHandle): NativeHandle {
    return this.#bridge.createGpuTimer(device);
  }
  public isGpuTimerSupported(timer: NativeHandle): boolean {
    return this.#bridge.isGpuTimerSupported(timer);
  }
  public getGpuTimerUnsupportedReason(timer: NativeHandle): string {
    return this.#bridge.getGpuTimerUnsupportedReason(timer);
  }
  public beginGpuTimer(timer: NativeHandle): void {
    this.#bridge.beginGpuTimer(timer);
  }
  public endGpuTimer(timer: NativeHandle): void {
    this.#bridge.endGpuTimer(timer);
  }
  public isGpuTimerResultAvailable(timer: NativeHandle): boolean {
    return this.#bridge.isGpuTimerResultAvailable(timer);
  }
  public pollGpuTimer(timer: NativeHandle): boolean {
    return this.#bridge.pollGpuTimer(timer);
  }
  public getGpuTimerLastMilliseconds(timer: NativeHandle): number {
    return this.#bridge.getGpuTimerLastMilliseconds(timer);
  }
  public getGpuTimerSampleCount(timer: NativeHandle): number {
    return this.#bridge.getGpuTimerSampleCount(timer);
  }
  public isGpuTimerOpen(timer: NativeHandle): boolean {
    return this.#bridge.isGpuTimerOpen(timer);
  }
  public destroyGpuTimer(timer: NativeHandle): void {
    this.#bridge.destroyGpuTimer(timer);
  }
  public createBlitPass(device: NativeHandle): NativeHandle {
    return this.#bridge.createBlitPass(device);
  }
  public createColorGradePass(device: NativeHandle): NativeHandle { return this.#bridge.createColorGradePass(device); }
  public createIdentityLutTexture(device: NativeHandle, size: number): NativeHandle { return this.#bridge.createIdentityLutTexture(device, size); }
  public getColorGradeInterpolation(pass: NativeHandle): number { return this.#bridge.getColorGradeInterpolation(pass); }
  public setColorGradeInterpolation(pass: NativeHandle, interpolation: number): void { this.#bridge.setColorGradeInterpolation(pass, interpolation); }
  public getColorGradeLut(pass: NativeHandle): NativeHandle { return this.#bridge.getColorGradeLut(pass); }
  public setColorGradeLut(pass: NativeHandle, lut: NativeHandle): void { this.#bridge.setColorGradeLut(pass, lut); }
  public getColorGradeVolumeLut(pass: NativeHandle): NativeHandle { return this.#bridge.getColorGradeVolumeLut(pass); }
  public setColorGradeVolumeLut(pass: NativeHandle, lut: NativeHandle): void { this.#bridge.setColorGradeVolumeLut(pass, lut); }
  public getColorGradeStrength(pass: NativeHandle): number { return this.#bridge.getColorGradeStrength(pass); }
  public setColorGradeStrength(pass: NativeHandle, strength: number): void { this.#bridge.setColorGradeStrength(pass, strength); }
  public lutSizeForStrip(width: number, height: number): number { return this.#bridge.lutSizeForStrip(width, height); }
  public parseCubeLut(text: string): NativeHandle { return this.#bridge.parseCubeLut(text); }
  public destroyCubeLut(lut: NativeHandle): void { this.#bridge.destroyCubeLut(lut); }
  public getCubeLutSize(lut: NativeHandle): number { return this.#bridge.getCubeLutSize(lut); }
  public getCubeLutEntry(lut: NativeHandle, red: number, green: number, blue: number): Vector3Snapshot { return this.#bridge.getCubeLutEntry(lut, red, green, blue); }
  public getCubeLutDomainMin(lut: NativeHandle): Vector3Snapshot { return this.#bridge.getCubeLutDomainMin(lut); }
  public getCubeLutDomainMax(lut: NativeHandle): Vector3Snapshot { return this.#bridge.getCubeLutDomainMax(lut); }
  public isCubeLutUnitDomain(lut: NativeHandle): boolean { return this.#bridge.isCubeLutUnitDomain(lut); }
  public getCubeLutTitle(lut: NativeHandle): string { return this.#bridge.getCubeLutTitle(lut); }
  public createCubeLutStripTexture(lut: NativeHandle, device: NativeHandle): NativeHandle { return this.#bridge.createCubeLutStripTexture(lut, device); }
  public createCubeLutVolumeTexture(lut: NativeHandle, device: NativeHandle): NativeHandle { return this.#bridge.createCubeLutVolumeTexture(lut, device); }
  public createDepthOfFieldPass(device: NativeHandle): NativeHandle { return this.#bridge.createDepthOfFieldPass(device); }
  public getDepthOfFieldFocusDistance(pass: NativeHandle): number { return this.#bridge.getDepthOfFieldFocusDistance(pass); }
  public setDepthOfFieldFocusDistance(pass: NativeHandle, value: number): void { this.#bridge.setDepthOfFieldFocusDistance(pass, value); }
  public getDepthOfFieldFocalLength(pass: NativeHandle): number { return this.#bridge.getDepthOfFieldFocalLength(pass); }
  public setDepthOfFieldFocalLength(pass: NativeHandle, value: number): void { this.#bridge.setDepthOfFieldFocalLength(pass, value); }
  public getDepthOfFieldFNumber(pass: NativeHandle): number { return this.#bridge.getDepthOfFieldFNumber(pass); }
  public setDepthOfFieldFNumber(pass: NativeHandle, value: number): void { this.#bridge.setDepthOfFieldFNumber(pass, value); }
  public getDepthOfFieldMaxRadius(pass: NativeHandle): number { return this.#bridge.getDepthOfFieldMaxRadius(pass); }
  public setDepthOfFieldMaxRadius(pass: NativeHandle, value: number): void { this.#bridge.setDepthOfFieldMaxRadius(pass, value); }
  public circleOfConfusionMillimetres( depth: number, focusDistance: number, focalLength: number, fNumber: number, ): number { return this.#bridge.circleOfConfusionMillimetres(depth, focusDistance, focalLength, fNumber, ); }
  public createLensFlarePass(device: NativeHandle): NativeHandle { return this.#bridge.createLensFlarePass(device); }
  public getLensFlareThreshold(pass: NativeHandle): number { return this.#bridge.getLensFlareThreshold(pass); }
  public setLensFlareThreshold(pass: NativeHandle, value: number): void { this.#bridge.setLensFlareThreshold(pass, value); }
  public getLensFlareIntensity(pass: NativeHandle): number { return this.#bridge.getLensFlareIntensity(pass); }
  public setLensFlareIntensity(pass: NativeHandle, value: number): void { this.#bridge.setLensFlareIntensity(pass, value); }
  public getLensFlareDispersal(pass: NativeHandle): number { return this.#bridge.getLensFlareDispersal(pass); }
  public setLensFlareDispersal(pass: NativeHandle, value: number): void { this.#bridge.setLensFlareDispersal(pass, value); }
  public createMotionBlurPass(device: NativeHandle): NativeHandle { return this.#bridge.createMotionBlurPass(device); }
  public getMotionBlurStrength(pass: NativeHandle): number { return this.#bridge.getMotionBlurStrength(pass); }
  public setMotionBlurStrength(pass: NativeHandle, value: number): void { this.#bridge.setMotionBlurStrength(pass, value); }
  public getMotionBlurMaxDistance(pass: NativeHandle): number { return this.#bridge.getMotionBlurMaxDistance(pass); }
  public setMotionBlurMaxDistance(pass: NativeHandle, value: number): void { this.#bridge.setMotionBlurMaxDistance(pass, value); }
  public createChromaticAberrationPass(device: NativeHandle): NativeHandle { return this.#bridge.createChromaticAberrationPass(device); }
  public getChromaticAberrationStrength(pass: NativeHandle): number { return this.#bridge.getChromaticAberrationStrength(pass); }
  public setChromaticAberrationStrength(pass: NativeHandle, value: number): void { this.#bridge.setChromaticAberrationStrength(pass, value); }
  public createFilmGrainPass(device: NativeHandle): NativeHandle { return this.#bridge.createFilmGrainPass(device); }
  public getFilmGrainIntensity(pass: NativeHandle): number { return this.#bridge.getFilmGrainIntensity(pass); }
  public setFilmGrainIntensity(pass: NativeHandle, value: number): void { this.#bridge.setFilmGrainIntensity(pass, value); }
  public createAsciiPass(device: NativeHandle): NativeHandle { return this.#bridge.createAsciiPass(device); }
  public getAsciiPassEffect(pass: NativeHandle): NativeHandle { return this.#bridge.getAsciiPassEffect(pass); }
  public extractBloomChannel(value: number, threshold: number): number { return this.#bridge.extractBloomChannel(value, threshold); }
  public tonemapChannel(mode: number, value: number, exposure: number, gamma: number): number { return this.#bridge.tonemapChannel(mode, value, exposure, gamma); }
  public getFxaaFragmentGlsl(): string { return this.#bridge.getFxaaFragmentGlsl(); }
  public getSsaoKernel(pass: NativeHandle): readonly Vector3Snapshot[] { return this.#bridge.getSsaoKernel(pass); }
  public getSsaoOcclusionGlsl(packed: boolean): string { return this.#bridge.getSsaoOcclusionGlsl(packed); }
  public evaluateThinFilmIridescence( outsideIor: number, filmIor: number, cosTheta: number, thicknessNanometres: number, baseReflectance: Vector3Snapshot, ): Vector3Snapshot { return this.#bridge.evaluateThinFilmIridescence(outsideIor, filmIor, cosTheta, thicknessNanometres, baseReflectance, ); }
  public getThinFilmIridescenceGlsl(): string { return this.#bridge.getThinFilmIridescenceGlsl(); }
  public createFullscreenPass(device: NativeHandle): NativeHandle { return this.#bridge.createFullscreenPass(device); }
  public destroyFullscreenPass(pass: NativeHandle): void { this.#bridge.destroyFullscreenPass(pass); }
  public drawFullscreenPass( pass: NativeHandle, source: NativeHandle, destination: NativeHandle, effect: NativeHandle, width: number, height: number, ): void { this.#bridge.drawFullscreenPass(pass, source, destination, effect, width, height, ); }
  public drawFullscreenPassOverCurrentTarget( pass: NativeHandle, source: NativeHandle, effect: NativeHandle, width: number, height: number, ): void { this.#bridge.drawFullscreenPassOverCurrentTarget(pass, source, effect, width, height, ); }
  public createEffectPass(device: NativeHandle, effect: NativeHandle, name: string): NativeHandle { return this.#bridge.createEffectPass(device, effect, name); }
  public createOwningEffectPass(device: NativeHandle, effect: NativeHandle, name: string): NativeHandle { return this.#bridge.createOwningEffectPass(device, effect, name); }
  public getEffectPassEffect(pass: NativeHandle): NativeHandle { return this.#bridge.getEffectPassEffect(pass); }
  public setEffectPassEffect(pass: NativeHandle, effect: NativeHandle): void { this.#bridge.setEffectPassEffect(pass, effect); }
  public beginScopedRenderTarget(device: NativeHandle, destination: NativeHandle): NativeHandle { return this.#bridge.beginScopedRenderTarget(device, destination); }
  public endScopedRenderTarget(scope: NativeHandle): void { this.#bridge.endScopedRenderTarget(scope); }
  public scopedRenderTargetHasRecordedPrevious(scope: NativeHandle): boolean { return this.#bridge.scopedRenderTargetHasRecordedPrevious(scope); }
  public createAsciiEffect(device: NativeHandle): NativeHandle { return this.#bridge.createAsciiEffect(device); }
  public destroyAsciiEffect(effect: NativeHandle): void { this.#bridge.destroyAsciiEffect(effect); }
  public getAsciiCellSize(effect: NativeHandle): SizeSnapshot { return this.#bridge.getAsciiCellSize(effect); }
  public setAsciiCellSize(effect: NativeHandle, width: number, height: number): void { this.#bridge.setAsciiCellSize(effect, width, height); }
  public getAsciiQuantizeMode(effect: NativeHandle): number { return this.#bridge.getAsciiQuantizeMode(effect); }
  public setAsciiQuantizeMode(effect: NativeHandle, mode: number): void { this.#bridge.setAsciiQuantizeMode(effect, mode); }
  public drawAsciiEffect( effect: NativeHandle, source: NativeHandle, destination: RectangleSnapshot, ): void { this.#bridge.drawAsciiEffect(effect, source, destination, ); }
  public getAsciiLastGridDimensions(effect: NativeHandle): SizeSnapshot { return this.#bridge.getAsciiLastGridDimensions(effect); }
  public createCrtEffect(device: NativeHandle): NativeHandle { return this.#bridge.createCrtEffect(device); }
  public getCrtScanlineIntensity(effect: NativeHandle): number { return this.#bridge.getCrtScanlineIntensity(effect); }
  public setCrtScanlineIntensity(effect: NativeHandle, value: number): void { this.#bridge.setCrtScanlineIntensity(effect, value); }
  public getCrtCurvature(effect: NativeHandle): number { return this.#bridge.getCrtCurvature(effect); }
  public setCrtCurvature(effect: NativeHandle, value: number): void { this.#bridge.setCrtCurvature(effect, value); }
  public getCrtVignetteIntensity(effect: NativeHandle): number { return this.#bridge.getCrtVignetteIntensity(effect); }
  public setCrtVignetteIntensity(effect: NativeHandle, value: number): void { this.#bridge.setCrtVignetteIntensity(effect, value); }
  public getCrtMaskIntensity(effect: NativeHandle): number { return this.#bridge.getCrtMaskIntensity(effect); }
  public setCrtMaskIntensity(effect: NativeHandle, value: number): void { this.#bridge.setCrtMaskIntensity(effect, value); }
  public getCrtMaskType(effect: NativeHandle): number { return this.#bridge.getCrtMaskType(effect); }
  public setCrtMaskType(effect: NativeHandle, maskType: number): void { this.#bridge.setCrtMaskType(effect, maskType); }
  public createDepthEffect(device: NativeHandle): NativeHandle { return this.#bridge.createDepthEffect(device); }
  public getDepthEffectMode(effect: NativeHandle): number { return this.#bridge.getDepthEffectMode(effect); }
  public setDepthEffectMode(effect: NativeHandle, mode: number): void { this.#bridge.setDepthEffectMode(effect, mode); }
  public getDepthEffectDitherMode(effect: NativeHandle): number { return this.#bridge.getDepthEffectDitherMode(effect); }
  public setDepthEffectDitherMode(effect: NativeHandle, mode: number): void { this.#bridge.setDepthEffectDitherMode(effect, mode); }
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

  // The canonical PBR material, its glTF extensions, and the bridge between them.
  public getDefaultPbrMaterialExt(): PbrMaterialExtSnapshot { return this.#bridge.getDefaultPbrMaterialExt(); }
  public getDefaultTextureTransform(): TextureTransformSnapshot { return this.#bridge.getDefaultTextureTransform(); }
  public pbrMaterialExtEquals(first: PbrMaterialExtSnapshot, second: PbrMaterialExtSnapshot): boolean { return this.#bridge.pbrMaterialExtEquals(first, second); }
  public getPbrMaterialExtHashCode(material: PbrMaterialExtSnapshot): bigint { return this.#bridge.getPbrMaterialExtHashCode(material); }
  public getPbrMaterialExtText(material: PbrMaterialExtSnapshot): string { return this.#bridge.getPbrMaterialExtText(material); }
  public applyPbrMaterialState(material: PbrMaterialExtSnapshot, device: NativeHandle): void { this.#bridge.applyPbrMaterialState(material, device); }
  public getDeviceBlendState(device: NativeHandle): BlendStateSnapshot { return this.#bridge.getDeviceBlendState(device); }
  public getDeviceRasterizerState(device: NativeHandle): RasterizerStateSnapshot { return this.#bridge.getDeviceRasterizerState(device); }

  // The volumetric and atmospheric screen-space passes.
  public createAerialPerspectivePass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createAerialPerspectivePass(graphicsDevice); }
  public getAerialPerspectiveSunDirection(pass: NativeHandle): Vector3Snapshot { return this.#bridge.getAerialPerspectiveSunDirection(pass); }
  public setAerialPerspectiveSunDirection(pass: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setAerialPerspectiveSunDirection(pass, value); }
  public getAerialPerspectiveTurbidity(pass: NativeHandle): number { return this.#bridge.getAerialPerspectiveTurbidity(pass); }
  public setAerialPerspectiveTurbidity(pass: NativeHandle, value: number): void { this.#bridge.setAerialPerspectiveTurbidity(pass, value); }
  public getAerialPerspectiveIntensity(pass: NativeHandle): number { return this.#bridge.getAerialPerspectiveIntensity(pass); }
  public setAerialPerspectiveIntensity(pass: NativeHandle, value: number): void { this.#bridge.setAerialPerspectiveIntensity(pass, value); }
  public getAerialPerspectiveScaleHeight(pass: NativeHandle): number { return this.#bridge.getAerialPerspectiveScaleHeight(pass); }
  public setAerialPerspectiveScaleHeight(pass: NativeHandle, value: number): void { this.#bridge.setAerialPerspectiveScaleHeight(pass, value); }
  public createVolumetricFogPass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createVolumetricFogPass(graphicsDevice); }
  public getVolumetricFogDensity(pass: NativeHandle): number { return this.#bridge.getVolumetricFogDensity(pass); }
  public setVolumetricFogDensity(pass: NativeHandle, value: number): void { this.#bridge.setVolumetricFogDensity(pass, value); }
  public getVolumetricFogAnisotropy(pass: NativeHandle): number { return this.#bridge.getVolumetricFogAnisotropy(pass); }
  public setVolumetricFogAnisotropy(pass: NativeHandle, value: number): void { this.#bridge.setVolumetricFogAnisotropy(pass, value); }
  public getVolumetricFogRange(pass: NativeHandle): number { return this.#bridge.getVolumetricFogRange(pass); }
  public setVolumetricFogRange(pass: NativeHandle, value: number): void { this.#bridge.setVolumetricFogRange(pass, value); }
  public createHeightFogPass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createHeightFogPass(graphicsDevice); }
  public getHeightFogColor(pass: NativeHandle): Vector3Snapshot { return this.#bridge.getHeightFogColor(pass); }
  public setHeightFogColor(pass: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setHeightFogColor(pass, value); }
  public getHeightFogDensity(pass: NativeHandle): number { return this.#bridge.getHeightFogDensity(pass); }
  public setHeightFogDensity(pass: NativeHandle, value: number): void { this.#bridge.setHeightFogDensity(pass, value); }
  public getHeightFogFalloff(pass: NativeHandle): number { return this.#bridge.getHeightFogFalloff(pass); }
  public setHeightFogFalloff(pass: NativeHandle, value: number): void { this.#bridge.setHeightFogFalloff(pass, value); }
  public getHeightFogBaseHeight(pass: NativeHandle): number { return this.#bridge.getHeightFogBaseHeight(pass); }
  public setHeightFogBaseHeight(pass: NativeHandle, value: number): void { this.#bridge.setHeightFogBaseHeight(pass, value); }
  public createLightShaftPass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createLightShaftPass(graphicsDevice); }
  public getLightShaftLightScreenPosition(pass: NativeHandle): Vector2Snapshot { return this.#bridge.getLightShaftLightScreenPosition(pass); }
  public setLightShaftLightScreenPosition(pass: NativeHandle, value: Vector2Snapshot): void { this.#bridge.setLightShaftLightScreenPosition(pass, value); }
  public getLightShaftThreshold(pass: NativeHandle): number { return this.#bridge.getLightShaftThreshold(pass); }
  public setLightShaftThreshold(pass: NativeHandle, value: number): void { this.#bridge.setLightShaftThreshold(pass, value); }
  public getLightShaftIntensity(pass: NativeHandle): number { return this.#bridge.getLightShaftIntensity(pass); }
  public setLightShaftIntensity(pass: NativeHandle, value: number): void { this.#bridge.setLightShaftIntensity(pass, value); }
  public getLightShaftDecay(pass: NativeHandle): number { return this.#bridge.getLightShaftDecay(pass); }
  public setLightShaftDecay(pass: NativeHandle, value: number): void { this.#bridge.setLightShaftDecay(pass, value); }
  public aerialPerspectiveCopyFallbackReason(pass: NativeHandle): string { return this.#bridge.aerialPerspectiveCopyFallbackReason(pass); }
  public aerialPerspectiveAirMassForDistance(viewDirection: Vector3Snapshot, distance: number, scaleHeight: number): number { return this.#bridge.aerialPerspectiveAirMassForDistance(viewDirection, distance, scaleHeight); }
  public aerialPerspectiveTransmittance(turbidity: number, airMass: number): Vector3Snapshot { return this.#bridge.aerialPerspectiveTransmittance(turbidity, airMass); }
  public heightFogOpticalDepth(cameraHeight: number, rayHeightStep: number, distance: number, density: number, falloff: number, baseHeight: number,): number { return this.#bridge.heightFogOpticalDepth(cameraHeight, rayHeightStep, distance, density, falloff, baseHeight, ); }
  public setVolumetricFogLight(pass: NativeHandle, shadowMap: NativeHandle, direction: Vector3Snapshot, color: Vector3Snapshot,): void { this.#bridge.setVolumetricFogLight(pass, shadowMap, direction, color, ); }

  // Frustum culling, GPU instance culling and the instanced renderer.
  public createFrustumCuller(): NativeHandle { return this.#bridge.createFrustumCuller(); }
  public destroyFrustumCuller(culler: NativeHandle): void { this.#bridge.destroyFrustumCuller(culler); }
  public setFrustumCullerViewProjection(culler: NativeHandle, viewProjection: readonly number[]): void { this.#bridge.setFrustumCullerViewProjection(culler, viewProjection); }
  public setFrustumCullerCamera(culler: NativeHandle, view: readonly number[], projection: readonly number[]): void { this.#bridge.setFrustumCullerCamera(culler, view, projection); }
  public getFrustumCullerFrustum(culler: NativeHandle): readonly number[] { return this.#bridge.getFrustumCullerFrustum(culler); }
  public isFrustumCullerBoxVisible(culler: NativeHandle, box: ClusterBoundsSnapshot): boolean { return this.#bridge.isFrustumCullerBoxVisible(culler, box); }
  public isFrustumCullerSphereVisible(culler: NativeHandle, sphere: BoundingSphereSnapshot): boolean { return this.#bridge.isFrustumCullerSphereVisible(culler, sphere); }
  public frustumCullerCullBoxes(culler: NativeHandle, bounds: readonly ClusterBoundsSnapshot[]): readonly number[] { return this.#bridge.frustumCullerCullBoxes(culler, bounds); }
  public frustumCullerCullSpheres(culler: NativeHandle, bounds: readonly BoundingSphereSnapshot[]): readonly number[] { return this.#bridge.frustumCullerCullSpheres(culler, bounds); }
  public frustumCullerCullTransforms(culler: NativeHandle, transforms: readonly (readonly number[])[], bounds: readonly ClusterBoundsSnapshot[]): readonly (readonly number[])[] { return this.#bridge.frustumCullerCullTransforms(culler, transforms, bounds); }
  public createGpuInstanceCuller(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createGpuInstanceCuller(graphicsDevice); }
  public destroyGpuInstanceCuller(culler: NativeHandle): void { this.#bridge.destroyGpuInstanceCuller(culler); }
  public isGpuInstanceCullerSupported(culler: NativeHandle): boolean { return this.#bridge.isGpuInstanceCullerSupported(culler); }
  public getGpuInstanceCullerUnsupportedReason(culler: NativeHandle): string { return this.#bridge.getGpuInstanceCullerUnsupportedReason(culler); }
  public setGpuInstanceCullerInstances(culler: NativeHandle, instances: readonly CullableInstanceSnapshot[]): void { this.#bridge.setGpuInstanceCullerInstances(culler, instances); }
  public getGpuInstanceCullerInstanceCount(culler: NativeHandle): number { return this.#bridge.getGpuInstanceCullerInstanceCount(culler); }
  public gpuInstanceCullerCull(culler: NativeHandle, view: readonly number[], projection: readonly number[], indexCount: number, firstIndex: number, baseVertex: number): void { this.#bridge.gpuInstanceCullerCull(culler, view, projection, indexCount, firstIndex, baseVertex); }
  public gpuInstanceCullerDraw(culler: NativeHandle, primitiveType: number): void { this.#bridge.gpuInstanceCullerDraw(culler, primitiveType); }
  public getGpuInstanceCullerVisibleCount(culler: NativeHandle): number { return this.#bridge.getGpuInstanceCullerVisibleCount(culler); }
  public getGpuInstanceCullerInstanceLookupGlsl(): string { return this.#bridge.getGpuInstanceCullerInstanceLookupGlsl(); }
  public getInstancedRendererInstanceElements(): readonly VertexElementSnapshot[] { return this.#bridge.getInstancedRendererInstanceElements(); }
  public getInstancedRendererInstanceStride(): number { return this.#bridge.getInstancedRendererInstanceStride(); }
  public getInstancedRendererTintElements(): readonly VertexElementSnapshot[] { return this.#bridge.getInstancedRendererTintElements(); }
  public getInstancedRendererTintStride(): number { return this.#bridge.getInstancedRendererTintStride(); }

  // The debug drawer.
  public createDebugDraw(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createDebugDraw(graphicsDevice); }
  public destroyDebugDraw(debug: NativeHandle): void { this.#bridge.destroyDebugDraw(debug); }
  public beginDebugDraw(debug: NativeHandle, view: readonly number[], projection: readonly number[]): void { this.#bridge.beginDebugDraw(debug, view, projection); }
  public endDebugDraw(debug: NativeHandle): void { this.#bridge.endDebugDraw(debug); }
  public clearDebugDraw(debug: NativeHandle): void { this.#bridge.clearDebugDraw(debug); }
  public addDebugDrawLine(debug: NativeHandle, from: Vector3Snapshot, to: Vector3Snapshot, color: number): void { this.#bridge.addDebugDrawLine(debug, from, to, color); }
  public addDebugDrawBox(debug: NativeHandle, bounds: ClusterBoundsSnapshot, color: number): void { this.#bridge.addDebugDrawBox(debug, bounds, color); }
  public addDebugDrawSphere(debug: NativeHandle, centre: Vector3Snapshot, radius: number, color: number, segments: number): void { this.#bridge.addDebugDrawSphere(debug, centre, radius, color, segments); }
  public addDebugDrawBoundingSphere(debug: NativeHandle, sphere: BoundingSphereSnapshot, color: number, segments: number): void { this.#bridge.addDebugDrawBoundingSphere(debug, sphere, color, segments); }
  public addDebugDrawFrustum(debug: NativeHandle, viewProjection: readonly number[], color: number): void { this.#bridge.addDebugDrawFrustum(debug, viewProjection, color); }
  public addDebugDrawCross(debug: NativeHandle, position: Vector3Snapshot, size: number, color: number): void { this.#bridge.addDebugDrawCross(debug, position, size, color); }
  public isDebugDrawDepthTested(debug: NativeHandle): boolean { return this.#bridge.isDebugDrawDepthTested(debug); }
  public setDebugDrawDepthTested(debug: NativeHandle, value: boolean): void { this.#bridge.setDebugDrawDepthTested(debug, value); }
  public getDebugDrawLineCount(debug: NativeHandle): number { return this.#bridge.getDebugDrawLineCount(debug); }
  public getDebugDrawVertices(debug: NativeHandle, depthTested: boolean): readonly DebugVertexSnapshot[] { return this.#bridge.getDebugDrawVertices(debug, depthTested); }
  public addDebugDrawPointLightGizmo(debug: NativeHandle, light: PointLightSnapshot, color: number): void { this.#bridge.addDebugDrawPointLightGizmo(debug, light, color); }
  public addDebugDrawSpotLightGizmo(debug: NativeHandle, light: SpotLightSnapshot, color: number, segments: number): void { this.#bridge.addDebugDrawSpotLightGizmo(debug, light, color, segments); }
  public addDebugDrawDirectionalLightGizmo(debug: NativeHandle, light: DirectionalLightSnapshot, at: Vector3Snapshot, length: number, color: number): void { this.#bridge.addDebugDrawDirectionalLightGizmo(debug, light, at, length, color); }
  public addDebugDrawProbeVolumeGizmo(debug: NativeHandle, volume: NativeHandle, color: number, crossSize: number): void { this.#bridge.addDebugDrawProbeVolumeGizmo(debug, volume, color, crossSize); }
  public addDebugDrawCascadeGizmo(debug: NativeHandle, cascades: NativeHandle, color: number): void { this.#bridge.addDebugDrawCascadeGizmo(debug, cascades, color); }

  // HDR display output, automatic exposure and spatial upscaling.
  public createSpatialUpscalePass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createSpatialUpscalePass(graphicsDevice); }
  public destroySpatialUpscalePass(pass: NativeHandle): void { this.#bridge.destroySpatialUpscalePass(pass); }
  public getSpatialUpscaleSharpness(pass: NativeHandle): number { return this.#bridge.getSpatialUpscaleSharpness(pass); }
  public setSpatialUpscaleSharpness(pass: NativeHandle, value: number): void { this.#bridge.setSpatialUpscaleSharpness(pass, value); }
  public isSpatialUpscaleEdgeAdaptive(pass: NativeHandle): boolean { return this.#bridge.isSpatialUpscaleEdgeAdaptive(pass); }
  public setSpatialUpscaleEdgeAdaptive(pass: NativeHandle, value: boolean): void { this.#bridge.setSpatialUpscaleEdgeAdaptive(pass, value); }
  public drawSpatialUpscalePass(pass: NativeHandle, source: NativeHandle, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): void { this.#bridge.drawSpatialUpscalePass(pass, source, sourceWidth, sourceHeight, targetWidth, targetHeight); }
  public isSpatialUpscaleIdentityScale(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): boolean { return this.#bridge.isSpatialUpscaleIdentityScale(sourceWidth, sourceHeight, targetWidth, targetHeight); }
  public createHdrDisplayOutput(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createHdrDisplayOutput(graphicsDevice); }
  public destroyHdrDisplayOutput(output: NativeHandle): void { this.#bridge.destroyHdrDisplayOutput(output); }
  public isHdrDisplayOutputSupported(output: NativeHandle): boolean { return this.#bridge.isHdrDisplayOutputSupported(output); }
  public getHdrDisplayColorSpace(output: NativeHandle): number { return this.#bridge.getHdrDisplayColorSpace(output); }
  public setHdrDisplayColorSpace(output: NativeHandle, value: number): void { this.#bridge.setHdrDisplayColorSpace(output, value); }
  public getHdrDisplayPaperWhiteNits(output: NativeHandle): number { return this.#bridge.getHdrDisplayPaperWhiteNits(output); }
  public setHdrDisplayPaperWhiteNits(output: NativeHandle, value: number): void { this.#bridge.setHdrDisplayPaperWhiteNits(output, value); }
  public getHdrDisplayPeakNits(output: NativeHandle): number { return this.#bridge.getHdrDisplayPeakNits(output); }
  public setHdrDisplayPeakNits(output: NativeHandle, value: number): void { this.#bridge.setHdrDisplayPeakNits(output, value); }
  public drawHdrDisplayOutput(output: NativeHandle, source: NativeHandle, destination: NativeHandle, width: number, height: number): void { this.#bridge.drawHdrDisplayOutput(output, source, destination, width, height); }
  public hdrEncodePq(nits: number): number { return this.#bridge.hdrEncodePq(nits); }
  public hdrDecodePq(encoded: number): number { return this.#bridge.hdrDecodePq(encoded); }
  public hdrRec709ToRec2020(color: Vector3Snapshot): Vector3Snapshot { return this.#bridge.hdrRec709ToRec2020(color); }
  public hdrRollOff(nits: number, peakNits: number): number { return this.#bridge.hdrRollOff(nits, peakNits); }
  public hdrEncode(space: number, sceneLinear: Vector3Snapshot, paperWhiteNits: number, peakNits: number): Vector3Snapshot { return this.#bridge.hdrEncode(space, sceneLinear, paperWhiteNits, peakNits); }
  public createAutoExposure(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createAutoExposure(graphicsDevice); }
  public destroyAutoExposure(autoExposure: NativeHandle): void { this.#bridge.destroyAutoExposure(autoExposure); }
  public measureAutoExposureLuminance(autoExposure: NativeHandle, scene: NativeHandle): number { return this.#bridge.measureAutoExposureLuminance(autoExposure, scene); }
  public updateAutoExposure(autoExposure: NativeHandle, scene: NativeHandle, deltaSeconds: number): number { return this.#bridge.updateAutoExposure(autoExposure, scene, deltaSeconds); }
  public getAutoExposureExposure(autoExposure: NativeHandle): number { return this.#bridge.getAutoExposureExposure(autoExposure); }
  public setAutoExposureExposure(autoExposure: NativeHandle, value: number): void { this.#bridge.setAutoExposureExposure(autoExposure, value); }
  public getAutoExposureKeyValue(autoExposure: NativeHandle): number { return this.#bridge.getAutoExposureKeyValue(autoExposure); }
  public setAutoExposureKeyValue(autoExposure: NativeHandle, value: number): void { this.#bridge.setAutoExposureKeyValue(autoExposure, value); }
  public getAutoExposureBrighteningSpeed(autoExposure: NativeHandle): number { return this.#bridge.getAutoExposureBrighteningSpeed(autoExposure); }
  public getAutoExposureDarkeningSpeed(autoExposure: NativeHandle): number { return this.#bridge.getAutoExposureDarkeningSpeed(autoExposure); }
  public setAutoExposureAdaptationSpeeds(autoExposure: NativeHandle, brighteningPerSecond: number, darkeningPerSecond: number): void { this.#bridge.setAutoExposureAdaptationSpeeds(autoExposure, brighteningPerSecond, darkeningPerSecond); }
  public setAutoExposureRange(autoExposure: NativeHandle, minimum: number, maximum: number): void { this.#bridge.setAutoExposureRange(autoExposure, minimum, maximum); }

  // The render pipeline and its settings.
  public getDefaultPipelineSettings(): PipelineSettingsSnapshot { return this.#bridge.getDefaultPipelineSettings(); }
  public normalizePipelineSettings(settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot { return this.#bridge.normalizePipelineSettings(settings); }
  public applyPipelineQualityPreset(settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot { return this.#bridge.applyPipelineQualityPreset(settings); }
  public getPipelineSettings(pipeline: NativeHandle): PipelineSettingsSnapshot { return this.#bridge.getPipelineSettings(pipeline); }
  public setPipelineSettings(pipeline: NativeHandle, settings: PipelineSettingsSnapshot): void { this.#bridge.setPipelineSettings(pipeline, settings); }
  public applyAutoExposureToSettings(autoExposure: NativeHandle, settings: PipelineSettingsSnapshot): PipelineSettingsSnapshot { return this.#bridge.applyAutoExposureToSettings(autoExposure, settings); }
  public addPipelineUserPass(pipeline: NativeHandle, pass: NativeHandle): void { this.#bridge.addPipelineUserPass(pipeline, pass); }
  public clearPipelineUserPasses(pipeline: NativeHandle): void { this.#bridge.clearPipelineUserPasses(pipeline); }
  public setPipelineDepthNormalInputs(pipeline: NativeHandle, depth: NativeHandle, normals: NativeHandle): void { this.#bridge.setPipelineDepthNormalInputs(pipeline, depth, normals); }
  public setPipelineVelocityInput(pipeline: NativeHandle, velocity: NativeHandle): void { this.#bridge.setPipelineVelocityInput(pipeline, velocity); }
  public setPipelineCamera(pipeline: NativeHandle, view: readonly number[], projection: readonly number[], nearPlane: number, farPlane: number): void { this.#bridge.setPipelineCamera(pipeline, view, projection, nearPlane, farPlane); }
  public setPipelineSkyboxCamera(pipeline: NativeHandle, view: readonly number[], projection: readonly number[]): void { this.#bridge.setPipelineSkyboxCamera(pipeline, view, projection); }
  public getPipelineTransparencyFallbackReason(pipeline: NativeHandle): string { return this.#bridge.getPipelineTransparencyFallbackReason(pipeline); }
  public setPipelineGpuTimingEnabled(pipeline: NativeHandle, value: boolean): void { this.#bridge.setPipelineGpuTimingEnabled(pipeline, value); }
  public isPipelineGpuTimingEnabled(pipeline: NativeHandle): boolean { return this.#bridge.isPipelineGpuTimingEnabled(pipeline); }
  public didPipelineSkyboxDraw(pipeline: NativeHandle): boolean { return this.#bridge.didPipelineSkyboxDraw(pipeline); }
  public didPipelineShadowPassRun(pipeline: NativeHandle): boolean { return this.#bridge.didPipelineShadowPassRun(pipeline); }
  public getPipelineShadowMap(pipeline: NativeHandle): NativeHandle { return this.#bridge.getPipelineShadowMap(pipeline); }
  public getPipelineSceneTarget(pipeline: NativeHandle): NativeHandle { return this.#bridge.getPipelineSceneTarget(pipeline); }
  public getPipelineSceneTargetFormat(pipeline: NativeHandle): number { return this.#bridge.getPipelineSceneTargetFormat(pipeline); }
  public isPipelineUsingSceneTarget(pipeline: NativeHandle): boolean { return this.#bridge.isPipelineUsingSceneTarget(pipeline); }
  public releasePipelineDeviceResources(pipeline: NativeHandle): void { this.#bridge.releasePipelineDeviceResources(pipeline); }
  public getPipelinePassTimingCount(pipeline: NativeHandle): number { return this.#bridge.getPipelinePassTimingCount(pipeline); }
  public getPipelinePassTimingName(pipeline: NativeHandle, index: number): string { return this.#bridge.getPipelinePassTimingName(pipeline, index); }

  // Clustered lighting.
  public createClusteredLightBuffer(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createClusteredLightBuffer(graphicsDevice); }
  public destroyClusteredLightBuffer(buffer: NativeHandle): void { this.#bridge.destroyClusteredLightBuffer(buffer); }
  public uploadClusteredLightBuffer(buffer: NativeHandle, lights: NativeHandle, grid: NativeHandle, assignment: NativeHandle): void { this.#bridge.uploadClusteredLightBuffer(buffer, lights, grid, assignment); }
  public bindClusteredLightBuffer(buffer: NativeHandle, effect: NativeHandle, firstUnit: number): void { this.#bridge.bindClusteredLightBuffer(buffer, effect, firstUnit); }
  public isClusteredLightBufferUploaded(buffer: NativeHandle): boolean { return this.#bridge.isClusteredLightBufferUploaded(buffer); }
  public getClusteredLightBufferLightCount(buffer: NativeHandle): number { return this.#bridge.getClusteredLightBufferLightCount(buffer); }
  public getClusteredLightBufferClusterCount(buffer: NativeHandle): number { return this.#bridge.getClusteredLightBufferClusterCount(buffer); }
  public getClusteredLightBufferReferenceCount(buffer: NativeHandle): number { return this.#bridge.getClusteredLightBufferReferenceCount(buffer); }
  public getClusteredLightLookupGlsl(): string { return this.#bridge.getClusteredLightLookupGlsl(); }
  public adoptClusteredLightAssignment(assignment: NativeHandle, lightCount: number, offsets: readonly number[], indices: readonly number[]): void { this.#bridge.adoptClusteredLightAssignment(assignment, lightCount, offsets, indices); }
  public createClusteredLightCompute(graphicsDevice: NativeHandle, stride: number): NativeHandle { return this.#bridge.createClusteredLightCompute(graphicsDevice, stride); }
  public destroyClusteredLightCompute(compute: NativeHandle): void { this.#bridge.destroyClusteredLightCompute(compute); }
  public isClusteredLightComputeSupported(compute: NativeHandle): boolean { return this.#bridge.isClusteredLightComputeSupported(compute); }
  public getClusteredLightComputeUnsupportedReason(compute: NativeHandle): string { return this.#bridge.getClusteredLightComputeUnsupportedReason(compute); }
  public getClusteredLightComputeStride(compute: NativeHandle): number { return this.#bridge.getClusteredLightComputeStride(compute); }
  public assignClusteredLightCompute(compute: NativeHandle, grid: NativeHandle, view: readonly number[], bounds: readonly BoundingSphereSnapshot[], assignment: NativeHandle): void { this.#bridge.assignClusteredLightCompute(compute, grid, view, bounds, assignment); }
  public didClusteredLightComputeUseCompute(compute: NativeHandle): boolean { return this.#bridge.didClusteredLightComputeUseCompute(compute); }
  public hasClusteredLightComputeOverflowed(compute: NativeHandle): boolean { return this.#bridge.hasClusteredLightComputeOverflowed(compute); }
  public createClusteredForwardEffect(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createClusteredForwardEffect(graphicsDevice); }
  public destroyClusteredForwardEffect(effect: NativeHandle): void { this.#bridge.destroyClusteredForwardEffect(effect); }
  public isClusteredForwardEffectSupported(effect: NativeHandle): boolean { return this.#bridge.isClusteredForwardEffectSupported(effect); }
  public beginClusteredForwardEffect(effect: NativeHandle, world: readonly number[], view: readonly number[], projection: readonly number[], cameraPosition: Vector3Snapshot, lights: NativeHandle): void { this.#bridge.beginClusteredForwardEffect(effect, world, view, projection, cameraPosition, lights); }
  public getClusteredForwardShader(effect: NativeHandle): NativeHandle { return this.#bridge.getClusteredForwardShader(effect); }
  public getClusteredForwardBaseColor(effect: NativeHandle): Vector3Snapshot { return this.#bridge.getClusteredForwardBaseColor(effect); }
  public setClusteredForwardBaseColor(effect: NativeHandle, color: Vector3Snapshot): void { this.#bridge.setClusteredForwardBaseColor(effect, color); }
  public getClusteredForwardMetallic(effect: NativeHandle): number { return this.#bridge.getClusteredForwardMetallic(effect); }
  public setClusteredForwardMetallic(effect: NativeHandle, value: number): void { this.#bridge.setClusteredForwardMetallic(effect, value); }
  public getClusteredForwardRoughness(effect: NativeHandle): number { return this.#bridge.getClusteredForwardRoughness(effect); }
  public setClusteredForwardRoughness(effect: NativeHandle, value: number): void { this.#bridge.setClusteredForwardRoughness(effect, value); }
  public getClusteredForwardIor(effect: NativeHandle): number { return this.#bridge.getClusteredForwardIor(effect); }
  public setClusteredForwardIor(effect: NativeHandle, value: number): void { this.#bridge.setClusteredForwardIor(effect, value); }
  public getClusteredForwardAmbient(effect: NativeHandle): Vector3Snapshot { return this.#bridge.getClusteredForwardAmbient(effect); }
  public setClusteredForwardAmbient(effect: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setClusteredForwardAmbient(effect, value); }
  public getClusteredForwardOpaqueFrame(effect: NativeHandle): NativeHandle { return this.#bridge.getClusteredForwardOpaqueFrame(effect); }
  public setClusteredForwardOpaqueFrame(effect: NativeHandle, frame: NativeHandle): void { this.#bridge.setClusteredForwardOpaqueFrame(effect, frame); }
  public getClusteredForwardMaterialExtensions(effect: NativeHandle): NativeHandle { return this.#bridge.getClusteredForwardMaterialExtensions(effect); }
  public setClusteredForwardMaterialExtensions(effect: NativeHandle, extensions: NativeHandle): void { this.#bridge.setClusteredForwardMaterialExtensions(effect, extensions); }
  public hasClusteredForwardLightProbe(effect: NativeHandle): boolean { return this.#bridge.hasClusteredForwardLightProbe(effect); }
  public clearClusteredForwardLightProbe(effect: NativeHandle): void { this.#bridge.clearClusteredForwardLightProbe(effect); }
  public setClusteredForwardLightProbe(effect: NativeHandle, probe: NativeHandle): void { this.#bridge.setClusteredForwardLightProbe(effect, probe); }
  public setClusteredForwardLightProbeVolume(effect: NativeHandle, volume: NativeHandle): void { this.#bridge.setClusteredForwardLightProbeVolume(effect, volume); }
  public clusteredVolumeAttenuation(attenuationColor: Vector3Snapshot, attenuationDistance: number, thickness: number): Vector3Snapshot { return this.#bridge.clusteredVolumeAttenuation(attenuationColor, attenuationDistance, thickness); }
  public clusteredLightContribution(inputs: ClusteredContributionSnapshot): Vector3Snapshot { return this.#bridge.clusteredLightContribution(inputs); }
  public clusteredLightContributionWithExtensions(inputs: ClusteredContributionSnapshot, extensions: NativeHandle): Vector3Snapshot { return this.#bridge.clusteredLightContributionWithExtensions(inputs, extensions); }
  public addDebugDrawClusterSliceGizmo(debug: NativeHandle, grid: NativeHandle, inverseView: readonly number[], color: number): void { this.#bridge.addDebugDrawClusterSliceGizmo(debug, grid, inverseView, color); }

  // Area lights.
  public getDefaultAreaLight(): AreaLightSnapshot { return this.#bridge.getDefaultAreaLight(); }
  public isAreaLightValid(light: AreaLightSnapshot): boolean { return this.#bridge.isAreaLightValid(light); }
  public createAreaLightBrdfTable(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createAreaLightBrdfTable(graphicsDevice); }
  public createAreaLightBrdfTableWithSize(graphicsDevice: NativeHandle, size: number, sampleCount: number): NativeHandle { return this.#bridge.createAreaLightBrdfTableWithSize(graphicsDevice, size, sampleCount); }
  public destroyAreaLightBrdfTable(table: NativeHandle): void { this.#bridge.destroyAreaLightBrdfTable(table); }
  public getAreaLightBrdfTableTexture(table: NativeHandle): NativeHandle { return this.#bridge.getAreaLightBrdfTableTexture(table); }
  public getAreaLightBrdfTableSize(table: NativeHandle): number { return this.#bridge.getAreaLightBrdfTableSize(table); }
  public getAreaLightBrdfTableSampleCount(table: NativeHandle): number { return this.#bridge.getAreaLightBrdfTableSampleCount(table); }
  public getAreaLightBrdfTableGenerationMilliseconds(table: NativeHandle): number { return this.#bridge.getAreaLightBrdfTableGenerationMilliseconds(table); }
  public evaluateAreaLightBrdf(roughness: number, cosTheta: number, sampleCount: number): AreaLightBrdfTermsSnapshot { return this.#bridge.evaluateAreaLightBrdf(roughness, cosTheta, sampleCount); }
  public getAreaLightBrdfLookupGlsl(): string { return this.#bridge.getAreaLightBrdfLookupGlsl(); }
  public getAreaLightQuad(light: AreaLightSnapshot, surface: Vector3Snapshot): readonly Vector3Snapshot[] { return this.#bridge.getAreaLightQuad(light, surface); }
  public getAreaLightCoverage(quad: readonly Vector3Snapshot[], surface: Vector3Snapshot, lobeAxis: Vector3Snapshot, lobeScale: number, twoSided: boolean): number { return this.#bridge.getAreaLightCoverage(quad, surface, lobeAxis, lobeScale, twoSided); }
  public getAreaLightContribution(light: AreaLightSnapshot, surface: Vector3Snapshot, normal: Vector3Snapshot, cameraPosition: Vector3Snapshot, baseColor: Vector3Snapshot, metallic: number, roughness: number): Vector3Snapshot { return this.#bridge.getAreaLightContribution(light, surface, normal, cameraPosition, baseColor, metallic, roughness); }
  public getAreaLightLobeScale(roughness: number): number { return this.#bridge.getAreaLightLobeScale(roughness); }
  public getAreaLightShadingGlsl(): string { return this.#bridge.getAreaLightShadingGlsl(); }
  public setClusteredForwardAreaLight(effect: NativeHandle, light: AreaLightSnapshot, table: NativeHandle): void { this.#bridge.setClusteredForwardAreaLight(effect, light, table); }
  public hasClusteredForwardAreaLight(effect: NativeHandle): boolean { return this.#bridge.hasClusteredForwardAreaLight(effect); }
  public clearClusteredForwardAreaLight(effect: NativeHandle): void { this.#bridge.clearClusteredForwardAreaLight(effect); }

  // Contact shadows.
  public createContactShadowPass(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createContactShadowPass(graphicsDevice); }
  public getContactShadowLightDirection(pass: NativeHandle): Vector3Snapshot { return this.#bridge.getContactShadowLightDirection(pass); }
  public setContactShadowLightDirection(pass: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setContactShadowLightDirection(pass, value); }
  public getContactShadowMaxDistance(pass: NativeHandle): number { return this.#bridge.getContactShadowMaxDistance(pass); }
  public setContactShadowMaxDistance(pass: NativeHandle, value: number): void { this.#bridge.setContactShadowMaxDistance(pass, value); }
  public getContactShadowStepCount(pass: NativeHandle): number { return this.#bridge.getContactShadowStepCount(pass); }
  public setContactShadowStepCount(pass: NativeHandle, value: number): void { this.#bridge.setContactShadowStepCount(pass, value); }
  public getContactShadowThickness(pass: NativeHandle): number { return this.#bridge.getContactShadowThickness(pass); }
  public setContactShadowThickness(pass: NativeHandle, value: number): void { this.#bridge.setContactShadowThickness(pass, value); }
  public getContactShadowIntensity(pass: NativeHandle): number { return this.#bridge.getContactShadowIntensity(pass); }
  public setContactShadowIntensity(pass: NativeHandle, value: number): void { this.#bridge.setContactShadowIntensity(pass, value); }
  public getContactShadowBias(pass: NativeHandle): number { return this.#bridge.getContactShadowBias(pass); }
  public setContactShadowBias(pass: NativeHandle, value: number): void { this.#bridge.setContactShadowBias(pass, value); }
  public getContactShadowFallbackReason(pass: NativeHandle): string { return this.#bridge.getContactShadowFallbackReason(pass); }
  public isContactShadowOccluded(rayViewDepth: number, sceneViewDepth: number, bias: number, thickness: number): boolean { return this.#bridge.isContactShadowOccluded(rayViewDepth, sceneViewDepth, bias, thickness); }
  public getContactShadowOcclusionGlsl(): string { return this.#bridge.getContactShadowOcclusionGlsl(); }
  public combineContactShadowVisibility(shadowMapVisibility: number, contactVisibility: number): number { return this.#bridge.combineContactShadowVisibility(shadowMapVisibility, contactVisibility); }
  public createTransparentDrawList(): NativeHandle { return this.#bridge.createTransparentDrawList(); }
  public destroyTransparentDrawList(list: NativeHandle): void { this.#bridge.destroyTransparentDrawList(list); }
  public clearTransparentDrawList(list: NativeHandle): void { this.#bridge.clearTransparentDrawList(list); }
  public submitTransparentDraw(list: NativeHandle, bounds: ClusterBoundsSnapshot, draw: () => void): void { this.#bridge.submitTransparentDraw(list, bounds, draw); }
  public getTransparentDrawListCount(list: NativeHandle): number { return this.#bridge.getTransparentDrawListCount(list); }
  public drawTransparentDrawListSorted(list: NativeHandle, view: readonly number[]): void { this.#bridge.drawTransparentDrawListSorted(list, view); }
  public getTransparentDrawListSortedOrder(list: NativeHandle, view: readonly number[]): readonly number[] { return this.#bridge.getTransparentDrawListSortedOrder(list, view); }
  public getTransparentDrawSortKey(bounds: ClusterBoundsSnapshot, cameraPosition: Vector3Snapshot): number { return this.#bridge.getTransparentDrawSortKey(bounds, cameraPosition); }
  public getCameraPositionOfView(view: readonly number[]): Vector3Snapshot { return this.#bridge.getCameraPositionOfView(view); }
  public createWeightedBlendedTransparency(graphicsDevice: NativeHandle, width: number, height: number): NativeHandle { return this.#bridge.createWeightedBlendedTransparency(graphicsDevice, width, height); }
  public destroyWeightedBlendedTransparency(transparency: NativeHandle): void { this.#bridge.destroyWeightedBlendedTransparency(transparency); }
  public isWeightedBlendedTransparencySupported(transparency: NativeHandle): boolean { return this.#bridge.isWeightedBlendedTransparencySupported(transparency); }
  public getWeightedBlendedTransparencyUnsupportedReason(transparency: NativeHandle): string { return this.#bridge.getWeightedBlendedTransparencyUnsupportedReason(transparency); }
  public resizeWeightedBlendedTransparency(transparency: NativeHandle, width: number, height: number): void { this.#bridge.resizeWeightedBlendedTransparency(transparency, width, height); }
  public beginWeightedBlendedTransparency(transparency: NativeHandle, farPlane: number): void { this.#bridge.beginWeightedBlendedTransparency(transparency, farPlane); }
  public endWeightedBlendedTransparency(transparency: NativeHandle): void { this.#bridge.endWeightedBlendedTransparency(transparency); }
  public resolveWeightedBlendedTransparency(transparency: NativeHandle, width: number, height: number): void { this.#bridge.resolveWeightedBlendedTransparency(transparency, width, height); }
  public isWeightedBlendedTransparencyAccumulating(transparency: NativeHandle): boolean { return this.#bridge.isWeightedBlendedTransparencyAccumulating(transparency); }
  public getWeightedBlendedAccumulationTexture(transparency: NativeHandle): NativeHandle { return this.#bridge.getWeightedBlendedAccumulationTexture(transparency); }
  public getWeightedBlendedRevealageTexture(transparency: NativeHandle): NativeHandle { return this.#bridge.getWeightedBlendedRevealageTexture(transparency); }
  public getWeightedBlendedAccumulationGlsl(): string { return this.#bridge.getWeightedBlendedAccumulationGlsl(); }
  public getWeightedBlendedWeight(viewDepth: number, alpha: number, farPlane: number): number { return this.#bridge.getWeightedBlendedWeight(viewDepth, alpha, farPlane); }
  public createShaderEffect(graphicsDevice: NativeHandle, vertexSource: string, fragmentSource: string): NativeHandle { return this.#bridge.createShaderEffect(graphicsDevice, vertexSource, fragmentSource); }
  public isShaderEffectValid(effect: NativeHandle): boolean { return this.#bridge.isShaderEffectValid(effect); }
  public shaderEffectHasRenderer(effect: NativeHandle): boolean { return this.#bridge.shaderEffectHasRenderer(effect); }
  public getShaderEffectCompileError(effect: NativeHandle): string { return this.#bridge.getShaderEffectCompileError(effect); }
  public setShaderEffectUniformMatrix(effect: NativeHandle, name: string, value: readonly number[]): void { this.#bridge.setShaderEffectUniformMatrix(effect, name, value); }
  public setShaderEffectUniformVector4(effect: NativeHandle, name: string, value: Vector4Snapshot): void { this.#bridge.setShaderEffectUniformVector4(effect, name, value); }
  public setShaderEffectUniformVector3(effect: NativeHandle, name: string, value: Vector3Snapshot): void { this.#bridge.setShaderEffectUniformVector3(effect, name, value); }
  public setShaderEffectUniformVector2(effect: NativeHandle, name: string, value: Vector2Snapshot): void { this.#bridge.setShaderEffectUniformVector2(effect, name, value); }
  public setShaderEffectUniformFloat(effect: NativeHandle, name: string, value: number): void { this.#bridge.setShaderEffectUniformFloat(effect, name, value); }
  public setShaderEffectUniformInt32(effect: NativeHandle, name: string, value: number): void { this.#bridge.setShaderEffectUniformInt32(effect, name, value); }
  public declareShaderEffectUniformBlock(effect: NativeHandle, blockSizeBytes: number, names: readonly string[], offsets: readonly number[]): void { this.#bridge.declareShaderEffectUniformBlock(effect, blockSizeBytes, names, offsets); }
  public setShaderEffectUniformFloatArray(effect: NativeHandle, name: string, values: readonly number[]): void { this.#bridge.setShaderEffectUniformFloatArray(effect, name, values); }
  public setShaderEffectUniformVector2Array(effect: NativeHandle, name: string, values: readonly Vector2Snapshot[]): void { this.#bridge.setShaderEffectUniformVector2Array(effect, name, values); }
  public setShaderEffectUniformVec3Array(effect: NativeHandle, name: string, values: readonly number[]): void { this.#bridge.setShaderEffectUniformVec3Array(effect, name, values); }
  public setShaderEffectUniformMat4Array(effect: NativeHandle, name: string, values: readonly number[]): void { this.#bridge.setShaderEffectUniformMat4Array(effect, name, values); }
  public setShaderEffectTexture2D(effect: NativeHandle, unit: number, texture: NativeHandle): void { this.#bridge.setShaderEffectTexture2D(effect, unit, texture); }
  public setShaderEffectTextureCube(effect: NativeHandle, unit: number, texture: NativeHandle): void { this.#bridge.setShaderEffectTextureCube(effect, unit, texture); }
  public setShaderEffectTexture3D(effect: NativeHandle, unit: number, texture: NativeHandle): void { this.#bridge.setShaderEffectTexture3D(effect, unit, texture); }
  public getShaderEffectWorld(effect: NativeHandle): readonly number[] { return this.#bridge.getShaderEffectWorld(effect); }
  public setShaderEffectWorld(effect: NativeHandle, value: readonly number[]): void { this.#bridge.setShaderEffectWorld(effect, value); }
  public getShaderEffectView(effect: NativeHandle): readonly number[] { return this.#bridge.getShaderEffectView(effect); }
  public setShaderEffectView(effect: NativeHandle, value: readonly number[]): void { this.#bridge.setShaderEffectView(effect, value); }
  public getShaderEffectProjection(effect: NativeHandle): readonly number[] { return this.#bridge.getShaderEffectProjection(effect); }
  public setShaderEffectProjection(effect: NativeHandle, value: readonly number[]): void { this.#bridge.setShaderEffectProjection(effect, value); }
  public createRenderTargetPool(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createRenderTargetPool(graphicsDevice); }
  public acquirePooledRenderTarget(pool: NativeHandle, width: number, height: number, format: number, depthFormat: number, slot: number): NativeHandle { return this.#bridge.acquirePooledRenderTarget(pool, width, height, format, depthFormat, slot); }
  public resetRenderTargetPool(pool: NativeHandle): void { this.#bridge.resetRenderTargetPool(pool); }
  public getRenderTargetPoolTargetCount(pool: NativeHandle): number { return this.#bridge.getRenderTargetPoolTargetCount(pool); }
  public getRenderTargetPoolEstimatedBytes(pool: NativeHandle): number { return this.#bridge.getRenderTargetPoolEstimatedBytes(pool); }
  public destroyRenderTargetPool(pool: NativeHandle): void { this.#bridge.destroyRenderTargetPool(pool); }
  public createShaderEffectFactory(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createShaderEffectFactory(graphicsDevice); }
  public acquireFactoryShaderEffect(factory: NativeHandle, name: string, vertexSource: string, fragmentSource: string): NativeHandle { return this.#bridge.acquireFactoryShaderEffect(factory, name, vertexSource, fragmentSource); }
  public shaderEffectFactoryContains(factory: NativeHandle, name: string): boolean { return this.#bridge.shaderEffectFactoryContains(factory, name); }
  public getShaderEffectFactoryCompileCount(factory: NativeHandle): number { return this.#bridge.getShaderEffectFactoryCompileCount(factory); }
  public clearShaderEffectFactory(factory: NativeHandle): void { this.#bridge.clearShaderEffectFactory(factory); }
  public destroyShaderEffectFactory(factory: NativeHandle): void { this.#bridge.destroyShaderEffectFactory(factory); }
  public createDefaultPunctualLight(): PunctualLightSnapshot { return this.#bridge.createDefaultPunctualLight(); }
  public createDefaultShadowCascadeState(): ShadowCascadeStateSnapshot { return this.#bridge.createDefaultShadowCascadeState(); }
  public createDefaultImageBasedLight(): ImageBasedLightSnapshot { return this.#bridge.createDefaultImageBasedLight(); }
  public isImageBasedLightValid(light: ImageBasedLightSnapshot): boolean { return this.#bridge.isImageBasedLightValid(light); }
  public setEffectPunctualLight(effect: NativeHandle, light: PunctualLightSnapshot): void { this.#bridge.setEffectPunctualLight(effect, light); }
  public getEffectPunctualLight(effect: NativeHandle): PunctualLightSnapshot { return this.#bridge.getEffectPunctualLight(effect); }
  public setEffectShadowCascades(effect: NativeHandle, state: ShadowCascadeStateSnapshot): void { this.#bridge.setEffectShadowCascades(effect, state); }
  public getEffectShadowCascades(effect: NativeHandle): ShadowCascadeStateSnapshot { return this.#bridge.getEffectShadowCascades(effect); }
  public setEffectImageBasedLight(effect: NativeHandle, light: ImageBasedLightSnapshot): void { this.#bridge.setEffectImageBasedLight(effect, light); }
  public getEffectImageBasedLight(effect: NativeHandle): ImageBasedLightSnapshot { return this.#bridge.getEffectImageBasedLight(effect); }
  public setEffectLightViewProjection(effect: NativeHandle, value: readonly number[]): void { this.#bridge.setEffectLightViewProjection(effect, value); }
  public getEffectLightViewProjection(effect: NativeHandle): readonly number[] { return this.#bridge.getEffectLightViewProjection(effect); }
  public setEffectShadowsEnabled(effect: NativeHandle, value: boolean): void { this.#bridge.setEffectShadowsEnabled(effect, value); }
  public isEffectShadowsEnabled(effect: NativeHandle): boolean { return this.#bridge.isEffectShadowsEnabled(effect); }
  public setEffectShadowDepthBias(effect: NativeHandle, value: number): void { this.#bridge.setEffectShadowDepthBias(effect, value); }
  public getEffectShadowDepthBias(effect: NativeHandle): number { return this.#bridge.getEffectShadowDepthBias(effect); }
  public setEffectShadowFilterRadius(effect: NativeHandle, value: number): void { this.#bridge.setEffectShadowFilterRadius(effect, value); }
  public getEffectShadowFilterRadius(effect: NativeHandle): number { return this.#bridge.getEffectShadowFilterRadius(effect); }
  public setEffectShadowMap(effect: NativeHandle, shadowMap: NativeHandle): void { this.#bridge.setEffectShadowMap(effect, shadowMap); }
  public getEffectShadowMap(effect: NativeHandle): NativeHandle { return this.#bridge.getEffectShadowMap(effect); }
  public createDefaultIndirectDrawArguments(): IndirectDrawArgumentsSnapshot { return this.#bridge.createDefaultIndirectDrawArguments(); }
  public createDefaultIndirectDrawIndexedArguments(): IndirectDrawIndexedArgumentsSnapshot { return this.#bridge.createDefaultIndirectDrawIndexedArguments(); }
  public drawPrimitivesIndirect(graphicsDevice: NativeHandle, primitiveType: number, argumentBuffer: NativeHandle, argumentByteOffset: number): void { this.#bridge.drawPrimitivesIndirect(graphicsDevice, primitiveType, argumentBuffer, argumentByteOffset); }
  public drawIndexedPrimitivesIndirect(graphicsDevice: NativeHandle, primitiveType: number, argumentBuffer: NativeHandle, argumentByteOffset: number): void { this.#bridge.drawIndexedPrimitivesIndirect(graphicsDevice, primitiveType, argumentBuffer, argumentByteOffset); }
  public graphicsMemoryBarrierHas(mask: number, bit: number): boolean { return this.#bridge.graphicsMemoryBarrierHas(mask, bit); }
  public createDefaultGpuCullableInstance(): GpuCullableInstanceSnapshot { return this.#bridge.createDefaultGpuCullableInstance(); }
  public getPostProcessChainTargetPool(chain: NativeHandle): NativeHandle { return this.#bridge.getPostProcessChainTargetPool(chain); }
  public loadCubeLutFromFile(path: string): NativeHandle { return this.#bridge.loadCubeLutFromFile(path); }
  public getEngineLayerVersion(): number { return this.#bridge.getEngineLayerVersion(); }
  public getEngineLayerVersionString(): string { return this.#bridge.getEngineLayerVersionString(); }
  public setRenderPipelineShadowScene(pipeline: NativeHandle, shadowMap: NativeHandle, light: DirectionalLightSnapshot, sceneBounds: ClusterBoundsSnapshot, drawCasters: (() => void) | null): void { this.#bridge.setRenderPipelineShadowScene(pipeline, shadowMap, light, sceneBounds, drawCasters); }
  public setRenderPipelineTransparentScene(pipeline: NativeHandle, draw: (() => void) | null): void { this.#bridge.setRenderPipelineTransparentScene(pipeline, draw); }
  public applyPipelineSettingsFromString(settings: PipelineSettingsSnapshot, text: string): { readonly Applied: number; readonly Settings: PipelineSettingsSnapshot } { return this.#bridge.applyPipelineSettingsFromString(settings, text); }
  public getPipelinePassTiming(pipeline: NativeHandle, index: number): { readonly Milliseconds: number; readonly SampleCount: number } { return this.#bridge.getPipelinePassTiming(pipeline, index); }
  public applyPbrEffectMaterial(effect: NativeHandle, material: PbrMaterialExtSnapshot): void { this.#bridge.applyPbrEffectMaterial(effect, material); }
  public extractPbrEffectMaterial(effect: NativeHandle): PbrMaterialExtSnapshot { return this.#bridge.extractPbrEffectMaterial(effect); }
  public applySkinnedPbrEffectMaterial(effect: NativeHandle, material: PbrMaterialExtSnapshot): void { this.#bridge.applySkinnedPbrEffectMaterial(effect, material); }
  public extractSkinnedPbrEffectMaterial(effect: NativeHandle): PbrMaterialExtSnapshot { return this.#bridge.extractSkinnedPbrEffectMaterial(effect); }
  public createPbrMaterialExtensions(): NativeHandle { return this.#bridge.createPbrMaterialExtensions(); }
  public destroyPbrMaterialExtensions(extensions: NativeHandle): void { this.#bridge.destroyPbrMaterialExtensions(extensions); }
  public copyPbrMaterialExtensionsFrom(destination: NativeHandle, source: NativeHandle): void { this.#bridge.copyPbrMaterialExtensionsFrom(destination, source); }
  public pbrMaterialExtensionsEquals(first: NativeHandle, second: NativeHandle): boolean { return this.#bridge.pbrMaterialExtensionsEquals(first, second); }
  public getPbrMaterialExtensionsHashCode(extensions: NativeHandle): bigint { return this.#bridge.getPbrMaterialExtensionsHashCode(extensions); }
  public getPbrMaterialExtensionsText(extensions: NativeHandle): string { return this.#bridge.getPbrMaterialExtensionsText(extensions); }
  public getDefaultGltfMaterialSource(): GltfMaterialSourceSnapshot { return this.#bridge.getDefaultGltfMaterialSource(); }
  public getDefaultGltfMaterialTextures(): GltfMaterialTexturesSnapshot { return this.#bridge.getDefaultGltfMaterialTextures(); }
  public getDefaultGltfExtensionSource(): GltfExtensionSourceSnapshot { return this.#bridge.getDefaultGltfExtensionSource(); }
  public getDefaultGltfExtensionTextures(): GltfExtensionTexturesSnapshot { return this.#bridge.getDefaultGltfExtensionTextures(); }
  public buildGltfPbrMaterial(source: GltfMaterialSourceSnapshot, textures: GltfMaterialTexturesSnapshot,): PbrMaterialExtSnapshot { return this.#bridge.buildGltfPbrMaterial(source, textures); }
  public buildGltfPbrMaterialExtensions(source: GltfExtensionSourceSnapshot, textures: GltfExtensionTexturesSnapshot, extensions: NativeHandle,): void { this.#bridge.buildGltfPbrMaterialExtensions(source, textures, extensions); }
  public createPbrEffect(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createPbrEffect(graphicsDevice); }
  public createSkinnedPbrEffect(graphicsDevice: NativeHandle): NativeHandle { return this.#bridge.createSkinnedPbrEffect(graphicsDevice); }
  public getPbrEffectAlpha(effect: NativeHandle): number { return this.#bridge.getPbrEffectAlpha(effect); }
  public getPbrEffectAlphaCutoff(effect: NativeHandle): number { return this.#bridge.getPbrEffectAlphaCutoff(effect); }
  public getPbrEffectAlphaMode(effect: NativeHandle): number { return this.#bridge.getPbrEffectAlphaMode(effect); }
  public getPbrEffectDiffuseColor(effect: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrEffectDiffuseColor(effect); }
  public getPbrEffectDoubleSided(effect: NativeHandle): boolean { return this.#bridge.getPbrEffectDoubleSided(effect); }
  public getPbrEffectEmissiveFactor(effect: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrEffectEmissiveFactor(effect); }
  public getPbrEffectEncodeOutputToSrgb(effect: NativeHandle): boolean { return this.#bridge.getPbrEffectEncodeOutputToSrgb(effect); }
  public getPbrEffectIor(effect: NativeHandle): number { return this.#bridge.getPbrEffectIor(effect); }
  public getPbrEffectMetallicFactor(effect: NativeHandle): number { return this.#bridge.getPbrEffectMetallicFactor(effect); }
  public getPbrEffectNormalScale(effect: NativeHandle): number { return this.#bridge.getPbrEffectNormalScale(effect); }
  public getPbrEffectOcclusionStrength(effect: NativeHandle): number { return this.#bridge.getPbrEffectOcclusionStrength(effect); }
  public getPbrEffectRoughnessFactor(effect: NativeHandle): number { return this.#bridge.getPbrEffectRoughnessFactor(effect); }
  public getPbrEffectSpecularColorFactor(effect: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrEffectSpecularColorFactor(effect); }
  public getPbrEffectSpecularFactor(effect: NativeHandle): number { return this.#bridge.getPbrEffectSpecularFactor(effect); }
  public getPbrEffectTexture(effect: NativeHandle, slot: number): NativeHandle { return this.#bridge.getPbrEffectTexture(effect, slot); }
  public getPbrEffectTextureCoordinateSet(effect: NativeHandle, slot: number): number { return this.#bridge.getPbrEffectTextureCoordinateSet(effect, slot); }
  public getPbrEffectTextureIsSrgb(effect: NativeHandle, slot: number): boolean { return this.#bridge.getPbrEffectTextureIsSrgb(effect, slot); }
  public getPbrEffectTextureTransform(effect: NativeHandle, slot: number): TextureTransformSnapshot { return this.#bridge.getPbrEffectTextureTransform(effect, slot); }
  public getPbrEffectVertexColorEnabled(effect: NativeHandle): boolean { return this.#bridge.getPbrEffectVertexColorEnabled(effect); }
  public getSkinnedPbrEffectBoneTransforms(effect: NativeHandle, count: number): readonly (readonly number[])[] { return this.#bridge.getSkinnedPbrEffectBoneTransforms(effect, count); }
  public getSkinnedPbrEffectWeightsPerVertex(effect: NativeHandle): number { return this.#bridge.getSkinnedPbrEffectWeightsPerVertex(effect); }
  public setPbrEffectAlpha(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectAlpha(effect, value); }
  public setPbrEffectAlphaCutoff(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectAlphaCutoff(effect, value); }
  public setPbrEffectAlphaMode(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectAlphaMode(effect, value); }
  public setPbrEffectDiffuseColor(effect: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrEffectDiffuseColor(effect, value); }
  public setPbrEffectDoubleSided(effect: NativeHandle, value: boolean): void { this.#bridge.setPbrEffectDoubleSided(effect, value); }
  public setPbrEffectEmissiveFactor(effect: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrEffectEmissiveFactor(effect, value); }
  public setPbrEffectEncodeOutputToSrgb(effect: NativeHandle, value: boolean): void { this.#bridge.setPbrEffectEncodeOutputToSrgb(effect, value); }
  public setPbrEffectIor(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectIor(effect, value); }
  public setPbrEffectMetallicFactor(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectMetallicFactor(effect, value); }
  public setPbrEffectNormalScale(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectNormalScale(effect, value); }
  public setPbrEffectOcclusionStrength(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectOcclusionStrength(effect, value); }
  public setPbrEffectRoughnessFactor(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectRoughnessFactor(effect, value); }
  public setPbrEffectSpecularColorFactor(effect: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrEffectSpecularColorFactor(effect, value); }
  public setPbrEffectSpecularFactor(effect: NativeHandle, value: number): void { this.#bridge.setPbrEffectSpecularFactor(effect, value); }
  public setPbrEffectTexture(effect: NativeHandle, slot: number, texture: NativeHandle): void { this.#bridge.setPbrEffectTexture(effect, slot, texture); }
  public setPbrEffectTextureCoordinateSet(effect: NativeHandle, slot: number, value: number): void { this.#bridge.setPbrEffectTextureCoordinateSet(effect, slot, value); }
  public setPbrEffectTextureIsSrgb(effect: NativeHandle, slot: number, value: boolean): void { this.#bridge.setPbrEffectTextureIsSrgb(effect, slot, value); }
  public setPbrEffectTextureTransform(effect: NativeHandle, slot: number, transform: TextureTransformSnapshot): void { this.#bridge.setPbrEffectTextureTransform(effect, slot, transform); }
  public setPbrEffectVertexColorEnabled(effect: NativeHandle, value: boolean): void { this.#bridge.setPbrEffectVertexColorEnabled(effect, value); }
  public setSkinnedPbrEffectBoneTransforms(effect: NativeHandle, transforms: readonly (readonly number[])[]): void { this.#bridge.setSkinnedPbrEffectBoneTransforms(effect, transforms); }
  public setSkinnedPbrEffectWeightsPerVertex(effect: NativeHandle, value: number): void { this.#bridge.setSkinnedPbrEffectWeightsPerVertex(effect, value); }
  public getPbrExtensionAttenuationColor(extensions: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrExtensionAttenuationColor(extensions); }
  public getPbrExtensionAttenuationDistance(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionAttenuationDistance(extensions); }
  public getPbrExtensionClearcoatFactor(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionClearcoatFactor(extensions); }
  public getPbrExtensionClearcoatNormalScale(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionClearcoatNormalScale(extensions); }
  public getPbrExtensionClearcoatNormalTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionClearcoatNormalTexture(extensions); }
  public getPbrExtensionClearcoatRoughness(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionClearcoatRoughness(extensions); }
  public getPbrExtensionClearcoatRoughnessTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionClearcoatRoughnessTexture(extensions); }
  public getPbrExtensionClearcoatTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionClearcoatTexture(extensions); }
  public getPbrExtensionIridescenceFactor(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionIridescenceFactor(extensions); }
  public getPbrExtensionIridescenceIor(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionIridescenceIor(extensions); }
  public getPbrExtensionIridescenceTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionIridescenceTexture(extensions); }
  public getPbrExtensionIridescenceThicknessMaximum(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionIridescenceThicknessMaximum(extensions); }
  public getPbrExtensionIridescenceThicknessMinimum(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionIridescenceThicknessMinimum(extensions); }
  public getPbrExtensionIridescenceThicknessTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionIridescenceThicknessTexture(extensions); }
  public getPbrExtensionSheenColorFactor(extensions: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrExtensionSheenColorFactor(extensions); }
  public getPbrExtensionSheenColorTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionSheenColorTexture(extensions); }
  public getPbrExtensionSheenRoughness(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionSheenRoughness(extensions); }
  public getPbrExtensionSheenRoughnessTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionSheenRoughnessTexture(extensions); }
  public getPbrExtensionSubsurfaceColor(extensions: NativeHandle): Vector3Snapshot { return this.#bridge.getPbrExtensionSubsurfaceColor(extensions); }
  public getPbrExtensionSubsurfaceWrap(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionSubsurfaceWrap(extensions); }
  public getPbrExtensionThicknessFactor(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionThicknessFactor(extensions); }
  public getPbrExtensionThicknessTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionThicknessTexture(extensions); }
  public getPbrExtensionTransmissionFactor(extensions: NativeHandle): number { return this.#bridge.getPbrExtensionTransmissionFactor(extensions); }
  public getPbrExtensionTransmissionTexture(extensions: NativeHandle): NativeHandle { return this.#bridge.getPbrExtensionTransmissionTexture(extensions); }
  public pbrExtensionIsIridescenceEnabled(extensions: NativeHandle): boolean { return this.#bridge.pbrExtensionIsIridescenceEnabled(extensions); }
  public pbrExtensionIsNeutral(extensions: NativeHandle): boolean { return this.#bridge.pbrExtensionIsNeutral(extensions); }
  public pbrExtensionIsSheenEnabled(extensions: NativeHandle): boolean { return this.#bridge.pbrExtensionIsSheenEnabled(extensions); }
  public pbrExtensionIsSubsurfaceEnabled(extensions: NativeHandle): boolean { return this.#bridge.pbrExtensionIsSubsurfaceEnabled(extensions); }
  public pbrExtensionIsTransmissionEnabled(extensions: NativeHandle): boolean { return this.#bridge.pbrExtensionIsTransmissionEnabled(extensions); }
  public setPbrExtensionAttenuationColor(extensions: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrExtensionAttenuationColor(extensions, value); }
  public setPbrExtensionAttenuationDistance(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionAttenuationDistance(extensions, value); }
  public setPbrExtensionClearcoatFactor(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionClearcoatFactor(extensions, value); }
  public setPbrExtensionClearcoatNormalScale(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionClearcoatNormalScale(extensions, value); }
  public setPbrExtensionClearcoatNormalTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionClearcoatNormalTexture(extensions, texture); }
  public setPbrExtensionClearcoatRoughness(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionClearcoatRoughness(extensions, value); }
  public setPbrExtensionClearcoatRoughnessTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionClearcoatRoughnessTexture(extensions, texture); }
  public setPbrExtensionClearcoatTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionClearcoatTexture(extensions, texture); }
  public setPbrExtensionIridescenceFactor(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionIridescenceFactor(extensions, value); }
  public setPbrExtensionIridescenceIor(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionIridescenceIor(extensions, value); }
  public setPbrExtensionIridescenceTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionIridescenceTexture(extensions, texture); }
  public setPbrExtensionIridescenceThicknessMaximum(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionIridescenceThicknessMaximum(extensions, value); }
  public setPbrExtensionIridescenceThicknessMinimum(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionIridescenceThicknessMinimum(extensions, value); }
  public setPbrExtensionIridescenceThicknessTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionIridescenceThicknessTexture(extensions, texture); }
  public setPbrExtensionSheenColorFactor(extensions: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrExtensionSheenColorFactor(extensions, value); }
  public setPbrExtensionSheenColorTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionSheenColorTexture(extensions, texture); }
  public setPbrExtensionSheenRoughness(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionSheenRoughness(extensions, value); }
  public setPbrExtensionSheenRoughnessTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionSheenRoughnessTexture(extensions, texture); }
  public setPbrExtensionSubsurfaceColor(extensions: NativeHandle, value: Vector3Snapshot): void { this.#bridge.setPbrExtensionSubsurfaceColor(extensions, value); }
  public setPbrExtensionSubsurfaceWrap(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionSubsurfaceWrap(extensions, value); }
  public setPbrExtensionThicknessFactor(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionThicknessFactor(extensions, value); }
  public setPbrExtensionThicknessTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionThicknessTexture(extensions, texture); }
  public setPbrExtensionTransmissionFactor(extensions: NativeHandle, value: number): void { this.#bridge.setPbrExtensionTransmissionFactor(extensions, value); }
  public setPbrExtensionTransmissionTexture(extensions: NativeHandle, texture: NativeHandle): void { this.#bridge.setPbrExtensionTransmissionTexture(extensions, texture); }

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
  public guideBeginShowMessageBox(player: number, title: string, text: string, buttons: readonly string[], focusButton: number, icon: number, onCompleted: () => void): unknown {
    return this.#bridge.guideBeginShowMessageBox(player, title, text, buttons, focusButton, icon, onCompleted);
  }
  public guideEndShowMessageBox(token: unknown): number | null {
    return this.#bridge.guideEndShowMessageBox(token);
  }
  public guideHasPendingMessageBox(): boolean {
    return this.#bridge.guideHasPendingMessageBox();
  }
  public guidePendingMessageBoxFocusButton(): number {
    return this.#bridge.guidePendingMessageBoxFocusButton();
  }
  public guideSimulateMessageBoxClick(buttonIndex: number): void {
    this.#bridge.guideSimulateMessageBoxClick(buttonIndex);
  }
  public guideBeginShowKeyboardInput(player: number, title: string, description: string, defaultText: string, usePasswordMode: boolean, onCompleted: () => void): unknown {
    return this.#bridge.guideBeginShowKeyboardInput(player, title, description, defaultText, usePasswordMode, onCompleted);
  }
  public guideEndShowKeyboardInput(token: unknown): string | null {
    return this.#bridge.guideEndShowKeyboardInput(token);
  }
  public guideHasPendingKeyboardInput(): boolean {
    return this.#bridge.guideHasPendingKeyboardInput();
  }
  public guideWasKeyboardInputCanceled(): boolean {
    return this.#bridge.guideWasKeyboardInputCanceled();
  }
  public guidePendingKeyboardInputTitle(): string {
    return this.#bridge.guidePendingKeyboardInputTitle();
  }
  public guidePendingKeyboardInputDescription(): string {
    return this.#bridge.guidePendingKeyboardInputDescription();
  }
  public guidePendingKeyboardInputDisplayText(): string {
    return this.#bridge.guidePendingKeyboardInputDisplayText();
  }
  public guideSimulateKeyboardInputCancel(): void {
    this.#bridge.guideSimulateKeyboardInputCancel();
  }
  public guideResetPendingKeyboardInput(): void {
    this.#bridge.guideResetPendingKeyboardInput();
  }
  public getGuideNotificationPosition(): number { return this.#bridge.getGuideNotificationPosition(); }
  public setGuideNotificationPosition(position: number): void {
    this.#bridge.setGuideNotificationPosition(position);
  }

  // Sensors. Support is a game-scoped question and the sensor itself is a game child, so both
  // reach CNA through the running game handle.


  // ---- text input and the mouse cursor ---------------------------------------------------------
  // Text input is the one input family that is pushed rather than polled, because composition is:
  // an IME sends editing updates and candidate lists between the keystroke and the committed
  // character, and none of that fits a per-frame snapshot. The three subscriptions carry the JS
  // handler straight through; the bridge retains it and dispatches synchronously.
  public subscribeTextInput(handler: (character: string) => void): NativeHandle {
    return this.#bridge.textInputSubscribeInput(handler);
  }
  public subscribeTextEditing(handler: (editing: TextEditingSnapshot) => void): NativeHandle {
    return this.#bridge.textInputSubscribeEditing(handler);
  }
  public subscribeTextEditingCandidates(
    handler: (value: TextEditingCandidatesSnapshot) => void,
  ): NativeHandle {
    return this.#bridge.textInputSubscribeCandidates(handler);
  }
  public unsubscribeTextInput(registration: NativeHandle): void {
    this.#bridge.textInputUnsubscribe(registration);
  }
  public raiseTextInput(codeUnit: number): void {
    this.#bridge.textInputRaiseInput(this.#game(), codeUnit);
  }
  public raiseTextEditing(text: string, start: number, length: number): void {
    this.#bridge.textInputRaiseEditing(this.#game(), text, start, length);
  }
  public raiseTextEditingCandidates(
    candidates: readonly string[], selected: number, horizontal: boolean,
  ): void {
    this.#bridge.textInputRaiseCandidates(this.#game(), candidates, selected, horizontal);
  }
  public startTextInput(): void { this.#bridge.textInputStart(this.#game()); }
  public startTextInputWithType(type: number): void {
    this.#bridge.textInputStartWithType(this.#game(), type);
  }
  public stopTextInput(): void { this.#bridge.textInputStop(this.#game()); }
  public isTextInputActive(): boolean { return this.#bridge.textInputIsActive(this.#game()); }
  public isScreenKeyboardShown(): boolean {
    return this.#bridge.textInputIsScreenKeyboardShown(this.#game());
  }
  public setTextInputRectangle(x: number, y: number, width: number, height: number): void {
    this.#bridge.textInputSetRectangle(this.#game(), x, y, width, height);
  }
  public resetTextInputForTests(): void { this.#bridge.textInputResetForTests(this.#game()); }
  public getStockCursor(stock: number): NativeHandle {
    return this.#bridge.mouseCursorGetStock(this.#game(), stock);
  }
  public createCursorFromTexture2D(
    texture: NativeHandle, originX: number, originY: number,
  ): NativeHandle {
    return this.#bridge.mouseCursorCreateFromTexture(this.#game(), texture, originX, originY);
  }
  public disposeCursor(cursor: NativeHandle): void { this.#bridge.mouseCursorDispose(cursor); }
  public destroyCursor(cursor: NativeHandle): void { this.#bridge.mouseCursorDestroy(cursor); }
  public setMouseCursor(cursor: NativeHandle): void {
    this.#bridge.mouseSetCursor(this.#game(), cursor);
  }
  // ---- CNA's extended input layer: raw joysticks and force feedback ----------------------------
  // Both need an active game, because both are properties of a platform a game opened. A captured
  // joystick state is a snapshot the bridge reads whole and releases, so nothing here owns a
  // lifetime except an opened haptic device, which does.
  public readonly ExtendedInput: CnaExtendedInputBackend = this;

  public getJoystickCount(): number { return this.#bridge.joysticksGetCount(this.#game()); }
  public getJoystickInfoAt(index: number): JoystickInfoSnapshot {
    return this.#bridge.joysticksGetInfoAt(this.#game(), index);
  }
  public getJoystickNameAt(index: number): string {
    return this.#bridge.joysticksGetNameAt(this.#game(), index);
  }
  public getJoystickCapabilities(id: number): JoystickCapabilitiesSnapshot {
    return this.#bridge.joysticksGetCapabilities(this.#game(), id);
  }
  public getJoystickCapabilitiesName(id: number): string {
    return this.#bridge.joysticksGetCapabilitiesName(this.#game(), id);
  }
  public getJoystickCapabilitiesGuid(id: number): string {
    return this.#bridge.joysticksGetCapabilitiesGuid(this.#game(), id);
  }
  public captureJoystickState(id: number): JoystickStateSnapshot {
    return this.#bridge.joysticksCaptureState(this.#game(), id);
  }
  public getHapticCount(): number { return this.#bridge.hapticsGetCount(this.#game()); }
  public getHapticIdAt(index: number): number {
    return this.#bridge.hapticsGetIdAt(this.#game(), index);
  }
  public getHapticNameAt(index: number): string {
    return this.#bridge.hapticsGetNameAt(this.#game(), index);
  }
  public isJoystickHaptic(joystickId: number): boolean {
    return this.#bridge.hapticsIsJoystickHaptic(this.#game(), joystickId);
  }
  public openHaptic(id: number): NativeHandle {
    return this.#bridge.hapticsOpen(this.#game(), id);
  }
  public openHapticFromJoystick(joystickId: number): NativeHandle {
    return this.#bridge.hapticsOpenFromJoystick(this.#game(), joystickId);
  }
  public getHapticCapabilities(device: NativeHandle): HapticCapabilitiesSnapshot {
    return this.#bridge.hapticDeviceGetCapabilities(device);
  }
  public getHapticName(device: NativeHandle): string {
    return this.#bridge.hapticDeviceGetName(device);
  }
  public getHapticIsOpen(device: NativeHandle): boolean {
    return this.#bridge.hapticDeviceGetIsOpen(device);
  }
  public initHapticRumble(device: NativeHandle): boolean {
    return this.#bridge.hapticDeviceInitRumble(device);
  }
  public playHapticRumble(
    device: NativeHandle, strength: number, lengthMilliseconds: number,
  ): boolean {
    return this.#bridge.hapticDevicePlayRumble(device, strength, lengthMilliseconds);
  }
  public stopHapticRumble(device: NativeHandle): boolean {
    return this.#bridge.hapticDeviceStopRumble(device);
  }
  public setHapticGain(device: NativeHandle, gain: number): boolean {
    return this.#bridge.hapticDeviceSetGain(device, gain);
  }
  public disposeHapticDevice(device: NativeHandle): void {
    this.#bridge.hapticDeviceDispose(device);
  }
  public destroyHapticDevice(device: NativeHandle): void {
    this.#bridge.hapticDeviceDestroy(device);
  }
  public getSensorSupport(): SensorSupportSnapshot { return this.#bridge.getSensorSupport(this.#game()); }
  public createAccelerometer(): NativeHandle { return this.#bridge.createAccelerometer(this.#game()); }
  public destroyAccelerometer(sensor: NativeHandle): void { this.#bridge.destroyAccelerometer(sensor); }
  public startAccelerometer(sensor: NativeHandle): void { this.#bridge.startAccelerometer(sensor); }
  public stopAccelerometer(sensor: NativeHandle): void { this.#bridge.stopAccelerometer(sensor); }
  public getAccelerometerState(sensor: NativeHandle): SensorStateSnapshot {
    return this.#bridge.getAccelerometerState(sensor);
  }
  public setAccelerometerInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#bridge.setAccelerometerInterval(sensor, ticks);
  }


  // ---- graphics adapters -----------------------------------------------------------------------
  // Every route takes a device handle, because an adapter list is a property of a device a game
  // created rather than of the process. A renderer with no displays reports none, and nothing here
  // manufactures one.
  public readonly GraphicsAdapters: CnaGraphicsAdapterBackend = this;

  public getGraphicsAdapterCount(device: NativeHandle): number {
    return this.#bridge.graphicsAdapterCount(device);
  }
  public refreshGraphicsAdapters(device: NativeHandle): void {
    this.#bridge.graphicsAdaptersRefresh(device);
  }
  public getGraphicsAdapterInfo(
    device: NativeHandle, index: number,
  ): GraphicsAdapterInfoSnapshot {
    return this.#bridge.graphicsAdapterInfo(device, index);
  }
  public getGraphicsAdapterDescription(device: NativeHandle, index: number): string {
    return this.#bridge.graphicsAdapterDescription(device, index);
  }
  public getGraphicsAdapterDeviceName(device: NativeHandle, index: number): string {
    return this.#bridge.graphicsAdapterDeviceName(device, index);
  }
  public getGraphicsAdapterCurrentDisplayMode(
    device: NativeHandle, index: number,
  ): DisplayModeSnapshot {
    return this.#bridge.graphicsAdapterCurrentDisplayMode(device, index);
  }
  public getGraphicsAdapterDisplayModes(
    device: NativeHandle, index: number,
  ): readonly DisplayModeSnapshot[] {
    return this.#bridge.graphicsAdapterDisplayModes(device, index);
  }
  public isGraphicsAdapterProfileSupported(
    device: NativeHandle, index: number, profile: number,
  ): boolean {
    return this.#bridge.graphicsAdapterIsProfileSupported(device, index, profile);
  }
  public queryGraphicsAdapterBackBufferFormat(
    device: NativeHandle, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot {
    return this.#bridge.graphicsAdapterQueryBackBufferFormat(
      device, index, profile, format, depthFormat, multiSampleCount,
    );
  }
  public queryGraphicsAdapterRenderTargetFormat(
    device: NativeHandle, index: number, profile: number, format: number, depthFormat: number,
    multiSampleCount: number,
  ): GraphicsFormatSelectionSnapshot {
    return this.#bridge.graphicsAdapterQueryRenderTargetFormat(
      device, index, profile, format, depthFormat, multiSampleCount,
    );
  }
  public setGraphicsAdapterDevicePreferences(
    device: NativeHandle, index: number, useNullDevice: boolean, useReferenceDevice: boolean,
  ): void {
    this.#bridge.graphicsAdapterSetDevicePreferences(
      device, index, useNullDevice, useReferenceDevice,
    );
  }
  // ---- the compass, the gyroscope and the motion sensor ----------------------------------------
  // Each takes the game handle to create and its own handle thereafter, exactly as the
  // accelerometer does. The injection routes are CNA's own `_ext` test hooks and are passed
  // through unchanged; what they are for is stated in the public extension rather than here.
  public createCompass(): NativeHandle { return this.#bridge.compassCreate(this.#game()); }
  public destroyCompass(sensor: NativeHandle): void { this.#bridge.compassDestroy(sensor); }
  public startCompass(sensor: NativeHandle): void { this.#bridge.compassStart(sensor); }
  public stopCompass(sensor: NativeHandle): void { this.#bridge.compassStop(sensor); }
  public disposeCompass(sensor: NativeHandle): void { this.#bridge.compassDispose(sensor); }
  public getCompassState(sensor: NativeHandle): number {
    return this.#bridge.compassGetState(sensor);
  }
  public getCompassIsDataValid(sensor: NativeHandle): boolean {
    return this.#bridge.compassIsDataValid(sensor);
  }
  public getCompassReading(sensor: NativeHandle): CompassReadingSnapshot {
    return this.#bridge.compassGetReading(sensor);
  }
  public getCompassInterval(sensor: NativeHandle): bigint {
    return this.#bridge.compassGetInterval(sensor);
  }
  public setCompassInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#bridge.compassSetInterval(sensor, ticks);
  }
  public injectCompassReading(sensor: NativeHandle, reading: CompassReadingSnapshot): void {
    this.#bridge.compassInject(sensor, reading);
  }
  public setCompassTestBackend(
    sensor: NativeHandle, installed: boolean, supported: boolean,
  ): void {
    this.#bridge.compassSetTestBackend(sensor, installed, supported);
  }
  public createGyroscope(): NativeHandle { return this.#bridge.gyroscopeCreate(this.#game()); }
  public destroyGyroscope(sensor: NativeHandle): void { this.#bridge.gyroscopeDestroy(sensor); }
  public startGyroscope(sensor: NativeHandle): void { this.#bridge.gyroscopeStart(sensor); }
  public stopGyroscope(sensor: NativeHandle): void { this.#bridge.gyroscopeStop(sensor); }
  public disposeGyroscope(sensor: NativeHandle): void { this.#bridge.gyroscopeDispose(sensor); }
  public getGyroscopeState(sensor: NativeHandle): number {
    return this.#bridge.gyroscopeGetState(sensor);
  }
  public getGyroscopeIsDataValid(sensor: NativeHandle): boolean {
    return this.#bridge.gyroscopeIsDataValid(sensor);
  }
  public getGyroscopeReading(sensor: NativeHandle): GyroscopeReadingSnapshot {
    return this.#bridge.gyroscopeGetReading(sensor);
  }
  public getGyroscopeInterval(sensor: NativeHandle): bigint {
    return this.#bridge.gyroscopeGetInterval(sensor);
  }
  public setGyroscopeInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#bridge.gyroscopeSetInterval(sensor, ticks);
  }
  public injectGyroscopeReading(
    sensor: NativeHandle, x: number, y: number, z: number,
  ): void {
    this.#bridge.gyroscopeInject(sensor, x, y, z);
  }
  public setGyroscopeSupported(sensor: NativeHandle, supported: boolean): void {
    this.#bridge.gyroscopeSetSupported(sensor, supported);
  }
  public createMotion(): NativeHandle { return this.#bridge.motionCreate(this.#game()); }
  public destroyMotion(sensor: NativeHandle): void { this.#bridge.motionDestroy(sensor); }
  public startMotion(sensor: NativeHandle): void { this.#bridge.motionStart(sensor); }
  public stopMotion(sensor: NativeHandle): void { this.#bridge.motionStop(sensor); }
  public disposeMotion(sensor: NativeHandle): void { this.#bridge.motionDispose(sensor); }
  public getMotionState(sensor: NativeHandle): number { return this.#bridge.motionGetState(sensor); }
  public getMotionIsDataValid(sensor: NativeHandle): boolean {
    return this.#bridge.motionIsDataValid(sensor);
  }
  public getMotionIsNorthReferenced(sensor: NativeHandle): boolean {
    return this.#bridge.motionIsNorthReferenced(sensor);
  }
  public getMotionReading(sensor: NativeHandle): MotionReadingSnapshot {
    return this.#bridge.motionGetReading(sensor);
  }
  public getMotionInterval(sensor: NativeHandle): bigint {
    return this.#bridge.motionGetInterval(sensor);
  }
  public setMotionInterval(sensor: NativeHandle, ticks: bigint): void {
    this.#bridge.motionSetInterval(sensor, ticks);
  }
  public injectMotionReading(sensor: NativeHandle, reading: MotionReadingSnapshot): void {
    this.#bridge.motionInject(sensor, reading);
  }
  public setMotionTestBackend(
    sensor: NativeHandle, installed: boolean, supported: boolean, northReferenced: boolean,
  ): void {
    this.#bridge.motionSetTestBackend(sensor, installed, supported, northReferenced);
  }
  public getAccelerometerReading(sensor: NativeHandle): AccelerometerReadingSnapshot {
    return this.#bridge.getAccelerometerReading(sensor);
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
  public createCamera(): NativeHandle { return this.#bridge.createCamera(this.#game()); }
  public createTestCamera(): NativeHandle { return this.#bridge.createTestCamera(this.#game()); }
  public getCameraState(camera: NativeHandle): number {
    return this.#bridge.getCameraState(camera);
  }
  public getCameraFrameWidth(camera: NativeHandle): number {
    return this.#bridge.getCameraFrameWidth(camera);
  }
  public getCameraFrameHeight(camera: NativeHandle): number {
    return this.#bridge.getCameraFrameHeight(camera);
  }
  public tryAcquireCameraFrame(camera: NativeHandle, texture: NativeHandle): boolean {
    return this.#bridge.tryAcquireCameraFrame(camera, texture);
  }
  public setTestCameraState(camera: NativeHandle, state: number): void {
    this.#bridge.setTestCameraState(camera, state);
  }
  public setTestCameraFrame(
    camera: NativeHandle, width: number, height: number, pixels: Uint8Array | null,
  ): void {
    this.#bridge.setTestCameraFrame(camera, width, height, pixels);
  }
  public destroyCamera(camera: NativeHandle): void { this.#bridge.destroyCamera(camera); }

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
