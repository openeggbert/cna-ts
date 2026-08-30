/**
 * CNA's extended graphics layer: the physically-based material CNA renders with, the render
 * pipeline that drives its post-process chain, and what one pipeline frame did.
 *
 * None of this is XNA 4.0. XNA had `BasicEffect` and a fixed pipeline; CNA has a deferred pipeline
 * with tone mapping, bloom, ambient occlusion and shadow quality, and a game that wants those needs
 * an API that names them.
 *
 * The layer is an **opt-in CNA build option**. Its routes are declared and exported in every build
 * and answer `NOT_SUPPORTED` where it was compiled out, so structural presence is not availability:
 * ask {@link IsGraphicsExtensionLayerAvailable} before offering a feature that needs it. The two
 * default-value readers below are the exception — CNA documents them as pure value operations that
 * work in either build, and they do.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaGraphicsExtensionBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { Color } from "../../Microsoft/Xna/Framework/Color.js";
import type { GraphicsDevice } from "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { resolveGraphicsDeviceHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import type { NativeHandle } from "../../internal/ownership.js";

/** How CNA maps high dynamic range onto the display. */
export enum TonemappingMode {
  None = 0,
  Reinhard = 1,
  Filmic = 2,
  Aces = 3,
  Uncharted2 = 4,
}

/** The overall quality tier CNA renders at. */
export enum RenderQuality {
  Low = 0,
  Medium = 1,
  High = 2,
  Ultra = 3,
}

/** The quality tier CNA renders shadows at. */
export enum ShadowQuality {
  Disabled = 0,
  Low = 1,
  Medium = 2,
  High = 3,
  Ultra = 4,
}

/** How a PBR material's alpha is interpreted. */
export enum AlphaMode {
  Opaque = 0,
  Mask = 1,
  Blend = 2,
}

/**
 * A physically-based material.
 *
 * Constructed from CNA's own defaults rather than from numbers written here, so a game that changes
 * one factor keeps whatever the runtime considers neutral for the rest.
 */
export interface PbrMaterial {
  /** How metallic the surface is, from zero to one. */
  MetallicFactor: number;
  /** How rough the surface is, from zero to one. */
  RoughnessFactor: number;
  /** How strongly the normal map is applied. */
  NormalScale: number;
  /** How strongly ambient occlusion is applied. */
  OcclusionStrength: number;
  /** The alpha below which a masked material is discarded. */
  AlphaCutoff: number;
  /** Whether the material blends rather than masks. */
  AlphaBlendEnabled: boolean;
  /** The base colour. */
  AlbedoColor: Color;
  /** The colour the material emits. */
  EmissiveColor: Color;
}

/** The post-process and quality settings a render pipeline runs with. */
export interface RenderPipelineSettings {
  /** Linear exposure applied before tone mapping. */
  Exposure: number;
  /** Display gamma. */
  Gamma: number;
  /** How strongly bloom is mixed in. */
  BloomIntensity: number;
  /** Which tone-mapping curve is used. */
  TonemappingMode: TonemappingMode;
  /** The overall quality tier. */
  RenderQuality: RenderQuality;
  /** The shadow quality tier. */
  ShadowQuality: ShadowQuality;
  /** Whether the pipeline renders to a high-dynamic-range target. */
  HdrEnabled: boolean;
  /** Whether the bloom pass runs. */
  BloomEnabled: boolean;
  /** Whether the ambient-occlusion pass runs. */
  SsaoEnabled: boolean;
  /** Whether shadows are rendered. */
  ShadowsEnabled: boolean;
}

/** What one render-pipeline frame did. */
export interface RenderPipelineStatistics {
  /** How many passes the pipeline ran. */
  readonly PassesRun: number;
  /** How many times it switched render target. */
  readonly TargetSwitches: number;
  /** The pass count the pipeline itself reports for the last frame. */
  readonly LastFramePassCount: number;
  /** Whether the frame went through an offscreen scene target. */
  readonly UsedSceneTarget: boolean;
  /** Whether a skybox was drawn. */
  readonly DrewSkybox: boolean;
  /** CNA's estimate of the GPU memory the pipeline holds. */
  readonly GpuMemoryEstimateBytes: bigint;
}

function extensions(): CnaGraphicsExtensionBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.GraphicsExtensions == null) {
    throw new NativeUnavailableError(
      `CNA extended graphics requires a loaded backend: ${backend.Detail}`,
    );
  }
  return backend.GraphicsExtensions;
}

function unpack(packed: number): Color {
  return new Color(packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, (packed >>> 24) & 0xff);
}

/**
 * A PBR material seeded with CNA's own defaults.
 *
 * A pure value operation: it answers whether or not the extended layer was compiled in.
 */
export function CreatePbrMaterial(): PbrMaterial {
  const defaults = extensions().getDefaultPbrMaterial();
  return {
    MetallicFactor: defaults.MetallicFactor,
    RoughnessFactor: defaults.RoughnessFactor,
    NormalScale: defaults.NormalScale,
    OcclusionStrength: defaults.OcclusionStrength,
    AlphaCutoff: defaults.AlphaCutoff,
    AlphaBlendEnabled: defaults.AlphaBlendEnabled,
    AlbedoColor: unpack(defaults.AlbedoColor),
    EmissiveColor: unpack(defaults.EmissiveColor),
  };
}

/**
 * Render-pipeline settings seeded with CNA's own defaults.
 *
 * A pure value operation: it answers whether or not the extended layer was compiled in.
 */
export function CreateRenderPipelineSettings(): RenderPipelineSettings {
  const defaults = extensions().getDefaultRenderPipelineSettings();
  return {
    Exposure: defaults.Exposure,
    Gamma: defaults.Gamma,
    BloomIntensity: defaults.BloomIntensity,
    TonemappingMode: defaults.TonemappingMode as TonemappingMode,
    RenderQuality: defaults.RenderQuality as RenderQuality,
    ShadowQuality: defaults.ShadowQuality as ShadowQuality,
    HdrEnabled: defaults.HdrEnabled,
    BloomEnabled: defaults.BloomEnabled,
    SsaoEnabled: defaults.SsaoEnabled,
    ShadowsEnabled: defaults.ShadowsEnabled,
  };
}

/**
 * CNA's deferred render pipeline.
 *
 * A real native object with a real lifetime: it owns GPU resources and must be disposed, which is
 * why it carries `Dispose` rather than leaving cleanup to garbage collection. It needs the extended
 * graphics layer; construction refuses where the layer was compiled out.
 */
export class RenderPipeline implements IDisposable {
  readonly #backend: CnaGraphicsExtensionBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = extensions();
    this.#handle = this.#backend.createRenderPipeline(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the pipeline has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the render pipeline is disposed");
    return this.#handle;
  }

  /** Resizes the pipeline's targets. */
  public Resize(width: number, height: number): void {
    this.#backend.resizeRenderPipeline(this.#active(), Math.trunc(width), Math.trunc(height));
  }

  /** Begins a pipeline frame, clearing to a colour. */
  public Begin(clearColor: Color): void {
    if (clearColor == null) throw new TypeError("clearColor is required");
    this.#backend.beginRenderPipeline(this.#active(), clearColor.PackedValue);
  }

  /** Ends a pipeline frame and resolves it to the backbuffer. */
  public End(): void { this.#backend.endRenderPipeline(this.#active()); }

  /** What the last frame did. */
  public GetStatistics(): RenderPipelineStatistics {
    return this.#backend.getRenderPipelineStatistics(this.#active());
  }

  /** Releases the pipeline. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyRenderPipeline(handle);
  }
}

export { IsGraphicsExtensionLayerAvailable } from "../runtime/index.js";
