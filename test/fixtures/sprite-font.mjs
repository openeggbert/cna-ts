// SPDX-License-Identifier: MS-PL

/**
 * The sprite-font fixture both backends measure, and the strings they measure with it.
 *
 * `SpriteFont.MeasureString` is projected in TypeScript and CNA has its own implementation of the
 * same predicate; the whole value of comparing them comes from the *font*, because a font with
 * symmetric zero kerning and equal glyph heights makes almost every corner of the algorithm
 * unreachable and the two implementations agree by accident.
 *
 * So each glyph here is chosen to make one corner load-bearing:
 *
 * - `A` has a **negative left bearing** and a positive right one, so first-glyph clamping matters.
 * - `j` has a **negative right bearing**, which is what separates the clamped running width from
 *   the unclamped advance -- and is the one glyph upstream finding 27 turns on.
 * - `.` is narrow with a **tall cropping box**, so a line's height cannot come from `LineSpacing`.
 * - `W` is wide, `' '` is short, and `?` is the fallback with bearings on both sides.
 *
 * It lived inside the Node integration suite, which meant the browser could not use it. Two copies
 * of a font whose exact bearings are the point is how two suites come to be measuring different
 * questions and both stay green.
 */

/** The font both backends build: glyphs, spacing and a fallback. */
export const SPRITE_FONT_FIXTURE = Object.freeze({
  Glyphs: Object.freeze([
    { Character: "A", Bounds: [0, 0, 10, 12], Cropping: [0, 0, 10, 12], Kerning: [-2, 10, 3] },
    { Character: "j", Bounds: [10, 0, 6, 12], Cropping: [0, 2, 6, 16], Kerning: [1, 6, -3] },
    { Character: ".", Bounds: [16, 0, 3, 12], Cropping: [0, 0, 3, 20], Kerning: [0, 3, 0] },
    { Character: "W", Bounds: [19, 0, 18, 12], Cropping: [0, 0, 18, 12], Kerning: [0, 18, 0] },
    { Character: " ", Bounds: [37, 0, 5, 12], Cropping: [0, 0, 5, 4], Kerning: [0, 5, 0] },
    { Character: "?", Bounds: [42, 0, 8, 12], Cropping: [0, 0, 8, 12], Kerning: [2, 8, 2] },
  ].map(Object.freeze)),
  LineSpacing: 14,
  Spacing: 1.5,
  DefaultCharacter: "?",
});

/**
 * The strings both backends measure.
 *
 * Empty, single glyphs, pairs in both orders, multiple lines, a `\r\n`, a repeated run, runs of
 * spaces, the fallback itself and an absent character that the fallback stands in for.
 */
export const SPRITE_FONT_STRINGS = Object.freeze([
  "", "A", "j", ".", "W", "AA", "Aj", "jA", "jj", "A.j", "W W", "AjW.",
  "A\nj", "A\n\nW", "A\r\nj", "AjW.AjW.AjW.", " ", "  ", " A ", "\n", "\n\n", "?", "Z", "AZj",
]);

/**
 * The strings whose widest line ends in `j`, the only glyph with a negative right side bearing.
 *
 * This is the entire set on which the two implementations disagree, and the difference is exactly
 * that bearing's magnitude. See upstream finding 27.
 */
export const SPRITE_FONT_TRAILING_NEGATIVE_BEARING =
  Object.freeze(["j", "Aj", "jj", "A.j", "AZj"]);

/** The magnitude of `j`'s right side bearing, which is the whole of the divergence. */
export const SPRITE_FONT_NEGATIVE_BEARING = 3;
