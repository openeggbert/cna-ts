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
import type {
  BoundingSphereSnapshot, ClusteredLightSnapshot, CnaClusteredLightingBackend, CnaComputeBackend,
  CnaDecalBackend,
  CnaDepthNormalPrepassBackend,
  CnaAtmosphereBackend,
  CnaLightProbeBackend,
  SceneFaceDraw,
  ClusterBoundsSnapshot,
  CnaLodBackend,
  CnaParticleBackend,
  ParticleEmitterSettingsSnapshot,
  ParticleSnapshot,
  Vector4Snapshot,
  CnaShadowBackend,
  CnaEffectBackend,
  CnaGraphicsBackend,
  CnaGraphicsExtensionBackend,
} from "../../internal/backend.js";
import { BoundingBox } from "../../Microsoft/Xna/Framework/BoundingBox.js";
import { BoundingSphere } from "../../Microsoft/Xna/Framework/BoundingSphere.js";
import { Matrix } from "../../Microsoft/Xna/Framework/Matrix.js";
import { Vector2 } from "../../Microsoft/Xna/Framework/Vector2.js";
import { Vector3 } from "../../Microsoft/Xna/Framework/Vector3.js";
import { Vector4 } from "../../Microsoft/Xna/Framework/Vector4.js";
import type { CubeMapFace } from "../../Microsoft/Xna/Framework/Graphics/TextureEnums.js";
import type { SurfaceFormat } from "../../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { Color } from "../../Microsoft/Xna/Framework/Color.js";
import type { GraphicsDevice } from "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { resolveGraphicsDeviceHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { graphicsDeviceBackendForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { adoptNativeEffectForInternalUse, type Effect } from
  "../../Microsoft/Xna/Framework/Graphics/Effect.js";
import { resolveEffectHandleForInternalUse, markEffectTransferredForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/Effect.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import type { PassTimingSnapshot, PostProcessFrameSnapshot } from "../../internal/backend.js";
import type { RenderTarget2D } from "../../Microsoft/Xna/Framework/Graphics/RenderTargets.js";
import { Texture2D } from "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import { resolveTexture2DHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import { TextureCube } from "../../Microsoft/Xna/Framework/Graphics/TextureCube.js";
import { Texture3D } from "../../Microsoft/Xna/Framework/Graphics/Texture3D.js";
import { resolveTexture3DHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/Texture3D.js";
import { Rectangle } from "../../Microsoft/Xna/Framework/Rectangle.js";
import {
  resolveTextureCubeHandleForInternalUse, transferTextureCubeForInternalUse,
} from "../../Microsoft/Xna/Framework/Graphics/TextureCube.js";
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
/*
 * The pipeline's skybox is CNA's borrow, and this side of it is a plain association: CNA hands back
 * a fresh handle for a borrow, so the only way to give a caller the object it set is to remember
 * it. The map is weak on both sides, so neither keeps the other alive.
 */
const attachedSkyboxes = new WeakMap<RenderPipeline, Skybox>();

/* Filled in by Skybox's static block, which is the only place its private handle is reachable. */
let skyboxOfPipeline!: (pipeline: NativeHandle) => NativeHandle;
let setSkyboxOfPipeline!: (pipeline: NativeHandle, skybox: Skybox | null) => void;

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

  /**
   * The sky this pipeline draws behind the scene, or `null` for none.
   *
   * **Borrowed, not owned**: the skybox stays the caller's and must outlive the pipeline's use of
   * it. Reading it back gives the same skybox object that was set, rather than a wrapper around a
   * fresh borrow, so a caller can compare it.
   */
  public get Skybox(): Skybox | null {
    /*
     * **Not released here, although the header says it is a borrow.**
     * `cna_render_pipeline_get_skybox` documents its answer as a handle that "keeps the pipeline
     * alive while it exists and releases only itself" -- the counted-borrow contract the rest of
     * this layer uses. Its implementation returns the stored handle unchanged, so releasing it
     * destroys the caller's own skybox. That is `docs/upstream-cna-findings.md` item 15, measured
     * rather than read: this getter released the answer for exactly one revision of this file, and
     * the skybox's own Dispose then refused with an invalid handle.
     */
    const handle = skyboxOfPipeline(this.#active());
    return handle === 0n ? null : (attachedSkyboxes.get(this) ?? null);
  }
  public set Skybox(value: Skybox | null) {
    setSkyboxOfPipeline(this.#active(), value);
    if (value == null) attachedSkyboxes.delete(this);
    else attachedSkyboxes.set(this, value);
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


/* --- the post-process chain ------------------------------------------------------------------
 *
 * The engine layer's post-process chain, which is what sits between a rendered scene and the
 * screen. Each pass is its own class with its own named properties rather than a descriptor bag,
 * because a game tuning bloom wants `Intensity`, not a field index -- and because a wrong field in
 * a bag is a value silently applied to the wrong effect.
 *
 * The whole family is opt-in CNA surface: its routes exist in every build and answer NOT_SUPPORTED
 * where the extended layer was compiled out, so ask IsGraphicsExtensionLayerAvailable before
 * offering any of it. Whether a pass can do its *real* work on a given renderer is a further,
 * separate question -- PostProcessPass.IsSupportedOn -- and a `false` there is a documented
 * degradation to a copy, not a failure.
 */

/**
 * One frame's inputs to a post-process pass or chain.
 *
 * The camera scalars and the optional depth, normal and velocity inputs are what a pass that reads
 * more than colour needs; a pass that reads only colour ignores them. `Destination` is `null` for
 * the back buffer, which is what a final pass wants.
 */
export interface PostProcessFrame {
  /** The colour input. Required: a chain has nothing to read without one. */
  readonly Source: Texture2D;
  /** Where the result goes, or `null` for the back buffer. */
  readonly Destination?: RenderTarget2D | null;
  /** The destination's width in pixels. Must be positive. */
  readonly Width: number;
  /** The destination's height in pixels. Must be positive. */
  readonly Height: number;
  /** Linear depth, for a pass that reads it. */
  readonly SourceDepth?: Texture2D | null;
  /** World or view normals, for a pass that reads them. */
  readonly SourceNormals?: Texture2D | null;
  /** Screen-space velocity, for a pass that reads it. */
  readonly SourceVelocity?: Texture2D | null;
  /** Seconds since the previous frame. */
  readonly ElapsedSeconds?: number;
  /** The camera's near plane distance. */
  readonly NearPlane?: number;
  /** The camera's far plane distance. */
  readonly FarPlane?: number;
}

/** How long one pass took on the GPU, averaged over the samples the chain recorded. */
export interface PostProcessPassTiming {
  /** The pass's own name, as CNA reports it. */
  readonly Name: string;
  /** How many samples the average is over; zero when the pass has not been timed. */
  readonly SampleCount: number;
  /** Mean milliseconds on the GPU. */
  readonly Milliseconds: number;
}

function postProcessDeviceHandle(graphicsDevice: GraphicsDevice): NativeHandle {
  if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
  return resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
}

function textureHandleOrNone(texture: Texture2D | null | undefined): NativeHandle {
  // CNA_INVALID_HANDLE, which is how this ABI spells "this input is absent".
  return texture == null ? 0n : resolveTexture2DHandleForInternalUse(texture);
}

function frameSnapshot(frame: PostProcessFrame): PostProcessFrameSnapshot {
  if (frame == null) throw new TypeError("a post-process frame is required");
  if (frame.Source == null) throw new TypeError("a post-process frame needs a Source");
  const width = Math.trunc(frame.Width);
  const height = Math.trunc(frame.Height);
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError("a post-process frame needs a positive Width and Height");
  }
  return {
    Source: resolveTexture2DHandleForInternalUse(frame.Source),
    Destination: textureHandleOrNone(frame.Destination),
    Width: width,
    Height: height,
    SourceDepth: textureHandleOrNone(frame.SourceDepth),
    SourceNormals: textureHandleOrNone(frame.SourceNormals),
    SourceVelocity: textureHandleOrNone(frame.SourceVelocity),
    ElapsedSeconds: frame.ElapsedSeconds ?? 0,
    NearPlane: frame.NearPlane ?? 0,
    FarPlane: frame.FarPlane ?? 0,
  };
}

/**
 * One step of a post-process chain.
 *
 * A pass owns a native object and is released with {@link Dispose}, with one exception that is the
 * whole reason this class tracks its own state: {@link PostProcessChain.AddOwned} **hands the
 * object to the chain**. CNA's `add_owned_pass` is the one route in the engine layer that
 * invalidates a handle the caller still holds, so after that call this wrapper stops being an
 * owner: `Dispose` becomes a no-op and every other member refuses, because releasing it a second
 * time would be a double free and using it after the chain released it would be worse.
 */
export abstract class PostProcessPass implements IDisposable {
  #handle: NativeHandle | null;
  #transferred = false;

  protected constructor(handle: NativeHandle) { this.#handle = handle; }

  /** @internal The live handle, or a refusal naming why it is gone. */
  protected get HandleForInternalUse(): NativeHandle {
    if (this.#transferred) {
      throw new NativeUnavailableError(
        "this post-process pass was handed to a chain with AddOwned and is now the chain's",
      );
    }
    if (this.#handle == null) throw new NativeUnavailableError("this post-process pass is disposed");
    return this.#handle;
  }

  /** @internal */
  public get HandleForChainUse(): NativeHandle { return this.HandleForInternalUse; }

  /** @internal Called by a chain that has taken ownership. */
  public MarkTransferredForInternalUse(): void {
    this.#handle = null;
    this.#transferred = true;
  }

  /** Whether the pass has been released. */
  public get IsDisposed(): boolean { return this.#handle == null && !this.#transferred; }

  /** Whether a chain has taken ownership of this pass. */
  public get IsOwnedByChain(): boolean { return this.#transferred; }

  /** The pass's own name, as CNA reports it; used in its GPU timings. */
  public get Name(): string { return extensions().getPostProcessPassName(this.HandleForInternalUse); }

  /**
   * Whether the pass can do its real work on a device.
   *
   * `false` is not a failure. The layer's contract is that such a pass degrades — typically to a
   * copy — rather than refusing, so a chain may still run it. Ask this to know which you will get,
   * not to decide whether calling is safe.
   */
  public IsSupportedOn(graphicsDevice: GraphicsDevice): boolean {
    return extensions().isPostProcessPassSupported(
      this.HandleForInternalUse, postProcessDeviceHandle(graphicsDevice),
    );
  }

  /** Runs this pass alone over one frame's inputs. */
  public Apply(frame: PostProcessFrame): void {
    extensions().applyPostProcessPass(this.HandleForInternalUse, frameSnapshot(frame));
  }

  /** Releases the pass. Harmless twice, and a no-op once a chain owns it. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    extensions().destroyPostProcessPass(handle);
  }
}

/**
 * Copies its source to its destination unchanged. The simplest pass there is, and what a
 * chain degrades to when another pass cannot do its real work.
 */
export class BlitPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createBlitPass(postProcessDeviceHandle(graphicsDevice)));
  }
}

/**
 * Extracts the bright parts of the scene, blurs them and adds them back.
 */
export class BloomPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createBloomPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** How strongly the bloom is added back over the scene. */
  public get Intensity(): number { return extensions().getBloomIntensity(this.HandleForInternalUse); }
  public set Intensity(value: number) { extensions().setBloomIntensity(this.HandleForInternalUse, value); }

  /** The luminance above which a texel contributes to the bloom. */
  public get Threshold(): number { return extensions().getBloomThreshold(this.HandleForInternalUse); }
  public set Threshold(value: number) { extensions().setBloomThreshold(this.HandleForInternalUse, value); }

  /** How many downsample/upsample steps the blur takes. */
  public get Iterations(): number { return extensions().getBloomIterations(this.HandleForInternalUse); }
  public set Iterations(value: number) {
    extensions().setBloomIterations(this.HandleForInternalUse, Math.trunc(value));
  }

  /** CNA's own iteration count for a quality tier, rather than a number guessed here. */
  public static IterationsForQuality(quality: RenderQuality): number {
    return extensions().bloomIterationsForQuality(quality);
  }

  /**
   * What one channel contributes to the bloom, given a threshold.
   *
   * The pure function behind the extraction step, and it is a **soft knee** rather than a cut: the
   * contribution ramps from nothing at half a threshold below it to all of it at half a threshold
   * above, squared so the ramp starts gently. Exactly at the threshold a channel contributes a
   * quarter of itself. A hard cut would make a bright edge pop into the bloom as it crossed, which
   * is the flicker this shape exists to avoid.
   */
  public static ExtractChannel(value: number, threshold: number): number {
    for (const [name, argument] of [["value", value], ["threshold", threshold]] as const) {
      if (typeof argument !== "number" || !Number.isFinite(argument)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return extensions().extractBloomChannel(value, threshold);
  }

  /** Releases the pass's pooled intermediate targets without releasing the pass. */
  public ResetTargets(): void { extensions().resetBloomTargets(this.HandleForInternalUse); }
}

/**
 * Maps high dynamic range onto the display, through an exposure, a curve and a gamma.
 */
export class TonemapPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createTonemapPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /**
   * One channel through one of the curves, on the CPU and without a pass.
   *
   * The same arithmetic the shader runs, which is what makes a tonemapped frame checkable: apply
   * the exposure, then the curve, then the gamma. {@link TonemappingMode.None} is the identity
   * apart from those two, so it is the control every other mode is compared against.
   */
  public static TonemapChannel(
    mode: TonemappingMode, value: number, exposure: number, gamma: number,
  ): number {
    if (!Number.isInteger(mode)) throw new TypeError("mode must be a TonemappingMode");
    for (const [name, argument] of [
      ["value", value], ["exposure", exposure], ["gamma", gamma],
    ] as const) {
      if (typeof argument !== "number" || !Number.isFinite(argument)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return extensions().tonemapChannel(mode, value, exposure, gamma);
  }

  /** The linear exposure applied before the curve. */
  public get Exposure(): number { return extensions().getTonemapExposure(this.HandleForInternalUse); }
  public set Exposure(value: number) { extensions().setTonemapExposure(this.HandleForInternalUse, value); }

  /** The display gamma applied after it. */
  public get Gamma(): number { return extensions().getTonemapGamma(this.HandleForInternalUse); }
  public set Gamma(value: number) { extensions().setTonemapGamma(this.HandleForInternalUse, value); }

  /** How much dither is added to break up banding. */
  public get DebandStrength(): number { return extensions().getTonemapDebandStrength(this.HandleForInternalUse); }
  public set DebandStrength(value: number) { extensions().setTonemapDebandStrength(this.HandleForInternalUse, value); }

  /** The curve CNA maps high dynamic range through. */
  public get Mode(): TonemappingMode {
    return extensions().getTonemapMode(this.HandleForInternalUse) as TonemappingMode;
  }
  public set Mode(value: TonemappingMode) { extensions().setTonemapMode(this.HandleForInternalUse, value); }

  /** Whether dither is added to break up banding in dark gradients. */
  public get DebandEnabled(): boolean {
    return extensions().getTonemapDebandEnabled(this.HandleForInternalUse);
  }
  public set DebandEnabled(value: boolean) {
    extensions().setTonemapDebandEnabled(this.HandleForInternalUse, Boolean(value));
  }
}

/**
 * Fast approximate anti-aliasing, applied to the final image.
 */
export class FxaaPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createFxaaPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** The luminance difference that counts as an edge. */
  public get EdgeThreshold(): number { return extensions().getFxaaEdgeThreshold(this.HandleForInternalUse); }
  public set EdgeThreshold(value: number) { extensions().setFxaaEdgeThreshold(this.HandleForInternalUse, value); }

  /** CNA's own edge threshold for a quality tier. */
  public static EdgeThresholdForQuality(quality: RenderQuality): number {
    return extensions().fxaaEdgeThresholdForQuality(quality);
  }

  /** CNA's own fragment source, for a game that wants the same anti-aliasing in its own shader. */
  public static get FragmentGlsl(): string { return extensions().getFxaaFragmentGlsl(); }
}

/**
 * Screen-space ambient occlusion: darkens the creases the lighting cannot reach into.
 */
export class SsaoPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createSsaoPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** The world-space sampling radius, in units. */
  public get Radius(): number { return extensions().getSsaoRadius(this.HandleForInternalUse); }
  public set Radius(value: number) { extensions().setSsaoRadius(this.HandleForInternalUse, value); }

  /** How strongly the occlusion darkens the scene. */
  public get Intensity(): number { return extensions().getSsaoIntensity(this.HandleForInternalUse); }
  public set Intensity(value: number) { extensions().setSsaoIntensity(this.HandleForInternalUse, value); }

  /** How many occlusion samples each texel takes. */
  public get SampleCount(): number { return extensions().getSsaoSampleCount(this.HandleForInternalUse); }
  public set SampleCount(value: number) {
    extensions().setSsaoSampleCount(this.HandleForInternalUse, Math.trunc(value));
  }

  /** Whether occlusion is computed at half resolution. */
  public get HalfResolution(): boolean { return extensions().getSsaoHalfResolution(this.HandleForInternalUse); }
  public set HalfResolution(value: boolean) {
    extensions().setSsaoHalfResolution(this.HandleForInternalUse, Boolean(value));
  }

  /** CNA's own sample count for a quality tier. */
  public static SampleCountForQuality(quality: RenderQuality): number {
    return extensions().ssaoSampleCountForQuality(quality);
  }

  /**
   * The hemisphere of sample directions this pass occludes with.
   *
   * Every one lies in the hemisphere around +Z and inside the unit sphere, and they are packed
   * towards the origin rather than spread evenly — near samples say more about a crease than far
   * ones do. Reading them is how a game writing its own occlusion shader gets the same kernel
   * rather than inventing a second one.
   */
  public get Kernel(): readonly Vector3[] {
    return Object.freeze(extensions().getSsaoKernel(this.HandleForInternalUse).map(toVector3));
  }

  /**
   * CNA's own occlusion GLSL, for the packed or the half-float depth encoding.
   *
   * `packed` must match what the prepass feeding it actually stores;
   * {@link DepthNormalPrepass.IsDepthPacked} answers that.
   */
  public static OcclusionGlsl(packed: boolean): string {
    return extensions().getSsaoOcclusionGlsl(packed === true);
  }

  /** Releases the pass's pooled intermediate targets without releasing the pass. */
  public ResetTargets(): void { extensions().resetSsaoTargets(this.HandleForInternalUse); }
}

/**
 * Screen-space reflections, marched against the depth buffer.
 */
export class SsrPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createSsrPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** How strongly the reflection is blended in. */
  public get Intensity(): number { return extensions().getSsrIntensity(this.HandleForInternalUse); }
  public set Intensity(value: number) { extensions().setSsrIntensity(this.HandleForInternalUse, value); }

  /** How far a ray marches before it gives up, in units. */
  public get MaxDistance(): number { return extensions().getSsrMaxDistance(this.HandleForInternalUse); }
  public set MaxDistance(value: number) { extensions().setSsrMaxDistance(this.HandleForInternalUse, value); }

  /** How thick the depth buffer's surfaces are assumed to be. */
  public get Thickness(): number { return extensions().getSsrThickness(this.HandleForInternalUse); }
  public set Thickness(value: number) { extensions().setSsrThickness(this.HandleForInternalUse, value); }

  /** The bias applied when comparing a ray against depth. */
  public get DepthBias(): number { return extensions().getSsrDepthBias(this.HandleForInternalUse); }
  public set DepthBias(value: number) { extensions().setSsrDepthBias(this.HandleForInternalUse, value); }

  /** How far from the screen edge a reflection fades out. */
  public get EdgeFade(): number { return extensions().getSsrEdgeFade(this.HandleForInternalUse); }
  public set EdgeFade(value: number) { extensions().setSsrEdgeFade(this.HandleForInternalUse, value); }

  /** How much a rough surface blurs its reflection. */
  public get RoughnessBlur(): number { return extensions().getSsrRoughnessBlur(this.HandleForInternalUse); }
  public set RoughnessBlur(value: number) { extensions().setSsrRoughnessBlur(this.HandleForInternalUse, value); }

  /** How many steps a reflection ray marches. */
  public get StepCount(): number { return extensions().getSsrStepCount(this.HandleForInternalUse); }
  public set StepCount(value: number) {
    extensions().setSsrStepCount(this.HandleForInternalUse, Math.trunc(value));
  }
}

/**
 * An ordered list of post-process passes, run over pooled intermediate targets.
 *
 * The chain ping-pongs between its own targets, so a game writes its scene once and reads the
 * finished image out the other end. Two ways to add a pass, and they are different on purpose:
 *
 * - {@link Add} **borrows**. The caller keeps the pass, must keep it alive for as long as the chain
 *   holds it, and must dispose it afterwards.
 * - {@link AddOwned} **transfers**. The chain releases the pass when it is cleared or disposed, and
 *   the wrapper handed over stops being usable — which is exactly what CNA's contract says, and
 *   the reason this is a separate method rather than a flag.
 */
export class PostProcessChain implements IDisposable {
  #handle: NativeHandle | null;
  readonly #owned: PostProcessPass[] = [];
  readonly #borrowed: PostProcessPass[] = [];

  public constructor(graphicsDevice: GraphicsDevice) {
    this.#handle = extensions().createPostProcessChain(postProcessDeviceHandle(graphicsDevice));
  }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("this post-process chain is disposed");
    return this.#handle;
  }

  /** Whether the chain has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  /** How many passes the chain holds. */
  public get PassCount(): number {
    return extensions().getPostProcessChainPassCount(this.#active());
  }

  /** Appends a pass the caller keeps owning and must keep alive. */
  public Add(pass: PostProcessPass): void {
    if (pass == null) throw new TypeError("pass is required");
    extensions().addPostProcessPass(this.#active(), pass.HandleForChainUse);
    this.#borrowed.push(pass);
  }

  /**
   * Appends a pass and hands it to the chain.
   *
   * The pass is unusable afterwards: CNA consumes the handle, and continuing to hold it would let
   * a caller release an object the chain now owns.
   *
   * **Known upstream defect (CNA ABI 0.21.0).** `cna_post_process_chain_add_owned_pass` consumes
   * the handle without the owned-resource accounting its sibling `_destroy` performs, so the
   * game's owned-graphics-resource counter never comes back down and every later `Game.Dispose`
   * in that process refuses. Until CNA fixes it, prefer {@link Add} and dispose the pass yourself;
   * `docs/upstream-cna-findings.md` has the measurement and
   * `test/post-process-owned-pass.probe.mjs` is the regression detector.
   */
  public AddOwned(pass: PostProcessPass): void {
    if (pass == null) throw new TypeError("pass is required");
    const handle = pass.HandleForChainUse;
    extensions().addOwnedPostProcessPass(this.#active(), handle);
    // Only after the call succeeds: a refused transfer leaves the pass the caller's, and marking
    // it first would strand a live native object with no owner able to release it.
    pass.MarkTransferredForInternalUse();
    this.#owned.push(pass);
  }

  /** Removes every pass, releasing the ones the chain owns. */
  public Clear(): void {
    extensions().clearPostProcessChain(this.#active());
    this.#owned.length = 0;
    this.#borrowed.length = 0;
  }

  /** Runs every pass in order over one frame's inputs. */
  public Apply(frame: PostProcessFrame): void {
    extensions().applyPostProcessChain(this.#active(), frameSnapshot(frame));
  }

  /** Releases the chain's pooled intermediate targets without emptying it. */
  public ResetTargets(): void { extensions().resetPostProcessChainTargets(this.#active()); }

  /**
   * Whether GPU timing is on.
   *
   * A renderer without GPU timers accepts the request and reports `false` afterwards rather than
   * refusing, so read this back rather than assuming the write took.
   */
  public get GpuTimingEnabled(): boolean {
    return extensions().getPostProcessChainGpuTimingEnabled(this.#active());
  }
  public set GpuTimingEnabled(value: boolean) {
    extensions().setPostProcessChainGpuTimingEnabled(this.#active(), Boolean(value));
  }

  /** What each pass cost on the GPU. Empty when timing is off or the renderer has no timers. */
  public GetPassTimings(): readonly PostProcessPassTiming[] {
    return extensions().getPostProcessChainPassTimings(this.#active())
      .map((timing) => Object.freeze({ ...timing }));
  }

  /**
   * Releases the chain and every pass it owns.
   *
   * Borrowed passes are left alone, which is the whole point of the distinction: they are still
   * the caller's, and the caller disposes them.
   */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#owned.length = 0;
    this.#borrowed.length = 0;
    extensions().destroyPostProcessChain(handle);
  }
}

export { IsGraphicsExtensionLayerAvailable } from "../runtime/index.js";


/* --- the compute path ---------------------------------------------------------------------------
 *
 * Storage buffers, compute shaders and GPU timers: the engine layer's general-purpose GPU work,
 * which XNA 4.0 had no concept of at all.
 *
 * This family answers to a boundary the post-process family does not. A post-process pass needs the
 * extended layer to have been *compiled in*; compute additionally needs the *renderer* to implement
 * it, and those are different questions with different answers on the same build. So
 * {@link GraphicsDeviceCapabilities.Supports} is part of the public surface rather than an
 * implementation detail: ask before creating, and a renderer that cannot compute says so instead of
 * throwing. Measured against CNA 0.21.0 on this project's own qualification renderers: OPENGLES3
 * computes; HEADLESS, SDL_RENDERER and SOFTWARE do not.
 *
 * Every object here owns a GPU resource and must be disposed. A device handle may be borrowed only
 * inside a game lifecycle callback, so all of them are constructed from `LoadContent` or another
 * callback -- the same rule XNA's own graphics resources follow.
 */

/** A capability a renderer either implements or does not, asked before it is used. */
export enum GraphicsCapability {
  ThreeD = 0,
  DepthStencilBuffer = 1,
  MultiSampleAntiAliasing = 2,
  MultipleRenderTargets = 3,
  AnisotropicFiltering = 4,
  WireFrame = 5,
  OcclusionQuery = 6,
  CustomEffects = 7,
  Texture3D = 8,
  MultiStreamVertexInput = 9,
  Instancing = 10,
  StencilBuffer = 11,
  AdditiveBlending = 12,
  CompiledEffects = 13,
  FloatRenderTargets = 14,
  HalfFloatRenderTargets = 15,
  HalfFloatTextureLinearFiltering = 16,
  ComputeShaders = 17,
  IndirectDraw = 18,
}

/** How a compute shader may touch an image it has bound. */
export enum GraphicsImageAccess {
  ReadOnly = 0,
  WriteOnly = 1,
  ReadWrite = 2,
}

/**
 * Which accesses a {@link ComputeShader.Barrier} orders. These are flags: combine them with `|`.
 */
export enum GraphicsMemoryBarrier {
  None = 0,
  VertexAttribArray = 1 << 0,
  ElementArray = 1 << 1,
  Uniform = 1 << 2,
  TextureFetch = 1 << 3,
  ShaderImageAccess = 1 << 4,
  ShaderStorage = 1 << 5,
  BufferUpdate = 1 << 6,
  Framebuffer = 1 << 7,
  IndirectCommand = 1 << 8,
  /** Every bit above. What a caller that has just written a buffer from a shader wants. */
  All = (1 << 9) - 1,
}

/**
 * A storage buffer's live handle, for the one caller in this module that needs it.
 *
 * `ComputeShader.BindStorageBuffer` takes a `StorageBuffer` rather than a handle, so the handle has
 * to cross between two classes without becoming public API. A disposed buffer is absent from the
 * map, which is what makes binding one a named refusal rather than a stale handle reaching CNA.
 */
const storageBufferHandles = new WeakMap<StorageBuffer, NativeHandle>();

function storageBufferHandle(buffer: StorageBuffer): NativeHandle {
  const handle = storageBufferHandles.get(buffer);
  if (handle == null) throw new NativeUnavailableError("the storage buffer is disposed");
  return handle;
}

function compute(): CnaComputeBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Compute == null) {
    throw new NativeUnavailableError(
      `CNA's compute path requires a loaded backend that has it: ${backend.Detail}`,
    );
  }
  return backend.Compute;
}

function axisIndex(axis: number): number {
  if (!Number.isInteger(axis) || axis < 0 || axis > 2) {
    throw new RangeError("a work-group axis must be 0, 1 or 2");
  }
  return axis;
}

/**
 * What a renderer can do, asked rather than assumed.
 *
 * XNA had `GraphicsProfile`, a two-value tier that stood in for a capability list. CNA answers per
 * capability, and this is that query. It is the honest precondition for everything else in this
 * section: `Supports(device, GraphicsCapability.ComputeShaders)` is `false` on a renderer with no
 * compute, and a game that asks gets to offer a different path instead of catching a refusal.
 */
export const GraphicsDeviceCapabilities = {
  /** Whether the device's renderer implements a capability. */
  Supports(graphicsDevice: GraphicsDevice, capability: GraphicsCapability): boolean {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isInteger(capability) || capability < 0 || capability > 18) {
      throw new RangeError("capability must be a GraphicsCapability");
    }
    return compute().supportsGraphicsCapability(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), capability,
    );
  },

  /**
   * Whether a shader on this device can *sample* a shadow map.
   *
   * Separate from {@link ShadowMap.IsSupported}, which is whether a depth pass can be rasterised at
   * all. Casting and sampling are two different capabilities and a renderer can have one without
   * the other, so a frame that draws shadowed geometry has to ask both.
   */
  SupportsShadowSampling(graphicsDevice: GraphicsDevice): boolean {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return shadows().supportsShadowSampling(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  },

  /** The largest number of work groups a dispatch may ask for along one axis. */
  MaxComputeWorkGroupCount(graphicsDevice: GraphicsDevice, axis: number): number {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    // Validated before the backend is asked for, so a bad axis is a bad axis whether or not a
    // library is loaded.
    const index = axisIndex(axis);
    return compute().getMaxComputeWorkGroupCount(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), index,
    );
  },

  /** The largest `local_size` a shader may declare along one axis. */
  MaxComputeWorkGroupSize(graphicsDevice: GraphicsDevice, axis: number): number {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    // Validated before the backend is asked for, so a bad axis is a bad axis whether or not a
    // library is loaded.
    const index = axisIndex(axis);
    return compute().getMaxComputeWorkGroupSize(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), index,
    );
  },

  /** The largest number of invocations one work group may contain. */
  MaxComputeWorkGroupInvocations(graphicsDevice: GraphicsDevice): number {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return compute().getMaxComputeWorkGroupInvocations(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  },
} as const;

/**
 * A block of GPU memory a compute shader reads and writes.
 *
 * Two shapes, and the difference matters. {@link StorageBuffer.Create} makes an untyped blob whose
 * only unit is the byte. {@link StorageBuffer.CreateTyped} declares a count and an element size,
 * and CNA then cross-checks both against every element transfer -- so a buffer of 64 four-byte
 * elements refuses a read that asks for eight-byte ones, rather than returning half as many
 * elements of nonsense.
 */
export class StorageBuffer implements IDisposable {
  readonly #backend: CnaComputeBackend;
  #handle: NativeHandle | null;

  private constructor(backend: CnaComputeBackend, handle: NativeHandle) {
    this.#backend = backend;
    this.#handle = handle;
    storageBufferHandles.set(this, handle);
  }

  /** Creates an untyped buffer of `byteSize` bytes. */
  public static Create(graphicsDevice: GraphicsDevice, byteSize: number): StorageBuffer {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
      throw new RangeError("byteSize must be a non-negative safe integer");
    }
    const backend = compute();
    return new StorageBuffer(backend, backend.createStorageBuffer(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), byteSize,
    ));
  }

  /** Creates a buffer of `elementCount` elements of `elementByteSize` bytes each. */
  public static CreateTyped(
    graphicsDevice: GraphicsDevice, elementCount: number, elementByteSize: number,
  ): StorageBuffer {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isSafeInteger(elementCount) || elementCount < 0) {
      throw new RangeError("elementCount must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(elementByteSize) || elementByteSize <= 0) {
      throw new RangeError("elementByteSize must be a positive safe integer");
    }
    const backend = compute();
    return new StorageBuffer(backend, backend.createTypedStorageBuffer(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), elementCount, elementByteSize,
    ));
  }

  /** Whether the buffer has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the storage buffer is disposed");
    return this.#handle;
  }

  /** The buffer's total size in bytes. */
  public get ByteSize(): number {
    return this.#backend.getStorageBufferByteSize(this.#active());
  }

  /** How many elements a typed buffer holds; zero for an untyped one. */
  public get ElementCount(): number {
    return this.#backend.getStorageBufferElementCount(this.#active());
  }

  /** How large a typed buffer's element is; zero for an untyped one. */
  public get ElementByteSize(): number {
    return this.#backend.getStorageBufferElementByteSize(this.#active());
  }

  /**
   * Uploads raw bytes. The length written is the view's own, so a short view cannot become a long
   * write; CNA refuses a view that does not match the buffer's size.
   */
  public SetBytes(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
    this.#backend.setStorageBufferBytes(this.#active(), bytes);
  }

  /** Downloads `byteLength` raw bytes into a fresh array. */
  public GetBytes(byteLength: number): Uint8Array {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new RangeError("byteLength must be a non-negative safe integer");
    }
    return this.#backend.getStorageBufferBytes(this.#active(), byteLength);
  }

  /**
   * Uploads a typed array, telling CNA the element size it must agree with.
   *
   * The element *count* is never a parameter: it is the view's byte length divided by the element
   * size, so the count and the payload can never disagree.
   */
  public SetElements(elements: ArrayBufferView, elementByteSize: number): void {
    if (!ArrayBuffer.isView(elements)) throw new TypeError("elements must be a typed array");
    if (!Number.isSafeInteger(elementByteSize) || elementByteSize <= 0) {
      throw new RangeError("elementByteSize must be a positive safe integer");
    }
    const bytes = new Uint8Array(
      elements.buffer, elements.byteOffset, elements.byteLength,
    );
    this.#backend.setStorageBufferElements(this.#active(), bytes, elementByteSize);
  }

  /** Downloads `elementCount` elements of `elementByteSize` bytes as raw bytes. */
  public GetElements(elementCount: number, elementByteSize: number): Uint8Array {
    if (!Number.isSafeInteger(elementCount) || elementCount < 0) {
      throw new RangeError("elementCount must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(elementByteSize) || elementByteSize <= 0) {
      throw new RangeError("elementByteSize must be a positive safe integer");
    }
    return this.#backend.getStorageBufferElements(this.#active(), elementCount, elementByteSize);
  }

  /** Downloads the whole buffer as `Float32Array`. Convenience over {@link GetElements}. */
  public GetFloats(elementCount: number): Float32Array {
    const bytes = this.GetElements(elementCount, 4);
    return new Float32Array(bytes.buffer, bytes.byteOffset, elementCount);
  }

  /** Downloads the whole buffer as `Int32Array`. Convenience over {@link GetElements}. */
  public GetInt32s(elementCount: number): Int32Array {
    const bytes = this.GetElements(elementCount, 4);
    return new Int32Array(bytes.buffer, bytes.byteOffset, elementCount);
  }

  /** Releases the buffer. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    storageBufferHandles.delete(this);
    this.#backend.destroyStorageBuffer(handle);
  }
}

/**
 * A GLSL ES 3.10 compute shader.
 *
 * `engine_layer.h` documents construction as succeeding even for source that does not compile, so
 * that {@link IsValid} and {@link CompileError} can report the compiler's log. CNA does not
 * currently behave that way -- the underlying class throws and the C ABI turns that into a failed
 * create with no handle, so a compile failure arrives here as a thrown error carrying the log in
 * its message. Both members are projected regardless: they are the documented contract, and
 * `docs/upstream-cna-findings.md` records the difference rather than hiding it.
 */
export class ComputeShader implements IDisposable {
  readonly #backend: CnaComputeBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, source: string) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (typeof source !== "string" || source.length === 0) {
      throw new TypeError("source must be a non-empty string");
    }
    this.#backend = compute();
    this.#handle = this.#backend.createComputeShader(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), source,
    );
  }

  /** Whether the shader has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the compute shader is disposed");
    return this.#handle;
  }

  /** Whether the program compiled and linked. */
  public get IsValid(): boolean {
    return this.#backend.isComputeShaderValid(this.#active());
  }

  /** The compiler's log, empty when the program compiled. */
  public get CompileError(): string {
    return this.#backend.getComputeShaderCompileError(this.#active());
  }

  /** Whether this shader can bind an image, which not every renderer allows. */
  public get IsImageBindingSupported(): boolean {
    return this.#backend.isComputeImageBindingSupported(this.#active());
  }

  /** Sets an `int` uniform by name. */
  public SetUniform(name: string, value: number): void;
  /** Sets a `float` uniform by name. */
  public SetUniform(name: string, value: number, asFloat: true): void;
  public SetUniform(name: string, value: number, asFloat = false): void {
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError("a uniform name must be a non-empty string");
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("a uniform value must be a finite number");
    }
    if (asFloat) {
      this.#backend.setComputeShaderUniformFloat(this.#active(), name, value);
      return;
    }
    if (!Number.isInteger(value)) {
      throw new TypeError("an int uniform needs an integer; pass asFloat for a float uniform");
    }
    this.#backend.setComputeShaderUniformInt(this.#active(), name, value);
  }

  /** Binds a storage buffer to a `std430` binding point. */
  public BindStorageBuffer(binding: number, buffer: StorageBuffer): void {
    if (!Number.isInteger(binding) || binding < 0) {
      throw new RangeError("a binding point must be a non-negative integer");
    }
    if (!(buffer instanceof StorageBuffer)) throw new TypeError("buffer must be a StorageBuffer");
    this.#backend.bindComputeStorageBuffer(
      this.#active(), binding, storageBufferHandle(buffer),
    );
  }

  /** Binds a texture to a sampler by name. */
  public BindTexture(unit: number, samplerName: string, texture: Texture2D): void {
    if (!Number.isInteger(unit) || unit < 0) {
      throw new RangeError("a texture unit must be a non-negative integer");
    }
    if (typeof samplerName !== "string" || samplerName.length === 0) {
      throw new TypeError("a sampler name must be a non-empty string");
    }
    if (texture == null) throw new TypeError("texture is required");
    this.#backend.bindComputeTexture(
      this.#active(), unit, samplerName, resolveTexture2DHandleForInternalUse(texture),
    );
  }

  /** Binds a texture as a readable or writable image. */
  public BindImage(unit: number, texture: Texture2D, access: GraphicsImageAccess): void {
    if (!Number.isInteger(unit) || unit < 0) {
      throw new RangeError("a texture unit must be a non-negative integer");
    }
    if (texture == null) throw new TypeError("texture is required");
    if (access !== GraphicsImageAccess.ReadOnly && access !== GraphicsImageAccess.WriteOnly &&
        access !== GraphicsImageAccess.ReadWrite) {
      throw new RangeError("access must be a GraphicsImageAccess");
    }
    this.#backend.bindComputeImage(
      this.#active(), unit, resolveTexture2DHandleForInternalUse(texture), access,
    );
  }

  /** Runs `groupsX * groupsY * groupsZ` work groups. */
  public Dispatch(groupsX: number, groupsY = 1, groupsZ = 1): void {
    for (const [name, value] of [["groupsX", groupsX], ["groupsY", groupsY], ["groupsZ", groupsZ]] as const) {
      if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
    }
    this.#backend.dispatchComputeShader(this.#active(), groupsX, groupsY, groupsZ);
  }

  /** Orders the accesses in `bits` against what follows. */
  public Barrier(bits: GraphicsMemoryBarrier = GraphicsMemoryBarrier.All): void {
    if (!Number.isInteger(bits) || bits < 0) {
      throw new RangeError("barrier bits must be a non-negative integer");
    }
    this.#backend.computeShaderBarrier(this.#active(), bits);
  }

  /** Releases the shader. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyComputeShader(handle);
  }
}

/**
 * A non-blocking GPU timer.
 *
 * It creates on renderers that cannot time at all, and says so through {@link IsSupported} and
 * {@link UnsupportedReason} rather than by refusing -- measured on HEADLESS, which answers with the
 * GL extension it is missing by name. {@link Poll} never blocks: it collects a result if one is
 * ready and answers whether it did.
 */
export class GpuTimer implements IDisposable {
  readonly #backend: CnaComputeBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = compute();
    this.#handle = this.#backend.createGpuTimer(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the timer has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the GPU timer is disposed");
    return this.#handle;
  }

  /** Whether this renderer can actually time GPU work. */
  public get IsSupported(): boolean {
    return this.#backend.isGpuTimerSupported(this.#active());
  }

  /** Why it cannot, in CNA's own words; empty when it can. */
  public get UnsupportedReason(): string {
    return this.#backend.getGpuTimerUnsupportedReason(this.#active());
  }

  /** Whether a measurement is currently open between `Begin` and `End`. */
  public get IsOpen(): boolean {
    return this.#backend.isGpuTimerOpen(this.#active());
  }

  /** Whether a completed result is waiting to be collected. */
  public get IsResultAvailable(): boolean {
    return this.#backend.isGpuTimerResultAvailable(this.#active());
  }

  /** The most recently collected measurement in milliseconds. */
  public get LastMilliseconds(): number {
    return this.#backend.getGpuTimerLastMilliseconds(this.#active());
  }

  /** How many measurements have been collected. */
  public get SampleCount(): number {
    return this.#backend.getGpuTimerSampleCount(this.#active());
  }

  /** Opens a measurement. */
  public Begin(): void { this.#backend.beginGpuTimer(this.#active()); }

  /** Closes a measurement. The result becomes available some frames later. */
  public End(): void { this.#backend.endGpuTimer(this.#active()); }

  /** Collects a result if one is ready. Never blocks; answers whether it collected. */
  public Poll(): boolean { return this.#backend.pollGpuTimer(this.#active()); }

  /** Releases the timer. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyGpuTimer(handle);
  }
}


/* --- clustered lighting ---------------------------------------------------------------------
 *
 * A light set, the cluster grid it is assigned into, and the shadow-budget policy that decides
 * which of those lights is worth a shadow map. This is how a modern renderer lights a scene with
 * hundreds of lights: the screen is divided into tiles and the view frustum into depth slices, and
 * each resulting cluster carries only the lights that actually reach it. XNA 4.0 had no equivalent
 * — `BasicEffect` lit with three directional lights and nothing else.
 *
 * None of it touches the GPU. All four objects compute on a graphics device handle but hold no GPU
 * state, so they answer identically on a headless renderer and a windowed one, and their results
 * are exact numbers rather than pixels.
 *
 * CNA's headers name the first parameter of all four creates `game`; it is a **graphics device**,
 * and an actual game handle is refused. That is measured and recorded in
 * `docs/upstream-cna-findings.md`, and the reason these constructors take a `GraphicsDevice`.
 */

/** Which kind of light a clustered light is. CNA has no directional light in a cluster set. */
export enum ClusteredLightType {
  Point = 0,
  Spot = 1,
}

/** The most lights one {@link ClusteredLightSet} holds. */
export const ClusteredLightSetMaximum = 256;

/** The most lights one {@link ClusteredLightAssignment} sorts. */
export const ClusteredAssignmentMaximumLights = 1024;

/** The bounds a {@link ClusterGrid} axis accepts. */
export const ClusterGridMaximumTilesPerAxis = 128;
/** The bounds a {@link ClusterGrid}'s depth axis accepts. */
export const ClusterGridMaximumSliceCount = 256;

/** One light in the uniform shape CNA stores every clustered light in. */
export interface ClusteredLight {
  readonly Type: ClusteredLightType;
  readonly Position: Vector3;
  /** Ignored for a point light. */
  readonly Direction: Vector3;
  /** Linear RGB, not an XNA `Color`: a light's colour is not a display value. */
  readonly Color: Vector3;
  readonly Intensity: number;
  readonly Range: number;
  /** Radians. Ignored for a point light. */
  readonly InnerAngle: number;
  /** Radians. Ignored for a point light. */
  readonly OuterAngle: number;
  readonly CastsShadows: boolean;
}

/**
 * The live handles of a light set and a cluster grid, for the two calls in this module that take
 * the object rather than the handle: `ClusteredLightAssignment.Assign` needs a grid, and
 * `ClusteredShadowPolicy.Select` needs a light set. A disposed object is absent from its map, so
 * passing one is a named refusal rather than a stale handle reaching CNA.
 */
const clusteredLightSetHandles = new WeakMap<ClusteredLightSet, NativeHandle>();
const clusterGridHandles = new WeakMap<ClusterGrid, NativeHandle>();

function clusteredLightSetHandle(set: ClusteredLightSet): NativeHandle {
  const handle = clusteredLightSetHandles.get(set);
  if (handle == null) throw new NativeUnavailableError("the light set is disposed");
  return handle;
}

function clusterGridHandle(grid: ClusterGrid): NativeHandle {
  const handle = clusterGridHandles.get(grid);
  if (handle == null) throw new NativeUnavailableError("the cluster grid is disposed");
  return handle;
}

function clusteredLighting(): CnaClusteredLightingBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.ClusteredLighting == null) {
    throw new NativeUnavailableError(
      `CNA's clustered lighting requires a loaded backend that has it: ${backend.Detail}`,
    );
  }
  return backend.ClusteredLighting;
}

function vectorSnapshot(vector: Vector3, what: string): { X: number; Y: number; Z: number } {
  if (vector == null) throw new TypeError(`${what} is required`);
  return { X: vector.X, Y: vector.Y, Z: vector.Z };
}

function toVector3(snapshot: { readonly X: number; readonly Y: number; readonly Z: number }): Vector3 {
  return new Vector3(snapshot.X, snapshot.Y, snapshot.Z);
}

function lightSnapshot(light: ClusteredLight): ClusteredLightSnapshot {
  if (light == null) throw new TypeError("light is required");
  if (light.Type !== ClusteredLightType.Point && light.Type !== ClusteredLightType.Spot) {
    throw new RangeError("a clustered light's Type must be Point or Spot");
  }
  for (const name of ["Intensity", "Range", "InnerAngle", "OuterAngle"] as const) {
    if (typeof light[name] !== "number" || !Number.isFinite(light[name])) {
      throw new TypeError(`a clustered light's ${name} must be a finite number`);
    }
  }
  return {
    Type: light.Type,
    Position: vectorSnapshot(light.Position, "a clustered light's Position"),
    Direction: vectorSnapshot(light.Direction, "a clustered light's Direction"),
    Color: vectorSnapshot(light.Color, "a clustered light's Color"),
    Intensity: light.Intensity,
    Range: light.Range,
    InnerAngle: light.InnerAngle,
    OuterAngle: light.OuterAngle,
    CastsShadows: light.CastsShadows === true,
  };
}

function toLight(snapshot: ClusteredLightSnapshot): ClusteredLight {
  return Object.freeze({
    Type: snapshot.Type as ClusteredLightType,
    Position: toVector3(snapshot.Position),
    Direction: toVector3(snapshot.Direction),
    Color: toVector3(snapshot.Color),
    Intensity: snapshot.Intensity,
    Range: snapshot.Range,
    InnerAngle: snapshot.InnerAngle,
    OuterAngle: snapshot.OuterAngle,
    CastsShadows: snapshot.CastsShadows,
  });
}

function toSphere(snapshot: BoundingSphereSnapshot): BoundingSphere {
  return new BoundingSphere(toVector3(snapshot.Center), snapshot.Radius);
}

/** The sixteen numbers CNA reads a matrix from, in XNA's own row order. */
function matrixValues(matrix: Matrix, what: string): number[] {
  if (matrix == null) throw new TypeError(`${what} is required`);
  return [
    matrix.M11, matrix.M12, matrix.M13, matrix.M14,
    matrix.M21, matrix.M22, matrix.M23, matrix.M24,
    matrix.M31, matrix.M32, matrix.M33, matrix.M34,
    matrix.M41, matrix.M42, matrix.M43, matrix.M44,
  ];
}

function toMatrix(values: readonly number[]): Matrix {
  return new Matrix(
    values[0]!, values[1]!, values[2]!, values[3]!,
    values[4]!, values[5]!, values[6]!, values[7]!,
    values[8]!, values[9]!, values[10]!, values[11]!,
    values[12]!, values[13]!, values[14]!, values[15]!,
  );
}

function lightIndex(index: number, what = "a light index"): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`${what} must be a non-negative integer`);
  }
  return index;
}

/**
 * A set of point and spot lights, in the order they were added.
 *
 * CNA refuses a light it cannot use — a non-positive range, a negative intensity, a spot whose
 * inner angle is wider than its outer — rather than accepting it and quietly lighting nothing.
 * {@link IsUsable} asks the same question without adding anything.
 */
export class ClusteredLightSet implements IDisposable {
  readonly #backend: CnaClusteredLightingBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = clusteredLighting();
    this.#handle = this.#backend.createClusteredLightSet(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
    clusteredLightSetHandles.set(this, this.#handle);
  }

  /** Whether CNA would accept this light, asked without adding it. */
  public static IsUsable(light: ClusteredLight): boolean {
    // Shaped before the backend is asked for, so a malformed light is a malformed light whether
    // or not a library is loaded.
    const snapshot = lightSnapshot(light);
    return clusteredLighting().isClusteredLightUsable(snapshot);
  }

  /** Whether the set has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the light set is disposed");
    return this.#handle;
  }

  /** How many lights the set holds. */
  public get Count(): number { return this.#backend.getClusteredLightCount(this.#active()); }

  /** Whether the set holds nothing. */
  public get IsEmpty(): boolean { return this.#backend.isClusteredLightSetEmpty(this.#active()); }

  /** Adds a light and returns the index it was given. */
  public Add(light: ClusteredLight): number {
    return this.#backend.addClusteredLight(this.#active(), lightSnapshot(light));
  }

  /**
   * Adds a point light.
   *
   * A point light has no direction and no cone, and CNA is what fills those in when it converts
   * one into its uniform clustered shape. So this hands CNA the point light's own fields rather
   * than restating that conversion here, where it would drift the day CNA changed it.
   */
  public AddPoint(
    position: Vector3, color: Vector3, intensity: number, range: number, castsShadows = false,
  ): number {
    for (const [name, value] of [["intensity", intensity], ["range", range]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return this.#backend.addClusteredPointLight(this.#active(), {
      Position: vectorSnapshot(position, "position"),
      Color: vectorSnapshot(color, "color"),
      Intensity: intensity,
      Range: range,
      CastsShadows: castsShadows === true,
    });
  }

  /** Adds a spot light. The two angles are radians, and the inner must not exceed the outer. */
  public AddSpot(
    position: Vector3, direction: Vector3, color: Vector3, intensity: number, range: number,
    innerAngle: number, outerAngle: number, castsShadows = false,
  ): number {
    for (const [name, value] of [
      ["intensity", intensity], ["range", range],
      ["innerAngle", innerAngle], ["outerAngle", outerAngle],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return this.#backend.addClusteredSpotLight(this.#active(), {
      Position: vectorSnapshot(position, "position"),
      Direction: vectorSnapshot(direction, "direction"),
      Color: vectorSnapshot(color, "color"),
      Intensity: intensity,
      Range: range,
      InnerAngle: innerAngle,
      OuterAngle: outerAngle,
      CastsShadows: castsShadows === true,
    });
  }

  /** Replaces one light, keeping its index. */
  public ReplaceAt(index: number, light: ClusteredLight): void {
    this.#backend.replaceClusteredLightAt(
      this.#active(), lightIndex(index), lightSnapshot(light),
    );
  }

  /** Removes one light. The lights after it move down. */
  public RemoveAt(index: number): void {
    this.#backend.removeClusteredLightAt(this.#active(), lightIndex(index));
  }

  /** Removes every light. */
  public Clear(): void { this.#backend.clearClusteredLightSet(this.#active()); }

  /** Reads one light back. */
  public GetAt(index: number): ClusteredLight {
    return toLight(this.#backend.getClusteredLightAt(this.#active(), lightIndex(index)));
  }

  /** Reads every light back, in the set's own order. */
  public ToArray(): readonly ClusteredLight[] {
    return Object.freeze(this.#backend.copyClusteredLights(this.#active()).map(toLight));
  }

  /** One light's world-space influence, which CNA derives from its position and range. */
  public GetBoundsAt(index: number): BoundingSphere {
    return toSphere(this.#backend.getClusteredLightBoundsAt(this.#active(), lightIndex(index)));
  }

  /** Every light's bounds, which is what {@link ClusteredLightAssignment.Assign} consumes. */
  public GetBounds(): readonly BoundingSphere[] {
    return Object.freeze(this.#backend.copyClusteredLightBounds(this.#active()).map(toSphere));
  }

  /** Releases the set. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    clusteredLightSetHandles.delete(this);
    this.#backend.destroyClusteredLightSet(handle);
  }
}

/**
 * The screen tiles and depth slices a scene's lights are sorted into.
 *
 * The depth axis is logarithmic rather than linear, which is what makes clustered lighting work at
 * all: `SliceDistance(s)` is `near * (far / near) ** (s / sliceCount)`, so the slices near the
 * camera are thin and the far ones are wide.
 */
export class ClusterGrid implements IDisposable {
  readonly #backend: CnaClusteredLightingBackend;
  #handle: NativeHandle | null;

  public constructor(
    graphicsDevice: GraphicsDevice, tilesX: number, tilesY: number, sliceCount: number,
  ) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    for (const [name, value, limit] of [
      ["tilesX", tilesX, ClusterGridMaximumTilesPerAxis],
      ["tilesY", tilesY, ClusterGridMaximumTilesPerAxis],
      ["sliceCount", sliceCount, ClusterGridMaximumSliceCount],
    ] as const) {
      if (!Number.isInteger(value) || value < 1 || value > limit) {
        throw new RangeError(`${name} must be an integer from 1 to ${limit}`);
      }
    }
    this.#backend = clusteredLighting();
    this.#handle = this.#backend.createClusterGrid(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), tilesX, tilesY, sliceCount,
    );
    clusterGridHandles.set(this, this.#handle);
  }

  /** Whether the grid has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the cluster grid is disposed");
    return this.#handle;
  }

  /** Tiles along X. */
  public get TilesX(): number { return this.#backend.getClusterGridTilesX(this.#active()); }
  /** Tiles along Y. */
  public get TilesY(): number { return this.#backend.getClusterGridTilesY(this.#active()); }
  /** Depth slices. */
  public get SliceCount(): number {
    return this.#backend.getClusterGridSliceCount(this.#active());
  }
  /** `TilesX * TilesY * SliceCount`. */
  public get ClusterCount(): number {
    return this.#backend.getClusterGridClusterCount(this.#active());
  }
  /** Whether a projection has been set. Nothing depth-related answers before it has. */
  public get HasProjection(): boolean {
    return this.#backend.clusterGridHasProjection(this.#active());
  }
  /** The near plane the projection was set with. */
  public get NearPlane(): number {
    return this.#backend.getClusterGridNearPlane(this.#active());
  }
  /** The far plane the projection was set with. */
  public get FarPlane(): number { return this.#backend.getClusterGridFarPlane(this.#active()); }

  /** The inverse of the projection, which is what unprojects a cluster into view space. */
  public get InverseProjection(): Matrix {
    return toMatrix(this.#backend.getClusterGridInverseProjection(this.#active()));
  }

  /** The flat index of one cluster. */
  public ClusterIndex(x: number, y: number, slice: number): number {
    return this.#backend.getClusterIndex(
      this.#active(), lightIndex(x, "x"), lightIndex(y, "y"), lightIndex(slice, "slice"),
    );
  }

  /** Gives the grid the camera's projection and its depth range. */
  public SetProjection(projection: Matrix, nearPlane: number, farPlane: number): void {
    for (const [name, value] of [["nearPlane", nearPlane], ["farPlane", farPlane]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    this.#backend.setClusterGridProjection(
      this.#active(), matrixValues(projection, "projection"), nearPlane, farPlane,
    );
  }

  /** The view-space distance at which a slice boundary lies. */
  public SliceDistance(slice: number): number {
    return this.#backend.getClusterSliceDistance(this.#active(), lightIndex(slice, "slice"));
  }

  /** Which slice a view-space distance falls in. */
  public SliceForViewDistance(viewDistance: number): number {
    if (typeof viewDistance !== "number" || !Number.isFinite(viewDistance)) {
      throw new TypeError("viewDistance must be a finite number");
    }
    return this.#backend.getClusterSliceForViewDistance(this.#active(), viewDistance);
  }

  /** One cluster's view-space extent. */
  public ClusterBounds(x: number, y: number, slice: number): BoundingBox {
    const bounds = this.#backend.getClusterBounds(
      this.#active(), lightIndex(x, "x"), lightIndex(y, "y"), lightIndex(slice, "slice"),
    );
    return new BoundingBox(toVector3(bounds.Min), toVector3(bounds.Max));
  }

  /** Releases the grid. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    clusterGridHandles.delete(this);
    this.#backend.destroyClusterGrid(handle);
  }
}

/**
 * Which lights reach which cluster.
 *
 * The result is the pair a GPU reads: a per-cluster offset list and one flat index list, so a
 * shader finds a cluster's lights with two lookups and no search. Both are readable here, and
 * {@link LightsInCluster} is the same information one cluster at a time.
 */
export class ClusteredLightAssignment implements IDisposable {
  readonly #backend: CnaClusteredLightingBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = clusteredLighting();
    this.#handle = this.#backend.createClusteredLightAssignment(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the assignment has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the assignment is disposed");
    return this.#handle;
  }

  /** Sorts a set of light bounds into a grid's clusters, in view space. */
  public Assign(grid: ClusterGrid, view: Matrix, bounds: readonly BoundingSphere[]): void {
    if (!(grid instanceof ClusterGrid)) throw new TypeError("grid must be a ClusterGrid");
    if (!Array.isArray(bounds)) throw new TypeError("bounds must be an array of BoundingSphere");
    this.#backend.assignClusteredLights(
      this.#active(), clusterGridHandle(grid), matrixValues(view, "view"),
      bounds.map((sphere, index) => {
        if (sphere == null) throw new TypeError(`bounds[${index}] is required`);
        return { Center: vectorSnapshot(sphere.Center, "a bound's Center"), Radius: sphere.Radius };
      }),
    );
  }

  /** Forgets the last assignment. */
  public Clear(): void { this.#backend.clearClusteredLightAssignment(this.#active()); }

  /** How many lights were sorted. */
  public get LightCount(): number {
    return this.#backend.getAssignmentLightCount(this.#active());
  }
  /** How many clusters were sorted into. */
  public get ClusterCount(): number {
    return this.#backend.getAssignmentClusterCount(this.#active());
  }
  /** How many light references there are in total, across every cluster. */
  public get TotalReferenceCount(): number {
    return this.#backend.getAssignmentTotalReferenceCount(this.#active());
  }
  /** The most lights any one cluster ended up with. */
  public get MaxLightsPerCluster(): number {
    return this.#backend.getAssignmentMaxLightsPerCluster(this.#active());
  }

  /** The light indices one cluster holds. */
  public LightsInCluster(clusterIndex: number): readonly number[] {
    return Object.freeze([...this.#backend.copyLightsInCluster(
      this.#active(), lightIndex(clusterIndex, "a cluster index"),
    )]);
  }

  /** The flat light-index list a shader reads. */
  public GetIndices(): readonly number[] {
    return Object.freeze([...this.#backend.copyAssignmentIndices(this.#active())]);
  }

  /** The per-cluster offsets into {@link GetIndices}. */
  public GetOffsets(): readonly number[] {
    return Object.freeze([...this.#backend.copyAssignmentOffsets(this.#active())]);
  }

  /** Releases the assignment. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyClusteredLightAssignment(handle);
  }
}

/**
 * Which shadow-casting lights are worth a shadow map this frame.
 *
 * A budget, a score per light, and a hysteresis margin that stops a light flickering in and out of
 * the set as the camera moves across a threshold. A light that asks for a shadow and does not get
 * one is *refused*, and the count of refusals is readable — a renderer that silently dropped them
 * would look the same until someone wondered why a light had no shadow.
 */
export class ClusteredShadowPolicy implements IDisposable {
  readonly #backend: CnaClusteredLightingBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, budget: number) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isInteger(budget) || budget < 0) {
      throw new RangeError("budget must be a non-negative integer");
    }
    this.#backend = clusteredLighting();
    this.#handle = this.#backend.createClusteredShadowPolicy(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), budget,
    );
  }

  /** Whether the policy has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the shadow policy is disposed");
    return this.#handle;
  }

  /** How many shadow maps the policy may hand out. */
  public get Budget(): number { return this.#backend.getShadowPolicyBudget(this.#active()); }
  public set Budget(value: number) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError("Budget must be a non-negative integer");
    }
    this.#backend.setShadowPolicyBudget(this.#active(), value);
  }

  /** How much better a light must score to displace one already selected. */
  public get Hysteresis(): number {
    return this.#backend.getShadowPolicyHysteresis(this.#active());
  }
  public set Hysteresis(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Hysteresis must be a finite number");
    }
    this.#backend.setShadowPolicyHysteresis(this.#active(), value);
  }

  /** How many lights asked for a shadow map in the last selection. */
  public get RequestCount(): number {
    return this.#backend.getShadowPolicyRequestCount(this.#active());
  }
  /** How many of those did not get one. */
  public get RefusedCount(): number {
    return this.#backend.getShadowPolicyRefusedCount(this.#active());
  }

  /** Scores a set's shadow casters and selects up to {@link Budget} of them. */
  public Select(
    lights: ClusteredLightSet, view: Matrix, projection: Matrix, cameraPosition: Vector3,
  ): void {
    if (!(lights instanceof ClusteredLightSet)) {
      throw new TypeError("lights must be a ClusteredLightSet");
    }
    this.#backend.selectShadowCasters(
      this.#active(), clusteredLightSetHandle(lights), matrixValues(view, "view"),
      matrixValues(projection, "projection"),
      vectorSnapshot(cameraPosition, "cameraPosition"),
    );
  }

  /** Whether one light was selected. */
  public IsSelected(lightIndex_: number): boolean {
    return this.#backend.isShadowPolicySelected(this.#active(), lightIndex(lightIndex_));
  }

  /** One light's score, as CNA computed it. */
  public GetScore(lightIndex_: number): number {
    return this.#backend.getShadowPolicyScore(this.#active(), lightIndex(lightIndex_));
  }

  /** The indices of the lights that were selected. */
  public GetSelected(): readonly number[] {
    return Object.freeze([...this.#backend.copyShadowPolicySelected(this.#active())]);
  }

  /** Forgets the last selection, so the next one is unaffected by hysteresis. */
  public Reset(): void { this.#backend.resetShadowPolicy(this.#active()); }

  /** Releases the policy. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyClusteredShadowPolicy(handle);
  }
}


/* --- level of detail ----------------------------------------------------------------------------
 *
 * Which detail level to draw at a distance, and the hysteresis that stops one flickering as a
 * camera hovers on a boundary. A pure value object: no device, no game, no GPU.
 *
 * CNA associates each level with a `ModelMeshPart` and can hand that part back. This projection
 * does not: `ModelMeshPart` here is a managed object built from XNB readers, with managed vertex
 * and index buffers and no native handle to give, so binding CNA's part-returning `select` would
 * project a route that could only ever answer nothing. What is projected is the selection
 * arithmetic — the whole value of a LOD group — and a consumer indexes their own array of parts
 * with {@link LodGroup.SelectIndex}.
 */

/** How a {@link LodGroup} decides which level a distance falls in. */
export enum LodSelectionMode {
  /** By view distance directly. Each level's threshold is a distance. */
  Distance = 0,
  /** By how many pixels the object's radius projects to. Each level's threshold is in pixels. */
  ScreenSpaceError = 1,
}

function lod(): CnaLodBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Lod == null) {
    throw new NativeUnavailableError(
      `CNA's level-of-detail groups require a loaded backend that has them: ${backend.Detail}`,
    );
  }
  return backend.Lod;
}

/**
 * An ordered set of detail levels, and the rule for picking one.
 *
 * Levels are kept sorted by their threshold however they are added, so
 * {@link LodGroup.SelectIndex} answers an index into {@link LodGroup.Thresholds} rather than into
 * the order they arrived in.
 *
 * {@link LodGroup.Hysteresis} is an absolute margin in the selection mode's own unit — view
 * distance, or pixels in {@link LodSelectionMode.ScreenSpaceError}. Within that margin of the
 * boundary the group holds the level it last returned, so a camera hovering on a threshold does
 * not flicker. It is deliberately *not* applied to a jump of more than one level: a distance that
 * has moved several levels is a real change rather than a wobble, and damping it would be worse
 * than the flicker it prevents.
 */
export class LodGroup implements IDisposable {
  readonly #backend: CnaLodBackend;
  #handle: NativeHandle | null;

  public constructor() {
    this.#backend = lod();
    this.#handle = this.#backend.createLodGroup();
  }

  /** Whether the group has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the LOD group is disposed");
    return this.#handle;
  }

  /** Adds a level. The group re-sorts, so the order levels are added in does not matter. */
  public AddLevel(maxDistance: number): this {
    if (typeof maxDistance !== "number" || !Number.isFinite(maxDistance)) {
      throw new TypeError("maxDistance must be a finite number");
    }
    this.#backend.addLodLevel(this.#active(), maxDistance);
    return this;
  }

  /** Every level's threshold, in the group's own sorted order. */
  public get Thresholds(): readonly number[] {
    return Object.freeze([...this.#backend.copyLodLevels(this.#active())]);
  }

  /** How many levels the group holds. */
  public get Count(): number { return this.#backend.copyLodLevels(this.#active()).length; }

  /** Removes every level, and forgets the last selection. */
  public Clear(): this {
    this.#backend.clearLodGroup(this.#active());
    return this;
  }

  /**
   * The level a distance falls in, or `-1` when it is past the last one — which is CNA saying
   * "draw nothing at this range" rather than clamping to the coarsest level.
   */
  public SelectIndex(distance: number): number {
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      throw new TypeError("distance must be a finite number");
    }
    return this.#backend.selectLodIndex(this.#active(), distance);
  }

  /** The sticky margin around a boundary, in the selection mode's own unit. */
  public get Hysteresis(): number {
    return this.#backend.getLodHysteresis(this.#active());
  }
  public set Hysteresis(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Hysteresis must be a finite number");
    }
    this.#backend.setLodHysteresis(this.#active(), value);
  }

  /** Forgets the last selection, so the next one is not damped by hysteresis. */
  public ResetHysteresis(): this {
    this.#backend.resetLodHysteresis(this.#active());
    return this;
  }

  /** How the group picks a level. Changing it re-sorts and forgets the last selection. */
  public get SelectionMode(): LodSelectionMode {
    return this.#backend.getLodSelectionMode(this.#active()) as LodSelectionMode;
  }
  public set SelectionMode(value: LodSelectionMode) {
    if (value !== LodSelectionMode.Distance && value !== LodSelectionMode.ScreenSpaceError) {
      throw new RangeError("SelectionMode must be a LodSelectionMode");
    }
    this.#backend.setLodSelectionMode(this.#active(), value);
  }

  /**
   * The three numbers {@link LodSelectionMode.ScreenSpaceError} needs: the object's world radius,
   * the camera's vertical field of view in radians, and the viewport height in pixels.
   */
  public SetScreenSpaceParameters(
    radius: number, verticalFov: number, viewportHeight: number,
  ): this {
    for (const [name, value] of [
      ["radius", radius], ["verticalFov", verticalFov], ["viewportHeight", viewportHeight],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    this.#backend.setLodScreenSpaceParameters(
      this.#active(), radius, verticalFov, viewportHeight,
    );
    return this;
  }

  /** How many pixels the object's radius projects to at a distance. */
  public ProjectedRadiusPixels(distance: number): number {
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      throw new TypeError("distance must be a finite number");
    }
    return this.#backend.getLodProjectedRadiusPixels(this.#active(), distance);
  }

  /** Releases the group. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyLodGroup(handle);
  }
}


/* --- shadow maps ---------------------------------------------------------------------------------
 *
 * Where a shadow map looks from, and what it costs.
 *
 * {@link ShadowMapMath} is the part that needs nothing at all: a quality tier maps to a texture
 * size and a filter radius, and a directional light plus the scene's bounds map to the view and
 * projection that frame it. Those are pure functions, so they answer on any backend.
 *
 * The rendering half — {@link ShadowMap.Begin}, the caster effects, {@link ShadowMap.ShadowTexture}
 * — is projected too, now that render-target readback answers real texels
 * (`docs/upstream-cna-findings.md` item 7, closed in CNA 48ab0de7f). It is accepted on what comes
 * back out of the depth texture, not on the calls returning success.
 *
 * Casting and sampling are two different questions. {@link ShadowMap.IsSupported} answers whether
 * this renderer can rasterise a depth pass; {@link GraphicsDeviceCapabilities.SupportsShadowSampling}
 * answers whether a shader can then read the result. A frame that draws shadows needs both, and CNA
 * currently answers `false` to the second on every renderer here.
 */

/** A directional light: the only kind a {@link ShadowMap} casts from. */
export interface DirectionalLight {
  readonly Direction: Vector3;
  /** Linear RGB, not an XNA `Color`. */
  readonly Color: Vector3;
  readonly Intensity: number;
}

function shadows(): CnaShadowBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Shadows == null) {
    throw new NativeUnavailableError(
      `CNA's shadow maps require a loaded backend that has them: ${backend.Detail}`,
    );
  }
  return backend.Shadows;
}

function shadowQuality(quality: ShadowQuality): ShadowQuality {
  if (!Number.isInteger(quality) || quality < ShadowQuality.Disabled ||
      quality > ShadowQuality.Ultra) {
    throw new RangeError("quality must be a ShadowQuality");
  }
  return quality;
}

function graphicsBackendFor(device: GraphicsDevice): CnaGraphicsBackend {
  const backend = graphicsDeviceBackendForInternalUse(device).Graphics;
  if (backend == null) {
    throw new NativeUnavailableError("a shadow map's depth texture needs the CNA graphics backend");
  }
  return backend;
}

function effectBackendFor(device: GraphicsDevice): CnaEffectBackend {
  const backend = graphicsDeviceBackendForInternalUse(device).Effects;
  if (backend == null) {
    throw new NativeUnavailableError("a shadow caster effect needs the CNA Effect backend");
  }
  return backend;
}

/**
 * Wraps a render-target handle CNA lends as a readable `Texture2D`, without owning it.
 *
 * Several objects in this layer lend a target the same way -- a shadow map's depth, the prepass's
 * depth, normals and velocity -- and every one of them gives the borrow back through the
 * render-target release route rather than the texture one. The size and format are read from CNA
 * rather than assumed, and a failure to read them returns the borrow before it propagates, because
 * an unreturned borrow is what stops the lender being destroyed later.
 */
function borrowNativeTextureForInternalUse(
  device: GraphicsDevice, handle: NativeHandle, label: string,
): Texture2D {
  const backend = graphicsBackendFor(device);
  let info;
  try {
    info = graphicsDeviceBackendForInternalUse(device).getTexture2DInfo(handle);
  } catch (error) {
    backend.destroyRenderTarget(handle);
    throw error;
  }
  return new (Texture2D as unknown as new (
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    mipMap: boolean,
    format: SurfaceFormat,
    adopted: {
      readonly Handle: NativeHandle;
      readonly LevelCount: number;
      readonly Release: (value: NativeHandle) => void;
      readonly Label: string;
    },
  ) => Texture2D)(
    device, info.Width, info.Height, false, info.Format as SurfaceFormat,
    {
      Handle: handle,
      LevelCount: info.LevelCount,
      // A borrow, not a texture of our own: this is the route that gives it back.
      Release: (value: NativeHandle) => backend.destroyRenderTarget(value),
      Label: label,
    },
  );
}

/**
 * Wraps a texture CNA created and handed over as an owned `Texture2D`.
 *
 * Unlike {@link borrowNativeTextureForInternalUse} this owns what it wraps: the environment
 * processor's outputs outlive the processor that made them, so the caller disposes them, and the
 * release is the ordinary texture one rather than the render-target one.
 */
function adoptNativeTexture2DForInternalUse(
  device: GraphicsDevice, handle: NativeHandle, label: string,
): Texture2D {
  const root = graphicsDeviceBackendForInternalUse(device);
  let info;
  try {
    info = root.getTexture2DInfo(handle);
  } catch (error) {
    root.destroyTexture2D(handle);
    throw error;
  }
  return new (Texture2D as unknown as new (
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    mipMap: boolean,
    format: SurfaceFormat,
    adopted: {
      readonly Handle: NativeHandle;
      readonly LevelCount: number;
      readonly Label: string;
    },
  ) => Texture2D)(
    device, info.Width, info.Height, info.LevelCount > 1, info.Format as SurfaceFormat,
    { Handle: handle, LevelCount: info.LevelCount, Label: label },
  );
}

/** The same, for a volume texture, whose three dimensions also come from CNA. */
function adoptNativeTexture3DForInternalUse(
  device: GraphicsDevice, handle: NativeHandle,
): Texture3D {
  const backend = graphicsBackendFor(device);
  let info;
  try {
    info = backend.getTexture3DInfo(handle);
  } catch (error) {
    backend.destroyTexture3D(handle);
    throw error;
  }
  return new (Texture3D as unknown as new (
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    depth: number,
    mipMap: boolean,
    format: SurfaceFormat,
    adopted: { readonly Handle: NativeHandle; readonly Label: string },
  ) => Texture3D)(
    device, info.Width, info.Height, info.Depth, info.LevelCount > 1,
    info.Format as SurfaceFormat,
    { Handle: handle, Label: "colour lookup table volume" },
  );
}

/** The same, for a cube map. Its size and format come from CNA rather than from the caller. */
function adoptNativeTextureCubeForInternalUse(
  device: GraphicsDevice, handle: NativeHandle, label = "EnvironmentProcessor cube map",
): TextureCube {
  const backend = graphicsBackendFor(device);
  let info;
  try {
    info = backend.getTextureCubeInfo(handle);
  } catch (error) {
    backend.destroyTextureCube(handle);
    throw error;
  }
  return new (TextureCube as unknown as new (
    graphicsDevice: GraphicsDevice,
    size: number,
    mipMap: boolean,
    format: SurfaceFormat,
    adopted: {
      readonly Handle: NativeHandle;
      readonly LevelCount: number;
      readonly Label: string;
    },
  ) => TextureCube)(
    device, info.Size, info.LevelCount > 1, info.Format as SurfaceFormat,
    { Handle: handle, LevelCount: info.LevelCount, Label: label },
  );
}

/**
 * Wraps a caster program CNA lends, or refuses by name where it lends none.
 *
 * All four shadow passes answer their effect getters the same way on a renderer that cannot cast:
 * `CNA_RESULT_SUCCESS` with `CNA_INVALID_HANDLE`. HEADLESS says so in its own log line, because it
 * cannot compile the effect. A handle that cannot be used is not an `Effect`, so this names the
 * capability that is missing instead of wrapping a zero -- which is what wrapping a zero used to
 * look like: an `AggregateError` about a failed reflection rollback.
 */
function borrowCasterEffectForInternalUse(
  device: GraphicsDevice, handle: NativeHandle, what: string, question: string,
): Effect {
  if (handle === 0n) {
    throw new NativeUnavailableError(
      `this renderer lends no ${what}: it cannot cast shadows, which ${question} reports`,
    );
  }
  return adoptNativeEffectForInternalUse(device, effectBackendFor(device), handle);
}

function boundsSnapshot(bounds: BoundingBox): ClusterBoundsSnapshot {
  if (bounds == null) throw new TypeError("bounds is required");
  return {
    Min: vectorSnapshot(bounds.Min, "bounds.Min"),
    Max: vectorSnapshot(bounds.Max, "bounds.Max"),
  };
}

/**
 * What a shadow map costs at each quality tier, and where it looks from.
 *
 * Pure functions: none of them takes a device, a shadow map or anything else, so a game can size
 * its shadow budget before it has created a single resource.
 */
export const ShadowMapMath = {
  /** The shadow texture's edge length at a quality tier. */
  SizeForQuality(quality: ShadowQuality): number {
    return shadows().shadowMapSizeForQuality(shadowQuality(quality));
  },

  /** How many texels wide the percentage-closer filter is at a quality tier. */
  FilterRadiusForQuality(quality: ShadowQuality): number {
    return shadows().shadowMapFilterRadiusForQuality(shadowQuality(quality));
  },

  /** The view matrix that looks along a directional light and frames a scene. */
  ComputeLightView(light: DirectionalLight, sceneBounds: BoundingBox): Matrix {
    if (light == null) throw new TypeError("light is required");
    if (typeof light.Intensity !== "number" || !Number.isFinite(light.Intensity)) {
      throw new TypeError("a light's Intensity must be a finite number");
    }
    return toMatrix(shadows().computeShadowLightView({
      Direction: vectorSnapshot(light.Direction, "light.Direction"),
      Color: vectorSnapshot(light.Color, "light.Color"),
      Intensity: light.Intensity,
    }, boundsSnapshot(sceneBounds)));
  },

  /** The orthographic projection that fits a scene into a light's view. */
  ComputeLightProjection(lightView: Matrix, sceneBounds: BoundingBox): Matrix {
    return toMatrix(shadows().computeShadowLightProjection(
      matrixValues(lightView, "lightView"), boundsSnapshot(sceneBounds),
    ));
  },
  /**
   * Where a cascaded shadow map splits its view range.
   *
   * `lambda` blends two schemes: 0 is a uniform split, 1 is a logarithmic one, and the values
   * between are the practical split scheme every cascaded implementation uses. The list runs from
   * the near plane to the far plane, so it has one more entry than there are cascades.
   */
  ComputeCascadeSplitDistances(
    nearPlane: number, farPlane: number, cascadeCount: number, lambda: number,
  ): readonly number[] {
    for (const [name, value] of [
      ["nearPlane", nearPlane], ["farPlane", farPlane], ["lambda", lambda],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    if (!Number.isInteger(cascadeCount) || cascadeCount < 1) {
      throw new RangeError("cascadeCount must be a positive integer");
    }
    return Object.freeze([...shadows().computeCascadeSplitDistances(
      nearPlane, farPlane, cascadeCount, lambda,
    )]);
  },

  /** The eight world-space corners of a view frustum. */
  ComputeFrustumCorners(view: Matrix, projection: Matrix): readonly Vector3[] {
    return Object.freeze(shadows().computeCascadeFrustumCorners(
      matrixValues(view, "view"), matrixValues(projection, "projection"),
    ).map(toVector3));
  },

  /**
   * The sphere that encloses those corners, which is what sizes a cascade: a sphere rather than a
   * box, because a sphere does not change size as the camera turns, and a cascade that changed
   * size every frame would shimmer.
   */
  ComputeCascadeBoundingSphere(corners: readonly Vector3[]): BoundingSphere {
    if (!Array.isArray(corners) || corners.length !== 8) {
      throw new RangeError("a frustum has exactly eight corners");
    }
    const sphere = shadows().computeCascadeBoundingSphere(
      corners.map((corner, index) => vectorSnapshot(corner, `corners[${index}]`)),
    );
    return new BoundingSphere(toVector3(sphere.Center), sphere.Radius);
  },

  /** The view matrix that looks along a spot light. */
  ComputeSpotLightView(light: ClusteredLight): Matrix {
    return toMatrix(shadows().computeSpotShadowLightView(lightSnapshot(light)));
  },

  /** The perspective projection that matches a spot light's cone and range. */
  ComputeSpotLightProjection(light: ClusteredLight): Matrix {
    return toMatrix(shadows().computeSpotShadowLightProjection(lightSnapshot(light)));
  },

  /** The view matrix for one face of a cube shadow map, from a point light's position. */
  ComputeCubeFaceView(face: CubeMapFace, position: Vector3): Matrix {
    if (!Number.isInteger(face) || face < 0 || face > 5) {
      throw new RangeError("face must be a CubeMapFace");
    }
    return toMatrix(shadows().computeCubeShadowFaceView(
      face, vectorSnapshot(position, "position"),
    ));
  },

  /** The projection every cube face shares: ninety degrees, square, out to a range. */
  ComputeCubeFaceProjection(range: number): Matrix {
    if (typeof range !== "number" || !Number.isFinite(range)) {
      throw new TypeError("range must be a finite number");
    }
    return toMatrix(shadows().computeCubeShadowFaceProjection(range));
  },

  /** A cube shadow map's face size at a quality tier, which is not the flat map's. */
  CubeSizeForQuality(quality: ShadowQuality): number {
    return shadows().cubeShadowMapSizeForQuality(shadowQuality(quality));
  },
} as const;

/**
 * A shadow map's own state: the size and filter its quality tier bought, its depth bias, and the
 * light view-projection it last rendered with.
 *
 * Whether it can render at all is a renderer question, and {@link ShadowMap.IsSupported} is how to
 * ask. The depth pass itself is projected too — {@link ShadowMap.Begin} opens it — and so are the
 * other three shapes a game needs: {@link CascadedShadowMap}, {@link SpotShadowMap} and
 * {@link CubeShadowMap}.
 */
export class ShadowMap implements IDisposable {
  readonly #backend: CnaShadowBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;
  #casterEffect: Effect | null = null;
  #skinnedCasterEffect: Effect | null = null;
  #shadowTexture: Texture2D | null = null;

  public constructor(graphicsDevice: GraphicsDevice, quality: ShadowQuality) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = shadows();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createShadowMap(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), shadowQuality(quality),
    );
  }

  /** Whether the shadow map has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the shadow map is disposed");
    return this.#handle;
  }

  /** Whether this renderer can actually render into it. */
  public get IsSupported(): boolean {
    return this.#backend.isShadowMapSupported(this.#active());
  }

  /** The shadow texture's edge length, which its quality tier chose. */
  public get Size(): number { return this.#backend.getShadowMapSize(this.#active()); }

  /** The tier it was created at. */
  public get Quality(): ShadowQuality {
    return this.#backend.getShadowMapQuality(this.#active()) as ShadowQuality;
  }

  /** How many texels wide its filter is, which its quality tier also chose. */
  public get FilterRadius(): number {
    return this.#backend.getShadowMapFilterRadius(this.#active());
  }

  /** The depth bias that keeps a surface from shadowing itself. */
  public get DepthBias(): number {
    return this.#backend.getShadowMapDepthBias(this.#active());
  }
  public set DepthBias(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("DepthBias must be a finite number");
    }
    this.#backend.setShadowMapDepthBias(this.#active(), value);
  }

  /** The combined light view-projection, which a shader needs to sample the map. */
  public get LightViewProjection(): Matrix {
    return toMatrix(this.#backend.getShadowMapLightViewProjection(this.#active()));
  }

  /**
   * Opens the depth pass: binds the shadow texture, clears it to the far plane, and computes the
   * light transform {@link LightViewProjection} then reports.
   *
   * Between this and {@link End}, ordinary draw calls rasterise depth into the map. Apply a caster
   * effect first — {@link ApplyCaster} for rigid geometry, {@link ApplySkinnedCaster} for skinned —
   * because the pass needs the caster program bound, not whatever the frame was drawing with.
   */
  public Begin(light: DirectionalLight, sceneBounds: BoundingBox): void {
    if (light == null) throw new TypeError("light is required");
    if (typeof light.Intensity !== "number" || !Number.isFinite(light.Intensity)) {
      throw new TypeError("a light's Intensity must be a finite number");
    }
    this.#backend.beginShadowPass(this.#active(), {
      Direction: vectorSnapshot(light.Direction, "light.Direction"),
      Color: vectorSnapshot(light.Color, "light.Color"),
      Intensity: light.Intensity,
    }, boundsSnapshot(sceneBounds));
  }

  /** Closes the depth pass and restores the frame's previous target. */
  public End(): void { this.#backend.endShadowPass(this.#active()); }

  /** Makes the rigid caster program current, so the next draws record depth. */
  public ApplyCaster(): void { this.#backend.applyShadowCaster(this.#active()); }

  /** Makes the skinned caster program current with a bone palette. */
  public ApplySkinnedCaster(bones: readonly Matrix[], weightsPerVertex: number): void {
    if (!Array.isArray(bones)) throw new TypeError("bones must be an array of matrices");
    if (!Number.isInteger(weightsPerVertex) || weightsPerVertex < 1 || weightsPerVertex > 4) {
      throw new RangeError("weightsPerVertex must be 1, 2, 3 or 4");
    }
    this.#backend.applySkinnedShadowCaster(
      this.#active(),
      bones.map((bone, index) => matrixValues(bone, `bones[${index}]`)),
      weightsPerVertex,
    );
  }

  /**
   * The shader that writes depth for rigid casters.
   *
   * CNA lends this: every read is a counted borrow, and the map refuses to be destroyed while one
   * is outstanding. The borrow is taken once and handed back when this shadow map is disposed, so a
   * caller never has to count. Do not dispose it directly.
   *
   * A renderer that cannot cast lends nothing -- CNA answers success with an invalid handle -- and
   * this refuses rather than handing back an effect that cannot be used. {@link IsSupported} is the
   * question to ask first.
   */
  public get CasterEffect(): Effect {
    this.#casterEffect ??= this.#borrowEffect(
      this.#backend.getShadowCasterEffect(this.#active()), "shadow caster effect",
    );
    return this.#casterEffect;
  }

  /** The shader that writes depth for skinned casters. The same borrow rules apply. */
  public get SkinnedCasterEffect(): Effect {
    this.#skinnedCasterEffect ??= this.#borrowEffect(
      this.#backend.getSkinnedShadowCasterEffect(this.#active()), "skinned shadow caster effect",
    );
    return this.#skinnedCasterEffect;
  }

  /**
   * The depth texture the pass wrote, as a readable texture.
   *
   * `GetData` into a `Float32Array` reads the depths back where the renderer supports it: 1.0 is
   * the far plane a `Begin` cleared to, and anything less is a caster. Borrowed on the same terms
   * as the caster effects — CNA gives the borrow back through the render-target release route.
   */
  public get ShadowTexture(): Texture2D {
    this.#shadowTexture ??= borrowNativeTextureForInternalUse(
      this.#device, this.#backend.getShadowMapTexture(this.#active()), "ShadowMap depth texture",
    );
    return this.#shadowTexture;
  }

  #borrowEffect(handle: NativeHandle, what: string): Effect {
    return borrowCasterEffectForInternalUse(
      this.#device, handle, what, "ShadowMap.IsSupported",
    );
  }

  /**
   * Releases the shadow map. Disposing twice is harmless.
   *
   * Every borrow goes back first. CNA counts them and refuses to destroy a map that still has one
   * outstanding, so returning them in the other order would leak the map itself.
   */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#casterEffect?.Dispose();
    this.#casterEffect = null;
    this.#skinnedCasterEffect?.Dispose();
    this.#skinnedCasterEffect = null;
    this.#shadowTexture?.Dispose();
    this.#shadowTexture = null;
    this.#backend.destroyShadowMap(handle);
  }
}


/* --- particles ------------------------------------------------------------------------------------
 *
 * A GPU particle system, and the pure functions behind it.
 *
 * {@link ParticleMath.Step} integrates one particle with no system, no device and no GPU, and
 * {@link ParticleMath.Random} is the deterministic generator the emitter draws from. Together they
 * mean a caller can predict exactly what a simulation will produce — and that this package can be
 * checked against arithmetic rather than against numbers copied out of a previous run.
 *
 * Where compute shaders exist the simulation runs on the GPU; where they do not it runs on the CPU
 * and says so. Drawing is not projected: it needs a texture, a camera and a real pass, and the
 * renderer here that could run one cannot be read back — `docs/upstream-cna-findings.md` item 7.
 */

/** One particle. `State` is the packed age, lifetime and generation the simulation carries. */
export interface Particle {
  readonly Position: Vector4;
  readonly Velocity: Vector4;
  readonly State: Vector4;
}

/** What an emitter produces. */
export interface ParticleEmitterSettings {
  readonly Position: Vector3;
  readonly Direction: Vector3;
  readonly Gravity: Vector3;
  /** Linear RGBA, not an XNA `Color`. */
  readonly StartColor: Vector4;
  readonly EndColor: Vector4;
  /** Radians. */
  readonly ConeAngle: number;
  readonly Speed: number;
  readonly SpeedVariance: number;
  readonly Lifetime: number;
  readonly LifetimeVariance: number;
  readonly Drag: number;
  /** Particles per second. CNA clamps it to what the system's capacity can sustain. */
  readonly EmissionRate: number;
  readonly StartSize: number;
  readonly EndSize: number;
}

function particles(): CnaParticleBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Particles == null) {
    throw new NativeUnavailableError(
      `CNA's particle systems require a loaded backend that has them: ${backend.Detail}`,
    );
  }
  return backend.Particles;
}

function toVector4(snapshot: Vector4Snapshot): Vector4 {
  return new Vector4(snapshot.X, snapshot.Y, snapshot.Z, snapshot.W);
}

function vector4Snapshot(vector: Vector4, what: string): Vector4Snapshot {
  if (vector == null) throw new TypeError(`${what} is required`);
  return { X: vector.X, Y: vector.Y, Z: vector.Z, W: vector.W };
}

function toParticle(snapshot: ParticleSnapshot): Particle {
  return Object.freeze({
    Position: toVector4(snapshot.Position),
    Velocity: toVector4(snapshot.Velocity),
    State: toVector4(snapshot.State),
  });
}

function particleSnapshot(particle: Particle): ParticleSnapshot {
  if (particle == null) throw new TypeError("particle is required");
  return {
    Position: vector4Snapshot(particle.Position, "particle.Position"),
    Velocity: vector4Snapshot(particle.Velocity, "particle.Velocity"),
    State: vector4Snapshot(particle.State, "particle.State"),
  };
}

const EMITTER_SCALARS = [
  "ConeAngle", "Speed", "SpeedVariance", "Lifetime", "LifetimeVariance", "Drag",
  "EmissionRate", "StartSize", "EndSize",
] as const;

function toEmitterSettings(snapshot: ParticleEmitterSettingsSnapshot): ParticleEmitterSettings {
  const result: Record<string, unknown> = {
    Position: toVector3(snapshot.Position),
    Direction: toVector3(snapshot.Direction),
    Gravity: toVector3(snapshot.Gravity),
    StartColor: toVector4(snapshot.StartColor),
    EndColor: toVector4(snapshot.EndColor),
  };
  for (const name of EMITTER_SCALARS) result[name] = snapshot[name];
  return Object.freeze(result) as unknown as ParticleEmitterSettings;
}

function emitterSnapshot(settings: ParticleEmitterSettings): ParticleEmitterSettingsSnapshot {
  if (settings == null) throw new TypeError("settings is required");
  const result: Record<string, unknown> = {
    Position: vectorSnapshot(settings.Position, "settings.Position"),
    Direction: vectorSnapshot(settings.Direction, "settings.Direction"),
    Gravity: vectorSnapshot(settings.Gravity, "settings.Gravity"),
    StartColor: vector4Snapshot(settings.StartColor, "settings.StartColor"),
    EndColor: vector4Snapshot(settings.EndColor, "settings.EndColor"),
  };
  for (const name of EMITTER_SCALARS) {
    const value = settings[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`settings.${name} must be a finite number`);
    }
    result[name] = value;
  }
  return result as unknown as ParticleEmitterSettingsSnapshot;
}

/**
 * The particle simulation, without a particle system.
 *
 * These are pure: no device, no GPU, no state. A game can predict where a particle will be, and a
 * test can check the simulation against arithmetic.
 */
export const ParticleMath = {
  /** CNA's own defaults for an emitter. */
  DefaultEmitterSettings(): ParticleEmitterSettings {
    return toEmitterSettings(particles().getDefaultParticleEmitterSettings());
  },

  /** A fresh particle, as CNA initialises one. */
  DefaultParticle(): Particle {
    return toParticle(particles().getDefaultParticle());
  },

  /** The deterministic value CNA's emitter draws for a seed. */
  Random(seed: number): number {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFF_FFFF) {
      throw new RangeError("seed must be an unsigned 32-bit integer");
    }
    return particles().particleRandom(seed);
  },

  /**
   * Advances one particle. Returns a new particle rather than mutating the one given: a caller's
   * object stays theirs.
   */
  Step(
    particle: Particle, index: number, settings: ParticleEmitterSettings, elapsedSeconds: number,
  ): Particle {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("index must be a non-negative integer");
    }
    if (typeof elapsedSeconds !== "number" || !Number.isFinite(elapsedSeconds)) {
      throw new TypeError("elapsedSeconds must be a finite number");
    }
    return toParticle(particles().stepParticle(
      particleSnapshot(particle), index, emitterSnapshot(settings), elapsedSeconds,
    ));
  },
} as const;

/**
 * A pool of particles CNA simulates.
 *
 * Whether it simulates on the GPU is a renderer question: {@link ParticleSystem.UsesCompute} says
 * which path is running, and {@link ParticleSystem.UnsupportedReason} says why when it is not the
 * GPU. {@link ParticleSystem.ForceSimulationOnCpu} pins it to the CPU deliberately, which is how a
 * game gets the same answer everywhere.
 *
 * Drawing is not projected — see the note above this class.
 */
/** The marker {@link ParticleSystem.AtDefaultCapacity} passes instead of a capacity. */
const DEFAULT_CAPACITY = Symbol("CNA particle system default capacity");

export class ParticleSystem implements IDisposable {
  readonly #backend: CnaParticleBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, capacity: number);
  public constructor(graphicsDevice: GraphicsDevice, capacity: number | typeof DEFAULT_CAPACITY) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (capacity !== DEFAULT_CAPACITY && (!Number.isInteger(capacity) || capacity <= 0)) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.#backend = particles();
    const device = resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
    this.#handle = capacity === DEFAULT_CAPACITY
      ? this.#backend.createParticleSystemAtDefaultCapacity(device)
      : this.#backend.createParticleSystem(device, capacity);
  }

  /** Whether the system has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the particle system is disposed");
    return this.#handle;
  }

  /** How many particles the pool holds. */
  public get Capacity(): number {
    return this.#backend.getParticleSystemCapacity(this.#active());
  }

  /** How many are alive right now. */
  public get ActiveCount(): number {
    return this.#backend.getParticleSystemActiveCount(this.#active());
  }

  /** Whether the simulation is running on the GPU. */
  public get UsesCompute(): boolean {
    return this.#backend.particleSystemUsesCompute(this.#active());
  }

  /** Why it is not, in CNA's own words; empty when it is. */
  public get UnsupportedReason(): string {
    return this.#backend.getParticleSystemUnsupportedReason(this.#active());
  }

  /** Whether the CPU path was chosen deliberately rather than for want of compute. */
  public get IsSimulationForcedOnCpu(): boolean {
    return this.#backend.isParticleSimulationForcedOnCpu(this.#active());
  }

  /** Pins the simulation to the CPU, so every renderer produces the same answer. */
  public ForceSimulationOnCpu(forced: boolean): void {
    this.#backend.setParticleSimulationOnCpu(this.#active(), forced === true);
  }

  /** Whether CNA clamped the emission rate to what this capacity can sustain. */
  public get IsEmissionRateClamped(): boolean {
    return this.#backend.isParticleEmissionRateClamped(this.#active());
  }

  /** What the emitter is producing. */
  public get Settings(): ParticleEmitterSettings {
    return toEmitterSettings(this.#backend.getParticleEmitterSettings(this.#active()));
  }
  public set Settings(value: ParticleEmitterSettings) {
    this.#backend.setParticleEmitterSettings(this.#active(), emitterSnapshot(value));
  }

  /** Advances the simulation. */
  public Update(elapsedSeconds: number): void {
    if (typeof elapsedSeconds !== "number" || !Number.isFinite(elapsedSeconds)) {
      throw new TypeError("elapsedSeconds must be a finite number");
    }
    this.#backend.updateParticleSystem(this.#active(), elapsedSeconds);
  }

  /** Puts every particle back to its unstarted state. */
  public Reset(): void { this.#backend.resetParticleSystem(this.#active()); }

  /** Every particle in the pool, as the simulation currently holds it. */
  public ToArray(): readonly Particle[] {
    return Object.freeze(this.#backend.copyParticles(this.#active()).map(toParticle));
  }

  /**
   * Draws every live particle, as one instanced draw, into whatever target is bound.
   *
   * A system with nothing alive draws nothing and succeeds -- an emission rate of zero is a
   * setting, not a mistake -- but a texture is required, because there is nothing to draw with
   * otherwise.
   */
  public Draw(view: Matrix, projection: Matrix, texture: Texture2D): void {
    if (texture == null) throw new TypeError("texture is required");
    this.#backend.drawParticleSystem(
      this.#active(), matrixValues(view, "view"), matrixValues(projection, "projection"),
      resolveTexture2DHandleForInternalUse(texture),
    );
  }

  /**
   * How far a particle fades as it approaches whatever is behind it, in world units.
   *
   * Floored at zero by CNA rather than refused, so a negative value reads back as zero. It has no
   * visible effect here yet; see {@link SetDepthInput}.
   */
  public get Softness(): number {
    return this.#backend.getParticleSoftness(this.#active());
  }
  public set Softness(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Softness must be a finite number");
    }
    this.#backend.setParticleSoftness(this.#active(), value);
  }

  /**
   * The depth image particles fade against, and the far plane it was normalised by.
   *
   * The image is borrowed, not owned: it must outlive the drawing that uses it. Pass `null` to
   * stop fading. A far plane that is not positive leaves the fade off.
   *
   * **The fade itself does not happen on any renderer this package qualifies against.** The image
   * and the {@link Softness} reach CNA, store, and read back, and the drawn particle is unchanged
   * -- even given a depth image saying every pixel is at the camera, which should erase it. That is
   * `docs/upstream-cna-findings.md` item 12, measured rather than assumed, and
   * `test/windowed-renderer.integration.mjs` asserts it so a repair is noticed.
   */
  public SetDepthInput(depth: Texture2D | null, farPlane: number): void {
    if (typeof farPlane !== "number" || !Number.isFinite(farPlane)) {
      throw new TypeError("farPlane must be a finite number");
    }
    this.#backend.setParticleDepthInput(
      this.#active(),
      depth == null ? 0n : resolveTexture2DHandleForInternalUse(depth),
      farPlane,
    );
  }

  /** Releases the system. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyParticleSystem(handle);
  }

  /**
   * A particle system at CNA's own default capacity, rather than a number chosen here.
   *
   * The public constructor takes a capacity because a game usually has one in mind; this is the
   * other CNA route, for a game that does not.
   */
  public static AtDefaultCapacity(graphicsDevice: GraphicsDevice): ParticleSystem {
    return new (ParticleSystem as unknown as new (
      graphicsDevice: GraphicsDevice, capacity: typeof DEFAULT_CAPACITY,
    ) => ParticleSystem)(graphicsDevice, DEFAULT_CAPACITY);
  }
}

/**
 * The GLSL a vertex shader includes to read a particle out of the storage buffer CNA simulates
 * into, and the binding point that buffer is bound at.
 *
 * A game writing its own particle shader needs both, and CNA hands out its own source rather than
 * leaving it to be reimplemented and drift.
 */
export const ParticleShaderSource = {
  /** The `std430` binding point the particle buffer is bound at. */
  get BindingPoint(): number { return 7; },

  /** CNA's own GLSL for reading a particle by index. */
  get Glsl(): string { return particles().getParticleLookupGlsl(); },
};


/* --- the depth/normal prepass, and the decal projector that reads it -------------------------------
 *
 * These are one family because they are one dependency. {@link DepthNormalPrepass} renders the two
 * screen-space buffers CNA's deferred effects need — linear depth normalised by the far plane, and
 * view-space normals — and {@link DecalPass} is the consumer that unprojects each screen texel back
 * into a decal's own box and paints it where it lands. Nothing else in the ABI produces the pair
 * `SetPrepassInputs` wants.
 *
 * The depth encoding is a measurement rather than a preference. CNA measured that a half-float
 * depth target makes screen-space effects driven from the prepass occlude nothing, so
 * {@link DepthEncoding.Automatic} chooses the packed one; {@link DepthNormalPrepassMath.UsesPackedDepth}
 * is the route that says which a given device gets, and {@link DepthNormalPrepassMath.PackDepth} and
 * {@link DepthNormalPrepassMath.UnpackDepth} are CNA's own encoder and decoder, so a caller reading a
 * depth texel back does not have to reimplement them.
 */

/** How a {@link DepthNormalPrepass} stores linear depth. */
export enum DepthEncoding {
  /** Let CNA choose; ask {@link DepthNormalPrepassMath.UsesPackedDepth} what it chose. */
  Automatic = 0,
  /** Eight bits per channel across a `Color` target: 1 part in 2^24. */
  Packed = 1,
  /** One half-float channel. */
  HalfFloat = 2,
}

function prepasses(): CnaDepthNormalPrepassBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.DepthNormalPrepass == null) {
    throw new NativeUnavailableError(
      `CNA's depth/normal prepass requires a loaded backend that has it: ${backend.Detail}`,
    );
  }
  return backend.DepthNormalPrepass;
}

function decals(): CnaDecalBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Decals == null) {
    throw new NativeUnavailableError(
      `CNA's decal projector requires a loaded backend that has it: ${backend.Detail}`,
    );
  }
  return backend.Decals;
}

/** Depth packed across four channels, each in the unit range a `Color` target stores. */
export interface PackedDepth {
  readonly R: number;
  readonly G: number;
  readonly B: number;
  readonly A: number;
}

/**
 * The prepass's pure routes: its encoding, its shader source, and what a device chose.
 *
 * None of these needs a prepass object, and the four that touch no device work in any build that
 * has the engine layer at all.
 */
export const DepthNormalPrepassMath = {
  /** Whether {@link DepthEncoding.Automatic} packs depth on this device. */
  UsesPackedDepth(graphicsDevice: GraphicsDevice): boolean {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return prepasses().deviceUsesPackedDepth(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  },

  /**
   * CNA's own GLSL for decoding a depth texel and rebuilding a view-space position from it.
   *
   * A game writing a screen-space shader of its own includes this rather than reimplementing the
   * encoding, which is exactly how the two halves drift apart. `packed` must match what the
   * prepass actually stores — {@link DepthNormalPrepass.IsDepthPacked} answers that.
   */
  DepthDecodeGlsl(packed: boolean): string {
    return prepasses().getDepthDecodeGlsl(packed === true);
  },

  /** The same, for the velocity buffer's encoding. */
  VelocityDecodeGlsl(): string { return prepasses().getVelocityDecodeGlsl(); },

  /**
   * Packs a linear depth into four channel values, as the prepass's shader does.
   *
   * The channels come back in the unit range a `Color` target stores, most significant first. The
   * value is clamped one texel short of 1.0 before packing, because `fract(1.0)` is zero and an
   * unclamped far plane would read back as the nearest possible surface.
   *
   * **The arithmetic is good to a part in 2^24; the storage is not.** Packing is written in powers
   * of 256 while an eight-bit target stores `n/255`, and the decoder weights the low channel by
   * one, so that channel's own quantisation passes straight through: a depth read back out of a
   * real prepass buffer is within about a five-hundredth of the far plane, which is what a single
   * eight-bit channel would have given on its own. That is `docs/upstream-cna-findings.md` item 13,
   * measured rather than assumed, and it is the resolution to budget for when comparing depths.
   */
  PackDepth(value: number): PackedDepth {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("value must be a finite number");
    }
    const packed = prepasses().packLinearDepth(value);
    return Object.freeze({ R: packed.R, G: packed.G, B: packed.B, A: packed.A });
  },

  /** The inverse: four channel values back into a linear depth. */
  UnpackDepth(r: number, g: number, b: number, a: number): number {
    for (const [name, channel] of [["r", r], ["g", g], ["b", b], ["a", a]] as const) {
      if (typeof channel !== "number" || !Number.isFinite(channel)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return prepasses().unpackLinearDepth(r, g, b, a);
  },

  /**
   * Whether a velocity texel carries a velocity at all.
   *
   * Alpha zero means it does, which is inverted on purpose: the multiple-render-target path issues
   * one clear for the whole bound set and depth has to clear to white, so the shared clear already
   * writes "nothing here".
   */
  HasVelocity(texel: Color): boolean {
    if (texel == null) throw new TypeError("texel is required");
    return prepasses().velocityTexelHasVelocity({
      R: texel.R, G: texel.G, B: texel.B, A: texel.A,
    });
  },

  /** The screen-space velocity a texel encodes, in UV units. */
  DecodeVelocity(texel: Color): Vector2 {
    if (texel == null) throw new TypeError("texel is required");
    const velocity = prepasses().decodeVelocityTexel({
      R: texel.R, G: texel.G, B: texel.B, A: texel.A,
    });
    return new Vector2(velocity.X, velocity.Y);
  },
} as const;

/**
 * CNA's depth/normal prepass: linear depth and view-space normals, for the effects that need them.
 *
 * How many passes it takes to fill depends on the renderer — one where multiple render targets
 * work, two where they do not, three with velocity on — so {@link PassCount} is asked rather than
 * assumed, and {@link Begin}/{@link End} run once per pass with the same camera.
 *
 * Its textures and effects are **borrows**. CNA counts them and refuses to destroy the prepass
 * while one is outstanding, so each is taken once, cached, and given back by {@link Dispose}.
 */
export class DepthNormalPrepass implements IDisposable {
  readonly #backend: CnaDepthNormalPrepassBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;
  #depthTexture: Texture2D | null = null;
  #normalTexture: Texture2D | null = null;
  #velocityTexture: Texture2D | null = null;
  #prepassEffect: Effect | null = null;
  #skinnedPrepassEffect: Effect | null = null;

  public constructor(
    graphicsDevice: GraphicsDevice,
    width: number,
    height: number,
    encoding: DepthEncoding = DepthEncoding.Automatic,
  ) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError("width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError("height must be a positive integer");
    }
    if (!Number.isInteger(encoding) || encoding < DepthEncoding.Automatic ||
        encoding > DepthEncoding.HalfFloat) {
      throw new RangeError("encoding must be a DepthEncoding");
    }
    this.#backend = prepasses();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createDepthNormalPrepass(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), width, height, encoding,
    );
  }

  /** Whether the prepass has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the depth/normal prepass is disposed");
    }
    return this.#handle;
  }

  /** Whether this renderer's shaders compiled and it can actually run the pass. */
  public get IsSupported(): boolean {
    return this.#backend.isDepthNormalPrepassSupported(
      this.#active(), resolveGraphicsDeviceHandleForInternalUse(this.#device),
    );
  }

  /** How many `Begin`/`End` cycles fill the buffers on this renderer. */
  public get PassCount(): number {
    return this.#backend.getDepthNormalPrepassPassCount(this.#active());
  }

  /** Whether it fills them in one pass, with multiple render targets. */
  public get IsUsingMultipleRenderTargets(): boolean {
    return this.#backend.isDepthNormalPrepassUsingMultipleRenderTargets(this.#active());
  }

  /** Whether depth is stored packed across an eight-bit target rather than as a half float. */
  public get IsDepthPacked(): boolean {
    return this.#backend.isDepthNormalPrepassDepthPacked(this.#active());
  }

  /** The roughness written alongside the normals; clamped to the unit range by CNA. */
  public get Roughness(): number {
    return this.#backend.getDepthNormalPrepassRoughness(this.#active());
  }
  public set Roughness(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Roughness must be a finite number");
    }
    this.#backend.setDepthNormalPrepassRoughness(this.#active(), value);
  }

  /** Whether a velocity buffer is written too. Changing it is refused while a pass is open. */
  public get IsVelocityEnabled(): boolean {
    return this.#backend.isDepthNormalPrepassVelocityEnabled(this.#active());
  }
  public set IsVelocityEnabled(value: boolean) {
    this.#backend.setDepthNormalPrepassVelocityEnabled(this.#active(), value === true);
  }

  /** Resizes the targets. Refused while a pass is open. */
  public Resize(width: number, height: number): void {
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError("width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError("height must be a positive integer");
    }
    this.#backend.resizeDepthNormalPrepass(this.#active(), width, height);
  }

  /**
   * Opens one pass, binding its targets and clearing them.
   *
   * Depth is normalised by `farPlane`, so the pair of planes is what makes a stored value mean
   * anything; CNA refuses a pair that cannot normalise rather than correcting it.
   */
  public Begin(
    passIndex: number, view: Matrix, projection: Matrix, nearPlane: number, farPlane: number,
  ): void {
    if (!Number.isInteger(passIndex) || passIndex < 0) {
      throw new RangeError("passIndex must be a non-negative integer");
    }
    if (typeof nearPlane !== "number" || !Number.isFinite(nearPlane)) {
      throw new TypeError("nearPlane must be a finite number");
    }
    if (typeof farPlane !== "number" || !Number.isFinite(farPlane)) {
      throw new TypeError("farPlane must be a finite number");
    }
    this.#backend.beginDepthNormalPrepass(
      this.#active(), passIndex, matrixValues(view, "view"),
      matrixValues(projection, "projection"), nearPlane, farPlane,
    );
  }

  /** Closes the open pass and restores the frame's previous target. */
  public End(): void { this.#backend.endDepthNormalPrepass(this.#active()); }

  /** The previous frame's world transform, which the velocity buffer reprojects against. */
  public SetPreviousWorld(previousWorld: Matrix): void {
    this.#backend.setDepthNormalPrepassPreviousWorld(
      this.#active(), matrixValues(previousWorld, "previousWorld"),
    );
  }

  /** The previous frame's camera, for the same reason. */
  public SetPreviousCamera(previousView: Matrix, previousProjection: Matrix): void {
    this.#backend.setDepthNormalPrepassPreviousCamera(
      this.#active(), matrixValues(previousView, "previousView"),
      matrixValues(previousProjection, "previousProjection"),
    );
  }

  /**
   * The linear-depth texture, borrowed from the prepass.
   *
   * Depth is view depth divided by the far plane `Begin` was given, so 1.0 is the far plane and a
   * texel is comparable across renderers, which a depth attachment's own contents are not.
   * {@link DepthNormalPrepassMath.UnpackDepth} turns a read-back texel back into that number.
   */
  public get DepthTexture(): Texture2D {
    this.#depthTexture ??= this.#borrowTexture(
      this.#backend.getDepthNormalPrepassDepthTexture(this.#active()),
      "DepthNormalPrepass depth texture",
    );
    return this.#depthTexture;
  }

  /** The view-space normal texture, borrowed on the same terms. */
  public get NormalTexture(): Texture2D {
    this.#normalTexture ??= this.#borrowTexture(
      this.#backend.getDepthNormalPrepassNormalTexture(this.#active()),
      "DepthNormalPrepass normal texture",
    );
    return this.#normalTexture;
  }

  /** The velocity texture, or `null` when velocity is off — which is an absence, not a failure. */
  public get VelocityTexture(): Texture2D | null {
    if (this.#velocityTexture == null) {
      const handle = this.#backend.getDepthNormalPrepassVelocityTexture(this.#active());
      if (handle === 0n) return null;
      this.#velocityTexture = this.#borrowTexture(
        handle, "DepthNormalPrepass velocity texture",
      );
    }
    return this.#velocityTexture;
  }

  /** The program that writes depth and normals for rigid geometry, borrowed from the prepass. */
  public get PrepassEffect(): Effect {
    this.#prepassEffect ??= this.#borrowEffect(
      this.#backend.getDepthNormalPrepassEffect(this.#active()), "depth/normal prepass effect",
    );
    return this.#prepassEffect;
  }

  /** The skinned one. The same borrow rules apply. */
  public get SkinnedPrepassEffect(): Effect {
    this.#skinnedPrepassEffect ??= this.#borrowEffect(
      this.#backend.getSkinnedDepthNormalPrepassEffect(this.#active()),
      "skinned depth/normal prepass effect",
    );
    return this.#skinnedPrepassEffect;
  }

  #borrowTexture(handle: NativeHandle, label: string): Texture2D {
    return borrowNativeTextureForInternalUse(this.#device, handle, label);
  }

  #borrowEffect(handle: NativeHandle, what: string): Effect {
    if (handle === 0n) {
      throw new NativeUnavailableError(
        `this renderer lends no ${what}: it cannot run the prepass, which ` +
        "DepthNormalPrepass.IsSupported reports",
      );
    }
    return adoptNativeEffectForInternalUse(this.#device, effectBackendFor(this.#device), handle);
  }

  /** Releases the prepass. Every borrow goes back first, and disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#prepassEffect?.Dispose();
    this.#prepassEffect = null;
    this.#skinnedPrepassEffect?.Dispose();
    this.#skinnedPrepassEffect = null;
    this.#depthTexture?.Dispose();
    this.#depthTexture = null;
    this.#normalTexture?.Dispose();
    this.#normalTexture = null;
    this.#velocityTexture?.Dispose();
    this.#velocityTexture = null;
    this.#backend.destroyDepthNormalPrepass(handle);
  }
}

/**
 * CNA's deferred decal projector: a texture glued onto whatever the prepass already drew.
 *
 * **Not a post-process pass**, despite the name CNA gives it. It has no `Apply` and takes no
 * post-process context; it is driven one decal at a time by {@link Draw}, so it carries its own
 * handle and the shared `PostProcessPass` routes do not accept it.
 *
 * The projection is a box. Each screen texel's depth is unprojected into view space, then into the
 * decal's own space by the inverse of {@link Draw}'s world transform, and a texel whose surface
 * falls outside the unit cube centred on the decal's origin is discarded — which is what keeps a
 * decal off the wall behind the crate it was meant for. Inside it, the decal texture is sampled at
 * the local X and Y, so the world transform's scale is the decal's size in world units.
 *
 * The blend is `NonPremultiplied` rather than the `Opaque` every other pass in this layer uses: a
 * decal composites onto the frame, and its own alpha is the mask that decides where.
 */
export class DecalPass implements IDisposable {
  readonly #backend: CnaDecalBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = decals();
    this.#handle = this.#backend.createDecalPass(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the pass has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the decal pass is disposed");
    return this.#handle;
  }

  /** How strongly the decal shows, multiplying its own alpha. Clamped to the unit range by CNA. */
  public get Opacity(): number { return this.#backend.getDecalOpacity(this.#active()); }
  public set Opacity(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Opacity must be a finite number");
    }
    this.#backend.setDecalOpacity(this.#active(), value);
  }

  /** Linear RGB the decal's own colour is multiplied by. Assigned as given, with no clamp. */
  public get Tint(): Vector3 {
    const tint = this.#backend.getDecalTint(this.#active());
    return new Vector3(tint.X, tint.Y, tint.Z);
  }
  public set Tint(value: Vector3) {
    this.#backend.setDecalTint(this.#active(), vectorSnapshot(value, "Tint"));
  }

  /**
   * How far a surface may face away from the decal's axis and still take it, in radians.
   *
   * Clamped to zero through a right angle by CNA: a surface facing further away than perpendicular
   * cannot be projected onto at all. It only has an effect when {@link SetPrepassInputs} was given
   * normals — with none there is nothing to measure the angle against, and every surface takes it.
   */
  public get MaxSlopeAngle(): number {
    return this.#backend.getDecalMaxSlopeAngle(this.#active());
  }
  public set MaxSlopeAngle(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("MaxSlopeAngle must be a finite number");
    }
    this.#backend.setDecalMaxSlopeAngle(this.#active(), value);
  }

  /**
   * The two buffers the pass projects against, both borrowed and neither owned.
   *
   * They must outlive the drawing that uses them. The depth buffer is required — with none,
   * {@link Draw} has nothing to unproject and paints nothing. Normals are optional: pass `null`
   * and the slope test is skipped, and every surface takes the decal whichever way it faces.
   *
   * **Give it {@link DepthNormalPrepass.DepthTexture} and {@link DepthNormalPrepass.NormalTexture},
   * not an uploaded texture of your own.** The pass draws its depth buffer as a full-screen sprite
   * and takes its screen mapping from that sprite, and a `Texture2D` filled with `SetData` does not
   * agree with a render target about which row is the top. Measured, in
   * `test/windowed-renderer.integration.mjs`: handed exactly the bytes the prepass wrote, uploaded
   * into an ordinary texture, the pass finds no surface anywhere; handed them with their rows
   * reversed it finds the whole surface, in rows that share none of the right ones.
   */
  public SetPrepassInputs(depth: Texture2D | null, normals: Texture2D | null): void {
    this.#backend.setDecalPrepassInputs(
      this.#active(),
      depth == null ? 0n : resolveTexture2DHandleForInternalUse(depth),
      normals == null ? 0n : resolveTexture2DHandleForInternalUse(normals),
    );
  }

  /**
   * The camera the pass unprojects with — the same one the prepass was filled through.
   *
   * `farPlane` is the number the stored depth was normalised by. CNA **ignores a far plane that is
   * not positive** rather than refusing it, because the unprojection divides by it: a bad value
   * leaves the previous camera in place instead of breaking the pass. That makes a successful call
   * no proof that anything changed.
   */
  public SetCamera(view: Matrix, projection: Matrix, farPlane: number): void {
    if (typeof farPlane !== "number" || !Number.isFinite(farPlane)) {
      throw new TypeError("farPlane must be a finite number");
    }
    this.#backend.setDecalCamera(
      this.#active(), matrixValues(view, "view"), matrixValues(projection, "projection"), farPlane,
    );
  }

  /**
   * Projects one decal into whatever target is bound.
   *
   * `decalWorld` places and sizes the unit box: its translation is the decal's centre, and its
   * scale is the box's extent in world units. `width` and `height` are the bound target's size in
   * pixels.
   *
   * With no prepass depth or no camera this paints nothing and succeeds — a frame that has not run
   * its prepass yet is a frame with no decals, not a failure.
   */
  public Draw(decal: Texture2D, decalWorld: Matrix, width: number, height: number): void {
    if (decal == null) throw new TypeError("decal is required");
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError("width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError("height must be a positive integer");
    }
    this.#backend.drawDecal(
      this.#active(), resolveTexture2DHandleForInternalUse(decal),
      matrixValues(decalWorld, "decalWorld"), width, height,
    );
  }

  /** Releases the pass. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyDecalPass(handle);
  }

  /**
   * Whether a point in a decal's local space falls inside its box.
   *
   * A pure function of its argument, and the same test the shader makes: the box is the unit cube
   * centred on the origin, so this is true exactly when every component is within a half.
   */
  public static IsInsideDecalBox(decalLocalPosition: Vector3): boolean {
    return decals().isInsideDecalBox(vectorSnapshot(decalLocalPosition, "decalLocalPosition"));
  }
}


/* --- light probes ---------------------------------------------------------------------------------
 *
 * A {@link LightProbe} is the ambient light arriving at one point from every direction, stored as
 * nine second-order spherical-harmonic coefficients — which is all a cosine lobe leaves above second
 * order, so nine vectors reconstruct the irradiance on any normal. A {@link LightProbeVolume} is a
 * grid of them over a box, and a {@link LightProbeBaker} fills either by drawing the scene six times
 * per probe, once down each axis.
 *
 * A probe is a **value**: it compares by content, a volume copies it in rather than referencing it,
 * and two probes with the same coefficients are equal whatever handles they hold. It is a handle
 * here only because it carries nine vectors and twelve scalars, which is more than a caller should
 * have to assemble by hand.
 */

function lightProbes(): CnaLightProbeBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.LightProbes == null) {
    throw new NativeUnavailableError(
      `CNA's light probes require a loaded backend that has them: ${backend.Detail}`,
    );
  }
  return backend.LightProbes;
}

/** What a bake calls once per cube face, with the camera CNA chose for that face. */
export type SceneFaceDrawCallback = (view: Matrix, projection: Matrix) => void;

/* Filled in by LightProbe's static block; see there for why they cannot be ordinary functions. */
let handleOfLightProbe!: (probe: LightProbe) => NativeHandle;
let adoptNativeLightProbe!: (handle: NativeHandle) => LightProbe;
let handleOfLightProbeVolume!: (volume: LightProbeVolume) => NativeHandle;

/**
 * The ambient light at one point, as nine spherical-harmonic coefficients and six occluder
 * distances.
 *
 * Set the coefficients directly, copy them out of a volume, or bake them from a scene with
 * {@link LightProbeBaker}. {@link Irradiance} reconstructs what arrives on a surface facing any
 * direction, and is **never negative**: the reconstruction can dip below zero where the fit
 * overshoots a dark environment, and negative light is not a look, so CNA floors it.
 */
export class LightProbe implements IDisposable {
  readonly #backend: CnaLightProbeBackend;
  #handle: NativeHandle | null;

  public constructor(position?: Vector3);
  public constructor(position?: Vector3, adopted?: NativeHandle) {
    this.#backend = lightProbes();
    this.#handle = adopted ?? (position === undefined
      ? this.#backend.createLightProbe()
      : this.#backend.createLightProbeAt(vectorSnapshot(position, "position")));
  }

  // The two things this module needs of a probe that a consumer does not: its handle, so a volume
  // or a baker can name it, and a way to wrap one CNA has already made. Both stay inside the class
  // body, because that is the only place a private field is reachable from.
  static {
    handleOfLightProbe = (probe: LightProbe) => probe.#active();
    adoptNativeLightProbe = (handle: NativeHandle) => new (LightProbe as unknown as new (
      position: Vector3 | undefined, adopted: NativeHandle,
    ) => LightProbe)(undefined, handle);
  }

  /** Whether the probe has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the light probe is disposed");
    return this.#handle;
  }

  /** Where the probe stands. A volume overwrites this with the cell's own position. */
  public get Position(): Vector3 {
    return toVector3(this.#backend.getLightProbePosition(this.#active()));
  }
  public set Position(value: Vector3) {
    this.#backend.setLightProbePosition(this.#active(), vectorSnapshot(value, "Position"));
  }

  /**
   * One coefficient, by index.
   *
   * An index outside the table is **refused rather than clamped**, because a clamped index returns
   * a different coefficient and the surface would light almost right — which is the failure that
   * does not look like one.
   */
  public GetCoefficient(index: number): Vector3 {
    if (!Number.isInteger(index)) throw new TypeError("index must be an integer");
    return toVector3(this.#backend.getLightProbeCoefficient(this.#active(), index));
  }

  /** Sets one coefficient, with the same refusal for an index outside the table. */
  public SetCoefficient(index: number, value: Vector3): void {
    if (!Number.isInteger(index)) throw new TypeError("index must be an integer");
    this.#backend.setLightProbeCoefficient(
      this.#active(), index, vectorSnapshot(value, "value"),
    );
  }

  /** Every coefficient at once, in order, as many as CNA says a probe carries. */
  public ToArray(): readonly Vector3[] {
    return Object.freeze(
      this.#backend.copyLightProbeCoefficients(this.#active()).map(toVector3),
    );
  }

  /**
   * The irradiance arriving on a surface facing `normal`.
   *
   * Irradiance, not outgoing radiance, and never negative on any channel. A degenerate normal is
   * treated as straight up rather than refused.
   */
  public Irradiance(normal: Vector3): Vector3 {
    return toVector3(
      this.#backend.lightProbeIrradiance(this.#active(), vectorSnapshot(normal, "normal")),
    );
  }

  /**
   * Records how far away occluders are in one of the six axis directions.
   *
   * Both distances are floored at zero, and the mean squared is additionally floored at the mean
   * squared: no distribution has negative variance, and one that appeared to would make
   * {@link VisibilityWeight} answer outside the unit range — a probe contributing negative light.
   */
  public SetVisibility(direction: number, meanDistance: number, meanSquaredDistance: number): void {
    if (!Number.isInteger(direction)) throw new TypeError("direction must be an integer");
    for (const [name, value] of [
      ["meanDistance", meanDistance], ["meanSquaredDistance", meanSquaredDistance],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    this.#backend.setLightProbeVisibility(
      this.#active(), direction, meanDistance, meanSquaredDistance,
    );
  }

  /** The mean occluder distance recorded for one direction. */
  public GetVisibilityMean(direction: number): number {
    if (!Number.isInteger(direction)) throw new TypeError("direction must be an integer");
    return this.#backend.getLightProbeVisibilityMean(this.#active(), direction);
  }

  /** The mean squared occluder distance recorded for one direction. */
  public GetVisibilityMeanSquared(direction: number): number {
    if (!Number.isInteger(direction)) throw new TypeError("direction must be an integer");
    return this.#backend.getLightProbeVisibilityMeanSquared(this.#active(), direction);
  }

  /** Whether any visibility has been recorded at all. */
  public get HasVisibility(): boolean {
    return this.#backend.lightProbeHasVisibility(this.#active());
  }

  /**
   * How much of this probe's light reaches a point `distance` away in `direction`.
   *
   * **One means "nothing is known to be in the way"**, and that is the answer for a probe with no
   * visibility and for a distance that is not positive — both are absences rather than errors,
   * which is why neither is refused. Beyond the recorded mean it is the Chebyshev bound a variance
   * shadow map uses: a flat wall cuts off sharply, a cluttered direction fades.
   */
  public VisibilityWeight(direction: Vector3, distance: number): number {
    if (typeof distance !== "number" || !Number.isFinite(distance)) {
      throw new TypeError("distance must be a finite number");
    }
    return this.#backend.lightProbeVisibilityWeight(
      this.#active(), vectorSnapshot(direction, "direction"), distance,
    );
  }

  /** Whether the probe stores no light at all. */
  public get IsZero(): boolean {
    return this.#backend.isLightProbeZero(this.#active());
  }

  /** Multiplies every coefficient by a factor, which scales the irradiance with it. */
  public Scale(factor: number): void {
    if (typeof factor !== "number" || !Number.isFinite(factor)) {
      throw new TypeError("factor must be a finite number");
    }
    this.#backend.scaleLightProbe(this.#active(), factor);
  }

  /**
   * Whether two probes hold the same light: every coefficient and every visibility entry.
   *
   * By value, not by handle — a probe copied out of a volume equals the one that was copied in.
   */
  public EqualsProbe(other: LightProbe): boolean {
    if (other == null) throw new TypeError("other is required");
    return this.#backend.lightProbeEquals(
      this.#active(), handleOfLightProbe(other),
    );
  }

  /** Copies every field of another probe over this one, since a handle cannot be assigned. */
  public CopyFrom(source: LightProbe): void {
    if (source == null) throw new TypeError("source is required");
    this.#backend.copyLightProbeFrom(
      this.#active(), handleOfLightProbe(source),
    );
  }

  /** Releases the probe. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyLightProbe(handle);
  }

  /** CNA's own GLSL for evaluating a probe, for a game writing the shader that samples one. */
  public static get EvaluationGlsl(): string {
    return lightProbes().getLightProbeEvaluationGlsl();
  }
}

/**
 * A grid of light probes over a box, and the interpolation between them.
 *
 * Probes are stored **by value**: {@link SetProbe} copies one in and overwrites its position with
 * the cell's, and {@link GetProbe} copies one out, so a result stays correct after the volume
 * changes.
 */
export class LightProbeVolume implements IDisposable {
  readonly #backend: CnaLightProbeBackend;
  #handle: NativeHandle | null;

  public constructor(bounds: BoundingBox, countX: number, countY: number, countZ: number) {
    for (const [name, count] of [
      ["countX", countX], ["countY", countY], ["countZ", countZ],
    ] as const) {
      if (!Number.isInteger(count)) throw new TypeError(`${name} must be an integer`);
    }
    this.#backend = lightProbes();
    this.#handle = this.#backend.createLightProbeVolume(
      boundsSnapshot(bounds), countX, countY, countZ,
    );
  }

  /** Whether the volume has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the light probe volume is disposed");
    }
    return this.#handle;
  }

  static { handleOfLightProbeVolume = (volume: LightProbeVolume) => volume.#active(); }

  /** The box the grid spans. */
  public get Bounds(): BoundingBox {
    const bounds = this.#backend.getLightProbeVolumeBounds(this.#active());
    return new BoundingBox(toVector3(bounds.Min), toVector3(bounds.Max));
  }

  /** How many probes lie along X. */
  public get CountX(): number {
    return this.#backend.getLightProbeVolumeCountX(this.#active());
  }
  /** How many probes lie along Y. */
  public get CountY(): number {
    return this.#backend.getLightProbeVolumeCountY(this.#active());
  }
  /** How many probes lie along Z. */
  public get CountZ(): number {
    return this.#backend.getLightProbeVolumeCountZ(this.#active());
  }
  /** How many the volume holds in total. */
  public get ProbeCount(): number {
    return this.#backend.getLightProbeVolumeProbeCount(this.#active());
  }

  /**
   * Where one probe of the grid stands: the box's corner plus an even step along each axis, and
   * the box's own minimum on an axis holding a single probe.
   */
  public GetProbePosition(x: number, y: number, z: number): Vector3 {
    assertCell(x, y, z);
    return toVector3(this.#backend.getLightProbeVolumeProbePosition(this.#active(), x, y, z));
  }

  /**
   * Copies one probe out of the grid.
   *
   * Pass `into` to reuse a probe rather than make one; the same object comes back. Without it the
   * result is a new probe the caller owns and disposes.
   */
  public GetProbe(x: number, y: number, z: number, into?: LightProbe): LightProbe {
    assertCell(x, y, z);
    const target = into ?? new LightProbe();
    try {
      this.#backend.getLightProbeVolumeProbe(
        this.#active(), x, y, z, handleOfLightProbe(target),
      );
    } catch (error) {
      if (into === undefined) target.Dispose();
      throw error;
    }
    return target;
  }

  /** Copies a probe into one cell, which takes the cell's own position with it. */
  public SetProbe(x: number, y: number, z: number, probe: LightProbe): void {
    assertCell(x, y, z);
    if (probe == null) throw new TypeError("probe is required");
    this.#backend.setLightProbeVolumeProbe(
      this.#active(), x, y, z, handleOfLightProbe(probe),
    );
  }

  /** Whether a position lies inside the box, edges included. */
  public Contains(position: Vector3): boolean {
    return this.#backend.lightProbeVolumeContains(
      this.#active(), vectorSnapshot(position, "position"),
    );
  }

  /**
   * Interpolates the eight surrounding probes into one.
   *
   * A position outside the box is **clamped into it rather than refused**: a point just outside a
   * probe grid is an ordinary thing during rendering, and the nearest interpolation is what a
   * caller wants there. `into` works as it does on {@link GetProbe}.
   */
  public SampleProbe(position: Vector3, into?: LightProbe): LightProbe {
    const target = into ?? new LightProbe();
    try {
      this.#backend.sampleLightProbeVolume(
        this.#active(), vectorSnapshot(position, "position"),
        handleOfLightProbe(target),
      );
    } catch (error) {
      if (into === undefined) target.Dispose();
      throw error;
    }
    return target;
  }

  /** The irradiance at a point on a surface facing one way, sampled and reconstructed in one go. */
  public Irradiance(position: Vector3, normal: Vector3): Vector3 {
    return toVector3(this.#backend.lightProbeVolumeIrradiance(
      this.#active(), vectorSnapshot(position, "position"), vectorSnapshot(normal, "normal"),
    ));
  }

  /** Whether every probe in the volume stores no light. */
  public get IsZero(): boolean {
    return this.#backend.isLightProbeVolumeZero(this.#active());
  }

  /** Releases the volume and the probes it holds. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyLightProbeVolume(handle);
  }
}

function assertCell(x: number, y: number, z: number): void {
  for (const [name, index] of [["x", x], ["y", y], ["z", z]] as const) {
    if (!Number.isInteger(index)) throw new TypeError(`${name} must be an integer`);
  }
}

/**
 * Captures light probes by rendering the scene six times per probe, once down each axis.
 *
 * **Whether a baker can bake is probed rather than asked.** No renderer publishes "can bind an
 * offscreen target and read it back" as a capability, and the two do not come together — a headless
 * renderer binds happily and refuses the readback — so CNA renders one capture at construction and
 * remembers whether it worked. {@link IsSupported} reports that measurement and every bake refuses
 * when it is false.
 *
 * The scene callback runs with the baker's own target bound. **Draw the scene and nothing else:**
 * binding another target inside it loses the face being captured.
 */
export class LightProbeBaker implements IDisposable {
  readonly #backend: CnaLightProbeBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, faceSize?: number) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (faceSize !== undefined && (!Number.isInteger(faceSize) || faceSize <= 0)) {
      throw new RangeError("faceSize must be a positive integer");
    }
    this.#backend = lightProbes();
    const device = resolveGraphicsDeviceHandleForInternalUse(graphicsDevice);
    this.#handle = faceSize === undefined
      ? this.#backend.createLightProbeBaker(device)
      : this.#backend.createLightProbeBakerWithFaceSize(device, faceSize);
  }

  /** Whether the baker has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the light probe baker is disposed");
    }
    return this.#handle;
  }

  /** Whether this renderer can actually capture, measured at construction rather than declared. */
  public get IsSupported(): boolean {
    return this.#backend.isLightProbeBakerSupported(this.#active());
  }

  /** The cube-face resolution each capture renders at. */
  public get FaceSize(): number {
    return this.#backend.getLightProbeBakerFaceSize(this.#active());
  }

  /** The near capture distance. */
  public get NearPlane(): number {
    return this.#backend.getLightProbeBakerNearPlane(this.#active());
  }

  /** The far capture distance. */
  public get FarPlane(): number {
    return this.#backend.getLightProbeBakerFarPlane(this.#active());
  }

  /**
   * Sets both capture distances at once.
   *
   * **Validated as a pair and refused as a pair**: a near distance that is not positive, or a far
   * distance that does not exceed it, leaves both unchanged. There is no half-applied state and no
   * clamping, because a silently corrected range gives probes that look plausible and are lit from
   * the wrong depth.
   */
  public SetPlanes(nearPlane: number, farPlane: number): void {
    for (const [name, value] of [["nearPlane", nearPlane], ["farPlane", farPlane]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    this.#backend.setLightProbeBakerPlanes(this.#active(), nearPlane, farPlane);
  }

  /** The view matrix one cube face is captured with, from a capture position. */
  public FaceView(face: number, position: Vector3): Matrix {
    if (!Number.isInteger(face)) throw new TypeError("face must be an integer");
    return toMatrix(this.#backend.getLightProbeBakerFaceView(
      this.#active(), face, vectorSnapshot(position, "position"),
    ));
  }

  /**
   * Captures one probe, calling `draw` once per face with the camera CNA chose for it.
   *
   * The result is a new probe the caller owns and disposes. An exception thrown by `draw` is
   * carried out of the bake and rethrown here rather than unwinding through CNA, which owns a
   * bound render target for the duration.
   */
  public BakeProbe(position: Vector3, draw: SceneFaceDrawCallback): LightProbe {
    if (typeof draw !== "function") throw new TypeError("draw must be a function");
    const handle = this.#backend.bakeLightProbe(
      this.#active(), vectorSnapshot(position, "position"), wrapSceneDraw(draw),
    );
    return adoptNativeLightProbe(handle);
  }

  /**
   * Captures the light of every probe in a volume, and returns how many faces were drawn.
   *
   * Whatever visibility each probe already carried is **kept**: light and visibility are two
   * separate bakes and either may be run without the other.
   */
  public BakeLight(volume: LightProbeVolume, draw: SceneFaceDrawCallback): number {
    if (volume == null) throw new TypeError("volume is required");
    if (typeof draw !== "function") throw new TypeError("draw must be a function");
    return this.#backend.bakeLightProbeVolumeLight(
      this.#active(), handleOfLightProbeVolume(volume), wrapSceneDraw(draw),
    );
  }

  /** Captures the occluder distances of every probe in a volume, on the same terms. */
  public BakeVisibility(volume: LightProbeVolume, draw: SceneFaceDrawCallback): number {
    if (volume == null) throw new TypeError("volume is required");
    if (typeof draw !== "function") throw new TypeError("draw must be a function");
    return this.#backend.bakeLightProbeVolumeVisibility(
      this.#active(), handleOfLightProbeVolume(volume), wrapSceneDraw(draw),
    );
  }

  /** Releases the baker and its capture target. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyLightProbeBaker(handle);
  }

  /** How many faces one capture renders. The same for every baker, and asked rather than assumed. */
  public static get FaceCount(): number {
    return lightProbes().getLightProbeBakerFaceCount();
  }
}

function wrapSceneDraw(draw: SceneFaceDrawCallback): SceneFaceDraw {
  return (view, projection) => { draw(toMatrix(view), toMatrix(projection)); };
}


/* --- the atmosphere -------------------------------------------------------------------------------
 *
 * Two skies and the processor that prepares one of them.
 *
 * {@link AtmosphericSky} computes the sky from a sun direction and a turbidity — single-scattering
 * with Rayleigh's wavelength dependence, which is why a clear one is blue, and Mie's, which is why
 * haze is white. {@link Skybox} samples a captured cube map instead. They share a draw shape and
 * differ in where the colour comes from, and a game usually has one or the other rather than both.
 *
 * {@link AtmosphericSkyMath.Radiance} is the same model the shader runs, on the CPU and without a
 * device — which is both a CPU-side ambient term and the way to know what a frame is going to look
 * like before drawing it. {@link EnvironmentProcessor} turns a panorama into the cube map a skybox
 * wants and the two convolutions a physically-based material wants beside it.
 */

function atmosphere(): CnaAtmosphereBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.Atmosphere == null) {
    throw new NativeUnavailableError(
      `CNA's atmosphere requires a loaded backend that has it: ${backend.Detail}`,
    );
  }
  return backend.Atmosphere;
}

/** The atmosphere's pure routes: the model itself, and the ray a screen point looks along. */
export const AtmosphericSkyMath = {
  /**
   * The sky's radiance along one view direction, evaluated on the CPU.
   *
   * The same model {@link AtmosphericSky} runs in its shader, so this is what a drawn sky will be
   * before it is drawn. **The turbidity is used as given** — unlike
   * {@link AtmosphericSky.Turbidity}, which clamps into the model's range, because a setter guards
   * a sky that will be drawn many times while this evaluates whatever it is handed. A degenerate
   * view direction falls back to straight up rather than refusing.
   */
  Radiance(viewDirection: Vector3, sunDirection: Vector3, turbidity: number): Vector3 {
    if (typeof turbidity !== "number" || !Number.isFinite(turbidity)) {
      throw new TypeError("turbidity must be a finite number");
    }
    return toVector3(atmosphere().atmosphericSkyRadiance(
      vectorSnapshot(viewDirection, "viewDirection"),
      vectorSnapshot(sunDirection, "sunDirection"),
      turbidity,
    ));
  },

  /** CNA's own GLSL for the model, for a game whose shader wants the sky in it. */
  get ModelGlsl(): string { return atmosphere().getAtmosphericSkyModelGlsl(); },

  /**
   * The world direction one screen point looks along, through a sky rotated by `yaw`.
   *
   * A pure function needing no sky: it is how a caller reproduces the lookup either sky performs,
   * for picking or for checking on the CPU what the shader sampled. Only the view's rotation is
   * used, and a degenerate ray answers straight ahead rather than refusing.
   */
  ViewRay(
    view: Matrix, projection: Matrix, ndcX: number, ndcY: number, yaw: number,
  ): Vector3 {
    for (const [name, value] of [["ndcX", ndcX], ["ndcY", ndcY], ["yaw", yaw]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return toVector3(atmosphere().computeSkyboxViewRay(
      matrixValues(view, "view"), matrixValues(projection, "projection"), ndcX, ndcY, yaw,
    ));
  },
} as const;

/**
 * The analytic sky: scattering computed from a sun direction rather than sampled from a capture.
 *
 * **Its three setters behave three different ways, and this keeps each rather than regularising
 * them.** The turbidity is clamped into the model's range, the intensity is a guarded assignment
 * that keeps the previous value for a negative one, and the sun direction is a guarded assignment
 * that also normalises — so a vector too short to have a direction leaves the sun where it was, and
 * a successful call is no proof anything changed. That is why the getters exist.
 *
 * Support is probed at construction: an unsupported sky draws nothing and reports success, because
 * a missing sky is a scene without a sky rather than a broken frame.
 */
export class AtmosphericSky implements IDisposable {
  readonly #backend: CnaAtmosphereBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = atmosphere();
    this.#handle = this.#backend.createAtmosphericSky(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the sky has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the atmospheric sky is disposed");
    return this.#handle;
  }

  /** Whether this renderer compiled the sky shader, measured at construction. */
  public get IsSupported(): boolean {
    return this.#backend.isAtmosphericSkySupported(this.#active());
  }

  /**
   * The direction the sun's light travels in — pointing *away* from the sun, as a light direction
   * does. Always a unit vector on the way out, whatever was written.
   */
  public get SunDirection(): Vector3 {
    return toVector3(this.#backend.getAtmosphericSkySunDirection(this.#active()));
  }
  public set SunDirection(value: Vector3) {
    this.#backend.setAtmosphericSkySunDirection(
      this.#active(), vectorSnapshot(value, "SunDirection"),
    );
  }

  /**
   * How much aerosol the air holds, as a ratio against a perfectly clear atmosphere.
   *
   * One is air with nothing in it, and the haze term vanishes there. **Clamped to one through ten**,
   * the range the model is defined over.
   */
  public get Turbidity(): number {
    return this.#backend.getAtmosphericSkyTurbidity(this.#active());
  }
  public set Turbidity(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Turbidity must be a finite number");
    }
    this.#backend.setAtmosphericSkyTurbidity(this.#active(), value);
  }

  /**
   * The brightness the whole sky is multiplied by.
   *
   * A negative value is a **silent no-op that keeps the previous intensity** — not a clamp to zero,
   * which is what the identically named {@link Skybox.Intensity} does. The two setters genuinely
   * differ and this preserves the difference.
   */
  public get Intensity(): number {
    return this.#backend.getAtmosphericSkyIntensity(this.#active());
  }
  public set Intensity(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Intensity must be a finite number");
    }
    this.#backend.setAtmosphericSkyIntensity(this.#active(), value);
  }

  /**
   * Draws the sky over whatever target is bound: the scene target inside a pipeline frame, the back
   * buffer outside one.
   *
   * Only the view's rotation is used, so the sky does not move with the camera's position. A sky
   * this renderer could not compile draws nothing and succeeds.
   */
  public Draw(view: Matrix, projection: Matrix, width: number, height: number): void {
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError("width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError("height must be a positive integer");
    }
    this.#backend.drawAtmosphericSky(
      this.#active(), matrixValues(view, "view"), matrixValues(projection, "projection"),
      width, height,
    );
  }

  /** Releases the sky. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyAtmosphericSky(handle);
  }
}

/**
 * The captured sky: a cube map drawn behind everything, rotated and tinted.
 *
 * A skybox that cannot draw — because the renderer refused the shader, or because no environment is
 * attached — **skips silently rather than failing**, and {@link Draw} succeeds in both cases. A
 * missing sky is a scene without a sky, not a broken frame; {@link IsSupported} and
 * {@link Environment} are the questions that say whether anything was drawn.
 */
export class Skybox implements IDisposable {
  readonly #backend: CnaAtmosphereBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, environment?: TextureCube | null) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = atmosphere();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createSkybox(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      environment == null ? 0n : resolveTextureCubeHandleForInternalUse(environment),
    );
  }

  /** Whether the skybox has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the skybox is disposed");
    return this.#handle;
  }

  /** Whether this renderer compiled the sky shader, measured at construction. */
  public get IsSupported(): boolean {
    return this.#backend.isSkyboxSupported(this.#active());
  }

  /**
   * Whether a cube map is attached at all. Drawing without one paints nothing and succeeds.
   *
   * **This is a question rather than an accessor for a reason.** `cna_skybox_get_environment` does
   * not hand back the cube map that was attached: it mints a *new owned handle* aliasing the
   * skybox, which the caller must release and which counts against the game's owned resources until
   * it is. Reading it once per frame and dropping the answer makes the game undestroyable, which is
   * how this was found. So the handle is taken, tested and given straight back, and the cube map
   * itself is not projected -- a caller already holds whatever it attached.
   */
  public get HasEnvironment(): boolean {
    const handle = this.#backend.getSkyboxEnvironment(this.#active());
    if (handle === 0n) return false;
    graphicsBackendFor(this.#device).destroyTextureCube(handle);
    return true;
  }

  /**
   * Attaches a cube map the caller keeps, or `null` to detach.
   *
   * **Borrowed, never owned**: it must outlive the drawing that uses it. Attaching a borrowed cube
   * over one handed to {@link SetOwnedEnvironment} releases the owned one first, so it cannot be
   * left alive with nothing referring to it.
   */
  public SetEnvironment(environment: TextureCube | null): void {
    this.#backend.setSkyboxEnvironment(
      this.#active(),
      environment == null ? 0n : resolveTextureCubeHandleForInternalUse(environment),
    );
  }

  /**
   * Hands a cube map over, and the skybox releases it with itself.
   *
   * **The texture is consumed.** On success the caller's `TextureCube` no longer owns anything and
   * must not be used again -- disposing it would be a second release. Named for the transfer rather
   * than hidden behind a flag, exactly as `PostProcessChain.AddOwned` is.
   */
  public SetOwnedEnvironment(environment: TextureCube): void {
    if (environment == null) throw new TypeError("environment is required");
    // Transferred first, because CNA's contract is that the handle is gone whether or not the
    // call succeeds: a wrapper that still owned it after a refusal would release it twice.
    const handle = transferTextureCubeForInternalUse(environment);
    this.#backend.setSkyboxOwnedEnvironment(this.#active(), handle);
  }

  /** The horizontal rotation applied to the sky. Assigned as given: any angle is meaningful. */
  public get Yaw(): number { return this.#backend.getSkyboxYaw(this.#active()); }
  public set Yaw(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Yaw must be a finite number");
    }
    this.#backend.setSkyboxYaw(this.#active(), value);
  }

  /**
   * The brightness the sky is multiplied by.
   *
   * **Floored at zero**, so a negative value reads back as zero — which is *not* what
   * {@link AtmosphericSky.Intensity} does with a negative value. The two setters differ upstream
   * and this preserves the difference rather than making them agree.
   */
  public get Intensity(): number { return this.#backend.getSkyboxIntensity(this.#active()); }
  public set Intensity(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Intensity must be a finite number");
    }
    this.#backend.setSkyboxIntensity(this.#active(), value);
  }

  /** Linear RGB the sky is multiplied by. Assigned with no clamp: above one brightens an HDR sky. */
  public get Tint(): Vector3 {
    return toVector3(this.#backend.getSkyboxTint(this.#active()));
  }
  public set Tint(value: Vector3) {
    this.#backend.setSkyboxTint(this.#active(), vectorSnapshot(value, "Tint"));
  }

  /** Draws the sky over whatever target is bound. Only the view's rotation is used. */
  public Draw(view: Matrix, projection: Matrix, width: number, height: number): void {
    if (!Number.isInteger(width) || width <= 0) {
      throw new RangeError("width must be a positive integer");
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError("height must be a positive integer");
    }
    this.#backend.drawSkybox(
      this.#active(), matrixValues(view, "view"), matrixValues(projection, "projection"),
      width, height,
    );
  }

  /** Releases the skybox, and any environment handed to {@link SetOwnedEnvironment} with it. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroySkybox(handle);
  }

  // The render pipeline needs a skybox's handle to borrow it, and a skybox's private field is
  // reachable only from inside this class body.
  static {
    skyboxOfPipeline = (pipeline: NativeHandle) =>
      atmosphere().getRenderPipelineSkybox(pipeline);
    setSkyboxOfPipeline = (pipeline: NativeHandle, skybox: Skybox | null) => {
      atmosphere().setRenderPipelineSkybox(
        pipeline, skybox == null ? 0n : skybox.#active(),
      );
    };
  }
}

/**
 * Turns a panorama into the three things a physically-based frame samples: the environment cube a
 * {@link Skybox} draws, the diffuse convolution and the specular one.
 *
 * A pure transformer with **no settings at all**: every operation takes an environment and hands
 * back a new texture the caller owns. The three generators that build a `TextureCube` are the ones
 * a renderer without cube storage refuses, and that refusal arrives as `NotSupported` — which is
 * also what a build without the engine layer answers, so
 * {@link IsGraphicsExtensionLayerAvailable} is what tells the two apart.
 *
 * **The three products of the split sum must be generated together.** Pairing a prefiltered cube
 * with a mip count from a different one is the failure the bundle exists to prevent.
 */
export class EnvironmentProcessor implements IDisposable {
  readonly #backend: CnaAtmosphereBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = atmosphere();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createEnvironmentProcessor(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the processor has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the environment processor is disposed");
    }
    return this.#handle;
  }

  /** Converts an equirectangular panorama into a cube map the caller owns. */
  public ConvertEquirectangular(panorama: Texture2D, faceSize: number): TextureCube {
    if (panorama == null) throw new TypeError("panorama is required");
    if (!Number.isInteger(faceSize) || faceSize <= 0) {
      throw new RangeError("faceSize must be a positive integer");
    }
    return this.#adoptCube(this.#backend.convertEquirectangular(
      this.#active(), resolveTexture2DHandleForInternalUse(panorama), faceSize,
    ));
  }

  /** The cosine-convolved diffuse cube: what a matte surface sees from every direction. */
  public GenerateIrradiance(
    environment: TextureCube, size: number, sampleCount: number,
  ): TextureCube {
    if (environment == null) throw new TypeError("environment is required");
    assertPositiveCounts({ size, sampleCount });
    return this.#adoptCube(this.#backend.generateIrradianceCube(
      this.#active(), resolveTextureCubeHandleForInternalUse(environment), size, sampleCount,
    ));
  }

  /**
   * The GGX-prefiltered specular cube, whose mip chain is a roughness ramp.
   *
   * `mipCount` is the number a material must be given back, because
   * {@link EnvironmentProcessorMath.MipForRoughness} indexes the ramp by it.
   */
  public GeneratePrefilteredSpecular(
    environment: TextureCube, baseSize: number, mipCount: number, sampleCount: number,
  ): TextureCube {
    if (environment == null) throw new TypeError("environment is required");
    assertPositiveCounts({ baseSize, mipCount, sampleCount });
    return this.#adoptCube(this.#backend.generatePrefilteredSpecular(
      this.#active(), resolveTextureCubeHandleForInternalUse(environment),
      baseSize, mipCount, sampleCount,
    ));
  }

  /** Projects an environment into one {@link LightProbe} the caller owns. */
  public GenerateProbe(environment: TextureCube, position: Vector3): LightProbe {
    if (environment == null) throw new TypeError("environment is required");
    return adoptNativeLightProbe(this.#backend.generateProbeFromEnvironment(
      this.#active(), resolveTextureCubeHandleForInternalUse(environment),
      vectorSnapshot(position, "position"),
    ));
  }

  /**
   * The BRDF table, indexed by the cosine of the view angle across and roughness down.
   *
   * It depends on neither an environment nor a scene, so it can be generated once and shared by
   * every bundle — and it is a 2D texture rather than a cube, which is why a renderer without cube
   * storage still produces it.
   */
  public GenerateBrdfLut(size: number, sampleCount: number): Texture2D {
    assertPositiveCounts({ size, sampleCount });
    const handle = this.#backend.generateBrdfLut(this.#active(), size, sampleCount);
    return adoptNativeTexture2DForInternalUse(this.#device, handle, "BRDF lookup table");
  }

  #adoptCube(handle: NativeHandle): TextureCube {
    return adoptNativeTextureCubeForInternalUse(this.#device, handle);
  }

  /** Releases the processor. The textures it made are the caller's and outlive it. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyEnvironmentProcessor(handle);
  }
}

function assertPositiveCounts(counts: Readonly<Record<string, number>>): void {
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer`);
    }
  }
}

/**
 * The environment processor's pure routes: the roughness ramp, the sampling sequence behind it, and
 * the two mappings between a direction and a texture coordinate.
 *
 * None needs a processor or a device, and all five **answer rather than refuse**: a mip count with
 * no ramp to index gives mip zero, and a roughness outside the unit range is clamped into it.
 */
export const EnvironmentProcessorMath = {
  /** Which mip of a prefiltered cube carries a roughness, as a fractional level. */
  MipForRoughness(roughness: number, mipCount: number): number {
    if (typeof roughness !== "number" || !Number.isFinite(roughness)) {
      throw new TypeError("roughness must be a finite number");
    }
    if (!Number.isInteger(mipCount)) throw new TypeError("mipCount must be an integer");
    return atmosphere().mipForRoughness(roughness, mipCount);
  },

  /** The inverse: which roughness a mip carries. */
  RoughnessForMip(mip: number, mipCount: number): number {
    if (typeof mip !== "number" || !Number.isFinite(mip)) {
      throw new TypeError("mip must be a finite number");
    }
    if (!Number.isInteger(mipCount)) throw new TypeError("mipCount must be an integer");
    return atmosphere().roughnessForMip(mip, mipCount);
  },

  /** One point of the Hammersley low-discrepancy sequence the convolutions sample with. */
  Hammersley(index: number, count: number): Vector2 {
    if (!Number.isInteger(index)) throw new TypeError("index must be an integer");
    if (!Number.isInteger(count)) throw new TypeError("count must be an integer");
    const point = atmosphere().hammersleyPoint(index, count);
    return new Vector2(point.X, point.Y);
  },

  /** One sequence point turned into a GGX half-vector around a normal. */
  ImportanceSampleGgx(x: number, y: number, normal: Vector3, roughness: number): Vector3 {
    for (const [name, value] of [["x", x], ["y", y], ["roughness", roughness]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return toVector3(atmosphere().importanceSampleGgx(
      x, y, vectorSnapshot(normal, "normal"), roughness,
    ));
  },

  /** The direction one texel of one cube face looks along. */
  FaceDirection(face: CubeMapFace, u: number, v: number): Vector3 {
    if (!Number.isInteger(face)) throw new TypeError("face must be a CubeMapFace");
    for (const [name, value] of [["u", u], ["v", v]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return toVector3(atmosphere().cubeFaceDirection(face, u, v));
  },

  /** And the mapping back: where a direction falls on an equirectangular panorama. */
  DirectionToEquirectangular(direction: Vector3): Vector2 {
    const point = atmosphere().directionToEquirectangular(
      vectorSnapshot(direction, "direction"),
    );
    return new Vector2(point.X, point.Y);
  },
} as const;


/* --- the other three shadow passes --------------------------------------------------------------
 *
 * {@link ShadowMap} is one map for one directional light. These are the other three shapes a game
 * needs: {@link CascadedShadowMap} splits a directional light's view across several maps so the
 * near ground gets the texels it deserves, {@link SpotShadowMap} is one perspective map down a
 * cone, and {@link CubeShadowMap} is six faces around a point light.
 *
 * The maths behind all three is already on {@link ShadowMapMath}, and it is pure — no device, no
 * pass. That is what makes these checkable: a cascade's split distances have to be the ones
 * `ComputeCascadeSplitDistances` returns for the same camera, and a spot map's light
 * view-projection has to be `ComputeSpotLightView` times `ComputeSpotLightProjection` for the same
 * light. Two routes, one identity, and the multiplication done by the caller.
 */

/** A point light: a position, a colour and a radius, with no direction and no cone. */
export interface PointLight {
  readonly Position: Vector3;
  /** Linear RGB, not an XNA `Color`. */
  readonly Color: Vector3;
  readonly Intensity: number;
  /** The distance at which it stops contributing. */
  readonly Range: number;
}

/** A spot light: a point light with a direction and a cone, both angles in radians. */
export interface SpotLight extends PointLight {
  readonly Direction: Vector3;
  readonly InnerAngle: number;
  readonly OuterAngle: number;
}

function pointLightSnapshot(light: PointLight, what: string): {
  Position: { X: number; Y: number; Z: number };
  Color: { X: number; Y: number; Z: number };
  Intensity: number;
  Range: number;
  CastsShadows: boolean;
} {
  if (light == null) throw new TypeError(`${what} is required`);
  for (const [name, value] of [
    ["Intensity", light.Intensity], ["Range", light.Range],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${what}.${name} must be a finite number`);
    }
  }
  return {
    Position: vectorSnapshot(light.Position, `${what}.Position`),
    Color: vectorSnapshot(light.Color, `${what}.Color`),
    Intensity: light.Intensity,
    Range: light.Range,
    // These lights are the shadow pass's own subject, so of course they cast; the flag exists for
    // the clustered light set, where a light may be in the scene without asking for a map.
    CastsShadows: true,
  };
}

function spotLightSnapshot(light: SpotLight, what: string): {
  Position: { X: number; Y: number; Z: number };
  Direction: { X: number; Y: number; Z: number };
  Color: { X: number; Y: number; Z: number };
  Intensity: number;
  Range: number;
  InnerAngle: number;
  OuterAngle: number;
  CastsShadows: boolean;
} {
  const point = pointLightSnapshot(light, what);
  for (const [name, value] of [
    ["InnerAngle", light.InnerAngle], ["OuterAngle", light.OuterAngle],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${what}.${name} must be a finite number`);
    }
  }
  return {
    ...point,
    Direction: vectorSnapshot(light.Direction, `${what}.Direction`),
    InnerAngle: light.InnerAngle,
    OuterAngle: light.OuterAngle,
  };
}

/**
 * A directional light's shadow, split into several maps by distance.
 *
 * One map over a whole outdoor view spends most of its texels where nothing is looked at closely.
 * A cascade splits the camera's depth range and gives each slice its own map, so the near ground
 * gets the resolution and the far hills get what is left.
 *
 * {@link Update} recomputes every cascade from a light and a camera, and then each cascade is
 * rendered in its own {@link Begin}/{@link End}. The split distances it chooses are
 * {@link ShadowMapMath.ComputeCascadeSplitDistances} for the same camera and the same
 * {@link SplitLambda}, which is a pure route touching no map at all.
 */
export class CascadedShadowMap implements IDisposable {
  readonly #backend: CnaShadowBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;
  #casterEffect: Effect | null = null;
  #shadowTexture: Texture2D | null = null;

  public constructor(
    graphicsDevice: GraphicsDevice, quality: ShadowQuality, cascadeCount: number,
  ) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isInteger(cascadeCount)) {
      throw new TypeError("cascadeCount must be an integer");
    }
    this.#backend = shadows();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createCascadedShadowMap(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), shadowQuality(quality),
      cascadeCount,
    );
  }

  /** Whether the map has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the cascaded shadow map is disposed");
    }
    return this.#handle;
  }

  /** Whether this renderer can actually render into it. */
  public get IsSupported(): boolean {
    return this.#backend.isCascadedShadowMapSupported(this.#active());
  }

  /** How many cascades it holds, which CNA clamped into its own range at construction. */
  public get CascadeCount(): number {
    return this.#backend.getCascadeCount(this.#active());
  }

  /** Each cascade's own texture is this square, which the quality tier chose. */
  public get CascadeSize(): number {
    return this.#backend.getCascadeSize(this.#active());
  }

  /**
   * How the camera's depth range is divided: zero splits it evenly, one splits it
   * logarithmically, and the values between mix the two.
   */
  public get SplitLambda(): number {
    return this.#backend.getCascadeSplitLambda(this.#active());
  }
  public set SplitLambda(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("SplitLambda must be a finite number");
    }
    this.#backend.setCascadeSplitLambda(this.#active(), value);
  }

  /** How wide the fade between one cascade and the next is, so the seam does not show. */
  public get BlendBand(): number {
    return this.#backend.getCascadeBlendBand(this.#active());
  }
  public set BlendBand(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("BlendBand must be a finite number");
    }
    this.#backend.setCascadeBlendBand(this.#active(), value);
  }

  /** Whether each cascade tints what it lights, which is how a cascade split is looked at. */
  public get IsDebugTintEnabled(): boolean {
    return this.#backend.isCascadeDebugTintEnabled(this.#active());
  }
  public set IsDebugTintEnabled(value: boolean) {
    this.#backend.setCascadeDebugTintEnabled(this.#active(), value === true);
  }

  /** Recomputes every cascade's split, centre and transform from a light and a camera. */
  public Update(light: DirectionalLight, cameraView: Matrix, cameraProjection: Matrix): void {
    if (light == null) throw new TypeError("light is required");
    if (typeof light.Intensity !== "number" || !Number.isFinite(light.Intensity)) {
      throw new TypeError("a light's Intensity must be a finite number");
    }
    this.#backend.updateCascadedShadowMap(
      this.#active(),
      {
        Direction: vectorSnapshot(light.Direction, "light.Direction"),
        Color: vectorSnapshot(light.Color, "light.Color"),
        Intensity: light.Intensity,
      },
      matrixValues(cameraView, "cameraView"), matrixValues(cameraProjection, "cameraProjection"),
    );
  }

  /** Opens one cascade's depth pass. Apply {@link CasterEffect} before drawing into it. */
  public Begin(cascadeIndex: number): void {
    if (!Number.isInteger(cascadeIndex)) {
      throw new TypeError("cascadeIndex must be an integer");
    }
    this.#backend.beginCascadedShadowPass(this.#active(), cascadeIndex);
  }

  /** Closes the open cascade and restores the frame's previous target. */
  public End(): void { this.#backend.endCascadedShadowPass(this.#active()); }

  /** One cascade's light view-projection, which a shader needs to sample that slice. */
  public GetCascadeMatrix(cascadeIndex: number): Matrix {
    if (!Number.isInteger(cascadeIndex)) {
      throw new TypeError("cascadeIndex must be an integer");
    }
    return toMatrix(this.#backend.getCascadeMatrix(this.#active(), cascadeIndex));
  }

  /** Where one cascade stops, in view depth. */
  public GetSplitDistance(cascadeIndex: number): number {
    if (!Number.isInteger(cascadeIndex)) {
      throw new TypeError("cascadeIndex must be an integer");
    }
    return this.#backend.getCascadeSplitDistance(this.#active(), cascadeIndex);
  }

  /** Which cascade covers a view depth. The answer a receiver's shader needs per pixel. */
  public SelectCascade(viewDepth: number): number {
    if (typeof viewDepth !== "number" || !Number.isFinite(viewDepth)) {
      throw new TypeError("viewDepth must be a finite number");
    }
    return this.#backend.selectCascade(this.#active(), viewDepth);
  }

  /** Hands every cascade's matrix, split and texture to an effect that shades receivers. */
  public ApplyToReceiver(effect: Effect): void {
    if (effect == null) throw new TypeError("effect is required");
    this.#backend.applyCascadesToReceiver(
      this.#active(), resolveEffectHandleForInternalUse(effect),
    );
  }

  /**
   * The rigid caster program, borrowed on the same counted terms {@link ShadowMap} lends its own.
   *
   * Taken once and given back by {@link Dispose}; a renderer that cannot cast lends nothing and
   * this refuses by name rather than wrapping the invalid handle CNA answers with.
   */
  public get CasterEffect(): Effect {
    this.#casterEffect ??= borrowCasterEffectForInternalUse(
      this.#device, this.#backend.getCascadedCasterEffect(this.#active()),
      "cascaded shadow caster effect", "CascadedShadowMap.IsSupported",
    );
    return this.#casterEffect;
  }

  /** The atlas every cascade renders into, borrowed on the same terms. */
  public get ShadowTexture(): Texture2D {
    this.#shadowTexture ??= borrowNativeTextureForInternalUse(
      this.#device, this.#backend.getCascadedShadowTexture(this.#active()),
      "CascadedShadowMap depth texture",
    );
    return this.#shadowTexture;
  }

  /** Releases the map. Every borrow goes back first, and disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#casterEffect?.Dispose();
    this.#casterEffect = null;
    this.#shadowTexture?.Dispose();
    this.#shadowTexture = null;
    this.#backend.destroyCascadedShadowMap(handle);
  }

  /**
   * Moves a cascade's centre onto its own texel grid.
   *
   * A pure function of its arguments, and the reason a cascade does not shimmer: a centre that
   * moves by a fraction of a texel as the camera moves makes every shadow edge crawl, so it is
   * quantised to whole texels of the map it will be rendered into.
   */
  public static SnapToTexelGrid(centre: Vector3, radius: number, cascadeSize: number): Vector3 {
    if (typeof radius !== "number" || !Number.isFinite(radius)) {
      throw new TypeError("radius must be a finite number");
    }
    if (!Number.isInteger(cascadeSize)) throw new TypeError("cascadeSize must be an integer");
    return toVector3(shadows().snapCascadeToTexelGrid(
      vectorSnapshot(centre, "centre"), radius, cascadeSize,
    ));
  }
}

/**
 * A spot light's shadow: one perspective map down its own cone.
 *
 * {@link Begin} takes the light itself rather than a matrix, and the transform it computes is
 * {@link ShadowMapMath.ComputeSpotLightView} times {@link ShadowMapMath.ComputeSpotLightProjection}
 * for that light — two pure routes that touch no map, so a caller can check the pass against them.
 */
export class SpotShadowMap implements IDisposable {
  readonly #backend: CnaShadowBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;
  #casterEffect: Effect | null = null;
  #shadowTexture: Texture2D | null = null;

  public constructor(graphicsDevice: GraphicsDevice, quality: ShadowQuality) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = shadows();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createSpotShadowMap(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), shadowQuality(quality),
    );
  }

  /** Whether the map has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the spot shadow map is disposed");
    return this.#handle;
  }

  /** Whether this renderer can actually render into it. */
  public get IsSupported(): boolean {
    return this.#backend.isSpotShadowMapSupported(this.#active());
  }

  /** The tier it was created at, and the square its texture is. */
  public get Quality(): ShadowQuality {
    return this.#backend.getSpotShadowQuality(this.#active()) as ShadowQuality;
  }
  public get Size(): number { return this.#backend.getSpotShadowSize(this.#active()); }

  /** The depth bias that keeps a surface from shadowing itself. */
  public get DepthBias(): number {
    return this.#backend.getSpotShadowDepthBias(this.#active());
  }
  public set DepthBias(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("DepthBias must be a finite number");
    }
    this.#backend.setSpotShadowDepthBias(this.#active(), value);
  }

  /** Where the light stood when the pass was last opened, and how far it reaches. */
  public get LightPosition(): Vector3 {
    return toVector3(this.#backend.getSpotShadowLightPosition(this.#active()));
  }
  public get LightRange(): number {
    return this.#backend.getSpotShadowLightRange(this.#active());
  }

  /** The combined transform the pass rendered with, which a receiver's shader samples through. */
  public get LightViewProjection(): Matrix {
    return toMatrix(this.#backend.getSpotShadowLightViewProjection(this.#active()));
  }

  /** Opens the depth pass for one spot light, binding and clearing its map. */
  public Begin(light: SpotLight): void {
    this.#backend.beginSpotShadowPass(this.#active(), spotLightSnapshot(light, "light"));
  }

  /** Closes the pass and restores the frame's previous target. */
  public End(): void { this.#backend.endSpotShadowPass(this.#active()); }

  /** The rigid caster program, borrowed and returned on {@link ShadowMap}'s terms. */
  public get CasterEffect(): Effect {
    this.#casterEffect ??= borrowCasterEffectForInternalUse(
      this.#device, this.#backend.getSpotShadowCasterEffect(this.#active()),
      "spot shadow caster effect", "SpotShadowMap.IsSupported",
    );
    return this.#casterEffect;
  }

  /** The depth texture the pass wrote, borrowed on the same terms. */
  public get ShadowTexture(): Texture2D {
    this.#shadowTexture ??= borrowNativeTextureForInternalUse(
      this.#device, this.#backend.getSpotShadowTexture(this.#active()),
      "SpotShadowMap depth texture",
    );
    return this.#shadowTexture;
  }

  /** Releases the map. Every borrow goes back first, and disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#casterEffect?.Dispose();
    this.#casterEffect = null;
    this.#shadowTexture?.Dispose();
    this.#shadowTexture = null;
    this.#backend.destroySpotShadowMap(handle);
  }
}

/**
 * A point light's shadow: six faces around it, rendered one at a time.
 *
 * {@link Update} places the light; each face then gets its own {@link Begin}/{@link End}, and the
 * camera for face *n* is {@link ShadowMapMath.ComputeCubeFaceView} at that position with
 * {@link ShadowMapMath.ComputeCubeFaceProjection} for that range — pure routes a caller can check
 * the pass against.
 */
export class CubeShadowMap implements IDisposable {
  readonly #backend: CnaShadowBackend;
  readonly #device: GraphicsDevice;
  #handle: NativeHandle | null;
  #casterEffect: Effect | null = null;
  #shadowTexture: TextureCube | null = null;

  public constructor(graphicsDevice: GraphicsDevice, quality: ShadowQuality) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = shadows();
    this.#device = graphicsDevice;
    this.#handle = this.#backend.createCubeShadowMap(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), shadowQuality(quality),
    );
  }

  /** Whether the map has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the cube shadow map is disposed");
    return this.#handle;
  }

  /** Whether this renderer can actually render into it. */
  public get IsSupported(): boolean {
    return this.#backend.isCubeShadowMapSupported(this.#active());
  }

  /**
   * The tier it was created at, and the square each of its six faces is.
   *
   * A cube map's face is smaller than a flat map's at the same tier, because it is paying for six
   * of them; {@link ShadowMapMath.CubeSizeForQuality} is the number without an object.
   */
  public get Quality(): ShadowQuality {
    return this.#backend.getCubeShadowQuality(this.#active()) as ShadowQuality;
  }
  public get Size(): number { return this.#backend.getCubeShadowSize(this.#active()); }

  /** The depth bias that keeps a surface from shadowing itself. */
  public get DepthBias(): number {
    return this.#backend.getCubeShadowDepthBias(this.#active());
  }
  public set DepthBias(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("DepthBias must be a finite number");
    }
    this.#backend.setCubeShadowDepthBias(this.#active(), value);
  }

  /** Where the light stands, and how far it reaches. */
  public get LightPosition(): Vector3 {
    return toVector3(this.#backend.getCubeShadowLightPosition(this.#active()));
  }
  public get LightRange(): number {
    return this.#backend.getCubeShadowLightRange(this.#active());
  }

  /** Places the light. Every face's camera follows from its position and its range. */
  public Update(light: PointLight): void {
    this.#backend.updateCubeShadowMap(this.#active(), pointLightSnapshot(light, "light"));
  }

  /** Opens one face's depth pass. */
  public Begin(face: CubeMapFace): void {
    if (!Number.isInteger(face)) throw new TypeError("face must be a CubeMapFace");
    this.#backend.beginCubeShadowPass(this.#active(), face);
  }

  /** Closes the open face and restores the frame's previous target. */
  public End(): void { this.#backend.endCubeShadowPass(this.#active()); }

  /** The rigid caster program, borrowed and returned on {@link ShadowMap}'s terms. */
  public get CasterEffect(): Effect {
    this.#casterEffect ??= borrowCasterEffectForInternalUse(
      this.#device, this.#backend.getCubeShadowCasterEffect(this.#active()),
      "cube shadow caster effect", "CubeShadowMap.IsSupported",
    );
    return this.#casterEffect;
  }

  /**
   * The cube's depth storage, borrowed on the same terms — and a `TextureCube` rather than a
   * `Texture2D`, because six faces of depth is what a point light's shadow is.
   *
   * CNA lends it as a counted borrow whose release is the cube-texture one, not the render-target
   * one the flat maps use. Getting that wrong is not a type error anywhere: the handle releases,
   * the borrow does not, and the game refuses to shut down afterwards.
   */
  public get ShadowTexture(): TextureCube {
    this.#shadowTexture ??= adoptNativeTextureCubeForInternalUse(
      this.#device, this.#backend.getCubeShadowTexture(this.#active()),
      "CubeShadowMap depth cube",
    );
    return this.#shadowTexture;
  }

  /** Releases the map. Every borrow goes back first, and disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#casterEffect?.Dispose();
    this.#casterEffect = null;
    this.#shadowTexture?.Dispose();
    this.#shadowTexture = null;
    this.#backend.destroyCubeShadowMap(handle);
  }
}


/* --- the rest of the post-process chain -----------------------------------------------------------
 *
 * Seven more passes for the chain that already carries blit, bloom, tonemapping, FXAA, SSAO and
 * screen-space reflections, plus the pass that runs a game's *own* effect inside it, the colour
 * lookup table those passes grade through, and the two lower-level pieces the whole layer is built
 * on: a fullscreen quad and a scoped render-target binding.
 *
 * Most of what these carry is settings, and settings that only round-trip are worth little. What
 * makes them checkable is that several also publish the pure function behind them — a circle of
 * confusion from the thin-lens equation, a bloom's extraction curve, a tonemapping curve, the SSAO
 * kernel — so the arithmetic a shader runs can be evaluated without a GPU and compared with what
 * the frame actually shows.
 */

/** How a colour lookup table is sampled between its entries. */
export enum LutInterpolation {
  /** Eight corners weighted by distance: the ordinary cube filter. */
  Trilinear = 0,
  /** Four corners of the tetrahedron the sample falls in, which keeps a neutral axis neutral. */
  Tetrahedral = 1,
}

/** Whether the ASCII effect keeps the scene's colour or reduces it to black and white. */
export enum AsciiQuantizeMode {
  BlackWhite = 0,
  Color = 1,
}

/** The shadow-mask pattern a CRT effect lays over the image. */
export enum CrtMaskType {
  None = 0,
  ApertureGrille = 1,
  ShadowMask = 2,
}

/** The colour depth a depth effect reduces the image to. */
export enum DepthEffectMode {
  Color16Bit = 0,
  Color8Bit = 1,
  Grayscale4Bit = 2,
  Grayscale2Bit = 3,
  Grayscale1Bit = 4,
  Palette256 = 5,
  Palette16 = 6,
}

/** The ordered pattern a depth effect dithers with, or none. */
export enum DitherMode {
  None = 0,
  Bayer4X4 = 1,
  Bayer8X8 = 2,
}

/**
 * Grades the frame through a colour lookup table.
 *
 * The table is either a **strip** — a 2D texture holding the cube's slices side by side, which any
 * renderer can sample — or a **volume**, a real 3D texture, which is one lookup instead of two and
 * needs volume-texture support. Set whichever the renderer has; the pass takes both and prefers the
 * volume.
 */
export class ColorGradePass extends PostProcessPass {
  readonly #device: GraphicsDevice;

  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createColorGradePass(postProcessDeviceHandle(graphicsDevice)));
    this.#device = graphicsDevice;
  }

  /** How far the graded result is mixed over the original, from none to all of it. */
  public get Strength(): number {
    return extensions().getColorGradeStrength(this.HandleForInternalUse);
  }
  public set Strength(value: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Strength must be a finite number");
    }
    extensions().setColorGradeStrength(this.HandleForInternalUse, value);
  }

  /** How the table is sampled between its entries. */
  public get Interpolation(): LutInterpolation {
    return extensions().getColorGradeInterpolation(this.HandleForInternalUse) as LutInterpolation;
  }
  public set Interpolation(value: LutInterpolation) {
    if (!Number.isInteger(value)) throw new TypeError("Interpolation must be a LutInterpolation");
    extensions().setColorGradeInterpolation(this.HandleForInternalUse, value);
  }

  /** Whether a strip table is attached. */
  public get HasLut(): boolean {
    return this.#releaseBorrow(
      extensions().getColorGradeLut(this.HandleForInternalUse),
      (handle) => graphicsBackendFor(this.#device).destroyRenderTarget(handle),
    );
  }

  /** Whether a volume table is attached. */
  public get HasVolumeLut(): boolean {
    return this.#releaseBorrow(
      extensions().getColorGradeVolumeLut(this.HandleForInternalUse),
      (handle) => graphicsBackendFor(this.#device).destroyTexture3D(handle),
    );
  }

  /*
   * Both getters mint a handle onto the pass's own texture rather than handing back the one that
   * was set, so each is taken, tested and given straight back -- the same rule
   * `Skybox.HasEnvironment` follows, and for the same reason.
   *
   * They do not mint the same kind of handle, which is why the release route is a parameter rather
   * than a constant: a strip comes back as a borrowed render target and a volume as a Texture3D,
   * and releasing either through the other's route is refused with `INVALID_HANDLE` -- which is
   * how the difference was found.
   */
  #releaseBorrow(handle: NativeHandle, release: (handle: NativeHandle) => void): boolean {
    if (handle === 0n) return false;
    release(handle);
    return true;
  }

  /** Attaches a strip table, borrowed and never owned, or `null` to detach. */
  public SetLut(lut: Texture2D | null): void {
    extensions().setColorGradeLut(
      this.HandleForInternalUse,
      lut == null ? 0n : resolveTexture2DHandleForInternalUse(lut),
    );
  }

  /** Attaches a volume table on the same terms. */
  public SetVolumeLut(lut: Texture3D | null): void {
    extensions().setColorGradeVolumeLut(
      this.HandleForInternalUse,
      lut == null ? 0n : resolveTexture3DHandleForInternalUse(lut),
    );
  }

  /**
   * A neutral strip table of a given cube size, which grades nothing and is what a game starts from.
   */
  public static CreateIdentityLut(graphicsDevice: GraphicsDevice, size: number): Texture2D {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError("size must be a positive integer");
    }
    return adoptNativeTexture2DForInternalUse(
      graphicsDevice,
      extensions().createIdentityLutTexture(
        resolveGraphicsDeviceHandleForInternalUse(graphicsDevice), size,
      ),
      "colour grading identity lookup table",
    );
  }

  /**
   * The cube size a strip of these pixel dimensions carries, or zero when they are not a strip.
   *
   * A strip is the cube's slices in a row, so its width is the cube size squared and its height is
   * the cube size. Anything else is not a lookup table, and this says so rather than guessing.
   */
  public static LutSizeForStrip(width: number, height: number): number {
    for (const [name, value] of [["width", width], ["height", height]] as const) {
      if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
    }
    return extensions().lutSizeForStrip(width, height);
  }
}

/**
 * A parsed `.cube` colour lookup table.
 *
 * The format Resolve, Photoshop and every grading tool exports: a title, a domain, and one RGB
 * triple per cube entry in blue-slowest order. This parses the **text**, not a path — a game reads
 * the bytes however it reads its other content, and a build script that wants a file on disk
 * belongs in `cna-ts-content`, which is where this package puts every route that takes a path.
 */
export class CubeLut implements IDisposable {
  #handle: NativeHandle | null;

  private constructor(handle: NativeHandle) { this.#handle = handle; }

  /** Parses the text of a `.cube` file. */
  public static Parse(text: string): CubeLut {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    return new (CubeLut as unknown as new (handle: NativeHandle) => CubeLut)(
      extensions().parseCubeLut(text),
    );
  }

  /** Whether the table has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the colour lookup table is disposed");
    return this.#handle;
  }

  /** The cube's edge length: a table of this size holds size cubed entries. */
  public get Size(): number { return extensions().getCubeLutSize(this.#active()); }

  /** The title the file declared, or an empty string where it declared none. */
  public get Title(): string { return extensions().getCubeLutTitle(this.#active()); }

  /** The input range the table is defined over, which is usually but not always zero to one. */
  public get DomainMin(): Vector3 {
    return toVector3(extensions().getCubeLutDomainMin(this.#active()));
  }
  public get DomainMax(): Vector3 {
    return toVector3(extensions().getCubeLutDomainMax(this.#active()));
  }

  /** Whether that range is exactly zero to one, which is the case a shader can skip a rescale in. */
  public get IsUnitDomain(): boolean {
    return extensions().isCubeLutUnitDomain(this.#active());
  }

  /** One entry of the cube, by its three axis indices. */
  public GetEntry(red: number, green: number, blue: number): Vector3 {
    for (const [name, value] of [["red", red], ["green", green], ["blue", blue]] as const) {
      if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
    }
    return toVector3(extensions().getCubeLutEntry(this.#active(), red, green, blue));
  }

  /** The table as a strip texture the caller owns: the cube's slices side by side. */
  public CreateStripTexture(graphicsDevice: GraphicsDevice): Texture2D {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return adoptNativeTexture2DForInternalUse(
      graphicsDevice,
      extensions().createCubeLutStripTexture(
        this.#active(), resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      ),
      "colour lookup table strip",
    );
  }

  /** The table as a volume texture the caller owns, where the renderer has 3D textures. */
  public CreateVolumeTexture(graphicsDevice: GraphicsDevice): Texture3D {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return adoptNativeTexture3DForInternalUse(
      graphicsDevice,
      extensions().createCubeLutVolumeTexture(
        this.#active(), resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      ),
    );
  }

  /** Releases the table. The textures it produced are the caller's and outlive it. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    extensions().destroyCubeLut(handle);
  }
}

/**
 * Blurs what is not in focus, from a real lens rather than from a curve.
 *
 * The four settings are the ones a photographer has: where the lens is focused, how long it is,
 * how wide its aperture is, and the largest blur the pass will draw.
 * {@link CircleOfConfusionMillimetres} is the thin-lens equation behind them, on the CPU.
 */
export class DepthOfFieldPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createDepthOfFieldPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** The distance the lens is focused at, in world units. */
  public get FocusDistance(): number {
    return extensions().getDepthOfFieldFocusDistance(this.HandleForInternalUse);
  }
  public set FocusDistance(value: number) {
    extensions().setDepthOfFieldFocusDistance(this.HandleForInternalUse, finite(value, "FocusDistance"));
  }

  /** The lens's focal length, in millimetres. */
  public get FocalLength(): number {
    return extensions().getDepthOfFieldFocalLength(this.HandleForInternalUse);
  }
  public set FocalLength(value: number) {
    extensions().setDepthOfFieldFocalLength(this.HandleForInternalUse, finite(value, "FocalLength"));
  }

  /** The aperture, as the f-number engraved on a lens: smaller is wider and blurs more. */
  public get FNumber(): number {
    return extensions().getDepthOfFieldFNumber(this.HandleForInternalUse);
  }
  public set FNumber(value: number) {
    extensions().setDepthOfFieldFNumber(this.HandleForInternalUse, finite(value, "FNumber"));
  }

  /** The largest blur radius the pass will draw, in texels. */
  public get MaxRadius(): number {
    return extensions().getDepthOfFieldMaxRadius(this.HandleForInternalUse);
  }
  public set MaxRadius(value: number) {
    extensions().setDepthOfFieldMaxRadius(this.HandleForInternalUse, finite(value, "MaxRadius"));
  }

  /**
   * How large a point at `depth` is on the sensor, in millimetres — the thin-lens circle of
   * confusion.
   *
   * Zero exactly at the focus distance, and growing on both sides of it: a point nearer than the
   * focus and a point further away are both blurred, which is what makes this the pure function
   * behind the pass rather than a distance falloff.
   */
  public static CircleOfConfusionMillimetres(
    depth: number, focusDistance: number, focalLength: number, fNumber: number,
  ): number {
    for (const [name, value] of [
      ["depth", depth], ["focusDistance", focusDistance],
      ["focalLength", focalLength], ["fNumber", fNumber],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return extensions().circleOfConfusionMillimetres(depth, focusDistance, focalLength, fNumber);
  }
}

/** The streaks and ghosts a bright source leaves across a lens. */
export class LensFlarePass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createLensFlarePass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** The luminance above which a texel becomes a flare source. */
  public get Threshold(): number {
    return extensions().getLensFlareThreshold(this.HandleForInternalUse);
  }
  public set Threshold(value: number) {
    extensions().setLensFlareThreshold(this.HandleForInternalUse, finite(value, "Threshold"));
  }

  /** How strongly the ghosts are added back over the frame. */
  public get Intensity(): number {
    return extensions().getLensFlareIntensity(this.HandleForInternalUse);
  }
  public set Intensity(value: number) {
    extensions().setLensFlareIntensity(this.HandleForInternalUse, finite(value, "Intensity"));
  }

  /** How far apart the ghosts are spaced along the line through the screen's centre. */
  public get Dispersal(): number {
    return extensions().getLensFlareDispersal(this.HandleForInternalUse);
  }
  public set Dispersal(value: number) {
    extensions().setLensFlareDispersal(this.HandleForInternalUse, finite(value, "Dispersal"));
  }

  /** How many ghost images the pass draws, which is CNA's own number rather than one chosen here. */
  public static get GhostCount(): number { return 4; }
}

/** Smears the frame along the velocity the prepass recorded. */
export class MotionBlurPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createMotionBlurPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** How much of the recorded velocity is drawn as a smear. */
  public get Strength(): number {
    return extensions().getMotionBlurStrength(this.HandleForInternalUse);
  }
  public set Strength(value: number) {
    extensions().setMotionBlurStrength(this.HandleForInternalUse, finite(value, "Strength"));
  }

  /** The furthest a texel is smeared, in UV units, whatever the velocity says. */
  public get MaxDistance(): number {
    return extensions().getMotionBlurMaxDistance(this.HandleForInternalUse);
  }
  public set MaxDistance(value: number) {
    extensions().setMotionBlurMaxDistance(this.HandleForInternalUse, finite(value, "MaxDistance"));
  }

  /** How many samples the pass takes along the velocity vector. CNA's number, not one chosen here. */
  public static get SampleCount(): number { return 8; }
}

/** Splits the channels apart towards the edges of the frame, as a real lens does. */
export class ChromaticAberrationPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createChromaticAberrationPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** How far the channels are pushed apart at the corners. */
  public get Strength(): number {
    return extensions().getChromaticAberrationStrength(this.HandleForInternalUse);
  }
  public set Strength(value: number) {
    extensions().setChromaticAberrationStrength(
      this.HandleForInternalUse, finite(value, "Strength"),
    );
  }
}

/** Adds film grain over the frame. */
export class FilmGrainPass extends PostProcessPass {
  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createFilmGrainPass(postProcessDeviceHandle(graphicsDevice)));
  }

  /** How visible the grain is. */
  public get Intensity(): number {
    return extensions().getFilmGrainIntensity(this.HandleForInternalUse);
  }
  public set Intensity(value: number) {
    extensions().setFilmGrainIntensity(this.HandleForInternalUse, finite(value, "Intensity"));
  }
}

/**
 * Redraws the frame as a grid of characters.
 *
 * The pass is a thin wrapper over {@link AsciiPostProcessEffect}, which it lends: the settings live
 * on the effect, and the pass exists so the whole thing can go in a chain.
 */
export class AsciiPass extends PostProcessPass {
  readonly #device: GraphicsDevice;

  public constructor(graphicsDevice: GraphicsDevice) {
    super(extensions().createAsciiPass(postProcessDeviceHandle(graphicsDevice)));
    this.#device = graphicsDevice;
  }

  /**
   * The effect this pass draws with, borrowed from it.
   *
   * Borrowed rather than owned: the pass keeps it, and the object handed back must not be disposed.
   * Its settings are the pass's settings.
   */
  public get Effect(): AsciiPostProcessEffect {
    this.#effect ??= adoptAsciiEffect(
      this.#device, extensions().getAsciiPassEffect(this.HandleForInternalUse), true,
    );
    return this.#effect;
  }

  #effect: AsciiPostProcessEffect | null = null;

  /** Releases the pass, and the borrow of its effect first. */
  public override Dispose(): void {
    this.#effect?.Dispose();
    this.#effect = null;
    super.Dispose();
  }
}

/**
 * A pass that runs a game's **own** compiled effect over the frame.
 *
 * The escape hatch the chain needs: everything else in this layer is a pass CNA wrote, and this is
 * the one that runs a shader the game wrote, inside the same chain, with the same pooled targets
 * and the same GPU timings. The effect is borrowed by default and can be handed over instead.
 */
export class EffectPass extends PostProcessPass {
  #device: GraphicsDevice;

  public constructor(graphicsDevice: GraphicsDevice, effect: Effect, name: string);
  public constructor(
    graphicsDevice: GraphicsDevice, effect: Effect, name: string, owning?: boolean,
  ) {
    super(EffectPass.#create(graphicsDevice, effect, name, owning === true));
    this.#device = graphicsDevice;
  }

  static #create(
    graphicsDevice: GraphicsDevice, effect: Effect, name: string, owning: boolean,
  ): NativeHandle {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    if (effect == null) throw new TypeError("effect is required");
    if (typeof name !== "string") throw new TypeError("name must be a string");
    const device = postProcessDeviceHandle(graphicsDevice);
    const handle = resolveEffectHandleForInternalUse(effect);
    return owning
      ? extensions().createOwningEffectPass(device, handle, name)
      : extensions().createEffectPass(device, handle, name);
  }

  /**
   * A pass that **takes** the effect rather than borrowing it, releasing it with the pass.
   *
   * The caller's `Effect` stops being an owner, exactly as `PostProcessChain.AddOwned` does with a
   * pass — named for the transfer rather than hidden behind a flag.
   */
  public static CreateOwning(
    graphicsDevice: GraphicsDevice, effect: Effect, name: string,
  ): EffectPass {
    const pass = new (EffectPass as unknown as new (
      graphicsDevice: GraphicsDevice, effect: Effect, name: string, owning: boolean,
    ) => EffectPass)(graphicsDevice, effect, name, true);
    markEffectTransferredForInternalUse(effect);
    return pass;
  }

  /**
   * Whether an effect is attached at all. A pass with none copies its source unchanged.
   *
   * CNA mints a *fresh borrow handle* here rather than echoing one it already holds — despite the
   * header saying not to destroy it — so the handle is released immediately. Releasing a borrow
   * does not touch the effect behind it; leaving one outstanding keeps the pass alive and makes the
   * game refuse to be destroyed. See finding 17 in `docs/upstream-cna-findings.md`.
   */
  public get HasEffect(): boolean {
    const handle = extensions().getEffectPassEffect(this.HandleForInternalUse);
    if (handle === 0n) return false;
    effectBackendFor(this.#device).destroyEffect(handle);
    return true;
  }

  /** Replaces the effect, borrowed as the constructor's is, or `null` to run none. */
  public SetEffect(effect: Effect | null): void {
    extensions().setEffectPassEffect(
      this.HandleForInternalUse,
      effect == null ? 0n : resolveEffectHandleForInternalUse(effect),
    );
  }
}

/**
 * The fullscreen quad every screen-space pass in this layer is drawn with.
 *
 * Exposed because a game writing its own screen-space effect wants the same quad rather than a
 * second one: the same vertex program, the same texture coordinates, and the same choice between
 * drawing into a named target and drawing over whatever is bound.
 */
export class FullscreenPass implements IDisposable {
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#handle = extensions().createFullscreenPass(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
  }

  /** Whether the pass has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the fullscreen pass is disposed");
    return this.#handle;
  }

  /**
   * Draws `source` into `destination`, or into the back buffer when that is `null`.
   *
   * `effect` may be `null`, in which case the source is copied through the layer's own blit
   * program. The size is the destination's in pixels.
   */
  public Draw(
    source: Texture2D, destination: RenderTarget2D | null, effect: Effect | null,
    width: number, height: number,
  ): void {
    if (source == null) throw new TypeError("source is required");
    assertPositiveCounts({ width, height });
    extensions().drawFullscreenPass(
      this.#active(), resolveTexture2DHandleForInternalUse(source),
      destination == null ? 0n : resolveTexture2DHandleForInternalUse(destination),
      effect == null ? 0n : resolveEffectHandleForInternalUse(effect),
      width, height,
    );
  }

  /** The same, over whatever target is already bound — which is what a pass inside a chain does. */
  public DrawOverCurrentTarget(
    source: Texture2D, effect: Effect | null, width: number, height: number,
  ): void {
    if (source == null) throw new TypeError("source is required");
    assertPositiveCounts({ width, height });
    extensions().drawFullscreenPassOverCurrentTarget(
      this.#active(), resolveTexture2DHandleForInternalUse(source),
      effect == null ? 0n : resolveEffectHandleForInternalUse(effect),
      width, height,
    );
  }

  /** Releases the pass. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    extensions().destroyFullscreenPass(handle);
  }
}

/**
 * Binds a render target and puts back whatever was bound before, on {@link Dispose}.
 *
 * The piece every pass in this layer is written on top of, and the reason a pass that throws does
 * not leave the frame drawing into the wrong place. {@link HasRecordedPrevious} says whether there
 * *was* a previous target to remember — outside a frame there is not, and restoring nothing is the
 * right answer rather than a failure.
 */
export class ScopedRenderTarget implements IDisposable {
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, destination: RenderTarget2D | null) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#handle = extensions().beginScopedRenderTarget(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
      destination == null ? 0n : resolveTexture2DHandleForInternalUse(destination),
    );
  }

  /** Whether the binding has been ended. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  /** Whether there was a target bound before this one, to put back. */
  public get HasRecordedPrevious(): boolean {
    if (this.#handle == null) {
      throw new NativeUnavailableError("the scoped render target has already ended");
    }
    return extensions().scopedRenderTargetHasRecordedPrevious(this.#handle);
  }

  /** Restores the previous target. Ending twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    extensions().endScopedRenderTarget(handle);
  }
}

/**
 * The effect behind {@link AsciiPass}, usable on its own.
 *
 * It reduces the frame to a grid of cells and draws a character per cell. The grid follows from the
 * cell size and the destination rectangle, and {@link LastGridDimensions} reports what the last
 * draw actually used — which is the only way to know, because the rectangle decides it.
 */
export class AsciiPostProcessEffect implements IDisposable {
  #handle: NativeHandle | null;
  readonly #borrowed: boolean;

  public constructor(graphicsDevice: GraphicsDevice);
  public constructor(graphicsDevice: GraphicsDevice, adopted?: NativeHandle, borrowed?: boolean) {
    if (adopted !== undefined) {
      this.#handle = adopted;
      this.#borrowed = borrowed === true;
      return;
    }
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#handle = extensions().createAsciiEffect(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
    this.#borrowed = false;
  }

  /** Whether the effect has been released. */
  public get IsDisposed(): boolean { return this.#handle == null; }

  /**
   * Whether this object points at a pass's own effect rather than one the caller made.
   *
   * It still owns a handle either way — CNA mints a fresh one for the borrow — so {@link Dispose}
   * releases it in both cases. What "borrowed" changes is the *meaning*: changing a borrowed
   * effect's settings changes the pass's, and releasing the handle does not touch the effect
   * behind it.
   */
  public get IsBorrowed(): boolean { return this.#borrowed; }

  #active(): NativeHandle {
    if (this.#handle == null) throw new NativeUnavailableError("the ASCII effect is disposed");
    return this.#handle;
  }

  /** How many texels of the source one character covers. */
  public get CellSize(): { readonly Width: number; readonly Height: number } {
    const size = extensions().getAsciiCellSize(this.#active());
    return Object.freeze({ Width: size.Width, Height: size.Height });
  }

  /** Sets it. A cell of one texel is a character per texel, which is a very large grid. */
  public SetCellSize(width: number, height: number): void {
    assertPositiveCounts({ width, height });
    extensions().setAsciiCellSize(this.#active(), width, height);
  }

  /** Whether the characters keep the scene's colour. */
  public get QuantizeMode(): AsciiQuantizeMode {
    return extensions().getAsciiQuantizeMode(this.#active()) as AsciiQuantizeMode;
  }
  public set QuantizeMode(value: AsciiQuantizeMode) {
    if (!Number.isInteger(value)) throw new TypeError("QuantizeMode must be an AsciiQuantizeMode");
    extensions().setAsciiQuantizeMode(this.#active(), value);
  }

  /** The grid the last {@link Draw} used: the destination divided by the cell size. */
  public get LastGridDimensions(): { readonly Columns: number; readonly Rows: number } {
    const size = extensions().getAsciiLastGridDimensions(this.#active());
    return Object.freeze({ Columns: size.Width, Rows: size.Height });
  }

  /** Draws the source as characters into a rectangle of whatever target is bound. */
  public Draw(source: Texture2D, destination: Rectangle): void {
    if (source == null) throw new TypeError("source is required");
    if (destination == null) throw new TypeError("destination is required");
    extensions().drawAsciiEffect(
      this.#active(), resolveTexture2DHandleForInternalUse(source),
      {
        X: Math.trunc(destination.X), Y: Math.trunc(destination.Y),
        Width: Math.trunc(destination.Width), Height: Math.trunc(destination.Height),
      },
    );
  }

  /**
   * Releases the handle. Disposing twice is harmless.
   *
   * For a borrowed effect this releases the borrow and leaves the pass's own effect alone, which is
   * what CNA's destroy route does with an aliasing handle — and it has to happen, because a borrow
   * left outstanding keeps the pass alive and the game undestroyable.
   */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    extensions().destroyAsciiEffect(handle);
  }
}

function adoptAsciiEffect(
  device: GraphicsDevice, handle: NativeHandle, borrowed: boolean,
): AsciiPostProcessEffect {
  return new (AsciiPostProcessEffect as unknown as new (
    graphicsDevice: GraphicsDevice, adopted: NativeHandle, borrowed: boolean,
  ) => AsciiPostProcessEffect)(device, handle, borrowed);
}

/**
 * A CRT: scanlines, a curved glass, a vignette and a shadow mask.
 *
 * An ordinary `Effect` rather than a pass, so it goes wherever an effect goes — a `SpriteBatch`
 * begin, a {@link FullscreenPass} draw, or an {@link EffectPass} inside a chain.
 */
export class CrtEffect {
  private constructor() { /* created through Create */ }

  /** Makes one, as a real `Effect` the caller owns and disposes. */
  public static Create(graphicsDevice: GraphicsDevice): Effect {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return adoptNativeEffectForInternalUse(
      graphicsDevice, effectBackendFor(graphicsDevice),
      extensions().createCrtEffect(resolveGraphicsDeviceHandleForInternalUse(graphicsDevice)),
    );
  }

  /** How dark the scanlines are. */
  public static GetScanlineIntensity(effect: Effect): number {
    return extensions().getCrtScanlineIntensity(resolveEffectHandleForInternalUse(effect));
  }
  public static SetScanlineIntensity(effect: Effect, value: number): void {
    extensions().setCrtScanlineIntensity(
      resolveEffectHandleForInternalUse(effect), finite(value, "value"),
    );
  }

  /** How much the glass bulges. */
  public static GetCurvature(effect: Effect): number {
    return extensions().getCrtCurvature(resolveEffectHandleForInternalUse(effect));
  }
  public static SetCurvature(effect: Effect, value: number): void {
    extensions().setCrtCurvature(
      resolveEffectHandleForInternalUse(effect), finite(value, "value"),
    );
  }

  /** How dark the corners go. */
  public static GetVignetteIntensity(effect: Effect): number {
    return extensions().getCrtVignetteIntensity(resolveEffectHandleForInternalUse(effect));
  }
  public static SetVignetteIntensity(effect: Effect, value: number): void {
    extensions().setCrtVignetteIntensity(
      resolveEffectHandleForInternalUse(effect), finite(value, "value"),
    );
  }

  /** How strongly the shadow mask shows. */
  public static GetMaskIntensity(effect: Effect): number {
    return extensions().getCrtMaskIntensity(resolveEffectHandleForInternalUse(effect));
  }
  public static SetMaskIntensity(effect: Effect, value: number): void {
    extensions().setCrtMaskIntensity(
      resolveEffectHandleForInternalUse(effect), finite(value, "value"),
    );
  }

  /** Which mask pattern it is. */
  public static GetMaskType(effect: Effect): CrtMaskType {
    return extensions().getCrtMaskType(resolveEffectHandleForInternalUse(effect)) as CrtMaskType;
  }
  public static SetMaskType(effect: Effect, value: CrtMaskType): void {
    if (!Number.isInteger(value)) throw new TypeError("value must be a CrtMaskType");
    extensions().setCrtMaskType(resolveEffectHandleForInternalUse(effect), value);
  }
}

/**
 * Reduces the frame's colour depth, with or without an ordered dither.
 *
 * The other half of the retro pair with {@link CrtEffect}, and an `Effect` on the same terms.
 */
export class DepthEffect {
  private constructor() { /* created through Create */ }

  /** Makes one, as a real `Effect` the caller owns and disposes. */
  public static Create(graphicsDevice: GraphicsDevice): Effect {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    return adoptNativeEffectForInternalUse(
      graphicsDevice, effectBackendFor(graphicsDevice),
      extensions().createDepthEffect(resolveGraphicsDeviceHandleForInternalUse(graphicsDevice)),
    );
  }

  /** Which colour depth the frame is reduced to. */
  public static GetMode(effect: Effect): DepthEffectMode {
    return extensions().getDepthEffectMode(
      resolveEffectHandleForInternalUse(effect),
    ) as DepthEffectMode;
  }
  public static SetMode(effect: Effect, mode: DepthEffectMode): void {
    if (!Number.isInteger(mode)) throw new TypeError("mode must be a DepthEffectMode");
    extensions().setDepthEffectMode(resolveEffectHandleForInternalUse(effect), mode);
  }

  /** Which ordered pattern the reduction dithers with, or none. */
  public static GetDitherMode(effect: Effect): DitherMode {
    return extensions().getDepthEffectDitherMode(
      resolveEffectHandleForInternalUse(effect),
    ) as DitherMode;
  }
  public static SetDitherMode(effect: Effect, mode: DitherMode): void {
    if (!Number.isInteger(mode)) throw new TypeError("mode must be a DitherMode");
    extensions().setDepthEffectDitherMode(resolveEffectHandleForInternalUse(effect), mode);
  }
}

/**
 * The colour a thin film reflects, which is why a soap bubble and an oil slick have colours their
 * materials do not.
 *
 * Light reflected off the top of the film and light reflected off the bottom travel different
 * distances, so some wavelengths cancel and others reinforce — and which ones depends on the angle,
 * which is why the colours move as the surface turns. A pure function of its five arguments, with
 * CNA's own GLSL beside it for the shader that wants the same answer.
 */
export const ThinFilmIridescence = {
  /**
   * The reflectance of a film of `thicknessNanometres` at `cosTheta`, over a base reflectance.
   *
   * `outsideIor` is the medium the light arrives through — 1 for air — and `filmIor` is the film's
   * own. A thickness of zero is no film at all, so the base reflectance comes back unchanged.
   */
  Evaluate(
    outsideIor: number, filmIor: number, cosTheta: number, thicknessNanometres: number,
    baseReflectance: Vector3,
  ): Vector3 {
    for (const [name, value] of [
      ["outsideIor", outsideIor], ["filmIor", filmIor], ["cosTheta", cosTheta],
      ["thicknessNanometres", thicknessNanometres],
    ] as const) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
      }
    }
    return toVector3(extensions().evaluateThinFilmIridescence(
      outsideIor, filmIor, cosTheta, thicknessNanometres,
      vectorSnapshot(baseReflectance, "baseReflectance"),
    ));
  },

  /** CNA's own GLSL for the same model. */
  get Glsl(): string { return extensions().getThinFilmIridescenceGlsl(); },
} as const;

function finite(value: number, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${what} must be a finite number`);
  }
  return value;
}
