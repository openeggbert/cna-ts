// SPDX-License-Identifier: MS-PL

import { EventArgs } from "../EventArgs.js";
import type { SignedInGamer } from "./Gamer.js";

/** Raised when a gamer signs in on a local profile. */
export class SignedInEventArgs extends EventArgs {
  readonly #gamer: SignedInGamer;

  public constructor(gamer: SignedInGamer) {
    super();
    this.#gamer = gamer;
  }

  /** The gamer who signed in. */
  public get Gamer(): SignedInGamer { return this.#gamer; }
}

/** Raised when a gamer signs out of a local profile. */
export class SignedOutEventArgs extends EventArgs {
  readonly #gamer: SignedInGamer;

  public constructor(gamer: SignedInGamer) {
    super();
    this.#gamer = gamer;
  }

  /** The gamer who signed out. */
  public get Gamer(): SignedInGamer { return this.#gamer; }
}

/** Raised when a gamer accepts an invitation to a session. */
export class InviteAcceptedEventArgs extends EventArgs {
  readonly #gamer: SignedInGamer;
  readonly #isCurrentSession: boolean;

  public constructor(gamer: SignedInGamer, isCurrentSession: boolean) {
    super();
    this.#gamer = gamer;
    this.#isCurrentSession = Boolean(isCurrentSession);
  }

  /** The gamer who accepted the invitation. */
  public get Gamer(): SignedInGamer { return this.#gamer; }
  /** Whether the invitation was to the session the game is already in. */
  public get IsCurrentSession(): boolean { return this.#isCurrentSession; }
}
