// SPDX-License-Identifier: MS-PL
// Minimal Node-API adapter for the CNA C ABI runtime slice used by cna-ts.
// The accepted ABI window is derived from the CNA headers this adapter is compiled
// against; see abi_version_is_supported below for the exact policy.

#include <node_api.h>

#include <CNA/C/cna.h>

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
typedef HMODULE LibraryHandle;
#define OPEN_LIBRARY(path) LoadLibraryA(path)
#define LOAD_ADDRESS(library, name) ((void*) GetProcAddress((library), (name)))
#else
#include <dlfcn.h>
typedef void* LibraryHandle;
#define OPEN_LIBRARY(path) dlopen((path), RTLD_NOW | RTLD_LOCAL)
#define LOAD_ADDRESS(library, name) dlsym((library), (name))
#endif

typedef uint32_t (*GetAbiVersionFn)(void);
typedef CNA_Result (*PbrMaterialInitFn)(CNA_PbrMaterial*);
typedef CNA_Result (*RenderPipelineSettingsInitFn)(CNA_RenderPipelineSettings*);
typedef CNA_Result (*RenderPipelineCreateFn)(CNA_Handle, CNA_RenderPipelineHandle*);
typedef CNA_Result (*RenderPipelineHandleFn)(CNA_RenderPipelineHandle);
typedef CNA_Result (*RenderPipelineResizeFn)(CNA_RenderPipelineHandle, int32_t, int32_t);
typedef CNA_Result (*RenderPipelineBeginFn)(CNA_RenderPipelineHandle, const CNA_Color*);
typedef CNA_Result (*RenderPipelinePassCountFn)(CNA_RenderPipelineHandle, int32_t*);
typedef CNA_Result (*RenderPipelineMemoryFn)(CNA_RenderPipelineHandle, uint64_t*);
typedef CNA_Result (*RenderPipelineStatisticsFn)(
  CNA_RenderPipelineHandle, CNA_RenderPipelineFrameStatisticsEXT*);
typedef CNA_Result (*RenderTargetSubscribeFn)(
  CNA_Handle, CNA_RenderTargetContentLostCallback, void*, CNA_RenderTargetEventRegistrationHandle*);
typedef CNA_Result (*RenderTargetUnsubscribeFn)(CNA_RenderTargetEventRegistrationHandle);
typedef CNA_Result (*VertexBufferSubscribeFn)(
  CNA_VertexBufferHandle, CNA_VertexBufferContentLostCallback, void*,
  CNA_VertexBufferEventRegistrationHandle*);
typedef CNA_Result (*VertexBufferUnsubscribeFn)(CNA_VertexBufferEventRegistrationHandle);
typedef CNA_Result (*IndexBufferSubscribeFn)(
  CNA_IndexBufferHandle, CNA_IndexBufferContentLostCallback, void*,
  CNA_IndexBufferEventRegistrationHandle*);
typedef CNA_Result (*IndexBufferUnsubscribeFn)(CNA_IndexBufferEventRegistrationHandle);
typedef CNA_Result (*U32OutFn)(uint32_t*);
typedef CNA_Result (*BoolOutFn)(CNA_Bool*);
typedef CNA_Result (*SizeOutFn)(uint64_t*);
typedef CNA_Result (*CopyTextFn)(char*, uint64_t, uint64_t*);
typedef CNA_Result (*U32InFn)(uint32_t);
typedef CNA_Result (*BoolInFn)(CNA_Bool);
typedef CNA_Result (*StringViewInFn)(CNA_StringView);
typedef CNA_Result (*U32ToU32Fn)(uint32_t, uint32_t*);
typedef CNA_Result (*U32ToBoolFn)(uint32_t, CNA_Bool*);
typedef CNA_Result (*U32SizeOutFn)(uint32_t, uint64_t*);
typedef CNA_Result (*U32CopyTextFn)(uint32_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*U64CopyTextFn)(uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*U64SizeOutFn)(uint64_t, uint64_t*);
typedef CNA_Result (*RendererListCopyFn)(CNA_GraphicsRendererType*, uint64_t, uint64_t*);
typedef CNA_Result (*RendererChainFn)(const CNA_GraphicsRendererType*, uint64_t);
typedef CNA_Result (*RendererFallbackAtFn)(uint64_t, CNA_GraphicsRendererFallbackRecord*);
typedef CNA_Result (*RendererParseFn)(CNA_StringView, CNA_GraphicsRendererType*, CNA_Bool*);
typedef CNA_Result (*LoggerLogFn)(CNA_LogLevel, CNA_StringView, CNA_LogCategory, CNA_Bool);

typedef CNA_Result (*ErrorGetLastMessageSizeFn)(uint64_t*);
typedef CNA_Result (*ErrorCopyLastMessageFn)(char*, uint64_t, uint64_t*);
typedef CNA_Result (*GameCreateFn)(const CNA_GameCreateInfo*, CNA_Handle*);
typedef CNA_Result (*GameHandleFn)(CNA_Handle);
typedef CNA_Result (*GameSetFrameHooksFn)(CNA_Handle, const CNA_GameFrameHooks*);
typedef CNA_Result (*GraphicsManagerCreateFn)(CNA_Handle, CNA_GraphicsDeviceManagerHandle*);
typedef CNA_Result (*GraphicsManagerSetU32Fn)(CNA_GraphicsDeviceManagerHandle, uint32_t);
typedef CNA_Result (*GraphicsManagerSetI32Fn)(CNA_GraphicsDeviceManagerHandle, int32_t);
typedef CNA_Result (*GraphicsManagerSetBoolFn)(CNA_GraphicsDeviceManagerHandle, CNA_Bool);
typedef CNA_Result (*GraphicsManagerGetDeviceFn)(CNA_GraphicsDeviceManagerHandle, CNA_Handle*);
typedef CNA_Result (*GraphicsManagerBeginDrawFn)(CNA_GraphicsDeviceManagerHandle, CNA_Bool*);
typedef CNA_Result (*GraphicsClearFn)(CNA_Handle, float, float, float, float);
typedef CNA_Result (*GraphicsGetRendererInfoFn)(CNA_Handle, CNA_RendererInfo*);
typedef CNA_Result (*GraphicsRendererNameSizeFn)(CNA_Handle, uint64_t*);
typedef CNA_Result (*GraphicsCopyRendererNameFn)(CNA_Handle, char*, uint64_t, uint64_t*);
typedef CNA_Result (*TextureCreateFn)(CNA_Handle, const CNA_Texture2DCreateInfo*, CNA_Handle*);
typedef CNA_Result (*TextureInfoFn)(CNA_Handle, CNA_Texture2DInfo*);
typedef CNA_Result (*TextureFromEncodedFn)(
  CNA_Handle, const uint8_t*, uint64_t, const CNA_Texture2DDecodeInfo*, CNA_Handle*);
typedef CNA_Result (*TextureSetDataFn)(
  CNA_Handle, CNA_TextureDataType, const CNA_Texture2DTransfer*, const void*, uint64_t);
typedef CNA_Result (*TextureGetDataFn)(
  CNA_Handle, CNA_TextureDataType, const CNA_Texture2DTransfer*, void*, uint64_t, uint64_t*);
typedef CNA_Result (*TextureEncodedCountFn)(
  CNA_Handle, CNA_TextureImageFormat, uint32_t, uint32_t, uint64_t*);
typedef CNA_Result (*TextureEncodedCopyFn)(
  CNA_Handle, CNA_TextureImageFormat, uint32_t, uint32_t, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*SpriteBatchCreateFn)(CNA_Handle, CNA_Handle*);
typedef CNA_Result (*SpriteBatchBeginFn)(CNA_Handle, const CNA_SpriteBatchBeginInfo*);
typedef CNA_Result (*SpriteBatchSubmitScaledFn)(
  CNA_Handle, const CNA_SpriteScaledCommand*, uint64_t);
typedef CNA_Result (*VertexDeclarationCreateFn)(
  int32_t, const CNA_VertexElement*, uint64_t, CNA_VertexDeclarationHandle*);
typedef CNA_Result (*VertexBufferCreateFn)(
  CNA_Handle, const CNA_VertexBufferCreateInfo*, CNA_VertexBufferHandle*);
typedef CNA_Result (*VertexBufferSetRawFn)(
  CNA_VertexBufferHandle, const void*, uint64_t, uint64_t, uint32_t);
typedef CNA_Result (*VertexBufferGetRawFn)(
  CNA_VertexBufferHandle, uint64_t, void*, uint64_t, uint64_t, uint32_t);
typedef CNA_Result (*IndexBufferCreateFn)(
  CNA_Handle, const CNA_IndexBufferCreateInfo*, CNA_IndexBufferHandle*);
typedef CNA_Result (*IndexBufferSetFn)(
  CNA_IndexBufferHandle, const CNA_IndexBufferTransfer*, const void*, uint64_t);
typedef CNA_Result (*IndexBufferGetFn)(
  CNA_IndexBufferHandle, const CNA_IndexBufferTransfer*, void*, uint64_t, uint64_t*);
typedef CNA_Result (*GraphicsDeviceStatusFn)(CNA_Handle, CNA_GraphicsDeviceStatus*);
typedef CNA_Result (*GraphicsSetColorFn)(CNA_Handle, CNA_Color);
typedef CNA_Result (*GraphicsSetBlendStateFn)(CNA_Handle, const CNA_BlendState*);
typedef CNA_Result (*GraphicsSetDepthStencilStateFn)(CNA_Handle, const CNA_DepthStencilState*);
typedef CNA_Result (*GraphicsSetRasterizerStateFn)(CNA_Handle, const CNA_RasterizerState*);
typedef CNA_Result (*GraphicsSetSamplerStateFn)(
  CNA_Handle, CNA_ShaderStage, uint32_t, const CNA_SamplerState*);
typedef CNA_Result (*GraphicsSetTextureFn)(CNA_Handle, CNA_ShaderStage, uint32_t, CNA_Handle);
typedef CNA_Result (*GraphicsSetI32Fn)(CNA_Handle, int32_t);
typedef CNA_Result (*GraphicsSetRectangleFn)(CNA_Handle, CNA_Rectangle);
typedef CNA_Result (*GraphicsSetViewportFn)(CNA_Handle, CNA_Viewport);
typedef CNA_Result (*GraphicsSetVertexBuffersFn)(
  CNA_Handle, const CNA_VertexBufferBinding*, uint64_t);
typedef CNA_Result (*GraphicsSetIndexBufferFn)(CNA_Handle, CNA_IndexBufferHandle);
typedef CNA_Result (*GraphicsDrawPrimitivesFn)(CNA_Handle, CNA_PrimitiveType, int32_t, int32_t);
typedef CNA_Result (*GraphicsDrawIndexedFn)(
  CNA_Handle, CNA_PrimitiveType, int32_t, int32_t, int32_t, int32_t, int32_t);
typedef CNA_Result (*GraphicsDrawInstancedFn)(
  CNA_Handle, CNA_PrimitiveType, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t);
typedef CNA_Result (*GraphicsDrawUserFn)(CNA_Handle, const CNA_UserPrimitives*);
typedef CNA_Result (*GraphicsDrawUserIndexedFn)(
  CNA_Handle, const CNA_UserPrimitives*, const CNA_UserIndices*);
typedef CNA_Result (*SpriteBatchBeginStatesFn)(
  CNA_Handle, CNA_SpriteSortMode, const CNA_BlendState*, const CNA_SamplerState*,
  const CNA_DepthStencilState*, const CNA_RasterizerState*);
typedef CNA_Result (*SpriteBatchBeginEffectFn)(
  CNA_Handle, CNA_SpriteSortMode, const CNA_BlendState*, const CNA_SamplerState*,
  const CNA_DepthStencilState*, const CNA_RasterizerState*, CNA_Handle, const CNA_Matrix*);
typedef CNA_Result (*VertexBufferSetDataFn)(
  CNA_VertexBufferHandle, const CNA_VertexBufferTransfer*, const void*, uint64_t);
typedef CNA_Result (*VertexBufferSetRawAtFn)(
  CNA_VertexBufferHandle, uint64_t, const void*, uint64_t, uint64_t, uint32_t);
typedef CNA_Result (*VertexBufferSetRawAtWithOptionsFn)(
  CNA_VertexBufferHandle, uint64_t, const void*, uint64_t, uint64_t, uint32_t, CNA_SetDataOptions);
typedef CNA_Result (*VertexBufferInfoFn)(CNA_VertexBufferHandle, CNA_VertexBufferInfo*);
typedef CNA_Result (*IndexBufferSetAtFn)(
  CNA_IndexBufferHandle, uint64_t, const CNA_IndexBufferTransfer*, const void*, uint64_t);
typedef CNA_Result (*IndexBufferInfoFn)(CNA_IndexBufferHandle, CNA_IndexBufferInfo*);
typedef CNA_Result (*Texture3DCreateFn)(CNA_Handle, const CNA_Texture3DCreateInfo*, CNA_Handle*);
typedef CNA_Result (*Texture3DInfoFn)(CNA_Handle, CNA_Texture3DInfo*);
typedef CNA_Result (*Texture3DSetFn)(
  CNA_Handle, const CNA_Texture3DTransfer*, const CNA_Color*, uint64_t);
typedef CNA_Result (*Texture3DGetFn)(
  CNA_Handle, const CNA_Texture3DTransfer*, CNA_Color*, uint64_t, uint64_t*);
typedef CNA_Result (*TextureCubeCreateFn)(CNA_Handle, const CNA_TextureCubeCreateInfo*, CNA_Handle*);
typedef CNA_Result (*TextureCubeInfoFn)(CNA_Handle, CNA_TextureCubeInfo*);
typedef CNA_Result (*TextureCubeSetFn)(
  CNA_Handle, const CNA_TextureCubeTransfer*, const CNA_Color*, uint64_t);
typedef CNA_Result (*TextureCubeGetFn)(
  CNA_Handle, const CNA_TextureCubeTransfer*, CNA_Color*, uint64_t, uint64_t*);
typedef CNA_Result (*RenderTarget2DCreateFn)(
  CNA_Handle, const CNA_RenderTarget2DCreateInfo*, CNA_Handle*);
typedef CNA_Result (*RenderTargetCubeCreateFn)(
  CNA_Handle, const CNA_RenderTargetCubeCreateInfo*, CNA_Handle*);
typedef CNA_Result (*RenderTargetInfoFn)(CNA_Handle, CNA_RenderTargetInfo*);
typedef CNA_Result (*GraphicsSetRenderTargetsFn)(
  CNA_Handle, const CNA_RenderTargetBinding*, uint64_t);
typedef CNA_Result (*KeyboardGetStateFn)(CNA_Handle, CNA_KeyboardState*);
typedef CNA_Result (*MouseGetStateFn)(CNA_Handle, CNA_MouseState*);
typedef CNA_Result (*MouseSetPositionFn)(CNA_Handle, int32_t, int32_t);
typedef CNA_Result (*WindowGetFn)(CNA_Handle, uint64_t*);
typedef CNA_Result (*WindowSetFn)(CNA_Handle, uint64_t);
typedef CNA_Result (*GamePadGetStateFn)(CNA_Handle, CNA_PlayerIndex, CNA_GamePadDeadZone, CNA_GamePadState*);
typedef CNA_Result (*GamePadGetCapabilitiesFn)(CNA_Handle, CNA_PlayerIndex, CNA_GamePadCapabilities*);
typedef CNA_Result (*GamePadSetVibrationFn)(CNA_Handle, CNA_PlayerIndex, float, float, CNA_Bool*);
typedef CNA_Result (*TouchGetStateFn)(CNA_Handle, CNA_TouchState*);
typedef CNA_Result (*TouchGetCapabilitiesFn)(CNA_Handle, CNA_TouchCapabilities*);
typedef CNA_Result (*BoolGetFn)(CNA_Handle, CNA_Bool*);
typedef CNA_Result (*GestureReadFn)(CNA_Handle, CNA_GestureSample*);
typedef CNA_Result (*SoundEffectCreatePcmRangeFn)(
  CNA_Handle, const CNA_SoundEffectCreateInfo*, const uint8_t*, uint64_t,
  int32_t, int32_t, int32_t, int32_t, CNA_Handle*);
typedef CNA_Result (*SoundEffectCreateEncodedFn)(CNA_Handle, const uint8_t*, uint64_t, CNA_Handle*);
typedef CNA_Result (*HandleInt64OutFn)(CNA_Handle, int64_t*);
typedef CNA_Result (*HandleU64OutFn)(CNA_Handle, uint64_t*);
typedef CNA_Result (*HandleCopyStringFn)(CNA_Handle, char*, uint64_t, uint64_t*);
typedef CNA_Result (*ShadowQualityToI32Fn)(CNA_ShadowQuality, int32_t*);
typedef CNA_Result (*HandleStringViewFn)(CNA_Handle, CNA_StringView);
typedef CNA_Result (*HandleHandleOutFn)(CNA_Handle, CNA_Handle*);
typedef CNA_Result (*SoundEffectPlaySettingsFn)(CNA_Handle, float, float, float, CNA_Bool*);
typedef CNA_Result (*HandleFloatOutFn)(CNA_Handle, float*);
typedef CNA_Result (*HandleFloatFn)(CNA_Handle, float);
typedef CNA_Result (*HandleBoolFn)(CNA_Handle, CNA_Bool);
typedef CNA_Result (*SoundEffectInstanceStopFn)(CNA_Handle, CNA_Bool);
typedef CNA_Result (*SoundEffectInstanceInfoFn)(CNA_Handle, CNA_SoundEffectInstanceInfo*);
typedef CNA_Result (*SoundEffectApply3DMultiFn)(
  CNA_Handle, const CNA_AudioListener*, uint64_t, const CNA_AudioEmitter*);
typedef CNA_Result (*DynamicSoundCreateFn)(CNA_Handle, int32_t, CNA_AudioChannels, CNA_Handle*);
typedef CNA_Result (*HandleI32OutFn)(CNA_Handle, int32_t*);
typedef CNA_Result (*DynamicSoundSubmitFn)(CNA_Handle, const uint8_t*, uint64_t, int32_t, int32_t);
typedef CNA_Result (*GameDefaultMicrophoneFn)(CNA_Handle, uint64_t*, CNA_Bool*);
typedef CNA_Result (*GameIndexU64OutFn)(CNA_Handle, uint64_t, uint64_t*);
typedef CNA_Result (*GameIndexCopyStringFn)(CNA_Handle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*GameIndexInt64OutFn)(CNA_Handle, uint64_t, int64_t*);
typedef CNA_Result (*GameIndexInt64Fn)(CNA_Handle, uint64_t, int64_t);
typedef CNA_Result (*GameIndexBoolOutFn)(CNA_Handle, uint64_t, CNA_Bool*);
typedef CNA_Result (*GameIndexI32OutFn)(CNA_Handle, uint64_t, int32_t*);
typedef CNA_Result (*GameIndexU32OutFn)(CNA_Handle, uint64_t, uint32_t*);
typedef CNA_Result (*GameIndexFn)(CNA_Handle, uint64_t);
typedef CNA_Result (*GameIndexBytesFn)(CNA_Handle, uint64_t, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*HandleStringHandleOutFn)(CNA_Handle, CNA_StringView, CNA_Handle*);
typedef CNA_Result (*AudioEngineCreateRendererFn)(
  CNA_Handle, CNA_StringView, int64_t, CNA_StringView, CNA_Handle*);
typedef CNA_Result (*HandleIndexU64OutFn)(CNA_Handle, uint64_t, uint64_t*);
typedef CNA_Result (*HandleIndexCopyStringFn)(CNA_Handle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*HandleStringFloatOutFn)(CNA_Handle, CNA_StringView, float*);
typedef CNA_Result (*HandleStringFloatFn)(CNA_Handle, CNA_StringView, float);
typedef CNA_Result (*HandleOptionsFn)(CNA_Handle, uint32_t);
typedef CNA_Result (*TwoHandleBoolOutFn)(CNA_Handle, CNA_Handle, CNA_Bool*);
typedef CNA_Result (*WaveBankStreamingCreateFn)(CNA_Handle, CNA_StringView, int32_t, int16_t, CNA_Handle*);
typedef CNA_Result (*SoundBankPlay3DFn)(
  CNA_Handle, CNA_StringView, const CNA_AudioListener*, const CNA_AudioEmitter*);
typedef CNA_Result (*CueInfoFn)(CNA_Handle, CNA_CueInfo*);
typedef CNA_Result (*CueApply3DFn)(CNA_Handle, const CNA_AudioListener*, const CNA_AudioEmitter*);
typedef CNA_Result (*GameU32OutFn)(CNA_Handle, uint32_t*);
typedef CNA_Result (*GameIndexU32U32OutFn)(CNA_Handle, uint32_t, uint32_t*);
typedef CNA_Result (*GameIndexU32U64OutFn)(CNA_Handle, uint32_t, uint64_t*);
typedef CNA_Result (*GameIndexU32CopyStringFn)(CNA_Handle, uint32_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*SongCreateUriFn)(CNA_Handle, CNA_StringView, CNA_StringView, CNA_Handle*);
typedef CNA_Result (*SongCollectionCreateFn)(CNA_Handle, const CNA_Handle*, uint64_t, CNA_Handle*);
typedef CNA_Result (*MediaPlayCollectionFromFn)(CNA_Handle, CNA_Handle, int32_t);
typedef CNA_Result (*VisualizationGetFn)(CNA_Handle, CNA_VisualizationData*);
typedef CNA_Result (*TwoHandleFn)(CNA_Handle, CNA_Handle);
typedef CNA_Result (*StorageSelectFn)(CNA_StorageCompletionCallback, void*, CNA_Handle*);
typedef CNA_Result (*StorageSelectPlayerFn)(uint32_t, CNA_StorageCompletionCallback, void*, CNA_Handle*);
typedef CNA_Result (*StorageSelectSpaceFn)(int32_t, int32_t, CNA_StorageCompletionCallback, void*, CNA_Handle*);
typedef CNA_Result (*StorageSelectPlayerSpaceFn)(
  uint32_t, int32_t, int32_t, CNA_StorageCompletionCallback, void*, CNA_Handle*);
typedef CNA_Result (*StorageContainerOpenFn)(
  CNA_Handle, CNA_StringView, CNA_StorageCompletionCallback, void*, CNA_Handle*);
typedef CNA_Result (*HandleStringBoolOutFn)(CNA_Handle, CNA_StringView, CNA_Bool*);
typedef CNA_Result (*HandleStringU64OutFn)(CNA_Handle, CNA_StringView, uint64_t*);
typedef CNA_Result (*StorageNameCopyFn)(
  CNA_Handle, CNA_StringView, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*StorageOpenFileFn)(
  CNA_Handle, CNA_StringView, uint32_t, uint32_t, uint32_t, CNA_Handle*);
typedef CNA_Result (*StorageStreamReadFn)(CNA_Handle, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*TitleContainerReadFn)(
  CNA_Handle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*HandleRectangleOutFn)(CNA_Handle, CNA_Rectangle*);
typedef CNA_Result (*GameWindowEndFn)(CNA_Handle, CNA_StringView, int32_t, int32_t);
typedef CNA_Result (*GameWindowSubscribeFn)(
  CNA_Handle, CNA_GameWindowEvent, CNA_GameEventCallback, void*, CNA_Handle*);
typedef CNA_Result (*EffectCreateFn)(CNA_Handle, CNA_EffectHandle*);
typedef CNA_Result (*EffectCreateCompiledFn)(
  CNA_Handle, const uint8_t*, uint64_t, CNA_EffectHandle*);
typedef CNA_Result (*EffectCloneFn)(CNA_EffectHandle, CNA_EffectHandle*);
typedef CNA_Result (*EffectHandleFn)(CNA_EffectHandle);
typedef CNA_Result (*EffectGetHandleFn)(CNA_EffectHandle, CNA_Handle*);
typedef CNA_Result (*EffectSetHandleFn)(CNA_EffectHandle, CNA_Handle);
typedef CNA_Result (*HandleIndexHandleOutFn)(CNA_Handle, uint64_t, CNA_Handle*);
typedef CNA_Result (*EffectMatrixFn)(CNA_EffectHandle, CNA_Matrix);
typedef CNA_Result (*EffectVector3Fn)(CNA_EffectHandle, CNA_Vector3);
typedef CNA_Result (*EffectFloatFn)(CNA_EffectHandle, float);
typedef CNA_Result (*EffectBoolFn)(CNA_EffectHandle, CNA_Bool);
typedef CNA_Result (*EffectU32Fn)(CNA_EffectHandle, uint32_t);
typedef CNA_Result (*EffectI32Fn)(CNA_EffectHandle, int32_t);
typedef CNA_Result (*EffectIndexHandleFn)(CNA_EffectHandle, uint32_t, CNA_Handle);
typedef CNA_Result (*EffectLightOutFn)(CNA_EffectHandle, uint32_t, CNA_DirectionalLightHandle*);
typedef CNA_Result (*LightVector3Fn)(CNA_DirectionalLightHandle, CNA_Vector3);
typedef CNA_Result (*LightBoolFn)(CNA_DirectionalLightHandle, CNA_Bool);
typedef CNA_Result (*EffectMatricesFn)(CNA_EffectHandle, const CNA_Matrix*, uint64_t);

/* --- CNB: CNA's own compiled content format ------------------------------------------------- */
typedef CNA_Result (*CnbHasMagicFn)(const uint8_t*, uint64_t, CNA_Bool*);
typedef CNA_Result (*CnbCopyMagicFn)(uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbCrc32cFn)(const uint8_t*, uint64_t, uint32_t*);
typedef CNA_Result (*CnbStringViewToU32Fn)(CNA_StringView, uint32_t*);
typedef CNA_Result (*CnbMakeChunkIdFn)(uint8_t, uint8_t, uint8_t, uint8_t, CNA_CnbChunkId*);
typedef CNA_Result (*CnbLevelByteSizeFn)(CNA_CnbTextureFormat, uint32_t, uint32_t, uint32_t, uint64_t*);
typedef CNA_Result (*CnbDocumentParseFn)(
  const uint8_t*, uint64_t, CNA_StringView, const CNA_CnbReadLimits*, CNA_CnbDocumentHandle*);
typedef CNA_Result (*CnbDocumentU16OutFn)(CNA_CnbDocumentHandle, uint16_t*);
typedef CNA_Result (*CnbDocumentChunkFn)(CNA_CnbDocumentHandle, uint64_t, CNA_CnbChunkEntry*);
typedef CNA_Result (*CnbDocumentCopyChunkFn)(CNA_CnbDocumentHandle, uint64_t, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDocumentFindAllFn)(CNA_CnbDocumentHandle, CNA_CnbChunkId, uint64_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDocumentMandatoryFn)(CNA_CnbDocumentHandle, const CNA_CnbChunkId*, uint64_t);
typedef CNA_Result (*CnbDocumentMetadataFn)(CNA_CnbDocumentHandle, CNA_CnbMetadata*);
typedef CNA_Result (*CnbDocumentExternalFn)(
  CNA_CnbDocumentHandle, uint64_t, CNA_StringView, CNA_CnbExternalReference*);
typedef CNA_Result (*CnbDocumentIndexSizeFn)(CNA_CnbDocumentHandle, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDocumentIndexCopyTextFn)(CNA_CnbDocumentHandle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbTextureInfoFn)(CNA_CnbTextureDataHandle, CNA_CnbTextureInfo*);
typedef CNA_Result (*CnbTextureLevelDimensionsFn)(
  CNA_CnbTextureDataHandle, uint32_t, uint32_t*, uint32_t*, uint32_t*);
typedef CNA_Result (*CnbTextureRepresentationFormatFn)(CNA_CnbTextureDataHandle, uint64_t, CNA_CnbTextureFormat*);
typedef CNA_Result (*CnbTextureLevelCountFn)(CNA_CnbTextureDataHandle, uint64_t, uint64_t*);
typedef CNA_Result (*CnbTextureCopyLevelFn)(
  CNA_CnbTextureDataHandle, uint64_t, uint64_t, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbTextureCreateFn)(uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbTextureCreateRgba8Fn)(uint32_t, uint32_t, const uint8_t*, uint64_t, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbTextureAddRepresentationFn)(CNA_CnbTextureDataHandle, CNA_CnbTextureFormat, uint64_t*);
typedef CNA_Result (*CnbTextureSetLevelFn)(CNA_CnbTextureDataHandle, uint64_t, uint64_t, const uint8_t*, uint64_t);
typedef CNA_Result (*CnbEncodeTextureFn)(CNA_CnbTextureDataHandle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeTextureFn)(CNA_CnbDocumentHandle, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbDecodeSpriteFontFn)(CNA_CnbDocumentHandle, CNA_CnbSpriteFontDataHandle*);
typedef CNA_Result (*CnbSpriteFontCreateFn)(CNA_CnbSpriteFontDataHandle*);
typedef CNA_Result (*CnbSpriteFontDestroyFn)(CNA_CnbSpriteFontDataHandle);
typedef CNA_Result (*CnbSpriteFontInfoFn)(CNA_CnbSpriteFontDataHandle, CNA_CnbSpriteFontInfo*);
typedef CNA_Result (*CnbSpriteFontSetInfoFn)(CNA_CnbSpriteFontDataHandle, const CNA_CnbSpriteFontInfo*);
typedef CNA_Result (*CnbSpriteFontGetGlyphFn)(CNA_CnbSpriteFontDataHandle, uint64_t, CNA_SpriteFontGlyph*);
typedef CNA_Result (*CnbSpriteFontAddGlyphFn)(CNA_CnbSpriteFontDataHandle, const CNA_SpriteFontGlyph*, uint64_t*);
typedef CNA_Result (*CnbSpriteFontSetAtlasFn)(CNA_CnbSpriteFontDataHandle, CNA_CnbTextureDataHandle);
typedef CNA_Result (*CnbSpriteFontCopyAtlasFn)(CNA_CnbSpriteFontDataHandle, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbEncodeSpriteFontFn)(CNA_CnbSpriteFontDataHandle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
/*
 * These families index by `uint32_t`, not by the `uint64_t` the older `GameIndex*` helpers use.
 * Reusing those was a real mismatch and the compiled signature audit is what found it: an index
 * widened by the caller and read narrow by the callee is exactly the silent ABI defect that check
 * exists for.
 */
typedef void (*TextInputCallbackFn)(uint16_t, void*);
typedef void (*TextEditingCallbackFn)(const CNA_TextEditingEventInfo*, void*);
typedef void (*TextCandidatesCallbackFn)(const CNA_TextEditingCandidatesEventInfo*, void*);
typedef CNA_Result (*TextInputSubscribeInputFn)(
  CNA_TextInputCallback, void*, CNA_TextInputRegistrationHandle*);
typedef CNA_Result (*TextInputSubscribeEditingFn)(
  CNA_TextEditingCallback, void*, CNA_TextInputRegistrationHandle*);
typedef CNA_Result (*TextInputSubscribeCandidatesFn)(
  CNA_TextEditingCandidatesCallback, void*, CNA_TextInputRegistrationHandle*);
typedef CNA_Result (*TextInputUnsubscribeFn)(CNA_TextInputRegistrationHandle);
typedef CNA_Result (*TextInputRaiseInputFn)(CNA_Handle, uint16_t);
typedef CNA_Result (*TextInputRaiseEditingFn)(CNA_Handle, CNA_StringView, int32_t, int32_t);
typedef CNA_Result (*TextInputRaiseCandidatesFn)(
  CNA_Handle, const CNA_StringView*, int32_t, int32_t, CNA_Bool);
typedef CNA_Result (*TextInputStartWithTypeFn)(CNA_Handle, CNA_TextInputType);
typedef CNA_Result (*TextInputSetRectangleFn)(CNA_Handle, CNA_Rectangle);
typedef CNA_Result (*MouseCursorStockFn)(CNA_Handle, CNA_MouseCursorStock, CNA_MouseCursorHandle*);
typedef CNA_Result (*MouseCursorFromTextureFn)(
  CNA_Handle, CNA_Handle, int32_t, int32_t, CNA_MouseCursorHandle*);
typedef CNA_Result (*MouseCursorHandleFn)(CNA_MouseCursorHandle);
typedef CNA_Result (*MouseSetCursorFn)(CNA_Handle, CNA_MouseCursorHandle);
typedef CNA_Result (*GameU32IndexSizeFn)(CNA_Handle, uint32_t, uint64_t*);
typedef CNA_Result (*GameU32IndexCopyTextFn)(CNA_Handle, uint32_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*GameU32IndexU32OutFn)(CNA_Handle, uint32_t, uint32_t*);
typedef CNA_Result (*JoystickInfoInitFn)(CNA_JoystickInfo*);
typedef CNA_Result (*JoystickCapabilitiesInitFn)(CNA_JoystickCapabilities*);
typedef CNA_Result (*HapticCapabilitiesInitFn)(CNA_HapticCapabilities*);
typedef CNA_Result (*JoystickCountFn)(CNA_Handle, uint32_t*);
typedef CNA_Result (*JoystickInfoAtFn)(CNA_Handle, uint32_t, CNA_JoystickInfo*);
typedef CNA_Result (*JoystickCapabilitiesFn)(CNA_Handle, uint32_t, CNA_JoystickCapabilities*);
typedef CNA_Result (*JoystickCaptureStateFn)(CNA_Handle, uint32_t, CNA_JoystickStateHandle*);
typedef CNA_Result (*JoystickStateCountFn)(CNA_JoystickStateHandle, uint32_t*);
typedef CNA_Result (*JoystickStateCopyAxesFn)(
  CNA_JoystickStateHandle, int16_t*, uint64_t, uint64_t*);
typedef CNA_Result (*JoystickStateCopyButtonsFn)(
  CNA_JoystickStateHandle, CNA_Bool*, uint64_t, uint64_t*);
typedef CNA_Result (*JoystickStateCopyHatsFn)(
  CNA_JoystickStateHandle, CNA_JoystickHatPosition*, uint64_t, uint64_t*);
typedef CNA_Result (*JoystickStateCopyBallsFn)(
  CNA_JoystickStateHandle, CNA_Point*, uint64_t, uint64_t*);
typedef CNA_Result (*JoystickStateDestroyFn)(CNA_JoystickStateHandle);
typedef CNA_Result (*GameIndexHandleOutFn)(CNA_Handle, uint32_t, CNA_Handle*);
typedef CNA_Result (*GameIdBoolOutFn)(CNA_Handle, uint32_t, CNA_Bool*);
typedef CNA_Result (*HapticCapabilitiesFn)(CNA_HapticDeviceHandle, CNA_HapticCapabilities*);
typedef CNA_Result (*HandleBoolOutFn)(CNA_Handle, CNA_Bool*);
typedef CNA_Result (*HapticPlayRumbleFn)(CNA_HapticDeviceHandle, float, uint32_t, CNA_Bool*);
typedef CNA_Result (*HapticSetGainFn)(CNA_HapticDeviceHandle, int32_t, CNA_Bool*);
typedef CNA_Result (*CnbImportImageFn)(
  CNA_StringView, const CNA_CnbImageImportOptions*, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbImportDdsFn)(CNA_StringView, CNA_CnbTextureDataHandle*);
typedef CNA_Result (*CnbImportWavFn)(CNA_StringView, CNA_CnbSoundEffectDataHandle*);
typedef CNA_Result (*CurveCreateFn)(CNA_CurveHandle*);
typedef CNA_Result (*CurveDestroyFn)(CNA_CurveHandle);
typedef CNA_Result (*CurveGetKeysFn)(CNA_CurveHandle, CNA_CurveKeyCollectionHandle*);
typedef CNA_Result (*CurveGetLoopFn)(CNA_CurveHandle, CNA_CurveLoopType*);
typedef CNA_Result (*CurveSetLoopFn)(CNA_CurveHandle, CNA_CurveLoopType);
typedef CNA_Result (*CurveGetIsConstantFn)(CNA_CurveHandle, CNA_Bool*);
typedef CNA_Result (*CurveKeyCollectionDestroyFn)(CNA_CurveKeyCollectionHandle);
typedef CNA_Result (*CurveKeyCollectionCountFn)(CNA_CurveKeyCollectionHandle, uint64_t*);
typedef CNA_Result (*CurveKeyCollectionGetFn)(
  CNA_CurveKeyCollectionHandle, int32_t, CNA_CurveKey*);
typedef CNA_Result (*CurveKeyCollectionAddFn)(CNA_CurveKeyCollectionHandle, CNA_CurveKey);
typedef CNA_Result (*CurveKeyInitFullFn)(
  float, float, float, float, CNA_CurveContinuity, CNA_CurveKey*);
typedef CNA_Result (*CnbEncodeCurveFn)(
  CNA_CurveHandle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeCurveFn)(CNA_CnbDocumentHandle, CNA_CurveHandle*);
typedef CNA_Result (*CnbEncodeAnimationClipFn)(
  const CNA_AnimationClipEXTDescriptor*, CNA_ClipTargetSpaceEXT, CNA_StringView,
  uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeAnimationClipFn)(
  CNA_CnbDocumentHandle, CNA_CnbAnimationClipHandle*);
typedef CNA_Result (*CnbAnimationClipDestroyFn)(CNA_CnbAnimationClipHandle);
typedef CNA_Result (*CnbAnimationClipGetFn)(
  CNA_CnbAnimationClipHandle, double*, uint64_t*, CNA_ClipTargetSpaceEXT*);
typedef CNA_Result (*CnbAnimationClipGetTrackFn)(
  CNA_CnbAnimationClipHandle, uint64_t, int32_t*, uint64_t*);
typedef CNA_Result (*CnbAnimationClipCopyKeyframesFn)(
  CNA_CnbAnimationClipHandle, uint64_t, CNA_KeyframeEXT*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbSoundEffectCreateFn)(
  const CNA_CnbSoundEffectInfo*, const uint8_t*, uint64_t, CNA_CnbSoundEffectDataHandle*);
typedef CNA_Result (*CnbSoundEffectDestroyFn)(CNA_CnbSoundEffectDataHandle);
typedef CNA_Result (*CnbSoundEffectInfoFn)(
  CNA_CnbSoundEffectDataHandle, CNA_CnbSoundEffectInfo*);
typedef CNA_Result (*CnbSoundEffectCopySamplesFn)(
  CNA_CnbSoundEffectDataHandle, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbEncodeSoundEffectFn)(
  CNA_CnbSoundEffectDataHandle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeSoundEffectFn)(
  CNA_CnbDocumentHandle, CNA_CnbSoundEffectDataHandle*);
typedef CNA_Result (*CnbDecodeWavFn)(
  const uint8_t*, uint64_t, CNA_StringView, CNA_CnbSoundEffectDataHandle*);
typedef CNA_Result (*CnbEncodeSongFn)(
  CNA_StringView, CNA_StringView, uint32_t, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeSongDurationFn)(CNA_CnbDocumentHandle, uint32_t*);
typedef CNA_Result (*CnbDocumentTextSizeFn)(CNA_CnbDocumentHandle, uint64_t*);
typedef CNA_Result (*CnbDocumentTextCopyFn)(
  CNA_CnbDocumentHandle, char*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbEncodeVideoFn)(
  CNA_StringView, const CNA_CnbVideoInfo*, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeVideoFn)(CNA_CnbDocumentHandle, CNA_CnbVideoInfo*);
typedef CNA_Result (*CnbModelCreateFn)(CNA_CnbModelDataHandle*);
typedef CNA_Result (*CnbModelDestroyFn)(CNA_CnbModelDataHandle);
typedef CNA_Result (*CnbModelSetFlagsFn)(CNA_CnbModelDataHandle, CNA_Bool, CNA_Bool);
typedef CNA_Result (*CnbModelInfoFn)(CNA_CnbModelDataHandle, CNA_CnbModelInfo*);
typedef CNA_Result (*CnbModelAddBoneFn)(
  CNA_CnbModelDataHandle, CNA_StringView, int32_t, const float*, uint64_t*);
typedef CNA_Result (*CnbModelGetBoneFn)(CNA_CnbModelDataHandle, uint64_t, CNA_CnbModelBone*);
typedef CNA_Result (*CnbModelIndexSizeFn)(CNA_CnbModelDataHandle, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelIndexCopyTextFn)(
  CNA_CnbModelDataHandle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelIndexCopyBytesFn)(
  CNA_CnbModelDataHandle, uint64_t, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelAddPartFn)(
  CNA_CnbModelDataHandle, const CNA_CnbModelPartInfo*, CNA_StringView, CNA_StringView, uint64_t*);
typedef CNA_Result (*CnbModelGetPartFn)(CNA_CnbModelDataHandle, uint64_t, CNA_CnbModelPartInfo*);
typedef CNA_Result (*CnbModelSetPartBytesFn)(
  CNA_CnbModelDataHandle, uint64_t, const uint8_t*, uint64_t);
typedef CNA_Result (*CnbModelGetMaterialFn)(CNA_CnbModelDataHandle, uint64_t, CNA_CnbMaterialInfo*);
typedef CNA_Result (*CnbModelSetMaterialFn)(
  CNA_CnbModelDataHandle, uint64_t, const CNA_CnbMaterialInfo*);
typedef CNA_Result (*CnbModelMaterialTextureSizeFn)(
  CNA_CnbModelDataHandle, uint64_t, CNA_CnbMaterialTextureSlot, uint64_t*);
typedef CNA_Result (*CnbModelMaterialTextureCopyFn)(
  CNA_CnbModelDataHandle, uint64_t, CNA_CnbMaterialTextureSlot, char*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelSetMaterialTextureFn)(
  CNA_CnbModelDataHandle, uint64_t, CNA_CnbMaterialTextureSlot, CNA_StringView);
typedef CNA_Result (*CnbModelAddMeshFn)(
  CNA_CnbModelDataHandle, CNA_StringView, int32_t, const uint32_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelGetMeshFn)(CNA_CnbModelDataHandle, uint64_t, CNA_CnbMeshInfo*);
typedef CNA_Result (*CnbModelCopyMeshPartsFn)(
  CNA_CnbModelDataHandle, uint64_t, uint32_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelSetSkeletonFn)(
  CNA_CnbModelDataHandle, const int32_t*, uint64_t, const float*, const float*, const float*);
typedef CNA_Result (*CnbModelGetSkeletonFn)(CNA_CnbModelDataHandle, CNA_CnbSkeletonInfo*);
typedef CNA_Result (*CnbModelCopyHierarchyFn)(
  CNA_CnbModelDataHandle, int32_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelCopySkeletonMatricesFn)(
  CNA_CnbModelDataHandle, CNA_CnbSkeletonMatrixSet, float*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbModelAddLightFn)(
  CNA_CnbModelDataHandle, const CNA_CnbModelLight*, uint64_t*);
typedef CNA_Result (*CnbModelGetLightFn)(CNA_CnbModelDataHandle, uint64_t, CNA_CnbModelLight*);
typedef CNA_Result (*CnbEncodeModelFn)(
  CNA_CnbModelDataHandle, CNA_StringView, uint8_t*, uint64_t, uint64_t*);
typedef CNA_Result (*CnbDecodeModelFn)(CNA_CnbDocumentHandle, CNA_CnbModelDataHandle*);
typedef CNA_Result (*CnbTextureDataDestroyFn)(CNA_CnbTextureDataHandle);
typedef CNA_Result (*CnbDocumentDestroyFn)(CNA_CnbDocumentHandle);

/* --- CNB's writers ---------------------------------------------------------------------------- */
typedef CNA_Result (*CnbByteWriterCreateFn)(CNA_CnbByteWriterHandle*);
typedef CNA_Result (*CnbByteWriterCreateFromBytesFn)(
  const uint8_t*, uint64_t, CNA_CnbByteWriterHandle*);
typedef CNA_Result (*CnbWriteU8Fn)(CNA_CnbByteWriterHandle, uint8_t);
typedef CNA_Result (*CnbWriteU16Fn)(CNA_CnbByteWriterHandle, uint16_t);
typedef CNA_Result (*CnbWriteU32Fn)(CNA_CnbByteWriterHandle, uint32_t);
typedef CNA_Result (*CnbWriteU64Fn)(CNA_CnbByteWriterHandle, uint64_t);
typedef CNA_Result (*CnbWriteF64Fn)(CNA_CnbByteWriterHandle, double);
typedef CNA_Result (*CnbWriteStringFn)(CNA_CnbByteWriterHandle, CNA_StringView);
typedef CNA_Result (*CnbWriteBytesFn)(CNA_CnbByteWriterHandle, const uint8_t*, uint64_t);
typedef CNA_Result (*CnbWriterCreateFn)(uint32_t, uint32_t, CNA_CnbWriterHandle*);
typedef CNA_Result (*CnbWriterMetadataFn)(CNA_CnbWriterHandle, CNA_StringView, CNA_StringView);
typedef CNA_Result (*CnbWriterAddReferenceFn)(
  CNA_CnbWriterHandle, const CNA_CnbExternalReference*, CNA_StringView);
typedef CNA_Result (*CnbWriterAddChunkFn)(
  CNA_CnbWriterHandle, CNA_CnbChunkId, const uint8_t*, uint64_t, uint32_t, uint32_t);
typedef CNA_Result (*CnbWriterCompressionFn)(CNA_CnbWriterHandle, CNA_CnbCompression, int32_t);
typedef CNA_Result (*CnbWriterSetLimitsFn)(CNA_CnbWriterHandle, const CNA_CnbReadLimits*);
typedef CNA_Result (*CnbWriterGetLimitsFn)(CNA_CnbWriterHandle, CNA_CnbReadLimits*);
typedef CNA_Result (*CnbReadLimitsInitFn)(CNA_CnbReadLimits*);
typedef CNA_Result (*CnbWriterAppendTextureFn)(
  CNA_CnbWriterHandle, CNA_CnbTextureDataHandle, CNA_StringView);
typedef CNA_Result (*CnbCompileCnjFn)(
  CNA_StringView, CNA_StringView, CNA_StringView, CNA_CnjToCnbResultHandle*);
typedef CNA_Result (*CnjIndexSizeFn)(CNA_CnjToCnbResultHandle, uint64_t, uint64_t*);
typedef CNA_Result (*CnjIndexCopyFn)(
  CNA_CnjToCnbResultHandle, uint64_t, char*, uint64_t, uint64_t*);



/* --- the engine layer's post-process chain --------------------------------------------------- */
typedef CNA_Result (*PostProcessContextInitFn)(CNA_PostProcessContext*);
typedef CNA_Result (*PostProcessPassCreateFn)(CNA_Handle, CNA_PostProcessPassHandle*);
typedef CNA_Result (*PostProcessPassApplyFn)(CNA_PostProcessPassHandle, const CNA_PostProcessContext*);
typedef CNA_Result (*PostProcessPassSupportedFn)(CNA_PostProcessPassHandle, CNA_Handle, CNA_Bool*);
typedef CNA_Result (*PostProcessChainApplyFn)(CNA_PostProcessChainHandle, const CNA_PostProcessContext*);
typedef CNA_Result (*PostProcessChainTimingFn)(CNA_PostProcessChainHandle, uint64_t, CNA_PassTimingEXT*);
typedef CNA_Result (*PostProcessChainTimingNameFn)(
  CNA_PostProcessChainHandle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*HandleI32Fn)(CNA_Handle, int32_t);
typedef CNA_Result (*U32ToI32OutFn)(uint32_t, int32_t*);
typedef CNA_Result (*U32ToFloatOutFn)(uint32_t, float*);
typedef CNA_Result (*HandleU32Fn)(CNA_Handle, uint32_t);

typedef CNA_Result (*VideoPlayerFrameFn)(CNA_VideoPlayerHandle, CNA_VideoFrameEXT*);

/* --- the engine layer's clustered lighting ---------------------------------------------------- */
typedef CNA_Result (*ClusteredLightInitFn)(CNA_ClusteredLightEXT*);
typedef CNA_Result (*ClusteredLightUsableFn)(const CNA_ClusteredLightEXT*, CNA_Bool*);
typedef CNA_Result (*ClusteredLightAddFn)(CNA_Handle, const CNA_ClusteredLightEXT*, int32_t*);
typedef CNA_Result (*ClusteredLightReplaceFn)(CNA_Handle, int32_t, const CNA_ClusteredLightEXT*);
typedef CNA_Result (*PointLightInitFn)(CNA_PointLightEXT*);
typedef CNA_Result (*SpotLightInitFn)(CNA_SpotLightEXT*);
typedef CNA_Result (*ClusteredAddPointFn)(CNA_Handle, const CNA_PointLightEXT*, int32_t*);
typedef CNA_Result (*ClusteredAddSpotFn)(CNA_Handle, const CNA_SpotLightEXT*, int32_t*);
typedef CNA_Result (*ClusteredLightGetAtFn)(CNA_Handle, int32_t, CNA_ClusteredLightEXT*);
typedef CNA_Result (*ClusteredLightCopyFn)(
  CNA_Handle, CNA_ClusteredLightEXT*, uint64_t, uint64_t*);
typedef CNA_Result (*ClusteredBoundsAtFn)(CNA_Handle, int32_t, CNA_BoundingSphere*);
typedef CNA_Result (*ClusteredBoundsCopyFn)(CNA_Handle, CNA_BoundingSphere*, uint64_t, uint64_t*);
typedef CNA_Result (*ClusteredGridCreateFn)(
  CNA_Handle, int32_t, int32_t, int32_t, CNA_ClusteredLightGridHandle*);
typedef CNA_Result (*ClusteredClusterIndexFn)(CNA_Handle, int32_t, int32_t, int32_t, int32_t*);
typedef CNA_Result (*ClusteredSetProjectionFn)(CNA_Handle, const CNA_Matrix*, float, float);
typedef CNA_Result (*ClusteredMatrixOutFn)(CNA_Handle, CNA_Matrix*);
typedef CNA_Result (*ClusteredSliceDistanceFn)(CNA_Handle, int32_t, float*);
typedef CNA_Result (*ClusteredSliceForDistanceFn)(CNA_Handle, float, int32_t*);
typedef CNA_Result (*ClusteredClusterBoundsFn)(
  CNA_Handle, int32_t, int32_t, int32_t, CNA_BoundingBox*);
typedef CNA_Result (*ClusteredAssignFn)(
  CNA_Handle, CNA_ClusteredLightGridHandle, const CNA_Matrix*, const CNA_BoundingSphere*, uint64_t);
typedef CNA_Result (*ClusteredCopyI32Fn)(CNA_Handle, int32_t*, uint64_t, uint64_t*);
typedef CNA_Result (*ClusteredClusterListFn)(
  CNA_Handle, int32_t, int32_t*, uint64_t, uint64_t*);
typedef CNA_Result (*ClusteredPolicyCreateFn)(
  CNA_Handle, int32_t, CNA_ClusteredShadowPolicyHandle*);
typedef CNA_Result (*ClusteredIsSelectedFn)(CNA_Handle, int32_t, CNA_Bool*);
typedef CNA_Result (*ClusteredScoreFn)(CNA_Handle, int32_t, float*);
typedef CNA_Result (*ClusteredSelectFn)(
  CNA_Handle, CNA_ClusteredLightSetHandle, const CNA_Matrix*, const CNA_Matrix*,
  const CNA_Vector3*);

/* --- the engine layer's level-of-detail groups ------------------------------------------------ */
typedef CNA_Result (*LodCreateFn)(CNA_LodGroupEXTHandle*);
typedef CNA_Result (*LodAddLevelFn)(CNA_LodGroupEXTHandle, float, CNA_ModelMeshPartHandle);
typedef CNA_Result (*LodCopyLevelsFn)(
  CNA_LodGroupEXTHandle, CNA_LodLevelEXT*, uint64_t, uint64_t*);
typedef CNA_Result (*LodSelectIndexFn)(CNA_LodGroupEXTHandle, float, int32_t*);
typedef CNA_Result (*LodModeOutFn)(CNA_LodGroupEXTHandle, CNA_LodSelectionMode*);
typedef CNA_Result (*LodModeInFn)(CNA_LodGroupEXTHandle, CNA_LodSelectionMode);
typedef CNA_Result (*LodScreenSpaceFn)(CNA_LodGroupEXTHandle, float, float, float);
typedef CNA_Result (*LodProjectedRadiusFn)(CNA_LodGroupEXTHandle, float, float*);

/* --- the engine layer's shadow maps ------------------------------------------------------------ */
typedef CNA_Result (*ShadowMapCreateFn)(CNA_Handle, CNA_ShadowQuality, CNA_ShadowMapHandle*);
typedef CNA_Result (*ShadowMapQualityOutFn)(CNA_ShadowMapHandle, CNA_ShadowQuality*);
typedef CNA_Result (*ShadowMapMatrixOutFn)(CNA_ShadowMapHandle, CNA_Matrix*);
typedef CNA_Result (*ShadowLightViewFn)(
  const CNA_DirectionalLightEXT*, const CNA_BoundingBox*, CNA_Matrix*);
typedef CNA_Result (*ShadowLightProjectionFn)(
  const CNA_Matrix*, const CNA_BoundingBox*, CNA_Matrix*);
typedef CNA_Result (*DirectionalLightInitFn)(CNA_DirectionalLightEXT*);

/* --- the engine layer's particle systems -------------------------------------------------------- */
typedef CNA_Result (*ParticleSystemCreateFn)(CNA_Handle, int32_t, CNA_ParticleSystemHandle*);
typedef CNA_Result (*ParticleSettingsOutFn)(
  CNA_ParticleSystemHandle, CNA_ParticleEmitterSettings*);
typedef CNA_Result (*ParticleSettingsInFn)(
  CNA_ParticleSystemHandle, const CNA_ParticleEmitterSettings*);
typedef CNA_Result (*ParticleCopyFn)(
  CNA_ParticleSystemHandle, CNA_Particle*, uint64_t, uint64_t*);
typedef CNA_Result (*ParticleStepFn)(
  CNA_Particle*, int32_t, const CNA_ParticleEmitterSettings*, float);
typedef CNA_Result (*ParticleRandomFn)(uint32_t, float*);
typedef CNA_Result (*ParticleSettingsInitFn)(CNA_ParticleEmitterSettings*);
typedef CNA_Result (*ParticleInitFn)(CNA_Particle*);

/* --- the rest of the shadow-map maths ----------------------------------------------------------- */
typedef CNA_Result (*CascadeSplitsFn)(float, float, int32_t, float, float*, uint64_t, uint64_t*);
typedef CNA_Result (*CascadeCornersFn)(const CNA_Matrix*, const CNA_Matrix*, CNA_Vector3*);
typedef CNA_Result (*CascadeSphereFn)(const CNA_Vector3*, CNA_Vector3*, float*);
typedef CNA_Result (*SpotShadowMatrixFn)(const CNA_SpotLightEXT*, CNA_Matrix*);
typedef CNA_Result (*CubeFaceViewFn)(CNA_CubeMapFace, const CNA_Vector3*, CNA_Matrix*);
typedef CNA_Result (*CubeFaceProjectionFn)(float, CNA_Matrix*);

/* --- the engine layer's compute path ---------------------------------------------------------- */
/*
 * Storage buffers, compute shaders and GPU timers. The handle typedefs in `engine_layer.h` are all
 * `CNA_Handle`, so several of these reuse the generic pointer types above; the ones written out
 * here are the shapes nothing else in this bridge has.
 */
typedef CNA_Result (*StorageBufferCreateFn)(CNA_Handle, uint64_t, CNA_StorageBufferHandle*);
typedef CNA_Result (*StorageBufferCreateTypedFn)(
  CNA_Handle, uint64_t, uint64_t, CNA_StorageBufferHandle*);
typedef CNA_Result (*StorageBufferSetBytesFn)(CNA_StorageBufferHandle, const void*, uint64_t);
typedef CNA_Result (*StorageBufferGetBytesFn)(CNA_StorageBufferHandle, void*, uint64_t);
typedef CNA_Result (*StorageBufferSetElementsFn)(
  CNA_StorageBufferHandle, const void*, uint64_t, uint64_t);
typedef CNA_Result (*StorageBufferGetElementsFn)(
  CNA_StorageBufferHandle, void*, uint64_t, uint64_t);
typedef CNA_Result (*ComputeShaderCreateFn)(CNA_Handle, CNA_StringView, CNA_ComputeShaderHandle*);
typedef CNA_Result (*ComputeShaderUniformIntFn)(CNA_ComputeShaderHandle, CNA_StringView, int32_t);
typedef CNA_Result (*ComputeShaderUniformFloatFn)(CNA_ComputeShaderHandle, CNA_StringView, float);
typedef CNA_Result (*ComputeShaderBindBufferFn)(
  CNA_ComputeShaderHandle, int32_t, CNA_StorageBufferHandle);
typedef CNA_Result (*ComputeShaderBindTextureFn)(
  CNA_ComputeShaderHandle, int32_t, CNA_StringView, CNA_Handle);
typedef CNA_Result (*ComputeShaderBindImageFn)(
  CNA_ComputeShaderHandle, int32_t, CNA_Handle, CNA_GraphicsImageAccess);
typedef CNA_Result (*ComputeShaderDispatchFn)(
  CNA_ComputeShaderHandle, int32_t, int32_t, int32_t);
typedef CNA_Result (*ComputeShaderBarrierFn)(CNA_ComputeShaderHandle, CNA_GraphicsMemoryBarrier);
typedef CNA_Result (*GpuTimerDoubleOutFn)(CNA_GpuTimerHandle, double*);
typedef CNA_Result (*GraphicsCapabilityFn)(CNA_Handle, CNA_GraphicsCapability, CNA_Bool*);
typedef CNA_Result (*PresentationParametersInitFn)(CNA_PresentationParameters*);
typedef CNA_Result (*StandaloneDeviceCreateFn)(
  uint32_t, uint32_t, const CNA_PresentationParameters*, CNA_Handle*);
typedef CNA_Result (*DeviceAxisI32OutFn)(CNA_Handle, int32_t, int32_t*);

/* --- the extended device layer ---------------------------------------------------------------- */
typedef CNA_Result (*DevicesLocaleCopyFn)(CNA_Handle, uint64_t, char*, uint64_t, uint64_t*);
typedef CNA_Result (*DevicesIndexSizeFn)(CNA_Handle, uint64_t, uint64_t*);
typedef CNA_Result (*DevicesCameraInfoFn)(CNA_Handle, uint64_t, CNA_CameraDeviceInfo*);
typedef CNA_Result (*DevicesCameraInfoInitFn)(CNA_CameraDeviceInfo*);
typedef CNA_Result (*DevicesClipboardFn)(CNA_Handle, CNA_StringView, CNA_Bool*);
typedef CNA_Result (*CameraStateOutFn)(CNA_CameraHandle, CNA_CameraState*);
typedef CNA_Result (*CameraSetStateFn)(CNA_CameraHandle, CNA_CameraState);
typedef CNA_Result (*CameraAcquireFn)(CNA_CameraHandle, CNA_Handle, CNA_Bool*);
typedef CNA_Result (*CameraSetFrameFn)(
  CNA_CameraHandle, int32_t, int32_t, const CNA_Color*, uint64_t);

/* --- gamer services: the dispatcher's lifetime and the Guide's state -------------------------- */
typedef CNA_Result (*GamerServicesVoidFn)(void);
typedef CNA_Result (*GamerServicesU64InFn)(uint64_t);
typedef CNA_Result (*GuideBoolOutFn)(CNA_Bool*);
typedef CNA_Result (*GuideVoidFn)(void);
typedef CNA_Result (*GuideSizeFn)(uint64_t*);
typedef CNA_Result (*GuideCopyFn)(char*, uint64_t, uint64_t*);
typedef CNA_Result (*GuideI32OutFn)(int32_t*);
typedef CNA_Result (*GuideI32InFn)(int32_t);
typedef CNA_Result (*GuideBeginMessageBoxFn)(
  CNA_PlayerIndex, CNA_StringView, CNA_StringView, const CNA_StringView*, uint64_t, int32_t,
  CNA_MessageBoxIcon, CNA_GamerAsyncCallback, void*);
typedef CNA_Result (*GuideEndMessageBoxFn)(CNA_Bool*, int32_t*);
typedef CNA_Result (*GuideBeginKeyboardInputFn)(
  CNA_PlayerIndex, CNA_StringView, CNA_StringView, CNA_StringView, CNA_Bool,
  CNA_GamerAsyncCallback, void*);

/* --- sensors ---------------------------------------------------------------------------------- */
/*
 * `display.h` publishes neither a version macro nor an `_init` route for its three versioned
 * descriptors, so the adapter's own convention applies: version 1, declared once in
 * tools/cna-abi/contract.json rather than repeated as a bare literal at each call site.
 */
#define CNA_TS_ADAPTER_STRUCT_VERSION UINT32_C(1)

typedef CNA_Result (*AdapterCountFn)(CNA_Handle, uint64_t*);
typedef CNA_Result (*AdapterInfoFn)(CNA_Handle, uint32_t, CNA_GraphicsAdapterInfo*);
typedef CNA_Result (*AdapterModeFn)(CNA_Handle, uint32_t, CNA_DisplayMode*);
typedef CNA_Result (*AdapterModeCountFn)(
  CNA_Handle, uint32_t, CNA_Bool, CNA_SurfaceFormat, uint64_t*);
typedef CNA_Result (*AdapterCopyModesFn)(
  CNA_Handle, uint32_t, CNA_Bool, CNA_SurfaceFormat, CNA_DisplayMode*, uint64_t, uint64_t*);
typedef CNA_Result (*AdapterMonitorFn)(CNA_Handle, uint32_t, CNA_NativeHandleValue*);
typedef CNA_Result (*AdapterProfileFn)(CNA_Handle, uint32_t, CNA_GraphicsProfile, CNA_Bool*);
typedef CNA_Result (*AdapterQueryFormatFn)(
  CNA_Handle, uint32_t, CNA_GraphicsProfile, CNA_SurfaceFormat, CNA_DepthFormat, int32_t,
  CNA_GraphicsFormatSelection*);
typedef CNA_Result (*AdapterPreferencesFn)(CNA_Handle, uint32_t, CNA_Bool, CNA_Bool);
typedef CNA_Result (*CompassReadingInitFn)(CNA_CompassReading*);
typedef CNA_Result (*GyroscopeReadingInitFn)(CNA_GyroscopeReading*);
typedef CNA_Result (*MotionReadingInitFn)(CNA_MotionReading*);
typedef CNA_Result (*CompassReadingFn)(CNA_CompassHandle, CNA_CompassReading*);
typedef CNA_Result (*GyroscopeReadingFn)(CNA_GyroscopeHandle, CNA_GyroscopeReading*);
typedef CNA_Result (*MotionReadingFn)(CNA_MotionHandle, CNA_MotionReading*);
typedef CNA_Result (*CompassInjectFn)(CNA_CompassHandle, const CNA_CompassReading*);
typedef CNA_Result (*MotionInjectFn)(CNA_MotionHandle, const CNA_MotionReading*);
typedef CNA_Result (*GyroscopeInjectFn)(CNA_GyroscopeHandle, float, float, float);
typedef CNA_Result (*CompassTestBackendFn)(CNA_CompassHandle, CNA_Bool, CNA_Bool);
typedef CNA_Result (*MotionTestBackendFn)(CNA_MotionHandle, CNA_Bool, CNA_Bool, CNA_Bool);
typedef CNA_Result (*GyroscopeSetSupportedFn)(CNA_GyroscopeHandle, CNA_Bool);
typedef CNA_Result (*AccelerometerCreateFn)(CNA_Handle, CNA_AccelerometerHandle*);
typedef CNA_Result (*AccelerometerReadingFn)(CNA_AccelerometerHandle, CNA_AccelerometerReading*);
typedef CNA_Result (*AccelerometerTicksInFn)(CNA_AccelerometerHandle, int64_t);

typedef struct Api {
  GetAbiVersionFn get_abi_version;
  PbrMaterialInitFn pbr_material_init;
  RenderPipelineSettingsInitFn render_pipeline_settings_init;
  RenderPipelineCreateFn render_pipeline_create;
  RenderPipelineHandleFn render_pipeline_destroy;
  RenderPipelineResizeFn render_pipeline_resize;
  RenderPipelineBeginFn render_pipeline_begin;
  RenderPipelineHandleFn render_pipeline_end;
  RenderPipelinePassCountFn render_pipeline_pass_count;
  RenderPipelineMemoryFn render_pipeline_memory;
  RenderPipelineStatisticsFn render_pipeline_statistics;
  RenderTargetSubscribeFn render_target_subscribe_content_lost;
  RenderTargetUnsubscribeFn render_target_unsubscribe_content_lost;
  VertexBufferSubscribeFn vertex_buffer_subscribe_content_lost;
  VertexBufferUnsubscribeFn vertex_buffer_unsubscribe_content_lost;
  IndexBufferSubscribeFn index_buffer_subscribe_content_lost;
  IndexBufferUnsubscribeFn index_buffer_unsubscribe_content_lost;
  U32OutFn platform_get_current;
  BoolOutFn platform_get_is_apple;
  BoolOutFn platform_get_is_mobile;
  SizeOutFn platform_name_size;
  CopyTextFn platform_copy_name;
  U32OutFn desktop_os_get_current;
  U32ToU32Fn backend_get_category;
  U32SizeOutFn backend_category_name_size;
  U32CopyTextFn backend_category_copy_name;
  U32ToU32Fn backend_get_maturity;
  U32SizeOutFn backend_maturity_name_size;
  U32CopyTextFn backend_maturity_copy_name;
  U32InFn renderer_set_preferred;
  StringViewInFn renderer_set_preferred_by_name;
  U32OutFn renderer_get_selected;
  U32OutFn renderer_get_active;
  BoolOutFn renderer_get_is_latched;
  SizeOutFn renderer_available_count;
  RendererListCopyFn renderer_copy_available;
  U32ToBoolFn renderer_get_is_available;
  RendererChainFn renderer_set_fallback_chain;
  BoolInFn renderer_set_automatic_fallback;
  BoolOutFn renderer_get_automatic_fallback;
  SizeOutFn renderer_fallback_count;
  RendererFallbackAtFn renderer_fallback_at;
  U64SizeOutFn renderer_fallback_message_size;
  U64CopyTextFn renderer_fallback_copy_message;
  U32SizeOutFn renderer_fallback_reason_name_size;
  U32CopyTextFn renderer_fallback_reason_copy_name;
  RendererParseFn renderer_try_parse_name;
  U32OutFn renderer_get_current_type;
  SizeOutFn renderer_current_name_size;
  CopyTextFn renderer_copy_current_name;
  U32OutFn logger_get_minimum_level;
  U32InFn logger_set_minimum_level;
  LoggerLogFn logger_log;
  BoolOutFn graphics_ext_is_available;
  ErrorGetLastMessageSizeFn error_get_last_message_size;
  ErrorCopyLastMessageFn error_copy_last_message;
  GameCreateFn game_create;
  GameSetFrameHooksFn game_set_frame_hooks;
  GameHandleFn game_run;
  GameHandleFn game_run_one_frame;
  GameHandleFn game_request_exit;
  GameHandleFn game_destroy;
  GameHandleFn framework_dispatcher_update;
  GraphicsManagerCreateFn manager_create;
  GraphicsManagerSetU32Fn manager_set_graphics_profile;
  GraphicsManagerSetBoolFn manager_set_is_full_screen;
  GraphicsManagerSetBoolFn manager_set_prefer_multi_sampling;
  GraphicsManagerSetU32Fn manager_set_back_buffer_format;
  GraphicsManagerSetI32Fn manager_set_back_buffer_width;
  GraphicsManagerSetI32Fn manager_set_back_buffer_height;
  GraphicsManagerSetU32Fn manager_set_depth_stencil_format;
  GraphicsManagerSetBoolFn manager_set_vertical_retrace;
  GraphicsManagerSetU32Fn manager_set_orientations;
  GameHandleFn manager_apply_changes;
  GameHandleFn manager_toggle_full_screen;
  GameHandleFn manager_create_device;
  GraphicsManagerBeginDrawFn manager_begin_draw;
  GameHandleFn manager_end_draw;
  GameHandleFn manager_destroy;
  GraphicsManagerGetDeviceFn manager_get_device;
  GraphicsClearFn graphics_clear;
  GameHandleFn graphics_present;
  GraphicsGetRendererInfoFn graphics_get_renderer_info;
  GraphicsRendererNameSizeFn graphics_renderer_name_size;
  GraphicsCopyRendererNameFn graphics_copy_renderer_name;
  TextureCreateFn texture_create;
  TextureInfoFn texture_get_info;
  TextureFromEncodedFn texture_create_from_encoded;
  TextureSetDataFn texture_set_data;
  TextureGetDataFn texture_get_data;
  TextureEncodedCountFn texture_encoded_count;
  TextureEncodedCopyFn texture_encoded_copy;
  GameHandleFn texture_destroy;
  SpriteBatchCreateFn sprite_batch_create;
  SpriteBatchBeginFn sprite_batch_begin;
  SpriteBatchSubmitScaledFn sprite_batch_submit_scaled;
  GameHandleFn sprite_batch_end;
  GameHandleFn sprite_batch_destroy;
  VertexDeclarationCreateFn vertex_declaration_create;
  GameHandleFn vertex_declaration_destroy;
  VertexBufferCreateFn vertex_buffer_create;
  GameHandleFn vertex_buffer_destroy;
  VertexBufferSetRawFn vertex_buffer_set_raw;
  VertexBufferGetRawFn vertex_buffer_get_raw;
  IndexBufferCreateFn index_buffer_create;
  GameHandleFn index_buffer_destroy;
  IndexBufferSetFn index_buffer_set;
  IndexBufferSetAtFn index_buffer_set_at;
  IndexBufferGetFn index_buffer_get;
  IndexBufferInfoFn index_buffer_get_info;
  GraphicsDeviceStatusFn graphics_get_status;
  GraphicsSetColorFn graphics_set_blend_factor;
  GraphicsSetBlendStateFn graphics_set_blend_state;
  GraphicsSetDepthStencilStateFn graphics_set_depth_stencil_state;
  GraphicsSetRasterizerStateFn graphics_set_rasterizer_state;
  GraphicsSetSamplerStateFn graphics_set_sampler_state;
  GraphicsSetTextureFn graphics_set_texture;
  GraphicsSetI32Fn graphics_set_multi_sample_mask;
  GraphicsSetI32Fn graphics_set_reference_stencil;
  GraphicsSetRectangleFn graphics_set_scissor_rectangle;
  GraphicsSetViewportFn graphics_set_viewport;
  GraphicsSetVertexBuffersFn graphics_set_vertex_buffers;
  GraphicsSetIndexBufferFn graphics_set_index_buffer;
  GraphicsDrawPrimitivesFn graphics_draw_primitives;
  GraphicsDrawIndexedFn graphics_draw_indexed;
  GraphicsDrawInstancedFn graphics_draw_instanced;
  GraphicsDrawUserFn graphics_draw_user;
  GraphicsDrawUserIndexedFn graphics_draw_user_indexed;
  SpriteBatchBeginStatesFn sprite_batch_begin_states;
  SpriteBatchBeginEffectFn sprite_batch_begin_effect;
  VertexBufferSetDataFn vertex_buffer_set_data;
  VertexBufferSetRawAtFn vertex_buffer_set_raw_at;
  VertexBufferSetRawAtWithOptionsFn vertex_buffer_set_raw_at_with_options;
  VertexBufferInfoFn vertex_buffer_get_info;
  Texture3DCreateFn texture3d_create;
  Texture3DInfoFn texture3d_get_info;
  Texture3DSetFn texture3d_set;
  Texture3DGetFn texture3d_get;
  GameHandleFn texture3d_destroy;
  TextureCubeCreateFn texturecube_create;
  TextureCubeInfoFn texturecube_get_info;
  TextureCubeSetFn texturecube_set;
  TextureCubeGetFn texturecube_get;
  GameHandleFn texturecube_destroy;
  RenderTarget2DCreateFn render_target2d_create;
  RenderTargetCubeCreateFn render_target_cube_create;
  RenderTargetInfoFn render_target_get_info;
  GraphicsSetRenderTargetsFn graphics_set_render_targets;
  GameHandleFn render_target_destroy;
  HandleHandleOutFn occlusion_create;
  GameHandleFn occlusion_begin;
  GameHandleFn occlusion_end;
  BoolGetFn occlusion_get_complete;
  HandleI32OutFn occlusion_get_pixel_count;
  GameHandleFn occlusion_destroy;
  EffectCreateFn effect_create_empty;
  EffectCreateCompiledFn effect_create_compiled;
  EffectCloneFn effect_clone;
  EffectHandleFn effect_destroy;
  EffectHandleFn effect_apply;
  EffectGetHandleFn effect_get_techniques;
  EffectGetHandleFn effect_get_current_technique;
  EffectSetHandleFn effect_set_current_technique;
  GameHandleFn effect_technique_collection_destroy;
  HandleU64OutFn effect_technique_collection_get_count;
  HandleIndexHandleOutFn effect_technique_collection_get_at;
  GameHandleFn effect_technique_destroy;
  HandleU64OutFn effect_technique_get_name_size;
  HandleCopyStringFn effect_technique_copy_name;
  GameU32OutFn effect_technique_get_index;
  HandleHandleOutFn effect_technique_get_passes;
  GameHandleFn effect_pass_collection_destroy;
  HandleU64OutFn effect_pass_collection_get_count;
  HandleIndexHandleOutFn effect_pass_collection_get_at;
  GameHandleFn effect_pass_destroy;
  HandleU64OutFn effect_pass_get_name_size;
  HandleCopyStringFn effect_pass_copy_name;
  GameHandleFn effect_pass_apply;
  EffectCreateFn basic_effect_create;
  EffectCreateFn alpha_test_effect_create;
  EffectCreateFn dual_texture_effect_create;
  EffectCreateFn environment_map_effect_create;
  EffectCreateFn skinned_effect_create;
  EffectMatrixFn effect_set_world;
  EffectMatrixFn effect_set_view;
  EffectMatrixFn effect_set_projection;
  EffectVector3Fn effect_set_fog_color;
  EffectBoolFn effect_set_fog_enabled;
  EffectFloatFn effect_set_fog_start;
  EffectFloatFn effect_set_fog_end;
  EffectVector3Fn effect_set_ambient_color;
  EffectBoolFn effect_set_lighting_enabled;
  EffectLightOutFn effect_get_directional_light;
  GameHandleFn directional_light_destroy;
  LightVector3Fn directional_light_set_diffuse_color;
  LightVector3Fn directional_light_set_direction;
  LightVector3Fn directional_light_set_specular_color;
  LightBoolFn directional_light_set_enabled;
  EffectBoolFn basic_effect_set_vertex_color_enabled;
  EffectBoolFn basic_effect_set_prefer_per_pixel_lighting;
  EffectVector3Fn basic_effect_set_diffuse_color;
  EffectVector3Fn basic_effect_set_emissive_color;
  EffectVector3Fn basic_effect_set_specular_color;
  EffectFloatFn basic_effect_set_specular_power;
  EffectFloatFn basic_effect_set_alpha;
  EffectBoolFn basic_effect_set_texture_enabled;
  EffectSetHandleFn basic_effect_set_texture;
  EffectVector3Fn alpha_test_effect_set_diffuse_color;
  EffectFloatFn alpha_test_effect_set_alpha;
  EffectSetHandleFn alpha_test_effect_set_texture;
  EffectBoolFn alpha_test_effect_set_vertex_color_enabled;
  EffectU32Fn alpha_test_effect_set_alpha_function;
  EffectI32Fn alpha_test_effect_set_reference_alpha;
  EffectVector3Fn dual_texture_effect_set_diffuse_color;
  EffectFloatFn dual_texture_effect_set_alpha;
  EffectIndexHandleFn dual_texture_effect_set_texture;
  EffectBoolFn dual_texture_effect_set_vertex_color_enabled;
  EffectVector3Fn environment_map_effect_set_diffuse_color;
  EffectVector3Fn environment_map_effect_set_emissive_color;
  EffectFloatFn environment_map_effect_set_alpha;
  EffectSetHandleFn environment_map_effect_set_texture;
  EffectSetHandleFn environment_map_effect_set_environment_map;
  EffectFloatFn environment_map_effect_set_amount;
  EffectVector3Fn environment_map_effect_set_specular;
  EffectFloatFn environment_map_effect_set_fresnel_factor;
  EffectVector3Fn skinned_effect_set_diffuse_color;
  EffectVector3Fn skinned_effect_set_emissive_color;
  EffectVector3Fn skinned_effect_set_specular_color;
  EffectFloatFn skinned_effect_set_specular_power;
  EffectFloatFn skinned_effect_set_alpha;
  EffectBoolFn skinned_effect_set_prefer_per_pixel_lighting;
  EffectSetHandleFn skinned_effect_set_texture;
  EffectI32Fn skinned_effect_set_weights_per_vertex;
  EffectMatricesFn skinned_effect_set_bone_transforms;
  EffectBoolFn skinned_effect_set_vertex_color_enabled;
  KeyboardGetStateFn keyboard_get_state;
  MouseGetStateFn mouse_get_state;
  MouseSetPositionFn mouse_set_position;
  WindowGetFn mouse_get_window;
  WindowSetFn mouse_set_window;
  GamePadGetStateFn gamepad_get_state;
  GamePadGetCapabilitiesFn gamepad_get_capabilities;
  GamePadSetVibrationFn gamepad_set_vibration;
  TouchGetStateFn touch_get_state;
  TouchGetCapabilitiesFn touch_get_capabilities;
  BoolGetFn gesture_is_available;
  GestureReadFn gesture_read;
  WindowGetFn touch_get_window;
  WindowSetFn touch_set_window;
  SoundEffectCreatePcmRangeFn sound_effect_create_pcm_range;
  SoundEffectCreateEncodedFn sound_effect_create_encoded;
  HandleInt64OutFn sound_effect_get_duration;
  HandleU64OutFn sound_effect_get_name_size;
  HandleCopyStringFn sound_effect_copy_name;
  HandleStringViewFn sound_effect_set_name;
  HandleHandleOutFn sound_effect_create_instance;
  SoundEffectPlaySettingsFn sound_effect_play_settings;
  GameHandleFn sound_effect_destroy;
  HandleFloatOutFn sound_effect_get_master_volume;
  HandleFloatFn sound_effect_set_master_volume;
  HandleFloatOutFn sound_effect_get_distance_scale;
  HandleFloatFn sound_effect_set_distance_scale;
  HandleFloatOutFn sound_effect_get_doppler_scale;
  HandleFloatFn sound_effect_set_doppler_scale;
  HandleFloatOutFn sound_effect_get_speed_of_sound;
  HandleFloatFn sound_effect_set_speed_of_sound;
  GameHandleFn sound_instance_play;
  GameHandleFn sound_instance_pause;
  GameHandleFn sound_instance_resume;
  SoundEffectInstanceStopFn sound_instance_stop;
  SoundEffectInstanceInfoFn sound_instance_get_info;
  HandleFloatFn sound_instance_set_volume;
  HandleFloatFn sound_instance_set_pitch;
  HandleFloatFn sound_instance_set_pan;
  HandleBoolFn sound_instance_set_looped;
  SoundEffectApply3DMultiFn sound_instance_apply_3d_multi;
  GameHandleFn sound_instance_destroy;
  DynamicSoundCreateFn dynamic_sound_create;
  HandleI32OutFn dynamic_sound_get_pending;
  DynamicSoundSubmitFn dynamic_sound_submit;
  HandleU64OutFn microphone_get_count;
  GameDefaultMicrophoneFn microphone_get_default;
  GameIndexU64OutFn microphone_get_name_size;
  GameIndexCopyStringFn microphone_copy_name;
  GameIndexInt64OutFn microphone_get_buffer_duration;
  GameIndexInt64Fn microphone_set_buffer_duration;
  GameIndexBoolOutFn microphone_get_is_headset;
  GameIndexI32OutFn microphone_get_sample_rate;
  GameIndexU32OutFn microphone_get_state;
  GameIndexFn microphone_start;
  GameIndexFn microphone_stop;
  GameIndexBytesFn microphone_get_data;
  HandleStringHandleOutFn audio_engine_create;
  AudioEngineCreateRendererFn audio_engine_create_renderer;
  GameHandleFn audio_engine_destroy;
  BoolGetFn audio_engine_get_disposed;
  HandleU64OutFn audio_engine_get_renderer_count;
  HandleIndexU64OutFn audio_engine_get_renderer_friendly_size;
  HandleIndexCopyStringFn audio_engine_copy_renderer_friendly;
  HandleIndexU64OutFn audio_engine_get_renderer_id_size;
  HandleIndexCopyStringFn audio_engine_copy_renderer_id;
  HandleStringFloatOutFn audio_engine_get_global;
  HandleStringFloatFn audio_engine_set_global;
  GameHandleFn audio_engine_update;
  HandleStringHandleOutFn audio_engine_get_category;
  GameHandleFn audio_category_destroy;
  HandleU64OutFn audio_category_get_name_size;
  HandleCopyStringFn audio_category_copy_name;
  GameHandleFn audio_category_pause;
  GameHandleFn audio_category_resume;
  HandleFloatFn audio_category_set_volume;
  HandleOptionsFn audio_category_stop;
  TwoHandleBoolOutFn audio_category_equals;
  HandleI32OutFn audio_category_get_hash;
  HandleStringHandleOutFn wave_bank_create;
  WaveBankStreamingCreateFn wave_bank_create_streaming;
  GameHandleFn wave_bank_destroy;
  BoolGetFn wave_bank_get_disposed;
  BoolGetFn wave_bank_get_prepared;
  BoolGetFn wave_bank_get_in_use;
  HandleStringHandleOutFn sound_bank_create;
  GameHandleFn sound_bank_destroy;
  BoolGetFn sound_bank_get_disposed;
  BoolGetFn sound_bank_get_in_use;
  HandleStringHandleOutFn sound_bank_get_cue;
  HandleStringViewFn sound_bank_play_cue;
  SoundBankPlay3DFn sound_bank_play_cue_3d;
  GameHandleFn cue_destroy;
  CueInfoFn cue_get_info;
  HandleU64OutFn cue_get_name_size;
  HandleCopyStringFn cue_copy_name;
  CueApply3DFn cue_apply_3d;
  HandleStringFloatOutFn cue_get_variable;
  HandleStringFloatFn cue_set_variable;
  GameHandleFn cue_play;
  GameHandleFn cue_pause;
  GameHandleFn cue_resume;
  HandleOptionsFn cue_stop;
  GameU32OutFn media_source_get_count;
  GameIndexU32U32OutFn media_source_get_type;
  GameIndexU32U64OutFn media_source_get_name_size;
  GameIndexU32CopyStringFn media_source_copy_name;
  SongCreateUriFn song_create_uri;
  GameHandleFn song_destroy;
  SongCollectionCreateFn song_collection_create;
  GameHandleFn song_collection_destroy;
  MediaPlayCollectionFromFn media_player_play_collection_from;
  GameHandleFn media_player_pause;
  GameHandleFn media_player_resume;
  GameHandleFn media_player_stop;
  GameHandleFn media_player_move_next;
  GameHandleFn media_player_move_previous;
  HandleFloatFn media_player_set_volume;
  HandleBoolFn media_player_set_muted;
  HandleBoolFn media_player_set_repeating;
  HandleBoolFn media_player_set_shuffled;
  HandleBoolFn media_player_set_visualization;
  BoolGetFn media_player_get_game_control;
  HandleInt64OutFn media_player_get_position;
  VisualizationGetFn media_player_get_visualization;
  GameHandleFn media_player_update;
  HandleHandleOutFn video_player_create;
  GameHandleFn video_player_destroy;
  GameU32OutFn video_player_get_state;
  HandleInt64OutFn video_player_get_position;
  HandleBoolFn video_player_set_looped;
  HandleBoolFn video_player_set_muted;
  HandleFloatFn video_player_set_volume;
  TwoHandleFn video_player_play;
  GameHandleFn video_player_pause;
  GameHandleFn video_player_resume;
  GameHandleFn video_player_stop;
  StorageSelectFn storage_select;
  StorageSelectPlayerFn storage_select_player;
  StorageSelectSpaceFn storage_select_space;
  StorageSelectPlayerSpaceFn storage_select_player_space;
  HandleInt64OutFn storage_device_get_free_space;
  BoolGetFn storage_device_get_connected;
  HandleInt64OutFn storage_device_get_total_space;
  HandleStringViewFn storage_device_delete_container;
  GameHandleFn storage_device_destroy;
  StorageContainerOpenFn storage_container_open;
  HandleU64OutFn storage_container_get_display_name_size;
  HandleCopyStringFn storage_container_copy_display_name;
  GameHandleFn storage_container_destroy;
  HandleStringViewFn storage_container_create_directory;
  HandleStringBoolOutFn storage_container_directory_exists;
  HandleStringViewFn storage_container_delete_directory;
  HandleStringBoolOutFn storage_container_file_exists;
  HandleStringViewFn storage_container_delete_file;
  HandleStringU64OutFn storage_container_get_directory_count;
  StorageNameCopyFn storage_container_copy_directory_name;
  HandleStringU64OutFn storage_container_get_file_count;
  StorageNameCopyFn storage_container_copy_file_name;
  HandleStringHandleOutFn storage_container_create_file;
  StorageOpenFileFn storage_container_open_file;
  HandleInt64OutFn storage_stream_get_length;
  StorageStreamReadFn storage_stream_read;
  GameHandleFn storage_stream_close;
  TitleContainerReadFn title_container_read;
  BoolGetFn window_get_allow_resizing;
  HandleBoolFn window_set_allow_resizing;
  HandleRectangleOutFn window_get_client_bounds;
  GameU32OutFn window_get_orientation;
  HandleU64OutFn window_get_handle;
  HandleU64OutFn window_get_screen_name_size;
  HandleCopyStringFn window_copy_screen_name;
  HandleU64OutFn window_get_title_size;
  HandleCopyStringFn window_copy_title;
  HandleStringViewFn window_set_title;
  HandleBoolFn window_begin_screen_change;
  GameWindowEndFn window_end_screen_change;
  GameWindowSubscribeFn window_subscribe;
  GameHandleFn game_unsubscribe;

  CnbHasMagicFn cnb_has_magic;
  CnbCopyMagicFn cnb_copy_format_magic;
  CnbCrc32cFn cnb_crc32c;
  U32ToBoolFn cnb_is_compression_supported;
  U32SizeOutFn cnb_get_compression_name_size;
  U32CopyTextFn cnb_copy_compression_name;
  U32SizeOutFn cnb_get_asset_type_name_size;
  U32CopyTextFn cnb_copy_asset_type_name;
  CnbStringViewToU32Fn cnb_asset_type_id_from_name;
  U32ToBoolFn cnb_is_custom_asset_type_id;
  CnbMakeChunkIdFn cnb_make_chunk_id;
  U32SizeOutFn cnb_get_chunk_id_string_size;
  U32CopyTextFn cnb_copy_chunk_id_string;
  U32ToBoolFn cnb_is_well_formed_chunk_id;
  U32SizeOutFn cnb_get_texture_format_name_size;
  U32CopyTextFn cnb_copy_texture_format_name;
  U32ToBoolFn cnb_is_block_compressed_texture_format;
  U32ToU32Fn cnb_get_texture_format_unit_bytes;
  CnbLevelByteSizeFn cnb_get_texture_level_byte_size;
  U32ToU32Fn cnb_texture_format_to_surface_format;
  CnbDocumentParseFn cnb_document_parse;
  CnbDocumentDestroyFn cnb_document_destroy;
  CnbByteWriterCreateFn cnb_byte_writer_create;
  CnbByteWriterCreateFromBytesFn cnb_byte_writer_create_from_bytes;
  GameHandleFn cnb_byte_writer_destroy;
  CnbWriteU8Fn cnb_byte_writer_write_u8;
  CnbWriteU16Fn cnb_byte_writer_write_u16;
  CnbWriteU32Fn cnb_byte_writer_write_u32;
  CnbWriteU64Fn cnb_byte_writer_write_u64;
  HandleI32Fn cnb_byte_writer_write_i32;
  HandleFloatFn cnb_byte_writer_write_f32;
  CnbWriteF64Fn cnb_byte_writer_write_f64;
  CnbWriteStringFn cnb_byte_writer_write_string;
  CnbWriteBytesFn cnb_byte_writer_write_bytes;
  WindowSetFn cnb_byte_writer_write_zeros;
  HandleU64OutFn cnb_byte_writer_get_size;
  StorageStreamReadFn cnb_byte_writer_copy_bytes;
  StorageStreamReadFn cnb_byte_writer_take;
  CnbWriterCreateFn cnb_writer_create;
  GameHandleFn cnb_writer_destroy;
  CnbWriterMetadataFn cnb_writer_set_metadata;
  CnbWriterAddReferenceFn cnb_writer_add_external_reference;
  GameHandleFn cnb_writer_clear_external_references;
  CnbWriterAddChunkFn cnb_writer_add_chunk;
  HandleU64OutFn cnb_writer_get_schema_chunk_count;
  CnbWriterCompressionFn cnb_writer_set_compression;
  CnbWriterSetLimitsFn cnb_writer_set_limits;
  CnbWriterGetLimitsFn cnb_writer_get_limits;
  CnbReadLimitsInitFn cnb_read_limits_init;
  StorageStreamReadFn cnb_writer_build;
  CnbWriterAppendTextureFn cnb_writer_append_embedded_texture2d;
  CnbCompileCnjFn cnb_compile_cnj;
  GameHandleFn cnb_cnj_result_destroy;
  GameU32OutFn cnb_cnj_result_get_asset_type_id;
  HandleU64OutFn cnb_cnj_result_get_asset_type_name_size;
  HandleCopyStringFn cnb_cnj_result_copy_asset_type_name;
  StorageStreamReadFn cnb_cnj_result_copy_bytes;
  HandleU64OutFn cnb_cnj_result_get_absorbed_file_count;
  CnjIndexSizeFn cnb_cnj_result_get_absorbed_file_size;
  CnjIndexCopyFn cnb_cnj_result_copy_absorbed_file;
  HandleU64OutFn cnb_cnj_result_get_external_reference_count;
  CnjIndexSizeFn cnb_cnj_result_get_external_reference_size;
  CnjIndexCopyFn cnb_cnj_result_copy_external_reference;
  HandleU64OutFn cnb_document_get_origin_size;
  HandleCopyStringFn cnb_document_copy_origin;
  CnbDocumentU16OutFn cnb_document_get_container_major;
  CnbDocumentU16OutFn cnb_document_get_container_minor;
  GameU32OutFn cnb_document_get_asset_type_id;
  GameU32OutFn cnb_document_get_asset_schema_version;
  HandleU64OutFn cnb_document_get_chunk_count;
  CnbDocumentChunkFn cnb_document_get_chunk;
  CnbDocumentCopyChunkFn cnb_document_copy_chunk_data;
  CnbDocumentFindAllFn cnb_document_find_all;
  CnbDocumentMandatoryFn cnb_document_require_mandatory;
  CnbDocumentMetadataFn cnb_document_get_metadata;
  HandleU64OutFn cnb_document_get_metadata_asset_type_name_size;
  HandleCopyStringFn cnb_document_copy_metadata_asset_type_name;
  HandleU64OutFn cnb_document_get_metadata_content_name_size;
  HandleCopyStringFn cnb_document_copy_metadata_content_name;
  HandleU64OutFn cnb_document_get_external_reference_count;
  CnbDocumentExternalFn cnb_document_get_external_reference;
  CnbDocumentIndexSizeFn cnb_document_get_external_reference_name_size;
  CnbDocumentIndexCopyTextFn cnb_document_copy_external_reference_name;
  CnbDecodeTextureFn cnb_decode_texture2d;
  CnbTextureDataDestroyFn cnb_texture_data_destroy;
  CnbTextureInfoFn cnb_texture_data_get_info;
  CnbTextureLevelDimensionsFn cnb_texture_data_get_level_dimensions;
  CnbTextureRepresentationFormatFn cnb_texture_data_get_representation_format;
  CnbTextureLevelCountFn cnb_texture_data_get_level_count;
  CnbTextureCopyLevelFn cnb_texture_data_copy_level;
  CnbTextureCreateFn cnb_texture_data_create;
  CnbTextureCreateRgba8Fn cnb_texture_data_create_rgba8;
  CnbTextureAddRepresentationFn cnb_texture_data_add_representation;
  CnbTextureSetLevelFn cnb_texture_data_set_level;
  CnbEncodeTextureFn cnb_encode_texture2d;
  CnbDecodeSpriteFontFn cnb_decode_sprite_font;
  CnbSpriteFontCreateFn cnb_sprite_font_data_create;
  CnbSpriteFontDestroyFn cnb_sprite_font_data_destroy;
  CnbSpriteFontInfoFn cnb_sprite_font_data_get_info;
  CnbSpriteFontSetInfoFn cnb_sprite_font_data_set_info;
  CnbSpriteFontGetGlyphFn cnb_sprite_font_data_get_glyph;
  CnbSpriteFontAddGlyphFn cnb_sprite_font_data_add_glyph;
  CnbSpriteFontSetAtlasFn cnb_sprite_font_data_set_atlas;
  CnbSpriteFontCopyAtlasFn cnb_sprite_font_data_copy_atlas;
  CnbEncodeSpriteFontFn cnb_encode_sprite_font;
  TextInputSubscribeInputFn text_input_subscribe_input;
  TextInputSubscribeEditingFn text_input_subscribe_editing;
  TextInputSubscribeCandidatesFn text_input_subscribe_candidates;
  TextInputUnsubscribeFn text_input_unsubscribe;
  TextInputRaiseInputFn text_input_raise_input;
  TextInputRaiseEditingFn text_input_raise_editing;
  TextInputRaiseCandidatesFn text_input_raise_candidates;
  GameHandleFn text_input_start;
  TextInputStartWithTypeFn text_input_start_with_type;
  GameHandleFn text_input_stop;
  BoolGetFn text_input_is_active;
  BoolGetFn text_input_is_screen_keyboard_shown;
  TextInputSetRectangleFn text_input_set_rectangle;
  GameHandleFn text_input_reset_for_tests;
  MouseCursorStockFn mouse_cursor_get_stock;
  MouseCursorFromTextureFn mouse_cursor_create_from_texture;
  MouseCursorHandleFn mouse_cursor_dispose;
  MouseCursorHandleFn mouse_cursor_destroy;
  MouseSetCursorFn mouse_set_cursor;
  JoystickInfoInitFn joystick_info_init;
  JoystickCapabilitiesInitFn joystick_capabilities_init;
  HapticCapabilitiesInitFn haptic_capabilities_init;
  JoystickCountFn joysticks_get_count;
  JoystickInfoAtFn joysticks_get_info_at;
  GameU32IndexSizeFn joysticks_get_name_size_at;
  GameU32IndexCopyTextFn joysticks_copy_name_at;
  JoystickCapabilitiesFn joysticks_get_capabilities;
  GameU32IndexSizeFn joysticks_get_capabilities_name_size;
  GameU32IndexCopyTextFn joysticks_copy_capabilities_name;
  GameU32IndexSizeFn joysticks_get_capabilities_guid_size;
  GameU32IndexCopyTextFn joysticks_copy_capabilities_guid;
  JoystickCaptureStateFn joysticks_capture_state;
  JoystickStateCountFn joystick_state_get_axis_count;
  JoystickStateCopyAxesFn joystick_state_copy_axes;
  JoystickStateCountFn joystick_state_get_button_count;
  JoystickStateCopyButtonsFn joystick_state_copy_buttons;
  JoystickStateCountFn joystick_state_get_hat_count;
  JoystickStateCopyHatsFn joystick_state_copy_hats;
  JoystickStateCountFn joystick_state_get_ball_count;
  JoystickStateCopyBallsFn joystick_state_copy_balls;
  JoystickStateDestroyFn joystick_state_destroy;
  JoystickCountFn haptics_get_count;
  GameU32IndexU32OutFn haptics_get_id_at;
  GameU32IndexSizeFn haptics_get_name_size_at;
  GameU32IndexCopyTextFn haptics_copy_name_at;
  GameIndexHandleOutFn haptics_open;
  GameIndexHandleOutFn haptics_open_from_joystick;
  GameIdBoolOutFn haptics_get_is_joystick_haptic;
  HandleBoolOutFn haptic_device_get_is_open;
  HapticCapabilitiesFn haptic_device_get_capabilities;
  HandleU64OutFn haptic_device_get_name_size;
  HandleCopyStringFn haptic_device_copy_name;
  HandleBoolOutFn haptic_device_init_rumble;
  HapticPlayRumbleFn haptic_device_play_rumble;
  HandleBoolOutFn haptic_device_stop_rumble;
  HapticSetGainFn haptic_device_set_gain;
  GameHandleFn haptic_device_dispose;
  GameHandleFn haptic_device_destroy;
  CnbImportImageFn cnb_import_image_as_texture2d;
  CnbImportDdsFn cnb_import_dds_as_texture_cube;
  CnbImportWavFn cnb_import_wav_as_sound_effect;
  CurveCreateFn curve_create;
  CurveDestroyFn curve_destroy;
  CurveGetKeysFn curve_get_keys;
  CurveGetLoopFn curve_get_pre_loop;
  CurveSetLoopFn curve_set_pre_loop;
  CurveGetLoopFn curve_get_post_loop;
  CurveSetLoopFn curve_set_post_loop;
  CurveGetIsConstantFn curve_get_is_constant;
  CurveKeyCollectionDestroyFn curve_key_collection_destroy;
  CurveKeyCollectionCountFn curve_key_collection_get_count;
  CurveKeyCollectionGetFn curve_key_collection_get;
  CurveKeyCollectionAddFn curve_key_collection_add;
  CurveKeyInitFullFn curve_key_init_full;
  CnbEncodeCurveFn cnb_encode_curve;
  CnbDecodeCurveFn cnb_decode_curve;
  CnbEncodeAnimationClipFn cnb_encode_animation_clip;
  CnbDecodeAnimationClipFn cnb_decode_animation_clip;
  CnbAnimationClipDestroyFn cnb_animation_clip_destroy;
  CnbAnimationClipGetFn cnb_animation_clip_get;
  CnbAnimationClipGetTrackFn cnb_animation_clip_get_track;
  CnbAnimationClipCopyKeyframesFn cnb_animation_clip_copy_keyframes;
  CnbSoundEffectCreateFn cnb_sound_effect_data_create;
  CnbSoundEffectDestroyFn cnb_sound_effect_data_destroy;
  CnbSoundEffectInfoFn cnb_sound_effect_data_get_info;
  CnbSoundEffectCopySamplesFn cnb_sound_effect_data_copy_samples;
  CnbEncodeSoundEffectFn cnb_encode_sound_effect;
  CnbDecodeSoundEffectFn cnb_decode_sound_effect;
  CnbDecodeWavFn cnb_decode_wav_as_sound_effect;
  CnbEncodeSongFn cnb_encode_song;
  CnbDecodeSongDurationFn cnb_decode_song_duration;
  CnbDocumentTextSizeFn cnb_decode_song_name_size;
  CnbDocumentTextCopyFn cnb_decode_song_name;
  CnbDocumentTextSizeFn cnb_decode_song_stream_reference_size;
  CnbDocumentTextCopyFn cnb_decode_song_stream_reference;
  CnbEncodeVideoFn cnb_encode_video;
  CnbDecodeVideoFn cnb_decode_video;
  CnbDocumentTextSizeFn cnb_decode_video_stream_reference_size;
  CnbDocumentTextCopyFn cnb_decode_video_stream_reference;
  CnbModelCreateFn cnb_model_create;
  CnbModelDestroyFn cnb_model_destroy;
  CnbModelSetFlagsFn cnb_model_set_flags;
  CnbModelInfoFn cnb_model_get_info;
  CnbModelAddBoneFn cnb_model_add_bone;
  CnbModelGetBoneFn cnb_model_get_bone;
  CnbModelIndexSizeFn cnb_model_get_bone_name_size;
  CnbModelIndexCopyTextFn cnb_model_copy_bone_name;
  CnbModelAddPartFn cnb_model_add_part;
  CnbModelGetPartFn cnb_model_get_part;
  CnbModelIndexSizeFn cnb_model_get_part_name_size;
  CnbModelIndexCopyTextFn cnb_model_copy_part_name;
  CnbModelIndexSizeFn cnb_model_get_part_external_effect_size;
  CnbModelIndexCopyTextFn cnb_model_copy_part_external_effect;
  CnbModelSetPartBytesFn cnb_model_set_part_vertex_bytes;
  CnbModelIndexCopyBytesFn cnb_model_copy_part_vertex_bytes;
  CnbModelSetPartBytesFn cnb_model_set_part_index_bytes;
  CnbModelIndexCopyBytesFn cnb_model_copy_part_index_bytes;
  CnbModelGetMaterialFn cnb_model_get_material;
  CnbModelSetMaterialFn cnb_model_set_material;
  CnbModelMaterialTextureSizeFn cnb_model_get_material_texture_size;
  CnbModelMaterialTextureCopyFn cnb_model_copy_material_texture;
  CnbModelSetMaterialTextureFn cnb_model_set_material_texture;
  CnbModelAddMeshFn cnb_model_add_mesh;
  CnbModelGetMeshFn cnb_model_get_mesh;
  CnbModelIndexSizeFn cnb_model_get_mesh_name_size;
  CnbModelIndexCopyTextFn cnb_model_copy_mesh_name;
  CnbModelCopyMeshPartsFn cnb_model_copy_mesh_part_indices;
  CnbModelSetSkeletonFn cnb_model_set_skeleton;
  CnbModelGetSkeletonFn cnb_model_get_skeleton;
  CnbModelCopyHierarchyFn cnb_model_copy_skeleton_hierarchy;
  CnbModelCopySkeletonMatricesFn cnb_model_copy_skeleton_matrices;
  CnbModelAddLightFn cnb_model_add_light;
  CnbModelGetLightFn cnb_model_get_light;
  CnbEncodeModelFn cnb_encode_model;
  CnbDecodeModelFn cnb_decode_model;

  PostProcessContextInitFn post_process_context_init;
  PostProcessPassCreateFn blit_pass_create;
  PostProcessPassCreateFn bloom_pass_create;
  PostProcessPassCreateFn tonemap_pass_create;
  PostProcessPassCreateFn fxaa_pass_create;
  PostProcessPassCreateFn ssao_pass_create;
  PostProcessPassCreateFn ssr_pass_create;
  HandleFloatOutFn bloom_get_intensity;
  HandleFloatFn bloom_set_intensity;
  HandleFloatOutFn bloom_get_threshold;
  HandleFloatFn bloom_set_threshold;
  HandleFloatOutFn tonemap_get_exposure;
  HandleFloatFn tonemap_set_exposure;
  HandleFloatOutFn tonemap_get_gamma;
  HandleFloatFn tonemap_set_gamma;
  HandleFloatOutFn tonemap_get_deband_strength;
  HandleFloatFn tonemap_set_deband_strength;
  HandleFloatOutFn fxaa_get_edge_threshold;
  HandleFloatFn fxaa_set_edge_threshold;
  HandleFloatOutFn ssao_get_radius;
  HandleFloatFn ssao_set_radius;
  HandleFloatOutFn ssao_get_intensity;
  HandleFloatFn ssao_set_intensity;
  HandleFloatOutFn ssr_get_intensity;
  HandleFloatFn ssr_set_intensity;
  HandleFloatOutFn ssr_get_max_distance;
  HandleFloatFn ssr_set_max_distance;
  HandleFloatOutFn ssr_get_thickness;
  HandleFloatFn ssr_set_thickness;
  HandleFloatOutFn ssr_get_depth_bias;
  HandleFloatFn ssr_set_depth_bias;
  HandleFloatOutFn ssr_get_edge_fade;
  HandleFloatFn ssr_set_edge_fade;
  HandleFloatOutFn ssr_get_roughness_blur;
  HandleFloatFn ssr_set_roughness_blur;
  HandleI32OutFn bloom_get_iterations;
  HandleI32Fn bloom_set_iterations;
  HandleI32OutFn ssao_get_sample_count;
  HandleI32Fn ssao_set_sample_count;
  HandleI32OutFn ssr_get_step_count;
  HandleI32Fn ssr_set_step_count;
  BoolGetFn ssao_get_half_resolution;
  HandleBoolFn ssao_set_half_resolution;
  GameU32OutFn tonemap_get_mode;
  HandleU32Fn tonemap_set_mode;
  BoolGetFn tonemap_is_deband_enabled;
  HandleBoolFn tonemap_set_deband_enabled;
  U32ToI32OutFn bloom_iterations_for_quality;
  U32ToFloatOutFn fxaa_edge_threshold_for_quality;
  U32ToI32OutFn ssao_sample_count_for_quality;
  GameHandleFn bloom_reset_targets;
  GameHandleFn ssao_reset_targets;
  PostProcessPassApplyFn post_process_pass_apply;
  HandleCopyStringFn post_process_pass_copy_name;
  PostProcessPassSupportedFn post_process_pass_is_supported;
  GameHandleFn post_process_pass_destroy;
  HandleHandleOutFn post_process_chain_create;
  GameHandleFn post_process_chain_destroy;
  TwoHandleFn post_process_chain_add_pass;
  TwoHandleFn post_process_chain_add_owned_pass;

  /* the engine layer's clustered lighting */
  ClusteredLightInitFn clustered_light_ext_init;
  ClusteredLightUsableFn clustered_light_set_is_usable;
  HandleHandleOutFn clustered_light_set_create;
  ClusteredLightAddFn clustered_light_set_add;
  PointLightInitFn point_light_ext_init;
  SpotLightInitFn spot_light_ext_init;
  ClusteredAddPointFn clustered_light_set_add_point;
  ClusteredAddSpotFn clustered_light_set_add_spot;
  ClusteredLightReplaceFn clustered_light_set_replace_at;
  HandleI32Fn clustered_light_set_remove_at;
  GameHandleFn clustered_light_set_clear;
  HandleI32OutFn clustered_light_set_get_count;
  HandleBoolOutFn clustered_light_set_is_empty;
  ClusteredLightGetAtFn clustered_light_set_get_at;
  ClusteredLightCopyFn clustered_light_set_copy_lights;
  ClusteredBoundsAtFn clustered_light_set_get_bounds_at;
  ClusteredBoundsCopyFn clustered_light_set_copy_bounds;
  GameHandleFn clustered_light_set_destroy;
  ClusteredGridCreateFn clustered_light_grid_create;
  HandleI32OutFn clustered_light_grid_get_tiles_x;
  HandleI32OutFn clustered_light_grid_get_tiles_y;
  HandleI32OutFn clustered_light_grid_get_slice_count;
  HandleI32OutFn clustered_light_grid_get_cluster_count;
  ClusteredClusterIndexFn clustered_light_grid_cluster_index;
  ClusteredSetProjectionFn clustered_light_grid_set_projection;
  HandleBoolOutFn clustered_light_grid_has_projection;
  HandleFloatOutFn clustered_light_grid_get_near_plane;
  HandleFloatOutFn clustered_light_grid_get_far_plane;
  ClusteredMatrixOutFn clustered_light_grid_get_inverse_projection;
  ClusteredSliceDistanceFn clustered_light_grid_slice_distance;
  ClusteredSliceForDistanceFn clustered_light_grid_slice_for_view_distance;
  ClusteredClusterBoundsFn clustered_light_grid_cluster_bounds;
  GameHandleFn clustered_light_grid_destroy;
  HandleHandleOutFn clustered_light_assignment_create;
  ClusteredAssignFn clustered_light_assignment_assign;
  GameHandleFn clustered_light_assignment_clear;
  HandleI32OutFn clustered_light_assignment_get_light_count;
  HandleI32OutFn clustered_light_assignment_get_cluster_count;
  ClusteredClusterListFn clustered_light_assignment_copy_lights_in_cluster;
  ClusteredCopyI32Fn clustered_light_assignment_copy_indices;
  ClusteredCopyI32Fn clustered_light_assignment_copy_offsets;
  HandleI32OutFn clustered_light_assignment_get_total_reference_count;
  HandleI32OutFn clustered_light_assignment_get_max_lights_per_cluster;
  GameHandleFn clustered_light_assignment_destroy;
  ClusteredPolicyCreateFn clustered_shadow_policy_create;
  HandleI32OutFn clustered_shadow_policy_get_budget;
  HandleI32Fn clustered_shadow_policy_set_budget;
  HandleFloatOutFn clustered_shadow_policy_get_hysteresis;
  HandleFloatFn clustered_shadow_policy_set_hysteresis;
  ClusteredCopyI32Fn clustered_shadow_policy_copy_selected;
  ClusteredIsSelectedFn clustered_shadow_policy_is_selected;
  ClusteredScoreFn clustered_shadow_policy_get_score;
  HandleI32OutFn clustered_shadow_policy_get_request_count;
  HandleI32OutFn clustered_shadow_policy_get_refused_count;
  GameHandleFn clustered_shadow_policy_reset;
  ClusteredSelectFn clustered_shadow_policy_select;
  LodCreateFn lod_group_ext_create;
  GameHandleFn lod_group_ext_destroy;
  LodAddLevelFn lod_group_ext_add_level;
  GameHandleFn lod_group_ext_clear;
  LodCopyLevelsFn lod_group_ext_copy_levels;
  LodSelectIndexFn lod_group_ext_select_index;
  HandleFloatOutFn lod_group_ext_get_hysteresis;
  HandleFloatFn lod_group_ext_set_hysteresis;
  GameHandleFn lod_group_ext_reset_hysteresis;
  LodModeOutFn lod_group_ext_get_selection_mode;
  LodModeInFn lod_group_ext_set_selection_mode;
  LodScreenSpaceFn lod_group_ext_set_screen_space_parameters;
  LodProjectedRadiusFn lod_group_ext_projected_radius_pixels;
  ShadowMapCreateFn shadow_map_create;
  GameHandleFn shadow_map_destroy;
  HandleBoolOutFn shadow_map_is_supported;
  HandleI32OutFn shadow_map_get_size;
  ShadowMapQualityOutFn shadow_map_get_quality;
  HandleFloatOutFn shadow_map_get_depth_bias;
  HandleFloatFn shadow_map_set_depth_bias;
  HandleI32OutFn shadow_map_get_filter_radius;
  ShadowMapMatrixOutFn shadow_map_get_light_view_projection;
  ShadowLightViewFn shadow_map_compute_light_view;
  ShadowLightProjectionFn shadow_map_compute_light_projection;
  ShadowQualityToI32Fn shadow_map_size_for_quality;
  ShadowQualityToI32Fn shadow_map_filter_radius_for_quality;
  DirectionalLightInitFn directional_light_ext_init;
  ParticleSystemCreateFn particle_system_create_with_capacity;
  GameHandleFn particle_system_destroy;
  HandleI32OutFn particle_system_get_capacity;
  ParticleSettingsOutFn particle_system_get_settings;
  ParticleSettingsInFn particle_system_set_settings;
  GameHandleFn particle_system_reset;
  HandleFloatFn particle_system_update;
  HandleBoolOutFn particle_system_uses_compute;
  HandleBoolOutFn particle_system_is_simulation_on_cpu_ext;
  HandleBoolFn particle_system_set_simulation_on_cpu_ext;
  HandleCopyStringFn particle_system_copy_unsupported_reason;
  HandleI32OutFn particle_system_get_active_count;
  HandleBoolOutFn particle_system_is_emission_rate_clamped;
  ParticleCopyFn particle_system_copy_particles_ext;
  ParticleStepFn particle_system_step;
  ParticleRandomFn particle_system_random;
  ParticleSettingsInitFn particle_emitter_settings_init;
  ParticleInitFn particle_init;
  CascadeSplitsFn cascaded_shadow_map_compute_split_distances;
  CascadeCornersFn cascaded_shadow_map_compute_frustum_corners;
  CascadeSphereFn cascaded_shadow_map_compute_bounding_sphere;
  SpotShadowMatrixFn spot_shadow_map_compute_light_view;
  SpotShadowMatrixFn spot_shadow_map_compute_light_projection;
  CubeFaceViewFn cube_shadow_map_compute_face_view;
  CubeFaceProjectionFn cube_shadow_map_compute_face_projection;
  ShadowQualityToI32Fn cube_shadow_map_size_for_quality;
  GameHandleFn clustered_shadow_policy_destroy;

  /* the engine layer's compute path */
  PresentationParametersInitFn presentation_parameters_init;
  StandaloneDeviceCreateFn graphics_device_create;
  GameHandleFn graphics_device_destroy;
  GraphicsCapabilityFn graphics_device_supports_capability;
  DeviceAxisI32OutFn graphics_device_get_max_compute_work_group_count_ext;
  DeviceAxisI32OutFn graphics_device_get_max_compute_work_group_size_ext;
  HandleI32OutFn graphics_device_get_max_compute_work_group_invocations_ext;
  StorageBufferCreateFn storage_buffer_create;
  StorageBufferCreateTypedFn storage_buffer_create_typed;
  StorageBufferSetBytesFn storage_buffer_set_bytes;
  StorageBufferGetBytesFn storage_buffer_get_bytes;
  HandleU64OutFn storage_buffer_get_byte_size;
  StorageBufferSetElementsFn storage_buffer_set_elements;
  StorageBufferGetElementsFn storage_buffer_get_elements;
  HandleU64OutFn storage_buffer_get_element_count;
  HandleU64OutFn storage_buffer_get_element_byte_size;
  GameHandleFn storage_buffer_destroy;
  ComputeShaderCreateFn compute_shader_create;
  ComputeShaderUniformIntFn compute_shader_set_uniform_int;
  ComputeShaderUniformFloatFn compute_shader_set_uniform_float;
  ComputeShaderBindBufferFn compute_shader_bind_storage_buffer;
  ComputeShaderBindTextureFn compute_shader_bind_texture;
  HandleBoolOutFn compute_shader_is_image_binding_supported;
  ComputeShaderBindImageFn compute_shader_bind_image;
  ComputeShaderDispatchFn compute_shader_dispatch;
  ComputeShaderBarrierFn compute_shader_barrier;
  HandleBoolOutFn compute_shader_is_valid;
  HandleCopyStringFn compute_shader_copy_compile_error;
  GameHandleFn compute_shader_destroy;
  HandleHandleOutFn gpu_timer_create;
  HandleBoolOutFn gpu_timer_is_supported;
  HandleCopyStringFn gpu_timer_copy_unsupported_reason;
  GameHandleFn gpu_timer_begin;
  GameHandleFn gpu_timer_end;
  HandleBoolOutFn gpu_timer_is_result_available;
  HandleBoolOutFn gpu_timer_poll;
  GpuTimerDoubleOutFn gpu_timer_get_last_milliseconds;
  HandleI32OutFn gpu_timer_get_sample_count;
  HandleBoolOutFn gpu_timer_is_open;
  GameHandleFn gpu_timer_destroy;
  GameHandleFn post_process_chain_clear;
  HandleI32OutFn post_process_chain_get_pass_count;
  PostProcessChainApplyFn post_process_chain_apply;
  GameHandleFn post_process_chain_reset_targets;
  BoolGetFn post_process_chain_is_gpu_timing_enabled;
  HandleBoolFn post_process_chain_set_gpu_timing_enabled;
  HandleU64OutFn post_process_chain_get_pass_timing_count;
  PostProcessChainTimingFn post_process_chain_get_pass_timing;
  PostProcessChainTimingNameFn post_process_chain_copy_pass_timing_name;
  VideoPlayerFrameFn video_player_get_frame;
  BoolOutFn devices_ext_is_available;
  HandleI32OutFn system_info_cpu_cores;
  HandleI32OutFn system_info_ram_megabytes;
  GameU32OutFn power_get_state;
  HandleI32OutFn power_get_battery_percent;
  HandleI32OutFn power_get_seconds_remaining;
  HandleFloatOutFn display_get_content_scale;
  HandleRectangleOutFn display_get_safe_area;
  HandleU64OutFn locale_get_count;
  DevicesIndexSizeFn locale_get_language_size;
  DevicesLocaleCopyFn locale_copy_language;
  DevicesIndexSizeFn locale_get_country_size;
  DevicesLocaleCopyFn locale_copy_country;
  DevicesClipboardFn devices_clipboard_set_text;
  HandleHandleOutFn camera_create;
  HandleHandleOutFn camera_create_with_test_backend_ext;
  CameraStateOutFn camera_get_state_ext;
  HandleI32OutFn camera_get_frame_width_ext;
  HandleI32OutFn camera_get_frame_height_ext;
  CameraAcquireFn camera_try_acquire_frame_ext;
  CameraSetStateFn camera_set_test_state_ext;
  CameraSetFrameFn camera_set_test_frame_ext;
  GameHandleFn camera_destroy;
  BoolGetFn camera_get_is_supported;
  HandleU64OutFn camera_get_count;
  DevicesIndexSizeFn camera_get_name_size;
  DevicesLocaleCopyFn camera_copy_name;
  DevicesCameraInfoFn camera_get_info;
  DevicesCameraInfoInitFn camera_device_info_init;
  GameHandleFn gamer_services_initialize;
  BoolOutFn gamer_services_is_initialized;
  GamerServicesVoidFn gamer_services_update;
  SizeOutFn gamer_services_get_window_handle;
  GamerServicesU64InFn gamer_services_set_window_handle;
  BoolOutFn guide_get_is_visible;
  BoolOutFn guide_get_is_trial_mode;
  BoolOutFn guide_get_simulate_trial_mode;
  BoolInFn guide_set_simulate_trial_mode;
  BoolOutFn guide_get_is_screen_saver_enabled;
  BoolInFn guide_set_is_screen_saver_enabled;
  U32OutFn guide_get_notification_position;
  U32InFn guide_set_notification_position;
  GuideBeginMessageBoxFn guide_begin_show_message_box;
  GuideEndMessageBoxFn guide_end_show_message_box;
  GuideBoolOutFn guide_get_has_pending_message_box_ext;
  GuideI32OutFn guide_get_pending_message_box_focus_button_ext;
  GuideI32InFn guide_simulate_message_box_click_ext;
  GuideBeginKeyboardInputFn guide_begin_show_keyboard_input;
  GuideSizeFn guide_end_show_keyboard_input_size;
  GuideCopyFn guide_end_show_keyboard_input;
  GuideBoolOutFn guide_get_has_pending_keyboard_input_ext;
  GuideBoolOutFn guide_was_keyboard_input_canceled_ext;
  GuideSizeFn guide_get_pending_keyboard_input_title_size_ext;
  GuideCopyFn guide_copy_pending_keyboard_input_title_ext;
  GuideSizeFn guide_get_pending_keyboard_input_description_size_ext;
  GuideCopyFn guide_copy_pending_keyboard_input_description_ext;
  GuideSizeFn guide_get_pending_keyboard_input_display_text_size_ext;
  GuideCopyFn guide_copy_pending_keyboard_input_display_text_ext;
  GuideVoidFn guide_simulate_keyboard_input_cancel_ext;
  GuideVoidFn guide_reset_pending_keyboard_input_ext;
  AdapterCountFn graphics_adapter_get_count;
  AdapterInfoFn graphics_adapter_get_info;
  GameU32IndexCopyTextFn graphics_adapter_copy_description;
  GameU32IndexCopyTextFn graphics_adapter_copy_device_name;
  AdapterModeFn graphics_adapter_get_current_mode;
  AdapterModeCountFn graphics_adapter_get_mode_count;
  AdapterCopyModesFn graphics_adapter_copy_modes;
  AdapterMonitorFn graphics_adapter_get_monitor_handle;
  AdapterProfileFn graphics_adapter_is_profile_supported;
  AdapterQueryFormatFn graphics_adapter_query_backbuffer;
  AdapterQueryFormatFn graphics_adapter_query_render_target;
  AdapterPreferencesFn graphics_adapter_set_preferences;
  GameHandleFn graphics_adapters_refresh;
  CompassReadingInitFn compass_reading_init;
  GyroscopeReadingInitFn gyroscope_reading_init;
  MotionReadingInitFn motion_reading_init;
  AccelerometerCreateFn compass_create;
  GameHandleFn compass_destroy;
  GameHandleFn compass_start;
  GameHandleFn compass_stop;
  GameHandleFn compass_dispose;
  GameU32OutFn compass_get_state;
  BoolGetFn compass_is_data_valid;
  CompassReadingFn compass_get_current_value;
  HandleInt64OutFn compass_get_interval;
  AccelerometerTicksInFn compass_set_interval;
  CompassInjectFn compass_inject;
  CompassTestBackendFn compass_set_test_backend;
  AccelerometerCreateFn gyroscope_create;
  GameHandleFn gyroscope_destroy;
  GameHandleFn gyroscope_start;
  GameHandleFn gyroscope_stop;
  GameHandleFn gyroscope_dispose;
  GameU32OutFn gyroscope_get_state;
  BoolGetFn gyroscope_is_data_valid;
  GyroscopeReadingFn gyroscope_get_current_value;
  HandleInt64OutFn gyroscope_get_interval;
  AccelerometerTicksInFn gyroscope_set_interval;
  GyroscopeInjectFn gyroscope_inject;
  GyroscopeSetSupportedFn gyroscope_set_supported;
  AccelerometerCreateFn motion_create;
  GameHandleFn motion_destroy;
  GameHandleFn motion_start;
  GameHandleFn motion_stop;
  GameHandleFn motion_dispose;
  GameU32OutFn motion_get_state;
  BoolGetFn motion_is_data_valid;
  BoolGetFn motion_is_north_referenced;
  MotionReadingFn motion_get_current_value;
  HandleInt64OutFn motion_get_interval;
  AccelerometerTicksInFn motion_set_interval;
  MotionInjectFn motion_inject;
  MotionTestBackendFn motion_set_test_backend;
  BoolGetFn accelerometer_is_supported;
  BoolGetFn compass_is_supported;
  BoolGetFn gyroscope_is_supported;
  BoolGetFn motion_is_supported;
  AccelerometerCreateFn accelerometer_create;
  GameHandleFn accelerometer_destroy;
  GameHandleFn accelerometer_start;
  GameHandleFn accelerometer_stop;
  GameU32OutFn accelerometer_get_state;
  BoolGetFn accelerometer_is_data_valid;
  AccelerometerReadingFn accelerometer_get_current_value;
  HandleInt64OutFn accelerometer_get_interval;
  AccelerometerTicksInFn accelerometer_set_interval;
} Api;

typedef struct GameContext {
  napi_env env;
  napi_ref callbacks;
  napi_ref exception;
  CNA_Handle handle;
  struct GameContext* next;
} GameContext;

/**
 * One ContentLost subscription. ABI 0.9 made the event real on renderers whose API can lose a
 * device, so a registration now has a producer behind it rather than only preserving the shape of
 * the public contract.
 */
/* A retained JavaScript handler for one of the three text-input events. */
typedef struct TextInputContext {
  napi_env env;
  napi_ref callback;
  CNA_Handle registration;
  uint32_t kind;
  struct TextInputContext* next;
} TextInputContext;

typedef struct ContentLostContext {
  napi_env env;
  napi_ref callback;
  CNA_Handle registration;
  uint32_t kind;
  struct ContentLostContext* next;
} ContentLostContext;

typedef struct WindowEventContext {
  napi_env env;
  napi_ref callback;
  CNA_Handle game;
  CNA_Handle registration;
  struct WindowEventContext* next;
} WindowEventContext;

static LibraryHandle g_library;
static Api g_api;
static uint32_t g_imported_symbols;
static GameContext* g_games;
static WindowEventContext* g_window_events;
static ContentLostContext* g_content_lost_events;
static TextInputContext* g_text_input_events;

static napi_value undefined_result(napi_env env, const char* operation);

/*
 * A few generic route runners are defined with the families that first needed them, further down.
 * The CNB writers reuse them rather than growing near-identical copies, so they are declared here.
 */
static napi_value pp_handle_only(
  napi_env env, napi_callback_info info, GameHandleFn route, const char* name);
static napi_value pp_set_float(
  napi_env env, napi_callback_info info, HandleFloatFn route, const char* name);
static napi_value storage_buffer_u64(
  napi_env env, napi_callback_info info, HandleU64OutFn route, const char* name);
static napi_value copy_sized_text(
  napi_env env, napi_callback_info info, HandleCopyStringFn route, const char* name);
static napi_value shadow_quality_to_i32(
  napi_env env, napi_callback_info info, ShadowQualityToI32Fn route, const char* name);
static int get_named_handle(napi_env env, napi_value object, const char* name, CNA_Handle* out);

static napi_value throw_message(napi_env env, const char* message) {
  napi_throw_error(env, NULL, message);
  return NULL;
}

static napi_value throw_napi(napi_env env, const char* operation) {
  char message[256];
  snprintf(message, sizeof(message), "Node-API failure during %s", operation);
  return throw_message(env, message);
}

#define NAPI_OR_RETURN(env, expression, operation) \
  do { if ((expression) != napi_ok) return throw_napi((env), (operation)); } while (0)

static char* last_error_message(void) {
  uint64_t length = 0;
  if (!g_api.error_get_last_message_size ||
      g_api.error_get_last_message_size(&length) != CNA_RESULT_SUCCESS) {
    return NULL;
  }
  if (length > SIZE_MAX - 1) return NULL;
  char* message = (char*) malloc((size_t) length + 1);
  if (!message) return NULL;
  uint64_t copied = 0;
  if (g_api.error_copy_last_message(message, length, &copied) != CNA_RESULT_SUCCESS || copied != length) {
    free(message);
    return NULL;
  }
  message[length] = '\0';
  return message;
}

static napi_value throw_result(napi_env env, const char* operation, CNA_Result result) {
  char* native_message = last_error_message();
  char message[1024];
  snprintf(message, sizeof(message), "%s failed with CNA result %" PRIu32 "%s%s",
    operation, result, native_message ? ": " : "", native_message ? native_message : "");
  free(native_message);
  napi_value message_value, error, result_value, operation_value;
  if (napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &message_value) != napi_ok ||
      napi_create_error(env, NULL, message_value, &error) != napi_ok ||
      napi_create_uint32(env, result, &result_value) != napi_ok ||
      napi_create_string_utf8(env, operation, NAPI_AUTO_LENGTH, &operation_value) != napi_ok ||
      napi_set_named_property(env, error, "cnaResult", result_value) != napi_ok ||
      napi_set_named_property(env, error, "operation", operation_value) != napi_ok) {
    return throw_napi(env, operation);
  }
  napi_throw(env, error);
  return NULL;
}

static int require_loaded(napi_env env) {
  if (g_library) return 1;
  throw_message(env, "CNA native library has not been loaded");
  return 0;
}

static int read_handle(napi_env env, napi_value value, CNA_Handle* out) {
  bool lossless = false;
  if (napi_get_value_bigint_uint64(env, value, out, &lossless) != napi_ok || !lossless || *out == 0) {
    throw_message(env, "expected a nonzero uint64 bigint CNA handle");
    return 0;
  }
  return 1;
}

static int read_handle_allow_zero(napi_env env, napi_value value, CNA_Handle* out) {
  bool lossless = false;
  if (napi_get_value_bigint_uint64(env, value, out, &lossless) != napi_ok || !lossless) {
    throw_message(env, "expected a uint64 bigint CNA handle");
    return 0;
  }
  return 1;
}

static napi_value make_handle(napi_env env, CNA_Handle handle) {
  napi_value result;
  if (napi_create_bigint_uint64(env, handle, &result) != napi_ok) return throw_napi(env, "handle creation");
  return result;
}

static int get_args(napi_env env, napi_callback_info info, size_t expected, napi_value* args) {
  size_t count = expected;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok) {
    throw_napi(env, "argument access");
    return 0;
  }
  if (count < expected) {
    throw_message(env, "missing native bridge argument");
    return 0;
  }
  return 1;
}

static GameContext* find_game(CNA_Handle handle) {
  for (GameContext* game = g_games; game; game = game->next) {
    if (game->handle == handle) return game;
  }
  return NULL;
}

static void unlink_game(GameContext* target) {
  GameContext** cursor = &g_games;
  while (*cursor) {
    if (*cursor == target) {
      *cursor = target->next;
      return;
    }
    cursor = &(*cursor)->next;
  }
}

static CNA_Result call_callback(
  GameContext* context,
  const char* name,
  const CNA_GameTime* game_time,
  CNA_Bool* should_draw
) {
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return CNA_RESULT_CALLBACK;
  napi_value callbacks;
  napi_value function;
  napi_value receiver;
  bool present = false;
  napi_status status = napi_get_reference_value(context->env, context->callbacks, &callbacks);
  if (status == napi_ok) status = napi_has_named_property(context->env, callbacks, name, &present);
  if (status == napi_ok && present) status = napi_get_named_property(context->env, callbacks, name, &function);
  if (status == napi_ok) status = napi_get_undefined(context->env, &receiver);

  napi_value argument;
  size_t argument_count = 0;
  if (status == napi_ok && game_time) {
    status = napi_create_object(context->env, &argument);
    napi_value total;
    napi_value elapsed;
    napi_value slow;
    if (status == napi_ok) status = napi_create_bigint_int64(context->env, game_time->total_game_time_ticks, &total);
    if (status == napi_ok) status = napi_create_bigint_int64(context->env, game_time->elapsed_game_time_ticks, &elapsed);
    if (status == napi_ok) status = napi_get_boolean(context->env, game_time->is_running_slowly == CNA_TRUE, &slow);
    if (status == napi_ok) status = napi_set_named_property(context->env, argument, "TotalGameTimeTicks", total);
    if (status == napi_ok) status = napi_set_named_property(context->env, argument, "ElapsedGameTimeTicks", elapsed);
    if (status == napi_ok) status = napi_set_named_property(context->env, argument, "IsRunningSlowly", slow);
    argument_count = 1;
  }

  napi_value result;
  if (status == napi_ok) {
    status = napi_call_function(context->env, receiver, function, argument_count,
      argument_count ? &argument : NULL, &result);
  }
  if (status == napi_ok && should_draw) {
    bool value = true;
    status = napi_get_value_bool(context->env, result, &value);
    if (status == napi_ok) *should_draw = value ? CNA_TRUE : CNA_FALSE;
  }
  if (status == napi_pending_exception) {
    napi_value exception;
    if (napi_get_and_clear_last_exception(context->env, &exception) == napi_ok) {
      if (context->exception) napi_delete_reference(context->env, context->exception);
      napi_create_reference(context->env, exception, 1, &context->exception);
    }
  }
  napi_close_handle_scope(context->env, scope);
  return status == napi_ok ? CNA_RESULT_SUCCESS : CNA_RESULT_CALLBACK;
}

#define LIFECYCLE_CALLBACK(name, property) \
  static CNA_Result name(CNA_Handle game, const CNA_GameTime* time, void* raw, CNA_CallbackError* error) { \
    (void) game; (void) error; return call_callback((GameContext*) raw, property, time, NULL); \
  }

LIFECYCLE_CALLBACK(on_initialize, "initialize")
LIFECYCLE_CALLBACK(on_load_content, "loadContent")
LIFECYCLE_CALLBACK(on_begin_run, "beginRun")
LIFECYCLE_CALLBACK(on_update, "update")
LIFECYCLE_CALLBACK(on_draw, "draw")
LIFECYCLE_CALLBACK(on_end_draw, "endDraw")
LIFECYCLE_CALLBACK(on_end_run, "endRun")
LIFECYCLE_CALLBACK(on_unload_content, "unloadContent")
LIFECYCLE_CALLBACK(on_exiting, "exiting")

static CNA_Result on_begin_draw(
  CNA_Handle game,
  const CNA_GameTime* time,
  void* raw,
  CNA_Bool* should_draw,
  CNA_CallbackError* error
) {
  (void) game;
  (void) error;
  return call_callback((GameContext*) raw, "beginDraw", time, should_draw);
}

static int rethrow_callback_exception(GameContext* context) {
  if (!context || !context->exception) return 0;
  napi_value exception;
  if (napi_get_reference_value(context->env, context->exception, &exception) == napi_ok) {
    napi_delete_reference(context->env, context->exception);
    context->exception = NULL;
    napi_throw(context->env, exception);
    return 1;
  }
  return 0;
}

/* The ABI window this adapter accepts, taken from the CNA headers it was compiled against.
   docs/c-api/ABI_VERSIONING.md: a consumer must reject a different major and may require a
   minimum minor. Under an experimental 0.x an incompatible change is a minor increment, so the
   minor must match exactly there; from 1.x a newer minor is additive and is accepted. The patch
   component is always accepted because it may only carry additive or corrective changes. */
#define CNA_TS_ABI_MAJOR ((uint32_t) CNA_ABI_VERSION_MAJOR)
#define CNA_TS_ABI_MINOR ((uint32_t) CNA_ABI_VERSION_MINOR)

static uint32_t abi_major_of(uint32_t encoded) { return (encoded >> 16) & UINT32_C(0xFFFF); }
static uint32_t abi_minor_of(uint32_t encoded) { return (encoded >> 8) & UINT32_C(0xFF); }
static uint32_t abi_patch_of(uint32_t encoded) { return encoded & UINT32_C(0xFF); }

static int abi_version_is_supported(uint32_t encoded) {
  if (abi_major_of(encoded) != CNA_TS_ABI_MAJOR) return 0;
#if CNA_ABI_VERSION_MAJOR == 0
  return abi_minor_of(encoded) == CNA_TS_ABI_MINOR;
#else
  return abi_minor_of(encoded) >= CNA_TS_ABI_MINOR;
#endif
}

#define LOAD_REQUIRED(field, type, symbol) \
  do { \
    void* address = LOAD_ADDRESS(g_library, symbol); \
    if (!address) { \
      char message[256]; \
      snprintf( \
        message, sizeof(message), \
        "CNA ABI %" PRIu32 ".%" PRIu32 " library is missing required symbol %s", \
        CNA_TS_ABI_MAJOR, CNA_TS_ABI_MINOR, symbol); \
      return throw_message(env, message); \
    } \
    memcpy(&g_api.field, &address, sizeof(type)); \
    g_imported_symbols += 1; \
  } while (0)

static napi_value load_library(napi_env env, napi_callback_info info) {
  napi_value args[1];
  if (!get_args(env, info, 1, args)) return NULL;
  if (g_library) return throw_message(env, "a CNA native library is already loaded");
  size_t length = 0;
  NAPI_OR_RETURN(env, napi_get_value_string_utf8(env, args[0], NULL, 0, &length), "library path sizing");
  char* path = (char*) malloc(length + 1);
  if (!path) return throw_message(env, "out of memory reading CNA library path");
  napi_status path_status = napi_get_value_string_utf8(env, args[0], path, length + 1, &length);
  if (path_status != napi_ok) { free(path); return throw_napi(env, "library path reading"); }
  g_library = OPEN_LIBRARY(path);
  free(path);
  if (!g_library) return throw_message(env, "could not load the requested CNA native library");
  memset(&g_api, 0, sizeof(g_api));
  g_imported_symbols = 0;

  LOAD_REQUIRED(get_abi_version, GetAbiVersionFn, "cna_get_abi_version");
  LOAD_REQUIRED(pbr_material_init, PbrMaterialInitFn, "cna_pbr_material_init");
  LOAD_REQUIRED(render_pipeline_settings_init, RenderPipelineSettingsInitFn, "cna_render_pipeline_settings_init");
  LOAD_REQUIRED(render_pipeline_create, RenderPipelineCreateFn, "cna_render_pipeline_create");
  LOAD_REQUIRED(render_pipeline_destroy, RenderPipelineHandleFn, "cna_render_pipeline_destroy");
  LOAD_REQUIRED(render_pipeline_resize, RenderPipelineResizeFn, "cna_render_pipeline_resize");
  LOAD_REQUIRED(render_pipeline_begin, RenderPipelineBeginFn, "cna_render_pipeline_begin");
  LOAD_REQUIRED(render_pipeline_end, RenderPipelineHandleFn, "cna_render_pipeline_end");
  LOAD_REQUIRED(render_pipeline_pass_count, RenderPipelinePassCountFn, "cna_render_pipeline_get_last_frame_pass_count");
  LOAD_REQUIRED(render_pipeline_memory, RenderPipelineMemoryFn, "cna_render_pipeline_get_gpu_memory_estimate_bytes");
  LOAD_REQUIRED(render_pipeline_statistics, RenderPipelineStatisticsFn, "cna_render_pipeline_get_statistics");
  LOAD_REQUIRED(render_target_subscribe_content_lost, RenderTargetSubscribeFn, "cna_render_target_subscribe_content_lost");
  LOAD_REQUIRED(render_target_unsubscribe_content_lost, RenderTargetUnsubscribeFn, "cna_render_target_unsubscribe_content_lost");
  LOAD_REQUIRED(vertex_buffer_subscribe_content_lost, VertexBufferSubscribeFn, "cna_vertex_buffer_subscribe_content_lost");
  LOAD_REQUIRED(vertex_buffer_unsubscribe_content_lost, VertexBufferUnsubscribeFn, "cna_vertex_buffer_unsubscribe_content_lost");
  LOAD_REQUIRED(index_buffer_subscribe_content_lost, IndexBufferSubscribeFn, "cna_index_buffer_subscribe_content_lost");
  LOAD_REQUIRED(index_buffer_unsubscribe_content_lost, IndexBufferUnsubscribeFn, "cna_index_buffer_unsubscribe_content_lost");
  LOAD_REQUIRED(platform_get_current, U32OutFn, "cna_platform_get_current");
  LOAD_REQUIRED(platform_get_is_apple, BoolOutFn, "cna_platform_get_is_apple_ext");
  LOAD_REQUIRED(platform_get_is_mobile, BoolOutFn, "cna_platform_get_is_mobile_ext");
  LOAD_REQUIRED(platform_name_size, SizeOutFn, "cna_platform_get_current_name_size_ext");
  LOAD_REQUIRED(platform_copy_name, CopyTextFn, "cna_platform_copy_current_name_ext");
  LOAD_REQUIRED(desktop_os_get_current, U32OutFn, "cna_desktop_os_get_current");
  LOAD_REQUIRED(backend_get_category, U32ToU32Fn, "cna_graphics_backend_get_category");
  LOAD_REQUIRED(backend_category_name_size, U32SizeOutFn, "cna_graphics_backend_category_get_name_size");
  LOAD_REQUIRED(backend_category_copy_name, U32CopyTextFn, "cna_graphics_backend_category_copy_name");
  LOAD_REQUIRED(backend_get_maturity, U32ToU32Fn, "cna_graphics_backend_get_maturity");
  LOAD_REQUIRED(backend_maturity_name_size, U32SizeOutFn, "cna_graphics_backend_maturity_get_name_size");
  LOAD_REQUIRED(backend_maturity_copy_name, U32CopyTextFn, "cna_graphics_backend_maturity_copy_name");
  LOAD_REQUIRED(renderer_set_preferred, U32InFn, "cna_graphics_renderer_set_preferred_ext");
  LOAD_REQUIRED(renderer_set_preferred_by_name, StringViewInFn, "cna_graphics_renderer_set_preferred_by_name_ext");
  LOAD_REQUIRED(renderer_get_selected, U32OutFn, "cna_graphics_renderer_get_selected_ext");
  LOAD_REQUIRED(renderer_get_active, U32OutFn, "cna_graphics_renderer_get_active_ext");
  LOAD_REQUIRED(renderer_get_is_latched, BoolOutFn, "cna_graphics_renderer_get_is_latched_ext");
  LOAD_REQUIRED(renderer_available_count, SizeOutFn, "cna_graphics_renderer_get_available_count_ext");
  LOAD_REQUIRED(renderer_copy_available, RendererListCopyFn, "cna_graphics_renderer_copy_available_ext");
  LOAD_REQUIRED(renderer_get_is_available, U32ToBoolFn, "cna_graphics_renderer_get_is_available_ext");
  LOAD_REQUIRED(renderer_set_fallback_chain, RendererChainFn, "cna_graphics_renderer_set_fallback_chain_ext");
  LOAD_REQUIRED(renderer_set_automatic_fallback, BoolInFn, "cna_graphics_renderer_set_automatic_fallback_ext");
  LOAD_REQUIRED(renderer_get_automatic_fallback, BoolOutFn, "cna_graphics_renderer_get_automatic_fallback_ext");
  LOAD_REQUIRED(renderer_fallback_count, SizeOutFn, "cna_graphics_renderer_get_fallback_count_ext");
  LOAD_REQUIRED(renderer_fallback_at, RendererFallbackAtFn, "cna_graphics_renderer_get_fallback_at_ext");
  LOAD_REQUIRED(renderer_fallback_message_size, U64SizeOutFn, "cna_graphics_renderer_fallback_get_message_size_ext");
  LOAD_REQUIRED(renderer_fallback_copy_message, U64CopyTextFn, "cna_graphics_renderer_fallback_copy_message_ext");
  LOAD_REQUIRED(renderer_fallback_reason_name_size, U32SizeOutFn, "cna_graphics_renderer_fallback_reason_get_name_size_ext");
  LOAD_REQUIRED(renderer_fallback_reason_copy_name, U32CopyTextFn, "cna_graphics_renderer_fallback_reason_copy_name_ext");
  LOAD_REQUIRED(renderer_try_parse_name, RendererParseFn, "cna_graphics_renderer_try_parse_name_ext");
  LOAD_REQUIRED(renderer_get_current_type, U32OutFn, "cna_graphics_renderer_get_current_type");
  LOAD_REQUIRED(renderer_current_name_size, SizeOutFn, "cna_graphics_renderer_get_current_name_size");
  LOAD_REQUIRED(renderer_copy_current_name, CopyTextFn, "cna_graphics_renderer_copy_current_name");
  LOAD_REQUIRED(logger_get_minimum_level, U32OutFn, "cna_logger_get_minimum_level");
  LOAD_REQUIRED(logger_set_minimum_level, U32InFn, "cna_logger_set_minimum_level");
  LOAD_REQUIRED(logger_log, LoggerLogFn, "cna_logger_log");
  LOAD_REQUIRED(graphics_ext_is_available, BoolOutFn, "cna_graphics_ext_is_available");
  LOAD_REQUIRED(error_get_last_message_size, ErrorGetLastMessageSizeFn, "cna_error_get_last_message_size");
  LOAD_REQUIRED(error_copy_last_message, ErrorCopyLastMessageFn, "cna_error_copy_last_message");
  {
    const uint32_t encoded = g_api.get_abi_version();
    if (!abi_version_is_supported(encoded)) {
      char message[256];
      snprintf(
        message, sizeof(message),
        "CNA library reports ABI %" PRIu32 ".%" PRIu32 ".%" PRIu32
        " (0x%08" PRIx32 "), which is outside the %" PRIu32 ".%" PRIu32
        ".x window this adapter was compiled for",
        abi_major_of(encoded), abi_minor_of(encoded), abi_patch_of(encoded), encoded,
        CNA_TS_ABI_MAJOR, CNA_TS_ABI_MINOR);
      return throw_message(env, message);
    }
  }
  LOAD_REQUIRED(game_create, GameCreateFn, "cna_game_create");
  LOAD_REQUIRED(game_set_frame_hooks, GameSetFrameHooksFn, "cna_game_set_frame_hooks_ext");
  LOAD_REQUIRED(game_run, GameHandleFn, "cna_game_run");
  LOAD_REQUIRED(game_run_one_frame, GameHandleFn, "cna_game_run_one_frame");
  LOAD_REQUIRED(game_request_exit, GameHandleFn, "cna_game_request_exit");
  LOAD_REQUIRED(game_destroy, GameHandleFn, "cna_game_destroy");
  LOAD_REQUIRED(framework_dispatcher_update, GameHandleFn, "cna_framework_dispatcher_update");
  LOAD_REQUIRED(manager_create, GraphicsManagerCreateFn, "cna_graphics_device_manager_create");
  LOAD_REQUIRED(manager_set_graphics_profile, GraphicsManagerSetU32Fn, "cna_graphics_device_manager_set_graphics_profile");
  LOAD_REQUIRED(manager_set_is_full_screen, GraphicsManagerSetBoolFn, "cna_graphics_device_manager_set_is_full_screen");
  LOAD_REQUIRED(manager_set_prefer_multi_sampling, GraphicsManagerSetBoolFn, "cna_graphics_device_manager_set_prefer_multi_sampling");
  LOAD_REQUIRED(manager_set_back_buffer_format, GraphicsManagerSetU32Fn, "cna_graphics_device_manager_set_preferred_back_buffer_format");
  LOAD_REQUIRED(manager_set_back_buffer_width, GraphicsManagerSetI32Fn, "cna_graphics_device_manager_set_preferred_back_buffer_width");
  LOAD_REQUIRED(manager_set_back_buffer_height, GraphicsManagerSetI32Fn, "cna_graphics_device_manager_set_preferred_back_buffer_height");
  LOAD_REQUIRED(manager_set_depth_stencil_format, GraphicsManagerSetU32Fn, "cna_graphics_device_manager_set_preferred_depth_stencil_format");
  LOAD_REQUIRED(manager_set_vertical_retrace, GraphicsManagerSetBoolFn, "cna_graphics_device_manager_set_synchronize_with_vertical_retrace");
  LOAD_REQUIRED(manager_set_orientations, GraphicsManagerSetU32Fn, "cna_graphics_device_manager_set_supported_orientations");
  LOAD_REQUIRED(manager_apply_changes, GameHandleFn, "cna_graphics_device_manager_apply_changes");
  LOAD_REQUIRED(manager_toggle_full_screen, GameHandleFn, "cna_graphics_device_manager_toggle_full_screen");
  LOAD_REQUIRED(manager_create_device, GameHandleFn, "cna_graphics_device_manager_create_device");
  LOAD_REQUIRED(manager_begin_draw, GraphicsManagerBeginDrawFn, "cna_graphics_device_manager_begin_draw");
  LOAD_REQUIRED(manager_end_draw, GameHandleFn, "cna_graphics_device_manager_end_draw");
  LOAD_REQUIRED(manager_destroy, GameHandleFn, "cna_graphics_device_manager_destroy");
  LOAD_REQUIRED(manager_get_device, GraphicsManagerGetDeviceFn, "cna_graphics_device_manager_get_graphics_device");
  LOAD_REQUIRED(graphics_clear, GraphicsClearFn, "cna_graphics_device_clear_rgba");
  LOAD_REQUIRED(graphics_present, GameHandleFn, "cna_graphics_device_present");
  LOAD_REQUIRED(graphics_get_renderer_info, GraphicsGetRendererInfoFn, "cna_graphics_device_get_renderer_info");
  LOAD_REQUIRED(graphics_renderer_name_size, GraphicsRendererNameSizeFn, "cna_graphics_device_get_renderer_name_size");
  LOAD_REQUIRED(graphics_copy_renderer_name, GraphicsCopyRendererNameFn, "cna_graphics_device_copy_renderer_name");
  LOAD_REQUIRED(texture_create, TextureCreateFn, "cna_texture2d_create");
  LOAD_REQUIRED(texture_get_info, TextureInfoFn, "cna_texture2d_get_info");
  LOAD_REQUIRED(texture_create_from_encoded, TextureFromEncodedFn, "cna_texture2d_create_from_encoded_memory");
  LOAD_REQUIRED(texture_set_data, TextureSetDataFn, "cna_texture2d_set_data");
  LOAD_REQUIRED(texture_get_data, TextureGetDataFn, "cna_texture2d_get_data");
  LOAD_REQUIRED(texture_encoded_count, TextureEncodedCountFn, "cna_texture2d_get_encoded_byte_count");
  LOAD_REQUIRED(texture_encoded_copy, TextureEncodedCopyFn, "cna_texture2d_copy_encoded");
  LOAD_REQUIRED(texture_destroy, GameHandleFn, "cna_texture2d_destroy");
  LOAD_REQUIRED(sprite_batch_create, SpriteBatchCreateFn, "cna_sprite_batch_create");
  LOAD_REQUIRED(sprite_batch_begin, SpriteBatchBeginFn, "cna_sprite_batch_begin");
  LOAD_REQUIRED(sprite_batch_submit_scaled, SpriteBatchSubmitScaledFn, "cna_sprite_batch_submit_scaled_many");
  LOAD_REQUIRED(sprite_batch_end, GameHandleFn, "cna_sprite_batch_end");
  LOAD_REQUIRED(sprite_batch_destroy, GameHandleFn, "cna_sprite_batch_destroy");
  LOAD_REQUIRED(vertex_declaration_create, VertexDeclarationCreateFn, "cna_vertex_declaration_create_with_stride");
  LOAD_REQUIRED(vertex_declaration_destroy, GameHandleFn, "cna_vertex_declaration_destroy");
  LOAD_REQUIRED(vertex_buffer_create, VertexBufferCreateFn, "cna_vertex_buffer_create");
  LOAD_REQUIRED(vertex_buffer_destroy, GameHandleFn, "cna_vertex_buffer_destroy");
  LOAD_REQUIRED(vertex_buffer_set_raw, VertexBufferSetRawFn, "cna_vertex_buffer_set_data_raw");
  LOAD_REQUIRED(vertex_buffer_get_raw, VertexBufferGetRawFn, "cna_vertex_buffer_get_data_raw");
  LOAD_REQUIRED(index_buffer_create, IndexBufferCreateFn, "cna_index_buffer_create");
  LOAD_REQUIRED(index_buffer_destroy, GameHandleFn, "cna_index_buffer_destroy");
  LOAD_REQUIRED(index_buffer_set, IndexBufferSetFn, "cna_index_buffer_set_data");
  LOAD_REQUIRED(index_buffer_set_at, IndexBufferSetAtFn, "cna_index_buffer_set_data_at");
  LOAD_REQUIRED(index_buffer_get, IndexBufferGetFn, "cna_index_buffer_get_data");
  LOAD_REQUIRED(index_buffer_get_info, IndexBufferInfoFn, "cna_index_buffer_get_info");
  LOAD_REQUIRED(graphics_get_status, GraphicsDeviceStatusFn, "cna_graphics_device_get_status");
  LOAD_REQUIRED(graphics_set_blend_factor, GraphicsSetColorFn, "cna_graphics_device_set_blend_factor");
  LOAD_REQUIRED(graphics_set_blend_state, GraphicsSetBlendStateFn, "cna_graphics_device_set_blend_state");
  LOAD_REQUIRED(graphics_set_depth_stencil_state, GraphicsSetDepthStencilStateFn, "cna_graphics_device_set_depth_stencil_state");
  LOAD_REQUIRED(graphics_set_rasterizer_state, GraphicsSetRasterizerStateFn, "cna_graphics_device_set_rasterizer_state");
  LOAD_REQUIRED(graphics_set_sampler_state, GraphicsSetSamplerStateFn, "cna_graphics_device_set_sampler_state");
  LOAD_REQUIRED(graphics_set_texture, GraphicsSetTextureFn, "cna_graphics_device_set_texture");
  LOAD_REQUIRED(graphics_set_multi_sample_mask, GraphicsSetI32Fn, "cna_graphics_device_set_multi_sample_mask");
  LOAD_REQUIRED(graphics_set_reference_stencil, GraphicsSetI32Fn, "cna_graphics_device_set_reference_stencil");
  LOAD_REQUIRED(graphics_set_scissor_rectangle, GraphicsSetRectangleFn, "cna_graphics_device_set_scissor_rectangle");
  LOAD_REQUIRED(graphics_set_viewport, GraphicsSetViewportFn, "cna_graphics_device_set_viewport");
  LOAD_REQUIRED(graphics_set_vertex_buffers, GraphicsSetVertexBuffersFn, "cna_graphics_device_set_vertex_buffers");
  LOAD_REQUIRED(graphics_set_index_buffer, GraphicsSetIndexBufferFn, "cna_graphics_device_set_index_buffer");
  LOAD_REQUIRED(graphics_draw_primitives, GraphicsDrawPrimitivesFn, "cna_graphics_device_draw_primitives");
  LOAD_REQUIRED(graphics_draw_indexed, GraphicsDrawIndexedFn, "cna_graphics_device_draw_indexed_primitives");
  LOAD_REQUIRED(graphics_draw_instanced, GraphicsDrawInstancedFn, "cna_graphics_device_draw_instanced_primitives");
  LOAD_REQUIRED(graphics_draw_user, GraphicsDrawUserFn, "cna_graphics_device_draw_user_primitives");
  LOAD_REQUIRED(graphics_draw_user_indexed, GraphicsDrawUserIndexedFn, "cna_graphics_device_draw_user_indexed_primitives");
  LOAD_REQUIRED(sprite_batch_begin_states, SpriteBatchBeginStatesFn, "cna_sprite_batch_begin_with_states");
  LOAD_REQUIRED(sprite_batch_begin_effect, SpriteBatchBeginEffectFn, "cna_sprite_batch_begin_with_effect");
  LOAD_REQUIRED(vertex_buffer_set_data, VertexBufferSetDataFn, "cna_vertex_buffer_set_data");
  LOAD_REQUIRED(vertex_buffer_set_raw_at, VertexBufferSetRawAtFn, "cna_vertex_buffer_set_data_raw_at");
  LOAD_REQUIRED(vertex_buffer_set_raw_at_with_options, VertexBufferSetRawAtWithOptionsFn, "cna_vertex_buffer_set_data_raw_at_with_options");
  LOAD_REQUIRED(vertex_buffer_get_info, VertexBufferInfoFn, "cna_vertex_buffer_get_info");
  LOAD_REQUIRED(texture3d_create, Texture3DCreateFn, "cna_texture3d_create");
  LOAD_REQUIRED(texture3d_get_info, Texture3DInfoFn, "cna_texture3d_get_info");
  LOAD_REQUIRED(texture3d_set, Texture3DSetFn, "cna_texture3d_set_data");
  LOAD_REQUIRED(texture3d_get, Texture3DGetFn, "cna_texture3d_get_data");
  LOAD_REQUIRED(texture3d_destroy, GameHandleFn, "cna_texture3d_destroy");
  LOAD_REQUIRED(texturecube_create, TextureCubeCreateFn, "cna_texturecube_create");
  LOAD_REQUIRED(texturecube_get_info, TextureCubeInfoFn, "cna_texturecube_get_info");
  LOAD_REQUIRED(texturecube_set, TextureCubeSetFn, "cna_texturecube_set_data");
  LOAD_REQUIRED(texturecube_get, TextureCubeGetFn, "cna_texturecube_get_data");
  LOAD_REQUIRED(texturecube_destroy, GameHandleFn, "cna_texturecube_destroy");
  LOAD_REQUIRED(render_target2d_create, RenderTarget2DCreateFn, "cna_render_target2d_create");
  LOAD_REQUIRED(render_target_cube_create, RenderTargetCubeCreateFn, "cna_render_target_cube_create");
  LOAD_REQUIRED(render_target_get_info, RenderTargetInfoFn, "cna_render_target_get_info");
  LOAD_REQUIRED(graphics_set_render_targets, GraphicsSetRenderTargetsFn, "cna_graphics_device_set_render_targets");
  LOAD_REQUIRED(render_target_destroy, GameHandleFn, "cna_render_target_destroy");
  LOAD_REQUIRED(occlusion_create, HandleHandleOutFn, "cna_occlusion_query_create");
  LOAD_REQUIRED(occlusion_begin, GameHandleFn, "cna_occlusion_query_begin");
  LOAD_REQUIRED(occlusion_end, GameHandleFn, "cna_occlusion_query_end");
  LOAD_REQUIRED(occlusion_get_complete, BoolGetFn, "cna_occlusion_query_get_is_complete");
  LOAD_REQUIRED(occlusion_get_pixel_count, HandleI32OutFn, "cna_occlusion_query_get_pixel_count");
  LOAD_REQUIRED(occlusion_destroy, GameHandleFn, "cna_occlusion_query_destroy");
  LOAD_REQUIRED(effect_create_empty, EffectCreateFn, "cna_effect_create_empty");
  LOAD_REQUIRED(effect_create_compiled, EffectCreateCompiledFn, "cna_effect_create_compiled");
  LOAD_REQUIRED(effect_clone, EffectCloneFn, "cna_effect_clone");
  LOAD_REQUIRED(effect_destroy, EffectHandleFn, "cna_effect_destroy");
  LOAD_REQUIRED(effect_apply, EffectHandleFn, "cna_effect_apply");
  LOAD_REQUIRED(effect_get_techniques, EffectGetHandleFn, "cna_effect_get_techniques");
  LOAD_REQUIRED(effect_get_current_technique, EffectGetHandleFn, "cna_effect_get_current_technique");
  LOAD_REQUIRED(effect_set_current_technique, EffectSetHandleFn, "cna_effect_set_current_technique");
  LOAD_REQUIRED(effect_technique_collection_destroy, GameHandleFn, "cna_effect_technique_collection_destroy");
  LOAD_REQUIRED(effect_technique_collection_get_count, HandleU64OutFn, "cna_effect_technique_collection_get_count");
  LOAD_REQUIRED(effect_technique_collection_get_at, HandleIndexHandleOutFn, "cna_effect_technique_collection_get_at");
  LOAD_REQUIRED(effect_technique_destroy, GameHandleFn, "cna_effect_technique_destroy");
  LOAD_REQUIRED(effect_technique_get_name_size, HandleU64OutFn, "cna_effect_technique_get_name_byte_count");
  LOAD_REQUIRED(effect_technique_copy_name, HandleCopyStringFn, "cna_effect_technique_copy_name");
  LOAD_REQUIRED(effect_technique_get_index, GameU32OutFn, "cna_effect_technique_get_index_ext");
  LOAD_REQUIRED(effect_technique_get_passes, HandleHandleOutFn, "cna_effect_technique_get_passes");
  LOAD_REQUIRED(effect_pass_collection_destroy, GameHandleFn, "cna_effect_pass_collection_destroy");
  LOAD_REQUIRED(effect_pass_collection_get_count, HandleU64OutFn, "cna_effect_pass_collection_get_count");
  LOAD_REQUIRED(effect_pass_collection_get_at, HandleIndexHandleOutFn, "cna_effect_pass_collection_get_at");
  LOAD_REQUIRED(effect_pass_destroy, GameHandleFn, "cna_effect_pass_destroy");
  LOAD_REQUIRED(effect_pass_get_name_size, HandleU64OutFn, "cna_effect_pass_get_name_byte_count");
  LOAD_REQUIRED(effect_pass_copy_name, HandleCopyStringFn, "cna_effect_pass_copy_name");
  LOAD_REQUIRED(effect_pass_apply, GameHandleFn, "cna_effect_pass_apply");
  LOAD_REQUIRED(basic_effect_create, EffectCreateFn, "cna_basic_effect_create");
  LOAD_REQUIRED(alpha_test_effect_create, EffectCreateFn, "cna_alpha_test_effect_create");
  LOAD_REQUIRED(dual_texture_effect_create, EffectCreateFn, "cna_dual_texture_effect_create");
  LOAD_REQUIRED(environment_map_effect_create, EffectCreateFn, "cna_environment_map_effect_create");
  LOAD_REQUIRED(skinned_effect_create, EffectCreateFn, "cna_skinned_effect_create");
  LOAD_REQUIRED(effect_set_world, EffectMatrixFn, "cna_effect_matrices_set_world");
  LOAD_REQUIRED(effect_set_view, EffectMatrixFn, "cna_effect_matrices_set_view");
  LOAD_REQUIRED(effect_set_projection, EffectMatrixFn, "cna_effect_matrices_set_projection");
  LOAD_REQUIRED(effect_set_fog_color, EffectVector3Fn, "cna_effect_fog_set_color");
  LOAD_REQUIRED(effect_set_fog_enabled, EffectBoolFn, "cna_effect_fog_set_enabled");
  LOAD_REQUIRED(effect_set_fog_start, EffectFloatFn, "cna_effect_fog_set_start");
  LOAD_REQUIRED(effect_set_fog_end, EffectFloatFn, "cna_effect_fog_set_end");
  LOAD_REQUIRED(effect_set_ambient_color, EffectVector3Fn, "cna_effect_lights_set_ambient_color");
  LOAD_REQUIRED(effect_set_lighting_enabled, EffectBoolFn, "cna_effect_lights_set_enabled");
  LOAD_REQUIRED(effect_get_directional_light, EffectLightOutFn, "cna_effect_lights_get_directional_light");
  LOAD_REQUIRED(directional_light_destroy, GameHandleFn, "cna_directional_light_destroy");
  LOAD_REQUIRED(directional_light_set_diffuse_color, LightVector3Fn, "cna_directional_light_set_diffuse_color");
  LOAD_REQUIRED(directional_light_set_direction, LightVector3Fn, "cna_directional_light_set_direction");
  LOAD_REQUIRED(directional_light_set_specular_color, LightVector3Fn, "cna_directional_light_set_specular_color");
  LOAD_REQUIRED(directional_light_set_enabled, LightBoolFn, "cna_directional_light_set_enabled");
  LOAD_REQUIRED(basic_effect_set_vertex_color_enabled, EffectBoolFn, "cna_basic_effect_set_vertex_color_enabled");
  LOAD_REQUIRED(basic_effect_set_prefer_per_pixel_lighting, EffectBoolFn, "cna_basic_effect_set_prefer_per_pixel_lighting");
  LOAD_REQUIRED(basic_effect_set_diffuse_color, EffectVector3Fn, "cna_basic_effect_set_diffuse_color");
  LOAD_REQUIRED(basic_effect_set_emissive_color, EffectVector3Fn, "cna_basic_effect_set_emissive_color");
  LOAD_REQUIRED(basic_effect_set_specular_color, EffectVector3Fn, "cna_basic_effect_set_specular_color");
  LOAD_REQUIRED(basic_effect_set_specular_power, EffectFloatFn, "cna_basic_effect_set_specular_power");
  LOAD_REQUIRED(basic_effect_set_alpha, EffectFloatFn, "cna_basic_effect_set_alpha");
  LOAD_REQUIRED(basic_effect_set_texture_enabled, EffectBoolFn, "cna_basic_effect_set_texture_enabled");
  LOAD_REQUIRED(basic_effect_set_texture, EffectSetHandleFn, "cna_basic_effect_set_texture");
  LOAD_REQUIRED(alpha_test_effect_set_diffuse_color, EffectVector3Fn, "cna_alpha_test_effect_set_diffuse_color");
  LOAD_REQUIRED(alpha_test_effect_set_alpha, EffectFloatFn, "cna_alpha_test_effect_set_alpha");
  LOAD_REQUIRED(alpha_test_effect_set_texture, EffectSetHandleFn, "cna_alpha_test_effect_set_texture");
  LOAD_REQUIRED(alpha_test_effect_set_vertex_color_enabled, EffectBoolFn, "cna_alpha_test_effect_set_vertex_color_enabled");
  LOAD_REQUIRED(alpha_test_effect_set_alpha_function, EffectU32Fn, "cna_alpha_test_effect_set_alpha_function");
  LOAD_REQUIRED(alpha_test_effect_set_reference_alpha, EffectI32Fn, "cna_alpha_test_effect_set_reference_alpha");
  LOAD_REQUIRED(dual_texture_effect_set_diffuse_color, EffectVector3Fn, "cna_dual_texture_effect_set_diffuse_color");
  LOAD_REQUIRED(dual_texture_effect_set_alpha, EffectFloatFn, "cna_dual_texture_effect_set_alpha");
  LOAD_REQUIRED(dual_texture_effect_set_texture, EffectIndexHandleFn, "cna_dual_texture_effect_set_texture");
  LOAD_REQUIRED(dual_texture_effect_set_vertex_color_enabled, EffectBoolFn, "cna_dual_texture_effect_set_vertex_color_enabled");
  LOAD_REQUIRED(environment_map_effect_set_diffuse_color, EffectVector3Fn, "cna_environment_map_effect_set_diffuse_color");
  LOAD_REQUIRED(environment_map_effect_set_emissive_color, EffectVector3Fn, "cna_environment_map_effect_set_emissive_color");
  LOAD_REQUIRED(environment_map_effect_set_alpha, EffectFloatFn, "cna_environment_map_effect_set_alpha");
  LOAD_REQUIRED(environment_map_effect_set_texture, EffectSetHandleFn, "cna_environment_map_effect_set_texture");
  LOAD_REQUIRED(environment_map_effect_set_environment_map, EffectSetHandleFn, "cna_environment_map_effect_set_environment_map");
  LOAD_REQUIRED(environment_map_effect_set_amount, EffectFloatFn, "cna_environment_map_effect_set_amount");
  LOAD_REQUIRED(environment_map_effect_set_specular, EffectVector3Fn, "cna_environment_map_effect_set_specular");
  LOAD_REQUIRED(environment_map_effect_set_fresnel_factor, EffectFloatFn, "cna_environment_map_effect_set_fresnel_factor");
  LOAD_REQUIRED(skinned_effect_set_diffuse_color, EffectVector3Fn, "cna_skinned_effect_set_diffuse_color");
  LOAD_REQUIRED(skinned_effect_set_emissive_color, EffectVector3Fn, "cna_skinned_effect_set_emissive_color");
  LOAD_REQUIRED(skinned_effect_set_specular_color, EffectVector3Fn, "cna_skinned_effect_set_specular_color");
  LOAD_REQUIRED(skinned_effect_set_specular_power, EffectFloatFn, "cna_skinned_effect_set_specular_power");
  LOAD_REQUIRED(skinned_effect_set_alpha, EffectFloatFn, "cna_skinned_effect_set_alpha");
  LOAD_REQUIRED(skinned_effect_set_prefer_per_pixel_lighting, EffectBoolFn, "cna_skinned_effect_set_prefer_per_pixel_lighting");
  LOAD_REQUIRED(skinned_effect_set_texture, EffectSetHandleFn, "cna_skinned_effect_set_texture");
  LOAD_REQUIRED(skinned_effect_set_weights_per_vertex, EffectI32Fn, "cna_skinned_effect_set_weights_per_vertex");
  LOAD_REQUIRED(skinned_effect_set_bone_transforms, EffectMatricesFn, "cna_skinned_effect_set_bone_transforms");
  LOAD_REQUIRED(skinned_effect_set_vertex_color_enabled, EffectBoolFn, "cna_skinned_effect_set_vertex_color_enabled");
  LOAD_REQUIRED(title_container_read, TitleContainerReadFn, "cna_title_container_read_ext");
  LOAD_REQUIRED(window_get_allow_resizing, BoolGetFn, "cna_game_window_get_allow_user_resizing");
  LOAD_REQUIRED(window_set_allow_resizing, HandleBoolFn, "cna_game_window_set_allow_user_resizing");
  LOAD_REQUIRED(window_get_client_bounds, HandleRectangleOutFn, "cna_game_window_get_client_bounds");
  LOAD_REQUIRED(window_get_orientation, GameU32OutFn, "cna_game_window_get_current_orientation");
  LOAD_REQUIRED(window_get_handle, HandleU64OutFn, "cna_game_window_get_native_handle_ext");
  LOAD_REQUIRED(window_get_screen_name_size, HandleU64OutFn, "cna_game_window_get_screen_device_name_size");
  LOAD_REQUIRED(window_copy_screen_name, HandleCopyStringFn, "cna_game_window_copy_screen_device_name");
  LOAD_REQUIRED(window_get_title_size, HandleU64OutFn, "cna_game_window_get_title_size");
  LOAD_REQUIRED(window_copy_title, HandleCopyStringFn, "cna_game_window_copy_title");
  LOAD_REQUIRED(window_set_title, HandleStringViewFn, "cna_game_set_window_title");
  LOAD_REQUIRED(window_begin_screen_change, HandleBoolFn, "cna_game_window_begin_screen_device_change");
  LOAD_REQUIRED(window_end_screen_change, GameWindowEndFn, "cna_game_window_end_screen_device_change");
  LOAD_REQUIRED(window_subscribe, GameWindowSubscribeFn, "cna_game_window_subscribe");
  LOAD_REQUIRED(game_unsubscribe, GameHandleFn, "cna_game_unsubscribe");
  LOAD_REQUIRED(keyboard_get_state, KeyboardGetStateFn, "cna_keyboard_get_state");
  LOAD_REQUIRED(mouse_get_state, MouseGetStateFn, "cna_mouse_get_state");
  LOAD_REQUIRED(mouse_set_position, MouseSetPositionFn, "cna_mouse_set_position");
  LOAD_REQUIRED(mouse_get_window, WindowGetFn, "cna_mouse_get_window_handle");
  LOAD_REQUIRED(mouse_set_window, WindowSetFn, "cna_mouse_set_window_handle");
  LOAD_REQUIRED(gamepad_get_state, GamePadGetStateFn, "cna_gamepad_get_state_with_dead_zone");
  LOAD_REQUIRED(gamepad_get_capabilities, GamePadGetCapabilitiesFn, "cna_gamepad_get_capabilities");
  LOAD_REQUIRED(gamepad_set_vibration, GamePadSetVibrationFn, "cna_gamepad_set_vibration");
  LOAD_REQUIRED(touch_get_state, TouchGetStateFn, "cna_touch_get_state");
  LOAD_REQUIRED(touch_get_capabilities, TouchGetCapabilitiesFn, "cna_touch_get_capabilities");
  LOAD_REQUIRED(gesture_is_available, BoolGetFn, "cna_touch_panel_get_is_gesture_available");
  LOAD_REQUIRED(gesture_read, GestureReadFn, "cna_touch_panel_read_gesture");
  LOAD_REQUIRED(touch_get_window, WindowGetFn, "cna_touch_panel_get_window_handle");
  LOAD_REQUIRED(touch_set_window, WindowSetFn, "cna_touch_panel_set_window_handle");
  LOAD_REQUIRED(sound_effect_create_pcm_range, SoundEffectCreatePcmRangeFn, "cna_sound_effect_create_pcm16_range_ext");
  LOAD_REQUIRED(sound_effect_create_encoded, SoundEffectCreateEncodedFn, "cna_sound_effect_create_from_encoded_ext");
  LOAD_REQUIRED(sound_effect_get_duration, HandleInt64OutFn, "cna_sound_effect_get_duration_ticks");
  LOAD_REQUIRED(sound_effect_get_name_size, HandleU64OutFn, "cna_sound_effect_get_name_size");
  LOAD_REQUIRED(sound_effect_copy_name, HandleCopyStringFn, "cna_sound_effect_copy_name");
  LOAD_REQUIRED(sound_effect_set_name, HandleStringViewFn, "cna_sound_effect_set_name");
  LOAD_REQUIRED(sound_effect_create_instance, HandleHandleOutFn, "cna_sound_effect_create_instance");
  LOAD_REQUIRED(sound_effect_play_settings, SoundEffectPlaySettingsFn, "cna_sound_effect_play_with_settings");
  LOAD_REQUIRED(sound_effect_destroy, GameHandleFn, "cna_sound_effect_destroy");
  LOAD_REQUIRED(sound_effect_get_master_volume, HandleFloatOutFn, "cna_sound_effect_get_master_volume");
  LOAD_REQUIRED(sound_effect_set_master_volume, HandleFloatFn, "cna_sound_effect_set_master_volume");
  LOAD_REQUIRED(sound_effect_get_distance_scale, HandleFloatOutFn, "cna_sound_effect_get_distance_scale");
  LOAD_REQUIRED(sound_effect_set_distance_scale, HandleFloatFn, "cna_sound_effect_set_distance_scale");
  LOAD_REQUIRED(sound_effect_get_doppler_scale, HandleFloatOutFn, "cna_sound_effect_get_doppler_scale");
  LOAD_REQUIRED(sound_effect_set_doppler_scale, HandleFloatFn, "cna_sound_effect_set_doppler_scale");
  LOAD_REQUIRED(sound_effect_get_speed_of_sound, HandleFloatOutFn, "cna_sound_effect_get_speed_of_sound");
  LOAD_REQUIRED(sound_effect_set_speed_of_sound, HandleFloatFn, "cna_sound_effect_set_speed_of_sound");
  LOAD_REQUIRED(sound_instance_play, GameHandleFn, "cna_sound_effect_instance_play");
  LOAD_REQUIRED(sound_instance_pause, GameHandleFn, "cna_sound_effect_instance_pause");
  LOAD_REQUIRED(sound_instance_resume, GameHandleFn, "cna_sound_effect_instance_resume");
  LOAD_REQUIRED(sound_instance_stop, SoundEffectInstanceStopFn, "cna_sound_effect_instance_stop");
  LOAD_REQUIRED(sound_instance_get_info, SoundEffectInstanceInfoFn, "cna_sound_effect_instance_get_info");
  LOAD_REQUIRED(sound_instance_set_volume, HandleFloatFn, "cna_sound_effect_instance_set_volume");
  LOAD_REQUIRED(sound_instance_set_pitch, HandleFloatFn, "cna_sound_effect_instance_set_pitch");
  LOAD_REQUIRED(sound_instance_set_pan, HandleFloatFn, "cna_sound_effect_instance_set_pan");
  LOAD_REQUIRED(sound_instance_set_looped, HandleBoolFn, "cna_sound_effect_instance_set_is_looped");
  LOAD_REQUIRED(sound_instance_apply_3d_multi, SoundEffectApply3DMultiFn, "cna_sound_effect_instance_apply_3d_multi_ext");
  LOAD_REQUIRED(sound_instance_destroy, GameHandleFn, "cna_sound_effect_instance_destroy");
  LOAD_REQUIRED(dynamic_sound_create, DynamicSoundCreateFn, "cna_dynamic_sound_effect_instance_create");
  LOAD_REQUIRED(dynamic_sound_get_pending, HandleI32OutFn, "cna_dynamic_sound_effect_instance_get_pending_buffer_count");
  LOAD_REQUIRED(dynamic_sound_submit, DynamicSoundSubmitFn, "cna_dynamic_sound_effect_instance_submit_buffer");
  LOAD_REQUIRED(microphone_get_count, HandleU64OutFn, "cna_microphone_get_count");
  LOAD_REQUIRED(microphone_get_default, GameDefaultMicrophoneFn, "cna_microphone_get_default_index_ext");
  LOAD_REQUIRED(microphone_get_name_size, GameIndexU64OutFn, "cna_microphone_get_name_size_at");
  LOAD_REQUIRED(microphone_copy_name, GameIndexCopyStringFn, "cna_microphone_copy_name_at");
  LOAD_REQUIRED(microphone_get_buffer_duration, GameIndexInt64OutFn, "cna_microphone_get_buffer_duration_ticks_at");
  LOAD_REQUIRED(microphone_set_buffer_duration, GameIndexInt64Fn, "cna_microphone_set_buffer_duration_ticks_at");
  LOAD_REQUIRED(microphone_get_is_headset, GameIndexBoolOutFn, "cna_microphone_get_is_headset_at");
  LOAD_REQUIRED(microphone_get_sample_rate, GameIndexI32OutFn, "cna_microphone_get_sample_rate_at");
  LOAD_REQUIRED(microphone_get_state, GameIndexU32OutFn, "cna_microphone_get_state_at");
  LOAD_REQUIRED(microphone_start, GameIndexFn, "cna_microphone_start_at");
  LOAD_REQUIRED(microphone_stop, GameIndexFn, "cna_microphone_stop_at");
  LOAD_REQUIRED(microphone_get_data, GameIndexBytesFn, "cna_microphone_get_data_at");
  LOAD_REQUIRED(audio_engine_create, HandleStringHandleOutFn, "cna_audio_engine_create");
  LOAD_REQUIRED(audio_engine_create_renderer, AudioEngineCreateRendererFn, "cna_audio_engine_create_with_renderer");
  LOAD_REQUIRED(audio_engine_destroy, GameHandleFn, "cna_audio_engine_destroy");
  LOAD_REQUIRED(audio_engine_get_disposed, BoolGetFn, "cna_audio_engine_get_is_disposed");
  LOAD_REQUIRED(audio_engine_get_renderer_count, HandleU64OutFn, "cna_audio_engine_get_renderer_count");
  LOAD_REQUIRED(audio_engine_get_renderer_friendly_size, HandleIndexU64OutFn, "cna_audio_engine_get_renderer_friendly_name_size");
  LOAD_REQUIRED(audio_engine_copy_renderer_friendly, HandleIndexCopyStringFn, "cna_audio_engine_copy_renderer_friendly_name");
  LOAD_REQUIRED(audio_engine_get_renderer_id_size, HandleIndexU64OutFn, "cna_audio_engine_get_renderer_id_size");
  LOAD_REQUIRED(audio_engine_copy_renderer_id, HandleIndexCopyStringFn, "cna_audio_engine_copy_renderer_id");
  LOAD_REQUIRED(audio_engine_get_global, HandleStringFloatOutFn, "cna_audio_engine_get_global_variable");
  LOAD_REQUIRED(audio_engine_set_global, HandleStringFloatFn, "cna_audio_engine_set_global_variable");
  LOAD_REQUIRED(audio_engine_update, GameHandleFn, "cna_audio_engine_update");
  LOAD_REQUIRED(audio_engine_get_category, HandleStringHandleOutFn, "cna_audio_engine_get_category");
  LOAD_REQUIRED(audio_category_destroy, GameHandleFn, "cna_audio_category_destroy");
  LOAD_REQUIRED(audio_category_get_name_size, HandleU64OutFn, "cna_audio_category_get_name_size");
  LOAD_REQUIRED(audio_category_copy_name, HandleCopyStringFn, "cna_audio_category_copy_name");
  LOAD_REQUIRED(audio_category_pause, GameHandleFn, "cna_audio_category_pause");
  LOAD_REQUIRED(audio_category_resume, GameHandleFn, "cna_audio_category_resume");
  LOAD_REQUIRED(audio_category_set_volume, HandleFloatFn, "cna_audio_category_set_volume");
  LOAD_REQUIRED(audio_category_stop, HandleOptionsFn, "cna_audio_category_stop");
  LOAD_REQUIRED(audio_category_equals, TwoHandleBoolOutFn, "cna_audio_category_equals");
  LOAD_REQUIRED(audio_category_get_hash, HandleI32OutFn, "cna_audio_category_get_hash_code");
  LOAD_REQUIRED(wave_bank_create, HandleStringHandleOutFn, "cna_wave_bank_create");
  LOAD_REQUIRED(wave_bank_create_streaming, WaveBankStreamingCreateFn, "cna_wave_bank_create_streaming");
  LOAD_REQUIRED(wave_bank_destroy, GameHandleFn, "cna_wave_bank_destroy");
  LOAD_REQUIRED(wave_bank_get_disposed, BoolGetFn, "cna_wave_bank_get_is_disposed");
  LOAD_REQUIRED(wave_bank_get_prepared, BoolGetFn, "cna_wave_bank_get_is_prepared");
  LOAD_REQUIRED(wave_bank_get_in_use, BoolGetFn, "cna_wave_bank_get_is_in_use");
  LOAD_REQUIRED(sound_bank_create, HandleStringHandleOutFn, "cna_sound_bank_create");
  LOAD_REQUIRED(sound_bank_destroy, GameHandleFn, "cna_sound_bank_destroy");
  LOAD_REQUIRED(sound_bank_get_disposed, BoolGetFn, "cna_sound_bank_get_is_disposed");
  LOAD_REQUIRED(sound_bank_get_in_use, BoolGetFn, "cna_sound_bank_get_is_in_use");
  LOAD_REQUIRED(sound_bank_get_cue, HandleStringHandleOutFn, "cna_sound_bank_get_cue");
  LOAD_REQUIRED(sound_bank_play_cue, HandleStringViewFn, "cna_sound_bank_play_cue");
  LOAD_REQUIRED(sound_bank_play_cue_3d, SoundBankPlay3DFn, "cna_sound_bank_play_cue_3d");
  LOAD_REQUIRED(cue_destroy, GameHandleFn, "cna_cue_destroy");
  LOAD_REQUIRED(cue_get_info, CueInfoFn, "cna_cue_get_info");
  LOAD_REQUIRED(cue_get_name_size, HandleU64OutFn, "cna_cue_get_name_size");
  LOAD_REQUIRED(cue_copy_name, HandleCopyStringFn, "cna_cue_copy_name");
  LOAD_REQUIRED(cue_apply_3d, CueApply3DFn, "cna_cue_apply_3d");
  LOAD_REQUIRED(cue_get_variable, HandleStringFloatOutFn, "cna_cue_get_variable");
  LOAD_REQUIRED(cue_set_variable, HandleStringFloatFn, "cna_cue_set_variable");
  LOAD_REQUIRED(cue_play, GameHandleFn, "cna_cue_play");
  LOAD_REQUIRED(cue_pause, GameHandleFn, "cna_cue_pause");
  LOAD_REQUIRED(cue_resume, GameHandleFn, "cna_cue_resume");
  LOAD_REQUIRED(cue_stop, HandleOptionsFn, "cna_cue_stop");
  LOAD_REQUIRED(media_source_get_count, GameU32OutFn, "cna_media_source_get_available_count");
  LOAD_REQUIRED(media_source_get_type, GameIndexU32U32OutFn, "cna_media_source_get_type_at");
  LOAD_REQUIRED(media_source_get_name_size, GameIndexU32U64OutFn, "cna_media_source_get_name_size_at");
  LOAD_REQUIRED(media_source_copy_name, GameIndexU32CopyStringFn, "cna_media_source_copy_name_at");
  LOAD_REQUIRED(song_create_uri, SongCreateUriFn, "cna_song_create_from_uri");
  LOAD_REQUIRED(song_destroy, GameHandleFn, "cna_song_destroy");
  LOAD_REQUIRED(song_collection_create, SongCollectionCreateFn, "cna_song_collection_create");
  LOAD_REQUIRED(song_collection_destroy, GameHandleFn, "cna_song_collection_destroy");
  LOAD_REQUIRED(media_player_play_collection_from, MediaPlayCollectionFromFn, "cna_media_player_play_songs_from");
  LOAD_REQUIRED(media_player_pause, GameHandleFn, "cna_media_player_pause");
  LOAD_REQUIRED(media_player_resume, GameHandleFn, "cna_media_player_resume");
  LOAD_REQUIRED(media_player_stop, GameHandleFn, "cna_media_player_stop");
  LOAD_REQUIRED(media_player_move_next, GameHandleFn, "cna_media_player_move_next");
  LOAD_REQUIRED(media_player_move_previous, GameHandleFn, "cna_media_player_move_previous");
  LOAD_REQUIRED(media_player_set_volume, HandleFloatFn, "cna_media_player_set_volume");
  LOAD_REQUIRED(media_player_set_muted, HandleBoolFn, "cna_media_player_set_is_muted");
  LOAD_REQUIRED(media_player_set_repeating, HandleBoolFn, "cna_media_player_set_is_repeating");
  LOAD_REQUIRED(media_player_set_shuffled, HandleBoolFn, "cna_media_player_set_is_shuffled");
  LOAD_REQUIRED(media_player_set_visualization, HandleBoolFn, "cna_media_player_set_is_visualization_enabled");
  LOAD_REQUIRED(media_player_get_game_control, BoolGetFn, "cna_media_player_get_game_has_control");
  LOAD_REQUIRED(media_player_get_position, HandleInt64OutFn, "cna_media_player_get_play_position_ticks");
  LOAD_REQUIRED(media_player_get_visualization, VisualizationGetFn, "cna_media_player_get_visualization_data");
  LOAD_REQUIRED(media_player_update, GameHandleFn, "cna_media_player_update_ext");
  LOAD_REQUIRED(video_player_create, HandleHandleOutFn, "cna_video_player_create");
  LOAD_REQUIRED(video_player_destroy, GameHandleFn, "cna_video_player_destroy");
  LOAD_REQUIRED(video_player_get_state, GameU32OutFn, "cna_video_player_get_state");
  LOAD_REQUIRED(video_player_get_frame, VideoPlayerFrameFn, "cna_video_player_get_frame_ext");
  LOAD_REQUIRED(video_player_get_position, HandleInt64OutFn, "cna_video_player_get_play_position_ticks");
  LOAD_REQUIRED(video_player_set_looped, HandleBoolFn, "cna_video_player_set_is_looped");
  LOAD_REQUIRED(video_player_set_muted, HandleBoolFn, "cna_video_player_set_is_muted");
  LOAD_REQUIRED(video_player_set_volume, HandleFloatFn, "cna_video_player_set_volume");
  LOAD_REQUIRED(video_player_play, TwoHandleFn, "cna_video_player_play");
  LOAD_REQUIRED(video_player_pause, GameHandleFn, "cna_video_player_pause");
  LOAD_REQUIRED(video_player_resume, GameHandleFn, "cna_video_player_resume");
  LOAD_REQUIRED(video_player_stop, GameHandleFn, "cna_video_player_stop");
  LOAD_REQUIRED(storage_select, StorageSelectFn, "cna_storage_device_show_selector");
  LOAD_REQUIRED(storage_select_player, StorageSelectPlayerFn, "cna_storage_device_show_selector_for_player");
  LOAD_REQUIRED(storage_select_space, StorageSelectSpaceFn, "cna_storage_device_show_selector_with_space");
  LOAD_REQUIRED(storage_select_player_space, StorageSelectPlayerSpaceFn, "cna_storage_device_show_selector_for_player_with_space");
  LOAD_REQUIRED(storage_device_get_free_space, HandleInt64OutFn, "cna_storage_device_get_free_space");
  LOAD_REQUIRED(storage_device_get_connected, BoolGetFn, "cna_storage_device_get_is_connected");
  LOAD_REQUIRED(storage_device_get_total_space, HandleInt64OutFn, "cna_storage_device_get_total_space");
  LOAD_REQUIRED(storage_device_delete_container, HandleStringViewFn, "cna_storage_device_delete_container");
  LOAD_REQUIRED(storage_device_destroy, GameHandleFn, "cna_storage_device_destroy");
  LOAD_REQUIRED(storage_container_open, StorageContainerOpenFn, "cna_storage_container_open");
  LOAD_REQUIRED(storage_container_get_display_name_size, HandleU64OutFn, "cna_storage_container_get_display_name_size");
  LOAD_REQUIRED(storage_container_copy_display_name, HandleCopyStringFn, "cna_storage_container_copy_display_name");
  LOAD_REQUIRED(storage_container_destroy, GameHandleFn, "cna_storage_container_destroy");
  LOAD_REQUIRED(storage_container_create_directory, HandleStringViewFn, "cna_storage_container_create_directory");
  LOAD_REQUIRED(storage_container_directory_exists, HandleStringBoolOutFn, "cna_storage_container_directory_exists");
  LOAD_REQUIRED(storage_container_delete_directory, HandleStringViewFn, "cna_storage_container_delete_directory");
  LOAD_REQUIRED(storage_container_file_exists, HandleStringBoolOutFn, "cna_storage_container_file_exists");
  LOAD_REQUIRED(storage_container_delete_file, HandleStringViewFn, "cna_storage_container_delete_file");
  LOAD_REQUIRED(storage_container_get_directory_count, HandleStringU64OutFn, "cna_storage_container_get_directory_name_count");
  LOAD_REQUIRED(storage_container_copy_directory_name, StorageNameCopyFn, "cna_storage_container_copy_directory_name");
  LOAD_REQUIRED(storage_container_get_file_count, HandleStringU64OutFn, "cna_storage_container_get_file_name_count");
  LOAD_REQUIRED(storage_container_copy_file_name, StorageNameCopyFn, "cna_storage_container_copy_file_name");
  LOAD_REQUIRED(storage_container_create_file, HandleStringHandleOutFn, "cna_storage_container_create_file");
  LOAD_REQUIRED(storage_container_open_file, StorageOpenFileFn, "cna_storage_container_open_file_share");
  LOAD_REQUIRED(storage_stream_get_length, HandleInt64OutFn, "cna_storage_stream_get_length");
  LOAD_REQUIRED(storage_stream_read, StorageStreamReadFn, "cna_storage_stream_read");
  LOAD_REQUIRED(storage_stream_close, GameHandleFn, "cna_storage_stream_close");

  LOAD_REQUIRED(cnb_has_magic, CnbHasMagicFn, "cna_cnb_has_magic");
  LOAD_REQUIRED(cnb_copy_format_magic, CnbCopyMagicFn, "cna_cnb_copy_format_magic");
  LOAD_REQUIRED(cnb_crc32c, CnbCrc32cFn, "cna_cnb_crc32c");
  LOAD_REQUIRED(cnb_is_compression_supported, U32ToBoolFn, "cna_cnb_is_compression_supported");
  LOAD_REQUIRED(cnb_get_compression_name_size, U32SizeOutFn, "cna_cnb_get_compression_name_size");
  LOAD_REQUIRED(cnb_copy_compression_name, U32CopyTextFn, "cna_cnb_copy_compression_name");
  LOAD_REQUIRED(cnb_get_asset_type_name_size, U32SizeOutFn, "cna_cnb_get_asset_type_name_size");
  LOAD_REQUIRED(cnb_copy_asset_type_name, U32CopyTextFn, "cna_cnb_copy_asset_type_name");
  LOAD_REQUIRED(cnb_asset_type_id_from_name, CnbStringViewToU32Fn, "cna_cnb_asset_type_id_from_name");
  LOAD_REQUIRED(cnb_is_custom_asset_type_id, U32ToBoolFn, "cna_cnb_is_custom_asset_type_id");
  LOAD_REQUIRED(cnb_make_chunk_id, CnbMakeChunkIdFn, "cna_cnb_make_chunk_id");
  LOAD_REQUIRED(cnb_get_chunk_id_string_size, U32SizeOutFn, "cna_cnb_get_chunk_id_string_size");
  LOAD_REQUIRED(cnb_copy_chunk_id_string, U32CopyTextFn, "cna_cnb_copy_chunk_id_string");
  LOAD_REQUIRED(cnb_is_well_formed_chunk_id, U32ToBoolFn, "cna_cnb_is_well_formed_chunk_id");
  LOAD_REQUIRED(cnb_get_texture_format_name_size, U32SizeOutFn, "cna_cnb_get_texture_format_name_size");
  LOAD_REQUIRED(cnb_copy_texture_format_name, U32CopyTextFn, "cna_cnb_copy_texture_format_name");
  LOAD_REQUIRED(cnb_is_block_compressed_texture_format, U32ToBoolFn, "cna_cnb_is_block_compressed_texture_format");
  LOAD_REQUIRED(cnb_get_texture_format_unit_bytes, U32ToU32Fn, "cna_cnb_get_texture_format_unit_bytes");
  LOAD_REQUIRED(cnb_get_texture_level_byte_size, CnbLevelByteSizeFn, "cna_cnb_get_texture_level_byte_size");
  LOAD_REQUIRED(cnb_texture_format_to_surface_format, U32ToU32Fn, "cna_cnb_texture_format_to_surface_format");
  LOAD_REQUIRED(cnb_document_parse, CnbDocumentParseFn, "cna_cnb_document_parse");
  LOAD_REQUIRED(cnb_document_destroy, CnbDocumentDestroyFn, "cna_cnb_document_destroy");
  LOAD_REQUIRED(cnb_byte_writer_create, CnbByteWriterCreateFn, "cna_cnb_byte_writer_create");
  LOAD_REQUIRED(cnb_byte_writer_create_from_bytes, CnbByteWriterCreateFromBytesFn, "cna_cnb_byte_writer_create_from_bytes");
  LOAD_REQUIRED(cnb_byte_writer_destroy, GameHandleFn, "cna_cnb_byte_writer_destroy");
  LOAD_REQUIRED(cnb_byte_writer_write_u8, CnbWriteU8Fn, "cna_cnb_byte_writer_write_u8");
  LOAD_REQUIRED(cnb_byte_writer_write_u16, CnbWriteU16Fn, "cna_cnb_byte_writer_write_u16");
  LOAD_REQUIRED(cnb_byte_writer_write_u32, CnbWriteU32Fn, "cna_cnb_byte_writer_write_u32");
  LOAD_REQUIRED(cnb_byte_writer_write_u64, CnbWriteU64Fn, "cna_cnb_byte_writer_write_u64");
  LOAD_REQUIRED(cnb_byte_writer_write_i32, HandleI32Fn, "cna_cnb_byte_writer_write_i32");
  LOAD_REQUIRED(cnb_byte_writer_write_f32, HandleFloatFn, "cna_cnb_byte_writer_write_f32");
  LOAD_REQUIRED(cnb_byte_writer_write_f64, CnbWriteF64Fn, "cna_cnb_byte_writer_write_f64");
  LOAD_REQUIRED(cnb_byte_writer_write_string, CnbWriteStringFn, "cna_cnb_byte_writer_write_string");
  LOAD_REQUIRED(cnb_byte_writer_write_bytes, CnbWriteBytesFn, "cna_cnb_byte_writer_write_bytes");
  LOAD_REQUIRED(cnb_byte_writer_write_zeros, WindowSetFn, "cna_cnb_byte_writer_write_zeros");
  LOAD_REQUIRED(cnb_byte_writer_get_size, HandleU64OutFn, "cna_cnb_byte_writer_get_size");
  LOAD_REQUIRED(cnb_byte_writer_copy_bytes, StorageStreamReadFn, "cna_cnb_byte_writer_copy_bytes");
  LOAD_REQUIRED(cnb_byte_writer_take, StorageStreamReadFn, "cna_cnb_byte_writer_take");
  LOAD_REQUIRED(cnb_writer_create, CnbWriterCreateFn, "cna_cnb_writer_create");
  LOAD_REQUIRED(cnb_writer_destroy, GameHandleFn, "cna_cnb_writer_destroy");
  LOAD_REQUIRED(cnb_writer_set_metadata, CnbWriterMetadataFn, "cna_cnb_writer_set_metadata");
  LOAD_REQUIRED(cnb_writer_add_external_reference, CnbWriterAddReferenceFn, "cna_cnb_writer_add_external_reference");
  LOAD_REQUIRED(cnb_writer_clear_external_references, GameHandleFn, "cna_cnb_writer_clear_external_references");
  LOAD_REQUIRED(cnb_writer_add_chunk, CnbWriterAddChunkFn, "cna_cnb_writer_add_chunk");
  LOAD_REQUIRED(cnb_writer_get_schema_chunk_count, HandleU64OutFn, "cna_cnb_writer_get_schema_chunk_count");
  LOAD_REQUIRED(cnb_writer_set_compression, CnbWriterCompressionFn, "cna_cnb_writer_set_compression");
  LOAD_REQUIRED(cnb_writer_set_limits, CnbWriterSetLimitsFn, "cna_cnb_writer_set_limits");
  LOAD_REQUIRED(cnb_writer_get_limits, CnbWriterGetLimitsFn, "cna_cnb_writer_get_limits");
  LOAD_REQUIRED(cnb_read_limits_init, CnbReadLimitsInitFn, "cna_cnb_read_limits_init");
  LOAD_REQUIRED(cnb_writer_build, StorageStreamReadFn, "cna_cnb_writer_build");
  LOAD_REQUIRED(cnb_writer_append_embedded_texture2d, CnbWriterAppendTextureFn, "cna_cnb_writer_append_embedded_texture2d");
  LOAD_REQUIRED(cnb_compile_cnj, CnbCompileCnjFn, "cna_cnb_compile_cnj");
  LOAD_REQUIRED(cnb_cnj_result_destroy, GameHandleFn, "cna_cnb_cnj_result_destroy");
  LOAD_REQUIRED(cnb_cnj_result_get_asset_type_id, GameU32OutFn, "cna_cnb_cnj_result_get_asset_type_id");
  LOAD_REQUIRED(cnb_cnj_result_get_asset_type_name_size, HandleU64OutFn, "cna_cnb_cnj_result_get_asset_type_name_size");
  LOAD_REQUIRED(cnb_cnj_result_copy_asset_type_name, HandleCopyStringFn, "cna_cnb_cnj_result_copy_asset_type_name");
  LOAD_REQUIRED(cnb_cnj_result_copy_bytes, StorageStreamReadFn, "cna_cnb_cnj_result_copy_bytes");
  LOAD_REQUIRED(cnb_cnj_result_get_absorbed_file_count, HandleU64OutFn, "cna_cnb_cnj_result_get_absorbed_file_count");
  LOAD_REQUIRED(cnb_cnj_result_get_absorbed_file_size, CnjIndexSizeFn, "cna_cnb_cnj_result_get_absorbed_file_size");
  LOAD_REQUIRED(cnb_cnj_result_copy_absorbed_file, CnjIndexCopyFn, "cna_cnb_cnj_result_copy_absorbed_file");
  LOAD_REQUIRED(cnb_cnj_result_get_external_reference_count, HandleU64OutFn, "cna_cnb_cnj_result_get_external_reference_count");
  LOAD_REQUIRED(cnb_cnj_result_get_external_reference_size, CnjIndexSizeFn, "cna_cnb_cnj_result_get_external_reference_size");
  LOAD_REQUIRED(cnb_cnj_result_copy_external_reference, CnjIndexCopyFn, "cna_cnb_cnj_result_copy_external_reference");
  LOAD_REQUIRED(cnb_document_get_origin_size, HandleU64OutFn, "cna_cnb_document_get_origin_size");
  LOAD_REQUIRED(cnb_document_copy_origin, HandleCopyStringFn, "cna_cnb_document_copy_origin");
  LOAD_REQUIRED(cnb_document_get_container_major, CnbDocumentU16OutFn, "cna_cnb_document_get_container_major");
  LOAD_REQUIRED(cnb_document_get_container_minor, CnbDocumentU16OutFn, "cna_cnb_document_get_container_minor");
  LOAD_REQUIRED(cnb_document_get_asset_type_id, GameU32OutFn, "cna_cnb_document_get_asset_type_id");
  LOAD_REQUIRED(cnb_document_get_asset_schema_version, GameU32OutFn, "cna_cnb_document_get_asset_schema_version");
  LOAD_REQUIRED(cnb_document_get_chunk_count, HandleU64OutFn, "cna_cnb_document_get_chunk_count");
  LOAD_REQUIRED(cnb_document_get_chunk, CnbDocumentChunkFn, "cna_cnb_document_get_chunk");
  LOAD_REQUIRED(cnb_document_copy_chunk_data, CnbDocumentCopyChunkFn, "cna_cnb_document_copy_chunk_data");
  LOAD_REQUIRED(cnb_document_find_all, CnbDocumentFindAllFn, "cna_cnb_document_find_all");
  LOAD_REQUIRED(cnb_document_require_mandatory, CnbDocumentMandatoryFn, "cna_cnb_document_require_mandatory_chunks_understood");
  LOAD_REQUIRED(cnb_document_get_metadata, CnbDocumentMetadataFn, "cna_cnb_document_get_metadata");
  LOAD_REQUIRED(cnb_document_get_metadata_asset_type_name_size, HandleU64OutFn, "cna_cnb_document_get_metadata_asset_type_name_size");
  LOAD_REQUIRED(cnb_document_copy_metadata_asset_type_name, HandleCopyStringFn, "cna_cnb_document_copy_metadata_asset_type_name");
  LOAD_REQUIRED(cnb_document_get_metadata_content_name_size, HandleU64OutFn, "cna_cnb_document_get_metadata_content_name_size");
  LOAD_REQUIRED(cnb_document_copy_metadata_content_name, HandleCopyStringFn, "cna_cnb_document_copy_metadata_content_name");
  LOAD_REQUIRED(cnb_document_get_external_reference_count, HandleU64OutFn, "cna_cnb_document_get_external_reference_count");
  LOAD_REQUIRED(cnb_document_get_external_reference, CnbDocumentExternalFn, "cna_cnb_document_get_external_reference");
  LOAD_REQUIRED(cnb_document_get_external_reference_name_size, CnbDocumentIndexSizeFn, "cna_cnb_document_get_external_reference_name_size");
  LOAD_REQUIRED(cnb_document_copy_external_reference_name, CnbDocumentIndexCopyTextFn, "cna_cnb_document_copy_external_reference_name");
  LOAD_REQUIRED(cnb_decode_texture2d, CnbDecodeTextureFn, "cna_cnb_decode_texture2d");
  LOAD_REQUIRED(cnb_texture_data_destroy, CnbTextureDataDestroyFn, "cna_cnb_texture_data_destroy");
  LOAD_REQUIRED(cnb_texture_data_get_info, CnbTextureInfoFn, "cna_cnb_texture_data_get_info");
  LOAD_REQUIRED(cnb_texture_data_get_level_dimensions, CnbTextureLevelDimensionsFn, "cna_cnb_texture_data_get_level_dimensions");
  LOAD_REQUIRED(cnb_texture_data_get_representation_format, CnbTextureRepresentationFormatFn, "cna_cnb_texture_data_get_representation_format");
  LOAD_REQUIRED(cnb_texture_data_get_level_count, CnbTextureLevelCountFn, "cna_cnb_texture_data_get_level_count");
  LOAD_REQUIRED(cnb_texture_data_copy_level, CnbTextureCopyLevelFn, "cna_cnb_texture_data_copy_level");
  LOAD_REQUIRED(cnb_texture_data_create, CnbTextureCreateFn, "cna_cnb_texture_data_create");
  LOAD_REQUIRED(cnb_texture_data_create_rgba8, CnbTextureCreateRgba8Fn, "cna_cnb_texture_data_create_rgba8");
  LOAD_REQUIRED(cnb_texture_data_add_representation, CnbTextureAddRepresentationFn, "cna_cnb_texture_data_add_representation");
  LOAD_REQUIRED(cnb_texture_data_set_level, CnbTextureSetLevelFn, "cna_cnb_texture_data_set_level");
  LOAD_REQUIRED(cnb_encode_texture2d, CnbEncodeTextureFn, "cna_cnb_encode_texture2d");
  LOAD_REQUIRED(cnb_decode_sprite_font, CnbDecodeSpriteFontFn, "cna_cnb_decode_sprite_font");
  LOAD_REQUIRED(cnb_sprite_font_data_create, CnbSpriteFontCreateFn, "cna_cnb_sprite_font_data_create");
  LOAD_REQUIRED(cnb_sprite_font_data_destroy, CnbSpriteFontDestroyFn, "cna_cnb_sprite_font_data_destroy");
  LOAD_REQUIRED(cnb_sprite_font_data_get_info, CnbSpriteFontInfoFn, "cna_cnb_sprite_font_data_get_info");
  LOAD_REQUIRED(cnb_sprite_font_data_set_info, CnbSpriteFontSetInfoFn, "cna_cnb_sprite_font_data_set_info");
  LOAD_REQUIRED(cnb_sprite_font_data_get_glyph, CnbSpriteFontGetGlyphFn, "cna_cnb_sprite_font_data_get_glyph");
  LOAD_REQUIRED(cnb_sprite_font_data_add_glyph, CnbSpriteFontAddGlyphFn, "cna_cnb_sprite_font_data_add_glyph");
  LOAD_REQUIRED(cnb_sprite_font_data_set_atlas, CnbSpriteFontSetAtlasFn, "cna_cnb_sprite_font_data_set_atlas");
  LOAD_REQUIRED(cnb_sprite_font_data_copy_atlas, CnbSpriteFontCopyAtlasFn, "cna_cnb_sprite_font_data_copy_atlas");
  LOAD_REQUIRED(cnb_encode_sprite_font, CnbEncodeSpriteFontFn, "cna_cnb_encode_sprite_font");
  LOAD_REQUIRED(text_input_subscribe_input, TextInputSubscribeInputFn, "cna_text_input_subscribe_text_input_ext");
  LOAD_REQUIRED(text_input_subscribe_editing, TextInputSubscribeEditingFn, "cna_text_input_subscribe_text_editing_ext");
  LOAD_REQUIRED(text_input_subscribe_candidates, TextInputSubscribeCandidatesFn, "cna_text_input_subscribe_text_editing_candidates_ext");
  LOAD_REQUIRED(text_input_unsubscribe, TextInputUnsubscribeFn, "cna_text_input_unsubscribe_ext");
  LOAD_REQUIRED(text_input_raise_input, TextInputRaiseInputFn, "cna_text_input_raise_text_input_ext");
  LOAD_REQUIRED(text_input_raise_editing, TextInputRaiseEditingFn, "cna_text_input_raise_text_editing_ext");
  LOAD_REQUIRED(text_input_raise_candidates, TextInputRaiseCandidatesFn, "cna_text_input_raise_text_editing_candidates_ext");
  LOAD_REQUIRED(text_input_start, GameHandleFn, "cna_text_input_start_ext");
  LOAD_REQUIRED(text_input_start_with_type, TextInputStartWithTypeFn, "cna_text_input_start_with_type_ext");
  LOAD_REQUIRED(text_input_stop, GameHandleFn, "cna_text_input_stop_ext");
  LOAD_REQUIRED(text_input_is_active, BoolGetFn, "cna_text_input_is_active_ext");
  LOAD_REQUIRED(text_input_is_screen_keyboard_shown, BoolGetFn, "cna_text_input_is_screen_keyboard_shown_ext");
  LOAD_REQUIRED(text_input_set_rectangle, TextInputSetRectangleFn, "cna_text_input_set_input_rectangle_ext");
  LOAD_REQUIRED(text_input_reset_for_tests, GameHandleFn, "cna_text_input_reset_for_tests_ext");
  LOAD_REQUIRED(mouse_cursor_get_stock, MouseCursorStockFn, "cna_mouse_cursor_get_stock_ext");
  LOAD_REQUIRED(mouse_cursor_create_from_texture, MouseCursorFromTextureFn, "cna_mouse_cursor_create_from_texture2d");
  LOAD_REQUIRED(mouse_cursor_dispose, MouseCursorHandleFn, "cna_mouse_cursor_dispose");
  LOAD_REQUIRED(mouse_cursor_destroy, MouseCursorHandleFn, "cna_mouse_cursor_destroy");
  LOAD_REQUIRED(mouse_set_cursor, MouseSetCursorFn, "cna_mouse_set_cursor_ext");
  LOAD_REQUIRED(joystick_info_init, JoystickInfoInitFn, "cna_joystick_info_init");
  LOAD_REQUIRED(joystick_capabilities_init, JoystickCapabilitiesInitFn, "cna_joystick_capabilities_init");
  LOAD_REQUIRED(haptic_capabilities_init, HapticCapabilitiesInitFn, "cna_haptic_capabilities_init");
  LOAD_REQUIRED(joysticks_get_count, JoystickCountFn, "cna_joysticks_get_count");
  LOAD_REQUIRED(joysticks_get_info_at, JoystickInfoAtFn, "cna_joysticks_get_info_at");
  LOAD_REQUIRED(joysticks_get_name_size_at, GameU32IndexSizeFn, "cna_joysticks_get_name_size_at");
  LOAD_REQUIRED(joysticks_copy_name_at, GameU32IndexCopyTextFn, "cna_joysticks_copy_name_at");
  LOAD_REQUIRED(joysticks_get_capabilities, JoystickCapabilitiesFn, "cna_joysticks_get_capabilities");
  LOAD_REQUIRED(joysticks_get_capabilities_name_size, GameU32IndexSizeFn, "cna_joysticks_get_capabilities_name_size");
  LOAD_REQUIRED(joysticks_copy_capabilities_name, GameU32IndexCopyTextFn, "cna_joysticks_copy_capabilities_name");
  LOAD_REQUIRED(joysticks_get_capabilities_guid_size, GameU32IndexSizeFn, "cna_joysticks_get_capabilities_guid_size");
  LOAD_REQUIRED(joysticks_copy_capabilities_guid, GameU32IndexCopyTextFn, "cna_joysticks_copy_capabilities_guid");
  LOAD_REQUIRED(joysticks_capture_state, JoystickCaptureStateFn, "cna_joysticks_capture_state");
  LOAD_REQUIRED(joystick_state_get_axis_count, JoystickStateCountFn, "cna_joystick_state_get_axis_count");
  LOAD_REQUIRED(joystick_state_copy_axes, JoystickStateCopyAxesFn, "cna_joystick_state_copy_axes");
  LOAD_REQUIRED(joystick_state_get_button_count, JoystickStateCountFn, "cna_joystick_state_get_button_count");
  LOAD_REQUIRED(joystick_state_copy_buttons, JoystickStateCopyButtonsFn, "cna_joystick_state_copy_buttons");
  LOAD_REQUIRED(joystick_state_get_hat_count, JoystickStateCountFn, "cna_joystick_state_get_hat_count");
  LOAD_REQUIRED(joystick_state_copy_hats, JoystickStateCopyHatsFn, "cna_joystick_state_copy_hats");
  LOAD_REQUIRED(joystick_state_get_ball_count, JoystickStateCountFn, "cna_joystick_state_get_ball_count");
  LOAD_REQUIRED(joystick_state_copy_balls, JoystickStateCopyBallsFn, "cna_joystick_state_copy_balls");
  LOAD_REQUIRED(joystick_state_destroy, JoystickStateDestroyFn, "cna_joystick_state_destroy");
  LOAD_REQUIRED(haptics_get_count, JoystickCountFn, "cna_haptics_get_count");
  LOAD_REQUIRED(haptics_get_id_at, GameU32IndexU32OutFn, "cna_haptics_get_id_at");
  LOAD_REQUIRED(haptics_get_name_size_at, GameU32IndexSizeFn, "cna_haptics_get_name_size_at");
  LOAD_REQUIRED(haptics_copy_name_at, GameU32IndexCopyTextFn, "cna_haptics_copy_name_at");
  LOAD_REQUIRED(haptics_open, GameIndexHandleOutFn, "cna_haptics_open");
  LOAD_REQUIRED(haptics_open_from_joystick, GameIndexHandleOutFn, "cna_haptics_open_from_joystick");
  LOAD_REQUIRED(haptics_get_is_joystick_haptic, GameIdBoolOutFn, "cna_haptics_get_is_joystick_haptic");
  LOAD_REQUIRED(haptic_device_get_is_open, HandleBoolOutFn, "cna_haptic_device_get_is_open");
  LOAD_REQUIRED(haptic_device_get_capabilities, HapticCapabilitiesFn, "cna_haptic_device_get_capabilities");
  LOAD_REQUIRED(haptic_device_get_name_size, HandleU64OutFn, "cna_haptic_device_get_name_size");
  LOAD_REQUIRED(haptic_device_copy_name, HandleCopyStringFn, "cna_haptic_device_copy_name");
  LOAD_REQUIRED(haptic_device_init_rumble, HandleBoolOutFn, "cna_haptic_device_init_rumble");
  LOAD_REQUIRED(haptic_device_play_rumble, HapticPlayRumbleFn, "cna_haptic_device_play_rumble");
  LOAD_REQUIRED(haptic_device_stop_rumble, HandleBoolOutFn, "cna_haptic_device_stop_rumble");
  LOAD_REQUIRED(haptic_device_set_gain, HapticSetGainFn, "cna_haptic_device_set_gain");
  LOAD_REQUIRED(haptic_device_dispose, GameHandleFn, "cna_haptic_device_dispose");
  LOAD_REQUIRED(haptic_device_destroy, GameHandleFn, "cna_haptic_device_destroy");
  LOAD_REQUIRED(cnb_import_image_as_texture2d, CnbImportImageFn, "cna_cnb_import_image_as_texture2d");
  LOAD_REQUIRED(cnb_import_dds_as_texture_cube, CnbImportDdsFn, "cna_cnb_import_dds_as_texture_cube");
  LOAD_REQUIRED(cnb_import_wav_as_sound_effect, CnbImportWavFn, "cna_cnb_import_wav_as_sound_effect");
  LOAD_REQUIRED(curve_create, CurveCreateFn, "cna_curve_create");
  LOAD_REQUIRED(curve_destroy, CurveDestroyFn, "cna_curve_destroy");
  LOAD_REQUIRED(curve_get_keys, CurveGetKeysFn, "cna_curve_get_keys");
  LOAD_REQUIRED(curve_get_pre_loop, CurveGetLoopFn, "cna_curve_get_pre_loop");
  LOAD_REQUIRED(curve_set_pre_loop, CurveSetLoopFn, "cna_curve_set_pre_loop");
  LOAD_REQUIRED(curve_get_post_loop, CurveGetLoopFn, "cna_curve_get_post_loop");
  LOAD_REQUIRED(curve_set_post_loop, CurveSetLoopFn, "cna_curve_set_post_loop");
  LOAD_REQUIRED(curve_get_is_constant, CurveGetIsConstantFn, "cna_curve_get_is_constant");
  LOAD_REQUIRED(curve_key_collection_destroy, CurveKeyCollectionDestroyFn, "cna_curve_key_collection_destroy");
  LOAD_REQUIRED(curve_key_collection_get_count, CurveKeyCollectionCountFn, "cna_curve_key_collection_get_count");
  LOAD_REQUIRED(curve_key_collection_get, CurveKeyCollectionGetFn, "cna_curve_key_collection_get");
  LOAD_REQUIRED(curve_key_collection_add, CurveKeyCollectionAddFn, "cna_curve_key_collection_add");
  LOAD_REQUIRED(curve_key_init_full, CurveKeyInitFullFn, "cna_curve_key_init_full");
  LOAD_REQUIRED(cnb_encode_curve, CnbEncodeCurveFn, "cna_cnb_encode_curve");
  LOAD_REQUIRED(cnb_decode_curve, CnbDecodeCurveFn, "cna_cnb_decode_curve");
  LOAD_REQUIRED(cnb_encode_animation_clip, CnbEncodeAnimationClipFn, "cna_cnb_encode_animation_clip");
  LOAD_REQUIRED(cnb_decode_animation_clip, CnbDecodeAnimationClipFn, "cna_cnb_decode_animation_clip");
  LOAD_REQUIRED(cnb_animation_clip_destroy, CnbAnimationClipDestroyFn, "cna_cnb_animation_clip_destroy");
  LOAD_REQUIRED(cnb_animation_clip_get, CnbAnimationClipGetFn, "cna_cnb_animation_clip_get");
  LOAD_REQUIRED(cnb_animation_clip_get_track, CnbAnimationClipGetTrackFn, "cna_cnb_animation_clip_get_track");
  LOAD_REQUIRED(cnb_animation_clip_copy_keyframes, CnbAnimationClipCopyKeyframesFn, "cna_cnb_animation_clip_copy_keyframes");
  LOAD_REQUIRED(cnb_sound_effect_data_create, CnbSoundEffectCreateFn, "cna_cnb_sound_effect_data_create");
  LOAD_REQUIRED(cnb_sound_effect_data_destroy, CnbSoundEffectDestroyFn, "cna_cnb_sound_effect_data_destroy");
  LOAD_REQUIRED(cnb_sound_effect_data_get_info, CnbSoundEffectInfoFn, "cna_cnb_sound_effect_data_get_info");
  LOAD_REQUIRED(cnb_sound_effect_data_copy_samples, CnbSoundEffectCopySamplesFn, "cna_cnb_sound_effect_data_copy_samples");
  LOAD_REQUIRED(cnb_encode_sound_effect, CnbEncodeSoundEffectFn, "cna_cnb_encode_sound_effect");
  LOAD_REQUIRED(cnb_decode_sound_effect, CnbDecodeSoundEffectFn, "cna_cnb_decode_sound_effect");
  LOAD_REQUIRED(cnb_decode_wav_as_sound_effect, CnbDecodeWavFn, "cna_cnb_decode_wav_as_sound_effect");
  LOAD_REQUIRED(cnb_encode_song, CnbEncodeSongFn, "cna_cnb_encode_song");
  LOAD_REQUIRED(cnb_decode_song_duration, CnbDecodeSongDurationFn, "cna_cnb_decode_song_duration_milliseconds");
  LOAD_REQUIRED(cnb_decode_song_name_size, CnbDocumentTextSizeFn, "cna_cnb_decode_song_name_size");
  LOAD_REQUIRED(cnb_decode_song_name, CnbDocumentTextCopyFn, "cna_cnb_decode_song_name");
  LOAD_REQUIRED(cnb_decode_song_stream_reference_size, CnbDocumentTextSizeFn, "cna_cnb_decode_song_stream_reference_size");
  LOAD_REQUIRED(cnb_decode_song_stream_reference, CnbDocumentTextCopyFn, "cna_cnb_decode_song_stream_reference");
  LOAD_REQUIRED(cnb_encode_video, CnbEncodeVideoFn, "cna_cnb_encode_video");
  LOAD_REQUIRED(cnb_decode_video, CnbDecodeVideoFn, "cna_cnb_decode_video");
  LOAD_REQUIRED(cnb_decode_video_stream_reference_size, CnbDocumentTextSizeFn, "cna_cnb_decode_video_stream_reference_size");
  LOAD_REQUIRED(cnb_decode_video_stream_reference, CnbDocumentTextCopyFn, "cna_cnb_decode_video_stream_reference");
  LOAD_REQUIRED(cnb_model_create, CnbModelCreateFn, "cna_cnb_model_create");
  LOAD_REQUIRED(cnb_model_destroy, CnbModelDestroyFn, "cna_cnb_model_destroy");
  LOAD_REQUIRED(cnb_model_set_flags, CnbModelSetFlagsFn, "cna_cnb_model_set_flags");
  LOAD_REQUIRED(cnb_model_get_info, CnbModelInfoFn, "cna_cnb_model_get_info");
  LOAD_REQUIRED(cnb_model_add_bone, CnbModelAddBoneFn, "cna_cnb_model_add_bone");
  LOAD_REQUIRED(cnb_model_get_bone, CnbModelGetBoneFn, "cna_cnb_model_get_bone");
  LOAD_REQUIRED(cnb_model_get_bone_name_size, CnbModelIndexSizeFn, "cna_cnb_model_get_bone_name_size");
  LOAD_REQUIRED(cnb_model_copy_bone_name, CnbModelIndexCopyTextFn, "cna_cnb_model_copy_bone_name");
  LOAD_REQUIRED(cnb_model_add_part, CnbModelAddPartFn, "cna_cnb_model_add_part");
  LOAD_REQUIRED(cnb_model_get_part, CnbModelGetPartFn, "cna_cnb_model_get_part");
  LOAD_REQUIRED(cnb_model_get_part_name_size, CnbModelIndexSizeFn, "cna_cnb_model_get_part_name_size");
  LOAD_REQUIRED(cnb_model_copy_part_name, CnbModelIndexCopyTextFn, "cna_cnb_model_copy_part_name");
  LOAD_REQUIRED(cnb_model_get_part_external_effect_size, CnbModelIndexSizeFn, "cna_cnb_model_get_part_external_effect_size");
  LOAD_REQUIRED(cnb_model_copy_part_external_effect, CnbModelIndexCopyTextFn, "cna_cnb_model_copy_part_external_effect");
  LOAD_REQUIRED(cnb_model_set_part_vertex_bytes, CnbModelSetPartBytesFn, "cna_cnb_model_set_part_vertex_bytes");
  LOAD_REQUIRED(cnb_model_copy_part_vertex_bytes, CnbModelIndexCopyBytesFn, "cna_cnb_model_copy_part_vertex_bytes");
  LOAD_REQUIRED(cnb_model_set_part_index_bytes, CnbModelSetPartBytesFn, "cna_cnb_model_set_part_index_bytes");
  LOAD_REQUIRED(cnb_model_copy_part_index_bytes, CnbModelIndexCopyBytesFn, "cna_cnb_model_copy_part_index_bytes");
  LOAD_REQUIRED(cnb_model_get_material, CnbModelGetMaterialFn, "cna_cnb_model_get_material");
  LOAD_REQUIRED(cnb_model_set_material, CnbModelSetMaterialFn, "cna_cnb_model_set_material");
  LOAD_REQUIRED(cnb_model_get_material_texture_size, CnbModelMaterialTextureSizeFn, "cna_cnb_model_get_material_texture_size");
  LOAD_REQUIRED(cnb_model_copy_material_texture, CnbModelMaterialTextureCopyFn, "cna_cnb_model_copy_material_texture");
  LOAD_REQUIRED(cnb_model_set_material_texture, CnbModelSetMaterialTextureFn, "cna_cnb_model_set_material_texture");
  LOAD_REQUIRED(cnb_model_add_mesh, CnbModelAddMeshFn, "cna_cnb_model_add_mesh");
  LOAD_REQUIRED(cnb_model_get_mesh, CnbModelGetMeshFn, "cna_cnb_model_get_mesh");
  LOAD_REQUIRED(cnb_model_get_mesh_name_size, CnbModelIndexSizeFn, "cna_cnb_model_get_mesh_name_size");
  LOAD_REQUIRED(cnb_model_copy_mesh_name, CnbModelIndexCopyTextFn, "cna_cnb_model_copy_mesh_name");
  LOAD_REQUIRED(cnb_model_copy_mesh_part_indices, CnbModelCopyMeshPartsFn, "cna_cnb_model_copy_mesh_part_indices");
  LOAD_REQUIRED(cnb_model_set_skeleton, CnbModelSetSkeletonFn, "cna_cnb_model_set_skeleton");
  LOAD_REQUIRED(cnb_model_get_skeleton, CnbModelGetSkeletonFn, "cna_cnb_model_get_skeleton");
  LOAD_REQUIRED(cnb_model_copy_skeleton_hierarchy, CnbModelCopyHierarchyFn, "cna_cnb_model_copy_skeleton_hierarchy");
  LOAD_REQUIRED(cnb_model_copy_skeleton_matrices, CnbModelCopySkeletonMatricesFn, "cna_cnb_model_copy_skeleton_matrices");
  LOAD_REQUIRED(cnb_model_add_light, CnbModelAddLightFn, "cna_cnb_model_add_light");
  LOAD_REQUIRED(cnb_model_get_light, CnbModelGetLightFn, "cna_cnb_model_get_light");
  LOAD_REQUIRED(cnb_encode_model, CnbEncodeModelFn, "cna_cnb_encode_model");
  LOAD_REQUIRED(cnb_decode_model, CnbDecodeModelFn, "cna_cnb_decode_model");


  LOAD_REQUIRED(post_process_context_init, PostProcessContextInitFn, "cna_post_process_context_init");
  LOAD_REQUIRED(blit_pass_create, PostProcessPassCreateFn, "cna_blit_pass_create");
  LOAD_REQUIRED(bloom_pass_create, PostProcessPassCreateFn, "cna_bloom_pass_create");
  LOAD_REQUIRED(tonemap_pass_create, PostProcessPassCreateFn, "cna_tonemap_pass_create");
  LOAD_REQUIRED(fxaa_pass_create, PostProcessPassCreateFn, "cna_fxaa_pass_create");
  LOAD_REQUIRED(ssao_pass_create, PostProcessPassCreateFn, "cna_ssao_pass_create");
  LOAD_REQUIRED(ssr_pass_create, PostProcessPassCreateFn, "cna_ssr_pass_create");
  LOAD_REQUIRED(bloom_get_intensity, HandleFloatOutFn, "cna_bloom_pass_get_intensity");
  LOAD_REQUIRED(bloom_set_intensity, HandleFloatFn, "cna_bloom_pass_set_intensity");
  LOAD_REQUIRED(bloom_get_threshold, HandleFloatOutFn, "cna_bloom_pass_get_threshold");
  LOAD_REQUIRED(bloom_set_threshold, HandleFloatFn, "cna_bloom_pass_set_threshold");
  LOAD_REQUIRED(tonemap_get_exposure, HandleFloatOutFn, "cna_tonemap_pass_get_exposure");
  LOAD_REQUIRED(tonemap_set_exposure, HandleFloatFn, "cna_tonemap_pass_set_exposure");
  LOAD_REQUIRED(tonemap_get_gamma, HandleFloatOutFn, "cna_tonemap_pass_get_gamma");
  LOAD_REQUIRED(tonemap_set_gamma, HandleFloatFn, "cna_tonemap_pass_set_gamma");
  LOAD_REQUIRED(tonemap_get_deband_strength, HandleFloatOutFn, "cna_tonemap_pass_get_deband_strength");
  LOAD_REQUIRED(tonemap_set_deband_strength, HandleFloatFn, "cna_tonemap_pass_set_deband_strength");
  LOAD_REQUIRED(fxaa_get_edge_threshold, HandleFloatOutFn, "cna_fxaa_pass_get_edge_threshold");
  LOAD_REQUIRED(fxaa_set_edge_threshold, HandleFloatFn, "cna_fxaa_pass_set_edge_threshold");
  LOAD_REQUIRED(ssao_get_radius, HandleFloatOutFn, "cna_ssao_pass_get_radius");
  LOAD_REQUIRED(ssao_set_radius, HandleFloatFn, "cna_ssao_pass_set_radius");
  LOAD_REQUIRED(ssao_get_intensity, HandleFloatOutFn, "cna_ssao_pass_get_intensity");
  LOAD_REQUIRED(ssao_set_intensity, HandleFloatFn, "cna_ssao_pass_set_intensity");
  LOAD_REQUIRED(ssr_get_intensity, HandleFloatOutFn, "cna_ssr_pass_get_intensity");
  LOAD_REQUIRED(ssr_set_intensity, HandleFloatFn, "cna_ssr_pass_set_intensity");
  LOAD_REQUIRED(ssr_get_max_distance, HandleFloatOutFn, "cna_ssr_pass_get_max_distance");
  LOAD_REQUIRED(ssr_set_max_distance, HandleFloatFn, "cna_ssr_pass_set_max_distance");
  LOAD_REQUIRED(ssr_get_thickness, HandleFloatOutFn, "cna_ssr_pass_get_thickness");
  LOAD_REQUIRED(ssr_set_thickness, HandleFloatFn, "cna_ssr_pass_set_thickness");
  LOAD_REQUIRED(ssr_get_depth_bias, HandleFloatOutFn, "cna_ssr_pass_get_depth_bias");
  LOAD_REQUIRED(ssr_set_depth_bias, HandleFloatFn, "cna_ssr_pass_set_depth_bias");
  LOAD_REQUIRED(ssr_get_edge_fade, HandleFloatOutFn, "cna_ssr_pass_get_edge_fade");
  LOAD_REQUIRED(ssr_set_edge_fade, HandleFloatFn, "cna_ssr_pass_set_edge_fade");
  LOAD_REQUIRED(ssr_get_roughness_blur, HandleFloatOutFn, "cna_ssr_pass_get_roughness_blur");
  LOAD_REQUIRED(ssr_set_roughness_blur, HandleFloatFn, "cna_ssr_pass_set_roughness_blur");
  LOAD_REQUIRED(bloom_get_iterations, HandleI32OutFn, "cna_bloom_pass_get_iterations");
  LOAD_REQUIRED(bloom_set_iterations, HandleI32Fn, "cna_bloom_pass_set_iterations");
  LOAD_REQUIRED(ssao_get_sample_count, HandleI32OutFn, "cna_ssao_pass_get_sample_count");
  LOAD_REQUIRED(ssao_set_sample_count, HandleI32Fn, "cna_ssao_pass_set_sample_count");
  LOAD_REQUIRED(ssr_get_step_count, HandleI32OutFn, "cna_ssr_pass_get_step_count");
  LOAD_REQUIRED(ssr_set_step_count, HandleI32Fn, "cna_ssr_pass_set_step_count");
  LOAD_REQUIRED(ssao_get_half_resolution, BoolGetFn, "cna_ssao_pass_get_half_resolution");
  LOAD_REQUIRED(ssao_set_half_resolution, HandleBoolFn, "cna_ssao_pass_set_half_resolution");
  LOAD_REQUIRED(tonemap_get_mode, GameU32OutFn, "cna_tonemap_pass_get_mode");
  LOAD_REQUIRED(tonemap_set_mode, HandleU32Fn, "cna_tonemap_pass_set_mode");
  LOAD_REQUIRED(tonemap_is_deband_enabled, BoolGetFn, "cna_tonemap_pass_is_deband_enabled");
  LOAD_REQUIRED(tonemap_set_deband_enabled, HandleBoolFn, "cna_tonemap_pass_set_deband_enabled");
  LOAD_REQUIRED(bloom_iterations_for_quality, U32ToI32OutFn, "cna_bloom_pass_iterations_for_quality");
  LOAD_REQUIRED(fxaa_edge_threshold_for_quality, U32ToFloatOutFn, "cna_fxaa_pass_edge_threshold_for_quality");
  LOAD_REQUIRED(ssao_sample_count_for_quality, U32ToI32OutFn, "cna_ssao_pass_sample_count_for_quality");
  LOAD_REQUIRED(bloom_reset_targets, GameHandleFn, "cna_bloom_pass_reset_targets");
  LOAD_REQUIRED(ssao_reset_targets, GameHandleFn, "cna_ssao_pass_reset_targets");
  LOAD_REQUIRED(post_process_pass_apply, PostProcessPassApplyFn, "cna_post_process_pass_apply");
  LOAD_REQUIRED(post_process_pass_copy_name, HandleCopyStringFn, "cna_post_process_pass_copy_name");
  LOAD_REQUIRED(post_process_pass_is_supported, PostProcessPassSupportedFn, "cna_post_process_pass_is_supported");
  LOAD_REQUIRED(post_process_pass_destroy, GameHandleFn, "cna_post_process_pass_destroy");
  LOAD_REQUIRED(post_process_chain_create, HandleHandleOutFn, "cna_post_process_chain_create");
  LOAD_REQUIRED(post_process_chain_destroy, GameHandleFn, "cna_post_process_chain_destroy");
  LOAD_REQUIRED(post_process_chain_add_pass, TwoHandleFn, "cna_post_process_chain_add_pass");
  LOAD_REQUIRED(post_process_chain_add_owned_pass, TwoHandleFn, "cna_post_process_chain_add_owned_pass");

  LOAD_REQUIRED(clustered_light_ext_init, ClusteredLightInitFn, "cna_clustered_light_ext_init");
  LOAD_REQUIRED(clustered_light_set_is_usable, ClusteredLightUsableFn, "cna_clustered_light_set_is_usable");
  LOAD_REQUIRED(clustered_light_set_create, HandleHandleOutFn, "cna_clustered_light_set_create");
  LOAD_REQUIRED(clustered_light_set_add, ClusteredLightAddFn, "cna_clustered_light_set_add");
  LOAD_REQUIRED(point_light_ext_init, PointLightInitFn, "cna_point_light_ext_init");
  LOAD_REQUIRED(spot_light_ext_init, SpotLightInitFn, "cna_spot_light_ext_init");
  LOAD_REQUIRED(clustered_light_set_add_point, ClusteredAddPointFn, "cna_clustered_light_set_add_point");
  LOAD_REQUIRED(clustered_light_set_add_spot, ClusteredAddSpotFn, "cna_clustered_light_set_add_spot");
  LOAD_REQUIRED(clustered_light_set_replace_at, ClusteredLightReplaceFn, "cna_clustered_light_set_replace_at");
  LOAD_REQUIRED(clustered_light_set_remove_at, HandleI32Fn, "cna_clustered_light_set_remove_at");
  LOAD_REQUIRED(clustered_light_set_clear, GameHandleFn, "cna_clustered_light_set_clear");
  LOAD_REQUIRED(clustered_light_set_get_count, HandleI32OutFn, "cna_clustered_light_set_get_count");
  LOAD_REQUIRED(clustered_light_set_is_empty, HandleBoolOutFn, "cna_clustered_light_set_is_empty");
  LOAD_REQUIRED(clustered_light_set_get_at, ClusteredLightGetAtFn, "cna_clustered_light_set_get_at");
  LOAD_REQUIRED(clustered_light_set_copy_lights, ClusteredLightCopyFn, "cna_clustered_light_set_copy_lights");
  LOAD_REQUIRED(clustered_light_set_get_bounds_at, ClusteredBoundsAtFn, "cna_clustered_light_set_get_bounds_at");
  LOAD_REQUIRED(clustered_light_set_copy_bounds, ClusteredBoundsCopyFn, "cna_clustered_light_set_copy_bounds");
  LOAD_REQUIRED(clustered_light_set_destroy, GameHandleFn, "cna_clustered_light_set_destroy");
  LOAD_REQUIRED(clustered_light_grid_create, ClusteredGridCreateFn, "cna_clustered_light_grid_create");
  LOAD_REQUIRED(clustered_light_grid_get_tiles_x, HandleI32OutFn, "cna_clustered_light_grid_get_tiles_x");
  LOAD_REQUIRED(clustered_light_grid_get_tiles_y, HandleI32OutFn, "cna_clustered_light_grid_get_tiles_y");
  LOAD_REQUIRED(clustered_light_grid_get_slice_count, HandleI32OutFn, "cna_clustered_light_grid_get_slice_count");
  LOAD_REQUIRED(clustered_light_grid_get_cluster_count, HandleI32OutFn, "cna_clustered_light_grid_get_cluster_count");
  LOAD_REQUIRED(clustered_light_grid_cluster_index, ClusteredClusterIndexFn, "cna_clustered_light_grid_cluster_index");
  LOAD_REQUIRED(clustered_light_grid_set_projection, ClusteredSetProjectionFn, "cna_clustered_light_grid_set_projection");
  LOAD_REQUIRED(clustered_light_grid_has_projection, HandleBoolOutFn, "cna_clustered_light_grid_has_projection");
  LOAD_REQUIRED(clustered_light_grid_get_near_plane, HandleFloatOutFn, "cna_clustered_light_grid_get_near_plane");
  LOAD_REQUIRED(clustered_light_grid_get_far_plane, HandleFloatOutFn, "cna_clustered_light_grid_get_far_plane");
  LOAD_REQUIRED(clustered_light_grid_get_inverse_projection, ClusteredMatrixOutFn, "cna_clustered_light_grid_get_inverse_projection");
  LOAD_REQUIRED(clustered_light_grid_slice_distance, ClusteredSliceDistanceFn, "cna_clustered_light_grid_slice_distance");
  LOAD_REQUIRED(clustered_light_grid_slice_for_view_distance, ClusteredSliceForDistanceFn, "cna_clustered_light_grid_slice_for_view_distance");
  LOAD_REQUIRED(clustered_light_grid_cluster_bounds, ClusteredClusterBoundsFn, "cna_clustered_light_grid_cluster_bounds");
  LOAD_REQUIRED(clustered_light_grid_destroy, GameHandleFn, "cna_clustered_light_grid_destroy");
  LOAD_REQUIRED(clustered_light_assignment_create, HandleHandleOutFn, "cna_clustered_light_assignment_create");
  LOAD_REQUIRED(clustered_light_assignment_assign, ClusteredAssignFn, "cna_clustered_light_assignment_assign");
  LOAD_REQUIRED(clustered_light_assignment_clear, GameHandleFn, "cna_clustered_light_assignment_clear");
  LOAD_REQUIRED(clustered_light_assignment_get_light_count, HandleI32OutFn, "cna_clustered_light_assignment_get_light_count");
  LOAD_REQUIRED(clustered_light_assignment_get_cluster_count, HandleI32OutFn, "cna_clustered_light_assignment_get_cluster_count");
  LOAD_REQUIRED(clustered_light_assignment_copy_lights_in_cluster, ClusteredClusterListFn, "cna_clustered_light_assignment_copy_lights_in_cluster");
  LOAD_REQUIRED(clustered_light_assignment_copy_indices, ClusteredCopyI32Fn, "cna_clustered_light_assignment_copy_indices");
  LOAD_REQUIRED(clustered_light_assignment_copy_offsets, ClusteredCopyI32Fn, "cna_clustered_light_assignment_copy_offsets");
  LOAD_REQUIRED(clustered_light_assignment_get_total_reference_count, HandleI32OutFn, "cna_clustered_light_assignment_get_total_reference_count");
  LOAD_REQUIRED(clustered_light_assignment_get_max_lights_per_cluster, HandleI32OutFn, "cna_clustered_light_assignment_get_max_lights_per_cluster");
  LOAD_REQUIRED(clustered_light_assignment_destroy, GameHandleFn, "cna_clustered_light_assignment_destroy");
  LOAD_REQUIRED(clustered_shadow_policy_create, ClusteredPolicyCreateFn, "cna_clustered_shadow_policy_create");
  LOAD_REQUIRED(clustered_shadow_policy_get_budget, HandleI32OutFn, "cna_clustered_shadow_policy_get_budget");
  LOAD_REQUIRED(clustered_shadow_policy_set_budget, HandleI32Fn, "cna_clustered_shadow_policy_set_budget");
  LOAD_REQUIRED(clustered_shadow_policy_get_hysteresis, HandleFloatOutFn, "cna_clustered_shadow_policy_get_hysteresis");
  LOAD_REQUIRED(clustered_shadow_policy_set_hysteresis, HandleFloatFn, "cna_clustered_shadow_policy_set_hysteresis");
  LOAD_REQUIRED(clustered_shadow_policy_copy_selected, ClusteredCopyI32Fn, "cna_clustered_shadow_policy_copy_selected");
  LOAD_REQUIRED(clustered_shadow_policy_is_selected, ClusteredIsSelectedFn, "cna_clustered_shadow_policy_is_selected");
  LOAD_REQUIRED(clustered_shadow_policy_get_score, ClusteredScoreFn, "cna_clustered_shadow_policy_get_score");
  LOAD_REQUIRED(clustered_shadow_policy_get_request_count, HandleI32OutFn, "cna_clustered_shadow_policy_get_request_count");
  LOAD_REQUIRED(clustered_shadow_policy_get_refused_count, HandleI32OutFn, "cna_clustered_shadow_policy_get_refused_count");
  LOAD_REQUIRED(clustered_shadow_policy_reset, GameHandleFn, "cna_clustered_shadow_policy_reset");
  LOAD_REQUIRED(clustered_shadow_policy_select, ClusteredSelectFn, "cna_clustered_shadow_policy_select");
  LOAD_REQUIRED(lod_group_ext_create, LodCreateFn, "cna_lod_group_ext_create");
  LOAD_REQUIRED(lod_group_ext_destroy, GameHandleFn, "cna_lod_group_ext_destroy");
  LOAD_REQUIRED(lod_group_ext_add_level, LodAddLevelFn, "cna_lod_group_ext_add_level");
  LOAD_REQUIRED(lod_group_ext_clear, GameHandleFn, "cna_lod_group_ext_clear");
  LOAD_REQUIRED(lod_group_ext_copy_levels, LodCopyLevelsFn, "cna_lod_group_ext_copy_levels");
  LOAD_REQUIRED(lod_group_ext_select_index, LodSelectIndexFn, "cna_lod_group_ext_select_index");
  LOAD_REQUIRED(lod_group_ext_get_hysteresis, HandleFloatOutFn, "cna_lod_group_ext_get_hysteresis");
  LOAD_REQUIRED(lod_group_ext_set_hysteresis, HandleFloatFn, "cna_lod_group_ext_set_hysteresis");
  LOAD_REQUIRED(lod_group_ext_reset_hysteresis, GameHandleFn, "cna_lod_group_ext_reset_hysteresis");
  LOAD_REQUIRED(lod_group_ext_get_selection_mode, LodModeOutFn, "cna_lod_group_ext_get_selection_mode");
  LOAD_REQUIRED(lod_group_ext_set_selection_mode, LodModeInFn, "cna_lod_group_ext_set_selection_mode");
  LOAD_REQUIRED(lod_group_ext_set_screen_space_parameters, LodScreenSpaceFn, "cna_lod_group_ext_set_screen_space_parameters");
  LOAD_REQUIRED(lod_group_ext_projected_radius_pixels, LodProjectedRadiusFn, "cna_lod_group_ext_projected_radius_pixels");
  LOAD_REQUIRED(shadow_map_create, ShadowMapCreateFn, "cna_shadow_map_create");
  LOAD_REQUIRED(shadow_map_destroy, GameHandleFn, "cna_shadow_map_destroy");
  LOAD_REQUIRED(shadow_map_is_supported, HandleBoolOutFn, "cna_shadow_map_is_supported");
  LOAD_REQUIRED(shadow_map_get_size, HandleI32OutFn, "cna_shadow_map_get_size");
  LOAD_REQUIRED(shadow_map_get_quality, ShadowMapQualityOutFn, "cna_shadow_map_get_quality");
  LOAD_REQUIRED(shadow_map_get_depth_bias, HandleFloatOutFn, "cna_shadow_map_get_depth_bias");
  LOAD_REQUIRED(shadow_map_set_depth_bias, HandleFloatFn, "cna_shadow_map_set_depth_bias");
  LOAD_REQUIRED(shadow_map_get_filter_radius, HandleI32OutFn, "cna_shadow_map_get_filter_radius");
  LOAD_REQUIRED(shadow_map_get_light_view_projection, ShadowMapMatrixOutFn, "cna_shadow_map_get_light_view_projection");
  LOAD_REQUIRED(shadow_map_compute_light_view, ShadowLightViewFn, "cna_shadow_map_compute_light_view");
  LOAD_REQUIRED(shadow_map_compute_light_projection, ShadowLightProjectionFn, "cna_shadow_map_compute_light_projection");
  LOAD_REQUIRED(shadow_map_size_for_quality, ShadowQualityToI32Fn, "cna_shadow_map_size_for_quality");
  LOAD_REQUIRED(shadow_map_filter_radius_for_quality, ShadowQualityToI32Fn, "cna_shadow_map_filter_radius_for_quality");
  LOAD_REQUIRED(directional_light_ext_init, DirectionalLightInitFn, "cna_directional_light_ext_init");
  LOAD_REQUIRED(particle_system_create_with_capacity, ParticleSystemCreateFn, "cna_particle_system_create_with_capacity");
  LOAD_REQUIRED(particle_system_destroy, GameHandleFn, "cna_particle_system_destroy");
  LOAD_REQUIRED(particle_system_get_capacity, HandleI32OutFn, "cna_particle_system_get_capacity");
  LOAD_REQUIRED(particle_system_get_settings, ParticleSettingsOutFn, "cna_particle_system_get_settings");
  LOAD_REQUIRED(particle_system_set_settings, ParticleSettingsInFn, "cna_particle_system_set_settings");
  LOAD_REQUIRED(particle_system_reset, GameHandleFn, "cna_particle_system_reset");
  LOAD_REQUIRED(particle_system_update, HandleFloatFn, "cna_particle_system_update");
  LOAD_REQUIRED(particle_system_uses_compute, HandleBoolOutFn, "cna_particle_system_uses_compute");
  LOAD_REQUIRED(particle_system_is_simulation_on_cpu_ext, HandleBoolOutFn, "cna_particle_system_is_simulation_on_cpu_ext");
  LOAD_REQUIRED(particle_system_set_simulation_on_cpu_ext, HandleBoolFn, "cna_particle_system_set_simulation_on_cpu_ext");
  LOAD_REQUIRED(particle_system_copy_unsupported_reason, HandleCopyStringFn, "cna_particle_system_copy_unsupported_reason");
  LOAD_REQUIRED(particle_system_get_active_count, HandleI32OutFn, "cna_particle_system_get_active_count");
  LOAD_REQUIRED(particle_system_is_emission_rate_clamped, HandleBoolOutFn, "cna_particle_system_is_emission_rate_clamped");
  LOAD_REQUIRED(particle_system_copy_particles_ext, ParticleCopyFn, "cna_particle_system_copy_particles_ext");
  LOAD_REQUIRED(particle_system_step, ParticleStepFn, "cna_particle_system_step");
  LOAD_REQUIRED(particle_system_random, ParticleRandomFn, "cna_particle_system_random");
  LOAD_REQUIRED(particle_emitter_settings_init, ParticleSettingsInitFn, "cna_particle_emitter_settings_init");
  LOAD_REQUIRED(particle_init, ParticleInitFn, "cna_particle_init");
  LOAD_REQUIRED(cascaded_shadow_map_compute_split_distances, CascadeSplitsFn, "cna_cascaded_shadow_map_compute_split_distances");
  LOAD_REQUIRED(cascaded_shadow_map_compute_frustum_corners, CascadeCornersFn, "cna_cascaded_shadow_map_compute_frustum_corners");
  LOAD_REQUIRED(cascaded_shadow_map_compute_bounding_sphere, CascadeSphereFn, "cna_cascaded_shadow_map_compute_bounding_sphere");
  LOAD_REQUIRED(spot_shadow_map_compute_light_view, SpotShadowMatrixFn, "cna_spot_shadow_map_compute_light_view");
  LOAD_REQUIRED(spot_shadow_map_compute_light_projection, SpotShadowMatrixFn, "cna_spot_shadow_map_compute_light_projection");
  LOAD_REQUIRED(cube_shadow_map_compute_face_view, CubeFaceViewFn, "cna_cube_shadow_map_compute_face_view");
  LOAD_REQUIRED(cube_shadow_map_compute_face_projection, CubeFaceProjectionFn, "cna_cube_shadow_map_compute_face_projection");
  LOAD_REQUIRED(cube_shadow_map_size_for_quality, ShadowQualityToI32Fn, "cna_cube_shadow_map_size_for_quality");
  LOAD_REQUIRED(clustered_shadow_policy_destroy, GameHandleFn, "cna_clustered_shadow_policy_destroy");

  LOAD_REQUIRED(presentation_parameters_init, PresentationParametersInitFn, "cna_presentation_parameters_init");
  LOAD_REQUIRED(graphics_device_create, StandaloneDeviceCreateFn, "cna_graphics_device_create");
  LOAD_REQUIRED(graphics_device_destroy, GameHandleFn, "cna_graphics_device_destroy");
  LOAD_REQUIRED(graphics_device_supports_capability, GraphicsCapabilityFn, "cna_graphics_device_supports_capability");
  LOAD_REQUIRED(graphics_device_get_max_compute_work_group_count_ext, DeviceAxisI32OutFn, "cna_graphics_device_get_max_compute_work_group_count_ext");
  LOAD_REQUIRED(graphics_device_get_max_compute_work_group_size_ext, DeviceAxisI32OutFn, "cna_graphics_device_get_max_compute_work_group_size_ext");
  LOAD_REQUIRED(graphics_device_get_max_compute_work_group_invocations_ext, HandleI32OutFn, "cna_graphics_device_get_max_compute_work_group_invocations_ext");
  LOAD_REQUIRED(storage_buffer_create, StorageBufferCreateFn, "cna_storage_buffer_create");
  LOAD_REQUIRED(storage_buffer_create_typed, StorageBufferCreateTypedFn, "cna_storage_buffer_create_typed");
  LOAD_REQUIRED(storage_buffer_set_bytes, StorageBufferSetBytesFn, "cna_storage_buffer_set_bytes");
  LOAD_REQUIRED(storage_buffer_get_bytes, StorageBufferGetBytesFn, "cna_storage_buffer_get_bytes");
  LOAD_REQUIRED(storage_buffer_get_byte_size, HandleU64OutFn, "cna_storage_buffer_get_byte_size");
  LOAD_REQUIRED(storage_buffer_set_elements, StorageBufferSetElementsFn, "cna_storage_buffer_set_elements");
  LOAD_REQUIRED(storage_buffer_get_elements, StorageBufferGetElementsFn, "cna_storage_buffer_get_elements");
  LOAD_REQUIRED(storage_buffer_get_element_count, HandleU64OutFn, "cna_storage_buffer_get_element_count");
  LOAD_REQUIRED(storage_buffer_get_element_byte_size, HandleU64OutFn, "cna_storage_buffer_get_element_byte_size");
  LOAD_REQUIRED(storage_buffer_destroy, GameHandleFn, "cna_storage_buffer_destroy");
  LOAD_REQUIRED(compute_shader_create, ComputeShaderCreateFn, "cna_compute_shader_create");
  LOAD_REQUIRED(compute_shader_set_uniform_int, ComputeShaderUniformIntFn, "cna_compute_shader_set_uniform_int");
  LOAD_REQUIRED(compute_shader_set_uniform_float, ComputeShaderUniformFloatFn, "cna_compute_shader_set_uniform_float");
  LOAD_REQUIRED(compute_shader_bind_storage_buffer, ComputeShaderBindBufferFn, "cna_compute_shader_bind_storage_buffer");
  LOAD_REQUIRED(compute_shader_bind_texture, ComputeShaderBindTextureFn, "cna_compute_shader_bind_texture");
  LOAD_REQUIRED(compute_shader_is_image_binding_supported, HandleBoolOutFn, "cna_compute_shader_is_image_binding_supported");
  LOAD_REQUIRED(compute_shader_bind_image, ComputeShaderBindImageFn, "cna_compute_shader_bind_image");
  LOAD_REQUIRED(compute_shader_dispatch, ComputeShaderDispatchFn, "cna_compute_shader_dispatch");
  LOAD_REQUIRED(compute_shader_barrier, ComputeShaderBarrierFn, "cna_compute_shader_barrier");
  LOAD_REQUIRED(compute_shader_is_valid, HandleBoolOutFn, "cna_compute_shader_is_valid");
  LOAD_REQUIRED(compute_shader_copy_compile_error, HandleCopyStringFn, "cna_compute_shader_copy_compile_error");
  LOAD_REQUIRED(compute_shader_destroy, GameHandleFn, "cna_compute_shader_destroy");
  LOAD_REQUIRED(gpu_timer_create, HandleHandleOutFn, "cna_gpu_timer_create");
  LOAD_REQUIRED(gpu_timer_is_supported, HandleBoolOutFn, "cna_gpu_timer_is_supported");
  LOAD_REQUIRED(gpu_timer_copy_unsupported_reason, HandleCopyStringFn, "cna_gpu_timer_copy_unsupported_reason");
  LOAD_REQUIRED(gpu_timer_begin, GameHandleFn, "cna_gpu_timer_begin");
  LOAD_REQUIRED(gpu_timer_end, GameHandleFn, "cna_gpu_timer_end");
  LOAD_REQUIRED(gpu_timer_is_result_available, HandleBoolOutFn, "cna_gpu_timer_is_result_available");
  LOAD_REQUIRED(gpu_timer_poll, HandleBoolOutFn, "cna_gpu_timer_poll");
  LOAD_REQUIRED(gpu_timer_get_last_milliseconds, GpuTimerDoubleOutFn, "cna_gpu_timer_get_last_milliseconds");
  LOAD_REQUIRED(gpu_timer_get_sample_count, HandleI32OutFn, "cna_gpu_timer_get_sample_count");
  LOAD_REQUIRED(gpu_timer_is_open, HandleBoolOutFn, "cna_gpu_timer_is_open");
  LOAD_REQUIRED(gpu_timer_destroy, GameHandleFn, "cna_gpu_timer_destroy");
  LOAD_REQUIRED(post_process_chain_clear, GameHandleFn, "cna_post_process_chain_clear");
  LOAD_REQUIRED(post_process_chain_get_pass_count, HandleI32OutFn, "cna_post_process_chain_get_pass_count");
  LOAD_REQUIRED(post_process_chain_apply, PostProcessChainApplyFn, "cna_post_process_chain_apply");
  LOAD_REQUIRED(post_process_chain_reset_targets, GameHandleFn, "cna_post_process_chain_reset_targets");
  LOAD_REQUIRED(post_process_chain_is_gpu_timing_enabled, BoolGetFn, "cna_post_process_chain_is_gpu_timing_enabled");
  LOAD_REQUIRED(post_process_chain_set_gpu_timing_enabled, HandleBoolFn, "cna_post_process_chain_set_gpu_timing_enabled");
  LOAD_REQUIRED(post_process_chain_get_pass_timing_count, HandleU64OutFn, "cna_post_process_chain_get_pass_timing_count");
  LOAD_REQUIRED(post_process_chain_get_pass_timing, PostProcessChainTimingFn, "cna_post_process_chain_get_pass_timing");
  LOAD_REQUIRED(post_process_chain_copy_pass_timing_name, PostProcessChainTimingNameFn, "cna_post_process_chain_copy_pass_timing_name");

  LOAD_REQUIRED(devices_ext_is_available, BoolOutFn, "cna_devices_ext_is_available");
  LOAD_REQUIRED(system_info_cpu_cores, HandleI32OutFn, "cna_system_info_get_logical_cpu_core_count_ext");
  LOAD_REQUIRED(system_info_ram_megabytes, HandleI32OutFn, "cna_system_info_get_system_ram_megabytes_ext");
  LOAD_REQUIRED(power_get_state, GameU32OutFn, "cna_power_get_state_ext");
  LOAD_REQUIRED(power_get_battery_percent, HandleI32OutFn, "cna_power_get_battery_percent_ext");
  LOAD_REQUIRED(power_get_seconds_remaining, HandleI32OutFn, "cna_power_get_seconds_remaining_ext");
  LOAD_REQUIRED(display_get_content_scale, HandleFloatOutFn, "cna_display_info_get_content_scale_ext");
  LOAD_REQUIRED(display_get_safe_area, HandleRectangleOutFn, "cna_display_info_get_safe_area_ext");
  LOAD_REQUIRED(locale_get_count, HandleU64OutFn, "cna_locale_get_preferred_count_ext");
  LOAD_REQUIRED(locale_get_language_size, DevicesIndexSizeFn, "cna_locale_get_language_size_at_ext");
  LOAD_REQUIRED(locale_copy_language, DevicesLocaleCopyFn, "cna_locale_copy_language_at_ext");
  LOAD_REQUIRED(locale_get_country_size, DevicesIndexSizeFn, "cna_locale_get_country_size_at_ext");
  LOAD_REQUIRED(locale_copy_country, DevicesLocaleCopyFn, "cna_locale_copy_country_at_ext");
  LOAD_REQUIRED(devices_clipboard_set_text, DevicesClipboardFn, "cna_devices_clipboard_set_text_ext");
  LOAD_REQUIRED(camera_create, HandleHandleOutFn, "cna_camera_create");
  LOAD_REQUIRED(camera_create_with_test_backend_ext, HandleHandleOutFn, "cna_camera_create_with_test_backend_ext");
  LOAD_REQUIRED(camera_get_state_ext, CameraStateOutFn, "cna_camera_get_state_ext");
  LOAD_REQUIRED(camera_get_frame_width_ext, HandleI32OutFn, "cna_camera_get_frame_width_ext");
  LOAD_REQUIRED(camera_get_frame_height_ext, HandleI32OutFn, "cna_camera_get_frame_height_ext");
  LOAD_REQUIRED(camera_try_acquire_frame_ext, CameraAcquireFn, "cna_camera_try_acquire_frame_ext");
  LOAD_REQUIRED(camera_set_test_state_ext, CameraSetStateFn, "cna_camera_set_test_state_ext");
  LOAD_REQUIRED(camera_set_test_frame_ext, CameraSetFrameFn, "cna_camera_set_test_frame_ext");
  LOAD_REQUIRED(camera_destroy, GameHandleFn, "cna_camera_destroy");
  LOAD_REQUIRED(camera_get_is_supported, BoolGetFn, "cna_camera_get_is_supported_ext");
  LOAD_REQUIRED(camera_get_count, HandleU64OutFn, "cna_camera_get_count_ext");
  LOAD_REQUIRED(camera_get_name_size, DevicesIndexSizeFn, "cna_camera_get_name_size_at_ext");
  LOAD_REQUIRED(camera_copy_name, DevicesLocaleCopyFn, "cna_camera_copy_name_at_ext");
  LOAD_REQUIRED(camera_get_info, DevicesCameraInfoFn, "cna_camera_get_info_at_ext");
  LOAD_REQUIRED(camera_device_info_init, DevicesCameraInfoInitFn, "cna_camera_device_info_init");

  LOAD_REQUIRED(gamer_services_initialize, GameHandleFn, "cna_gamer_services_dispatcher_initialize");
  LOAD_REQUIRED(gamer_services_is_initialized, BoolOutFn, "cna_gamer_services_dispatcher_get_is_initialized");
  LOAD_REQUIRED(gamer_services_update, GamerServicesVoidFn, "cna_gamer_services_dispatcher_update");
  LOAD_REQUIRED(gamer_services_get_window_handle, SizeOutFn, "cna_gamer_services_dispatcher_get_window_handle");
  LOAD_REQUIRED(gamer_services_set_window_handle, GamerServicesU64InFn, "cna_gamer_services_dispatcher_set_window_handle");
  LOAD_REQUIRED(guide_get_is_visible, BoolOutFn, "cna_guide_get_is_visible");
  LOAD_REQUIRED(guide_get_is_trial_mode, BoolOutFn, "cna_guide_get_is_trial_mode");
  LOAD_REQUIRED(guide_get_simulate_trial_mode, BoolOutFn, "cna_guide_get_simulate_trial_mode");
  LOAD_REQUIRED(guide_set_simulate_trial_mode, BoolInFn, "cna_guide_set_simulate_trial_mode");
  LOAD_REQUIRED(guide_get_is_screen_saver_enabled, BoolOutFn, "cna_guide_get_is_screen_saver_enabled");
  LOAD_REQUIRED(guide_set_is_screen_saver_enabled, BoolInFn, "cna_guide_set_is_screen_saver_enabled");
  LOAD_REQUIRED(guide_get_notification_position, U32OutFn, "cna_guide_get_notification_position");
  LOAD_REQUIRED(guide_set_notification_position, U32InFn, "cna_guide_set_notification_position");
  LOAD_REQUIRED(guide_begin_show_message_box, GuideBeginMessageBoxFn, "cna_guide_begin_show_message_box");
  LOAD_REQUIRED(guide_end_show_message_box, GuideEndMessageBoxFn, "cna_guide_end_show_message_box");
  LOAD_REQUIRED(guide_get_has_pending_message_box_ext, GuideBoolOutFn, "cna_guide_get_has_pending_message_box_ext");
  LOAD_REQUIRED(guide_get_pending_message_box_focus_button_ext, GuideI32OutFn, "cna_guide_get_pending_message_box_focus_button_ext");
  LOAD_REQUIRED(guide_simulate_message_box_click_ext, GuideI32InFn, "cna_guide_simulate_message_box_click_ext");
  LOAD_REQUIRED(guide_begin_show_keyboard_input, GuideBeginKeyboardInputFn, "cna_guide_begin_show_keyboard_input");
  LOAD_REQUIRED(guide_end_show_keyboard_input_size, GuideSizeFn, "cna_guide_end_show_keyboard_input_size");
  LOAD_REQUIRED(guide_end_show_keyboard_input, GuideCopyFn, "cna_guide_end_show_keyboard_input");
  LOAD_REQUIRED(guide_get_has_pending_keyboard_input_ext, GuideBoolOutFn, "cna_guide_get_has_pending_keyboard_input_ext");
  LOAD_REQUIRED(guide_was_keyboard_input_canceled_ext, GuideBoolOutFn, "cna_guide_was_keyboard_input_canceled_ext");
  LOAD_REQUIRED(guide_get_pending_keyboard_input_title_size_ext, GuideSizeFn, "cna_guide_get_pending_keyboard_input_title_size_ext");
  LOAD_REQUIRED(guide_copy_pending_keyboard_input_title_ext, GuideCopyFn, "cna_guide_copy_pending_keyboard_input_title_ext");
  LOAD_REQUIRED(guide_get_pending_keyboard_input_description_size_ext, GuideSizeFn, "cna_guide_get_pending_keyboard_input_description_size_ext");
  LOAD_REQUIRED(guide_copy_pending_keyboard_input_description_ext, GuideCopyFn, "cna_guide_copy_pending_keyboard_input_description_ext");
  LOAD_REQUIRED(guide_get_pending_keyboard_input_display_text_size_ext, GuideSizeFn, "cna_guide_get_pending_keyboard_input_display_text_size_ext");
  LOAD_REQUIRED(guide_copy_pending_keyboard_input_display_text_ext, GuideCopyFn, "cna_guide_copy_pending_keyboard_input_display_text_ext");
  LOAD_REQUIRED(guide_simulate_keyboard_input_cancel_ext, GuideVoidFn, "cna_guide_simulate_keyboard_input_cancel_ext");
  LOAD_REQUIRED(guide_reset_pending_keyboard_input_ext, GuideVoidFn, "cna_guide_reset_pending_keyboard_input_ext");

  LOAD_REQUIRED(graphics_adapter_get_count, AdapterCountFn, "cna_graphics_adapter_get_count");
  LOAD_REQUIRED(graphics_adapter_get_info, AdapterInfoFn, "cna_graphics_adapter_get_info");
  LOAD_REQUIRED(graphics_adapter_copy_description, GameU32IndexCopyTextFn, "cna_graphics_adapter_copy_description");
  LOAD_REQUIRED(graphics_adapter_copy_device_name, GameU32IndexCopyTextFn, "cna_graphics_adapter_copy_device_name");
  LOAD_REQUIRED(graphics_adapter_get_current_mode, AdapterModeFn, "cna_graphics_adapter_get_current_display_mode");
  LOAD_REQUIRED(graphics_adapter_get_mode_count, AdapterModeCountFn, "cna_graphics_adapter_get_display_mode_count");
  LOAD_REQUIRED(graphics_adapter_copy_modes, AdapterCopyModesFn, "cna_graphics_adapter_copy_display_modes");
  LOAD_REQUIRED(graphics_adapter_get_monitor_handle, AdapterMonitorFn, "cna_graphics_adapter_get_native_monitor_handle");
  LOAD_REQUIRED(graphics_adapter_is_profile_supported, AdapterProfileFn, "cna_graphics_adapter_is_profile_supported");
  LOAD_REQUIRED(graphics_adapter_query_backbuffer, AdapterQueryFormatFn, "cna_graphics_adapter_query_backbuffer_format");
  LOAD_REQUIRED(graphics_adapter_query_render_target, AdapterQueryFormatFn, "cna_graphics_adapter_query_render_target_format");
  LOAD_REQUIRED(graphics_adapter_set_preferences, AdapterPreferencesFn, "cna_graphics_adapter_set_device_preferences");
  LOAD_REQUIRED(graphics_adapters_refresh, GameHandleFn, "cna_graphics_adapters_refresh");
  LOAD_REQUIRED(compass_reading_init, CompassReadingInitFn, "cna_compass_reading_init");
  LOAD_REQUIRED(gyroscope_reading_init, GyroscopeReadingInitFn, "cna_gyroscope_reading_init");
  LOAD_REQUIRED(motion_reading_init, MotionReadingInitFn, "cna_motion_reading_init");
  LOAD_REQUIRED(compass_create, AccelerometerCreateFn, "cna_compass_create");
  LOAD_REQUIRED(compass_destroy, GameHandleFn, "cna_compass_destroy");
  LOAD_REQUIRED(compass_start, GameHandleFn, "cna_compass_start");
  LOAD_REQUIRED(compass_stop, GameHandleFn, "cna_compass_stop");
  LOAD_REQUIRED(compass_dispose, GameHandleFn, "cna_compass_dispose");
  LOAD_REQUIRED(compass_get_state, GameU32OutFn, "cna_compass_get_state");
  LOAD_REQUIRED(compass_is_data_valid, BoolGetFn, "cna_compass_get_is_data_valid");
  LOAD_REQUIRED(compass_get_current_value, CompassReadingFn, "cna_compass_get_current_value");
  LOAD_REQUIRED(compass_get_interval, HandleInt64OutFn, "cna_compass_get_time_between_updates_ticks");
  LOAD_REQUIRED(compass_set_interval, AccelerometerTicksInFn, "cna_compass_set_time_between_updates_ticks");
  LOAD_REQUIRED(compass_inject, CompassInjectFn, "cna_compass_inject_synthetic_update_ext");
  LOAD_REQUIRED(compass_set_test_backend, CompassTestBackendFn, "cna_compass_set_test_backend_ext");
  LOAD_REQUIRED(gyroscope_create, AccelerometerCreateFn, "cna_gyroscope_create");
  LOAD_REQUIRED(gyroscope_destroy, GameHandleFn, "cna_gyroscope_destroy");
  LOAD_REQUIRED(gyroscope_start, GameHandleFn, "cna_gyroscope_start");
  LOAD_REQUIRED(gyroscope_stop, GameHandleFn, "cna_gyroscope_stop");
  LOAD_REQUIRED(gyroscope_dispose, GameHandleFn, "cna_gyroscope_dispose");
  LOAD_REQUIRED(gyroscope_get_state, GameU32OutFn, "cna_gyroscope_get_state");
  LOAD_REQUIRED(gyroscope_is_data_valid, BoolGetFn, "cna_gyroscope_get_is_data_valid");
  LOAD_REQUIRED(gyroscope_get_current_value, GyroscopeReadingFn, "cna_gyroscope_get_current_value");
  LOAD_REQUIRED(gyroscope_get_interval, HandleInt64OutFn, "cna_gyroscope_get_time_between_updates_ticks");
  LOAD_REQUIRED(gyroscope_set_interval, AccelerometerTicksInFn, "cna_gyroscope_set_time_between_updates_ticks");
  LOAD_REQUIRED(gyroscope_inject, GyroscopeInjectFn, "cna_gyroscope_inject_synthetic_update_ext");
  LOAD_REQUIRED(gyroscope_set_supported, GyroscopeSetSupportedFn, "cna_gyroscope_set_supported_for_tests_ext");
  LOAD_REQUIRED(motion_create, AccelerometerCreateFn, "cna_motion_create");
  LOAD_REQUIRED(motion_destroy, GameHandleFn, "cna_motion_destroy");
  LOAD_REQUIRED(motion_start, GameHandleFn, "cna_motion_start");
  LOAD_REQUIRED(motion_stop, GameHandleFn, "cna_motion_stop");
  LOAD_REQUIRED(motion_dispose, GameHandleFn, "cna_motion_dispose");
  LOAD_REQUIRED(motion_get_state, GameU32OutFn, "cna_motion_get_state");
  LOAD_REQUIRED(motion_is_data_valid, BoolGetFn, "cna_motion_get_is_data_valid");
  LOAD_REQUIRED(motion_is_north_referenced, BoolGetFn, "cna_motion_get_is_attitude_north_referenced_ext");
  LOAD_REQUIRED(motion_get_current_value, MotionReadingFn, "cna_motion_get_current_value");
  LOAD_REQUIRED(motion_get_interval, HandleInt64OutFn, "cna_motion_get_time_between_updates_ticks");
  LOAD_REQUIRED(motion_set_interval, AccelerometerTicksInFn, "cna_motion_set_time_between_updates_ticks");
  LOAD_REQUIRED(motion_inject, MotionInjectFn, "cna_motion_inject_synthetic_update_ext");
  LOAD_REQUIRED(motion_set_test_backend, MotionTestBackendFn, "cna_motion_set_test_backend_ext");
  LOAD_REQUIRED(accelerometer_is_supported, BoolGetFn, "cna_accelerometer_get_is_supported");
  LOAD_REQUIRED(compass_is_supported, BoolGetFn, "cna_compass_get_is_supported");
  LOAD_REQUIRED(gyroscope_is_supported, BoolGetFn, "cna_gyroscope_get_is_supported");
  LOAD_REQUIRED(motion_is_supported, BoolGetFn, "cna_motion_get_is_supported");
  LOAD_REQUIRED(accelerometer_create, AccelerometerCreateFn, "cna_accelerometer_create");
  LOAD_REQUIRED(accelerometer_destroy, GameHandleFn, "cna_accelerometer_destroy");
  LOAD_REQUIRED(accelerometer_start, GameHandleFn, "cna_accelerometer_start");
  LOAD_REQUIRED(accelerometer_stop, GameHandleFn, "cna_accelerometer_stop");
  LOAD_REQUIRED(accelerometer_get_state, GameU32OutFn, "cna_accelerometer_get_state");
  LOAD_REQUIRED(accelerometer_is_data_valid, BoolGetFn, "cna_accelerometer_get_is_data_valid");
  LOAD_REQUIRED(accelerometer_get_current_value, AccelerometerReadingFn, "cna_accelerometer_get_current_value");
  LOAD_REQUIRED(accelerometer_get_interval, HandleInt64OutFn, "cna_accelerometer_get_time_between_updates_ticks");
  LOAD_REQUIRED(accelerometer_set_interval, AccelerometerTicksInFn, "cna_accelerometer_set_time_between_updates_ticks");

  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "load result");
  return undefined;
}

static napi_value abi_version(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  napi_value result;
  NAPI_OR_RETURN(env, napi_create_uint32(env, g_api.get_abi_version(), &result), "ABI result");
  return result;
}

static napi_value imported_symbol_count(napi_env env, napi_callback_info info) {
  (void) info;
  napi_value result;
  NAPI_OR_RETURN(env, napi_create_uint32(env, g_imported_symbols, &result), "symbol count");
  return result;
}

static napi_value get_last_error(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  char* message = last_error_message();
  if (!message) {
    napi_value result;
    NAPI_OR_RETURN(env, napi_get_null(env, &result), "null error result");
    return result;
  }
  napi_value result;
  napi_status status = napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &result);
  free(message);
  if (status != napi_ok) return throw_napi(env, "error message creation");
  return result;
}

static napi_value create_game(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  if (!get_args(env, info, 3, args)) return NULL;
  bool fixed = true;
  int64_t ticks = 0;
  bool lossless = false;
  NAPI_OR_RETURN(env, napi_get_value_bool(env, args[0], &fixed), "fixed-step option");
  NAPI_OR_RETURN(env, napi_get_value_bigint_int64(env, args[1], &ticks, &lossless), "target-time option");
  if (!lossless || ticks <= 0) return throw_message(env, "target elapsed ticks must be a positive int64 bigint");
  napi_valuetype callback_type;
  NAPI_OR_RETURN(env, napi_typeof(env, args[2], &callback_type), "callback type");
  if (callback_type != napi_object) return throw_message(env, "game callbacks must be an object");

  GameContext* context = (GameContext*) calloc(1, sizeof(GameContext));
  if (!context) return throw_message(env, "out of memory creating game callback context");
  context->env = env;
  if (napi_create_reference(env, args[2], 1, &context->callbacks) != napi_ok) {
    free(context);
    return throw_napi(env, "callback reference creation");
  }
  CNA_GameCallbacks callbacks;
  memset(&callbacks, 0, sizeof(callbacks));
  callbacks.struct_size = sizeof(callbacks);
  callbacks.struct_version = 1;
  callbacks.load_content = on_load_content;
  callbacks.update = on_update;
  callbacks.draw = on_draw;
  callbacks.unload_content = on_unload_content;
  callbacks.exiting = on_exiting;
  callbacks.context = context;
  CNA_GameCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.is_fixed_time_step = fixed ? CNA_TRUE : CNA_FALSE;
  create_info.target_elapsed_time_ticks = ticks;
  create_info.callbacks = &callbacks;
  CNA_Result result = g_api.game_create(&create_info, &context->handle);
  if (result != CNA_RESULT_SUCCESS) {
    napi_delete_reference(env, context->callbacks);
    free(context);
    return throw_result(env, "cna_game_create", result);
  }
  CNA_GameFrameHooks hooks;
  memset(&hooks, 0, sizeof(hooks));
  hooks.struct_size = sizeof(hooks);
  hooks.struct_version = 1;
  hooks.initialize = on_initialize;
  hooks.begin_run = on_begin_run;
  hooks.end_run = on_end_run;
  hooks.begin_draw = on_begin_draw;
  hooks.end_draw = on_end_draw;
  hooks.context = context;
  result = g_api.game_set_frame_hooks(context->handle, &hooks);
  if (result != CNA_RESULT_SUCCESS) {
    g_api.game_destroy(context->handle);
    napi_delete_reference(env, context->callbacks);
    free(context);
    return throw_result(env, "cna_game_set_frame_hooks_ext", result);
  }
  context->next = g_games;
  g_games = context;
  return make_handle(env, context->handle);
}

static napi_value call_game_handle(napi_env env, napi_callback_info info, GameHandleFn function, const char* operation) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle handle;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &handle)) return NULL;
  CNA_Result result = function(handle);
  GameContext* context = find_game(handle);
  if (rethrow_callback_exception(context)) return NULL;
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "void result");
  return undefined;
}

#define GAME_METHOD(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return call_game_handle(env, info, g_api.field, operation); \
  }

GAME_METHOD(run_game, game_run, "cna_game_run")
GAME_METHOD(run_game_one_frame, game_run_one_frame, "cna_game_run_one_frame")
GAME_METHOD(request_exit, game_request_exit, "cna_game_request_exit")
GAME_METHOD(update_framework_dispatcher, framework_dispatcher_update, "cna_framework_dispatcher_update")
GAME_METHOD(apply_manager_changes, manager_apply_changes, "cna_graphics_device_manager_apply_changes")
GAME_METHOD(toggle_manager_full_screen, manager_toggle_full_screen, "cna_graphics_device_manager_toggle_full_screen")
GAME_METHOD(create_managed_device, manager_create_device, "cna_graphics_device_manager_create_device")
GAME_METHOD(end_manager_draw, manager_end_draw, "cna_graphics_device_manager_end_draw")
GAME_METHOD(present_graphics_device, graphics_present, "cna_graphics_device_present")
GAME_METHOD(destroy_texture, texture_destroy, "cna_texture2d_destroy")
GAME_METHOD(destroy_sprite_batch, sprite_batch_destroy, "cna_sprite_batch_destroy")
GAME_METHOD(destroy_vertex_buffer, vertex_buffer_destroy, "cna_vertex_buffer_destroy")
GAME_METHOD(destroy_index_buffer, index_buffer_destroy, "cna_index_buffer_destroy")
GAME_METHOD(destroy_texture3d, texture3d_destroy, "cna_texture3d_destroy")
GAME_METHOD(destroy_texturecube, texturecube_destroy, "cna_texturecube_destroy")
GAME_METHOD(destroy_render_target, render_target_destroy, "cna_render_target_destroy")
GAME_METHOD(begin_occlusion_query, occlusion_begin, "cna_occlusion_query_begin")
GAME_METHOD(end_occlusion_query, occlusion_end, "cna_occlusion_query_end")
GAME_METHOD(destroy_occlusion_query, occlusion_destroy, "cna_occlusion_query_destroy")
GAME_METHOD(destroy_render_pipeline, render_pipeline_destroy, "cna_render_pipeline_destroy")
GAME_METHOD(end_render_pipeline, render_pipeline_end, "cna_render_pipeline_end")

static napi_value destroy_game(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle handle;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &handle)) return NULL;
  GameContext* context = find_game(handle);
  CNA_Result result = g_api.game_destroy(handle);
  if (rethrow_callback_exception(context)) return NULL;
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_game_destroy", result);
  if (context) {
    unlink_game(context);
    if (context->exception) napi_delete_reference(env, context->exception);
    napi_delete_reference(env, context->callbacks);
    free(context);
  }
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "destroy result");
  return undefined;
}

static napi_value create_manager(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_GraphicsDeviceManagerHandle manager = 0;
  CNA_Result result = g_api.manager_create(game, &manager);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_manager_create", result);
  return make_handle(env, manager);
}

static napi_value configure_manager(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle manager;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &manager)) return NULL;
  const char* names[] = {
    "GraphicsProfile", "IsFullScreen", "PreferMultiSampling", "PreferredBackBufferFormat",
    "PreferredBackBufferHeight", "PreferredBackBufferWidth", "PreferredDepthStencilFormat",
    "SupportedOrientations", "SynchronizeWithVerticalRetrace"
  };
  napi_value values[9];
  for (size_t index = 0; index < 9; index += 1) {
    NAPI_OR_RETURN(env, napi_get_named_property(env, args[1], names[index], &values[index]), "manager configuration");
  }
  uint32_t profile, buffer_format, depth_format, orientations;
  int32_t height, width;
  bool full_screen, multisampling, retrace;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, values[0], &profile), "graphics profile");
  NAPI_OR_RETURN(env, napi_get_value_bool(env, values[1], &full_screen), "full screen");
  NAPI_OR_RETURN(env, napi_get_value_bool(env, values[2], &multisampling), "multisampling");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, values[3], &buffer_format), "back-buffer format");
  NAPI_OR_RETURN(env, napi_get_value_int32(env, values[4], &height), "back-buffer height");
  NAPI_OR_RETURN(env, napi_get_value_int32(env, values[5], &width), "back-buffer width");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, values[6], &depth_format), "depth format");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, values[7], &orientations), "orientations");
  NAPI_OR_RETURN(env, napi_get_value_bool(env, values[8], &retrace), "vertical retrace");
  CNA_Result result;
#define CONFIGURE(call, value, operation) do { result = call(manager, value); if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result); } while (0)
  CONFIGURE(g_api.manager_set_graphics_profile, profile, "set graphics profile");
  CONFIGURE(g_api.manager_set_is_full_screen, full_screen ? CNA_TRUE : CNA_FALSE, "set full screen");
  CONFIGURE(g_api.manager_set_prefer_multi_sampling, multisampling ? CNA_TRUE : CNA_FALSE, "set multisampling");
  CONFIGURE(g_api.manager_set_back_buffer_format, buffer_format, "set back-buffer format");
  CONFIGURE(g_api.manager_set_back_buffer_height, height, "set back-buffer height");
  CONFIGURE(g_api.manager_set_back_buffer_width, width, "set back-buffer width");
  CONFIGURE(g_api.manager_set_depth_stencil_format, depth_format, "set depth format");
  CONFIGURE(g_api.manager_set_orientations, orientations, "set orientations");
  CONFIGURE(g_api.manager_set_vertical_retrace, retrace ? CNA_TRUE : CNA_FALSE, "set vertical retrace");
#undef CONFIGURE
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "configuration result");
  return undefined;
}

static napi_value begin_manager_draw(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle manager;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &manager)) return NULL;
  CNA_Bool should_draw = CNA_TRUE;
  CNA_Result result = g_api.manager_begin_draw(manager, &should_draw);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_manager_begin_draw", result);
  napi_value value;
  NAPI_OR_RETURN(env, napi_get_boolean(env, should_draw == CNA_TRUE, &value), "draw result");
  return value;
}

static napi_value destroy_manager(napi_env env, napi_callback_info info) {
  return call_game_handle(env, info, g_api.manager_destroy, "cna_graphics_device_manager_destroy");
}

static napi_value borrow_graphics_device(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle manager, device = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &manager)) return NULL;
  CNA_Result result = g_api.manager_get_device(manager, &device);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_manager_get_graphics_device", result);
  return make_handle(env, device);
}

static napi_value clear_graphics_device(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle device;
  uint32_t packed;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &device)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &packed), "packed color");
  CNA_Result result = g_api.graphics_clear(device,
    (float) (packed & 0xff) / 255.0f,
    (float) ((packed >> 8) & 0xff) / 255.0f,
    (float) ((packed >> 16) & 0xff) / 255.0f,
    (float) ((packed >> 24) & 0xff) / 255.0f);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_clear_rgba", result);
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "clear result");
  return undefined;
}

static napi_value get_renderer_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle device;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &device)) return NULL;
  CNA_RendererInfo renderer;
  memset(&renderer, 0, sizeof(renderer));
  renderer.struct_size = sizeof(renderer);
  renderer.struct_version = 1;
  CNA_Result result = g_api.graphics_get_renderer_info(device, &renderer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_get_renderer_info", result);
  uint64_t length = 0;
  result = g_api.graphics_renderer_name_size(device, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_get_renderer_name_size", result);
  if (length > SIZE_MAX - 1) return throw_message(env, "renderer name exceeds host address space");
  char* name = (char*) malloc((size_t) length + 1);
  if (!name) return throw_message(env, "out of memory reading renderer name");
  uint64_t copied = 0;
  result = g_api.graphics_copy_renderer_name(device, name, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(name);
    return throw_result(env, "cna_graphics_device_copy_renderer_name", result);
  }
  name[length] = '\0';
  napi_value output;
  napi_value name_value;
  napi_value renderer_type;
  napi_value capability_flags;
  napi_value max_texture_dimension;
  napi_status status = napi_create_object(env, &output);
  if (status == napi_ok) status = napi_create_string_utf8(env, name, length, &name_value);
  free(name);
  if (status == napi_ok) status = napi_create_uint32(env, renderer.renderer_type, &renderer_type);
  if (status == napi_ok) status = napi_create_bigint_uint64(env, renderer.capability_flags, &capability_flags);
  if (status == napi_ok) status = napi_create_uint32(env, renderer.max_texture_dimension, &max_texture_dimension);
  if (status == napi_ok) status = napi_set_named_property(env, output, "Name", name_value);
  if (status == napi_ok) status = napi_set_named_property(env, output, "RendererType", renderer_type);
  if (status == napi_ok) status = napi_set_named_property(env, output, "CapabilityFlags", capability_flags);
  if (status == napi_ok) status = napi_set_named_property(env, output, "MaxTextureDimension", max_texture_dimension);
  if (status != napi_ok) return throw_napi(env, "renderer information creation");
  return output;
}

static napi_value create_texture(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[5];
  CNA_Handle device, texture = 0;
  uint32_t width, height, format;
  bool mip_map;
  if (!get_args(env, info, 5, args) || !read_handle(env, args[0], &device)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &width), "texture width");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[2], &height), "texture height");
  NAPI_OR_RETURN(env, napi_get_value_bool(env, args[3], &mip_map), "texture mip flag");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[4], &format), "texture format");
  CNA_Texture2DCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.width = width;
  create_info.height = height;
  create_info.mip_map = mip_map ? CNA_TRUE : CNA_FALSE;
  create_info.format = format;
  CNA_Result result = g_api.texture_create(device, &create_info, &texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture2d_create", result);
  return make_handle(env, texture);
}

static napi_value create_sprite_batch(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle device, sprite_batch = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &device)) return NULL;
  CNA_Result result = g_api.sprite_batch_create(device, &sprite_batch);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sprite_batch_create", result);
  return make_handle(env, sprite_batch);
}

static int set_bool(napi_env env, napi_value object, const char* name, bool value) {
  napi_value property;
  return napi_get_boolean(env, value, &property) == napi_ok &&
    napi_set_named_property(env, object, name, property) == napi_ok;
}

static int set_i32(napi_env env, napi_value object, const char* name, int32_t value) {
  napi_value property;
  return napi_create_int32(env, value, &property) == napi_ok &&
    napi_set_named_property(env, object, name, property) == napi_ok;
}

static int set_u32(napi_env env, napi_value object, const char* name, uint32_t value) {
  napi_value property;
  return napi_create_uint32(env, value, &property) == napi_ok &&
    napi_set_named_property(env, object, name, property) == napi_ok;
}

static int set_number(napi_env env, napi_value object, const char* name, double value) {
  napi_value property;
  return napi_create_double(env, value, &property) == napi_ok &&
    napi_set_named_property(env, object, name, property) == napi_ok;
}

static int set_bigint(napi_env env, napi_value object, const char* name, uint64_t value) {
  napi_value property;
  return napi_create_bigint_uint64(env, value, &property) == napi_ok &&
    napi_set_named_property(env, object, name, property) == napi_ok;
}

static int read_float_array(
  napi_env env, napi_value value, float* out, uint32_t expected, const char* const what
) {
  bool is_array = false;
  uint32_t length = 0;
  if (napi_is_array(env, value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, value, &length) != napi_ok || length != expected) {
    throw_message(env, what);
    return 0;
  }
  for (uint32_t index = 0; index < expected; index += 1) {
    napi_value element;
    double number = 0;
    if (napi_get_element(env, value, index, &element) != napi_ok ||
        napi_get_value_double(env, element, &number) != napi_ok) {
      throw_message(env, what);
      return 0;
    }
    out[index] = (float) number;
  }
  return 1;
}

static int set_float_array(
  napi_env env, napi_value object, const char* name, const float* values, uint32_t count
) {
  napi_value array;
  if (napi_create_array_with_length(env, count, &array) != napi_ok) return 0;
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value number;
    if (napi_create_double(env, (double) values[index], &number) != napi_ok ||
        napi_set_element(env, array, index, number) != napi_ok) {
      return 0;
    }
  }
  return napi_set_named_property(env, object, name, array) == napi_ok;
}

static int set_vector3(napi_env env, napi_value object, const char* name, const CNA_Vector3* value) {
  napi_value nested;
  if (napi_create_object(env, &nested) != napi_ok) return 0;
  return set_number(env, nested, "X", (double) value->x) &&
    set_number(env, nested, "Y", (double) value->y) &&
    set_number(env, nested, "Z", (double) value->z) &&
    napi_set_named_property(env, object, name, nested) == napi_ok;
}

/* Reads X, Y and Z from the object itself, for a vector that is an argument rather than a field. */
static int read_vector3_fields(napi_env env, napi_value object, CNA_Vector3* out) {
  napi_value component;
  double values[3] = {0, 0, 0};
  static const char* const names[] = {"X", "Y", "Z"};
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, object, names[index], &component) != napi_ok ||
        napi_get_value_double(env, component, &values[index]) != napi_ok) {
      return 0;
    }
  }
  out->x = (float) values[0];
  out->y = (float) values[1];
  out->z = (float) values[2];
  return 1;
}

static int read_vector3(napi_env env, napi_value object, const char* name, CNA_Vector3* out) {
  napi_value nested, component;
  double values[3] = {0, 0, 0};
  static const char* const names[] = {"X", "Y", "Z"};
  if (napi_get_named_property(env, object, name, &nested) != napi_ok) return 0;
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, nested, names[index], &component) != napi_ok ||
        napi_get_value_double(env, component, &values[index]) != napi_ok) {
      return 0;
    }
  }
  out->x = (float) values[0];
  out->y = (float) values[1];
  out->z = (float) values[2];
  return 1;
}

static int read_byte_view(
  napi_env env,
  napi_value value,
  const uint8_t** out_data,
  size_t* out_length
) {
  bool is_buffer = false;
  if (napi_is_buffer(env, value, &is_buffer) != napi_ok) {
    throw_napi(env, "byte-view inspection");
    return 0;
  }
  if (is_buffer) {
    void* data = NULL;
    if (napi_get_buffer_info(env, value, &data, out_length) != napi_ok) {
      throw_napi(env, "buffer access");
      return 0;
    }
    *out_data = (const uint8_t*) data;
    return 1;
  }
  bool is_typed_array = false;
  if (napi_is_typedarray(env, value, &is_typed_array) != napi_ok || !is_typed_array) {
    throw_message(env, "expected a Uint8Array or Buffer");
    return 0;
  }
  napi_typedarray_type type;
  size_t length = 0;
  void* data = NULL;
  napi_value array_buffer;
  size_t byte_offset = 0;
  if (napi_get_typedarray_info(
        env, value, &type, &length, &data, &array_buffer, &byte_offset) != napi_ok ||
      (type != napi_uint8_array && type != napi_uint8_clamped_array)) {
    throw_message(env, "expected an eight-bit typed array");
    return 0;
  }
  (void) array_buffer;
  (void) byte_offset;
  *out_data = (const uint8_t*) data;
  *out_length = length;
  return 1;
}

static napi_value copy_bytes(napi_env env, const uint8_t* data, size_t length, const char* operation) {
  napi_value output;
  void* copied = NULL;
  if (napi_create_buffer_copy(env, length, data, &copied, &output) != napi_ok) {
    return throw_napi(env, operation);
  }
  (void) copied;
  return output;
}

static uint32_t texture_element_size(const uint32_t data_type) {
  switch (data_type) {
    case CNA_TEXTURE_DATA_COLOR:
    case CNA_TEXTURE_DATA_NORMALIZED_BYTE4:
    case CNA_TEXTURE_DATA_RGBA1010102:
    case CNA_TEXTURE_DATA_RG32:
    case CNA_TEXTURE_DATA_SINGLE:
    case CNA_TEXTURE_DATA_HALF_VECTOR2:
      return 4;
    case CNA_TEXTURE_DATA_BGR565:
    case CNA_TEXTURE_DATA_BGRA5551:
    case CNA_TEXTURE_DATA_BGRA4444:
    case CNA_TEXTURE_DATA_NORMALIZED_BYTE2:
    case CNA_TEXTURE_DATA_HALF_SINGLE:
    case CNA_TEXTURE_DATA_USHORT:
      return 2;
    case CNA_TEXTURE_DATA_RGBA64:
    case CNA_TEXTURE_DATA_VECTOR2:
    case CNA_TEXTURE_DATA_HALF_VECTOR4:
      return 8;
    case CNA_TEXTURE_DATA_VECTOR4:
      return 16;
    case CNA_TEXTURE_DATA_BYTE:
    case CNA_TEXTURE_DATA_ALPHA8:
      return 1;
    default:
      return 0;
  }
}

static int read_texture_transfer(
  napi_env env,
  napi_value* args,
  CNA_TextureDataType* out_data_type,
  CNA_Texture2DTransfer* out_transfer,
  uint32_t* out_capacity,
  uint32_t* out_element_size
) {
  uint32_t data_type = 0, capacity = 0, element_size = 0;
  int32_t level = 0, x = 0, y = 0, width = 0, height = 0;
  uint32_t start_index = 0, element_count = 0;
  bool has_rectangle = false;
  if (napi_get_value_uint32(env, args[1], &data_type) != napi_ok ||
      napi_get_value_int32(env, args[2], &level) != napi_ok ||
      napi_get_value_bool(env, args[3], &has_rectangle) != napi_ok ||
      napi_get_value_int32(env, args[4], &x) != napi_ok ||
      napi_get_value_int32(env, args[5], &y) != napi_ok ||
      napi_get_value_int32(env, args[6], &width) != napi_ok ||
      napi_get_value_int32(env, args[7], &height) != napi_ok ||
      napi_get_value_uint32(env, args[8], &start_index) != napi_ok ||
      napi_get_value_uint32(env, args[9], &element_count) != napi_ok ||
      napi_get_value_uint32(env, args[10], &capacity) != napi_ok ||
      napi_get_value_uint32(env, args[11], &element_size) != napi_ok) {
    throw_message(env, "invalid Texture2D transfer arguments");
    return 0;
  }
  const uint32_t required_size = texture_element_size(data_type);
  if (required_size == 0 || element_size != required_size ||
      start_index > capacity || element_count > capacity - start_index) {
    throw_message(env, "invalid Texture2D transfer element type, size, or array window");
    return 0;
  }
  memset(out_transfer, 0, sizeof(*out_transfer));
  out_transfer->struct_size = sizeof(*out_transfer);
  out_transfer->struct_version = 1;
  out_transfer->level = level;
  out_transfer->has_rectangle = has_rectangle ? CNA_TRUE : CNA_FALSE;
  out_transfer->rectangle = (CNA_Rectangle){x, y, width, height};
  out_transfer->start_index = start_index;
  out_transfer->element_count = element_count;
  *out_data_type = data_type;
  *out_capacity = capacity;
  *out_element_size = element_size;
  return 1;
}

static napi_value get_texture_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle texture;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &texture)) return NULL;
  CNA_Texture2DInfo value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.texture_get_info(texture, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture2d_get_info", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "Texture2D info");
  if (!set_u32(env, output, "Width", value.width) ||
      !set_u32(env, output, "Height", value.height) ||
      !set_u32(env, output, "LevelCount", value.level_count) ||
      !set_u32(env, output, "Format", value.format)) {
    return throw_napi(env, "Texture2D info properties");
  }
  return output;
}

static napi_value create_texture_from_encoded(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[6];
  CNA_Handle device, texture = 0;
  const uint8_t* encoded = NULL;
  size_t encoded_length = 0;
  bool has_decode = false, zoom = false;
  uint32_t width = 0, height = 0;
  if (!get_args(env, info, 6, args) || !read_handle(env, args[0], &device) ||
      !read_byte_view(env, args[1], &encoded, &encoded_length)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_bool(env, args[2], &has_decode), "decode presence");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[3], &width), "decode width");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[4], &height), "decode height");
  NAPI_OR_RETURN(env, napi_get_value_bool(env, args[5], &zoom), "decode zoom");
  if (encoded_length == 0) return throw_message(env, "encoded image data must not be empty");
  CNA_Texture2DDecodeInfo decode;
  memset(&decode, 0, sizeof(decode));
  decode.struct_size = sizeof(decode);
  decode.struct_version = 1;
  decode.width = width;
  decode.height = height;
  decode.zoom = zoom ? CNA_TRUE : CNA_FALSE;
  CNA_Result result = g_api.texture_create_from_encoded(
    device, encoded, encoded_length, has_decode ? &decode : NULL, &texture);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_texture2d_create_from_encoded_memory", result);
  }
  return make_handle(env, texture);
}

static napi_value set_texture_data(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[13];
  CNA_Handle texture;
  CNA_TextureDataType data_type;
  CNA_Texture2DTransfer transfer;
  uint32_t capacity = 0, element_size = 0;
  const uint8_t* bytes = NULL;
  size_t byte_length = 0;
  if (!get_args(env, info, 13, args) || !read_handle(env, args[0], &texture) ||
      !read_texture_transfer(
        env, args, &data_type, &transfer, &capacity, &element_size) ||
      !read_byte_view(env, args[12], &bytes, &byte_length)) return NULL;
  if ((size_t) capacity > SIZE_MAX / element_size ||
      byte_length != (size_t) capacity * element_size) {
    return throw_message(env, "Texture2D upload byte snapshot has the wrong size");
  }
  CNA_Result result = g_api.texture_set_data(texture, data_type, &transfer, bytes, capacity);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture2d_set_data", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "Texture2D upload result");
  return output;
}

static napi_value get_texture_data(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[12];
  CNA_Handle texture;
  CNA_TextureDataType data_type;
  CNA_Texture2DTransfer transfer;
  uint32_t capacity = 0, element_size = 0;
  if (!get_args(env, info, 12, args) || !read_handle(env, args[0], &texture) ||
      !read_texture_transfer(
        env, args, &data_type, &transfer, &capacity, &element_size)) return NULL;
  if ((size_t) capacity > SIZE_MAX / element_size) {
    return throw_message(env, "Texture2D readback byte size overflows native memory");
  }
  const size_t byte_length = (size_t) capacity * element_size;
  uint8_t* bytes = byte_length == 0 ? NULL : (uint8_t*) calloc(byte_length, 1);
  if (byte_length != 0 && bytes == NULL) return throw_message(env, "Texture2D readback allocation failed");
  uint64_t required_elements = 0;
  CNA_Result result = g_api.texture_get_data(
    texture, data_type, &transfer, bytes, capacity, &required_elements);
  if (result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_texture2d_get_data", result);
  }
  if (required_elements != transfer.element_count) {
    free(bytes);
    return throw_message(env, "CNA Texture2D readback returned an inconsistent element count");
  }
  napi_value output = copy_bytes(env, bytes, byte_length, "Texture2D readback copy");
  free(bytes);
  return output;
}

static napi_value encode_texture(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle texture;
  uint32_t image_format = 0, width = 0, height = 0;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &texture)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &image_format), "image format");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[2], &width), "encoded width");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[3], &height), "encoded height");
  uint64_t byte_count = 0;
  CNA_Result result = g_api.texture_encoded_count(
    texture, image_format, width, height, &byte_count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_texture2d_get_encoded_byte_count", result);
  }
  if (byte_count > SIZE_MAX) return throw_message(env, "encoded image is too large for Node");
  uint8_t* bytes = byte_count == 0 ? NULL : (uint8_t*) malloc((size_t) byte_count);
  if (byte_count != 0 && bytes == NULL) return throw_message(env, "encoded image allocation failed");
  uint64_t written = 0;
  result = g_api.texture_encoded_copy(
    texture, image_format, width, height, bytes, byte_count, &written);
  if (result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_texture2d_copy_encoded", result);
  }
  if (written > byte_count) {
    free(bytes);
    return throw_message(env, "CNA encoded image byte count exceeded the queried capacity");
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "encoded image copy");
  free(bytes);
  return output;
}

static napi_value begin_sprite_batch(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle sprite_batch;
  uint32_t sort_mode = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &sprite_batch)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &sort_mode), "sprite sort mode");
  CNA_SpriteBatchBeginInfo begin_info;
  memset(&begin_info, 0, sizeof(begin_info));
  begin_info.struct_size = sizeof(begin_info);
  begin_info.struct_version = 1;
  begin_info.sort_mode = sort_mode;
  CNA_Result result = g_api.sprite_batch_begin(sprite_batch, &begin_info);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sprite_batch_begin", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "SpriteBatch begin result");
  return output;
}

static int get_named_value(napi_env env, napi_value object, const char* name, napi_value* out) {
  if (napi_get_named_property(env, object, name, out) == napi_ok) return 1;
  throw_napi(env, name);
  return 0;
}

static int get_named_double(napi_env env, napi_value object, const char* name, double* out) {
  napi_value value;
  if (!get_named_value(env, object, name, &value)) return 0;
  if (napi_get_value_double(env, value, out) == napi_ok) return 1;
  throw_message(env, "SpriteBatch command contains a non-number field");
  return 0;
}

static int get_named_i32(napi_env env, napi_value object, const char* name, int32_t* out) {
  napi_value value;
  if (!get_named_value(env, object, name, &value)) return 0;
  if (napi_get_value_int32(env, value, out) == napi_ok) return 1;
  throw_message(env, "SpriteBatch command contains a non-int32 field");
  return 0;
}

static int get_named_u32(napi_env env, napi_value object, const char* name, uint32_t* out) {
  napi_value value;
  if (!get_named_value(env, object, name, &value)) return 0;
  if (napi_get_value_uint32(env, value, out) == napi_ok) return 1;
  throw_message(env, "SpriteBatch command contains a non-uint32 field");
  return 0;
}

static int get_named_handle(napi_env env, napi_value object, const char* name, CNA_Handle* out);

static int get_named_bool(napi_env env, napi_value object, const char* name, CNA_Bool* out) {
  napi_value value;
  bool result = false;
  if (!get_named_value(env, object, name, &value)) return 0;
  if (napi_get_value_bool(env, value, &result) != napi_ok) {
    throw_message(env, "graphics state contains a non-Boolean field");
    return 0;
  }
  *out = result ? CNA_TRUE : CNA_FALSE;
  return 1;
}

static int read_blend_state(napi_env env, napi_value object, CNA_BlendState* out) {
  uint32_t packed = 0;
  memset(out, 0, sizeof(*out));
  out->struct_size = sizeof(*out);
  out->struct_version = 1;
  if (!get_named_u32(env, object, "AlphaBlendFunction", &out->alpha_blend_function) ||
      !get_named_u32(env, object, "AlphaDestinationBlend", &out->alpha_destination_blend) ||
      !get_named_u32(env, object, "AlphaSourceBlend", &out->alpha_source_blend) ||
      !get_named_u32(env, object, "ColorBlendFunction", &out->color_blend_function) ||
      !get_named_u32(env, object, "ColorDestinationBlend", &out->color_destination_blend) ||
      !get_named_u32(env, object, "ColorSourceBlend", &out->color_source_blend) ||
      !get_named_u32(env, object, "ColorWriteChannels", &out->color_write_channels) ||
      !get_named_u32(env, object, "ColorWriteChannels1", &out->color_write_channels1) ||
      !get_named_u32(env, object, "ColorWriteChannels2", &out->color_write_channels2) ||
      !get_named_u32(env, object, "ColorWriteChannels3", &out->color_write_channels3) ||
      !get_named_u32(env, object, "BlendFactor", &packed) ||
      !get_named_i32(env, object, "MultiSampleMask", &out->multi_sample_mask)) return 0;
  out->blend_factor = (CNA_Color){
    (uint8_t) packed, (uint8_t) (packed >> 8),
    (uint8_t) (packed >> 16), (uint8_t) (packed >> 24)
  };
  return 1;
}

static int read_depth_stencil_state(
  napi_env env, napi_value object, CNA_DepthStencilState* out
) {
  memset(out, 0, sizeof(*out));
  out->struct_size = sizeof(*out);
  out->struct_version = 1;
  return get_named_bool(env, object, "DepthBufferEnable", &out->depth_buffer_enable) &&
    get_named_bool(env, object, "DepthBufferWriteEnable", &out->depth_buffer_write_enable) &&
    get_named_bool(env, object, "StencilEnable", &out->stencil_enable) &&
    get_named_bool(env, object, "TwoSidedStencilMode", &out->two_sided_stencil_mode) &&
    get_named_u32(env, object, "DepthBufferFunction", &out->depth_buffer_function) &&
    get_named_u32(env, object, "StencilFunction", &out->stencil_function) &&
    get_named_i32(env, object, "StencilMask", &out->stencil_mask) &&
    get_named_i32(env, object, "StencilWriteMask", &out->stencil_write_mask) &&
    get_named_i32(env, object, "ReferenceStencil", &out->reference_stencil) &&
    get_named_u32(env, object, "StencilFail", &out->stencil_fail) &&
    get_named_u32(env, object, "StencilDepthBufferFail", &out->stencil_depth_buffer_fail) &&
    get_named_u32(env, object, "StencilPass", &out->stencil_pass) &&
    get_named_u32(env, object, "CounterClockwiseStencilFunction", &out->counter_clockwise_stencil_function) &&
    get_named_u32(env, object, "CounterClockwiseStencilFail", &out->counter_clockwise_stencil_fail) &&
    get_named_u32(env, object, "CounterClockwiseStencilDepthBufferFail", &out->counter_clockwise_stencil_depth_buffer_fail) &&
    get_named_u32(env, object, "CounterClockwiseStencilPass", &out->counter_clockwise_stencil_pass);
}

static int read_rasterizer_state(napi_env env, napi_value object, CNA_RasterizerState* out) {
  double depth_bias = 0, slope_bias = 0;
  memset(out, 0, sizeof(*out));
  out->struct_size = sizeof(*out);
  out->struct_version = 1;
  if (!get_named_u32(env, object, "CullMode", &out->cull_mode) ||
      !get_named_u32(env, object, "FillMode", &out->fill_mode) ||
      !get_named_double(env, object, "DepthBias", &depth_bias) ||
      !get_named_double(env, object, "SlopeScaleDepthBias", &slope_bias) ||
      !get_named_bool(env, object, "MultiSampleAntiAlias", &out->multi_sample_anti_alias) ||
      !get_named_bool(env, object, "ScissorTestEnable", &out->scissor_test_enable)) return 0;
  out->depth_bias = (float) depth_bias;
  out->slope_scale_depth_bias = (float) slope_bias;
  return 1;
}

static int read_sampler_state(napi_env env, napi_value object, CNA_SamplerState* out) {
  double bias = 0;
  memset(out, 0, sizeof(*out));
  out->struct_size = sizeof(*out);
  out->struct_version = 1;
  if (!get_named_u32(env, object, "AddressU", &out->address_u) ||
      !get_named_u32(env, object, "AddressV", &out->address_v) ||
      !get_named_u32(env, object, "AddressW", &out->address_w) ||
      !get_named_u32(env, object, "Filter", &out->filter) ||
      !get_named_i32(env, object, "MaxAnisotropy", &out->max_anisotropy) ||
      !get_named_i32(env, object, "MaxMipLevel", &out->max_mip_level) ||
      !get_named_double(env, object, "MipMapLevelOfDetailBias", &bias)) return 0;
  out->mip_map_level_of_detail_bias = (float) bias;
  return 1;
}

static napi_value get_graphics_device_status(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle device = 0;
  CNA_GraphicsDeviceStatus status = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  CNA_Result result = g_api.graphics_get_status(device, &status);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_get_status", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, status, &output), "graphics-device status");
  return output;
}

static napi_value set_graphics_blend_factor(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0;
  uint32_t packed = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &packed) != napi_ok) return NULL;
  const CNA_Color color = {(uint8_t) packed, (uint8_t) (packed >> 8),
    (uint8_t) (packed >> 16), (uint8_t) (packed >> 24)};
  CNA_Result result = g_api.graphics_set_blend_factor(device, color);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_blend_factor", result);
  return undefined_result(env, "blend-factor result");
}

#define GRAPHICS_STATE_SETTER(name, reader, field, ctype, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    napi_value args[2]; CNA_Handle device = 0; ctype state; \
    if (!require_loaded(env) || !get_args(env, info, 2, args) || \
        !read_handle(env, args[0], &device) || !reader(env, args[1], &state)) return NULL; \
    CNA_Result result = g_api.field(device, &state); \
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result); \
    return undefined_result(env, operation); \
  }

GRAPHICS_STATE_SETTER(set_graphics_blend_state, read_blend_state,
  graphics_set_blend_state, CNA_BlendState, "cna_graphics_device_set_blend_state")
GRAPHICS_STATE_SETTER(set_graphics_depth_stencil_state, read_depth_stencil_state,
  graphics_set_depth_stencil_state, CNA_DepthStencilState, "cna_graphics_device_set_depth_stencil_state")
GRAPHICS_STATE_SETTER(set_graphics_rasterizer_state, read_rasterizer_state,
  graphics_set_rasterizer_state, CNA_RasterizerState, "cna_graphics_device_set_rasterizer_state")

static napi_value set_graphics_sampler_state(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0;
  uint32_t stage = 0, slot = 0;
  CNA_SamplerState state;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &stage) != napi_ok ||
      napi_get_value_uint32(env, args[2], &slot) != napi_ok ||
      !read_sampler_state(env, args[3], &state)) return NULL;
  CNA_Result result = g_api.graphics_set_sampler_state(device, stage, slot, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_sampler_state", result);
  return undefined_result(env, "sampler-state result");
}

static napi_value set_graphics_texture(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0, texture = 0;
  uint32_t stage = 0, slot = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &stage) != napi_ok ||
      napi_get_value_uint32(env, args[2], &slot) != napi_ok ||
      !read_handle_allow_zero(env, args[3], &texture)) return NULL;
  CNA_Result result = g_api.graphics_set_texture(device, stage, slot, texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_texture", result);
  return undefined_result(env, "texture-binding result");
}

static napi_value set_graphics_i32(
  napi_env env, napi_callback_info info, GraphicsSetI32Fn function, const char* operation
) {
  napi_value args[2];
  CNA_Handle device = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = function(device, value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, operation);
}

static napi_value set_graphics_multi_sample_mask(napi_env env, napi_callback_info info) {
  return set_graphics_i32(env, info, g_api.graphics_set_multi_sample_mask,
    "cna_graphics_device_set_multi_sample_mask");
}
static napi_value set_graphics_reference_stencil(napi_env env, napi_callback_info info) {
  return set_graphics_i32(env, info, g_api.graphics_set_reference_stencil,
    "cna_graphics_device_set_reference_stencil");
}

static napi_value set_graphics_scissor(napi_env env, napi_callback_info info) {
  napi_value args[5];
  CNA_Handle device = 0;
  CNA_Rectangle value;
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &value.x) != napi_ok ||
      napi_get_value_int32(env, args[2], &value.y) != napi_ok ||
      napi_get_value_int32(env, args[3], &value.width) != napi_ok ||
      napi_get_value_int32(env, args[4], &value.height) != napi_ok) return NULL;
  CNA_Result result = g_api.graphics_set_scissor_rectangle(device, value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_scissor_rectangle", result);
  return undefined_result(env, "scissor result");
}

static napi_value set_graphics_viewport(napi_env env, napi_callback_info info) {
  napi_value args[7];
  CNA_Handle device = 0;
  CNA_Viewport value;
  double min_depth = 0, max_depth = 0;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &value.x) != napi_ok ||
      napi_get_value_int32(env, args[2], &value.y) != napi_ok ||
      napi_get_value_int32(env, args[3], &value.width) != napi_ok ||
      napi_get_value_int32(env, args[4], &value.height) != napi_ok ||
      napi_get_value_double(env, args[5], &min_depth) != napi_ok ||
      napi_get_value_double(env, args[6], &max_depth) != napi_ok) return NULL;
  value.min_depth = (float) min_depth;
  value.max_depth = (float) max_depth;
  CNA_Result result = g_api.graphics_set_viewport(device, value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_viewport", result);
  return undefined_result(env, "viewport result");
}

static napi_value set_graphics_vertex_buffers(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0;
  bool is_array = false;
  uint32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, args[1], &count) != napi_ok) {
    return throw_message(env, "vertex-buffer bindings must be an array");
  }
  CNA_VertexBufferBinding* bindings = count == 0 ? NULL :
    (CNA_VertexBufferBinding*) calloc(count, sizeof(*bindings));
  if (count != 0 && !bindings) return throw_message(env, "vertex-buffer binding allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value object;
    if (napi_get_element(env, args[1], index, &object) != napi_ok ||
        !get_named_handle(env, object, "VertexBuffer", &bindings[index].vertex_buffer) ||
        !get_named_i32(env, object, "VertexOffset", &bindings[index].vertex_offset) ||
        !get_named_i32(env, object, "InstanceFrequency", &bindings[index].instance_frequency)) {
      free(bindings);
      return NULL;
    }
  }
  CNA_Result result = g_api.graphics_set_vertex_buffers(device, bindings, count);
  free(bindings);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_vertex_buffers", result);
  return undefined_result(env, "vertex-buffer binding result");
}

static napi_value set_graphics_index_buffer(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0, buffer = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) || !read_handle_allow_zero(env, args[1], &buffer)) return NULL;
  CNA_Result result = g_api.graphics_set_index_buffer(device, buffer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_set_index_buffer", result);
  return undefined_result(env, "index-buffer binding result");
}

static napi_value draw_primitives(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0;
  uint32_t primitive_type = 0;
  int32_t start_vertex = 0, primitive_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &primitive_type) != napi_ok ||
      napi_get_value_int32(env, args[2], &start_vertex) != napi_ok ||
      napi_get_value_int32(env, args[3], &primitive_count) != napi_ok) return NULL;
  CNA_Result result = g_api.graphics_draw_primitives(device, primitive_type, start_vertex, primitive_count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_draw_primitives", result);
  return undefined_result(env, "draw-primitives result");
}

static napi_value draw_indexed_primitives(napi_env env, napi_callback_info info) {
  napi_value args[7];
  CNA_Handle device = 0;
  uint32_t primitive_type = 0;
  int32_t base_vertex = 0, min_vertex_index = 0, num_vertices = 0;
  int32_t start_index = 0, primitive_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &primitive_type) != napi_ok ||
      napi_get_value_int32(env, args[2], &base_vertex) != napi_ok ||
      napi_get_value_int32(env, args[3], &min_vertex_index) != napi_ok ||
      napi_get_value_int32(env, args[4], &num_vertices) != napi_ok ||
      napi_get_value_int32(env, args[5], &start_index) != napi_ok ||
      napi_get_value_int32(env, args[6], &primitive_count) != napi_ok) return NULL;
  CNA_Result result = g_api.graphics_draw_indexed(
    device, primitive_type, base_vertex, min_vertex_index, num_vertices, start_index, primitive_count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_draw_indexed_primitives", result);
  return undefined_result(env, "draw-indexed result");
}

static napi_value draw_instanced_primitives(napi_env env, napi_callback_info info) {
  napi_value args[8];
  CNA_Handle device = 0;
  uint32_t primitive_type = 0;
  int32_t base_vertex = 0, min_vertex_index = 0, num_vertices = 0;
  int32_t start_index = 0, primitive_count = 0, instance_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 8, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &primitive_type) != napi_ok ||
      napi_get_value_int32(env, args[2], &base_vertex) != napi_ok ||
      napi_get_value_int32(env, args[3], &min_vertex_index) != napi_ok ||
      napi_get_value_int32(env, args[4], &num_vertices) != napi_ok ||
      napi_get_value_int32(env, args[5], &start_index) != napi_ok ||
      napi_get_value_int32(env, args[6], &primitive_count) != napi_ok ||
      napi_get_value_int32(env, args[7], &instance_count) != napi_ok) return NULL;
  CNA_Result result = g_api.graphics_draw_instanced(
    device, primitive_type, base_vertex, min_vertex_index, num_vertices,
    start_index, primitive_count, instance_count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_device_draw_instanced_primitives", result);
  return undefined_result(env, "draw-instanced result");
}

static int create_user_vertex_declaration(
  napi_env env,
  napi_value value,
  uint32_t stride,
  CNA_VertexDeclarationHandle* out_declaration
) {
  bool is_array = false;
  uint32_t count = 0;
  if (napi_is_array(env, value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, value, &count) != napi_ok || count == 0 || count > 1024) {
    throw_message(env, "an explicit user vertex declaration must contain elements");
    return 0;
  }
  CNA_VertexElement* elements = (CNA_VertexElement*) calloc(count, sizeof(*elements));
  if (!elements) {
    throw_message(env, "user vertex-declaration allocation failed");
    return 0;
  }
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value object;
    uint32_t format = 0, usage = 0;
    if (napi_get_element(env, value, index, &object) != napi_ok ||
        !get_named_i32(env, object, "Offset", &elements[index].offset) ||
        !get_named_u32(env, object, "VertexElementFormat", &format) ||
        !get_named_u32(env, object, "VertexElementUsage", &usage) ||
        !get_named_i32(env, object, "UsageIndex", &elements[index].usage_index)) {
      free(elements);
      return 0;
    }
    if (elements[index].offset < 0 || elements[index].usage_index < 0 ||
        format > CNA_VERTEX_ELEMENT_FORMAT_HALF_VECTOR4 ||
        usage > CNA_VERTEX_ELEMENT_USAGE_TESSELLATE_FACTOR) {
      free(elements);
      throw_message(env, "invalid user vertex-declaration element");
      return 0;
    }
    elements[index].format = format;
    elements[index].usage = usage;
  }
  CNA_Result result = g_api.vertex_declaration_create(
    (int32_t) stride, elements, count, out_declaration);
  free(elements);
  if (result != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_vertex_declaration_create_with_stride", result);
    return 0;
  }
  return 1;
}

static int read_user_primitives(
  napi_env env,
  napi_value* args,
  CNA_UserPrimitives* primitives,
  void** owned_vertices,
  CNA_VertexDeclarationHandle* owned_declaration
) {
  CNA_Handle device = 0;
  uint32_t source = 0, stride = 0, capacity = 0;
  int32_t vertex_offset = 0, num_vertices = 0, primitive_count = 0;
  bool has_declaration = false;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  if (!read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &primitives->primitive_type) != napi_ok ||
      napi_get_value_uint32(env, args[2], &source) != napi_ok ||
      !read_byte_view(env, args[3], &bytes, &byte_count) ||
      napi_get_value_uint32(env, args[4], &stride) != napi_ok ||
      napi_get_value_uint32(env, args[5], &capacity) != napi_ok ||
      napi_get_value_int32(env, args[6], &vertex_offset) != napi_ok ||
      napi_get_value_int32(env, args[7], &num_vertices) != napi_ok ||
      napi_get_value_int32(env, args[8], &primitive_count) != napi_ok ||
      napi_get_value_bool(env, args[9], &has_declaration) != napi_ok) return 0;
  const uint32_t expected_stride = source == CNA_USER_VERTEX_SOURCE_POSITION_COLOR ? 16U :
    source == CNA_USER_VERTEX_SOURCE_POSITION_COLOR_TEXTURE ? 24U :
    source == CNA_USER_VERTEX_SOURCE_POSITION_TEXTURE ? 20U :
    source == CNA_USER_VERTEX_SOURCE_POSITION_NORMAL_TEXTURE ? 32U : 0U;
  if (expected_stride == 0 || stride != expected_stride || capacity == 0 ||
      capacity > SIZE_MAX / stride || byte_count != (size_t) capacity * stride ||
      vertex_offset < 0 || num_vertices <= 0 ||
      (uint32_t) vertex_offset > capacity || (uint32_t) num_vertices > capacity - (uint32_t) vertex_offset ||
      primitive_count <= 0) {
    throw_message(env, "invalid user vertex-array extent or built-in layout");
    return 0;
  }
  *owned_vertices = malloc(byte_count);
  if (!*owned_vertices) {
    throw_message(env, "user vertex-array allocation failed");
    return 0;
  }
  memcpy(*owned_vertices, bytes, byte_count);
  *owned_declaration = CNA_INVALID_HANDLE;
  if (has_declaration &&
      !create_user_vertex_declaration(env, args[10], stride, owned_declaration)) {
    free(*owned_vertices);
    *owned_vertices = NULL;
    return 0;
  }
  memset(primitives, 0, sizeof(*primitives));
  primitives->struct_size = sizeof(*primitives);
  primitives->struct_version = 1;
  if (napi_get_value_uint32(env, args[1], &primitives->primitive_type) != napi_ok) return 0;
  primitives->vertex_source = source;
  primitives->vertex_data = *owned_vertices;
  primitives->vertex_declaration = *owned_declaration;
  primitives->vertex_offset = vertex_offset;
  primitives->num_vertices = num_vertices;
  primitives->primitive_count = primitive_count;
  (void) device;
  return 1;
}

static napi_value draw_user_primitives(napi_env env, napi_callback_info info) {
  napi_value args[11];
  CNA_Handle device = 0;
  CNA_UserPrimitives primitives;
  void* vertices = NULL;
  CNA_VertexDeclarationHandle declaration = CNA_INVALID_HANDLE;
  if (!require_loaded(env) || !get_args(env, info, 11, args) ||
      !read_handle(env, args[0], &device) ||
      !read_user_primitives(env, args, &primitives, &vertices, &declaration)) return NULL;
  CNA_Result result = g_api.graphics_draw_user(device, &primitives);
  CNA_Result declaration_result = declaration == CNA_INVALID_HANDLE
    ? CNA_RESULT_SUCCESS : g_api.vertex_declaration_destroy(declaration);
  free(vertices);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_device_draw_user_primitives", result);
  }
  if (declaration_result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_vertex_declaration_destroy", declaration_result);
  }
  return undefined_result(env, "draw-user-primitives result");
}

static napi_value draw_user_indexed_primitives(napi_env env, napi_callback_info info) {
  napi_value args[15];
  CNA_Handle device = 0;
  CNA_UserPrimitives primitives;
  void* vertices = NULL;
  CNA_VertexDeclarationHandle declaration = CNA_INVALID_HANDLE;
  const uint8_t* index_bytes = NULL;
  size_t index_byte_count = 0;
  uint32_t index_element_size = 0, index_capacity = 0;
  int32_t index_offset = 0;
  if (!require_loaded(env) || !get_args(env, info, 15, args) ||
      !read_handle(env, args[0], &device) ||
      !read_user_primitives(env, args, &primitives, &vertices, &declaration) ||
      !read_byte_view(env, args[11], &index_bytes, &index_byte_count) ||
      napi_get_value_uint32(env, args[12], &index_element_size) != napi_ok ||
      napi_get_value_uint32(env, args[13], &index_capacity) != napi_ok ||
      napi_get_value_int32(env, args[14], &index_offset) != napi_ok) {
    if (declaration != CNA_INVALID_HANDLE) (void) g_api.vertex_declaration_destroy(declaration);
    free(vertices);
    return NULL;
  }
  const uint32_t index_stride = index_element_size == CNA_INDEX_ELEMENT_SIZE_SIXTEEN_BITS ? 2U :
    index_element_size == CNA_INDEX_ELEMENT_SIZE_THIRTY_TWO_BITS ? 4U : 0U;
  if (index_stride == 0 || index_capacity == 0 || index_capacity > SIZE_MAX / index_stride ||
      index_byte_count != (size_t) index_capacity * index_stride || index_offset < 0 ||
      (uint32_t) index_offset >= index_capacity) {
    if (declaration != CNA_INVALID_HANDLE) (void) g_api.vertex_declaration_destroy(declaration);
    free(vertices);
    return throw_message(env, "invalid user index-array extent or element size");
  }
  void* indices = malloc(index_byte_count);
  if (!indices) {
    if (declaration != CNA_INVALID_HANDLE) (void) g_api.vertex_declaration_destroy(declaration);
    free(vertices);
    return throw_message(env, "user index-array allocation failed");
  }
  memcpy(indices, index_bytes, index_byte_count);
  CNA_UserIndices index_request;
  memset(&index_request, 0, sizeof(index_request));
  index_request.struct_size = sizeof(index_request);
  index_request.struct_version = 1;
  index_request.index_element_size = index_element_size;
  index_request.index_offset = index_offset;
  index_request.index_data = indices;
  CNA_Result result = g_api.graphics_draw_user_indexed(device, &primitives, &index_request);
  CNA_Result declaration_result = declaration == CNA_INVALID_HANDLE
    ? CNA_RESULT_SUCCESS : g_api.vertex_declaration_destroy(declaration);
  free(indices);
  free(vertices);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_device_draw_user_indexed_primitives", result);
  }
  if (declaration_result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_vertex_declaration_destroy", declaration_result);
  }
  return undefined_result(env, "draw-user-indexed-primitives result");
}

static int read_matrix_array(napi_env env, napi_value value, CNA_Matrix* out, int* has_matrix) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok) return 0;
  if (type == napi_null) {
    *has_matrix = 0;
    return 1;
  }
  bool is_array = false;
  uint32_t length = 0;
  if (napi_is_array(env, value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, value, &length) != napi_ok || length != 16) {
    throw_message(env, "SpriteBatch transform must be null or a 16-number array");
    return 0;
  }
  float* fields[] = {
    &out->m11, &out->m12, &out->m13, &out->m14,
    &out->m21, &out->m22, &out->m23, &out->m24,
    &out->m31, &out->m32, &out->m33, &out->m34,
    &out->m41, &out->m42, &out->m43, &out->m44,
  };
  for (uint32_t index = 0; index < 16; index += 1) {
    napi_value item;
    double number = 0;
    if (napi_get_element(env, value, index, &item) != napi_ok ||
        napi_get_value_double(env, item, &number) != napi_ok) {
      throw_message(env, "SpriteBatch transform contains a non-number");
      return 0;
    }
    *fields[index] = (float) number;
  }
  *has_matrix = 1;
  return 1;
}

static int copy_effect_name(
  napi_env env,
  CNA_Handle handle,
  HandleU64OutFn size_function,
  HandleCopyStringFn copy_function,
  const char* operation,
  napi_value* out
) {
  uint64_t length = 0, copied = 0;
  CNA_Result result = size_function(handle, &length);
  if (result != CNA_RESULT_SUCCESS) {
    throw_result(env, operation, result);
    return 0;
  }
  if (length > SIZE_MAX) {
    throw_message(env, "effect reflection name exceeds host address space");
    return 0;
  }
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) {
    throw_message(env, "effect reflection name allocation failed");
    return 0;
  }
  result = copy_function(handle, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    throw_result(env, operation, result);
    return 0;
  }
  const napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, out);
  free(value);
  if (status != napi_ok) {
    throw_napi(env, operation);
    return 0;
  }
  return 1;
}

typedef struct EffectReflectionHandle {
  CNA_Handle handle;
  CNA_Bool is_pass;
} EffectReflectionHandle;

static int remember_effect_reflection_handle(
  EffectReflectionHandle** handles,
  size_t* count,
  CNA_Handle handle,
  CNA_Bool is_pass
) {
  if (*count == SIZE_MAX / sizeof(EffectReflectionHandle)) return 0;
  EffectReflectionHandle* resized = (EffectReflectionHandle*) realloc(
    *handles, (*count + 1) * sizeof(EffectReflectionHandle));
  if (!resized) return 0;
  *handles = resized;
  resized[*count] = (EffectReflectionHandle){handle, is_pass};
  *count += 1;
  return 1;
}

static void release_effect_reflection_handles(
  EffectReflectionHandle* handles,
  size_t count
) {
  for (size_t index = count; index > 0; index -= 1) {
    const EffectReflectionHandle item = handles[index - 1];
    if (item.handle == CNA_INVALID_HANDLE) continue;
    if (item.is_pass == CNA_TRUE) (void) g_api.effect_pass_destroy(item.handle);
    else (void) g_api.effect_technique_destroy(item.handle);
  }
  free(handles);
}

static napi_value create_effect_empty(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle device = 0, effect = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &device)) return NULL;
  CNA_Result result = g_api.effect_create_empty(device, &effect);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_effect_create_empty", result);
  return make_handle(env, effect);
}

static napi_value create_effect_compiled(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle device = 0, effect = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &device) ||
      !read_byte_view(env, args[1], &bytes, &length)) return NULL;
  if (length == 0) return throw_message(env, "compiled effect payload must not be empty");
  CNA_Result result = g_api.effect_create_compiled(device, bytes, length, &effect);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_effect_create_compiled", result);
  return make_handle(env, effect);
}

static napi_value clone_effect(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle source = 0, effect = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &source)) return NULL;
  CNA_Result result = g_api.effect_clone(source, &effect);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_effect_clone", result);
  return make_handle(env, effect);
}

static napi_value create_stock_effect(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle device = 0, effect = 0;
  uint32_t kind = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &kind) != napi_ok) return NULL;
  EffectCreateFn creator = NULL;
  const char* operation = NULL;
  switch (kind) {
    case 0: creator = g_api.basic_effect_create; operation = "cna_basic_effect_create"; break;
    case 1: creator = g_api.alpha_test_effect_create; operation = "cna_alpha_test_effect_create"; break;
    case 2: creator = g_api.dual_texture_effect_create; operation = "cna_dual_texture_effect_create"; break;
    case 3: creator = g_api.environment_map_effect_create; operation = "cna_environment_map_effect_create"; break;
    case 4: creator = g_api.skinned_effect_create; operation = "cna_skinned_effect_create"; break;
    default: return throw_message(env, "unknown stock effect kind");
  }
  CNA_Result result = creator(device, &effect);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return make_handle(env, effect);
}

static napi_value get_effect_reflection(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle effect = 0, collection = 0, current = 0;
  EffectReflectionHandle* owned = NULL;
  size_t owned_count = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &effect)) return NULL;
  CNA_Result result = g_api.effect_get_techniques(effect, &collection);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_effect_get_techniques", result);
  result = g_api.effect_get_current_technique(effect, &current);
  if (result != CNA_RESULT_SUCCESS) {
    (void) g_api.effect_technique_collection_destroy(collection);
    return throw_result(env, "cna_effect_get_current_technique", result);
  }
  uint32_t current_index = 0;
  result = g_api.effect_technique_get_index(current, &current_index);
  CNA_Result current_destroy_result = g_api.effect_technique_destroy(current);
  if (result == CNA_RESULT_SUCCESS) result = current_destroy_result;
  if (result != CNA_RESULT_SUCCESS) {
    (void) g_api.effect_technique_collection_destroy(collection);
    return throw_result(env, "CNA current effect technique reflection", result);
  }
  uint64_t technique_count = 0;
  result = g_api.effect_technique_collection_get_count(collection, &technique_count);
  if (result != CNA_RESULT_SUCCESS || technique_count > UINT32_MAX) {
    (void) g_api.effect_technique_collection_destroy(collection);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_effect_technique_collection_get_count", result);
    }
    return throw_message(env, "effect technique count exceeds Node array limits");
  }
  napi_value output, techniques, current_value;
  napi_status status = napi_create_object(env, &output);
  if (status == napi_ok) status = napi_create_array_with_length(env, (size_t) technique_count, &techniques);
  for (uint64_t technique_index = 0; status == napi_ok && technique_index < technique_count; technique_index += 1) {
    CNA_Handle technique = 0, passes_collection = 0;
    result = g_api.effect_technique_collection_get_at(collection, technique_index, &technique);
    if (result != CNA_RESULT_SUCCESS) break;
    if (!remember_effect_reflection_handle(&owned, &owned_count, technique, CNA_FALSE)) {
      (void) g_api.effect_technique_destroy(technique);
      result = CNA_RESULT_OUT_OF_MEMORY;
      break;
    }
    napi_value technique_object, technique_handle, technique_name, passes;
    status = napi_create_object(env, &technique_object);
    if (status == napi_ok) status = napi_create_bigint_uint64(env, technique, &technique_handle);
    if (status == napi_ok && !copy_effect_name(
        env, technique, g_api.effect_technique_get_name_size,
        g_api.effect_technique_copy_name, "CNA effect technique name", &technique_name)) {
      status = napi_pending_exception;
    }
    if (status != napi_ok) break;
    result = g_api.effect_technique_get_passes(technique, &passes_collection);
    if (result != CNA_RESULT_SUCCESS) break;
    uint64_t pass_count = 0;
    result = g_api.effect_pass_collection_get_count(passes_collection, &pass_count);
    if (result != CNA_RESULT_SUCCESS || pass_count > UINT32_MAX) {
      (void) g_api.effect_pass_collection_destroy(passes_collection);
      if (result == CNA_RESULT_SUCCESS) result = CNA_RESULT_OVERFLOW;
      break;
    }
    status = napi_create_array_with_length(env, (size_t) pass_count, &passes);
    for (uint64_t pass_index = 0; status == napi_ok && pass_index < pass_count; pass_index += 1) {
      CNA_Handle pass = 0;
      result = g_api.effect_pass_collection_get_at(passes_collection, pass_index, &pass);
      if (result != CNA_RESULT_SUCCESS) break;
      if (!remember_effect_reflection_handle(&owned, &owned_count, pass, CNA_TRUE)) {
        (void) g_api.effect_pass_destroy(pass);
        result = CNA_RESULT_OUT_OF_MEMORY;
        break;
      }
      napi_value pass_object, pass_handle, pass_name;
      status = napi_create_object(env, &pass_object);
      if (status == napi_ok) status = napi_create_bigint_uint64(env, pass, &pass_handle);
      if (status == napi_ok && !copy_effect_name(
          env, pass, g_api.effect_pass_get_name_size,
          g_api.effect_pass_copy_name, "CNA effect pass name", &pass_name)) {
        status = napi_pending_exception;
      }
      if (status == napi_ok) status = napi_set_named_property(env, pass_object, "Handle", pass_handle);
      if (status == napi_ok) status = napi_set_named_property(env, pass_object, "Name", pass_name);
      if (status == napi_ok) status = napi_set_element(env, passes, (uint32_t) pass_index, pass_object);
    }
    const CNA_Result passes_destroy_result = g_api.effect_pass_collection_destroy(passes_collection);
    if (result == CNA_RESULT_SUCCESS) result = passes_destroy_result;
    if (result != CNA_RESULT_SUCCESS || status != napi_ok) break;
    status = napi_set_named_property(env, technique_object, "Handle", technique_handle);
    if (status == napi_ok) status = napi_set_named_property(env, technique_object, "Name", technique_name);
    if (status == napi_ok) status = napi_set_named_property(env, technique_object, "Passes", passes);
    if (status == napi_ok) status = napi_set_element(
      env, techniques, (uint32_t) technique_index, technique_object);
  }
  const CNA_Result collection_destroy_result = g_api.effect_technique_collection_destroy(collection);
  if (result == CNA_RESULT_SUCCESS) result = collection_destroy_result;
  if (status == napi_ok) status = napi_create_uint32(env, current_index, &current_value);
  if (status == napi_ok) status = napi_set_named_property(env, output, "CurrentTechnique", current_value);
  if (status == napi_ok) status = napi_set_named_property(env, output, "Techniques", techniques);
  if (result != CNA_RESULT_SUCCESS || status != napi_ok) {
    release_effect_reflection_handles(owned, owned_count);
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, "CNA effect reflection", result);
    return throw_napi(env, "CNA effect reflection object");
  }
  free(owned);
  return output;
}

static napi_value set_effect_current_technique(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle effect = 0, technique = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &effect) ||
      !read_handle(env, args[1], &technique)) return NULL;
  CNA_Result result = g_api.effect_set_current_technique(effect, technique);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_effect_set_current_technique", result);
  return undefined_result(env, "effect current technique result");
}

static napi_value call_effect_handle(
  napi_env env, napi_callback_info info, GameHandleFn function, const char* operation
) {
  return call_game_handle(env, info, function, operation);
}

#define EFFECT_HANDLE_METHOD(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return call_effect_handle(env, info, g_api.field, operation); \
  }

EFFECT_HANDLE_METHOD(destroy_effect, effect_destroy, "cna_effect_destroy")
EFFECT_HANDLE_METHOD(apply_effect, effect_apply, "cna_effect_apply")
EFFECT_HANDLE_METHOD(destroy_effect_technique, effect_technique_destroy, "cna_effect_technique_destroy")
EFFECT_HANDLE_METHOD(destroy_effect_pass, effect_pass_destroy, "cna_effect_pass_destroy")
EFFECT_HANDLE_METHOD(apply_effect_pass, effect_pass_apply, "cna_effect_pass_apply")

static napi_value begin_sprite_batch_with_effect(napi_env env, napi_callback_info info) {
  napi_value args[8];
  CNA_Handle batch = 0, effect = 0;
  uint32_t sort_mode = 0;
  CNA_BlendState blend;
  CNA_SamplerState sampler;
  CNA_DepthStencilState depth;
  CNA_RasterizerState rasterizer;
  CNA_Matrix transform;
  int has_transform = 0;
  if (!require_loaded(env) || !get_args(env, info, 8, args) ||
      !read_handle(env, args[0], &batch) ||
      napi_get_value_uint32(env, args[1], &sort_mode) != napi_ok ||
      !read_blend_state(env, args[2], &blend) ||
      !read_sampler_state(env, args[3], &sampler) ||
      !read_depth_stencil_state(env, args[4], &depth) ||
      !read_rasterizer_state(env, args[5], &rasterizer) ||
      !read_handle(env, args[6], &effect) ||
      !read_matrix_array(env, args[7], &transform, &has_transform)) return NULL;
  CNA_Result result = g_api.sprite_batch_begin_effect(
    batch, sort_mode, &blend, &sampler, &depth, &rasterizer,
    effect, has_transform ? &transform : NULL);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_sprite_batch_begin_with_effect", result);
  }
  return undefined_result(env, "effect-bearing SpriteBatch begin result");
}

static int get_named_matrix(napi_env env, napi_value object, const char* name, CNA_Matrix* out) {
  napi_value value;
  int has_matrix = 0;
  if (!get_named_value(env, object, name, &value) ||
      !read_matrix_array(env, value, out, &has_matrix)) return 0;
  if (!has_matrix) {
    throw_message(env, "stock effect matrix must not be null");
    return 0;
  }
  return 1;
}

static int read_effect_vector3(napi_env env, napi_value value, CNA_Vector3* out) {
  bool is_array = false;
  uint32_t length = 0;
  if (napi_is_array(env, value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, value, &length) != napi_ok || length != 3) {
    throw_message(env, "stock effect Vector3 must be a three-number array");
    return 0;
  }
  float* fields[] = {&out->x, &out->y, &out->z};
  for (uint32_t index = 0; index < 3; index += 1) {
    napi_value item;
    double number = 0;
    if (napi_get_element(env, value, index, &item) != napi_ok ||
        napi_get_value_double(env, item, &number) != napi_ok) {
      throw_message(env, "stock effect Vector3 contains a non-number");
      return 0;
    }
    *fields[index] = (float) number;
  }
  return 1;
}

static int get_named_effect_vector3(
  napi_env env, napi_value object, const char* name, CNA_Vector3* out
) {
  napi_value value;
  return get_named_value(env, object, name, &value) && read_effect_vector3(env, value, out);
}

static int get_named_handle_allow_zero(
  napi_env env, napi_value object, const char* name, CNA_Handle* out
) {
  napi_value value;
  return get_named_value(env, object, name, &value) && read_handle_allow_zero(env, value, out);
}

static napi_value stock_effect_call_failed(
  napi_env env, const char* operation, CNA_Result result
) {
  return throw_result(env, operation, result);
}

#define STOCK_CALL(expression, operation) do { \
  result = (expression); \
  if (result != CNA_RESULT_SUCCESS) return stock_effect_call_failed(env, operation, result); \
} while (0)

static CNA_Result sync_directional_light(
  napi_env env,
  CNA_EffectHandle effect,
  uint32_t index,
  napi_value snapshot
) {
  CNA_Vector3 direction, diffuse, specular;
  CNA_Bool enabled = CNA_FALSE;
  if (!get_named_effect_vector3(env, snapshot, "Direction", &direction) ||
      !get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
      !get_named_effect_vector3(env, snapshot, "SpecularColor", &specular) ||
      !get_named_bool(env, snapshot, "Enabled", &enabled)) return CNA_RESULT_CALLBACK;
  CNA_DirectionalLightHandle light = CNA_INVALID_HANDLE;
  CNA_Result result = g_api.effect_get_directional_light(effect, index, &light);
  if (result == CNA_RESULT_SUCCESS) result = g_api.directional_light_set_direction(light, direction);
  if (result == CNA_RESULT_SUCCESS) result = g_api.directional_light_set_diffuse_color(light, diffuse);
  if (result == CNA_RESULT_SUCCESS) result = g_api.directional_light_set_specular_color(light, specular);
  if (result == CNA_RESULT_SUCCESS) result = g_api.directional_light_set_enabled(light, enabled);
  if (light != CNA_INVALID_HANDLE) {
    CNA_Result destroy_result = g_api.directional_light_destroy(light);
    if (result == CNA_RESULT_SUCCESS) result = destroy_result;
  }
  return result;
}

static napi_value sync_stock_effect(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_EffectHandle effect = CNA_INVALID_HANDLE;
  uint32_t kind = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &effect) ||
      napi_get_value_uint32(env, args[1], &kind) != napi_ok || kind > 4) return NULL;
  napi_value snapshot = args[2];
  CNA_Matrix world, view, projection;
  CNA_Vector3 fog_color;
  CNA_Bool fog_enabled = CNA_FALSE;
  double fog_start = 0, fog_end = 0;
  if (!get_named_matrix(env, snapshot, "World", &world) ||
      !get_named_matrix(env, snapshot, "View", &view) ||
      !get_named_matrix(env, snapshot, "Projection", &projection) ||
      !get_named_effect_vector3(env, snapshot, "FogColor", &fog_color) ||
      !get_named_bool(env, snapshot, "FogEnabled", &fog_enabled) ||
      !get_named_double(env, snapshot, "FogStart", &fog_start) ||
      !get_named_double(env, snapshot, "FogEnd", &fog_end)) return NULL;
  CNA_Result result = CNA_RESULT_SUCCESS;
  STOCK_CALL(g_api.effect_set_world(effect, world), "cna_effect_matrices_set_world");
  STOCK_CALL(g_api.effect_set_view(effect, view), "cna_effect_matrices_set_view");
  STOCK_CALL(g_api.effect_set_projection(effect, projection), "cna_effect_matrices_set_projection");
  STOCK_CALL(g_api.effect_set_fog_color(effect, fog_color), "cna_effect_fog_set_color");
  STOCK_CALL(g_api.effect_set_fog_enabled(effect, fog_enabled), "cna_effect_fog_set_enabled");
  STOCK_CALL(g_api.effect_set_fog_start(effect, (float) fog_start), "cna_effect_fog_set_start");
  STOCK_CALL(g_api.effect_set_fog_end(effect, (float) fog_end), "cna_effect_fog_set_end");

  if (kind == 0 || kind == 3 || kind == 4) {
    CNA_Vector3 ambient;
    CNA_Bool lighting_enabled = CNA_FALSE;
    napi_value lights;
    bool is_array = false;
    uint32_t light_count = 0;
    if (!get_named_effect_vector3(env, snapshot, "AmbientLightColor", &ambient) ||
        !get_named_bool(env, snapshot, "LightingEnabled", &lighting_enabled) ||
        !get_named_value(env, snapshot, "Lights", &lights) ||
        napi_is_array(env, lights, &is_array) != napi_ok || !is_array ||
        napi_get_array_length(env, lights, &light_count) != napi_ok || light_count != 3) {
      return throw_message(env, "stock effect requires exactly three directional lights");
    }
    STOCK_CALL(g_api.effect_set_ambient_color(effect, ambient), "cna_effect_lights_set_ambient_color");
    STOCK_CALL(g_api.effect_set_lighting_enabled(effect, lighting_enabled), "cna_effect_lights_set_enabled");
    for (uint32_t index = 0; index < 3; index += 1) {
      napi_value light;
      if (napi_get_element(env, lights, index, &light) != napi_ok) {
        return throw_napi(env, "stock effect directional-light snapshot");
      }
      result = sync_directional_light(env, effect, index, light);
      if (result != CNA_RESULT_SUCCESS) {
        if (result == CNA_RESULT_CALLBACK) return NULL;
        return throw_result(env, "CNA directional-light synchronization", result);
      }
    }
  }

  CNA_Vector3 diffuse, emissive, specular;
  CNA_Bool vertex_color = CNA_FALSE, prefer_per_pixel = CNA_FALSE, texture_enabled = CNA_FALSE;
  CNA_Handle texture = CNA_INVALID_HANDLE, texture2 = CNA_INVALID_HANDLE, environment_map = CNA_INVALID_HANDLE;
  double alpha = 0, specular_power = 0;
  switch (kind) {
    case 0:
      if (!get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
          !get_named_effect_vector3(env, snapshot, "EmissiveColor", &emissive) ||
          !get_named_effect_vector3(env, snapshot, "SpecularColor", &specular) ||
          !get_named_double(env, snapshot, "SpecularPower", &specular_power) ||
          !get_named_double(env, snapshot, "Alpha", &alpha) ||
          !get_named_bool(env, snapshot, "VertexColorEnabled", &vertex_color) ||
          !get_named_bool(env, snapshot, "PreferPerPixelLighting", &prefer_per_pixel) ||
          !get_named_bool(env, snapshot, "TextureEnabled", &texture_enabled) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture", &texture)) return NULL;
      STOCK_CALL(g_api.basic_effect_set_diffuse_color(effect, diffuse), "cna_basic_effect_set_diffuse_color");
      STOCK_CALL(g_api.basic_effect_set_emissive_color(effect, emissive), "cna_basic_effect_set_emissive_color");
      STOCK_CALL(g_api.basic_effect_set_specular_color(effect, specular), "cna_basic_effect_set_specular_color");
      STOCK_CALL(g_api.basic_effect_set_specular_power(effect, (float) specular_power), "cna_basic_effect_set_specular_power");
      STOCK_CALL(g_api.basic_effect_set_alpha(effect, (float) alpha), "cna_basic_effect_set_alpha");
      STOCK_CALL(g_api.basic_effect_set_vertex_color_enabled(effect, vertex_color), "cna_basic_effect_set_vertex_color_enabled");
      STOCK_CALL(g_api.basic_effect_set_prefer_per_pixel_lighting(effect, prefer_per_pixel), "cna_basic_effect_set_prefer_per_pixel_lighting");
      STOCK_CALL(g_api.basic_effect_set_texture_enabled(effect, texture_enabled), "cna_basic_effect_set_texture_enabled");
      STOCK_CALL(g_api.basic_effect_set_texture(effect, texture), "cna_basic_effect_set_texture");
      break;
    case 1: {
      uint32_t alpha_function = 0;
      int32_t reference_alpha = 0;
      if (!get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
          !get_named_double(env, snapshot, "Alpha", &alpha) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture", &texture) ||
          !get_named_bool(env, snapshot, "VertexColorEnabled", &vertex_color) ||
          !get_named_u32(env, snapshot, "AlphaFunction", &alpha_function) ||
          !get_named_i32(env, snapshot, "ReferenceAlpha", &reference_alpha)) return NULL;
      STOCK_CALL(g_api.alpha_test_effect_set_diffuse_color(effect, diffuse), "cna_alpha_test_effect_set_diffuse_color");
      STOCK_CALL(g_api.alpha_test_effect_set_alpha(effect, (float) alpha), "cna_alpha_test_effect_set_alpha");
      STOCK_CALL(g_api.alpha_test_effect_set_texture(effect, texture), "cna_alpha_test_effect_set_texture");
      STOCK_CALL(g_api.alpha_test_effect_set_vertex_color_enabled(effect, vertex_color), "cna_alpha_test_effect_set_vertex_color_enabled");
      STOCK_CALL(g_api.alpha_test_effect_set_alpha_function(effect, alpha_function), "cna_alpha_test_effect_set_alpha_function");
      STOCK_CALL(g_api.alpha_test_effect_set_reference_alpha(effect, reference_alpha), "cna_alpha_test_effect_set_reference_alpha");
      break;
    }
    case 2:
      if (!get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
          !get_named_double(env, snapshot, "Alpha", &alpha) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture", &texture) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture2", &texture2) ||
          !get_named_bool(env, snapshot, "VertexColorEnabled", &vertex_color)) return NULL;
      STOCK_CALL(g_api.dual_texture_effect_set_diffuse_color(effect, diffuse), "cna_dual_texture_effect_set_diffuse_color");
      STOCK_CALL(g_api.dual_texture_effect_set_alpha(effect, (float) alpha), "cna_dual_texture_effect_set_alpha");
      STOCK_CALL(g_api.dual_texture_effect_set_texture(effect, 0, texture), "cna_dual_texture_effect_set_texture[0]");
      STOCK_CALL(g_api.dual_texture_effect_set_texture(effect, 1, texture2), "cna_dual_texture_effect_set_texture[1]");
      STOCK_CALL(g_api.dual_texture_effect_set_vertex_color_enabled(effect, vertex_color), "cna_dual_texture_effect_set_vertex_color_enabled");
      break;
    case 3: {
      CNA_Vector3 environment_specular;
      double amount = 0, fresnel = 0;
      if (!get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
          !get_named_effect_vector3(env, snapshot, "EmissiveColor", &emissive) ||
          !get_named_double(env, snapshot, "Alpha", &alpha) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture", &texture) ||
          !get_named_handle_allow_zero(env, snapshot, "EnvironmentMap", &environment_map) ||
          !get_named_double(env, snapshot, "EnvironmentMapAmount", &amount) ||
          !get_named_effect_vector3(env, snapshot, "EnvironmentMapSpecular", &environment_specular) ||
          !get_named_double(env, snapshot, "FresnelFactor", &fresnel)) return NULL;
      STOCK_CALL(g_api.environment_map_effect_set_diffuse_color(effect, diffuse), "cna_environment_map_effect_set_diffuse_color");
      STOCK_CALL(g_api.environment_map_effect_set_emissive_color(effect, emissive), "cna_environment_map_effect_set_emissive_color");
      STOCK_CALL(g_api.environment_map_effect_set_alpha(effect, (float) alpha), "cna_environment_map_effect_set_alpha");
      STOCK_CALL(g_api.environment_map_effect_set_texture(effect, texture), "cna_environment_map_effect_set_texture");
      STOCK_CALL(g_api.environment_map_effect_set_environment_map(effect, environment_map), "cna_environment_map_effect_set_environment_map");
      STOCK_CALL(g_api.environment_map_effect_set_amount(effect, (float) amount), "cna_environment_map_effect_set_amount");
      STOCK_CALL(g_api.environment_map_effect_set_specular(effect, environment_specular), "cna_environment_map_effect_set_specular");
      STOCK_CALL(g_api.environment_map_effect_set_fresnel_factor(effect, (float) fresnel), "cna_environment_map_effect_set_fresnel_factor");
      break;
    }
    case 4: {
      int32_t weights = 0;
      napi_value bones;
      bool is_array = false;
      uint32_t bone_count = 0;
      if (!get_named_effect_vector3(env, snapshot, "DiffuseColor", &diffuse) ||
          !get_named_effect_vector3(env, snapshot, "EmissiveColor", &emissive) ||
          !get_named_effect_vector3(env, snapshot, "SpecularColor", &specular) ||
          !get_named_double(env, snapshot, "SpecularPower", &specular_power) ||
          !get_named_double(env, snapshot, "Alpha", &alpha) ||
          !get_named_bool(env, snapshot, "PreferPerPixelLighting", &prefer_per_pixel) ||
          !get_named_handle_allow_zero(env, snapshot, "Texture", &texture) ||
          !get_named_i32(env, snapshot, "WeightsPerVertex", &weights) ||
          !get_named_bool(env, snapshot, "VertexColorEnabled", &vertex_color) ||
          !get_named_value(env, snapshot, "BoneTransforms", &bones) ||
          napi_is_array(env, bones, &is_array) != napi_ok || !is_array ||
          napi_get_array_length(env, bones, &bone_count) != napi_ok || bone_count < 1 || bone_count > 72) {
        return throw_message(env, "SkinnedEffect requires one through 72 bone transforms");
      }
      STOCK_CALL(g_api.skinned_effect_set_diffuse_color(effect, diffuse), "cna_skinned_effect_set_diffuse_color");
      STOCK_CALL(g_api.skinned_effect_set_emissive_color(effect, emissive), "cna_skinned_effect_set_emissive_color");
      STOCK_CALL(g_api.skinned_effect_set_specular_color(effect, specular), "cna_skinned_effect_set_specular_color");
      STOCK_CALL(g_api.skinned_effect_set_specular_power(effect, (float) specular_power), "cna_skinned_effect_set_specular_power");
      STOCK_CALL(g_api.skinned_effect_set_alpha(effect, (float) alpha), "cna_skinned_effect_set_alpha");
      STOCK_CALL(g_api.skinned_effect_set_prefer_per_pixel_lighting(effect, prefer_per_pixel), "cna_skinned_effect_set_prefer_per_pixel_lighting");
      STOCK_CALL(g_api.skinned_effect_set_texture(effect, texture), "cna_skinned_effect_set_texture");
      STOCK_CALL(g_api.skinned_effect_set_weights_per_vertex(effect, weights), "cna_skinned_effect_set_weights_per_vertex");
      CNA_Matrix* transforms = (CNA_Matrix*) calloc(bone_count, sizeof(CNA_Matrix));
      if (!transforms) return throw_message(env, "SkinnedEffect bone allocation failed");
      for (uint32_t index = 0; index < bone_count; index += 1) {
        napi_value item;
        int has_matrix = 0;
        if (napi_get_element(env, bones, index, &item) != napi_ok ||
            !read_matrix_array(env, item, &transforms[index], &has_matrix) || !has_matrix) {
          free(transforms);
          return NULL;
        }
      }
      result = g_api.skinned_effect_set_bone_transforms(effect, transforms, bone_count);
      free(transforms);
      if (result != CNA_RESULT_SUCCESS) {
        return stock_effect_call_failed(env, "cna_skinned_effect_set_bone_transforms", result);
      }
      STOCK_CALL(g_api.skinned_effect_set_vertex_color_enabled(effect, vertex_color), "cna_skinned_effect_set_vertex_color_enabled");
      break;
    }
  }
  return undefined_result(env, "stock effect synchronization result");
}

#undef STOCK_CALL

static napi_value begin_sprite_batch_with_states(napi_env env, napi_callback_info info) {
  napi_value args[7];
  CNA_Handle batch = 0;
  uint32_t sort_mode = 0;
  CNA_BlendState blend;
  CNA_SamplerState sampler;
  CNA_DepthStencilState depth;
  CNA_RasterizerState rasterizer;
  CNA_Matrix transform;
  int has_transform = 0;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      !read_handle(env, args[0], &batch) ||
      napi_get_value_uint32(env, args[1], &sort_mode) != napi_ok ||
      !read_blend_state(env, args[2], &blend) ||
      !read_sampler_state(env, args[3], &sampler) ||
      !read_depth_stencil_state(env, args[4], &depth) ||
      !read_rasterizer_state(env, args[5], &rasterizer) ||
      !read_matrix_array(env, args[6], &transform, &has_transform)) return NULL;
  CNA_Result result = has_transform
    ? g_api.sprite_batch_begin_effect(
        batch, sort_mode, &blend, &sampler, &depth, &rasterizer,
        CNA_INVALID_HANDLE, &transform)
    : g_api.sprite_batch_begin_states(batch, sort_mode, &blend, &sampler, &depth, &rasterizer);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, has_transform
      ? "cna_sprite_batch_begin_with_effect" : "cna_sprite_batch_begin_with_states", result);
  }
  return undefined_result(env, "advanced SpriteBatch begin result");
}

static uint32_t vertex_type_size(uint32_t vertex_type) {
  switch (vertex_type) {
    case CNA_VERTEX_TYPE_POSITION_COLOR: return (uint32_t) sizeof(CNA_VertexPositionColor);
    case CNA_VERTEX_TYPE_POSITION_COLOR_TEXTURE: return (uint32_t) sizeof(CNA_VertexPositionColorTexture);
    case CNA_VERTEX_TYPE_POSITION_TEXTURE: return (uint32_t) sizeof(CNA_VertexPositionTexture);
    case CNA_VERTEX_TYPE_POSITION_NORMAL_TEXTURE: return (uint32_t) sizeof(CNA_VertexPositionNormalTexture);
    default: return 0;
  }
}

static napi_value set_vertex_buffer_data(napi_env env, napi_callback_info info) {
  napi_value args[7];
  CNA_Handle buffer = 0;
  uint32_t vertex_type = 0, options = 0, start = 0, count = 0, capacity = 0;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &vertex_type) != napi_ok ||
      napi_get_value_uint32(env, args[2], &options) != napi_ok ||
      napi_get_value_uint32(env, args[3], &start) != napi_ok ||
      napi_get_value_uint32(env, args[4], &count) != napi_ok ||
      napi_get_value_uint32(env, args[5], &capacity) != napi_ok ||
      !read_byte_view(env, args[6], &bytes, &byte_count)) return NULL;
  const uint32_t width = vertex_type_size(vertex_type);
  if (width == 0 || capacity > SIZE_MAX / width || byte_count != (size_t) capacity * width) {
    return throw_message(env, "typed VertexBuffer byte snapshot has the wrong extent");
  }
  CNA_VertexBufferTransfer transfer;
  memset(&transfer, 0, sizeof(transfer));
  transfer.struct_size = sizeof(transfer);
  transfer.struct_version = 1;
  transfer.vertex_type = vertex_type;
  transfer.options = options;
  transfer.start_index = start;
  transfer.element_count = count;
  CNA_Result result = g_api.vertex_buffer_set_data(buffer, &transfer, bytes, capacity);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_vertex_buffer_set_data", result);
  return undefined_result(env, "typed VertexBuffer upload result");
}

static napi_value set_vertex_buffer_raw_at(napi_env env, napi_callback_info info) {
  napi_value args[6];
  CNA_Handle buffer = 0;
  uint32_t offset = 0, vertex_count = 0, stride = 0, options = 0;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 6, args) ||
      !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &offset) != napi_ok ||
      !read_byte_view(env, args[2], &bytes, &byte_count) ||
      napi_get_value_uint32(env, args[3], &vertex_count) != napi_ok ||
      napi_get_value_uint32(env, args[4], &stride) != napi_ok ||
      napi_get_value_uint32(env, args[5], &options) != napi_ok) return NULL;
  /* vertex_resources.h states that the options-carrying route with CNA_SET_DATA_NONE matches the
     plain one, so the plain route stays the one taken for None. Both remain imported and both are
     reached, rather than one becoming a stale import. */
  const char* route = "cna_vertex_buffer_set_data_raw_at";
  CNA_Result result;
  if (options == CNA_SET_DATA_NONE) {
    result = g_api.vertex_buffer_set_raw_at(buffer, offset, bytes, byte_count, vertex_count, stride);
  } else {
    route = "cna_vertex_buffer_set_data_raw_at_with_options";
    result = g_api.vertex_buffer_set_raw_at_with_options(
      buffer, offset, bytes, byte_count, vertex_count, stride, options);
  }
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, route, result);
  return undefined_result(env, "VertexBuffer window upload result");
}

static napi_value get_vertex_buffer_raw_at(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle buffer = 0;
  uint32_t offset = 0, vertex_count = 0, stride = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &offset) != napi_ok ||
      napi_get_value_uint32(env, args[2], &vertex_count) != napi_ok ||
      napi_get_value_uint32(env, args[3], &stride) != napi_ok) return NULL;
  if (stride == 0 || vertex_count > SIZE_MAX / stride) {
    return throw_message(env, "VertexBuffer readback extent overflows native memory");
  }
  const size_t byte_count = (size_t) vertex_count * stride;
  uint8_t* bytes = byte_count == 0 ? NULL : (uint8_t*) malloc(byte_count);
  if (byte_count != 0 && !bytes) return throw_message(env, "VertexBuffer readback allocation failed");
  CNA_Result result = g_api.vertex_buffer_get_raw(
    buffer, offset, bytes, byte_count, vertex_count, stride);
  if (result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_vertex_buffer_get_data_raw", result);
  }
  napi_value output = copy_bytes(env, bytes, byte_count, "VertexBuffer window readback copy");
  free(bytes);
  return output;
}

static napi_value get_vertex_buffer_content_lost(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle buffer = 0;
  CNA_VertexBufferInfo value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &buffer)) return NULL;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.vertex_buffer_get_info(buffer, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_vertex_buffer_get_info", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value.is_content_lost == CNA_TRUE, &output), "VertexBuffer content state");
  return output;
}

static napi_value set_index_buffer_data(napi_env env, napi_callback_info info) {
  napi_value args[9];
  CNA_Handle buffer = 0;
  uint32_t element_size = 0, options = 0, offset = 0, start = 0, count = 0, capacity = 0;
  bool has_offset = false;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  if (!require_loaded(env) || !get_args(env, info, 9, args) ||
      !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &element_size) != napi_ok ||
      napi_get_value_uint32(env, args[2], &options) != napi_ok ||
      napi_get_value_bool(env, args[3], &has_offset) != napi_ok ||
      napi_get_value_uint32(env, args[4], &offset) != napi_ok ||
      napi_get_value_uint32(env, args[5], &start) != napi_ok ||
      napi_get_value_uint32(env, args[6], &count) != napi_ok ||
      napi_get_value_uint32(env, args[7], &capacity) != napi_ok ||
      !read_byte_view(env, args[8], &bytes, &byte_count)) return NULL;
  const uint32_t width = element_size == CNA_INDEX_ELEMENT_SIZE_SIXTEEN_BITS ? 2 :
    element_size == CNA_INDEX_ELEMENT_SIZE_THIRTY_TWO_BITS ? 4 : 0;
  if (width == 0 || capacity > SIZE_MAX / width || byte_count != (size_t) capacity * width) {
    return throw_message(env, "typed IndexBuffer byte snapshot has the wrong extent");
  }
  CNA_IndexBufferTransfer transfer;
  memset(&transfer, 0, sizeof(transfer));
  transfer.struct_size = sizeof(transfer);
  transfer.struct_version = 1;
  transfer.index_element_size = element_size;
  transfer.options = options;
  transfer.start_index = start;
  transfer.element_count = count;
  CNA_Result result = has_offset
    ? g_api.index_buffer_set_at(buffer, offset, &transfer, bytes, capacity)
    : g_api.index_buffer_set(buffer, &transfer, bytes, capacity);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env,
    has_offset ? "cna_index_buffer_set_data_at" : "cna_index_buffer_set_data", result);
  return undefined_result(env, "typed IndexBuffer upload result");
}

static napi_value get_index_buffer_content_lost(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle buffer = 0;
  CNA_IndexBufferInfo value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &buffer)) return NULL;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.index_buffer_get_info(buffer, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_index_buffer_get_info", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value.is_content_lost == CNA_TRUE, &output), "IndexBuffer content state");
  return output;
}

static int read_u32_view(
  napi_env env, napi_value value, const uint32_t** out_data, size_t* out_length
) {
  bool is_typed = false;
  napi_typedarray_type type;
  void* data = NULL;
  napi_value array_buffer;
  size_t byte_offset = 0;
  if (napi_is_typedarray(env, value, &is_typed) != napi_ok || !is_typed ||
      napi_get_typedarray_info(
        env, value, &type, out_length, &data, &array_buffer, &byte_offset) != napi_ok ||
      type != napi_uint32_array) {
    throw_message(env, "expected a Uint32Array");
    return 0;
  }
  (void) array_buffer;
  (void) byte_offset;
  *out_data = (const uint32_t*) data;
  return 1;
}

static CNA_Color* colors_from_packed(const uint32_t* packed, size_t count) {
  CNA_Color* colors = count == 0 ? NULL : (CNA_Color*) malloc(count * sizeof(*colors));
  if (count != 0 && !colors) return NULL;
  for (size_t index = 0; index < count; index += 1) {
    colors[index] = (CNA_Color){
      (uint8_t) packed[index], (uint8_t) (packed[index] >> 8),
      (uint8_t) (packed[index] >> 16), (uint8_t) (packed[index] >> 24)
    };
  }
  return colors;
}

static napi_value packed_from_colors(
  napi_env env, const CNA_Color* colors, size_t count, const char* operation
) {
  napi_value buffer, output;
  void* data = NULL;
  if (count > SIZE_MAX / sizeof(uint32_t) ||
      napi_create_arraybuffer(env, count * sizeof(uint32_t), &data, &buffer) != napi_ok ||
      napi_create_typedarray(env, napi_uint32_array, count, buffer, 0, &output) != napi_ok) {
    return throw_napi(env, operation);
  }
  uint32_t* packed = (uint32_t*) data;
  for (size_t index = 0; index < count; index += 1) {
    packed[index] = (uint32_t) colors[index].r |
      ((uint32_t) colors[index].g << 8) |
      ((uint32_t) colors[index].b << 16) |
      ((uint32_t) colors[index].a << 24);
  }
  return output;
}

static napi_value create_texture3d(napi_env env, napi_callback_info info) {
  napi_value args[6];
  CNA_Handle device = 0, texture = 0;
  uint32_t width = 0, height = 0, depth = 0, format = 0;
  bool mip_map = false;
  if (!require_loaded(env) || !get_args(env, info, 6, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &width) != napi_ok ||
      napi_get_value_uint32(env, args[2], &height) != napi_ok ||
      napi_get_value_uint32(env, args[3], &depth) != napi_ok ||
      napi_get_value_bool(env, args[4], &mip_map) != napi_ok ||
      napi_get_value_uint32(env, args[5], &format) != napi_ok) return NULL;
  CNA_Texture3DCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.width = width;
  create_info.height = height;
  create_info.depth = depth;
  create_info.mip_map = mip_map ? CNA_TRUE : CNA_FALSE;
  create_info.format = format;
  CNA_Result result = g_api.texture3d_create(device, &create_info, &texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture3d_create", result);
  return make_handle(env, texture);
}

static napi_value get_texture3d_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle texture = 0;
  CNA_Texture3DInfo value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &texture)) return NULL;
  memset(&value, 0, sizeof(value)); value.struct_size = sizeof(value); value.struct_version = 1;
  CNA_Result result = g_api.texture3d_get_info(texture, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture3d_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "Texture3D info");
  if (!set_u32(env, output, "Width", value.width) || !set_u32(env, output, "Height", value.height) ||
      !set_u32(env, output, "Depth", value.depth) || !set_u32(env, output, "LevelCount", value.level_count) ||
      !set_u32(env, output, "Format", value.format)) return throw_napi(env, "Texture3D info properties");
  return output;
}

static int read_texture3d_transfer(
  napi_env env, napi_value* args, CNA_Texture3DTransfer* transfer
) {
  uint32_t start_index = 0, element_count = 0;
  memset(transfer, 0, sizeof(*transfer));
  transfer->struct_size = sizeof(*transfer); transfer->struct_version = 1;
  if (napi_get_value_int32(env, args[1], &transfer->level) != napi_ok ||
      napi_get_value_int32(env, args[2], &transfer->left) != napi_ok ||
      napi_get_value_int32(env, args[3], &transfer->top) != napi_ok ||
      napi_get_value_int32(env, args[4], &transfer->right) != napi_ok ||
      napi_get_value_int32(env, args[5], &transfer->bottom) != napi_ok ||
      napi_get_value_int32(env, args[6], &transfer->front) != napi_ok ||
      napi_get_value_int32(env, args[7], &transfer->back) != napi_ok ||
      napi_get_value_uint32(env, args[8], &start_index) != napi_ok ||
      napi_get_value_uint32(env, args[9], &element_count) != napi_ok) return 0;
  transfer->start_index = start_index;
  transfer->element_count = element_count;
  return 1;
}

static napi_value set_texture3d_colors(napi_env env, napi_callback_info info) {
  napi_value args[11];
  CNA_Handle texture = 0;
  CNA_Texture3DTransfer transfer;
  const uint32_t* packed = NULL;
  size_t capacity = 0;
  if (!require_loaded(env) || !get_args(env, info, 11, args) ||
      !read_handle(env, args[0], &texture) ||
      !read_texture3d_transfer(env, args, &transfer) ||
      !read_u32_view(env, args[10], &packed, &capacity)) return NULL;
  CNA_Color* colors = colors_from_packed(packed, capacity);
  if (capacity != 0 && !colors) return throw_message(env, "Texture3D color allocation failed");
  CNA_Result result = g_api.texture3d_set(texture, &transfer, colors, capacity);
  free(colors);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texture3d_set_data", result);
  return undefined_result(env, "Texture3D upload result");
}

static napi_value get_texture3d_colors(napi_env env, napi_callback_info info) {
  napi_value args[11];
  CNA_Handle texture = 0;
  CNA_Texture3DTransfer transfer;
  uint32_t capacity = 0;
  if (!require_loaded(env) || !get_args(env, info, 11, args) ||
      !read_handle(env, args[0], &texture) ||
      !read_texture3d_transfer(env, args, &transfer) ||
      napi_get_value_uint32(env, args[10], &capacity) != napi_ok) return NULL;
  CNA_Color* colors = capacity == 0 ? NULL : (CNA_Color*) calloc(capacity, sizeof(*colors));
  if (capacity != 0 && !colors) return throw_message(env, "Texture3D readback allocation failed");
  uint64_t required = 0;
  CNA_Result result = g_api.texture3d_get(texture, &transfer, colors, capacity, &required);
  if (result != CNA_RESULT_SUCCESS) { free(colors); return throw_result(env, "cna_texture3d_get_data", result); }
  if (required != transfer.element_count) {
    free(colors);
    return throw_message(env, "CNA returned an inconsistent Texture3D readback size");
  }
  napi_value output = packed_from_colors(env, colors, capacity, "Texture3D readback copy");
  free(colors);
  return output;
}

static napi_value create_texturecube(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0, texture = 0;
  uint32_t size = 0, format = 0;
  bool mip_map = false;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &size) != napi_ok ||
      napi_get_value_bool(env, args[2], &mip_map) != napi_ok ||
      napi_get_value_uint32(env, args[3], &format) != napi_ok) return NULL;
  CNA_TextureCubeCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info)); create_info.struct_size = sizeof(create_info); create_info.struct_version = 1;
  create_info.size = size; create_info.mip_map = mip_map ? CNA_TRUE : CNA_FALSE; create_info.format = format;
  CNA_Result result = g_api.texturecube_create(device, &create_info, &texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texturecube_create", result);
  return make_handle(env, texture);
}

static napi_value get_texturecube_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle texture = 0;
  CNA_TextureCubeInfo value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) || !read_handle(env, args[0], &texture)) return NULL;
  memset(&value, 0, sizeof(value)); value.struct_size = sizeof(value); value.struct_version = 1;
  CNA_Result result = g_api.texturecube_get_info(texture, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texturecube_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "TextureCube info");
  if (!set_u32(env, output, "Size", value.size) || !set_u32(env, output, "LevelCount", value.level_count) ||
      !set_u32(env, output, "Format", value.format)) return throw_napi(env, "TextureCube info properties");
  return output;
}

static int read_texturecube_transfer(
  napi_env env, napi_value* args, CNA_TextureCubeTransfer* transfer
) {
  bool has_rectangle = false;
  uint32_t start_index = 0, element_count = 0;
  memset(transfer, 0, sizeof(*transfer)); transfer->struct_size = sizeof(*transfer); transfer->struct_version = 1;
  if (napi_get_value_uint32(env, args[1], &transfer->face) != napi_ok ||
      napi_get_value_int32(env, args[2], &transfer->level) != napi_ok ||
      napi_get_value_bool(env, args[3], &has_rectangle) != napi_ok ||
      napi_get_value_int32(env, args[4], &transfer->rectangle.x) != napi_ok ||
      napi_get_value_int32(env, args[5], &transfer->rectangle.y) != napi_ok ||
      napi_get_value_int32(env, args[6], &transfer->rectangle.width) != napi_ok ||
      napi_get_value_int32(env, args[7], &transfer->rectangle.height) != napi_ok ||
      napi_get_value_uint32(env, args[8], &start_index) != napi_ok ||
      napi_get_value_uint32(env, args[9], &element_count) != napi_ok) return 0;
  transfer->has_rectangle = has_rectangle ? CNA_TRUE : CNA_FALSE;
  transfer->start_index = start_index;
  transfer->element_count = element_count;
  return 1;
}

static napi_value set_texturecube_colors(napi_env env, napi_callback_info info) {
  napi_value args[11]; CNA_Handle texture = 0; CNA_TextureCubeTransfer transfer;
  const uint32_t* packed = NULL; size_t capacity = 0;
  if (!require_loaded(env) || !get_args(env, info, 11, args) || !read_handle(env, args[0], &texture) ||
      !read_texturecube_transfer(env, args, &transfer) || !read_u32_view(env, args[10], &packed, &capacity)) return NULL;
  CNA_Color* colors = colors_from_packed(packed, capacity);
  if (capacity != 0 && !colors) return throw_message(env, "TextureCube color allocation failed");
  CNA_Result result = g_api.texturecube_set(texture, &transfer, colors, capacity); free(colors);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_texturecube_set_data", result);
  return undefined_result(env, "TextureCube upload result");
}

static napi_value get_texturecube_colors(napi_env env, napi_callback_info info) {
  napi_value args[11]; CNA_Handle texture = 0; CNA_TextureCubeTransfer transfer; uint32_t capacity = 0;
  if (!require_loaded(env) || !get_args(env, info, 11, args) || !read_handle(env, args[0], &texture) ||
      !read_texturecube_transfer(env, args, &transfer) ||
      napi_get_value_uint32(env, args[10], &capacity) != napi_ok) return NULL;
  CNA_Color* colors = capacity == 0 ? NULL : (CNA_Color*) calloc(capacity, sizeof(*colors));
  if (capacity != 0 && !colors) return throw_message(env, "TextureCube readback allocation failed");
  uint64_t required = 0; CNA_Result result = g_api.texturecube_get(texture, &transfer, colors, capacity, &required);
  if (result != CNA_RESULT_SUCCESS) { free(colors); return throw_result(env, "cna_texturecube_get_data", result); }
  if (required != transfer.element_count) {
    free(colors);
    return throw_message(env, "CNA returned an inconsistent TextureCube readback size");
  }
  napi_value output = packed_from_colors(env, colors, capacity, "TextureCube readback copy"); free(colors); return output;
}

static napi_value create_render_target2d(napi_env env, napi_callback_info info) {
  napi_value args[8];
  CNA_Handle device = 0, target = 0;
  CNA_RenderTarget2DCreateInfo create_info;
  bool mip_map = false;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  if (!require_loaded(env) || !get_args(env, info, 8, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &create_info.width) != napi_ok ||
      napi_get_value_uint32(env, args[2], &create_info.height) != napi_ok ||
      napi_get_value_bool(env, args[3], &mip_map) != napi_ok ||
      napi_get_value_uint32(env, args[4], &create_info.format) != napi_ok ||
      napi_get_value_uint32(env, args[5], &create_info.depth_format) != napi_ok ||
      napi_get_value_int32(env, args[6], &create_info.multi_sample_count) != napi_ok ||
      napi_get_value_uint32(env, args[7], &create_info.usage) != napi_ok) return NULL;
  create_info.mip_map = mip_map ? CNA_TRUE : CNA_FALSE;
  CNA_Result result = g_api.render_target2d_create(device, &create_info, &target);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_target2d_create", result);
  return make_handle(env, target);
}

static napi_value create_render_target_cube(napi_env env, napi_callback_info info) {
  napi_value args[7];
  CNA_Handle device = 0, target = 0;
  CNA_RenderTargetCubeCreateInfo create_info;
  bool mip_map = false;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &create_info.size) != napi_ok ||
      napi_get_value_bool(env, args[2], &mip_map) != napi_ok ||
      napi_get_value_uint32(env, args[3], &create_info.format) != napi_ok ||
      napi_get_value_uint32(env, args[4], &create_info.depth_format) != napi_ok ||
      napi_get_value_int32(env, args[5], &create_info.multi_sample_count) != napi_ok ||
      napi_get_value_uint32(env, args[6], &create_info.usage) != napi_ok) return NULL;
  create_info.mip_map = mip_map ? CNA_TRUE : CNA_FALSE;
  CNA_Result result = g_api.render_target_cube_create(device, &create_info, &target);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_target_cube_create", result);
  return make_handle(env, target);
}

static napi_value get_render_target_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle target = 0;
  CNA_RenderTargetInfo value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &target)) return NULL;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.render_target_get_info(target, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_target_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "render-target info");
  if (!set_u32(env, output, "Kind", value.kind) ||
      !set_u32(env, output, "Width", value.width) ||
      !set_u32(env, output, "Height", value.height) ||
      !set_u32(env, output, "LevelCount", value.level_count) ||
      !set_u32(env, output, "Format", value.format) ||
      !set_u32(env, output, "DepthFormat", value.depth_format) ||
      !set_i32(env, output, "MultiSampleCount", value.multi_sample_count) ||
      !set_u32(env, output, "Usage", value.usage) ||
      !set_bool(env, output, "IsContentLost", value.is_content_lost == CNA_TRUE) ||
      !set_bool(env, output, "RendererAvailable", value.renderer_available == CNA_TRUE)) {
    return throw_napi(env, "render-target info properties");
  }
  return output;
}

static napi_value set_graphics_render_targets(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0;
  bool is_array = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array) {
    return throw_message(env, "render-target bindings must be an array");
  }
  uint32_t count = 0;
  NAPI_OR_RETURN(env, napi_get_array_length(env, args[1], &count), "render-target binding count");
  CNA_RenderTargetBinding* bindings = count == 0 ? NULL :
    (CNA_RenderTargetBinding*) calloc(count, sizeof(*bindings));
  if (count != 0 && !bindings) return throw_message(env, "render-target binding allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value object;
    if (napi_get_element(env, args[1], index, &object) != napi_ok ||
        !get_named_handle(env, object, "RenderTarget", &bindings[index].render_target) ||
        !get_named_i32(env, object, "ArraySlice", &bindings[index].array_slice) ||
        !get_named_u32(env, object, "CubeMapFace", &bindings[index].cube_map_face)) {
      free(bindings);
      return NULL;
    }
    bindings[index].struct_size = sizeof(bindings[index]);
    bindings[index].struct_version = 1;
  }
  CNA_Result result = g_api.graphics_set_render_targets(device, bindings, count);
  free(bindings);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_device_set_render_targets", result);
  }
  return undefined_result(env, "render-target binding result");
}

static napi_value create_occlusion_query(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0, query = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  CNA_Result result = g_api.occlusion_create(device, &query);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_occlusion_query_create", result);
  return make_handle(env, query);
}

static napi_value get_occlusion_query_is_complete(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle query = 0;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &query)) return NULL;
  CNA_Result result = g_api.occlusion_get_complete(query, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_occlusion_query_get_is_complete", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, value == CNA_TRUE, &output), "query completion");
  return output;
}

static napi_value get_occlusion_query_pixel_count(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle query = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &query)) return NULL;
  CNA_Result result = g_api.occlusion_get_pixel_count(query, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_occlusion_query_get_pixel_count", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), "query pixel count");
  return output;
}

static int get_named_handle(napi_env env, napi_value object, const char* name, CNA_Handle* out) {
  napi_value value;
  return get_named_value(env, object, name, &value) && read_handle(env, value, out);
}

static napi_value submit_sprite_batch(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle sprite_batch;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &sprite_batch)) return NULL;
  bool is_array = false;
  if (napi_is_array(env, args[1], &is_array) != napi_ok || !is_array) {
    return throw_message(env, "SpriteBatch commands must be an array");
  }
  uint32_t count = 0;
  NAPI_OR_RETURN(env, napi_get_array_length(env, args[1], &count), "SpriteBatch command count");
  CNA_SpriteScaledCommand* commands = count == 0 ? NULL :
    (CNA_SpriteScaledCommand*) calloc(count, sizeof(CNA_SpriteScaledCommand));
  if (count != 0 && commands == NULL) return throw_message(env, "SpriteBatch command allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value object;
    if (napi_get_element(env, args[1], index, &object) != napi_ok) {
      free(commands);
      return throw_napi(env, "SpriteBatch command access");
    }
    CNA_SpriteScaledCommand* command = &commands[index];
    double position_x, position_y, rotation, origin_x, origin_y, scale_x, scale_y, layer_depth;
    uint32_t r, g, b, a, effects;
    command->struct_size = sizeof(*command);
    command->struct_version = 1;
    if (!get_named_handle(env, object, "Texture", &command->texture) ||
        !get_named_double(env, object, "PositionX", &position_x) ||
        !get_named_double(env, object, "PositionY", &position_y) ||
        !get_named_i32(env, object, "SourceX", &command->source.x) ||
        !get_named_i32(env, object, "SourceY", &command->source.y) ||
        !get_named_i32(env, object, "SourceWidth", &command->source.width) ||
        !get_named_i32(env, object, "SourceHeight", &command->source.height) ||
        !get_named_u32(env, object, "ColorR", &r) ||
        !get_named_u32(env, object, "ColorG", &g) ||
        !get_named_u32(env, object, "ColorB", &b) ||
        !get_named_u32(env, object, "ColorA", &a) ||
        !get_named_double(env, object, "Rotation", &rotation) ||
        !get_named_double(env, object, "OriginX", &origin_x) ||
        !get_named_double(env, object, "OriginY", &origin_y) ||
        !get_named_double(env, object, "ScaleX", &scale_x) ||
        !get_named_double(env, object, "ScaleY", &scale_y) ||
        !get_named_u32(env, object, "Effects", &effects) ||
        !get_named_double(env, object, "LayerDepth", &layer_depth)) {
      free(commands);
      return NULL;
    }
    if (r > UINT8_MAX || g > UINT8_MAX || b > UINT8_MAX || a > UINT8_MAX) {
      free(commands);
      return throw_message(env, "SpriteBatch color channels must be bytes");
    }
    command->position = (CNA_Vector2){(float) position_x, (float) position_y};
    command->color = (CNA_Color){(uint8_t) r, (uint8_t) g, (uint8_t) b, (uint8_t) a};
    command->rotation = (float) rotation;
    command->origin = (CNA_Vector2){(float) origin_x, (float) origin_y};
    command->scale = (CNA_Vector2){(float) scale_x, (float) scale_y};
    command->effects = effects;
    command->layer_depth = (float) layer_depth;
  }
  CNA_Result result = g_api.sprite_batch_submit_scaled(sprite_batch, commands, count);
  free(commands);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_sprite_batch_submit_scaled_many", result);
  }
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "SpriteBatch submit result");
  return output;
}

static napi_value end_sprite_batch(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle sprite_batch;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &sprite_batch)) return NULL;
  CNA_Result result = g_api.sprite_batch_end(sprite_batch);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sprite_batch_end", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "SpriteBatch end result");
  return output;
}

static napi_value create_vertex_buffer(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[6];
  CNA_Handle device;
  int32_t stride = 0, vertex_count = 0;
  uint32_t buffer_usage = 0;
  bool dynamic = false, is_array = false;
  if (!get_args(env, info, 6, args) || !read_handle(env, args[0], &device)) return NULL;
  if (napi_get_value_int32(env, args[1], &stride) != napi_ok ||
      napi_is_array(env, args[2], &is_array) != napi_ok || !is_array ||
      napi_get_value_int32(env, args[3], &vertex_count) != napi_ok ||
      napi_get_value_uint32(env, args[4], &buffer_usage) != napi_ok ||
      napi_get_value_bool(env, args[5], &dynamic) != napi_ok) {
    return throw_message(env, "invalid VertexBuffer creation arguments");
  }
  uint32_t element_count = 0;
  if (napi_get_array_length(env, args[2], &element_count) != napi_ok ||
      element_count == 0 || element_count > 1024 || stride <= 0 || vertex_count <= 0 ||
      buffer_usage > CNA_BUFFER_USAGE_WRITE_ONLY) {
    return throw_message(env, "invalid VertexBuffer stride, declaration, count, or usage");
  }
  CNA_VertexElement* elements = (CNA_VertexElement*) calloc(element_count, sizeof(*elements));
  if (!elements) return throw_message(env, "VertexBuffer declaration allocation failed");
  for (uint32_t index = 0; index < element_count; index += 1) {
    napi_value object;
    uint32_t format = 0, usage = 0;
    if (napi_get_element(env, args[2], index, &object) != napi_ok ||
        !get_named_i32(env, object, "Offset", &elements[index].offset) ||
        !get_named_u32(env, object, "VertexElementFormat", &format) ||
        !get_named_u32(env, object, "VertexElementUsage", &usage) ||
        !get_named_i32(env, object, "UsageIndex", &elements[index].usage_index)) {
      free(elements);
      return NULL;
    }
    if (elements[index].offset < 0 || elements[index].usage_index < 0 ||
        format > CNA_VERTEX_ELEMENT_FORMAT_HALF_VECTOR4 ||
        usage > CNA_VERTEX_ELEMENT_USAGE_TESSELLATE_FACTOR) {
      free(elements);
      return throw_message(env, "invalid VertexBuffer declaration element");
    }
    elements[index].format = format;
    elements[index].usage = usage;
  }
  CNA_VertexDeclarationHandle declaration = 0;
  CNA_Result result = g_api.vertex_declaration_create(stride, elements, element_count, &declaration);
  free(elements);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_vertex_declaration_create_with_stride", result);
  }
  CNA_VertexBufferCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.vertex_declaration = declaration;
  create_info.vertex_count = vertex_count;
  create_info.buffer_usage = buffer_usage;
  create_info.dynamic = dynamic ? CNA_TRUE : CNA_FALSE;
  CNA_VertexBufferHandle buffer = 0;
  result = g_api.vertex_buffer_create(device, &create_info, &buffer);
  CNA_Result declaration_result = g_api.vertex_declaration_destroy(declaration);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_vertex_buffer_create", result);
  }
  if (declaration_result != CNA_RESULT_SUCCESS) {
    (void) g_api.vertex_buffer_destroy(buffer);
    return throw_result(env, "cna_vertex_declaration_destroy", declaration_result);
  }
  return make_handle(env, buffer);
}

static napi_value set_vertex_buffer_raw(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle buffer;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  uint32_t vertex_count = 0, stride = 0;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &buffer) ||
      !read_byte_view(env, args[1], &bytes, &byte_count) ||
      napi_get_value_uint32(env, args[2], &vertex_count) != napi_ok ||
      napi_get_value_uint32(env, args[3], &stride) != napi_ok) return NULL;
  if (stride == 0 || vertex_count > SIZE_MAX / stride || byte_count != (size_t) vertex_count * stride) {
    return throw_message(env, "VertexBuffer raw upload has an inconsistent byte extent");
  }
  CNA_Result result = g_api.vertex_buffer_set_raw(buffer, bytes, byte_count, vertex_count, stride);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_vertex_buffer_set_data_raw", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "VertexBuffer upload result");
  return output;
}

static napi_value get_vertex_buffer_raw(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle buffer;
  uint32_t vertex_count = 0, stride = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &vertex_count) != napi_ok ||
      napi_get_value_uint32(env, args[2], &stride) != napi_ok) return NULL;
  if (stride == 0 || vertex_count > SIZE_MAX / stride) {
    return throw_message(env, "VertexBuffer raw readback byte extent overflows native memory");
  }
  const size_t byte_count = (size_t) vertex_count * stride;
  uint8_t* bytes = byte_count == 0 ? NULL : (uint8_t*) malloc(byte_count);
  if (byte_count != 0 && !bytes) return throw_message(env, "VertexBuffer readback allocation failed");
  CNA_Result result = g_api.vertex_buffer_get_raw(
    buffer, 0, bytes, byte_count, vertex_count, stride);
  if (result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_vertex_buffer_get_data_raw", result);
  }
  napi_value output = copy_bytes(env, bytes, byte_count, "VertexBuffer readback copy");
  free(bytes);
  return output;
}

static napi_value create_index_buffer(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[5];
  CNA_Handle device;
  uint32_t element_size = 0, buffer_usage = 0;
  int32_t index_count = 0;
  bool dynamic = false;
  if (!get_args(env, info, 5, args) || !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &element_size) != napi_ok ||
      napi_get_value_int32(env, args[2], &index_count) != napi_ok ||
      napi_get_value_uint32(env, args[3], &buffer_usage) != napi_ok ||
      napi_get_value_bool(env, args[4], &dynamic) != napi_ok) return NULL;
  if (element_size > CNA_INDEX_ELEMENT_SIZE_THIRTY_TWO_BITS || index_count <= 0 ||
      buffer_usage > CNA_BUFFER_USAGE_WRITE_ONLY) {
    return throw_message(env, "invalid IndexBuffer element size, count, or usage");
  }
  CNA_IndexBufferCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.index_count = index_count;
  create_info.index_element_size = element_size;
  create_info.buffer_usage = buffer_usage;
  create_info.dynamic = dynamic ? CNA_TRUE : CNA_FALSE;
  CNA_IndexBufferHandle buffer = 0;
  CNA_Result result = g_api.index_buffer_create(device, &create_info, &buffer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_index_buffer_create", result);
  return make_handle(env, buffer);
}

static int read_index_transfer(
  napi_env env, napi_value size_value, size_t byte_count,
  CNA_IndexBufferTransfer* transfer, uint64_t* capacity
) {
  uint32_t element_size = 0;
  if (napi_get_value_uint32(env, size_value, &element_size) != napi_ok ||
      element_size > CNA_INDEX_ELEMENT_SIZE_THIRTY_TWO_BITS) {
    throw_message(env, "invalid IndexBuffer element size");
    return 0;
  }
  const uint32_t width = element_size == CNA_INDEX_ELEMENT_SIZE_SIXTEEN_BITS ? 2 : 4;
  if (byte_count % width != 0) {
    throw_message(env, "IndexBuffer byte extent is not a whole number of indices");
    return 0;
  }
  memset(transfer, 0, sizeof(*transfer));
  transfer->struct_size = sizeof(*transfer);
  transfer->struct_version = 1;
  transfer->index_element_size = element_size;
  transfer->options = CNA_SET_DATA_NONE;
  transfer->element_count = byte_count / width;
  *capacity = transfer->element_count;
  return 1;
}

static napi_value set_index_buffer_raw(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle buffer;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  CNA_IndexBufferTransfer transfer;
  uint64_t capacity = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &buffer) ||
      !read_byte_view(env, args[2], &bytes, &byte_count) ||
      !read_index_transfer(env, args[1], byte_count, &transfer, &capacity)) return NULL;
  CNA_Result result = g_api.index_buffer_set(buffer, &transfer, bytes, capacity);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_index_buffer_set_data", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &output), "IndexBuffer upload result");
  return output;
}

static napi_value get_index_buffer_raw(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle buffer;
  uint32_t element_size = 0, index_count = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &buffer) ||
      napi_get_value_uint32(env, args[1], &element_size) != napi_ok ||
      napi_get_value_uint32(env, args[2], &index_count) != napi_ok ||
      element_size > CNA_INDEX_ELEMENT_SIZE_THIRTY_TWO_BITS) return NULL;
  const uint32_t width = element_size == CNA_INDEX_ELEMENT_SIZE_SIXTEEN_BITS ? 2 : 4;
  if (index_count > SIZE_MAX / width) return throw_message(env, "IndexBuffer readback is too large");
  const size_t byte_count = (size_t) index_count * width;
  uint8_t* bytes = byte_count == 0 ? NULL : (uint8_t*) malloc(byte_count);
  if (byte_count != 0 && !bytes) return throw_message(env, "IndexBuffer readback allocation failed");
  CNA_IndexBufferTransfer transfer;
  uint64_t capacity = 0, required = 0;
  if (!read_index_transfer(env, args[1], byte_count, &transfer, &capacity)) {
    free(bytes);
    return NULL;
  }
  CNA_Result result = g_api.index_buffer_get(buffer, &transfer, bytes, capacity, &required);
  if (result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_index_buffer_get_data", result);
  }
  if (required != capacity) {
    free(bytes);
    return throw_message(env, "CNA IndexBuffer readback returned an inconsistent count");
  }
  napi_value output = copy_bytes(env, bytes, byte_count, "IndexBuffer readback copy");
  free(bytes);
  return output;
}

static napi_value get_keyboard_state(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_KeyboardState state;
  memset(&state, 0, sizeof(state));
  state.struct_size = sizeof(state);
  state.struct_version = 1;
  CNA_Result result = g_api.keyboard_get_state(game, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_keyboard_get_state", result);
  napi_value keys;
  NAPI_OR_RETURN(env, napi_create_array(env, &keys), "keyboard array");
  uint32_t output_index = 0;
  for (uint32_t key = 0; key < 256; key += 1) {
    if ((state.pressed_key_words[key / 64] & (UINT64_C(1) << (key % 64))) == 0) continue;
    napi_value value;
    NAPI_OR_RETURN(env, napi_create_uint32(env, key, &value), "keyboard key");
    NAPI_OR_RETURN(env, napi_set_element(env, keys, output_index++, value), "keyboard key append");
  }
  return keys;
}

static napi_value get_mouse_state(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_MouseState state;
  memset(&state, 0, sizeof(state));
  state.struct_size = sizeof(state);
  state.struct_version = 1;
  CNA_Result result = g_api.mouse_get_state(game, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_get_state", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "mouse state");
  if (!set_i32(env, output, "X", state.x) || !set_i32(env, output, "Y", state.y) ||
      !set_i32(env, output, "ScrollWheelValue", state.scroll_wheel) ||
      !set_u32(env, output, "LeftButton", (state.pressed_buttons & CNA_MOUSE_BUTTON_LEFT) != 0) ||
      !set_u32(env, output, "MiddleButton", (state.pressed_buttons & CNA_MOUSE_BUTTON_MIDDLE) != 0) ||
      !set_u32(env, output, "RightButton", (state.pressed_buttons & CNA_MOUSE_BUTTON_RIGHT) != 0) ||
      !set_u32(env, output, "XButton1", (state.pressed_buttons & CNA_MOUSE_BUTTON_X1) != 0) ||
      !set_u32(env, output, "XButton2", (state.pressed_buttons & CNA_MOUSE_BUTTON_X2) != 0)) {
    return throw_napi(env, "mouse state properties");
  }
  return output;
}

static napi_value set_mouse_position(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game;
  int32_t x, y;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_int32(env, args[1], &x), "mouse x");
  NAPI_OR_RETURN(env, napi_get_value_int32(env, args[2], &y), "mouse y");
  CNA_Result result = g_api.mouse_set_position(game, x, y);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_set_position", result);
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "mouse position result");
  return undefined;
}

static napi_value get_gamepad_state(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game;
  uint32_t player, dead_zone;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &player), "gamepad player");
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[2], &dead_zone), "gamepad dead zone");
  CNA_GamePadState state;
  memset(&state, 0, sizeof(state));
  state.struct_size = sizeof(state);
  state.struct_version = 1;
  CNA_Result result = g_api.gamepad_get_state(game, player, dead_zone, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gamepad_get_state_with_dead_zone", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "gamepad state");
  if (!set_bool(env, output, "IsConnected", state.is_connected == CNA_TRUE) ||
      !set_i32(env, output, "PacketNumber", state.packet_number) ||
      !set_u32(env, output, "PressedButtons", state.pressed_buttons) ||
      !set_number(env, output, "LeftX", state.analog.left_thumb_stick.x) ||
      !set_number(env, output, "LeftY", state.analog.left_thumb_stick.y) ||
      !set_number(env, output, "RightX", state.analog.right_thumb_stick.x) ||
      !set_number(env, output, "RightY", state.analog.right_thumb_stick.y) ||
      !set_number(env, output, "LeftTrigger", state.analog.left_trigger) ||
      !set_number(env, output, "RightTrigger", state.analog.right_trigger)) {
    return throw_napi(env, "gamepad state properties");
  }
  return output;
}

static napi_value get_gamepad_capabilities(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle game;
  uint32_t player;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &player), "gamepad player");
  CNA_GamePadCapabilities value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.gamepad_get_capabilities(game, player, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gamepad_get_capabilities", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "gamepad capabilities");
  if (!set_bool(env, output, "IsConnected", value.is_connected != 0) ||
      !set_u32(env, output, "GamePadType", value.gamepad_type)) return throw_napi(env, "gamepad capabilities");
#define SET_CAP(js_name, field) if (!set_bool(env, output, js_name, value.field != 0)) return throw_napi(env, "gamepad capabilities")
  SET_CAP("HasAButton", has_a_button);
  SET_CAP("HasBButton", has_b_button);
  SET_CAP("HasXButton", has_x_button);
  SET_CAP("HasYButton", has_y_button);
  SET_CAP("HasBackButton", has_back_button);
  SET_CAP("HasStartButton", has_start_button);
  SET_CAP("HasBigButton", has_big_button);
  SET_CAP("HasDPadUpButton", has_dpad_up_button);
  SET_CAP("HasDPadDownButton", has_dpad_down_button);
  SET_CAP("HasDPadLeftButton", has_dpad_left_button);
  SET_CAP("HasDPadRightButton", has_dpad_right_button);
  SET_CAP("HasLeftShoulderButton", has_left_shoulder_button);
  SET_CAP("HasRightShoulderButton", has_right_shoulder_button);
  SET_CAP("HasLeftStickButton", has_left_stick_button);
  SET_CAP("HasRightStickButton", has_right_stick_button);
  SET_CAP("HasLeftXThumbStick", has_left_x_thumb_stick);
  SET_CAP("HasLeftYThumbStick", has_left_y_thumb_stick);
  SET_CAP("HasRightXThumbStick", has_right_x_thumb_stick);
  SET_CAP("HasRightYThumbStick", has_right_y_thumb_stick);
  SET_CAP("HasLeftTrigger", has_left_trigger);
  SET_CAP("HasRightTrigger", has_right_trigger);
  SET_CAP("HasLeftVibrationMotor", has_left_vibration_motor);
  SET_CAP("HasRightVibrationMotor", has_right_vibration_motor);
  SET_CAP("HasVoiceSupport", has_voice_support);
#undef SET_CAP
  return output;
}

static napi_value set_gamepad_vibration(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle game;
  uint32_t player;
  double left, right;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &game)) return NULL;
  NAPI_OR_RETURN(env, napi_get_value_uint32(env, args[1], &player), "gamepad player");
  NAPI_OR_RETURN(env, napi_get_value_double(env, args[2], &left), "left vibration");
  NAPI_OR_RETURN(env, napi_get_value_double(env, args[3], &right), "right vibration");
  CNA_Bool applied = CNA_FALSE;
  CNA_Result result = g_api.gamepad_set_vibration(game, player, (float) left, (float) right, &applied);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gamepad_set_vibration", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_boolean(env, applied == CNA_TRUE, &output), "vibration result");
  return output;
}

static napi_value make_touch_location(napi_env env, const CNA_TouchLocation* value) {
  napi_value output;
  if (napi_create_object(env, &output) != napi_ok ||
      !set_i32(env, output, "Id", value->id) || !set_u32(env, output, "State", value->state) ||
      !set_number(env, output, "X", value->position.x) || !set_number(env, output, "Y", value->position.y) ||
      !set_u32(env, output, "PreviousState", value->previous_state) ||
      !set_number(env, output, "PreviousX", value->previous_position.x) ||
      !set_number(env, output, "PreviousY", value->previous_position.y) ||
      !set_number(env, output, "Pressure", value->pressure)) return NULL;
  return output;
}

static napi_value get_touch_state(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_TouchState state;
  memset(&state, 0, sizeof(state));
  state.struct_size = sizeof(state);
  state.struct_version = 1;
  CNA_Result result = g_api.touch_get_state(game, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_touch_get_state", result);
  napi_value output, touches;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "touch state");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, state.touch_count, &touches), "touch array");
  if (!set_bool(env, output, "IsConnected", state.is_connected == CNA_TRUE) ||
      napi_set_named_property(env, output, "Touches", touches) != napi_ok) return throw_napi(env, "touch state properties");
  for (uint32_t index = 0; index < state.touch_count; index += 1) {
    napi_value location = make_touch_location(env, &state.touches[index]);
    if (!location || napi_set_element(env, touches, index, location) != napi_ok) return throw_napi(env, "touch location");
  }
  return output;
}

static napi_value get_touch_capabilities(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_TouchCapabilities value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.touch_get_capabilities(game, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_touch_get_capabilities", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "touch capabilities");
  if (!set_bool(env, output, "IsConnected", value.is_connected == CNA_TRUE) ||
      !set_u32(env, output, "MaximumTouchCount", value.maximum_touch_count)) return throw_napi(env, "touch capabilities");
  return output;
}

static napi_value is_gesture_available(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Bool available = CNA_FALSE;
  CNA_Result result = g_api.gesture_is_available(game, &available);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_touch_panel_get_is_gesture_available", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_boolean(env, available == CNA_TRUE, &output), "gesture availability");
  return output;
}

static napi_value read_gesture(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_GestureSample value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.gesture_read(game, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_touch_panel_read_gesture", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "gesture sample");
  if (!set_u32(env, output, "GestureType", value.gesture_type) ||
      !set_bigint(env, output, "TimestampTicks", (uint64_t) value.timestamp_ticks) ||
      !set_number(env, output, "PositionX", value.position.x) || !set_number(env, output, "PositionY", value.position.y) ||
      !set_number(env, output, "Position2X", value.position2.x) || !set_number(env, output, "Position2Y", value.position2.y) ||
      !set_number(env, output, "DeltaX", value.delta.x) || !set_number(env, output, "DeltaY", value.delta.y) ||
      !set_number(env, output, "Delta2X", value.delta2.x) || !set_number(env, output, "Delta2Y", value.delta2.y)) {
    return throw_napi(env, "gesture sample properties");
  }
  return output;
}

static napi_value make_window_value(napi_env env, uint64_t window) {
  napi_value output;
  if (napi_create_bigint_uint64(env, window, &output) != napi_ok) return throw_napi(env, "window handle");
  return output;
}

static napi_value get_mouse_window(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1]; CNA_Handle game; uint64_t window = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.mouse_get_window(game, &window);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_get_window_handle", result);
  return make_window_value(env, window);
}

static napi_value get_touch_window(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1]; CNA_Handle game; uint64_t window = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.touch_get_window(game, &window);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_touch_panel_get_window_handle", result);
  return make_window_value(env, window);
}

static napi_value set_window_handle(napi_env env, napi_callback_info info, WindowSetFn function, const char* operation) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2]; CNA_Handle game; uint64_t window; bool lossless = false;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game)) return NULL;
  if (napi_get_value_bigint_uint64(env, args[1], &window, &lossless) != napi_ok || !lossless) return throw_message(env, "window handle must be a uint64 bigint");
  CNA_Result result = function(game, window);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  napi_value undefined;
  NAPI_OR_RETURN(env, napi_get_undefined(env, &undefined), "window setter result");
  return undefined;
}

static napi_value set_mouse_window(napi_env env, napi_callback_info info) {
  return set_window_handle(env, info, g_api.mouse_set_window, "cna_mouse_set_window_handle");
}

static napi_value set_touch_window(napi_env env, napi_callback_info info) {
  return set_window_handle(env, info, g_api.touch_set_window, "cna_touch_panel_set_window_handle");
}

static napi_value undefined_result(napi_env env, const char* operation) {
  napi_value output;
  if (napi_get_undefined(env, &output) != napi_ok) return throw_napi(env, operation);
  return output;
}

static int read_utf8(napi_env env, napi_value value, char** out_data, size_t* out_length) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) {
    throw_message(env, "expected a string");
    return 0;
  }
  char* data = (char*) malloc(length + 1);
  if (!data) {
    throw_message(env, "UTF-8 string allocation failed");
    return 0;
  }
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, value, data, length + 1, &copied) != napi_ok || copied != length) {
    free(data);
    throw_napi(env, "UTF-8 string reading");
    return 0;
  }
  *out_data = data;
  *out_length = length;
  return 1;
}

static napi_value open_title_stream(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  uint64_t required = 0;
  CNA_Result result = g_api.title_container_read(game, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(name);
    return throw_result(env, "cna_title_container_read_ext", result);
  }
  if (required > SIZE_MAX) {
    free(name);
    return throw_message(env, "title content exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(name);
    return throw_message(env, "title-content allocation failed");
  }
  uint64_t copied = 0;
  result = g_api.title_container_read(game, view, bytes, required, &copied);
  free(name);
  if (result != CNA_RESULT_SUCCESS || copied != required) {
    free(bytes);
    if (result == CNA_RESULT_SUCCESS) {
      return throw_message(env, "CNA title content changed during the count/copy operation");
    }
    return throw_result(env, "cna_title_container_read_ext", result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) copied, "title-content copy");
  free(bytes);
  return output;
}

static napi_value get_window_allow_resizing(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.window_get_allow_resizing(game, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_get_allow_user_resizing", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, value == CNA_TRUE, &output), "window resizing state");
  return output;
}

static napi_value set_window_allow_resizing(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  bool value = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_bool(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = g_api.window_set_allow_resizing(game, value ? CNA_TRUE : CNA_FALSE);
  if (rethrow_callback_exception(find_game(game))) return NULL;
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_set_allow_user_resizing", result);
  }
  return undefined_result(env, "window resizing result");
}

static napi_value get_window_client_bounds(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  CNA_Rectangle value;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  memset(&value, 0, sizeof(value));
  CNA_Result result = g_api.window_get_client_bounds(game, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_get_client_bounds", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "window client bounds");
  if (!set_i32(env, output, "X", value.x) || !set_i32(env, output, "Y", value.y) ||
      !set_i32(env, output, "Width", value.width) || !set_i32(env, output, "Height", value.height)) {
    return throw_napi(env, "window client-bound properties");
  }
  return output;
}

static napi_value get_window_orientation(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.window_get_orientation(game, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_get_current_orientation", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, value, &output), "window orientation");
  return output;
}

static napi_value get_window_handle(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint64_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.window_get_handle(game, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_get_native_handle_ext", result);
  }
  NAPI_OR_RETURN(env, napi_create_bigint_uint64(env, value, &output), "window handle");
  return output;
}

static napi_value copy_window_string(
  napi_env env,
  napi_callback_info info,
  HandleU64OutFn size_function,
  HandleCopyStringFn copy_function,
  const char* operation
) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint64_t length = 0, copied = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = size_function(game, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (length > SIZE_MAX) return throw_message(env, "window text exceeds the Node address space");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "window-text allocation failed");
  result = copy_function(game, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    if (result == CNA_RESULT_SUCCESS) return throw_message(env, "window text changed during count/copy");
    return throw_result(env, operation, result);
  }
  napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) copied, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, operation);
  return output;
}

static napi_value get_window_screen_name(napi_env env, napi_callback_info info) {
  return copy_window_string(env, info, g_api.window_get_screen_name_size,
    g_api.window_copy_screen_name, "cna_game_window_copy_screen_device_name");
}

static napi_value get_window_title(napi_env env, napi_callback_info info) {
  return copy_window_string(env, info, g_api.window_get_title_size,
    g_api.window_copy_title, "cna_game_window_copy_title");
}

static napi_value set_window_title(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  char* title = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) || !read_utf8(env, args[1], &title, &length)) return NULL;
  const CNA_StringView view = {title, length};
  CNA_Result result = g_api.window_set_title(game, view);
  free(title);
  if (rethrow_callback_exception(find_game(game))) return NULL;
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_game_set_window_title", result);
  return undefined_result(env, "window title result");
}

static napi_value begin_window_screen_change(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  bool fullscreen = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_bool(env, args[1], &fullscreen) != napi_ok) return NULL;
  CNA_Result result = g_api.window_begin_screen_change(game, fullscreen ? CNA_TRUE : CNA_FALSE);
  if (rethrow_callback_exception(find_game(game))) return NULL;
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_begin_screen_device_change", result);
  }
  return undefined_result(env, "window screen-change begin result");
}

static napi_value end_window_screen_change(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle game = 0;
  char* name = NULL;
  size_t length = 0;
  int32_t width = 0, height = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &game) || !read_utf8(env, args[1], &name, &length) ||
      napi_get_value_int32(env, args[2], &width) != napi_ok ||
      napi_get_value_int32(env, args[3], &height) != napi_ok) {
    free(name);
    return NULL;
  }
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.window_end_screen_change(game, view, width, height);
  free(name);
  if (rethrow_callback_exception(find_game(game))) return NULL;
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_game_window_end_screen_device_change", result);
  }
  return undefined_result(env, "window screen-change end result");
}

static WindowEventContext* find_window_event(const CNA_Handle registration) {
  for (WindowEventContext* value = g_window_events; value; value = value->next) {
    if (value->registration == registration) return value;
  }
  return NULL;
}

static void unlink_window_event(WindowEventContext* context) {
  WindowEventContext** current = &g_window_events;
  while (*current) {
    if (*current == context) {
      *current = context->next;
      return;
    }
    current = &(*current)->next;
  }
}

static void on_window_event(void* raw) {
  WindowEventContext* context = (WindowEventContext*) raw;
  if (!context) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value callback, receiver, result;
  napi_status status = napi_get_reference_value(context->env, context->callback, &callback);
  if (status == napi_ok) status = napi_get_undefined(context->env, &receiver);
  if (status == napi_ok) {
    status = napi_call_function(context->env, receiver, callback, 0, NULL, &result);
  }
  if (status == napi_pending_exception) {
    napi_value exception;
    GameContext* game = find_game(context->game);
    if (game && napi_get_and_clear_last_exception(context->env, &exception) == napi_ok) {
      if (game->exception) napi_delete_reference(context->env, game->exception);
      napi_create_reference(context->env, exception, 1, &game->exception);
    }
  }
  napi_close_handle_scope(context->env, scope);
}

static napi_value subscribe_window_event(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle game = 0;
  uint32_t event = 0;
  napi_valuetype type;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &event) != napi_ok ||
      napi_typeof(env, args[2], &type) != napi_ok || type != napi_function) {
    return throw_message(env, "window event callback must be a function");
  }
  WindowEventContext* context = (WindowEventContext*) calloc(1, sizeof(*context));
  if (!context) return throw_message(env, "window-event context allocation failed");
  context->env = env;
  context->game = game;
  if (napi_create_reference(env, args[2], 1, &context->callback) != napi_ok) {
    free(context);
    return throw_napi(env, "window-event callback retention");
  }
  CNA_Result result = g_api.window_subscribe(
    game, event, on_window_event, context, &context->registration);
  if (result != CNA_RESULT_SUCCESS) {
    napi_delete_reference(env, context->callback);
    free(context);
    return throw_result(env, "cna_game_window_subscribe", result);
  }
  context->next = g_window_events;
  g_window_events = context;
  return make_handle(env, context->registration);
}

static napi_value unsubscribe_window_event(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle registration = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &registration)) return NULL;
  WindowEventContext* context = find_window_event(registration);
  CNA_Result result = g_api.game_unsubscribe(registration);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_game_unsubscribe", result);
  if (context) {
    unlink_window_event(context);
    napi_delete_reference(env, context->callback);
    free(context);
  }
  return undefined_result(env, "window-event unsubscribe result");
}

static napi_value create_sound_effect_pcm(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[8];
  CNA_Handle game = 0, sound_effect = 0;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  int32_t offset = 0, count = 0, loop_start = 0, loop_length = 0;
  uint32_t sample_rate = 0, channels = 0;
  if (!get_args(env, info, 8, args) || !read_handle(env, args[0], &game) ||
      !read_byte_view(env, args[1], &bytes, &byte_count) ||
      napi_get_value_int32(env, args[2], &offset) != napi_ok ||
      napi_get_value_int32(env, args[3], &count) != napi_ok ||
      napi_get_value_uint32(env, args[4], &sample_rate) != napi_ok ||
      napi_get_value_uint32(env, args[5], &channels) != napi_ok ||
      napi_get_value_int32(env, args[6], &loop_start) != napi_ok ||
      napi_get_value_int32(env, args[7], &loop_length) != napi_ok) {
    return NULL;
  }
  CNA_SoundEffectCreateInfo create_info;
  memset(&create_info, 0, sizeof(create_info));
  create_info.struct_size = sizeof(create_info);
  create_info.struct_version = 1;
  create_info.sample_rate = sample_rate;
  create_info.channels = channels;
  CNA_Result result = g_api.sound_effect_create_pcm_range(
    game, &create_info, bytes, byte_count, offset, count, loop_start, loop_length, &sound_effect);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_sound_effect_create_pcm16_range_ext", result);
  }
  return make_handle(env, sound_effect);
}

static napi_value create_sound_effect_encoded(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle game = 0, sound_effect = 0;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game) ||
      !read_byte_view(env, args[1], &bytes, &byte_count)) return NULL;
  if (byte_count == 0) return throw_message(env, "encoded audio data must not be empty");
  CNA_Result result = g_api.sound_effect_create_encoded(game, bytes, byte_count, &sound_effect);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_sound_effect_create_from_encoded_ext", result);
  }
  return make_handle(env, sound_effect);
}

static napi_value get_sound_effect_duration(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle sound_effect = 0;
  int64_t ticks = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &sound_effect)) return NULL;
  CNA_Result result = g_api.sound_effect_get_duration(sound_effect, &ticks);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_get_duration_ticks", result);
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, ticks, &output), "sound duration");
  return output;
}

static napi_value get_sound_effect_name(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle sound_effect = 0;
  uint64_t length = 0, copied = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &sound_effect)) return NULL;
  CNA_Result result = g_api.sound_effect_get_name_size(sound_effect, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_get_name_size", result);
  if (length > SIZE_MAX) return throw_message(env, "sound effect name is too large for Node");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "sound effect name allocation failed");
  result = g_api.sound_effect_copy_name(sound_effect, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    return throw_result(env, "cna_sound_effect_copy_name", result);
  }
  napi_value output;
  napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, "sound effect name creation");
  return output;
}

static napi_value set_sound_effect_name(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle sound_effect = 0;
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &sound_effect) ||
      !read_utf8(env, args[1], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.sound_effect_set_name(sound_effect, view);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_set_name", result);
  return undefined_result(env, "sound effect name result");
}

static napi_value create_sound_effect_instance(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle sound_effect = 0, instance = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &sound_effect)) return NULL;
  CNA_Result result = g_api.sound_effect_create_instance(sound_effect, &instance);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_create_instance", result);
  return make_handle(env, instance);
}

static napi_value play_sound_effect(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4], output;
  CNA_Handle sound_effect = 0;
  double volume = 0, pitch = 0, pan = 0;
  CNA_Bool played = CNA_FALSE;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &sound_effect) ||
      napi_get_value_double(env, args[1], &volume) != napi_ok ||
      napi_get_value_double(env, args[2], &pitch) != napi_ok ||
      napi_get_value_double(env, args[3], &pan) != napi_ok) return NULL;
  CNA_Result result = g_api.sound_effect_play_settings(
    sound_effect, (float) volume, (float) pitch, (float) pan, &played);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_play_with_settings", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, played == CNA_TRUE, &output), "sound playback result");
  return output;
}

static napi_value get_audio_float(napi_env env, napi_callback_info info, HandleFloatOutFn function, const char* operation) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle game = 0;
  float value = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = function(game, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_create_double(env, value, &output), "audio setting");
  return output;
}

static napi_value set_audio_float(napi_env env, napi_callback_info info, HandleFloatFn function, const char* operation) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle game = 0;
  double value = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_double(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = function(game, (float) value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "audio setting result");
}

#define AUDIO_FLOAT_GETTER(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return get_audio_float(env, info, g_api.field, operation); \
  }
#define AUDIO_FLOAT_SETTER(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return set_audio_float(env, info, g_api.field, operation); \
  }

AUDIO_FLOAT_GETTER(get_master_volume, sound_effect_get_master_volume, "cna_sound_effect_get_master_volume")
AUDIO_FLOAT_SETTER(set_master_volume, sound_effect_set_master_volume, "cna_sound_effect_set_master_volume")
AUDIO_FLOAT_GETTER(get_distance_scale, sound_effect_get_distance_scale, "cna_sound_effect_get_distance_scale")
AUDIO_FLOAT_SETTER(set_distance_scale, sound_effect_set_distance_scale, "cna_sound_effect_set_distance_scale")
AUDIO_FLOAT_GETTER(get_doppler_scale, sound_effect_get_doppler_scale, "cna_sound_effect_get_doppler_scale")
AUDIO_FLOAT_SETTER(set_doppler_scale, sound_effect_set_doppler_scale, "cna_sound_effect_set_doppler_scale")
AUDIO_FLOAT_GETTER(get_speed_of_sound, sound_effect_get_speed_of_sound, "cna_sound_effect_get_speed_of_sound")
AUDIO_FLOAT_SETTER(set_speed_of_sound, sound_effect_set_speed_of_sound, "cna_sound_effect_set_speed_of_sound")

#define AUDIO_HANDLE_METHOD(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return call_game_handle(env, info, g_api.field, operation); \
  }

AUDIO_HANDLE_METHOD(destroy_sound_effect, sound_effect_destroy, "cna_sound_effect_destroy")
AUDIO_HANDLE_METHOD(play_sound_instance, sound_instance_play, "cna_sound_effect_instance_play")
AUDIO_HANDLE_METHOD(pause_sound_instance, sound_instance_pause, "cna_sound_effect_instance_pause")
AUDIO_HANDLE_METHOD(resume_sound_instance, sound_instance_resume, "cna_sound_effect_instance_resume")
AUDIO_HANDLE_METHOD(destroy_sound_instance, sound_instance_destroy, "cna_sound_effect_instance_destroy")

static napi_value stop_sound_instance(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle instance = 0;
  bool immediate = false;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &instance) ||
      napi_get_value_bool(env, args[1], &immediate) != napi_ok) return NULL;
  CNA_Result result = g_api.sound_instance_stop(instance, immediate ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_instance_stop", result);
  return undefined_result(env, "sound stop result");
}

static napi_value get_sound_instance_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle instance = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &instance)) return NULL;
  CNA_SoundEffectInstanceInfo value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.sound_instance_get_info(instance, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_instance_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "sound instance info");
  if (!set_u32(env, output, "State", value.state) ||
      !set_bool(env, output, "IsLooped", value.is_looped == CNA_TRUE) ||
      !set_number(env, output, "Volume", value.volume) ||
      !set_number(env, output, "Pitch", value.pitch) ||
      !set_number(env, output, "Pan", value.pan)) {
    return throw_napi(env, "sound instance info properties");
  }
  return output;
}

static napi_value set_sound_instance_float(
  napi_env env, napi_callback_info info, HandleFloatFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle instance = 0;
  double value = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &instance) ||
      napi_get_value_double(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = function(instance, (float) value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "sound instance setting result");
}

#define SOUND_INSTANCE_FLOAT_SETTER(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return set_sound_instance_float(env, info, g_api.field, operation); \
  }

SOUND_INSTANCE_FLOAT_SETTER(set_sound_instance_volume, sound_instance_set_volume, "cna_sound_effect_instance_set_volume")
SOUND_INSTANCE_FLOAT_SETTER(set_sound_instance_pitch, sound_instance_set_pitch, "cna_sound_effect_instance_set_pitch")
SOUND_INSTANCE_FLOAT_SETTER(set_sound_instance_pan, sound_instance_set_pan, "cna_sound_effect_instance_set_pan")

static napi_value set_sound_instance_looped(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle instance = 0;
  bool value = false;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &instance) ||
      napi_get_value_bool(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = g_api.sound_instance_set_looped(instance, value ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_effect_instance_set_is_looped", result);
  return undefined_result(env, "sound instance loop result");
}

static int read_audio_vector(napi_env env, napi_value object, CNA_Vector3* output) {
  double x = 0, y = 0, z = 0;
  if (!get_named_double(env, object, "X", &x) ||
      !get_named_double(env, object, "Y", &y) ||
      !get_named_double(env, object, "Z", &z)) return 0;
  *output = (CNA_Vector3){(float) x, (float) y, (float) z};
  return 1;
}

static int read_audio_listener(napi_env env, napi_value object, CNA_AudioListener* output) {
  napi_value forward, position, up, velocity;
  memset(output, 0, sizeof(*output));
  output->struct_size = sizeof(*output);
  output->struct_version = 1;
  return get_named_value(env, object, "Forward", &forward) &&
    get_named_value(env, object, "Position", &position) &&
    get_named_value(env, object, "Up", &up) &&
    get_named_value(env, object, "Velocity", &velocity) &&
    read_audio_vector(env, forward, &output->forward) &&
    read_audio_vector(env, position, &output->position) &&
    read_audio_vector(env, up, &output->up) &&
    read_audio_vector(env, velocity, &output->velocity);
}

static int read_audio_emitter(napi_env env, napi_value object, CNA_AudioEmitter* output) {
  napi_value forward, position, up, velocity;
  double doppler = 0;
  memset(output, 0, sizeof(*output));
  output->struct_size = sizeof(*output);
  output->struct_version = 1;
  return get_named_double(env, object, "DopplerScale", &doppler) &&
    get_named_value(env, object, "Forward", &forward) &&
    get_named_value(env, object, "Position", &position) &&
    get_named_value(env, object, "Up", &up) &&
    get_named_value(env, object, "Velocity", &velocity) &&
    read_audio_vector(env, forward, &output->forward) &&
    read_audio_vector(env, position, &output->position) &&
    read_audio_vector(env, up, &output->up) &&
    read_audio_vector(env, velocity, &output->velocity) &&
    ((output->doppler_scale = (float) doppler), 1);
}

static napi_value apply_sound_instance_3d(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle instance = 0;
  bool is_array = false;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &instance) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array) {
    return throw_message(env, "audio listeners must be an array");
  }
  uint32_t count = 0;
  NAPI_OR_RETURN(env, napi_get_array_length(env, args[1], &count), "audio listener count");
  CNA_AudioListener* listeners = count == 0 ? NULL :
    (CNA_AudioListener*) calloc(count, sizeof(*listeners));
  if (count != 0 && !listeners) return throw_message(env, "audio listener allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value listener;
    if (napi_get_element(env, args[1], index, &listener) != napi_ok ||
        !read_audio_listener(env, listener, &listeners[index])) {
      free(listeners);
      return NULL;
    }
  }
  CNA_AudioEmitter emitter;
  if (!read_audio_emitter(env, args[2], &emitter)) {
    free(listeners);
    return NULL;
  }
  CNA_Result result = g_api.sound_instance_apply_3d_multi(instance, listeners, count, &emitter);
  free(listeners);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_sound_effect_instance_apply_3d_multi_ext", result);
  }
  return undefined_result(env, "Apply3D result");
}

static napi_value create_dynamic_sound_instance(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game = 0, instance = 0;
  int32_t sample_rate = 0;
  uint32_t channels = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_int32(env, args[1], &sample_rate) != napi_ok ||
      napi_get_value_uint32(env, args[2], &channels) != napi_ok) return NULL;
  CNA_Result result = g_api.dynamic_sound_create(game, sample_rate, channels, &instance);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_dynamic_sound_effect_instance_create", result);
  }
  return make_handle(env, instance);
}

static napi_value get_dynamic_pending(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle instance = 0;
  int32_t count = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &instance)) return NULL;
  CNA_Result result = g_api.dynamic_sound_get_pending(instance, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_dynamic_sound_effect_instance_get_pending_buffer_count", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, count, &output), "dynamic pending count");
  return output;
}

static napi_value submit_dynamic_buffer(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle instance = 0;
  const uint8_t* bytes = NULL;
  size_t byte_count = 0;
  int32_t offset = 0, count = 0;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &instance) ||
      !read_byte_view(env, args[1], &bytes, &byte_count) ||
      napi_get_value_int32(env, args[2], &offset) != napi_ok ||
      napi_get_value_int32(env, args[3], &count) != napi_ok) return NULL;
  CNA_Result result = g_api.dynamic_sound_submit(instance, bytes, byte_count, offset, count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_dynamic_sound_effect_instance_submit_buffer", result);
  }
  return undefined_result(env, "dynamic buffer submission result");
}

static int copy_microphone_name(
  napi_env env, CNA_Handle game, uint64_t index, napi_value* output
) {
  uint64_t length = 0, copied = 0;
  CNA_Result result = g_api.microphone_get_name_size(game, index, &length);
  if (result != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_microphone_get_name_size_at", result);
    return 0;
  }
  if (length > SIZE_MAX) {
    throw_message(env, "microphone name exceeds the native address space");
    return 0;
  }
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) {
    throw_message(env, "microphone name allocation failed");
    return 0;
  }
  result = g_api.microphone_copy_name(game, index, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    throw_result(env, "cna_microphone_copy_name_at", result);
    return 0;
  }
  napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, output);
  free(value);
  if (status != napi_ok) {
    throw_napi(env, "microphone name creation");
    return 0;
  }
  return 1;
}

static napi_value get_microphones(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint64_t count = 0, default_index = 0;
  CNA_Bool has_default = CNA_FALSE;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.microphone_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_microphone_get_count", result);
  if (count > UINT32_MAX) return throw_message(env, "microphone count exceeds JavaScript array capacity");
  result = g_api.microphone_get_default(game, &default_index, &has_default);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_microphone_get_default_index_ext", result);
  }
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "microphone array");
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value item, name;
    CNA_Bool headset = CNA_FALSE;
    int32_t sample_rate = 0;
    uint32_t state = 0;
    int64_t buffer_duration = 0;
    if (!copy_microphone_name(env, game, index, &name)) return NULL;
    result = g_api.microphone_get_is_headset(game, index, &headset);
    if (result == CNA_RESULT_SUCCESS) result = g_api.microphone_get_sample_rate(game, index, &sample_rate);
    if (result == CNA_RESULT_SUCCESS) result = g_api.microphone_get_state(game, index, &state);
    if (result == CNA_RESULT_SUCCESS) result = g_api.microphone_get_buffer_duration(game, index, &buffer_duration);
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, "CNA microphone snapshot", result);
    NAPI_OR_RETURN(env, napi_create_object(env, &item), "microphone snapshot");
    napi_value ticks;
    NAPI_OR_RETURN(env, napi_create_bigint_int64(env, buffer_duration, &ticks), "microphone duration");
    if (!set_u32(env, item, "Index", (uint32_t) index) ||
        napi_set_named_property(env, item, "Name", name) != napi_ok ||
        !set_bool(env, item, "IsHeadset", headset == CNA_TRUE) ||
        !set_i32(env, item, "SampleRate", sample_rate) ||
        !set_u32(env, item, "State", state) ||
        napi_set_named_property(env, item, "BufferDurationTicks", ticks) != napi_ok ||
        !set_bool(env, item, "IsDefault", has_default == CNA_TRUE && default_index == index) ||
        napi_set_element(env, output, (uint32_t) index, item) != napi_ok) {
      return throw_napi(env, "microphone snapshot properties");
    }
  }
  return output;
}

static napi_value set_microphone_duration(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game = 0;
  uint32_t index = 0;
  int64_t ticks = 0;
  bool lossless = false;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok ||
      napi_get_value_bigint_int64(env, args[2], &ticks, &lossless) != napi_ok || !lossless) return NULL;
  CNA_Result result = g_api.microphone_set_buffer_duration(game, index, ticks);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_microphone_set_buffer_duration_ticks_at", result);
  }
  return undefined_result(env, "microphone duration result");
}

static napi_value call_microphone_index(
  napi_env env, napi_callback_info info, GameIndexFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle game = 0;
  uint32_t index = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) return NULL;
  CNA_Result result = function(game, index);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "microphone operation result");
}

static napi_value start_microphone(napi_env env, napi_callback_info info) {
  return call_microphone_index(env, info, g_api.microphone_start, "cna_microphone_start_at");
}

static napi_value stop_microphone(napi_env env, napi_callback_info info) {
  return call_microphone_index(env, info, g_api.microphone_stop, "cna_microphone_stop_at");
}

static napi_value get_microphone_data(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game = 0;
  uint32_t index = 0, capacity = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok ||
      napi_get_value_uint32(env, args[2], &capacity) != napi_ok) return NULL;
  uint8_t* bytes = capacity == 0 ? NULL : (uint8_t*) malloc(capacity);
  if (capacity != 0 && !bytes) return throw_message(env, "microphone buffer allocation failed");
  uint64_t written = 0;
  CNA_Result result = g_api.microphone_get_data(game, index, bytes, capacity, &written);
  if (result != CNA_RESULT_SUCCESS || written > capacity) {
    free(bytes);
    return throw_result(env, "cna_microphone_get_data_at", result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "microphone data copy");
  free(bytes);
  return output;
}

static napi_value create_audio_engine(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[5];
  CNA_Handle game = 0, engine = 0;
  char* settings = NULL;
  char* renderer = NULL;
  size_t settings_length = 0, renderer_length = 0;
  bool extended = false, lossless = false;
  int64_t look_ahead = 0;
  if (!get_args(env, info, 5, args) || !read_handle(env, args[0], &game) ||
      !read_utf8(env, args[1], &settings, &settings_length) ||
      napi_get_value_bool(env, args[2], &extended) != napi_ok ||
      napi_get_value_bigint_int64(env, args[3], &look_ahead, &lossless) != napi_ok || !lossless ||
      !read_utf8(env, args[4], &renderer, &renderer_length)) {
    free(settings);
    free(renderer);
    return NULL;
  }
  const CNA_StringView settings_view = {settings, settings_length};
  const CNA_StringView renderer_view = {renderer, renderer_length};
  CNA_Result result = extended
    ? g_api.audio_engine_create_renderer(game, settings_view, look_ahead, renderer_view, &engine)
    : g_api.audio_engine_create(game, settings_view, &engine);
  free(settings);
  free(renderer);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, extended ? "cna_audio_engine_create_with_renderer" : "cna_audio_engine_create", result);
  }
  return make_handle(env, engine);
}

static napi_value get_handle_bool(
  napi_env env, napi_callback_info info, BoolGetFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle handle = 0;
  CNA_Bool value = CNA_FALSE;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &handle)) return NULL;
  CNA_Result result = function(handle, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value == CNA_TRUE, &output), "native boolean result");
  return output;
}

#define HANDLE_BOOL_GETTER(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return get_handle_bool(env, info, g_api.field, operation); \
  }

HANDLE_BOOL_GETTER(get_audio_engine_disposed, audio_engine_get_disposed, "cna_audio_engine_get_is_disposed")
HANDLE_BOOL_GETTER(get_wave_bank_disposed, wave_bank_get_disposed, "cna_wave_bank_get_is_disposed")
HANDLE_BOOL_GETTER(get_wave_bank_prepared, wave_bank_get_prepared, "cna_wave_bank_get_is_prepared")
HANDLE_BOOL_GETTER(get_wave_bank_in_use, wave_bank_get_in_use, "cna_wave_bank_get_is_in_use")
HANDLE_BOOL_GETTER(get_sound_bank_disposed, sound_bank_get_disposed, "cna_sound_bank_get_is_disposed")
HANDLE_BOOL_GETTER(get_sound_bank_in_use, sound_bank_get_in_use, "cna_sound_bank_get_is_in_use")

static int copy_indexed_string(
  napi_env env,
  CNA_Handle handle,
  uint64_t index,
  HandleIndexU64OutFn size_function,
  HandleIndexCopyStringFn copy_function,
  const char* operation,
  napi_value* output
) {
  uint64_t length = 0, copied = 0;
  CNA_Result result = size_function(handle, index, &length);
  if (result != CNA_RESULT_SUCCESS) {
    throw_result(env, operation, result);
    return 0;
  }
  if (length > SIZE_MAX) {
    throw_message(env, "native string exceeds host address space");
    return 0;
  }
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) {
    throw_message(env, "native string allocation failed");
    return 0;
  }
  result = copy_function(handle, index, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    throw_result(env, operation, result);
    return 0;
  }
  napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, output);
  free(value);
  if (status != napi_ok) {
    throw_napi(env, operation);
    return 0;
  }
  return 1;
}

static napi_value get_audio_engine_renderers(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle engine = 0;
  uint64_t count = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &engine)) return NULL;
  CNA_Result result = g_api.audio_engine_get_renderer_count(engine, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_audio_engine_get_renderer_count", result);
  if (count > UINT32_MAX) return throw_message(env, "XACT renderer count exceeds JavaScript array capacity");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "XACT renderer array");
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value item, friendly, renderer_id;
    if (!copy_indexed_string(
          env, engine, index,
          g_api.audio_engine_get_renderer_friendly_size,
          g_api.audio_engine_copy_renderer_friendly,
          "cna_audio_engine_copy_renderer_friendly_name", &friendly) ||
        !copy_indexed_string(
          env, engine, index,
          g_api.audio_engine_get_renderer_id_size,
          g_api.audio_engine_copy_renderer_id,
          "cna_audio_engine_copy_renderer_id", &renderer_id)) return NULL;
    NAPI_OR_RETURN(env, napi_create_object(env, &item), "XACT renderer detail");
    if (napi_set_named_property(env, item, "FriendlyName", friendly) != napi_ok ||
        napi_set_named_property(env, item, "RendererId", renderer_id) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, item) != napi_ok) {
      return throw_napi(env, "XACT renderer detail properties");
    }
  }
  return output;
}

static napi_value handle_string_float(
  napi_env env, napi_callback_info info,
  HandleStringFloatOutFn get_function, HandleStringFloatFn set_function,
  const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle handle = 0;
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, set_function ? 3 : 2, args) ||
      !read_handle(env, args[0], &handle) || !read_utf8(env, args[1], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  if (set_function) {
    double value = 0;
    if (napi_get_value_double(env, args[2], &value) != napi_ok) {
      free(name);
      return NULL;
    }
    CNA_Result result = set_function(handle, view, (float) value);
    free(name);
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
    return undefined_result(env, "XACT variable result");
  }
  float value = 0;
  CNA_Result result = get_function(handle, view, &value);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_double(env, value, &output), "XACT variable value");
  return output;
}

static napi_value get_audio_engine_global(napi_env env, napi_callback_info info) {
  return handle_string_float(env, info, g_api.audio_engine_get_global, NULL, "cna_audio_engine_get_global_variable");
}
static napi_value set_audio_engine_global(napi_env env, napi_callback_info info) {
  return handle_string_float(env, info, NULL, g_api.audio_engine_set_global, "cna_audio_engine_set_global_variable");
}
static napi_value get_cue_variable(napi_env env, napi_callback_info info) {
  return handle_string_float(env, info, g_api.cue_get_variable, NULL, "cna_cue_get_variable");
}
static napi_value set_cue_variable(napi_env env, napi_callback_info info) {
  return handle_string_float(env, info, NULL, g_api.cue_set_variable, "cna_cue_set_variable");
}

static napi_value create_handle_from_string(
  napi_env env, napi_callback_info info, HandleStringHandleOutFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle parent = 0, handle = 0;
  char* value = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &parent) ||
      !read_utf8(env, args[1], &value, &length)) return NULL;
  const CNA_StringView view = {value, length};
  CNA_Result result = function(parent, view, &handle);
  free(value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return make_handle(env, handle);
}

#define STRING_HANDLE_CREATOR(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return create_handle_from_string(env, info, g_api.field, operation); \
  }

STRING_HANDLE_CREATOR(get_audio_category, audio_engine_get_category, "cna_audio_engine_get_category")
STRING_HANDLE_CREATOR(create_wave_bank, wave_bank_create, "cna_wave_bank_create")
STRING_HANDLE_CREATOR(create_sound_bank, sound_bank_create, "cna_sound_bank_create")
STRING_HANDLE_CREATOR(get_sound_bank_cue, sound_bank_get_cue, "cna_sound_bank_get_cue")

static napi_value copy_handle_string(
  napi_env env, napi_callback_info info,
  HandleU64OutFn size_function, HandleCopyStringFn copy_function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle handle = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &handle)) return NULL;
  uint64_t length = 0, copied = 0;
  CNA_Result result = size_function(handle, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (length > SIZE_MAX) return throw_message(env, "native string exceeds host address space");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "native string allocation failed");
  result = copy_function(handle, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    return throw_result(env, operation, result);
  }
  napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, operation);
  return output;
}

static napi_value get_audio_category_name(napi_env env, napi_callback_info info) {
  return copy_handle_string(env, info, g_api.audio_category_get_name_size,
    g_api.audio_category_copy_name, "cna_audio_category_copy_name");
}
static napi_value get_cue_name(napi_env env, napi_callback_info info) {
  return copy_handle_string(env, info, g_api.cue_get_name_size,
    g_api.cue_copy_name, "cna_cue_copy_name");
}

static napi_value set_audio_category_volume(napi_env env, napi_callback_info info) {
  return set_sound_instance_float(env, info, g_api.audio_category_set_volume, "cna_audio_category_set_volume");
}

static napi_value handle_options(
  napi_env env, napi_callback_info info, HandleOptionsFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle handle = 0;
  uint32_t options = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &handle) ||
      napi_get_value_uint32(env, args[1], &options) != napi_ok) return NULL;
  CNA_Result result = function(handle, options);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "XACT stop result");
}

static napi_value stop_audio_category(napi_env env, napi_callback_info info) {
  return handle_options(env, info, g_api.audio_category_stop, "cna_audio_category_stop");
}
static napi_value stop_cue(napi_env env, napi_callback_info info) {
  return handle_options(env, info, g_api.cue_stop, "cna_cue_stop");
}

static napi_value audio_categories_equal(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2], output;
  CNA_Handle left = 0, right = 0;
  CNA_Bool value = CNA_FALSE;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &left) ||
      !read_handle(env, args[1], &right)) return NULL;
  CNA_Result result = g_api.audio_category_equals(left, right, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_audio_category_equals", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value == CNA_TRUE, &output), "category equality");
  return output;
}

static napi_value get_audio_category_hash(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle category = 0;
  int32_t value = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &category)) return NULL;
  CNA_Result result = g_api.audio_category_get_hash(category, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_audio_category_get_hash_code", result);
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), "category hash code");
  return output;
}

static napi_value create_streaming_wave_bank(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle engine = 0, bank = 0;
  char* filename = NULL;
  size_t length = 0;
  int32_t offset = 0, packet_size_value = 0;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &engine) ||
      !read_utf8(env, args[1], &filename, &length) ||
      napi_get_value_int32(env, args[2], &offset) != napi_ok ||
      napi_get_value_int32(env, args[3], &packet_size_value) != napi_ok) {
    free(filename);
    return NULL;
  }
  if (packet_size_value < INT16_MIN || packet_size_value > INT16_MAX) {
    free(filename);
    return throw_message(env, "XACT wave-bank packet size must fit an int16");
  }
  const CNA_StringView view = {filename, length};
  CNA_Result result = g_api.wave_bank_create_streaming(
    engine, view, offset, (int16_t) packet_size_value, &bank);
  free(filename);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_wave_bank_create_streaming", result);
  return make_handle(env, bank);
}

static napi_value play_sound_bank_cue(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle bank = 0;
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &bank) ||
      !read_utf8(env, args[1], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.sound_bank_play_cue(bank, view);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_bank_play_cue", result);
  return undefined_result(env, "sound-bank cue result");
}

static napi_value play_sound_bank_cue_3d(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[4];
  CNA_Handle bank = 0;
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 4, args) || !read_handle(env, args[0], &bank) ||
      !read_utf8(env, args[1], &name, &length)) return NULL;
  CNA_AudioListener listener;
  CNA_AudioEmitter emitter;
  if (!read_audio_listener(env, args[2], &listener) || !read_audio_emitter(env, args[3], &emitter)) {
    free(name);
    return NULL;
  }
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.sound_bank_play_cue_3d(bank, view, &listener, &emitter);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_sound_bank_play_cue_3d", result);
  return undefined_result(env, "3D sound-bank cue result");
}

static napi_value get_cue_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle cue = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &cue)) return NULL;
  CNA_CueInfo value;
  memset(&value, 0, sizeof(value));
  value.struct_size = sizeof(value);
  value.struct_version = 1;
  CNA_Result result = g_api.cue_get_info(cue, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cue_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "cue info");
  if (!set_bool(env, output, "IsCreated", value.is_created == CNA_TRUE) ||
      !set_bool(env, output, "IsDisposed", value.is_disposed == CNA_TRUE) ||
      !set_bool(env, output, "IsPaused", value.is_paused == CNA_TRUE) ||
      !set_bool(env, output, "IsPlaying", value.is_playing == CNA_TRUE) ||
      !set_bool(env, output, "IsPrepared", value.is_prepared == CNA_TRUE) ||
      !set_bool(env, output, "IsPreparing", value.is_preparing == CNA_TRUE) ||
      !set_bool(env, output, "IsStopped", value.is_stopped == CNA_TRUE) ||
      !set_bool(env, output, "IsStopping", value.is_stopping == CNA_TRUE)) {
    return throw_napi(env, "cue info properties");
  }
  return output;
}

static napi_value apply_cue_3d(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle cue = 0;
  CNA_AudioListener listener;
  CNA_AudioEmitter emitter;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &cue) ||
      !read_audio_listener(env, args[1], &listener) || !read_audio_emitter(env, args[2], &emitter)) {
    return NULL;
  }
  CNA_Result result = g_api.cue_apply_3d(cue, &listener, &emitter);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cue_apply_3d", result);
  return undefined_result(env, "cue Apply3D result");
}

AUDIO_HANDLE_METHOD(destroy_audio_engine, audio_engine_destroy, "cna_audio_engine_destroy")
AUDIO_HANDLE_METHOD(update_audio_engine, audio_engine_update, "cna_audio_engine_update")
AUDIO_HANDLE_METHOD(destroy_audio_category, audio_category_destroy, "cna_audio_category_destroy")
AUDIO_HANDLE_METHOD(pause_audio_category, audio_category_pause, "cna_audio_category_pause")
AUDIO_HANDLE_METHOD(resume_audio_category, audio_category_resume, "cna_audio_category_resume")
AUDIO_HANDLE_METHOD(destroy_wave_bank, wave_bank_destroy, "cna_wave_bank_destroy")
AUDIO_HANDLE_METHOD(destroy_sound_bank, sound_bank_destroy, "cna_sound_bank_destroy")
AUDIO_HANDLE_METHOD(destroy_cue, cue_destroy, "cna_cue_destroy")
AUDIO_HANDLE_METHOD(play_cue, cue_play, "cna_cue_play")
AUDIO_HANDLE_METHOD(pause_cue, cue_pause, "cna_cue_pause")
AUDIO_HANDLE_METHOD(resume_cue, cue_resume, "cna_cue_resume")

static napi_value get_media_sources(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint32_t count = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.media_source_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_media_source_get_available_count", result);
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, count, &output), "media source array");
  for (uint32_t index = 0; index < count; index += 1) {
    uint32_t type = 0;
    uint64_t length = 0, copied = 0;
    result = g_api.media_source_get_type(game, index, &type);
    if (result == CNA_RESULT_SUCCESS) result = g_api.media_source_get_name_size(game, index, &length);
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, "CNA media source snapshot", result);
    if (length > SIZE_MAX) return throw_message(env, "media source name exceeds host address space");
    char* name = length == 0 ? NULL : (char*) malloc((size_t) length);
    if (length != 0 && !name) return throw_message(env, "media source name allocation failed");
    result = g_api.media_source_copy_name(game, index, name, length, &copied);
    if (result != CNA_RESULT_SUCCESS || copied != length) {
      free(name);
      return throw_result(env, "cna_media_source_copy_name_at", result);
    }
    napi_value item, name_value;
    napi_status status = napi_create_string_utf8(env, name ? name : "", (size_t) length, &name_value);
    free(name);
    if (status != napi_ok) return throw_napi(env, "media source name creation");
    NAPI_OR_RETURN(env, napi_create_object(env, &item), "media source snapshot");
    if (!set_u32(env, item, "Index", index) || !set_u32(env, item, "Type", type) ||
        napi_set_named_property(env, item, "Name", name_value) != napi_ok ||
        napi_set_element(env, output, index, item) != napi_ok) {
      return throw_napi(env, "media source snapshot properties");
    }
  }
  return output;
}

static void destroy_song_handles(CNA_Handle* songs, uint32_t count) {
  for (uint32_t index = count; index > 0; index -= 1) {
    if (songs[index - 1] != 0) (void) g_api.song_destroy(songs[index - 1]);
  }
}

static napi_value play_media_songs(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle game = 0;
  int32_t start_index = 0;
  bool is_array = false;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &game) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array ||
      napi_get_value_int32(env, args[2], &start_index) != napi_ok) {
    return throw_message(env, "media songs must be an array with an int32 start index");
  }
  uint32_t count = 0;
  NAPI_OR_RETURN(env, napi_get_array_length(env, args[1], &count), "media song count");
  CNA_Handle* songs = count == 0 ? NULL : (CNA_Handle*) calloc(count, sizeof(*songs));
  if (count != 0 && !songs) return throw_message(env, "media song handle allocation failed");
  uint32_t created = 0;
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value item, name_value, uri_value;
    char* name = NULL;
    char* uri = NULL;
    size_t name_length = 0, uri_length = 0;
    if (napi_get_element(env, args[1], index, &item) != napi_ok ||
        !get_named_value(env, item, "Name", &name_value) ||
        !get_named_value(env, item, "Uri", &uri_value) ||
        !read_utf8(env, name_value, &name, &name_length) ||
        !read_utf8(env, uri_value, &uri, &uri_length)) {
      free(name);
      free(uri);
      destroy_song_handles(songs, created);
      free(songs);
      return NULL;
    }
    const CNA_StringView name_view = {name, name_length};
    const CNA_StringView uri_view = {uri, uri_length};
    CNA_Result result = g_api.song_create_uri(game, name_view, uri_view, &songs[index]);
    free(name);
    free(uri);
    if (result != CNA_RESULT_SUCCESS) {
      destroy_song_handles(songs, created);
      free(songs);
      return throw_result(env, "cna_song_create_from_uri", result);
    }
    created += 1;
  }
  CNA_Handle collection = 0;
  const char* operation = "cna_song_collection_create";
  CNA_Result result = g_api.song_collection_create(game, songs, count, &collection);
  if (result == CNA_RESULT_SUCCESS) {
    operation = "cna_media_player_play_songs_from";
    result = g_api.media_player_play_collection_from(game, collection, start_index);
  }
  CNA_Result collection_result = collection == 0
    ? CNA_RESULT_SUCCESS : g_api.song_collection_destroy(collection);
  destroy_song_handles(songs, created);
  free(songs);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, operation, result);
  }
  if (collection_result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_song_collection_destroy", collection_result);
  }
  return undefined_result(env, "media playback result");
}

static napi_value set_media_bool(
  napi_env env, napi_callback_info info, HandleBoolFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle game = 0;
  bool value = false;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &game) ||
      napi_get_value_bool(env, args[1], &value) != napi_ok) return NULL;
  CNA_Result result = function(game, value ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "media setting result");
}

#define MEDIA_BOOL_SETTER(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return set_media_bool(env, info, g_api.field, operation); \
  }

MEDIA_BOOL_SETTER(set_media_muted, media_player_set_muted, "cna_media_player_set_is_muted")
MEDIA_BOOL_SETTER(set_media_repeating, media_player_set_repeating, "cna_media_player_set_is_repeating")
MEDIA_BOOL_SETTER(set_media_shuffled, media_player_set_shuffled, "cna_media_player_set_is_shuffled")
MEDIA_BOOL_SETTER(set_media_visualization, media_player_set_visualization, "cna_media_player_set_is_visualization_enabled")

static napi_value set_media_volume(napi_env env, napi_callback_info info) {
  return set_audio_float(env, info, g_api.media_player_set_volume, "cna_media_player_set_volume");
}

static napi_value get_media_game_control(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.media_player_get_game_control, "cna_media_player_get_game_has_control");
}

static napi_value get_media_position(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output;
  CNA_Handle game = 0;
  int64_t ticks = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.media_player_get_position(game, &ticks);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_media_player_get_play_position_ticks", result);
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, ticks, &output), "media play position");
  return output;
}

static napi_value get_media_visualization(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output, frequencies, samples;
  CNA_Handle game = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_VisualizationData data;
  memset(&data, 0, sizeof(data));
  data.struct_size = sizeof(data);
  data.struct_version = 1;
  CNA_Result result = g_api.media_player_get_visualization(game, &data);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_media_player_get_visualization_data", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "visualization data");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, CNA_VISUALIZATION_DATA_SIZE, &frequencies), "frequency array");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, CNA_VISUALIZATION_DATA_SIZE, &samples), "sample array");
  for (uint32_t index = 0; index < CNA_VISUALIZATION_DATA_SIZE; index += 1) {
    napi_value frequency, sample;
    NAPI_OR_RETURN(env, napi_create_double(env, data.frequencies[index], &frequency), "frequency value");
    NAPI_OR_RETURN(env, napi_create_double(env, data.samples[index], &sample), "sample value");
    NAPI_OR_RETURN(env, napi_set_element(env, frequencies, index, frequency), "frequency append");
    NAPI_OR_RETURN(env, napi_set_element(env, samples, index, sample), "sample append");
  }
  if (napi_set_named_property(env, output, "Frequencies", frequencies) != napi_ok ||
      napi_set_named_property(env, output, "Samples", samples) != napi_ok) {
    return throw_napi(env, "visualization properties");
  }
  return output;
}

AUDIO_HANDLE_METHOD(pause_media, media_player_pause, "cna_media_player_pause")
AUDIO_HANDLE_METHOD(resume_media, media_player_resume, "cna_media_player_resume")
AUDIO_HANDLE_METHOD(stop_media, media_player_stop, "cna_media_player_stop")
AUDIO_HANDLE_METHOD(move_next_media, media_player_move_next, "cna_media_player_move_next")
AUDIO_HANDLE_METHOD(move_previous_media, media_player_move_previous, "cna_media_player_move_previous")
AUDIO_HANDLE_METHOD(update_media, media_player_update, "cna_media_player_update_ext")

static napi_value create_video_player(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle game = 0, player = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.video_player_create(game, &player);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_video_player_create", result);
  return make_handle(env, player);
}

static napi_value get_video_player_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output, ticks;
  CNA_Handle player = 0;
  uint32_t state = 0;
  int64_t position = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &player)) return NULL;
  CNA_Result result = g_api.video_player_get_state(player, &state);
  if (result == CNA_RESULT_SUCCESS) result = g_api.video_player_get_position(player, &position);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "CNA video-player info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "video-player info");
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, position, &ticks), "video play position");
  if (!set_u32(env, output, "State", state) ||
      napi_set_named_property(env, output, "PlayPositionTicks", ticks) != napi_ok) {
    return throw_napi(env, "video-player info properties");
  }
  return output;
}

static napi_value set_video_player_bool(
  napi_env env, napi_callback_info info, HandleBoolFn function, const char* operation
) {
  return set_media_bool(env, info, function, operation);
}

static napi_value set_video_player_looped(napi_env env, napi_callback_info info) {
  return set_video_player_bool(env, info, g_api.video_player_set_looped, "cna_video_player_set_is_looped");
}
static napi_value set_video_player_muted(napi_env env, napi_callback_info info) {
  return set_video_player_bool(env, info, g_api.video_player_set_muted, "cna_video_player_set_is_muted");
}
static napi_value set_video_player_volume(napi_env env, napi_callback_info info) {
  return set_audio_float(env, info, g_api.video_player_set_volume, "cna_video_player_set_volume");
}

static napi_value play_video(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle player = 0, video = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &player) ||
      !read_handle(env, args[1], &video)) return NULL;
  CNA_Result result = g_api.video_player_play(player, video);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_video_player_play", result);
  return undefined_result(env, "video playback result");
}

AUDIO_HANDLE_METHOD(destroy_video_player, video_player_destroy, "cna_video_player_destroy")
AUDIO_HANDLE_METHOD(pause_video, video_player_pause, "cna_video_player_pause")
AUDIO_HANDLE_METHOD(resume_video, video_player_resume, "cna_video_player_resume")
AUDIO_HANDLE_METHOD(stop_video, video_player_stop, "cna_video_player_stop")

static napi_value select_storage_device(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[5];
  bool has_player = false, has_space = false;
  uint32_t player = 0;
  int32_t size = 0, directories = 0;
  CNA_Handle device = 0;
  if (!get_args(env, info, 5, args) ||
      napi_get_value_bool(env, args[0], &has_player) != napi_ok ||
      napi_get_value_uint32(env, args[1], &player) != napi_ok ||
      napi_get_value_bool(env, args[2], &has_space) != napi_ok ||
      napi_get_value_int32(env, args[3], &size) != napi_ok ||
      napi_get_value_int32(env, args[4], &directories) != napi_ok) return NULL;
  CNA_Result result;
  const char* operation;
  if (has_player && has_space) {
    operation = "cna_storage_device_show_selector_for_player_with_space";
    result = g_api.storage_select_player_space(player, size, directories, NULL, NULL, &device);
  } else if (has_player) {
    operation = "cna_storage_device_show_selector_for_player";
    result = g_api.storage_select_player(player, NULL, NULL, &device);
  } else if (has_space) {
    operation = "cna_storage_device_show_selector_with_space";
    result = g_api.storage_select_space(size, directories, NULL, NULL, &device);
  } else {
    operation = "cna_storage_device_show_selector";
    result = g_api.storage_select(NULL, NULL, &device);
  }
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return make_handle(env, device);
}

static napi_value get_storage_device_info(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1], output, free_space_value, total_space_value;
  CNA_Handle device = 0;
  CNA_Bool connected = CNA_FALSE;
  int64_t free_space = 0, total_space = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &device)) return NULL;
  CNA_Result result = g_api.storage_device_get_connected(device, &connected);
  if (result == CNA_RESULT_SUCCESS) result = g_api.storage_device_get_free_space(device, &free_space);
  if (result == CNA_RESULT_SUCCESS) result = g_api.storage_device_get_total_space(device, &total_space);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "CNA storage-device info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "storage-device info");
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, free_space, &free_space_value), "storage free space");
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, total_space, &total_space_value), "storage total space");
  if (!set_bool(env, output, "IsConnected", connected == CNA_TRUE) ||
      napi_set_named_property(env, output, "FreeSpace", free_space_value) != napi_ok ||
      napi_set_named_property(env, output, "TotalSpace", total_space_value) != napi_ok) {
    return throw_napi(env, "storage-device info properties");
  }
  return output;
}

static napi_value call_handle_string(
  napi_env env, napi_callback_info info, HandleStringViewFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle handle = 0;
  char* value = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &handle) ||
      !read_utf8(env, args[1], &value, &length)) return NULL;
  const CNA_StringView view = {value, length};
  CNA_Result result = function(handle, view);
  free(value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, "storage path operation result");
}

#define HANDLE_STRING_METHOD(name, field, operation) \
  static napi_value name(napi_env env, napi_callback_info info) { \
    return call_handle_string(env, info, g_api.field, operation); \
  }

HANDLE_STRING_METHOD(delete_storage_container, storage_device_delete_container, "cna_storage_device_delete_container")
HANDLE_STRING_METHOD(create_storage_directory, storage_container_create_directory, "cna_storage_container_create_directory")
HANDLE_STRING_METHOD(delete_storage_directory, storage_container_delete_directory, "cna_storage_container_delete_directory")
HANDLE_STRING_METHOD(delete_storage_file, storage_container_delete_file, "cna_storage_container_delete_file")

static napi_value open_storage_container(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle device = 0, container = 0;
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &device) ||
      !read_utf8(env, args[1], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.storage_container_open(device, view, NULL, NULL, &container);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_container_open", result);
  return make_handle(env, container);
}

static napi_value get_storage_container_display_name(napi_env env, napi_callback_info info) {
  return copy_handle_string(env, info, g_api.storage_container_get_display_name_size,
    g_api.storage_container_copy_display_name, "cna_storage_container_copy_display_name");
}

static napi_value handle_string_exists(
  napi_env env, napi_callback_info info, HandleStringBoolOutFn function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2], output;
  CNA_Handle handle = 0;
  char* value = NULL;
  size_t length = 0;
  CNA_Bool exists = CNA_FALSE;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &handle) ||
      !read_utf8(env, args[1], &value, &length)) return NULL;
  const CNA_StringView view = {value, length};
  CNA_Result result = function(handle, view, &exists);
  free(value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, exists == CNA_TRUE, &output), "storage existence result");
  return output;
}

static napi_value storage_directory_exists(napi_env env, napi_callback_info info) {
  return handle_string_exists(env, info, g_api.storage_container_directory_exists,
    "cna_storage_container_directory_exists");
}
static napi_value storage_file_exists(napi_env env, napi_callback_info info) {
  return handle_string_exists(env, info, g_api.storage_container_file_exists,
    "cna_storage_container_file_exists");
}

static napi_value get_storage_names(
  napi_env env, napi_callback_info info,
  HandleStringU64OutFn count_function, StorageNameCopyFn copy_function, const char* operation
) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2], output;
  CNA_Handle container = 0;
  char* pattern = NULL;
  size_t pattern_length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &container) ||
      !read_utf8(env, args[1], &pattern, &pattern_length)) return NULL;
  const CNA_StringView view = {pattern, pattern_length};
  uint64_t count = 0;
  CNA_Result result = count_function(container, view, &count);
  if (result != CNA_RESULT_SUCCESS) {
    free(pattern);
    return throw_result(env, operation, result);
  }
  if (count > UINT32_MAX) {
    free(pattern);
    return throw_message(env, "storage name count exceeds JavaScript array capacity");
  }
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "storage name array");
  for (uint64_t index = 0; index < count; index += 1) {
    uint64_t length = 0, copied = 0;
    result = copy_function(container, view, index, NULL, 0, &length);
    if (result != CNA_RESULT_BUFFER_TOO_SMALL && result != CNA_RESULT_SUCCESS) {
      free(pattern);
      return throw_result(env, operation, result);
    }
    if (length > SIZE_MAX) {
      free(pattern);
      return throw_message(env, "storage name exceeds host address space");
    }
    char* name = length == 0 ? NULL : (char*) malloc((size_t) length);
    if (length != 0 && !name) {
      free(pattern);
      return throw_message(env, "storage name allocation failed");
    }
    result = copy_function(container, view, index, name, length, &copied);
    if (result != CNA_RESULT_SUCCESS || copied != length) {
      free(name);
      free(pattern);
      return throw_result(env, operation, result);
    }
    napi_value name_value;
    napi_status status = napi_create_string_utf8(env, name ? name : "", (size_t) length, &name_value);
    free(name);
    if (status != napi_ok || napi_set_element(env, output, (uint32_t) index, name_value) != napi_ok) {
      free(pattern);
      return throw_napi(env, "storage name creation");
    }
  }
  free(pattern);
  return output;
}

static napi_value get_storage_directory_names(napi_env env, napi_callback_info info) {
  return get_storage_names(env, info, g_api.storage_container_get_directory_count,
    g_api.storage_container_copy_directory_name, "CNA storage directory listing");
}
static napi_value get_storage_file_names(napi_env env, napi_callback_info info) {
  return get_storage_names(env, info, g_api.storage_container_get_file_count,
    g_api.storage_container_copy_file_name, "CNA storage file listing");
}

static napi_value create_storage_file(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle container = 0, stream = 0;
  char* file = NULL;
  size_t length = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &container) ||
      !read_utf8(env, args[1], &file, &length)) return NULL;
  const CNA_StringView view = {file, length};
  CNA_Result result = g_api.storage_container_create_file(container, view, &stream);
  free(file);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_container_create_file", result);
  result = g_api.storage_stream_close(stream);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_stream_close", result);
  return undefined_result(env, "storage file creation result");
}

static napi_value open_storage_file(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[5];
  CNA_Handle container = 0, stream = 0;
  char* file = NULL;
  size_t length = 0;
  uint32_t mode = 0, access = 0, share = 0;
  if (!get_args(env, info, 5, args) || !read_handle(env, args[0], &container) ||
      !read_utf8(env, args[1], &file, &length) ||
      napi_get_value_uint32(env, args[2], &mode) != napi_ok ||
      napi_get_value_uint32(env, args[3], &access) != napi_ok ||
      napi_get_value_uint32(env, args[4], &share) != napi_ok) {
    free(file);
    return NULL;
  }
  const CNA_StringView view = {file, length};
  CNA_Result result = g_api.storage_container_open_file(container, view, mode, access, share, &stream);
  free(file);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_container_open_file_share", result);
  int64_t signed_length = 0;
  result = g_api.storage_stream_get_length(stream, &signed_length);
  if (result != CNA_RESULT_SUCCESS) {
    (void) g_api.storage_stream_close(stream);
    return throw_result(env, "cna_storage_stream_get_length", result);
  }
  if (signed_length < 0 || (uint64_t) signed_length > SIZE_MAX) {
    (void) g_api.storage_stream_close(stream);
    return throw_message(env, "storage stream length exceeds the native address space");
  }
  const size_t byte_count = access == CNA_FILE_ACCESS_WRITE ? 0 : (size_t) signed_length;
  uint8_t* bytes = byte_count == 0 ? NULL : (uint8_t*) malloc(byte_count);
  if (byte_count != 0 && !bytes) {
    (void) g_api.storage_stream_close(stream);
    return throw_message(env, "storage stream buffer allocation failed");
  }
  uint64_t read = 0;
  if (byte_count != 0) result = g_api.storage_stream_read(stream, bytes, byte_count, &read);
  CNA_Result close_result = g_api.storage_stream_close(stream);
  if (result != CNA_RESULT_SUCCESS || read > byte_count) {
    free(bytes);
    return throw_result(env, "cna_storage_stream_read", result);
  }
  if (close_result != CNA_RESULT_SUCCESS) {
    free(bytes);
    return throw_result(env, "cna_storage_stream_close", close_result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) read, "storage stream copy");
  free(bytes);
  return output;
}

AUDIO_HANDLE_METHOD(destroy_storage_device, storage_device_destroy, "cna_storage_device_destroy")
AUDIO_HANDLE_METHOD(destroy_storage_container, storage_container_destroy, "cna_storage_container_destroy")

/* ---- Process-wide CNA runtime services (platform, renderer selection, logging) ----------------
   None of these take a handle: they answer before a Game exists and are the same operations on
   every backend, which is what makes them the first modern CNA extension family. */

static napi_value copy_global_string(
  napi_env env, SizeOutFn size_function, CopyTextFn copy_function, const char* operation) {
  uint64_t length = 0;
  CNA_Result result = size_function(&length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (length > SIZE_MAX) return throw_message(env, "CNA runtime text exceeds host address space");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "CNA runtime text allocation failed");
  uint64_t copied = 0;
  result = copy_function(value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    return throw_result(env, operation, result);
  }
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, operation);
  return output;
}

static napi_value copy_identity_string(
  napi_env env, uint32_t identity, U32SizeOutFn size_function, U32CopyTextFn copy_function,
  const char* operation) {
  uint64_t length = 0;
  CNA_Result result = size_function(identity, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (length > SIZE_MAX) return throw_message(env, "CNA identity name exceeds host address space");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "CNA identity name allocation failed");
  uint64_t copied = 0;
  result = copy_function(identity, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    return throw_result(env, operation, result);
  }
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, value ? value : "", (size_t) length, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, operation);
  return output;
}

static int set_u32_property(napi_env env, napi_value object, const char* name, uint32_t value) {
  napi_value entry;
  return napi_create_uint32(env, value, &entry) == napi_ok &&
    napi_set_named_property(env, object, name, entry) == napi_ok;
}

static int set_bool_property(napi_env env, napi_value object, const char* name, CNA_Bool value) {
  napi_value entry;
  return napi_get_boolean(env, value != CNA_FALSE, &entry) == napi_ok &&
    napi_set_named_property(env, object, name, entry) == napi_ok;
}

static napi_value get_platform_snapshot(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint32_t platform = 0, desktop = 0;
  CNA_Bool apple = CNA_FALSE, mobile = CNA_FALSE;
  CNA_Result result = g_api.platform_get_current(&platform);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_platform_get_current", result);
  result = g_api.platform_get_is_apple(&apple);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_platform_get_is_apple_ext", result);
  result = g_api.platform_get_is_mobile(&mobile);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_platform_get_is_mobile_ext", result);
  /* Off a desktop there is no desktop operating system, and CNA refuses the question with
     CNA_RESULT_INVALID_STATE rather than naming one. That is a state, not a failure. */
  int has_desktop = 1;
  result = g_api.desktop_os_get_current(&desktop);
  if (result == CNA_RESULT_INVALID_STATE) has_desktop = 0;
  else if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_desktop_os_get_current", result);
  }
  napi_value name = copy_global_string(env, g_api.platform_name_size, g_api.platform_copy_name,
    "cna_platform_copy_current_name_ext");
  if (!name) return NULL;
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "platform snapshot");
  napi_value desktop_value;
  if (has_desktop) {
    NAPI_OR_RETURN(env, napi_create_uint32(env, desktop, &desktop_value), "platform snapshot");
  } else {
    NAPI_OR_RETURN(env, napi_get_null(env, &desktop_value), "platform snapshot");
  }
  if (!set_u32_property(env, output, "Platform", platform) ||
      napi_set_named_property(env, output, "DesktopOperatingSystem", desktop_value) != napi_ok ||
      !set_bool_property(env, output, "IsApple", apple) ||
      !set_bool_property(env, output, "IsMobile", mobile) ||
      napi_set_named_property(env, output, "Name", name) != napi_ok) {
    return throw_napi(env, "platform snapshot");
  }
  return output;
}

static napi_value get_renderer_selection(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint32_t selected = 0, active = 0, current = 0;
  CNA_Bool latched = CNA_FALSE, automatic = CNA_FALSE;
  CNA_Result result = g_api.renderer_get_selected(&selected);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_renderer_get_selected_ext", result);
  /* Before any renderer has been created there is no active or current identity, and CNA says so
     with CNA_RESULT_INVALID_STATE rather than by inventing one. That is a state, not a failure, so
     it becomes a null field instead of a thrown error. */
  int has_active = 1, has_current = 1;
  result = g_api.renderer_get_active(&active);
  if (result == CNA_RESULT_INVALID_STATE) has_active = 0;
  else if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_active_ext", result);
  }
  result = g_api.renderer_get_current_type(&current);
  if (result == CNA_RESULT_INVALID_STATE) has_current = 0;
  else if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_current_type", result);
  }
  result = g_api.renderer_get_is_latched(&latched);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_renderer_get_is_latched_ext", result);
  result = g_api.renderer_get_automatic_fallback(&automatic);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_automatic_fallback_ext", result);
  }
  napi_value name;
  if (has_current) {
    name = copy_global_string(env, g_api.renderer_current_name_size,
      g_api.renderer_copy_current_name, "cna_graphics_renderer_copy_current_name");
    if (!name) return NULL;
  } else {
    NAPI_OR_RETURN(env, napi_get_null(env, &name), "renderer selection");
  }
  napi_value active_value, current_value;
  if (has_active) {
    NAPI_OR_RETURN(env, napi_create_uint32(env, active, &active_value), "renderer selection");
  } else {
    NAPI_OR_RETURN(env, napi_get_null(env, &active_value), "renderer selection");
  }
  if (has_current) {
    NAPI_OR_RETURN(env, napi_create_uint32(env, current, &current_value), "renderer selection");
  } else {
    NAPI_OR_RETURN(env, napi_get_null(env, &current_value), "renderer selection");
  }
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "renderer selection");
  if (!set_u32_property(env, output, "Selected", selected) ||
      napi_set_named_property(env, output, "Active", active_value) != napi_ok ||
      napi_set_named_property(env, output, "Current", current_value) != napi_ok ||
      !set_bool_property(env, output, "IsLatched", latched) ||
      !set_bool_property(env, output, "AutomaticFallback", automatic) ||
      napi_set_named_property(env, output, "CurrentName", name) != napi_ok) {
    return throw_napi(env, "renderer selection");
  }
  return output;
}

static napi_value get_available_renderer_types(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint64_t count = 0;
  CNA_Result result = g_api.renderer_available_count(&count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_available_count_ext", result);
  }
  if (count > SIZE_MAX / sizeof(CNA_GraphicsRendererType)) {
    return throw_message(env, "renderer list exceeds host address space");
  }
  CNA_GraphicsRendererType* types = count == 0 ? NULL :
    (CNA_GraphicsRendererType*) calloc((size_t) count, sizeof(CNA_GraphicsRendererType));
  if (count != 0 && !types) return throw_message(env, "renderer list allocation failed");
  uint64_t copied = 0;
  result = g_api.renderer_copy_available(types, count, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != count) {
    free(types);
    return throw_result(env, "cna_graphics_renderer_copy_available_ext", result);
  }
  napi_value output;
  if (napi_create_array_with_length(env, (size_t) count, &output) != napi_ok) {
    free(types);
    return throw_napi(env, "renderer list");
  }
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value entry;
    if (napi_create_uint32(env, types[index], &entry) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      free(types);
      return throw_napi(env, "renderer list");
    }
  }
  free(types);
  return output;
}

static napi_value describe_renderer(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  uint32_t type = 0;
  if (!get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &type) != napi_ok) return NULL;
  uint32_t category = 0, maturity = 0;
  CNA_Bool available = CNA_FALSE;
  CNA_Result result = g_api.backend_get_category(type, &category);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_backend_get_category", result);
  result = g_api.backend_get_maturity(type, &maturity);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_backend_get_maturity", result);
  result = g_api.renderer_get_is_available(type, &available);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_is_available_ext", result);
  }
  napi_value category_name = copy_identity_string(env, category, g_api.backend_category_name_size,
    g_api.backend_category_copy_name, "cna_graphics_backend_category_copy_name");
  if (!category_name) return NULL;
  napi_value maturity_name = copy_identity_string(env, maturity, g_api.backend_maturity_name_size,
    g_api.backend_maturity_copy_name, "cna_graphics_backend_maturity_copy_name");
  if (!maturity_name) return NULL;
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "renderer identity");
  if (!set_u32_property(env, output, "Type", type) ||
      !set_u32_property(env, output, "Category", category) ||
      !set_u32_property(env, output, "Maturity", maturity) ||
      !set_bool_property(env, output, "IsAvailable", available) ||
      napi_set_named_property(env, output, "CategoryName", category_name) != napi_ok ||
      napi_set_named_property(env, output, "MaturityName", maturity_name) != napi_ok) {
    return throw_napi(env, "renderer identity");
  }
  return output;
}

static napi_value set_preferred_renderer(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  uint32_t type = 0;
  if (!get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &type) != napi_ok) return NULL;
  CNA_Result result = g_api.renderer_set_preferred(type);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_set_preferred_ext", result);
  }
  return undefined_result(env, "preferred renderer result");
}

static napi_value set_preferred_renderer_by_name(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 1, args) || !read_utf8(env, args[0], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  CNA_Result result = g_api.renderer_set_preferred_by_name(view);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_set_preferred_by_name_ext", result);
  }
  return undefined_result(env, "preferred renderer result");
}

static napi_value try_parse_renderer_name(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  char* name = NULL;
  size_t length = 0;
  if (!get_args(env, info, 1, args) || !read_utf8(env, args[0], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  uint32_t type = 0;
  CNA_Bool recognized = CNA_FALSE;
  CNA_Result result = g_api.renderer_try_parse_name(view, &type, &recognized);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_try_parse_name_ext", result);
  }
  napi_value output;
  if (recognized == CNA_FALSE) {
    NAPI_OR_RETURN(env, napi_get_null(env, &output), "renderer name parse");
    return output;
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, type, &output), "renderer name parse");
  return output;
}

static napi_value set_renderer_fallback_chain(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  bool is_array = false;
  if (!get_args(env, info, 1, args)) return NULL;
  if (napi_is_array(env, args[0], &is_array) != napi_ok || !is_array) {
    return throw_message(env, "the renderer fallback chain must be an array");
  }
  uint32_t count = 0;
  NAPI_OR_RETURN(env, napi_get_array_length(env, args[0], &count), "fallback chain length");
  CNA_GraphicsRendererType* types = count == 0 ? NULL :
    (CNA_GraphicsRendererType*) calloc(count, sizeof(CNA_GraphicsRendererType));
  if (count != 0 && !types) return throw_message(env, "fallback chain allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value entry;
    uint32_t value = 0;
    if (napi_get_element(env, args[0], index, &entry) != napi_ok ||
        napi_get_value_uint32(env, entry, &value) != napi_ok) {
      free(types);
      return throw_message(env, "the renderer fallback chain must hold renderer identities");
    }
    types[index] = value;
  }
  CNA_Result result = g_api.renderer_set_fallback_chain(types, count);
  free(types);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_set_fallback_chain_ext", result);
  }
  return undefined_result(env, "fallback chain result");
}

static napi_value set_automatic_renderer_fallback(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  bool enabled = false;
  if (!get_args(env, info, 1, args) ||
      napi_get_value_bool(env, args[0], &enabled) != napi_ok) return NULL;
  CNA_Result result = g_api.renderer_set_automatic_fallback(enabled ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_set_automatic_fallback_ext", result);
  }
  return undefined_result(env, "automatic fallback result");
}

static napi_value get_renderer_fallbacks(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint64_t count = 0;
  CNA_Result result = g_api.renderer_fallback_count(&count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_renderer_get_fallback_count_ext", result);
  }
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "fallback list");
  for (uint64_t index = 0; index < count; index += 1) {
    CNA_GraphicsRendererFallbackRecord record;
    memset(&record, 0, sizeof(record));
    record.struct_size = sizeof(record);
    record.struct_version = 1;
    result = g_api.renderer_fallback_at(index, &record);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_graphics_renderer_get_fallback_at_ext", result);
    }
    uint64_t length = 0;
    result = g_api.renderer_fallback_message_size(index, &length);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_graphics_renderer_fallback_get_message_size_ext", result);
    }
    if (length > SIZE_MAX) return throw_message(env, "fallback message exceeds host address space");
    char* message = length == 0 ? NULL : (char*) malloc((size_t) length);
    if (length != 0 && !message) return throw_message(env, "fallback message allocation failed");
    uint64_t copied = 0;
    result = g_api.renderer_fallback_copy_message(index, message, length, &copied);
    if (result != CNA_RESULT_SUCCESS || copied != length) {
      free(message);
      return throw_result(env, "cna_graphics_renderer_fallback_copy_message_ext", result);
    }
    napi_value message_value;
    const napi_status status =
      napi_create_string_utf8(env, message ? message : "", (size_t) length, &message_value);
    free(message);
    if (status != napi_ok) return throw_napi(env, "fallback message");
    napi_value reason_name = copy_identity_string(env, record.reason,
      g_api.renderer_fallback_reason_name_size, g_api.renderer_fallback_reason_copy_name,
      "cna_graphics_renderer_fallback_reason_copy_name_ext");
    if (!reason_name) return NULL;
    napi_value entry;
    NAPI_OR_RETURN(env, napi_create_object(env, &entry), "fallback record");
    if (!set_u32_property(env, entry, "Type", record.type) ||
        !set_u32_property(env, entry, "Reason", record.reason) ||
        napi_set_named_property(env, entry, "ReasonName", reason_name) != napi_ok ||
        napi_set_named_property(env, entry, "Message", message_value) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      return throw_napi(env, "fallback record");
    }
  }
  return output;
}

static napi_value get_minimum_log_level(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint32_t level = 0;
  CNA_Result result = g_api.logger_get_minimum_level(&level);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_logger_get_minimum_level", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_uint32(env, level, &output), "log level");
  return output;
}

static napi_value set_minimum_log_level(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  uint32_t level = 0;
  if (!get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &level) != napi_ok) return NULL;
  CNA_Result result = g_api.logger_set_minimum_level(level);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_logger_set_minimum_level", result);
  return undefined_result(env, "log level result");
}

static napi_value write_log(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  uint32_t level = 0, category = 0;
  char* message = NULL;
  size_t length = 0;
  if (!get_args(env, info, 3, args) ||
      napi_get_value_uint32(env, args[0], &level) != napi_ok ||
      napi_get_value_uint32(env, args[1], &category) != napi_ok ||
      !read_utf8(env, args[2], &message, &length)) return NULL;
  const CNA_StringView view = {message, length};
  CNA_Result result = g_api.logger_log(level, view, category, CNA_FALSE);
  free(message);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_logger_log", result);
  return undefined_result(env, "log result");
}

static napi_value is_graphics_extension_layer_available(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  CNA_Bool available = CNA_FALSE;
  CNA_Result result = g_api.graphics_ext_is_available(&available);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_graphics_ext_is_available", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_get_boolean(env, available != CNA_FALSE, &output), "extension availability");
  return output;
}

/* ---- ContentLost subscriptions ---------------------------------------------------------------
   Three CNA callbacks with the same shape, one JavaScript dispatch. The callback runs on the
   thread that lost the device, which for every renderer this ABI can lose one on is the game
   thread inside a call this adapter made, so an ordinary napi_call_function is correct here. */

#define CONTENT_LOST_RENDER_TARGET 0u
#define CONTENT_LOST_VERTEX_BUFFER 1u
#define CONTENT_LOST_INDEX_BUFFER 2u

static ContentLostContext* find_content_lost(CNA_Handle registration) {
  for (ContentLostContext* value = g_content_lost_events; value; value = value->next) {
    if (value->registration == registration) return value;
  }
  return NULL;
}

static void unlink_content_lost(ContentLostContext* target) {
  ContentLostContext** link = &g_content_lost_events;
  while (*link) {
    if (*link == target) { *link = target->next; return; }
    link = &(*link)->next;
  }
}

static void dispatch_content_lost(void* raw) {
  ContentLostContext* context = (ContentLostContext*) raw;
  if (!context) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value callback, receiver, result;
  napi_status status = napi_get_reference_value(context->env, context->callback, &callback);
  if (status == napi_ok) status = napi_get_undefined(context->env, &receiver);
  if (status == napi_ok) status = napi_call_function(context->env, receiver, callback, 0, NULL, &result);
  /* A JavaScript exception must never unwind into compiled C. CNA's ContentLost contract has no
     way to carry one, so it is discarded here rather than left pending across the boundary. */
  if (status == napi_pending_exception) {
    napi_value exception;
    napi_get_and_clear_last_exception(context->env, &exception);
  }
  napi_close_handle_scope(context->env, scope);
}

static void on_render_target_content_lost(CNA_Handle target, void* context) {
  (void) target;
  dispatch_content_lost(context);
}

static void on_vertex_buffer_content_lost(CNA_VertexBufferHandle buffer, void* context) {
  (void) buffer;
  dispatch_content_lost(context);
}

static void on_index_buffer_content_lost(CNA_IndexBufferHandle buffer, void* context) {
  (void) buffer;
  dispatch_content_lost(context);
}

static napi_value subscribe_content_lost(napi_env env, napi_callback_info info, uint32_t kind) {
  napi_value args[2];
  CNA_Handle resource = 0;
  napi_valuetype type;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &resource) ||
      napi_typeof(env, args[1], &type) != napi_ok || type != napi_function) {
    return throw_message(env, "the ContentLost callback must be a function");
  }
  ContentLostContext* context = (ContentLostContext*) calloc(1, sizeof(*context));
  if (!context) return throw_message(env, "ContentLost context allocation failed");
  context->env = env;
  context->kind = kind;
  if (napi_create_reference(env, args[1], 1, &context->callback) != napi_ok) {
    free(context);
    return throw_napi(env, "ContentLost callback retention");
  }
  CNA_Result result;
  const char* operation;
  if (kind == CONTENT_LOST_RENDER_TARGET) {
    operation = "cna_render_target_subscribe_content_lost";
    result = g_api.render_target_subscribe_content_lost(
      resource, on_render_target_content_lost, context, &context->registration);
  } else if (kind == CONTENT_LOST_VERTEX_BUFFER) {
    operation = "cna_vertex_buffer_subscribe_content_lost";
    result = g_api.vertex_buffer_subscribe_content_lost(
      resource, on_vertex_buffer_content_lost, context, &context->registration);
  } else {
    operation = "cna_index_buffer_subscribe_content_lost";
    result = g_api.index_buffer_subscribe_content_lost(
      resource, on_index_buffer_content_lost, context, &context->registration);
  }
  if (result != CNA_RESULT_SUCCESS) {
    napi_delete_reference(env, context->callback);
    free(context);
    return throw_result(env, operation, result);
  }
  context->next = g_content_lost_events;
  g_content_lost_events = context;
  return make_handle(env, context->registration);
}

static napi_value subscribe_render_target_content_lost(napi_env env, napi_callback_info info) {
  return subscribe_content_lost(env, info, CONTENT_LOST_RENDER_TARGET);
}

static napi_value subscribe_vertex_buffer_content_lost(napi_env env, napi_callback_info info) {
  return subscribe_content_lost(env, info, CONTENT_LOST_VERTEX_BUFFER);
}

static napi_value subscribe_index_buffer_content_lost(napi_env env, napi_callback_info info) {
  return subscribe_content_lost(env, info, CONTENT_LOST_INDEX_BUFFER);
}

static napi_value unsubscribe_content_lost(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle registration = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &registration)) return NULL;
  ContentLostContext* context = find_content_lost(registration);
  if (!context) return throw_message(env, "no ContentLost registration has that handle");
  CNA_Result result;
  const char* operation;
  if (context->kind == CONTENT_LOST_RENDER_TARGET) {
    operation = "cna_render_target_unsubscribe_content_lost";
    result = g_api.render_target_unsubscribe_content_lost(registration);
  } else if (context->kind == CONTENT_LOST_VERTEX_BUFFER) {
    operation = "cna_vertex_buffer_unsubscribe_content_lost";
    result = g_api.vertex_buffer_unsubscribe_content_lost(registration);
  } else {
    operation = "cna_index_buffer_unsubscribe_content_lost";
    result = g_api.index_buffer_unsubscribe_content_lost(registration);
  }
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  unlink_content_lost(context);
  napi_delete_reference(env, context->callback);
  free(context);
  return undefined_result(env, "ContentLost unsubscribe result");
}

/* ---- Modern CNA graphics: PBR material and render-pipeline defaults, and the pipeline object ---
   The two *_init routes are pure value operations and answer in every build; the pipeline object
   needs the CNA_CNAEXT layer and answers CNA_RESULT_NOT_SUPPORTED where it was compiled out. */

/** The packed RGBA a CNA_Color carries, in the order Color.PackedValue uses. */
static uint32_t pack_color(CNA_Color value) {
  return ((uint32_t) value.r) | (((uint32_t) value.g) << 8) |
    (((uint32_t) value.b) << 16) | (((uint32_t) value.a) << 24);
}

static int set_f32_property(napi_env env, napi_value object, const char* name, float value) {
  napi_value entry;
  return napi_create_double(env, (double) value, &entry) == napi_ok &&
    napi_set_named_property(env, object, name, entry) == napi_ok;
}

static napi_value default_pbr_material(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  CNA_PbrMaterial material;
  memset(&material, 0, sizeof(material));
  CNA_Result result = g_api.pbr_material_init(&material);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_pbr_material_init", result);
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "PBR material defaults");
  if (!set_f32_property(env, output, "MetallicFactor", material.metallic_factor) ||
      !set_f32_property(env, output, "RoughnessFactor", material.roughness_factor) ||
      !set_f32_property(env, output, "NormalScale", material.normal_scale) ||
      !set_f32_property(env, output, "OcclusionStrength", material.occlusion_strength) ||
      !set_f32_property(env, output, "AlphaCutoff", material.alpha_cutoff) ||
      !set_bool_property(env, output, "AlphaBlendEnabled", material.alpha_blend_enabled) ||
      !set_u32_property(env, output, "AlbedoColor", pack_color(material.albedo_color)) ||
      !set_u32_property(env, output, "EmissiveColor", pack_color(material.emissive_color))) {
    return throw_napi(env, "PBR material defaults");
  }
  return output;
}

static napi_value default_render_pipeline_settings(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  CNA_RenderPipelineSettings settings;
  memset(&settings, 0, sizeof(settings));
  CNA_Result result = g_api.render_pipeline_settings_init(&settings);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_render_pipeline_settings_init", result);
  }
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "render pipeline defaults");
  if (!set_f32_property(env, output, "Exposure", settings.exposure) ||
      !set_f32_property(env, output, "Gamma", settings.gamma) ||
      !set_f32_property(env, output, "BloomIntensity", settings.bloom_intensity) ||
      !set_u32_property(env, output, "TonemappingMode", settings.tonemapping_mode) ||
      !set_u32_property(env, output, "RenderQuality", settings.render_quality) ||
      !set_u32_property(env, output, "ShadowQuality", settings.shadow_quality) ||
      !set_bool_property(env, output, "HdrEnabled", settings.hdr_enabled) ||
      !set_bool_property(env, output, "BloomEnabled", settings.bloom_enabled) ||
      !set_bool_property(env, output, "SsaoEnabled", settings.ssao_enabled) ||
      !set_bool_property(env, output, "ShadowsEnabled", settings.shadows_enabled)) {
    return throw_napi(env, "render pipeline defaults");
  }
  return output;
}

static napi_value create_render_pipeline(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle device = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &device)) return NULL;
  CNA_RenderPipelineHandle pipeline = 0;
  CNA_Result result = g_api.render_pipeline_create(device, &pipeline);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_pipeline_create", result);
  return make_handle(env, pipeline);
}

static napi_value resize_render_pipeline(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[3];
  CNA_Handle pipeline = 0;
  int32_t width = 0, height = 0;
  if (!get_args(env, info, 3, args) || !read_handle(env, args[0], &pipeline) ||
      napi_get_value_int32(env, args[1], &width) != napi_ok ||
      napi_get_value_int32(env, args[2], &height) != napi_ok) return NULL;
  CNA_Result result = g_api.render_pipeline_resize(pipeline, width, height);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_pipeline_resize", result);
  return undefined_result(env, "render pipeline resize result");
}

static napi_value begin_render_pipeline(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[2];
  CNA_Handle pipeline = 0;
  uint32_t packed = 0;
  if (!get_args(env, info, 2, args) || !read_handle(env, args[0], &pipeline) ||
      napi_get_value_uint32(env, args[1], &packed) != napi_ok) return NULL;
  const CNA_Color clear = {
    (uint8_t) (packed & 0xFFu), (uint8_t) ((packed >> 8) & 0xFFu),
    (uint8_t) ((packed >> 16) & 0xFFu), (uint8_t) ((packed >> 24) & 0xFFu)
  };
  CNA_Result result = g_api.render_pipeline_begin(pipeline, &clear);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_render_pipeline_begin", result);
  return undefined_result(env, "render pipeline begin result");
}

static napi_value get_render_pipeline_statistics(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle pipeline = 0;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &pipeline)) return NULL;
  CNA_RenderPipelineFrameStatisticsEXT statistics;
  memset(&statistics, 0, sizeof(statistics));
  statistics.struct_size = sizeof(statistics);
  statistics.struct_version = 1;
  CNA_Result result = g_api.render_pipeline_statistics(pipeline, &statistics);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_render_pipeline_get_statistics", result);
  }
  int32_t passes = 0;
  uint64_t memory = 0;
  result = g_api.render_pipeline_pass_count(pipeline, &passes);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_render_pipeline_get_last_frame_pass_count", result);
  }
  result = g_api.render_pipeline_memory(pipeline, &memory);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_render_pipeline_get_gpu_memory_estimate_bytes", result);
  }
  napi_value output, memory_value;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "render pipeline statistics");
  NAPI_OR_RETURN(env, napi_create_bigint_uint64(env, memory, &memory_value), "render pipeline statistics");
  if (!set_u32_property(env, output, "PassesRun", (uint32_t) statistics.passes_run) ||
      !set_u32_property(env, output, "TargetSwitches", (uint32_t) statistics.target_switches) ||
      !set_u32_property(env, output, "LastFramePassCount", (uint32_t) passes) ||
      !set_bool_property(env, output, "UsedSceneTarget", statistics.used_scene_target) ||
      !set_bool_property(env, output, "DrewSkybox", statistics.drew_skybox) ||
      napi_set_named_property(env, output, "GpuMemoryEstimateBytes", memory_value) != napi_ok) {
    return throw_napi(env, "render pipeline statistics");
  }
  return output;
}

/* --- CNB: the container, its texture schema and its sprite-font schema ---------------------- */
/*
 * CNB is CNA's own compiled content format, beside `.xnb`, and none of it has an XNA counterpart.
 * The family is unusual for this ABI in that most of it is pure functions over caller-owned bytes;
 * only the document and the two decoded descriptions own anything, and each of those is an ordinary
 * owned handle with one `_destroy`.
 */

static napi_value cnb_u32_text(
  napi_env env, napi_callback_info info,
  U32SizeOutFn size_route, U32CopyTextFn copy_route,
  const char* size_name, const char* copy_name
) {
  napi_value args[1];
  uint32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &value) != napi_ok) {
    return throw_message(env, "expected an unsigned 32-bit identity");
  }
  uint64_t length = 0;
  CNA_Result result = size_route(value, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, size_name, result);
  if (length > SIZE_MAX - 1) return throw_message(env, "CNB name exceeds the Node address space");
  char* text = (char*) malloc((size_t) length + 1);
  if (!text) return throw_message(env, "CNB name allocation failed");
  uint64_t copied = 0;
  result = copy_route(value, text, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(text);
    return throw_result(env, copy_name, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  text[length] = '\0';
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, text, (size_t) length, &output);
  free(text);
  if (status != napi_ok) return throw_napi(env, copy_name);
  return output;
}

static napi_value cnb_handle_text(
  napi_env env, CNA_Handle handle,
  HandleU64OutFn size_route, HandleCopyStringFn copy_route,
  const char* size_name, const char* copy_name
) {
  uint64_t length = 0;
  CNA_Result result = size_route(handle, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, size_name, result);
  if (length > SIZE_MAX - 1) return throw_message(env, "CNB text exceeds the Node address space");
  char* text = (char*) malloc((size_t) length + 1);
  if (!text) return throw_message(env, "CNB text allocation failed");
  uint64_t copied = 0;
  result = copy_route(handle, text, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(text);
    return throw_result(env, copy_name, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  text[length] = '\0';
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, text, (size_t) length, &output);
  free(text);
  if (status != napi_ok) return throw_napi(env, copy_name);
  return output;
}

static int set_double_property(napi_env env, napi_value object, const char* name, double value) {
  napi_value entry;
  return napi_create_double(env, value, &entry) == napi_ok &&
    napi_set_named_property(env, object, name, entry) == napi_ok;
}

static int set_i32_property(napi_env env, napi_value object, const char* name, int32_t value) {
  napi_value entry;
  return napi_create_int32(env, value, &entry) == napi_ok &&
    napi_set_named_property(env, object, name, entry) == napi_ok;
}

static int set_rectangle_property(
  napi_env env, napi_value object, const char* name, const CNA_Rectangle* rectangle
) {
  napi_value entry;
  if (napi_create_object(env, &entry) != napi_ok) return 0;
  if (!set_i32_property(env, entry, "X", rectangle->x) ||
      !set_i32_property(env, entry, "Y", rectangle->y) ||
      !set_i32_property(env, entry, "Width", rectangle->width) ||
      !set_i32_property(env, entry, "Height", rectangle->height)) {
    return 0;
  }
  return napi_set_named_property(env, object, name, entry) == napi_ok;
}

static napi_value cnb_has_magic(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  CNA_Bool present = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_byte_view(env, args[0], &bytes, &length)) return NULL;
  const CNA_Result result = g_api.cnb_has_magic(bytes, (uint64_t) length, &present);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_has_magic", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, present != CNA_FALSE, &output), "CNB magic");
  return output;
}

static napi_value cnb_format_magic(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  uint8_t magic[16];
  uint64_t written = 0;
  const CNA_Result result = g_api.cnb_copy_format_magic(magic, sizeof(magic), &written);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_copy_format_magic", result);
  return copy_bytes(env, magic, (size_t) written, "CNB magic copy");
}

static napi_value cnb_crc32c(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  uint32_t checksum = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_byte_view(env, args[0], &bytes, &length)) return NULL;
  const CNA_Result result = g_api.cnb_crc32c(bytes, (uint64_t) length, &checksum);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_crc32c", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, checksum, &output), "CNB checksum");
  return output;
}

static napi_value cnb_u32_bool(
  napi_env env, napi_callback_info info, U32ToBoolFn route, const char* name
) {
  napi_value args[1], output;
  uint32_t value = 0;
  CNA_Bool answer = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &value) != napi_ok) {
    return throw_message(env, "expected an unsigned 32-bit identity");
  }
  const CNA_Result result = route(value, &answer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, answer != CNA_FALSE, &output), name);
  return output;
}

static napi_value cnb_is_compression_supported(napi_env env, napi_callback_info info) {
  return cnb_u32_bool(env, info, g_api.cnb_is_compression_supported, "cna_cnb_is_compression_supported");
}

static napi_value cnb_is_custom_asset_type_id(napi_env env, napi_callback_info info) {
  return cnb_u32_bool(env, info, g_api.cnb_is_custom_asset_type_id, "cna_cnb_is_custom_asset_type_id");
}

static napi_value cnb_is_well_formed_chunk_id(napi_env env, napi_callback_info info) {
  return cnb_u32_bool(env, info, g_api.cnb_is_well_formed_chunk_id, "cna_cnb_is_well_formed_chunk_id");
}

static napi_value cnb_is_block_compressed_texture_format(napi_env env, napi_callback_info info) {
  return cnb_u32_bool(
    env, info, g_api.cnb_is_block_compressed_texture_format,
    "cna_cnb_is_block_compressed_texture_format");
}

static napi_value cnb_compression_name(napi_env env, napi_callback_info info) {
  return cnb_u32_text(
    env, info, g_api.cnb_get_compression_name_size, g_api.cnb_copy_compression_name,
    "cna_cnb_get_compression_name_size", "cna_cnb_copy_compression_name");
}

static napi_value cnb_asset_type_name(napi_env env, napi_callback_info info) {
  return cnb_u32_text(
    env, info, g_api.cnb_get_asset_type_name_size, g_api.cnb_copy_asset_type_name,
    "cna_cnb_get_asset_type_name_size", "cna_cnb_copy_asset_type_name");
}

static napi_value cnb_chunk_id_string(napi_env env, napi_callback_info info) {
  return cnb_u32_text(
    env, info, g_api.cnb_get_chunk_id_string_size, g_api.cnb_copy_chunk_id_string,
    "cna_cnb_get_chunk_id_string_size", "cna_cnb_copy_chunk_id_string");
}

static napi_value cnb_texture_format_name(napi_env env, napi_callback_info info) {
  return cnb_u32_text(
    env, info, g_api.cnb_get_texture_format_name_size, g_api.cnb_copy_texture_format_name,
    "cna_cnb_get_texture_format_name_size", "cna_cnb_copy_texture_format_name");
}

static napi_value cnb_asset_type_id_from_name(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  char* name = NULL;
  size_t length = 0;
  uint32_t id = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_utf8(env, args[0], &name, &length)) return NULL;
  const CNA_StringView view = {name, length};
  const CNA_Result result = g_api.cnb_asset_type_id_from_name(view, &id);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_asset_type_id_from_name", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, id, &output), "CNB asset type identity");
  return output;
}

/* --- CNB's writers: the primitive byte writer and the container writer ------------------------- */
/*
 * The write half of CNB, for an asset type CNA does not have a schema for. The byte writer lays
 * out a chunk's payload one primitive at a time; the container writer wraps chunks, metadata and
 * external references into a `.cnb` image. Together they are what "compile a custom asset" means.
 *
 * `cna_cnb_writer_write_to_file` is deliberately not bound. This package produces bytes and never
 * touches a filesystem -- that is the seam docs/content-pipeline-boundary.md draws, and the
 * build-time package writes the bytes itself.
 *
 * Every copy-out route takes the same two-pass shape CNB uses elsewhere: ask with a zero capacity
 * for the size, allocate exactly that, then copy. `take` additionally empties the writer, and it
 * is exposed distinctly from `copy_bytes` because collapsing them into a flag is how a caller ends
 * up with an empty writer it meant to keep.
 *
 * `cna_cnb_byte_writer_write_keyframe` is left to the animation-clip schema that owns the keyframe
 * shape: it is already encoded there, and reading one twice in two places is how the two drift.
 */

static napi_value cnb_byte_writer_create(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_CnbByteWriterHandle writer = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  napi_valuetype type = napi_undefined;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_typeof(env, args[0], &type) != napi_ok) return NULL;
  CNA_Result result;
  if (type == napi_null || type == napi_undefined) {
    result = g_api.cnb_byte_writer_create(&writer);
  } else {
    if (!read_byte_view(env, args[0], &bytes, &length)) return NULL;
    result = g_api.cnb_byte_writer_create_from_bytes(bytes, (uint64_t) length, &writer);
  }
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_create", result);
  }
  return make_handle(env, writer);
}

static napi_value cnb_byte_writer_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.cnb_byte_writer_destroy,
    "cna_cnb_byte_writer_destroy");
}
static napi_value cnb_byte_writer_get_size(napi_env env, napi_callback_info info) {
  return storage_buffer_u64(env, info, g_api.cnb_byte_writer_get_size,
    "cna_cnb_byte_writer_get_size");
}

/*
 * The unsigned writes. Each one is refused here when the value does not fit its width, rather than
 * being truncated into a plausible-looking number -- CNA takes the width it is given and cannot
 * tell a deliberate 0xFF from a truncated 0x1FF.
 */
static int read_bounded_u64(
  napi_env env, napi_value value, uint64_t limit, uint64_t* out, const char* what
) {
  double number = 0;
  if (napi_get_value_double(env, value, &number) != napi_ok ||
      !(number >= 0) || number > 9007199254740991.0 ||
      number != (double) (uint64_t) number || (uint64_t) number > limit) {
    throw_message(env, what);
    return 0;
  }
  *out = (uint64_t) number;
  return 1;
}

#define CNB_WRITE_UNSIGNED(name, field, ctype, limit, operation, message)                         \
  static napi_value name(napi_env env, napi_callback_info info) {                                 \
    napi_value args[2];                                                                           \
    CNA_Handle writer = 0;                                                                        \
    uint64_t value = 0;                                                                           \
    if (!require_loaded(env) || !get_args(env, info, 2, args) ||                                  \
        !read_handle(env, args[0], &writer) ||                                                    \
        !read_bounded_u64(env, args[1], (limit), &value, (message))) return NULL;                 \
    const CNA_Result result = g_api.field(writer, (ctype) value);                                 \
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, (operation), result);              \
    return undefined_result(env, (operation));                                                    \
  }

CNB_WRITE_UNSIGNED(cnb_byte_writer_write_u8, cnb_byte_writer_write_u8, uint8_t, 0xFFu,
  "cna_cnb_byte_writer_write_u8", "a u8 must be an integer from 0 to 255")
CNB_WRITE_UNSIGNED(cnb_byte_writer_write_u16, cnb_byte_writer_write_u16, uint16_t, 0xFFFFu,
  "cna_cnb_byte_writer_write_u16", "a u16 must be an integer from 0 to 65535")
CNB_WRITE_UNSIGNED(cnb_byte_writer_write_u32, cnb_byte_writer_write_u32, uint32_t, 0xFFFFFFFFu,
  "cna_cnb_byte_writer_write_u32", "a u32 must be an integer from 0 to 4294967295")

/* u64 takes a bigint, because a JavaScript number cannot carry one exactly. */
static napi_value cnb_byte_writer_write_u64(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  uint64_t value = 0;
  bool lossless = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  if (napi_get_value_bigint_uint64(env, args[1], &value, &lossless) != napi_ok || !lossless) {
    return throw_message(env, "a u64 must be a bigint that fits in 64 unsigned bits");
  }
  const CNA_Result result = g_api.cnb_byte_writer_write_u64(writer, value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_u64", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_u64");
}

static napi_value cnb_byte_writer_write_i32(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  int32_t value = 0;
  double number = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer) ||
      napi_get_value_double(env, args[1], &number) != napi_ok) return NULL;
  if (number != (double) (int32_t) number) {
    return throw_message(env, "an i32 must be an integer from -2147483648 to 2147483647");
  }
  value = (int32_t) number;
  const CNA_Result result = g_api.cnb_byte_writer_write_i32(writer, value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_i32", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_i32");
}

static napi_value cnb_byte_writer_write_f32(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.cnb_byte_writer_write_f32,
    "cna_cnb_byte_writer_write_f32");
}

static napi_value cnb_byte_writer_write_f64(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  double value = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer) ||
      napi_get_value_double(env, args[1], &value) != napi_ok) {
    return throw_message(env, "an f64 must be a number");
  }
  const CNA_Result result = g_api.cnb_byte_writer_write_f64(writer, value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_f64", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_f64");
}

static napi_value cnb_byte_writer_write_string(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  char* text = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer) ||
      !read_utf8(env, args[1], &text, &length)) return NULL;
  const CNA_StringView view = {text, length};
  const CNA_Result result = g_api.cnb_byte_writer_write_string(writer, view);
  free(text);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_string", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_string");
}

static napi_value cnb_byte_writer_write_bytes(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer) ||
      !read_byte_view(env, args[1], &bytes, &length)) return NULL;
  /* The length is the view's own, never a separate argument. */
  const CNA_Result result = g_api.cnb_byte_writer_write_bytes(writer, bytes, (uint64_t) length);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_bytes", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_bytes");
}

static napi_value cnb_byte_writer_write_zeros(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle writer = 0;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer) ||
      !read_bounded_u64(env, args[1], 0x7FFFFFFFu, &count,
        "a zero run must be a non-negative safe integer")) return NULL;
  const CNA_Result result = g_api.cnb_byte_writer_write_zeros(writer, count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_byte_writer_write_zeros", result);
  }
  return undefined_result(env, "cna_cnb_byte_writer_write_zeros");
}

static napi_value cnb_copy_out(
  napi_env env, StorageStreamReadFn route, CNA_Handle handle, const char* name
) {
  napi_value output;
  uint64_t required = 0;
  CNA_Result result = route(handle, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, name, result);
  }
  if (required > SIZE_MAX) return throw_message(env, "the payload exceeds the host address space");
  void* data = NULL;
  if (napi_create_buffer(env, (size_t) required, &data, &output) != napi_ok) {
    return throw_napi(env, name);
  }
  uint64_t produced = 0;
  result = route(handle, (uint8_t*) data, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    return throw_result(env, name, result);
  }
  return output;
}

static napi_value cnb_byte_writer_copy_bytes(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle writer = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  return cnb_copy_out(env, g_api.cnb_byte_writer_copy_bytes, writer,
    "cna_cnb_byte_writer_copy_bytes");
}

static napi_value cnb_byte_writer_take(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle writer = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  return cnb_copy_out(env, g_api.cnb_byte_writer_take, writer, "cna_cnb_byte_writer_take");
}

/* --- the container writer --- */

static napi_value cnb_writer_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  uint32_t assetType = 0, schemaVersion = 0;
  CNA_CnbWriterHandle writer = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      napi_get_value_uint32(env, args[0], &assetType) != napi_ok ||
      napi_get_value_uint32(env, args[1], &schemaVersion) != napi_ok) return NULL;
  const CNA_Result result = g_api.cnb_writer_create(assetType, schemaVersion, &writer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_writer_create", result);
  return make_handle(env, writer);
}

static napi_value cnb_writer_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.cnb_writer_destroy, "cna_cnb_writer_destroy");
}
static napi_value cnb_writer_clear_external_references(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.cnb_writer_clear_external_references,
    "cna_cnb_writer_clear_external_references");
}
static napi_value cnb_writer_get_schema_chunk_count(napi_env env, napi_callback_info info) {
  return storage_buffer_u64(env, info, g_api.cnb_writer_get_schema_chunk_count,
    "cna_cnb_writer_get_schema_chunk_count");
}

static napi_value cnb_writer_set_metadata(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle writer = 0;
  char* assetTypeName = NULL;
  char* contentName = NULL;
  size_t assetTypeLength = 0, contentLength = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &writer) ||
      !read_utf8(env, args[1], &assetTypeName, &assetTypeLength)) return NULL;
  if (!read_utf8(env, args[2], &contentName, &contentLength)) {
    free(assetTypeName);
    return NULL;
  }
  const CNA_StringView assetTypeView = {assetTypeName, assetTypeLength};
  const CNA_StringView contentView = {contentName, contentLength};
  const CNA_Result result = g_api.cnb_writer_set_metadata(writer, assetTypeView, contentView);
  free(assetTypeName);
  free(contentName);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_set_metadata", result);
  }
  return undefined_result(env, "cna_cnb_writer_set_metadata");
}

static napi_value cnb_writer_add_external_reference(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle writer = 0;
  CNA_CnbExternalReference reference;
  uint32_t flags = 0, expectedAssetTypeId = 0;
  char* name = NULL;
  size_t nameLength = 0;
  /* Another caller-provided versioned structure; the version is the canonical macro, asserted
     against the headers by tools/cna-abi/contract.json. */
  memset(&reference, 0, sizeof(reference));
  reference.struct_size = (uint32_t) sizeof(reference);
  reference.struct_version = CNA_CNB_EXTERNAL_REFERENCE_STRUCT_VERSION;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &writer) ||
      napi_get_value_uint32(env, args[1], &flags) != napi_ok ||
      napi_get_value_uint32(env, args[2], &expectedAssetTypeId) != napi_ok ||
      !read_utf8(env, args[3], &name, &nameLength)) return NULL;
  reference.flags = flags;
  reference.expected_asset_type_id = expectedAssetTypeId;
  const CNA_StringView view = {name, nameLength};
  const CNA_Result result = g_api.cnb_writer_add_external_reference(writer, &reference, view);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_add_external_reference", result);
  }
  return undefined_result(env, "cna_cnb_writer_add_external_reference");
}

static napi_value cnb_writer_add_chunk(napi_env env, napi_callback_info info) {
  napi_value args[5];
  CNA_Handle writer = 0;
  uint32_t type = 0, flags = 0, alignment = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      !read_handle(env, args[0], &writer) ||
      napi_get_value_uint32(env, args[1], &type) != napi_ok ||
      !read_byte_view(env, args[2], &bytes, &length) ||
      napi_get_value_uint32(env, args[3], &flags) != napi_ok ||
      napi_get_value_uint32(env, args[4], &alignment) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.cnb_writer_add_chunk(writer, type, bytes, (uint64_t) length, flags, alignment);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_add_chunk", result);
  }
  return undefined_result(env, "cna_cnb_writer_add_chunk");
}

static napi_value cnb_writer_set_compression(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle writer = 0;
  uint32_t codec = 0;
  int32_t level = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &writer) ||
      napi_get_value_uint32(env, args[1], &codec) != napi_ok ||
      napi_get_value_int32(env, args[2], &level) != napi_ok) return NULL;
  const CNA_Result result = g_api.cnb_writer_set_compression(writer, codec, level);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_set_compression", result);
  }
  return undefined_result(env, "cna_cnb_writer_set_compression");
}

static int set_u64_property(napi_env env, napi_value object, const char* name, uint64_t value) {
  napi_value number;
  return napi_create_double(env, (double) value, &number) == napi_ok &&
    napi_set_named_property(env, object, name, number) == napi_ok;
}

static napi_value cnb_writer_get_limits(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle writer = 0;
  CNA_CnbReadLimits limits;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  /* This is a caller-provided versioned structure: CNA fills the bounds, but the caller states the
     size and version first. The version is the canonical macro, which tools/cna-abi/contract.json
     asserts against the headers, rather than a literal restated here. */
  memset(&limits, 0, sizeof(limits));
  limits.struct_size = (uint32_t) sizeof(limits);
  limits.struct_version = CNA_CNB_READ_LIMITS_STRUCT_VERSION;
  const CNA_Result initialized = g_api.cnb_read_limits_init(&limits);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_read_limits_init", initialized);
  }
  const CNA_Result result = g_api.cnb_writer_get_limits(writer, &limits);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_get_limits", result);
  }
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "CNB limits");
  if (!set_u64_property(env, output, "MaxFileSize", limits.max_file_size) ||
      !set_u64_property(env, output, "MaxChunkSize", limits.max_chunk_size) ||
      !set_u64_property(env, output, "MaxTotalUncompressedSize",
        limits.max_total_uncompressed_size) ||
      !set_u64_property(env, output, "MaxChunkCount", limits.max_chunk_count) ||
      !set_u64_property(env, output, "MaxStringBytes", limits.max_string_bytes) ||
      !set_u64_property(env, output, "MaxArrayElementCount", limits.max_array_element_count) ||
      !set_u64_property(env, output, "MaxChunkAlignment", limits.max_chunk_alignment)) {
    return throw_napi(env, "CNB limits");
  }
  return output;
}

static napi_value cnb_writer_set_limits(napi_env env, napi_callback_info info) {
  napi_value args[2], entry;
  CNA_Handle writer = 0;
  CNA_CnbReadLimits limits;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  /* Seeded from CNA's current limits, so the version header and anything this ABI adds later stay
     CNA's; only the seven fields a caller can narrow are written over them. */
  memset(&limits, 0, sizeof(limits));
  limits.struct_size = (uint32_t) sizeof(limits);
  limits.struct_version = CNA_CNB_READ_LIMITS_STRUCT_VERSION;
  const CNA_Result initialized = g_api.cnb_read_limits_init(&limits);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_read_limits_init", initialized);
  }
  const CNA_Result current = g_api.cnb_writer_get_limits(writer, &limits);
  if (current != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_get_limits", current);
  }
  struct { const char* name; int wide; void* target; } fields[] = {
    {"MaxFileSize", 1, &limits.max_file_size},
    {"MaxChunkSize", 1, &limits.max_chunk_size},
    {"MaxTotalUncompressedSize", 1, &limits.max_total_uncompressed_size},
    {"MaxChunkCount", 0, &limits.max_chunk_count},
    {"MaxStringBytes", 0, &limits.max_string_bytes},
    {"MaxArrayElementCount", 0, &limits.max_array_element_count},
    {"MaxChunkAlignment", 0, &limits.max_chunk_alignment},
  };
  for (size_t index = 0; index < sizeof(fields) / sizeof(fields[0]); index += 1) {
    uint64_t value = 0;
    if (napi_get_named_property(env, args[1], fields[index].name, &entry) != napi_ok ||
        !read_bounded_u64(env, entry, fields[index].wide ? UINT64_MAX : 0xFFFFFFFFu, &value,
          "a CNB limit must be a non-negative safe integer within its width")) {
      return NULL;
    }
    if (fields[index].wide) *(uint64_t*) fields[index].target = value;
    else *(uint32_t*) fields[index].target = (uint32_t) value;
  }
  const CNA_Result result = g_api.cnb_writer_set_limits(writer, &limits);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_set_limits", result);
  }
  return undefined_result(env, "cna_cnb_writer_set_limits");
}

static napi_value cnb_writer_append_embedded_texture2d(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle writer = 0, texture = 0;
  char* label = NULL;
  size_t labelLength = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &writer) ||
      !read_handle(env, args[1], &texture) ||
      !read_utf8(env, args[2], &label, &labelLength)) return NULL;
  const CNA_StringView view = {label, labelLength};
  const CNA_Result result =
    g_api.cnb_writer_append_embedded_texture2d(writer, texture, view);
  free(label);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_writer_append_embedded_texture2d", result);
  }
  return undefined_result(env, "cna_cnb_writer_append_embedded_texture2d");
}

static napi_value cnb_writer_build(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle writer = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &writer)) return NULL;
  return cnb_copy_out(env, g_api.cnb_writer_build, writer, "cna_cnb_writer_build");
}

static napi_value cnb_make_chunk_id(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  uint32_t bytes[4] = {0, 0, 0, 0};
  if (!require_loaded(env) || !get_args(env, info, 4, args)) return NULL;
  for (size_t index = 0; index < 4; index += 1) {
    if (napi_get_value_uint32(env, args[index], &bytes[index]) != napi_ok || bytes[index] > 0xFF) {
      return throw_message(env, "a CNB chunk identifier is four bytes");
    }
  }
  CNA_CnbChunkId id = 0;
  const CNA_Result result = g_api.cnb_make_chunk_id(
    (uint8_t) bytes[0], (uint8_t) bytes[1], (uint8_t) bytes[2], (uint8_t) bytes[3], &id);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_make_chunk_id", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, id, &output), "CNB chunk identity");
  return output;
}

static napi_value cnb_texture_format_unit_bytes(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  uint32_t format = 0, unit = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &format) != napi_ok) {
    return throw_message(env, "expected a CNB texture format");
  }
  const CNA_Result result = g_api.cnb_get_texture_format_unit_bytes(format, &unit);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_get_texture_format_unit_bytes", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, unit, &output), "CNB texture unit size");
  return output;
}

static napi_value cnb_texture_format_to_surface_format(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  uint32_t format = 0, surface = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &format) != napi_ok) {
    return throw_message(env, "expected a CNB texture format");
  }
  const CNA_Result result = g_api.cnb_texture_format_to_surface_format(format, &surface);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_format_to_surface_format", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, surface, &output), "CNB surface format");
  return output;
}

static napi_value cnb_texture_level_byte_size(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  uint32_t format = 0, width = 0, height = 0, depth = 0;
  uint64_t size = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      napi_get_value_uint32(env, args[0], &format) != napi_ok ||
      napi_get_value_uint32(env, args[1], &width) != napi_ok ||
      napi_get_value_uint32(env, args[2], &height) != napi_ok ||
      napi_get_value_uint32(env, args[3], &depth) != napi_ok) {
    return throw_message(env, "expected a CNB texture format and three dimensions");
  }
  const CNA_Result result = g_api.cnb_get_texture_level_byte_size(format, width, height, depth, &size);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_get_texture_level_byte_size", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) size, &output), "CNB level size");
  return output;
}

static napi_value cnb_document_parse(napi_env env, napi_callback_info info) {
  napi_value args[2];
  const uint8_t* bytes = NULL;
  size_t length = 0;
  char* origin = NULL;
  size_t origin_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_byte_view(env, args[0], &bytes, &length) ||
      !read_utf8(env, args[1], &origin, &origin_length)) return NULL;
  const CNA_StringView view = {origin, origin_length};
  CNA_CnbDocumentHandle document = 0;
  /* Null limits asks for CNA's defaults, which is what a consumer with no reason to narrow them
     wants; a narrowed set would be a separate, deliberate API rather than a silent default. */
  const CNA_Result result = g_api.cnb_document_parse(bytes, (uint64_t) length, view, NULL, &document);
  free(origin);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_parse", result);
  return make_handle(env, document);
}

static napi_value cnb_document_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_document_destroy(document);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_destroy", result);
  return undefined_result(env, "CNB document destruction");
}

static napi_value cnb_document_get_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle document = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  uint16_t major = 0, minor = 0;
  uint32_t asset_type = 0, schema = 0;
  uint64_t chunks = 0, externals = 0;
  CNA_CnbMetadata metadata;
  memset(&metadata, 0, sizeof(metadata));
  metadata.struct_size = sizeof(metadata);
  metadata.struct_version = CNA_CNB_METADATA_STRUCT_VERSION;
  CNA_Result result = g_api.cnb_document_get_container_major(document, &major);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_container_major", result);
  result = g_api.cnb_document_get_container_minor(document, &minor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_container_minor", result);
  result = g_api.cnb_document_get_asset_type_id(document, &asset_type);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_asset_type_id", result);
  result = g_api.cnb_document_get_asset_schema_version(document, &schema);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_asset_schema_version", result);
  result = g_api.cnb_document_get_chunk_count(document, &chunks);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_chunk_count", result);
  result = g_api.cnb_document_get_external_reference_count(document, &externals);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_document_get_external_reference_count", result);
  }
  result = g_api.cnb_document_get_metadata(document, &metadata);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_metadata", result);

  napi_value origin = cnb_handle_text(
    env, document, g_api.cnb_document_get_origin_size, g_api.cnb_document_copy_origin,
    "cna_cnb_document_get_origin_size", "cna_cnb_document_copy_origin");
  if (!origin) return NULL;
  napi_value asset_type_name = cnb_handle_text(
    env, document,
    g_api.cnb_document_get_metadata_asset_type_name_size,
    g_api.cnb_document_copy_metadata_asset_type_name,
    "cna_cnb_document_get_metadata_asset_type_name_size",
    "cna_cnb_document_copy_metadata_asset_type_name");
  if (!asset_type_name) return NULL;
  napi_value content_name = cnb_handle_text(
    env, document,
    g_api.cnb_document_get_metadata_content_name_size,
    g_api.cnb_document_copy_metadata_content_name,
    "cna_cnb_document_get_metadata_content_name_size",
    "cna_cnb_document_copy_metadata_content_name");
  if (!content_name) return NULL;

  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB document info");
  if (!set_u32_property(env, output, "ContainerMajor", major) ||
      !set_u32_property(env, output, "ContainerMinor", minor) ||
      !set_u32_property(env, output, "AssetTypeId", asset_type) ||
      !set_u32_property(env, output, "AssetSchemaVersion", schema) ||
      !set_double_property(env, output, "ChunkCount", (double) chunks) ||
      !set_double_property(env, output, "ExternalReferenceCount", (double) externals) ||
      !set_bool_property(env, output, "MetadataPresent", metadata.present) ||
      !set_u32_property(env, output, "MetadataFlags", metadata.flags) ||
      napi_set_named_property(env, output, "Origin", origin) != napi_ok ||
      napi_set_named_property(env, output, "MetadataAssetTypeName", asset_type_name) != napi_ok ||
      napi_set_named_property(env, output, "MetadataContentName", content_name) != napi_ok) {
    return throw_napi(env, "CNB document info");
  }
  return output;
}

static napi_value cnb_document_get_chunk(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle document = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &document) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB document and a chunk index");
  }
  CNA_CnbChunkEntry entry;
  memset(&entry, 0, sizeof(entry));
  entry.struct_size = sizeof(entry);
  entry.struct_version = CNA_CNB_CHUNK_ENTRY_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_document_get_chunk(document, index, &entry);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_document_get_chunk", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB chunk entry");
  if (!set_double_property(env, output, "Offset", (double) entry.offset) ||
      !set_double_property(env, output, "StoredByteLength", (double) entry.stored_size) ||
      !set_double_property(env, output, "ByteLength", (double) entry.uncompressed_size) ||
      !set_u32_property(env, output, "Type", entry.type) ||
      !set_u32_property(env, output, "Flags", entry.flags) ||
      !set_u32_property(env, output, "Checksum", entry.checksum) ||
      !set_u32_property(env, output, "Compression", entry.compression) ||
      !set_u32_property(env, output, "Alignment", entry.alignment)) {
    return throw_napi(env, "CNB chunk entry");
  }
  return output;
}

static napi_value cnb_document_copy_chunk_data(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle document = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &document) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB document and a chunk index");
  }
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_document_copy_chunk_data(document, index, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_document_copy_chunk_data", result);
  }
  if (required > SIZE_MAX) return throw_message(env, "CNB chunk exceeds the Node address space");
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) return throw_message(env, "CNB chunk allocation failed");
  uint64_t copied = 0;
  result = g_api.cnb_document_copy_chunk_data(document, index, bytes, required, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_document_copy_chunk_data",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) copied, "CNB chunk copy");
  free(bytes);
  return output;
}

static napi_value cnb_document_find_all(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle document = 0;
  uint32_t type = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &document) ||
      napi_get_value_uint32(env, args[1], &type) != napi_ok) {
    return throw_message(env, "expected a CNB document and a chunk identity");
  }
  uint64_t count = 0;
  CNA_Result result = g_api.cnb_document_find_all(document, type, NULL, 0, &count);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_document_find_all", result);
  }
  if (count > SIZE_MAX / sizeof(uint64_t)) return throw_message(env, "CNB chunk list is too large");
  uint64_t* indices = count == 0 ? NULL : (uint64_t*) malloc((size_t) count * sizeof(uint64_t));
  if (count != 0 && !indices) return throw_message(env, "CNB chunk list allocation failed");
  uint64_t written = 0;
  result = g_api.cnb_document_find_all(document, type, indices, count, &written);
  if (result != CNA_RESULT_SUCCESS || written != count) {
    free(indices);
    return throw_result(
      env, "cna_cnb_document_find_all", result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_array_with_length(env, (size_t) count, &output) != napi_ok) {
    free(indices);
    return throw_napi(env, "CNB chunk list");
  }
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value entry;
    if (napi_create_double(env, (double) indices[index], &entry) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      free(indices);
      return throw_napi(env, "CNB chunk list");
    }
  }
  free(indices);
  return output;
}

static napi_value cnb_document_require_mandatory_chunks_understood(
  napi_env env, napi_callback_info info
) {
  napi_value args[2];
  CNA_Handle document = 0;
  uint32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &document) ||
      napi_get_array_length(env, args[1], &count) != napi_ok) {
    return throw_message(env, "expected a CNB document and an array of chunk identities");
  }
  CNA_CnbChunkId* known = count == 0 ? NULL : (CNA_CnbChunkId*) malloc(count * sizeof(CNA_CnbChunkId));
  if (count != 0 && !known) return throw_message(env, "CNB chunk identity allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value entry;
    uint32_t value = 0;
    if (napi_get_element(env, args[1], index, &entry) != napi_ok ||
        napi_get_value_uint32(env, entry, &value) != napi_ok) {
      free(known);
      return throw_message(env, "a CNB chunk identity is an unsigned 32-bit value");
    }
    known[index] = value;
  }
  const CNA_Result result = g_api.cnb_document_require_mandatory(document, known, count);
  free(known);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_document_require_mandatory_chunks_understood", result);
  }
  return undefined_result(env, "CNB mandatory chunk check");
}

static napi_value cnb_document_get_external_reference(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle document = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &document) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB document and an external-reference index");
  }
  CNA_CnbExternalReference reference;
  memset(&reference, 0, sizeof(reference));
  reference.struct_size = sizeof(reference);
  reference.struct_version = CNA_CNB_EXTERNAL_REFERENCE_STRUCT_VERSION;
  static const char kDiagnostic[] = "cna-ts external reference";
  const CNA_StringView what = {kDiagnostic, sizeof(kDiagnostic) - 1};
  CNA_Result result = g_api.cnb_document_get_external_reference(document, index, what, &reference);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_document_get_external_reference", result);
  }
  uint64_t length = 0;
  result = g_api.cnb_document_get_external_reference_name_size(document, index, &length);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_document_get_external_reference_name_size", result);
  }
  if (length > SIZE_MAX - 1) return throw_message(env, "CNB reference name exceeds the address space");
  char* name = (char*) malloc((size_t) length + 1);
  if (!name) return throw_message(env, "CNB reference name allocation failed");
  uint64_t copied = 0;
  result = g_api.cnb_document_copy_external_reference_name(document, index, name, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(name);
    return throw_result(
      env, "cna_cnb_document_copy_external_reference_name",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  name[length] = '\0';
  napi_value name_value;
  const napi_status status = napi_create_string_utf8(env, name, (size_t) length, &name_value);
  free(name);
  if (status != napi_ok) return throw_napi(env, "CNB reference name");
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB external reference");
  if (!set_u32_property(env, output, "Flags", reference.flags) ||
      !set_u32_property(env, output, "ExpectedAssetTypeId", reference.expected_asset_type_id) ||
      napi_set_named_property(env, output, "Name", name_value) != napi_ok) {
    return throw_napi(env, "CNB external reference");
  }
  return output;
}

static napi_value cnb_decode_texture2d(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CnbTextureDataHandle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_texture2d(document, &texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_decode_texture2d", result);
  return make_handle(env, texture);
}

static napi_value cnb_texture_data_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &texture)) return NULL;
  const CNA_Result result = g_api.cnb_texture_data_destroy(texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_texture_data_destroy", result);
  return undefined_result(env, "CNB texture destruction");
}

static napi_value cnb_texture_data_get_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &texture)) return NULL;
  CNA_CnbTextureInfo shape;
  memset(&shape, 0, sizeof(shape));
  shape.struct_size = sizeof(shape);
  shape.struct_version = CNA_CNB_TEXTURE_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_texture_data_get_info(texture, &shape);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_texture_data_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB texture info");
  if (!set_u32_property(env, output, "Width", shape.width) ||
      !set_u32_property(env, output, "Height", shape.height) ||
      !set_u32_property(env, output, "Depth", shape.depth) ||
      !set_u32_property(env, output, "FaceCount", shape.face_count) ||
      !set_u32_property(env, output, "MipCount", shape.mip_count) ||
      !set_u32_property(env, output, "RepresentationCount", shape.representation_count)) {
    return throw_napi(env, "CNB texture info");
  }
  return output;
}

static napi_value cnb_texture_data_get_level_dimensions(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle texture = 0;
  uint32_t level = 0, width = 0, height = 0, depth = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &level) != napi_ok) {
    return throw_message(env, "expected a CNB texture and a mip level");
  }
  const CNA_Result result =
    g_api.cnb_texture_data_get_level_dimensions(texture, level, &width, &height, &depth);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_data_get_level_dimensions", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB level dimensions");
  if (!set_u32_property(env, output, "Width", width) ||
      !set_u32_property(env, output, "Height", height) ||
      !set_u32_property(env, output, "Depth", depth)) {
    return throw_napi(env, "CNB level dimensions");
  }
  return output;
}

static napi_value cnb_texture_data_get_representation_format(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle texture = 0;
  uint32_t representation = 0, format = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &representation) != napi_ok) {
    return throw_message(env, "expected a CNB texture and a representation index");
  }
  const CNA_Result result =
    g_api.cnb_texture_data_get_representation_format(texture, representation, &format);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_data_get_representation_format", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, format, &output), "CNB representation format");
  return output;
}

static napi_value cnb_texture_data_get_level_count(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle texture = 0;
  uint32_t representation = 0;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &representation) != napi_ok) {
    return throw_message(env, "expected a CNB texture and a representation index");
  }
  const CNA_Result result = g_api.cnb_texture_data_get_level_count(texture, representation, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_data_get_level_count", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) count, &output), "CNB level count");
  return output;
}

static napi_value cnb_texture_data_copy_level(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle texture = 0;
  uint32_t representation = 0, level = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &representation) != napi_ok ||
      napi_get_value_uint32(env, args[2], &level) != napi_ok) {
    return throw_message(env, "expected a CNB texture, a representation and a level");
  }
  uint64_t required = 0;
  CNA_Result result =
    g_api.cnb_texture_data_copy_level(texture, representation, level, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_texture_data_copy_level", result);
  }
  if (required > SIZE_MAX) return throw_message(env, "CNB level exceeds the Node address space");
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) return throw_message(env, "CNB level allocation failed");
  uint64_t copied = 0;
  result = g_api.cnb_texture_data_copy_level(texture, representation, level, bytes, required, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_texture_data_copy_level",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) copied, "CNB level copy");
  free(bytes);
  return output;
}

static napi_value cnb_texture_data_create(napi_env env, napi_callback_info info) {
  napi_value args[5];
  uint32_t width = 0, height = 0, depth = 0, faces = 0, mips = 0;
  CNA_CnbTextureDataHandle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      napi_get_value_uint32(env, args[0], &width) != napi_ok ||
      napi_get_value_uint32(env, args[1], &height) != napi_ok ||
      napi_get_value_uint32(env, args[2], &depth) != napi_ok ||
      napi_get_value_uint32(env, args[3], &faces) != napi_ok ||
      napi_get_value_uint32(env, args[4], &mips) != napi_ok) {
    return throw_message(env, "expected five CNB texture dimensions");
  }
  const CNA_Result result =
    g_api.cnb_texture_data_create(width, height, depth, faces, mips, &texture);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_texture_data_create", result);
  return make_handle(env, texture);
}

static napi_value cnb_texture_data_create_rgba8(napi_env env, napi_callback_info info) {
  napi_value args[3];
  uint32_t width = 0, height = 0;
  const uint8_t* rgba = NULL;
  size_t length = 0;
  CNA_CnbTextureDataHandle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      napi_get_value_uint32(env, args[0], &width) != napi_ok ||
      napi_get_value_uint32(env, args[1], &height) != napi_ok ||
      !read_byte_view(env, args[2], &rgba, &length)) {
    return throw_message(env, "expected CNB texture dimensions and RGBA bytes");
  }
  const CNA_Result result =
    g_api.cnb_texture_data_create_rgba8(width, height, rgba, (uint64_t) length, &texture);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_data_create_rgba8", result);
  }
  return make_handle(env, texture);
}

static napi_value cnb_texture_data_add_representation(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle texture = 0;
  uint32_t format = 0;
  uint64_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &format) != napi_ok) {
    return throw_message(env, "expected a CNB texture and a format");
  }
  const CNA_Result result = g_api.cnb_texture_data_add_representation(texture, format, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_texture_data_add_representation", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB representation index");
  return output;
}

static napi_value cnb_texture_data_set_level(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle texture = 0;
  uint32_t representation = 0, level = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &texture) ||
      napi_get_value_uint32(env, args[1], &representation) != napi_ok ||
      napi_get_value_uint32(env, args[2], &level) != napi_ok ||
      !read_byte_view(env, args[3], &bytes, &length)) {
    return throw_message(env, "expected a CNB texture, indices and level bytes");
  }
  const CNA_Result result =
    g_api.cnb_texture_data_set_level(texture, representation, level, bytes, (uint64_t) length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_texture_data_set_level", result);
  return undefined_result(env, "CNB level write");
}

static napi_value cnb_encode_texture2d(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle texture = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &texture) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_encode_texture2d(texture, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(name);
    return throw_result(env, "cna_cnb_encode_texture2d", result);
  }
  if (required > SIZE_MAX) {
    free(name);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(name);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_texture2d(texture, view, bytes, required, &written);
  free(name);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_encode_texture2d", result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  free(bytes);
  return output;
}

static napi_value cnb_decode_sprite_font(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CnbSpriteFontDataHandle font = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_sprite_font(document, &font);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_decode_sprite_font", result);
  return make_handle(env, font);
}

static napi_value cnb_sprite_font_data_create(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  CNA_CnbSpriteFontDataHandle font = 0;
  const CNA_Result result = g_api.cnb_sprite_font_data_create(&font);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_sprite_font_data_create", result);
  return make_handle(env, font);
}

static napi_value cnb_sprite_font_data_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle font = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &font)) return NULL;
  const CNA_Result result = g_api.cnb_sprite_font_data_destroy(font);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_destroy", result);
  }
  return undefined_result(env, "CNB sprite font destruction");
}

static napi_value cnb_sprite_font_data_get_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle font = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &font)) return NULL;
  CNA_CnbSpriteFontInfo shape;
  memset(&shape, 0, sizeof(shape));
  shape.struct_size = sizeof(shape);
  shape.struct_version = CNA_CNB_SPRITE_FONT_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_sprite_font_data_get_info(font, &shape);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_get_info", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB sprite font info");
  if (!set_double_property(env, output, "GlyphCount", (double) shape.glyph_count) ||
      !set_i32_property(env, output, "LineSpacing", shape.line_spacing) ||
      !set_double_property(env, output, "Spacing", (double) shape.spacing) ||
      !set_u32_property(env, output, "DefaultCharacter", shape.default_character) ||
      !set_bool_property(env, output, "HasDefaultCharacter", shape.has_default_character)) {
    return throw_napi(env, "CNB sprite font info");
  }
  return output;
}

static napi_value cnb_sprite_font_data_set_info(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle font = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &font)) return NULL;
  CNA_CnbSpriteFontInfo shape;
  memset(&shape, 0, sizeof(shape));
  shape.struct_size = sizeof(shape);
  shape.struct_version = CNA_CNB_SPRITE_FONT_INFO_STRUCT_VERSION;
  int32_t line_spacing = 0;
  double spacing = 0;
  uint32_t default_character = 0;
  bool has_default = false;
  napi_value entry;
  if (napi_get_named_property(env, args[1], "LineSpacing", &entry) != napi_ok ||
      napi_get_value_int32(env, entry, &line_spacing) != napi_ok ||
      napi_get_named_property(env, args[1], "Spacing", &entry) != napi_ok ||
      napi_get_value_double(env, entry, &spacing) != napi_ok ||
      napi_get_named_property(env, args[1], "DefaultCharacter", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &default_character) != napi_ok ||
      napi_get_named_property(env, args[1], "HasDefaultCharacter", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &has_default) != napi_ok) {
    return throw_message(env, "expected CNB sprite font metrics");
  }
  shape.line_spacing = line_spacing;
  shape.spacing = (float) spacing;
  shape.default_character = (CNA_Char16) default_character;
  shape.has_default_character = has_default ? CNA_TRUE : CNA_FALSE;
  const CNA_Result result = g_api.cnb_sprite_font_data_set_info(font, &shape);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_set_info", result);
  }
  return undefined_result(env, "CNB sprite font metrics");
}

static int read_glyph(napi_env env, napi_value value, CNA_SpriteFontGlyph* glyph) {
  memset(glyph, 0, sizeof(*glyph));
  glyph->struct_size = sizeof(*glyph);
  glyph->struct_version = 1;
  napi_value bounds, cropping, entry;
  uint32_t character = 0;
  double kerning[3] = {0, 0, 0};
  static const char* const fields[] = {"X", "Y", "Width", "Height"};
  int32_t* const bounds_fields[] = {
    &glyph->glyph_bounds.x, &glyph->glyph_bounds.y,
    &glyph->glyph_bounds.width, &glyph->glyph_bounds.height};
  int32_t* const cropping_fields[] = {
    &glyph->cropping.x, &glyph->cropping.y, &glyph->cropping.width, &glyph->cropping.height};
  if (napi_get_named_property(env, value, "Bounds", &bounds) != napi_ok ||
      napi_get_named_property(env, value, "Cropping", &cropping) != napi_ok) {
    throw_message(env, "a CNB glyph needs Bounds and Cropping rectangles");
    return 0;
  }
  for (size_t index = 0; index < 4; index += 1) {
    if (napi_get_named_property(env, bounds, fields[index], &entry) != napi_ok ||
        napi_get_value_int32(env, entry, bounds_fields[index]) != napi_ok ||
        napi_get_named_property(env, cropping, fields[index], &entry) != napi_ok ||
        napi_get_value_int32(env, entry, cropping_fields[index]) != napi_ok) {
      throw_message(env, "a CNB glyph rectangle needs X, Y, Width and Height");
      return 0;
    }
  }
  static const char* const kerning_fields[] = {"KerningLeft", "KerningWidth", "KerningRight"};
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, value, kerning_fields[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &kerning[index]) != napi_ok) {
      throw_message(env, "a CNB glyph needs three kerning values");
      return 0;
    }
  }
  if (napi_get_named_property(env, value, "Character", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &character) != napi_ok) {
    throw_message(env, "a CNB glyph needs a UTF-16 character");
    return 0;
  }
  glyph->character = (CNA_Char16) character;
  glyph->kerning.x = (float) kerning[0];
  glyph->kerning.y = (float) kerning[1];
  glyph->kerning.z = (float) kerning[2];
  return 1;
}

static napi_value cnb_sprite_font_data_add_glyph(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle font = 0;
  CNA_SpriteFontGlyph glyph;
  uint64_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &font) || !read_glyph(env, args[1], &glyph)) return NULL;
  const CNA_Result result = g_api.cnb_sprite_font_data_add_glyph(font, &glyph, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_add_glyph", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB glyph index");
  return output;
}

static napi_value cnb_sprite_font_data_get_glyph(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle font = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &font) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB sprite font and a glyph index");
  }
  CNA_SpriteFontGlyph glyph;
  memset(&glyph, 0, sizeof(glyph));
  glyph.struct_size = sizeof(glyph);
  glyph.struct_version = 1;
  const CNA_Result result = g_api.cnb_sprite_font_data_get_glyph(font, index, &glyph);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_get_glyph", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB glyph");
  if (!set_rectangle_property(env, output, "Bounds", &glyph.glyph_bounds) ||
      !set_rectangle_property(env, output, "Cropping", &glyph.cropping) ||
      !set_u32_property(env, output, "Character", glyph.character) ||
      !set_double_property(env, output, "KerningLeft", (double) glyph.kerning.x) ||
      !set_double_property(env, output, "KerningWidth", (double) glyph.kerning.y) ||
      !set_double_property(env, output, "KerningRight", (double) glyph.kerning.z)) {
    return throw_napi(env, "CNB glyph");
  }
  return output;
}

static napi_value cnb_sprite_font_data_set_atlas(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle font = 0, atlas = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &font) || !read_handle(env, args[1], &atlas)) return NULL;
  const CNA_Result result = g_api.cnb_sprite_font_data_set_atlas(font, atlas);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_set_atlas", result);
  }
  return undefined_result(env, "CNB atlas assignment");
}

static napi_value cnb_sprite_font_data_copy_atlas(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle font = 0;
  CNA_CnbTextureDataHandle atlas = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &font)) return NULL;
  const CNA_Result result = g_api.cnb_sprite_font_data_copy_atlas(font, &atlas);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sprite_font_data_copy_atlas", result);
  }
  return make_handle(env, atlas);
}

static napi_value cnb_encode_sprite_font(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle font = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &font) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_encode_sprite_font(font, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(name);
    return throw_result(env, "cna_cnb_encode_sprite_font", result);
  }
  if (required > SIZE_MAX) {
    free(name);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(name);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_sprite_font(font, view, bytes, required, &written);
  free(name);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_encode_sprite_font", result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  free(bytes);
  return output;
}

/* --- CNA's text-input and cursor families ------------------------------------------------------ */
/*
 * Text input is the one input family that is *pushed* rather than polled, because composition is:
 * an IME sends editing updates and candidate lists between the keystroke and the committed
 * character, and none of that fits a per-frame snapshot. So this is three subscriptions, dispatched
 * the way the ContentLost ones are -- CNA raises them on the thread that called into it, so an
 * ordinary napi_call_function is correct and no threadsafe function is needed.
 *
 * The text itself is UTF-8 on CNA's side and UTF-16 code units on the committed-character route.
 * Nothing here assumes ASCII: a code unit is handed to JavaScript as a one-unit string, so a
 * surrogate pair arrives as two calls and rejoins as one character in the caller's accumulator,
 * exactly as a real IME delivers it.
 */

#define TEXT_EVENT_INPUT 0u
#define TEXT_EVENT_EDITING 1u
#define TEXT_EVENT_CANDIDATES 2u

static TextInputContext* find_text_input(CNA_Handle registration) {
  for (TextInputContext* value = g_text_input_events; value; value = value->next) {
    if (value->registration == registration) return value;
  }
  return NULL;
}

static void unlink_text_input(TextInputContext* target) {
  TextInputContext** link = &g_text_input_events;
  while (*link) {
    if (*link == target) { *link = target->next; return; }
    link = &(*link)->next;
  }
}

/* Calls the retained JavaScript function, discarding any exception rather than unwinding into C. */
static void dispatch_text_event(
  TextInputContext* context, const size_t argument_count, napi_value* arguments
) {
  if (!context) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value callback, receiver, result;
  napi_status status = napi_get_reference_value(context->env, context->callback, &callback);
  if (status == napi_ok) status = napi_get_undefined(context->env, &receiver);
  if (status == napi_ok) {
    status = napi_call_function(
      context->env, receiver, callback, argument_count, arguments, &result);
  }
  if (status == napi_pending_exception) {
    napi_value exception;
    napi_get_and_clear_last_exception(context->env, &exception);
  }
  napi_close_handle_scope(context->env, scope);
}

static void on_text_input(const uint16_t code_unit, void* raw) {
  TextInputContext* context = (TextInputContext*) raw;
  if (!context) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  /* One UTF-16 code unit as a one-unit JavaScript string. A surrogate arrives on its own and the
     caller's accumulator rejoins the pair, which is how a real IME delivers a non-BMP character. */
  napi_value argument;
  if (napi_create_string_utf16(context->env, &code_unit, 1, &argument) == napi_ok) {
    dispatch_text_event(context, 1, &argument);
  }
  napi_close_handle_scope(context->env, scope);
}

static void on_text_editing(const CNA_TextEditingEventInfo* info, void* raw) {
  TextInputContext* context = (TextInputContext*) raw;
  if (!context || !info) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value argument, text;
  if (napi_create_object(context->env, &argument) == napi_ok &&
      napi_create_string_utf8(
        context->env, info->text.data ? info->text.data : "",
        (size_t) info->text.byte_length, &text) == napi_ok &&
      napi_set_named_property(context->env, argument, "Text", text) == napi_ok &&
      set_i32(context->env, argument, "Start", info->start) &&
      set_i32(context->env, argument, "Length", info->length)) {
    dispatch_text_event(context, 1, &argument);
  }
  napi_close_handle_scope(context->env, scope);
}

static void on_text_editing_candidates(
  const CNA_TextEditingCandidatesEventInfo* info, void* raw
) {
  TextInputContext* context = (TextInputContext*) raw;
  if (!context || !info) return;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value argument, list;
  const int32_t count = info->candidate_count < 0 ? 0 : info->candidate_count;
  if (napi_create_object(context->env, &argument) == napi_ok &&
      napi_create_array_with_length(context->env, (size_t) count, &list) == napi_ok) {
    int ok = 1;
    for (int32_t index = 0; index < count && ok; index += 1) {
      const CNA_StringView view = info->candidates[index];
      napi_value entry;
      if (napi_create_string_utf8(
            context->env, view.data ? view.data : "", (size_t) view.byte_length, &entry) != napi_ok ||
          napi_set_element(context->env, list, (uint32_t) index, entry) != napi_ok) {
        ok = 0;
      }
    }
    if (ok &&
        napi_set_named_property(context->env, argument, "Candidates", list) == napi_ok &&
        set_i32(context->env, argument, "Selected", info->selected) &&
        set_bool(context->env, argument, "IsHorizontal", info->horizontal != CNA_FALSE)) {
      dispatch_text_event(context, 1, &argument);
    }
  }
  napi_close_handle_scope(context->env, scope);
}

static napi_value text_input_subscribe(napi_env env, napi_callback_info info, uint32_t kind) {
  napi_value args[1];
  napi_valuetype type;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_typeof(env, args[0], &type) != napi_ok || type != napi_function) {
    return throw_message(env, "a text-input handler must be a function");
  }
  TextInputContext* context = (TextInputContext*) calloc(1, sizeof(*context));
  if (!context) return throw_message(env, "text-input context allocation failed");
  context->env = env;
  context->kind = kind;
  if (napi_create_reference(env, args[0], 1, &context->callback) != napi_ok) {
    free(context);
    return throw_napi(env, "text-input handler retention");
  }
  CNA_Result result;
  const char* operation;
  if (kind == TEXT_EVENT_INPUT) {
    operation = "cna_text_input_subscribe_text_input_ext";
    result = g_api.text_input_subscribe_input(on_text_input, context, &context->registration);
  } else if (kind == TEXT_EVENT_EDITING) {
    operation = "cna_text_input_subscribe_text_editing_ext";
    result = g_api.text_input_subscribe_editing(on_text_editing, context, &context->registration);
  } else {
    operation = "cna_text_input_subscribe_text_editing_candidates_ext";
    result = g_api.text_input_subscribe_candidates(
      on_text_editing_candidates, context, &context->registration);
  }
  if (result != CNA_RESULT_SUCCESS) {
    napi_delete_reference(env, context->callback);
    free(context);
    return throw_result(env, operation, result);
  }
  context->next = g_text_input_events;
  g_text_input_events = context;
  return make_handle(env, context->registration);
}

static napi_value text_input_subscribe_input(napi_env env, napi_callback_info info) {
  return text_input_subscribe(env, info, TEXT_EVENT_INPUT);
}

static napi_value text_input_subscribe_editing(napi_env env, napi_callback_info info) {
  return text_input_subscribe(env, info, TEXT_EVENT_EDITING);
}

static napi_value text_input_subscribe_candidates(napi_env env, napi_callback_info info) {
  return text_input_subscribe(env, info, TEXT_EVENT_CANDIDATES);
}

static napi_value text_input_unsubscribe(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle registration = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &registration)) return NULL;
  TextInputContext* context = find_text_input(registration);
  if (!context) return throw_message(env, "no text-input registration has that handle");
  const CNA_Result result = g_api.text_input_unsubscribe(registration);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_unsubscribe_ext", result);
  }
  unlink_text_input(context);
  napi_delete_reference(env, context->callback);
  free(context);
  return undefined_result(env, "text-input unsubscribe result");
}

static napi_value text_input_raise_input(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  uint32_t code_unit = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &code_unit) != napi_ok || code_unit > 0xFFFF) {
    return throw_message(env, "expected a game and a UTF-16 code unit");
  }
  const CNA_Result result = g_api.text_input_raise_input(game, (uint16_t) code_unit);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_raise_text_input_ext", result);
  }
  return undefined_result(env, "text-input injection");
}

static napi_value text_input_raise_editing(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle game = 0;
  char* text = NULL;
  size_t length = 0;
  int32_t start = 0, span = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &game) ||
      !read_utf8(env, args[1], &text, &length)) return NULL;
  if (napi_get_value_int32(env, args[2], &start) != napi_ok ||
      napi_get_value_int32(env, args[3], &span) != napi_ok) {
    free(text);
    return throw_message(env, "expected a start and a length");
  }
  const CNA_StringView view = {text, length};
  const CNA_Result result = g_api.text_input_raise_editing(game, view, start, span);
  free(text);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_raise_text_editing_ext", result);
  }
  return undefined_result(env, "text-editing injection");
}

static napi_value text_input_raise_candidates(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle game = 0;
  uint32_t count = 0;
  int32_t selected = 0;
  bool horizontal = false, is_array = false;
  char** texts = NULL;
  CNA_StringView* views = NULL;
  napi_value output = NULL;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &game) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, args[1], &count) != napi_ok ||
      napi_get_value_int32(env, args[2], &selected) != napi_ok ||
      napi_get_value_bool(env, args[3], &horizontal) != napi_ok) {
    return throw_message(env, "expected a game, a candidate array, a selection and an orientation");
  }
  if (count > UINT32_C(4096)) {
    return throw_message(env, "a candidate list carries at most 4096 entries");
  }
  texts = (char**) calloc(count == 0 ? 1 : count, sizeof(char*));
  views = (CNA_StringView*) calloc(count == 0 ? 1 : count, sizeof(CNA_StringView));
  if (!texts || !views) {
    free(texts);
    free(views);
    return throw_message(env, "candidate allocation failed");
  }
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value entry;
    size_t length = 0;
    if (napi_get_element(env, args[1], index, &entry) != napi_ok ||
        !read_utf8(env, entry, &texts[index], &length)) {
      output = NULL;
      goto release;
    }
    views[index].data = texts[index];
    views[index].byte_length = length;
  }
  {
    const CNA_Result result = g_api.text_input_raise_candidates(
      game, views, (int32_t) count, selected, horizontal ? CNA_TRUE : CNA_FALSE);
    if (result != CNA_RESULT_SUCCESS) {
      for (uint32_t index = 0; index < count; index += 1) free(texts[index]);
      free(texts);
      free(views);
      return throw_result(env, "cna_text_input_raise_text_editing_candidates_ext", result);
    }
    output = undefined_result(env, "candidate injection");
  }
release:
  for (uint32_t index = 0; index < count; index += 1) free(texts[index]);
  free(texts);
  free(views);
  return output;
}

static napi_value text_input_start(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle game = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.text_input_start(game);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_text_input_start_ext", result);
  return undefined_result(env, "text input start");
}

static napi_value text_input_start_with_type(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  uint32_t type = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &type) != napi_ok) {
    return throw_message(env, "expected a game and a text-input type");
  }
  const CNA_Result result = g_api.text_input_start_with_type(game, type);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_start_with_type_ext", result);
  }
  return undefined_result(env, "text input start");
}

static napi_value text_input_stop(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle game = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.text_input_stop(game);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_text_input_stop_ext", result);
  return undefined_result(env, "text input stop");
}

static napi_value text_input_is_active(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  CNA_Bool active = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.text_input_is_active(game, &active);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_is_active_ext", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, active != CNA_FALSE, &output), "text input state");
  return output;
}

static napi_value text_input_is_screen_keyboard_shown(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  CNA_Bool shown = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.text_input_is_screen_keyboard_shown(game, &shown);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_is_screen_keyboard_shown_ext", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, shown != CNA_FALSE, &output), "screen keyboard state");
  return output;
}

static napi_value text_input_set_rectangle(napi_env env, napi_callback_info info) {
  napi_value args[5];
  CNA_Handle game = 0;
  CNA_Rectangle rectangle;
  memset(&rectangle, 0, sizeof(rectangle));
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_int32(env, args[1], &rectangle.x) != napi_ok ||
      napi_get_value_int32(env, args[2], &rectangle.y) != napi_ok ||
      napi_get_value_int32(env, args[3], &rectangle.width) != napi_ok ||
      napi_get_value_int32(env, args[4], &rectangle.height) != napi_ok) {
    return throw_message(env, "expected a game and a rectangle");
  }
  const CNA_Result result = g_api.text_input_set_rectangle(game, rectangle);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_set_input_rectangle_ext", result);
  }
  return undefined_result(env, "input rectangle");
}

static napi_value text_input_reset_for_tests(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle game = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.text_input_reset_for_tests(game);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_text_input_reset_for_tests_ext", result);
  }
  return undefined_result(env, "text input reset");
}

/* ---- the mouse cursor ------------------------------------------------------------------------ */
/*
 * Two ways to make one and one way to use it. A stock cursor and a texture-built cursor are both
 * **owned handles**: CNA distinguishes closing a cursor from releasing its handle, exactly as it
 * does for a haptic device, so disposal does both.
 */

static napi_value mouse_cursor_get_stock(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0;
  uint32_t stock = 0;
  CNA_MouseCursorHandle cursor = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &stock) != napi_ok) {
    return throw_message(env, "expected a game and a stock cursor identity");
  }
  const CNA_Result result = g_api.mouse_cursor_get_stock(game, stock, &cursor);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_mouse_cursor_get_stock_ext", result);
  }
  return make_handle(env, cursor);
}

static napi_value mouse_cursor_create_from_texture(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle game = 0, texture = 0;
  int32_t x = 0, y = 0;
  CNA_MouseCursorHandle cursor = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &game) || !read_handle(env, args[1], &texture) ||
      napi_get_value_int32(env, args[2], &x) != napi_ok ||
      napi_get_value_int32(env, args[3], &y) != napi_ok) {
    return throw_message(env, "expected a game, a texture and an origin");
  }
  const CNA_Result result = g_api.mouse_cursor_create_from_texture(game, texture, x, y, &cursor);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_mouse_cursor_create_from_texture2d", result);
  }
  return make_handle(env, cursor);
}

static napi_value mouse_cursor_dispose(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle cursor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &cursor)) return NULL;
  const CNA_Result result = g_api.mouse_cursor_dispose(cursor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_cursor_dispose", result);
  return undefined_result(env, "cursor close");
}

static napi_value mouse_cursor_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle cursor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &cursor)) return NULL;
  const CNA_Result result = g_api.mouse_cursor_destroy(cursor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_cursor_destroy", result);
  return undefined_result(env, "cursor release");
}

static napi_value mouse_set_cursor(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle game = 0, cursor = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) || !read_handle(env, args[1], &cursor)) return NULL;
  const CNA_Result result = g_api.mouse_set_cursor(game, cursor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_mouse_set_cursor_ext", result);
  return undefined_result(env, "cursor selection");
}

/* --- CNA's extended input families: joysticks and haptics ------------------------------------- */
/*
 * Two families XNA never had, and two different ownership answers.
 *
 * A **joystick state** is a snapshot, like a keyboard's: `cna_joysticks_capture_state` hands back a
 * handle, but the only useful thing to do with it is read its four arrays, so this bridge reads
 * them and releases the handle in the same call. Nothing escapes, and there is nothing for a caller
 * to leak. A **haptic device** is the opposite: it is an open device with a lifetime, so its handle
 * does escape and `Dispose` is real.
 *
 * These deliberately do not become XNA `GamePad`. A joystick's axes are raw and its identity is
 * SDL's, so folding it into `GamePadState` would either lose the extra axes or invent a mapping.
 */

static napi_value joysticks_get_count(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.joysticks_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_joysticks_get_count", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, count, &output), "joystick count");
  return output;
}

/* `(game, index) -> string`, sized then copied. Shared by three joystick and haptic routes. */
static napi_value game_index_text(
  napi_env env,
  napi_callback_info info,
  GameU32IndexSizeFn size_fn,
  GameU32IndexCopyTextFn copy_fn,
  const char* const operation
) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a game and an index");
  }
  uint64_t required = 0;
  CNA_Result result = size_fn(game, index, &required);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (required > SIZE_MAX - 1) return throw_message(env, "text exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "text allocation failed");
  uint64_t produced = 0;
  result = copy_fn(game, index, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, operation, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, operation);
  }
  free(text);
  return output;
}

static napi_value joysticks_get_name_at(napi_env env, napi_callback_info info) {
  return game_index_text(
    env, info, g_api.joysticks_get_name_size_at, g_api.joysticks_copy_name_at,
    "cna_joysticks_copy_name_at");
}

static napi_value joysticks_get_capabilities_name(napi_env env, napi_callback_info info) {
  return game_index_text(
    env, info, g_api.joysticks_get_capabilities_name_size, g_api.joysticks_copy_capabilities_name,
    "cna_joysticks_copy_capabilities_name");
}

static napi_value joysticks_get_capabilities_guid(napi_env env, napi_callback_info info) {
  return game_index_text(
    env, info, g_api.joysticks_get_capabilities_guid_size, g_api.joysticks_copy_capabilities_guid,
    "cna_joysticks_copy_capabilities_guid");
}

static napi_value haptics_get_name_at(napi_env env, napi_callback_info info) {
  return game_index_text(
    env, info, g_api.haptics_get_name_size_at, g_api.haptics_copy_name_at,
    "cna_haptics_copy_name_at");
}

static napi_value joysticks_get_info_at(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a game and a joystick index");
  }
  CNA_JoystickInfo value;
  // This family publishes no version macro; `cna_joystick_info_init` is the canonical way to
  // stamp struct_size and struct_version, so it is what gets called rather than a literal.
  CNA_Result result = g_api.joystick_info_init(&value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_joystick_info_init", result);
  result = g_api.joysticks_get_info_at(game, index, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_joysticks_get_info_at", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "joystick info");
  if (!set_u32(env, output, "Id", value.id) || !set_u32(env, output, "Type", value.type)) {
    return throw_napi(env, "joystick info");
  }
  return output;
}

static napi_value joysticks_get_capabilities(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  uint32_t id = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &id) != napi_ok) {
    return throw_message(env, "expected a game and a joystick identifier");
  }
  CNA_JoystickCapabilities value;
  CNA_Result result = g_api.joystick_capabilities_init(&value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_joystick_capabilities_init", result);
  }
  result = g_api.joysticks_get_capabilities(game, id, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_joysticks_get_capabilities", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "joystick capabilities");
  if (!set_i32(env, output, "AxisCount", value.axis_count) ||
      !set_i32(env, output, "ButtonCount", value.button_count) ||
      !set_i32(env, output, "HatCount", value.hat_count) ||
      !set_i32(env, output, "BallCount", value.ball_count) ||
      !set_u32(env, output, "Type", value.type) ||
      !set_u32(env, output, "PowerState", value.power_state) ||
      !set_i32(env, output, "PowerPercent", value.power_percent) ||
      !set_bool(env, output, "IsConnected", value.is_connected != CNA_FALSE)) {
    return throw_napi(env, "joystick capabilities");
  }
  return output;
}

/*
 * Captures a joystick's four arrays and releases the state handle in the same call.
 *
 * A captured state is a snapshot with no operations of its own beyond reading it, so keeping the
 * handle alive would be a lifetime a caller has to manage for nothing. Every array is sized from
 * its own count route rather than from the capabilities, because a device can change between the
 * two calls and the state is what the arrays actually are.
 */
static napi_value joysticks_capture_state(napi_env env, napi_callback_info info) {
  napi_value args[2], output = NULL, axes = NULL, buttons = NULL, hats = NULL, balls = NULL;
  CNA_Handle game = 0;
  uint32_t id = 0;
  CNA_JoystickStateHandle state = 0;
  int16_t* axis_values = NULL;
  CNA_Bool* button_values = NULL;
  CNA_JoystickHatPosition* hat_values = NULL;
  CNA_Point* ball_values = NULL;
  uint32_t axis_count = 0, button_count = 0, hat_count = 0, ball_count = 0;
  uint64_t produced = 0;
  CNA_Result result;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &id) != napi_ok) {
    return throw_message(env, "expected a game and a joystick identifier");
  }
  result = g_api.joysticks_capture_state(game, id, &state);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_joysticks_capture_state", result);
  }
  result = g_api.joystick_state_get_axis_count(state, &axis_count);
  if (result == CNA_RESULT_SUCCESS) result = g_api.joystick_state_get_button_count(state, &button_count);
  if (result == CNA_RESULT_SUCCESS) result = g_api.joystick_state_get_hat_count(state, &hat_count);
  if (result == CNA_RESULT_SUCCESS) result = g_api.joystick_state_get_ball_count(state, &ball_count);
  if (result != CNA_RESULT_SUCCESS) goto fail;
  /* Any of the four may legitimately be zero; malloc(0) is avoided rather than special-cased. */
  axis_values = (int16_t*) calloc(axis_count == 0 ? 1 : axis_count, sizeof(int16_t));
  button_values = (CNA_Bool*) calloc(button_count == 0 ? 1 : button_count, sizeof(CNA_Bool));
  hat_values = (CNA_JoystickHatPosition*) calloc(
    hat_count == 0 ? 1 : hat_count, sizeof(CNA_JoystickHatPosition));
  ball_values = (CNA_Point*) calloc(ball_count == 0 ? 1 : ball_count, sizeof(CNA_Point));
  if (!axis_values || !button_values || !hat_values || !ball_values) {
    output = throw_message(env, "joystick state allocation failed");
    goto release;
  }
  if (axis_count != 0) {
    result = g_api.joystick_state_copy_axes(state, axis_values, axis_count, &produced);
    if (result != CNA_RESULT_SUCCESS) goto fail;
  }
  if (button_count != 0) {
    result = g_api.joystick_state_copy_buttons(state, button_values, button_count, &produced);
    if (result != CNA_RESULT_SUCCESS) goto fail;
  }
  if (hat_count != 0) {
    result = g_api.joystick_state_copy_hats(state, hat_values, hat_count, &produced);
    if (result != CNA_RESULT_SUCCESS) goto fail;
  }
  if (ball_count != 0) {
    result = g_api.joystick_state_copy_balls(state, ball_values, ball_count, &produced);
    if (result != CNA_RESULT_SUCCESS) goto fail;
  }
  if (napi_create_object(env, &output) != napi_ok ||
      napi_create_array_with_length(env, axis_count, &axes) != napi_ok ||
      napi_create_array_with_length(env, button_count, &buttons) != napi_ok ||
      napi_create_array_with_length(env, hat_count, &hats) != napi_ok ||
      napi_create_array_with_length(env, ball_count, &balls) != napi_ok) {
    output = throw_napi(env, "joystick state");
    goto release;
  }
  for (uint32_t index = 0; index < axis_count; index += 1) {
    napi_value entry;
    if (napi_create_int32(env, axis_values[index], &entry) != napi_ok ||
        napi_set_element(env, axes, index, entry) != napi_ok) {
      output = throw_napi(env, "joystick axes");
      goto release;
    }
  }
  for (uint32_t index = 0; index < button_count; index += 1) {
    napi_value entry;
    if (napi_get_boolean(env, button_values[index] != CNA_FALSE, &entry) != napi_ok ||
        napi_set_element(env, buttons, index, entry) != napi_ok) {
      output = throw_napi(env, "joystick buttons");
      goto release;
    }
  }
  for (uint32_t index = 0; index < hat_count; index += 1) {
    napi_value entry;
    if (napi_create_uint32(env, hat_values[index], &entry) != napi_ok ||
        napi_set_element(env, hats, index, entry) != napi_ok) {
      output = throw_napi(env, "joystick hats");
      goto release;
    }
  }
  for (uint32_t index = 0; index < ball_count; index += 1) {
    napi_value entry;
    if (napi_create_object(env, &entry) != napi_ok ||
        !set_i32(env, entry, "X", ball_values[index].x) ||
        !set_i32(env, entry, "Y", ball_values[index].y) ||
        napi_set_element(env, balls, index, entry) != napi_ok) {
      output = throw_napi(env, "joystick balls");
      goto release;
    }
  }
  if (napi_set_named_property(env, output, "Axes", axes) != napi_ok ||
      napi_set_named_property(env, output, "Buttons", buttons) != napi_ok ||
      napi_set_named_property(env, output, "Hats", hats) != napi_ok ||
      napi_set_named_property(env, output, "Balls", balls) != napi_ok) {
    output = throw_napi(env, "joystick state");
  }
release:
  free(axis_values);
  free(button_values);
  free(hat_values);
  free(ball_values);
  g_api.joystick_state_destroy(state);
  return output;
fail:
  free(axis_values);
  free(button_values);
  free(hat_values);
  free(ball_values);
  g_api.joystick_state_destroy(state);
  return throw_result(env, "cna_joystick_state", result);
}

static napi_value haptics_get_count(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.haptics_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_haptics_get_count", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, count, &output), "haptic count");
  return output;
}

static napi_value haptics_get_id_at(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  uint32_t index = 0, id = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a game and a haptic index");
  }
  const CNA_Result result = g_api.haptics_get_id_at(game, index, &id);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_haptics_get_id_at", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, id, &output), "haptic identifier");
  return output;
}

static napi_value haptics_is_joystick_haptic(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  uint32_t id = 0;
  CNA_Bool haptic = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &id) != napi_ok) {
    return throw_message(env, "expected a game and a joystick identifier");
  }
  const CNA_Result result = g_api.haptics_get_is_joystick_haptic(game, id, &haptic);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_haptics_get_is_joystick_haptic", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, haptic != CNA_FALSE, &output), "haptic answer");
  return output;
}

static napi_value haptics_open_device(
  napi_env env, napi_callback_info info, GameIndexHandleOutFn function, const char* operation
) {
  napi_value args[2];
  CNA_Handle game = 0;
  uint32_t id = 0;
  CNA_HapticDeviceHandle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      napi_get_value_uint32(env, args[1], &id) != napi_ok) {
    return throw_message(env, "expected a game and an identifier");
  }
  const CNA_Result result = function(game, id, &device);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return make_handle(env, device);
}

static napi_value haptics_open(napi_env env, napi_callback_info info) {
  return haptics_open_device(env, info, g_api.haptics_open, "cna_haptics_open");
}

static napi_value haptics_open_from_joystick(napi_env env, napi_callback_info info) {
  return haptics_open_device(
    env, info, g_api.haptics_open_from_joystick, "cna_haptics_open_from_joystick");
}

static napi_value haptic_device_get_capabilities(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  CNA_HapticCapabilities value;
  CNA_Result result = g_api.haptic_capabilities_init(&value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_haptic_capabilities_init", result);
  }
  result = g_api.haptic_device_get_capabilities(device, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_haptic_device_get_capabilities", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "haptic capabilities");
  if (!set_u32(env, output, "Features", value.features) ||
      !set_i32(env, output, "AxisCount", value.axis_count) ||
      !set_i32(env, output, "MaxEffects", value.max_effects) ||
      !set_i32(env, output, "MaxEffectsPlaying", value.max_effects_playing) ||
      !set_bool(env, output, "IsOpen", value.is_open != CNA_FALSE) ||
      !set_bool(env, output, "RumbleSupported", value.rumble_supported != CNA_FALSE)) {
    return throw_napi(env, "haptic capabilities");
  }
  return output;
}

static napi_value haptic_device_get_name(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.haptic_device_get_name_size(device, &required);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_haptic_device_get_name_size", result);
  }
  if (required > SIZE_MAX - 1) return throw_message(env, "haptic name exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "haptic name allocation failed");
  uint64_t produced = 0;
  result = g_api.haptic_device_copy_name(device, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(
      env, "cna_haptic_device_copy_name",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, "haptic name");
  }
  free(text);
  return output;
}

static napi_value haptic_device_bool_out(
  napi_env env, napi_callback_info info, HandleBoolOutFn function, const char* operation
) {
  napi_value args[1], output;
  CNA_Handle device = 0;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = function(device, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value != CNA_FALSE, &output), operation);
  return output;
}

static napi_value haptic_device_get_is_open(napi_env env, napi_callback_info info) {
  return haptic_device_bool_out(
    env, info, g_api.haptic_device_get_is_open, "cna_haptic_device_get_is_open");
}

static napi_value haptic_device_init_rumble(napi_env env, napi_callback_info info) {
  return haptic_device_bool_out(
    env, info, g_api.haptic_device_init_rumble, "cna_haptic_device_init_rumble");
}

static napi_value haptic_device_stop_rumble(napi_env env, napi_callback_info info) {
  return haptic_device_bool_out(
    env, info, g_api.haptic_device_stop_rumble, "cna_haptic_device_stop_rumble");
}

static napi_value haptic_device_play_rumble(napi_env env, napi_callback_info info) {
  napi_value args[3], output;
  CNA_Handle device = 0;
  double strength = 0;
  uint32_t length = 0;
  CNA_Bool applied = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_double(env, args[1], &strength) != napi_ok ||
      napi_get_value_uint32(env, args[2], &length) != napi_ok) {
    return throw_message(env, "expected a haptic device, a strength and a length");
  }
  const CNA_Result result =
    g_api.haptic_device_play_rumble(device, (float) strength, length, &applied);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_haptic_device_play_rumble", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, applied != CNA_FALSE, &output), "rumble answer");
  return output;
}

static napi_value haptic_device_set_gain(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  int32_t gain = 0;
  CNA_Bool applied = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &gain) != napi_ok) {
    return throw_message(env, "expected a haptic device and a gain");
  }
  const CNA_Result result = g_api.haptic_device_set_gain(device, gain, &applied);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_haptic_device_set_gain", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, applied != CNA_FALSE, &output), "gain answer");
  return output;
}

static napi_value haptic_device_dispose(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.haptic_device_dispose(device);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_haptic_device_dispose", result);
  return undefined_result(env, "haptic device close");
}

static napi_value haptic_device_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.haptic_device_destroy(device);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_haptic_device_destroy", result);
  return undefined_result(env, "haptic device release");
}

/* --- CNB build-time importers ------------------------------------------------------------------ */
/*
 * The three routes `cnb.h` provides for turning an ordinary source file into a compiled asset, and
 * the only ones in this bridge that touch a filesystem path. They exist for `cna-ts-content`, the
 * separate build-time package, and they are shaped so that **no handle crosses that package
 * boundary**: each imports, reads the description, encodes and releases in one call, and returns
 * the finished `.cnb` bytes beside the description. A build tool produces bytes; a runtime reads
 * bytes. That is CNB's own contract and it is also the safest seam available.
 */

/* Encodes an imported texture and releases it, whatever happens. */
static napi_value finish_texture_import(
  napi_env env,
  CNA_CnbTextureDataHandle texture,
  const char* const content_name,
  const size_t content_length
) {
  napi_value output = NULL;
  uint8_t* bytes = NULL;
  CNA_CnbTextureInfo info;
  memset(&info, 0, sizeof(info));
  info.struct_size = (uint32_t) sizeof(info);
  info.struct_version = CNA_CNB_TEXTURE_INFO_STRUCT_VERSION;
  CNA_Result result = g_api.cnb_texture_data_get_info(texture, &info);
  if (result != CNA_RESULT_SUCCESS) {
    g_api.cnb_texture_data_destroy(texture);
    return throw_result(env, "cna_cnb_texture_data_get_info", result);
  }
  const CNA_StringView view = {content_name, content_length};
  uint64_t required = 0;
  result = g_api.cnb_encode_texture2d(texture, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) goto fail;
  if (required > SIZE_MAX) {
    g_api.cnb_texture_data_destroy(texture);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    g_api.cnb_texture_data_destroy(texture);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_texture2d(texture, view, bytes, required, &written);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    if (result == CNA_RESULT_SUCCESS) result = CNA_RESULT_INTERNAL;
    goto fail;
  }
  g_api.cnb_texture_data_destroy(texture);
  if (napi_create_object(env, &output) != napi_ok) {
    free(bytes);
    return throw_napi(env, "CNB import result");
  }
  {
    napi_value image = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
    free(bytes);
    if (!image) return NULL;
    if (napi_set_named_property(env, output, "Image", image) != napi_ok ||
        !set_u32(env, output, "Width", info.width) ||
        !set_u32(env, output, "Height", info.height) ||
        !set_u32(env, output, "Depth", info.depth) ||
        !set_u32(env, output, "FaceCount", info.face_count) ||
        !set_u32(env, output, "MipCount", info.mip_count) ||
        !set_u32(env, output, "RepresentationCount", info.representation_count)) {
      return throw_napi(env, "CNB import result");
    }
  }
  return output;
fail:
  free(bytes);
  g_api.cnb_texture_data_destroy(texture);
  return throw_result(env, "cna_cnb_encode_texture2d", result);
}

static napi_value cnb_import_image_as_texture2d(napi_env env, napi_callback_info info) {
  napi_value args[3];
  char* path = NULL;
  char* content = NULL;
  size_t path_length = 0, content_length = 0;
  CNA_CnbImageImportOptions options;
  CNA_CnbTextureDataHandle texture = 0;
  bool has_color_key = false;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_utf8(env, args[0], &path, &path_length)) return NULL;
  memset(&options, 0, sizeof(options));
  options.struct_size = (uint32_t) sizeof(options);
  options.struct_version = CNA_CNB_IMAGE_IMPORT_OPTIONS_STRUCT_VERSION;
  {
    napi_valuetype kind = napi_undefined;
    if (napi_typeof(env, args[1], &kind) != napi_ok) {
      free(path);
      return throw_napi(env, "colour-key inspection");
    }
    has_color_key = kind != napi_null && kind != napi_undefined;
  }
  if (has_color_key) {
    float key[3];
    if (!read_float_array(env, args[1], key, 3, "a colour key needs three components")) {
      free(path);
      return NULL;
    }
    for (size_t index = 0; index < 3; index += 1) {
      const float value = key[index];
      if (!(value >= 0.0f && value <= 255.0f)) {
        free(path);
        return throw_message(env, "a colour-key component must be between 0 and 255");
      }
      options.color_key[index] = (uint8_t) value;
    }
    options.has_color_key = CNA_TRUE;
  }
  if (!read_utf8(env, args[2], &content, &content_length)) {
    free(path);
    return NULL;
  }
  {
    const CNA_StringView view = {path, path_length};
    const CNA_Result result = g_api.cnb_import_image_as_texture2d(view, &options, &texture);
    free(path);
    if (result != CNA_RESULT_SUCCESS) {
      free(content);
      return throw_result(env, "cna_cnb_import_image_as_texture2d", result);
    }
  }
  {
    napi_value output = finish_texture_import(env, texture, content, content_length);
    free(content);
    return output;
  }
}

static napi_value cnb_import_dds_as_texture_cube(napi_env env, napi_callback_info info) {
  napi_value args[2];
  char* path = NULL;
  char* content = NULL;
  size_t path_length = 0, content_length = 0;
  CNA_CnbTextureDataHandle texture = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_utf8(env, args[0], &path, &path_length)) return NULL;
  if (!read_utf8(env, args[1], &content, &content_length)) {
    free(path);
    return NULL;
  }
  {
    const CNA_StringView view = {path, path_length};
    const CNA_Result result = g_api.cnb_import_dds_as_texture_cube(view, &texture);
    free(path);
    if (result != CNA_RESULT_SUCCESS) {
      free(content);
      return throw_result(env, "cna_cnb_import_dds_as_texture_cube", result);
    }
  }
  {
    napi_value output = finish_texture_import(env, texture, content, content_length);
    free(content);
    return output;
  }
}

static napi_value cnb_import_wav_as_sound_effect(napi_env env, napi_callback_info info) {
  napi_value args[2], output = NULL;
  char* path = NULL;
  char* content = NULL;
  size_t path_length = 0, content_length = 0;
  CNA_CnbSoundEffectDataHandle sound = 0;
  uint8_t* bytes = NULL;
  CNA_CnbSoundEffectInfo description;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_utf8(env, args[0], &path, &path_length)) return NULL;
  if (!read_utf8(env, args[1], &content, &content_length)) {
    free(path);
    return NULL;
  }
  {
    const CNA_StringView view = {path, path_length};
    const CNA_Result result = g_api.cnb_import_wav_as_sound_effect(view, &sound);
    free(path);
    if (result != CNA_RESULT_SUCCESS) {
      free(content);
      return throw_result(env, "cna_cnb_import_wav_as_sound_effect", result);
    }
  }
  memset(&description, 0, sizeof(description));
  description.struct_size = (uint32_t) sizeof(description);
  description.struct_version = CNA_CNB_SOUND_EFFECT_INFO_STRUCT_VERSION;
  CNA_Result result = g_api.cnb_sound_effect_data_get_info(sound, &description);
  if (result != CNA_RESULT_SUCCESS) {
    g_api.cnb_sound_effect_data_destroy(sound);
    free(content);
    return throw_result(env, "cna_cnb_sound_effect_data_get_info", result);
  }
  {
    const CNA_StringView view = {content, content_length};
    uint64_t required = 0;
    result = g_api.cnb_encode_sound_effect(sound, view, NULL, 0, &required);
    if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) goto fail;
    if (required > SIZE_MAX) {
      g_api.cnb_sound_effect_data_destroy(sound);
      free(content);
      return throw_message(env, "CNB image exceeds the Node address space");
    }
    bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
    if (required != 0 && !bytes) {
      g_api.cnb_sound_effect_data_destroy(sound);
      free(content);
      return throw_message(env, "CNB image allocation failed");
    }
    uint64_t written = 0;
    result = g_api.cnb_encode_sound_effect(sound, view, bytes, required, &written);
    if (result != CNA_RESULT_SUCCESS || written != required) {
      if (result == CNA_RESULT_SUCCESS) result = CNA_RESULT_INTERNAL;
      goto fail;
    }
    g_api.cnb_sound_effect_data_destroy(sound);
    free(content);
    if (napi_create_object(env, &output) != napi_ok) {
      free(bytes);
      return throw_napi(env, "CNB import result");
    }
    napi_value image = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
    free(bytes);
    if (!image) return NULL;
    if (napi_set_named_property(env, output, "Image", image) != napi_ok ||
        !set_u32(env, output, "Format", description.format) ||
        !set_u32(env, output, "SampleRate", description.sample_rate) ||
        !set_u32(env, output, "Channels", description.channels) ||
        !set_u32(env, output, "FrameCount", description.frame_count) ||
        !set_u32(env, output, "LoopStart", description.loop_start) ||
        !set_u32(env, output, "LoopLength", description.loop_length)) {
      return throw_napi(env, "CNB import result");
    }
    return output;
  }
fail:
  free(bytes);
  g_api.cnb_sound_effect_data_destroy(sound);
  free(content);
  return throw_result(env, "cna_cnb_encode_sound_effect", result);
}

/*
 * Whether this process has already opened a CNA library. `loadLibrary` refuses a second one, and
 * the runtime package and the build-time package share this module through Node's require cache --
 * so a build script that also runs a game must be able to ask rather than guess.
 */
/* --- the `.cnj` compile front end ---------------------------------------------------------- */
/*
 * CNA's own source format for content: a small JSON document naming an asset type and either
 * carrying its values inline or pointing at binary sidecars. Compiling one produces a `.cnb` image
 * plus the two lists a build system needs -- what the compiler absorbed, and what it recorded as
 * an external reference -- which is why the result is a handle rather than just bytes.
 *
 * This is a build-time route: it takes filesystem paths, so it belongs to `cna-ts-content` and not
 * to the runtime package. It follows the same rule as the importers beside it -- the whole
 * operation happens inside one native call and the result is released before returning, so the
 * build-time package owns no native lifetime and has nothing to leak.
 */

/** One `index`-addressed string on the compile result, read with CNB's two-pass shape. */
static int cnj_copy_indexed_string(
  napi_env env,
  CNA_CnjToCnbResultHandle result,
  uint64_t index,
  CnjIndexSizeFn sizeRoute,
  CnjIndexCopyFn copyRoute,
  const char* operation,
  napi_value* out
) {
  uint64_t required = 0;
  CNA_Result status = sizeRoute(result, index, &required);
  if (status != CNA_RESULT_SUCCESS) {
    throw_result(env, operation, status);
    return 0;
  }
  if (required > SIZE_MAX) {
    throw_message(env, "a compile result path exceeds the host address space");
    return 0;
  }
  char* text = required == 0 ? NULL : (char*) malloc((size_t) required);
  if (required != 0 && !text) {
    throw_message(env, "compile-result path allocation failed");
    return 0;
  }
  uint64_t produced = 0;
  status = copyRoute(result, index, text, required, &produced);
  if (status != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    throw_result(env, operation, status);
    return 0;
  }
  const napi_status created =
    napi_create_string_utf8(env, text ? text : "", (size_t) required, out);
  free(text);
  if (created != napi_ok) {
    throw_napi(env, operation);
    return 0;
  }
  return 1;
}

/** The list of paths one of the two indexed families reports. */
static int cnj_string_list(
  napi_env env,
  CNA_CnjToCnbResultHandle result,
  HandleU64OutFn countRoute,
  CnjIndexSizeFn sizeRoute,
  CnjIndexCopyFn copyRoute,
  const char* operation,
  napi_value* out
) {
  uint64_t count = 0;
  const CNA_Result status = countRoute(result, &count);
  if (status != CNA_RESULT_SUCCESS) {
    throw_result(env, operation, status);
    return 0;
  }
  if (count > UINT32_MAX) {
    throw_message(env, "a compile result lists more paths than can be enumerated");
    return 0;
  }
  if (napi_create_array_with_length(env, (size_t) count, out) != napi_ok) {
    throw_napi(env, operation);
    return 0;
  }
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value element;
    if (!cnj_copy_indexed_string(env, result, index, sizeRoute, copyRoute, operation, &element) ||
        napi_set_element(env, *out, (uint32_t) index, element) != napi_ok) {
      return 0;
    }
  }
  return 1;
}

static napi_value cnb_compile_cnj(napi_env env, napi_callback_info info) {
  napi_value args[3], output = NULL, value = NULL;
  char* cnjPath = NULL;
  char* contentRoot = NULL;
  char* contentName = NULL;
  size_t cnjLength = 0, rootLength = 0, nameLength = 0;
  CNA_CnjToCnbResultHandle result = 0;
  uint8_t* bytes = NULL;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_utf8(env, args[0], &cnjPath, &cnjLength)) return NULL;
  if (!read_utf8(env, args[1], &contentRoot, &rootLength)) {
    free(cnjPath);
    return NULL;
  }
  if (!read_utf8(env, args[2], &contentName, &nameLength)) {
    free(cnjPath);
    free(contentRoot);
    return NULL;
  }
  const CNA_StringView pathView = {cnjPath, cnjLength};
  const CNA_StringView rootView = {contentRoot, rootLength};
  const CNA_StringView nameView = {contentName, nameLength};
  CNA_Result status = g_api.cnb_compile_cnj(pathView, rootView, nameView, &result);
  free(cnjPath);
  free(contentRoot);
  free(contentName);
  if (status != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_compile_cnj", status);
  }

  uint32_t assetTypeId = 0;
  status = g_api.cnb_cnj_result_get_asset_type_id(result, &assetTypeId);
  if (status != CNA_RESULT_SUCCESS) {
    g_api.cnb_cnj_result_destroy(result);
    return throw_result(env, "cna_cnb_cnj_result_get_asset_type_id", status);
  }

  uint64_t nameSize = 0;
  status = g_api.cnb_cnj_result_get_asset_type_name_size(result, &nameSize);
  if (status != CNA_RESULT_SUCCESS || nameSize > SIZE_MAX) {
    g_api.cnb_cnj_result_destroy(result);
    return throw_result(env, "cna_cnb_cnj_result_get_asset_type_name_size", status);
  }
  char* typeName = nameSize == 0 ? NULL : (char*) malloc((size_t) nameSize);
  if (nameSize != 0 && !typeName) {
    g_api.cnb_cnj_result_destroy(result);
    return throw_message(env, "compile-result type-name allocation failed");
  }
  uint64_t produced = 0;
  status = g_api.cnb_cnj_result_copy_asset_type_name(result, typeName, nameSize, &produced);
  if (status != CNA_RESULT_SUCCESS || produced != nameSize) {
    free(typeName);
    g_api.cnb_cnj_result_destroy(result);
    return throw_result(env, "cna_cnb_cnj_result_copy_asset_type_name", status);
  }

  uint64_t required = 0;
  status = g_api.cnb_cnj_result_copy_bytes(result, NULL, 0, &required);
  if (status != CNA_RESULT_SUCCESS && status != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(typeName);
    g_api.cnb_cnj_result_destroy(result);
    return throw_result(env, "cna_cnb_cnj_result_copy_bytes", status);
  }
  if (required > SIZE_MAX) {
    free(typeName);
    g_api.cnb_cnj_result_destroy(result);
    return throw_message(env, "the compiled image exceeds the host address space");
  }
  bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(typeName);
    g_api.cnb_cnj_result_destroy(result);
    return throw_message(env, "compiled-image allocation failed");
  }
  uint64_t written = 0;
  status = g_api.cnb_cnj_result_copy_bytes(result, bytes, required, &written);
  if (status != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    free(typeName);
    g_api.cnb_cnj_result_destroy(result);
    return throw_result(env, "cna_cnb_cnj_result_copy_bytes", status);
  }

  napi_value absorbed = NULL, references = NULL, imageValue = NULL, nameValue = NULL;
  int ok =
    cnj_string_list(env, result, g_api.cnb_cnj_result_get_absorbed_file_count,
      g_api.cnb_cnj_result_get_absorbed_file_size, g_api.cnb_cnj_result_copy_absorbed_file,
      "cna_cnb_cnj_result_copy_absorbed_file", &absorbed) &&
    cnj_string_list(env, result, g_api.cnb_cnj_result_get_external_reference_count,
      g_api.cnb_cnj_result_get_external_reference_size,
      g_api.cnb_cnj_result_copy_external_reference,
      "cna_cnb_cnj_result_copy_external_reference", &references);
  /* Released before anything is returned: the build-time package owns no native lifetime. */
  g_api.cnb_cnj_result_destroy(result);
  if (!ok) {
    free(bytes);
    free(typeName);
    return NULL;
  }
  void* copied = NULL;
  if (napi_create_buffer_copy(env, (size_t) required, bytes ? (const void*) bytes : (const void*) "", &copied, &imageValue)
        != napi_ok ||
      napi_create_string_utf8(env, typeName ? typeName : "", (size_t) nameSize, &nameValue)
        != napi_ok ||
      napi_create_object(env, &output) != napi_ok ||
      napi_create_uint32(env, assetTypeId, &value) != napi_ok ||
      napi_set_named_property(env, output, "AssetTypeId", value) != napi_ok ||
      napi_set_named_property(env, output, "AssetTypeName", nameValue) != napi_ok ||
      napi_set_named_property(env, output, "Bytes", imageValue) != napi_ok ||
      napi_set_named_property(env, output, "AbsorbedFiles", absorbed) != napi_ok ||
      napi_set_named_property(env, output, "ExternalReferences", references) != napi_ok) {
    free(bytes);
    free(typeName);
    return throw_napi(env, "cna_cnb_compile_cnj result");
  }
  (void) copied;
  free(bytes);
  free(typeName);
  return output;
}

static napi_value is_library_loaded(napi_env env, napi_callback_info info) {
  napi_value output;
  (void) info;
  NAPI_OR_RETURN(env, napi_get_boolean(env, g_library != NULL, &output), "library state");
  return output;
}

/* --- the CNB curve and animation-clip schemas -------------------------------------------------- */
/*
 * Two schemas whose decoded form is a *native* object this binding immediately reads out and
 * releases, rather than keeping. `cna_cnb_decode_curve` hands back a `CNA_CurveHandle`, but XNA's
 * `Curve` is one of the value types this package implements exactly in TypeScript -- so the native
 * curve exists only long enough to have its loop modes and its keys copied out, and the object a
 * consumer ends up holding evaluates in TypeScript with no backend behind it at all.
 *
 * The animation clip is the opposite: it has no XNA counterpart, so its handle is kept and its
 * tracks are addressed by index, as the model's nodes are.
 */

static napi_value make_curve_key(napi_env env, const CNA_CurveKey* key) {
  napi_value output;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "CNB curve key");
  if (!set_number(env, output, "Position", (double) key->position) ||
      !set_number(env, output, "Value", (double) key->value) ||
      !set_number(env, output, "TangentIn", (double) key->tangent_in) ||
      !set_number(env, output, "TangentOut", (double) key->tangent_out) ||
      !set_u32(env, output, "Continuity", key->continuity)) {
    return throw_napi(env, "CNB curve key");
  }
  return output;
}

/*
 * Reads a whole managed curve out of a native handle and releases both it and its key collection.
 * A partial read still releases: the collection is a separate handle and leaking it would outlive
 * the curve it came from.
 */
static napi_value read_curve(napi_env env, CNA_CurveHandle curve) {
  CNA_CurveKeyCollectionHandle keys = 0;
  napi_value output = NULL, array = NULL;
  uint32_t pre = 0, post = 0;
  CNA_Bool constant = CNA_FALSE;
  uint64_t count = 0;
  CNA_Result result = g_api.curve_get_pre_loop(curve, &pre);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_get_post_loop(curve, &post);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_get_is_constant(curve, &constant);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_get_keys(curve, &keys);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_key_collection_get_count(keys, &count);
  if (result != CNA_RESULT_SUCCESS) goto done;
  if (count > (uint64_t) INT32_MAX) {
    if (keys) g_api.curve_key_collection_destroy(keys);
    g_api.curve_destroy(curve);
    return throw_message(env, "a CNB curve declares more keys than an index can address");
  }
  if (napi_create_object(env, &output) != napi_ok ||
      napi_create_array_with_length(env, (size_t) count, &array) != napi_ok) {
    output = throw_napi(env, "CNB curve");
    goto release;
  }
  for (uint64_t index = 0; index < count; index += 1) {
    CNA_CurveKey key;
    memset(&key, 0, sizeof(key));
    result = g_api.curve_key_collection_get(keys, (int32_t) index, &key);
    if (result != CNA_RESULT_SUCCESS) {
      output = NULL;
      goto done;
    }
    napi_value entry = make_curve_key(env, &key);
    if (!entry || napi_set_element(env, array, (uint32_t) index, entry) != napi_ok) {
      output = entry ? throw_napi(env, "CNB curve keys") : NULL;
      goto release;
    }
  }
  if (!set_u32(env, output, "PreLoop", pre) ||
      !set_u32(env, output, "PostLoop", post) ||
      !set_bool(env, output, "IsConstant", constant != CNA_FALSE) ||
      napi_set_named_property(env, output, "Keys", array) != napi_ok) {
    output = throw_napi(env, "CNB curve");
  }
release:
  if (keys) g_api.curve_key_collection_destroy(keys);
  g_api.curve_destroy(curve);
  return output;
done:
  if (keys) g_api.curve_key_collection_destroy(keys);
  g_api.curve_destroy(curve);
  return output ? output : throw_result(env, "cna_curve", result);
}

static napi_value cnb_decode_curve(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CurveHandle curve = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_curve(document, &curve);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_decode_curve", result);
  return read_curve(env, curve);
}

/* Builds a native curve from a managed one, encodes it, and releases the native side. */
static napi_value cnb_encode_curve(napi_env env, napi_callback_info info) {
  napi_value args[2], keys_value, output = NULL;
  CNA_CurveHandle curve = 0;
  CNA_CurveKeyCollectionHandle keys = 0;
  char* name = NULL;
  size_t name_length = 0;
  uint32_t pre = 0, post = 0, count = 0;
  uint8_t* bytes = NULL;
  bool is_array = false;
  napi_value entry;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  if (napi_get_named_property(env, args[0], "PreLoop", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &pre) != napi_ok ||
      napi_get_named_property(env, args[0], "PostLoop", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &post) != napi_ok ||
      napi_get_named_property(env, args[0], "Keys", &keys_value) != napi_ok ||
      napi_is_array(env, keys_value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, keys_value, &count) != napi_ok) {
    free(name);
    return throw_message(env, "a curve needs PreLoop, PostLoop and a Keys array");
  }
  CNA_Result result = g_api.curve_create(&curve);
  if (result != CNA_RESULT_SUCCESS) {
    free(name);
    return throw_result(env, "cna_curve_create", result);
  }
  result = g_api.curve_set_pre_loop(curve, pre);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_set_post_loop(curve, post);
  if (result == CNA_RESULT_SUCCESS) result = g_api.curve_get_keys(curve, &keys);
  if (result != CNA_RESULT_SUCCESS) goto fail;
  for (uint32_t index = 0; index < count; index += 1) {
    napi_value element, field;
    double numbers[4] = {0, 0, 0, 0};
    uint32_t continuity = 0;
    static const char* const names[] = {"Position", "Value", "TangentIn", "TangentOut"};
    if (napi_get_element(env, keys_value, index, &element) != napi_ok) goto bad_key;
    for (size_t which = 0; which < 4; which += 1) {
      if (napi_get_named_property(env, element, names[which], &field) != napi_ok ||
          napi_get_value_double(env, field, &numbers[which]) != napi_ok) {
        goto bad_key;
      }
    }
    if (napi_get_named_property(env, element, "Continuity", &field) != napi_ok ||
        napi_get_value_uint32(env, field, &continuity) != napi_ok) {
      goto bad_key;
    }
    CNA_CurveKey key;
    memset(&key, 0, sizeof(key));
    result = g_api.curve_key_init_full(
      (float) numbers[0], (float) numbers[1], (float) numbers[2], (float) numbers[3],
      continuity, &key);
    if (result == CNA_RESULT_SUCCESS) result = g_api.curve_key_collection_add(keys, key);
    if (result != CNA_RESULT_SUCCESS) goto fail;
  }
  {
    const CNA_StringView view = {name, name_length};
    uint64_t required = 0;
    result = g_api.cnb_encode_curve(curve, view, NULL, 0, &required);
    if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) goto fail;
    if (required > SIZE_MAX) {
      output = throw_message(env, "CNB image exceeds the Node address space");
      goto release;
    }
    bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
    if (required != 0 && !bytes) {
      output = throw_message(env, "CNB image allocation failed");
      goto release;
    }
    uint64_t written = 0;
    result = g_api.cnb_encode_curve(curve, view, bytes, required, &written);
    if (result != CNA_RESULT_SUCCESS || written != required) {
      if (result == CNA_RESULT_SUCCESS) result = CNA_RESULT_INTERNAL;
      goto fail;
    }
    output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  }
release:
  free(bytes);
  free(name);
  if (keys) g_api.curve_key_collection_destroy(keys);
  g_api.curve_destroy(curve);
  return output;
bad_key:
  output = throw_message(env, "a curve key needs Position, Value, TangentIn, TangentOut and Continuity");
  goto release;
fail:
  free(bytes);
  free(name);
  if (keys) g_api.curve_key_collection_destroy(keys);
  g_api.curve_destroy(curve);
  return throw_result(env, "cna_cnb_encode_curve", result);
}

static napi_value cnb_decode_animation_clip(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CnbAnimationClipHandle clip = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_animation_clip(document, &clip);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_decode_animation_clip", result);
  }
  return make_handle(env, clip);
}

static napi_value cnb_animation_clip_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle clip = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &clip)) return NULL;
  const CNA_Result result = g_api.cnb_animation_clip_destroy(clip);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_animation_clip_destroy", result);
  }
  return undefined_result(env, "CNB animation clip release");
}

static napi_value cnb_animation_clip_get(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle clip = 0;
  double duration = 0;
  uint64_t tracks = 0;
  CNA_ClipTargetSpaceEXT space = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &clip)) return NULL;
  const CNA_Result result = g_api.cnb_animation_clip_get(clip, &duration, &tracks, &space);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_animation_clip_get", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB animation clip");
  if (!set_number(env, output, "DurationSeconds", duration) ||
      !set_number(env, output, "TrackCount", (double) tracks) ||
      !set_u32(env, output, "TargetSpace", space)) {
    return throw_napi(env, "CNB animation clip");
  }
  return output;
}

static napi_value cnb_animation_clip_get_track(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle clip = 0;
  uint32_t track = 0;
  int32_t bone = 0;
  uint64_t keyframes = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &clip) ||
      napi_get_value_uint32(env, args[1], &track) != napi_ok) {
    return throw_message(env, "expected a CNB animation clip and a track index");
  }
  const CNA_Result result = g_api.cnb_animation_clip_get_track(clip, track, &bone, &keyframes);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_animation_clip_get_track", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB animation track");
  if (!set_i32(env, output, "BoneIndex", bone) ||
      !set_number(env, output, "KeyframeCount", (double) keyframes)) {
    return throw_napi(env, "CNB animation track");
  }
  return output;
}

static napi_value make_keyframe(napi_env env, const CNA_KeyframeEXT* frame) {
  napi_value output;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "CNB keyframe");
  const float translation[3] = {frame->translation.x, frame->translation.y, frame->translation.z};
  const float rotation[4] = {
    frame->rotation.x, frame->rotation.y, frame->rotation.z, frame->rotation.w};
  const float scale[3] = {frame->scale.x, frame->scale.y, frame->scale.z};
  if (!set_number(env, output, "TimeSeconds", frame->time_seconds) ||
      !set_float_array(env, output, "Translation", translation, 3) ||
      !set_float_array(env, output, "Rotation", rotation, 4) ||
      !set_float_array(env, output, "Scale", scale, 3)) {
    return throw_napi(env, "CNB keyframe");
  }
  return output;
}

static napi_value cnb_animation_clip_copy_keyframes(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle clip = 0;
  uint32_t track = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &clip) ||
      napi_get_value_uint32(env, args[1], &track) != napi_ok) {
    return throw_message(env, "expected a CNB animation clip and a track index");
  }
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_animation_clip_copy_keyframes(clip, track, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_animation_clip_copy_keyframes", result);
  }
  if (required > SIZE_MAX / sizeof(CNA_KeyframeEXT)) {
    return throw_message(env, "CNB keyframes exceed the address space");
  }
  CNA_KeyframeEXT* frames = required == 0
    ? NULL
    : (CNA_KeyframeEXT*) malloc((size_t) required * sizeof(CNA_KeyframeEXT));
  if (required != 0 && !frames) return throw_message(env, "CNB keyframe allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_animation_clip_copy_keyframes(clip, track, frames, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(frames);
    return throw_result(
      env, "cna_cnb_animation_clip_copy_keyframes",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_array_with_length(env, (size_t) produced, &output) != napi_ok) {
    free(frames);
    return throw_napi(env, "CNB keyframes");
  }
  for (uint64_t index = 0; index < produced; index += 1) {
    napi_value entry = make_keyframe(env, &frames[index]);
    if (!entry || napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      free(frames);
      return entry ? throw_napi(env, "CNB keyframes") : NULL;
    }
  }
  free(frames);
  return output;
}

/* Builds a clip descriptor from nested JavaScript arrays and encodes it. */
static napi_value cnb_encode_animation_clip(napi_env env, napi_callback_info info) {
  napi_value args[4], tracks_value;
  char* name = NULL;
  size_t name_length = 0;
  double duration = 0;
  uint32_t space = 0, track_count = 0;
  bool is_array = false;
  CNA_BoneTrackEXTDescriptor* tracks = NULL;
  CNA_KeyframeEXT** frames = NULL;
  uint8_t* bytes = NULL;
  napi_value output = NULL;
  CNA_Result result = CNA_RESULT_SUCCESS;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      napi_get_value_double(env, args[0], &duration) != napi_ok ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, args[1], &track_count) != napi_ok ||
      napi_get_value_uint32(env, args[2], &space) != napi_ok) {
    return throw_message(env, "expected a duration, a track array and a target space");
  }
  tracks_value = args[1];
  if (!read_utf8(env, args[3], &name, &name_length)) return NULL;
  if (track_count > UINT32_C(65536)) {
    free(name);
    return throw_message(env, "a CNB animation clip carries at most 65536 tracks");
  }
  tracks = (CNA_BoneTrackEXTDescriptor*) calloc(
    track_count == 0 ? 1 : track_count, sizeof(CNA_BoneTrackEXTDescriptor));
  frames = (CNA_KeyframeEXT**) calloc(track_count == 0 ? 1 : track_count, sizeof(CNA_KeyframeEXT*));
  if (!tracks || !frames) {
    output = throw_message(env, "CNB animation clip allocation failed");
    goto release;
  }
  for (uint32_t index = 0; index < track_count; index += 1) {
    napi_value track, field, keys;
    int32_t bone = 0;
    uint32_t keyframe_count = 0;
    if (napi_get_element(env, tracks_value, index, &track) != napi_ok ||
        napi_get_named_property(env, track, "BoneIndex", &field) != napi_ok ||
        napi_get_value_int32(env, field, &bone) != napi_ok ||
        napi_get_named_property(env, track, "Keyframes", &keys) != napi_ok ||
        napi_is_array(env, keys, &is_array) != napi_ok || !is_array ||
        napi_get_array_length(env, keys, &keyframe_count) != napi_ok) {
      output = throw_message(env, "a track needs a BoneIndex and a Keyframes array");
      goto release;
    }
    if (keyframe_count > UINT32_C(1048576)) {
      output = throw_message(env, "a CNB animation track carries at most 1048576 keyframes");
      goto release;
    }
    frames[index] = (CNA_KeyframeEXT*) calloc(
      keyframe_count == 0 ? 1 : keyframe_count, sizeof(CNA_KeyframeEXT));
    if (!frames[index]) {
      output = throw_message(env, "CNB keyframe allocation failed");
      goto release;
    }
    for (uint32_t which = 0; which < keyframe_count; which += 1) {
      napi_value frame, component;
      double time = 0;
      float translation[3], rotation[4], scale[3];
      if (napi_get_element(env, keys, which, &frame) != napi_ok ||
          napi_get_named_property(env, frame, "TimeSeconds", &component) != napi_ok ||
          napi_get_value_double(env, component, &time) != napi_ok ||
          napi_get_named_property(env, frame, "Translation", &component) != napi_ok ||
          !read_float_array(env, component, translation, 3, "a keyframe needs a three-component translation") ||
          napi_get_named_property(env, frame, "Rotation", &component) != napi_ok ||
          !read_float_array(env, component, rotation, 4, "a keyframe needs a four-component rotation") ||
          napi_get_named_property(env, frame, "Scale", &component) != napi_ok ||
          !read_float_array(env, component, scale, 3, "a keyframe needs a three-component scale")) {
        output = NULL;
        goto release;
      }
      CNA_KeyframeEXT* target = &frames[index][which];
      target->time_seconds = time;
      target->translation.x = translation[0];
      target->translation.y = translation[1];
      target->translation.z = translation[2];
      target->rotation.x = rotation[0];
      target->rotation.y = rotation[1];
      target->rotation.z = rotation[2];
      target->rotation.w = rotation[3];
      target->scale.x = scale[0];
      target->scale.y = scale[1];
      target->scale.z = scale[2];
    }
    tracks[index].bone_index = bone;
    tracks[index].keyframes = frames[index];
    tracks[index].keyframe_count = keyframe_count;
  }
  {
    CNA_AnimationClipEXTDescriptor clip;
    memset(&clip, 0, sizeof(clip));
    clip.duration_seconds = duration;
    clip.tracks = tracks;
    clip.track_count = track_count;
    const CNA_StringView view = {name, name_length};
    uint64_t required = 0;
    result = g_api.cnb_encode_animation_clip(&clip, space, view, NULL, 0, &required);
    if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
      output = throw_result(env, "cna_cnb_encode_animation_clip", result);
      goto release;
    }
    if (required > SIZE_MAX) {
      output = throw_message(env, "CNB image exceeds the Node address space");
      goto release;
    }
    bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
    if (required != 0 && !bytes) {
      output = throw_message(env, "CNB image allocation failed");
      goto release;
    }
    uint64_t written = 0;
    result = g_api.cnb_encode_animation_clip(&clip, space, view, bytes, required, &written);
    if (result != CNA_RESULT_SUCCESS || written != required) {
      output = throw_result(
        env, "cna_cnb_encode_animation_clip",
        result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
      goto release;
    }
    output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  }
release:
  if (frames) for (uint32_t index = 0; index < track_count; index += 1) free(frames[index]);
  free(frames);
  free(tracks);
  free(bytes);
  free(name);
  return output;
}

/* --- the CNB media schemas: sound effects, songs and videos ----------------------------------- */
/*
 * Three schemas that share one property worth stating: a song and a video container carry a
 * **stream reference** rather than the media itself -- a name the runtime resolves later. So both
 * schemas are completely testable without any encoded audio or video, which is why they are
 * projected here while actual playback stays fixture-blocked.
 *
 * The sound effect is the one that carries its own samples, and it ends in a real XNA SoundEffect.
 */

static int read_sound_effect_info(napi_env env, napi_value value, CNA_CnbSoundEffectInfo* out) {
  static const char* const names[] = {
    "Format", "SampleRate", "Channels", "FrameCount", "LoopStart", "LoopLength",
  };
  uint32_t numbers[6] = {0, 0, 0, 0, 0, 0};
  memset(out, 0, sizeof(*out));
  out->struct_size = (uint32_t) sizeof(*out);
  out->struct_version = CNA_CNB_SOUND_EFFECT_INFO_STRUCT_VERSION;
  for (size_t index = 0; index < 6; index += 1) {
    napi_value entry;
    if (napi_get_named_property(env, value, names[index], &entry) != napi_ok ||
        napi_get_value_uint32(env, entry, &numbers[index]) != napi_ok) {
      throw_message(env, "a CNB sound effect needs its six numeric fields");
      return 0;
    }
  }
  out->format = numbers[0];
  out->sample_rate = numbers[1];
  out->channels = numbers[2];
  out->frame_count = numbers[3];
  out->loop_start = numbers[4];
  out->loop_length = numbers[5];
  return 1;
}

static napi_value make_sound_effect_info(napi_env env, const CNA_CnbSoundEffectInfo* info) {
  napi_value output;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "CNB sound effect info");
  if (!set_u32(env, output, "Format", info->format) ||
      !set_u32(env, output, "SampleRate", info->sample_rate) ||
      !set_u32(env, output, "Channels", info->channels) ||
      !set_u32(env, output, "FrameCount", info->frame_count) ||
      !set_u32(env, output, "LoopStart", info->loop_start) ||
      !set_u32(env, output, "LoopLength", info->loop_length)) {
    return throw_napi(env, "CNB sound effect info");
  }
  return output;
}

static napi_value cnb_sound_effect_data_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_CnbSoundEffectInfo description;
  const uint8_t* samples = NULL;
  size_t length = 0;
  CNA_CnbSoundEffectDataHandle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_sound_effect_info(env, args[0], &description) ||
      !read_byte_view(env, args[1], &samples, &length)) return NULL;
  const CNA_Result result =
    g_api.cnb_sound_effect_data_create(&description, samples, (uint64_t) length, &sound);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sound_effect_data_create", result);
  }
  return make_handle(env, sound);
}

static napi_value cnb_sound_effect_data_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sound)) return NULL;
  const CNA_Result result = g_api.cnb_sound_effect_data_destroy(sound);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sound_effect_data_destroy", result);
  }
  return undefined_result(env, "CNB sound effect release");
}

static napi_value cnb_sound_effect_data_get_info(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sound)) return NULL;
  CNA_CnbSoundEffectInfo description;
  memset(&description, 0, sizeof(description));
  description.struct_size = (uint32_t) sizeof(description);
  description.struct_version = CNA_CNB_SOUND_EFFECT_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_sound_effect_data_get_info(sound, &description);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_sound_effect_data_get_info", result);
  }
  return make_sound_effect_info(env, &description);
}

static napi_value cnb_sound_effect_data_copy_samples(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sound)) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_sound_effect_data_copy_samples(sound, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_sound_effect_data_copy_samples", result);
  }
  if (required > SIZE_MAX) return throw_message(env, "CNB samples exceed the address space");
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) return throw_message(env, "CNB sample allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_sound_effect_data_copy_samples(sound, bytes, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_sound_effect_data_copy_samples",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) produced, "CNB sample copy");
  free(bytes);
  return output;
}

static napi_value cnb_encode_sound_effect(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle sound = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &sound) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_encode_sound_effect(sound, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(name);
    return throw_result(env, "cna_cnb_encode_sound_effect", result);
  }
  if (required > SIZE_MAX) {
    free(name);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(name);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_sound_effect(sound, view, bytes, required, &written);
  free(name);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_encode_sound_effect",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  free(bytes);
  return output;
}

static napi_value cnb_decode_sound_effect(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CnbSoundEffectDataHandle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_sound_effect(document, &sound);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_decode_sound_effect", result);
  }
  return make_handle(env, sound);
}

static napi_value cnb_decode_wav_as_sound_effect(napi_env env, napi_callback_info info) {
  napi_value args[2];
  const uint8_t* bytes = NULL;
  size_t length = 0;
  char* origin = NULL;
  size_t origin_length = 0;
  CNA_CnbSoundEffectDataHandle sound = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_byte_view(env, args[0], &bytes, &length) ||
      !read_utf8(env, args[1], &origin, &origin_length)) return NULL;
  const CNA_StringView view = {origin, origin_length};
  const CNA_Result result =
    g_api.cnb_decode_wav_as_sound_effect(bytes, (uint64_t) length, view, &sound);
  free(origin);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_decode_wav_as_sound_effect", result);
  }
  return make_handle(env, sound);
}

static napi_value cnb_encode_song(napi_env env, napi_callback_info info) {
  napi_value args[4];
  char* stream = NULL;
  char* name = NULL;
  char* content = NULL;
  size_t stream_length = 0, name_length = 0, content_length = 0;
  uint32_t duration = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_utf8(env, args[0], &stream, &stream_length) ||
      !read_utf8(env, args[1], &name, &name_length)) {
    free(stream);
    return NULL;
  }
  if (napi_get_value_uint32(env, args[2], &duration) != napi_ok ||
      !read_utf8(env, args[3], &content, &content_length)) {
    free(stream);
    free(name);
    return throw_message(env, "expected a duration and a content name");
  }
  const CNA_StringView stream_view = {stream, stream_length};
  const CNA_StringView name_view = {name, name_length};
  const CNA_StringView content_view = {content, content_length};
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_encode_song(
    stream_view, name_view, duration, content_view, NULL, 0, &required);
  uint8_t* bytes = NULL;
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) goto fail;
  if (required > SIZE_MAX) {
    free(stream); free(name); free(content);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(stream); free(name); free(content);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_song(
    stream_view, name_view, duration, content_view, bytes, required, &written);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    if (result == CNA_RESULT_SUCCESS) result = CNA_RESULT_INTERNAL;
    goto fail;
  }
  free(stream); free(name); free(content);
  {
    napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
    free(bytes);
    return output;
  }
fail:
  free(stream); free(name); free(content);
  return throw_result(env, "cna_cnb_encode_song", result);
}

static napi_value document_u32(
  napi_env env, napi_callback_info info, CnbDecodeSongDurationFn function, const char* operation
) {
  napi_value args[1], output;
  CNA_Handle document = 0;
  uint32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = function(document, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, value, &output), operation);
  return output;
}

/* One document-level `(size, copy)` text pair, sized from the first call. */
static napi_value document_text(
  napi_env env,
  napi_callback_info info,
  CnbDocumentTextSizeFn size_fn,
  CnbDocumentTextCopyFn copy_fn,
  const char* const operation
) {
  napi_value args[1], output;
  CNA_Handle document = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  uint64_t required = 0;
  CNA_Result result = size_fn(document, &required);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (required > SIZE_MAX - 1) return throw_message(env, "CNB text exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "CNB text allocation failed");
  uint64_t produced = 0;
  result = copy_fn(document, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, operation, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, operation);
  }
  free(text);
  return output;
}

static napi_value cnb_decode_song_duration(napi_env env, napi_callback_info info) {
  return document_u32(
    env, info, g_api.cnb_decode_song_duration, "cna_cnb_decode_song_duration_milliseconds");
}

static napi_value cnb_decode_song_name(napi_env env, napi_callback_info info) {
  return document_text(
    env, info, g_api.cnb_decode_song_name_size, g_api.cnb_decode_song_name,
    "cna_cnb_decode_song_name");
}

static napi_value cnb_decode_song_stream_reference(napi_env env, napi_callback_info info) {
  return document_text(
    env, info, g_api.cnb_decode_song_stream_reference_size,
    g_api.cnb_decode_song_stream_reference, "cna_cnb_decode_song_stream_reference");
}

static napi_value cnb_decode_video_stream_reference(napi_env env, napi_callback_info info) {
  return document_text(
    env, info, g_api.cnb_decode_video_stream_reference_size,
    g_api.cnb_decode_video_stream_reference, "cna_cnb_decode_video_stream_reference");
}

static int read_video_info(napi_env env, napi_value value, CNA_CnbVideoInfo* out) {
  static const char* const names[] = {
    "DurationMilliseconds", "Width", "Height", "SoundtrackType",
  };
  uint32_t numbers[4] = {0, 0, 0, 0};
  memset(out, 0, sizeof(*out));
  out->struct_size = (uint32_t) sizeof(*out);
  out->struct_version = CNA_CNB_VIDEO_INFO_STRUCT_VERSION;
  for (size_t index = 0; index < 4; index += 1) {
    napi_value entry;
    if (napi_get_named_property(env, value, names[index], &entry) != napi_ok ||
        napi_get_value_uint32(env, entry, &numbers[index]) != napi_ok) {
      throw_message(env, "a CNB video needs its four integer fields");
      return 0;
    }
  }
  napi_value entry;
  double fps = 0;
  if (napi_get_named_property(env, value, "FramesPerSecond", &entry) != napi_ok ||
      napi_get_value_double(env, entry, &fps) != napi_ok) {
    throw_message(env, "a CNB video needs a FramesPerSecond");
    return 0;
  }
  out->duration_milliseconds = numbers[0];
  out->width = numbers[1];
  out->height = numbers[2];
  out->soundtrack_type = numbers[3];
  out->frames_per_second = (float) fps;
  return 1;
}

static napi_value cnb_encode_video(napi_env env, napi_callback_info info) {
  napi_value args[3];
  char* stream = NULL;
  char* content = NULL;
  size_t stream_length = 0, content_length = 0;
  CNA_CnbVideoInfo description;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_utf8(env, args[0], &stream, &stream_length)) return NULL;
  if (!read_video_info(env, args[1], &description) ||
      !read_utf8(env, args[2], &content, &content_length)) {
    free(stream);
    return NULL;
  }
  const CNA_StringView stream_view = {stream, stream_length};
  const CNA_StringView content_view = {content, content_length};
  uint64_t required = 0;
  CNA_Result result =
    g_api.cnb_encode_video(stream_view, &description, content_view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(stream);
    free(content);
    return throw_result(env, "cna_cnb_encode_video", result);
  }
  if (required > SIZE_MAX) {
    free(stream);
    free(content);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(stream);
    free(content);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result =
    g_api.cnb_encode_video(stream_view, &description, content_view, bytes, required, &written);
  free(stream);
  free(content);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_encode_video", result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  free(bytes);
  return output;
}

static napi_value cnb_decode_video(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle document = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  CNA_CnbVideoInfo description;
  memset(&description, 0, sizeof(description));
  description.struct_size = (uint32_t) sizeof(description);
  description.struct_version = CNA_CNB_VIDEO_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_decode_video(document, &description);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_decode_video", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB video info");
  if (!set_u32(env, output, "DurationMilliseconds", description.duration_milliseconds) ||
      !set_u32(env, output, "Width", description.width) ||
      !set_u32(env, output, "Height", description.height) ||
      !set_number(env, output, "FramesPerSecond", (double) description.frames_per_second) ||
      !set_u32(env, output, "SoundtrackType", description.soundtrack_type)) {
    return throw_napi(env, "CNB video info");
  }
  return output;
}

/* --- the CNB model schema --------------------------------------------------------------------- */
/*
 * `cnb.h`'s largest schema, and the only one whose C shape is a decision rather than a
 * transcription: the canonical model is a graph of nested vectors, and this ABI reaches it through
 * one owned handle whose nodes are addressed by index. The bridge keeps that shape rather than
 * flattening it, because a flattened snapshot of a model with skinned meshes is larger than the
 * file it came from.
 *
 * Two conventions run through everything below. Every string and every payload is fetched with the
 * size/copy pair the ABI declares, sized from the first call rather than from a fixed buffer -- a
 * bone name has no documented maximum. And every versioned structure is zeroed and stamped with
 * `struct_size`/`struct_version` before the call, so a structure this bridge is too old to know
 * about is refused by CNA rather than read past.
 */

/* One `(model, index) -> string` pair, sized then copied. Returns a JavaScript string. */
static napi_value model_index_text(
  napi_env env,
  napi_callback_info info,
  CnbModelIndexSizeFn size_fn,
  CnbModelIndexCopyTextFn copy_fn,
  const char* const operation
) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and an index");
  }
  uint64_t required = 0;
  CNA_Result result = size_fn(model, index, &required);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  if (required > SIZE_MAX - 1) return throw_message(env, "CNB model text exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "CNB model text allocation failed");
  uint64_t produced = 0;
  result = copy_fn(model, index, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, operation, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, operation);
  }
  free(text);
  return output;
}

/* One `(model, index) -> bytes` pair, sized then copied into a fresh Buffer. */
static napi_value model_index_bytes(
  napi_env env,
  napi_callback_info info,
  CnbModelIndexCopyBytesFn copy_fn,
  const char* const operation
) {
  napi_value args[2];
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and an index");
  }
  uint64_t required = 0;
  CNA_Result result = copy_fn(model, index, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, operation, result);
  }
  if (required > SIZE_MAX) return throw_message(env, "CNB model payload exceeds the address space");
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) return throw_message(env, "CNB model payload allocation failed");
  uint64_t produced = 0;
  result = copy_fn(model, index, bytes, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(bytes);
    return throw_result(env, operation, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) produced, operation);
  free(bytes);
  return output;
}

/* Reads a float array of an exact length out of a JavaScript array. */

static napi_value cnb_model_create(napi_env env, napi_callback_info info) {
  (void) info;
  CNA_CnbModelDataHandle model = 0;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.cnb_model_create(&model);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_create", result);
  return make_handle(env, model);
}

static napi_value cnb_model_destroy(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle model = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &model)) return NULL;
  const CNA_Result result = g_api.cnb_model_destroy(model);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_destroy", result);
  return undefined_result(env, "CNB model release");
}

static napi_value cnb_model_set_flags(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle model = 0;
  bool lighting = false, hierarchy = false;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_bool(env, args[1], &lighting) != napi_ok ||
      napi_get_value_bool(env, args[2], &hierarchy) != napi_ok) {
    return throw_message(env, "expected a CNB model and two flags");
  }
  const CNA_Result result = g_api.cnb_model_set_flags(
    model, lighting ? CNA_TRUE : CNA_FALSE, hierarchy ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_set_flags", result);
  return undefined_result(env, "CNB model flags");
}

static napi_value cnb_model_get_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle model = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &model)) return NULL;
  CNA_CnbModelInfo value;
  memset(&value, 0, sizeof(value));
  value.struct_size = (uint32_t) sizeof(value);
  value.struct_version = CNA_CNB_MODEL_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_info(model, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_info", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB model info");
  if (!set_number(env, output, "BoneCount", (double) value.bone_count) ||
      !set_number(env, output, "PartCount", (double) value.part_count) ||
      !set_number(env, output, "MeshCount", (double) value.mesh_count) ||
      !set_number(env, output, "AnimationCount", (double) value.animation_count) ||
      !set_number(env, output, "LightCount", (double) value.light_count) ||
      !set_bool(env, output, "HasSkeleton", value.has_skeleton != CNA_FALSE) ||
      !set_bool(env, output, "AppliesGltfLightingPolicy",
                value.applies_gltf_lighting_policy != CNA_FALSE) ||
      !set_bool(env, output, "HasBoneHierarchy", value.has_bone_hierarchy != CNA_FALSE)) {
    return throw_napi(env, "CNB model info");
  }
  return output;
}

static napi_value cnb_model_add_bone(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  CNA_Handle model = 0;
  char* name = NULL;
  size_t name_length = 0;
  int32_t parent = 0;
  float transform[16];
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &model) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  if (napi_get_value_int32(env, args[2], &parent) != napi_ok ||
      !read_float_array(env, args[3], transform, 16, "a CNB bone needs sixteen transform values")) {
    free(name);
    return NULL;
  }
  const CNA_StringView view = {name, name_length};
  uint64_t index = 0;
  const CNA_Result result = g_api.cnb_model_add_bone(model, view, parent, transform, &index);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_add_bone", result);
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB bone index");
  return output;
}

static napi_value cnb_model_get_bone(napi_env env, napi_callback_info info) {
  napi_value args[2], output, matrix;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and a bone index");
  }
  CNA_CnbModelBone bone;
  memset(&bone, 0, sizeof(bone));
  bone.struct_size = (uint32_t) sizeof(bone);
  bone.struct_version = CNA_CNB_MODEL_BONE_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_bone(model, index, &bone);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_bone", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB bone");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, 16, &matrix), "CNB bone transform");
  for (uint32_t element = 0; element < 16; element += 1) {
    napi_value number;
    if (napi_create_double(env, (double) bone.transform[element], &number) != napi_ok ||
        napi_set_element(env, matrix, element, number) != napi_ok) {
      return throw_napi(env, "CNB bone transform");
    }
  }
  if (!set_i32(env, output, "Parent", bone.parent) ||
      napi_set_named_property(env, output, "Transform", matrix) != napi_ok) {
    return throw_napi(env, "CNB bone");
  }
  return output;
}

static napi_value cnb_model_get_bone_name(napi_env env, napi_callback_info info) {
  return model_index_text(
    env, info, g_api.cnb_model_get_bone_name_size, g_api.cnb_model_copy_bone_name,
    "cna_cnb_model_copy_bone_name");
}

static napi_value cnb_model_get_part_name(napi_env env, napi_callback_info info) {
  return model_index_text(
    env, info, g_api.cnb_model_get_part_name_size, g_api.cnb_model_copy_part_name,
    "cna_cnb_model_copy_part_name");
}

static napi_value cnb_model_get_part_external_effect(napi_env env, napi_callback_info info) {
  return model_index_text(
    env, info, g_api.cnb_model_get_part_external_effect_size,
    g_api.cnb_model_copy_part_external_effect, "cna_cnb_model_copy_part_external_effect");
}

static napi_value cnb_model_get_mesh_name(napi_env env, napi_callback_info info) {
  return model_index_text(
    env, info, g_api.cnb_model_get_mesh_name_size, g_api.cnb_model_copy_mesh_name,
    "cna_cnb_model_copy_mesh_name");
}

static napi_value cnb_model_copy_part_vertex_bytes(napi_env env, napi_callback_info info) {
  return model_index_bytes(
    env, info, g_api.cnb_model_copy_part_vertex_bytes, "cna_cnb_model_copy_part_vertex_bytes");
}

static napi_value cnb_model_copy_part_index_bytes(napi_env env, napi_callback_info info) {
  return model_index_bytes(
    env, info, g_api.cnb_model_copy_part_index_bytes, "cna_cnb_model_copy_part_index_bytes");
}

static int read_part_info(napi_env env, napi_value value, CNA_CnbModelPartInfo* out) {
  static const char* const names[] = {
    "VertexStride", "VertexCount", "IndexCount", "IndexElementSize",
    "PrimitiveTopology", "PrimitiveCount", "EffectKind",
  };
  uint32_t numbers[7] = {0, 0, 0, 0, 0, 0, 0};
  memset(out, 0, sizeof(*out));
  out->struct_size = (uint32_t) sizeof(*out);
  out->struct_version = CNA_CNB_MODEL_PART_INFO_STRUCT_VERSION;
  for (size_t index = 0; index < 7; index += 1) {
    napi_value entry;
    if (napi_get_named_property(env, value, names[index], &entry) != napi_ok ||
        napi_get_value_uint32(env, entry, &numbers[index]) != napi_ok) {
      throw_message(env, "a CNB model part needs its seven numeric fields");
      return 0;
    }
  }
  napi_value entry;
  bool vertex_color = false, unlit = false;
  if (napi_get_named_property(env, value, "VertexColorEnabled", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &vertex_color) != napi_ok ||
      napi_get_named_property(env, value, "Unlit", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &unlit) != napi_ok) {
    throw_message(env, "a CNB model part needs VertexColorEnabled and Unlit");
    return 0;
  }
  out->vertex_stride = numbers[0];
  out->vertex_count = numbers[1];
  out->index_count = numbers[2];
  out->index_element_size = numbers[3];
  out->primitive_topology = numbers[4];
  out->primitive_count = numbers[5];
  out->effect_kind = numbers[6];
  out->vertex_color_enabled = vertex_color ? CNA_TRUE : CNA_FALSE;
  out->unlit = unlit ? CNA_TRUE : CNA_FALSE;
  return 1;
}

static napi_value cnb_model_add_part(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  CNA_Handle model = 0;
  CNA_CnbModelPartInfo part;
  char* name = NULL;
  char* effect = NULL;
  size_t name_length = 0, effect_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &model) || !read_part_info(env, args[1], &part) ||
      !read_utf8(env, args[2], &name, &name_length)) return NULL;
  if (!read_utf8(env, args[3], &effect, &effect_length)) {
    free(name);
    return NULL;
  }
  const CNA_StringView name_view = {name, name_length};
  const CNA_StringView effect_view = {effect, effect_length};
  uint64_t index = 0;
  const CNA_Result result =
    g_api.cnb_model_add_part(model, &part, name_view, effect_view, &index);
  free(name);
  free(effect);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_add_part", result);
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB part index");
  return output;
}

static napi_value cnb_model_get_part(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and a part index");
  }
  CNA_CnbModelPartInfo part;
  memset(&part, 0, sizeof(part));
  part.struct_size = (uint32_t) sizeof(part);
  part.struct_version = CNA_CNB_MODEL_PART_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_part(model, index, &part);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_part", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB model part");
  if (!set_u32(env, output, "VertexStride", part.vertex_stride) ||
      !set_u32(env, output, "VertexCount", part.vertex_count) ||
      !set_u32(env, output, "IndexCount", part.index_count) ||
      !set_u32(env, output, "IndexElementSize", part.index_element_size) ||
      !set_u32(env, output, "PrimitiveTopology", part.primitive_topology) ||
      !set_u32(env, output, "PrimitiveCount", part.primitive_count) ||
      !set_u32(env, output, "EffectKind", part.effect_kind) ||
      !set_bool(env, output, "VertexColorEnabled", part.vertex_color_enabled != CNA_FALSE) ||
      !set_bool(env, output, "Unlit", part.unlit != CNA_FALSE)) {
    return throw_napi(env, "CNB model part");
  }
  return output;
}

static napi_value model_set_part_bytes(
  napi_env env, napi_callback_info info, CnbModelSetPartBytesFn function, const char* operation
) {
  napi_value args[3];
  CNA_Handle model = 0;
  uint32_t index = 0;
  const uint8_t* bytes = NULL;
  size_t length = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model, an index and bytes");
  }
  if (!read_byte_view(env, args[2], &bytes, &length)) return NULL;
  const CNA_Result result = function(model, index, bytes, (uint64_t) length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, operation);
}

static napi_value cnb_model_set_part_vertex_bytes(napi_env env, napi_callback_info info) {
  return model_set_part_bytes(
    env, info, g_api.cnb_model_set_part_vertex_bytes, "cna_cnb_model_set_part_vertex_bytes");
}

static napi_value cnb_model_set_part_index_bytes(napi_env env, napi_callback_info info) {
  return model_set_part_bytes(
    env, info, g_api.cnb_model_set_part_index_bytes, "cna_cnb_model_set_part_index_bytes");
}

/*
 * The material's numeric state. Sixteen scalars and three small vectors: they are named
 * individually rather than shipped as one array because a caller that transposes two of them would
 * otherwise still round trip.
 */
static int read_material_info(napi_env env, napi_value value, CNA_CnbMaterialInfo* out) {
  memset(out, 0, sizeof(*out));
  out->struct_size = (uint32_t) sizeof(*out);
  out->struct_version = CNA_CNB_MATERIAL_INFO_STRUCT_VERSION;
  napi_value entry;
  if (napi_get_named_property(env, value, "BaseColorFactor", &entry) != napi_ok ||
      !read_float_array(env, entry, out->base_color_factor, 4, "BaseColorFactor needs four values") ||
      napi_get_named_property(env, value, "EmissiveFactor", &entry) != napi_ok ||
      !read_float_array(env, entry, out->emissive_factor, 3, "EmissiveFactor needs three values") ||
      napi_get_named_property(env, value, "SpecularColorFactor", &entry) != napi_ok ||
      !read_float_array(
        env, entry, out->specular_color_factor, 3, "SpecularColorFactor needs three values")) {
    return 0;
  }
  static const char* const names[] = {
    "MetallicFactor", "RoughnessFactor", "Ior", "SpecularFactor",
    "NormalScale", "OcclusionStrength", "AlphaCutoff",
  };
  float* const targets[] = {
    &out->metallic_factor, &out->roughness_factor, &out->ior, &out->specular_factor,
    &out->normal_scale, &out->occlusion_strength, &out->alpha_cutoff,
  };
  for (size_t index = 0; index < 7; index += 1) {
    double number = 0;
    if (napi_get_named_property(env, value, names[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &number) != napi_ok) {
      throw_message(env, "a CNB material needs its seven scalar factors");
      return 0;
    }
    *targets[index] = (float) number;
  }
  uint32_t alpha_mode = 0;
  bool double_sided = false;
  if (napi_get_named_property(env, value, "AlphaMode", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &alpha_mode) != napi_ok ||
      napi_get_named_property(env, value, "DoubleSided", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &double_sided) != napi_ok) {
    throw_message(env, "a CNB material needs AlphaMode and DoubleSided");
    return 0;
  }
  out->alpha_mode = alpha_mode;
  out->double_sided = double_sided ? CNA_TRUE : CNA_FALSE;
  return 1;
}


static napi_value cnb_model_get_material(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t part = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &part) != napi_ok) {
    return throw_message(env, "expected a CNB model and a part index");
  }
  CNA_CnbMaterialInfo material;
  memset(&material, 0, sizeof(material));
  material.struct_size = (uint32_t) sizeof(material);
  material.struct_version = CNA_CNB_MATERIAL_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_material(model, part, &material);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_material", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB material");
  if (!set_float_array(env, output, "BaseColorFactor", material.base_color_factor, 4) ||
      !set_float_array(env, output, "EmissiveFactor", material.emissive_factor, 3) ||
      !set_float_array(env, output, "SpecularColorFactor", material.specular_color_factor, 3) ||
      !set_number(env, output, "MetallicFactor", (double) material.metallic_factor) ||
      !set_number(env, output, "RoughnessFactor", (double) material.roughness_factor) ||
      !set_number(env, output, "Ior", (double) material.ior) ||
      !set_number(env, output, "SpecularFactor", (double) material.specular_factor) ||
      !set_number(env, output, "NormalScale", (double) material.normal_scale) ||
      !set_number(env, output, "OcclusionStrength", (double) material.occlusion_strength) ||
      !set_number(env, output, "AlphaCutoff", (double) material.alpha_cutoff) ||
      !set_u32(env, output, "AlphaMode", material.alpha_mode) ||
      !set_bool(env, output, "DoubleSided", material.double_sided != CNA_FALSE)) {
    return throw_napi(env, "CNB material");
  }
  return output;
}

static napi_value cnb_model_set_material(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle model = 0;
  uint32_t part = 0;
  CNA_CnbMaterialInfo material;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &part) != napi_ok) {
    return throw_message(env, "expected a CNB model, a part index and a material");
  }
  if (!read_material_info(env, args[2], &material)) return NULL;
  const CNA_Result result = g_api.cnb_model_set_material(model, part, &material);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_set_material", result);
  return undefined_result(env, "CNB material assignment");
}

static napi_value cnb_model_get_material_texture(napi_env env, napi_callback_info info) {
  napi_value args[3], output;
  CNA_Handle model = 0;
  uint32_t part = 0, slot = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &part) != napi_ok ||
      napi_get_value_uint32(env, args[2], &slot) != napi_ok) {
    return throw_message(env, "expected a CNB model, a part index and a texture slot");
  }
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_model_get_material_texture_size(model, part, slot, &required);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_model_get_material_texture_size", result);
  }
  if (required > SIZE_MAX - 1) return throw_message(env, "CNB texture name exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "CNB texture name allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_model_copy_material_texture(model, part, slot, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(
      env, "cna_cnb_model_copy_material_texture",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, "CNB texture name");
  }
  free(text);
  return output;
}

static napi_value cnb_model_set_material_texture(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle model = 0;
  uint32_t part = 0, slot = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &part) != napi_ok ||
      napi_get_value_uint32(env, args[2], &slot) != napi_ok) {
    return throw_message(env, "expected a CNB model, a part index, a slot and a name");
  }
  if (!read_utf8(env, args[3], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  const CNA_Result result = g_api.cnb_model_set_material_texture(model, part, slot, view);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cnb_model_set_material_texture", result);
  }
  return undefined_result(env, "CNB material texture");
}

static napi_value cnb_model_add_mesh(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  CNA_Handle model = 0;
  char* name = NULL;
  size_t name_length = 0;
  int32_t parent_bone = 0;
  uint32_t part_count = 0;
  bool is_array = false;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &model) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  if (napi_get_value_int32(env, args[2], &parent_bone) != napi_ok ||
      napi_is_array(env, args[3], &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, args[3], &part_count) != napi_ok) {
    free(name);
    return throw_message(env, "expected a parent bone and an array of part indexes");
  }
  uint32_t* parts = part_count == 0 ? NULL : (uint32_t*) malloc(part_count * sizeof(uint32_t));
  if (part_count != 0 && !parts) {
    free(name);
    return throw_message(env, "CNB mesh part allocation failed");
  }
  for (uint32_t index = 0; index < part_count; index += 1) {
    napi_value element;
    if (napi_get_element(env, args[3], index, &element) != napi_ok ||
        napi_get_value_uint32(env, element, &parts[index]) != napi_ok) {
      free(parts);
      free(name);
      return throw_message(env, "a CNB mesh part index must be an unsigned integer");
    }
  }
  const CNA_StringView view = {name, name_length};
  uint64_t index = 0;
  const CNA_Result result =
    g_api.cnb_model_add_mesh(model, view, parent_bone, parts, part_count, &index);
  free(parts);
  free(name);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_add_mesh", result);
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB mesh index");
  return output;
}

static napi_value cnb_model_get_mesh(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and a mesh index");
  }
  CNA_CnbMeshInfo mesh;
  memset(&mesh, 0, sizeof(mesh));
  mesh.struct_size = (uint32_t) sizeof(mesh);
  mesh.struct_version = CNA_CNB_MESH_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_mesh(model, index, &mesh);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_mesh", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB mesh");
  if (!set_i32(env, output, "ParentBone", mesh.parent_bone) ||
      !set_number(env, output, "PartIndexCount", (double) mesh.part_index_count)) {
    return throw_napi(env, "CNB mesh");
  }
  return output;
}

static napi_value cnb_model_copy_mesh_part_indices(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and a mesh index");
  }
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_model_copy_mesh_part_indices(model, index, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_model_copy_mesh_part_indices", result);
  }
  if (required > SIZE_MAX / sizeof(uint32_t)) {
    return throw_message(env, "CNB mesh part list exceeds the address space");
  }
  uint32_t* parts = required == 0 ? NULL : (uint32_t*) malloc((size_t) required * sizeof(uint32_t));
  if (required != 0 && !parts) return throw_message(env, "CNB mesh part allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_model_copy_mesh_part_indices(model, index, parts, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(parts);
    return throw_result(
      env, "cna_cnb_model_copy_mesh_part_indices",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_array_with_length(env, (size_t) produced, &output) != napi_ok) {
    free(parts);
    return throw_napi(env, "CNB mesh part list");
  }
  for (uint64_t element = 0; element < produced; element += 1) {
    napi_value number;
    if (napi_create_uint32(env, parts[element], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) element, number) != napi_ok) {
      free(parts);
      return throw_napi(env, "CNB mesh part list");
    }
  }
  free(parts);
  return output;
}

static napi_value cnb_model_set_skeleton(napi_env env, napi_callback_info info) {
  napi_value args[5];
  CNA_Handle model = 0;
  uint32_t joint_count = 0;
  bool is_array = false;
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      !read_handle(env, args[0], &model) ||
      napi_is_array(env, args[1], &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, args[1], &joint_count) != napi_ok) {
    return throw_message(env, "expected a CNB model and a joint hierarchy");
  }
  /*
   * One joint costs three 4x4 matrices. The cap is a bound on the arithmetic below rather than a
   * CNA limit: without it a 32-bit host could wrap the allocation size, and a caller asking for
   * more than a million joints has a defect rather than a model.
   */
  if (joint_count == 0 || joint_count > UINT32_C(1048576)) {
    return throw_message(env, "a CNB skeleton needs between one and 1048576 joints");
  }
  int32_t* hierarchy = (int32_t*) malloc(joint_count * sizeof(int32_t));
  float* matrices = (float*) malloc((size_t) joint_count * 3 * 16 * sizeof(float));
  if (!hierarchy || !matrices) {
    free(hierarchy);
    free(matrices);
    return throw_message(env, "CNB skeleton allocation failed");
  }
  int ok = 1;
  for (uint32_t index = 0; index < joint_count && ok; index += 1) {
    napi_value element;
    if (napi_get_element(env, args[1], index, &element) != napi_ok ||
        napi_get_value_int32(env, element, &hierarchy[index]) != napi_ok) {
      throw_message(env, "a CNB skeleton parent index must be a signed integer");
      ok = 0;
    }
  }
  /* Three matrix sets of sixteen floats per joint, in the order set_skeleton declares them. */
  for (uint32_t set = 0; set < 3 && ok; set += 1) {
    uint32_t length = 0;
    if (napi_is_array(env, args[2 + set], &is_array) != napi_ok || !is_array ||
        napi_get_array_length(env, args[2 + set], &length) != napi_ok ||
        length != joint_count * 16) {
      throw_message(env, "each CNB skeleton matrix set needs sixteen floats per joint");
      ok = 0;
      break;
    }
    if (!read_float_array(
          env, args[2 + set], matrices + ((size_t) set * joint_count * 16), length,
          "each CNB skeleton matrix set needs sixteen floats per joint")) {
      ok = 0;
    }
  }
  if (!ok) {
    free(hierarchy);
    free(matrices);
    return NULL;
  }
  const CNA_Result result = g_api.cnb_model_set_skeleton(
    model, hierarchy, joint_count,
    matrices, matrices + ((size_t) joint_count * 16), matrices + ((size_t) joint_count * 32));
  free(hierarchy);
  free(matrices);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_set_skeleton", result);
  return undefined_result(env, "CNB skeleton assignment");
}

static napi_value cnb_model_get_skeleton(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle model = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &model)) return NULL;
  CNA_CnbSkeletonInfo skeleton;
  memset(&skeleton, 0, sizeof(skeleton));
  skeleton.struct_size = (uint32_t) sizeof(skeleton);
  skeleton.struct_version = CNA_CNB_SKELETON_INFO_STRUCT_VERSION;
  const CNA_Result result = g_api.cnb_model_get_skeleton(model, &skeleton);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_skeleton", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB skeleton");
  if (!set_number(env, output, "JointCount", (double) skeleton.joint_count) ||
      !set_bool(env, output, "HasRootPrefix", skeleton.has_root_prefix != CNA_FALSE)) {
    return throw_napi(env, "CNB skeleton");
  }
  return output;
}

static napi_value cnb_model_copy_skeleton_hierarchy(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle model = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &model)) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_model_copy_skeleton_hierarchy(model, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_model_copy_skeleton_hierarchy", result);
  }
  if (required > SIZE_MAX / sizeof(int32_t)) {
    return throw_message(env, "CNB skeleton hierarchy exceeds the address space");
  }
  int32_t* parents = required == 0 ? NULL : (int32_t*) malloc((size_t) required * sizeof(int32_t));
  if (required != 0 && !parents) return throw_message(env, "CNB skeleton allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_model_copy_skeleton_hierarchy(model, parents, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(parents);
    return throw_result(
      env, "cna_cnb_model_copy_skeleton_hierarchy",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_array_with_length(env, (size_t) produced, &output) != napi_ok) {
    free(parents);
    return throw_napi(env, "CNB skeleton hierarchy");
  }
  for (uint64_t index = 0; index < produced; index += 1) {
    napi_value number;
    if (napi_create_int32(env, parents[index], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(parents);
      return throw_napi(env, "CNB skeleton hierarchy");
    }
  }
  free(parents);
  return output;
}

static napi_value cnb_model_copy_skeleton_matrices(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t set = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &set) != napi_ok) {
    return throw_message(env, "expected a CNB model and a matrix-set identity");
  }
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_model_copy_skeleton_matrices(model, set, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cnb_model_copy_skeleton_matrices", result);
  }
  if (required > SIZE_MAX / sizeof(float)) {
    return throw_message(env, "CNB skeleton matrices exceed the address space");
  }
  float* values = required == 0 ? NULL : (float*) malloc((size_t) required * sizeof(float));
  if (required != 0 && !values) return throw_message(env, "CNB skeleton allocation failed");
  uint64_t produced = 0;
  result = g_api.cnb_model_copy_skeleton_matrices(model, set, values, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(values);
    return throw_result(
      env, "cna_cnb_model_copy_skeleton_matrices",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_array_with_length(env, (size_t) produced, &output) != napi_ok) {
    free(values);
    return throw_napi(env, "CNB skeleton matrices");
  }
  for (uint64_t index = 0; index < produced; index += 1) {
    napi_value number;
    if (napi_create_double(env, (double) values[index], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(values);
      return throw_napi(env, "CNB skeleton matrices");
    }
  }
  free(values);
  return output;
}

static napi_value cnb_model_add_light(napi_env env, napi_callback_info info) {
  napi_value args[3], output;
  CNA_Handle model = 0;
  CNA_CnbModelLight light;
  memset(&light, 0, sizeof(light));
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &model) ||
      !read_float_array(env, args[1], light.direction, 3, "a CNB light needs a three-component direction") ||
      !read_float_array(env, args[2], light.diffuse_color, 3, "a CNB light needs a three-component colour")) {
    return NULL;
  }
  uint64_t index = 0;
  const CNA_Result result = g_api.cnb_model_add_light(model, &light, &index);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_add_light", result);
  NAPI_OR_RETURN(env, napi_create_double(env, (double) index, &output), "CNB light index");
  return output;
}

static napi_value cnb_model_get_light(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle model = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a CNB model and a light index");
  }
  CNA_CnbModelLight light;
  memset(&light, 0, sizeof(light));
  const CNA_Result result = g_api.cnb_model_get_light(model, index, &light);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_model_get_light", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "CNB light");
  if (!set_float_array(env, output, "Direction", light.direction, 3) ||
      !set_float_array(env, output, "DiffuseColor", light.diffuse_color, 3)) {
    return throw_napi(env, "CNB light");
  }
  return output;
}

static napi_value cnb_encode_model(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle model = 0;
  char* name = NULL;
  size_t name_length = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &model) ||
      !read_utf8(env, args[1], &name, &name_length)) return NULL;
  const CNA_StringView view = {name, name_length};
  uint64_t required = 0;
  CNA_Result result = g_api.cnb_encode_model(model, view, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    free(name);
    return throw_result(env, "cna_cnb_encode_model", result);
  }
  if (required > SIZE_MAX) {
    free(name);
    return throw_message(env, "CNB image exceeds the Node address space");
  }
  uint8_t* bytes = required == 0 ? NULL : (uint8_t*) malloc((size_t) required);
  if (required != 0 && !bytes) {
    free(name);
    return throw_message(env, "CNB image allocation failed");
  }
  uint64_t written = 0;
  result = g_api.cnb_encode_model(model, view, bytes, required, &written);
  free(name);
  if (result != CNA_RESULT_SUCCESS || written != required) {
    free(bytes);
    return throw_result(
      env, "cna_cnb_encode_model", result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  napi_value output = copy_bytes(env, bytes, (size_t) written, "CNB image copy");
  free(bytes);
  return output;
}

static napi_value cnb_decode_model(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle document = 0;
  CNA_CnbModelDataHandle model = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &document)) return NULL;
  const CNA_Result result = g_api.cnb_decode_model(document, &model);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_cnb_decode_model", result);
  return make_handle(env, model);
}

/* --- the engine layer's post-process chain --------------------------------------------------- */
/*
 * A chain and its passes. Two ownership rules from `engine_layer.h` are what shape this: a pass
 * added with `add_pass` stays the caller's and must outlive the chain's use of it, while
 * `add_owned_pass` *consumes* the handle -- the one route in the layer that invalidates a handle a
 * caller still holds. Both are exposed, distinctly, because collapsing them into a flag is how a
 * caller ends up double-freeing a pass.
 */

static int read_post_process_context(napi_env env, napi_value value, CNA_PostProcessContext* context) {
  CNA_Result result = g_api.post_process_context_init(context);
  if (result != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_post_process_context_init", result);
    return 0;
  }
  napi_value entry;
  int32_t width = 0, height = 0;
  if (napi_get_named_property(env, value, "Source", &entry) != napi_ok ||
      !read_handle_allow_zero(env, entry, &context->source) ||
      napi_get_named_property(env, value, "Destination", &entry) != napi_ok ||
      !read_handle_allow_zero(env, entry, &context->destination) ||
      napi_get_named_property(env, value, "Width", &entry) != napi_ok ||
      napi_get_value_int32(env, entry, &width) != napi_ok ||
      napi_get_named_property(env, value, "Height", &entry) != napi_ok ||
      napi_get_value_int32(env, entry, &height) != napi_ok) {
    throw_message(env, "a post-process frame needs Source, Destination, Width and Height");
    return 0;
  }
  context->width = width;
  context->height = height;
  static const char* const optional_handles[] = {"SourceDepth", "SourceNormals", "SourceVelocity"};
  CNA_Handle* const targets[] = {
    &context->source_depth, &context->source_normals, &context->source_velocity};
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, value, optional_handles[index], &entry) != napi_ok ||
        !read_handle_allow_zero(env, entry, targets[index])) {
      throw_message(env, "a post-process frame's optional inputs must be handles or zero");
      return 0;
    }
  }
  static const char* const scalars[] = {"ElapsedSeconds", "NearPlane", "FarPlane"};
  float* const scalar_targets[] = {&context->elapsed_seconds, &context->near_plane, &context->far_plane};
  for (size_t index = 0; index < 3; index += 1) {
    double scalar = 0;
    if (napi_get_named_property(env, value, scalars[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &scalar) != napi_ok) {
      throw_message(env, "a post-process frame's camera scalars must be numbers");
      return 0;
    }
    *scalar_targets[index] = (float) scalar;
  }
  return 1;
}

static napi_value pp_create(
  napi_env env, napi_callback_info info, PostProcessPassCreateFn route, const char* name
) {
  napi_value args[1];
  CNA_Handle device = 0;
  CNA_PostProcessPassHandle pass = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = route(device, &pass);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return make_handle(env, pass);
}

static napi_value pp_get_float(
  napi_env env, napi_callback_info info, HandleFloatOutFn route, const char* name
) {
  napi_value args[1], output;
  CNA_Handle pass = 0;
  float value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &pass)) return NULL;
  const CNA_Result result = route(pass, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_create_double(env, (double) value, &output), name);
  return output;
}

static napi_value pp_set_float(
  napi_env env, napi_callback_info info, HandleFloatFn route, const char* name
) {
  napi_value args[2];
  CNA_Handle pass = 0;
  double value = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) ||
      napi_get_value_double(env, args[1], &value) != napi_ok) {
    return throw_message(env, "expected a post-process pass and a number");
  }
  const CNA_Result result = route(pass, (float) value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value pp_get_i32(
  napi_env env, napi_callback_info info, HandleI32OutFn route, const char* name
) {
  napi_value args[1], output;
  CNA_Handle pass = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &pass)) return NULL;
  const CNA_Result result = route(pass, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), name);
  return output;
}

static napi_value pp_set_i32(
  napi_env env, napi_callback_info info, HandleI32Fn route, const char* name
) {
  napi_value args[2];
  CNA_Handle pass = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) ||
      napi_get_value_int32(env, args[1], &value) != napi_ok) {
    return throw_message(env, "expected a post-process pass and an integer");
  }
  const CNA_Result result = route(pass, value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value pp_get_bool(
  napi_env env, napi_callback_info info, BoolGetFn route, const char* name
) {
  napi_value args[1], output;
  CNA_Handle pass = 0;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &pass)) return NULL;
  const CNA_Result result = route(pass, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value != CNA_FALSE, &output), name);
  return output;
}

static napi_value pp_set_bool(
  napi_env env, napi_callback_info info, HandleBoolFn route, const char* name
) {
  napi_value args[2];
  CNA_Handle pass = 0;
  bool value = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) ||
      napi_get_value_bool(env, args[1], &value) != napi_ok) {
    return throw_message(env, "expected a post-process pass and a boolean");
  }
  const CNA_Result result = route(pass, value ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value pp_quality_i32(
  napi_env env, napi_callback_info info, U32ToI32OutFn route, const char* name
) {
  napi_value args[1], output;
  uint32_t quality = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &quality) != napi_ok) {
    return throw_message(env, "expected a render quality");
  }
  const CNA_Result result = route(quality, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), name);
  return output;
}

static napi_value pp_handle_only(
  napi_env env, napi_callback_info info, GameHandleFn route, const char* name
) {
  napi_value args[1];
  CNA_Handle handle = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  const CNA_Result result = route(handle);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value create_blit_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.blit_pass_create, "cna_blit_pass_create");
}

static napi_value create_bloom_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.bloom_pass_create, "cna_bloom_pass_create");
}

static napi_value create_tonemap_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.tonemap_pass_create, "cna_tonemap_pass_create");
}

static napi_value create_fxaa_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.fxaa_pass_create, "cna_fxaa_pass_create");
}

static napi_value create_ssao_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.ssao_pass_create, "cna_ssao_pass_create");
}

static napi_value create_ssr_pass(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.ssr_pass_create, "cna_ssr_pass_create");
}

static napi_value bloom_get_intensity_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.bloom_get_intensity, "cna_bloom_pass_get_intensity");
}

static napi_value bloom_set_intensity_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.bloom_set_intensity, "cna_bloom_pass_set_intensity");
}

static napi_value bloom_get_threshold_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.bloom_get_threshold, "cna_bloom_pass_get_threshold");
}

static napi_value bloom_set_threshold_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.bloom_set_threshold, "cna_bloom_pass_set_threshold");
}

static napi_value tonemap_get_exposure_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.tonemap_get_exposure, "cna_tonemap_pass_get_exposure");
}

static napi_value tonemap_set_exposure_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.tonemap_set_exposure, "cna_tonemap_pass_set_exposure");
}

static napi_value tonemap_get_gamma_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.tonemap_get_gamma, "cna_tonemap_pass_get_gamma");
}

static napi_value tonemap_set_gamma_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.tonemap_set_gamma, "cna_tonemap_pass_set_gamma");
}

static napi_value tonemap_get_deband_strength_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.tonemap_get_deband_strength, "cna_tonemap_pass_get_deband_strength");
}

static napi_value tonemap_set_deband_strength_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.tonemap_set_deband_strength, "cna_tonemap_pass_set_deband_strength");
}

static napi_value fxaa_get_edge_threshold_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.fxaa_get_edge_threshold, "cna_fxaa_pass_get_edge_threshold");
}

static napi_value fxaa_set_edge_threshold_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.fxaa_set_edge_threshold, "cna_fxaa_pass_set_edge_threshold");
}

static napi_value ssao_get_radius_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssao_get_radius, "cna_ssao_pass_get_radius");
}

static napi_value ssao_set_radius_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssao_set_radius, "cna_ssao_pass_set_radius");
}

static napi_value ssao_get_intensity_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssao_get_intensity, "cna_ssao_pass_get_intensity");
}

static napi_value ssao_set_intensity_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssao_set_intensity, "cna_ssao_pass_set_intensity");
}

static napi_value ssr_get_intensity_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_intensity, "cna_ssr_pass_get_intensity");
}

static napi_value ssr_set_intensity_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_intensity, "cna_ssr_pass_set_intensity");
}

static napi_value ssr_get_max_distance_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_max_distance, "cna_ssr_pass_get_max_distance");
}

static napi_value ssr_set_max_distance_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_max_distance, "cna_ssr_pass_set_max_distance");
}

static napi_value ssr_get_thickness_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_thickness, "cna_ssr_pass_get_thickness");
}

static napi_value ssr_set_thickness_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_thickness, "cna_ssr_pass_set_thickness");
}

static napi_value ssr_get_depth_bias_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_depth_bias, "cna_ssr_pass_get_depth_bias");
}

static napi_value ssr_set_depth_bias_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_depth_bias, "cna_ssr_pass_set_depth_bias");
}

static napi_value ssr_get_edge_fade_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_edge_fade, "cna_ssr_pass_get_edge_fade");
}

static napi_value ssr_set_edge_fade_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_edge_fade, "cna_ssr_pass_set_edge_fade");
}

static napi_value ssr_get_roughness_blur_value(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.ssr_get_roughness_blur, "cna_ssr_pass_get_roughness_blur");
}

static napi_value ssr_set_roughness_blur_value(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.ssr_set_roughness_blur, "cna_ssr_pass_set_roughness_blur");
}

static napi_value bloom_get_iterations_value(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.bloom_get_iterations, "cna_bloom_pass_get_iterations");
}

static napi_value bloom_set_iterations_value(napi_env env, napi_callback_info info) {
  return pp_set_i32(env, info, g_api.bloom_set_iterations, "cna_bloom_pass_set_iterations");
}

static napi_value ssao_get_sample_count_value(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.ssao_get_sample_count, "cna_ssao_pass_get_sample_count");
}

static napi_value ssao_set_sample_count_value(napi_env env, napi_callback_info info) {
  return pp_set_i32(env, info, g_api.ssao_set_sample_count, "cna_ssao_pass_set_sample_count");
}

static napi_value ssr_get_step_count_value(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.ssr_get_step_count, "cna_ssr_pass_get_step_count");
}

static napi_value ssr_set_step_count_value(napi_env env, napi_callback_info info) {
  return pp_set_i32(env, info, g_api.ssr_set_step_count, "cna_ssr_pass_set_step_count");
}

static napi_value ssao_get_half_resolution_value(napi_env env, napi_callback_info info) {
  return pp_get_bool(env, info, g_api.ssao_get_half_resolution, "cna_ssao_pass_get_half_resolution");
}

static napi_value ssao_set_half_resolution_value(napi_env env, napi_callback_info info) {
  return pp_set_bool(env, info, g_api.ssao_set_half_resolution, "cna_ssao_pass_set_half_resolution");
}

static napi_value tonemap_get_mode_value(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle pass = 0;
  uint32_t mode = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &pass)) return NULL;
  const CNA_Result result = g_api.tonemap_get_mode(pass, &mode);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_tonemap_pass_get_mode", result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, mode, &output), "tonemapping mode");
  return output;
}

static napi_value tonemap_set_mode_value(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle pass = 0;
  uint32_t mode = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) ||
      napi_get_value_uint32(env, args[1], &mode) != napi_ok) {
    return throw_message(env, "expected a tonemap pass and a mode");
  }
  const CNA_Result result = g_api.tonemap_set_mode(pass, mode);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_tonemap_pass_set_mode", result);
  return undefined_result(env, "tonemapping mode");
}

static napi_value tonemap_get_deband_enabled_value(napi_env env, napi_callback_info info) {
  return pp_get_bool(env, info, g_api.tonemap_is_deband_enabled, "cna_tonemap_pass_is_deband_enabled");
}

static napi_value tonemap_set_deband_enabled_value(napi_env env, napi_callback_info info) {
  return pp_set_bool(env, info, g_api.tonemap_set_deband_enabled, "cna_tonemap_pass_set_deband_enabled");
}

static napi_value bloom_iterations_for_quality_value(napi_env env, napi_callback_info info) {
  return pp_quality_i32(
    env, info, g_api.bloom_iterations_for_quality, "cna_bloom_pass_iterations_for_quality");
}

static napi_value ssao_sample_count_for_quality_value(napi_env env, napi_callback_info info) {
  return pp_quality_i32(
    env, info, g_api.ssao_sample_count_for_quality, "cna_ssao_pass_sample_count_for_quality");
}

static napi_value fxaa_edge_threshold_for_quality_value(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  uint32_t quality = 0;
  float value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &quality) != napi_ok) {
    return throw_message(env, "expected a render quality");
  }
  const CNA_Result result = g_api.fxaa_edge_threshold_for_quality(quality, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_fxaa_pass_edge_threshold_for_quality", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) value, &output), "FXAA edge threshold");
  return output;
}

static napi_value bloom_reset_targets_value(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.bloom_reset_targets, "cna_bloom_pass_reset_targets");
}

static napi_value ssao_reset_targets_value(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.ssao_reset_targets, "cna_ssao_pass_reset_targets");
}

static napi_value post_process_pass_apply(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle pass = 0;
  CNA_PostProcessContext context;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) ||
      !read_post_process_context(env, args[1], &context)) return NULL;
  const CNA_Result result = g_api.post_process_pass_apply(pass, &context);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_post_process_pass_apply", result);
  return undefined_result(env, "post-process pass");
}

static napi_value post_process_pass_name(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle pass = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &pass)) return NULL;
  /* One route for both halves: a null destination with zero capacity asks for the size. */
  uint64_t length = 0;
  CNA_Result result = g_api.post_process_pass_copy_name(pass, NULL, 0, &length);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_post_process_pass_copy_name", result);
  }
  if (length > SIZE_MAX - 1) return throw_message(env, "a pass name exceeds the address space");
  char* name = (char*) malloc((size_t) length + 1);
  if (!name) return throw_message(env, "pass-name allocation failed");
  uint64_t copied = 0;
  result = g_api.post_process_pass_copy_name(pass, name, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(name);
    return throw_result(
      env, "cna_post_process_pass_copy_name",
      result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  name[length] = '\0';
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, name, (size_t) length, &output);
  free(name);
  if (status != napi_ok) return throw_napi(env, "pass name");
  return output;
}

static napi_value post_process_pass_supported(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle pass = 0, device = 0;
  CNA_Bool supported = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &pass) || !read_handle(env, args[1], &device)) return NULL;
  const CNA_Result result = g_api.post_process_pass_is_supported(pass, device, &supported);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_post_process_pass_is_supported", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, supported != CNA_FALSE, &output), "pass support");
  return output;
}

static napi_value post_process_pass_release(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.post_process_pass_destroy, "cna_post_process_pass_destroy");
}

static napi_value post_process_chain_create(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0;
  CNA_PostProcessChainHandle chain = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.post_process_chain_create(device, &chain);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_post_process_chain_create", result);
  return make_handle(env, chain);
}

static napi_value post_process_chain_release(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.post_process_chain_destroy, "cna_post_process_chain_destroy");
}

static napi_value post_process_chain_clear(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.post_process_chain_clear, "cna_post_process_chain_clear");
}

static napi_value post_process_chain_reset_targets(napi_env env, napi_callback_info info) {
  return pp_handle_only(
    env, info, g_api.post_process_chain_reset_targets, "cna_post_process_chain_reset_targets");
}

static napi_value post_process_chain_two_handles(
  napi_env env, napi_callback_info info, TwoHandleFn route, const char* name
) {
  napi_value args[2];
  CNA_Handle chain = 0, pass = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &chain) || !read_handle(env, args[1], &pass)) return NULL;
  const CNA_Result result = route(chain, pass);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value post_process_chain_add_pass(napi_env env, napi_callback_info info) {
  return post_process_chain_two_handles(
    env, info, g_api.post_process_chain_add_pass, "cna_post_process_chain_add_pass");
}

static napi_value post_process_chain_add_owned_pass(napi_env env, napi_callback_info info) {
  return post_process_chain_two_handles(
    env, info, g_api.post_process_chain_add_owned_pass, "cna_post_process_chain_add_owned_pass");
}

static napi_value post_process_chain_pass_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(
    env, info, g_api.post_process_chain_get_pass_count, "cna_post_process_chain_get_pass_count");
}

static napi_value post_process_chain_get_gpu_timing(napi_env env, napi_callback_info info) {
  return pp_get_bool(
    env, info, g_api.post_process_chain_is_gpu_timing_enabled,
    "cna_post_process_chain_is_gpu_timing_enabled");
}

static napi_value post_process_chain_set_gpu_timing(napi_env env, napi_callback_info info) {
  return pp_set_bool(
    env, info, g_api.post_process_chain_set_gpu_timing_enabled,
    "cna_post_process_chain_set_gpu_timing_enabled");
}

static napi_value post_process_chain_apply(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle chain = 0;
  CNA_PostProcessContext context;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &chain) ||
      !read_post_process_context(env, args[1], &context)) return NULL;
  const CNA_Result result = g_api.post_process_chain_apply(chain, &context);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_post_process_chain_apply", result);
  return undefined_result(env, "post-process chain");
}

static napi_value post_process_chain_timings(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle chain = 0;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &chain)) return NULL;
  CNA_Result result = g_api.post_process_chain_get_pass_timing_count(chain, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_post_process_chain_get_pass_timing_count", result);
  }
  if (count > UINT32_MAX) return throw_message(env, "too many recorded pass timings");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "pass timings");
  for (uint64_t index = 0; index < count; index += 1) {
    CNA_PassTimingEXT timing;
    memset(&timing, 0, sizeof(timing));
    timing.struct_size = sizeof(timing);
    timing.struct_version = 1;
    result = g_api.post_process_chain_get_pass_timing(chain, index, &timing);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_post_process_chain_get_pass_timing", result);
    }
    uint64_t length = 0;
    result = g_api.post_process_chain_copy_pass_timing_name(chain, index, NULL, 0, &length);
    if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
      return throw_result(env, "cna_post_process_chain_copy_pass_timing_name", result);
    }
    if (length > SIZE_MAX - 1) return throw_message(env, "a pass name exceeds the address space");
    char* name = (char*) malloc((size_t) length + 1);
    if (!name) return throw_message(env, "pass-name allocation failed");
    uint64_t copied = 0;
    result = g_api.post_process_chain_copy_pass_timing_name(chain, index, name, length, &copied);
    if (result != CNA_RESULT_SUCCESS || copied != length) {
      free(name);
      return throw_result(
        env, "cna_post_process_chain_copy_pass_timing_name",
        result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
    }
    name[length] = '\0';
    napi_value entry, name_value;
    const napi_status status = napi_create_string_utf8(env, name, (size_t) length, &name_value);
    free(name);
    if (status != napi_ok) return throw_napi(env, "pass name");
    if (napi_create_object(env, &entry) != napi_ok ||
        !set_i32_property(env, entry, "SampleCount", timing.sample_count) ||
        !set_double_property(env, entry, "Milliseconds", timing.milliseconds) ||
        napi_set_named_property(env, entry, "Name", name_value) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      return throw_napi(env, "pass timing");
    }
  }
  return output;
}

/*
 * The frame a VideoPlayer currently holds, with the identity a caller needs to track it.
 *
 * `cna_video_player_get_texture` hands back a fresh handle every call, so two calls against one
 * undecoded frame look exactly like two calls across a frame advance. `generation` is what settles
 * that: it changes only when a frame is actually decoded, and it is monotonic for the player's
 * whole life -- neither Stop nor playing a different video restarts it.
 */
static napi_value get_video_player_frame(napi_env env, napi_callback_info info) {
  napi_value args[1], output, generation_value;
  CNA_Handle player = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &player)) return NULL;
  CNA_VideoFrameEXT frame;
  memset(&frame, 0, sizeof(frame));
  frame.struct_size = sizeof(frame);
  frame.struct_version = CNA_VIDEO_FRAME_EXT_STRUCT_VERSION;
  const CNA_Result result = g_api.video_player_get_frame(player, &frame);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_video_player_get_frame_ext", result);
  }
  napi_value texture_value = make_handle(env, frame.texture);
  if (!texture_value) return NULL;
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "video frame");
  /* The generation is a uint64 and stays one: a frame count that outgrew a double would start
     comparing equal to itself, which is the one thing this field exists to prevent. */
  NAPI_OR_RETURN(
    env, napi_create_bigint_uint64(env, frame.generation, &generation_value), "video frame");
  if (!set_bool_property(env, output, "IsAvailable", frame.available) ||
      !set_double_property(env, output, "PresentationTimeSeconds", frame.presentation_time) ||
      napi_set_named_property(env, output, "Texture", texture_value) != napi_ok ||
      napi_set_named_property(env, output, "Generation", generation_value) != napi_ok) {
    return throw_napi(env, "video frame");
  }
  return output;
}

/* --- the engine layer's clustered lighting ---------------------------------------------------- */
/*
 * A light set, a cluster grid, the assignment between them, and the shadow-budget policy that
 * decides which of those lights is worth a shadow map. All four are pure CPU objects: they compute
 * on a graphics device handle but touch no GPU state, so they answer identically on HEADLESS and
 * on a windowed renderer -- which is what lets the qualification assert exact numbers on the
 * default backend rather than only under Xvfb.
 *
 * `engine_layer.h` names the first parameter of all four creates `game` and documents it as "the
 * owning game". It is not: each one borrows a graphics device from that handle, and an actual game
 * handle is refused with INVALID_HANDLE. Measured on all four; see
 * docs/upstream-cna-findings.md. This bridge passes a device, because that is what works.
 */

static int read_matrix16(napi_env env, napi_value value, CNA_Matrix* out, const char* what) {
  bool is_array = false;
  uint32_t length = 0;
  if (napi_is_array(env, value, &is_array) != napi_ok || !is_array ||
      napi_get_array_length(env, value, &length) != napi_ok || length != 16) {
    throw_message(env, what);
    return 0;
  }
  float* const fields[] = {
    &out->m11, &out->m12, &out->m13, &out->m14,
    &out->m21, &out->m22, &out->m23, &out->m24,
    &out->m31, &out->m32, &out->m33, &out->m34,
    &out->m41, &out->m42, &out->m43, &out->m44,
  };
  for (uint32_t index = 0; index < 16; index += 1) {
    napi_value element;
    double number = 0;
    if (napi_get_element(env, value, index, &element) != napi_ok ||
        napi_get_value_double(env, element, &number) != napi_ok) {
      throw_message(env, what);
      return 0;
    }
    *fields[index] = (float) number;
  }
  return 1;
}

static napi_value make_matrix16(napi_env env, const CNA_Matrix* matrix, const char* operation) {
  const float values[16] = {
    matrix->m11, matrix->m12, matrix->m13, matrix->m14,
    matrix->m21, matrix->m22, matrix->m23, matrix->m24,
    matrix->m31, matrix->m32, matrix->m33, matrix->m34,
    matrix->m41, matrix->m42, matrix->m43, matrix->m44,
  };
  napi_value output;
  if (napi_create_array_with_length(env, 16, &output) != napi_ok) {
    return throw_napi(env, operation);
  }
  for (uint32_t index = 0; index < 16; index += 1) {
    napi_value number;
    if (napi_create_double(env, (double) values[index], &number) != napi_ok ||
        napi_set_element(env, output, index, number) != napi_ok) {
      return throw_napi(env, operation);
    }
  }
  return output;
}

/* A clustered light in the uniform shape CNA stores every light in. */
static int read_clustered_light(napi_env env, napi_value value, CNA_ClusteredLightEXT* light) {
  const CNA_Result initialized = g_api.clustered_light_ext_init(light);
  if (initialized != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_clustered_light_ext_init", initialized);
    return 0;
  }
  napi_value entry;
  uint32_t type = 0;
  double scalars[4] = {0, 0, 0, 0};
  static const char* const names[] = {"Intensity", "Range", "InnerAngle", "OuterAngle"};
  bool castsShadows = false;
  if (napi_get_named_property(env, value, "Type", &entry) != napi_ok ||
      napi_get_value_uint32(env, entry, &type) != napi_ok ||
      !read_vector3(env, value, "Position", &light->position) ||
      !read_vector3(env, value, "Direction", &light->direction) ||
      !read_vector3(env, value, "Color", &light->color)) {
    throw_message(env, "a clustered light needs Type, Position, Direction and Color");
    return 0;
  }
  for (size_t index = 0; index < 4; index += 1) {
    if (napi_get_named_property(env, value, names[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &scalars[index]) != napi_ok) {
      throw_message(env, "a clustered light's scalars must be numbers");
      return 0;
    }
  }
  if (napi_get_named_property(env, value, "CastsShadows", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &castsShadows) != napi_ok) {
    throw_message(env, "a clustered light's CastsShadows must be a boolean");
    return 0;
  }
  light->type = type;
  light->intensity = (float) scalars[0];
  light->range = (float) scalars[1];
  light->inner_angle = (float) scalars[2];
  light->outer_angle = (float) scalars[3];
  light->casts_shadows = castsShadows ? CNA_TRUE : CNA_FALSE;
  return 1;
}

static napi_value make_clustered_light(napi_env env, const CNA_ClusteredLightEXT* light) {
  napi_value output, number, flag;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "clustered light");
  if (napi_create_uint32(env, light->type, &number) != napi_ok ||
      napi_set_named_property(env, output, "Type", number) != napi_ok ||
      !set_vector3(env, output, "Position", &light->position) ||
      !set_vector3(env, output, "Direction", &light->direction) ||
      !set_vector3(env, output, "Color", &light->color)) {
    return throw_napi(env, "clustered light");
  }
  const float scalars[4] = {
    light->intensity, light->range, light->inner_angle, light->outer_angle};
  static const char* const names[] = {"Intensity", "Range", "InnerAngle", "OuterAngle"};
  for (size_t index = 0; index < 4; index += 1) {
    if (napi_create_double(env, (double) scalars[index], &number) != napi_ok ||
        napi_set_named_property(env, output, names[index], number) != napi_ok) {
      return throw_napi(env, "clustered light");
    }
  }
  if (napi_get_boolean(env, light->casts_shadows == CNA_TRUE, &flag) != napi_ok ||
      napi_set_named_property(env, output, "CastsShadows", flag) != napi_ok) {
    return throw_napi(env, "clustered light");
  }
  return output;
}

static napi_value make_bounding_sphere(napi_env env, const CNA_BoundingSphere* sphere) {
  napi_value output, radius;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "bounding sphere");
  if (!set_vector3(env, output, "Center", &sphere->center) ||
      napi_create_double(env, (double) sphere->radius, &radius) != napi_ok ||
      napi_set_named_property(env, output, "Radius", radius) != napi_ok) {
    return throw_napi(env, "bounding sphere");
  }
  return output;
}

static napi_value clustered_light_is_usable(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_ClusteredLightEXT light;
  CNA_Bool usable = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_clustered_light(env, args[0], &light)) return NULL;
  const CNA_Result result = g_api.clustered_light_set_is_usable(&light, &usable);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_is_usable", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, usable == CNA_TRUE, &output), "light usability");
  return output;
}

static napi_value clustered_light_set_create(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.clustered_light_set_create, "cna_clustered_light_set_create");
}

static napi_value clustered_light_set_add(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle set = 0;
  CNA_ClusteredLightEXT light;
  int32_t index = -1;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &set) ||
      !read_clustered_light(env, args[1], &light)) return NULL;
  const CNA_Result result = g_api.clustered_light_set_add(set, &light, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_add", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, index, &output), "light index");
  return output;
}

/*
 * The two shaped adds. CNA converts a point or a spot into its uniform clustered shape itself, and
 * these exist so that conversion stays CNA's -- filling a point light's unused direction and cone
 * angles here would be this binding quietly restating a rule it does not own.
 */
static napi_value clustered_light_set_add_point(napi_env env, napi_callback_info info) {
  napi_value args[2], entry, output;
  CNA_Handle set = 0;
  CNA_PointLightEXT light;
  int32_t index = -1;
  double intensity = 0, range = 0;
  bool castsShadows = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &set)) return NULL;
  const CNA_Result initialized = g_api.point_light_ext_init(&light);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_point_light_ext_init", initialized);
  }
  if (!read_vector3(env, args[1], "Position", &light.position) ||
      !read_vector3(env, args[1], "Color", &light.color) ||
      napi_get_named_property(env, args[1], "Intensity", &entry) != napi_ok ||
      napi_get_value_double(env, entry, &intensity) != napi_ok ||
      napi_get_named_property(env, args[1], "Range", &entry) != napi_ok ||
      napi_get_value_double(env, entry, &range) != napi_ok ||
      napi_get_named_property(env, args[1], "CastsShadows", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &castsShadows) != napi_ok) {
    return throw_message(
      env, "a point light needs Position, Color, Intensity, Range and CastsShadows");
  }
  light.intensity = (float) intensity;
  light.range = (float) range;
  light.casts_shadows = castsShadows ? CNA_TRUE : CNA_FALSE;
  const CNA_Result result = g_api.clustered_light_set_add_point(set, &light, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_add_point", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, index, &output), "light index");
  return output;
}

static napi_value clustered_light_set_add_spot(napi_env env, napi_callback_info info) {
  napi_value args[2], entry, output;
  CNA_Handle set = 0;
  CNA_SpotLightEXT light;
  int32_t index = -1;
  double scalars[4] = {0, 0, 0, 0};
  static const char* const names[] = {"Intensity", "Range", "InnerAngle", "OuterAngle"};
  bool castsShadows = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &set)) return NULL;
  const CNA_Result initialized = g_api.spot_light_ext_init(&light);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_spot_light_ext_init", initialized);
  }
  if (!read_vector3(env, args[1], "Position", &light.position) ||
      !read_vector3(env, args[1], "Direction", &light.direction) ||
      !read_vector3(env, args[1], "Color", &light.color)) {
    return throw_message(env, "a spot light needs Position, Direction and Color");
  }
  for (size_t index2 = 0; index2 < 4; index2 += 1) {
    if (napi_get_named_property(env, args[1], names[index2], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &scalars[index2]) != napi_ok) {
      return throw_message(env, "a spot light's scalars must be numbers");
    }
  }
  if (napi_get_named_property(env, args[1], "CastsShadows", &entry) != napi_ok ||
      napi_get_value_bool(env, entry, &castsShadows) != napi_ok) {
    return throw_message(env, "a spot light's CastsShadows must be a boolean");
  }
  light.intensity = (float) scalars[0];
  light.range = (float) scalars[1];
  light.inner_angle = (float) scalars[2];
  light.outer_angle = (float) scalars[3];
  light.casts_shadows = castsShadows ? CNA_TRUE : CNA_FALSE;
  const CNA_Result result = g_api.clustered_light_set_add_spot(set, &light, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_add_spot", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, index, &output), "light index");
  return output;
}

static napi_value clustered_light_set_replace_at(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle set = 0;
  int32_t index = 0;
  CNA_ClusteredLightEXT light;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &set) ||
      napi_get_value_int32(env, args[1], &index) != napi_ok ||
      !read_clustered_light(env, args[2], &light)) return NULL;
  const CNA_Result result = g_api.clustered_light_set_replace_at(set, index, &light);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_replace_at", result);
  }
  return undefined_result(env, "cna_clustered_light_set_replace_at");
}

static napi_value clustered_light_set_remove_at(napi_env env, napi_callback_info info) {
  return pp_set_i32(env, info, g_api.clustered_light_set_remove_at,
    "cna_clustered_light_set_remove_at");
}
static napi_value clustered_light_set_clear(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_light_set_clear,
    "cna_clustered_light_set_clear");
}
static napi_value clustered_light_set_get_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_light_set_get_count,
    "cna_clustered_light_set_get_count");
}
static napi_value clustered_light_set_is_empty(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.clustered_light_set_is_empty,
    "cna_clustered_light_set_is_empty");
}
static napi_value clustered_light_set_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_light_set_destroy,
    "cna_clustered_light_set_destroy");
}

static napi_value clustered_light_set_get_at(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle set = 0;
  int32_t index = 0;
  CNA_ClusteredLightEXT light;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &set) ||
      napi_get_value_int32(env, args[1], &index) != napi_ok) return NULL;
  const CNA_Result initialized = g_api.clustered_light_ext_init(&light);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_ext_init", initialized);
  }
  const CNA_Result result = g_api.clustered_light_set_get_at(set, index, &light);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_get_at", result);
  }
  return make_clustered_light(env, &light);
}

static napi_value clustered_light_set_get_bounds_at(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle set = 0;
  int32_t index = 0;
  CNA_BoundingSphere sphere;
  memset(&sphere, 0, sizeof(sphere));
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &set) ||
      napi_get_value_int32(env, args[1], &index) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_light_set_get_bounds_at(set, index, &sphere);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_get_bounds_at", result);
  }
  return make_bounding_sphere(env, &sphere);
}

/*
 * The two bulk copies. Both ask CNA for the count first with a zero capacity, so the array this
 * allocates is the size CNA reports rather than one the caller guessed.
 */
static napi_value clustered_light_set_copy_lights(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle set = 0;
  int32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &set)) return NULL;
  CNA_Result result = g_api.clustered_light_set_get_count(set, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_get_count", result);
  }
  if (count < 0) return throw_message(env, "CNA reported a negative light count");
  CNA_ClusteredLightEXT* lights = count == 0
    ? NULL : (CNA_ClusteredLightEXT*) malloc((size_t) count * sizeof(CNA_ClusteredLightEXT));
  if (count != 0 && !lights) return throw_message(env, "light-array allocation failed");
  for (int32_t index = 0; index < count; index += 1) {
    if (g_api.clustered_light_ext_init(&lights[index]) != CNA_RESULT_SUCCESS) {
      free(lights);
      return throw_message(env, "a clustered light could not be initialised");
    }
  }
  uint64_t produced = 0;
  result = g_api.clustered_light_set_copy_lights(set, lights, (uint64_t) count, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != (uint64_t) count) {
    free(lights);
    return throw_result(env, "cna_clustered_light_set_copy_lights", result);
  }
  if (napi_create_array_with_length(env, (size_t) count, &output) != napi_ok) {
    free(lights);
    return throw_napi(env, "clustered light array");
  }
  for (int32_t index = 0; index < count; index += 1) {
    napi_value element = make_clustered_light(env, &lights[index]);
    if (element == NULL || napi_set_element(env, output, (uint32_t) index, element) != napi_ok) {
      free(lights);
      return NULL;
    }
  }
  free(lights);
  return output;
}

static napi_value clustered_light_set_copy_bounds(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle set = 0;
  int32_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &set)) return NULL;
  CNA_Result result = g_api.clustered_light_set_get_count(set, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_set_get_count", result);
  }
  if (count < 0) return throw_message(env, "CNA reported a negative light count");
  CNA_BoundingSphere* spheres = count == 0
    ? NULL : (CNA_BoundingSphere*) calloc((size_t) count, sizeof(CNA_BoundingSphere));
  if (count != 0 && !spheres) return throw_message(env, "bounds-array allocation failed");
  uint64_t produced = 0;
  result = g_api.clustered_light_set_copy_bounds(set, spheres, (uint64_t) count, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != (uint64_t) count) {
    free(spheres);
    return throw_result(env, "cna_clustered_light_set_copy_bounds", result);
  }
  if (napi_create_array_with_length(env, (size_t) count, &output) != napi_ok) {
    free(spheres);
    return throw_napi(env, "bounding sphere array");
  }
  for (int32_t index = 0; index < count; index += 1) {
    napi_value element = make_bounding_sphere(env, &spheres[index]);
    if (element == NULL || napi_set_element(env, output, (uint32_t) index, element) != napi_ok) {
      free(spheres);
      return NULL;
    }
  }
  free(spheres);
  return output;
}

/* --- the cluster grid --- */

static napi_value clustered_light_grid_create(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0, grid = 0;
  int32_t tilesX = 0, tilesY = 0, slices = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &tilesX) != napi_ok ||
      napi_get_value_int32(env, args[2], &tilesY) != napi_ok ||
      napi_get_value_int32(env, args[3], &slices) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.clustered_light_grid_create(device, tilesX, tilesY, slices, &grid);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_create", result);
  }
  return make_handle(env, grid);
}

static napi_value clustered_light_grid_get_tiles_x(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_light_grid_get_tiles_x,
    "cna_clustered_light_grid_get_tiles_x");
}
static napi_value clustered_light_grid_get_tiles_y(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_light_grid_get_tiles_y,
    "cna_clustered_light_grid_get_tiles_y");
}
static napi_value clustered_light_grid_get_slice_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_light_grid_get_slice_count,
    "cna_clustered_light_grid_get_slice_count");
}
static napi_value clustered_light_grid_get_cluster_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_light_grid_get_cluster_count,
    "cna_clustered_light_grid_get_cluster_count");
}
static napi_value clustered_light_grid_has_projection(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.clustered_light_grid_has_projection,
    "cna_clustered_light_grid_has_projection");
}
static napi_value clustered_light_grid_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_light_grid_destroy,
    "cna_clustered_light_grid_destroy");
}

static napi_value clustered_light_grid_get_near_plane(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.clustered_light_grid_get_near_plane,
    "cna_clustered_light_grid_get_near_plane");
}
static napi_value clustered_light_grid_get_far_plane(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.clustered_light_grid_get_far_plane,
    "cna_clustered_light_grid_get_far_plane");
}

static napi_value clustered_light_grid_cluster_index(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  CNA_Handle grid = 0;
  int32_t x = 0, y = 0, slice = 0, index = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &grid) ||
      napi_get_value_int32(env, args[1], &x) != napi_ok ||
      napi_get_value_int32(env, args[2], &y) != napi_ok ||
      napi_get_value_int32(env, args[3], &slice) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_light_grid_cluster_index(grid, x, y, slice, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_cluster_index", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, index, &output), "cluster index");
  return output;
}

static napi_value clustered_light_grid_set_projection(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle grid = 0;
  CNA_Matrix projection;
  double nearPlane = 0, farPlane = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &grid) ||
      !read_matrix16(env, args[1], &projection, "a projection must be a 16-number array") ||
      napi_get_value_double(env, args[2], &nearPlane) != napi_ok ||
      napi_get_value_double(env, args[3], &farPlane) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_light_grid_set_projection(
    grid, &projection, (float) nearPlane, (float) farPlane);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_set_projection", result);
  }
  return undefined_result(env, "cna_clustered_light_grid_set_projection");
}

static napi_value clustered_light_grid_get_inverse_projection(
  napi_env env, napi_callback_info info
) {
  napi_value args[1];
  CNA_Handle grid = 0;
  CNA_Matrix matrix;
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &grid)) return NULL;
  const CNA_Result result = g_api.clustered_light_grid_get_inverse_projection(grid, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_get_inverse_projection", result);
  }
  return make_matrix16(env, &matrix, "inverse projection");
}

static napi_value clustered_light_grid_slice_distance(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle grid = 0;
  int32_t slice = 0;
  float distance = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &grid) ||
      napi_get_value_int32(env, args[1], &slice) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_light_grid_slice_distance(grid, slice, &distance);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_slice_distance", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) distance, &output), "slice distance");
  return output;
}

static napi_value clustered_light_grid_slice_for_view_distance(
  napi_env env, napi_callback_info info
) {
  napi_value args[2], output;
  CNA_Handle grid = 0;
  double distance = 0;
  int32_t slice = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &grid) ||
      napi_get_value_double(env, args[1], &distance) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.clustered_light_grid_slice_for_view_distance(grid, (float) distance, &slice);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_slice_for_view_distance", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, slice, &output), "slice for distance");
  return output;
}

static napi_value clustered_light_grid_cluster_bounds(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  CNA_Handle grid = 0;
  int32_t x = 0, y = 0, slice = 0;
  CNA_BoundingBox box;
  memset(&box, 0, sizeof(box));
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &grid) ||
      napi_get_value_int32(env, args[1], &x) != napi_ok ||
      napi_get_value_int32(env, args[2], &y) != napi_ok ||
      napi_get_value_int32(env, args[3], &slice) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_light_grid_cluster_bounds(grid, x, y, slice, &box);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_grid_cluster_bounds", result);
  }
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "cluster bounds");
  if (!set_vector3(env, output, "Min", &box.min) ||
      !set_vector3(env, output, "Max", &box.max)) {
    return throw_napi(env, "cluster bounds");
  }
  return output;
}

/* --- the assignment --- */

static napi_value clustered_light_assignment_create(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.clustered_light_assignment_create,
    "cna_clustered_light_assignment_create");
}
static napi_value clustered_light_assignment_clear(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_light_assignment_clear,
    "cna_clustered_light_assignment_clear");
}
static napi_value clustered_light_assignment_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_light_assignment_destroy,
    "cna_clustered_light_assignment_destroy");
}
static napi_value clustered_light_assignment_get_light_count(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_light_assignment_get_light_count,
    "cna_clustered_light_assignment_get_light_count");
}
static napi_value clustered_light_assignment_get_cluster_count(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_light_assignment_get_cluster_count,
    "cna_clustered_light_assignment_get_cluster_count");
}
static napi_value clustered_light_assignment_get_total_reference_count(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_light_assignment_get_total_reference_count,
    "cna_clustered_light_assignment_get_total_reference_count");
}
static napi_value clustered_light_assignment_get_max_lights_per_cluster(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_light_assignment_get_max_lights_per_cluster,
    "cna_clustered_light_assignment_get_max_lights_per_cluster");
}

static napi_value clustered_light_assignment_assign(napi_env env, napi_callback_info info) {
  napi_value args[4], element, entry;
  CNA_Handle assignment = 0, grid = 0;
  CNA_Matrix view;
  uint32_t count = 0;
  bool isArray = false;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &assignment) ||
      !read_handle(env, args[1], &grid) ||
      !read_matrix16(env, args[2], &view, "a view matrix must be a 16-number array")) return NULL;
  if (napi_is_array(env, args[3], &isArray) != napi_ok || !isArray ||
      napi_get_array_length(env, args[3], &count) != napi_ok) {
    return throw_message(env, "the light bounds must be an array of spheres");
  }
  CNA_BoundingSphere* spheres = count == 0
    ? NULL : (CNA_BoundingSphere*) calloc(count, sizeof(CNA_BoundingSphere));
  if (count != 0 && !spheres) return throw_message(env, "bounds-array allocation failed");
  for (uint32_t index = 0; index < count; index += 1) {
    double radius = 0;
    if (napi_get_element(env, args[3], index, &element) != napi_ok ||
        !read_vector3(env, element, "Center", &spheres[index].center) ||
        napi_get_named_property(env, element, "Radius", &entry) != napi_ok ||
        napi_get_value_double(env, entry, &radius) != napi_ok) {
      free(spheres);
      return throw_message(env, "each bound needs a Center and a Radius");
    }
    spheres[index].radius = (float) radius;
  }
  const CNA_Result result =
    g_api.clustered_light_assignment_assign(assignment, grid, &view, spheres, count);
  free(spheres);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_light_assignment_assign", result);
  }
  return undefined_result(env, "cna_clustered_light_assignment_assign");
}

/*
 * The three int32 bulk reads. Each asks with a zero capacity first, so the array is the size CNA
 * reports rather than one this bridge assumed.
 */
static napi_value copy_int32_list(
  napi_env env, ClusteredCopyI32Fn route, CNA_Handle handle, const char* name
) {
  napi_value output;
  uint64_t required = 0;
  CNA_Result result = route(handle, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, name, result);
  }
  if (required > SIZE_MAX / sizeof(int32_t)) {
    return throw_message(env, "the list exceeds the host address space");
  }
  int32_t* values = required == 0
    ? NULL : (int32_t*) malloc((size_t) required * sizeof(int32_t));
  if (required != 0 && !values) return throw_message(env, "index-list allocation failed");
  uint64_t produced = 0;
  result = route(handle, values, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(values);
    return throw_result(env, name, result);
  }
  if (napi_create_array_with_length(env, (size_t) required, &output) != napi_ok) {
    free(values);
    return throw_napi(env, name);
  }
  for (uint64_t index = 0; index < required; index += 1) {
    napi_value number;
    if (napi_create_int32(env, values[index], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(values);
      return throw_napi(env, name);
    }
  }
  free(values);
  return output;
}

static napi_value clustered_light_assignment_copy_indices(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle assignment = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &assignment)) return NULL;
  return copy_int32_list(env, g_api.clustered_light_assignment_copy_indices, assignment,
    "cna_clustered_light_assignment_copy_indices");
}
static napi_value clustered_light_assignment_copy_offsets(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle assignment = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &assignment)) return NULL;
  return copy_int32_list(env, g_api.clustered_light_assignment_copy_offsets, assignment,
    "cna_clustered_light_assignment_copy_offsets");
}
static napi_value clustered_shadow_policy_copy_selected(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle policy = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &policy)) return NULL;
  return copy_int32_list(env, g_api.clustered_shadow_policy_copy_selected, policy,
    "cna_clustered_shadow_policy_copy_selected");
}

static napi_value clustered_light_assignment_copy_lights_in_cluster(
  napi_env env, napi_callback_info info
) {
  napi_value args[2], output;
  CNA_Handle assignment = 0;
  int32_t cluster = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &assignment) ||
      napi_get_value_int32(env, args[1], &cluster) != napi_ok) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.clustered_light_assignment_copy_lights_in_cluster(
    assignment, cluster, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_clustered_light_assignment_copy_lights_in_cluster", result);
  }
  if (required > SIZE_MAX / sizeof(int32_t)) {
    return throw_message(env, "the cluster list exceeds the host address space");
  }
  int32_t* values = required == 0
    ? NULL : (int32_t*) malloc((size_t) required * sizeof(int32_t));
  if (required != 0 && !values) return throw_message(env, "cluster-list allocation failed");
  uint64_t produced = 0;
  result = g_api.clustered_light_assignment_copy_lights_in_cluster(
    assignment, cluster, values, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(values);
    return throw_result(env, "cna_clustered_light_assignment_copy_lights_in_cluster", result);
  }
  if (napi_create_array_with_length(env, (size_t) required, &output) != napi_ok) {
    free(values);
    return throw_napi(env, "cluster light list");
  }
  for (uint64_t index = 0; index < required; index += 1) {
    napi_value number;
    if (napi_create_int32(env, values[index], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(values);
      return throw_napi(env, "cluster light list");
    }
  }
  free(values);
  return output;
}

/* --- the shadow-budget policy --- */

static napi_value clustered_shadow_policy_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0, policy = 0;
  int32_t budget = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &budget) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_shadow_policy_create(device, budget, &policy);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_shadow_policy_create", result);
  }
  return make_handle(env, policy);
}

static napi_value clustered_shadow_policy_get_budget(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.clustered_shadow_policy_get_budget,
    "cna_clustered_shadow_policy_get_budget");
}
static napi_value clustered_shadow_policy_set_budget(napi_env env, napi_callback_info info) {
  return pp_set_i32(env, info, g_api.clustered_shadow_policy_set_budget,
    "cna_clustered_shadow_policy_set_budget");
}
static napi_value clustered_shadow_policy_get_hysteresis(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.clustered_shadow_policy_get_hysteresis,
    "cna_clustered_shadow_policy_get_hysteresis");
}
static napi_value clustered_shadow_policy_set_hysteresis(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.clustered_shadow_policy_set_hysteresis,
    "cna_clustered_shadow_policy_set_hysteresis");
}
static napi_value clustered_shadow_policy_get_request_count(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_shadow_policy_get_request_count,
    "cna_clustered_shadow_policy_get_request_count");
}
static napi_value clustered_shadow_policy_get_refused_count(
  napi_env env, napi_callback_info info
) {
  return pp_get_i32(env, info, g_api.clustered_shadow_policy_get_refused_count,
    "cna_clustered_shadow_policy_get_refused_count");
}
static napi_value clustered_shadow_policy_reset(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_shadow_policy_reset,
    "cna_clustered_shadow_policy_reset");
}
static napi_value clustered_shadow_policy_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.clustered_shadow_policy_destroy,
    "cna_clustered_shadow_policy_destroy");
}

static napi_value clustered_shadow_policy_is_selected(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle policy = 0;
  int32_t light = 0;
  CNA_Bool selected = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &policy) ||
      napi_get_value_int32(env, args[1], &light) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_shadow_policy_is_selected(policy, light, &selected);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_shadow_policy_is_selected", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, selected == CNA_TRUE, &output), "shadow selection");
  return output;
}

static napi_value clustered_shadow_policy_get_score(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle policy = 0;
  int32_t light = 0;
  float score = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &policy) ||
      napi_get_value_int32(env, args[1], &light) != napi_ok) return NULL;
  const CNA_Result result = g_api.clustered_shadow_policy_get_score(policy, light, &score);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_shadow_policy_get_score", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) score, &output), "shadow score");
  return output;
}

/* --- the rest of the shadow-map maths ----------------------------------------------------------- */
/*
 * A cascaded shadow map's split distances and the geometry that sizes each cascade, a spot light's
 * view and projection, and a cube shadow map's six faces. All pure: no handle, no device, no GPU.
 *
 * The three families' *objects* are not projected. Like the directional shadow map they exist to
 * run a depth pass, and the one renderer here that could run one cannot be read back
 * (docs/upstream-cna-findings.md item 7), so there would be no evidence to accept them on. The
 * maths is a different matter: it answers exactly, everywhere.
 */

static int set_vector3_fields(napi_env env, napi_value object, const CNA_Vector3* value) {
  napi_value number;
  static const char* const names[] = {"X", "Y", "Z"};
  const float components[3] = {value->x, value->y, value->z};
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_create_double(env, (double) components[index], &number) != napi_ok ||
        napi_set_named_property(env, object, names[index], number) != napi_ok) {
      return 0;
    }
  }
  return 1;
}

static napi_value cascade_split_distances(napi_env env, napi_callback_info info) {
  napi_value args[4], output;
  double nearPlane = 0, farPlane = 0, lambda = 0;
  int32_t cascades = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      napi_get_value_double(env, args[0], &nearPlane) != napi_ok ||
      napi_get_value_double(env, args[1], &farPlane) != napi_ok ||
      napi_get_value_int32(env, args[2], &cascades) != napi_ok ||
      napi_get_value_double(env, args[3], &lambda) != napi_ok) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.cascaded_shadow_map_compute_split_distances(
    (float) nearPlane, (float) farPlane, cascades, (float) lambda, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_cascaded_shadow_map_compute_split_distances", result);
  }
  if (required > SIZE_MAX / sizeof(float)) {
    return throw_message(env, "the split list exceeds the host address space");
  }
  float* splits = required == 0 ? NULL : (float*) calloc((size_t) required, sizeof(float));
  if (required != 0 && !splits) return throw_message(env, "split-list allocation failed");
  uint64_t produced = 0;
  result = g_api.cascaded_shadow_map_compute_split_distances(
    (float) nearPlane, (float) farPlane, cascades, (float) lambda, splits, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(splits);
    return throw_result(env, "cna_cascaded_shadow_map_compute_split_distances", result);
  }
  if (napi_create_array_with_length(env, (size_t) required, &output) != napi_ok) {
    free(splits);
    return throw_napi(env, "cascade splits");
  }
  for (uint64_t index = 0; index < required; index += 1) {
    napi_value number;
    if (napi_create_double(env, (double) splits[index], &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(splits);
      return throw_napi(env, "cascade splits");
    }
  }
  free(splits);
  return output;
}

static napi_value cascade_frustum_corners(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Matrix view, projection;
  CNA_Vector3 corners[8];
  memset(corners, 0, sizeof(corners));
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_matrix16(env, args[0], &view, "a view must be a 16-number array") ||
      !read_matrix16(env, args[1], &projection, "a projection must be a 16-number array")) {
    return NULL;
  }
  const CNA_Result result =
    g_api.cascaded_shadow_map_compute_frustum_corners(&view, &projection, corners);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cascaded_shadow_map_compute_frustum_corners", result);
  }
  if (napi_create_array_with_length(env, 8, &output) != napi_ok) {
    return throw_napi(env, "frustum corners");
  }
  for (uint32_t index = 0; index < 8; index += 1) {
    napi_value element;
    if (napi_create_object(env, &element) != napi_ok ||
        !set_vector3_fields(env, element, &corners[index]) ||
        napi_set_element(env, output, index, element) != napi_ok) {
      return throw_napi(env, "frustum corners");
    }
  }
  return output;
}

static napi_value cascade_bounding_sphere(napi_env env, napi_callback_info info) {
  napi_value args[1], element, output, radiusValue;
  CNA_Vector3 corners[8], centre;
  float radius = 0;
  bool isArray = false;
  uint32_t count = 0;
  memset(corners, 0, sizeof(corners));
  memset(&centre, 0, sizeof(centre));
  if (!require_loaded(env) || !get_args(env, info, 1, args)) return NULL;
  if (napi_is_array(env, args[0], &isArray) != napi_ok || !isArray ||
      napi_get_array_length(env, args[0], &count) != napi_ok || count != 8) {
    return throw_message(env, "a frustum has exactly eight corners");
  }
  for (uint32_t index = 0; index < 8; index += 1) {
    if (napi_get_element(env, args[0], index, &element) != napi_ok ||
        !read_vector3_fields(env, element, &corners[index])) {
      return throw_message(env, "each corner needs X, Y and Z");
    }
  }
  const CNA_Result result =
    g_api.cascaded_shadow_map_compute_bounding_sphere(corners, &centre, &radius);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cascaded_shadow_map_compute_bounding_sphere", result);
  }
  if (napi_create_object(env, &output) != napi_ok ||
      !set_vector3(env, output, "Center", &centre) ||
      napi_create_double(env, (double) radius, &radiusValue) != napi_ok ||
      napi_set_named_property(env, output, "Radius", radiusValue) != napi_ok) {
    return throw_napi(env, "cascade bounding sphere");
  }
  return output;
}

static int read_spot_light(napi_env env, napi_value value, CNA_SpotLightEXT* light) {
  const CNA_Result initialized = g_api.spot_light_ext_init(light);
  if (initialized != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_spot_light_ext_init", initialized);
    return 0;
  }
  napi_value entry;
  static const char* const scalars[] = {"Intensity", "Range", "InnerAngle", "OuterAngle"};
  float* const targets[] = {
    &light->intensity, &light->range, &light->inner_angle, &light->outer_angle};
  if (!read_vector3(env, value, "Position", &light->position) ||
      !read_vector3(env, value, "Direction", &light->direction) ||
      !read_vector3(env, value, "Color", &light->color)) {
    throw_message(env, "a spot light needs Position, Direction and Color");
    return 0;
  }
  for (size_t index = 0; index < 4; index += 1) {
    double number = 0;
    if (napi_get_named_property(env, value, scalars[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &number) != napi_ok) {
      throw_message(env, "a spot light's scalars must be numbers");
      return 0;
    }
    *targets[index] = (float) number;
  }
  return 1;
}

static napi_value spot_shadow_matrix(
  napi_env env, napi_callback_info info, SpotShadowMatrixFn route, const char* name
) {
  napi_value args[1];
  CNA_SpotLightEXT light;
  CNA_Matrix matrix;
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_spot_light(env, args[0], &light)) return NULL;
  const CNA_Result result = route(&light, &matrix);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return make_matrix16(env, &matrix, name);
}

static napi_value spot_shadow_light_view(napi_env env, napi_callback_info info) {
  return spot_shadow_matrix(env, info, g_api.spot_shadow_map_compute_light_view,
    "cna_spot_shadow_map_compute_light_view");
}
static napi_value spot_shadow_light_projection(napi_env env, napi_callback_info info) {
  return spot_shadow_matrix(env, info, g_api.spot_shadow_map_compute_light_projection,
    "cna_spot_shadow_map_compute_light_projection");
}

static napi_value cube_shadow_face_view(napi_env env, napi_callback_info info) {
  napi_value args[2];
  uint32_t face = 0;
  CNA_Vector3 position;
  CNA_Matrix matrix;
  memset(&position, 0, sizeof(position));
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      napi_get_value_uint32(env, args[0], &face) != napi_ok ||
      !read_vector3_fields(env, args[1], &position)) return NULL;
  const CNA_Result result = g_api.cube_shadow_map_compute_face_view(face, &position, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cube_shadow_map_compute_face_view", result);
  }
  return make_matrix16(env, &matrix, "cube face view");
}

static napi_value cube_shadow_face_projection(napi_env env, napi_callback_info info) {
  napi_value args[1];
  double range = 0;
  CNA_Matrix matrix;
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_double(env, args[0], &range) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.cube_shadow_map_compute_face_projection((float) range, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_cube_shadow_map_compute_face_projection", result);
  }
  return make_matrix16(env, &matrix, "cube face projection");
}

static napi_value cube_shadow_size_for_quality(napi_env env, napi_callback_info info) {
  return shadow_quality_to_i32(env, info, g_api.cube_shadow_map_size_for_quality,
    "cna_cube_shadow_map_size_for_quality");
}

/* --- the engine layer's particle systems -------------------------------------------------------- */
/*
 * A GPU particle system, and the pure functions behind it. `cna_particle_system_step` integrates
 * one particle with no handle at all, and `cna_particle_system_random` is the deterministic
 * generator the emitter uses -- so a caller can predict exactly what a simulation will produce,
 * and a test can check the system against arithmetic rather than against numbers copied out of a
 * previous run.
 *
 * Where compute shaders exist the simulation runs on the GPU; where they do not it runs on the CPU
 * and says so, which is what `uses_compute` and the unsupported reason are for. Drawing is not
 * projected: it needs a texture, a camera and a real pass, and the renderer here that could run one
 * cannot be read back (docs/upstream-cna-findings.md item 7).
 */

static int read_emitter_settings(
  napi_env env, napi_value value, CNA_ParticleEmitterSettings* settings
) {
  /* Seeded from CNA's own initialiser, so the version header and any field this ABI adds later
     stay CNA's; only the fields a caller sets are written over them. */
  const CNA_Result initialized = g_api.particle_emitter_settings_init(settings);
  if (initialized != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_particle_emitter_settings_init", initialized);
    return 0;
  }
  napi_value entry;
  if (!read_vector3(env, value, "Position", &settings->position) ||
      !read_vector3(env, value, "Direction", &settings->direction) ||
      !read_vector3(env, value, "Gravity", &settings->gravity)) {
    throw_message(env, "emitter settings need Position, Direction and Gravity");
    return 0;
  }
  static const char* const scalars[] = {
    "ConeAngle", "Speed", "SpeedVariance", "Lifetime", "LifetimeVariance", "Drag",
    "EmissionRate", "StartSize", "EndSize",
  };
  float* const targets[] = {
    &settings->cone_angle, &settings->speed, &settings->speed_variance, &settings->lifetime,
    &settings->lifetime_variance, &settings->drag, &settings->emission_rate,
    &settings->start_size, &settings->end_size,
  };
  for (size_t index = 0; index < sizeof(scalars) / sizeof(scalars[0]); index += 1) {
    double number = 0;
    if (napi_get_named_property(env, value, scalars[index], &entry) != napi_ok ||
        napi_get_value_double(env, entry, &number) != napi_ok) {
      throw_message(env, "an emitter setting must be a number");
      return 0;
    }
    *targets[index] = (float) number;
  }
  static const char* const colors[] = {"StartColor", "EndColor"};
  CNA_Vector4* const colorTargets[] = {&settings->start_color, &settings->end_color};
  for (size_t index = 0; index < 2; index += 1) {
    napi_value nested, component;
    static const char* const parts[] = {"X", "Y", "Z", "W"};
    float* const fields[] = {NULL, NULL, NULL, NULL};
    (void) fields;
    if (napi_get_named_property(env, value, colors[index], &nested) != napi_ok) {
      throw_message(env, "emitter settings need StartColor and EndColor");
      return 0;
    }
    double values[4] = {0, 0, 0, 0};
    for (size_t part = 0; part < 4; part += 1) {
      if (napi_get_named_property(env, nested, parts[part], &component) != napi_ok ||
          napi_get_value_double(env, component, &values[part]) != napi_ok) {
        throw_message(env, "an emitter colour needs X, Y, Z and W");
        return 0;
      }
    }
    colorTargets[index]->x = (float) values[0];
    colorTargets[index]->y = (float) values[1];
    colorTargets[index]->z = (float) values[2];
    colorTargets[index]->w = (float) values[3];
  }
  return 1;
}

static int set_vector4(napi_env env, napi_value object, const char* name, const CNA_Vector4* v) {
  napi_value nested, number;
  if (napi_create_object(env, &nested) != napi_ok) return 0;
  static const char* const parts[] = {"X", "Y", "Z", "W"};
  const float values[4] = {v->x, v->y, v->z, v->w};
  for (size_t index = 0; index < 4; index += 1) {
    if (napi_create_double(env, (double) values[index], &number) != napi_ok ||
        napi_set_named_property(env, nested, parts[index], number) != napi_ok) {
      return 0;
    }
  }
  return napi_set_named_property(env, object, name, nested) == napi_ok;
}

static napi_value make_emitter_settings(napi_env env, const CNA_ParticleEmitterSettings* s) {
  napi_value output, number;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "emitter settings");
  if (!set_vector3(env, output, "Position", &s->position) ||
      !set_vector3(env, output, "Direction", &s->direction) ||
      !set_vector3(env, output, "Gravity", &s->gravity) ||
      !set_vector4(env, output, "StartColor", &s->start_color) ||
      !set_vector4(env, output, "EndColor", &s->end_color)) {
    return throw_napi(env, "emitter settings");
  }
  static const char* const scalars[] = {
    "ConeAngle", "Speed", "SpeedVariance", "Lifetime", "LifetimeVariance", "Drag",
    "EmissionRate", "StartSize", "EndSize",
  };
  const float values[] = {
    s->cone_angle, s->speed, s->speed_variance, s->lifetime, s->lifetime_variance, s->drag,
    s->emission_rate, s->start_size, s->end_size,
  };
  for (size_t index = 0; index < sizeof(scalars) / sizeof(scalars[0]); index += 1) {
    if (napi_create_double(env, (double) values[index], &number) != napi_ok ||
        napi_set_named_property(env, output, scalars[index], number) != napi_ok) {
      return throw_napi(env, "emitter settings");
    }
  }
  return output;
}

static int read_particle(napi_env env, napi_value value, CNA_Particle* particle) {
  const CNA_Result initialized = g_api.particle_init(particle);
  if (initialized != CNA_RESULT_SUCCESS) {
    throw_result(env, "cna_particle_init", initialized);
    return 0;
  }
  static const char* const names[] = {"Position", "Velocity", "State"};
  CNA_Vector4* const targets[] = {&particle->position, &particle->velocity, &particle->state};
  static const char* const parts[] = {"X", "Y", "Z", "W"};
  for (size_t index = 0; index < 3; index += 1) {
    napi_value nested, component;
    if (napi_get_named_property(env, value, names[index], &nested) != napi_ok) {
      throw_message(env, "a particle needs Position, Velocity and State");
      return 0;
    }
    double values[4] = {0, 0, 0, 0};
    for (size_t part = 0; part < 4; part += 1) {
      if (napi_get_named_property(env, nested, parts[part], &component) != napi_ok ||
          napi_get_value_double(env, component, &values[part]) != napi_ok) {
        throw_message(env, "a particle's vectors need X, Y, Z and W");
        return 0;
      }
    }
    targets[index]->x = (float) values[0];
    targets[index]->y = (float) values[1];
    targets[index]->z = (float) values[2];
    targets[index]->w = (float) values[3];
  }
  return 1;
}

static napi_value make_particle(napi_env env, const CNA_Particle* particle) {
  napi_value output;
  if (napi_create_object(env, &output) != napi_ok) return throw_napi(env, "particle");
  if (!set_vector4(env, output, "Position", &particle->position) ||
      !set_vector4(env, output, "Velocity", &particle->velocity) ||
      !set_vector4(env, output, "State", &particle->state)) {
    return throw_napi(env, "particle");
  }
  return output;
}

static napi_value particle_default_settings(napi_env env, napi_callback_info info) {
  CNA_ParticleEmitterSettings settings;
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.particle_emitter_settings_init(&settings);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_emitter_settings_init", result);
  }
  return make_emitter_settings(env, &settings);
}

static napi_value particle_default(napi_env env, napi_callback_info info) {
  CNA_Particle particle;
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.particle_init(&particle);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_particle_init", result);
  return make_particle(env, &particle);
}

static napi_value particle_random(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  uint32_t seed = 0;
  float value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &seed) != napi_ok) return NULL;
  const CNA_Result result = g_api.particle_system_random(seed, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_random", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) value, &output), "particle random");
  return output;
}

static napi_value particle_step(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Particle particle;
  CNA_ParticleEmitterSettings settings;
  int32_t index = 0;
  double elapsed = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_particle(env, args[0], &particle) ||
      napi_get_value_int32(env, args[1], &index) != napi_ok ||
      !read_emitter_settings(env, args[2], &settings) ||
      napi_get_value_double(env, args[3], &elapsed) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.particle_system_step(&particle, index, &settings, (float) elapsed);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_step", result);
  }
  /* A copy back rather than a mutation: the caller's object is theirs. */
  return make_particle(env, &particle);
}

static napi_value particle_system_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0, system = 0;
  int32_t capacity = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &capacity) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.particle_system_create_with_capacity(device, capacity, &system);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_create_with_capacity", result);
  }
  return make_handle(env, system);
}

static napi_value particle_system_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.particle_system_destroy, "cna_particle_system_destroy");
}
static napi_value particle_system_reset(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.particle_system_reset, "cna_particle_system_reset");
}
static napi_value particle_system_update(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.particle_system_update, "cna_particle_system_update");
}
static napi_value particle_system_get_capacity(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.particle_system_get_capacity,
    "cna_particle_system_get_capacity");
}
static napi_value particle_system_get_active_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.particle_system_get_active_count,
    "cna_particle_system_get_active_count");
}
static napi_value particle_system_uses_compute(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.particle_system_uses_compute,
    "cna_particle_system_uses_compute");
}
static napi_value particle_system_is_cpu_forced(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.particle_system_is_simulation_on_cpu_ext,
    "cna_particle_system_is_simulation_on_cpu_ext");
}
static napi_value particle_system_is_emission_clamped(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.particle_system_is_emission_rate_clamped,
    "cna_particle_system_is_emission_rate_clamped");
}
static napi_value particle_system_unsupported_reason(napi_env env, napi_callback_info info) {
  return copy_sized_text(env, info, g_api.particle_system_copy_unsupported_reason,
    "cna_particle_system_copy_unsupported_reason");
}

static napi_value particle_system_set_cpu_forced(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle system = 0;
  bool forced = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &system) ||
      napi_get_value_bool(env, args[1], &forced) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.particle_system_set_simulation_on_cpu_ext(system, forced ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_set_simulation_on_cpu_ext", result);
  }
  return undefined_result(env, "cna_particle_system_set_simulation_on_cpu_ext");
}

static napi_value particle_system_get_settings(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle system = 0;
  CNA_ParticleEmitterSettings settings;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &system)) return NULL;
  const CNA_Result initialized = g_api.particle_emitter_settings_init(&settings);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_emitter_settings_init", initialized);
  }
  const CNA_Result result = g_api.particle_system_get_settings(system, &settings);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_get_settings", result);
  }
  return make_emitter_settings(env, &settings);
}

static napi_value particle_system_set_settings(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle system = 0;
  CNA_ParticleEmitterSettings settings;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &system) ||
      !read_emitter_settings(env, args[1], &settings)) return NULL;
  const CNA_Result result = g_api.particle_system_set_settings(system, &settings);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_particle_system_set_settings", result);
  }
  return undefined_result(env, "cna_particle_system_set_settings");
}

static napi_value particle_system_copy_particles(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle system = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &system)) return NULL;
  /* Ask for the count first: a short buffer is BUFFER_TOO_SMALL and writes nothing, so the array
     allocated here is the size CNA reports rather than one this bridge guessed. */
  uint64_t required = 0;
  CNA_Result result = g_api.particle_system_copy_particles_ext(system, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_particle_system_copy_particles_ext", result);
  }
  if (required > SIZE_MAX / sizeof(CNA_Particle)) {
    return throw_message(env, "the particle list exceeds the host address space");
  }
  CNA_Particle* particles = required == 0
    ? NULL : (CNA_Particle*) calloc((size_t) required, sizeof(CNA_Particle));
  if (required != 0 && !particles) return throw_message(env, "particle-list allocation failed");
  uint64_t produced = 0;
  result = g_api.particle_system_copy_particles_ext(system, particles, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(particles);
    return throw_result(env, "cna_particle_system_copy_particles_ext", result);
  }
  if (napi_create_array_with_length(env, (size_t) required, &output) != napi_ok) {
    free(particles);
    return throw_napi(env, "particle list");
  }
  for (uint64_t index = 0; index < required; index += 1) {
    napi_value element = make_particle(env, &particles[index]);
    if (element == NULL || napi_set_element(env, output, (uint32_t) index, element) != napi_ok) {
      free(particles);
      return NULL;
    }
  }
  free(particles);
  return output;
}

/* --- the engine layer's shadow maps ------------------------------------------------------------ */
/*
 * The shadow map object's state, and the four pure functions that compute where a shadow map looks
 * from. The four take no handle at all: a quality tier maps to a texture size and a filter radius,
 * and a directional light plus a scene's bounds map to the view and projection that frame it.
 *
 * The rendering half -- begin/end, the caster effects, the shadow texture -- is not projected. It
 * needs a real depth pass, and on the one renderer here that could run one, reading a render
 * target back answers zeros (docs/upstream-cna-findings.md item 7), so there would be no evidence
 * to accept it on. What is bound is what can be proved.
 */

static napi_value shadow_map_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0, map = 0;
  uint32_t quality = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &quality) != napi_ok) return NULL;
  const CNA_Result result = g_api.shadow_map_create(device, quality, &map);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_shadow_map_create", result);
  return make_handle(env, map);
}

static napi_value shadow_map_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.shadow_map_destroy, "cna_shadow_map_destroy");
}
static napi_value shadow_map_is_supported(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.shadow_map_is_supported, "cna_shadow_map_is_supported");
}
static napi_value shadow_map_get_size(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.shadow_map_get_size, "cna_shadow_map_get_size");
}
static napi_value shadow_map_get_filter_radius(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.shadow_map_get_filter_radius,
    "cna_shadow_map_get_filter_radius");
}
static napi_value shadow_map_get_depth_bias(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.shadow_map_get_depth_bias,
    "cna_shadow_map_get_depth_bias");
}
static napi_value shadow_map_set_depth_bias(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.shadow_map_set_depth_bias,
    "cna_shadow_map_set_depth_bias");
}

static napi_value shadow_map_get_quality(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle map = 0;
  CNA_ShadowQuality quality = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &map)) return NULL;
  const CNA_Result result = g_api.shadow_map_get_quality(map, &quality);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_shadow_map_get_quality", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, quality, &output), "shadow quality");
  return output;
}

static napi_value shadow_map_get_light_view_projection(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle map = 0;
  CNA_Matrix matrix;
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &map)) return NULL;
  const CNA_Result result = g_api.shadow_map_get_light_view_projection(map, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_shadow_map_get_light_view_projection", result);
  }
  return make_matrix16(env, &matrix, "light view-projection");
}

static napi_value shadow_quality_to_i32(
  napi_env env, napi_callback_info info, ShadowQualityToI32Fn route, const char* name
) {
  napi_value args[1], output;
  uint32_t quality = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &quality) != napi_ok) return NULL;
  const CNA_Result result = route(quality, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), name);
  return output;
}

static napi_value shadow_map_size_for_quality(napi_env env, napi_callback_info info) {
  return shadow_quality_to_i32(env, info, g_api.shadow_map_size_for_quality,
    "cna_shadow_map_size_for_quality");
}
static napi_value shadow_map_filter_radius_for_quality(napi_env env, napi_callback_info info) {
  return shadow_quality_to_i32(env, info, g_api.shadow_map_filter_radius_for_quality,
    "cna_shadow_map_filter_radius_for_quality");
}

/* A bounding box argument, as two Vector3 fields. */
static int read_bounding_box(napi_env env, napi_value value, CNA_BoundingBox* box) {
  if (!read_vector3(env, value, "Min", &box->min) ||
      !read_vector3(env, value, "Max", &box->max)) {
    throw_message(env, "scene bounds need a Min and a Max");
    return 0;
  }
  return 1;
}

static napi_value shadow_map_compute_light_view(napi_env env, napi_callback_info info) {
  napi_value args[2], entry;
  CNA_DirectionalLightEXT light;
  CNA_BoundingBox box;
  CNA_Matrix matrix;
  memset(&box, 0, sizeof(box));
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 2, args)) return NULL;
  /* Seeded from CNA's own initialiser, so the version header and anything it adds stay CNA's. */
  const CNA_Result initialized = g_api.directional_light_ext_init(&light);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_directional_light_ext_init", initialized);
  }
  double intensity = 0;
  if (!read_vector3(env, args[0], "Direction", &light.direction) ||
      !read_vector3(env, args[0], "Color", &light.color) ||
      napi_get_named_property(env, args[0], "Intensity", &entry) != napi_ok ||
      napi_get_value_double(env, entry, &intensity) != napi_ok) {
    return throw_message(env, "a directional light needs Direction, Color and Intensity");
  }
  light.intensity = (float) intensity;
  if (!read_bounding_box(env, args[1], &box)) return NULL;
  const CNA_Result result = g_api.shadow_map_compute_light_view(&light, &box, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_shadow_map_compute_light_view", result);
  }
  return make_matrix16(env, &matrix, "light view");
}

static napi_value shadow_map_compute_light_projection(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Matrix view, matrix;
  CNA_BoundingBox box;
  memset(&box, 0, sizeof(box));
  memset(&matrix, 0, sizeof(matrix));
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_matrix16(env, args[0], &view, "a light view must be a 16-number array") ||
      !read_bounding_box(env, args[1], &box)) return NULL;
  const CNA_Result result = g_api.shadow_map_compute_light_projection(&view, &box, &matrix);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_shadow_map_compute_light_projection", result);
  }
  return make_matrix16(env, &matrix, "light projection");
}

/* --- the engine layer's level-of-detail groups ------------------------------------------------ */
/*
 * Which detail level to draw at a distance, with the hysteresis that stops a level flickering as a
 * camera hovers on a boundary.
 *
 * `cna_lod_group_ext_add_level` associates each level with a `CNA_ModelMeshPartHandle`, and
 * `cna_lod_group_ext_select` hands that handle back. Neither is projected: this package's
 * `ModelMeshPart` is a managed projection built from XNB readers, with managed vertex and index
 * buffers and no native handle to give -- so binding `select` would project a route that could
 * only ever answer zero. What is bound is the selection *arithmetic*, which is the whole value of
 * a LOD group, and a consumer indexes their own array of parts with the answer.
 */

static napi_value lod_group_create(napi_env env, napi_callback_info info) {
  CNA_LodGroupEXTHandle group = 0;
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.lod_group_ext_create(&group);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_lod_group_ext_create", result);
  return make_handle(env, group);
}

static napi_value lod_group_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.lod_group_ext_destroy, "cna_lod_group_ext_destroy");
}
static napi_value lod_group_clear(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.lod_group_ext_clear, "cna_lod_group_ext_clear");
}
static napi_value lod_group_reset_hysteresis(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.lod_group_ext_reset_hysteresis,
    "cna_lod_group_ext_reset_hysteresis");
}
static napi_value lod_group_get_hysteresis(napi_env env, napi_callback_info info) {
  return pp_get_float(env, info, g_api.lod_group_ext_get_hysteresis,
    "cna_lod_group_ext_get_hysteresis");
}
static napi_value lod_group_set_hysteresis(napi_env env, napi_callback_info info) {
  return pp_set_float(env, info, g_api.lod_group_ext_set_hysteresis,
    "cna_lod_group_ext_set_hysteresis");
}

static napi_value lod_group_add_level(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle group = 0;
  double distance = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &group) ||
      napi_get_value_double(env, args[1], &distance) != napi_ok) return NULL;
  /* No mesh part: see the note above. CNA_INVALID_HANDLE is how this ABI spells "absent". */
  const CNA_Result result = g_api.lod_group_ext_add_level(group, (float) distance, 0);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_add_level", result);
  }
  return undefined_result(env, "cna_lod_group_ext_add_level");
}

static napi_value lod_group_copy_levels(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle group = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &group)) return NULL;
  uint64_t required = 0;
  CNA_Result result = g_api.lod_group_ext_copy_levels(group, NULL, 0, &required);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, "cna_lod_group_ext_copy_levels", result);
  }
  if (required > SIZE_MAX / sizeof(CNA_LodLevelEXT)) {
    return throw_message(env, "the level list exceeds the host address space");
  }
  CNA_LodLevelEXT* levels = required == 0
    ? NULL : (CNA_LodLevelEXT*) calloc((size_t) required, sizeof(CNA_LodLevelEXT));
  if (required != 0 && !levels) return throw_message(env, "level-list allocation failed");
  uint64_t produced = 0;
  result = g_api.lod_group_ext_copy_levels(group, levels, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(levels);
    return throw_result(env, "cna_lod_group_ext_copy_levels", result);
  }
  if (napi_create_array_with_length(env, (size_t) required, &output) != napi_ok) {
    free(levels);
    return throw_napi(env, "LOD level list");
  }
  for (uint64_t index = 0; index < required; index += 1) {
    napi_value number;
    if (napi_create_double(env, (double) levels[index].max_distance, &number) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, number) != napi_ok) {
      free(levels);
      return throw_napi(env, "LOD level list");
    }
  }
  free(levels);
  return output;
}

static napi_value lod_group_select_index(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle group = 0;
  double distance = 0;
  int32_t index = -1;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &group) ||
      napi_get_value_double(env, args[1], &distance) != napi_ok) return NULL;
  const CNA_Result result = g_api.lod_group_ext_select_index(group, (float) distance, &index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_select_index", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, index, &output), "LOD level index");
  return output;
}

static napi_value lod_group_get_selection_mode(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle group = 0;
  CNA_LodSelectionMode mode = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &group)) return NULL;
  const CNA_Result result = g_api.lod_group_ext_get_selection_mode(group, &mode);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_get_selection_mode", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, mode, &output), "LOD selection mode");
  return output;
}

static napi_value lod_group_set_selection_mode(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle group = 0;
  uint32_t mode = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &group) ||
      napi_get_value_uint32(env, args[1], &mode) != napi_ok) return NULL;
  const CNA_Result result = g_api.lod_group_ext_set_selection_mode(group, mode);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_set_selection_mode", result);
  }
  return undefined_result(env, "cna_lod_group_ext_set_selection_mode");
}

static napi_value lod_group_set_screen_space_parameters(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle group = 0;
  double radius = 0, verticalFov = 0, viewportHeight = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &group) ||
      napi_get_value_double(env, args[1], &radius) != napi_ok ||
      napi_get_value_double(env, args[2], &verticalFov) != napi_ok ||
      napi_get_value_double(env, args[3], &viewportHeight) != napi_ok) return NULL;
  const CNA_Result result = g_api.lod_group_ext_set_screen_space_parameters(
    group, (float) radius, (float) verticalFov, (float) viewportHeight);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_set_screen_space_parameters", result);
  }
  return undefined_result(env, "cna_lod_group_ext_set_screen_space_parameters");
}

static napi_value lod_group_projected_radius_pixels(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle group = 0;
  double distance = 0;
  float pixels = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &group) ||
      napi_get_value_double(env, args[1], &distance) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.lod_group_ext_projected_radius_pixels(group, (float) distance, &pixels);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_lod_group_ext_projected_radius_pixels", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) pixels, &output), "projected radius");
  return output;
}

static napi_value clustered_shadow_policy_select(napi_env env, napi_callback_info info) {
  napi_value args[5];
  CNA_Handle policy = 0, lights = 0;
  CNA_Matrix view, projection;
  CNA_Vector3 camera;
  memset(&camera, 0, sizeof(camera));
  if (!require_loaded(env) || !get_args(env, info, 5, args) ||
      !read_handle(env, args[0], &policy) ||
      !read_handle(env, args[1], &lights) ||
      !read_matrix16(env, args[2], &view, "a view matrix must be a 16-number array") ||
      !read_matrix16(env, args[3], &projection,
        "a projection matrix must be a 16-number array")) return NULL;
  if (!read_vector3_fields(env, args[4], &camera)) {
    return throw_message(env, "the camera position needs X, Y and Z");
  }
  const CNA_Result result =
    g_api.clustered_shadow_policy_select(policy, lights, &view, &projection, &camera);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_clustered_shadow_policy_select", result);
  }
  return undefined_result(env, "cna_clustered_shadow_policy_select");
}

/* --- the engine layer's compute path ----------------------------------------------------------- */
/*
 * Storage buffers, compute shaders and GPU timers: the part of the engine layer that computes
 * rather than draws.
 *
 * Two boundaries shape this code. The first is that compute is a *renderer* capability, not just a
 * build option, so `cna_graphics_device_supports_capability` is bound here beside it -- a caller
 * that asks first gets a documented `false` rather than a refusal to catch. Measured on this
 * machine at ABI 0.21.0: HEADLESS, SDL_RENDERER and SOFTWARE all refuse a storage-buffer create
 * with NOT_SUPPORTED; OPENGLES3 runs the whole family.
 *
 * The second is that a storage buffer's payload is bytes. The byte routes take a view and pass
 * *its own* length, never a length the caller also supplied, so a short array cannot become a
 * native overrun. The element routes additionally carry the count and element size CNA
 * cross-checks against the buffer's declared ones, and a disagreement is CNA's INVALID_ARGUMENT.
 */

/*
 * A caller-created GraphicsDevice, which is what XNA's public `GraphicsDevice` constructor makes.
 * It has no game: `cna_graphics_device_create` takes an adapter index and presentation parameters
 * and nothing else, and the resulting device owns its own resources rather than a game's.
 *
 * The presentation parameters are seeded from CNA's own initialiser first, so the reserved bytes
 * and the two struct-header fields are CNA's rather than this bridge's, and only the fields XNA
 * actually has are then written over them.
 */
static napi_value create_standalone_graphics_device(napi_env env, napi_callback_info info) {
  napi_value args[3], entry;
  uint32_t adapterIndex = 0, profile = 0;
  CNA_PresentationParameters parameters;
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      napi_get_value_uint32(env, args[0], &adapterIndex) != napi_ok ||
      napi_get_value_uint32(env, args[1], &profile) != napi_ok) return NULL;
  const CNA_Result initialized = g_api.presentation_parameters_init(&parameters);
  if (initialized != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_presentation_parameters_init", initialized);
  }
  struct { const char* name; int isBool; void* target; } fields[] = {
    {"BackBufferFormat", 0, &parameters.back_buffer_format},
    {"BackBufferWidth", 0, &parameters.back_buffer_width},
    {"BackBufferHeight", 0, &parameters.back_buffer_height},
    {"DepthStencilFormat", 0, &parameters.depth_stencil_format},
    {"MultiSampleCount", 0, &parameters.multi_sample_count},
    {"PresentationInterval", 0, &parameters.presentation_interval},
    {"DisplayOrientation", 0, &parameters.display_orientation},
    {"RenderTargetUsage", 0, &parameters.render_target_usage},
    {"IsFullScreen", 1, &parameters.is_full_screen},
  };
  for (size_t index = 0; index < sizeof(fields) / sizeof(fields[0]); index += 1) {
    if (napi_get_named_property(env, args[2], fields[index].name, &entry) != napi_ok) {
      return throw_message(env, "the presentation parameters are incomplete");
    }
    if (fields[index].isBool) {
      bool flag = false;
      if (napi_get_value_bool(env, entry, &flag) != napi_ok) {
        return throw_message(env, "IsFullScreen must be a boolean");
      }
      *(CNA_Bool*) fields[index].target = flag ? CNA_TRUE : CNA_FALSE;
    } else {
      int32_t value = 0;
      if (napi_get_value_int32(env, entry, &value) != napi_ok) {
        return throw_message(env, "a presentation parameter must be a number");
      }
      /* Every non-boolean field in this struct is a 32-bit word: the three enum typedefs and
       * the three counts are all four bytes wide, which the ABI contract asserts. */
      *(int32_t*) fields[index].target = value;
    }
  }
  const CNA_Result result =
    g_api.graphics_device_create(adapterIndex, profile, &parameters, &device);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_device_create", result);
  }
  return make_handle(env, device);
}

static napi_value destroy_standalone_graphics_device(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.graphics_device_destroy, "cna_graphics_device_destroy");
}

static napi_value graphics_device_supports_capability(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  uint32_t capability = 0;
  CNA_Bool supported = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &capability) != napi_ok) return NULL;
  const CNA_Result result =
    g_api.graphics_device_supports_capability(device, capability, &supported);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_device_supports_capability", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, supported == CNA_TRUE, &output), "capability answer");
  return output;
}

static napi_value device_axis_i32(
  napi_env env, napi_callback_info info, DeviceAxisI32OutFn route, const char* name
) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  int32_t axis = 0, value = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_int32(env, args[1], &axis) != napi_ok) return NULL;
  const CNA_Result result = route(device, axis, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), name);
  return output;
}

static napi_value get_max_compute_work_group_count(napi_env env, napi_callback_info info) {
  return device_axis_i32(env, info, g_api.graphics_device_get_max_compute_work_group_count_ext,
    "cna_graphics_device_get_max_compute_work_group_count_ext");
}

static napi_value get_max_compute_work_group_size(napi_env env, napi_callback_info info) {
  return device_axis_i32(env, info, g_api.graphics_device_get_max_compute_work_group_size_ext,
    "cna_graphics_device_get_max_compute_work_group_size_ext");
}

static napi_value get_max_compute_work_group_invocations(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.graphics_device_get_max_compute_work_group_invocations_ext,
    "cna_graphics_device_get_max_compute_work_group_invocations_ext");
}

/*
 * A `uint64_t` count argument that must not silently wrap. A JavaScript number that is not a
 * non-negative safe integer is refused here rather than truncated into a plausible-looking length.
 */
static int read_count(napi_env env, napi_value value, uint64_t* out, const char* what) {
  double number = 0;
  if (napi_get_value_double(env, value, &number) != napi_ok ||
      !(number >= 0) || number > 9007199254740991.0 ||
      number != (double) (uint64_t) number) {
    throw_message(env, what);
    return 0;
  }
  *out = (uint64_t) number;
  return 1;
}

static napi_value storage_buffer_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0;
  uint64_t byteSize = 0;
  CNA_StorageBufferHandle buffer = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      !read_count(env, args[1], &byteSize,
        "a storage buffer's byte size must be a non-negative safe integer")) return NULL;
  const CNA_Result result = g_api.storage_buffer_create(device, byteSize, &buffer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_buffer_create", result);
  return make_handle(env, buffer);
}

static napi_value storage_buffer_create_typed(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle device = 0;
  uint64_t count = 0, elementSize = 0;
  CNA_StorageBufferHandle buffer = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &device) ||
      !read_count(env, args[1], &count,
        "a storage buffer's element count must be a non-negative safe integer") ||
      !read_count(env, args[2], &elementSize,
        "a storage buffer's element size must be a non-negative safe integer")) return NULL;
  const CNA_Result result = g_api.storage_buffer_create_typed(device, count, elementSize, &buffer);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_storage_buffer_create_typed", result);
  }
  return make_handle(env, buffer);
}

static napi_value storage_buffer_set_bytes(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle buffer = 0;
  const uint8_t* bytes = NULL;
  size_t byteLength = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &buffer) ||
      !read_byte_view(env, args[1], &bytes, &byteLength)) return NULL;
  /* The length is the view's own, never a separate argument. */
  const CNA_Result result = g_api.storage_buffer_set_bytes(buffer, bytes, (uint64_t) byteLength);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_buffer_set_bytes", result);
  return undefined_result(env, "cna_storage_buffer_set_bytes");
}

static napi_value storage_buffer_get_bytes(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle buffer = 0;
  uint64_t byteLength = 0;
  void* data = NULL;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &buffer) ||
      !read_count(env, args[1], &byteLength,
        "a read length must be a non-negative safe integer")) return NULL;
  if (byteLength > SIZE_MAX) return throw_message(env, "the read exceeds the host address space");
  if (napi_create_buffer(env, (size_t) byteLength, &data, &output) != napi_ok) {
    return throw_napi(env, "storage-buffer read allocation");
  }
  const CNA_Result result = g_api.storage_buffer_get_bytes(buffer, data, byteLength);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_storage_buffer_get_bytes", result);
  return output;
}

static napi_value storage_buffer_set_elements(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle buffer = 0;
  const uint8_t* bytes = NULL;
  size_t byteLength = 0;
  uint64_t elementSize = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &buffer) ||
      !read_byte_view(env, args[1], &bytes, &byteLength) ||
      !read_count(env, args[2], &elementSize,
        "an element size must be a non-negative safe integer")) return NULL;
  if (elementSize == 0) return throw_message(env, "an element size must be positive");
  if (byteLength % (size_t) elementSize != 0) {
    return throw_message(env, "the payload is not a whole number of elements");
  }
  /* The count is derived from the view rather than trusted from the caller, so the two can never
   * disagree in a direction that would read past the array. */
  const CNA_Result result = g_api.storage_buffer_set_elements(
    buffer, bytes, (uint64_t) (byteLength / (size_t) elementSize), elementSize);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_storage_buffer_set_elements", result);
  }
  return undefined_result(env, "cna_storage_buffer_set_elements");
}

static napi_value storage_buffer_get_elements(napi_env env, napi_callback_info info) {
  napi_value args[3], output;
  CNA_Handle buffer = 0;
  uint64_t count = 0, elementSize = 0;
  void* data = NULL;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &buffer) ||
      !read_count(env, args[1], &count,
        "an element count must be a non-negative safe integer") ||
      !read_count(env, args[2], &elementSize,
        "an element size must be a non-negative safe integer")) return NULL;
  if (elementSize == 0) return throw_message(env, "an element size must be positive");
  if (count != 0 && elementSize > SIZE_MAX / count) {
    return throw_message(env, "the read exceeds the host address space");
  }
  if (napi_create_buffer(env, (size_t) (count * elementSize), &data, &output) != napi_ok) {
    return throw_napi(env, "storage-buffer element read allocation");
  }
  const CNA_Result result = g_api.storage_buffer_get_elements(buffer, data, count, elementSize);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_storage_buffer_get_elements", result);
  }
  return output;
}

static napi_value storage_buffer_u64(
  napi_env env, napi_callback_info info, HandleU64OutFn route, const char* name
) {
  napi_value args[1], output;
  CNA_Handle buffer = 0;
  uint64_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &buffer)) return NULL;
  const CNA_Result result = route(buffer, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  if (value > 9007199254740991ULL) {
    return throw_message(env, "the size exceeds an exact JavaScript integer");
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) value, &output), name);
  return output;
}

static napi_value storage_buffer_get_byte_size(napi_env env, napi_callback_info info) {
  return storage_buffer_u64(env, info, g_api.storage_buffer_get_byte_size,
    "cna_storage_buffer_get_byte_size");
}
static napi_value storage_buffer_get_element_count(napi_env env, napi_callback_info info) {
  return storage_buffer_u64(env, info, g_api.storage_buffer_get_element_count,
    "cna_storage_buffer_get_element_count");
}
static napi_value storage_buffer_get_element_byte_size(napi_env env, napi_callback_info info) {
  return storage_buffer_u64(env, info, g_api.storage_buffer_get_element_byte_size,
    "cna_storage_buffer_get_element_byte_size");
}
static napi_value storage_buffer_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.storage_buffer_destroy, "cna_storage_buffer_destroy");
}

/*
 * `cna_compute_shader_create` is documented to succeed even when the source does not compile, so
 * that a caller can read the compiler log through `is_valid` and `copy_compile_error`. The
 * implementation throws instead, which the C ABI's exception barrier turns into INTERNAL with no
 * handle -- see docs/upstream-cna-findings.md. Both routes are bound anyway: they are the
 * documented contract, this binding does not paper over the difference, and
 * test/native-cna.integration.mjs asserts what CNA actually does today so the day it changes is
 * visible here.
 */
static napi_value compute_shader_create(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle device = 0;
  char* source = NULL;
  size_t sourceLength = 0;
  CNA_ComputeShaderHandle shader = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      !read_utf8(env, args[1], &source, &sourceLength)) return NULL;
  const CNA_StringView view = {source, sourceLength};
  const CNA_Result result = g_api.compute_shader_create(device, view, &shader);
  free(source);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compute_shader_create", result);
  return make_handle(env, shader);
}

static napi_value compute_shader_set_uniform_int(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle shader = 0;
  char* name = NULL;
  size_t nameLength = 0;
  int32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &shader) ||
      !read_utf8(env, args[1], &name, &nameLength)) return NULL;
  if (napi_get_value_int32(env, args[2], &value) != napi_ok) {
    free(name);
    return throw_message(env, "a uniform's integer value must be a number");
  }
  const CNA_StringView view = {name, nameLength};
  const CNA_Result result = g_api.compute_shader_set_uniform_int(shader, view, value);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compute_shader_set_uniform_int", result);
  }
  return undefined_result(env, "cna_compute_shader_set_uniform_int");
}

static napi_value compute_shader_set_uniform_float(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle shader = 0;
  char* name = NULL;
  size_t nameLength = 0;
  double value = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &shader) ||
      !read_utf8(env, args[1], &name, &nameLength)) return NULL;
  if (napi_get_value_double(env, args[2], &value) != napi_ok) {
    free(name);
    return throw_message(env, "a uniform's float value must be a number");
  }
  const CNA_StringView view = {name, nameLength};
  const CNA_Result result = g_api.compute_shader_set_uniform_float(shader, view, (float) value);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compute_shader_set_uniform_float", result);
  }
  return undefined_result(env, "cna_compute_shader_set_uniform_float");
}

static napi_value compute_shader_bind_storage_buffer(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle shader = 0, buffer = 0;
  int32_t binding = 0;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &shader) ||
      napi_get_value_int32(env, args[1], &binding) != napi_ok ||
      !read_handle(env, args[2], &buffer)) return NULL;
  const CNA_Result result = g_api.compute_shader_bind_storage_buffer(shader, binding, buffer);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compute_shader_bind_storage_buffer", result);
  }
  return undefined_result(env, "cna_compute_shader_bind_storage_buffer");
}

static napi_value compute_shader_bind_texture(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle shader = 0, texture = 0;
  int32_t unit = 0;
  char* name = NULL;
  size_t nameLength = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &shader) ||
      napi_get_value_int32(env, args[1], &unit) != napi_ok ||
      !read_utf8(env, args[2], &name, &nameLength)) return NULL;
  if (!read_handle(env, args[3], &texture)) {
    free(name);
    return NULL;
  }
  const CNA_StringView view = {name, nameLength};
  const CNA_Result result = g_api.compute_shader_bind_texture(shader, unit, view, texture);
  free(name);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compute_shader_bind_texture", result);
  }
  return undefined_result(env, "cna_compute_shader_bind_texture");
}

static napi_value compute_shader_bind_image(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle shader = 0, texture = 0;
  int32_t unit = 0;
  uint32_t access = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &shader) ||
      napi_get_value_int32(env, args[1], &unit) != napi_ok ||
      !read_handle(env, args[2], &texture) ||
      napi_get_value_uint32(env, args[3], &access) != napi_ok) return NULL;
  const CNA_Result result = g_api.compute_shader_bind_image(shader, unit, texture, access);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compute_shader_bind_image", result);
  }
  return undefined_result(env, "cna_compute_shader_bind_image");
}

static napi_value compute_shader_dispatch(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle shader = 0;
  int32_t x = 0, y = 0, z = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &shader) ||
      napi_get_value_int32(env, args[1], &x) != napi_ok ||
      napi_get_value_int32(env, args[2], &y) != napi_ok ||
      napi_get_value_int32(env, args[3], &z) != napi_ok) return NULL;
  const CNA_Result result = g_api.compute_shader_dispatch(shader, x, y, z);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compute_shader_dispatch", result);
  return undefined_result(env, "cna_compute_shader_dispatch");
}

static napi_value compute_shader_barrier(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle shader = 0;
  uint32_t bits = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &shader) ||
      napi_get_value_uint32(env, args[1], &bits) != napi_ok) return NULL;
  const CNA_Result result = g_api.compute_shader_barrier(shader, bits);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compute_shader_barrier", result);
  return undefined_result(env, "cna_compute_shader_barrier");
}

/*
 * Neither of the two copy-text routes here has a separate size route: CNA's contract is to ask
 * with a zero capacity first, which reports the byte count without writing anything.
 */
static napi_value copy_sized_text(
  napi_env env, napi_callback_info info, HandleCopyStringFn route, const char* name
) {
  napi_value args[1], output;
  CNA_Handle handle = 0;
  uint64_t length = 0, copied = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  CNA_Result result = route(handle, NULL, 0, &length);
  if (result != CNA_RESULT_SUCCESS && result != CNA_RESULT_BUFFER_TOO_SMALL) {
    return throw_result(env, name, result);
  }
  if (length > SIZE_MAX) return throw_message(env, "native string exceeds host address space");
  char* value = length == 0 ? NULL : (char*) malloc((size_t) length);
  if (length != 0 && !value) return throw_message(env, "native string allocation failed");
  result = route(handle, value, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(value);
    return throw_result(env, name, result);
  }
  const napi_status status =
    napi_create_string_utf8(env, value ? value : "", (size_t) length, &output);
  free(value);
  if (status != napi_ok) return throw_napi(env, name);
  return output;
}

static napi_value compute_shader_copy_compile_error(napi_env env, napi_callback_info info) {
  return copy_sized_text(env, info, g_api.compute_shader_copy_compile_error,
    "cna_compute_shader_copy_compile_error");
}
static napi_value compute_shader_is_valid(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.compute_shader_is_valid, "cna_compute_shader_is_valid");
}
static napi_value compute_shader_is_image_binding_supported(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.compute_shader_is_image_binding_supported,
    "cna_compute_shader_is_image_binding_supported");
}
static napi_value compute_shader_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.compute_shader_destroy, "cna_compute_shader_destroy");
}

/*
 * A GPU timer creates on every renderer, including those with no timer query at all: CNA answers
 * that through `is_supported` and a written reason rather than by refusing the create. Measured:
 * HEADLESS creates one and reports unsupported with a reason naming the missing GL extension,
 * OPENGLES3 reports supported, and SDL_RENDERER and SOFTWARE refuse the create outright.
 */
static napi_value gpu_timer_create(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0, timer = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.gpu_timer_create(device, &timer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gpu_timer_create", result);
  return make_handle(env, timer);
}

static napi_value gpu_timer_copy_unsupported_reason(napi_env env, napi_callback_info info) {
  return copy_sized_text(env, info, g_api.gpu_timer_copy_unsupported_reason,
    "cna_gpu_timer_copy_unsupported_reason");
}
static napi_value gpu_timer_is_supported(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.gpu_timer_is_supported, "cna_gpu_timer_is_supported");
}
static napi_value gpu_timer_is_result_available(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.gpu_timer_is_result_available,
    "cna_gpu_timer_is_result_available");
}
static napi_value gpu_timer_poll(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.gpu_timer_poll, "cna_gpu_timer_poll");
}
static napi_value gpu_timer_is_open(napi_env env, napi_callback_info info) {
  return get_handle_bool(env, info, g_api.gpu_timer_is_open, "cna_gpu_timer_is_open");
}
static napi_value gpu_timer_get_sample_count(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.gpu_timer_get_sample_count, "cna_gpu_timer_get_sample_count");
}
static napi_value gpu_timer_get_last_milliseconds(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle timer = 0;
  double value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &timer)) return NULL;
  const CNA_Result result = g_api.gpu_timer_get_last_milliseconds(timer, &value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gpu_timer_get_last_milliseconds", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, value, &output), "GPU timer measurement");
  return output;
}
static napi_value gpu_timer_begin(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.gpu_timer_begin, "cna_gpu_timer_begin");
}
static napi_value gpu_timer_end(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.gpu_timer_end, "cna_gpu_timer_end");
}
static napi_value gpu_timer_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.gpu_timer_destroy, "cna_gpu_timer_destroy");
}

/* --- the camera ---------------------------------------------------------------------------------- */
/*
 * Frame acquisition, which enumeration alone could not reach. No verification machine has a
 * camera, so CNA supplies its own test backend as a second creation route -- the same shape the
 * compass and the motion sensor use -- and a frame published through it travels the real
 * acquisition path rather than being a value this bridge invented.
 *
 * The acquisition contract is the opposite of a video player's: the camera writes into a texture
 * the *caller* owns and keeps, so nothing here is invalidated by the next call. A texture whose
 * size does not match the frame is refused rather than resized, which is CNA preserving the
 * canonical behaviour rather than improving on it.
 */

static napi_value camera_create(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.camera_create, "cna_camera_create");
}
static napi_value camera_create_with_test_backend(napi_env env, napi_callback_info info) {
  return pp_create(env, info, g_api.camera_create_with_test_backend_ext,
    "cna_camera_create_with_test_backend_ext");
}
static napi_value camera_get_frame_width(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.camera_get_frame_width_ext,
    "cna_camera_get_frame_width_ext");
}
static napi_value camera_get_frame_height(napi_env env, napi_callback_info info) {
  return pp_get_i32(env, info, g_api.camera_get_frame_height_ext,
    "cna_camera_get_frame_height_ext");
}
static napi_value camera_destroy(napi_env env, napi_callback_info info) {
  return pp_handle_only(env, info, g_api.camera_destroy, "cna_camera_destroy");
}

static napi_value camera_get_state(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle camera = 0;
  CNA_CameraState state = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &camera)) return NULL;
  const CNA_Result result = g_api.camera_get_state_ext(camera, &state);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_camera_get_state_ext", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, state, &output), "camera state");
  return output;
}

static napi_value camera_set_test_state(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle camera = 0;
  uint32_t state = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &camera) ||
      napi_get_value_uint32(env, args[1], &state) != napi_ok) return NULL;
  const CNA_Result result = g_api.camera_set_test_state_ext(camera, state);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_camera_set_test_state_ext", result);
  }
  return undefined_result(env, "cna_camera_set_test_state_ext");
}

static napi_value camera_try_acquire_frame(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle camera = 0, texture = 0;
  CNA_Bool acquired = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &camera) ||
      !read_handle(env, args[1], &texture)) return NULL;
  const CNA_Result result = g_api.camera_try_acquire_frame_ext(camera, texture, &acquired);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_camera_try_acquire_frame_ext", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, acquired == CNA_TRUE, &output), "camera frame");
  return output;
}

static napi_value camera_set_test_frame(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle camera = 0;
  int32_t width = 0, height = 0;
  const uint8_t* bytes = NULL;
  size_t byteLength = 0;
  napi_valuetype type = napi_undefined;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &camera) ||
      napi_get_value_int32(env, args[1], &width) != napi_ok ||
      napi_get_value_int32(env, args[2], &height) != napi_ok ||
      napi_typeof(env, args[3], &type) != napi_ok) return NULL;
  if (type == napi_null || type == napi_undefined) {
    /* Null clears the frame and closes the camera, which is its documented meaning. */
    const CNA_Result cleared = g_api.camera_set_test_frame_ext(camera, width, height, NULL, 0);
    if (cleared != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_camera_set_test_frame_ext", cleared);
    }
    return undefined_result(env, "cna_camera_set_test_frame_ext");
  }
  if (!read_byte_view(env, args[3], &bytes, &byteLength)) return NULL;
  if (byteLength % sizeof(CNA_Color) != 0) {
    return throw_message(env, "a camera frame is a whole number of RGBA8 pixels");
  }
  /* The pixel count is the view's own, so a short array cannot become a long read. CNA then
   * cross-checks it against the width and height it was given. */
  const CNA_Result result = g_api.camera_set_test_frame_ext(
    camera, width, height, (const CNA_Color*) bytes, (uint64_t) (byteLength / sizeof(CNA_Color)));
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_camera_set_test_frame_ext", result);
  }
  return undefined_result(env, "cna_camera_set_test_frame_ext");
}

/* --- the extended device layer ---------------------------------------------------------------- */
/*
 * Host facts a game reads once at startup: how many cores it has, how much memory, whether it is on
 * a battery, what the display's scale and safe area are, which languages the user prefers, and
 * which cameras exist. Every one of these is exported in both build states and answers
 * NOT_SUPPORTED where the extension layer is compiled out, so availability is asked rather than
 * inferred from a refusal.
 */

static napi_value devices_ext_available(napi_env env, napi_callback_info info) {
  (void) info;
  napi_value output;
  CNA_Bool available = CNA_FALSE;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.devices_ext_is_available(&available);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_devices_ext_is_available", result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, available != CNA_FALSE, &output), "device layer");
  return output;
}

static napi_value device_indexed_text(
  napi_env env, CNA_Handle game, uint64_t index,
  DevicesIndexSizeFn size_route, DevicesLocaleCopyFn copy_route,
  const char* size_name, const char* copy_name
) {
  uint64_t length = 0;
  CNA_Result result = size_route(game, index, &length);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, size_name, result);
  if (length > SIZE_MAX - 1) return throw_message(env, "a device name exceeds the address space");
  char* text = (char*) malloc((size_t) length + 1);
  if (!text) return throw_message(env, "device-name allocation failed");
  uint64_t copied = 0;
  result = copy_route(game, index, text, length, &copied);
  if (result != CNA_RESULT_SUCCESS || copied != length) {
    free(text);
    return throw_result(env, copy_name, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  text[length] = '\0';
  napi_value output;
  const napi_status status = napi_create_string_utf8(env, text, (size_t) length, &output);
  free(text);
  if (status != napi_ok) return throw_napi(env, copy_name);
  return output;
}

static napi_value get_host_device_info(napi_env env, napi_callback_info info) {
  napi_value args[1], output, safe_area;
  CNA_Handle game = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  int32_t cores = 0, ram = 0, battery = 0, seconds = 0;
  uint32_t power = 0;
  float scale = 0;
  CNA_Rectangle area;
  memset(&area, 0, sizeof(area));
  CNA_Result result = g_api.system_info_cpu_cores(game, &cores);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_system_info_get_logical_cpu_core_count_ext", result);
  }
  result = g_api.system_info_ram_megabytes(game, &ram);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_system_info_get_system_ram_megabytes_ext", result);
  }
  result = g_api.power_get_state(game, &power);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_power_get_state_ext", result);
  result = g_api.power_get_battery_percent(game, &battery);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_power_get_battery_percent_ext", result);
  }
  result = g_api.power_get_seconds_remaining(game, &seconds);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_power_get_seconds_remaining_ext", result);
  }
  result = g_api.display_get_content_scale(game, &scale);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_display_info_get_content_scale_ext", result);
  }
  result = g_api.display_get_safe_area(game, &area);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_display_info_get_safe_area_ext", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "host device info");
  NAPI_OR_RETURN(env, napi_create_object(env, &safe_area), "host device info");
  if (!set_i32_property(env, output, "LogicalCpuCoreCount", cores) ||
      !set_i32_property(env, output, "SystemRamMegabytes", ram) ||
      !set_u32_property(env, output, "PowerState", power) ||
      !set_i32_property(env, output, "BatteryPercent", battery) ||
      !set_i32_property(env, output, "SecondsRemaining", seconds) ||
      !set_double_property(env, output, "ContentScale", (double) scale) ||
      !set_i32_property(env, safe_area, "X", area.x) ||
      !set_i32_property(env, safe_area, "Y", area.y) ||
      !set_i32_property(env, safe_area, "Width", area.width) ||
      !set_i32_property(env, safe_area, "Height", area.height) ||
      napi_set_named_property(env, output, "SafeArea", safe_area) != napi_ok) {
    return throw_napi(env, "host device info");
  }
  return output;
}

static napi_value get_preferred_locales(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.locale_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_locale_get_preferred_count_ext", result);
  }
  if (count > UINT32_MAX) return throw_message(env, "too many preferred locales");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &output), "locales");
  for (uint64_t index = 0; index < count; index += 1) {
    napi_value entry;
    napi_value language = device_indexed_text(
      env, game, index, g_api.locale_get_language_size, g_api.locale_copy_language,
      "cna_locale_get_language_size_at_ext", "cna_locale_copy_language_at_ext");
    if (!language) return NULL;
    napi_value country = device_indexed_text(
      env, game, index, g_api.locale_get_country_size, g_api.locale_copy_country,
      "cna_locale_get_country_size_at_ext", "cna_locale_copy_country_at_ext");
    if (!country) return NULL;
    if (napi_create_object(env, &entry) != napi_ok ||
        napi_set_named_property(env, entry, "Language", language) != napi_ok ||
        napi_set_named_property(env, entry, "Country", country) != napi_ok ||
        napi_set_element(env, output, (uint32_t) index, entry) != napi_ok) {
      return throw_napi(env, "locales");
    }
  }
  return output;
}

static napi_value set_clipboard_text(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle game = 0;
  char* text = NULL;
  size_t length = 0;
  CNA_Bool accepted = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &game) ||
      !read_utf8(env, args[1], &text, &length)) return NULL;
  const CNA_StringView view = {text, length};
  const CNA_Result result = g_api.devices_clipboard_set_text(game, view, &accepted);
  free(text);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_devices_clipboard_set_text_ext", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, accepted != CNA_FALSE, &output), "clipboard");
  return output;
}

static napi_value get_cameras(napi_env env, napi_callback_info info) {
  napi_value args[1], output, list;
  CNA_Handle game = 0;
  CNA_Bool supported = CNA_FALSE;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.camera_get_is_supported(game, &supported);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_camera_get_is_supported_ext", result);
  result = g_api.camera_get_count(game, &count);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_camera_get_count_ext", result);
  if (count > UINT32_MAX) return throw_message(env, "too many cameras");
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "cameras");
  NAPI_OR_RETURN(env, napi_create_array_with_length(env, (size_t) count, &list), "cameras");
  for (uint64_t index = 0; index < count; index += 1) {
    CNA_CameraDeviceInfo camera;
    memset(&camera, 0, sizeof(camera));
    result = g_api.camera_device_info_init(&camera);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_camera_device_info_init", result);
    }
    result = g_api.camera_get_info(game, index, &camera);
    if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_camera_get_info_at_ext", result);
    napi_value name = device_indexed_text(
      env, game, index, g_api.camera_get_name_size, g_api.camera_copy_name,
      "cna_camera_get_name_size_at_ext", "cna_camera_copy_name_at_ext");
    if (!name) return NULL;
    napi_value entry;
    if (napi_create_object(env, &entry) != napi_ok ||
        !set_u32_property(env, entry, "Position", camera.position) ||
        napi_set_named_property(env, entry, "Name", name) != napi_ok ||
        napi_set_element(env, list, (uint32_t) index, entry) != napi_ok) {
      return throw_napi(env, "cameras");
    }
  }
  if (!set_bool_property(env, output, "IsSupported", supported) ||
      napi_set_named_property(env, output, "Devices", list) != napi_ok) {
    return throw_napi(env, "cameras");
  }
  return output;
}

/* --- gamer services: the dispatcher's lifetime and the Guide's state -------------------------- */
/*
 * Only the parts a HEADLESS Linux host can answer honestly. The dispatcher's own lifetime and the
 * Guide's state are real CNA state that any native component would see; everything that needs a
 * signed-in user, a friends list or a platform overlay stays refused above this line, because a
 * fabricated gamer is worse than a truthful GamerServicesNotAvailableException.
 */

static napi_value gs_bool_out(
  napi_env env, napi_callback_info info, BoolOutFn route, const char* name
) {
  (void) info;
  napi_value output;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = route(&value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value != CNA_FALSE, &output), name);
  return output;
}

static napi_value gs_bool_in(
  napi_env env, napi_callback_info info, BoolInFn route, const char* name
) {
  napi_value args[1];
  bool value = false;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_bool(env, args[0], &value) != napi_ok) {
    return throw_message(env, "expected a boolean");
  }
  const CNA_Result result = route(value ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value initialize_gamer_services(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle game = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.gamer_services_initialize(game);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gamer_services_dispatcher_initialize", result);
  }
  return undefined_result(env, "gamer services initialization");
}

static napi_value gamer_services_is_initialized(napi_env env, napi_callback_info info) {
  return gs_bool_out(
    env, info, g_api.gamer_services_is_initialized,
    "cna_gamer_services_dispatcher_get_is_initialized");
}

static napi_value update_gamer_services(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.gamer_services_update();
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gamer_services_dispatcher_update", result);
  }
  return undefined_result(env, "gamer services update");
}

static napi_value get_gamer_services_window_handle(napi_env env, napi_callback_info info) {
  (void) info;
  uint64_t handle = 0;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.gamer_services_get_window_handle(&handle);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gamer_services_dispatcher_get_window_handle", result);
  }
  /* A platform window handle, and a bigint on the way out: it is 64 bits wide and a Number would
     round one on a host that hands out high addresses. */
  napi_value output;
  NAPI_OR_RETURN(env, napi_create_bigint_uint64(env, handle, &output), "window handle");
  return output;
}

static napi_value set_gamer_services_window_handle(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle handle = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle_allow_zero(env, args[0], &handle)) return NULL;
  const CNA_Result result = g_api.gamer_services_set_window_handle(handle);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gamer_services_dispatcher_set_window_handle", result);
  }
  return undefined_result(env, "window handle");
}

static napi_value guide_is_visible(napi_env env, napi_callback_info info) {
  return gs_bool_out(env, info, g_api.guide_get_is_visible, "cna_guide_get_is_visible");
}

static napi_value guide_is_trial_mode(napi_env env, napi_callback_info info) {
  return gs_bool_out(env, info, g_api.guide_get_is_trial_mode, "cna_guide_get_is_trial_mode");
}

static napi_value guide_get_simulate_trial(napi_env env, napi_callback_info info) {
  return gs_bool_out(env, info, g_api.guide_get_simulate_trial_mode, "cna_guide_get_simulate_trial_mode");
}

static napi_value guide_set_simulate_trial(napi_env env, napi_callback_info info) {
  return gs_bool_in(env, info, g_api.guide_set_simulate_trial_mode, "cna_guide_set_simulate_trial_mode");
}

static napi_value guide_get_screen_saver(napi_env env, napi_callback_info info) {
  return gs_bool_out(
    env, info, g_api.guide_get_is_screen_saver_enabled, "cna_guide_get_is_screen_saver_enabled");
}

static napi_value guide_set_screen_saver(napi_env env, napi_callback_info info) {
  return gs_bool_in(
    env, info, g_api.guide_set_is_screen_saver_enabled, "cna_guide_set_is_screen_saver_enabled");
}

static napi_value guide_get_notification_position(napi_env env, napi_callback_info info) {
  (void) info;
  napi_value output;
  uint32_t position = 0;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.guide_get_notification_position(&position);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_get_notification_position", result);
  }
  NAPI_OR_RETURN(env, napi_create_uint32(env, position, &output), "notification position");
  return output;
}

static napi_value guide_set_notification_position(napi_env env, napi_callback_info info) {
  napi_value args[1];
  uint32_t position = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_uint32(env, args[0], &position) != napi_ok) {
    return throw_message(env, "expected a notification position");
  }
  const CNA_Result result = g_api.guide_set_notification_position(position);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_set_notification_position", result);
  }
  return undefined_result(env, "notification position");
}

/* --- the Guide's two asynchronous operations ---------------------------------------------------- */
/*
 * `Guide.BeginShowMessageBox` and `Guide.BeginShowKeyboardInput` are the only genuinely
 * asynchronous begin/end pairs in this ABI: the operation stays pending until the user answers,
 * and only then does the callback run. On a verification host there is no user, so CNA supplies
 * the answer itself -- `simulate_message_box_click_ext` and `simulate_keyboard_input_cancel_ext`
 * are the same deterministic injection the sensors and the camera use, and the completion still
 * travels the real path.
 *
 * The callback carries only a context pointer, so the bridge owns one record per pending
 * operation, holding a `napi_ref` to the JavaScript continuation. CNA completes synchronously on
 * the thread that simulated the answer, which is why calling straight into JavaScript here is
 * safe -- the same assumption the text-input subscriptions already make. Any exception the
 * continuation raises is cleared at the boundary rather than unwinding through CNA.
 */

typedef struct GuideAsyncContext {
  napi_env env;
  napi_ref callback;
  int completed;
  struct GuideAsyncContext* next;
} GuideAsyncContext;

static GuideAsyncContext* g_guide_async;

static GuideAsyncContext* guide_async_create(napi_env env, napi_value callback) {
  GuideAsyncContext* context = (GuideAsyncContext*) calloc(1, sizeof(GuideAsyncContext));
  if (!context) return NULL;
  context->env = env;
  if (napi_create_reference(env, callback, 1, &context->callback) != napi_ok) {
    free(context);
    return NULL;
  }
  context->next = g_guide_async;
  g_guide_async = context;
  return context;
}

static void guide_async_release(GuideAsyncContext* target) {
  if (!target) return;
  GuideAsyncContext** link = &g_guide_async;
  while (*link) {
    if (*link == target) {
      *link = target->next;
      break;
    }
    link = &(*link)->next;
  }
  if (target->callback) napi_delete_reference(target->env, target->callback);
  free(target);
}

/* Only a context this bridge created is ever dereferenced. */
static int guide_async_is_live(const GuideAsyncContext* candidate) {
  for (const GuideAsyncContext* value = g_guide_async; value; value = value->next) {
    if (value == candidate) return 1;
  }
  return 0;
}

static void on_guide_async(void* raw) {
  GuideAsyncContext* context = (GuideAsyncContext*) raw;
  if (!context || !guide_async_is_live(context)) return;
  context->completed = 1;
  napi_handle_scope scope;
  if (napi_open_handle_scope(context->env, &scope) != napi_ok) return;
  napi_value callback, receiver, result;
  napi_status status = napi_get_reference_value(context->env, context->callback, &callback);
  if (status == napi_ok) status = napi_get_undefined(context->env, &receiver);
  if (status == napi_ok) {
    status = napi_call_function(context->env, receiver, callback, 0, NULL, &result);
  }
  if (status == napi_pending_exception) {
    napi_value exception;
    napi_get_and_clear_last_exception(context->env, &exception);
  }
  napi_close_handle_scope(context->env, scope);
  /* The record is released by the JavaScript side's End call, not here: the continuation may run
     before End does, and freeing it now would leave End with a dangling token. */
}

static napi_value guide_begin_show_message_box(napi_env env, napi_callback_info info) {
  napi_value args[7], element;
  int32_t player = 0, focusButton = 0;
  uint32_t icon = 0, buttonCount = 0;
  char* title = NULL;
  char* text = NULL;
  size_t titleLength = 0, textLength = 0;
  char** captions = NULL;
  CNA_StringView* views = NULL;
  GuideAsyncContext* context = NULL;
  bool isArray = false;
  napi_value output;
  if (!require_loaded(env) || !get_args(env, info, 7, args) ||
      napi_get_value_int32(env, args[0], &player) != napi_ok ||
      !read_utf8(env, args[1], &title, &titleLength)) return NULL;
  if (!read_utf8(env, args[2], &text, &textLength)) {
    free(title);
    return NULL;
  }
  if (napi_is_array(env, args[3], &isArray) != napi_ok || !isArray ||
      napi_get_array_length(env, args[3], &buttonCount) != napi_ok || buttonCount == 0) {
    free(title);
    free(text);
    return throw_message(env, "a message box needs at least one button caption");
  }
  captions = (char**) calloc(buttonCount, sizeof(char*));
  views = (CNA_StringView*) calloc(buttonCount, sizeof(CNA_StringView));
  if (!captions || !views) {
    free(captions);
    free(views);
    free(title);
    free(text);
    return throw_message(env, "message-box caption allocation failed");
  }
  for (uint32_t index = 0; index < buttonCount; index += 1) {
    size_t length = 0;
    if (napi_get_element(env, args[3], index, &element) != napi_ok ||
        !read_utf8(env, element, &captions[index], &length)) {
      for (uint32_t undo = 0; undo < index; undo += 1) free(captions[undo]);
      free(captions);
      free(views);
      free(title);
      free(text);
      return NULL;
    }
    views[index].data = captions[index];
    views[index].byte_length = length;
  }
  if (napi_get_value_int32(env, args[4], &focusButton) != napi_ok ||
      napi_get_value_uint32(env, args[5], &icon) != napi_ok) {
    goto cleanup_arguments;
  }
  context = guide_async_create(env, args[6]);
  if (!context) {
    throw_message(env, "the message-box continuation could not be retained");
    goto cleanup_arguments;
  }
  {
    const CNA_StringView titleView = {title, titleLength};
    const CNA_StringView textView = {text, textLength};
    const CNA_Result result = g_api.guide_begin_show_message_box(
      player, titleView, textView, views, buttonCount, focusButton, icon,
      on_guide_async, context);
    if (result != CNA_RESULT_SUCCESS) {
      guide_async_release(context);
      context = NULL;
      throw_result(env, "cna_guide_begin_show_message_box", result);
      goto cleanup_arguments;
    }
  }
  for (uint32_t index = 0; index < buttonCount; index += 1) free(captions[index]);
  free(captions);
  free(views);
  free(title);
  free(text);
  /* The token the End call gives back, so this bridge never dereferences a pointer it did not
     create: it is checked against the live list first. */
  if (napi_create_external(env, context, NULL, NULL, &output) != napi_ok) {
    return throw_napi(env, "message-box continuation token");
  }
  return output;

cleanup_arguments:
  for (uint32_t index = 0; index < buttonCount; index += 1) free(captions[index]);
  free(captions);
  free(views);
  free(title);
  free(text);
  return NULL;
}

static int guide_read_token(napi_env env, napi_value value, GuideAsyncContext** out) {
  void* raw = NULL;
  if (napi_get_value_external(env, value, &raw) != napi_ok || raw == NULL) {
    throw_message(env, "expected a Guide continuation token");
    return 0;
  }
  GuideAsyncContext* context = (GuideAsyncContext*) raw;
  if (!guide_async_is_live(context)) {
    throw_message(env, "this Guide operation has already been completed");
    return 0;
  }
  *out = context;
  return 1;
}

static napi_value guide_end_show_message_box(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  GuideAsyncContext* context = NULL;
  CNA_Bool hasChoice = CNA_FALSE;
  int32_t button = -1;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !guide_read_token(env, args[0], &context)) return NULL;
  const CNA_Result result = g_api.guide_end_show_message_box(&hasChoice, &button);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_end_show_message_box", result);
  }
  guide_async_release(context);
  if (hasChoice == CNA_FALSE) {
    /* A box dismissed without a choice is an ordinary success with no answer, which is what
       XNA's nullable return means. */
    NAPI_OR_RETURN(env, napi_get_null(env, &output), "message box answer");
    return output;
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, button, &output), "message box answer");
  return output;
}

static napi_value guide_begin_show_keyboard_input(napi_env env, napi_callback_info info) {
  napi_value args[6], output;
  int32_t player = 0;
  char* title = NULL;
  char* description = NULL;
  char* defaultText = NULL;
  size_t titleLength = 0, descriptionLength = 0, defaultLength = 0;
  bool password = false;
  GuideAsyncContext* context = NULL;
  if (!require_loaded(env) || !get_args(env, info, 6, args) ||
      napi_get_value_int32(env, args[0], &player) != napi_ok ||
      !read_utf8(env, args[1], &title, &titleLength)) return NULL;
  if (!read_utf8(env, args[2], &description, &descriptionLength)) {
    free(title);
    return NULL;
  }
  if (!read_utf8(env, args[3], &defaultText, &defaultLength)) {
    free(title);
    free(description);
    return NULL;
  }
  if (napi_get_value_bool(env, args[4], &password) != napi_ok) {
    free(title);
    free(description);
    free(defaultText);
    return throw_message(env, "usePasswordMode must be a boolean");
  }
  context = guide_async_create(env, args[5]);
  if (!context) {
    free(title);
    free(description);
    free(defaultText);
    return throw_message(env, "the keyboard-input continuation could not be retained");
  }
  {
    const CNA_StringView titleView = {title, titleLength};
    const CNA_StringView descriptionView = {description, descriptionLength};
    const CNA_StringView defaultView = {defaultText, defaultLength};
    const CNA_Result result = g_api.guide_begin_show_keyboard_input(
      player, titleView, descriptionView, defaultView, password ? CNA_TRUE : CNA_FALSE,
      on_guide_async, context);
    free(title);
    free(description);
    free(defaultText);
    if (result != CNA_RESULT_SUCCESS) {
      guide_async_release(context);
      return throw_result(env, "cna_guide_begin_show_keyboard_input", result);
    }
  }
  if (napi_create_external(env, context, NULL, NULL, &output) != napi_ok) {
    return throw_napi(env, "keyboard-input continuation token");
  }
  return output;
}

static napi_value guide_end_show_keyboard_input(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  GuideAsyncContext* context = NULL;
  CNA_Bool canceled = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !guide_read_token(env, args[0], &context)) return NULL;
  CNA_Result result = g_api.guide_was_keyboard_input_canceled_ext(&canceled);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_was_keyboard_input_canceled_ext", result);
  }
  if (canceled != CNA_FALSE) {
    /* XNA returns null for a cancelled input, which is not the same as an empty string. */
    guide_async_release(context);
    NAPI_OR_RETURN(env, napi_get_null(env, &output), "keyboard input answer");
    return output;
  }
  uint64_t required = 0;
  result = g_api.guide_end_show_keyboard_input_size(&required);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_end_show_keyboard_input_size", result);
  }
  if (required > SIZE_MAX) return throw_message(env, "the typed text exceeds the address space");
  char* text = required == 0 ? NULL : (char*) malloc((size_t) required);
  if (required != 0 && !text) return throw_message(env, "keyboard-input allocation failed");
  uint64_t produced = 0;
  result = g_api.guide_end_show_keyboard_input(text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, "cna_guide_end_show_keyboard_input", result);
  }
  const napi_status created =
    napi_create_string_utf8(env, text ? text : "", (size_t) required, &output);
  free(text);
  if (created != napi_ok) return throw_napi(env, "keyboard input answer");
  guide_async_release(context);
  return output;
}

static napi_value guide_bool_out(
  napi_env env, napi_callback_info info, GuideBoolOutFn route, const char* name
) {
  napi_value output;
  CNA_Bool value = CNA_FALSE;
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = route(&value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value == CNA_TRUE, &output), name);
  return output;
}

static napi_value guide_has_pending_message_box(napi_env env, napi_callback_info info) {
  return guide_bool_out(env, info, g_api.guide_get_has_pending_message_box_ext,
    "cna_guide_get_has_pending_message_box_ext");
}
static napi_value guide_has_pending_keyboard_input(napi_env env, napi_callback_info info) {
  return guide_bool_out(env, info, g_api.guide_get_has_pending_keyboard_input_ext,
    "cna_guide_get_has_pending_keyboard_input_ext");
}
static napi_value guide_was_keyboard_input_canceled(napi_env env, napi_callback_info info) {
  return guide_bool_out(env, info, g_api.guide_was_keyboard_input_canceled_ext,
    "cna_guide_was_keyboard_input_canceled_ext");
}

static napi_value guide_pending_message_box_focus_button(napi_env env, napi_callback_info info) {
  napi_value output;
  int32_t value = -1;
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = g_api.guide_get_pending_message_box_focus_button_ext(&value);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_get_pending_message_box_focus_button_ext", result);
  }
  NAPI_OR_RETURN(env, napi_create_int32(env, value, &output), "pending focus button");
  return output;
}

static napi_value guide_copy_pending_text(
  napi_env env, GuideSizeFn sizeRoute, GuideCopyFn copyRoute, const char* name
) {
  napi_value output;
  uint64_t required = 0;
  CNA_Result result = sizeRoute(&required);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  if (required > SIZE_MAX) return throw_message(env, "pending text exceeds the address space");
  char* text = required == 0 ? NULL : (char*) malloc((size_t) required);
  if (required != 0 && !text) return throw_message(env, "pending-text allocation failed");
  uint64_t produced = 0;
  result = copyRoute(text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, name, result);
  }
  const napi_status created =
    napi_create_string_utf8(env, text ? text : "", (size_t) required, &output);
  free(text);
  if (created != napi_ok) return throw_napi(env, name);
  return output;
}

static napi_value guide_pending_keyboard_title(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  return guide_copy_pending_text(env, g_api.guide_get_pending_keyboard_input_title_size_ext,
    g_api.guide_copy_pending_keyboard_input_title_ext,
    "cna_guide_copy_pending_keyboard_input_title_ext");
}
static napi_value guide_pending_keyboard_description(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  return guide_copy_pending_text(env, g_api.guide_get_pending_keyboard_input_description_size_ext,
    g_api.guide_copy_pending_keyboard_input_description_ext,
    "cna_guide_copy_pending_keyboard_input_description_ext");
}
static napi_value guide_pending_keyboard_display_text(napi_env env, napi_callback_info info) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  return guide_copy_pending_text(
    env, g_api.guide_get_pending_keyboard_input_display_text_size_ext,
    g_api.guide_copy_pending_keyboard_input_display_text_ext,
    "cna_guide_copy_pending_keyboard_input_display_text_ext");
}

static napi_value guide_simulate_message_box_click(napi_env env, napi_callback_info info) {
  napi_value args[1];
  int32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      napi_get_value_int32(env, args[0], &index) != napi_ok) return NULL;
  const CNA_Result result = g_api.guide_simulate_message_box_click_ext(index);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_guide_simulate_message_box_click_ext", result);
  }
  return undefined_result(env, "cna_guide_simulate_message_box_click_ext");
}

static napi_value guide_void_route(
  napi_env env, napi_callback_info info, GuideVoidFn route, const char* name
) {
  (void) info;
  if (!require_loaded(env)) return NULL;
  const CNA_Result result = route();
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value guide_simulate_keyboard_input_cancel(napi_env env, napi_callback_info info) {
  return guide_void_route(env, info, g_api.guide_simulate_keyboard_input_cancel_ext,
    "cna_guide_simulate_keyboard_input_cancel_ext");
}
static napi_value guide_reset_pending_keyboard_input(napi_env env, napi_callback_info info) {
  return guide_void_route(env, info, g_api.guide_reset_pending_keyboard_input_ext,
    "cna_guide_reset_pending_keyboard_input_ext");
}

/* --- sensors ---------------------------------------------------------------------------------- */
/*
 * A sensor that is not there is not a sensor reading zero. Every route below reports the platform's
 * own answer, and a host with no accelerometer says NOT_SUPPORTED rather than handing back three
 * zeroes that a game would happily integrate into a wrong orientation.
 */

static napi_value get_sensor_support(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle game = 0;
  CNA_Bool accelerometer = CNA_FALSE, compass = CNA_FALSE, gyroscope = CNA_FALSE, motion = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  CNA_Result result = g_api.accelerometer_is_supported(game, &accelerometer);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_accelerometer_get_is_supported", result);
  result = g_api.compass_is_supported(game, &compass);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compass_get_is_supported", result);
  result = g_api.gyroscope_is_supported(game, &gyroscope);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gyroscope_get_is_supported", result);
  result = g_api.motion_is_supported(game, &motion);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_motion_get_is_supported", result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "sensor support");
  if (!set_bool_property(env, output, "Accelerometer", accelerometer) ||
      !set_bool_property(env, output, "Compass", compass) ||
      !set_bool_property(env, output, "Gyroscope", gyroscope) ||
      !set_bool_property(env, output, "Motion", motion)) {
    return throw_napi(env, "sensor support");
  }
  return output;
}

static napi_value create_accelerometer(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle game = 0, sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = g_api.accelerometer_create(game, &sensor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_accelerometer_create", result);
  return make_handle(env, sensor);
}

static napi_value accelerometer_handle_only(
  napi_env env, napi_callback_info info, GameHandleFn route, const char* name
) {
  napi_value args[1];
  CNA_Handle sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  const CNA_Result result = route(sensor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, name, result);
  return undefined_result(env, name);
}

static napi_value destroy_accelerometer(napi_env env, napi_callback_info info) {
  return accelerometer_handle_only(env, info, g_api.accelerometer_destroy, "cna_accelerometer_destroy");
}

static napi_value start_accelerometer(napi_env env, napi_callback_info info) {
  return accelerometer_handle_only(env, info, g_api.accelerometer_start, "cna_accelerometer_start");
}

static napi_value stop_accelerometer(napi_env env, napi_callback_info info) {
  return accelerometer_handle_only(env, info, g_api.accelerometer_stop, "cna_accelerometer_stop");
}

static napi_value get_accelerometer_state(napi_env env, napi_callback_info info) {
  napi_value args[1], output, ticks_value;
  CNA_Handle sensor = 0;
  uint32_t state = 0;
  CNA_Bool valid = CNA_FALSE;
  int64_t ticks = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  CNA_Result result = g_api.accelerometer_get_state(sensor, &state);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, "cna_accelerometer_get_state", result);
  result = g_api.accelerometer_is_data_valid(sensor, &valid);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_accelerometer_get_is_data_valid", result);
  }
  result = g_api.accelerometer_get_interval(sensor, &ticks);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_accelerometer_get_time_between_updates_ticks", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "accelerometer state");
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, ticks, &ticks_value), "accelerometer state");
  if (!set_u32_property(env, output, "State", state) ||
      !set_bool_property(env, output, "IsDataValid", valid) ||
      napi_set_named_property(env, output, "TimeBetweenUpdatesTicks", ticks_value) != napi_ok) {
    return throw_napi(env, "accelerometer state");
  }
  return output;
}

static napi_value set_accelerometer_interval(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle sensor = 0;
  int64_t ticks = 0;
  bool lossless = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &sensor) ||
      napi_get_value_bigint_int64(env, args[1], &ticks, &lossless) != napi_ok || !lossless) {
    return throw_message(env, "expected an accelerometer and a tick count as a bigint");
  }
  const CNA_Result result = g_api.accelerometer_set_interval(sensor, ticks);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_accelerometer_set_time_between_updates_ticks", result);
  }
  return undefined_result(env, "accelerometer interval");
}

/* --- graphics adapters and display modes ------------------------------------------------------- */
/*
 * `GraphicsAdapter` is the one strict XNA type this package projected structurally and could not
 * fill, because nothing here read CNA's adapter capabilities. These fourteen routes are what fills
 * it. Every one takes a graphics-device handle, so an adapter list is a property of a device a game
 * created rather than of the process -- which is why this is installed from the device callback and
 * not at load time.
 *
 * A HEADLESS renderer reports **no adapters at all**, and that stays true: nothing here invents one.
 */

static napi_value adapter_count(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle device = 0;
  uint64_t count = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.graphics_adapter_get_count(device, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_count", result);
  }
  NAPI_OR_RETURN(env, napi_create_double(env, (double) count, &output), "adapter count");
  return output;
}

static napi_value adapters_refresh(napi_env env, napi_callback_info info) {
  napi_value args[1];
  CNA_Handle device = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &device)) return NULL;
  const CNA_Result result = g_api.graphics_adapters_refresh(device);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapters_refresh", result);
  }
  return undefined_result(env, "adapter refresh");
}

/*
 * The adapter's two strings. Their lengths come out of the info structure rather than out of
 * separate size routes, because that is where CNA publishes them -- so one `get_info` answers the
 * capacity for both and there is no window in which a length and a copy could disagree.
 */
static napi_value adapter_text(
  napi_env env,
  napi_callback_info info,
  const int want_device_name,
  GameU32IndexCopyTextFn copy_fn,
  const char* const operation
) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a graphics device and an adapter index");
  }
  CNA_GraphicsAdapterInfo adapter;
  memset(&adapter, 0, sizeof(adapter));
  adapter.struct_size = (uint32_t) sizeof(adapter);
  adapter.struct_version = CNA_TS_ADAPTER_STRUCT_VERSION;
  CNA_Result result = g_api.graphics_adapter_get_info(device, index, &adapter);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_info", result);
  }
  const uint64_t required =
    want_device_name ? adapter.device_name_byte_length : adapter.description_byte_length;
  if (required > SIZE_MAX - 1) return throw_message(env, "adapter text exceeds the address space");
  char* text = (char*) malloc((size_t) required + 1);
  if (!text) return throw_message(env, "adapter text allocation failed");
  uint64_t produced = 0;
  result = copy_fn(device, index, text, required, &produced);
  if (result != CNA_RESULT_SUCCESS || produced != required) {
    free(text);
    return throw_result(env, operation, result == CNA_RESULT_SUCCESS ? CNA_RESULT_INTERNAL : result);
  }
  if (napi_create_string_utf8(env, text, (size_t) produced, &output) != napi_ok) {
    free(text);
    return throw_napi(env, operation);
  }
  free(text);
  return output;
}

static napi_value adapter_description(napi_env env, napi_callback_info info) {
  return adapter_text(
    env, info, 0, g_api.graphics_adapter_copy_description,
    "cna_graphics_adapter_copy_description");
}

static napi_value adapter_device_name(napi_env env, napi_callback_info info) {
  return adapter_text(
    env, info, 1, g_api.graphics_adapter_copy_device_name,
    "cna_graphics_adapter_copy_device_name");
}

static int set_display_mode(napi_env env, napi_value object, const CNA_DisplayMode* mode) {
  return set_i32(env, object, "Width", mode->width) &&
    set_i32(env, object, "Height", mode->height) &&
    set_number(env, object, "AspectRatio", (double) mode->aspect_ratio) &&
    set_u32(env, object, "Format", mode->format);
}

static napi_value adapter_info(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  uint32_t index = 0;
  CNA_NativeHandleValue monitor = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a graphics device and an adapter index");
  }
  CNA_GraphicsAdapterInfo adapter;
  memset(&adapter, 0, sizeof(adapter));
  adapter.struct_size = (uint32_t) sizeof(adapter);
  adapter.struct_version = CNA_TS_ADAPTER_STRUCT_VERSION;
  CNA_Result result = g_api.graphics_adapter_get_info(device, index, &adapter);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_info", result);
  }
  /*
   * A renderer that has adapters but exposes no native monitor handle answers NOT_SUPPORTED here.
   * That is not a failure of the adapter: XNA's `MonitorHandle` is an `IntPtr` and zero is a legal
   * value for it, so an unsupported handle becomes zero and the adapter is still reported. Any
   * other result is still an error.
   */
  result = g_api.graphics_adapter_get_monitor_handle(device, index, &monitor);
  if (result == CNA_RESULT_NOT_SUPPORTED) {
    monitor = 0;
  } else if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_native_monitor_handle", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "adapter info");
  napi_value monitor_value;
  NAPI_OR_RETURN(
    env, napi_create_bigint_uint64(env, (uint64_t) monitor, &monitor_value), "monitor handle");
  if (!set_u32(env, output, "AdapterIndex", adapter.adapter_index) ||
      !set_bool(env, output, "IsDefaultAdapter", adapter.is_default_adapter != CNA_FALSE) ||
      !set_bool(env, output, "IsWideScreen", adapter.is_wide_screen != CNA_FALSE) ||
      !set_bool(env, output, "UseNullDevice", adapter.use_null_device != CNA_FALSE) ||
      !set_bool(env, output, "UseReferenceDevice", adapter.use_reference_device != CNA_FALSE) ||
      !set_i32(env, output, "VendorId", adapter.vendor_id) ||
      !set_i32(env, output, "DeviceId", adapter.device_id) ||
      !set_i32(env, output, "Revision", adapter.revision) ||
      !set_i32(env, output, "SubSystemId", adapter.subsystem_id) ||
      napi_set_named_property(env, output, "MonitorHandle", monitor_value) != napi_ok) {
    return throw_napi(env, "adapter info");
  }
  return output;
}

static napi_value adapter_current_display_mode(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  uint32_t index = 0;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a graphics device and an adapter index");
  }
  CNA_DisplayMode mode;
  memset(&mode, 0, sizeof(mode));
  mode.struct_size = (uint32_t) sizeof(mode);
  mode.struct_version = CNA_TS_ADAPTER_STRUCT_VERSION;
  const CNA_Result result = g_api.graphics_adapter_get_current_mode(device, index, &mode);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_current_display_mode", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "display mode");
  if (!set_display_mode(env, output, &mode)) return throw_napi(env, "display mode");
  return output;
}

static napi_value adapter_display_modes(napi_env env, napi_callback_info info) {
  napi_value args[2], output;
  CNA_Handle device = 0;
  uint32_t index = 0;
  uint64_t count = 0, produced = 0;
  CNA_DisplayMode* modes = NULL;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok) {
    return throw_message(env, "expected a graphics device and an adapter index");
  }
  CNA_Result result =
    g_api.graphics_adapter_get_mode_count(device, index, CNA_FALSE, 0, &count);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_get_display_mode_count", result);
  }
  if (count > SIZE_MAX / sizeof(CNA_DisplayMode)) {
    return throw_message(env, "the display-mode list exceeds the address space");
  }
  modes = count == 0 ? NULL : (CNA_DisplayMode*) calloc((size_t) count, sizeof(CNA_DisplayMode));
  if (count != 0 && !modes) return throw_message(env, "display-mode allocation failed");
  for (uint64_t entry = 0; entry < count; entry += 1) {
    modes[entry].struct_size = (uint32_t) sizeof(CNA_DisplayMode);
    modes[entry].struct_version = CNA_TS_ADAPTER_STRUCT_VERSION;
  }
  if (count != 0) {
    result = g_api.graphics_adapter_copy_modes(device, index, CNA_FALSE, 0, modes, count, &produced);
    if (result != CNA_RESULT_SUCCESS) {
      free(modes);
      return throw_result(env, "cna_graphics_adapter_copy_display_modes", result);
    }
  }
  if (napi_create_array_with_length(env, (size_t) produced, &output) != napi_ok) {
    free(modes);
    return throw_napi(env, "display-mode list");
  }
  for (uint64_t entry = 0; entry < produced; entry += 1) {
    napi_value value;
    if (napi_create_object(env, &value) != napi_ok ||
        !set_display_mode(env, value, &modes[entry]) ||
        napi_set_element(env, output, (uint32_t) entry, value) != napi_ok) {
      free(modes);
      return throw_napi(env, "display-mode list");
    }
  }
  free(modes);
  return output;
}

static napi_value adapter_is_profile_supported(napi_env env, napi_callback_info info) {
  napi_value args[3], output;
  CNA_Handle device = 0;
  uint32_t index = 0, profile = 0;
  CNA_Bool supported = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok ||
      napi_get_value_uint32(env, args[2], &profile) != napi_ok) {
    return throw_message(env, "expected a graphics device, an adapter index and a profile");
  }
  const CNA_Result result =
    g_api.graphics_adapter_is_profile_supported(device, index, profile, &supported);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_is_profile_supported", result);
  }
  NAPI_OR_RETURN(env, napi_get_boolean(env, supported != CNA_FALSE, &output), "profile support");
  return output;
}

static napi_value adapter_query_format(
  napi_env env, napi_callback_info info, AdapterQueryFormatFn function, const char* operation
) {
  napi_value args[6], output;
  CNA_Handle device = 0;
  uint32_t index = 0, profile = 0, format = 0, depth = 0;
  int32_t samples = 0;
  CNA_GraphicsFormatSelection selection;
  if (!require_loaded(env) || !get_args(env, info, 6, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok ||
      napi_get_value_uint32(env, args[2], &profile) != napi_ok ||
      napi_get_value_uint32(env, args[3], &format) != napi_ok ||
      napi_get_value_uint32(env, args[4], &depth) != napi_ok ||
      napi_get_value_int32(env, args[5], &samples) != napi_ok) {
    return throw_message(env, "expected a device, an adapter, a profile and a format triple");
  }
  memset(&selection, 0, sizeof(selection));
  selection.struct_size = (uint32_t) sizeof(selection);
  selection.struct_version = CNA_TS_ADAPTER_STRUCT_VERSION;
  const CNA_Result result =
    function(device, index, profile, format, depth, samples, &selection);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_create_object(env, &output), operation);
  if (!set_bool(env, output, "IsExactMatch", selection.exact_match != CNA_FALSE) ||
      !set_u32(env, output, "SelectedFormat", selection.format) ||
      !set_u32(env, output, "SelectedDepthFormat", selection.depth_format) ||
      !set_i32(env, output, "SelectedMultiSampleCount", selection.multi_sample_count)) {
    return throw_napi(env, operation);
  }
  return output;
}

static napi_value adapter_query_backbuffer(napi_env env, napi_callback_info info) {
  return adapter_query_format(
    env, info, g_api.graphics_adapter_query_backbuffer,
    "cna_graphics_adapter_query_backbuffer_format");
}

static napi_value adapter_query_render_target(napi_env env, napi_callback_info info) {
  return adapter_query_format(
    env, info, g_api.graphics_adapter_query_render_target,
    "cna_graphics_adapter_query_render_target_format");
}

static napi_value adapter_set_device_preferences(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle device = 0;
  uint32_t index = 0;
  bool null_device = false, reference_device = false;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &device) ||
      napi_get_value_uint32(env, args[1], &index) != napi_ok ||
      napi_get_value_bool(env, args[2], &null_device) != napi_ok ||
      napi_get_value_bool(env, args[3], &reference_device) != napi_ok) {
    return throw_message(env, "expected a device, an adapter index and two preferences");
  }
  const CNA_Result result = g_api.graphics_adapter_set_preferences(
    device, index, null_device ? CNA_TRUE : CNA_FALSE,
    reference_device ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_graphics_adapter_set_device_preferences", result);
  }
  return undefined_result(env, "adapter preferences");
}

/* --- the compass, the gyroscope and the motion sensor ------------------------------------------ */
/*
 * The three sensors beside the accelerometer, and the three CNA gives deterministic injection hooks
 * for. That matters: a build machine has none of this hardware, so without those hooks the only
 * honest claim would be "absent", which is what the accelerometer's evidence is limited to. With
 * them the *data path* can be proved -- a reading with real values, through the real routes, into
 * the public API -- while staying clear that a synthetic update is injection evidence and not a
 * measurement of anything physical.
 *
 * Every reading carries a `CNA_DateTimeOffset` whose ticks are 100-nanosecond units since
 * 0001-01-01. That does not survive a double, so it crosses as a bigint, exactly as the
 * accelerometer's does.
 */

static int set_timestamp(napi_env env, napi_value object, const CNA_DateTimeOffset* timestamp) {
  napi_value ticks_value, offset_value;
  return napi_create_bigint_int64(env, timestamp->ticks, &ticks_value) == napi_ok &&
    napi_create_bigint_int64(env, timestamp->offset_ticks, &offset_value) == napi_ok &&
    napi_set_named_property(env, object, "TimestampTicks", ticks_value) == napi_ok &&
    napi_set_named_property(env, object, "TimestampOffsetTicks", offset_value) == napi_ok;
}


static napi_value sensor_bool_out(
  napi_env env, napi_callback_info info, BoolGetFn function, const char* operation
) {
  napi_value args[1], output;
  CNA_Handle handle = 0;
  CNA_Bool value = CNA_FALSE;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  const CNA_Result result = function(handle, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_get_boolean(env, value != CNA_FALSE, &output), operation);
  return output;
}

static napi_value sensor_u32_out(
  napi_env env, napi_callback_info info, GameU32OutFn function, const char* operation
) {
  napi_value args[1], output;
  CNA_Handle handle = 0;
  uint32_t value = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  const CNA_Result result = function(handle, &value);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_create_uint32(env, value, &output), operation);
  return output;
}

static napi_value sensor_handle_only(
  napi_env env, napi_callback_info info, GameHandleFn function, const char* operation
) {
  napi_value args[1];
  CNA_Handle handle = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  const CNA_Result result = function(handle);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, operation);
}

static napi_value sensor_create(
  napi_env env, napi_callback_info info, AccelerometerCreateFn function, const char* operation
) {
  napi_value args[1];
  CNA_Handle game = 0, sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &game)) return NULL;
  const CNA_Result result = function(game, &sensor);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return make_handle(env, sensor);
}

static napi_value sensor_get_ticks(
  napi_env env, napi_callback_info info, HandleInt64OutFn function, const char* operation
) {
  napi_value args[1], output;
  CNA_Handle handle = 0;
  int64_t ticks = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &handle)) return NULL;
  const CNA_Result result = function(handle, &ticks);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, ticks, &output), operation);
  return output;
}

static napi_value sensor_set_ticks(
  napi_env env, napi_callback_info info, AccelerometerTicksInFn function, const char* operation
) {
  napi_value args[2];
  CNA_Handle handle = 0;
  int64_t ticks = 0;
  bool lossless = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &handle) ||
      napi_get_value_bigint_int64(env, args[1], &ticks, &lossless) != napi_ok || !lossless) {
    return throw_message(env, "expected a sensor and an interval in ticks");
  }
  const CNA_Result result = function(handle, ticks);
  if (result != CNA_RESULT_SUCCESS) return throw_result(env, operation, result);
  return undefined_result(env, operation);
}

/* ---- the compass ---- */

static napi_value compass_is_supported(napi_env env, napi_callback_info info) {
  return sensor_bool_out(
    env, info, g_api.compass_is_supported, "cna_compass_get_is_supported");
}
static napi_value compass_create(napi_env env, napi_callback_info info) {
  return sensor_create(env, info, g_api.compass_create, "cna_compass_create");
}
static napi_value compass_destroy(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.compass_destroy, "cna_compass_destroy");
}
static napi_value compass_start(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.compass_start, "cna_compass_start");
}
static napi_value compass_stop(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.compass_stop, "cna_compass_stop");
}
static napi_value compass_dispose(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.compass_dispose, "cna_compass_dispose");
}
static napi_value compass_get_state(napi_env env, napi_callback_info info) {
  return sensor_u32_out(env, info, g_api.compass_get_state, "cna_compass_get_state");
}
static napi_value compass_is_data_valid(napi_env env, napi_callback_info info) {
  return sensor_bool_out(
    env, info, g_api.compass_is_data_valid, "cna_compass_get_is_data_valid");
}
static napi_value compass_get_interval(napi_env env, napi_callback_info info) {
  return sensor_get_ticks(
    env, info, g_api.compass_get_interval, "cna_compass_get_time_between_updates_ticks");
}
static napi_value compass_set_interval(napi_env env, napi_callback_info info) {
  return sensor_set_ticks(
    env, info, g_api.compass_set_interval, "cna_compass_set_time_between_updates_ticks");
}

static napi_value compass_get_reading(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  CNA_CompassReading reading;
  memset(&reading, 0, sizeof(reading));
  const CNA_Result init = g_api.compass_reading_init(&reading);
  if (init != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compass_reading_init", init);
  const CNA_Result result = g_api.compass_get_current_value(sensor, &reading);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compass_get_current_value", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "compass reading");
  if (!set_timestamp(env, output, &reading.timestamp) ||
      !set_number(env, output, "HeadingAccuracy", reading.heading_accuracy) ||
      !set_number(env, output, "MagneticHeading", reading.magnetic_heading) ||
      !set_number(env, output, "TrueHeading", reading.true_heading) ||
      !set_vector3(env, output, "MagnetometerReading", &reading.magnetometer_reading)) {
    return throw_napi(env, "compass reading");
  }
  return output;
}

static napi_value compass_set_test_backend(napi_env env, napi_callback_info info) {
  napi_value args[3];
  CNA_Handle sensor = 0;
  bool installed = false, supported = false;
  if (!require_loaded(env) || !get_args(env, info, 3, args) ||
      !read_handle(env, args[0], &sensor) ||
      napi_get_value_bool(env, args[1], &installed) != napi_ok ||
      napi_get_value_bool(env, args[2], &supported) != napi_ok) {
    return throw_message(env, "expected a compass and two flags");
  }
  const CNA_Result result = g_api.compass_set_test_backend(
    sensor, installed ? CNA_TRUE : CNA_FALSE, supported ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_compass_set_test_backend_ext", result);
  }
  return undefined_result(env, "compass test backend");
}

static napi_value compass_inject(napi_env env, napi_callback_info info) {
  napi_value args[2], component;
  CNA_Handle sensor = 0;
  double numbers[3] = {0, 0, 0};
  int64_t ticks = 0, offset = 0;
  bool lossless = false;
  static const char* const names[] = {"HeadingAccuracy", "MagneticHeading", "TrueHeading"};
  CNA_CompassReading reading;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  memset(&reading, 0, sizeof(reading));
  {
    const CNA_Result init = g_api.compass_reading_init(&reading);
    if (init != CNA_RESULT_SUCCESS) return throw_result(env, "cna_compass_reading_init", init);
  }
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, args[1], names[index], &component) != napi_ok ||
        napi_get_value_double(env, component, &numbers[index]) != napi_ok) {
      return throw_message(env, "a compass reading needs its three heading values");
    }
  }
  if (!read_vector3(env, args[1], "MagnetometerReading", &reading.magnetometer_reading)) {
    return throw_message(env, "a compass reading needs a magnetometer vector");
  }
  if (napi_get_named_property(env, args[1], "TimestampTicks", &component) != napi_ok ||
      napi_get_value_bigint_int64(env, component, &ticks, &lossless) != napi_ok || !lossless ||
      napi_get_named_property(env, args[1], "TimestampOffsetTicks", &component) != napi_ok ||
      napi_get_value_bigint_int64(env, component, &offset, &lossless) != napi_ok || !lossless) {
    return throw_message(env, "a compass reading needs a bigint timestamp and offset");
  }
  reading.heading_accuracy = numbers[0];
  reading.magnetic_heading = numbers[1];
  reading.true_heading = numbers[2];
  reading.timestamp.ticks = ticks;
  reading.timestamp.offset_ticks = offset;
  {
    const CNA_Result result = g_api.compass_inject(sensor, &reading);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_compass_inject_synthetic_update_ext", result);
    }
  }
  return undefined_result(env, "compass injection");
}

/* ---- the gyroscope ---- */

static napi_value gyroscope_is_supported(napi_env env, napi_callback_info info) {
  return sensor_bool_out(
    env, info, g_api.gyroscope_is_supported, "cna_gyroscope_get_is_supported");
}
static napi_value gyroscope_create(napi_env env, napi_callback_info info) {
  return sensor_create(env, info, g_api.gyroscope_create, "cna_gyroscope_create");
}
static napi_value gyroscope_destroy(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.gyroscope_destroy, "cna_gyroscope_destroy");
}
static napi_value gyroscope_start(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.gyroscope_start, "cna_gyroscope_start");
}
static napi_value gyroscope_stop(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.gyroscope_stop, "cna_gyroscope_stop");
}
static napi_value gyroscope_dispose(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.gyroscope_dispose, "cna_gyroscope_dispose");
}
static napi_value gyroscope_get_state(napi_env env, napi_callback_info info) {
  return sensor_u32_out(env, info, g_api.gyroscope_get_state, "cna_gyroscope_get_state");
}
static napi_value gyroscope_is_data_valid(napi_env env, napi_callback_info info) {
  return sensor_bool_out(
    env, info, g_api.gyroscope_is_data_valid, "cna_gyroscope_get_is_data_valid");
}
static napi_value gyroscope_get_interval(napi_env env, napi_callback_info info) {
  return sensor_get_ticks(
    env, info, g_api.gyroscope_get_interval, "cna_gyroscope_get_time_between_updates_ticks");
}
static napi_value gyroscope_set_interval(napi_env env, napi_callback_info info) {
  return sensor_set_ticks(
    env, info, g_api.gyroscope_set_interval, "cna_gyroscope_set_time_between_updates_ticks");
}

static napi_value gyroscope_get_reading(napi_env env, napi_callback_info info) {
  napi_value args[1], output;
  CNA_Handle sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  CNA_GyroscopeReading reading;
  memset(&reading, 0, sizeof(reading));
  const CNA_Result init = g_api.gyroscope_reading_init(&reading);
  if (init != CNA_RESULT_SUCCESS) return throw_result(env, "cna_gyroscope_reading_init", init);
  const CNA_Result result = g_api.gyroscope_get_current_value(sensor, &reading);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gyroscope_get_current_value", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "gyroscope reading");
  if (!set_timestamp(env, output, &reading.timestamp) ||
      !set_vector3(env, output, "RotationRate", &reading.rotation_rate)) {
    return throw_napi(env, "gyroscope reading");
  }
  return output;
}

static napi_value gyroscope_set_supported(napi_env env, napi_callback_info info) {
  napi_value args[2];
  CNA_Handle sensor = 0;
  bool supported = false;
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &sensor) ||
      napi_get_value_bool(env, args[1], &supported) != napi_ok) {
    return throw_message(env, "expected a gyroscope and a flag");
  }
  const CNA_Result result =
    g_api.gyroscope_set_supported(sensor, supported ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gyroscope_set_supported_for_tests_ext", result);
  }
  return undefined_result(env, "gyroscope support override");
}

static napi_value gyroscope_inject(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle sensor = 0;
  double x = 0, y = 0, z = 0;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &sensor) ||
      napi_get_value_double(env, args[1], &x) != napi_ok ||
      napi_get_value_double(env, args[2], &y) != napi_ok ||
      napi_get_value_double(env, args[3], &z) != napi_ok) {
    return throw_message(env, "expected a gyroscope and three rotation rates");
  }
  const CNA_Result result =
    g_api.gyroscope_inject(sensor, (float) x, (float) y, (float) z);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_gyroscope_inject_synthetic_update_ext", result);
  }
  return undefined_result(env, "gyroscope injection");
}

/* ---- the motion sensor ---- */

static napi_value motion_is_supported(napi_env env, napi_callback_info info) {
  return sensor_bool_out(env, info, g_api.motion_is_supported, "cna_motion_get_is_supported");
}
static napi_value motion_create(napi_env env, napi_callback_info info) {
  return sensor_create(env, info, g_api.motion_create, "cna_motion_create");
}
static napi_value motion_destroy(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.motion_destroy, "cna_motion_destroy");
}
static napi_value motion_start(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.motion_start, "cna_motion_start");
}
static napi_value motion_stop(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.motion_stop, "cna_motion_stop");
}
static napi_value motion_dispose(napi_env env, napi_callback_info info) {
  return sensor_handle_only(env, info, g_api.motion_dispose, "cna_motion_dispose");
}
static napi_value motion_get_state(napi_env env, napi_callback_info info) {
  return sensor_u32_out(env, info, g_api.motion_get_state, "cna_motion_get_state");
}
static napi_value motion_is_data_valid(napi_env env, napi_callback_info info) {
  return sensor_bool_out(env, info, g_api.motion_is_data_valid, "cna_motion_get_is_data_valid");
}
static napi_value motion_is_north_referenced(napi_env env, napi_callback_info info) {
  return sensor_bool_out(
    env, info, g_api.motion_is_north_referenced,
    "cna_motion_get_is_attitude_north_referenced_ext");
}
static napi_value motion_get_interval(napi_env env, napi_callback_info info) {
  return sensor_get_ticks(
    env, info, g_api.motion_get_interval, "cna_motion_get_time_between_updates_ticks");
}
static napi_value motion_set_interval(napi_env env, napi_callback_info info) {
  return sensor_set_ticks(
    env, info, g_api.motion_set_interval, "cna_motion_set_time_between_updates_ticks");
}

static napi_value motion_get_reading(napi_env env, napi_callback_info info) {
  napi_value args[1], output, attitude;
  CNA_Handle sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  CNA_MotionReading reading;
  memset(&reading, 0, sizeof(reading));
  const CNA_Result init = g_api.motion_reading_init(&reading);
  if (init != CNA_RESULT_SUCCESS) return throw_result(env, "cna_motion_reading_init", init);
  const CNA_Result result = g_api.motion_get_current_value(sensor, &reading);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_motion_get_current_value", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "motion reading");
  NAPI_OR_RETURN(env, napi_create_object(env, &attitude), "attitude reading");
  {
    const float quaternion[4] = {
      reading.attitude.quaternion.x, reading.attitude.quaternion.y,
      reading.attitude.quaternion.z, reading.attitude.quaternion.w};
    const float* const matrix = &reading.attitude.rotation_matrix.m11;
    if (!set_timestamp(env, attitude, &reading.attitude.timestamp) ||
        !set_number(env, attitude, "Pitch", (double) reading.attitude.pitch) ||
        !set_number(env, attitude, "Roll", (double) reading.attitude.roll) ||
        !set_number(env, attitude, "Yaw", (double) reading.attitude.yaw) ||
        !set_float_array(env, attitude, "Quaternion", quaternion, 4) ||
        !set_float_array(env, attitude, "RotationMatrix", matrix, 16)) {
      return throw_napi(env, "attitude reading");
    }
  }
  if (!set_timestamp(env, output, &reading.timestamp) ||
      napi_set_named_property(env, output, "Attitude", attitude) != napi_ok ||
      !set_vector3(env, output, "DeviceAcceleration", &reading.device_acceleration) ||
      !set_vector3(env, output, "DeviceRotationRate", &reading.device_rotation_rate) ||
      !set_vector3(env, output, "Gravity", &reading.gravity)) {
    return throw_napi(env, "motion reading");
  }
  return output;
}

static napi_value motion_set_test_backend(napi_env env, napi_callback_info info) {
  napi_value args[4];
  CNA_Handle sensor = 0;
  bool installed = false, supported = false, north = false;
  if (!require_loaded(env) || !get_args(env, info, 4, args) ||
      !read_handle(env, args[0], &sensor) ||
      napi_get_value_bool(env, args[1], &installed) != napi_ok ||
      napi_get_value_bool(env, args[2], &supported) != napi_ok ||
      napi_get_value_bool(env, args[3], &north) != napi_ok) {
    return throw_message(env, "expected a motion sensor and three flags");
  }
  const CNA_Result result = g_api.motion_set_test_backend(
    sensor, installed ? CNA_TRUE : CNA_FALSE, supported ? CNA_TRUE : CNA_FALSE,
    north ? CNA_TRUE : CNA_FALSE);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_motion_set_test_backend_ext", result);
  }
  return undefined_result(env, "motion test backend");
}

static napi_value motion_inject(napi_env env, napi_callback_info info) {
  napi_value args[2], attitude, component;
  CNA_Handle sensor = 0;
  CNA_MotionReading reading;
  double numbers[3] = {0, 0, 0};
  float quaternion[4];
  float matrix[16];
  int64_t ticks = 0, offset = 0;
  bool lossless = false;
  static const char* const angles[] = {"Pitch", "Roll", "Yaw"};
  if (!require_loaded(env) || !get_args(env, info, 2, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  memset(&reading, 0, sizeof(reading));
  {
    const CNA_Result init = g_api.motion_reading_init(&reading);
    if (init != CNA_RESULT_SUCCESS) return throw_result(env, "cna_motion_reading_init", init);
  }
  if (!read_vector3(env, args[1], "DeviceAcceleration", &reading.device_acceleration) ||
      !read_vector3(env, args[1], "DeviceRotationRate", &reading.device_rotation_rate) ||
      !read_vector3(env, args[1], "Gravity", &reading.gravity)) {
    return throw_message(env, "a motion reading needs its three vectors");
  }
  if (napi_get_named_property(env, args[1], "Attitude", &attitude) != napi_ok) {
    return throw_message(env, "a motion reading needs an attitude");
  }
  for (size_t index = 0; index < 3; index += 1) {
    if (napi_get_named_property(env, attitude, angles[index], &component) != napi_ok ||
        napi_get_value_double(env, component, &numbers[index]) != napi_ok) {
      return throw_message(env, "an attitude needs a pitch, a roll and a yaw");
    }
  }
  if (napi_get_named_property(env, attitude, "Quaternion", &component) != napi_ok ||
      !read_float_array(env, component, quaternion, 4, "an attitude quaternion needs four values") ||
      napi_get_named_property(env, attitude, "RotationMatrix", &component) != napi_ok ||
      !read_float_array(env, component, matrix, 16, "an attitude matrix needs sixteen values")) {
    return NULL;
  }
  if (napi_get_named_property(env, args[1], "TimestampTicks", &component) != napi_ok ||
      napi_get_value_bigint_int64(env, component, &ticks, &lossless) != napi_ok || !lossless ||
      napi_get_named_property(env, args[1], "TimestampOffsetTicks", &component) != napi_ok ||
      napi_get_value_bigint_int64(env, component, &offset, &lossless) != napi_ok || !lossless) {
    return throw_message(env, "a motion reading needs a bigint timestamp and offset");
  }
  reading.attitude.pitch = (float) numbers[0];
  reading.attitude.roll = (float) numbers[1];
  reading.attitude.yaw = (float) numbers[2];
  reading.attitude.quaternion.x = quaternion[0];
  reading.attitude.quaternion.y = quaternion[1];
  reading.attitude.quaternion.z = quaternion[2];
  reading.attitude.quaternion.w = quaternion[3];
  memcpy(&reading.attitude.rotation_matrix.m11, matrix, sizeof(matrix));
  reading.attitude.timestamp.ticks = ticks;
  reading.attitude.timestamp.offset_ticks = offset;
  reading.timestamp.ticks = ticks;
  reading.timestamp.offset_ticks = offset;
  {
    const CNA_Result result = g_api.motion_inject(sensor, &reading);
    if (result != CNA_RESULT_SUCCESS) {
      return throw_result(env, "cna_motion_inject_synthetic_update_ext", result);
    }
  }
  return undefined_result(env, "motion injection");
}

static napi_value get_accelerometer_reading(napi_env env, napi_callback_info info) {
  napi_value args[1], output, ticks_value, offset_value;
  CNA_Handle sensor = 0;
  if (!require_loaded(env) || !get_args(env, info, 1, args) ||
      !read_handle(env, args[0], &sensor)) return NULL;
  CNA_AccelerometerReading reading;
  memset(&reading, 0, sizeof(reading));
  reading.struct_size = sizeof(reading);
  reading.struct_version = 1;
  const CNA_Result result = g_api.accelerometer_get_current_value(sensor, &reading);
  if (result != CNA_RESULT_SUCCESS) {
    return throw_result(env, "cna_accelerometer_get_current_value", result);
  }
  NAPI_OR_RETURN(env, napi_create_object(env, &output), "accelerometer reading");
  /* Ticks since 0001-01-01, so a bigint: this does not fit a double without losing the last digits
     of a real timestamp, and a reading's identity is its timestamp. */
  NAPI_OR_RETURN(env, napi_create_bigint_int64(env, reading.timestamp.ticks, &ticks_value), "reading");
  NAPI_OR_RETURN(
    env, napi_create_bigint_int64(env, reading.timestamp.offset_ticks, &offset_value), "reading");
  if (!set_double_property(env, output, "X", (double) reading.acceleration.x) ||
      !set_double_property(env, output, "Y", (double) reading.acceleration.y) ||
      !set_double_property(env, output, "Z", (double) reading.acceleration.z) ||
      napi_set_named_property(env, output, "TimestampTicks", ticks_value) != napi_ok ||
      napi_set_named_property(env, output, "TimestampOffsetTicks", offset_value) != napi_ok) {
    return throw_napi(env, "accelerometer reading");
  }
  return output;
}

static napi_value initialize(napi_env env, napi_value exports) {
  const napi_property_descriptor properties[] = {
    { "loadLibrary", NULL, load_library, NULL, NULL, NULL, napi_default, NULL },
    { "abiVersion", NULL, abi_version, NULL, NULL, NULL, napi_default, NULL },
    { "getDefaultPbrMaterial", NULL, default_pbr_material, NULL, NULL, NULL, napi_default, NULL },
    { "getDefaultRenderPipelineSettings", NULL, default_render_pipeline_settings, NULL, NULL, NULL, napi_default, NULL },
    { "createRenderPipeline", NULL, create_render_pipeline, NULL, NULL, NULL, napi_default, NULL },
    { "resizeRenderPipeline", NULL, resize_render_pipeline, NULL, NULL, NULL, napi_default, NULL },
    { "beginRenderPipeline", NULL, begin_render_pipeline, NULL, NULL, NULL, napi_default, NULL },
    { "endRenderPipeline", NULL, end_render_pipeline, NULL, NULL, NULL, napi_default, NULL },
    { "destroyRenderPipeline", NULL, destroy_render_pipeline, NULL, NULL, NULL, napi_default, NULL },
    { "getRenderPipelineStatistics", NULL, get_render_pipeline_statistics, NULL, NULL, NULL, napi_default, NULL },
    { "getPlatformSnapshot", NULL, get_platform_snapshot, NULL, NULL, NULL, napi_default, NULL },
    { "getRendererSelection", NULL, get_renderer_selection, NULL, NULL, NULL, napi_default, NULL },
    { "getAvailableRendererTypes", NULL, get_available_renderer_types, NULL, NULL, NULL, napi_default, NULL },
    { "describeRenderer", NULL, describe_renderer, NULL, NULL, NULL, napi_default, NULL },
    { "setPreferredRenderer", NULL, set_preferred_renderer, NULL, NULL, NULL, napi_default, NULL },
    { "setPreferredRendererByName", NULL, set_preferred_renderer_by_name, NULL, NULL, NULL, napi_default, NULL },
    { "tryParseRendererName", NULL, try_parse_renderer_name, NULL, NULL, NULL, napi_default, NULL },
    { "setRendererFallbackChain", NULL, set_renderer_fallback_chain, NULL, NULL, NULL, napi_default, NULL },
    { "setAutomaticRendererFallback", NULL, set_automatic_renderer_fallback, NULL, NULL, NULL, napi_default, NULL },
    { "getRendererFallbacks", NULL, get_renderer_fallbacks, NULL, NULL, NULL, napi_default, NULL },
    { "getMinimumLogLevel", NULL, get_minimum_log_level, NULL, NULL, NULL, napi_default, NULL },
    { "setMinimumLogLevel", NULL, set_minimum_log_level, NULL, NULL, NULL, napi_default, NULL },
    { "writeLog", NULL, write_log, NULL, NULL, NULL, napi_default, NULL },
    { "isGraphicsExtensionLayerAvailable", NULL, is_graphics_extension_layer_available, NULL, NULL, NULL, napi_default, NULL },
    { "importedSymbolCount", NULL, imported_symbol_count, NULL, NULL, NULL, napi_default, NULL },
    { "getLastError", NULL, get_last_error, NULL, NULL, NULL, napi_default, NULL },
    { "createGame", NULL, create_game, NULL, NULL, NULL, napi_default, NULL },
    { "runGame", NULL, run_game, NULL, NULL, NULL, napi_default, NULL },
    { "runGameOneFrame", NULL, run_game_one_frame, NULL, NULL, NULL, napi_default, NULL },
    { "requestExit", NULL, request_exit, NULL, NULL, NULL, napi_default, NULL },
    { "destroyGame", NULL, destroy_game, NULL, NULL, NULL, napi_default, NULL },
    { "updateFrameworkDispatcher", NULL, update_framework_dispatcher, NULL, NULL, NULL, napi_default, NULL },
    { "createGraphicsDeviceManager", NULL, create_manager, NULL, NULL, NULL, napi_default, NULL },
    { "configureGraphicsDeviceManager", NULL, configure_manager, NULL, NULL, NULL, napi_default, NULL },
    { "applyGraphicsDeviceManagerChanges", NULL, apply_manager_changes, NULL, NULL, NULL, napi_default, NULL },
    { "toggleGraphicsDeviceManagerFullScreen", NULL, toggle_manager_full_screen, NULL, NULL, NULL, napi_default, NULL },
    { "createManagedGraphicsDevice", NULL, create_managed_device, NULL, NULL, NULL, napi_default, NULL },
    { "beginGraphicsDeviceManagerDraw", NULL, begin_manager_draw, NULL, NULL, NULL, napi_default, NULL },
    { "endGraphicsDeviceManagerDraw", NULL, end_manager_draw, NULL, NULL, NULL, napi_default, NULL },
    { "destroyGraphicsDeviceManager", NULL, destroy_manager, NULL, NULL, NULL, napi_default, NULL },
    { "borrowGraphicsDevice", NULL, borrow_graphics_device, NULL, NULL, NULL, napi_default, NULL },
    { "clearGraphicsDevice", NULL, clear_graphics_device, NULL, NULL, NULL, napi_default, NULL },
    { "presentGraphicsDevice", NULL, present_graphics_device, NULL, NULL, NULL, napi_default, NULL },
    { "getRendererInfo", NULL, get_renderer_info, NULL, NULL, NULL, napi_default, NULL },
    { "createTexture2D", NULL, create_texture, NULL, NULL, NULL, napi_default, NULL },
    { "getTexture2DInfo", NULL, get_texture_info, NULL, NULL, NULL, napi_default, NULL },
    { "createTexture2DFromEncodedMemory", NULL, create_texture_from_encoded, NULL, NULL, NULL, napi_default, NULL },
    { "setTexture2DData", NULL, set_texture_data, NULL, NULL, NULL, napi_default, NULL },
    { "getTexture2DData", NULL, get_texture_data, NULL, NULL, NULL, napi_default, NULL },
    { "encodeTexture2D", NULL, encode_texture, NULL, NULL, NULL, napi_default, NULL },
    { "destroyTexture2D", NULL, destroy_texture, NULL, NULL, NULL, napi_default, NULL },
    { "createSpriteBatch", NULL, create_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "beginSpriteBatch", NULL, begin_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "submitSpriteBatch", NULL, submit_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "endSpriteBatch", NULL, end_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "destroySpriteBatch", NULL, destroy_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "createVertexBuffer", NULL, create_vertex_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "setVertexBufferRaw", NULL, set_vertex_buffer_raw, NULL, NULL, NULL, napi_default, NULL },
    { "getVertexBufferRaw", NULL, get_vertex_buffer_raw, NULL, NULL, NULL, napi_default, NULL },
    { "destroyVertexBuffer", NULL, destroy_vertex_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "createIndexBuffer", NULL, create_index_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "setIndexBufferRaw", NULL, set_index_buffer_raw, NULL, NULL, NULL, napi_default, NULL },
    { "getIndexBufferRaw", NULL, get_index_buffer_raw, NULL, NULL, NULL, napi_default, NULL },
    { "destroyIndexBuffer", NULL, destroy_index_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "getGraphicsDeviceStatus", NULL, get_graphics_device_status, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceBlendFactor", NULL, set_graphics_blend_factor, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceBlendState", NULL, set_graphics_blend_state, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceDepthStencilState", NULL, set_graphics_depth_stencil_state, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceRasterizerState", NULL, set_graphics_rasterizer_state, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceSamplerState", NULL, set_graphics_sampler_state, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceTexture", NULL, set_graphics_texture, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceMultiSampleMask", NULL, set_graphics_multi_sample_mask, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceReferenceStencil", NULL, set_graphics_reference_stencil, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceScissorRectangle", NULL, set_graphics_scissor, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceViewport", NULL, set_graphics_viewport, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceVertexBuffers", NULL, set_graphics_vertex_buffers, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceIndexBuffer", NULL, set_graphics_index_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "drawPrimitives", NULL, draw_primitives, NULL, NULL, NULL, napi_default, NULL },
    { "drawIndexedPrimitives", NULL, draw_indexed_primitives, NULL, NULL, NULL, napi_default, NULL },
    { "drawInstancedPrimitives", NULL, draw_instanced_primitives, NULL, NULL, NULL, napi_default, NULL },
    { "drawUserPrimitives", NULL, draw_user_primitives, NULL, NULL, NULL, napi_default, NULL },
    { "drawUserIndexedPrimitives", NULL, draw_user_indexed_primitives, NULL, NULL, NULL, napi_default, NULL },
    { "beginSpriteBatchWithStates", NULL, begin_sprite_batch_with_states, NULL, NULL, NULL, napi_default, NULL },
    { "setVertexBufferData", NULL, set_vertex_buffer_data, NULL, NULL, NULL, napi_default, NULL },
    { "setVertexBufferRawAt", NULL, set_vertex_buffer_raw_at, NULL, NULL, NULL, napi_default, NULL },
    { "getVertexBufferRawAt", NULL, get_vertex_buffer_raw_at, NULL, NULL, NULL, napi_default, NULL },
    { "getVertexBufferIsContentLost", NULL, get_vertex_buffer_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "setIndexBufferData", NULL, set_index_buffer_data, NULL, NULL, NULL, napi_default, NULL },
    { "getIndexBufferIsContentLost", NULL, get_index_buffer_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "createTexture3D", NULL, create_texture3d, NULL, NULL, NULL, napi_default, NULL },
    { "getTexture3DInfo", NULL, get_texture3d_info, NULL, NULL, NULL, napi_default, NULL },
    { "setTexture3DColors", NULL, set_texture3d_colors, NULL, NULL, NULL, napi_default, NULL },
    { "getTexture3DColors", NULL, get_texture3d_colors, NULL, NULL, NULL, napi_default, NULL },
    { "destroyTexture3D", NULL, destroy_texture3d, NULL, NULL, NULL, napi_default, NULL },
    { "createTextureCube", NULL, create_texturecube, NULL, NULL, NULL, napi_default, NULL },
    { "getTextureCubeInfo", NULL, get_texturecube_info, NULL, NULL, NULL, napi_default, NULL },
    { "setTextureCubeColors", NULL, set_texturecube_colors, NULL, NULL, NULL, napi_default, NULL },
    { "getTextureCubeColors", NULL, get_texturecube_colors, NULL, NULL, NULL, napi_default, NULL },
    { "destroyTextureCube", NULL, destroy_texturecube, NULL, NULL, NULL, napi_default, NULL },
    { "createRenderTarget2D", NULL, create_render_target2d, NULL, NULL, NULL, napi_default, NULL },
    { "createRenderTargetCube", NULL, create_render_target_cube, NULL, NULL, NULL, napi_default, NULL },
    { "getRenderTargetInfo", NULL, get_render_target_info, NULL, NULL, NULL, napi_default, NULL },
    { "destroyRenderTarget", NULL, destroy_render_target, NULL, NULL, NULL, napi_default, NULL },
    { "setGraphicsDeviceRenderTargets", NULL, set_graphics_render_targets, NULL, NULL, NULL, napi_default, NULL },
    { "createOcclusionQuery", NULL, create_occlusion_query, NULL, NULL, NULL, napi_default, NULL },
    { "beginOcclusionQuery", NULL, begin_occlusion_query, NULL, NULL, NULL, napi_default, NULL },
    { "endOcclusionQuery", NULL, end_occlusion_query, NULL, NULL, NULL, napi_default, NULL },
    { "getOcclusionQueryIsComplete", NULL, get_occlusion_query_is_complete, NULL, NULL, NULL, napi_default, NULL },
    { "getOcclusionQueryPixelCount", NULL, get_occlusion_query_pixel_count, NULL, NULL, NULL, napi_default, NULL },
    { "destroyOcclusionQuery", NULL, destroy_occlusion_query, NULL, NULL, NULL, napi_default, NULL },
    { "createEffectEmpty", NULL, create_effect_empty, NULL, NULL, NULL, napi_default, NULL },
    { "createEffectCompiled", NULL, create_effect_compiled, NULL, NULL, NULL, napi_default, NULL },
    { "cloneEffect", NULL, clone_effect, NULL, NULL, NULL, napi_default, NULL },
    { "createStockEffect", NULL, create_stock_effect, NULL, NULL, NULL, napi_default, NULL },
    { "getEffectReflection", NULL, get_effect_reflection, NULL, NULL, NULL, napi_default, NULL },
    { "setEffectCurrentTechnique", NULL, set_effect_current_technique, NULL, NULL, NULL, napi_default, NULL },
    { "applyEffect", NULL, apply_effect, NULL, NULL, NULL, napi_default, NULL },
    { "applyEffectPass", NULL, apply_effect_pass, NULL, NULL, NULL, napi_default, NULL },
    { "syncStockEffect", NULL, sync_stock_effect, NULL, NULL, NULL, napi_default, NULL },
    { "destroyEffectTechnique", NULL, destroy_effect_technique, NULL, NULL, NULL, napi_default, NULL },
    { "destroyEffectPass", NULL, destroy_effect_pass, NULL, NULL, NULL, napi_default, NULL },
    { "destroyEffect", NULL, destroy_effect, NULL, NULL, NULL, napi_default, NULL },
    { "beginSpriteBatchWithEffect", NULL, begin_sprite_batch_with_effect, NULL, NULL, NULL, napi_default, NULL },
    { "openTitleStream", NULL, open_title_stream, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowAllowUserResizing", NULL, get_window_allow_resizing, NULL, NULL, NULL, napi_default, NULL },
    { "setGameWindowAllowUserResizing", NULL, set_window_allow_resizing, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowClientBounds", NULL, get_window_client_bounds, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowCurrentOrientation", NULL, get_window_orientation, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowHandle", NULL, get_window_handle, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowScreenDeviceName", NULL, get_window_screen_name, NULL, NULL, NULL, napi_default, NULL },
    { "getGameWindowTitle", NULL, get_window_title, NULL, NULL, NULL, napi_default, NULL },
    { "setGameWindowTitle", NULL, set_window_title, NULL, NULL, NULL, napi_default, NULL },
    { "beginGameWindowScreenDeviceChange", NULL, begin_window_screen_change, NULL, NULL, NULL, napi_default, NULL },
    { "endGameWindowScreenDeviceChange", NULL, end_window_screen_change, NULL, NULL, NULL, napi_default, NULL },
    { "subscribeRenderTargetContentLost", NULL, subscribe_render_target_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "subscribeVertexBufferContentLost", NULL, subscribe_vertex_buffer_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "subscribeIndexBufferContentLost", NULL, subscribe_index_buffer_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "unsubscribeContentLost", NULL, unsubscribe_content_lost, NULL, NULL, NULL, napi_default, NULL },
    { "subscribeGameWindowEvent", NULL, subscribe_window_event, NULL, NULL, NULL, napi_default, NULL },
    { "unsubscribeGameWindowEvent", NULL, unsubscribe_window_event, NULL, NULL, NULL, napi_default, NULL },
    { "getKeyboardState", NULL, get_keyboard_state, NULL, NULL, NULL, napi_default, NULL },
    { "getMouseState", NULL, get_mouse_state, NULL, NULL, NULL, napi_default, NULL },
    { "setMousePosition", NULL, set_mouse_position, NULL, NULL, NULL, napi_default, NULL },
    { "getMouseWindowHandle", NULL, get_mouse_window, NULL, NULL, NULL, napi_default, NULL },
    { "setMouseWindowHandle", NULL, set_mouse_window, NULL, NULL, NULL, napi_default, NULL },
    { "getGamePadState", NULL, get_gamepad_state, NULL, NULL, NULL, napi_default, NULL },
    { "getGamePadCapabilities", NULL, get_gamepad_capabilities, NULL, NULL, NULL, napi_default, NULL },
    { "setGamePadVibration", NULL, set_gamepad_vibration, NULL, NULL, NULL, napi_default, NULL },
    { "getTouchState", NULL, get_touch_state, NULL, NULL, NULL, napi_default, NULL },
    { "getTouchCapabilities", NULL, get_touch_capabilities, NULL, NULL, NULL, napi_default, NULL },
    { "isGestureAvailable", NULL, is_gesture_available, NULL, NULL, NULL, napi_default, NULL },
    { "readGesture", NULL, read_gesture, NULL, NULL, NULL, napi_default, NULL },
    { "getTouchWindowHandle", NULL, get_touch_window, NULL, NULL, NULL, napi_default, NULL },
    { "setTouchWindowHandle", NULL, set_touch_window, NULL, NULL, NULL, napi_default, NULL },
    { "createSoundEffectPcm", NULL, create_sound_effect_pcm, NULL, NULL, NULL, napi_default, NULL },
    { "createSoundEffectEncoded", NULL, create_sound_effect_encoded, NULL, NULL, NULL, napi_default, NULL },
    { "getSoundEffectDurationTicks", NULL, get_sound_effect_duration, NULL, NULL, NULL, napi_default, NULL },
    { "getSoundEffectName", NULL, get_sound_effect_name, NULL, NULL, NULL, napi_default, NULL },
    { "setSoundEffectName", NULL, set_sound_effect_name, NULL, NULL, NULL, napi_default, NULL },
    { "createSoundEffectInstance", NULL, create_sound_effect_instance, NULL, NULL, NULL, napi_default, NULL },
    { "playSoundEffect", NULL, play_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "destroySoundEffect", NULL, destroy_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "getMasterVolume", NULL, get_master_volume, NULL, NULL, NULL, napi_default, NULL },
    { "setMasterVolume", NULL, set_master_volume, NULL, NULL, NULL, napi_default, NULL },
    { "getDistanceScale", NULL, get_distance_scale, NULL, NULL, NULL, napi_default, NULL },
    { "setDistanceScale", NULL, set_distance_scale, NULL, NULL, NULL, napi_default, NULL },
    { "getDopplerScale", NULL, get_doppler_scale, NULL, NULL, NULL, napi_default, NULL },
    { "setDopplerScale", NULL, set_doppler_scale, NULL, NULL, NULL, napi_default, NULL },
    { "getSpeedOfSound", NULL, get_speed_of_sound, NULL, NULL, NULL, napi_default, NULL },
    { "setSpeedOfSound", NULL, set_speed_of_sound, NULL, NULL, NULL, napi_default, NULL },
    { "playSoundEffectInstance", NULL, play_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "pauseSoundEffectInstance", NULL, pause_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "resumeSoundEffectInstance", NULL, resume_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "stopSoundEffectInstance", NULL, stop_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "getSoundEffectInstanceInfo", NULL, get_sound_instance_info, NULL, NULL, NULL, napi_default, NULL },
    { "setSoundEffectInstanceVolume", NULL, set_sound_instance_volume, NULL, NULL, NULL, napi_default, NULL },
    { "setSoundEffectInstancePitch", NULL, set_sound_instance_pitch, NULL, NULL, NULL, napi_default, NULL },
    { "setSoundEffectInstancePan", NULL, set_sound_instance_pan, NULL, NULL, NULL, napi_default, NULL },
    { "setSoundEffectInstanceLooped", NULL, set_sound_instance_looped, NULL, NULL, NULL, napi_default, NULL },
    { "applySoundEffectInstance3D", NULL, apply_sound_instance_3d, NULL, NULL, NULL, napi_default, NULL },
    { "destroySoundEffectInstance", NULL, destroy_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "createDynamicSoundEffectInstance", NULL, create_dynamic_sound_instance, NULL, NULL, NULL, napi_default, NULL },
    { "getDynamicPendingBufferCount", NULL, get_dynamic_pending, NULL, NULL, NULL, napi_default, NULL },
    { "submitDynamicBuffer", NULL, submit_dynamic_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "getMicrophones", NULL, get_microphones, NULL, NULL, NULL, napi_default, NULL },
    { "setMicrophoneBufferDurationTicks", NULL, set_microphone_duration, NULL, NULL, NULL, napi_default, NULL },
    { "startMicrophone", NULL, start_microphone, NULL, NULL, NULL, napi_default, NULL },
    { "stopMicrophone", NULL, stop_microphone, NULL, NULL, NULL, napi_default, NULL },
    { "getMicrophoneData", NULL, get_microphone_data, NULL, NULL, NULL, napi_default, NULL },
    { "createAudioEngine", NULL, create_audio_engine, NULL, NULL, NULL, napi_default, NULL },
    { "destroyAudioEngine", NULL, destroy_audio_engine, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioEngineIsDisposed", NULL, get_audio_engine_disposed, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioEngineRendererDetails", NULL, get_audio_engine_renderers, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioEngineGlobalVariable", NULL, get_audio_engine_global, NULL, NULL, NULL, napi_default, NULL },
    { "setAudioEngineGlobalVariable", NULL, set_audio_engine_global, NULL, NULL, NULL, napi_default, NULL },
    { "updateAudioEngine", NULL, update_audio_engine, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioCategory", NULL, get_audio_category, NULL, NULL, NULL, napi_default, NULL },
    { "destroyAudioCategory", NULL, destroy_audio_category, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioCategoryName", NULL, get_audio_category_name, NULL, NULL, NULL, napi_default, NULL },
    { "pauseAudioCategory", NULL, pause_audio_category, NULL, NULL, NULL, napi_default, NULL },
    { "resumeAudioCategory", NULL, resume_audio_category, NULL, NULL, NULL, napi_default, NULL },
    { "setAudioCategoryVolume", NULL, set_audio_category_volume, NULL, NULL, NULL, napi_default, NULL },
    { "stopAudioCategory", NULL, stop_audio_category, NULL, NULL, NULL, napi_default, NULL },
    { "audioCategoriesEqual", NULL, audio_categories_equal, NULL, NULL, NULL, napi_default, NULL },
    { "getAudioCategoryHashCode", NULL, get_audio_category_hash, NULL, NULL, NULL, napi_default, NULL },
    { "createWaveBank", NULL, create_wave_bank, NULL, NULL, NULL, napi_default, NULL },
    { "createStreamingWaveBank", NULL, create_streaming_wave_bank, NULL, NULL, NULL, napi_default, NULL },
    { "destroyWaveBank", NULL, destroy_wave_bank, NULL, NULL, NULL, napi_default, NULL },
    { "getWaveBankIsDisposed", NULL, get_wave_bank_disposed, NULL, NULL, NULL, napi_default, NULL },
    { "getWaveBankIsPrepared", NULL, get_wave_bank_prepared, NULL, NULL, NULL, napi_default, NULL },
    { "getWaveBankIsInUse", NULL, get_wave_bank_in_use, NULL, NULL, NULL, napi_default, NULL },
    { "createSoundBank", NULL, create_sound_bank, NULL, NULL, NULL, napi_default, NULL },
    { "destroySoundBank", NULL, destroy_sound_bank, NULL, NULL, NULL, napi_default, NULL },
    { "getSoundBankIsDisposed", NULL, get_sound_bank_disposed, NULL, NULL, NULL, napi_default, NULL },
    { "getSoundBankIsInUse", NULL, get_sound_bank_in_use, NULL, NULL, NULL, napi_default, NULL },
    { "getCue", NULL, get_sound_bank_cue, NULL, NULL, NULL, napi_default, NULL },
    { "playSoundBankCue", NULL, play_sound_bank_cue, NULL, NULL, NULL, napi_default, NULL },
    { "playSoundBankCue3D", NULL, play_sound_bank_cue_3d, NULL, NULL, NULL, napi_default, NULL },
    { "destroyCue", NULL, destroy_cue, NULL, NULL, NULL, napi_default, NULL },
    { "getCueInfo", NULL, get_cue_info, NULL, NULL, NULL, napi_default, NULL },
    { "getCueName", NULL, get_cue_name, NULL, NULL, NULL, napi_default, NULL },
    { "applyCue3D", NULL, apply_cue_3d, NULL, NULL, NULL, napi_default, NULL },
    { "getCueVariable", NULL, get_cue_variable, NULL, NULL, NULL, napi_default, NULL },
    { "setCueVariable", NULL, set_cue_variable, NULL, NULL, NULL, napi_default, NULL },
    { "playCue", NULL, play_cue, NULL, NULL, NULL, napi_default, NULL },
    { "pauseCue", NULL, pause_cue, NULL, NULL, NULL, napi_default, NULL },
    { "resumeCue", NULL, resume_cue, NULL, NULL, NULL, napi_default, NULL },
    { "stopCue", NULL, stop_cue, NULL, NULL, NULL, napi_default, NULL },
    { "getAvailableMediaSources", NULL, get_media_sources, NULL, NULL, NULL, napi_default, NULL },
    { "playMediaSongs", NULL, play_media_songs, NULL, NULL, NULL, napi_default, NULL },
    { "pauseMedia", NULL, pause_media, NULL, NULL, NULL, napi_default, NULL },
    { "resumeMedia", NULL, resume_media, NULL, NULL, NULL, napi_default, NULL },
    { "stopMedia", NULL, stop_media, NULL, NULL, NULL, napi_default, NULL },
    { "moveNextMedia", NULL, move_next_media, NULL, NULL, NULL, napi_default, NULL },
    { "movePreviousMedia", NULL, move_previous_media, NULL, NULL, NULL, napi_default, NULL },
    { "setMediaVolume", NULL, set_media_volume, NULL, NULL, NULL, napi_default, NULL },
    { "setMediaMuted", NULL, set_media_muted, NULL, NULL, NULL, napi_default, NULL },
    { "setMediaRepeating", NULL, set_media_repeating, NULL, NULL, NULL, napi_default, NULL },
    { "setMediaShuffled", NULL, set_media_shuffled, NULL, NULL, NULL, napi_default, NULL },
    { "setMediaVisualizationEnabled", NULL, set_media_visualization, NULL, NULL, NULL, napi_default, NULL },
    { "getMediaGameHasControl", NULL, get_media_game_control, NULL, NULL, NULL, napi_default, NULL },
    { "getMediaPlayPositionTicks", NULL, get_media_position, NULL, NULL, NULL, napi_default, NULL },
    { "getMediaVisualizationData", NULL, get_media_visualization, NULL, NULL, NULL, napi_default, NULL },
    { "updateMedia", NULL, update_media, NULL, NULL, NULL, napi_default, NULL },
    { "createVideoPlayer", NULL, create_video_player, NULL, NULL, NULL, napi_default, NULL },
    { "destroyVideoPlayer", NULL, destroy_video_player, NULL, NULL, NULL, napi_default, NULL },
    { "getVideoPlayerInfo", NULL, get_video_player_info, NULL, NULL, NULL, napi_default, NULL },
    { "setVideoPlayerLooped", NULL, set_video_player_looped, NULL, NULL, NULL, napi_default, NULL },
    { "setVideoPlayerMuted", NULL, set_video_player_muted, NULL, NULL, NULL, napi_default, NULL },
    { "setVideoPlayerVolume", NULL, set_video_player_volume, NULL, NULL, NULL, napi_default, NULL },
    { "playVideo", NULL, play_video, NULL, NULL, NULL, napi_default, NULL },
    { "pauseVideo", NULL, pause_video, NULL, NULL, NULL, napi_default, NULL },
    { "resumeVideo", NULL, resume_video, NULL, NULL, NULL, napi_default, NULL },
    { "stopVideo", NULL, stop_video, NULL, NULL, NULL, napi_default, NULL },
    { "selectStorageDevice", NULL, select_storage_device, NULL, NULL, NULL, napi_default, NULL },
    { "destroyStorageDevice", NULL, destroy_storage_device, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageDeviceInfo", NULL, get_storage_device_info, NULL, NULL, NULL, napi_default, NULL },
    { "deleteStorageContainer", NULL, delete_storage_container, NULL, NULL, NULL, napi_default, NULL },
    { "openStorageContainer", NULL, open_storage_container, NULL, NULL, NULL, napi_default, NULL },
    { "destroyStorageContainer", NULL, destroy_storage_container, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageContainerDisplayName", NULL, get_storage_container_display_name, NULL, NULL, NULL, napi_default, NULL },
    { "createStorageDirectory", NULL, create_storage_directory, NULL, NULL, NULL, napi_default, NULL },
    { "storageDirectoryExists", NULL, storage_directory_exists, NULL, NULL, NULL, napi_default, NULL },
    { "deleteStorageDirectory", NULL, delete_storage_directory, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageDirectoryNames", NULL, get_storage_directory_names, NULL, NULL, NULL, napi_default, NULL },
    { "createStorageFile", NULL, create_storage_file, NULL, NULL, NULL, napi_default, NULL },
    { "storageFileExists", NULL, storage_file_exists, NULL, NULL, NULL, napi_default, NULL },
    { "deleteStorageFile", NULL, delete_storage_file, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageFileNames", NULL, get_storage_file_names, NULL, NULL, NULL, napi_default, NULL },
    { "cnbHasMagic", NULL, cnb_has_magic, NULL, NULL, NULL, napi_default, NULL },
    { "cnbFormatMagic", NULL, cnb_format_magic, NULL, NULL, NULL, napi_default, NULL },
    { "cnbCrc32c", NULL, cnb_crc32c, NULL, NULL, NULL, napi_default, NULL },
    { "cnbIsCompressionSupported", NULL, cnb_is_compression_supported, NULL, NULL, NULL, napi_default, NULL },
    { "cnbCompressionName", NULL, cnb_compression_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAssetTypeName", NULL, cnb_asset_type_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAssetTypeIdFromName", NULL, cnb_asset_type_id_from_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbIsCustomAssetTypeId", NULL, cnb_is_custom_asset_type_id, NULL, NULL, NULL, napi_default, NULL },
    { "cnbMakeChunkId", NULL, cnb_make_chunk_id, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterCreate", NULL, cnb_byte_writer_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterDestroy", NULL, cnb_byte_writer_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteU8", NULL, cnb_byte_writer_write_u8, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteU16", NULL, cnb_byte_writer_write_u16, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteU32", NULL, cnb_byte_writer_write_u32, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteU64", NULL, cnb_byte_writer_write_u64, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteI32", NULL, cnb_byte_writer_write_i32, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteF32", NULL, cnb_byte_writer_write_f32, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteF64", NULL, cnb_byte_writer_write_f64, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteString", NULL, cnb_byte_writer_write_string, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteBytes", NULL, cnb_byte_writer_write_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterWriteZeros", NULL, cnb_byte_writer_write_zeros, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterGetSize", NULL, cnb_byte_writer_get_size, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterCopyBytes", NULL, cnb_byte_writer_copy_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbByteWriterTake", NULL, cnb_byte_writer_take, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterCreate", NULL, cnb_writer_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterDestroy", NULL, cnb_writer_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterSetMetadata", NULL, cnb_writer_set_metadata, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterAddExternalReference", NULL, cnb_writer_add_external_reference, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterClearExternalReferences", NULL, cnb_writer_clear_external_references, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterAddChunk", NULL, cnb_writer_add_chunk, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterGetSchemaChunkCount", NULL, cnb_writer_get_schema_chunk_count, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterSetCompression", NULL, cnb_writer_set_compression, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterSetLimits", NULL, cnb_writer_set_limits, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterGetLimits", NULL, cnb_writer_get_limits, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterBuild", NULL, cnb_writer_build, NULL, NULL, NULL, napi_default, NULL },
    { "cnbWriterAppendEmbeddedTexture2D", NULL, cnb_writer_append_embedded_texture2d, NULL, NULL, NULL, napi_default, NULL },
    { "cnbChunkIdString", NULL, cnb_chunk_id_string, NULL, NULL, NULL, napi_default, NULL },
    { "cnbIsWellFormedChunkId", NULL, cnb_is_well_formed_chunk_id, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureFormatName", NULL, cnb_texture_format_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbIsBlockCompressedTextureFormat", NULL, cnb_is_block_compressed_texture_format, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureFormatUnitBytes", NULL, cnb_texture_format_unit_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureLevelByteSize", NULL, cnb_texture_level_byte_size, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureFormatToSurfaceFormat", NULL, cnb_texture_format_to_surface_format, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentParse", NULL, cnb_document_parse, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentDestroy", NULL, cnb_document_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentGetInfo", NULL, cnb_document_get_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentGetChunk", NULL, cnb_document_get_chunk, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentCopyChunkData", NULL, cnb_document_copy_chunk_data, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentFindAll", NULL, cnb_document_find_all, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentRequireMandatoryChunksUnderstood", NULL, cnb_document_require_mandatory_chunks_understood, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDocumentGetExternalReference", NULL, cnb_document_get_external_reference, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeTexture2D", NULL, cnb_decode_texture2d, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataDestroy", NULL, cnb_texture_data_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataGetInfo", NULL, cnb_texture_data_get_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataGetLevelDimensions", NULL, cnb_texture_data_get_level_dimensions, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataGetRepresentationFormat", NULL, cnb_texture_data_get_representation_format, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataGetLevelCount", NULL, cnb_texture_data_get_level_count, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataCopyLevel", NULL, cnb_texture_data_copy_level, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataCreate", NULL, cnb_texture_data_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataCreateRgba8", NULL, cnb_texture_data_create_rgba8, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataAddRepresentation", NULL, cnb_texture_data_add_representation, NULL, NULL, NULL, napi_default, NULL },
    { "cnbTextureDataSetLevel", NULL, cnb_texture_data_set_level, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeTexture2D", NULL, cnb_encode_texture2d, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeSpriteFont", NULL, cnb_decode_sprite_font, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataCreate", NULL, cnb_sprite_font_data_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataDestroy", NULL, cnb_sprite_font_data_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataGetInfo", NULL, cnb_sprite_font_data_get_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataSetInfo", NULL, cnb_sprite_font_data_set_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataGetGlyph", NULL, cnb_sprite_font_data_get_glyph, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataAddGlyph", NULL, cnb_sprite_font_data_add_glyph, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataSetAtlas", NULL, cnb_sprite_font_data_set_atlas, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSpriteFontDataCopyAtlas", NULL, cnb_sprite_font_data_copy_atlas, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeSpriteFont", NULL, cnb_encode_sprite_font, NULL, NULL, NULL, napi_default, NULL },
    { "textInputSubscribeInput", NULL, text_input_subscribe_input, NULL, NULL, NULL, napi_default, NULL },
    { "textInputSubscribeEditing", NULL, text_input_subscribe_editing, NULL, NULL, NULL, napi_default, NULL },
    { "textInputSubscribeCandidates", NULL, text_input_subscribe_candidates, NULL, NULL, NULL, napi_default, NULL },
    { "textInputUnsubscribe", NULL, text_input_unsubscribe, NULL, NULL, NULL, napi_default, NULL },
    { "textInputRaiseInput", NULL, text_input_raise_input, NULL, NULL, NULL, napi_default, NULL },
    { "textInputRaiseEditing", NULL, text_input_raise_editing, NULL, NULL, NULL, napi_default, NULL },
    { "textInputRaiseCandidates", NULL, text_input_raise_candidates, NULL, NULL, NULL, napi_default, NULL },
    { "textInputStart", NULL, text_input_start, NULL, NULL, NULL, napi_default, NULL },
    { "textInputStartWithType", NULL, text_input_start_with_type, NULL, NULL, NULL, napi_default, NULL },
    { "textInputStop", NULL, text_input_stop, NULL, NULL, NULL, napi_default, NULL },
    { "textInputIsActive", NULL, text_input_is_active, NULL, NULL, NULL, napi_default, NULL },
    { "textInputIsScreenKeyboardShown", NULL, text_input_is_screen_keyboard_shown, NULL, NULL, NULL, napi_default, NULL },
    { "textInputSetRectangle", NULL, text_input_set_rectangle, NULL, NULL, NULL, napi_default, NULL },
    { "textInputResetForTests", NULL, text_input_reset_for_tests, NULL, NULL, NULL, napi_default, NULL },
    { "mouseCursorGetStock", NULL, mouse_cursor_get_stock, NULL, NULL, NULL, napi_default, NULL },
    { "mouseCursorCreateFromTexture", NULL, mouse_cursor_create_from_texture, NULL, NULL, NULL, napi_default, NULL },
    { "mouseCursorDispose", NULL, mouse_cursor_dispose, NULL, NULL, NULL, napi_default, NULL },
    { "mouseCursorDestroy", NULL, mouse_cursor_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "mouseSetCursor", NULL, mouse_set_cursor, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetCount", NULL, joysticks_get_count, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetInfoAt", NULL, joysticks_get_info_at, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetNameAt", NULL, joysticks_get_name_at, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetCapabilities", NULL, joysticks_get_capabilities, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetCapabilitiesName", NULL, joysticks_get_capabilities_name, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksGetCapabilitiesGuid", NULL, joysticks_get_capabilities_guid, NULL, NULL, NULL, napi_default, NULL },
    { "joysticksCaptureState", NULL, joysticks_capture_state, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsGetCount", NULL, haptics_get_count, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsGetIdAt", NULL, haptics_get_id_at, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsGetNameAt", NULL, haptics_get_name_at, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsIsJoystickHaptic", NULL, haptics_is_joystick_haptic, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsOpen", NULL, haptics_open, NULL, NULL, NULL, napi_default, NULL },
    { "hapticsOpenFromJoystick", NULL, haptics_open_from_joystick, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceGetCapabilities", NULL, haptic_device_get_capabilities, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceGetName", NULL, haptic_device_get_name, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceGetIsOpen", NULL, haptic_device_get_is_open, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceInitRumble", NULL, haptic_device_init_rumble, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDevicePlayRumble", NULL, haptic_device_play_rumble, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceStopRumble", NULL, haptic_device_stop_rumble, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceSetGain", NULL, haptic_device_set_gain, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceDispose", NULL, haptic_device_dispose, NULL, NULL, NULL, napi_default, NULL },
    { "hapticDeviceDestroy", NULL, haptic_device_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbImportImageAsTexture2D", NULL, cnb_import_image_as_texture2d, NULL, NULL, NULL, napi_default, NULL },
    { "cnbImportDdsAsTextureCube", NULL, cnb_import_dds_as_texture_cube, NULL, NULL, NULL, napi_default, NULL },
    { "cnbImportWavAsSoundEffect", NULL, cnb_import_wav_as_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "isLibraryLoaded", NULL, is_library_loaded, NULL, NULL, NULL, napi_default, NULL },
    { "cnbCompileCnj", NULL, cnb_compile_cnj, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeCurve", NULL, cnb_encode_curve, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeCurve", NULL, cnb_decode_curve, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeAnimationClip", NULL, cnb_encode_animation_clip, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeAnimationClip", NULL, cnb_decode_animation_clip, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAnimationClipDestroy", NULL, cnb_animation_clip_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAnimationClipGet", NULL, cnb_animation_clip_get, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAnimationClipGetTrack", NULL, cnb_animation_clip_get_track, NULL, NULL, NULL, napi_default, NULL },
    { "cnbAnimationClipCopyKeyframes", NULL, cnb_animation_clip_copy_keyframes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSoundEffectDataCreate", NULL, cnb_sound_effect_data_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSoundEffectDataDestroy", NULL, cnb_sound_effect_data_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSoundEffectDataGetInfo", NULL, cnb_sound_effect_data_get_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbSoundEffectDataCopySamples", NULL, cnb_sound_effect_data_copy_samples, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeSoundEffect", NULL, cnb_encode_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeSoundEffect", NULL, cnb_decode_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeWavAsSoundEffect", NULL, cnb_decode_wav_as_sound_effect, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeSong", NULL, cnb_encode_song, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeSongDuration", NULL, cnb_decode_song_duration, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeSongName", NULL, cnb_decode_song_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeSongStreamReference", NULL, cnb_decode_song_stream_reference, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeVideo", NULL, cnb_encode_video, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeVideo", NULL, cnb_decode_video, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeVideoStreamReference", NULL, cnb_decode_video_stream_reference, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCreate", NULL, cnb_model_create, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelDestroy", NULL, cnb_model_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetFlags", NULL, cnb_model_set_flags, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetInfo", NULL, cnb_model_get_info, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelAddBone", NULL, cnb_model_add_bone, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetBone", NULL, cnb_model_get_bone, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetBoneName", NULL, cnb_model_get_bone_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelAddPart", NULL, cnb_model_add_part, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetPart", NULL, cnb_model_get_part, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetPartName", NULL, cnb_model_get_part_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetPartExternalEffect", NULL, cnb_model_get_part_external_effect, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetPartVertexBytes", NULL, cnb_model_set_part_vertex_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCopyPartVertexBytes", NULL, cnb_model_copy_part_vertex_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetPartIndexBytes", NULL, cnb_model_set_part_index_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCopyPartIndexBytes", NULL, cnb_model_copy_part_index_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetMaterial", NULL, cnb_model_get_material, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetMaterial", NULL, cnb_model_set_material, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetMaterialTexture", NULL, cnb_model_get_material_texture, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetMaterialTexture", NULL, cnb_model_set_material_texture, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelAddMesh", NULL, cnb_model_add_mesh, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetMesh", NULL, cnb_model_get_mesh, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetMeshName", NULL, cnb_model_get_mesh_name, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCopyMeshPartIndices", NULL, cnb_model_copy_mesh_part_indices, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelSetSkeleton", NULL, cnb_model_set_skeleton, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetSkeleton", NULL, cnb_model_get_skeleton, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCopySkeletonHierarchy", NULL, cnb_model_copy_skeleton_hierarchy, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelCopySkeletonMatrices", NULL, cnb_model_copy_skeleton_matrices, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelAddLight", NULL, cnb_model_add_light, NULL, NULL, NULL, napi_default, NULL },
    { "cnbModelGetLight", NULL, cnb_model_get_light, NULL, NULL, NULL, napi_default, NULL },
    { "cnbEncodeModel", NULL, cnb_encode_model, NULL, NULL, NULL, napi_default, NULL },
    { "cnbDecodeModel", NULL, cnb_decode_model, NULL, NULL, NULL, napi_default, NULL },
    { "createBlitPass", NULL, create_blit_pass, NULL, NULL, NULL, napi_default, NULL },
    { "createBloomPass", NULL, create_bloom_pass, NULL, NULL, NULL, napi_default, NULL },
    { "createTonemapPass", NULL, create_tonemap_pass, NULL, NULL, NULL, napi_default, NULL },
    { "createFxaaPass", NULL, create_fxaa_pass, NULL, NULL, NULL, napi_default, NULL },
    { "createSsaoPass", NULL, create_ssao_pass, NULL, NULL, NULL, napi_default, NULL },
    { "createSsrPass", NULL, create_ssr_pass, NULL, NULL, NULL, napi_default, NULL },
    { "getBloomIntensity", NULL, bloom_get_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "setBloomIntensity", NULL, bloom_set_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "getBloomThreshold", NULL, bloom_get_threshold_value, NULL, NULL, NULL, napi_default, NULL },
    { "setBloomThreshold", NULL, bloom_set_threshold_value, NULL, NULL, NULL, napi_default, NULL },
    { "getTonemapExposure", NULL, tonemap_get_exposure_value, NULL, NULL, NULL, napi_default, NULL },
    { "setTonemapExposure", NULL, tonemap_set_exposure_value, NULL, NULL, NULL, napi_default, NULL },
    { "getTonemapGamma", NULL, tonemap_get_gamma_value, NULL, NULL, NULL, napi_default, NULL },
    { "setTonemapGamma", NULL, tonemap_set_gamma_value, NULL, NULL, NULL, napi_default, NULL },
    { "getTonemapDebandStrength", NULL, tonemap_get_deband_strength_value, NULL, NULL, NULL, napi_default, NULL },
    { "setTonemapDebandStrength", NULL, tonemap_set_deband_strength_value, NULL, NULL, NULL, napi_default, NULL },
    { "getFxaaEdgeThreshold", NULL, fxaa_get_edge_threshold_value, NULL, NULL, NULL, napi_default, NULL },
    { "setFxaaEdgeThreshold", NULL, fxaa_set_edge_threshold_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsaoRadius", NULL, ssao_get_radius_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsaoRadius", NULL, ssao_set_radius_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsaoIntensity", NULL, ssao_get_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsaoIntensity", NULL, ssao_set_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrIntensity", NULL, ssr_get_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrIntensity", NULL, ssr_set_intensity_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrMaxDistance", NULL, ssr_get_max_distance_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrMaxDistance", NULL, ssr_set_max_distance_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrThickness", NULL, ssr_get_thickness_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrThickness", NULL, ssr_set_thickness_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrDepthBias", NULL, ssr_get_depth_bias_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrDepthBias", NULL, ssr_set_depth_bias_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrEdgeFade", NULL, ssr_get_edge_fade_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrEdgeFade", NULL, ssr_set_edge_fade_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrRoughnessBlur", NULL, ssr_get_roughness_blur_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrRoughnessBlur", NULL, ssr_set_roughness_blur_value, NULL, NULL, NULL, napi_default, NULL },
    { "getBloomIterations", NULL, bloom_get_iterations_value, NULL, NULL, NULL, napi_default, NULL },
    { "setBloomIterations", NULL, bloom_set_iterations_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsaoSampleCount", NULL, ssao_get_sample_count_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsaoSampleCount", NULL, ssao_set_sample_count_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsrStepCount", NULL, ssr_get_step_count_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsrStepCount", NULL, ssr_set_step_count_value, NULL, NULL, NULL, napi_default, NULL },
    { "getSsaoHalfResolution", NULL, ssao_get_half_resolution_value, NULL, NULL, NULL, napi_default, NULL },
    { "setSsaoHalfResolution", NULL, ssao_set_half_resolution_value, NULL, NULL, NULL, napi_default, NULL },
    { "getTonemapMode", NULL, tonemap_get_mode_value, NULL, NULL, NULL, napi_default, NULL },
    { "setTonemapMode", NULL, tonemap_set_mode_value, NULL, NULL, NULL, napi_default, NULL },
    { "getTonemapDebandEnabled", NULL, tonemap_get_deband_enabled_value, NULL, NULL, NULL, napi_default, NULL },
    { "setTonemapDebandEnabled", NULL, tonemap_set_deband_enabled_value, NULL, NULL, NULL, napi_default, NULL },
    { "bloomIterationsForQuality", NULL, bloom_iterations_for_quality_value, NULL, NULL, NULL, napi_default, NULL },
    { "ssaoSampleCountForQuality", NULL, ssao_sample_count_for_quality_value, NULL, NULL, NULL, napi_default, NULL },
    { "fxaaEdgeThresholdForQuality", NULL, fxaa_edge_threshold_for_quality_value, NULL, NULL, NULL, napi_default, NULL },
    { "resetBloomTargets", NULL, bloom_reset_targets_value, NULL, NULL, NULL, napi_default, NULL },
    { "resetSsaoTargets", NULL, ssao_reset_targets_value, NULL, NULL, NULL, napi_default, NULL },
    { "applyPostProcessPass", NULL, post_process_pass_apply, NULL, NULL, NULL, napi_default, NULL },
    { "getPostProcessPassName", NULL, post_process_pass_name, NULL, NULL, NULL, napi_default, NULL },
    { "isPostProcessPassSupported", NULL, post_process_pass_supported, NULL, NULL, NULL, napi_default, NULL },
    { "destroyPostProcessPass", NULL, post_process_pass_release, NULL, NULL, NULL, napi_default, NULL },
    { "createPostProcessChain", NULL, post_process_chain_create, NULL, NULL, NULL, napi_default, NULL },
    { "destroyPostProcessChain", NULL, post_process_chain_release, NULL, NULL, NULL, napi_default, NULL },
    { "clearPostProcessChain", NULL, post_process_chain_clear, NULL, NULL, NULL, napi_default, NULL },
    { "resetPostProcessChainTargets", NULL, post_process_chain_reset_targets, NULL, NULL, NULL, napi_default, NULL },
    { "addPostProcessPass", NULL, post_process_chain_add_pass, NULL, NULL, NULL, napi_default, NULL },
    { "addOwnedPostProcessPass", NULL, post_process_chain_add_owned_pass, NULL, NULL, NULL, napi_default, NULL },
    { "getPostProcessChainPassCount", NULL, post_process_chain_pass_count, NULL, NULL, NULL, napi_default, NULL },
    { "getPostProcessChainGpuTimingEnabled", NULL, post_process_chain_get_gpu_timing, NULL, NULL, NULL, napi_default, NULL },
    { "setPostProcessChainGpuTimingEnabled", NULL, post_process_chain_set_gpu_timing, NULL, NULL, NULL, napi_default, NULL },
    { "applyPostProcessChain", NULL, post_process_chain_apply, NULL, NULL, NULL, napi_default, NULL },
    { "getPostProcessChainPassTimings", NULL, post_process_chain_timings, NULL, NULL, NULL, napi_default, NULL },
    { "isClusteredLightUsable", NULL, clustered_light_is_usable, NULL, NULL, NULL, napi_default, NULL },
    { "createClusteredLightSet", NULL, clustered_light_set_create, NULL, NULL, NULL, napi_default, NULL },
    { "addClusteredLight", NULL, clustered_light_set_add, NULL, NULL, NULL, napi_default, NULL },
    { "addClusteredPointLight", NULL, clustered_light_set_add_point, NULL, NULL, NULL, napi_default, NULL },
    { "addClusteredSpotLight", NULL, clustered_light_set_add_spot, NULL, NULL, NULL, napi_default, NULL },
    { "replaceClusteredLightAt", NULL, clustered_light_set_replace_at, NULL, NULL, NULL, napi_default, NULL },
    { "removeClusteredLightAt", NULL, clustered_light_set_remove_at, NULL, NULL, NULL, napi_default, NULL },
    { "clearClusteredLightSet", NULL, clustered_light_set_clear, NULL, NULL, NULL, napi_default, NULL },
    { "getClusteredLightCount", NULL, clustered_light_set_get_count, NULL, NULL, NULL, napi_default, NULL },
    { "isClusteredLightSetEmpty", NULL, clustered_light_set_is_empty, NULL, NULL, NULL, napi_default, NULL },
    { "getClusteredLightAt", NULL, clustered_light_set_get_at, NULL, NULL, NULL, napi_default, NULL },
    { "copyClusteredLights", NULL, clustered_light_set_copy_lights, NULL, NULL, NULL, napi_default, NULL },
    { "getClusteredLightBoundsAt", NULL, clustered_light_set_get_bounds_at, NULL, NULL, NULL, napi_default, NULL },
    { "copyClusteredLightBounds", NULL, clustered_light_set_copy_bounds, NULL, NULL, NULL, napi_default, NULL },
    { "destroyClusteredLightSet", NULL, clustered_light_set_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "createClusterGrid", NULL, clustered_light_grid_create, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridTilesX", NULL, clustered_light_grid_get_tiles_x, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridTilesY", NULL, clustered_light_grid_get_tiles_y, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridSliceCount", NULL, clustered_light_grid_get_slice_count, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridClusterCount", NULL, clustered_light_grid_get_cluster_count, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterIndex", NULL, clustered_light_grid_cluster_index, NULL, NULL, NULL, napi_default, NULL },
    { "setClusterGridProjection", NULL, clustered_light_grid_set_projection, NULL, NULL, NULL, napi_default, NULL },
    { "clusterGridHasProjection", NULL, clustered_light_grid_has_projection, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridNearPlane", NULL, clustered_light_grid_get_near_plane, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridFarPlane", NULL, clustered_light_grid_get_far_plane, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterGridInverseProjection", NULL, clustered_light_grid_get_inverse_projection, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterSliceDistance", NULL, clustered_light_grid_slice_distance, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterSliceForViewDistance", NULL, clustered_light_grid_slice_for_view_distance, NULL, NULL, NULL, napi_default, NULL },
    { "getClusterBounds", NULL, clustered_light_grid_cluster_bounds, NULL, NULL, NULL, napi_default, NULL },
    { "destroyClusterGrid", NULL, clustered_light_grid_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "createClusteredLightAssignment", NULL, clustered_light_assignment_create, NULL, NULL, NULL, napi_default, NULL },
    { "assignClusteredLights", NULL, clustered_light_assignment_assign, NULL, NULL, NULL, napi_default, NULL },
    { "clearClusteredLightAssignment", NULL, clustered_light_assignment_clear, NULL, NULL, NULL, napi_default, NULL },
    { "getAssignmentLightCount", NULL, clustered_light_assignment_get_light_count, NULL, NULL, NULL, napi_default, NULL },
    { "getAssignmentClusterCount", NULL, clustered_light_assignment_get_cluster_count, NULL, NULL, NULL, napi_default, NULL },
    { "copyLightsInCluster", NULL, clustered_light_assignment_copy_lights_in_cluster, NULL, NULL, NULL, napi_default, NULL },
    { "copyAssignmentIndices", NULL, clustered_light_assignment_copy_indices, NULL, NULL, NULL, napi_default, NULL },
    { "copyAssignmentOffsets", NULL, clustered_light_assignment_copy_offsets, NULL, NULL, NULL, napi_default, NULL },
    { "getAssignmentTotalReferenceCount", NULL, clustered_light_assignment_get_total_reference_count, NULL, NULL, NULL, napi_default, NULL },
    { "getAssignmentMaxLightsPerCluster", NULL, clustered_light_assignment_get_max_lights_per_cluster, NULL, NULL, NULL, napi_default, NULL },
    { "destroyClusteredLightAssignment", NULL, clustered_light_assignment_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "createClusteredShadowPolicy", NULL, clustered_shadow_policy_create, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowPolicyBudget", NULL, clustered_shadow_policy_get_budget, NULL, NULL, NULL, napi_default, NULL },
    { "setShadowPolicyBudget", NULL, clustered_shadow_policy_set_budget, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowPolicyHysteresis", NULL, clustered_shadow_policy_get_hysteresis, NULL, NULL, NULL, napi_default, NULL },
    { "setShadowPolicyHysteresis", NULL, clustered_shadow_policy_set_hysteresis, NULL, NULL, NULL, napi_default, NULL },
    { "copyShadowPolicySelected", NULL, clustered_shadow_policy_copy_selected, NULL, NULL, NULL, napi_default, NULL },
    { "isShadowPolicySelected", NULL, clustered_shadow_policy_is_selected, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowPolicyScore", NULL, clustered_shadow_policy_get_score, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowPolicyRequestCount", NULL, clustered_shadow_policy_get_request_count, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowPolicyRefusedCount", NULL, clustered_shadow_policy_get_refused_count, NULL, NULL, NULL, napi_default, NULL },
    { "resetShadowPolicy", NULL, clustered_shadow_policy_reset, NULL, NULL, NULL, napi_default, NULL },
    { "selectShadowCasters", NULL, clustered_shadow_policy_select, NULL, NULL, NULL, napi_default, NULL },
    { "createLodGroup", NULL, lod_group_create, NULL, NULL, NULL, napi_default, NULL },
    { "createShadowMap", NULL, shadow_map_create, NULL, NULL, NULL, napi_default, NULL },
    { "createParticleSystem", NULL, particle_system_create, NULL, NULL, NULL, napi_default, NULL },
    { "destroyParticleSystem", NULL, particle_system_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "resetParticleSystem", NULL, particle_system_reset, NULL, NULL, NULL, napi_default, NULL },
    { "updateParticleSystem", NULL, particle_system_update, NULL, NULL, NULL, napi_default, NULL },
    { "getParticleSystemCapacity", NULL, particle_system_get_capacity, NULL, NULL, NULL, napi_default, NULL },
    { "getParticleSystemActiveCount", NULL, particle_system_get_active_count, NULL, NULL, NULL, napi_default, NULL },
    { "particleSystemUsesCompute", NULL, particle_system_uses_compute, NULL, NULL, NULL, napi_default, NULL },
    { "isParticleSimulationForcedOnCpu", NULL, particle_system_is_cpu_forced, NULL, NULL, NULL, napi_default, NULL },
    { "setParticleSimulationOnCpu", NULL, particle_system_set_cpu_forced, NULL, NULL, NULL, napi_default, NULL },
    { "isParticleEmissionRateClamped", NULL, particle_system_is_emission_clamped, NULL, NULL, NULL, napi_default, NULL },
    { "getParticleSystemUnsupportedReason", NULL, particle_system_unsupported_reason, NULL, NULL, NULL, napi_default, NULL },
    { "getParticleEmitterSettings", NULL, particle_system_get_settings, NULL, NULL, NULL, napi_default, NULL },
    { "setParticleEmitterSettings", NULL, particle_system_set_settings, NULL, NULL, NULL, napi_default, NULL },
    { "copyParticles", NULL, particle_system_copy_particles, NULL, NULL, NULL, napi_default, NULL },
    { "getDefaultParticleEmitterSettings", NULL, particle_default_settings, NULL, NULL, NULL, napi_default, NULL },
    { "getDefaultParticle", NULL, particle_default, NULL, NULL, NULL, napi_default, NULL },
    { "particleRandom", NULL, particle_random, NULL, NULL, NULL, napi_default, NULL },
    { "stepParticle", NULL, particle_step, NULL, NULL, NULL, napi_default, NULL },
    { "destroyShadowMap", NULL, shadow_map_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "isShadowMapSupported", NULL, shadow_map_is_supported, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowMapSize", NULL, shadow_map_get_size, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowMapQuality", NULL, shadow_map_get_quality, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowMapDepthBias", NULL, shadow_map_get_depth_bias, NULL, NULL, NULL, napi_default, NULL },
    { "setShadowMapDepthBias", NULL, shadow_map_set_depth_bias, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowMapFilterRadius", NULL, shadow_map_get_filter_radius, NULL, NULL, NULL, napi_default, NULL },
    { "getShadowMapLightViewProjection", NULL, shadow_map_get_light_view_projection, NULL, NULL, NULL, napi_default, NULL },
    { "computeShadowLightView", NULL, shadow_map_compute_light_view, NULL, NULL, NULL, napi_default, NULL },
    { "computeCascadeSplitDistances", NULL, cascade_split_distances, NULL, NULL, NULL, napi_default, NULL },
    { "computeCascadeFrustumCorners", NULL, cascade_frustum_corners, NULL, NULL, NULL, napi_default, NULL },
    { "computeCascadeBoundingSphere", NULL, cascade_bounding_sphere, NULL, NULL, NULL, napi_default, NULL },
    { "computeSpotShadowLightView", NULL, spot_shadow_light_view, NULL, NULL, NULL, napi_default, NULL },
    { "computeSpotShadowLightProjection", NULL, spot_shadow_light_projection, NULL, NULL, NULL, napi_default, NULL },
    { "computeCubeShadowFaceView", NULL, cube_shadow_face_view, NULL, NULL, NULL, napi_default, NULL },
    { "computeCubeShadowFaceProjection", NULL, cube_shadow_face_projection, NULL, NULL, NULL, napi_default, NULL },
    { "cubeShadowMapSizeForQuality", NULL, cube_shadow_size_for_quality, NULL, NULL, NULL, napi_default, NULL },
    { "computeShadowLightProjection", NULL, shadow_map_compute_light_projection, NULL, NULL, NULL, napi_default, NULL },
    { "shadowMapSizeForQuality", NULL, shadow_map_size_for_quality, NULL, NULL, NULL, napi_default, NULL },
    { "shadowMapFilterRadiusForQuality", NULL, shadow_map_filter_radius_for_quality, NULL, NULL, NULL, napi_default, NULL },
    { "destroyLodGroup", NULL, lod_group_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "addLodLevel", NULL, lod_group_add_level, NULL, NULL, NULL, napi_default, NULL },
    { "clearLodGroup", NULL, lod_group_clear, NULL, NULL, NULL, napi_default, NULL },
    { "copyLodLevels", NULL, lod_group_copy_levels, NULL, NULL, NULL, napi_default, NULL },
    { "selectLodIndex", NULL, lod_group_select_index, NULL, NULL, NULL, napi_default, NULL },
    { "getLodHysteresis", NULL, lod_group_get_hysteresis, NULL, NULL, NULL, napi_default, NULL },
    { "setLodHysteresis", NULL, lod_group_set_hysteresis, NULL, NULL, NULL, napi_default, NULL },
    { "resetLodHysteresis", NULL, lod_group_reset_hysteresis, NULL, NULL, NULL, napi_default, NULL },
    { "getLodSelectionMode", NULL, lod_group_get_selection_mode, NULL, NULL, NULL, napi_default, NULL },
    { "setLodSelectionMode", NULL, lod_group_set_selection_mode, NULL, NULL, NULL, napi_default, NULL },
    { "setLodScreenSpaceParameters", NULL, lod_group_set_screen_space_parameters, NULL, NULL, NULL, napi_default, NULL },
    { "getLodProjectedRadiusPixels", NULL, lod_group_projected_radius_pixels, NULL, NULL, NULL, napi_default, NULL },
    { "destroyClusteredShadowPolicy", NULL, clustered_shadow_policy_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "supportsGraphicsCapability", NULL, graphics_device_supports_capability, NULL, NULL, NULL, napi_default, NULL },
    { "createStandaloneGraphicsDevice", NULL, create_standalone_graphics_device, NULL, NULL, NULL, napi_default, NULL },
    { "destroyStandaloneGraphicsDevice", NULL, destroy_standalone_graphics_device, NULL, NULL, NULL, napi_default, NULL },
    { "getMaxComputeWorkGroupCount", NULL, get_max_compute_work_group_count, NULL, NULL, NULL, napi_default, NULL },
    { "getMaxComputeWorkGroupSize", NULL, get_max_compute_work_group_size, NULL, NULL, NULL, napi_default, NULL },
    { "getMaxComputeWorkGroupInvocations", NULL, get_max_compute_work_group_invocations, NULL, NULL, NULL, napi_default, NULL },
    { "createStorageBuffer", NULL, storage_buffer_create, NULL, NULL, NULL, napi_default, NULL },
    { "createTypedStorageBuffer", NULL, storage_buffer_create_typed, NULL, NULL, NULL, napi_default, NULL },
    { "setStorageBufferBytes", NULL, storage_buffer_set_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageBufferBytes", NULL, storage_buffer_get_bytes, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageBufferByteSize", NULL, storage_buffer_get_byte_size, NULL, NULL, NULL, napi_default, NULL },
    { "setStorageBufferElements", NULL, storage_buffer_set_elements, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageBufferElements", NULL, storage_buffer_get_elements, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageBufferElementCount", NULL, storage_buffer_get_element_count, NULL, NULL, NULL, napi_default, NULL },
    { "getStorageBufferElementByteSize", NULL, storage_buffer_get_element_byte_size, NULL, NULL, NULL, napi_default, NULL },
    { "destroyStorageBuffer", NULL, storage_buffer_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "createComputeShader", NULL, compute_shader_create, NULL, NULL, NULL, napi_default, NULL },
    { "setComputeShaderUniformInt", NULL, compute_shader_set_uniform_int, NULL, NULL, NULL, napi_default, NULL },
    { "setComputeShaderUniformFloat", NULL, compute_shader_set_uniform_float, NULL, NULL, NULL, napi_default, NULL },
    { "bindComputeStorageBuffer", NULL, compute_shader_bind_storage_buffer, NULL, NULL, NULL, napi_default, NULL },
    { "bindComputeTexture", NULL, compute_shader_bind_texture, NULL, NULL, NULL, napi_default, NULL },
    { "isComputeImageBindingSupported", NULL, compute_shader_is_image_binding_supported, NULL, NULL, NULL, napi_default, NULL },
    { "bindComputeImage", NULL, compute_shader_bind_image, NULL, NULL, NULL, napi_default, NULL },
    { "dispatchComputeShader", NULL, compute_shader_dispatch, NULL, NULL, NULL, napi_default, NULL },
    { "computeShaderBarrier", NULL, compute_shader_barrier, NULL, NULL, NULL, napi_default, NULL },
    { "isComputeShaderValid", NULL, compute_shader_is_valid, NULL, NULL, NULL, napi_default, NULL },
    { "getComputeShaderCompileError", NULL, compute_shader_copy_compile_error, NULL, NULL, NULL, napi_default, NULL },
    { "destroyComputeShader", NULL, compute_shader_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "createGpuTimer", NULL, gpu_timer_create, NULL, NULL, NULL, napi_default, NULL },
    { "isGpuTimerSupported", NULL, gpu_timer_is_supported, NULL, NULL, NULL, napi_default, NULL },
    { "getGpuTimerUnsupportedReason", NULL, gpu_timer_copy_unsupported_reason, NULL, NULL, NULL, napi_default, NULL },
    { "beginGpuTimer", NULL, gpu_timer_begin, NULL, NULL, NULL, napi_default, NULL },
    { "endGpuTimer", NULL, gpu_timer_end, NULL, NULL, NULL, napi_default, NULL },
    { "isGpuTimerResultAvailable", NULL, gpu_timer_is_result_available, NULL, NULL, NULL, napi_default, NULL },
    { "pollGpuTimer", NULL, gpu_timer_poll, NULL, NULL, NULL, napi_default, NULL },
    { "getGpuTimerLastMilliseconds", NULL, gpu_timer_get_last_milliseconds, NULL, NULL, NULL, napi_default, NULL },
    { "getGpuTimerSampleCount", NULL, gpu_timer_get_sample_count, NULL, NULL, NULL, napi_default, NULL },
    { "isGpuTimerOpen", NULL, gpu_timer_is_open, NULL, NULL, NULL, napi_default, NULL },
    { "destroyGpuTimer", NULL, gpu_timer_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "getVideoPlayerFrame", NULL, get_video_player_frame, NULL, NULL, NULL, napi_default, NULL },
    { "isDeviceExtensionLayerAvailable", NULL, devices_ext_available, NULL, NULL, NULL, napi_default, NULL },
    { "getHostDeviceInfo", NULL, get_host_device_info, NULL, NULL, NULL, napi_default, NULL },
    { "getPreferredLocales", NULL, get_preferred_locales, NULL, NULL, NULL, napi_default, NULL },
    { "setClipboardText", NULL, set_clipboard_text, NULL, NULL, NULL, napi_default, NULL },
    { "getCameras", NULL, get_cameras, NULL, NULL, NULL, napi_default, NULL },
    { "createCamera", NULL, camera_create, NULL, NULL, NULL, napi_default, NULL },
    { "createTestCamera", NULL, camera_create_with_test_backend, NULL, NULL, NULL, napi_default, NULL },
    { "getCameraState", NULL, camera_get_state, NULL, NULL, NULL, napi_default, NULL },
    { "getCameraFrameWidth", NULL, camera_get_frame_width, NULL, NULL, NULL, napi_default, NULL },
    { "getCameraFrameHeight", NULL, camera_get_frame_height, NULL, NULL, NULL, napi_default, NULL },
    { "tryAcquireCameraFrame", NULL, camera_try_acquire_frame, NULL, NULL, NULL, napi_default, NULL },
    { "setTestCameraState", NULL, camera_set_test_state, NULL, NULL, NULL, napi_default, NULL },
    { "setTestCameraFrame", NULL, camera_set_test_frame, NULL, NULL, NULL, napi_default, NULL },
    { "destroyCamera", NULL, camera_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "initializeGamerServices", NULL, initialize_gamer_services, NULL, NULL, NULL, napi_default, NULL },
    { "getGamerServicesIsInitialized", NULL, gamer_services_is_initialized, NULL, NULL, NULL, napi_default, NULL },
    { "updateGamerServices", NULL, update_gamer_services, NULL, NULL, NULL, napi_default, NULL },
    { "getGamerServicesWindowHandle", NULL, get_gamer_services_window_handle, NULL, NULL, NULL, napi_default, NULL },
    { "setGamerServicesWindowHandle", NULL, set_gamer_services_window_handle, NULL, NULL, NULL, napi_default, NULL },
    { "getGuideIsVisible", NULL, guide_is_visible, NULL, NULL, NULL, napi_default, NULL },
    { "guideBeginShowMessageBox", NULL, guide_begin_show_message_box, NULL, NULL, NULL, napi_default, NULL },
    { "guideEndShowMessageBox", NULL, guide_end_show_message_box, NULL, NULL, NULL, napi_default, NULL },
    { "guideHasPendingMessageBox", NULL, guide_has_pending_message_box, NULL, NULL, NULL, napi_default, NULL },
    { "guidePendingMessageBoxFocusButton", NULL, guide_pending_message_box_focus_button, NULL, NULL, NULL, napi_default, NULL },
    { "guideSimulateMessageBoxClick", NULL, guide_simulate_message_box_click, NULL, NULL, NULL, napi_default, NULL },
    { "guideBeginShowKeyboardInput", NULL, guide_begin_show_keyboard_input, NULL, NULL, NULL, napi_default, NULL },
    { "guideEndShowKeyboardInput", NULL, guide_end_show_keyboard_input, NULL, NULL, NULL, napi_default, NULL },
    { "guideHasPendingKeyboardInput", NULL, guide_has_pending_keyboard_input, NULL, NULL, NULL, napi_default, NULL },
    { "guideWasKeyboardInputCanceled", NULL, guide_was_keyboard_input_canceled, NULL, NULL, NULL, napi_default, NULL },
    { "guidePendingKeyboardInputTitle", NULL, guide_pending_keyboard_title, NULL, NULL, NULL, napi_default, NULL },
    { "guidePendingKeyboardInputDescription", NULL, guide_pending_keyboard_description, NULL, NULL, NULL, napi_default, NULL },
    { "guidePendingKeyboardInputDisplayText", NULL, guide_pending_keyboard_display_text, NULL, NULL, NULL, napi_default, NULL },
    { "guideSimulateKeyboardInputCancel", NULL, guide_simulate_keyboard_input_cancel, NULL, NULL, NULL, napi_default, NULL },
    { "guideResetPendingKeyboardInput", NULL, guide_reset_pending_keyboard_input, NULL, NULL, NULL, napi_default, NULL },
    { "getGuideIsTrialMode", NULL, guide_is_trial_mode, NULL, NULL, NULL, napi_default, NULL },
    { "getGuideSimulateTrialMode", NULL, guide_get_simulate_trial, NULL, NULL, NULL, napi_default, NULL },
    { "setGuideSimulateTrialMode", NULL, guide_set_simulate_trial, NULL, NULL, NULL, napi_default, NULL },
    { "getGuideIsScreenSaverEnabled", NULL, guide_get_screen_saver, NULL, NULL, NULL, napi_default, NULL },
    { "setGuideIsScreenSaverEnabled", NULL, guide_set_screen_saver, NULL, NULL, NULL, napi_default, NULL },
    { "getGuideNotificationPosition", NULL, guide_get_notification_position, NULL, NULL, NULL, napi_default, NULL },
    { "setGuideNotificationPosition", NULL, guide_set_notification_position, NULL, NULL, NULL, napi_default, NULL },
    { "getSensorSupport", NULL, get_sensor_support, NULL, NULL, NULL, napi_default, NULL },
    { "createAccelerometer", NULL, create_accelerometer, NULL, NULL, NULL, napi_default, NULL },
    { "destroyAccelerometer", NULL, destroy_accelerometer, NULL, NULL, NULL, napi_default, NULL },
    { "startAccelerometer", NULL, start_accelerometer, NULL, NULL, NULL, napi_default, NULL },
    { "stopAccelerometer", NULL, stop_accelerometer, NULL, NULL, NULL, napi_default, NULL },
    { "getAccelerometerState", NULL, get_accelerometer_state, NULL, NULL, NULL, napi_default, NULL },
    { "setAccelerometerInterval", NULL, set_accelerometer_interval, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterCount", NULL, adapter_count, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdaptersRefresh", NULL, adapters_refresh, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterInfo", NULL, adapter_info, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterDescription", NULL, adapter_description, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterDeviceName", NULL, adapter_device_name, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterCurrentDisplayMode", NULL, adapter_current_display_mode, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterDisplayModes", NULL, adapter_display_modes, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterIsProfileSupported", NULL, adapter_is_profile_supported, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterQueryBackBufferFormat", NULL, adapter_query_backbuffer, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterQueryRenderTargetFormat", NULL, adapter_query_render_target, NULL, NULL, NULL, napi_default, NULL },
    { "graphicsAdapterSetDevicePreferences", NULL, adapter_set_device_preferences, NULL, NULL, NULL, napi_default, NULL },
    { "compassIsSupported", NULL, compass_is_supported, NULL, NULL, NULL, napi_default, NULL },
    { "compassCreate", NULL, compass_create, NULL, NULL, NULL, napi_default, NULL },
    { "compassDestroy", NULL, compass_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "compassStart", NULL, compass_start, NULL, NULL, NULL, napi_default, NULL },
    { "compassStop", NULL, compass_stop, NULL, NULL, NULL, napi_default, NULL },
    { "compassDispose", NULL, compass_dispose, NULL, NULL, NULL, napi_default, NULL },
    { "compassGetState", NULL, compass_get_state, NULL, NULL, NULL, napi_default, NULL },
    { "compassIsDataValid", NULL, compass_is_data_valid, NULL, NULL, NULL, napi_default, NULL },
    { "compassGetReading", NULL, compass_get_reading, NULL, NULL, NULL, napi_default, NULL },
    { "compassGetInterval", NULL, compass_get_interval, NULL, NULL, NULL, napi_default, NULL },
    { "compassSetInterval", NULL, compass_set_interval, NULL, NULL, NULL, napi_default, NULL },
    { "compassInject", NULL, compass_inject, NULL, NULL, NULL, napi_default, NULL },
    { "compassSetTestBackend", NULL, compass_set_test_backend, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeIsSupported", NULL, gyroscope_is_supported, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeCreate", NULL, gyroscope_create, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeDestroy", NULL, gyroscope_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeStart", NULL, gyroscope_start, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeStop", NULL, gyroscope_stop, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeDispose", NULL, gyroscope_dispose, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeGetState", NULL, gyroscope_get_state, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeIsDataValid", NULL, gyroscope_is_data_valid, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeGetReading", NULL, gyroscope_get_reading, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeGetInterval", NULL, gyroscope_get_interval, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeSetInterval", NULL, gyroscope_set_interval, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeInject", NULL, gyroscope_inject, NULL, NULL, NULL, napi_default, NULL },
    { "gyroscopeSetSupported", NULL, gyroscope_set_supported, NULL, NULL, NULL, napi_default, NULL },
    { "motionIsSupported", NULL, motion_is_supported, NULL, NULL, NULL, napi_default, NULL },
    { "motionCreate", NULL, motion_create, NULL, NULL, NULL, napi_default, NULL },
    { "motionDestroy", NULL, motion_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "motionStart", NULL, motion_start, NULL, NULL, NULL, napi_default, NULL },
    { "motionStop", NULL, motion_stop, NULL, NULL, NULL, napi_default, NULL },
    { "motionDispose", NULL, motion_dispose, NULL, NULL, NULL, napi_default, NULL },
    { "motionGetState", NULL, motion_get_state, NULL, NULL, NULL, napi_default, NULL },
    { "motionIsDataValid", NULL, motion_is_data_valid, NULL, NULL, NULL, napi_default, NULL },
    { "motionIsNorthReferenced", NULL, motion_is_north_referenced, NULL, NULL, NULL, napi_default, NULL },
    { "motionGetReading", NULL, motion_get_reading, NULL, NULL, NULL, napi_default, NULL },
    { "motionGetInterval", NULL, motion_get_interval, NULL, NULL, NULL, napi_default, NULL },
    { "motionSetInterval", NULL, motion_set_interval, NULL, NULL, NULL, napi_default, NULL },
    { "motionInject", NULL, motion_inject, NULL, NULL, NULL, napi_default, NULL },
    { "motionSetTestBackend", NULL, motion_set_test_backend, NULL, NULL, NULL, napi_default, NULL },
    { "getAccelerometerReading", NULL, get_accelerometer_reading, NULL, NULL, NULL, napi_default, NULL },
    { "openStorageFile", NULL, open_storage_file, NULL, NULL, NULL, napi_default, NULL },
  };
  if (napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties) != napi_ok) {
    return throw_napi(env, "module initialization");
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
