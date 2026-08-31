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
  ClusterBoundsSnapshot,
  CnaLodBackend,
  CnaShadowBackend,
  CnaGraphicsExtensionBackend,
} from "../../internal/backend.js";
import { BoundingBox } from "../../Microsoft/Xna/Framework/BoundingBox.js";
import { BoundingSphere } from "../../Microsoft/Xna/Framework/BoundingSphere.js";
import { Matrix } from "../../Microsoft/Xna/Framework/Matrix.js";
import { Vector3 } from "../../Microsoft/Xna/Framework/Vector3.js";
import { NativeUnavailableError } from "../../internal/native-error.js";
import { Color } from "../../Microsoft/Xna/Framework/Color.js";
import type { GraphicsDevice } from "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import { resolveGraphicsDeviceHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/GraphicsDevice.js";
import type { IDisposable } from "../../Microsoft/Xna/Framework/Contracts.js";
import type { PassTimingSnapshot, PostProcessFrameSnapshot } from "../../internal/backend.js";
import type { RenderTarget2D } from "../../Microsoft/Xna/Framework/Graphics/RenderTargets.js";
import type { Texture2D } from "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
import { resolveTexture2DHandleForInternalUse } from
  "../../Microsoft/Xna/Framework/Graphics/Texture2D.js";
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
 * The rendering half — the depth pass, the caster effects, the shadow texture — is deliberately
 * not projected. It needs a real depth pass, and on the one renderer here that could run one,
 * reading a render target back answers zeros (`docs/upstream-cna-findings.md` item 7), so there
 * would be no evidence to accept it on. What is projected is what can be proved.
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
} as const;

/**
 * A shadow map's own state: the size and filter its quality tier bought, its depth bias, and the
 * light view-projection it last rendered with.
 *
 * Whether it can render at all is a renderer question, and {@link ShadowMap.IsSupported} is how to
 * ask; this package does not project the depth pass itself.
 */
export class ShadowMap implements IDisposable {
  readonly #backend: CnaShadowBackend;
  #handle: NativeHandle | null;

  public constructor(graphicsDevice: GraphicsDevice, quality: ShadowQuality) {
    if (graphicsDevice == null) throw new TypeError("graphicsDevice is required");
    this.#backend = shadows();
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

  /** Releases the shadow map. Disposing twice is harmless. */
  public Dispose(): void {
    const handle = this.#handle;
    if (handle == null) return;
    this.#handle = null;
    this.#backend.destroyShadowMap(handle);
  }
}
