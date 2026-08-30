// SPDX-License-Identifier: MS-PL

import { NetworkException } from "../GamerServices/Exceptions.js";
import { NetworkSessionJoinError } from "./Enums.js";

/** Joining a session failed, and `JoinError` says why. */
export class NetworkSessionJoinException extends NetworkException {
  #joinError = NetworkSessionJoinError.SessionNotFound;

  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the specific join failure. */
  public constructor(message: string, joinError: NetworkSessionJoinError);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, joinErrorOrInner?: NetworkSessionJoinError | Error) {
    super(
      message ?? "The session could not be joined.",
      joinErrorOrInner instanceof Error ? joinErrorOrInner : (undefined as unknown as Error),
    );
    this.name = "NetworkSessionJoinException";
    if (typeof joinErrorOrInner === "number") this.#joinError = joinErrorOrInner;
  }

  /** Why the join failed. */
  public get JoinError(): NetworkSessionJoinError { return this.#joinError; }
  public set JoinError(value: NetworkSessionJoinError) { this.#joinError = value; }
}
