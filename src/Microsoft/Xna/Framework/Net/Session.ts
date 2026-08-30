// SPDX-License-Identifier: MS-PL

import type { AsyncCallback, IAsyncResult, IDisposable, XnaEvent } from "../Contracts.js";
import { EventDispatcher } from "../../../../internal/events.js";
import { TimeSpan } from "../TimeSpan.js";
import { Gamer, GamerCollection } from "../GamerServices/Gamer.js";
import type { SignedInGamer } from "../GamerServices/Gamer.js";
import { GamerServicesNotAvailableException } from "../GamerServices/Exceptions.js";
import type { InviteAcceptedEventArgs } from "../GamerServices/EventArgs.js";
import { NetworkSessionState, NetworkSessionType, SendDataOptions } from "./Enums.js";
import type {
  GameEndedEventArgs,
  GameStartedEventArgs,
  GamerJoinedEventArgs,
  GamerLeftEventArgs,
  HostChangedEventArgs,
  NetworkSessionEndedEventArgs,
  WriteLeaderboardsEventArgs,
} from "./EventArgs.js";
import type { PacketReader, PacketWriter } from "./Packets.js";

/**
 * `Microsoft.Xna.Framework.Net`: sessions, the gamers in them, the machines behind those gamers,
 * and the sessions a search found.
 *
 * Every operation that needs the platform refuses with `GamerServicesNotAvailableException`, the
 * same exception XNA raises where gamer services are absent. The value shapes, the session-property
 * bag and the event subscriptions work regardless, because they do in XNA too.
 */

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/** The measured quality of a link to a session a search found. */
export class QualityOfService {
  #averageRoundtripTime = TimeSpan.Zero;
  #minimumRoundtripTime = TimeSpan.Zero;
  #bytesPerSecondDownstream = 0;
  #bytesPerSecondUpstream = 0;
  #isAvailable = false;

  /** The average round trip measured to the session's host. */
  public get AverageRoundtripTime(): TimeSpan { return this.#averageRoundtripTime; }
  /** The best round trip measured to the session's host. */
  public get MinimumRoundtripTime(): TimeSpan { return this.#minimumRoundtripTime; }
  /** The measured downstream bandwidth. */
  public get BytesPerSecondDownstream(): number { return this.#bytesPerSecondDownstream; }
  /** The measured upstream bandwidth. */
  public get BytesPerSecondUpstream(): number { return this.#bytesPerSecondUpstream; }
  /** Whether a measurement has completed. Until it has, the other values mean nothing. */
  public get IsAvailable(): boolean { return this.#isAvailable; }
}

/**
 * The eight-slot integer bag a session advertises and a search matches against.
 *
 * Each slot is `Nullable<int>` in XNA: null means "do not match on this", which is a different
 * state from zero, so the projection keeps null rather than folding it into a sentinel.
 */
export class NetworkSessionProperties {
  readonly #values: (number | null)[] = new Array<number | null>(8).fill(null);

  public constructor() {}

  /** How many slots the bag has. Always eight. */
  public get Count(): number { return this.#values.length; }

  /** The slot at an index. */
  public Get(index: number): number | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.#values.length) {
      throw new RangeError("index is outside the property bag");
    }
    return this.#values[index] ?? null;
  }

  /** Writes the slot at an index. Null means "do not match on this slot". */
  public Set(index: number, value: number | null): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#values.length) {
      throw new RangeError("index is outside the property bag");
    }
    this.#values[index] = value == null ? null : Math.trunc(value);
  }

  /** Walks the slots. */
  public GetEnumerator(): IterableIterator<number | null> { return this.#values[Symbol.iterator](); }
}

/** A session a search found, before it is joined. */
export class AvailableNetworkSession {
  #currentGamerCount = 0;
  #hostGamertag = "";
  #openPrivateGamerSlots = 0;
  #openPublicGamerSlots = 0;

  /** How many gamers are already in the session. */
  public get CurrentGamerCount(): number { return this.#currentGamerCount; }
  /** The host's gamertag. */
  public get HostGamertag(): string { return this.#hostGamertag; }
  /** How many private slots are free. */
  public get OpenPrivateGamerSlots(): number { return this.#openPrivateGamerSlots; }
  /** How many public slots are free. */
  public get OpenPublicGamerSlots(): number { return this.#openPublicGamerSlots; }
  /** The measured link quality to this session. */
  public get QualityOfService(): QualityOfService { return requirePlatform(); }
  /** The properties the session advertises. */
  public get SessionProperties(): NetworkSessionProperties { return requirePlatform(); }
}

/** The sessions one search found. */
export class AvailableNetworkSessionCollection
  implements IDisposable, Iterable<AvailableNetworkSession> {
  readonly #items: readonly AvailableNetworkSession[] = [];
  #disposed = false;

  /** How many sessions the search found. */
  public get Count(): number { return this.#items.length; }
  /** Whether the collection has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }
  /** The session at an index. */
  public Get(index: number): AvailableNetworkSession {
    if (!Number.isInteger(index) || index < 0 || index >= this.#items.length) {
      throw new RangeError("index is outside the collection");
    }
    return this.#items[index] as AvailableNetworkSession;
  }

  /** Whether a session is in the collection. */
  public Contains(item: AvailableNetworkSession): boolean { return this.#items.includes(item); }

  /** Where a session sits in the collection, or -1. */
  public IndexOf(item: AvailableNetworkSession): number { return this.#items.indexOf(item); }

  /** Copies the collection into an array. */
  public CopyTo(array: AvailableNetworkSession[], arrayIndex: number): void {
    if (array == null) throw new TypeError("array is required");
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) throw new RangeError("arrayIndex is negative");
    if (arrayIndex + this.#items.length > array.length) throw new RangeError("the array is too small");
    this.#items.forEach((item, offset) => { array[arrayIndex + offset] = item; });
  }

  /** Releases the collection. */
  public Dispose(): void { this.#disposed = true; }

  /** Language support: walks the sessions through the JavaScript iteration protocol. */
  public [Symbol.iterator](): IterableIterator<AvailableNetworkSession> {
    return this.#items[Symbol.iterator]();
  }
}

/** One machine in a session, and the gamers signed in on it. */
export class NetworkMachine {
  /** The gamers on this machine. */
  public get Gamers(): GamerCollection<NetworkGamer> { return requirePlatform(); }

  /** Removes this machine and everyone on it from the session. Host only. */
  public RemoveFromSession(): void { requirePlatform(); }
}

/** A gamer in a session, local or remote. */
export class NetworkGamer extends Gamer {
  #hasLeftSession = false;
  #hasVoice = false;
  #id = 0;
  #isGuest = false;
  #isHost = false;
  #isLocal = false;
  #isMutedByLocalUser = false;
  #isPrivateSlot = false;
  #isReady = false;
  #isTalking = false;
  #machine: NetworkMachine | null = null;

  /** Whether the gamer has left. */
  public get HasLeftSession(): boolean { return this.#hasLeftSession; }
  /** Whether the gamer has a voice device. */
  public get HasVoice(): boolean { return this.#hasVoice; }
  /** The gamer's identifier within the session. A byte in XNA. */
  public get Id(): number { return this.#id; }
  /** Whether the gamer is a guest of another local profile. */
  public get IsGuest(): boolean { return this.#isGuest; }
  /** Whether the gamer is hosting. */
  public get IsHost(): boolean { return this.#isHost; }
  /** Whether the gamer is on this machine. */
  public get IsLocal(): boolean { return this.#isLocal; }
  /** Whether a local gamer has muted this one. */
  public get IsMutedByLocalUser(): boolean { return this.#isMutedByLocalUser; }
  /** Whether the gamer occupies a private slot. */
  public get IsPrivateSlot(): boolean { return this.#isPrivateSlot; }
  /** Whether the gamer has signalled ready in the lobby. */
  public get IsReady(): boolean { return this.#isReady; }
  public set IsReady(value: boolean) { this.#isReady = Boolean(value); }
  /** Whether the gamer is speaking now. */
  public get IsTalking(): boolean { return this.#isTalking; }
  /**
   * The machine this gamer is on. XNA declares a protected setter; the projection keeps the more
   * visible accessor, which is the public getter, under the package's one mixed-accessor rule.
   */
  public get Machine(): NetworkMachine { return this.#machine ?? requirePlatform(); }
  /** The round trip measured to this gamer. */
  public get RoundtripTime(): TimeSpan { return TimeSpan.Zero; }
  /** The session the gamer is in. */
  public get Session(): NetworkSession { return requirePlatform(); }
}

/** A gamer in a session who is signed in on this machine, and can therefore send and receive. */
export class LocalNetworkGamer extends NetworkGamer {
  /** Whether a packet is waiting to be received. */
  public get IsDataAvailable(): boolean { return false; }
  /** The signed-in gamer behind this session gamer. */
  public get SignedInGamer(): SignedInGamer { return requirePlatform(); }

  /** Turns voice to one remote gamer on or off. */
  public EnableSendVoice(remoteGamer: NetworkGamer, enable: boolean): void { requirePlatform(); }

  /** Sends a packet to everyone. */
  public SendData(data: PacketWriter, options: SendDataOptions): void;
  /** Sends a packet to one gamer. */
  public SendData(data: PacketWriter, options: SendDataOptions, recipient: NetworkGamer): void;
  /** Sends bytes to everyone. */
  public SendData(data: number[], options: SendDataOptions): void;
  /** Sends bytes to one gamer. */
  public SendData(data: number[], options: SendDataOptions, recipient: NetworkGamer): void;
  /** Sends part of a byte array to everyone. */
  public SendData(data: number[], offset: number, count: number, options: SendDataOptions): void;
  /** Sends part of a byte array to one gamer. */
  public SendData(
    data: number[], offset: number, count: number, options: SendDataOptions, recipient: NetworkGamer,
  ): void;
  public SendData(..._values: readonly unknown[]): void { requirePlatform(); }

  /**
   * Receives one packet into a reader, reporting who sent it.
   *
   * XNA returns the byte count and passes the sender back through an `out` parameter. TypeScript
   * has no `out`, so the projection returns both under the package's one named-result rule rather
   * than inventing a shape for this method alone.
   */
  public ReceiveData(data: PacketReader): NetworkPacketResult;
  /** Receives one packet into a byte array. */
  public ReceiveData(data: number[]): NetworkPacketResult;
  /** Receives one packet into a byte array at an offset. */
  public ReceiveData(data: number[], offset: number): NetworkPacketResult;
  public ReceiveData(..._values: readonly unknown[]): NetworkPacketResult { return requirePlatform(); }

  /** Shows the platform's party-invitation screen. */
  public SendPartyInvites(): void { requirePlatform(); }
}

/** What one `LocalNetworkGamer.ReceiveData` call produced. */
export interface NetworkPacketResult {
  /** How many bytes the packet held. */
  readonly Length: number;
  /** Who sent it. */
  readonly Sender: NetworkGamer;
}

/** A multiplayer session. */
export class NetworkSession implements IDisposable {
  /** The most previous gamers a session remembers. */
  public static readonly MaxPreviousGamers = 100;
  /** The most gamers a session may hold. */
  public static readonly MaxSupportedGamers = 31;

  static readonly #inviteAccepted = new EventDispatcher<unknown, InviteAcceptedEventArgs>();
  readonly #gameEnded = new EventDispatcher<unknown, GameEndedEventArgs>();
  readonly #gameStarted = new EventDispatcher<unknown, GameStartedEventArgs>();
  readonly #gamerJoined = new EventDispatcher<unknown, GamerJoinedEventArgs>();
  readonly #gamerLeft = new EventDispatcher<unknown, GamerLeftEventArgs>();
  readonly #hostChanged = new EventDispatcher<unknown, HostChangedEventArgs>();
  readonly #sessionEnded = new EventDispatcher<unknown, NetworkSessionEndedEventArgs>();
  readonly #writeArbitratedLeaderboard = new EventDispatcher<unknown, WriteLeaderboardsEventArgs>();
  readonly #writeTrueSkill = new EventDispatcher<unknown, WriteLeaderboardsEventArgs>();
  readonly #writeUnarbitratedLeaderboard = new EventDispatcher<unknown, WriteLeaderboardsEventArgs>();
  #allowHostMigration = false;
  #allowJoinInProgress = false;
  #maxGamers = 0;
  #privateGamerSlots = 0;
  #simulatedLatency = TimeSpan.Zero;
  #simulatedPacketLoss = 0;
  #disposed = false;

  /** Raised when a gamer accepts an invitation. */
  public static readonly InviteAccepted: XnaEvent<unknown, InviteAcceptedEventArgs> =
    NetworkSession.#inviteAccepted;

  /** Raised when the host ends the game. */
  public readonly GameEnded: XnaEvent<unknown, GameEndedEventArgs> = this.#gameEnded;
  /** Raised when the host starts the game. */
  public readonly GameStarted: XnaEvent<unknown, GameStartedEventArgs> = this.#gameStarted;
  /** Raised when a gamer joins. */
  public readonly GamerJoined: XnaEvent<unknown, GamerJoinedEventArgs> = this.#gamerJoined;
  /** Raised when a gamer leaves. */
  public readonly GamerLeft: XnaEvent<unknown, GamerLeftEventArgs> = this.#gamerLeft;
  /** Raised when hosting moves. */
  public readonly HostChanged: XnaEvent<unknown, HostChangedEventArgs> = this.#hostChanged;
  /** Raised when the session ends. */
  public readonly SessionEnded: XnaEvent<unknown, NetworkSessionEndedEventArgs> = this.#sessionEnded;
  /** Raised when an arbitrated leaderboard row should be written. */
  public readonly WriteArbitratedLeaderboard: XnaEvent<unknown, WriteLeaderboardsEventArgs> =
    this.#writeArbitratedLeaderboard;
  /** Raised when a TrueSkill row should be written. */
  public readonly WriteTrueSkill: XnaEvent<unknown, WriteLeaderboardsEventArgs> = this.#writeTrueSkill;
  /** Raised when an unarbitrated leaderboard row should be written. */
  public readonly WriteUnarbitratedLeaderboard: XnaEvent<unknown, WriteLeaderboardsEventArgs> =
    this.#writeUnarbitratedLeaderboard;

  /** Every gamer in the session. */
  public get AllGamers(): GamerCollection<NetworkGamer> { return requirePlatform(); }
  /** Whether hosting may move when the host leaves. */
  public get AllowHostMigration(): boolean { return this.#allowHostMigration; }
  public set AllowHostMigration(value: boolean) { this.#allowHostMigration = Boolean(value); }
  /** Whether gamers may join after the game starts. */
  public get AllowJoinInProgress(): boolean { return this.#allowJoinInProgress; }
  public set AllowJoinInProgress(value: boolean) { this.#allowJoinInProgress = Boolean(value); }
  /** Bytes per second received across the session. */
  public get BytesPerSecondReceived(): number { return 0; }
  /** Bytes per second sent across the session. */
  public get BytesPerSecondSent(): number { return 0; }
  /** The gamer hosting the session. */
  public get Host(): NetworkGamer { return requirePlatform(); }
  /** Whether the session has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }
  /** Whether every gamer has signalled ready. */
  public get IsEveryoneReady(): boolean { return false; }
  /** Whether this machine is hosting. */
  public get IsHost(): boolean { return false; }
  /** The gamers signed in on this machine. */
  public get LocalGamers(): GamerCollection<LocalNetworkGamer> { return requirePlatform(); }
  /** How many gamers the session may hold. */
  public get MaxGamers(): number { return this.#maxGamers; }
  public set MaxGamers(value: number) { this.#maxGamers = Math.trunc(value); }
  /** The gamers who have left. */
  public get PreviousGamers(): GamerCollection<NetworkGamer> { return requirePlatform(); }
  /** How many of the slots are private. */
  public get PrivateGamerSlots(): number { return this.#privateGamerSlots; }
  public set PrivateGamerSlots(value: number) { this.#privateGamerSlots = Math.trunc(value); }
  /** The gamers on other machines. */
  public get RemoteGamers(): GamerCollection<NetworkGamer> { return requirePlatform(); }
  /** The properties the session advertises. */
  public get SessionProperties(): NetworkSessionProperties { return requirePlatform(); }
  /** Where the session is in its lifecycle. */
  public get SessionState(): NetworkSessionState { return NetworkSessionState.Lobby; }
  /** What kind of session this is. */
  public get SessionType(): NetworkSessionType { return NetworkSessionType.Local; }
  /** Artificial latency added for testing. */
  public get SimulatedLatency(): TimeSpan { return this.#simulatedLatency; }
  public set SimulatedLatency(value: TimeSpan) { this.#simulatedLatency = TimeSpan.FromTicks(value.Ticks); }
  /** Artificial packet loss added for testing, from zero to one. */
  public get SimulatedPacketLoss(): number { return this.#simulatedPacketLoss; }
  public set SimulatedPacketLoss(value: number) { this.#simulatedPacketLoss = Math.fround(value); }

  /** Creates a session. */
  public static Create(
    sessionType: NetworkSessionType, maxLocalGamers: number, maxGamers: number,
  ): NetworkSession;
  /** Creates a session with private slots and advertised properties. */
  public static Create(
    sessionType: NetworkSessionType, maxLocalGamers: number, maxGamers: number,
    privateGamerSlots: number, sessionProperties: NetworkSessionProperties,
  ): NetworkSession;
  /** Creates a session for an explicit set of local gamers. */
  public static Create(
    sessionType: NetworkSessionType, localGamers: Iterable<SignedInGamer>, maxGamers: number,
    privateGamerSlots: number, sessionProperties: NetworkSessionProperties,
  ): NetworkSession;
  public static Create(..._values: readonly unknown[]): NetworkSession { return requirePlatform(); }

  /** Begins creating a session. */
  public static BeginCreate(
    sessionType: NetworkSessionType, maxLocalGamers: number, maxGamers: number,
    callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins creating a session with private slots and advertised properties. */
  public static BeginCreate(
    sessionType: NetworkSessionType, maxLocalGamers: number, maxGamers: number,
    privateGamerSlots: number, sessionProperties: NetworkSessionProperties,
    callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins creating a session for an explicit set of local gamers. */
  public static BeginCreate(
    sessionType: NetworkSessionType, localGamers: Iterable<SignedInGamer>, maxGamers: number,
    privateGamerSlots: number, sessionProperties: NetworkSessionProperties,
    callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  public static BeginCreate(..._values: readonly unknown[]): IAsyncResult { return requirePlatform(); }
  /** Completes a `BeginCreate` operation. */
  public static EndCreate(result: IAsyncResult): NetworkSession { return requirePlatform(); }

  /** Finds sessions to join. */
  public static Find(
    sessionType: NetworkSessionType, maxLocalGamers: number,
    searchProperties: NetworkSessionProperties,
  ): AvailableNetworkSessionCollection;
  /** Finds sessions to join for an explicit set of local gamers. */
  public static Find(
    sessionType: NetworkSessionType, localGamers: Iterable<SignedInGamer>,
    searchProperties: NetworkSessionProperties,
  ): AvailableNetworkSessionCollection;
  public static Find(..._values: readonly unknown[]): AvailableNetworkSessionCollection {
    return requirePlatform();
  }

  /** Begins finding sessions. */
  public static BeginFind(
    sessionType: NetworkSessionType, maxLocalGamers: number,
    searchProperties: NetworkSessionProperties, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins finding sessions for an explicit set of local gamers. */
  public static BeginFind(
    sessionType: NetworkSessionType, localGamers: Iterable<SignedInGamer>,
    searchProperties: NetworkSessionProperties, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  public static BeginFind(..._values: readonly unknown[]): IAsyncResult { return requirePlatform(); }
  /** Completes a `BeginFind` operation. */
  public static EndFind(result: IAsyncResult): AvailableNetworkSessionCollection {
    return requirePlatform();
  }

  /** Joins a session a search found. */
  public static Join(availableSession: AvailableNetworkSession): NetworkSession {
    return requirePlatform();
  }
  /** Begins joining a session a search found. */
  public static BeginJoin(
    availableSession: AvailableNetworkSession, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult { return requirePlatform(); }
  /** Completes a `BeginJoin` operation. */
  public static EndJoin(result: IAsyncResult): NetworkSession { return requirePlatform(); }

  /** Joins the session an accepted invitation names. */
  public static JoinInvited(maxLocalGamers: number): NetworkSession;
  /** Joins the invited session with an explicit set of local gamers. */
  public static JoinInvited(localGamers: Iterable<SignedInGamer>): NetworkSession;
  public static JoinInvited(..._values: readonly unknown[]): NetworkSession { return requirePlatform(); }
  /** Begins joining the invited session. */
  public static BeginJoinInvited(
    maxLocalGamers: number, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins joining the invited session with an explicit set of local gamers. */
  public static BeginJoinInvited(
    localGamers: Iterable<SignedInGamer>, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  public static BeginJoinInvited(..._values: readonly unknown[]): IAsyncResult { return requirePlatform(); }
  /** Completes a `BeginJoinInvited` operation. */
  public static EndJoinInvited(result: IAsyncResult): NetworkSession { return requirePlatform(); }

  /** Adds a locally signed-in gamer to the session. */
  public AddLocalGamer(gamer: SignedInGamer): void { requirePlatform(); }
  /** Ends the game and returns the session to the lobby. Host only. */
  public EndGame(): void { requirePlatform(); }
  /** Finds a gamer by session identifier. */
  public FindGamerById(gamerId: number): NetworkGamer { return requirePlatform(); }
  /** Clears every gamer's ready flag. */
  public ResetReady(): void { requirePlatform(); }
  /** Starts the game. Host only. */
  public StartGame(): void { requirePlatform(); }
  /** Pumps the session once. A game calls this every frame. */
  public Update(): void { requirePlatform(); }

  /** Leaves and releases the session. */
  public Dispose(): void { this.#disposed = true; }
}
