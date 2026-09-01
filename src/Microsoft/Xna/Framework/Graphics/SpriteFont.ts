import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import { Rectangle } from "../Rectangle.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import type { Texture2D } from "./Texture2D.js";

type SpriteFontGlyphData = {
  readonly Texture: Texture2D;
  readonly GlyphBounds: ReadonlyArray<Rectangle>;
  readonly Cropping: ReadonlyArray<Rectangle>;
  readonly Characters: ReadonlyArray<string>;
  readonly LineSpacing: number;
  readonly Spacing: number;
  readonly Kerning: ReadonlyArray<Vector3>;
  readonly DefaultCharacter: string | null;
}

type SpriteFontGlyphPlacement = {
  readonly SourceRectangle: Rectangle;
  readonly Anchor: Vector2;
}

type SpriteFontState = {
  readonly Texture: Texture2D;
  readonly GlyphBounds: readonly Rectangle[];
  readonly Cropping: readonly Rectangle[];
  readonly Characters: readonly string[];
  readonly Kerning: readonly Vector3[];
  readonly CharacterIndex: ReadonlyMap<string, number>;
  LineSpacing: number;
  Spacing: number;
  DefaultCharacter: string | null;
};

const states = new WeakMap<SpriteFont, SpriteFontState>();

function stateOf(font: SpriteFont): SpriteFontState {
  const state = states.get(font);
  if (!state) throw new TypeError("SpriteFont was not constructed by the content reader");
  return state;
}

/** Bitmap-font graph produced by the SpriteFont content reader. */
export class SpriteFont {
  public get Characters(): ReadonlyArray<string> { return stateOf(this).Characters; }

  public get DefaultCharacter(): string | null { return stateOf(this).DefaultCharacter; }
  public set DefaultCharacter(value: string | null) {
    if (value !== null && (typeof value !== "string" || [...value].length !== 1)) {
      throw new ArgumentException("DefaultCharacter must be null or one UTF-16 character");
    }
    stateOf(this).DefaultCharacter = value;
  }

  public get LineSpacing(): number { return stateOf(this).LineSpacing; }
  public set LineSpacing(value: number) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new ArgumentOutOfRangeException("value");
    }
    stateOf(this).LineSpacing = value;
  }

  public get Spacing(): number { return stateOf(this).Spacing; }
  public set Spacing(value: number) {
    if (!Number.isFinite(value)) throw new ArgumentOutOfRangeException("value");
    stateOf(this).Spacing = Math.fround(value);
  }

  public MeasureString(text: string): Vector2 {
    if (text == null) throw new ArgumentNullException("text");
    if (typeof text !== "string") throw new ArgumentException("text must be a string");
    return walk(this, text, null);
  }
}

export function createSpriteFontForInternalUse(data: SpriteFontGlyphData): SpriteFont {
  if (data == null) throw new ArgumentNullException("data");
  if (data.Texture == null) throw new ArgumentNullException("texture");
  const count = data.Characters?.length;
  if (count == null || data.GlyphBounds == null || data.Cropping == null || data.Kerning == null) {
    throw new ArgumentNullException("glyph data");
  }
  if (data.GlyphBounds.length !== count || data.Cropping.length !== count || data.Kerning.length !== count) {
    throw new ArgumentException("GlyphBounds, Cropping, Characters, and Kerning must have equal lengths");
  }
  if (!Number.isFinite(data.LineSpacing) || !Number.isInteger(data.LineSpacing)) {
    throw new ArgumentOutOfRangeException("lineSpacing");
  }
  if (!Number.isFinite(data.Spacing)) throw new ArgumentOutOfRangeException("spacing");

  const characters = data.Characters.map((value) => {
    if (typeof value !== "string" || [...value].length !== 1) {
      throw new ArgumentException("Each SpriteFont character must be one UTF-16 character");
    }
    return value;
  });
  const characterIndex = new Map<string, number>();
  characters.forEach((value, index) => characterIndex.set(value, index));
  const font = new SpriteFont();
  states.set(font, {
    Texture: data.Texture,
    GlyphBounds: Object.freeze(data.GlyphBounds.map(copyRectangle)),
    Cropping: Object.freeze(data.Cropping.map(copyRectangle)),
    Characters: Object.freeze(characters),
    Kerning: Object.freeze(data.Kerning.map((value) => new Vector3(value.X, value.Y, value.Z))),
    CharacterIndex: characterIndex,
    LineSpacing: data.LineSpacing,
    Spacing: Math.fround(data.Spacing),
    DefaultCharacter: null,
  });
  font.DefaultCharacter = data.DefaultCharacter;
  return font;
}

export function spriteFontTextureForInternalUse(font: SpriteFont): Texture2D {
  return stateOf(font).Texture;
}

/**
 * Internal: the font's complete glyph table, in the shape CNA's reader takes.
 *
 * Only the measurement oracle uses this. XNA exposes `Characters` but not the bounds, cropping or
 * kerning behind them, and that stays true: this is not a public accessor, it is the input to a
 * second implementation of `MeasureString` that the tests compare this one against.
 */
export function spriteFontGlyphTableForInternalUse(font: SpriteFont): readonly {
  readonly Character: number;
  readonly Bounds: { X: number; Y: number; Width: number; Height: number };
  readonly Cropping: { X: number; Y: number; Width: number; Height: number };
  readonly KerningLeft: number;
  readonly KerningWidth: number;
  readonly KerningRight: number;
}[] {
  const state = stateOf(font);
  return state.Characters.map((character, index) => {
    const bounds = state.GlyphBounds[index]!;
    const cropping = state.Cropping[index]!;
    const kerning = state.Kerning[index]!;
    return {
      Character: character.codePointAt(0) ?? 0,
      Bounds: { X: bounds.X, Y: bounds.Y, Width: bounds.Width, Height: bounds.Height },
      Cropping: {
        X: cropping.X, Y: cropping.Y, Width: cropping.Width, Height: cropping.Height,
      },
      KerningLeft: kerning.X,
      KerningWidth: kerning.Y,
      KerningRight: kerning.Z,
    };
  });
}

export function appendSpriteFontGlyphPlacementsForInternalUse(
  font: SpriteFont,
  text: string,
  placements: SpriteFontGlyphPlacement[],
): void {
  if (text == null) throw new ArgumentNullException("text");
  walk(font, text, placements);
}

function copyRectangle(value: Rectangle): Rectangle {
  if (!(value instanceof Rectangle)) throw new ArgumentException("Glyph rectangles must be Rectangle values");
  return new Rectangle(value.X, value.Y, value.Width, value.Height);
}

function walk(
  font: SpriteFont,
  text: string,
  placements: SpriteFontGlyphPlacement[] | null,
): Vector2 {
  const state = stateOf(font);
  if (text.length === 0) return Vector2.Zero;
  let width = 0;
  let finalLineHeight = state.LineSpacing;
  let offsetX = 0;
  let offsetY = 0;
  let firstGlyphOfLine = true;

  for (const character of text) {
    if (character === "\r") continue;
    if (character === "\n") {
      finalLineHeight = state.LineSpacing;
      offsetX = 0;
      offsetY += state.LineSpacing;
      firstGlyphOfLine = true;
      continue;
    }
    let index = state.CharacterIndex.get(character);
    if (index === undefined && state.DefaultCharacter !== null) {
      index = state.CharacterIndex.get(state.DefaultCharacter);
    }
    if (index === undefined) {
      throw new ArgumentException(
        `Character '${character}' is not in this SpriteFont, and no DefaultCharacter is set`,
      );
    }
    const kerning = state.Kerning[index];
    const cropping = state.Cropping[index];
    if (firstGlyphOfLine) {
      offsetX += Math.max(kerning.X, 0);
      firstGlyphOfLine = false;
    } else {
      offsetX += state.Spacing + kerning.X;
    }
    placements?.push({
      SourceRectangle: state.GlyphBounds[index],
      Anchor: new Vector2(offsetX + cropping.X, offsetY + cropping.Y),
    });
    offsetX += kerning.Y;
    width = Math.max(width, offsetX + Math.max(kerning.Z, 0));
    offsetX += kerning.Z;
    finalLineHeight = Math.max(finalLineHeight, cropping.Height);
  }
  return new Vector2(width, offsetY + finalLineHeight);
}
