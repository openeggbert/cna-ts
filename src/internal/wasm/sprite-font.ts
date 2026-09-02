// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaSpriteFontOracleBackend`: CNA's own `SpriteFont`, used as a
// measurement oracle.
//
// This interface is not how a browser draws text. `SpriteFont.MeasureString` is projected in
// TypeScript from the pinned XNA behaviour and shares no code with CNA's implementation; this is a
// second implementation of the same predicate, asked the same question with the same glyph table,
// so a disagreement is a real disagreement rather than one implementation reading its own output.
//
// **Upstream finding 27 stays visible through this.** CNA and XNA disagree about the trailing
// right-side bearing of the last glyph in a measured string. The strict public API keeps XNA's
// answer, because the pinned Microsoft IL is the authority for a strict XNA member; this backend
// reports CNA's, because it is evidence about CNA. Making them agree by changing the public
// projection would delete the finding rather than resolve it.
//
// Ownership: `createCnaSpriteFont` returns an **OWNED** handle. CNA copies the glyph table at
// creation, so the caller's array is theirs again immediately; the texture is **RETAINED_DEPENDENCY**
// and must outlive the font, which is CNA's documented contract and not something this file can
// enforce.

import { CnaSpriteFontOracleBackendBase } from "../backend-base.js";
import type { CnaSpriteFontGlyphSnapshot, CnaSpriteFontInfoSnapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmSpriteFontOracleBackend extends CnaSpriteFontOracleBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's sprite-font oracle`,
    );
  }

  /**
   * A CNA `SpriteFont` over a caller's atlas and glyph table.
   *
   * The glyph array is written at the structure's own measured stride rather than at a size
   * written here, so a glyph gaining a field is a longer array rather than a misaligned one.
   */
  public override createCnaSpriteFont(
    texture: NativeHandle,
    glyphs: readonly CnaSpriteFontGlyphSnapshot[],
    lineSpacing: number,
    spacing: number,
    defaultCharacter: number | null,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const glyphLayout = WASM_STRUCT_LAYOUTS.CNA_SpriteFontGlyph;
      // A zero-length allocation is a range error, and a font with no glyphs is a thing CNA has
      // an opinion about, so the pointer is null in that case rather than one byte of nothing.
      const table = glyphs.length === 0 ? 0 : scope.allocate(glyphLayout.size * glyphs.length);
      glyphs.forEach((glyph, index) => {
        const entry = new WasmStruct(
          this.#routes.module, "CNA_SpriteFontGlyph", table + glyphLayout.size * index,
        );
        entry.setU32("struct_size", glyphLayout.size);
        entry.setU32("struct_version", 1);
        this.#rectangle(entry.nested("glyph_bounds", "CNA_Rectangle"), glyph.Bounds);
        this.#rectangle(entry.nested("cropping", "CNA_Rectangle"), glyph.Cropping);
        entry.setU16("character", glyph.Character);
        const kerning = entry.nested("kerning", "CNA_Vector3");
        kerning.setF32("x", glyph.KerningLeft);
        kerning.setF32("y", glyph.KerningWidth);
        kerning.setF32("z", glyph.KerningRight);
      });
      const info = allocateStruct(this.#routes.module, scope, "CNA_SpriteFontCreateInfo");
      info.setU64("texture", texture);
      info.setPointer("glyphs", table);
      info.setU64("glyph_count", BigInt(glyphs.length));
      info.setI32("line_spacing", Math.trunc(lineSpacing));
      info.setF32("spacing", spacing);
      if (defaultCharacter !== null) {
        info.setU16("default_character", defaultCharacter);
        info.setU8("has_default_character", 1);
      }
      return this.#routes.outHandle("cna_sprite_font_create", info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override destroyCnaSpriteFont(font: NativeHandle): void {
    this.#routes.invoke("cna_sprite_font_destroy", font);
  }

  /** What CNA stored, so the oracle can be checked against its own inputs before it is trusted. */
  public override getCnaSpriteFontInfo(font: NativeHandle): CnaSpriteFontInfoSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_SpriteFontInfo");
      this.#routes.invoke("cna_sprite_font_get_info", font, info.pointer);
      return {
        CharacterCount: Number(info.getU64("character_count")),
        LineSpacing: info.getI32("line_spacing"),
        Spacing: info.getF32("spacing"),
        HasDefaultCharacter: info.getU8("has_default_character") !== 0,
        DefaultCharacter: info.getU16("default_character"),
      };
    } finally {
      scope.dispose();
    }
  }

  /** CNA's own answer for the size of a string in this font. */
  public override measureCnaSpriteFont(
    font: NativeHandle, text: string,
  ): { readonly X: number; readonly Y: number } {
    const scope = this.#routes.scope();
    try {
      const { pointer, byteLength } = scope.allocateUtf8(text);
      // A CNA_StringView passed by value, which wasm32 lowers as a pointer to a caller-owned copy.
      const view = allocateStruct(this.#routes.module, scope, "CNA_StringView", false);
      view.setPointer("data", pointer);
      view.setU64("byte_length", BigInt(byteLength));
      const size = allocateStruct(this.#routes.module, scope, "CNA_Vector2", false);
      this.#routes.invoke("cna_sprite_font_measure_utf8", font, view.pointer, size.pointer);
      return { X: size.getF32("x"), Y: size.getF32("y") };
    } finally {
      scope.dispose();
    }
  }

  /** Writes a `CNA_Rectangle` a caller allocated, from the snapshot's XNA-named fields. */
  #rectangle(
    target: WasmStruct,
    source: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number },
  ): void {
    target.setI32("x", Math.trunc(source.X));
    target.setI32("y", Math.trunc(source.Y));
    target.setI32("width", Math.trunc(source.Width));
    target.setI32("height", Math.trunc(source.Height));
  }
}
