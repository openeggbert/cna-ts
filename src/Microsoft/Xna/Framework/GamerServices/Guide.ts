// SPDX-License-Identifier: MS-PL

import type { AsyncCallback, IAsyncResult } from "../Contracts.js";
import type { PlayerIndex } from "../PlayerIndex.js";
import { TimeSpan } from "../TimeSpan.js";
import type { Gamer } from "./Gamer.js";
import { MessageBoxIcon, NotificationPosition } from "./Enums.js";
import { getBackend } from "../../../../internal/backend.js";
import type { CnaGamerServicesBackend } from "../../../../internal/backend.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";
import {
  ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, InvalidOperationException,
} from "../../../../internal/exceptions.js";

/**
 * A pending Guide operation.
 *
 * XNA's `IAsyncResult` shape over CNA's two genuinely asynchronous routes: the operation stays
 * pending until it is answered, and only then does the continuation run. `CompletedSynchronously`
 * is false because it never completes inside the `Begin` call that started it — on a host with no
 * user, what answers it is CNA's own deterministic completion.
 */
class GuideAsyncResult implements IAsyncResult {
  public readonly CompletedSynchronously = false;
  public IsCompleted = false;
  public constructor(
    public readonly AsyncState: unknown,
    public readonly Kind: "messageBox" | "keyboardInput",
    public readonly Token: unknown,
  ) {}
}

function guideServices(operation: string): CnaGamerServicesBackend {
  const backend = getBackend().GamerServices;
  if (!backend) throw new GamerServicesNotAvailableException();
  void operation;
  return backend;
}

function guideResult(
  value: IAsyncResult, kind: "messageBox" | "keyboardInput", label: string,
): GuideAsyncResult {
  if (!(value instanceof GuideAsyncResult) || value.Kind !== kind) {
    throw new ArgumentException(`${label} received an unrelated async result`);
  }
  if (!value.IsCompleted) {
    throw new InvalidOperationException(`${label} must be called after the operation completes`);
  }
  return value;
}

function guideText(value: unknown, name: string): string {
  if (typeof value !== "string") throw new ArgumentNullException(name);
  return value;
}

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/**
 * The Guide state CNA holds, when a backend is loaded.
 *
 * These four are title state rather than platform screens -- XNA answers them with no gamer
 * services too -- so they keep working backendless, out of the managed fields below. What changes
 * with a backend is *where* the state lives: CNA's, so a native component and this class cannot
 * drift apart.
 */
function services(): CnaGamerServicesBackend | undefined {
  return getBackend().GamerServices;
}

/**
 * The platform guide: its screens, its notification placement, and the trial-mode state a game
 * branches on.
 *
 * A static class in XNA and a static class here. The properties that are state rather than screens
 * -- notification position, the screen-saver flag, the trial-mode simulation switch -- work with no
 * platform, because they do in XNA too. Everything that puts a screen in front of the player needs
 * one and says so.
 *
 * With a CNA backend that state lives in CNA rather than here, so a native gamer-services component
 * and this class cannot drift apart. Two of them are not title state at all once CNA holds them:
 * `IsVisible` is whether CNA has a pending guide screen, and `IsScreenSaverEnabled` is a platform
 * *display* property, so on a host with no displays the getter answers `true` and a write does not
 * take. Reporting what the platform says beats reporting what it was told.
 */
export abstract class Guide {
  static #isScreenSaverEnabled = true;
  static #notificationPosition = NotificationPosition.BottomCenter;
  static #simulateTrialMode = false;
  static #isVisible = false;
  static #isTrialMode = false;

  /**
   * Whether the platform's screen saver may start while the game runs.
   *
   * A platform display property once a CNA backend is loaded, not a cached flag: a host with no
   * displays answers `true` and ignores a write, and this reports that rather than the write.
   */
  public static get IsScreenSaverEnabled(): boolean {
    return services()?.getGuideIsScreenSaverEnabled() ?? Guide.#isScreenSaverEnabled;
  }
  public static set IsScreenSaverEnabled(value: boolean) {
    Guide.#isScreenSaverEnabled = Boolean(value);
    services()?.setGuideIsScreenSaverEnabled(Guide.#isScreenSaverEnabled);
  }

  /**
   * Whether the title is running as a trial. XNA declares a protected setter; the projection keeps
   * the public getter, and `SimulateTrialMode` is the public way to exercise the trial path.
   */
  public static get IsTrialMode(): boolean {
    // XNA's SimulateTrialMode exists so a full title can be *made* to report a trial, so its
    // IsTrialMode is the disjunction. CNA keeps the two apart -- measured, not assumed:
    // `cna_guide_get_is_trial_mode` answers false with the simulation on -- so the combination is
    // made here rather than assumed of the runtime.
    const backend = services();
    if (!backend) return Guide.#isTrialMode || Guide.#simulateTrialMode;
    return backend.getGuideIsTrialMode() || backend.getGuideSimulateTrialMode();
  }

  /** Whether a guide screen is currently in front of the player. */
  public static get IsVisible(): boolean {
    return services()?.getGuideIsVisible() ?? Guide.#isVisible;
  }

  /** Where the platform draws its notification popups. */
  public static get NotificationPosition(): NotificationPosition {
    return (services()?.getGuideNotificationPosition() as NotificationPosition | undefined)
      ?? Guide.#notificationPosition;
  }
  public static set NotificationPosition(value: NotificationPosition) {
    Guide.#notificationPosition = value;
    services()?.setGuideNotificationPosition(value);
  }

  /** Makes a full title behave as a trial, for testing the trial path. */
  public static get SimulateTrialMode(): boolean {
    return services()?.getGuideSimulateTrialMode() ?? Guide.#simulateTrialMode;
  }
  public static set SimulateTrialMode(value: boolean) {
    Guide.#simulateTrialMode = Boolean(value);
    services()?.setGuideSimulateTrialMode(Guide.#simulateTrialMode);
  }

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
    // Two overloads, and the second is the first with the password flag: XNA's own shape, so the
    // arity is what tells them apart rather than a sniffed argument type.
    const [player, title, description, defaultText, callback, state, usePasswordMode] = _values as [
      PlayerIndex, string, string, string, AsyncCallback, unknown, boolean | undefined,
    ];
    const backend = guideServices("Guide.BeginShowKeyboardInput");
    const result = { current: null as GuideAsyncResult | null };
    const token = backend.guideBeginShowKeyboardInput(
      player as unknown as number,
      guideText(title, "title"),
      guideText(description, "description"),
      guideText(defaultText, "defaultText"),
      usePasswordMode === true,
      () => {
        const pending = result.current;
        if (!pending) return;
        pending.IsCompleted = true;
        callback?.(pending);
      },
    );
    result.current = new GuideAsyncResult(state, "keyboardInput", token);
    return result.current;
  }

  /**
   * Completes a `BeginShowKeyboardInput` operation. XNA declares this `string`; the CLR value is
   * null where the player cancelled, which the projection does not widen the signature to say.
   */
  public static EndShowKeyboardInput(result: IAsyncResult): string {
    const pending = guideResult(result, "keyboardInput", "Guide.EndShowKeyboardInput");
    // Null where the player cancelled. XNA declares `string` and returns the CLR null, which the
    // note above says this projection does not widen the signature for.
    return guideServices("Guide.EndShowKeyboardInput")
      .guideEndShowKeyboardInput(pending.Token) as string;
  }

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
    // The player-less overload has seven arguments and the other eight, which is how XNA itself
    // distinguishes them. CNA takes a player either way and ignores it, exactly as the canonical
    // implementation does.
    const withPlayer = _values.length >= 8;
    const [player, title, text, buttons, focusButton, icon, callback, state] = (
      withPlayer ? _values : [0, ..._values]
    ) as [PlayerIndex, string, string, Iterable<string>, number, MessageBoxIcon, AsyncCallback, unknown];
    if (buttons == null) throw new ArgumentNullException("buttons");
    const captions = [...buttons];
    if (captions.length === 0) {
      throw new ArgumentException("A message box needs at least one button caption");
    }
    for (const caption of captions) {
      if (typeof caption !== "string") throw new ArgumentNullException("buttons");
    }
    if (!Number.isInteger(focusButton) || focusButton < 0 || focusButton >= captions.length) {
      throw new ArgumentOutOfRangeException("focusButton");
    }
    const backend = guideServices("Guide.BeginShowMessageBox");
    const result = { current: null as GuideAsyncResult | null };
    const token = backend.guideBeginShowMessageBox(
      player as unknown as number,
      guideText(title, "title"),
      guideText(text, "text"),
      captions,
      focusButton,
      icon as unknown as number,
      () => {
        const pending = result.current;
        if (!pending) return;
        pending.IsCompleted = true;
        callback?.(pending);
      },
    );
    result.current = new GuideAsyncResult(state, "messageBox", token);
    return result.current;
  }

  /**
   * Completes a `BeginShowMessageBox` operation. Null where the player dismissed the box without
   * choosing, which is `Nullable<int>`'s null in XNA rather than a sentinel index.
   */
  public static EndShowMessageBox(result: IAsyncResult): number | null {
    const pending = guideResult(result, "messageBox", "Guide.EndShowMessageBox");
    return guideServices("Guide.EndShowMessageBox").guideEndShowMessageBox(pending.Token);
  }

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
