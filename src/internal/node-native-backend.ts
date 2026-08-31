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
  StandaloneDeviceParameters,
  CnaGraphicsExtensionBackend,
  Vector3Snapshot,
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
  PassTimingSnapshot,
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
    CnaDeviceBackend, CnaGamerServicesBackend, CnaSensorBackend {
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
