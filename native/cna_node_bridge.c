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
typedef CNA_Result (*SpriteBatchCreateFn)(CNA_Handle, CNA_Handle*);
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
  GameHandleFn texture_destroy;
  SpriteBatchCreateFn sprite_batch_create;
  GameHandleFn sprite_batch_destroy;
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
  return throw_message(env, message);
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
  LOAD_REQUIRED(texture_destroy, GameHandleFn, "cna_texture2d_destroy");
  LOAD_REQUIRED(sprite_batch_create, SpriteBatchCreateFn, "cna_sprite_batch_create");
  LOAD_REQUIRED(sprite_batch_destroy, GameHandleFn, "cna_sprite_batch_destroy");
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
    { "destroyTexture2D", NULL, destroy_texture, NULL, NULL, NULL, napi_default, NULL },
    { "createSpriteBatch", NULL, create_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
    { "destroySpriteBatch", NULL, destroy_sprite_batch, NULL, NULL, NULL, napi_default, NULL },
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
