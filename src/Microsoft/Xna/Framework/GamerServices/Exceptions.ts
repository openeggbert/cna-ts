// SPDX-License-Identifier: MS-PL

/**
 * The `Microsoft.Xna.Framework.GamerServices` exception hierarchy.
 *
 * Each one keeps its own JavaScript class identity rather than collapsing into `Error`, because
 * the whole point of these types in XNA is that a game catches one and not another:
 * `GamerServicesNotAvailableException` means "there is no platform here", while
 * `NetworkNotAvailableException` means "there is one and the network is down".
 */

/** Base for the network failures the gamer-services and networking APIs raise. */
export class NetworkException extends Error {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "A network error occurred.");
    this.name = "NetworkException";
    if (innerException !== undefined) this.cause = innerException;
  }
}

/** The network is unreachable, so the requested gamer-services operation cannot proceed. */
export class NetworkNotAvailableException extends NetworkException {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "The network is not available.", innerException as Error);
    this.name = "NetworkNotAvailableException";
  }
}

/** Gamer services are not present or have not been initialized in this process. */
export class GamerServicesNotAvailableException extends Error {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "Gamer services are not available.");
    this.name = "GamerServicesNotAvailableException";
    if (innerException !== undefined) this.cause = innerException;
  }
}

/** The signed-in gamer lacks the privilege the operation requires. */
export class GamerPrivilegeException extends Error {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "The gamer does not have the required privilege.");
    this.name = "GamerPrivilegeException";
    if (innerException !== undefined) this.cause = innerException;
  }
}

/** The platform guide is already on screen, so a second guide screen cannot be shown. */
export class GuideAlreadyVisibleException extends Error {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "The guide is already visible.");
    this.name = "GuideAlreadyVisibleException";
    if (innerException !== undefined) this.cause = innerException;
  }
}

/** The title must be updated before it may continue. */
export class GameUpdateRequiredException extends Error {
  /** Creates the exception with the framework's own message. */
  public constructor();
  /** Creates the exception with a message. */
  public constructor(message: string);
  /** Creates the exception with a message and the error that caused it. */
  public constructor(message: string, innerException: Error);
  public constructor(message?: string, innerException?: Error) {
    super(message ?? "A game update is required.");
    this.name = "GameUpdateRequiredException";
    if (innerException !== undefined) this.cause = innerException;
  }
}
