// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaGameWindowBackend`: the window a browser game runs in.
//
// A browser has no title bar and no OS window, and XNA's `GameWindow` is written for one. What
// CNA does about that is not this file's decision to make -- SDL3's Emscripten backend maps the
// canvas onto the same window object every other platform gets, and every route here is the same
// route a desktop game calls. So the projection is the ordinary one and the differences are
// *measured* rather than designed: the title round-trips, the client bounds are the drawing
// surface's, the screen device name is the display index SDL reports, and the orientation is
// whatever the page is in.
//
// **The window handle is not faked.** `Window.Handle` is an `IntPtr` in XNA and a real `HWND` on
// Windows; `cna_game_window_get_native_handle_ext` answers with whatever CNA has, and on the web
// target that is an opaque nonzero token rather than a pointer to anything. It is passed through
// unchanged, which is the only honest option: inventing a plausible-looking pointer would make a
// consumer's `Marshal`-shaped code compile and then fail somewhere else, and answering zero would
// claim CNA has nothing when it has a token it uses.
//
// Ownership: the window is **PARENT_OWNED** by the game, so nothing here creates or destroys one.
// An event registration is **OWNED** and released through `cna_game_unsubscribe`, and its
// JavaScript handler is rooted in the module's function table for exactly that long.

import { CnaGameWindowBackendBase } from "../backend-base.js";
import type { GameWindowBoundsSnapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_CALLBACK_SIGNATURES } from "./layout.js";
import { outBool, withStringView } from "./marshal.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmGameWindowBackend extends CnaGameWindowBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => NativeHandle;
  /** Function-table entries rooted for their registration's lifetime, keyed by that registration. */
  readonly #handlers = new Map<bigint, number>();

  public constructor(routes: WasmRouteTable, game: () => NativeHandle) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's game window`);
  }

  public override getGameWindowAllowUserResizing(): boolean {
    return outBool(this.#routes, "cna_game_window_get_allow_user_resizing", this.#game());
  }

  public override setGameWindowAllowUserResizing(value: boolean): void {
    this.#routes.invoke("cna_game_window_set_allow_user_resizing", this.#game(), value ? 1 : 0);
  }

  /** The drawing surface's rectangle, which in a browser is the canvas CNA presents to. */
  public override getGameWindowClientBounds(): GameWindowBoundsSnapshot {
    const scope = this.#routes.scope();
    try {
      const bounds = allocateStruct(this.#routes.module, scope, "CNA_Rectangle", false);
      this.#routes.invoke("cna_game_window_get_client_bounds", this.#game(), bounds.pointer);
      return {
        X: bounds.getI32("x"),
        Y: bounds.getI32("y"),
        Width: bounds.getI32("width"),
        Height: bounds.getI32("height"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override getGameWindowCurrentOrientation(): number {
    return this.#routes.outU32("cna_game_window_get_current_orientation", this.#game());
  }

  /** CNA's own native-window token. Not synthesised, and not zeroed: see the note above. */
  public override getGameWindowHandle(): bigint {
    return this.#routes.outU64("cna_game_window_get_native_handle_ext", this.#game());
  }

  public override getGameWindowScreenDeviceName(): string {
    return this.#routes.copyString(
      "cna_game_window_get_screen_device_name_size",
      "cna_game_window_copy_screen_device_name",
      this.#game(),
    );
  }

  public override getGameWindowTitle(): string {
    return this.#routes.copyString(
      "cna_game_window_get_title_size", "cna_game_window_copy_title", this.#game(),
    );
  }

  public override setGameWindowTitle(value: string): void {
    withStringView(this.#routes, value, (view) =>
      this.#routes.invoke("cna_game_set_window_title", this.#game(), view));
  }

  public override beginGameWindowScreenDeviceChange(willBeFullScreen: boolean): void {
    this.#routes.invoke(
      "cna_game_window_begin_screen_device_change", this.#game(), willBeFullScreen ? 1 : 0,
    );
  }

  public override endGameWindowScreenDeviceChange(
    name: string, width: number, height: number,
  ): void {
    withStringView(this.#routes, name, (view) => this.#routes.invoke(
      "cna_game_window_end_screen_device_change",
      this.#game(), view, Math.trunc(width), Math.trunc(height),
    ));
  }

  /**
   * One of the window's three canonical events.
   *
   * There is one native subscription per managed registration because CNA's own model is one
   * registration per handler -- unlike the sensor families, where a single native source fans out
   * to many managed listeners. The handler is rooted before the subscription is made and released
   * if the subscription is refused, so a failure cannot leak a function-table entry.
   */
  public override subscribeGameWindowEvent(event: number, callback: () => void): NativeHandle {
    const pointer = this.#routes.module.addFunction(
      ((_context: number): void => {
        // A JavaScript exception must never unwind into compiled C, and a window event has no
        // frame boundary to rethrow it at, so it is reported the way an unhandled listener
        // failure is.
        try {
          callback();
        } catch (error) {
          queueMicrotask(() => { throw error; });
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_GameEventCallback,
    );
    try {
      const registration = this.#routes.outHandle(
        "cna_game_window_subscribe", this.#game(), Math.trunc(event), pointer, 0,
      );
      this.#handlers.set(registration, pointer);
      return registration;
    } catch (error) {
      this.#routes.module.removeFunction(pointer);
      throw error;
    }
  }

  public override unsubscribeGameWindowEvent(registration: NativeHandle): void {
    this.#routes.invoke("cna_game_unsubscribe", registration);
    const pointer = this.#handlers.get(registration);
    if (pointer !== undefined) {
      this.#routes.module.removeFunction(pointer);
      this.#handlers.delete(registration);
    }
  }
}
