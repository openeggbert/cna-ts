import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type { DisplayMode } from "./DisplayMode.js";
import type { DisplayModeCollection } from "./DisplayModeCollection.js";
import {
  DepthFormat,
  GraphicsProfile,
  SurfaceFormat,
} from "./DeviceEnums.js";
import type { GraphicsFormatQueryResult } from "./GraphicsFormatQueryResult.js";

export type GraphicsAdapterState = {
  readonly CurrentDisplayMode: DisplayMode;
  readonly Description: string;
  readonly DeviceId: number;
  readonly DeviceName: string;
  readonly IsDefaultAdapter: boolean;
  readonly MonitorHandle: bigint;
  readonly Revision: number;
  readonly SubSystemId: number;
  readonly SupportedDisplayModes: DisplayModeCollection;
  readonly VendorId: number;
  readonly IsProfileSupported: (profile: GraphicsProfile) => boolean;
  readonly QueryBackBufferFormat: (
    profile: GraphicsProfile,
    format: SurfaceFormat,
    depthFormat: DepthFormat,
    multiSampleCount: number,
  ) => GraphicsFormatQueryResult;
  readonly QueryRenderTargetFormat: (
    profile: GraphicsProfile,
    format: SurfaceFormat,
    depthFormat: DepthFormat,
    multiSampleCount: number,
  ) => GraphicsFormatQueryResult;
};

const states = new WeakMap<GraphicsAdapter, GraphicsAdapterState>();
let adapters: readonly GraphicsAdapter[] | null = null;
/**
 * A source of adapter states, resolved on first use rather than at registration.
 *
 * CNA reads adapters through a graphics-device handle, and that handle may only be borrowed during
 * a game lifecycle callback -- so the list cannot be built when the device is created. It is built
 * the first time a caller asks for it, which for a game is from `LoadContent`, `Update` or `Draw`:
 * inside a callback, where the borrow is legal.
 */
let provider: (() => readonly GraphicsAdapterState[] | null) | null = null;

function resolveAdapters(): readonly GraphicsAdapter[] | null {
  if (adapters) return adapters;
  if (!provider) return null;
  const source = provider;
  // One attempt only. A renderer with no displays answers null, and retrying it on every property
  // read would turn one honest refusal into a native call per access.
  provider = null;
  const values = source();
  if (!values || values.length === 0) return null;
  installGraphicsAdaptersForInternalUse(values);
  return adapters;
}
let useNullDevice = false;
let useReferenceDevice = false;

function stateOf(adapter: GraphicsAdapter): GraphicsAdapterState {
  const state = states.get(adapter);
  if (!state) throw new NativeUnavailableError("GraphicsAdapter data requires a CNA adapter-capability route");
  return state;
}

/** Immutable adapter/capability wrapper created only from verified backend data. */
export class GraphicsAdapter {
  private constructor() {}

  public static get Adapters(): ReadonlyArray<GraphicsAdapter> {
    const resolved = resolveAdapters();
    if (!resolved) {
      throw new NativeUnavailableError("GraphicsAdapter.Adapters requires CNA adapter discovery");
    }
    return resolved;
  }

  public static get DefaultAdapter(): GraphicsAdapter {
    const adapter = this.Adapters.find((value) => value.IsDefaultAdapter);
    if (!adapter) throw new NativeUnavailableError("CNA did not report a default graphics adapter");
    return adapter;
  }

  public static get UseNullDevice(): boolean { return useNullDevice; }
  public static set UseNullDevice(value: boolean) { useNullDevice = Boolean(value); }
  public static get UseReferenceDevice(): boolean { return useReferenceDevice; }
  public static set UseReferenceDevice(value: boolean) { useReferenceDevice = Boolean(value); }

  public get CurrentDisplayMode(): DisplayMode { return stateOf(this).CurrentDisplayMode; }
  public get Description(): string { return stateOf(this).Description; }
  public get DeviceId(): number { return stateOf(this).DeviceId; }
  public get DeviceName(): string { return stateOf(this).DeviceName; }
  public get IsDefaultAdapter(): boolean { return stateOf(this).IsDefaultAdapter; }
  public get IsWideScreen(): boolean { return this.CurrentDisplayMode.AspectRatio > 4 / 3; }
  public get MonitorHandle(): bigint { return stateOf(this).MonitorHandle; }
  public get Revision(): number { return stateOf(this).Revision; }
  public get SubSystemId(): number { return stateOf(this).SubSystemId; }
  public get SupportedDisplayModes(): DisplayModeCollection { return stateOf(this).SupportedDisplayModes; }
  public get VendorId(): number { return stateOf(this).VendorId; }

  public IsProfileSupported(graphicsProfile: GraphicsProfile): boolean {
    return stateOf(this).IsProfileSupported(graphicsProfile);
  }

  public QueryBackBufferFormat(
    graphicsProfile: GraphicsProfile,
    format: SurfaceFormat,
    depthFormat: DepthFormat,
    multiSampleCount: number,
  ): GraphicsFormatQueryResult {
    return stateOf(this).QueryBackBufferFormat(
      graphicsProfile, format, depthFormat, Math.trunc(multiSampleCount),
    );
  }

  public QueryRenderTargetFormat(
    graphicsProfile: GraphicsProfile,
    format: SurfaceFormat,
    depthFormat: DepthFormat,
    multiSampleCount: number,
  ): GraphicsFormatQueryResult {
    return stateOf(this).QueryRenderTargetFormat(
      graphicsProfile, format, depthFormat, Math.trunc(multiSampleCount),
    );
  }
}

/**
 * Registers a source of adapter states to be read on first access.
 *
 * Registering does not read anything: CNA needs a borrowed device handle for that and one is only
 * available inside a lifecycle callback, so the read happens when a caller first asks.
 */
/**
 * The default adapter, or `null` where the renderer reports none.
 *
 * `GraphicsDevice.Adapter` needs this without the exception `DefaultAdapter` raises, because it has
 * its own refusal to raise instead.
 */
export function defaultGraphicsAdapterOrNull(): GraphicsAdapter | null {
  const resolved = resolveAdapters();
  if (!resolved) return null;
  return resolved.find((value) => value.IsDefaultAdapter) ?? resolved[0] ?? null;
}

export function installGraphicsAdapterProviderForInternalUse(
  source: (() => readonly GraphicsAdapterState[] | null) | null,
): void {
  provider = source;
  adapters = null;
}

export function installGraphicsAdaptersForInternalUse(values: readonly GraphicsAdapterState[]): void {
  adapters = Object.freeze(values.map((state) => {
    const adapter = Object.create(GraphicsAdapter.prototype) as GraphicsAdapter;
    states.set(adapter, Object.freeze(state));
    return adapter;
  }));
}
