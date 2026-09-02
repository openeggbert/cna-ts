// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaGamerServicesBackend`: the dispatcher and the Guide.
//
// **This is not the signed-in gamer.** Upstream finding 29 records that `cna_signed_in_gamer_*`
// belongs to a platform layer this package does not have, and nothing here reaches for it: every
// route in this file is dispatcher state, Guide state, or one of the two Guide dialogs. Those are
// local, and leaving them refusing because a *different* subfamily is blocked would have been the
// mistake this session exists to stop.
//
// **No modal opens on anybody's desktop.** CNA's Guide does not hand a message box to the host
// window system: it holds a pending dialog and draws it itself with a caller's sprite batch, which
// is why `cna_guide_get_has_pending_message_box_ext` and `cna_guide_simulate_message_box_click_ext`
// exist at all. So the asynchronous contract -- begin, pending, exactly-once completion, the chosen
// button, a cancelled keyboard entry -- is testable in headless Chromium without any UI, and it is
// CNA's own dialog being tested rather than a mock.
//
// Ownership of a continuation: `guideBeginShow*` returns an opaque token holding the rooted
// function-table entry for its callback. `guideEndShow*` consumes the token exactly once, releases
// the entry, and refuses a token used twice -- which is the Node bridge's contract, reproduced
// here so a consumer cannot tell the two backends apart by getting away with a double `End`.

import { CnaGamerServicesBackendBase } from "../backend-base.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import { outBool, outI32 } from "./marshal.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

/** One in-flight Guide operation: the rooted callback, and whether `End` has consumed it. */
interface GuideContinuation {
  FunctionPointer: number;
  Completed: boolean;
  Ended: boolean;
}

export class WasmGamerServicesBackend extends CnaGamerServicesBackendBase {
  readonly #routes: WasmRouteTable;
  readonly #game: () => bigint;
  /** The live continuations, so a token this backend did not issue is refused rather than used. */
  readonly #live = new Set<GuideContinuation>();

  public constructor(routes: WasmRouteTable, game: () => bigint) {
    super();
    this.#routes = routes;
    this.#game = game;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's gamer services`);
  }

  // ---- the dispatcher ------------------------------------------------------------------------

  /** The dispatcher belongs to the running game, which is the one route here that takes one. */
  public override initializeGamerServices(): void {
    this.#routes.invoke("cna_gamer_services_dispatcher_initialize", this.#game());
  }

  public override getGamerServicesIsInitialized(): boolean {
    return outBool(this.#routes, "cna_gamer_services_dispatcher_get_is_initialized");
  }

  public override updateGamerServices(): void {
    this.#routes.invoke("cna_gamer_services_dispatcher_update");
  }

  public override getGamerServicesWindowHandle(): bigint {
    return this.#routes.outU64("cna_gamer_services_dispatcher_get_window_handle");
  }

  public override setGamerServicesWindowHandle(handle: bigint): void {
    this.#routes.invoke("cna_gamer_services_dispatcher_set_window_handle", handle);
  }

  // ---- Guide state ---------------------------------------------------------------------------

  public override getGuideIsVisible(): boolean {
    return outBool(this.#routes, "cna_guide_get_is_visible");
  }

  public override getGuideIsTrialMode(): boolean {
    return outBool(this.#routes, "cna_guide_get_is_trial_mode");
  }

  public override getGuideSimulateTrialMode(): boolean {
    return outBool(this.#routes, "cna_guide_get_simulate_trial_mode");
  }

  public override setGuideSimulateTrialMode(value: boolean): void {
    this.#routes.invoke("cna_guide_set_simulate_trial_mode", value ? 1 : 0);
  }

  public override getGuideIsScreenSaverEnabled(): boolean {
    return outBool(this.#routes, "cna_guide_get_is_screen_saver_enabled");
  }

  public override setGuideIsScreenSaverEnabled(value: boolean): void {
    this.#routes.invoke("cna_guide_set_is_screen_saver_enabled", value ? 1 : 0);
  }

  public override getGuideNotificationPosition(): number {
    return this.#routes.outU32("cna_guide_get_notification_position");
  }

  public override setGuideNotificationPosition(position: number): void {
    this.#routes.invoke("cna_guide_set_notification_position", Math.trunc(position));
  }

  // ---- the message box -----------------------------------------------------------------------

  /**
   * Shows CNA's message box and returns the token `guideEndShowMessageBox` consumes.
   *
   * The captions are an array of `CNA_StringView`, each pointing at its own copy; both the array
   * and the copies live until the route returns, because CNA copies what it needs. The rooted
   * callback outlives the call and is released by `End`.
   */
  public override guideBeginShowMessageBox(
    player: number, title: string, text: string, buttons: readonly string[],
    focusButton: number, icon: number, onCompleted: () => void,
  ): unknown {
    if (buttons.length === 0) throw new RangeError("a message box needs at least one button");
    const continuation = this.#continuation(onCompleted);
    const scope = this.#routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_StringView;
      const array = scope.allocate(layout.size * buttons.length);
      buttons.forEach((caption, index) => {
        const bytes = scope.allocateUtf8(caption);
        const view = new WasmStruct(
          this.#routes.module, "CNA_StringView", array + layout.size * index,
        );
        view.setPointer("data", bytes.pointer);
        view.setU64("byte_length", BigInt(bytes.byteLength));
      });
      const titleView = this.#stringView(scope, title);
      const textView = this.#stringView(scope, text);
      this.#routes.invoke(
        "cna_guide_begin_show_message_box",
        Math.trunc(player), titleView, textView, array, BigInt(buttons.length),
        Math.trunc(focusButton), Math.trunc(icon), continuation.FunctionPointer, 0,
      );
      return continuation;
    } catch (error) {
      this.#release(continuation);
      throw error;
    } finally {
      scope.dispose();
    }
  }

  /** The chosen button, or `null` for a box dismissed without one. Consumes the token. */
  public override guideEndShowMessageBox(token: unknown): number | null {
    const continuation = this.#consume(token);
    const scope = this.#routes.scope();
    try {
      const hasChoice = scope.allocate(4);
      const button = scope.allocate(4);
      this.#routes.invoke("cna_guide_end_show_message_box", hasChoice, button);
      const view = this.#routes.view();
      const answer = view.getUint8(hasChoice) === 0 ? null : view.getInt32(button, true);
      this.#release(continuation);
      return answer;
    } finally {
      scope.dispose();
    }
  }

  public override guideHasPendingMessageBox(): boolean {
    return outBool(this.#routes, "cna_guide_get_has_pending_message_box_ext");
  }

  public override guidePendingMessageBoxFocusButton(): number {
    return outI32(this.#routes, "cna_guide_get_pending_message_box_focus_button_ext");
  }

  public override guideSimulateMessageBoxClick(buttonIndex: number): void {
    this.#routes.invoke("cna_guide_simulate_message_box_click_ext", Math.trunc(buttonIndex));
  }

  // ---- keyboard input ------------------------------------------------------------------------

  public override guideBeginShowKeyboardInput(
    player: number, title: string, description: string, defaultText: string,
    usePasswordMode: boolean, onCompleted: () => void,
  ): unknown {
    const continuation = this.#continuation(onCompleted);
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_guide_begin_show_keyboard_input",
        Math.trunc(player),
        this.#stringView(scope, title),
        this.#stringView(scope, description),
        this.#stringView(scope, defaultText),
        usePasswordMode ? 1 : 0,
        continuation.FunctionPointer, 0,
      );
      return continuation;
    } catch (error) {
      this.#release(continuation);
      throw error;
    } finally {
      scope.dispose();
    }
  }

  /**
   * The entered text, or `null` when the entry was cancelled.
   *
   * Cancellation is asked *before* the text is read: a cancelled entry still has a size, and
   * reading it would turn "the player pressed Back" into an empty string, which is what a game
   * treats as a deliberately blank name.
   */
  public override guideEndShowKeyboardInput(token: unknown): string | null {
    const continuation = this.#consume(token);
    try {
      const cancelled = outBool(this.#routes, "cna_guide_was_keyboard_input_canceled_ext");
      if (cancelled) return null;
      return this.#routes.copyString(
        "cna_guide_end_show_keyboard_input_size", "cna_guide_end_show_keyboard_input",
      );
    } finally {
      this.#release(continuation);
    }
  }

  public override guideHasPendingKeyboardInput(): boolean {
    return outBool(this.#routes, "cna_guide_get_has_pending_keyboard_input_ext");
  }

  public override guideWasKeyboardInputCanceled(): boolean {
    return outBool(this.#routes, "cna_guide_was_keyboard_input_canceled_ext");
  }

  public override guidePendingKeyboardInputTitle(): string {
    return this.#routes.copyString(
      "cna_guide_get_pending_keyboard_input_title_size_ext",
      "cna_guide_copy_pending_keyboard_input_title_ext",
    );
  }

  public override guidePendingKeyboardInputDescription(): string {
    return this.#routes.copyString(
      "cna_guide_get_pending_keyboard_input_description_size_ext",
      "cna_guide_copy_pending_keyboard_input_description_ext",
    );
  }

  public override guidePendingKeyboardInputDisplayText(): string {
    return this.#routes.copyString(
      "cna_guide_get_pending_keyboard_input_display_text_size_ext",
      "cna_guide_copy_pending_keyboard_input_display_text_ext",
    );
  }

  public override guideSimulateKeyboardInputCancel(): void {
    this.#routes.invoke("cna_guide_simulate_keyboard_input_cancel_ext");
  }

  public override guideResetPendingKeyboardInput(): void {
    this.#routes.invoke("cna_guide_reset_pending_keyboard_input_ext");
  }

  // ---- continuations -------------------------------------------------------------------------

  /** Roots a completion handler in the module's function table and records it as live. */
  #continuation(onCompleted: () => void): GuideContinuation {
    const continuation: GuideContinuation = {
      FunctionPointer: 0, Completed: false, Ended: false,
    };
    // The handler closes over `continuation`, so the object CNA's callback marks completed is the
    // object handed back to the caller, and the pointer is filled in on that same object.
    continuation.FunctionPointer = this.#routes.module.addFunction(
      ((_context: number): void => {
        continuation.Completed = true;
        // A JavaScript exception must never unwind into compiled C, and CNA calls this from
        // inside its own dialog dispatch, so a throwing handler is reported out of band.
        try {
          onCompleted();
        } catch (error) {
          queueMicrotask(() => { throw error; });
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_GamerAsyncCallback,
    );
    this.#live.add(continuation);
    return continuation;
  }

  /** The continuation a token names, refusing anything this backend did not issue or already ended. */
  #consume(token: unknown): GuideContinuation {
    const continuation = token as GuideContinuation | null;
    if (continuation === null || typeof continuation !== "object" || !this.#live.has(continuation)) {
      throw new TypeError("expected a Guide continuation token");
    }
    if (continuation.Ended) {
      throw new Error("this Guide operation has already been completed");
    }
    continuation.Ended = true;
    return continuation;
  }

  #release(continuation: GuideContinuation): void {
    if (!this.#live.delete(continuation)) return;
    this.#routes.module.removeFunction(continuation.FunctionPointer);
  }

  /** A `CNA_StringView` in a caller's scope, for the routes that take several at once. */
  #stringView(scope: ReturnType<WasmRouteTable["scope"]>, value: string): number {
    const bytes = scope.allocateUtf8(value);
    const view = allocateStruct(this.#routes.module, scope, "CNA_StringView", false);
    view.setPointer("data", bytes.pointer);
    view.setU64("byte_length", BigInt(bytes.byteLength));
    return view.pointer;
  }
}
