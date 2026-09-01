// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaComputeBackend` facade, scoped to what a device can be *asked*.
//
// This slice runs no compute shader and allocates no storage buffer. What it does is let a browser
// consumer ask their device what it supports, through the already-public
// `GraphicsDeviceCapabilities` -- which is the question that decides whether any of the engine
// layer's other families are worth reaching for on the artifact in front of them.
//
// It is here because that question had no answer in a browser at all. `backend.Compute` was absent,
// so `GraphicsDeviceCapabilities.Supports` failed with "CNA compute requires a loaded backend",
// and a page had no way to find out that its context has, say, no compute shaders -- short of
// constructing something that needs them and reading the exception. Nineteen capability identities
// and three work-group limits are pure queries against a device CNA already has; refusing them was
// costing a consumer the only cheap way to branch.
//
// Everything that actually dispatches -- compute shaders, storage buffers, image bindings, memory
// barriers, GPU timers -- still refuses by name, because none of it has browser evidence.

import { CnaComputeBackendBase } from "../backend-base.js";
import type { NativeHandle } from "../ownership.js";
import type { WasmRouteTable } from "./module.js";

export class WasmComputeBackend extends CnaComputeBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's compute slice, which answers ` +
      "device capability and work-group limit queries and dispatches nothing; the Node-API " +
      "backend implements the rest",
    );
  }

  /**
   * One of the nineteen `CNA_GraphicsCapability` identities, as this device answers it.
   *
   * The answer is the device's, not the renderer name's: `CompiledEffects` is false on an artifact
   * built without `CNA_EASYGL_COMPILED_EFFECTS` and true on one built with it, over the same
   * WEBGL2 renderer, which is exactly why a consumer has to ask rather than assume.
   */
  public override supportsGraphicsCapability(device: NativeHandle, capability: number): boolean {
    return this.#bool("cna_graphics_device_supports_capability", device, capability);
  }

  public override getMaxComputeWorkGroupCount(device: NativeHandle, axis: number): number {
    return this.#int(
      "cna_graphics_device_get_max_compute_work_group_count_ext", device, Math.trunc(axis),
    );
  }

  public override getMaxComputeWorkGroupSize(device: NativeHandle, axis: number): number {
    return this.#int(
      "cna_graphics_device_get_max_compute_work_group_size_ext", device, Math.trunc(axis),
    );
  }

  public override getMaxComputeWorkGroupInvocations(device: NativeHandle): number {
    return this.#int("cna_graphics_device_get_max_compute_work_group_invocations_ext", device);
  }

  /** A `CNA_Bool*` output, which is one byte rather than four. */
  #bool(route: string, ...args: readonly (number | bigint)[]): boolean {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.view().getUint8(out) !== 0;
    } finally {
      scope.dispose();
    }
  }

  #int(route: string, ...args: readonly (number | bigint)[]): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(4);
      this.#routes.invoke(route, ...args, out);
      return this.#routes.view().getInt32(out, true);
    } finally {
      scope.dispose();
    }
  }
}
