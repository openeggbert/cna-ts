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
import { WasmEngineMemory } from "./graphics-ext-core.js";

export class WasmComputeBackend extends CnaComputeBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

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
    return this.#mem.bool("cna_graphics_device_supports_capability", device, capability);
  }

  public override getMaxComputeWorkGroupCount(device: NativeHandle, axis: number): number {
    return this.#mem.int(
      "cna_graphics_device_get_max_compute_work_group_count_ext", device, Math.trunc(axis),
    );
  }

  public override getMaxComputeWorkGroupSize(device: NativeHandle, axis: number): number {
    return this.#mem.int(
      "cna_graphics_device_get_max_compute_work_group_size_ext", device, Math.trunc(axis),
    );
  }

  public override getMaxComputeWorkGroupInvocations(device: NativeHandle): number {
    return this.#mem.int("cna_graphics_device_get_max_compute_work_group_invocations_ext", device);
  }

  /**
   * A storage buffer's size is a `uint64_t`, and the artifact is linked `WASM_BIGINT`.
   *
   * So it must be given a `BigInt`: a `Number` throws `Cannot convert 256 to a BigInt` from inside
   * the export, which type-checks perfectly and fails only at the call. The browser census found
   * this one and `tools/wasm/verify-route-calls.mjs` now finds the rest.
   */
  public override createStorageBuffer(device: NativeHandle, byteSize: number): NativeHandle {
    return this.#routes.outHandle(
      "cna_storage_buffer_create", device, BigInt(Math.trunc(byteSize)));
  }

  public override createTypedStorageBuffer(
    device: NativeHandle, elementCount: number, elementByteSize: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_storage_buffer_create_typed", device, BigInt(Math.trunc(elementCount)),
      BigInt(Math.trunc(elementByteSize)));
  }

  public override getStorageBufferByteSize(buffer: NativeHandle): number {
    return this.#mem.u64AsNumber("cna_storage_buffer_get_byte_size", buffer);
  }

  public override getStorageBufferElementCount(buffer: NativeHandle): number {
    return this.#mem.u64AsNumber("cna_storage_buffer_get_element_count", buffer);
  }

  public override getStorageBufferElementByteSize(buffer: NativeHandle): number {
    return this.#mem.u64AsNumber("cna_storage_buffer_get_element_byte_size", buffer);
  }

  public override destroyStorageBuffer(buffer: NativeHandle): void {
    this.#routes.invoke("cna_storage_buffer_destroy", buffer);
  }

  public override createComputeShader(device: NativeHandle, source: string): NativeHandle {
    return this.#mem.withStringView(source, (sourcePointer) => this.#routes.outHandle("cna_compute_shader_create", device, sourcePointer));
  }

  public override setComputeShaderUniformInt(
    shader: NativeHandle, name: string, value: number,
  ): void {
    this.#mem.withStringView(name, (namePointer) => this.#routes.invoke("cna_compute_shader_set_uniform_int", shader, namePointer, Math.trunc(value)));
  }

  public override setComputeShaderUniformFloat(
    shader: NativeHandle, name: string, value: number,
  ): void {
    this.#mem.withStringView(name, (namePointer) => this.#routes.invoke("cna_compute_shader_set_uniform_float", shader, namePointer, value));
  }

  public override bindComputeStorageBuffer(
    shader: NativeHandle, binding: number, buffer: NativeHandle,
  ): void {
    this.#routes.invoke("cna_compute_shader_bind_storage_buffer", shader, Math.trunc(binding), buffer);
  }

  public override bindComputeTexture(
    shader: NativeHandle, unit: number, samplerName: string, texture: NativeHandle,
  ): void {
    this.#mem.withStringView(samplerName, (samplerNamePointer) => this.#routes.invoke("cna_compute_shader_bind_texture", shader, Math.trunc(unit), samplerNamePointer, texture));
  }

  public override isComputeImageBindingSupported(shader: NativeHandle): boolean {
    return this.#mem.bool("cna_compute_shader_is_image_binding_supported", shader);
  }

  public override bindComputeImage(
    shader: NativeHandle, unit: number, texture: NativeHandle, access: number,
  ): void {
    this.#routes.invoke("cna_compute_shader_bind_image", shader, Math.trunc(unit), texture, access);
  }

  public override dispatchComputeShader(
    shader: NativeHandle, x: number, y: number, z: number,
  ): void {
    this.#routes.invoke("cna_compute_shader_dispatch", shader, Math.trunc(x), Math.trunc(y), Math.trunc(z));
  }

  public override computeShaderBarrier(shader: NativeHandle, bits: number): void {
    this.#routes.invoke("cna_compute_shader_barrier", shader, bits);
  }

  public override isComputeShaderValid(shader: NativeHandle): boolean {
    return this.#mem.bool("cna_compute_shader_is_valid", shader);
  }

  public override getComputeShaderCompileError(shader: NativeHandle): string {
    return this.#mem.probedString("cna_compute_shader_copy_compile_error", shader);
  }

  public override destroyComputeShader(shader: NativeHandle): void {
    this.#routes.invoke("cna_compute_shader_destroy", shader);
  }

  public override createGpuTimer(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_gpu_timer_create", device);
  }

  public override isGpuTimerSupported(timer: NativeHandle): boolean {
    return this.#mem.bool("cna_gpu_timer_is_supported", timer);
  }

  public override getGpuTimerUnsupportedReason(timer: NativeHandle): string {
    return this.#mem.probedString("cna_gpu_timer_copy_unsupported_reason", timer);
  }

  public override beginGpuTimer(timer: NativeHandle): void {
    this.#routes.invoke("cna_gpu_timer_begin", timer);
  }

  public override endGpuTimer(timer: NativeHandle): void {
    this.#routes.invoke("cna_gpu_timer_end", timer);
  }

  public override isGpuTimerResultAvailable(timer: NativeHandle): boolean {
    return this.#mem.bool("cna_gpu_timer_is_result_available", timer);
  }

  public override pollGpuTimer(timer: NativeHandle): boolean {
    return this.#mem.bool("cna_gpu_timer_poll", timer);
  }

  public override getGpuTimerSampleCount(timer: NativeHandle): number {
    return this.#mem.int("cna_gpu_timer_get_sample_count", timer);
  }

  public override isGpuTimerOpen(timer: NativeHandle): boolean {
    return this.#mem.bool("cna_gpu_timer_is_open", timer);
  }

  public override destroyGpuTimer(timer: NativeHandle): void {
    this.#routes.invoke("cna_gpu_timer_destroy", timer);
  }


  // --- the four buffer transfers, which are raw bytes rather than a structure --------------------

  public override setStorageBufferBytes(buffer: NativeHandle, bytes: Uint8Array): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_storage_buffer_set_bytes", buffer, scope.allocateBytes(bytes),
        BigInt(bytes.byteLength));
    } finally {
      scope.dispose();
    }
  }

  public override getStorageBufferBytes(buffer: NativeHandle, byteLength: number): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const size = Math.trunc(byteLength);
      const destination = scope.allocate(Math.max(size, 1));
      this.#routes.invoke("cna_storage_buffer_get_bytes", buffer, destination, BigInt(size));
      return new Uint8Array(
        this.#routes.module.HEAPU8.subarray(destination, destination + size));
    } finally {
      scope.dispose();
    }
  }

  /** The same bytes counted in elements, so CNA checks the stride against the buffer's own. */
  public override setStorageBufferElements(
    buffer: NativeHandle, bytes: Uint8Array, elementByteSize: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const stride = Math.max(Math.trunc(elementByteSize), 1);
      this.#routes.invoke(
        "cna_storage_buffer_set_elements", buffer, scope.allocateBytes(bytes),
        BigInt(Math.floor(bytes.byteLength / stride)), BigInt(stride),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getStorageBufferElements(
    buffer: NativeHandle, elementCount: number, elementByteSize: number,
  ): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const count = Math.trunc(elementCount);
      const stride = Math.trunc(elementByteSize);
      const destination = scope.allocate(Math.max(count * stride, 1));
      this.#routes.invoke(
        "cna_storage_buffer_get_elements", buffer, destination, BigInt(count), BigInt(stride));
      return new Uint8Array(
        this.#routes.module.HEAPU8.subarray(destination, destination + count * stride));
    } finally {
      scope.dispose();
    }
  }

  /** A `double*` output, which is the only one in this family. */
  public override getGpuTimerLastMilliseconds(timer: NativeHandle): number {
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(8);
      this.#routes.invoke("cna_gpu_timer_get_last_milliseconds", timer, out);
      return this.#routes.view().getFloat64(out, true);
    } finally {
      scope.dispose();
    }
  }

}
