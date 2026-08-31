/**
 * Reads CNA's graphics adapters into the strict XNA {@link GraphicsAdapter} type.
 *
 * `GraphicsAdapter` is one of the few strict types this package projected structurally and could
 * not fill, because nothing read CNA's adapter capabilities. This is what fills it, and it runs at
 * exactly one moment: just after a device is created, because every route CNA publishes for this
 * takes a graphics-device handle. An adapter list is a property of a device a game made rather than
 * of the process, and `GraphicsAdapter.Adapters` is a static, so the two are reconciled here.
 *
 * **A renderer with no displays reports no adapters**, and nothing here invents one. In that case
 * the static list is left empty, `GraphicsAdapter.Adapters` keeps refusing, and
 * `GraphicsDevice.Adapter` stays null — which is the truthful answer on a HEADLESS build and is
 * why this file returns `null` rather than a fabricated default.
 *
 * Every value a returned adapter answers with is read **eagerly**, during this call, while the
 * device handle is known good. The alternative — capturing the handle and reading lazily — would
 * hand a caller an object that reads through a handle its device may already have released.
 */

import type { CnaBackend } from "./backend.js";
import type { NativeHandle } from "./ownership.js";
import {
  installGraphicsAdapterProviderForInternalUse,
  type GraphicsAdapterState,
} from "../Microsoft/Xna/Framework/Graphics/GraphicsAdapter.js";
import { createDisplayModeForInternalUse } from "../Microsoft/Xna/Framework/Graphics/DisplayMode.js";
import {
  createDisplayModeCollectionForInternalUse,
} from "../Microsoft/Xna/Framework/Graphics/DisplayModeCollection.js";
import type {
  DepthFormat,
  GraphicsProfile,
  SurfaceFormat,
} from "../Microsoft/Xna/Framework/Graphics/DeviceEnums.js";
import type {
  GraphicsFormatQueryResult,
} from "../Microsoft/Xna/Framework/Graphics/GraphicsFormatQueryResult.js";

/**
 * Registers a lazy adapter source for a device that has just been created.
 *
 * Nothing is read here. CNA's adapter routes take a *borrowed* graphics-device handle, and CNA
 * permits that borrow only inside a game lifecycle callback -- so a read at device-creation time
 * is refused with `INVALID_STATE`. Registering a source instead defers the read to the first
 * access, which for a game is from `LoadContent`, `Update` or `Draw`.
 */
export function installAdapterProviderForInternalUse(
  backend: CnaBackend, resolveDevice: () => NativeHandle,
): void {
  installGraphicsAdapterProviderForInternalUse(
    () => readAdapters(backend, resolveDevice),
  );
}

function readAdapters(
  backend: CnaBackend, resolveDevice: () => NativeHandle,
): readonly GraphicsAdapterState[] | null {
  const adapters = backend.GraphicsAdapters;
  if (!adapters) return null;
  let device: NativeHandle;
  let count: number;
  try {
    device = resolveDevice();
    count = adapters.getGraphicsAdapterCount(device);
  } catch {
    // A renderer that cannot enumerate adapters is not an error: it is a renderer with none.
    // Answering null keeps GraphicsAdapter.Adapters refusing by name rather than inventing one.
    return null;
  }
  if (count <= 0) return null;

  const states: GraphicsAdapterState[] = [];
  for (let index = 0; index < count; index += 1) {
    const info = adapters.getGraphicsAdapterInfo(device, index);
    const current = adapters.getGraphicsAdapterCurrentDisplayMode(device, index);
    const modes = adapters.getGraphicsAdapterDisplayModes(device, index);
    // Read eagerly and captured by value: a profile answer or a format query made later, through a
    // handle whose device has been released, would be reading a dangling adapter.
    const profileSupport = new Map<number, boolean>();
    for (const profile of [0, 1]) {
      profileSupport.set(profile, adapters.isGraphicsAdapterProfileSupported(device, index, profile));
    }
    const query = (
      kind: "backbuffer" | "render-target",
      profile: GraphicsProfile, format: SurfaceFormat, depthFormat: DepthFormat,
      multiSampleCount: number,
    ): GraphicsFormatQueryResult => {
      const selection = kind === "backbuffer"
        ? adapters.queryGraphicsAdapterBackBufferFormat(
          device, index, profile, format, depthFormat, multiSampleCount)
        : adapters.queryGraphicsAdapterRenderTargetFormat(
          device, index, profile, format, depthFormat, multiSampleCount);
      return Object.freeze({
        Success: selection.IsExactMatch,
        Format: selection.SelectedFormat as SurfaceFormat,
        DepthFormat: selection.SelectedDepthFormat as DepthFormat,
        MultiSampleCount: selection.SelectedMultiSampleCount,
      });
    };
    states.push(Object.freeze({
      CurrentDisplayMode: createDisplayModeForInternalUse(
        current.Width, current.Height, current.Format as SurfaceFormat,
      ),
      Description: adapters.getGraphicsAdapterDescription(device, index),
      DeviceId: info.DeviceId,
      DeviceName: adapters.getGraphicsAdapterDeviceName(device, index),
      IsDefaultAdapter: info.IsDefaultAdapter,
      MonitorHandle: info.MonitorHandle,
      Revision: info.Revision,
      SubSystemId: info.SubSystemId,
      SupportedDisplayModes: createDisplayModeCollectionForInternalUse(
        modes.map((mode) => createDisplayModeForInternalUse(
          mode.Width, mode.Height, mode.Format as SurfaceFormat,
        )),
      ),
      VendorId: info.VendorId,
      // XNA's IsProfileSupported takes only the two profiles it defines; anything else is not one.
      IsProfileSupported: (profile: GraphicsProfile) => profileSupport.get(profile) ?? false,
      QueryBackBufferFormat: (
        profile: GraphicsProfile, format: SurfaceFormat, depthFormat: DepthFormat,
        multiSampleCount: number,
      ) => query("backbuffer", profile, format, depthFormat, multiSampleCount),
      QueryRenderTargetFormat: (
        profile: GraphicsProfile, format: SurfaceFormat, depthFormat: DepthFormat,
        multiSampleCount: number,
      ) => query("render-target", profile, format, depthFormat, multiSampleCount),
    }));
  }
  return states;
}
