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
   * **Known upstream defect (CNA ABI 0.20.0).** `cna_post_process_chain_add_owned_pass` consumes
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
