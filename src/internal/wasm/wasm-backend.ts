/**
 * The WebAssembly backend: the same private boundary the Node adapter implements, over the
 * `cna_c_api` Emscripten module.
 *
 * Nothing above this file knows which backend is loaded. `Game`, `GraphicsDeviceManager`,
 * `Texture2D`, `SpriteBatch` and the input snapshots are the identical public XNA objects in a
 * browser and in Node; what differs is only which object answers `getBackend()`.
 *
 * This is the first vertical slice, and it says so: every boundary member it does not implement
 * refuses by name through {@link CnaBackendBase} rather than pretending to work.
 */

import { CNA_ABI_MAJOR, CNA_ABI_MINOR, decodeAbiVersion, describeAbiWindow, isSupportedAbiVersion } from "../abi.js";
import { CnaBackendBase } from "../backend-base.js";
import { CnaResult } from "../cna-results.js";
import type {
  BackendRendererInfo,
  CnaAudioBackend,
  CnaContentBackend,
  CnaGraphicsBackend,
  CnaRuntimeServicesBackend,
  PlatformSnapshot,
  RendererFallbackSnapshot,
  RendererIdentitySnapshot,
  RendererSelectionSnapshot,
  CnaGameCallbacks,
  CnaEffectBackend,
  CnaGameConfiguration,
  CnaGameTimeSnapshot,
  GraphicsManagerConfiguration,
  SpriteBatchCommand,
  Texture2DInfo,
  Texture2DTransfer,
  VertexElementSnapshot,
} from "../backend.js";
import { NativeUnavailableError } from "../native-error.js";
import type { NativeHandle, NativeResourceLifetime } from "../ownership.js";
import { fromCnaGamePadType } from "../cna-enums.js";
import { ButtonState, type GamePadDeadZone, type Keys } from "../../Microsoft/Xna/Framework/Input/Enums.js";
import {
  createGamePadCapabilities,
  createGamePadState,
  type GamePadCapabilities,
  type GamePadState,
} from "../../Microsoft/Xna/Framework/Input/GamePadValues.js";
import { KeyboardState } from "../../Microsoft/Xna/Framework/Input/KeyboardState.js";
import { MouseState } from "../../Microsoft/Xna/Framework/Input/MouseState.js";
import {
  createTouchCollection,
  type TouchCollection,
} from "../../Microsoft/Xna/Framework/Input/Touch/TouchCollection.js";
import type { GestureType } from "../../Microsoft/Xna/Framework/Input/Touch/Enums.js";
import { TouchLocationState } from "../../Microsoft/Xna/Framework/Input/Touch/Enums.js";
import {
  createTouchPanelCapabilities,
  GestureSample,
  TouchLocation,
  type TouchPanelCapabilities,
} from "../../Microsoft/Xna/Framework/Input/Touch/TouchValues.js";
import { TimeSpan } from "../../Microsoft/Xna/Framework/TimeSpan.js";
import { Vector2 } from "../../Microsoft/Xna/Framework/Vector2.js";
import type { PlayerIndex } from "../../Microsoft/Xna/Framework/PlayerIndex.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import {
  allocateStruct,
  readUtf8,
  WasmCnaError,
  WasmRouteTable,
  WasmScope,
  WasmStruct,
  type CnaWasmModule,
} from "./module.js";
import { WasmAudioBackend } from "./audio.js";
import { WasmContentBackend } from "./content.js";
import { WasmGraphicsBackend } from "./graphics.js";
import { WasmEffectBackend } from "./effects.js";

const CNA_RESULT_SUCCESS = CnaResult.Success;
const CNA_RESULT_INVALID_STATE = CnaResult.InvalidState;
const MOUSE_BUTTON_LEFT = 1 << 0;
const MOUSE_BUTTON_MIDDLE = 1 << 1;
const MOUSE_BUTTON_RIGHT = 1 << 2;
const MOUSE_BUTTON_X1 = 1 << 3;
const MOUSE_BUTTON_X2 = 1 << 4;

/** The CNA routes this slice reaches. Every one is resolved when the backend is constructed. */
const ROUTES = [
  "cna_get_abi_version",
  // --- 3D geometry: what a browser game needs to draw something that is not a sprite -----------
  "cna_vertex_declaration_create_with_stride",
  "cna_vertex_declaration_destroy",
  "cna_vertex_buffer_create",
  "cna_vertex_buffer_set_data_raw",
  "cna_vertex_buffer_set_data",
  "cna_vertex_buffer_get_data_raw",
  "cna_vertex_buffer_destroy",
  "cna_index_buffer_create",
  "cna_index_buffer_set_data",
  "cna_index_buffer_set_data_at",
  "cna_index_buffer_get_data",
  "cna_index_buffer_destroy",
  "cna_graphics_device_set_vertex_buffers",
  "cna_graphics_device_set_index_buffer",
  "cna_graphics_device_set_rasterizer_state",
  "cna_graphics_device_set_depth_stencil_state",
  "cna_graphics_device_draw_primitives",
  "cna_graphics_device_draw_indexed_primitives",
  // The buffer-free draw: geometry handed over per call, which is what an effect is exercised
  // through when the shader rather than a resource is the subject.
  "cna_graphics_device_draw_user_primitives",
  "cna_vertex_declaration_create_with_stride",
  "cna_vertex_declaration_destroy",
  "cna_basic_effect_create",
  // A compiled `.fxb`. Whether the artifact has the runtime behind it is the artifact's answer to
  // give, and it cannot give it unless the route is resolved -- see `WasmEffectBackend`.
  "cna_effect_create_compiled",
  "cna_basic_effect_set_vertex_color_enabled",
  "cna_effect_matrices_set_world",
  "cna_effect_matrices_set_view",
  "cna_effect_matrices_set_projection",
  "cna_effect_apply",
  "cna_effect_get_current_technique",
  "cna_effect_get_techniques",
  "cna_effect_technique_collection_get_count",
  "cna_effect_technique_collection_get_at",
  "cna_effect_technique_collection_destroy",
  "cna_effect_technique_get_name_byte_count",
  "cna_effect_technique_copy_name",
  "cna_effect_technique_get_index_ext",
  "cna_effect_technique_get_passes",
  "cna_effect_technique_destroy",
  "cna_effect_pass_collection_get_count",
  "cna_effect_pass_collection_get_at",
  "cna_effect_pass_collection_destroy",
  "cna_effect_pass_get_name_byte_count",
  "cna_effect_pass_copy_name",
  "cna_effect_pass_destroy",
  "cna_effect_pass_apply",
  "cna_effect_pass_get_annotations",
  "cna_effect_technique_get_annotations",
  "cna_effect_set_current_technique",
  // The reflection a compiled effect declares. A stock effect answers zero parameters through
  // exactly these routes, so nothing here is speculative for the BasicEffect half of the slice --
  // what it adds is that the zero is CNA's answer rather than this backend's assumption.
  "cna_effect_get_parameters",
  "cna_effect_parameter_collection_get_count",
  "cna_effect_parameter_collection_get_at",
  "cna_effect_parameter_collection_destroy",
  "cna_effect_parameter_destroy",
  "cna_effect_parameter_get_info",
  "cna_effect_parameter_get_name_byte_count",
  "cna_effect_parameter_copy_name",
  "cna_effect_parameter_get_semantic_byte_count",
  "cna_effect_parameter_copy_semantic",
  "cna_effect_parameter_get_elements",
  "cna_effect_parameter_get_structure_members",
  "cna_effect_parameter_get_annotations",
  "cna_effect_parameter_get_value",
  "cna_effect_parameter_set_value",
  "cna_effect_parameter_get_values",
  "cna_effect_parameter_set_values",
  "cna_effect_parameter_set_value_texture",
  "cna_effect_parameter_set_value_string",
  "cna_effect_annotation_collection_get_count",
  "cna_effect_annotation_collection_get_at",
  "cna_effect_annotation_collection_destroy",
  "cna_effect_annotation_destroy",
  "cna_effect_annotation_get_info",
  "cna_effect_annotation_get_name_byte_count",
  "cna_effect_annotation_copy_name",
  "cna_effect_annotation_get_value_boolean",
  "cna_effect_annotation_get_value_int32",
  "cna_effect_annotation_get_value_single",
  "cna_effect_annotation_get_value_string_byte_count",
  "cna_effect_annotation_copy_value_string",
  "cna_effect_annotation_get_value_vector2",
  "cna_effect_annotation_get_value_vector3",
  "cna_effect_annotation_get_value_vector4",
  "cna_effect_annotation_get_value_matrix",
  "cna_basic_effect_set_alpha",
  "cna_basic_effect_set_diffuse_color",
  "cna_basic_effect_set_emissive_color",
  "cna_basic_effect_set_specular_color",
  "cna_basic_effect_set_specular_power",
  "cna_basic_effect_set_prefer_per_pixel_lighting",
  "cna_basic_effect_set_texture",
  "cna_basic_effect_set_texture_enabled",
  "cna_effect_fog_set_color",
  "cna_effect_fog_set_enabled",
  "cna_effect_fog_set_start",
  "cna_effect_fog_set_end",
  "cna_effect_lights_set_ambient_color",
  "cna_effect_lights_set_enabled",
  "cna_effect_lights_get_directional_light",
  "cna_directional_light_set_direction",
  "cna_directional_light_set_diffuse_color",
  "cna_directional_light_set_specular_color",
  "cna_directional_light_set_enabled",
  "cna_directional_light_destroy",
  "cna_effect_destroy",
  // --- avatar descriptions: pure computation, and it answers here ------------------------------
  "cna_avatar_description_create",
  "cna_avatar_description_create_random",
  "cna_avatar_description_get_info",
  "cna_avatar_description_copy_description",
  "cna_avatar_description_destroy",
  "cna_error_get_last_message_size",
  "cna_error_copy_last_message",
  "cna_game_create",
  "cna_game_set_frame_hooks_ext",
  "cna_game_run_one_frame",
  "cna_game_request_exit",
  "cna_game_destroy",
  "cna_graphics_device_manager_create",
  "cna_graphics_device_manager_set_graphics_profile",
  "cna_graphics_device_manager_set_is_full_screen",
  "cna_graphics_device_manager_set_prefer_multi_sampling",
  "cna_graphics_device_manager_set_preferred_back_buffer_format",
  "cna_graphics_device_manager_set_preferred_back_buffer_width",
  "cna_graphics_device_manager_set_preferred_back_buffer_height",
  "cna_graphics_device_manager_set_preferred_depth_stencil_format",
  "cna_graphics_device_manager_set_synchronize_with_vertical_retrace",
  "cna_graphics_device_manager_set_supported_orientations",
  "cna_graphics_device_manager_apply_changes",
  "cna_graphics_device_manager_create_device",
  "cna_graphics_device_manager_begin_draw",
  "cna_graphics_device_manager_end_draw",
  "cna_graphics_device_manager_destroy",
  "cna_graphics_device_manager_get_graphics_device",
  "cna_graphics_device_clear_rgba",
  "cna_graphics_device_present",
  "cna_graphics_device_get_renderer_info",
  "cna_graphics_device_get_renderer_name_size",
  "cna_graphics_device_copy_renderer_name",
  "cna_texture2d_create",
  "cna_texture2d_get_info",
  "cna_texture2d_create_from_encoded_memory",
  "cna_texture2d_set_data",
  "cna_texture2d_get_data",
  "cna_texture2d_destroy",
  "cna_sprite_batch_create",
  "cna_sprite_batch_begin",
  "cna_sprite_batch_submit_scaled_many",
  "cna_sprite_batch_end",
  "cna_sprite_batch_destroy",
  "cna_keyboard_get_state",
  "cna_mouse_get_state",
  "cna_gamepad_get_capabilities",
  "cna_gamepad_get_state_with_dead_zone",
  "cna_gamepad_set_vibration",
  "cna_touch_get_capabilities",
  "cna_touch_get_state",
  "cna_touch_panel_get_window_handle",
  "cna_touch_panel_set_window_handle",
  "cna_touch_panel_get_is_gesture_available",
  "cna_touch_panel_read_gesture",
  "cna_platform_get_current",
  "cna_platform_get_is_apple_ext",
  "cna_platform_get_is_mobile_ext",
  "cna_platform_get_current_name_size_ext",
  "cna_platform_copy_current_name_ext",
  "cna_desktop_os_get_current",
  "cna_graphics_backend_get_category",
  "cna_graphics_backend_category_get_name_size",
  "cna_graphics_backend_category_copy_name",
  "cna_graphics_backend_get_maturity",
  "cna_graphics_backend_maturity_get_name_size",
  "cna_graphics_backend_maturity_copy_name",
  "cna_graphics_renderer_set_preferred_ext",
  "cna_graphics_renderer_set_preferred_by_name_ext",
  "cna_graphics_renderer_get_selected_ext",
  "cna_graphics_renderer_get_active_ext",
  "cna_graphics_renderer_get_is_latched_ext",
  "cna_graphics_renderer_get_available_count_ext",
  "cna_graphics_renderer_copy_available_ext",
  "cna_graphics_renderer_get_is_available_ext",
  "cna_graphics_renderer_set_fallback_chain_ext",
  "cna_graphics_renderer_set_automatic_fallback_ext",
  "cna_graphics_renderer_get_automatic_fallback_ext",
  "cna_graphics_renderer_get_fallback_count_ext",
  "cna_graphics_renderer_get_fallback_at_ext",
  "cna_graphics_renderer_fallback_get_message_size_ext",
  "cna_graphics_renderer_fallback_copy_message_ext",
  "cna_graphics_renderer_fallback_reason_get_name_size_ext",
  "cna_graphics_renderer_fallback_reason_copy_name_ext",
  "cna_graphics_renderer_try_parse_name_ext",
  "cna_graphics_renderer_get_current_type",
  "cna_graphics_renderer_get_current_name_size",
  "cna_graphics_renderer_copy_current_name",
  "cna_logger_get_minimum_level",
  "cna_logger_set_minimum_level",
  "cna_logger_log",
  "cna_graphics_ext_is_available",
  "cna_title_container_read_ext",
  "cna_render_target2d_create",
  "cna_render_target_cube_create",
  "cna_render_target_get_info",
  "cna_render_target_destroy",
  "cna_graphics_device_set_render_targets",
  "cna_sound_effect_create_pcm16_range_ext",
  "cna_sound_effect_get_duration_ticks",
  "cna_sound_effect_get_name_size",
  "cna_sound_effect_copy_name",
  "cna_sound_effect_set_name",
  "cna_sound_effect_create_instance",
  "cna_sound_effect_play_with_settings",
  "cna_sound_effect_destroy",
  "cna_sound_effect_get_master_volume",
  "cna_sound_effect_set_master_volume",
  "cna_sound_effect_instance_play",
  "cna_sound_effect_instance_pause",
  "cna_sound_effect_instance_resume",
  "cna_sound_effect_instance_stop",
  "cna_sound_effect_instance_get_info",
  "cna_sound_effect_instance_set_volume",
  "cna_sound_effect_instance_set_pitch",
  "cna_sound_effect_instance_set_pan",
  "cna_sound_effect_instance_set_is_looped",
  "cna_sound_effect_instance_destroy",
  "cna_cnb_has_magic",
  "cna_cnb_copy_format_magic",
  "cna_cnb_crc32c",
  "cna_cnb_is_compression_supported",
  "cna_cnb_get_compression_name_size",
  "cna_cnb_copy_compression_name",
  "cna_cnb_get_asset_type_name_size",
  "cna_cnb_copy_asset_type_name",
  "cna_cnb_asset_type_id_from_name",
  "cna_cnb_is_custom_asset_type_id",
  "cna_cnb_make_chunk_id",
  "cna_cnb_get_chunk_id_string_size",
  "cna_cnb_copy_chunk_id_string",
  "cna_cnb_is_well_formed_chunk_id",
  "cna_cnb_get_texture_format_name_size",
  "cna_cnb_copy_texture_format_name",
  "cna_cnb_is_block_compressed_texture_format",
  "cna_cnb_get_texture_format_unit_bytes",
  "cna_cnb_get_texture_level_byte_size",
  "cna_cnb_texture_format_to_surface_format",
  "cna_cnb_document_parse",
  "cna_cnb_document_destroy",
  "cna_cnb_document_get_origin_size",
  "cna_cnb_document_copy_origin",
  "cna_cnb_document_get_container_major",
  "cna_cnb_document_get_container_minor",
  "cna_cnb_document_get_asset_type_id",
  "cna_cnb_document_get_asset_schema_version",
  "cna_cnb_document_get_chunk_count",
  "cna_cnb_document_get_chunk",
  "cna_cnb_document_copy_chunk_data",
  "cna_cnb_document_find_all",
  "cna_cnb_document_require_mandatory_chunks_understood",
  "cna_cnb_document_get_metadata",
  "cna_cnb_document_get_metadata_asset_type_name_size",
  "cna_cnb_document_copy_metadata_asset_type_name",
  "cna_cnb_document_get_metadata_content_name_size",
  "cna_cnb_document_copy_metadata_content_name",
  "cna_cnb_document_get_external_reference_count",
  "cna_cnb_document_get_external_reference",
  "cna_cnb_document_get_external_reference_name_size",
  "cna_cnb_document_copy_external_reference_name",
  "cna_cnb_decode_texture2d",
  "cna_cnb_texture_data_destroy",
  "cna_cnb_texture_data_get_info",
  "cna_cnb_texture_data_get_level_dimensions",
  "cna_cnb_texture_data_get_representation_format",
  "cna_cnb_texture_data_get_level_count",
  "cna_cnb_texture_data_copy_level",
  "cna_cnb_texture_data_create",
  "cna_cnb_texture_data_create_rgba8",
  "cna_cnb_texture_data_add_representation",
  "cna_cnb_texture_data_set_level",
  "cna_cnb_encode_texture2d",
  "cna_cnb_byte_writer_create",
  "cna_cnb_byte_writer_create_from_bytes",
  "cna_cnb_byte_writer_destroy",
  "cna_cnb_byte_writer_write_u8",
  "cna_cnb_byte_writer_write_u16",
  "cna_cnb_byte_writer_write_u32",
  "cna_cnb_byte_writer_write_u64",
  "cna_cnb_byte_writer_write_i32",
  "cna_cnb_byte_writer_write_f32",
  "cna_cnb_byte_writer_write_f64",
  "cna_cnb_byte_writer_write_string",
  "cna_cnb_byte_writer_write_bytes",
  "cna_cnb_byte_writer_write_zeros",
  "cna_cnb_byte_writer_get_size",
  "cna_cnb_byte_writer_copy_bytes",
  "cna_cnb_byte_writer_take",
  "cna_cnb_read_limits_init",
  "cna_cnb_writer_create",
  "cna_cnb_writer_destroy",
  "cna_cnb_writer_set_metadata",
  "cna_cnb_writer_add_external_reference",
  "cna_cnb_writer_clear_external_references",
  "cna_cnb_writer_add_chunk",
  "cna_cnb_writer_get_schema_chunk_count",
  "cna_cnb_writer_set_compression",
  "cna_cnb_writer_set_limits",
  "cna_cnb_writer_get_limits",
  "cna_cnb_writer_build",
  "cna_cnb_writer_append_embedded_texture2d",
  "cna_cnb_decode_sprite_font",
  "cna_cnb_sprite_font_data_create",
  "cna_cnb_sprite_font_data_destroy",
  "cna_cnb_sprite_font_data_get_info",
  "cna_cnb_sprite_font_data_set_info",
  "cna_cnb_sprite_font_data_get_glyph",
  "cna_cnb_sprite_font_data_add_glyph",
  "cna_cnb_sprite_font_data_set_atlas",
  "cna_cnb_sprite_font_data_copy_atlas",
  "cna_cnb_encode_sprite_font",
  "cna_curve_create",
  "cna_curve_destroy",
  "cna_curve_get_keys",
  "cna_curve_get_pre_loop",
  "cna_curve_set_pre_loop",
  "cna_curve_get_post_loop",
  "cna_curve_set_post_loop",
  "cna_curve_get_is_constant",
  "cna_curve_key_collection_destroy",
  "cna_curve_key_collection_get_count",
  "cna_curve_key_collection_get",
  "cna_curve_key_collection_add",
  "cna_curve_key_init_full",
  "cna_cnb_encode_curve",
  "cna_cnb_decode_curve",
  "cna_cnb_encode_animation_clip",
  "cna_cnb_decode_animation_clip",
  "cna_cnb_animation_clip_destroy",
  "cna_cnb_animation_clip_get",
  "cna_cnb_animation_clip_get_track",
  "cna_cnb_animation_clip_copy_keyframes",
  "cna_cnb_sound_effect_data_create",
  "cna_cnb_sound_effect_data_destroy",
  "cna_cnb_sound_effect_data_get_info",
  "cna_cnb_sound_effect_data_copy_samples",
  "cna_cnb_encode_sound_effect",
  "cna_cnb_decode_sound_effect",
  "cna_cnb_decode_wav_as_sound_effect",
  "cna_cnb_encode_song",
  "cna_cnb_decode_song_duration_milliseconds",
  "cna_cnb_decode_song_name_size",
  "cna_cnb_decode_song_name",
  "cna_cnb_decode_song_stream_reference_size",
  "cna_cnb_decode_song_stream_reference",
  "cna_cnb_encode_video",
  "cna_cnb_decode_video",
  "cna_cnb_decode_video_stream_reference_size",
  "cna_cnb_decode_video_stream_reference",
  "cna_cnb_model_create",
  "cna_cnb_model_destroy",
  "cna_cnb_model_set_flags",
  "cna_cnb_model_get_info",
  "cna_cnb_model_add_bone",
  "cna_cnb_model_get_bone",
  "cna_cnb_model_copy_bone_name",
  "cna_cnb_model_add_part",
  "cna_cnb_model_get_part",
  "cna_cnb_model_copy_part_name",
  "cna_cnb_model_copy_part_external_effect",
  "cna_cnb_model_set_part_vertex_bytes",
  "cna_cnb_model_copy_part_vertex_bytes",
  "cna_cnb_model_set_part_index_bytes",
  "cna_cnb_model_copy_part_index_bytes",
  "cna_cnb_model_get_material",
  "cna_cnb_model_set_material",
  "cna_cnb_model_copy_material_texture",
  "cna_cnb_model_set_material_texture",
  "cna_cnb_model_add_mesh",
  "cna_cnb_model_get_mesh",
  "cna_cnb_model_copy_mesh_name",
  "cna_cnb_model_copy_mesh_part_indices",
  "cna_cnb_model_set_skeleton",
  "cna_cnb_model_get_skeleton",
  "cna_cnb_model_copy_skeleton_hierarchy",
  "cna_cnb_model_copy_skeleton_matrices",
  "cna_cnb_model_add_light",
  "cna_cnb_model_get_light",
  "cna_cnb_encode_model",
  "cna_cnb_decode_model",
] as const;

type RouteName = (typeof ROUTES)[number];

interface GameCallbackState {
  readonly callbacks: CnaGameCallbacks;
  readonly functionPointers: number[];
  readonly scope: WasmScope;
  pendingError: unknown;
}

export class WasmBackend extends CnaBackendBase implements CnaRuntimeServicesBackend {
  public readonly Kind = "wasm" as const;
  public readonly IsAvailable = true;
  public readonly AbiVersion: string;
  public readonly Detail: string;
  public readonly ImportedSymbolCount = ROUTES.length;
  /** Reported once the graphics device exists, matching the Node adapter's status shape. */
  public RendererInfo: BackendRendererInfo | null = null;
  public readonly RuntimeServices: CnaRuntimeServicesBackend = this;
  /**
   * The graphics boundary is a separate interface, so it is a separate object: everything it does
   * not reach refuses through the generated `CnaGraphicsBackendBase` by its own member name rather
   * than through this class's message about a different boundary.
   */
  public readonly Graphics: CnaGraphicsBackend;
  public readonly Effects: CnaEffectBackend;
  /** Sound effects, so a browser game can make a noise. */
  public readonly Audio: CnaAudioBackend;
  /**
   * CNB, so a page can load CNA's own compiled content. The public API above this line is
   * backend-neutral, so a browser gets the same `CnbDocument` and `CreateTexture2DFromCnb` a Node
   * consumer gets rather than a browser-shaped variant of them.
   */
  public readonly Content: CnaContentBackend;

  readonly #module: CnaWasmModule;
  readonly #routes: WasmRouteTable;
  #game: GameCallbackState | null = null;
  #activeGame: NativeHandle | null = null;
  #gameLifetime: NativeResourceLifetime | null = null;

  public constructor(module: CnaWasmModule) {
    super();
    this.#module = module;
    this.#routes = new WasmRouteTable(module, ROUTES);
    this.Graphics = new WasmGraphicsBackend(this.#routes);
    this.Effects = new WasmEffectBackend(this.#routes);
    this.Audio = new WasmAudioBackend(
      this.#routes, () => this.#requireGame(), () => this.#requireGameLifetime(),
    );
    this.Content = new WasmContentBackend(this.#routes);
    const version = decodeAbiVersion(Number(this.#call("cna_get_abi_version")));
    if (!isSupportedAbiVersion(version)) {
      throw new NativeUnavailableError(
        `the CNA WebAssembly module reports ABI ${version.Text}, which is outside the ` +
        `${describeAbiWindow()} window this package targets`,
      );
    }
    this.AbiVersion = version.Text;
    this.Detail =
      `CNA ABI ${version.Text} loaded from a WebAssembly module (${ROUTES.length} routes, ` +
      `targeting ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR})`;
  }

  protected override unsupported(member: string): never {
    throw new NativeUnavailableError(
      `${member} is not part of the CNA-TS WebAssembly backend's first vertical slice; ` +
      "the Node-API backend implements it",
    );
  }

  #call(name: RouteName, ...args: readonly (number | bigint)[]): number {
    return this.#routes.call(name, ...args);
  }

  #check(name: RouteName, result: number): void {
    if (result === CnaResult.Success) return;
    throw new WasmCnaError(name, result, this.getLastError());
  }

  #invoke(name: RouteName, ...args: readonly (number | bigint)[]): void {
    this.#routes.invoke(name, ...args);
  }

  public override initialize(): Promise<void> { return Promise.resolve(); }

  public override getLastError(): string | null { return this.#routes.lastError(); }

  #gameTime(pointer: number): CnaGameTimeSnapshot {
    if (pointer === 0) {
      return { TotalGameTimeTicks: 0n, ElapsedGameTimeTicks: 0n, IsRunningSlowly: false };
    }
    const time = new WasmStruct(this.#module, "CNA_GameTime", pointer);
    return {
      TotalGameTimeTicks: time.getI64("total_game_time_ticks"),
      ElapsedGameTimeTicks: time.getI64("elapsed_game_time_ticks"),
      IsRunningSlowly: time.getU8("is_running_slowly") !== 0,
    };
  }

  /**
   * Wraps a JavaScript lifecycle callback as a C function pointer. A JavaScript exception must
   * never unwind into compiled C: the failure is held and rethrown at the frame boundary, and the
   * callback answers `CNA_RESULT_CALLBACK` so CNA stops the frame the way its contract says.
   */
  #lifecycleCallback(state: GameCallbackState, handler: (time: CnaGameTimeSnapshot) => void): number {
    const pointer = this.#module.addFunction(
      ((_game: bigint, timePointer: number, _context: number, _error: number): number => {
        try {
          handler(this.#gameTime(timePointer));
          return CNA_RESULT_SUCCESS;
        } catch (error) {
          state.pendingError ??= error;
          return 9;
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_GameLifecycleCallback,
    );
    state.functionPointers.push(pointer);
    return pointer;
  }

  #beginDrawCallback(state: GameCallbackState, handler: () => boolean): number {
    const pointer = this.#module.addFunction(
      ((_game: bigint, _time: number, _context: number, shouldDraw: number, _error: number): number => {
        try {
          this.#module.HEAPU8[shouldDraw] = handler() ? 1 : 0;
          return CNA_RESULT_SUCCESS;
        } catch (error) {
          state.pendingError ??= error;
          return 9;
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_GameBeginDrawCallback,
    );
    state.functionPointers.push(pointer);
    return pointer;
  }

  #rethrowPendingCallbackError(): void {
    const state = this.#game;
    if (!state?.pendingError) return;
    const error = state.pendingError;
    state.pendingError = null;
    throw error;
  }

  public override createGame(
    callbacks: CnaGameCallbacks, configuration: CnaGameConfiguration,
  ): NativeHandle {
    if (this.#game) throw new NativeUnavailableError("a CNA WebAssembly game is already active");
    if (configuration.TargetElapsedTimeTicks <= 0n) {
      throw new RangeError("target elapsed ticks must be positive");
    }
    // The callback tables and the create info outlive the call: CNA keeps the game callbacks for
    // the game's whole lifetime, so this scope is released by destroyGame rather than here.
    const scope = new WasmScope(this.#module);
    const state: GameCallbackState = { callbacks, functionPointers: [], scope, pendingError: null };
    try {
      const table = allocateStruct(this.#module, scope, "CNA_GameCallbacks");
      table.setPointer("load_content", this.#lifecycleCallback(state, () => callbacks.loadContent()));
      table.setPointer("update", this.#lifecycleCallback(state, (time) => callbacks.update(time)));
      table.setPointer("draw", this.#lifecycleCallback(state, (time) => callbacks.draw(time)));
      table.setPointer("unload_content", this.#lifecycleCallback(state, () => callbacks.unloadContent()));
      table.setPointer("exiting", this.#lifecycleCallback(state, () => callbacks.exiting()));

      const title = scope.allocateUtf8("CNA");
      const createInfo = allocateStruct(this.#module, scope, "CNA_GameCreateInfo");
      createInfo.setU8("is_fixed_time_step", configuration.IsFixedTimeStep ? 1 : 0);
      createInfo.setI64("target_elapsed_time_ticks", configuration.TargetElapsedTimeTicks);
      createInfo.nested("window_title", "CNA_StringView")
        .setPointer("data", title.pointer)
        .setU64("byte_length", BigInt(title.byteLength));
      createInfo.setPointer("callbacks", table.pointer);

      const out = scope.allocate(8);
      this.#invoke("cna_game_create", createInfo.pointer, out);
      const handle = new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigUint64(out, true);

      const hooks = allocateStruct(this.#module, scope, "CNA_GameFrameHooks");
      hooks.setPointer("initialize", this.#lifecycleCallback(state, () => callbacks.initialize()));
      hooks.setPointer("begin_run", this.#lifecycleCallback(state, () => callbacks.beginRun()));
      hooks.setPointer("end_run", this.#lifecycleCallback(state, () => callbacks.endRun()));
      hooks.setPointer("begin_draw", this.#beginDrawCallback(state, () => callbacks.beginDraw()));
      hooks.setPointer("end_draw", this.#lifecycleCallback(state, () => callbacks.endDraw()));
      const hookResult = this.#call("cna_game_set_frame_hooks_ext", handle, hooks.pointer);
      if (hookResult !== CNA_RESULT_SUCCESS) {
        this.#call("cna_game_destroy", handle);
        throw new WasmCnaError("cna_game_set_frame_hooks_ext", hookResult, this.getLastError());
      }
      this.#game = state;
      this.#activeGame = handle;
      return handle;
    } catch (error) {
      for (const pointer of state.functionPointers) this.#module.removeFunction(pointer);
      scope.dispose();
      throw error;
    }
  }

  public override runGame(game: NativeHandle): Promise<void> {
    // A browser owns its event loop, so a blocking Run has no honest implementation here. The
    // frame pump belongs to the caller; `Game.Run` on this backend is a documented refusal rather
    // than a loop that never yields.
    void game;
    return Promise.reject(new NativeUnavailableError(
      "the CNA WebAssembly backend has no blocking Run: a browser owns the event loop, so drive " +
      "Game.RunOneFrame from requestAnimationFrame instead",
    ));
  }

  public override runGameOneFrame(game: NativeHandle): void {
    const result = this.#call("cna_game_run_one_frame", game);
    this.#rethrowPendingCallbackError();
    this.#check("cna_game_run_one_frame", result);
  }

  public override exitGame(game: NativeHandle): void {
    this.#invoke("cna_game_request_exit", game);
  }

  public override destroyGame(game: NativeHandle): void {
    const result = this.#call("cna_game_destroy", game);
    const state = this.#game;
    this.#game = null;
    this.#activeGame = null;
    if (state) {
      for (const pointer of state.functionPointers) this.#module.removeFunction(pointer);
      state.scope.dispose();
    }
    this.#check("cna_game_destroy", result);
  }

  public override updateFrameworkDispatcher(): void {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("FrameworkDispatcher.Update requires an active native Game");
    }
  }

  public override createGraphicsDeviceManager(game: NativeHandle): NativeHandle {
    return this.#outHandle("cna_graphics_device_manager_create", game);
  }

  #outHandle(name: RouteName, ...args: readonly (number | bigint)[]): NativeHandle {
    return this.#routes.outHandle(name, ...args);
  }

  public override configureGraphicsDeviceManager(
    manager: NativeHandle, configuration: GraphicsManagerConfiguration,
  ): void {
    this.#invoke("cna_graphics_device_manager_set_graphics_profile", manager, configuration.GraphicsProfile);
    this.#invoke("cna_graphics_device_manager_set_is_full_screen", manager, configuration.IsFullScreen ? 1 : 0);
    this.#invoke("cna_graphics_device_manager_set_prefer_multi_sampling", manager, configuration.PreferMultiSampling ? 1 : 0);
    this.#invoke("cna_graphics_device_manager_set_preferred_back_buffer_format", manager, configuration.PreferredBackBufferFormat);
    this.#invoke("cna_graphics_device_manager_set_preferred_back_buffer_width", manager, configuration.PreferredBackBufferWidth);
    this.#invoke("cna_graphics_device_manager_set_preferred_back_buffer_height", manager, configuration.PreferredBackBufferHeight);
    this.#invoke("cna_graphics_device_manager_set_preferred_depth_stencil_format", manager, configuration.PreferredDepthStencilFormat);
    this.#invoke("cna_graphics_device_manager_set_synchronize_with_vertical_retrace", manager, configuration.SynchronizeWithVerticalRetrace ? 1 : 0);
    this.#invoke("cna_graphics_device_manager_set_supported_orientations", manager, configuration.SupportedOrientations);
  }

  public override applyGraphicsDeviceManagerChanges(manager: NativeHandle): void {
    this.#invoke("cna_graphics_device_manager_apply_changes", manager);
  }

  public override createManagedGraphicsDevice(manager: NativeHandle): void {
    this.#invoke("cna_graphics_device_manager_create_device", manager);
  }

  public override beginGraphicsDeviceManagerDraw(manager: NativeHandle): boolean {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(1);
      this.#invoke("cna_graphics_device_manager_begin_draw", manager, out);
      return this.#module.HEAPU8[out] !== 0;
    } finally {
      scope.dispose();
    }
  }

  public override endGraphicsDeviceManagerDraw(manager: NativeHandle): void {
    this.#invoke("cna_graphics_device_manager_end_draw", manager);
  }

  public override destroyGraphicsDeviceManager(manager: NativeHandle): void {
    this.#invoke("cna_graphics_device_manager_destroy", manager);
  }

  public override borrowGraphicsDevice(manager: NativeHandle): NativeHandle {
    const device = this.#outHandle("cna_graphics_device_manager_get_graphics_device", manager);
    this.RendererInfo ??= Object.freeze(this.getRendererInfo(device));
    return device;
  }

  public override clearGraphicsDevice(device: NativeHandle, packedColor: number): void {
    const red = ((packedColor >>> 0) & 0xff) / 255;
    const green = ((packedColor >>> 8) & 0xff) / 255;
    const blue = ((packedColor >>> 16) & 0xff) / 255;
    const alpha = ((packedColor >>> 24) & 0xff) / 255;
    this.#invoke("cna_graphics_device_clear_rgba", device, red, green, blue, alpha);
  }

  public override presentGraphicsDevice(device: NativeHandle): void {
    this.#invoke("cna_graphics_device_present", device);
  }

  public override getRendererInfo(device: NativeHandle): BackendRendererInfo {
    const scope = new WasmScope(this.#module);
    try {
      const info = allocateStruct(this.#module, scope, "CNA_RendererInfo");
      this.#invoke("cna_graphics_device_get_renderer_info", device, info.pointer);
      const byteLength = Number(info.getU64("renderer_name_byte_length"));
      let name = "";
      if (byteLength > 0) {
        const buffer = scope.allocate(byteLength);
        const written = scope.allocate(8);
        this.#invoke("cna_graphics_device_copy_renderer_name", device, buffer, BigInt(byteLength), written);
        const count = Number(new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigUint64(written, true));
        name = readUtf8(this.#module, buffer, count);
      }
      return {
        Name: name,
        RendererType: info.getU32("renderer_type"),
        CapabilityFlags: BigInt(info.getU32("capability_flags")),
        MaxTextureDimension: info.getU32("max_texture_dimension"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override createTexture2D(
    device: NativeHandle, width: number, height: number, mipMap: boolean, surfaceFormat: number,
  ): NativeHandle {
    const scope = new WasmScope(this.#module);
    try {
      const info = allocateStruct(this.#module, scope, "CNA_Texture2DCreateInfo");
      info.setU32("width", width).setU32("height", height)
        .setU8("mip_map", mipMap ? 1 : 0).setU32("format", surfaceFormat);
      return this.#outHandle("cna_texture2d_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getTexture2DInfo(texture: NativeHandle): Texture2DInfo {
    const scope = new WasmScope(this.#module);
    try {
      const info = allocateStruct(this.#module, scope, "CNA_Texture2DInfo");
      this.#invoke("cna_texture2d_get_info", texture, info.pointer);
      return {
        Width: info.getU32("width"),
        Height: info.getU32("height"),
        LevelCount: info.getU32("level_count"),
        Format: info.getU32("format"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override createTexture2DFromEncodedMemory(
    device: NativeHandle,
    encoded: Uint8Array,
    decode: { readonly Width: number; readonly Height: number; readonly Zoom: boolean } | null,
  ): NativeHandle {
    const scope = new WasmScope(this.#module);
    try {
      const bytes = scope.allocateBytes(encoded);
      let decodePointer = 0;
      if (decode) {
        const info = allocateStruct(this.#module, scope, "CNA_Texture2DDecodeInfo");
        info.setU32("width", decode.Width).setU32("height", decode.Height)
          .setU8("zoom", decode.Zoom ? 1 : 0);
        decodePointer = info.pointer;
      }
      return this.#outHandle(
        "cna_texture2d_create_from_encoded_memory",
        device, bytes, BigInt(encoded.byteLength), decodePointer,
      );
    } finally {
      scope.dispose();
    }
  }

  #transfer(scope: WasmScope, transfer: Texture2DTransfer): WasmStruct {
    const structure = allocateStruct(this.#module, scope, "CNA_Texture2DTransfer");
    structure.setI32("level", transfer.Level);
    structure.setU8("has_rectangle", transfer.Rectangle ? 1 : 0);
    if (transfer.Rectangle) {
      structure.nested("rectangle", "CNA_Rectangle")
        .setI32("x", transfer.Rectangle.X).setI32("y", transfer.Rectangle.Y)
        .setI32("width", transfer.Rectangle.Width).setI32("height", transfer.Rectangle.Height);
    }
    structure.setU64("start_index", BigInt(transfer.StartIndex));
    structure.setU64("element_count", BigInt(transfer.ElementCount));
    return structure;
  }

  public override setTexture2DData(
    texture: NativeHandle, transfer: Texture2DTransfer, bytes: Uint8Array,
  ): void {
    const scope = new WasmScope(this.#module);
    try {
      const descriptor = this.#transfer(scope, transfer);
      const data = scope.allocateBytes(bytes);
      this.#invoke(
        "cna_texture2d_set_data",
        texture, transfer.DataType, descriptor.pointer, data, BigInt(transfer.Capacity),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getTexture2DData(texture: NativeHandle, transfer: Texture2DTransfer): Uint8Array {
    const scope = new WasmScope(this.#module);
    try {
      const descriptor = this.#transfer(scope, transfer);
      const byteCount = transfer.ElementCount * transfer.ElementSize;
      const destination = scope.allocate(Math.max(byteCount, 1));
      const written = scope.allocate(8);
      this.#invoke(
        "cna_texture2d_get_data",
        texture, transfer.DataType, descriptor.pointer, destination,
        BigInt(transfer.Capacity), written,
      );
      return new Uint8Array(this.#module.HEAPU8.subarray(destination, destination + byteCount));
    } finally {
      scope.dispose();
    }
  }

  public override destroyTexture2D(texture: NativeHandle): void {
    this.#invoke("cna_texture2d_destroy", texture);
  }

  public override createSpriteBatch(device: NativeHandle): NativeHandle {
    return this.#outHandle("cna_sprite_batch_create", device);
  }

  public override beginSpriteBatch(spriteBatch: NativeHandle, sortMode: number): void {
    const scope = new WasmScope(this.#module);
    try {
      const info = allocateStruct(this.#module, scope, "CNA_SpriteBatchBeginInfo");
      info.setU32("sort_mode", sortMode);
      this.#invoke("cna_sprite_batch_begin", spriteBatch, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override submitSpriteBatch(
    spriteBatch: NativeHandle, commands: readonly SpriteBatchCommand[],
  ): void {
    if (commands.length === 0) return;
    const scope = new WasmScope(this.#module);
    try {
      // The array stride is the measured wasm32 structure size, not a number written here: a
      // by-hand stride is exactly how a binding writes every command but the first into the wrong
      // place and sees CNA_RESULT_INVALID_ARGUMENT with nothing visibly wrong.
      const stride = WASM_STRUCT_LAYOUTS.CNA_SpriteScaledCommand.size;
      const base = scope.allocate(stride * commands.length);
      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index] as SpriteBatchCommand;
        const entry = new WasmStruct(this.#module, "CNA_SpriteScaledCommand", base + index * stride);
        entry.setU32("struct_size", stride).setU32("struct_version", 1);
        entry.setU64("texture", command.Texture);
        entry.nested("position", "CNA_Vector2").setF32("x", command.PositionX).setF32("y", command.PositionY);
        entry.nested("source", "CNA_Rectangle")
          .setI32("x", command.SourceX).setI32("y", command.SourceY)
          .setI32("width", command.SourceWidth).setI32("height", command.SourceHeight);
        entry.nested("color", "CNA_Color")
          .setU8("r", command.ColorR).setU8("g", command.ColorG)
          .setU8("b", command.ColorB).setU8("a", command.ColorA);
        entry.setF32("rotation", command.Rotation);
        entry.nested("origin", "CNA_Vector2").setF32("x", command.OriginX).setF32("y", command.OriginY);
        entry.nested("scale", "CNA_Vector2").setF32("x", command.ScaleX).setF32("y", command.ScaleY);
        entry.setU32("effects", command.Effects);
        entry.setF32("layer_depth", command.LayerDepth);
      }
      this.#invoke("cna_sprite_batch_submit_scaled_many", spriteBatch, base, BigInt(commands.length));
    } finally {
      scope.dispose();
    }
  }

  public override endSpriteBatch(spriteBatch: NativeHandle): void {
    this.#invoke("cna_sprite_batch_end", spriteBatch);
  }

  public override destroySpriteBatch(spriteBatch: NativeHandle): void {
    this.#invoke("cna_sprite_batch_destroy", spriteBatch);
  }

  /* ---- 3D geometry -----------------------------------------------------------------------------
   *
   * The browser slice could draw sprites and read pixels back, and nothing else: no vertex buffer,
   * no index buffer, no effect, no indexed draw. So a browser consumer could not draw a triangle.
   * These add exactly that, and no more -- the engine layer above it is not in the artifact at all
   * (`CNA_CNAEXT` is off in the WebAssembly build, and every engine route answers NOT_SUPPORTED
   * there; measured, and recorded in docs/wasm-backend.md).
   */

  #writeVertexElements(scope: WasmScope, elements: readonly VertexElementSnapshot[]): number {
    const layout = WASM_STRUCT_LAYOUTS.CNA_VertexElement;
    const pointer = scope.allocate(Math.max(layout.size * elements.length, 1));
    elements.forEach((element, index) => {
      const entry = new WasmStruct(this.#module, "CNA_VertexElement", pointer + layout.size * index);
      entry.setI32("offset", element.Offset)
        .setU32("format", element.VertexElementFormat)
        .setU32("usage", element.VertexElementUsage)
        .setI32("usage_index", element.UsageIndex);
    });
    return pointer;
  }

  public override createVertexBuffer(
    device: NativeHandle, vertexStride: number, elements: readonly VertexElementSnapshot[],
    vertexCount: number, usage: number, dynamic: boolean,
  ): NativeHandle {
    const scope = new WasmScope(this.#module);
    try {
      const declaration = this.#outHandle(
        "cna_vertex_declaration_create_with_stride",
        vertexStride, this.#writeVertexElements(scope, elements), BigInt(elements.length),
      );
      try {
        const info = allocateStruct(this.#module, scope, "CNA_VertexBufferCreateInfo");
        info.setU64("vertex_declaration", declaration)
          .setI32("vertex_count", vertexCount)
          .setU32("buffer_usage", usage)
          .setU8("dynamic", dynamic ? 1 : 0);
        return this.#outHandle("cna_vertex_buffer_create", device, info.pointer);
      } finally {
        // The buffer copies the declaration during creation, so the caller's is released here
        // rather than leaked for the buffer's lifetime.
        this.#invoke("cna_vertex_declaration_destroy", declaration);
      }
    } finally {
      scope.dispose();
    }
  }

  public override setVertexBufferRaw(
    buffer: NativeHandle, bytes: Uint8Array, vertexCount: number, vertexStride: number,
  ): void {
    const scope = new WasmScope(this.#module);
    try {
      this.#invoke(
        "cna_vertex_buffer_set_data_raw", buffer, scope.allocateBytes(bytes),
        BigInt(bytes.byteLength), BigInt(vertexCount), vertexStride,
      );
    } finally {
      scope.dispose();
    }
  }

  public override getVertexBufferRaw(
    buffer: NativeHandle, vertexCount: number, vertexStride: number,
  ): Uint8Array {
    const scope = new WasmScope(this.#module);
    try {
      const byteCount = vertexCount * vertexStride;
      const destination = scope.allocate(Math.max(byteCount, 1));
      this.#invoke(
        "cna_vertex_buffer_get_data_raw", buffer, 0n, destination,
        BigInt(byteCount), BigInt(vertexCount), vertexStride,
      );
      return this.#module.HEAPU8.slice(destination, destination + byteCount);
    } finally {
      scope.dispose();
    }
  }

  public override destroyVertexBuffer(buffer: NativeHandle): void {
    this.#invoke("cna_vertex_buffer_destroy", buffer);
  }

  public override createIndexBuffer(
    device: NativeHandle, elementSize: number, indexCount: number, usage: number, dynamic: boolean,
  ): NativeHandle {
    const scope = new WasmScope(this.#module);
    try {
      const info = allocateStruct(this.#module, scope, "CNA_IndexBufferCreateInfo");
      info.setI32("index_count", indexCount)
        .setU32("index_element_size", elementSize)
        .setU32("buffer_usage", usage)
        .setU8("dynamic", dynamic ? 1 : 0);
      return this.#outHandle("cna_index_buffer_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  /*
   * An index buffer has no `_raw` transfer the way a vertex buffer does -- the only setter is the
   * typed one, which takes a CNA_IndexBufferTransfer describing the element width and the window.
   * Assuming the symmetry and calling a `cna_index_buffer_set_data_raw` that does not exist is how
   * this first failed, and the route table said so by name at load rather than mid-frame.
   */
  #indexTransfer(scope: WasmScope, elementSize: number, indexCount: number): number {
    const transfer = allocateStruct(this.#module, scope, "CNA_IndexBufferTransfer");
    transfer.setU32("index_element_size", elementSize)
      .setU32("options", 0)
      .setU64("start_index", 0n)
      .setU64("element_count", BigInt(indexCount));
    return transfer.pointer;
  }

  public override setIndexBufferRaw(
    buffer: NativeHandle, elementSize: number, bytes: Uint8Array,
  ): void {
    const scope = new WasmScope(this.#module);
    try {
      const width = elementSize === 0 ? 2 : 4;
      const indexCount = bytes.byteLength / width;
      this.#invoke(
        "cna_index_buffer_set_data", buffer, this.#indexTransfer(scope, elementSize, indexCount),
        scope.allocateBytes(bytes), BigInt(indexCount),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getIndexBufferRaw(
    buffer: NativeHandle, elementSize: number, indexCount: number,
  ): Uint8Array {
    const scope = new WasmScope(this.#module);
    try {
      const width = elementSize === 0 ? 2 : 4;
      const byteCount = indexCount * width;
      const destination = scope.allocate(Math.max(byteCount, 1));
      this.#invoke(
        "cna_index_buffer_get_data", buffer, this.#indexTransfer(scope, elementSize, indexCount),
        destination, BigInt(indexCount),
      );
      return this.#module.HEAPU8.slice(destination, destination + byteCount);
    } finally {
      scope.dispose();
    }
  }

  public override destroyIndexBuffer(buffer: NativeHandle): void {
    this.#invoke("cna_index_buffer_destroy", buffer);
  }


  /**
   * The running game's lifetime, which every audio resource is a child of.
   *
   * `Game` binds it when it creates the native game, so a game going away releases its sound
   * effects deterministically instead of leaving handles CNA will later refuse to let go of.
   */
  public bindGameLifetimeForInternalUse(lifetime: NativeResourceLifetime | null): void {
    this.#gameLifetime = lifetime;
  }

  #requireGameLifetime(): NativeResourceLifetime {
    if (this.#gameLifetime == null) {
      throw new NativeUnavailableError("CNA audio resources require an active native Game lifetime");
    }
    return this.#gameLifetime;
  }

  #requireGame(): NativeHandle {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("this operation requires an active native Game");
    }
    return this.#activeGame;
  }

  /**
   * Reads a whole title asset, which is what a browser consumer needs to reach `ContentManager`.
   *
   * `TitleContainer` has no stream handle in this ABI -- the route is a count/copy pair delivering
   * the complete file -- so the bytes are copied out of module memory and the allocation is
   * released before returning. Nothing above this line ever holds a pointer into the heap, which
   * `ALLOW_MEMORY_GROWTH` would invalidate on the next allocation anyway.
   *
   * Where the file comes from is the browser's business, not this backend's: the module's
   * filesystem is what CNA reads, so a page writes its assets into it (from `fetch`, from a bundle,
   * from `--preload-file`) and then loads them through the ordinary XNA API.
   */
  public openTitleStream(name: string): Uint8Array {
    const scope = new WasmScope(this.#module);
    try {
      // The name is a CNA_StringView passed by value, which Emscripten lowers to a pointer to the
      // structure in module memory -- the same convention the renderer-name routes pinned.
      const text = scope.allocateUtf8(name);
      const nameView = allocateStruct(this.#module, scope, "CNA_StringView", false);
      nameView.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      const sizePointer = scope.allocate(8);
      const view = () => new DataView(this.#module.HEAPU8.buffer as ArrayBuffer);
      // Capacity zero asks for the size; the route writes it before refusing for size, and a
      // missing file is CNA_RESULT_IO, which must surface rather than read as an empty asset.
      const probe = this.#call(
        "cna_title_container_read_ext",
        this.#requireGame(), nameView.pointer, 0, 0n, sizePointer,
      );
      if (probe !== CnaResult.Success && probe !== CnaResult.BufferTooSmall) {
        throw new WasmCnaError("cna_title_container_read_ext", probe, this.getLastError());
      }
      const byteLength = Number(view().getBigUint64(sizePointer, true));
      if (byteLength === 0) return new Uint8Array(0);
      const destination = scope.allocate(byteLength);
      this.#invoke(
        "cna_title_container_read_ext",
        this.#requireGame(), nameView.pointer, destination, BigInt(byteLength), sizePointer,
      );
      return new Uint8Array(this.#module.HEAPU8.subarray(destination, destination + byteLength));
    } finally {
      scope.dispose();
    }
  }

  public override getKeyboardState(playerIndex: PlayerIndex | null): KeyboardState {
    void playerIndex;
    const scope = new WasmScope(this.#module);
    try {
      const state = allocateStruct(this.#module, scope, "CNA_KeyboardState");
      this.#invoke("cna_keyboard_get_state", this.#requireGame(), state.pointer);
      const keys: Keys[] = [];
      for (let word = 0; word < 4; word += 1) {
        let bits = state.getU64Element("pressed_key_words", word);
        for (let bit = 0; bits !== 0n; bit += 1, bits >>= 1n) {
          if ((bits & 1n) === 1n) keys.push((word * 64 + bit) as Keys);
        }
      }
      return new KeyboardState(keys);
    } finally {
      scope.dispose();
    }
  }

  public override getMouseState(): MouseState {
    const scope = new WasmScope(this.#module);
    try {
      const state = allocateStruct(this.#module, scope, "CNA_MouseState");
      this.#invoke("cna_mouse_get_state", this.#requireGame(), state.pointer);
      const buttons = state.getU32("pressed_buttons");
      const pressed = (mask: number): ButtonState =>
        (buttons & mask) !== 0 ? ButtonState.Pressed : ButtonState.Released;
      return new MouseState(
        state.getI32("x"), state.getI32("y"), state.getI32("scroll_wheel"),
        pressed(MOUSE_BUTTON_LEFT), pressed(MOUSE_BUTTON_MIDDLE), pressed(MOUSE_BUTTON_RIGHT),
        pressed(MOUSE_BUTTON_X1), pressed(MOUSE_BUTTON_X2),
      );
    } finally {
      scope.dispose();
    }
  }

  /**
   * The same `GamePad.GetState` a Node consumer calls, over the same C route. In a browser SDL3's
   * Emscripten joystick driver is what stands behind it, and that reads the page's Gamepad API --
   * so a page with no controller attached gets `IsConnected === false` rather than an invented
   * device, and one with a controller gets its real buttons, sticks and triggers.
   *
   * Dead-zone processing is CNA's, not this backend's: the mode is passed through and the analog
   * values come back already transformed, which is what keeps the two backends' answers identical
   * for identical hardware.
   */
  public override getGamePadState(playerIndex: PlayerIndex, deadZoneMode: GamePadDeadZone): GamePadState {
    const scope = new WasmScope(this.#module);
    try {
      const state = allocateStruct(this.#module, scope, "CNA_GamePadState");
      this.#invoke(
        "cna_gamepad_get_state_with_dead_zone",
        this.#requireGame(), playerIndex, deadZoneMode, state.pointer,
      );
      const analog = state.nested("analog", "CNA_GamePadAnalogState");
      const left = analog.nested("left_thumb_stick", "CNA_Vector2");
      const right = analog.nested("right_thumb_stick", "CNA_Vector2");
      return createGamePadState({
        IsConnected: state.getU8("is_connected") !== 0,
        PacketNumber: state.getI32("packet_number"),
        PressedButtons: state.getU32("pressed_buttons"),
        LeftX: left.getF32("x"),
        LeftY: left.getF32("y"),
        RightX: right.getF32("x"),
        RightY: right.getF32("y"),
        LeftTrigger: analog.getF32("left_trigger"),
        RightTrigger: analog.getF32("right_trigger"),
      });
    } finally {
      scope.dispose();
    }
  }

  public override getGamePadCapabilities(playerIndex: PlayerIndex): GamePadCapabilities {
    const scope = new WasmScope(this.#module);
    try {
      const caps = allocateStruct(this.#module, scope, "CNA_GamePadCapabilities");
      this.#invoke("cna_gamepad_get_capabilities", this.#requireGame(), playerIndex, caps.pointer);
      const has = (field: string): boolean => caps.getU8(field) !== 0;
      return createGamePadCapabilities({
        IsConnected: has("is_connected"),
        // The one family whose numbering differs between XNA and the C ABI; the translation is
        // contract-declared in src/internal/cna-enums.ts and proved by a _Static_assert.
        GamePadType: fromCnaGamePadType(caps.getU32("gamepad_type")),
        HasAButton: has("has_a_button"),
        HasBButton: has("has_b_button"),
        HasXButton: has("has_x_button"),
        HasYButton: has("has_y_button"),
        HasBackButton: has("has_back_button"),
        HasStartButton: has("has_start_button"),
        HasBigButton: has("has_big_button"),
        HasDPadUpButton: has("has_dpad_up_button"),
        HasDPadDownButton: has("has_dpad_down_button"),
        HasDPadLeftButton: has("has_dpad_left_button"),
        HasDPadRightButton: has("has_dpad_right_button"),
        HasLeftShoulderButton: has("has_left_shoulder_button"),
        HasRightShoulderButton: has("has_right_shoulder_button"),
        HasLeftStickButton: has("has_left_stick_button"),
        HasRightStickButton: has("has_right_stick_button"),
        HasLeftXThumbStick: has("has_left_x_thumb_stick"),
        HasLeftYThumbStick: has("has_left_y_thumb_stick"),
        HasRightXThumbStick: has("has_right_x_thumb_stick"),
        HasRightYThumbStick: has("has_right_y_thumb_stick"),
        HasLeftTrigger: has("has_left_trigger"),
        HasRightTrigger: has("has_right_trigger"),
        HasLeftVibrationMotor: has("has_left_vibration_motor"),
        HasRightVibrationMotor: has("has_right_vibration_motor"),
        HasVoiceSupport: has("has_voice_support"),
      });
    } finally {
      scope.dispose();
    }
  }

  /**
   * Reports whether CNA accepted the vibration request, which is the most a caller can truthfully
   * be told: XNA's `SetVibration` returns a boolean and a browser's Gamepad API exposes haptics
   * only where the device and the user agent both provide them.
   */
  public override setGamePadVibration(
    playerIndex: PlayerIndex, leftMotor: number, rightMotor: number,
  ): boolean {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(1);
      this.#invoke(
        "cna_gamepad_set_vibration", this.#requireGame(), playerIndex, leftMotor, rightMotor, out,
      );
      return this.#module.HEAPU8[out] !== 0;
    } finally {
      scope.dispose();
    }
  }

  /**
   * `TouchPanel.GetState`, from the browser's own touch events by way of SDL3's Emscripten
   * platform. The collection is copied out of the module's memory into ordinary JavaScript objects
   * before this returns, so nothing a consumer holds points into a heap `ALLOW_MEMORY_GROWTH` can
   * move underneath it.
   */
  public override getTouchState(): TouchCollection {
    const scope = new WasmScope(this.#module);
    try {
      const state = allocateStruct(this.#module, scope, "CNA_TouchState");
      this.#invoke("cna_touch_get_state", this.#requireGame(), state.pointer);
      // The count is CNA's, but the array is fixed-capacity; clamping to the measured array rather
      // than trusting the count keeps a malformed answer from reading past the structure.
      const capacity = WASM_STRUCT_LAYOUTS.CNA_TouchState.fields.touches.size
        / WASM_STRUCT_LAYOUTS.CNA_TouchLocation.size;
      const count = Math.min(state.getU32("touch_count"), capacity);
      const touches: TouchLocation[] = [];
      for (let index = 0; index < count; index += 1) {
        const location = state.element("touches", index, "CNA_TouchLocation");
        const position = location.nested("position", "CNA_Vector2");
        const previous = location.nested("previous_position", "CNA_Vector2");
        touches.push(new TouchLocation(
          location.getI32("id"),
          location.getU32("state") as TouchLocationState,
          new Vector2(position.getF32("x"), position.getF32("y")),
          location.getU32("previous_state") as TouchLocationState,
          new Vector2(previous.getF32("x"), previous.getF32("y")),
        ));
      }
      return createTouchCollection(touches, state.getU8("is_connected") !== 0);
    } finally {
      scope.dispose();
    }
  }

  public override getTouchCapabilities(): TouchPanelCapabilities {
    const scope = new WasmScope(this.#module);
    try {
      const caps = allocateStruct(this.#module, scope, "CNA_TouchCapabilities");
      this.#invoke("cna_touch_get_capabilities", this.#requireGame(), caps.pointer);
      return createTouchPanelCapabilities({
        IsConnected: caps.getU8("is_connected") !== 0,
        MaximumTouchCount: caps.getU32("maximum_touch_count"),
      });
    } finally {
      scope.dispose();
    }
  }

  public override isGestureAvailable(): boolean {
    return this.#outBool("cna_touch_panel_get_is_gesture_available", this.#requireGame());
  }

  public override readGesture(): GestureSample {
    const scope = new WasmScope(this.#module);
    try {
      const sample = allocateStruct(this.#module, scope, "CNA_GestureSample");
      this.#invoke("cna_touch_panel_read_gesture", this.#requireGame(), sample.pointer);
      const vector = (field: string): Vector2 => {
        const value = sample.nested(field, "CNA_Vector2");
        return new Vector2(value.getF32("x"), value.getF32("y"));
      };
      return new GestureSample(
        sample.getU32("gesture_type") as GestureType,
        // Ticks stay a bigint the whole way: TimeSpan's are 100-nanosecond units and an i64 does
        // not survive a trip through Number.
        TimeSpan.FromTicks(sample.getI64("timestamp_ticks")),
        vector("position"), vector("position2"), vector("delta"), vector("delta2"),
      );
    } finally {
      scope.dispose();
    }
  }

  public override get touchWindowHandle(): bigint {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(8);
      this.#invoke("cna_touch_panel_get_window_handle", this.#requireGame(), out);
      return new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigInt64(out, true);
    } finally {
      scope.dispose();
    }
  }

  public override setTouchWindowHandle(value: bigint): void {
    this.#invoke("cna_touch_panel_set_window_handle", this.#requireGame(), value);
  }

  // ---- Process-wide CNA runtime services -------------------------------------------------------
  // Identical operations to the Node adapter's, over the same C routes. None takes a handle, so
  // they answer before a game exists and before a canvas is attached.

  #outU32(name: RouteName, ...args: readonly (number | bigint)[]): number {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(4);
      this.#invoke(name, ...args, out);
      return new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getUint32(out, true);
    } finally {
      scope.dispose();
    }
  }

  #outBool(name: RouteName, ...args: readonly (number | bigint)[]): boolean {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(1);
      this.#invoke(name, ...args, out);
      return this.#module.HEAPU8[out] !== 0;
    } finally {
      scope.dispose();
    }
  }

  #outU64(name: RouteName, ...args: readonly (number | bigint)[]): number {
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(8);
      this.#invoke(name, ...args, out);
      return Number(new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigUint64(out, true));
    } finally {
      scope.dispose();
    }
  }

  /** A copied CNA string carries no terminator, so its exact byte count is read first. */
  #copyText(
    sizeRoute: RouteName, copyRoute: RouteName, ...leading: readonly (number | bigint)[]
  ): string {
    const byteLength = this.#outU64(sizeRoute, ...leading);
    if (byteLength === 0) return "";
    const scope = new WasmScope(this.#module);
    try {
      const buffer = scope.allocate(byteLength);
      const written = scope.allocate(8);
      this.#invoke(copyRoute, ...leading, buffer, BigInt(byteLength), written);
      const count = Number(new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigUint64(written, true));
      return readUtf8(this.#module, buffer, count);
    } finally {
      scope.dispose();
    }
  }

  /** Runs a read that CNA answers only in some states, mapping its refusal to null. */
  #optional(read: () => number): number | null {
    try {
      return read();
    } catch (error) {
      if (error instanceof WasmCnaError && error.cnaResult === CNA_RESULT_INVALID_STATE) return null;
      throw error;
    }
  }

  public getPlatform(): PlatformSnapshot {
    return Object.freeze({
      Platform: this.#outU32("cna_platform_get_current"),
      Name: this.#copyText("cna_platform_get_current_name_size_ext", "cna_platform_copy_current_name_ext"),
      IsApple: this.#outBool("cna_platform_get_is_apple_ext"),
      IsMobile: this.#outBool("cna_platform_get_is_mobile_ext"),
      // Off a desktop there is no desktop operating system and CNA refuses the question.
      DesktopOperatingSystem: this.#optional(() => this.#outU32("cna_desktop_os_get_current")),
    });
  }

  public getRendererSelection(): RendererSelectionSnapshot {
    // Before any renderer has been created there is no active or current identity, and CNA says so
    // with CNA_RESULT_INVALID_STATE rather than inventing one. That is a state, not a failure.
    const current = this.#optional(() => this.#outU32("cna_graphics_renderer_get_current_type"));
    return Object.freeze({
      Selected: this.#outU32("cna_graphics_renderer_get_selected_ext"),
      Active: this.#optional(() => this.#outU32("cna_graphics_renderer_get_active_ext")),
      Current: current,
      CurrentName: current == null ? null : this.#copyText(
        "cna_graphics_renderer_get_current_name_size", "cna_graphics_renderer_copy_current_name",
      ),
      IsLatched: this.#outBool("cna_graphics_renderer_get_is_latched_ext"),
      AutomaticFallback: this.#outBool("cna_graphics_renderer_get_automatic_fallback_ext"),
    });
  }

  public getAvailableRendererTypes(): readonly number[] {
    const count = this.#outU64("cna_graphics_renderer_get_available_count_ext");
    if (count === 0) return Object.freeze([]);
    const scope = new WasmScope(this.#module);
    try {
      const buffer = scope.allocate(count * 4);
      const written = scope.allocate(8);
      this.#invoke("cna_graphics_renderer_copy_available_ext", buffer, BigInt(count), written);
      const view = new DataView(this.#module.HEAPU8.buffer as ArrayBuffer);
      const types: number[] = [];
      for (let index = 0; index < count; index += 1) types.push(view.getUint32(buffer + index * 4, true));
      return Object.freeze(types);
    } finally {
      scope.dispose();
    }
  }

  public isRendererAvailable(type: number): boolean {
    return this.#outBool("cna_graphics_renderer_get_is_available_ext", type);
  }

  public describeRenderer(type: number): RendererIdentitySnapshot {
    const category = this.#outU32("cna_graphics_backend_get_category", type);
    const maturity = this.#outU32("cna_graphics_backend_get_maturity", type);
    return Object.freeze({
      Type: type,
      Category: category,
      CategoryName: this.#copyText(
        "cna_graphics_backend_category_get_name_size", "cna_graphics_backend_category_copy_name", category,
      ),
      Maturity: maturity,
      MaturityName: this.#copyText(
        "cna_graphics_backend_maturity_get_name_size", "cna_graphics_backend_maturity_copy_name", maturity,
      ),
      IsAvailable: this.isRendererAvailable(type),
    });
  }

  public setPreferredRenderer(type: number): void {
    this.#invoke("cna_graphics_renderer_set_preferred_ext", type);
  }

  #withStringView<T>(value: string, body: (pointer: number, byteLength: number) => T): T {
    const scope = new WasmScope(this.#module);
    try {
      const text = scope.allocateUtf8(value);
      const view = allocateStruct(this.#module, scope, "CNA_StringView", false);
      view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      return body(view.pointer, text.byteLength);
    } finally {
      scope.dispose();
    }
  }

  public setPreferredRendererByName(name: string): void {
    // A CNA_StringView passed by value is not pinned for wasm32, so the routes that take one are
    // reached through their pointer form where the ABI offers a choice. This one does not, so the
    // structure is built in module memory and its address is handed over, which is how Emscripten
    // lowers a by-value aggregate argument.
    this.#withStringView(name, (pointer) => {
      this.#invoke("cna_graphics_renderer_set_preferred_by_name_ext", pointer);
    });
  }

  public tryParseRendererName(name: string): number | null {
    return this.#withStringView(name, (pointer) => {
      const scope = new WasmScope(this.#module);
      try {
        const type = scope.allocate(4);
        const recognized = scope.allocate(1);
        this.#invoke("cna_graphics_renderer_try_parse_name_ext", pointer, type, recognized);
        if (this.#module.HEAPU8[recognized] === 0) return null;
        return new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getUint32(type, true);
      } finally {
        scope.dispose();
      }
    });
  }

  public setRendererFallbackChain(types: readonly number[]): void {
    const scope = new WasmScope(this.#module);
    try {
      const buffer = scope.allocate(Math.max(types.length * 4, 1));
      const view = new DataView(this.#module.HEAPU8.buffer as ArrayBuffer);
      types.forEach((type, index) => view.setUint32(buffer + index * 4, type, true));
      this.#invoke("cna_graphics_renderer_set_fallback_chain_ext", buffer, BigInt(types.length));
    } finally {
      scope.dispose();
    }
  }

  public setAutomaticRendererFallback(enabled: boolean): void {
    this.#invoke("cna_graphics_renderer_set_automatic_fallback_ext", enabled ? 1 : 0);
  }

  public getRendererFallbacks(): readonly RendererFallbackSnapshot[] {
    const count = this.#outU64("cna_graphics_renderer_get_fallback_count_ext");
    const rows: RendererFallbackSnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      const scope = new WasmScope(this.#module);
      try {
        const record = allocateStruct(this.#module, scope, "CNA_GraphicsRendererFallbackRecord");
        this.#invoke("cna_graphics_renderer_get_fallback_at_ext", BigInt(index), record.pointer);
        const reason = record.getU32("reason");
        rows.push(Object.freeze({
          Type: record.getU32("type"),
          Reason: reason,
          ReasonName: this.#copyText(
            "cna_graphics_renderer_fallback_reason_get_name_size_ext",
            "cna_graphics_renderer_fallback_reason_copy_name_ext",
            reason,
          ),
          Message: this.#copyText(
            "cna_graphics_renderer_fallback_get_message_size_ext",
            "cna_graphics_renderer_fallback_copy_message_ext",
            BigInt(index),
          ),
        }));
      } finally {
        scope.dispose();
      }
    }
    return Object.freeze(rows);
  }

  public getMinimumLogLevel(): number { return this.#outU32("cna_logger_get_minimum_level"); }

  public setMinimumLogLevel(level: number): void {
    this.#invoke("cna_logger_set_minimum_level", level);
  }

  public writeLog(level: number, category: number, message: string): void {
    this.#withStringView(message, (pointer) => {
      this.#invoke("cna_logger_log", level, pointer, category, 0);
    });
  }

  public isGraphicsExtensionLayerAvailable(): boolean {
    return this.#outBool("cna_graphics_ext_is_available");
  }

}
