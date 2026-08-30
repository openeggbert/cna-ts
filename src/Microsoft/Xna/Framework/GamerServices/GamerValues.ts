// SPDX-License-Identifier: MS-PL

import type { Color } from "../Color.js";
import type { IDisposable } from "../Contracts.js";
import {
  ControllerSensitivity,
  GameDifficulty,
  GamerPresenceMode,
  GamerPrivilegeSetting,
  GamerZone,
  RacingCameraAngle,
} from "./Enums.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";

/**
 * The value objects gamer services hand a game: an achievement, a profile, the platform's
 * game-defaults and privilege answers, and the presence a gamer publishes.
 *
 * None of these has a public constructor in XNA and none has one here. They exist because the
 * platform produced them, so a game receives them from `SignedInGamer` and never makes one.
 */

const platformOwned = Symbol("cna-ts.gamerServices.platformOwned");

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/** One achievement the platform knows about, earned or not. */
export class Achievement {
  #key = "";
  #name = "";
  #description = "";
  #howToEarn = "";
  #gamerScore = 0;
  #isEarned = false;
  #earnedOnline = false;
  #displayBeforeEarned = false;
  #earnedDateTime = new Date(0);

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** The platform's stable identifier for this achievement. */
  public get Key(): string { return this.#key; }
  /** The achievement's display name. */
  public get Name(): string { return this.#name; }
  /** The achievement's display description. */
  public get Description(): string { return this.#description; }
  /** What the gamer has to do to earn it. */
  public get HowToEarn(): string { return this.#howToEarn; }
  /** The gamerscore the achievement is worth. */
  public get GamerScore(): number { return this.#gamerScore; }
  /** Whether this gamer has earned it. */
  public get IsEarned(): boolean { return this.#isEarned; }
  /** Whether it was earned while signed in to the online service. */
  public get EarnedOnline(): boolean { return this.#earnedOnline; }
  /** Whether the platform shows its details before it is earned. */
  public get DisplayBeforeEarned(): boolean { return this.#displayBeforeEarned; }
  /** When it was earned. */
  public get EarnedDateTime(): Date { return new Date(this.#earnedDateTime.getTime()); }

  /** The achievement's picture as encoded image bytes. */
  public GetPicture(): Uint8Array { return requirePlatform(); }
}

/** The achievements one gamer has, as the platform reported them. */
export class AchievementCollection implements IDisposable {
  readonly #items: readonly Achievement[] = [];
  #disposed = false;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** How many achievements the collection holds. */
  public get Count(): number { return this.#items.length; }
  /** Whether the collection has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }

  /** The achievement at an index. */
  public Get(index: number): Achievement;
  /** The achievement with a key. */
  public Get(achievementKey: string): Achievement;
  public Get(indexOrKey: number | string): Achievement {
    if (typeof indexOrKey === "number") {
      if (!Number.isInteger(indexOrKey) || indexOrKey < 0 || indexOrKey >= this.#items.length) {
        throw new RangeError("index is outside the collection");
      }
      return this.#items[indexOrKey] as Achievement;
    }
    const found = this.#items.find((achievement) => achievement.Key === indexOrKey);
    if (!found) throw new RangeError(`no achievement has the key ${indexOrKey}`);
    return found;
  }

  /** Releases the collection. Disposing twice is harmless, as it is in XNA. */
  public Dispose(): void { this.#disposed = true; }

  /** Walks the collection. */
  public GetEnumerator(): IterableIterator<Achievement> { return this.#items[Symbol.iterator](); }
}

/** The platform's public profile for one gamer. */
export class GamerProfile implements IDisposable {
  #gamerScore = 0;
  #gamerZone = GamerZone.Unknown;
  #motto = "";
  #region = "";
  #reputation = 0;
  #titlesPlayed = 0;
  #totalAchievements = 0;
  #disposed = false;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** The gamer's total gamerscore. */
  public get GamerScore(): number { return this.#gamerScore; }
  /** The zone the gamer plays in. */
  public get GamerZone(): GamerZone { return this.#gamerZone; }
  /** The gamer's motto. */
  public get Motto(): string { return this.#motto; }
  /**
   * The gamer's region. XNA types this as `System.Globalization.RegionInfo`; the projection is the
   * two-letter region name that type is constructed from, because JavaScript's `Intl` has no
   * equivalent object and inventing one would add a type XNA never had.
   */
  public get Region(): string { return this.#region; }
  /** The gamer's reputation, from zero to five. */
  public get Reputation(): number { return this.#reputation; }
  /** How many titles the gamer has played. */
  public get TitlesPlayed(): number { return this.#titlesPlayed; }
  /** How many achievements the gamer has earned across all titles. */
  public get TotalAchievements(): number { return this.#totalAchievements; }
  /** Whether the profile has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }

  /** The gamer's picture as encoded image bytes. */
  public GetGamerPicture(): Uint8Array { return requirePlatform(); }

  /** Releases the profile. */
  public Dispose(): void { this.#disposed = true; }
}

/** The gameplay preferences the platform holds for a gamer, for a game that wants to honour them. */
export class GameDefaults {
  #accelerateWithButtons = false;
  #autoAim = false;
  #autoCenter = false;
  #brakeWithButtons = false;
  #controllerSensitivity = ControllerSensitivity.Medium;
  #gameDifficulty = GameDifficulty.Normal;
  #invertYAxis = false;
  #manualTransmission = false;
  #moveWithRightThumbStick = false;
  #primaryColor: Color | null = null;
  #racingCameraAngle = RacingCameraAngle.Back;
  #secondaryColor: Color | null = null;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** Whether the gamer prefers accelerating with buttons rather than a trigger. */
  public get AccelerateWithButtons(): boolean { return this.#accelerateWithButtons; }
  /** Whether the gamer prefers aim assistance. */
  public get AutoAim(): boolean { return this.#autoAim; }
  /** Whether the gamer prefers the camera to auto-centre. */
  public get AutoCenter(): boolean { return this.#autoCenter; }
  /** Whether the gamer prefers braking with buttons rather than a trigger. */
  public get BrakeWithButtons(): boolean { return this.#brakeWithButtons; }
  /** The gamer's preferred controller sensitivity. */
  public get ControllerSensitivity(): ControllerSensitivity { return this.#controllerSensitivity; }
  /** The gamer's preferred difficulty. */
  public get GameDifficulty(): GameDifficulty { return this.#gameDifficulty; }
  /** Whether the gamer prefers an inverted vertical axis. */
  public get InvertYAxis(): boolean { return this.#invertYAxis; }
  /** Whether the gamer prefers a manual transmission. */
  public get ManualTransmission(): boolean { return this.#manualTransmission; }
  /** Whether the gamer prefers moving with the right thumbstick. */
  public get MoveWithRightThumbStick(): boolean { return this.#moveWithRightThumbStick; }
  /** The gamer's preferred primary colour, or null where none is set. */
  public get PrimaryColor(): Color | null { return this.#primaryColor; }
  /** The gamer's preferred racing camera angle. */
  public get RacingCameraAngle(): RacingCameraAngle { return this.#racingCameraAngle; }
  /** The gamer's preferred secondary colour, or null where none is set. */
  public get SecondaryColor(): Color | null { return this.#secondaryColor; }
}

/** What the platform permits this gamer to do. */
export class GamerPrivileges {
  #allowCommunication = GamerPrivilegeSetting.Blocked;
  #allowOnlineSessions = false;
  #allowPremiumContent = false;
  #allowProfileViewing = GamerPrivilegeSetting.Blocked;
  #allowPurchaseContent = false;
  #allowTradeContent = false;
  #allowUserCreatedContent = GamerPrivilegeSetting.Blocked;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** Who the gamer may communicate with. */
  public get AllowCommunication(): GamerPrivilegeSetting { return this.#allowCommunication; }
  /** Whether the gamer may join online sessions. */
  public get AllowOnlineSessions(): boolean { return this.#allowOnlineSessions; }
  /** Whether the gamer may use premium content. */
  public get AllowPremiumContent(): boolean { return this.#allowPremiumContent; }
  /** Whose profiles the gamer may view. */
  public get AllowProfileViewing(): GamerPrivilegeSetting { return this.#allowProfileViewing; }
  /** Whether the gamer may purchase content. */
  public get AllowPurchaseContent(): boolean { return this.#allowPurchaseContent; }
  /** Whether the gamer may trade content. */
  public get AllowTradeContent(): boolean { return this.#allowTradeContent; }
  /** Whose user-created content the gamer may see. */
  public get AllowUserCreatedContent(): GamerPrivilegeSetting { return this.#allowUserCreatedContent; }
}

/** The presence a signed-in gamer publishes to friends. */
export class GamerPresence {
  #presenceMode = GamerPresenceMode.None;
  #presenceValue = 0;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** Which of the platform's fixed presence strings the gamer publishes. */
  public get PresenceMode(): GamerPresenceMode { return this.#presenceMode; }
  public set PresenceMode(value: GamerPresenceMode) {
    this.#presenceMode = value;
    requirePlatform();
  }

  /** The number a presence mode that carries one displays. */
  public get PresenceValue(): number { return this.#presenceValue; }
  public set PresenceValue(value: number) {
    this.#presenceValue = Math.trunc(value);
    requirePlatform();
  }
}
