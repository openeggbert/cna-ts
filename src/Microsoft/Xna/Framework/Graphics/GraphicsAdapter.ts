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
    if (!adapters) throw new NativeUnavailableError("GraphicsAdapter.Adapters requires CNA adapter discovery");
    return adapters;
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

export function installGraphicsAdaptersForInternalUse(values: readonly GraphicsAdapterState[]): void {
  adapters = Object.freeze(values.map((state) => {
    const adapter = Object.create(GraphicsAdapter.prototype) as GraphicsAdapter;
    states.set(adapter, Object.freeze(state));
    return adapter;
  }));
}
