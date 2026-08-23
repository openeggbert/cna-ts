import type { SpriteBatchCommand } from "../../../../internal/backend.js";
import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import { Color } from "../Color.js";
import { Matrix } from "../Matrix.js";
import { Rectangle } from "../Rectangle.js";
import { Vector2 } from "../Vector2.js";
import { bindBlendStateForInternalUse, BlendState } from "./BlendState.js";
import { bindDepthStencilStateForInternalUse, DepthStencilState } from "./DepthStencilState.js";
import {
  type Effect,
  leaseEffectForInternalUse,
  prepareEffectForInternalUse,
  resolveEffectHandleForInternalUse,
} from "./Effect.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  blendStateSnapshotForInternalUse,
  depthStencilStateSnapshotForInternalUse,
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  notifyGraphicsResourceCreatedForInternalUse,
  notifyGraphicsResourceDestroyedForInternalUse,
  rasterizerStateSnapshotForInternalUse,
  recordSpriteBatchStatesForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
  samplerStateSnapshotForInternalUse,
} from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  assertGraphicsResourceCompatibleForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";
import { bindRasterizerStateForInternalUse, RasterizerState } from "./RasterizerState.js";
import { bindSamplerStateForInternalUse, SamplerState } from "./SamplerState.js";
import { SpriteEffects, SpriteSortMode } from "./SpriteEnums.js";
import {
  appendSpriteFontGlyphPlacementsForInternalUse,
  type SpriteFont,
  spriteFontTextureForInternalUse,
} from "./SpriteFont.js";
import { resolveTexture2DHandleForInternalUse, type Texture2D } from "./Texture2D.js";

interface SpriteFontGlyphPlacement {
  readonly SourceRectangle: Rectangle;
  readonly Anchor: Vector2;
}

type SpriteBatchState = {
  readonly Device: GraphicsDevice;
  readonly Lifetime: NativeResourceLifetime;
  readonly Commands: SpriteBatchCommand[];
  readonly ReferencedTextures: Set<Texture2D>;
  readonly GlyphPlacements: SpriteFontGlyphPlacement[];
  ReferencedEffect: Effect | null;
  ReleaseEffectLease: (() => void) | null;
  Begun: boolean;
};

const states = new WeakMap<SpriteBatch, SpriteBatchState>();

function stateOf(batch: SpriteBatch): SpriteBatchState {
  assertGraphicsResourceActiveForInternalUse(batch);
  const state = states.get(batch);
  if (!state) throw new NativeUnavailableError("SpriteBatch construction did not complete");
  return state;
}

export class SpriteBatch extends GraphicsResource {
  public constructor(graphicsDevice: GraphicsDevice) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    const backend = graphicsDeviceBackendForInternalUse(graphicsDevice);
    const handle = backend.createSpriteBatch(resolveGraphicsDeviceHandleForInternalUse(graphicsDevice));
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: graphicsDeviceParentLifetimeForInternalUse(graphicsDevice),
      Release: (value) => backend.destroySpriteBatch(value),
      Label: "SpriteBatch",
    });
    states.set(this, {
      Device: graphicsDevice,
      Lifetime: lifetime,
      Commands: [],
      ReferencedTextures: new Set<Texture2D>(),
      GlyphPlacements: [],
      ReferencedEffect: null,
      ReleaseEffectLease: null,
      Begun: false,
    });
    attachGraphicsResourceForInternalUse(
      this,
      graphicsDevice,
      (name, tag) => notifyGraphicsResourceDestroyedForInternalUse(graphicsDevice, name, tag),
    );
    setGraphicsResourceLifetimeForInternalUse(
      this,
      () => {
        const state = states.get(this);
        if (state) {
          state.Commands.length = 0;
          state.ReferencedTextures.clear();
          state.ReleaseEffectLease?.();
          state.ReleaseEffectLease = null;
          state.ReferencedEffect = null;
          state.Begun = false;
        }
        lifetime.Dispose();
      },
      () => lifetime.State === "active",
    );
    notifyGraphicsResourceCreatedForInternalUse(graphicsDevice, this);
  }

  public Begin(): void;
  public Begin(sortMode: SpriteSortMode, blendState: BlendState): void;
  public Begin(
    sortMode: SpriteSortMode, blendState: BlendState, samplerState: SamplerState,
    depthStencilState: DepthStencilState, rasterizerState: RasterizerState,
  ): void;
  public Begin(
    sortMode: SpriteSortMode, blendState: BlendState, samplerState: SamplerState,
    depthStencilState: DepthStencilState, rasterizerState: RasterizerState, effect: Effect,
  ): void;
  public Begin(
    sortMode: SpriteSortMode, blendState: BlendState, samplerState: SamplerState,
    depthStencilState: DepthStencilState, rasterizerState: RasterizerState, effect: Effect,
    transformMatrix: Matrix,
  ): void;
  public Begin(
    sortMode = SpriteSortMode.Deferred,
    blendState?: BlendState | null,
    samplerState?: SamplerState | null,
    depthStencilState?: DepthStencilState | null,
    rasterizerState?: RasterizerState | null,
    effect?: Effect | null,
    transformMatrix?: Matrix | null,
  ): void {
    const state = stateOf(this);
    if (state.Begun) {
      throw new InvalidOperationException("Begin cannot be called again until End has succeeded");
    }
    if (!Number.isInteger(sortMode) || sortMode < SpriteSortMode.Deferred || sortMode > SpriteSortMode.FrontToBack) {
      throw new ArgumentOutOfRangeException("sortMode");
    }
    const backend = graphicsDeviceBackendForInternalUse(state.Device);
    const explicit = blendState != null || samplerState != null || depthStencilState != null ||
      rasterizerState != null || effect != null || transformMatrix != null;
    if (explicit) {
      const graphics = backend.Graphics;
      if (!graphics) {
        throw new NativeUnavailableError("Advanced SpriteBatch.Begin requires CNA graphics state routes");
      }
      const blend = blendState ?? BlendState.AlphaBlend;
      const sampler = samplerState ?? SamplerState.LinearClamp;
      const depth = depthStencilState ?? DepthStencilState.None;
      const rasterizer = rasterizerState ?? RasterizerState.CullCounterClockwise;
      const matrix = transformMatrix == null ? null : matrixSnapshot(transformMatrix);
      for (const value of [blend, sampler, depth, rasterizer]) {
        assertGraphicsResourceCompatibleForInternalUse(value, state.Device);
      }
      let releaseEffectLease: (() => void) | null = null;
      try {
        if (effect != null) {
          assertGraphicsResourceCompatibleForInternalUse(effect, state.Device);
          const effects = backend.Effects;
          if (effects == null) {
            throw new NativeUnavailableError("Effect-bearing SpriteBatch.Begin requires CNA Effect routes");
          }
          prepareEffectForInternalUse(effect);
          releaseEffectLease = leaseEffectForInternalUse(effect);
          effects.beginSpriteBatchWithEffect(
            state.Lifetime.Handle,
            sortMode,
            blendStateSnapshotForInternalUse(blend),
            samplerStateSnapshotForInternalUse(sampler),
            depthStencilStateSnapshotForInternalUse(depth),
            rasterizerStateSnapshotForInternalUse(rasterizer),
            resolveEffectHandleForInternalUse(effect),
            matrix,
          );
        } else {
          graphics.beginSpriteBatchWithStates(
            state.Lifetime.Handle,
            sortMode,
            blendStateSnapshotForInternalUse(blend),
            samplerStateSnapshotForInternalUse(sampler),
            depthStencilStateSnapshotForInternalUse(depth),
            rasterizerStateSnapshotForInternalUse(rasterizer),
            matrix,
          );
        }
      } catch (error) {
        releaseEffectLease?.();
        throw error;
      }
      bindBlendStateForInternalUse(blend, state.Device);
      bindSamplerStateForInternalUse(sampler, state.Device);
      bindDepthStencilStateForInternalUse(depth, state.Device);
      bindRasterizerStateForInternalUse(rasterizer, state.Device);
      recordSpriteBatchStatesForInternalUse(state.Device, blend, depth, rasterizer);
      state.ReferencedEffect = effect ?? null;
      state.ReleaseEffectLease = releaseEffectLease;
    } else {
      backend.beginSpriteBatch(state.Lifetime.Handle, sortMode);
      recordSpriteBatchStatesForInternalUse(
        state.Device, BlendState.AlphaBlend, DepthStencilState.None,
        RasterizerState.CullCounterClockwise,
      );
    }
    state.Commands.length = 0;
    state.ReferencedTextures.clear();
    state.Begun = true;
  }

  public Draw(texture: Texture2D, position: Vector2, color: Color): void;
  public Draw(texture: Texture2D, position: Vector2, sourceRectangle: Rectangle | null, color: Color): void;
  public Draw(
    texture: Texture2D, position: Vector2, sourceRectangle: Rectangle | null, color: Color,
    rotation: number, origin: Vector2, scale: number, effects: SpriteEffects, layerDepth: number,
  ): void;
  public Draw(
    texture: Texture2D, position: Vector2, sourceRectangle: Rectangle | null, color: Color,
    rotation: number, origin: Vector2, scale: Vector2, effects: SpriteEffects, layerDepth: number,
  ): void;
  public Draw(texture: Texture2D, destinationRectangle: Rectangle, color: Color): void;
  public Draw(
    texture: Texture2D, destinationRectangle: Rectangle, sourceRectangle: Rectangle | null, color: Color,
  ): void;
  public Draw(
    texture: Texture2D, destinationRectangle: Rectangle, sourceRectangle: Rectangle | null, color: Color,
    rotation: number, origin: Vector2, effects: SpriteEffects, layerDepth: number,
  ): void;
  public Draw(
    texture: Texture2D,
    positionOrDestination: Vector2 | Rectangle,
    sourceOrColor: Rectangle | Color | null,
    colorOrRotation?: Color | number,
    rotationOrOrigin?: number | Vector2,
    originOrScale?: Vector2 | number,
    scaleOrEffects?: Vector2 | number | SpriteEffects,
    effectsOrDepth?: SpriteEffects | number,
    layerDepth?: number,
  ): void {
    if (texture == null) throw new ArgumentNullException("texture");
    const state = stateOf(this);
    ensureBegun(state, "Draw");

    let source: Rectangle | null;
    let color: Color;
    let rotation: number;
    let origin: Vector2;
    let scale: Vector2;
    let effects: SpriteEffects;
    let depth: number;
    let position: Vector2;

    if (positionOrDestination instanceof Rectangle) {
      const destination = copyRectangle(positionOrDestination, "destinationRectangle");
      if (sourceOrColor instanceof Color) {
        source = null;
        color = sourceOrColor;
        rotation = 0;
        origin = Vector2.Zero;
        effects = SpriteEffects.None;
        depth = 0;
      } else {
        source = nullableRectangle(sourceOrColor, "sourceRectangle");
        if (!(colorOrRotation instanceof Color)) throw new ArgumentNullException("color");
        color = colorOrRotation;
        rotation = typeof rotationOrOrigin === "number" ? rotationOrOrigin : 0;
        origin = rotationOrOrigin instanceof Vector2 ? rotationOrOrigin :
          (originOrScale instanceof Vector2 ? originOrScale : Vector2.Zero);
        effects = typeof scaleOrEffects === "number" ? scaleOrEffects : SpriteEffects.None;
        depth = typeof effectsOrDepth === "number" ? effectsOrDepth : 0;
      }
      const sourceWidth = source?.Width ?? texture.Width;
      const sourceHeight = source?.Height ?? texture.Height;
      if (sourceWidth === 0 || sourceHeight === 0) throw new ArgumentException("sourceRectangle is empty");
      position = new Vector2(destination.X, destination.Y);
      scale = new Vector2(destination.Width / sourceWidth, destination.Height / sourceHeight);
    } else {
      if (!(positionOrDestination instanceof Vector2)) throw new ArgumentNullException("position");
      position = snapshotVector(positionOrDestination, "position");
      if (sourceOrColor instanceof Color) {
        source = null;
        color = sourceOrColor;
        rotation = 0;
        origin = Vector2.Zero;
        scale = Vector2.One;
        effects = SpriteEffects.None;
        depth = 0;
      } else {
        source = nullableRectangle(sourceOrColor, "sourceRectangle");
        if (!(colorOrRotation instanceof Color)) throw new ArgumentNullException("color");
        color = colorOrRotation;
        rotation = typeof rotationOrOrigin === "number" ? rotationOrOrigin : 0;
        origin = originOrScale instanceof Vector2 ? originOrScale : Vector2.Zero;
        if (scaleOrEffects instanceof Vector2) scale = snapshotVector(scaleOrEffects, "scale");
        else {
          const uniform = typeof scaleOrEffects === "number" ? scaleOrEffects : 1;
          scale = new Vector2(uniform, uniform);
        }
        effects = typeof effectsOrDepth === "number" ? effectsOrDepth : SpriteEffects.None;
        depth = typeof layerDepth === "number" ? layerDepth : 0;
      }
    }
    queueDraw(state, texture, position, source, color, rotation, origin, scale, effects, depth);
  }

  public DrawString(spriteFont: SpriteFont, text: string, position: Vector2, color: Color): void;
  public DrawString(
    spriteFont: SpriteFont, text: string, position: Vector2, color: Color,
    rotation: number, origin: Vector2, scale: number, effects: SpriteEffects, layerDepth: number,
  ): void;
  public DrawString(
    spriteFont: SpriteFont, text: string, position: Vector2, color: Color,
    rotation: number, origin: Vector2, scale: Vector2, effects: SpriteEffects, layerDepth: number,
  ): void;
  public DrawString(
    spriteFont: SpriteFont,
    text: string,
    position: Vector2,
    color: Color,
    rotation = 0,
    origin = Vector2.Zero,
    scale: number | Vector2 = Vector2.One,
    effects = SpriteEffects.None,
    layerDepth = 0,
  ): void {
    if (spriteFont == null) throw new ArgumentNullException("spriteFont");
    if (text == null) throw new ArgumentNullException("text");
    const state = stateOf(this);
    ensureBegun(state, "DrawString");
    state.GlyphPlacements.length = 0;
    appendSpriteFontGlyphPlacementsForInternalUse(spriteFont, text, state.GlyphPlacements);
    const glyphScale = typeof scale === "number" ? new Vector2(scale, scale) : scale;
    for (const placement of state.GlyphPlacements) {
      queueDraw(
        state, spriteFontTextureForInternalUse(spriteFont), position, placement.SourceRectangle,
        color, rotation, Vector2.Subtract(origin, placement.Anchor), glyphScale, effects, layerDepth,
      );
    }
  }

  public End(): void {
    const state = stateOf(this);
    ensureBegun(state, "End");
    const backend = graphicsDeviceBackendForInternalUse(state.Device);
    if (state.Commands.length > 0) {
      backend.submitSpriteBatch(state.Lifetime.Handle, state.Commands);
      state.Commands.length = 0;
      state.ReferencedTextures.clear();
    }
    backend.endSpriteBatch(state.Lifetime.Handle);
    state.Begun = false;
    state.ReleaseEffectLease?.();
    state.ReleaseEffectLease = null;
    state.ReferencedEffect = null;
  }

}

function matrixSnapshot(value: Matrix): number[] {
  if (!(value instanceof Matrix)) throw new ArgumentException("transformMatrix must be a Matrix");
  const result = [
    value.M11, value.M12, value.M13, value.M14,
    value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34,
    value.M41, value.M42, value.M43, value.M44,
  ];
  if (!result.every(Number.isFinite)) {
    throw new ArgumentException("transformMatrix must contain only finite values");
  }
  return result;
}

function ensureBegun(state: SpriteBatchState, operation: string): void {
  if (!state.Begun) throw new InvalidOperationException(`Begin must be called before ${operation}`);
}

function nullableRectangle(value: unknown, name: string): Rectangle | null {
  if (value == null) return null;
  if (!(value instanceof Rectangle)) throw new ArgumentException(`${name} must be a Rectangle or null`);
  return copyRectangle(value, name);
}

function copyRectangle(value: Rectangle, name: string): Rectangle {
  for (const component of [value.X, value.Y, value.Width, value.Height]) {
    if (!Number.isInteger(component)) throw new ArgumentException(`${name} must contain integers`);
  }
  return new Rectangle(value.X, value.Y, value.Width, value.Height);
}

function snapshotVector(value: Vector2, name: string): Vector2 {
  if (!(value instanceof Vector2) || !Number.isFinite(value.X) || !Number.isFinite(value.Y)) {
    throw new ArgumentException(`${name} must be a finite Vector2`);
  }
  return new Vector2(value.X, value.Y);
}

function queueDraw(
  state: SpriteBatchState, texture: Texture2D, position: Vector2,
  sourceRectangle: Rectangle | null, color: Color, rotation: number,
  origin: Vector2, scale: Vector2, effects: SpriteEffects, layerDepth: number,
): void {
  if (!(color instanceof Color)) throw new ArgumentNullException("color");
  if (texture.GraphicsDevice !== state.Device) {
    throw new InvalidOperationException("The Texture2D belongs to a different GraphicsDevice");
  }
  position = snapshotVector(position, "position");
  origin = snapshotVector(origin, "origin");
  scale = snapshotVector(scale, "scale");
  if (!Number.isFinite(rotation)) throw new ArgumentOutOfRangeException("rotation");
  if (!Number.isFinite(layerDepth)) throw new ArgumentOutOfRangeException("layerDepth");
  if (!Number.isInteger(effects) || effects < 0 || (effects & ~3) !== 0) {
    throw new ArgumentOutOfRangeException("effects");
  }
  const source = sourceRectangle ?? new Rectangle(0, 0, texture.Width, texture.Height);
  if (source.X < 0 || source.Y < 0 || source.Width <= 0 || source.Height <= 0 ||
      source.X > texture.Width - source.Width || source.Y > texture.Height - source.Height) {
    throw new ArgumentException("sourceRectangle is empty, negative, or outside the Texture2D");
  }
  state.Commands.push({
    Texture: resolveTexture2DHandleForInternalUse(texture),
    PositionX: position.X, PositionY: position.Y,
    SourceX: source.X, SourceY: source.Y, SourceWidth: source.Width, SourceHeight: source.Height,
    ColorR: color.R, ColorG: color.G, ColorB: color.B, ColorA: color.A,
    Rotation: Math.fround(rotation), OriginX: origin.X, OriginY: origin.Y,
    ScaleX: scale.X, ScaleY: scale.Y, Effects: effects, LayerDepth: Math.fround(layerDepth),
  });
  state.ReferencedTextures.add(texture);
}
