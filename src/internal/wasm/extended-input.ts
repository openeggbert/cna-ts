// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaExtendedInputBackend`: raw joysticks, force feedback, text
// composition and the mouse cursor.
//
// **The frontier tool said this family reaches no CNA routes at all. It reaches sixty.** That
// report was a tool artefact: it matched a boundary method to a bridge export *of the same name*,
// and this family's exports are named differently -- `getJoystickCount` calls `joysticksGetCount`.
// So a family recorded as architecturally impossible turned out to be ordinary, and the lesson is
// in `tools/wasm/backend-gap.mjs`, which now resolves a method through the Node backend's own call
// rather than by hoping two names match.
//
// ## What a browser actually has
//
// Headless Chromium reports **zero joysticks and zero haptic devices**, and that is a fact about
// the host rather than about the binding: the Gamepad API surfaces nothing until a pad is
// connected and a page has seen input from it. The counts are real, the enumeration refuses every
// index, and nothing here manufactures a device. Physical joystick and rumble behaviour is
// therefore `PHYSICAL_HARDWARE_NOT_VERIFIED` in the capability inventory.
//
// **Text input is different, and it is the half of this family a browser exercises fully.** CNA's
// text-input layer has its own raise-for-tests routes -- `cna_text_input_raise_text_input_ext` and
// its two composition siblings -- so a committed code unit, an IME composition update and a
// candidate list can all be driven through CNA and observed coming back out through a subscription.
// That is a real round trip through compiled code, not a mock.
//
// Ownership: a joystick state is **OWNED** for the length of one call -- captured, read whole, and
// destroyed before returning, so no state handle escapes. A haptic device is **OWNED** by the
// caller. A cursor is **OWNED**; a stock cursor is CNA's and is released the same way, which its
// header allows. A text-input registration is **OWNED** and holds a rooted JavaScript handler for
// exactly its own lifetime.

import { CnaExtendedInputBackendBase } from "../backend-base.js";
import type {
  HapticCapabilitiesSnapshot,
  JoystickCapabilitiesSnapshot,
  JoystickInfoSnapshot,
  JoystickStateSnapshot,
  TextEditingCandidatesSnapshot,
  TextEditingSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import { outBool, withStringView } from "./marshal.js";
import { allocateStruct, readUtf8, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmExtendedInputBackend extends CnaExtendedInputBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;
  /** Rooted handlers, keyed by the registration that owns them. */
  readonly #handlers = new Map<bigint, number>();

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's extended input`);
  }

  // ---- joysticks -----------------------------------------------------------------------------

  public override getJoystickCount(): number {
    return this.#routes.outU32("cna_joysticks_get_count", this.#game());
  }

  public override getJoystickInfoAt(index: number): JoystickInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_JoystickInfo", false);
      // CNA's own initialiser rather than a header written here: it sets the structure's size and
      // version *and* its canonical defaults, so a field CNA adds later starts at CNA's default
      // rather than at zero.
      this.#routes.invoke("cna_joystick_info_init", info.pointer);
      this.#routes.invoke("cna_joysticks_get_info_at", this.#game(), Math.trunc(index), info.pointer);
      return { Id: info.getU32("id"), Type: info.getU32("type") };
    } finally {
      scope.dispose();
    }
  }

  public override getJoystickNameAt(index: number): string {
    return this.#routes.copyString(
      "cna_joysticks_get_name_size_at", "cna_joysticks_copy_name_at",
      this.#game(), Math.trunc(index),
    );
  }

  public override getJoystickCapabilities(id: number): JoystickCapabilitiesSnapshot {
    const scope = this.#routes.scope();
    try {
      const caps = allocateStruct(this.#routes.module, scope, "CNA_JoystickCapabilities", false);
      this.#routes.invoke("cna_joystick_capabilities_init", caps.pointer);
      this.#routes.invoke(
        "cna_joysticks_get_capabilities", this.#game(), Math.trunc(id), caps.pointer,
      );
      return {
        AxisCount: caps.getI32("axis_count"),
        ButtonCount: caps.getI32("button_count"),
        HatCount: caps.getI32("hat_count"),
        BallCount: caps.getI32("ball_count"),
        Type: caps.getU32("type"),
        PowerState: caps.getU32("power_state"),
        PowerPercent: caps.getI32("power_percent"),
        IsConnected: caps.getU8("is_connected") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override getJoystickCapabilitiesName(id: number): string {
    return this.#routes.copyString(
      "cna_joysticks_get_capabilities_name_size", "cna_joysticks_copy_capabilities_name",
      this.#game(), Math.trunc(id),
    );
  }

  public override getJoystickCapabilitiesGuid(id: number): string {
    return this.#routes.copyString(
      "cna_joysticks_get_capabilities_guid_size", "cna_joysticks_copy_capabilities_guid",
      this.#game(), Math.trunc(id),
    );
  }

  /**
   * One captured joystick state, read whole and released before returning.
   *
   * Four arrays with four different element widths: axes are `int16_t`, buttons are `CNA_Bool`,
   * hats are `uint32_t` and balls are a `CNA_Point` pair. Each is read at its own measured stride
   * rather than at a width written here.
   */
  public override captureJoystickState(id: number): JoystickStateSnapshot {
    const state = this.#routes.outHandle(
      "cna_joysticks_capture_state", this.#game(), Math.trunc(id),
    );
    const scope = this.#routes.scope();
    try {
      const view = this.#routes.view();
      const axisCount = this.#routes.outU32("cna_joystick_state_get_axis_count", state);
      const buttonCount = this.#routes.outU32("cna_joystick_state_get_button_count", state);
      const hatCount = this.#routes.outU32("cna_joystick_state_get_hat_count", state);
      const ballCount = this.#routes.outU32("cna_joystick_state_get_ball_count", state);
      const written = scope.allocate(8);
      const axes: number[] = [];
      if (axisCount > 0) {
        const buffer = scope.allocate(axisCount * 2);
        this.#routes.invoke(
          "cna_joystick_state_copy_axes", state, buffer, BigInt(axisCount), written);
        for (let at = 0; at < axisCount; at += 1) axes.push(view.getInt16(buffer + at * 2, true));
      }
      const buttons: boolean[] = [];
      if (buttonCount > 0) {
        const buffer = scope.allocate(buttonCount);
        this.#routes.invoke(
          "cna_joystick_state_copy_buttons", state, buffer, BigInt(buttonCount), written);
        for (let at = 0; at < buttonCount; at += 1) buttons.push(view.getUint8(buffer + at) !== 0);
      }
      const hats: number[] = [];
      if (hatCount > 0) {
        const buffer = scope.allocate(hatCount * 4);
        this.#routes.invoke(
          "cna_joystick_state_copy_hats", state, buffer, BigInt(hatCount), written);
        for (let at = 0; at < hatCount; at += 1) hats.push(view.getUint32(buffer + at * 4, true));
      }
      const balls: { readonly X: number; readonly Y: number }[] = [];
      if (ballCount > 0) {
        const stride = WASM_STRUCT_LAYOUTS.CNA_Point.size;
        const buffer = scope.allocate(ballCount * stride);
        this.#routes.invoke(
          "cna_joystick_state_copy_balls", state, buffer, BigInt(ballCount), written);
        for (let at = 0; at < ballCount; at += 1) {
          const point = new WasmStruct(this.#routes.module, "CNA_Point", buffer + at * stride);
          balls.push({ X: point.getI32("x"), Y: point.getI32("y") });
        }
      }
      return { Axes: axes, Buttons: buttons, Hats: hats, Balls: balls };
    } finally {
      this.#routes.call("cna_joystick_state_destroy", state);
      scope.dispose();
    }
  }

  // ---- force feedback ------------------------------------------------------------------------

  public override getHapticCount(): number {
    return this.#routes.outU32("cna_haptics_get_count", this.#game());
  }

  public override getHapticIdAt(index: number): number {
    return this.#routes.outU32("cna_haptics_get_id_at", this.#game(), Math.trunc(index));
  }

  public override getHapticNameAt(index: number): string {
    return this.#routes.copyString(
      "cna_haptics_get_name_size_at", "cna_haptics_copy_name_at",
      this.#game(), Math.trunc(index),
    );
  }

  public override isJoystickHaptic(joystickId: number): boolean {
    return outBool(
      this.#routes, "cna_haptics_get_is_joystick_haptic", this.#game(), Math.trunc(joystickId),
    );
  }

  public override openHaptic(id: number): NativeHandle {
    return this.#routes.outHandle("cna_haptics_open", this.#game(), Math.trunc(id));
  }

  public override openHapticFromJoystick(joystickId: number): NativeHandle {
    return this.#routes.outHandle(
      "cna_haptics_open_from_joystick", this.#game(), Math.trunc(joystickId),
    );
  }

  public override getHapticCapabilities(device: NativeHandle): HapticCapabilitiesSnapshot {
    const scope = this.#routes.scope();
    try {
      const caps = allocateStruct(this.#routes.module, scope, "CNA_HapticCapabilities", false);
      this.#routes.invoke("cna_haptic_capabilities_init", caps.pointer);
      this.#routes.invoke("cna_haptic_device_get_capabilities", device, caps.pointer);
      return {
        Features: caps.getU32("features"),
        AxisCount: caps.getI32("axis_count"),
        MaxEffects: caps.getI32("max_effects"),
        MaxEffectsPlaying: caps.getI32("max_effects_playing"),
        IsOpen: caps.getU8("is_open") !== 0,
        RumbleSupported: caps.getU8("rumble_supported") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override getHapticName(device: NativeHandle): string {
    return this.#routes.copyString(
      "cna_haptic_device_get_name_size", "cna_haptic_device_copy_name", device,
    );
  }

  public override getHapticIsOpen(device: NativeHandle): boolean {
    return outBool(this.#routes, "cna_haptic_device_get_is_open", device);
  }

  /**
   * Each of these answers whether the device *applied* the request rather than whether the call
   * succeeded: a device with no rumble support refuses the request without failing the route, and
   * collapsing the two would tell a caller their rumble worked.
   */
  public override initHapticRumble(device: NativeHandle): boolean {
    return outBool(this.#routes, "cna_haptic_device_init_rumble", device);
  }

  public override playHapticRumble(
    device: NativeHandle, strength: number, lengthMilliseconds: number,
  ): boolean {
    return outBool(
      this.#routes, "cna_haptic_device_play_rumble", device, strength,
      Math.trunc(lengthMilliseconds),
    );
  }

  public override stopHapticRumble(device: NativeHandle): boolean {
    return outBool(this.#routes, "cna_haptic_device_stop_rumble", device);
  }

  public override setHapticGain(device: NativeHandle, gain: number): boolean {
    return outBool(this.#routes, "cna_haptic_device_set_gain", device, Math.trunc(gain));
  }

  public override disposeHapticDevice(device: NativeHandle): void {
    this.#routes.invoke("cna_haptic_device_dispose", device);
  }

  public override destroyHapticDevice(device: NativeHandle): void {
    this.#routes.invoke("cna_haptic_device_destroy", device);
  }

  // ---- text input ----------------------------------------------------------------------------

  /** One committed UTF-16 code unit, delivered as the one-character string XNA's event carries. */
  public override subscribeTextInput(handler: (character: string) => void): NativeHandle {
    return this.#subscribe(
      "cna_text_input_subscribe_text_input_ext",
      WASM_CALLBACK_SIGNATURES.CNA_TextInputCallback,
      (codeUnit: number) => handler(String.fromCharCode(codeUnit & 0xffff)),
    );
  }

  public override subscribeTextEditing(
    handler: (editing: TextEditingSnapshot) => void,
  ): NativeHandle {
    return this.#subscribe(
      "cna_text_input_subscribe_text_editing_ext",
      WASM_CALLBACK_SIGNATURES.CNA_TextEditingCallback,
      (pointer: number) => {
        const info = new WasmStruct(this.#routes.module, "CNA_TextEditingEventInfo", pointer);
        handler({
          Text: this.#viewText(info.nested("text", "CNA_StringView")),
          Start: info.getI32("start"),
          Length: info.getI32("length"),
        });
      },
    );
  }

  public override subscribeTextEditingCandidates(
    handler: (candidates: TextEditingCandidatesSnapshot) => void,
  ): NativeHandle {
    return this.#subscribe(
      "cna_text_input_subscribe_text_editing_candidates_ext",
      WASM_CALLBACK_SIGNATURES.CNA_TextEditingCandidatesCallback,
      (pointer: number) => {
        const info = new WasmStruct(
          this.#routes.module, "CNA_TextEditingCandidatesEventInfo", pointer,
        );
        const array = info.getPointer("candidates");
        const count = info.getI32("candidate_count");
        const stride = WASM_STRUCT_LAYOUTS.CNA_StringView.size;
        handler({
          Candidates: Array.from({ length: Math.max(count, 0) }, (_, at) => this.#viewText(
            new WasmStruct(this.#routes.module, "CNA_StringView", array + at * stride))),
          Selected: info.getI32("selected"),
          IsHorizontal: info.getU8("horizontal") !== 0,
        });
      },
    );
  }

  public override unsubscribeTextInput(registration: NativeHandle): void {
    this.#routes.invoke("cna_text_input_unsubscribe_ext", registration);
    const pointer = this.#handlers.get(registration);
    if (pointer !== undefined) {
      this.#routes.module.removeFunction(pointer);
      this.#handlers.delete(registration);
    }
  }

  public override raiseTextInput(codeUnit: number): void {
    this.#routes.invoke("cna_text_input_raise_text_input_ext", this.#game(), codeUnit & 0xffff);
  }

  public override raiseTextEditing(text: string, start: number, length: number): void {
    withStringView(this.#routes, text, (view) => this.#routes.invoke(
      "cna_text_input_raise_text_editing_ext",
      this.#game(), view, Math.trunc(start), Math.trunc(length),
    ));
  }

  public override raiseTextEditingCandidates(
    candidates: readonly string[], selected: number, horizontal: boolean,
  ): void {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_StringView.size;
      const array = scope.allocate(Math.max(candidates.length, 1) * stride);
      candidates.forEach((candidate, at) => {
        const bytes = scope.allocateUtf8(candidate);
        const view = new WasmStruct(this.#routes.module, "CNA_StringView", array + at * stride);
        view.setPointer("data", bytes.pointer);
        view.setU64("byte_length", BigInt(bytes.byteLength));
      });
      this.#routes.invoke(
        "cna_text_input_raise_text_editing_candidates_ext",
        this.#game(), array, candidates.length, Math.trunc(selected), horizontal ? 1 : 0,
      );
    } finally {
      scope.dispose();
    }
  }

  public override startTextInput(): void {
    this.#routes.invoke("cna_text_input_start_ext", this.#game());
  }

  public override startTextInputWithType(type: number): void {
    this.#routes.invoke("cna_text_input_start_with_type_ext", this.#game(), Math.trunc(type));
  }

  public override stopTextInput(): void {
    this.#routes.invoke("cna_text_input_stop_ext", this.#game());
  }

  public override isTextInputActive(): boolean {
    return outBool(this.#routes, "cna_text_input_is_active_ext", this.#game());
  }

  public override isScreenKeyboardShown(): boolean {
    return outBool(this.#routes, "cna_text_input_is_screen_keyboard_shown_ext", this.#game());
  }

  /** The `CNA_Rectangle` is passed by value, which wasm32 lowers as a pointer to a copy. */
  public override setTextInputRectangle(
    x: number, y: number, width: number, height: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const rectangle = allocateStruct(this.#routes.module, scope, "CNA_Rectangle", false);
      rectangle.setI32("x", Math.trunc(x)).setI32("y", Math.trunc(y));
      rectangle.setI32("width", Math.trunc(width)).setI32("height", Math.trunc(height));
      this.#routes.invoke(
        "cna_text_input_set_input_rectangle_ext", this.#game(), rectangle.pointer,
      );
    } finally {
      scope.dispose();
    }
  }

  public override resetTextInputForTests(): void {
    this.#routes.invoke("cna_text_input_reset_for_tests_ext", this.#game());
  }

  // ---- the mouse cursor ----------------------------------------------------------------------

  public override getStockCursor(stock: number): NativeHandle {
    return this.#routes.outHandle(
      "cna_mouse_cursor_get_stock_ext", this.#game(), Math.trunc(stock),
    );
  }

  public override createCursorFromTexture2D(
    texture: NativeHandle, originX: number, originY: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_mouse_cursor_create_from_texture2d",
      this.#game(), texture, Math.trunc(originX), Math.trunc(originY),
    );
  }

  public override disposeCursor(cursor: NativeHandle): void {
    this.#routes.invoke("cna_mouse_cursor_dispose", cursor);
  }

  public override destroyCursor(cursor: NativeHandle): void {
    this.#routes.invoke("cna_mouse_cursor_destroy", cursor);
  }

  public override setMouseCursor(cursor: NativeHandle): void {
    this.#routes.invoke("cna_mouse_set_cursor_ext", this.#game(), cursor);
  }

  // ---- shared shapes -------------------------------------------------------------------------

  /**
   * Registers a text-input handler and roots it for the registration's lifetime.
   *
   * The three subscriptions differ only in their route and their argument's shape, and every one
   * of them is called from inside CNA's own dispatch -- so a throwing handler is contained here
   * rather than allowed to unwind into compiled C.
   */
  #subscribe(
    route: string, signature: string, deliver: (argument: number) => void,
  ): NativeHandle {
    const pointer = this.#routes.module.addFunction(
      ((argument: number, _context: number): void => {
        try {
          deliver(argument);
        } catch (error) {
          queueMicrotask(() => { throw error; });
        }
      }) as never,
      signature,
    );
    try {
      const registration = this.#routes.outHandle(route, pointer, 0);
      this.#handlers.set(registration, pointer);
      return registration;
    } catch (error) {
      this.#routes.module.removeFunction(pointer);
      throw error;
    }
  }

  /** Reads a `CNA_StringView` CNA wrote, which points into memory valid for this call only. */
  #viewText(view: WasmStruct): string {
    const pointer = view.getPointer("data");
    const byteLength = Number(view.getU64("byte_length"));
    if (pointer === 0 || byteLength === 0) return "";
    return readUtf8(this.#routes.module, pointer, byteLength);
  }
}
