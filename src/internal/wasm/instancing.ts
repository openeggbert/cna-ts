// SPDX-License-Identifier: MS-PL
//
// The instanced renderer and the native mesh part it draws -- and the reason both are here, when
// the previous session recorded them as architecturally out of reach.
//
// That record was right about the *content* path and wrong about the route.
// `cna_model_mesh_part_create` takes a vertex buffer, an index buffer and four counts -- all of
// them the caller's own -- so a page that builds its own geometry can make a model mesh part
// without a native content manager anywhere in the picture. What still needs one is loading a
// `Model` out of XNB, and that decision is unchanged: `docs/non-engine-census.md` records it, this
// file does not reopen it, and nothing here reads content.
//
// So the split is: **a caller's own mesh part and the instanced draw over it are reachable**; a
// content-manager-minted model is not, for the reason it never was.
//
// `cna_instanced_renderer_ext_is_instancing_supported` is asked rather than assumed, and where the
// renderer answers no CNA has its own single-draw fallback -- which is a behaviour a consumer can
// see through `getInstancedRendererDidLastDrawInstance` rather than something this binding decides.

import {
  CnaInstancedRendererBackendBase, CnaNativeMeshPartBackendBase,
} from "../backend-base.js";
import type { ColorSnapshot } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import type { WasmRouteTable } from "./module.js";

export class WasmInstancedRendererBackend extends CnaInstancedRendererBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's instanced-renderer slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createInstancedRenderer(device: NativeHandle, part: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_instanced_renderer_ext_create", device, part);
  }

  public override destroyInstancedRenderer(renderer: NativeHandle): void {
    this.#routes.invoke("cna_instanced_renderer_ext_destroy", renderer);
  }

  public override getInstancedRendererTintsEnabled(renderer: NativeHandle): boolean {
    return this.#mem.bool("cna_instanced_renderer_ext_is_tints_enabled", renderer);
  }

  public override setInstancedRendererTintsEnabled(renderer: NativeHandle, enabled: boolean): void {
    this.#routes.invoke("cna_instanced_renderer_ext_set_tints_enabled", renderer, enabled ? 1 : 0);
  }

  public override drawInstancedRenderer(renderer: NativeHandle, effect: NativeHandle): void {
    this.#routes.invoke("cna_instanced_renderer_ext_draw", renderer, effect);
  }

  public override getInstancedRendererInstancingSupported(renderer: NativeHandle): boolean {
    return this.#mem.bool("cna_instanced_renderer_ext_is_instancing_supported", renderer);
  }

  public override getInstancedRendererFallbackEnabled(renderer: NativeHandle): boolean {
    return this.#mem.bool("cna_instanced_renderer_ext_is_fallback_enabled", renderer);
  }

  public override setInstancedRendererFallbackEnabled(
    renderer: NativeHandle, enabled: boolean,
  ): void {
    this.#routes.invoke("cna_instanced_renderer_ext_set_fallback_enabled", renderer, enabled ? 1 : 0);
  }

  public override getInstancedRendererInstanceCount(renderer: NativeHandle): number {
    return this.#mem.int("cna_instanced_renderer_ext_get_instance_count", renderer);
  }

  public override getInstancedRendererInstanceCapacity(renderer: NativeHandle): number {
    return this.#mem.int("cna_instanced_renderer_ext_get_instance_capacity", renderer);
  }

  public override getInstancedRendererLastDrawCallCount(renderer: NativeHandle): number {
    return this.#mem.int("cna_instanced_renderer_ext_get_last_draw_call_count", renderer);
  }

  public override getInstancedRendererDidLastDrawInstance(renderer: NativeHandle): boolean {
    return this.#mem.bool("cna_instanced_renderer_ext_did_last_draw_instance", renderer);
  }

  /** The instance stream: one `CNA_Matrix` per instance, at the measured stride. */
  public override setInstancedRendererInstances(
    renderer: NativeHandle, transforms: readonly (readonly number[])[],
  ): void {
    const scope = this.#routes.scope();
    try {
      const stride = WASM_STRUCT_LAYOUTS.CNA_Matrix.size;
      const buffer = scope.allocate(stride * Math.max(transforms.length, 1));
      const view = this.#routes.view();
      transforms.forEach((matrix, index) => {
        if (matrix.length !== 16) {
          throw new RangeError(`instance ${index} is ${matrix.length} floats, not sixteen`);
        }
        for (let element = 0; element < 16; element += 1) {
          view.setFloat32(buffer + index * stride + element * 4, matrix[element] as number, true);
        }
      });
      this.#routes.invoke(
        "cna_instanced_renderer_ext_set_instances", renderer, buffer, BigInt(transforms.length));
    } finally {
      scope.dispose();
    }
  }

  /** The tint stream, which is a `CNA_Color` per instance and four bytes wide. */
  public override setInstancedRendererTints(
    renderer: NativeHandle, tints: readonly ColorSnapshot[],
  ): void {
    const scope = this.#routes.scope();
    try {
      const buffer = scope.allocate(4 * Math.max(tints.length, 1));
      const bytes = this.#routes.module.HEAPU8;
      tints.forEach((tint, index) => {
        bytes[buffer + index * 4] = tint.R & 0xff;
        bytes[buffer + index * 4 + 1] = tint.G & 0xff;
        bytes[buffer + index * 4 + 2] = tint.B & 0xff;
        bytes[buffer + index * 4 + 3] = tint.A & 0xff;
      });
      this.#routes.invoke(
        "cna_instanced_renderer_ext_set_instance_tints", renderer, buffer, BigInt(tints.length));
    } finally {
      scope.dispose();
    }
  }
}

export class WasmNativeMeshPartBackend extends CnaNativeMeshPartBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's mesh-part slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createNativeMeshPart(
    vertexBuffer: NativeHandle, indexBuffer: NativeHandle, numVertices: number,
    primitiveCount: number, startIndex: number, vertexOffset: number,
  ): NativeHandle {
    return this.#routes.outHandle("cna_model_mesh_part_create", vertexBuffer, indexBuffer, Math.trunc(numVertices), Math.trunc(primitiveCount), Math.trunc(startIndex), Math.trunc(vertexOffset));
  }

  public override destroyNativeMeshPart(part: NativeHandle): void {
    this.#routes.invoke("cna_model_mesh_part_destroy", part);
  }

  public override getNativeMeshPartNumVertices(part: NativeHandle): number {
    return this.#mem.int("cna_model_mesh_part_get_num_vertices", part);
  }

  public override getNativeMeshPartPrimitiveCount(part: NativeHandle): number {
    return this.#mem.int("cna_model_mesh_part_get_primitive_count", part);
  }

  public override getNativeMeshPartStartIndex(part: NativeHandle): number {
    return this.#mem.int("cna_model_mesh_part_get_start_index", part);
  }

  public override getNativeMeshPartVertexOffset(part: NativeHandle): number {
    return this.#mem.int("cna_model_mesh_part_get_vertex_offset", part);
  }

  /**
   * The four routes that answer "is there one, and what is it" as two outputs rather than one.
   *
   * A mesh part need not have an effect or a buffer, and CNA says so with a separate `CNA_Bool`
   * rather than with an invalid handle -- so the flag is read first and the handle only when it
   * says there is one. Reading the handle regardless would turn "no effect" into whatever the
   * allocation held.
   */
  public override setNativeMeshPartEffect(part: NativeHandle, effect: NativeHandle | null): void {
    this.#routes.invoke("cna_model_mesh_part_set_effect", part, effect ?? 0n);
  }

  public override getNativeMeshPartEffect(part: NativeHandle): NativeHandle | null {
    return this.#optionalHandle("cna_model_mesh_part_get_effect", part);
  }

  public override getNativeMeshPartVertexBuffer(part: NativeHandle): NativeHandle | null {
    return this.#optionalHandle("cna_model_mesh_part_get_vertex_buffer", part);
  }

  public override getNativeMeshPartIndexBuffer(part: NativeHandle): NativeHandle | null {
    return this.#optionalHandle("cna_model_mesh_part_get_index_buffer", part);
  }

  #optionalHandle(route: string, part: NativeHandle): NativeHandle | null {
    const scope = this.#routes.scope();
    try {
      const present = scope.allocate(4);
      const handle = scope.allocate(8);
      this.#routes.invoke(route, part, present, handle);
      if (this.#routes.view().getUint8(present) === 0) return null;
      return this.#routes.view().getBigUint64(handle, true);
    } finally {
      scope.dispose();
    }
  }
}
