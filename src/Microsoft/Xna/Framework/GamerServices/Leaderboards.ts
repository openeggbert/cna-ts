// SPDX-License-Identifier: MS-PL

import type { AsyncCallback, IAsyncResult, IDisposable, TryResult } from "../Contracts.js";
import { TimeSpan } from "../TimeSpan.js";
import type { Gamer } from "./Gamer.js";
import { LeaderboardKey, LeaderboardOutcome } from "./Enums.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";

/**
 * Leaderboards: the identity of one, the typed column bag an entry carries, the paged reader and
 * the writer a session hands out.
 */

const platformOwned = Symbol("cna-ts.gamerServices.leaderboardOwned");

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/**
 * Which leaderboard a read or write addresses.
 *
 * A mutable value type in XNA, and one here: `structStyle` projects a CLR struct as a mutable class
 * and callers copy where the CLR would have.
 */
export class LeaderboardIdentity {
  #key = "";
  #gameMode = 0;

  /** The platform's leaderboard key. */
  public get Key(): string { return this.#key; }
  public set Key(value: string) { this.#key = String(value); }

  /** The game mode the leaderboard is scoped to. */
  public get GameMode(): number { return this.#gameMode; }
  public set GameMode(value: number) { this.#gameMode = Math.trunc(value); }

  /** Creates an identity for one of the four platform leaderboards. */
  public static Create(key: LeaderboardKey): LeaderboardIdentity;
  /** Creates an identity for one of the four platform leaderboards in a specific game mode. */
  public static Create(key: LeaderboardKey, gameMode: number): LeaderboardIdentity;
  public static Create(key: LeaderboardKey, gameMode = 0): LeaderboardIdentity {
    const identity = new LeaderboardIdentity();
    identity.Key = LeaderboardKey[key] ?? String(key);
    identity.GameMode = gameMode;
    return identity;
  }
}

/**
 * The typed column bag a leaderboard entry carries.
 *
 * XNA declares eight `SetValue` overloads that differ only in the CLR numeric type of the value.
 * `Int32`, `Int64`, `Single` and `Double` are four distinct CLR signatures and two TypeScript ones,
 * so the typed `GetValue*` readers are what preserve the distinction on the way out; on the way in,
 * a `bigint` stores a 64-bit column and a `number` a 32-bit one.
 */
export class PropertyDictionary {
  readonly #values = new Map<string, unknown>();

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** How many columns the entry carries. */
  public get Count(): number { return this.#values.size; }

  /** The column value at a key. */
  public Get(key: string): unknown {
    if (!this.#values.has(key)) throw new RangeError(`no column is named ${key}`);
    return this.#values.get(key);
  }

  /** Writes the column value at a key. */
  public Set(key: string, value: unknown): void { requirePlatform(); }

  /** Whether a column is present. */
  public ContainsKey(key: string): boolean { return this.#values.has(key); }

  /** Reads a column, reporting whether it was there rather than throwing. */
  public TryGetValue(key: string): TryResult<unknown> {
    return Object.freeze({ Success: this.#values.has(key), Value: this.#values.get(key) ?? null });
  }

  /** Reads a 32-bit integer column. */
  public GetValueInt32(key: string): number { return requirePlatform(); }
  /** Reads a 64-bit integer column. */
  public GetValueInt64(key: string): bigint { return requirePlatform(); }
  /** Reads a single-precision column. */
  public GetValueSingle(key: string): number { return requirePlatform(); }
  /** Reads a double-precision column. */
  public GetValueDouble(key: string): number { return requirePlatform(); }
  /** Reads a string column. */
  public GetValueString(key: string): string { return requirePlatform(); }
  /** Reads a date-time column. */
  public GetValueDateTime(key: string): Date { return requirePlatform(); }
  /** Reads a time-span column. */
  public GetValueTimeSpan(key: string): TimeSpan { return requirePlatform(); }
  /** Reads a match-outcome column. */
  public GetValueOutcome(key: string): LeaderboardOutcome { return requirePlatform(); }
  /** Reads a stream column as its bytes. */
  public GetValueStream(key: string): Uint8Array { return requirePlatform(); }

  /** Writes a string column. */
  public SetValue(key: string, value: string): void;
  /** Writes a 64-bit integer column. */
  public SetValue(key: string, value: bigint): void;
  /** Writes a date-time column. */
  public SetValue(key: string, value: Date): void;
  /** Writes a time-span column. */
  public SetValue(key: string, value: TimeSpan): void;
  /** Writes a match-outcome column. */
  public SetValue(key: string, value: LeaderboardOutcome): void;
  /**
   * Writes a numeric column. `Int32`, `Single` and `Double` are three CLR signatures that all
   * accept a JavaScript number; the leaderboard's declared column type decides how it is stored.
   */
  public SetValue(key: string, value: number): void;
  public SetValue(key: string, value: unknown): void { requirePlatform(); }

  /** Walks the columns. A CLR `KeyValuePair` is two named fields, which is a tuple here. */
  public GetEnumerator(): IterableIterator<[string, unknown]> { return this.#values.entries(); }

}

/** One row of a leaderboard. */
export class LeaderboardEntry {
  #rating = 0n;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** The typed columns this row carries. */
  public get Columns(): PropertyDictionary { return requirePlatform(); }
  /** The gamer the row belongs to. */
  public get Gamer(): Gamer { return requirePlatform(); }
  /** The row's rating. 64-bit in XNA, so a bigint here rather than a lossy number. */
  public get Rating(): bigint { return this.#rating; }
  public set Rating(value: bigint) { this.#rating = BigInt(value); }
}

/** A paged view of one leaderboard. */
export class LeaderboardReader implements IDisposable {
  #disposed = false;

  private constructor(token: symbol) {
    if (token !== platformOwned) requirePlatform();
  }

  /** Whether a page below the current one exists. */
  public get CanPageDown(): boolean { return false; }
  /** Whether a page above the current one exists. */
  public get CanPageUp(): boolean { return false; }
  /** The rows on the current page. */
  public get Entries(): ReadonlyArray<LeaderboardEntry> { return Object.freeze([]); }
  /** Whether the reader has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }
  /** Which leaderboard this reader is reading. */
  public get LeaderboardIdentity(): LeaderboardIdentity { return requirePlatform(); }
  /** The index of the first row on the current page. */
  public get PageStart(): number { return 0; }
  /** How many rows the whole leaderboard holds. */
  public get TotalLeaderboardSize(): number { return 0; }

  /** Begins reading a page starting at an index. */
  public static BeginRead(
    leaderboardId: LeaderboardIdentity, pageStart: number, pageSize: number,
    callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins reading the page around a pivot gamer. */
  public static BeginRead(
    leaderboardId: LeaderboardIdentity, pivotGamer: Gamer, pageSize: number,
    callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  /** Begins reading the page around a pivot gamer, restricted to a gamer set. */
  public static BeginRead(
    leaderboardId: LeaderboardIdentity, gamers: Iterable<Gamer>, pivotGamer: Gamer,
    pageSize: number, callback: AsyncCallback, asyncState: unknown,
  ): IAsyncResult;
  public static BeginRead(..._values: readonly unknown[]): IAsyncResult { return requirePlatform(); }

  /** Completes a `BeginRead` operation. */
  public static EndRead(result: IAsyncResult): LeaderboardReader { return requirePlatform(); }

  /** Reads a page starting at an index. */
  public static Read(
    leaderboardId: LeaderboardIdentity, pageStart: number, pageSize: number,
  ): LeaderboardReader;
  /** Reads the page around a pivot gamer. */
  public static Read(
    leaderboardId: LeaderboardIdentity, pivotGamer: Gamer, pageSize: number,
  ): LeaderboardReader;
  /** Reads the page around a pivot gamer, restricted to a gamer set. */
  public static Read(
    leaderboardId: LeaderboardIdentity, gamers: Iterable<Gamer>, pivotGamer: Gamer, pageSize: number,
  ): LeaderboardReader;
  public static Read(..._values: readonly unknown[]): LeaderboardReader { return requirePlatform(); }

  /** Begins moving to the next page. */
  public BeginPageDown(callback: AsyncCallback, asyncState: unknown): IAsyncResult {
    return requirePlatform();
  }
  /** Completes a `BeginPageDown` operation. */
  public EndPageDown(result: IAsyncResult): void { requirePlatform(); }
  /** Begins moving to the previous page. */
  public BeginPageUp(callback: AsyncCallback, asyncState: unknown): IAsyncResult {
    return requirePlatform();
  }
  /** Completes a `BeginPageUp` operation. */
  public EndPageUp(result: IAsyncResult): void { requirePlatform(); }
  /** Moves to the next page. */
  public PageDown(): void { requirePlatform(); }
  /** Moves to the previous page. */
  public PageUp(): void { requirePlatform(); }

  /** Releases the reader. */
  public Dispose(): void { this.#disposed = true; }
}

/** The writer a ranked session hands out so a game can record leaderboard rows. */
export class LeaderboardWriter {
  public constructor() {}

  /** Gets the row this gamer will write to one leaderboard. */
  public GetLeaderboard(leaderboardId: LeaderboardIdentity): LeaderboardEntry {
    return requirePlatform();
  }
}
