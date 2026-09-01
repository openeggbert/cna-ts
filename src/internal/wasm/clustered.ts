// SPDX-License-Identifier: MS-PL
//
// Clustered lighting, which sounds like a GPU family and is not.
//
// All four objects here -- the light set, the cluster grid, the assignment and the shadow-budget
// policy -- take a graphics device handle and hold no GPU state, so they answer identically on a
// context with compute and one without. That was checked rather than assumed: what *is* renderer
// blocked is `cna_clustered_light_compute_is_supported`, which answers **false** on WebGL 2.0 along
// with the GPU timer and the instance culler, and that object is not in this file.
//
// The grid's slicing is a formula the public API states, so the browser suite predicts it:
// `near * (far / near) ^ (slice / sliceCount)`. The assignment is set arithmetic over spheres and
// boxes. Neither needs a pixel to be checked, which is why this family is bound whole while several
// of its neighbours are only partly reachable.
//
// **Upstream finding 10** is a documentation defect that touches this file's four create routes:
// each documents a `CNA_GameHandle` and each requires a `CNA_Handle` graphics device. The public
// TypeScript API already takes a `GraphicsDevice`, which is what CNA actually wants, and nothing
// here changes to accommodate the header.

import { CnaClusteredLightingBackendBase } from "../backend-base.js";
import type {
  BoundingSphereSnapshot, ClusterBoundsSnapshot, ClusteredLightSnapshot, PointLightSnapshot,
  SpotLightSnapshot, Vector3Snapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { WasmStruct, type WasmRouteTable, type WasmScope } from "./module.js";

export class WasmClusteredLightingBackend extends CnaClusteredLightingBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's clustered-lighting slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createClusteredLightSet(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_clustered_light_set_create", device);
  }

  public override removeClusteredLightAt(set: NativeHandle, index: number): void {
    this.#routes.invoke("cna_clustered_light_set_remove_at", set, Math.trunc(index));
  }

  public override clearClusteredLightSet(set: NativeHandle): void {
    this.#routes.invoke("cna_clustered_light_set_clear", set);
  }

  public override getClusteredLightCount(set: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_set_get_count", set);
  }

  public override isClusteredLightSetEmpty(set: NativeHandle): boolean {
    return this.#mem.bool("cna_clustered_light_set_is_empty", set);
  }

  public override destroyClusteredLightSet(set: NativeHandle): void {
    this.#routes.invoke("cna_clustered_light_set_destroy", set);
  }

  public override createClusterGrid(
    device: NativeHandle, tilesX: number, tilesY: number, sliceCount: number,
  ): NativeHandle {
    return this.#routes.outHandle(
      "cna_clustered_light_grid_create",
      device,
      tilesX,
      tilesY,
      Math.trunc(sliceCount),
    );
  }

  public override getClusterGridTilesX(grid: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_grid_get_tiles_x", grid);
  }

  public override getClusterGridTilesY(grid: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_grid_get_tiles_y", grid);
  }

  public override getClusterGridSliceCount(grid: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_grid_get_slice_count", grid);
  }

  public override getClusterGridClusterCount(grid: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_grid_get_cluster_count", grid);
  }

  public override getClusterIndex(grid: NativeHandle, x: number, y: number, slice: number): number {
    return this.#mem.int("cna_clustered_light_grid_cluster_index", grid, x, y, slice);
  }

  public override clusterGridHasProjection(grid: NativeHandle): boolean {
    return this.#mem.bool("cna_clustered_light_grid_has_projection", grid);
  }

  public override getClusterGridNearPlane(grid: NativeHandle): number {
    return this.#mem.float("cna_clustered_light_grid_get_near_plane", grid);
  }

  public override getClusterGridFarPlane(grid: NativeHandle): number {
    return this.#mem.float("cna_clustered_light_grid_get_far_plane", grid);
  }

  public override getClusterSliceDistance(grid: NativeHandle, slice: number): number {
    return this.#mem.float("cna_clustered_light_grid_slice_distance", grid, slice);
  }

  public override destroyClusterGrid(grid: NativeHandle): void {
    this.#routes.invoke("cna_clustered_light_grid_destroy", grid);
  }

  public override createClusteredLightAssignment(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_clustered_light_assignment_create", device);
  }

  public override clearClusteredLightAssignment(assignment: NativeHandle): void {
    this.#routes.invoke("cna_clustered_light_assignment_clear", assignment);
  }

  public override copyAssignmentIndices(assignment: NativeHandle): readonly number[] {
    return this.#int32Array("cna_clustered_light_assignment_copy_indices", assignment);
  }

  public override copyAssignmentOffsets(assignment: NativeHandle): readonly number[] {
    return this.#int32Array("cna_clustered_light_assignment_copy_offsets", assignment);
  }

  public override destroyClusteredLightAssignment(assignment: NativeHandle): void {
    this.#routes.invoke("cna_clustered_light_assignment_destroy", assignment);
  }

  public override createClusteredShadowPolicy(device: NativeHandle, budget: number): NativeHandle {
    return this.#routes.outHandle("cna_clustered_shadow_policy_create", device, budget);
  }

  public override getShadowPolicyBudget(policy: NativeHandle): number {
    return this.#mem.int("cna_clustered_shadow_policy_get_budget", policy);
  }

  public override setShadowPolicyBudget(policy: NativeHandle, budget: number): void {
    this.#routes.invoke("cna_clustered_shadow_policy_set_budget", policy, budget);
  }

  public override getShadowPolicyHysteresis(policy: NativeHandle): number {
    return this.#mem.float("cna_clustered_shadow_policy_get_hysteresis", policy);
  }

  public override setShadowPolicyHysteresis(policy: NativeHandle, hysteresis: number): void {
    this.#routes.invoke("cna_clustered_shadow_policy_set_hysteresis", policy, hysteresis);
  }

  public override copyShadowPolicySelected(policy: NativeHandle): readonly number[] {
    return this.#int32Array("cna_clustered_shadow_policy_copy_selected", policy);
  }

  public override isShadowPolicySelected(policy: NativeHandle, lightIndex: number): boolean {
    return this.#mem.bool(
      "cna_clustered_shadow_policy_is_selected",
      policy,
      Math.trunc(lightIndex),
    );
  }

  public override getShadowPolicyScore(policy: NativeHandle, lightIndex: number): number {
    return this.#mem.float("cna_clustered_shadow_policy_get_score", policy, Math.trunc(lightIndex));
  }

  public override resetShadowPolicy(policy: NativeHandle): void {
    this.#routes.invoke("cna_clustered_shadow_policy_reset", policy);
  }

  public override destroyClusteredShadowPolicy(policy: NativeHandle): void {
    this.#routes.invoke("cna_clustered_shadow_policy_destroy", policy);
  }

  // --- the light set: a growable structure, written through CNA's own initializer ---------------

  public override isClusteredLightUsable(light: ClusteredLightSnapshot): boolean {
    const scope = this.#routes.scope();
    try {
      return this.#mem.bool("cna_clustered_light_set_is_usable", this.#light(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override addClusteredLight(set: NativeHandle, light: ClusteredLightSnapshot): number {
    const scope = this.#routes.scope();
    try {
      return this.#mem.int("cna_clustered_light_set_add", set, this.#light(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override addClusteredPointLight(set: NativeHandle, light: PointLightSnapshot): number {
    const scope = this.#routes.scope();
    try {
      const structure = new WasmStruct(
        this.#routes.module, "CNA_PointLightEXT",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_PointLightEXT.size),
      );
      this.#routes.invoke("cna_point_light_ext_init", structure.pointer);
      structure
        .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
        .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
        .setF32("intensity", light.Intensity)
        .setF32("range", light.Range)
        .setU8("casts_shadows", light.CastsShadows ? 1 : 0);
      return this.#mem.int("cna_clustered_light_set_add_point", set, structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override addClusteredSpotLight(set: NativeHandle, light: SpotLightSnapshot): number {
    const scope = this.#routes.scope();
    try {
      const structure = new WasmStruct(
        this.#routes.module, "CNA_SpotLightEXT",
        scope.allocate(WASM_STRUCT_LAYOUTS.CNA_SpotLightEXT.size),
      );
      this.#routes.invoke("cna_spot_light_ext_init", structure.pointer);
      structure
        .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
        .setF32Array("direction", [light.Direction.X, light.Direction.Y, light.Direction.Z])
        .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
        .setF32("intensity", light.Intensity)
        .setF32("range", light.Range)
        .setF32("inner_angle", light.InnerAngle)
        .setF32("outer_angle", light.OuterAngle)
        .setU8("casts_shadows", light.CastsShadows ? 1 : 0);
      return this.#mem.int("cna_clustered_light_set_add_spot", set, structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override replaceClusteredLightAt(
    set: NativeHandle, index: number, light: ClusteredLightSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_clustered_light_set_replace_at", set, Math.trunc(index), this.#light(scope, light));
    } finally {
      scope.dispose();
    }
  }

  public override getClusteredLightAt(
    set: NativeHandle, index: number,
  ): ClusteredLightSnapshot {
    const scope = this.#routes.scope();
    try {
      const structure = this.#allocateLight(scope);
      this.#routes.invoke(
        "cna_clustered_light_set_get_at", set, Math.trunc(index), structure.pointer);
      return this.#readLight(structure);
    } finally {
      scope.dispose();
    }
  }

  public override copyClusteredLights(set: NativeHandle): readonly ClusteredLightSnapshot[] {
    const layout = WASM_STRUCT_LAYOUTS.CNA_ClusteredLightEXT;
    return this.#mem.probedArray(
      "cna_clustered_light_set_copy_lights", [set], layout.size, (base, written) =>
        Array.from({ length: written }, (_, index) => this.#readLight(new WasmStruct(
          this.#routes.module, "CNA_ClusteredLightEXT", base + layout.size * index))));
  }

  public override getClusteredLightBoundsAt(
    set: NativeHandle, index: number,
  ): BoundingSphereSnapshot {
    return this.#sphere("cna_clustered_light_set_get_bounds_at", set, Math.trunc(index));
  }

  public override copyClusteredLightBounds(set: NativeHandle): readonly BoundingSphereSnapshot[] {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingSphere;
    return this.#mem.probedArray(
      "cna_clustered_light_set_copy_bounds", [set], layout.size, (base, written) => {
        const view = this.#routes.view();
        return Array.from({ length: written }, (_, index) => {
          const at = base + layout.size * index + layout.fields.center.offset;
          return {
            Center: {
              X: view.getFloat32(at, true),
              Y: view.getFloat32(at + 4, true),
              Z: view.getFloat32(at + 8, true),
            },
            Radius: view.getFloat32(
              base + layout.size * index + layout.fields.radius.offset, true),
          };
        });
      });
  }

  // --- the grid, whose slicing is a formula the public API documents ----------------------------

  public override setClusterGridProjection(
    grid: NativeHandle, projection: readonly number[], nearPlane: number, farPlane: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_clustered_light_grid_set_projection", grid,
        this.#mem.writeMatrix(scope, projection), nearPlane, farPlane,
      );
    } finally {
      scope.dispose();
    }
  }

  public override getClusterGridInverseProjection(grid: NativeHandle): readonly number[] {
    return this.#mem.matrix("cna_clustered_light_grid_get_inverse_projection", grid);
  }

  public override getClusterSliceForViewDistance(grid: NativeHandle, distance: number): number {
    return this.#mem.int("cna_clustered_light_grid_slice_for_view_distance", grid, distance);
  }

  public override getClusterBounds(
    grid: NativeHandle, x: number, y: number, slice: number,
  ): ClusterBoundsSnapshot {
    return this.#mem.bounds(
      "cna_clustered_light_grid_cluster_bounds", grid,
      Math.trunc(x), Math.trunc(y), Math.trunc(slice));
  }

  // --- the assignment ---------------------------------------------------------------------------

  /** Every light's influence sphere at once, so the assignment sees one array rather than many. */
  public override assignClusteredLights(
    assignment: NativeHandle, grid: NativeHandle, view: readonly number[],
    bounds: readonly BoundingSphereSnapshot[],
  ): void {
    const scope = this.#routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingSphere;
      const buffer = scope.allocate(layout.size * Math.max(bounds.length, 1));
      const memory = this.#routes.view();
      bounds.forEach((sphere, index) => {
        const at = buffer + layout.size * index;
        memory.setFloat32(at + layout.fields.center.offset, sphere.Center.X, true);
        memory.setFloat32(at + layout.fields.center.offset + 4, sphere.Center.Y, true);
        memory.setFloat32(at + layout.fields.center.offset + 8, sphere.Center.Z, true);
        memory.setFloat32(at + layout.fields.radius.offset, sphere.Radius, true);
      });
      this.#routes.invoke(
        "cna_clustered_light_assignment_assign", assignment, grid,
        this.#mem.writeMatrix(scope, view), buffer, BigInt(bounds.length),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getAssignmentLightCount(assignment: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_assignment_get_light_count", assignment);
  }

  public override getAssignmentClusterCount(assignment: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_assignment_get_cluster_count", assignment);
  }

  public override getAssignmentTotalReferenceCount(assignment: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_assignment_get_total_reference_count", assignment);
  }

  public override getAssignmentMaxLightsPerCluster(assignment: NativeHandle): number {
    return this.#mem.int("cna_clustered_light_assignment_get_max_lights_per_cluster", assignment);
  }

  /** Which lights reach one cluster, as an `int32_t` array counted through the copy route. */
  public override copyLightsInCluster(
    assignment: NativeHandle, clusterIndex: number,
  ): readonly number[] {
    return this.#mem.probedArray(
      "cna_clustered_light_assignment_copy_lights_in_cluster",
      [assignment, Math.trunc(clusterIndex)], 4, (base, written) => {
        const view = this.#routes.view();
        return Array.from({ length: written }, (_, index) =>
          view.getInt32(base + index * 4, true));
      });
  }

  // --- the shadow budget ------------------------------------------------------------------------

  public override selectShadowCasters(
    policy: NativeHandle, lights: NativeHandle, view: readonly number[],
    projection: readonly number[], cameraPosition: Vector3Snapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#mem.withVector3(cameraPosition, (position) => this.#routes.invoke(
        "cna_clustered_shadow_policy_select", policy, lights,
        this.#mem.writeMatrix(scope, view), this.#mem.writeMatrix(scope, projection), position,
      ));
    } finally {
      scope.dispose();
    }
  }

  public override getShadowPolicyRequestCount(policy: NativeHandle): number {
    return this.#mem.int("cna_clustered_shadow_policy_get_request_count", policy);
  }

  public override getShadowPolicyRefusedCount(policy: NativeHandle): number {
    return this.#mem.int("cna_clustered_shadow_policy_get_refused_count", policy);
  }

  // --- the growable light structure -------------------------------------------------------------

  #allocateLight(scope: WasmScope): WasmStruct {
    const structure = new WasmStruct(
      this.#routes.module, "CNA_ClusteredLightEXT",
      scope.allocate(WASM_STRUCT_LAYOUTS.CNA_ClusteredLightEXT.size),
    );
    // `struct_size` selects which fields CNA reads, so the initializer runs before anything is
    // written and before anything is read back into.
    this.#routes.invoke("cna_clustered_light_ext_init", structure.pointer);
    return structure;
  }

  /** Writes a `CNA_ClusteredLightEXT` into a caller-owned scope. */
  #light(scope: WasmScope, light: ClusteredLightSnapshot): number {
    const structure = this.#allocateLight(scope);
    structure
      .setU32("type", light.Type)
      .setU8("casts_shadows", light.CastsShadows ? 1 : 0)
      .setF32Array("position", [light.Position.X, light.Position.Y, light.Position.Z])
      .setF32Array("direction", [light.Direction.X, light.Direction.Y, light.Direction.Z])
      .setF32Array("color", [light.Color.X, light.Color.Y, light.Color.Z])
      .setF32("intensity", light.Intensity)
      .setF32("range", light.Range)
      .setF32("inner_angle", light.InnerAngle)
      .setF32("outer_angle", light.OuterAngle);
    return structure.pointer;
  }

  /** Reads a `CNA_ClusteredLightEXT` a route has written. */
  #readLight(structure: WasmStruct): ClusteredLightSnapshot {
    const vector = (field: string): Vector3Snapshot => {
      const [X, Y, Z] = structure.getF32Array(field) as [number, number, number];
      return { X, Y, Z };
    };
    return {
      Type: structure.getU32("type"),
      Position: vector("position"),
      Direction: vector("direction"),
      Color: vector("color"),
      Intensity: structure.getF32("intensity"),
      Range: structure.getF32("range"),
      InnerAngle: structure.getF32("inner_angle"),
      OuterAngle: structure.getF32("outer_angle"),
      CastsShadows: structure.getU8("casts_shadows") !== 0,
    };
  }

  #sphere(route: string, ...args: readonly (number | bigint)[]): BoundingSphereSnapshot {
    const layout = WASM_STRUCT_LAYOUTS.CNA_BoundingSphere;
    const scope = this.#routes.scope();
    try {
      const out = scope.allocate(layout.size);
      this.#routes.invoke(route, ...args, out);
      const view = this.#routes.view();
      const at = out + layout.fields.center.offset;
      return {
        Center: {
          X: view.getFloat32(at, true),
          Y: view.getFloat32(at + 4, true),
          Z: view.getFloat32(at + 8, true),
        },
        Radius: view.getFloat32(out + layout.fields.radius.offset, true),
      };
    } finally {
      scope.dispose();
    }
  }

  /**
   * A counted `int32_t` array, probed for its length and then copied.
   *
   * These three read back through the same shape and were generated through the *matrix* reader,
   * because their TypeScript return is `readonly number[]` and so is a matrix's. Sixteen floats
   * and a variable-length integer array are not the same thing, and `verify-route-calls.mjs` is
   * what separated them -- the matrix reader passed one argument where the route takes three.
   */
  #int32Array(route: string, handle: NativeHandle): readonly number[] {
    return this.#mem.probedArray(route, [handle], 4, (base, written) => {
      const view = this.#routes.view();
      return Array.from({ length: written }, (_, index) => view.getInt32(base + index * 4, true));
    });
  }

}
