/**
 * Modern CNA runtime services: which host CNA is running on, which renderer it chose and why, the
 * runtime log, and whether the extended graphics layer is present.
 *
 * None of this is XNA 4.0 and none of it belongs in `Microsoft.Xna.Framework`. XNA had one renderer
 * per platform and nothing to ask about it; CNA has a whole selection process with fallbacks and
 * reasons, and a game that wants to know about it needs an API that admits the concept exists.
 *
 * Everything here is process-wide: no CNA handle is involved, so these answer before a `Game` is
 * constructed and are the same operations on the Node and WebAssembly backends.
 */

import { getBackend } from "../../internal/backend.js";
import type { CnaRuntimeServicesBackend } from "../../internal/backend.js";
import { NativeUnavailableError } from "../../internal/native-error.js";

/** The host family CNA reports itself running on. */
export enum CnaPlatform {
  Desktop = 0,
  Android = 1,
  IOS = 2,
  Web = 3,
}

/** The desktop operating system, where the platform is `CnaPlatform.Desktop`. */
export enum CnaDesktopOperatingSystem {
  Windows = 0,
  Linux = 1,
  MacOSX = 2,
  Other = 3,
}

/** What kind of thing a renderer is built on. */
export enum GraphicsBackendCategory {
  Native = 0,
  TranslationLayer = 1,
  Software = 2,
  Web = 3,
  Diagnostic = 4,
}

/** How far a renderer has been taken. A game should treat these as the promise they are. */
export enum GraphicsBackendMaturity {
  Production = 0,
  Supported = 1,
  Experimental = 2,
  Historical = 3,
  Deprecated = 4,
}

/** Why CNA moved past a renderer it was asked for. */
export enum GraphicsRendererFallbackReason {
  NotCompiledIn = 0,
  ProbeUnavailable = 1,
  InitializationFailed = 2,
  WindowKindConflict = 3,
}

/** Severity of a CNA log record. */
export enum CnaLogLevel {
  Fatal = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Trace = 5,
  Experiment = 100,
}

/** Which part of the runtime a log record came from. */
export enum CnaLogCategory {
  Application = 0,
  Error = 1,
  System = 2,
  Audio = 3,
  Video = 4,
  Render = 5,
  Input = 6,
  Test = 7,
  Gpu = 8,
}

/**
 * A renderer CNA knows about. Numbers are the canonical CNA identities and are stable across
 * versions; retired identities are removed rather than renumbered, which is why this enumeration
 * has gaps.
 */
export enum GraphicsRendererType {
  Unknown = 0,
  SdlRenderer = 1,
  OpenGLES2 = 2,
  OpenGLES3 = 3,
  OpenGL33 = 4,
  WebGL1 = 5,
  WebGL2 = 6,
  Bgfx = 7,
  Vulkan = 8,
  WebGpu = 9,
  Headless = 11,
  Software = 12,
  Stub = 13,
  DirectX11 = 14,
  DirectX12 = 15,
  Direct2D = 16,
  Canvas = 17,
  HtmlDom = 18,
  FreeDirect = 21,
  DirectX9 = 22,
  DirectX1 = 23,
  DirectX2 = 24,
  DirectX3 = 25,
  DirectX5 = 26,
  DirectX6 = 27,
  DirectX7 = 28,
  DirectX8 = 29,
  DirectX10 = 30,
  SdlGpu = 31,
  OpenGLES1 = 32,
  OpenGL4 = 33,
  OpenGL1 = 34,
  OpenGL2 = 35,
  Glide = 39,
  Gdi = 40,
  Metal = 42,
  Fna3D = 43,
  SvgDom = 44,
  PortableGL = 46,
  PixiJs = 49,
}

/** The host CNA is running on. */
export interface CnaPlatformInfo {
  readonly Platform: CnaPlatform;
  /** CNA's own spelling of the platform. */
  readonly Name: string;
  readonly IsApple: boolean;
  readonly IsMobile: boolean;
  /**
   * The desktop operating system, or `null` where the platform is not a desktop. CNA refuses the
   * question off a desktop rather than naming one, and that refusal is preserved here.
   */
  readonly DesktopOperatingSystem: CnaDesktopOperatingSystem | null;
}

/** One renderer identity, as CNA describes it plus this binding's spelling of its name. */
export interface RendererIdentity {
  readonly Type: GraphicsRendererType;
  /**
   * This binding's name for the identity. The C ABI names the *current* renderer, a category, a
   * maturity and a fallback reason, but has no route that names an arbitrary identity, so this is
   * the enumeration member rather than a string CNA produced. `RendererSelection.CurrentName` is
   * CNA's own string.
   */
  readonly Name: string;
  readonly Category: GraphicsBackendCategory;
  /** CNA's own spelling of the category. */
  readonly CategoryName: string;
  readonly Maturity: GraphicsBackendMaturity;
  /** CNA's own spelling of the maturity. */
  readonly MaturityName: string;
  readonly IsAvailable: boolean;
}

/** What CNA was asked for, what it is running, and whether the choice can still change. */
export interface RendererSelectionState {
  readonly Selected: GraphicsRendererType;
  /**
   * The renderer CNA actually brought up, or `null` before any renderer has been created. CNA
   * refuses to answer this before there is one rather than reporting a guess, and that distinction
   * is preserved here instead of being flattened into `Unknown`.
   */
  readonly Active: GraphicsRendererType | null;
  readonly Current: GraphicsRendererType | null;
  /** CNA's own name for the current renderer, or `null` before there is one. */
  readonly CurrentName: string | null;
  /** True once a device exists: the selection is fixed for the rest of the process. */
  readonly IsLatched: boolean;
  readonly AutomaticFallback: boolean;
}

/** A renderer CNA tried and moved past, with the reason it recorded. */
export interface RendererFallback {
  readonly Type: GraphicsRendererType;
  readonly Reason: GraphicsRendererFallbackReason;
  /** CNA's own spelling of the reason. */
  readonly ReasonName: string;
  readonly Message: string;
}

function services(): CnaRuntimeServicesBackend {
  const backend = getBackend();
  if (!backend.IsAvailable || backend.RuntimeServices == null) {
    throw new NativeUnavailableError(
      `CNA runtime services require a loaded backend: ${backend.Detail}`,
    );
  }
  return backend.RuntimeServices;
}

function rendererName(type: number): string {
  return GraphicsRendererType[type] ?? `Renderer${type}`;
}

/** The host CNA reports itself running on. */
export function GetPlatformInfo(): CnaPlatformInfo {
  const snapshot = services().getPlatform();
  return Object.freeze({
    Platform: snapshot.Platform as CnaPlatform,
    Name: snapshot.Name,
    IsApple: snapshot.IsApple,
    IsMobile: snapshot.IsMobile,
    DesktopOperatingSystem: snapshot.DesktopOperatingSystem as CnaDesktopOperatingSystem | null,
  });
}

/**
 * CNA's renderer selection: what it was asked for, what it is running, what else it could run, and
 * every renderer it moved past on the way.
 */
export const RendererSelection = Object.freeze({
  /** What CNA was asked for, what it is running, and whether the choice is still open. */
  GetState(): RendererSelectionState {
    const snapshot = services().getRendererSelection();
    return Object.freeze({
      Selected: snapshot.Selected as GraphicsRendererType,
      Active: snapshot.Active as GraphicsRendererType | null,
      Current: snapshot.Current as GraphicsRendererType | null,
      CurrentName: snapshot.CurrentName,
      IsLatched: snapshot.IsLatched,
      AutomaticFallback: snapshot.AutomaticFallback,
    });
  },

  /** Every renderer this build can actually run, in CNA's own order. */
  GetAvailable(): readonly RendererIdentity[] {
    const backend = services();
    return Object.freeze(
      backend.getAvailableRendererTypes().map((type) => describe(backend, type)),
    );
  },

  /** Describes one renderer identity whether or not this build can run it. */
  Describe(type: GraphicsRendererType): RendererIdentity {
    return describe(services(), type);
  },

  /** Whether this build can run a renderer. */
  IsAvailable(type: GraphicsRendererType): boolean {
    return services().isRendererAvailable(type);
  },

  /**
   * Asks CNA to prefer a renderer. This has no effect once the selection is latched, which is what
   * `RendererSelectionState.IsLatched` reports.
   */
  SetPreferred(renderer: GraphicsRendererType | string): void {
    const backend = services();
    if (typeof renderer === "string") backend.setPreferredRendererByName(renderer);
    else backend.setPreferredRenderer(renderer);
  },

  /** Resolves a renderer name the way CNA does, or `null` where CNA does not recognise it. */
  TryParseName(name: string): GraphicsRendererType | null {
    const parsed = services().tryParseRendererName(name);
    return parsed == null ? null : (parsed as GraphicsRendererType);
  },

  /** The order CNA should try renderers in when the preferred one cannot start. */
  SetFallbackChain(types: readonly GraphicsRendererType[]): void {
    services().setRendererFallbackChain(types);
  },

  /** Whether CNA may move past a renderer that fails to start. */
  SetAutomaticFallback(enabled: boolean): void {
    services().setAutomaticRendererFallback(enabled);
  },

  /** Every renderer CNA tried and moved past, oldest first. */
  GetFallbacks(): readonly RendererFallback[] {
    return Object.freeze(services().getRendererFallbacks().map((row) => Object.freeze({
      Type: row.Type as GraphicsRendererType,
      Reason: row.Reason as GraphicsRendererFallbackReason,
      ReasonName: row.ReasonName,
      Message: row.Message,
    })));
  },
});

function describe(backend: CnaRuntimeServicesBackend, type: number): RendererIdentity {
  const snapshot = backend.describeRenderer(type);
  return Object.freeze({
    Type: snapshot.Type as GraphicsRendererType,
    Name: rendererName(snapshot.Type),
    Category: snapshot.Category as GraphicsBackendCategory,
    CategoryName: snapshot.CategoryName,
    Maturity: snapshot.Maturity as GraphicsBackendMaturity,
    MaturityName: snapshot.MaturityName,
    IsAvailable: snapshot.IsAvailable,
  });
}

/** The CNA runtime log. Writing here reaches the same sink CNA's own records do. */
export const CnaLog = Object.freeze({
  /** Records below this level are discarded before they are formatted. */
  GetMinimumLevel(): CnaLogLevel { return services().getMinimumLogLevel() as CnaLogLevel; },
  SetMinimumLevel(level: CnaLogLevel): void { services().setMinimumLogLevel(level); },
  Write(level: CnaLogLevel, category: CnaLogCategory, message: string): void {
    services().writeLog(level, category, message);
  },
  Fatal(message: string, category: CnaLogCategory = CnaLogCategory.Application): void {
    services().writeLog(CnaLogLevel.Fatal, category, message);
  },
  Error(message: string, category: CnaLogCategory = CnaLogCategory.Error): void {
    services().writeLog(CnaLogLevel.Error, category, message);
  },
  Warn(message: string, category: CnaLogCategory = CnaLogCategory.Application): void {
    services().writeLog(CnaLogLevel.Warn, category, message);
  },
  Info(message: string, category: CnaLogCategory = CnaLogCategory.Application): void {
    services().writeLog(CnaLogLevel.Info, category, message);
  },
  Debug(message: string, category: CnaLogCategory = CnaLogCategory.Application): void {
    services().writeLog(CnaLogLevel.Debug, category, message);
  },
  Trace(message: string, category: CnaLogCategory = CnaLogCategory.Application): void {
    services().writeLog(CnaLogLevel.Trace, category, message);
  },
});

/**
 * Whether CNA's extended graphics layer is compiled into the loaded runtime.
 *
 * The layer is an opt-in CNA build option. Its routes are declared and exported in every build and
 * answer `NOT_SUPPORTED` where it is absent, so a structurally present API is not evidence that it
 * will do anything. Ask this before offering a feature that needs it.
 */
export function IsGraphicsExtensionLayerAvailable(): boolean {
  return services().isGraphicsExtensionLayerAvailable();
}
