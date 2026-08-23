// SPDX-License-Identifier: MS-PL
// Minimal Node-API adapter for the CNA C ABI 0.7 runtime slice used by cna-ts.

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

typedef struct Api {
  GetAbiVersionFn get_abi_version;
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
  IndexBufferGetFn index_buffer_get;
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
} Api;

typedef struct GameContext {
  napi_env env;
  napi_ref callbacks;
  napi_ref exception;
  CNA_Handle handle;
  struct GameContext* next;
} GameContext;

static LibraryHandle g_library;
static Api g_api;
static uint32_t g_imported_symbols;
static GameContext* g_games;

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

#define LOAD_REQUIRED(field, type, symbol) \
  do { \
    void* address = LOAD_ADDRESS(g_library, symbol); \
    if (!address) { \
      char message[256]; \
      snprintf(message, sizeof(message), "CNA ABI 0.7 library is missing required symbol %s", symbol); \
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
  LOAD_REQUIRED(error_get_last_message_size, ErrorGetLastMessageSizeFn, "cna_error_get_last_message_size");
  LOAD_REQUIRED(error_copy_last_message, ErrorCopyLastMessageFn, "cna_error_copy_last_message");
  if (g_api.get_abi_version() != CNA_ABI_VERSION) {
    return throw_message(env, "CNA library ABI is not exactly 0.7.0 (encoded 0x00000700)");
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
  LOAD_REQUIRED(index_buffer_get, IndexBufferGetFn, "cna_index_buffer_get_data");
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

static napi_value destroy_game(napi_env env, napi_callback_info info) {
  if (!require_loaded(env)) return NULL;
  napi_value args[1];
  CNA_Handle handle;
  if (!get_args(env, info, 1, args) || !read_handle(env, args[0], &handle)) return NULL;
  GameContext* context = find_game(handle);
  CNA_Result result = g_api.game_destroy(handle);
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

static napi_value initialize(napi_env env, napi_value exports) {
  const napi_property_descriptor properties[] = {
    { "loadLibrary", NULL, load_library, NULL, NULL, NULL, napi_default, NULL },
    { "abiVersion", NULL, abi_version, NULL, NULL, NULL, napi_default, NULL },
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
  };
  if (napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties) != napi_ok) {
    return throw_napi(env, "module initialization");
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
