/**
 * The CNA C ABI result codes this package compares against, in one place.
 *
 * A backend that spells a code inline is a backend that can spell it wrong, and the failure is
 * quiet: a wrong number does not throw, it just makes a branch never taken -- or always taken. The
 * first draft of the WebAssembly title-content route wrote `BUFFER_TOO_SMALL = 6`, which is
 * `NOT_SUPPORTED`, and would have swallowed every unsupported answer as a size probe.
 *
 * `npm run verify:cna-contract` reads this module and proves each value against `abi.h` with a
 * generated `_Static_assert`, so a code that moves upstream is a compile error here rather than a
 * branch that silently changes meaning.
 */

/** Codes from `CNA/C/abi.h`. */
export const CnaResult = {
  Success: 0,
  InvalidArgument: 1,
  InvalidHandle: 2,
  InvalidState: 3,
  OutOfMemory: 4,
  Io: 5,
  NotSupported: 6,
  Platform: 7,
  Thread: 8,
  Callback: 9,
  Overflow: 10,
  Encoding: 11,
  Internal: 12,
  ShuttingDown: 13,
  BufferTooSmall: 14,
} as const;

/** The `CNA_RESULT_*` constant each member of {@link CnaResult} claims to equal. */
export const CNA_RESULT_CONSTANT_NAMES: Readonly<Record<keyof typeof CnaResult, string>> = {
  Success: "CNA_RESULT_SUCCESS",
  InvalidArgument: "CNA_RESULT_INVALID_ARGUMENT",
  InvalidHandle: "CNA_RESULT_INVALID_HANDLE",
  InvalidState: "CNA_RESULT_INVALID_STATE",
  OutOfMemory: "CNA_RESULT_OUT_OF_MEMORY",
  Io: "CNA_RESULT_IO",
  NotSupported: "CNA_RESULT_NOT_SUPPORTED",
  Platform: "CNA_RESULT_PLATFORM",
  Thread: "CNA_RESULT_THREAD",
  Callback: "CNA_RESULT_CALLBACK",
  Overflow: "CNA_RESULT_OVERFLOW",
  Encoding: "CNA_RESULT_ENCODING",
  Internal: "CNA_RESULT_INTERNAL",
  ShuttingDown: "CNA_RESULT_SHUTTING_DOWN",
  BufferTooSmall: "CNA_RESULT_BUFFER_TOO_SMALL",
} as const;
