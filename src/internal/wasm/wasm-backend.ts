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
import type {
  BackendRendererInfo,
  CnaGameCallbacks,
  CnaGameConfiguration,
  CnaGameTimeSnapshot,
  GraphicsManagerConfiguration,
  SpriteBatchCommand,
  Texture2DInfo,
  Texture2DTransfer,
} from "../backend.js";
import { NativeUnavailableError } from "../native-error.js";
import type { NativeHandle } from "../ownership.js";
import { ButtonState, type Keys } from "../../Microsoft/Xna/Framework/Input/Enums.js";
import { KeyboardState } from "../../Microsoft/Xna/Framework/Input/KeyboardState.js";
import { MouseState } from "../../Microsoft/Xna/Framework/Input/MouseState.js";
import type { PlayerIndex } from "../../Microsoft/Xna/Framework/PlayerIndex.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import {
  allocateStruct,
  readUtf8,
  route,
  WasmScope,
  WasmStruct,
  type CnaWasmModule,
  type WasmExport,
} from "./module.js";

const CNA_RESULT_SUCCESS = 0;
const MOUSE_BUTTON_LEFT = 1 << 0;
const MOUSE_BUTTON_MIDDLE = 1 << 1;
const MOUSE_BUTTON_RIGHT = 1 << 2;
const MOUSE_BUTTON_X1 = 1 << 3;
const MOUSE_BUTTON_X2 = 1 << 4;

/** The CNA routes this slice reaches. Every one is resolved when the backend is constructed. */
const ROUTES = [
  "cna_get_abi_version",
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
] as const;

type RouteName = (typeof ROUTES)[number];

interface GameCallbackState {
  readonly callbacks: CnaGameCallbacks;
  readonly functionPointers: number[];
  readonly scope: WasmScope;
  pendingError: unknown;
}

/** An error carrying the CNA result code that produced it, matching the Node adapter's shape. */
export class WasmCnaError extends Error {
  public readonly cnaResult: number;
  public constructor(operation: string, result: number, detail: string | null) {
    super(`${operation} failed with CNA result ${result}${detail ? `: ${detail}` : ""}`);
    this.name = "WasmCnaError";
    this.cnaResult = result;
  }
}

export class WasmBackend extends CnaBackendBase {
  public readonly Kind = "wasm" as const;
  public readonly IsAvailable = true;
  public readonly AbiVersion: string;
  public readonly Detail: string;
  public readonly ImportedSymbolCount = ROUTES.length;
  /** Reported once the graphics device exists, matching the Node adapter's status shape. */
  public RendererInfo: BackendRendererInfo | null = null;

  readonly #module: CnaWasmModule;
  readonly #routes: Map<RouteName, WasmExport>;
  #game: GameCallbackState | null = null;
  #activeGame: NativeHandle | null = null;

  public constructor(module: CnaWasmModule) {
    super();
    this.#module = module;
    this.#routes = new Map();
    for (const name of ROUTES) this.#routes.set(name, route(module, name));
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
    const exported = this.#routes.get(name);
    if (!exported) throw new NativeUnavailableError(`unresolved CNA route ${name}`);
    return exported(...args);
  }

  #check(name: RouteName, result: number): void {
    if (result === CNA_RESULT_SUCCESS) return;
    throw new WasmCnaError(name, result, this.getLastError());
  }

  #invoke(name: RouteName, ...args: readonly (number | bigint)[]): void {
    this.#check(name, this.#call(name, ...args));
  }

  public override initialize(): Promise<void> { return Promise.resolve(); }

  public override getLastError(): string | null {
    const scope = new WasmScope(this.#module);
    try {
      const sizePointer = scope.allocate(8);
      if (this.#call("cna_error_get_last_message_size", sizePointer) !== CNA_RESULT_SUCCESS) return null;
      const byteLength = Number(new DataView(this.#module.HEAPU8.buffer as ArrayBuffer)
        .getBigUint64(sizePointer, true));
      if (byteLength === 0) return null;
      const buffer = scope.allocate(byteLength);
      const writtenPointer = scope.allocate(8);
      if (this.#call(
        "cna_error_copy_last_message", buffer, BigInt(byteLength), writtenPointer,
      ) !== CNA_RESULT_SUCCESS) return null;
      const written = Number(new DataView(this.#module.HEAPU8.buffer as ArrayBuffer)
        .getBigUint64(writtenPointer, true));
      return readUtf8(this.#module, buffer, written);
    } finally {
      scope.dispose();
    }
  }

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
    const scope = new WasmScope(this.#module);
    try {
      const out = scope.allocate(8);
      this.#invoke(name, ...args, out);
      return new DataView(this.#module.HEAPU8.buffer as ArrayBuffer).getBigUint64(out, true);
    } finally {
      scope.dispose();
    }
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

  #requireGame(): NativeHandle {
    if (this.#activeGame == null) {
      throw new NativeUnavailableError("this operation requires an active native Game");
    }
    return this.#activeGame;
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
}
