// SPDX-License-Identifier: MS-PL

import { EventArgs } from "../EventArgs.js";
import { NetworkSessionEndReason } from "./Enums.js";
import type { NetworkGamer } from "./Session.js";

/** Raised when the host ends the game and the session returns to the lobby. */
export class GameEndedEventArgs extends EventArgs {
  public constructor() { super(); }
}

/** Raised when the host starts the game. */
export class GameStartedEventArgs extends EventArgs {
  public constructor() { super(); }
}

/** Raised when a gamer joins the session. */
export class GamerJoinedEventArgs extends EventArgs {
  readonly #gamer: NetworkGamer;

  public constructor(gamer: NetworkGamer) {
    super();
    this.#gamer = gamer;
  }

  /** The gamer who joined. */
  public get Gamer(): NetworkGamer { return this.#gamer; }
}

/** Raised when a gamer leaves the session. */
export class GamerLeftEventArgs extends EventArgs {
  readonly #gamer: NetworkGamer;

  public constructor(gamer: NetworkGamer) {
    super();
    this.#gamer = gamer;
  }

  /** The gamer who left. */
  public get Gamer(): NetworkGamer { return this.#gamer; }
}

/** Raised when session hosting moves to another machine. */
export class HostChangedEventArgs extends EventArgs {
  readonly #oldHost: NetworkGamer;
  readonly #newHost: NetworkGamer;

  public constructor(oldHost: NetworkGamer, newHost: NetworkGamer) {
    super();
    this.#oldHost = oldHost;
    this.#newHost = newHost;
  }

  /** The gamer who was hosting. */
  public get OldHost(): NetworkGamer { return this.#oldHost; }
  /** The gamer now hosting. */
  public get NewHost(): NetworkGamer { return this.#newHost; }
}

/** Raised when the session ends, carrying why. */
export class NetworkSessionEndedEventArgs extends EventArgs {
  readonly #endReason: NetworkSessionEndReason;

  public constructor(endReason: NetworkSessionEndReason) {
    super();
    this.#endReason = endReason;
  }

  /** Why the session ended. */
  public get EndReason(): NetworkSessionEndReason { return this.#endReason; }
}

/** Raised when a ranked session wants leaderboard rows written for one gamer. */
export class WriteLeaderboardsEventArgs extends EventArgs {
  readonly #gamer: NetworkGamer;
  readonly #isLeaving: boolean;

  private constructor(gamer: NetworkGamer, isLeaving: boolean) {
    super();
    this.#gamer = gamer;
    this.#isLeaving = isLeaving;
  }

  /** The gamer whose rows are being written. */
  public get Gamer(): NetworkGamer { return this.#gamer; }
  /** Whether the gamer is leaving the session. */
  public get IsLeaving(): boolean { return this.#isLeaving; }
}
