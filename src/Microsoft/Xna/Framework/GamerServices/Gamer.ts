// SPDX-License-Identifier: MS-PL

import type { AsyncCallback, IAsyncResult, IDisposable } from "../Contracts.js";
import { EventDispatcher } from "../../../../internal/events.js";
import type { XnaEvent } from "../Contracts.js";
import type { Microphone } from "../Audio/Microphone.js";
import type { PlayerIndex } from "../PlayerIndex.js";
import type { AchievementCollection, GameDefaults, GamerPresence, GamerPrivileges, GamerProfile } from "./GamerValues.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";
import type { LeaderboardWriter } from "./Leaderboards.js";
import type { SignedInEventArgs, SignedOutEventArgs } from "./EventArgs.js";
import {
  createGamerCollectionEnumerator,
  GamerCollectionEnumerator as NestedGamerCollectionEnumerator,
  type GamerCollectionEnumerator,
} from "./GamerCollection/GamerCollectionEnumerator.js";

/**
 * The gamer identities gamer services publishes, and the collections that hold them.
 *
 * Every operation that needs the platform refuses with `GamerServicesNotAvailableException`, which
 * is the exception XNA itself raises where gamer services are absent -- not a binding-specific
 * error. What works without a platform works here: an empty `SignedInGamers` collection, the event
 * subscriptions, and the value shapes.
 */

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/**
 * The backing arrays of the gamer collections, held outside the class so no public member exposes
 * them. XNA's collections are filled by the platform and never by a game.
 */
const collectionItems = new WeakMap<GamerCollection<Gamer>, readonly Gamer[]>();

/** Internal: the items one gamer collection holds. */
export function gamerCollectionItemsForInternalUse<T extends Gamer>(
  collection: GamerCollection<T>,
): readonly T[] {
  return (collectionItems.get(collection as GamerCollection<Gamer>) ?? []) as readonly T[];
}

/** One gamer the platform knows about. Games never construct these. */
export abstract class Gamer {
  #displayName = "";
  #gamertag = "";
  #disposed = false;
  #tag: unknown = null;

  /** Every gamer signed in on this machine. Empty where no platform is present. */
  public static get SignedInGamers(): SignedInGamerCollection {
    return signedInGamers;
  }

  /**
   * The gamer's display name. XNA declares a protected setter; the projection keeps the more
   * visible accessor, which is the public getter.
   */
  public get DisplayName(): string { return this.#displayName; }

  /** The gamer's unique tag. */
  public get Gamertag(): string { return this.#gamertag; }

  /** Whether the gamer object has been released by the platform. */
  public get IsDisposed(): boolean { return this.#disposed; }

  /** The leaderboard writer for the session this gamer is in. */
  public get LeaderboardWriter(): LeaderboardWriter { return requirePlatform(); }

  /** A game-owned object carried alongside the gamer. */
  public get Tag(): unknown { return this.#tag; }
  public set Tag(value: unknown) { this.#tag = value; }

  /** Begins resolving a gamer from a tag. */
  public static BeginGetFromGamertag(
    gamertag: string, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult { return requirePlatform(); }

  /** Completes a `BeginGetFromGamertag` operation. */
  public static EndGetFromGamertag(result: IAsyncResult): Gamer { return requirePlatform(); }

  /** Resolves a gamer from a tag. */
  public static GetFromGamertag(gamertag: string): Gamer { return requirePlatform(); }

  /** Begins acquiring a partner token for an audience. */
  public static BeginGetPartnerToken(
    audienceUri: string, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult { return requirePlatform(); }

  /** Completes a `BeginGetPartnerToken` operation. */
  public static EndGetPartnerToken(result: IAsyncResult): string { return requirePlatform(); }

  /** Acquires a partner token for an audience. */
  public static GetPartnerToken(audienceUri: string): string { return requirePlatform(); }

  /** Begins reading this gamer's public profile. */
  public BeginGetProfile(callback: AsyncCallback, asyncState: unknown): IAsyncResult {
    return requirePlatform();
  }

  /** Completes a `BeginGetProfile` operation. */
  public EndGetProfile(result: IAsyncResult): GamerProfile { return requirePlatform(); }

  /** Reads this gamer's public profile. */
  public GetProfile(): GamerProfile { return requirePlatform(); }

  /** The gamer's tag, matching XNA's `ToString`. */
  public ToString(): string { return this.#gamertag; }
}

/** A read-only collection of gamers. */
export class GamerCollection<T extends Gamer> implements Iterable<Gamer>, Iterable<T> {
  /** How many gamers the collection holds. */
  public get Count(): number { return gamerCollectionItemsForInternalUse(this).length; }

  /** The gamer at an index. XNA's indexer, under the package's one indexer rule. */
  public Get(index: number): T {
    const items = gamerCollectionItemsForInternalUse(this);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      throw new RangeError("index is outside the collection");
    }
    return items[index] as T;
  }

  /** Whether a gamer is in the collection. */
  public Contains(item: T): boolean { return gamerCollectionItemsForInternalUse(this).includes(item); }

  /** Where a gamer sits in the collection, or -1. */
  public IndexOf(item: T): number { return gamerCollectionItemsForInternalUse(this).indexOf(item); }

  /** Copies the collection into an array. */
  public CopyTo(array: T[], arrayIndex: number): void {
    const items = gamerCollectionItemsForInternalUse(this);
    if (array == null) throw new TypeError("array is required");
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) throw new RangeError("arrayIndex is negative");
    if (arrayIndex + items.length > array.length) throw new RangeError("the array is too small");
    items.forEach((item, offset) => { array[arrayIndex + offset] = item; });
  }

  /** Walks the collection. */
  public GetEnumerator(): GamerCollectionEnumerator<T> { return createGamerCollectionEnumerator(this); }

  /** Language support: the same walk through the JavaScript iteration protocol. */
  public [Symbol.iterator](): IterableIterator<T> {
    return gamerCollectionItemsForInternalUse(this)[Symbol.iterator]();
  }
}

// The nested identity XNA declares inside the collection, attached the same way the model
// collections attach theirs so `GamerCollection.GamerCollectionEnumerator` resolves at runtime.
export namespace GamerCollection {
  export const GamerCollectionEnumerator = NestedGamerCollectionEnumerator;
}

/** A gamer on this machine's friends list. */
export class FriendGamer extends Gamer {
  #friendRequestReceivedFrom = false;
  #friendRequestSentTo = false;
  #hasVoice = false;
  #inviteAccepted = false;
  #inviteReceivedFrom = false;
  #inviteRejected = false;
  #inviteSentTo = false;
  #isAway = false;
  #isBusy = false;
  #isJoinable = false;
  #isOnline = false;
  #isPlaying = false;
  #presence = "";

  /** Whether this friend has sent a friend request. */
  public get FriendRequestReceivedFrom(): boolean { return this.#friendRequestReceivedFrom; }
  /** Whether a friend request has been sent to this friend. */
  public get FriendRequestSentTo(): boolean { return this.#friendRequestSentTo; }
  /** Whether the friend has a voice device. */
  public get HasVoice(): boolean { return this.#hasVoice; }
  /** Whether the friend accepted an invitation. */
  public get InviteAccepted(): boolean { return this.#inviteAccepted; }
  /** Whether the friend sent an invitation. */
  public get InviteReceivedFrom(): boolean { return this.#inviteReceivedFrom; }
  /** Whether the friend rejected an invitation. */
  public get InviteRejected(): boolean { return this.#inviteRejected; }
  /** Whether an invitation was sent to the friend. */
  public get InviteSentTo(): boolean { return this.#inviteSentTo; }
  /** Whether the friend is away. */
  public get IsAway(): boolean { return this.#isAway; }
  /** Whether the friend is busy. */
  public get IsBusy(): boolean { return this.#isBusy; }
  /** Whether the friend's session can be joined. */
  public get IsJoinable(): boolean { return this.#isJoinable; }
  /** Whether the friend is online. */
  public get IsOnline(): boolean { return this.#isOnline; }
  /** Whether the friend is playing a title. */
  public get IsPlaying(): boolean { return this.#isPlaying; }
  /** The friend's published presence string. */
  public get Presence(): string { return this.#presence; }
}

/** The friends of one signed-in gamer. */
export class FriendCollection extends GamerCollection<FriendGamer> implements IDisposable {
  #disposed = false;

  /** Whether the collection has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }

  /** Releases the collection. */
  public Dispose(): void { this.#disposed = true; }
}

/** A gamer signed in on this machine. */
export class SignedInGamer extends Gamer {
  static readonly #signedIn = new EventDispatcher<unknown, SignedInEventArgs>();
  static readonly #signedOut = new EventDispatcher<unknown, SignedOutEventArgs>();
  #isGuest = false;
  #isSignedInToLive = false;
  #partySize = 0;
  #playerIndex = 0 as PlayerIndex;

  /** Raised when any gamer signs in. */
  public static readonly SignedIn: XnaEvent<unknown, SignedInEventArgs> = SignedInGamer.#signedIn;
  /** Raised when any gamer signs out. */
  public static readonly SignedOut: XnaEvent<unknown, SignedOutEventArgs> = SignedInGamer.#signedOut;

  /** Whether the gamer is a guest of another profile. */
  public get IsGuest(): boolean { return this.#isGuest; }
  /** Whether the gamer is signed in to the online service. */
  public get IsSignedInToLive(): boolean { return this.#isSignedInToLive; }
  /** How many gamers are in the party. XNA's protected setter is not part of the projection. */
  public get PartySize(): number { return this.#partySize; }
  /** The controller slot this gamer signed in on. */
  public get PlayerIndex(): PlayerIndex { return this.#playerIndex; }

  /** The platform's gameplay preferences for this gamer. */
  public get GameDefaults(): GameDefaults { return requirePlatform(); }
  /** The presence this gamer publishes. */
  public get Presence(): GamerPresence { return requirePlatform(); }
  /** What the platform permits this gamer to do. */
  public get Privileges(): GamerPrivileges { return requirePlatform(); }

  /** Awards an achievement to this gamer. */
  public AwardAchievement(achievementKey: string): void { requirePlatform(); }
  /** Begins awarding an achievement. */
  public BeginAwardAchievement(
    achievementKey: string, callback: AsyncCallback, state: unknown,
  ): IAsyncResult { return requirePlatform(); }
  /** Completes a `BeginAwardAchievement` operation. */
  public EndAwardAchievement(result: IAsyncResult): void { requirePlatform(); }
  /** Begins reading this gamer's achievements. */
  public BeginGetAchievements(callback: AsyncCallback, asyncState: unknown): IAsyncResult {
    return requirePlatform();
  }
  /** Completes a `BeginGetAchievements` operation. */
  public EndGetAchievements(result: IAsyncResult): AchievementCollection { return requirePlatform(); }
  /** Reads this gamer's achievements. */
  public GetAchievements(): AchievementCollection { return requirePlatform(); }
  /** Reads this gamer's friends. */
  public GetFriends(): FriendCollection { return requirePlatform(); }
  /** Whether another gamer is a friend of this one. */
  public IsFriend(gamer: Gamer): boolean { return requirePlatform(); }
  /** Whether a microphone belongs to this gamer's headset. */
  public IsHeadset(microphone: Microphone): boolean { return requirePlatform(); }
}

/** Every gamer signed in on this machine. */
export class SignedInGamerCollection extends GamerCollection<SignedInGamer> {
  /** The gamer signed in on a controller slot, or the one at an index. */
  public override Get(index: PlayerIndex): SignedInGamer;
  /** The gamer at an index. */
  public override Get(index: number): SignedInGamer;
  public override Get(index: number | PlayerIndex): SignedInGamer {
    // Both XNA overloads take one integer. The slot lookup is the meaningful one and cannot be
    // told from a positional index at runtime, so the slot is what a caller gets.
    const items = gamerCollectionItemsForInternalUse(this);
    const found = items.find((gamer) => gamer.PlayerIndex === index);
    if (found) return found;
    return super.Get(index as number);
  }
}

const signedInGamers = new SignedInGamerCollection();
