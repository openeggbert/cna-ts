// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaInputDeviceInventoryBackend`: the clipboard, what is plugged in,
// and the host's power supply.
//
// These are the parts of `input_devices.h` CNA's extended device layer does *not* gate, so they
// answer on both artifacts rather than only the one built `CNA_DEVICES=ON`. That distinction is
// the whole reason this interface exists apart from `CnaDeviceBackend`, and it survives into the
// browser unchanged.
//
// **The clipboard is real and is not gated here.** SDL3's Emscripten backend implements it, and
// `setClipboardTextUngated` says in its name that the *public* API gates it and this boundary does
// not. Nothing in this file asks the browser for permission or works around its refusal: a page
// that has not been granted clipboard access gets CNA's failure, which is the browser's answer
// rather than an invented one.
//
// **An empty device list is evidence, not a failure.** Headless Chromium reports one mouse, one
// keyboard and no touch device. A count of zero means zero devices of that kind are attached, and
// the index routes then refuse every index -- which is what the browser suite asserts, because
// "the enumeration is broken" and "there is nothing to enumerate" look identical from a count
// alone and only the refusal separates them.

import { CnaInputDeviceInventoryBackendBase } from "../backend-base.js";
import type { AttachedInputDeviceSnapshot, HostPowerSnapshot } from "../backend.js";
import { outBool, withStringView } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

/** The three attached-device families, each with the same count/info/name route triple. */
const DEVICE_KINDS = {
  mouse: {
    count: "cna_input_devices_get_mouse_count",
    info: "cna_input_devices_get_mouse_info_at",
    nameSize: "cna_input_devices_get_mouse_name_size_at",
    copyName: "cna_input_devices_copy_mouse_name_at",
  },
  keyboard: {
    count: "cna_input_devices_get_keyboard_count",
    info: "cna_input_devices_get_keyboard_info_at",
    nameSize: "cna_input_devices_get_keyboard_name_size_at",
    copyName: "cna_input_devices_copy_keyboard_name_at",
  },
  touch: {
    count: "cna_input_devices_get_touch_device_count",
    info: "cna_input_devices_get_touch_device_info_at",
    nameSize: "cna_input_devices_get_touch_device_name_size_at",
    copyName: "cna_input_devices_copy_touch_device_name_at",
  },
} as const;

export class WasmInputDeviceInventoryBackend extends CnaInputDeviceInventoryBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => bigint;

  public constructor(routes: WasmRouteTable, game: () => bigint) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's input-device inventory`,
    );
  }

  public override getClipboardText(): string {
    return this.#routes.copyString(
      "cna_clipboard_get_text_size", "cna_clipboard_copy_text", this.#game(),
    );
  }

  public override getClipboardTextSize(): number {
    return Number(this.#routes.outU64("cna_clipboard_get_text_size", this.#game()));
  }

  public override getClipboardHasText(): boolean {
    return outBool(this.#routes, "cna_clipboard_get_has_text", this.#game());
  }

  public override setClipboardTextUngated(text: string): void {
    withStringView(this.#routes, text, (view) =>
      this.#routes.invoke("cna_clipboard_set_text", this.#game(), view));
  }

  public override getAttachedMouseCount(): number {
    return this.#count("mouse");
  }

  public override getAttachedMouseAt(index: number): AttachedInputDeviceSnapshot {
    return this.#deviceAt("mouse", index);
  }

  public override getAttachedKeyboardCount(): number {
    return this.#count("keyboard");
  }

  public override getAttachedKeyboardAt(index: number): AttachedInputDeviceSnapshot {
    return this.#deviceAt("keyboard", index);
  }

  public override getAttachedTouchDeviceCount(): number {
    return this.#count("touch");
  }

  public override getAttachedTouchDeviceAt(index: number): AttachedInputDeviceSnapshot {
    return this.#deviceAt("touch", index);
  }

  /**
   * The host's power supply.
   *
   * CNA answers `-1` for a percentage or a time it does not know, and that is projected as `null`
   * rather than as a number: a browser that cannot see a battery would otherwise report minus one
   * percent charge, which is a value a consumer's arithmetic will happily use.
   */
  public override getHostPowerInfo(): HostPowerSnapshot {
    const scope = this.#routes.scope();
    try {
      const state = scope.allocate(4);
      const seconds = scope.allocate(4);
      const percent = scope.allocate(4);
      this.#routes.invoke("cna_power_get_info", this.#game(), state, seconds, percent);
      const view = this.#routes.view();
      const secondsValue = view.getInt32(seconds, true);
      const percentValue = view.getInt32(percent, true);
      return {
        State: view.getUint32(state, true),
        BatteryPercent: percentValue < 0 ? null : percentValue,
        SecondsRemaining: secondsValue < 0 ? null : secondsValue,
      };
    } finally {
      scope.dispose();
    }
  }

  #count(kind: keyof typeof DEVICE_KINDS): number {
    return this.#routes.outU32(DEVICE_KINDS[kind].count, this.#game());
  }

  /** Reads a `CNA_InputDeviceInfo` and the device's name, which are two routes and one device. */
  #deviceAt(kind: keyof typeof DEVICE_KINDS, index: number): AttachedInputDeviceSnapshot {
    const family = DEVICE_KINDS[kind];
    const at = Math.trunc(index);
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_InputDeviceInfo");
      this.#routes.invoke(family.info, this.#game(), at, info.pointer);
      return {
        Id: info.getU64("id"),
        Name: this.#routes.copyString(family.nameSize, family.copyName, this.#game(), at),
      };
    } finally {
      scope.dispose();
    }
  }
}
