// SPDX-License-Identifier: MS-PL

/**
 * The `Microsoft.Xna.Framework.Net` identity enumerations.
 *
 * Every value is the exact number the XNA 4.0 reference assembly declares.
 */

/** Why a network session ended. */
export enum NetworkSessionEndReason {
  ClientSignedOut = 0,
  HostEndedSession = 1,
  RemovedByHost = 2,
  Disconnected = 3,
}

/** Why joining a network session failed. */
export enum NetworkSessionJoinError {
  SessionNotFound = 0,
  SessionNotJoinable = 1,
  SessionFull = 2,
}

/** Where a network session is in its lifecycle. */
export enum NetworkSessionState {
  Lobby = 0,
  Playing = 1,
  Ended = 2,
}

/** The kind of network session to create or find. */
export enum NetworkSessionType {
  Local = 0,
  SystemLink = 1,
  PlayerMatch = 2,
  Ranked = 3,
  LocalWithLeaderboards = 4,
}

/** Delivery guarantees for one `LocalNetworkGamer.SendData` call. `ReliableInOrder` is `Reliable` and `InOrder` together. */
export enum SendDataOptions {
  None = 0,
  Reliable = 1,
  InOrder = 2,
  ReliableInOrder = 3,
  Chat = 4,
}
