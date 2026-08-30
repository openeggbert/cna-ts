/**
 * Value translations between the public XNA enumerations this package projects and the CNA C ABI
 * identities the native adapters send.
 *
 * Nearly every XNA enumeration and its `CNA_*` counterpart share the same numbers, and
 * `tools/cna-abi/verify-contract.mjs` proves that member by member against the canonical headers.
 * This module holds only the places where the two genuinely disagree, so a translation exists
 * because a measurement demanded it rather than because a value looked suspicious.
 */

import type { BlendStateSnapshot } from "./backend.js";

/**
 * XNA 4.0 numbers `BlendFunction.Min = 3` and `Max = 4`; the CNA C ABI numbers
 * `CNA_BLEND_FUNCTION_MAX = 3` and `CNA_BLEND_FUNCTION_MIN = 4`. Passing the XNA value through
 * unchanged silently exchanges the two functions, so both directions are translated here.
 */
const XNA_BLEND_FUNCTION_MIN = 3;
const XNA_BLEND_FUNCTION_MAX = 4;
const CNA_BLEND_FUNCTION_MAX = 3;
const CNA_BLEND_FUNCTION_MIN = 4;

/** Converts an XNA `BlendFunction` value to its CNA C ABI identity. */
export function toCnaBlendFunction(value: number): number {
  if (value === XNA_BLEND_FUNCTION_MIN) return CNA_BLEND_FUNCTION_MIN;
  if (value === XNA_BLEND_FUNCTION_MAX) return CNA_BLEND_FUNCTION_MAX;
  return value;
}

/** Converts a CNA C ABI blend-function identity to its XNA `BlendFunction` value. */
export function fromCnaBlendFunction(value: number): number {
  if (value === CNA_BLEND_FUNCTION_MIN) return XNA_BLEND_FUNCTION_MIN;
  if (value === CNA_BLEND_FUNCTION_MAX) return XNA_BLEND_FUNCTION_MAX;
  return value;
}

/** Rewrites a blend-state snapshot's two blend functions into their CNA C ABI identities. */
export function toCnaBlendState(state: BlendStateSnapshot): BlendStateSnapshot {
  return {
    ...state,
    AlphaBlendFunction: toCnaBlendFunction(state.AlphaBlendFunction),
    ColorBlendFunction: toCnaBlendFunction(state.ColorBlendFunction),
  };
}

/**
 * XNA numbers `GamePadType.BigButtonPad` 0x300 while the CNA C ABI continues its dense sequence at
 * `CNA_GAMEPAD_TYPE_BIG_BUTTON_PAD = 9`. Every other member of the family shares its number.
 */
const XNA_GAMEPAD_TYPE_BIG_BUTTON_PAD = 0x300;
const CNA_GAMEPAD_TYPE_BIG_BUTTON_PAD = 9;

/** Converts a CNA C ABI game-pad type identity to its XNA `GamePadType` value. */
export function fromCnaGamePadType(value: number): number {
  return value === CNA_GAMEPAD_TYPE_BIG_BUTTON_PAD ? XNA_GAMEPAD_TYPE_BIG_BUTTON_PAD : value;
}

/** Converts an XNA `GamePadType` value to its CNA C ABI identity. */
export function toCnaGamePadType(value: number): number {
  return value === XNA_GAMEPAD_TYPE_BIG_BUTTON_PAD ? CNA_GAMEPAD_TYPE_BIG_BUTTON_PAD : value;
}
