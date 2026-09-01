// SPDX-License-Identifier: MS-PL
//
// A second implementation of `SpriteFont.MeasureString`, for the tests to disagree with.
//
// This package measures text in TypeScript, and the algorithm has more corners than its size
// suggests: a line's first glyph gets its left bearing clamped at zero and later glyphs get the
// raw value plus `Spacing`; the running width uses a *clamped* right bearing while the advance
// uses the raw one; a line's height comes from the tallest cropping rectangle rather than from
// `LineSpacing`; `\r` is skipped and `\n` restarts the line. Every one of those is a place to be
// quietly wrong in a way hand-written expectations would not catch.
//
// So the tests do not check `MeasureString` against numbers somebody typed. They build CNA's own
// SpriteFont over **the same texture and the same glyph table** and ask it the same question. The
// two implementations share no code, and where they agree on a string neither is being trusted.
//
// Nothing public is added: `MeasureString` already exists, and CNA's font never leaves this module.

import type {
  CnaSpriteFontInfoSnapshot,
  CnaSpriteFontOracleBackend,
} from "./backend.js";
import { getBackend } from "./backend.js";
import { NativeUnavailableError } from "./native-error.js";
import type { NativeHandle } from "./ownership.js";
import type { SpriteFont } from "../Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import {
  spriteFontGlyphTableForInternalUse,
  spriteFontTextureForInternalUse,
} from "../Microsoft/Xna/Framework/Graphics/SpriteFont.js";
import { resolveTexture2DHandleForInternalUse } from
  "../Microsoft/Xna/Framework/Graphics/Texture2D.js";

/** The size CNA measures a string at, in the same units `MeasureString` answers in. */
export interface MeasuredSize {
  readonly X: number;
  readonly Y: number;
}

function oracle(): CnaSpriteFontOracleBackend {
  const backend = getBackend().SpriteFontOracle;
  if (!backend) {
    throw new NativeUnavailableError(
      "the SpriteFont measurement oracle requires a loaded backend that has CNA's SpriteFont",
    );
  }
  return backend;
}

/**
 * CNA's twin of a managed font, built from that font's own glyph table.
 *
 * Owns a native SpriteFont and must be disposed. It retains the managed font's texture for as long
 * as it lives — CNA's header says the source texture cannot be destroyed before the font — so a
 * caller disposes this before the font's texture, which for a content-loaded font means before
 * `ContentManager.Unload`.
 */
export class SpriteFontOracle {
  readonly #backend: CnaSpriteFontOracleBackend;
  #handle: NativeHandle | null;

  public constructor(font: SpriteFont) {
    if (font == null) throw new TypeError("font is required");
    this.#backend = oracle();
    const defaultCharacter = font.DefaultCharacter;
    this.#handle = this.#backend.createCnaSpriteFont(
      resolveTexture2DHandleForInternalUse(spriteFontTextureForInternalUse(font)),
      spriteFontGlyphTableForInternalUse(font),
      font.LineSpacing,
      font.Spacing,
      defaultCharacter == null ? null : (defaultCharacter.codePointAt(0) ?? null),
    );
  }

  /** What CNA stored, so the oracle can be checked against its own inputs before it is trusted. */
  public get Info(): CnaSpriteFontInfoSnapshot {
    return this.#backend.getCnaSpriteFontInfo(this.#active());
  }

  /** CNA's answer for a string. */
  public Measure(text: string): MeasuredSize {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    return this.#backend.measureCnaSpriteFont(this.#active(), text);
  }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the oracle is disposed");
    return this.#handle;
  }

  /** Releases CNA's font. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyCnaSpriteFont(handle);
  }
}
