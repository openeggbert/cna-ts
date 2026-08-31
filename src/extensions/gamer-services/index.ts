// SPDX-License-Identifier: MS-PL

/**
 * CNA's deterministic Guide surface: what a pending Guide screen holds, and how to answer it.
 *
 * XNA's `Guide.BeginShowMessageBox` and `Guide.BeginShowKeyboardInput` are the only genuinely
 * asynchronous operations in the framework — the screen stays up until the player answers, and
 * only then does the continuation run. On a real platform the platform draws that screen and the
 * player answers it. CNA draws it itself, which is why it has two things XNA does not: a way to
 * ask what is pending so a game can render it, and a way to answer it deterministically.
 *
 * None of this fabricates a gamer, a sign-in or a peer. What it does is complete an operation the
 * XNA API really started, through the route CNA really uses — the same injection shape the sensors
 * and the camera use, and the reason `Guide.EndShowMessageBox` can be tested at all on a machine
 * with no player.
 *
 * These are modern CNA APIs and they live outside `Microsoft.Xna.Framework` accordingly.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaGamerServicesBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";

function services(operation: string): CnaGamerServicesBackend {
  const backend = getBackend().GamerServices;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the gamer-services routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

/** What a pending message box is showing, for a game that draws the Guide itself. */
export interface PendingMessageBox {
  /** Which button starts focused, as {@link Microsoft.Xna.Framework.GamerServices.Guide} was told. */
  readonly FocusButton: number;
}

/** What a pending keyboard input is showing. */
export interface PendingKeyboardInput {
  readonly Title: string;
  readonly Description: string;
  /** The text the input currently holds — what it started with until the player edits it. */
  readonly DisplayText: string;
}

/**
 * The Guide screens CNA is drawing, and how to answer them.
 *
 * A game that draws its own Guide asks {@link CnaGuide.PendingMessageBox} what to draw; a test
 * answers it with {@link CnaGuide.ForTests}. Both go through CNA rather than through this package,
 * so what a test proves is what a player would get.
 */
export const CnaGuide = {
  /** Whether a message box is waiting to be answered. */
  get HasPendingMessageBox(): boolean {
    return services("CnaGuide.HasPendingMessageBox").guideHasPendingMessageBox();
  },

  /** What that message box is showing, or `null` when there is none. */
  get PendingMessageBox(): PendingMessageBox | null {
    const backend = services("CnaGuide.PendingMessageBox");
    if (!backend.guideHasPendingMessageBox()) return null;
    return Object.freeze({ FocusButton: backend.guidePendingMessageBoxFocusButton() });
  },

  /** Whether an on-screen keyboard is waiting to be answered. */
  get HasPendingKeyboardInput(): boolean {
    return services("CnaGuide.HasPendingKeyboardInput").guideHasPendingKeyboardInput();
  },

  /** What that keyboard input is showing, or `null` when there is none. */
  get PendingKeyboardInput(): PendingKeyboardInput | null {
    const backend = services("CnaGuide.PendingKeyboardInput");
    if (!backend.guideHasPendingKeyboardInput()) return null;
    return Object.freeze({
      Title: backend.guidePendingKeyboardInputTitle(),
      Description: backend.guidePendingKeyboardInputDescription(),
      DisplayText: backend.guidePendingKeyboardInputDisplayText(),
    });
  },

  /** Whether the last completed keyboard input was cancelled rather than confirmed. */
  get WasKeyboardInputCanceled(): boolean {
    return services("CnaGuide.WasKeyboardInputCanceled").guideWasKeyboardInputCanceled();
  },

  /**
   * CNA's own deterministic answers.
   *
   * These complete an operation the XNA API started, through CNA's own completion path — the
   * continuation runs and `Guide.EndShow*` reads the answer exactly as it would after a player
   * pressed a button. They refuse when nothing is pending, so a test cannot invent an answer to a
   * screen that was never shown.
   */
  ForTests: {
    /** Answers a pending message box as if the player chose that button. */
    ClickMessageBoxButton(buttonIndex: number): void {
      if (!Number.isInteger(buttonIndex) || buttonIndex < 0) {
        throw new RangeError("buttonIndex must be a non-negative integer");
      }
      services("CnaGuide.ForTests.ClickMessageBoxButton")
        .guideSimulateMessageBoxClick(buttonIndex);
    },

    /** Answers a pending keyboard input as if the player cancelled it. */
    CancelKeyboardInput(): void {
      services("CnaGuide.ForTests.CancelKeyboardInput").guideSimulateKeyboardInputCancel();
    },

    /** Drops a pending keyboard input without completing it. */
    ResetKeyboardInput(): void {
      services("CnaGuide.ForTests.ResetKeyboardInput").guideResetPendingKeyboardInput();
    },
  },
} as const;
