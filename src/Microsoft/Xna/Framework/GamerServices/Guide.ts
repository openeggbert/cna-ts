// SPDX-License-Identifier: MS-PL

import type { AsyncCallback, IAsyncResult } from "../Contracts.js";
import type { PlayerIndex } from "../PlayerIndex.js";
import { TimeSpan } from "../TimeSpan.js";
import type { Gamer } from "./Gamer.js";
import { MessageBoxIcon, NotificationPosition } from "./Enums.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/**
 * The platform guide: its screens, its notification placement, and the trial-mode state a game
 * branches on.
 *
 * A static class in XNA and a static class here. The properties that are local title state --
 * notification position, the screen-saver flag, the trial-mode simulation switch -- work with no
 * platform, because they do in XNA too. Everything that puts a screen in front of the player needs
 * one and says so.
 */
export abstract class Guide {
  static #isScreenSaverEnabled = true;
  static #notificationPosition = NotificationPosition.BottomCenter;
  static #simulateTrialMode = false;
  static #isVisible = false;
  static #isTrialMode = false;

  /** Whether the platform's screen saver may start while the game runs. */
  public static get IsScreenSaverEnabled(): boolean { return Guide.#isScreenSaverEnabled; }
  public static set IsScreenSaverEnabled(value: boolean) { Guide.#isScreenSaverEnabled = Boolean(value); }

  /**
   * Whether the title is running as a trial. XNA declares a protected setter; the projection keeps
   * the public getter, and `SimulateTrialMode` is the public way to exercise the trial path.
   */
  public static get IsTrialMode(): boolean { return Guide.#isTrialMode || Guide.#simulateTrialMode; }

  /** Whether a guide screen is currently in front of the player. */
  public static get IsVisible(): boolean { return Guide.#isVisible; }

  /** Where the platform draws its notification popups. */
  public static get NotificationPosition(): NotificationPosition { return Guide.#notificationPosition; }
  public static set NotificationPosition(value: NotificationPosition) {
    Guide.#notificationPosition = value;
  }

  /** Makes a full title behave as a trial, for testing the trial path. */
  public static get SimulateTrialMode(): boolean { return Guide.#simulateTrialMode; }
  public static set SimulateTrialMode(value: boolean) { Guide.#simulateTrialMode = Boolean(value); }

  /** Holds notification popups back for a while, so they do not cover a cutscene. */
  public static DelayNotifications(delay: TimeSpan): void { requirePlatform(); }

  /** Begins showing the platform's on-screen keyboard. */
  public static BeginShowKeyboardInput(
    player: PlayerIndex, title: string, description: string, defaultText: string,
    callback: AsyncCallback, state: unknown,
  ): IAsyncResult;
  /** Begins showing the platform's on-screen keyboard, optionally masking what is typed. */
  public static BeginShowKeyboardInput(
    player: PlayerIndex, title: string, description: string, defaultText: string,
    callback: AsyncCallback, state: unknown, usePasswordMode: boolean,
  ): IAsyncResult;
  public static BeginShowKeyboardInput(..._values: readonly unknown[]): IAsyncResult {
    return requirePlatform();
  }

  /**
   * Completes a `BeginShowKeyboardInput` operation. XNA declares this `string`; the CLR value is
   * null where the player cancelled, which the projection does not widen the signature to say.
   */
  public static EndShowKeyboardInput(result: IAsyncResult): string { return requirePlatform(); }

  /** Begins showing a message box for whichever player the platform decides. */
  public static BeginShowMessageBox(
    title: string, text: string, buttons: Iterable<string>, focusButton: number,
    icon: MessageBoxIcon, callback: AsyncCallback, state: unknown,
  ): IAsyncResult;
  /** Begins showing a message box for one player. */
  public static BeginShowMessageBox(
    player: PlayerIndex, title: string, text: string, buttons: Iterable<string>,
    focusButton: number, icon: MessageBoxIcon, callback: AsyncCallback, state: unknown,
  ): IAsyncResult;
  public static BeginShowMessageBox(..._values: readonly unknown[]): IAsyncResult {
    return requirePlatform();
  }

  /**
   * Completes a `BeginShowMessageBox` operation. Null where the player dismissed the box without
   * choosing, which is `Nullable<int>`'s null in XNA rather than a sentinel index.
   */
  public static EndShowMessageBox(result: IAsyncResult): number | null { return requirePlatform(); }

  /** Shows the compose-message screen. */
  public static ShowComposeMessage(
    player: PlayerIndex, text: string, recipients: Iterable<Gamer>,
  ): void { requirePlatform(); }
  /** Shows the friend-request screen. */
  public static ShowFriendRequest(player: PlayerIndex, gamer: Gamer): void { requirePlatform(); }
  /** Shows the friends list. */
  public static ShowFriends(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the game-invitation screen for a set of recipients. */
  public static ShowGameInvite(player: PlayerIndex, recipients: Iterable<Gamer>): void;
  /** Shows the game-invitation screen for a session. */
  public static ShowGameInvite(sessionId: string): void;
  public static ShowGameInvite(..._values: readonly unknown[]): void { requirePlatform(); }
  /** Shows a gamer card. */
  public static ShowGamerCard(player: PlayerIndex, gamer: Gamer): void { requirePlatform(); }
  /** Shows the marketplace. */
  public static ShowMarketplace(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the messages screen. */
  public static ShowMessages(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the party screen. */
  public static ShowParty(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the party-sessions screen. */
  public static ShowPartySessions(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the player-review screen. */
  public static ShowPlayerReview(player: PlayerIndex, gamer: Gamer): void { requirePlatform(); }
  /** Shows the players list. */
  public static ShowPlayers(player: PlayerIndex): void { requirePlatform(); }
  /** Shows the sign-in panes. */
  public static ShowSignIn(paneCount: number, onlineOnly: boolean): void { requirePlatform(); }
}
