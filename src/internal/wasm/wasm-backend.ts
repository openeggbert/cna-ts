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
  CnaComputeBackend,
  CnaAtmosphereBackend,
  CnaClusteredLightingBackend,
  CnaDecalBackend,
  CnaDepthNormalPrepassBackend,
  CnaInstancedRendererBackend,
  CnaLightProbeBackend,
  CnaNativeMeshPartBackend,
  CnaLodBackend,
  CnaParticleBackend,
  CnaShadowBackend,
  CnaGraphicsExtensionBackend,
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
import { WasmComputeBackend } from "./compute.js";
import { WasmGraphicsExtensionBackend } from "./graphics-ext.js";
import { WasmLodBackend } from "./lod.js";
import { WasmAtmosphereBackend } from "./atmosphere.js";
import { WasmClusteredLightingBackend } from "./clustered.js";
import { WasmDecalBackend } from "./decals.js";
import {
  WasmInstancedRendererBackend, WasmNativeMeshPartBackend,
} from "./instancing.js";
import { WasmLightProbeBackend } from "./light-probes.js";
import { WasmParticleBackend } from "./particles.js";
import { WasmDepthNormalPrepassBackend } from "./prepass.js";
import { WasmShadowBackend } from "./shadows.js";

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
  "cna_graphics_device_draw_user_primitives",
  "cna_basic_effect_create",
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
  "cna_texture3d_get_info",
  "cna_texture3d_destroy",
  "cna_graphics_device_supports_capability",
  "cna_graphics_device_get_max_compute_work_group_count_ext",
  "cna_graphics_device_get_max_compute_work_group_size_ext",
  "cna_graphics_device_get_max_compute_work_group_invocations_ext",
  "cna_fullscreen_pass_create",
  "cna_fullscreen_pass_destroy",
  "cna_fullscreen_pass_draw",
  "cna_fullscreen_pass_draw_over_current_target",
  "cna_post_process_context_init",
  "cna_post_process_pass_apply",
  "cna_post_process_pass_copy_name",
  "cna_post_process_pass_is_supported",
  "cna_post_process_pass_destroy",
  "cna_lod_group_ext_create",
  "cna_lod_group_ext_destroy",
  "cna_lod_group_ext_add_level",
  "cna_lod_group_ext_clear",
  "cna_lod_group_ext_copy_levels",
  "cna_lod_group_ext_select_index",
  "cna_lod_group_ext_select",
  "cna_lod_group_ext_get_hysteresis",
  "cna_lod_group_ext_set_hysteresis",
  "cna_lod_group_ext_reset_hysteresis",
  "cna_lod_group_ext_get_selection_mode",
  "cna_lod_group_ext_set_selection_mode",
  "cna_lod_group_ext_set_screen_space_parameters",
  "cna_lod_group_ext_projected_radius_pixels",
  "cna_graphics_device_supports_shadow_sampling_ext",
  "cna_shadow_map_create",
  "cna_shadow_map_destroy",
  "cna_shadow_map_is_supported",
  "cna_shadow_map_get_size",
  "cna_shadow_map_get_quality",
  "cna_shadow_map_get_depth_bias",
  "cna_shadow_map_set_depth_bias",
  "cna_shadow_map_get_filter_radius",
  "cna_shadow_map_size_for_quality",
  "cna_shadow_map_filter_radius_for_quality",
  "cna_shadow_map_begin",
  "cna_shadow_map_end",
  "cna_shadow_map_apply_caster",
  "cna_shadow_map_get_shadow_texture",
  "cna_shadow_map_get_caster_effect",
  "cna_shadow_map_get_light_view_projection",
  "cna_shadow_map_compute_light_view",
  "cna_shadow_map_compute_light_projection",
  "cna_instanced_renderer_ext_copy_instance_elements",
  "cna_instanced_renderer_ext_get_instance_stride",
  "cna_instanced_renderer_ext_copy_tint_elements",
  "cna_instanced_renderer_ext_get_tint_stride",
  "cna_post_process_chain_create",
  "cna_post_process_chain_destroy",
  "cna_post_process_chain_add_pass",
  "cna_post_process_chain_clear",
  "cna_post_process_chain_get_pass_count",
  "cna_post_process_chain_apply",
  "cna_post_process_chain_reset_targets",
  "cna_post_process_chain_is_gpu_timing_enabled",
  "cna_post_process_chain_set_gpu_timing_enabled",
  "cna_post_process_chain_get_pass_timing_count",
  "cna_post_process_chain_get_pass_timing",
  "cna_post_process_chain_copy_pass_timing_name",
  "cna_blit_pass_create",
  "cna_tonemap_pass_create",
  "cna_tonemap_pass_get_mode",
  "cna_tonemap_pass_set_mode",
  "cna_tonemap_pass_get_exposure",
  "cna_tonemap_pass_set_exposure",
  "cna_tonemap_pass_get_gamma",
  "cna_tonemap_pass_set_gamma",
  "cna_tonemap_pass_is_deband_enabled",
  "cna_tonemap_pass_set_deband_enabled",
  "cna_tonemap_pass_get_deband_strength",
  "cna_tonemap_pass_set_deband_strength",
  "cna_tonemap_pass_tonemap_channel",
  "cna_bloom_pass_extract_channel",
  "cna_bloom_pass_create",
  "cna_bloom_pass_get_threshold",
  "cna_bloom_pass_set_threshold",
  "cna_bloom_pass_get_intensity",
  "cna_bloom_pass_set_intensity",
  "cna_bloom_pass_get_iterations",
  "cna_bloom_pass_set_iterations",
  "cna_bloom_pass_reset_targets",
  "cna_bloom_pass_iterations_for_quality",
  "cna_fxaa_pass_create",
  "cna_fxaa_pass_get_edge_threshold",
  "cna_fxaa_pass_set_edge_threshold",
  "cna_fxaa_pass_edge_threshold_for_quality",
  "cna_fxaa_pass_copy_fragment_glsl",
  "cna_chromatic_aberration_pass_create",
  "cna_chromatic_aberration_pass_get_strength",
  "cna_chromatic_aberration_pass_set_strength",
  "cna_film_grain_pass_create",
  "cna_film_grain_pass_get_intensity",
  "cna_film_grain_pass_set_intensity",
  "cna_color_grade_pass_create",
  "cna_color_grade_pass_create_identity_lut",
  "cna_color_grade_pass_get_interpolation",
  "cna_color_grade_pass_set_interpolation",
  "cna_color_grade_pass_get_lut",
  "cna_color_grade_pass_set_lut",
  "cna_color_grade_pass_get_volume_lut",
  "cna_color_grade_pass_set_volume_lut",
  "cna_color_grade_pass_get_strength",
  "cna_color_grade_pass_set_strength",
  "cna_color_grade_pass_lut_size_for_strip",
  "cna_cube_lut_parse",
  "cna_cube_lut_destroy",
  "cna_cube_lut_get_size",
  "cna_cube_lut_get_entry",
  "cna_cube_lut_get_domain_min",
  "cna_cube_lut_get_domain_max",
  "cna_cube_lut_is_unit_domain",
  "cna_cube_lut_copy_title",
  "cna_cube_lut_create_strip_texture",
  "cna_cube_lut_create_volume_texture",
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
  "cna_aerial_perspective_pass_air_mass_for_distance",
  "cna_aerial_perspective_pass_copy_fallback_reason",
  "cna_aerial_perspective_pass_create",
  "cna_aerial_perspective_pass_get_intensity",
  "cna_aerial_perspective_pass_get_scale_height",
  "cna_aerial_perspective_pass_get_sun_direction",
  "cna_aerial_perspective_pass_get_turbidity",
  "cna_aerial_perspective_pass_set_intensity",
  "cna_aerial_perspective_pass_set_scale_height",
  "cna_aerial_perspective_pass_set_sun_direction",
  "cna_aerial_perspective_pass_set_turbidity",
  "cna_aerial_perspective_pass_transmittance",
  "cna_ascii_pass_create",
  "cna_ascii_pass_get_effect",
  "cna_ascii_post_process_effect_create",
  "cna_ascii_post_process_effect_destroy",
  "cna_ascii_post_process_effect_draw",
  "cna_ascii_post_process_effect_get_cell_size",
  "cna_ascii_post_process_effect_get_last_grid_dimensions",
  "cna_ascii_post_process_effect_get_quantize_mode",
  "cna_ascii_post_process_effect_set_cell_size",
  "cna_ascii_post_process_effect_set_quantize_mode",
  "cna_contact_shadow_pass_combine_visibility",
  "cna_contact_shadow_pass_copy_fallback_reason",
  "cna_contact_shadow_pass_copy_occlusion_test_glsl",
  "cna_contact_shadow_pass_create",
  "cna_contact_shadow_pass_get_bias",
  "cna_contact_shadow_pass_get_intensity",
  "cna_contact_shadow_pass_get_light_direction",
  "cna_contact_shadow_pass_get_max_distance",
  "cna_contact_shadow_pass_get_step_count",
  "cna_contact_shadow_pass_get_thickness",
  "cna_contact_shadow_pass_is_occluded",
  "cna_contact_shadow_pass_set_bias",
  "cna_contact_shadow_pass_set_intensity",
  "cna_contact_shadow_pass_set_light_direction",
  "cna_contact_shadow_pass_set_max_distance",
  "cna_contact_shadow_pass_set_step_count",
  "cna_contact_shadow_pass_set_thickness",
  "cna_depth_of_field_pass_circle_of_confusion_millimetres",
  "cna_depth_of_field_pass_create",
  "cna_depth_of_field_pass_get_f_number",
  "cna_depth_of_field_pass_get_focal_length",
  "cna_depth_of_field_pass_get_focus_distance",
  "cna_depth_of_field_pass_get_max_radius",
  "cna_depth_of_field_pass_set_f_number",
  "cna_depth_of_field_pass_set_focal_length",
  "cna_depth_of_field_pass_set_focus_distance",
  "cna_depth_of_field_pass_set_max_radius",
  "cna_height_fog_pass_create",
  "cna_height_fog_pass_get_base_height",
  "cna_height_fog_pass_get_color",
  "cna_height_fog_pass_get_density",
  "cna_height_fog_pass_get_falloff",
  "cna_height_fog_pass_optical_depth",
  "cna_height_fog_pass_set_base_height",
  "cna_height_fog_pass_set_color",
  "cna_height_fog_pass_set_density",
  "cna_height_fog_pass_set_falloff",
  "cna_lens_flare_pass_create",
  "cna_lens_flare_pass_get_dispersal",
  "cna_lens_flare_pass_get_intensity",
  "cna_lens_flare_pass_get_threshold",
  "cna_lens_flare_pass_set_dispersal",
  "cna_lens_flare_pass_set_intensity",
  "cna_lens_flare_pass_set_threshold",
  "cna_light_shaft_pass_create",
  "cna_light_shaft_pass_get_decay",
  "cna_light_shaft_pass_get_intensity",
  "cna_light_shaft_pass_get_light_screen_position",
  "cna_light_shaft_pass_get_threshold",
  "cna_light_shaft_pass_set_decay",
  "cna_light_shaft_pass_set_intensity",
  "cna_light_shaft_pass_set_light_screen_position",
  "cna_light_shaft_pass_set_threshold",
  "cna_motion_blur_pass_create",
  "cna_motion_blur_pass_get_max_distance",
  "cna_motion_blur_pass_get_strength",
  "cna_motion_blur_pass_set_max_distance",
  "cna_motion_blur_pass_set_strength",
  "cna_post_process_effect_pass_create",
  "cna_post_process_effect_pass_create_owning",
  "cna_post_process_effect_pass_get_effect",
  "cna_post_process_effect_pass_set_effect",
  "cna_spatial_upscale_pass_create",
  "cna_spatial_upscale_pass_destroy",
  "cna_spatial_upscale_pass_draw",
  "cna_spatial_upscale_pass_get_edge_adaptive",
  "cna_spatial_upscale_pass_get_sharpness",
  "cna_spatial_upscale_pass_is_identity_scale",
  "cna_spatial_upscale_pass_set_edge_adaptive",
  "cna_spatial_upscale_pass_set_sharpness",
  "cna_ssao_pass_copy_kernel",
  "cna_ssao_pass_copy_occlusion_glsl",
  "cna_ssao_pass_create",
  "cna_ssao_pass_get_half_resolution",
  "cna_ssao_pass_get_intensity",
  "cna_ssao_pass_get_radius",
  "cna_ssao_pass_get_sample_count",
  "cna_ssao_pass_reset_targets",
  "cna_ssao_pass_sample_count_for_quality",
  "cna_ssao_pass_set_half_resolution",
  "cna_ssao_pass_set_intensity",
  "cna_ssao_pass_set_radius",
  "cna_ssao_pass_set_sample_count",
  "cna_ssr_pass_create",
  "cna_ssr_pass_get_depth_bias",
  "cna_ssr_pass_get_edge_fade",
  "cna_ssr_pass_get_intensity",
  "cna_ssr_pass_get_max_distance",
  "cna_ssr_pass_get_roughness_blur",
  "cna_ssr_pass_get_step_count",
  "cna_ssr_pass_get_thickness",
  "cna_ssr_pass_set_depth_bias",
  "cna_ssr_pass_set_edge_fade",
  "cna_ssr_pass_set_intensity",
  "cna_ssr_pass_set_max_distance",
  "cna_ssr_pass_set_roughness_blur",
  "cna_ssr_pass_set_step_count",
  "cna_ssr_pass_set_thickness",
  "cna_volumetric_fog_pass_create",
  "cna_volumetric_fog_pass_get_anisotropy",
  "cna_volumetric_fog_pass_get_density",
  "cna_volumetric_fog_pass_get_range",
  "cna_volumetric_fog_pass_set_anisotropy",
  "cna_volumetric_fog_pass_set_density",
  "cna_volumetric_fog_pass_set_light",
  "cna_volumetric_fog_pass_set_range",
  "cna_decal_pass_create",
  "cna_decal_pass_destroy",
  "cna_decal_pass_draw",
  "cna_decal_pass_get_max_slope_angle",
  "cna_decal_pass_get_opacity",
  "cna_decal_pass_get_tint",
  "cna_decal_pass_is_inside_decal_box",
  "cna_decal_pass_set_camera",
  "cna_decal_pass_set_max_slope_angle",
  "cna_decal_pass_set_opacity",
  "cna_decal_pass_set_prepass_inputs",
  "cna_decal_pass_set_tint",
  "cna_depth_normal_prepass_begin",
  "cna_depth_normal_prepass_copy_depth_decode_glsl",
  "cna_depth_normal_prepass_copy_velocity_decode_glsl",
  "cna_depth_normal_prepass_create",
  "cna_depth_normal_prepass_decode_velocity_ext",
  "cna_depth_normal_prepass_destroy",
  "cna_depth_normal_prepass_end",
  "cna_depth_normal_prepass_get_depth_texture",
  "cna_depth_normal_prepass_get_normal_texture",
  "cna_depth_normal_prepass_get_pass_count",
  "cna_depth_normal_prepass_get_prepass_effect",
  "cna_depth_normal_prepass_get_roughness",
  "cna_depth_normal_prepass_get_skinned_prepass_effect",
  "cna_depth_normal_prepass_get_velocity_texture_ext",
  "cna_depth_normal_prepass_has_velocity_ext",
  "cna_depth_normal_prepass_is_depth_packed",
  "cna_depth_normal_prepass_is_supported",
  "cna_depth_normal_prepass_is_using_multiple_render_targets",
  "cna_depth_normal_prepass_is_velocity_enabled_ext",
  "cna_depth_normal_prepass_pack_depth",
  "cna_depth_normal_prepass_resize",
  "cna_depth_normal_prepass_set_previous_camera_ext",
  "cna_depth_normal_prepass_set_previous_world_ext",
  "cna_depth_normal_prepass_set_roughness",
  "cna_depth_normal_prepass_set_velocity_enabled_ext",
  "cna_depth_normal_prepass_unpack_depth",
  "cna_depth_normal_prepass_uses_packed_depth_ext",
  "cna_particle_emitter_settings_init",
  "cna_particle_init",
  "cna_particle_system_copy_particle_lookup_glsl",
  "cna_particle_system_copy_particles_ext",
  "cna_particle_system_copy_unsupported_reason",
  "cna_particle_system_create",
  "cna_particle_system_create_with_capacity",
  "cna_particle_system_destroy",
  "cna_particle_system_draw",
  "cna_particle_system_get_active_count",
  "cna_particle_system_get_capacity",
  "cna_particle_system_get_settings",
  "cna_particle_system_get_softness_ext",
  "cna_particle_system_is_emission_rate_clamped",
  "cna_particle_system_is_simulation_on_cpu_ext",
  "cna_particle_system_random",
  "cna_particle_system_reset",
  "cna_particle_system_set_depth_input_ext",
  "cna_particle_system_set_settings",
  "cna_particle_system_set_simulation_on_cpu_ext",
  "cna_particle_system_set_softness_ext",
  "cna_particle_system_step",
  "cna_particle_system_update",
  "cna_particle_system_uses_compute",
  "cna_cascaded_shadow_map_apply_to_receiver",
  "cna_cascaded_shadow_map_begin",
  "cna_cascaded_shadow_map_compute_bounding_sphere",
  "cna_cascaded_shadow_map_compute_frustum_corners",
  "cna_cascaded_shadow_map_compute_split_distances",
  "cna_cascaded_shadow_map_create",
  "cna_cascaded_shadow_map_destroy",
  "cna_cascaded_shadow_map_end",
  "cna_cascaded_shadow_map_get_blend_band",
  "cna_cascaded_shadow_map_get_cascade_count",
  "cna_cascaded_shadow_map_get_cascade_matrix",
  "cna_cascaded_shadow_map_get_cascade_size",
  "cna_cascaded_shadow_map_get_caster_effect",
  "cna_cascaded_shadow_map_get_shadow_texture",
  "cna_cascaded_shadow_map_get_split_distance",
  "cna_cascaded_shadow_map_get_split_lambda",
  "cna_cascaded_shadow_map_is_debug_tint_enabled",
  "cna_cascaded_shadow_map_is_supported",
  "cna_cascaded_shadow_map_select_cascade",
  "cna_cascaded_shadow_map_set_blend_band",
  "cna_cascaded_shadow_map_set_debug_tint_enabled",
  "cna_cascaded_shadow_map_set_split_lambda",
  "cna_cascaded_shadow_map_snap_to_texel_grid",
  "cna_cascaded_shadow_map_update",
  "cna_cube_shadow_map_begin",
  "cna_cube_shadow_map_compute_face_projection",
  "cna_cube_shadow_map_compute_face_view",
  "cna_cube_shadow_map_create",
  "cna_cube_shadow_map_destroy",
  "cna_cube_shadow_map_end",
  "cna_cube_shadow_map_get_caster_effect",
  "cna_cube_shadow_map_get_depth_bias",
  "cna_cube_shadow_map_get_light_position",
  "cna_cube_shadow_map_get_light_range",
  "cna_cube_shadow_map_get_quality",
  "cna_cube_shadow_map_get_shadow_texture",
  "cna_cube_shadow_map_get_size",
  "cna_cube_shadow_map_is_supported",
  "cna_cube_shadow_map_set_depth_bias",
  "cna_cube_shadow_map_size_for_quality",
  "cna_cube_shadow_map_update",
  "cna_point_light_ext_init",
  "cna_spot_light_ext_init",
  "cna_spot_shadow_map_begin",
  "cna_spot_shadow_map_compute_light_projection",
  "cna_spot_shadow_map_compute_light_view",
  "cna_spot_shadow_map_create",
  "cna_spot_shadow_map_destroy",
  "cna_spot_shadow_map_end",
  "cna_spot_shadow_map_get_caster_effect",
  "cna_spot_shadow_map_get_depth_bias",
  "cna_spot_shadow_map_get_light_position",
  "cna_spot_shadow_map_get_light_range",
  "cna_spot_shadow_map_get_light_view_projection",
  "cna_spot_shadow_map_get_quality",
  "cna_spot_shadow_map_get_shadow_texture",
  "cna_spot_shadow_map_get_size",
  "cna_spot_shadow_map_is_supported",
  "cna_spot_shadow_map_set_depth_bias",
  "cna_shadow_map_apply_skinned_caster",
  "cna_shadow_map_get_skinned_caster_effect",
  "cna_atmospheric_sky_copy_model_glsl",
  "cna_atmospheric_sky_create",
  "cna_atmospheric_sky_destroy",
  "cna_atmospheric_sky_draw",
  "cna_atmospheric_sky_get_intensity",
  "cna_atmospheric_sky_get_sun_direction",
  "cna_atmospheric_sky_get_turbidity",
  "cna_atmospheric_sky_is_supported",
  "cna_atmospheric_sky_radiance",
  "cna_atmospheric_sky_set_intensity",
  "cna_atmospheric_sky_set_sun_direction",
  "cna_atmospheric_sky_set_turbidity",
  "cna_environment_processor_convert_equirectangular",
  "cna_environment_processor_create",
  "cna_environment_processor_destroy",
  "cna_environment_processor_direction_to_equirectangular",
  "cna_environment_processor_face_direction",
  "cna_environment_processor_generate_brdf_lut",
  "cna_environment_processor_generate_irradiance",
  "cna_environment_processor_generate_prefiltered_specular",
  "cna_environment_processor_generate_probe",
  "cna_environment_processor_hammersley",
  "cna_environment_processor_importance_sample_ggx",
  "cna_environment_processor_mip_for_roughness",
  "cna_environment_processor_roughness_for_mip",
  "cna_render_pipeline_get_skybox",
  "cna_render_pipeline_set_skybox",
  "cna_skybox_compute_view_ray",
  "cna_skybox_create",
  "cna_skybox_destroy",
  "cna_skybox_draw",
  "cna_skybox_get_environment",
  "cna_skybox_get_intensity",
  "cna_skybox_get_tint",
  "cna_skybox_get_yaw",
  "cna_skybox_is_supported",
  "cna_skybox_set_environment",
  "cna_skybox_set_intensity",
  "cna_skybox_set_owned_environment",
  "cna_skybox_set_tint",
  "cna_skybox_set_yaw",
  "cna_light_probe_baker_bake_light",
  "cna_light_probe_baker_bake_probe",
  "cna_light_probe_baker_bake_visibility",
  "cna_light_probe_baker_create",
  "cna_light_probe_baker_create_with_face_size",
  "cna_light_probe_baker_destroy",
  "cna_light_probe_baker_face_count",
  "cna_light_probe_baker_face_view",
  "cna_light_probe_baker_get_face_size",
  "cna_light_probe_baker_get_far_plane",
  "cna_light_probe_baker_get_near_plane",
  "cna_light_probe_baker_is_supported",
  "cna_light_probe_baker_set_planes",
  "cna_light_probe_ext_copy_coefficients",
  "cna_light_probe_ext_copy_evaluation_glsl",
  "cna_light_probe_ext_copy_from",
  "cna_light_probe_ext_create",
  "cna_light_probe_ext_create_at",
  "cna_light_probe_ext_destroy",
  "cna_light_probe_ext_equals",
  "cna_light_probe_ext_get_coefficient",
  "cna_light_probe_ext_get_position",
  "cna_light_probe_ext_get_visibility_mean",
  "cna_light_probe_ext_get_visibility_mean_squared",
  "cna_light_probe_ext_has_visibility",
  "cna_light_probe_ext_irradiance",
  "cna_light_probe_ext_is_zero",
  "cna_light_probe_ext_scale",
  "cna_light_probe_ext_set_coefficient",
  "cna_light_probe_ext_set_position",
  "cna_light_probe_ext_set_visibility",
  "cna_light_probe_ext_visibility_weight",
  "cna_light_probe_volume_ext_contains",
  "cna_light_probe_volume_ext_create",
  "cna_light_probe_volume_ext_destroy",
  "cna_light_probe_volume_ext_get_bounds",
  "cna_light_probe_volume_ext_get_count_x",
  "cna_light_probe_volume_ext_get_count_y",
  "cna_light_probe_volume_ext_get_count_z",
  "cna_light_probe_volume_ext_get_probe",
  "cna_light_probe_volume_ext_get_probe_count",
  "cna_light_probe_volume_ext_get_probe_position",
  "cna_light_probe_volume_ext_irradiance",
  "cna_light_probe_volume_ext_is_zero",
  "cna_light_probe_volume_ext_sample_probe",
  "cna_light_probe_volume_ext_set_probe",
  "cna_clustered_light_assignment_assign",
  "cna_clustered_light_assignment_clear",
  "cna_clustered_light_assignment_copy_indices",
  "cna_clustered_light_assignment_copy_lights_in_cluster",
  "cna_clustered_light_assignment_copy_offsets",
  "cna_clustered_light_assignment_create",
  "cna_clustered_light_assignment_destroy",
  "cna_clustered_light_assignment_get_cluster_count",
  "cna_clustered_light_assignment_get_light_count",
  "cna_clustered_light_assignment_get_max_lights_per_cluster",
  "cna_clustered_light_assignment_get_total_reference_count",
  "cna_clustered_light_ext_init",
  "cna_clustered_light_grid_cluster_bounds",
  "cna_clustered_light_grid_cluster_index",
  "cna_clustered_light_grid_create",
  "cna_clustered_light_grid_destroy",
  "cna_clustered_light_grid_get_cluster_count",
  "cna_clustered_light_grid_get_far_plane",
  "cna_clustered_light_grid_get_inverse_projection",
  "cna_clustered_light_grid_get_near_plane",
  "cna_clustered_light_grid_get_slice_count",
  "cna_clustered_light_grid_get_tiles_x",
  "cna_clustered_light_grid_get_tiles_y",
  "cna_clustered_light_grid_has_projection",
  "cna_clustered_light_grid_set_projection",
  "cna_clustered_light_grid_slice_distance",
  "cna_clustered_light_grid_slice_for_view_distance",
  "cna_clustered_light_set_add",
  "cna_clustered_light_set_add_point",
  "cna_clustered_light_set_add_spot",
  "cna_clustered_light_set_clear",
  "cna_clustered_light_set_copy_bounds",
  "cna_clustered_light_set_copy_lights",
  "cna_clustered_light_set_create",
  "cna_clustered_light_set_destroy",
  "cna_clustered_light_set_get_at",
  "cna_clustered_light_set_get_bounds_at",
  "cna_clustered_light_set_get_count",
  "cna_clustered_light_set_is_empty",
  "cna_clustered_light_set_is_usable",
  "cna_clustered_light_set_remove_at",
  "cna_clustered_light_set_replace_at",
  "cna_clustered_shadow_policy_copy_selected",
  "cna_clustered_shadow_policy_create",
  "cna_clustered_shadow_policy_destroy",
  "cna_clustered_shadow_policy_get_budget",
  "cna_clustered_shadow_policy_get_hysteresis",
  "cna_clustered_shadow_policy_get_refused_count",
  "cna_clustered_shadow_policy_get_request_count",
  "cna_clustered_shadow_policy_get_score",
  "cna_clustered_shadow_policy_is_selected",
  "cna_clustered_shadow_policy_reset",
  "cna_clustered_shadow_policy_select",
  "cna_clustered_shadow_policy_set_budget",
  "cna_clustered_shadow_policy_set_hysteresis",
  "cna_graphics_device_draw_instanced_primitives",
  "cna_graphics_device_draw_user_indexed_primitives",
  "cna_graphics_device_get_status",
  "cna_graphics_device_set_blend_factor",
  "cna_graphics_device_set_blend_state",
  "cna_graphics_device_set_multi_sample_mask",
  "cna_graphics_device_set_reference_stencil",
  "cna_graphics_device_set_sampler_state",
  "cna_graphics_device_set_scissor_rectangle",
  "cna_graphics_device_set_texture",
  "cna_graphics_device_set_viewport",
  "cna_index_buffer_get_info",
  "cna_occlusion_query_begin",
  "cna_occlusion_query_create",
  "cna_occlusion_query_destroy",
  "cna_occlusion_query_end",
  "cna_occlusion_query_get_is_complete",
  "cna_occlusion_query_get_pixel_count",
  "cna_sprite_batch_begin_with_effect",
  "cna_sprite_batch_begin_with_states",
  "cna_texture3d_create",
  "cna_texture3d_get_data",
  "cna_texture3d_set_data",
  "cna_texturecube_create",
  "cna_texturecube_destroy",
  "cna_texturecube_get_data",
  "cna_texturecube_get_info",
  "cna_texturecube_set_data",
  "cna_vertex_buffer_get_info",
  "cna_vertex_buffer_set_data_raw_at",
  "cna_vertex_buffer_set_data_raw_at_with_options",
  "cna_index_buffer_subscribe_content_lost",
  "cna_index_buffer_unsubscribe_content_lost",
  "cna_render_target_subscribe_content_lost",
  "cna_render_target_unsubscribe_content_lost",
  "cna_vertex_buffer_subscribe_content_lost",
  "cna_vertex_buffer_unsubscribe_content_lost",
  "cna_area_light_brdf_table_copy_lookup_glsl",
  "cna_area_light_brdf_table_create",
  "cna_area_light_brdf_table_destroy",
  "cna_area_light_brdf_table_get_sample_count",
  "cna_area_light_brdf_table_get_size",
  "cna_area_light_brdf_table_get_texture",
  "cna_area_light_shading_copy_shading_glsl",
  "cna_area_light_shading_lobe_scale_for",
  "cna_auto_exposure_ext_create",
  "cna_auto_exposure_ext_destroy",
  "cna_auto_exposure_ext_get_brightening_speed",
  "cna_auto_exposure_ext_get_darkening_speed",
  "cna_auto_exposure_ext_get_exposure",
  "cna_auto_exposure_ext_get_key_value",
  "cna_auto_exposure_ext_set_exposure",
  "cna_auto_exposure_ext_set_key_value",
  "cna_auto_exposure_ext_update",
  "cna_clustered_forward_effect_clear_area_light",
  "cna_clustered_forward_effect_clear_light_probe",
  "cna_clustered_forward_effect_create",
  "cna_clustered_forward_effect_destroy",
  "cna_clustered_forward_effect_get_ambient",
  "cna_clustered_forward_effect_get_base_color",
  "cna_clustered_forward_effect_get_effect",
  "cna_clustered_forward_effect_get_ior",
  "cna_clustered_forward_effect_get_material_extensions",
  "cna_clustered_forward_effect_get_metallic",
  "cna_clustered_forward_effect_get_opaque_frame",
  "cna_clustered_forward_effect_get_roughness",
  "cna_clustered_forward_effect_has_area_light",
  "cna_clustered_forward_effect_has_light_probe",
  "cna_clustered_forward_effect_is_supported",
  "cna_clustered_forward_effect_set_ior",
  "cna_clustered_forward_effect_set_light_probe",
  "cna_clustered_forward_effect_set_light_probe_volume",
  "cna_clustered_forward_effect_set_material_extensions",
  "cna_clustered_forward_effect_set_metallic",
  "cna_clustered_forward_effect_set_roughness",
  "cna_clustered_light_buffer_bind",
  "cna_clustered_light_buffer_create",
  "cna_clustered_light_buffer_destroy",
  "cna_clustered_light_buffer_get_cluster_count",
  "cna_clustered_light_buffer_get_light_count",
  "cna_clustered_light_buffer_get_reference_count",
  "cna_clustered_light_buffer_is_uploaded",
  "cna_clustered_light_buffer_upload",
  "cna_clustered_light_compute_copy_unsupported_reason",
  "cna_clustered_light_compute_create",
  "cna_clustered_light_compute_destroy",
  "cna_clustered_light_compute_get_stride",
  "cna_clustered_light_compute_has_overflowed",
  "cna_clustered_light_compute_is_supported",
  "cna_clustered_light_compute_used_compute",
  "cna_crt_effect_create",
  "cna_crt_effect_get_curvature",
  "cna_crt_effect_get_mask_intensity",
  "cna_crt_effect_get_mask_type",
  "cna_crt_effect_get_scanline_intensity",
  "cna_crt_effect_get_vignette_intensity",
  "cna_crt_effect_set_curvature",
  "cna_crt_effect_set_mask_intensity",
  "cna_crt_effect_set_mask_type",
  "cna_crt_effect_set_scanline_intensity",
  "cna_crt_effect_set_vignette_intensity",
  "cna_debug_draw_add_cascade_gizmo",
  "cna_debug_draw_add_probe_volume_gizmo",
  "cna_debug_draw_clear",
  "cna_debug_draw_create",
  "cna_debug_draw_destroy",
  "cna_debug_draw_end",
  "cna_debug_draw_get_line_count",
  "cna_debug_draw_is_depth_tested",
  "cna_debug_draw_set_depth_tested",
  "cna_depth_effect_create",
  "cna_depth_effect_get_dither_mode",
  "cna_depth_effect_get_mode",
  "cna_depth_effect_set_dither_mode",
  "cna_depth_effect_set_mode",
  "cna_effect_get_shadow_depth_bias_ext",
  "cna_effect_get_shadow_filter_radius_ext",
  "cna_effect_get_shadow_map_ext",
  "cna_effect_is_shadows_enabled_ext",
  "cna_effect_set_shadow_depth_bias_ext",
  "cna_effect_set_shadow_filter_radius_ext",
  "cna_effect_set_shadow_map_ext",
  "cna_effect_set_shadows_enabled_ext",
  "cna_engine_layer_copy_version_string",
  "cna_engine_layer_get_version",
  "cna_frustum_culler_ext_create",
  "cna_frustum_culler_ext_destroy",
  "cna_frustum_culler_ext_get_frustum",
  "cna_gpu_instance_culler_copy_unsupported_reason",
  "cna_gpu_instance_culler_create",
  "cna_gpu_instance_culler_destroy",
  "cna_gpu_instance_culler_draw",
  "cna_gpu_instance_culler_get_instance_count",
  "cna_gpu_instance_culler_is_supported",
  "cna_gpu_instance_culler_read_visible_count_ext",
  "cna_graphics_memory_barrier_has",
  "cna_hdr_display_output_create",
  "cna_hdr_display_output_decode_pq",
  "cna_hdr_display_output_destroy",
  "cna_hdr_display_output_draw",
  "cna_hdr_display_output_encode_pq",
  "cna_hdr_display_output_get_paper_white_nits",
  "cna_hdr_display_output_get_peak_nits",
  "cna_hdr_display_output_is_supported",
  "cna_hdr_display_output_roll_off",
  "cna_hdr_display_output_set_paper_white_nits",
  "cna_hdr_display_output_set_peak_nits",
  "cna_pbr_effect_create",
  "cna_pbr_effect_get_alpha",
  "cna_pbr_effect_get_alpha_cutoff_ext",
  "cna_pbr_effect_get_alpha_mode_ext",
  "cna_pbr_effect_get_diffuse_color",
  "cna_pbr_effect_get_double_sided_ext",
  "cna_pbr_effect_get_emissive_factor",
  "cna_pbr_effect_get_encode_output_to_srgb_ext",
  "cna_pbr_effect_get_ior_ext",
  "cna_pbr_effect_get_metallic_factor",
  "cna_pbr_effect_get_normal_scale_ext",
  "cna_pbr_effect_get_occlusion_strength_ext",
  "cna_pbr_effect_get_roughness_factor",
  "cna_pbr_effect_get_specular_color_factor_ext",
  "cna_pbr_effect_get_specular_factor_ext",
  "cna_pbr_effect_get_texture",
  "cna_pbr_effect_get_vertex_color_enabled_ext",
  "cna_pbr_effect_set_alpha",
  "cna_pbr_effect_set_alpha_cutoff_ext",
  "cna_pbr_effect_set_alpha_mode_ext",
  "cna_pbr_effect_set_double_sided_ext",
  "cna_pbr_effect_set_encode_output_to_srgb_ext",
  "cna_pbr_effect_set_ior_ext",
  "cna_pbr_effect_set_metallic_factor",
  "cna_pbr_effect_set_normal_scale_ext",
  "cna_pbr_effect_set_occlusion_strength_ext",
  "cna_pbr_effect_set_roughness_factor",
  "cna_pbr_effect_set_specular_factor_ext",
  "cna_pbr_effect_set_texture",
  "cna_pbr_effect_set_vertex_color_enabled_ext",
  "cna_pbr_material_extensions_copy_from",
  "cna_pbr_material_extensions_create",
  "cna_pbr_material_extensions_destroy",
  "cna_pbr_material_extensions_equals",
  "cna_pbr_material_extensions_get_attenuation_color",
  "cna_pbr_material_extensions_get_attenuation_distance",
  "cna_pbr_material_extensions_get_clearcoat_factor",
  "cna_pbr_material_extensions_get_clearcoat_normal_scale",
  "cna_pbr_material_extensions_get_clearcoat_normal_texture",
  "cna_pbr_material_extensions_get_clearcoat_roughness",
  "cna_pbr_material_extensions_get_clearcoat_roughness_texture",
  "cna_pbr_material_extensions_get_clearcoat_texture",
  "cna_pbr_material_extensions_get_iridescence_factor",
  "cna_pbr_material_extensions_get_iridescence_ior",
  "cna_pbr_material_extensions_get_iridescence_texture",
  "cna_pbr_material_extensions_get_iridescence_thickness_maximum",
  "cna_pbr_material_extensions_get_iridescence_thickness_minimum",
  "cna_pbr_material_extensions_get_iridescence_thickness_texture",
  "cna_pbr_material_extensions_get_sheen_color_factor",
  "cna_pbr_material_extensions_get_sheen_color_texture",
  "cna_pbr_material_extensions_get_sheen_roughness",
  "cna_pbr_material_extensions_get_sheen_roughness_texture",
  "cna_pbr_material_extensions_get_subsurface_color",
  "cna_pbr_material_extensions_get_subsurface_wrap",
  "cna_pbr_material_extensions_get_thickness_factor",
  "cna_pbr_material_extensions_get_thickness_texture",
  "cna_pbr_material_extensions_get_transmission_factor",
  "cna_pbr_material_extensions_get_transmission_texture",
  "cna_pbr_material_extensions_is_iridescence_enabled",
  "cna_pbr_material_extensions_is_neutral",
  "cna_pbr_material_extensions_is_sheen_enabled",
  "cna_pbr_material_extensions_is_subsurface_enabled",
  "cna_pbr_material_extensions_is_transmission_enabled",
  "cna_pbr_material_extensions_set_attenuation_distance",
  "cna_pbr_material_extensions_set_clearcoat_factor",
  "cna_pbr_material_extensions_set_clearcoat_normal_scale",
  "cna_pbr_material_extensions_set_clearcoat_normal_texture",
  "cna_pbr_material_extensions_set_clearcoat_roughness",
  "cna_pbr_material_extensions_set_clearcoat_roughness_texture",
  "cna_pbr_material_extensions_set_clearcoat_texture",
  "cna_pbr_material_extensions_set_iridescence_factor",
  "cna_pbr_material_extensions_set_iridescence_ior",
  "cna_pbr_material_extensions_set_iridescence_texture",
  "cna_pbr_material_extensions_set_iridescence_thickness_maximum",
  "cna_pbr_material_extensions_set_iridescence_thickness_minimum",
  "cna_pbr_material_extensions_set_iridescence_thickness_texture",
  "cna_pbr_material_extensions_set_sheen_color_texture",
  "cna_pbr_material_extensions_set_sheen_roughness",
  "cna_pbr_material_extensions_set_sheen_roughness_texture",
  "cna_pbr_material_extensions_set_subsurface_wrap",
  "cna_pbr_material_extensions_set_thickness_factor",
  "cna_pbr_material_extensions_set_thickness_texture",
  "cna_pbr_material_extensions_set_transmission_factor",
  "cna_pbr_material_extensions_set_transmission_texture",
  "cna_post_process_chain_add_owned_pass",
  "cna_post_process_chain_get_target_pool",
  "cna_render_pipeline_add_user_pass",
  "cna_render_pipeline_begin",
  "cna_render_pipeline_clear_user_passes",
  "cna_render_pipeline_copy_transparency_fallback_reason_ext",
  "cna_render_pipeline_create",
  "cna_render_pipeline_did_shadow_pass_run",
  "cna_render_pipeline_did_skybox_draw",
  "cna_render_pipeline_end",
  "cna_render_pipeline_get_scene_target",
  "cna_render_pipeline_get_shadow_map",
  "cna_render_pipeline_is_gpu_timing_enabled_ext",
  "cna_render_pipeline_is_using_scene_target",
  "cna_render_pipeline_release_device_resources_ext",
  "cna_render_pipeline_resize",
  "cna_render_pipeline_set_gpu_timing_enabled_ext",
  "cna_render_target_pool_acquire",
  "cna_render_target_pool_create",
  "cna_render_target_pool_destroy",
  "cna_render_target_pool_reset",
  "cna_scoped_render_target_begin",
  "cna_scoped_render_target_end",
  "cna_shader_effect_copy_compile_error_ext",
  "cna_shader_effect_factory_clear",
  "cna_shader_effect_factory_create",
  "cna_shader_effect_factory_destroy",
  "cna_shader_effect_get_projection",
  "cna_shader_effect_get_view",
  "cna_shader_effect_get_world",
  "cna_shader_effect_has_renderer",
  "cna_shader_effect_is_valid",
  "cna_shader_effect_set_texture2d",
  "cna_shader_effect_set_texture3d",
  "cna_shader_effect_set_texture_cube",
  "cna_skinned_pbr_effect_create",
  "cna_skinned_pbr_effect_get_weights_per_vertex",
  "cna_skinned_pbr_effect_set_weights_per_vertex",
  "cna_thin_film_iridescence_copy_glsl",
  "cna_transparent_draw_list_clear",
  "cna_transparent_draw_list_create",
  "cna_transparent_draw_list_destroy",
  "cna_transparent_draw_list_get_count",
  "cna_weighted_blended_transparency_copy_unsupported_reason",
  "cna_weighted_blended_transparency_destroy",
  "cna_weighted_blended_transparency_end",
  "cna_weighted_blended_transparency_get_accumulation_texture_ext",
  "cna_weighted_blended_transparency_get_revealage_texture_ext",
  "cna_weighted_blended_transparency_is_accumulating",
  "cna_weighted_blended_transparency_is_supported",
  "cna_weighted_blended_transparency_resize",
  "cna_weighted_blended_transparency_resolve",
  "cna_clustered_forward_effect_set_ambient",
  "cna_clustered_forward_effect_set_base_color",
  "cna_cube_lut_load_from_file",
  "cna_debug_draw_add_cross",
  "cna_debug_draw_add_frustum",
  "cna_debug_draw_add_sphere",
  "cna_hdr_display_output_encode",
  "cna_pbr_effect_set_diffuse_color",
  "cna_pbr_effect_set_emissive_factor",
  "cna_pbr_effect_set_specular_color_factor_ext",
  "cna_pbr_material_extensions_set_attenuation_color",
  "cna_pbr_material_extensions_set_sheen_color_factor",
  "cna_pbr_material_extensions_set_subsurface_color",
  "cna_shader_effect_factory_contains",
  "cna_shader_effect_set_projection",
  "cna_shader_effect_set_uniform_float",
  "cna_shader_effect_set_uniform_int32",
  "cna_shader_effect_set_view",
  "cna_shader_effect_set_world",
  "cna_thin_film_iridescence_evaluate",
  "cna_transparent_draw_list_draw_sorted",
  "cna_area_light_brdf_table_evaluate",
  "cna_area_light_ext_init",
  "cna_area_light_ext_is_valid",
  "cna_auto_exposure_ext_apply_to",
  "cna_effect_get_image_based_light_ext",
  "cna_effect_get_punctual_light_ext",
  "cna_effect_get_shadow_cascades_ext",
  "cna_effect_set_image_based_light_ext",
  "cna_effect_set_punctual_light_ext",
  "cna_effect_set_shadow_cascades_ext",
  "cna_gltf_material_extension_source_ext_init",
  "cna_gltf_material_extension_textures_ext_init",
  "cna_gltf_material_source_ext_init",
  "cna_gltf_material_textures_ext_init",
  "cna_gpu_cullable_instance_init",
  "cna_image_based_light_ext_init",
  "cna_image_based_light_ext_is_valid",
  "cna_indirect_draw_arguments_init",
  "cna_indirect_draw_indexed_arguments_init",
  "cna_pbr_effect_apply_material",
  "cna_pbr_effect_extract_material",
  "cna_pbr_material_apply_state",
  "cna_pbr_material_ext_copy_to_string",
  "cna_pbr_material_ext_init",
  "cna_pbr_material_init",
  "cna_punctual_light_ext_init",
  "cna_render_pipeline_get_settings",
  "cna_render_pipeline_set_settings",
  "cna_render_pipeline_settings_ext_init",
  "cna_render_pipeline_settings_init",
  "cna_shadow_cascade_state_ext_init",
  "cna_skinned_pbr_effect_apply_material",
  "cna_texture_transform_ext_init",
  "cna_area_light_brdf_table_create_with_size",
  "cna_area_light_shading_contribution",
  "cna_auto_exposure_ext_measure_average_luminance",
  "cna_auto_exposure_ext_set_adaptation_speeds",
  "cna_auto_exposure_ext_set_exposure_range",
  "cna_clustered_forward_effect_begin",
  "cna_clustered_forward_effect_set_area_light",
  "cna_clustered_forward_effect_set_opaque_frame",
  "cna_clustered_forward_effect_volume_attenuation",
  "cna_clustered_light_assignment_adopt",
  "cna_clustered_light_buffer_copy_light_lookup_glsl",
  "cna_debug_draw_add_cluster_slice_gizmo",
  "cna_debug_draw_add_line",
  "cna_debug_draw_begin",
  "cna_effect_get_light_view_projection_ext",
  "cna_effect_set_light_view_projection_ext",
  "cna_frustum_culler_ext_set_camera",
  "cna_frustum_culler_ext_set_view_projection",
  "cna_gltf_material_bridge_build_extensions",
  "cna_gltf_material_bridge_build_material",
  "cna_gpu_instance_culler_copy_instance_lookup_glsl",
  "cna_gpu_instance_culler_cull",
  "cna_graphics_device_draw_indexed_primitives_indirect_ext",
  "cna_graphics_device_draw_primitives_indirect_ext",
  "cna_hdr_display_output_get_color_space",
  "cna_hdr_display_output_rec709_to_rec2020",
  "cna_hdr_display_output_set_color_space",
  "cna_pbr_effect_get_texture_coordinate_set_ext",
  "cna_pbr_effect_get_texture_is_srgb_ext",
  "cna_pbr_effect_get_texture_transform_ext",
  "cna_pbr_effect_set_texture_coordinate_set_ext",
  "cna_pbr_effect_set_texture_is_srgb_ext",
  "cna_pbr_effect_set_texture_transform_ext",
  "cna_pbr_material_ext_equals",
  "cna_pbr_material_extensions_copy_to_string",
  "cna_render_pipeline_copy_pass_timing_name_ext",
  "cna_render_pipeline_get_pass_timing_count_ext",
  "cna_render_pipeline_get_scene_target_format",
  "cna_render_pipeline_set_camera",
  "cna_render_pipeline_set_depth_normal_inputs",
  "cna_render_pipeline_set_skybox_camera",
  "cna_render_pipeline_set_velocity_input_ext",
  "cna_render_pipeline_settings_ext_apply_render_quality_preset",
  "cna_render_pipeline_settings_ext_normalize",
  "cna_render_target_pool_get_estimated_bytes",
  "cna_render_target_pool_get_target_count",
  "cna_scoped_render_target_get_has_recorded_previous",
  "cna_shader_effect_create",
  "cna_shader_effect_factory_acquire",
  "cna_shader_effect_factory_get_compile_count",
  "cna_shader_effect_set_uniform_float_array",
  "cna_shader_effect_set_uniform_mat4_array",
  "cna_shader_effect_set_uniform_matrix",
  "cna_shader_effect_set_uniform_vec3_array",
  "cna_shader_effect_set_uniform_vector2",
  "cna_shader_effect_set_uniform_vector3",
  "cna_skinned_pbr_effect_extract_material",
  "cna_transparent_draw_list_camera_position_of",
  "cna_weighted_blended_transparency_begin",
  "cna_weighted_blended_transparency_copy_accumulation_glsl",
  "cna_weighted_blended_transparency_create",
  "cna_weighted_blended_transparency_weight",
  "cna_area_light_brdf_table_get_generation_milliseconds",
  "cna_area_light_shading_coverage",
  "cna_area_light_shading_quad_of",
  "cna_clustered_forward_effect_contribution",
  "cna_clustered_forward_effect_contribution_with_extensions",
  "cna_clustered_light_compute_assign",
  "cna_debug_draw_add_bounding_sphere",
  "cna_debug_draw_add_box",
  "cna_debug_draw_add_directional_light_gizmo",
  "cna_debug_draw_add_point_light_gizmo",
  "cna_debug_draw_add_spot_light_gizmo",
  "cna_debug_draw_copy_vertices",
  "cna_directional_light_ext_init",
  "cna_frustum_culler_ext_cull_boxes",
  "cna_frustum_culler_ext_cull_spheres",
  "cna_frustum_culler_ext_cull_transforms",
  "cna_frustum_culler_ext_is_box_visible",
  "cna_frustum_culler_ext_is_sphere_visible",
  "cna_gpu_instance_culler_set_instances",
  "cna_graphics_device_get_blend_state",
  "cna_graphics_device_get_rasterizer_state",
  "cna_pbr_material_ext_get_hash_code",
  "cna_pbr_material_extensions_get_hash_code",
  "cna_render_pipeline_destroy",
  "cna_render_pipeline_get_gpu_memory_estimate_bytes",
  "cna_render_pipeline_get_last_frame_pass_count",
  "cna_render_pipeline_get_pass_timing_ext",
  "cna_render_pipeline_get_statistics",
  "cna_render_pipeline_set_shadow_scene",
  "cna_render_pipeline_set_transparent_scene",
  "cna_render_pipeline_settings_ext_apply_from_string",
  "cna_shader_effect_declare_uniform_block_ext",
  "cna_shader_effect_set_uniform_vector2_array",
  "cna_shader_effect_set_uniform_vector4",
  "cna_skinned_pbr_effect_copy_bone_transforms",
  "cna_skinned_pbr_effect_set_bone_transforms",
  "cna_transparent_draw_list_copy_sorted_order_ext",
  "cna_transparent_draw_list_sort_key",
  "cna_transparent_draw_list_submit",
  "cna_compute_shader_barrier",
  "cna_compute_shader_bind_image",
  "cna_compute_shader_bind_storage_buffer",
  "cna_compute_shader_bind_texture",
  "cna_compute_shader_copy_compile_error",
  "cna_compute_shader_create",
  "cna_compute_shader_destroy",
  "cna_compute_shader_dispatch",
  "cna_compute_shader_is_image_binding_supported",
  "cna_compute_shader_is_valid",
  "cna_compute_shader_set_uniform_float",
  "cna_compute_shader_set_uniform_int",
  "cna_gpu_timer_begin",
  "cna_gpu_timer_copy_unsupported_reason",
  "cna_gpu_timer_create",
  "cna_gpu_timer_destroy",
  "cna_gpu_timer_end",
  "cna_gpu_timer_get_last_milliseconds",
  "cna_gpu_timer_get_sample_count",
  "cna_gpu_timer_is_open",
  "cna_gpu_timer_is_result_available",
  "cna_gpu_timer_is_supported",
  "cna_gpu_timer_poll",
  "cna_storage_buffer_create",
  "cna_storage_buffer_create_typed",
  "cna_storage_buffer_destroy",
  "cna_storage_buffer_get_byte_size",
  "cna_storage_buffer_get_bytes",
  "cna_storage_buffer_get_element_byte_size",
  "cna_storage_buffer_get_element_count",
  "cna_storage_buffer_get_elements",
  "cna_storage_buffer_set_bytes",
  "cna_storage_buffer_set_elements",
  "cna_instanced_renderer_ext_create",
  "cna_instanced_renderer_ext_destroy",
  "cna_instanced_renderer_ext_did_last_draw_instance",
  "cna_instanced_renderer_ext_draw",
  "cna_instanced_renderer_ext_get_instance_capacity",
  "cna_instanced_renderer_ext_get_instance_count",
  "cna_instanced_renderer_ext_get_last_draw_call_count",
  "cna_instanced_renderer_ext_is_fallback_enabled",
  "cna_instanced_renderer_ext_is_instancing_supported",
  "cna_instanced_renderer_ext_is_tints_enabled",
  "cna_instanced_renderer_ext_set_fallback_enabled",
  "cna_instanced_renderer_ext_set_instance_tints",
  "cna_instanced_renderer_ext_set_instances",
  "cna_instanced_renderer_ext_set_tints_enabled",
  "cna_model_mesh_part_create",
  "cna_model_mesh_part_destroy",
  "cna_model_mesh_part_get_effect",
  "cna_model_mesh_part_get_index_buffer",
  "cna_model_mesh_part_get_num_vertices",
  "cna_model_mesh_part_get_primitive_count",
  "cna_model_mesh_part_get_start_index",
  "cna_model_mesh_part_get_vertex_buffer",
  "cna_model_mesh_part_get_vertex_offset",
  "cna_model_mesh_part_set_effect",
  "cna_dynamic_sound_effect_instance_create",
  "cna_dynamic_sound_effect_instance_get_pending_buffer_count",
  "cna_dynamic_sound_effect_instance_submit_buffer",
  "cna_sound_effect_create_from_encoded_ext",
  "cna_sound_effect_get_distance_scale",
  "cna_sound_effect_get_doppler_scale",
  "cna_sound_effect_get_speed_of_sound",
  "cna_sound_effect_instance_apply_3d_multi_ext",
  "cna_sound_effect_set_distance_scale",
  "cna_sound_effect_set_doppler_scale",
  "cna_sound_effect_set_speed_of_sound",
  "cna_effect_clone",
  "cna_effect_create_empty",
  "cna_graphics_device_manager_toggle_full_screen",
  "cna_mouse_set_position",
  "cna_mouse_set_window_handle",
  "cna_texture2d_copy_encoded",
  "cna_texture2d_get_encoded_byte_count",
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
  /**
   * CNA's extended graphics layer, which the browser backend had none of until now.
   *
   * Present rather than absent even though only one family of it is implemented, and the
   * difference matters to a consumer: an absent `GraphicsExtensions` makes every public engine API
   * fail with "CNA extended graphics requires a loaded backend", which is a statement about the
   * *binding*. What actually varies is whether their artifact was built `CNA_CNAEXT=ON` -- and
   * with the object present, a route outside the slice names itself and a route inside it gets
   * CNA's own answer for the artifact in front of it, including `NOT_SUPPORTED` where the layer
   * was compiled out.
   */
  public readonly GraphicsExtensions: CnaGraphicsExtensionBackend;
  /**
   * What the device can be asked, which is how a page decides what to reach for.
   *
   * No compute is dispatched here. The object exists because `GraphicsDeviceCapabilities.Supports`
   * hangs off it, and without it a browser had no way to find out what its context supports short
   * of constructing something that needs a capability and reading the exception.
   */
  public readonly Compute: CnaComputeBackend;
  /**
   * A shadow map's description and the maths that decides where it looks from. Not the pass: what
   * this context can cast is a question for the device, and the slice asks it rather than assuming.
   */
  public readonly Shadows: CnaShadowBackend;
  /**
   * The linear-depth and normal images the screen-space passes read.
   *
   * Bound with the eleven passes that consume it rather than after them: SSAO, reflections, depth
   * of field, motion blur, contact shadows, aerial perspective and the decal projector all take a
   * depth image, and a browser holding those passes with nothing to feed them is not a slice.
   */
  public readonly DepthNormalPrepass: CnaDepthNormalPrepassBackend;
  /**
   * The decal projector, which is the prepass's first drawing consumer.
   *
   * It cannot be given an uploaded `Texture2D` as its depth input -- measured, and recorded on the
   * public API -- so it becomes reachable in a browser exactly when the prepass does.
   */
  public readonly Decals: CnaDecalBackend;
  /**
   * Particle systems, which draw into whatever single target is bound and are therefore the one
   * family here that upstream finding 30 takes nothing away from.
   */
  public readonly Particles: CnaParticleBackend;
  /**
   * The sky, which CNA ships its own model of as a scalar -- so a drawn sky is checkable against
   * the colour CNA says the ray through that texel is, rather than against a previous run.
   */
  public readonly Atmosphere: CnaAtmosphereBackend;
  /**
   * Light probes, whose probe and volume halves are pure arithmetic and whose baker drives a
   * capture callback with CNA's own target bound.
   */
  public readonly LightProbes: CnaLightProbeBackend;
  /**
   * Clustered lighting, which sounds like a GPU family and is not: all four of its objects compute
   * on the CPU. What is renderer-blocked here is `ClusteredLightCompute`, which is a different
   * object and answers `is_supported` false on WebGL 2.0.
   */
  public readonly ClusteredLighting: CnaClusteredLightingBackend;
  /**
   * The instanced renderer, and the mesh part it draws.
   *
   * Recorded by an earlier session as architecturally out of reach, and that was right about the
   * content path and wrong about the route: `cna_model_mesh_part_create` takes the caller's own
   * vertex and index buffers. Loading a `Model` out of XNB still needs a native content manager
   * this package deliberately does not have, and that decision is unchanged.
   */
  public readonly InstancedRenderer: CnaInstancedRendererBackend;
  public readonly NativeMeshParts: CnaNativeMeshPartBackend;
  /**
   * Level-of-detail selection, which is the one engine family here that is implemented *whole*
   * rather than sliced: every route of it is arithmetic over thresholds and touches no device.
   */
  public readonly Lod: CnaLodBackend;
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
    this.GraphicsExtensions = new WasmGraphicsExtensionBackend(this.#routes);
    this.Compute = new WasmComputeBackend(this.#routes);
    this.Shadows = new WasmShadowBackend(this.#routes);
    this.DepthNormalPrepass = new WasmDepthNormalPrepassBackend(this.#routes);
    this.Decals = new WasmDecalBackend(this.#routes);
    this.Particles = new WasmParticleBackend(this.#routes);
    this.Atmosphere = new WasmAtmosphereBackend(this.#routes);
    this.LightProbes = new WasmLightProbeBackend(this.#routes);
    this.ClusteredLighting = new WasmClusteredLightingBackend(this.#routes);
    this.InstancedRenderer = new WasmInstancedRendererBackend(this.#routes);
    this.NativeMeshParts = new WasmNativeMeshPartBackend(this.#routes);
    this.Lod = new WasmLodBackend(this.#routes);
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


  public override toggleGraphicsDeviceManagerFullScreen(manager: NativeHandle): void {
    this.#invoke("cna_graphics_device_manager_toggle_full_screen", manager);
  }

  /**
   * The texture as PNG or another image format, counted first and then copied.
   *
   * A browser has its own encoders, and this is not one of them: it is CNA's, so a page that
   * writes a screenshot into CNB or hands one back through the same route a desktop consumer uses
   * gets identical bytes. `target_width` and `target_height` of zero are the texture's own size.
   */
  public override encodeTexture2D(
    texture: NativeHandle, imageFormat: number, width: number, height: number,
  ): Uint8Array {
    const scope = new WasmScope(this.#module);
    try {
      const countOut = scope.allocate(8);
      this.#invoke(
        "cna_texture2d_get_encoded_byte_count", texture, imageFormat,
        Math.trunc(width) >>> 0, Math.trunc(height) >>> 0, countOut,
      );
      const byteCount = Number(this.#routes.view().getBigUint64(countOut, true));
      if (byteCount === 0) return new Uint8Array(0);
      const destination = scope.allocate(byteCount);
      const writtenOut = scope.allocate(8);
      this.#invoke(
        "cna_texture2d_copy_encoded", texture, imageFormat,
        Math.trunc(width) >>> 0, Math.trunc(height) >>> 0, destination, BigInt(byteCount),
        writtenOut,
      );
      const written = Number(this.#routes.view().getBigUint64(writtenOut, true));
      return new Uint8Array(this.#module.HEAPU8.subarray(destination, destination + written));
    } finally {
      scope.dispose();
    }
  }

  /**
   * Warps the pointer, which a browser will not do without a pointer lock the page has to ask for.
   *
   * Bound anyway: CNA's own answer for a context that refuses is what a consumer wants, and the
   * binding declining first would be a statement about this package.
   */
  public override setMousePosition(x: number, y: number): void {
    this.#invoke("cna_mouse_set_position", this.#requireGame(), Math.trunc(x), Math.trunc(y));
  }

  public override setMouseWindowHandle(value: bigint): void {
    this.#invoke("cna_mouse_set_window_handle", this.#requireGame(), value);
  }

}
