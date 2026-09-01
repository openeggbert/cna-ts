// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaEffectBackend` facade, scoped to `BasicEffect`.
//
// Until this existed a browser could draw sprites and nothing else: no effect meant no 3D draw,
// whatever buffers it had. `BasicEffect` is what XNA's own samples draw untextured and textured
// geometry with, so it is the one that makes the vertex and index buffers beside it useful.
//
// The other four stock effects refuse **by name**. Each needs its own dozen routes and its own
// evidence, and a facade that quietly accepted them and set only the fields it happened to share
// would draw the wrong thing rather than say it could not.

import { CnaEffectBackendBase } from "../backend-base.js";
import type {
  BlendStateSnapshot, DepthStencilStateSnapshot, NativeEffectPassSnapshot,
  NativeEffectReflectionSnapshot, NativeEffectTechniqueSnapshot, RasterizerStateSnapshot,
  SamplerStateSnapshot, StockEffectSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { WasmScope, type WasmRouteTable } from "./module.js";

/** The `CNA_StockEffectKind` this slice implements. */
const BASIC_EFFECT = 0;

export class WasmEffectBackend extends CnaEffectBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's effect slice, which covers ` +
      "BasicEffect; the Node-API backend implements the rest",
    );
  }

  public override createStockEffect(device: NativeHandle, kind: number): NativeHandle {
    if (kind !== BASIC_EFFECT) {
      throw new Error(
        `the WebAssembly backend's effect slice covers BasicEffect only; stock effect kind ` +
        `${kind} needs the Node-API backend`,
      );
    }
    return this.#routes.outHandle("cna_basic_effect_create", device);
  }

  public override applyEffect(effect: NativeHandle): void {
    this.#routes.invoke("cna_effect_apply", effect);
  }

  public override destroyEffect(effect: NativeHandle): void {
    this.#routes.invoke("cna_effect_destroy", effect);
  }

  /**
   * A `CNA_Matrix` and a `CNA_Vector3` are taken **by value**, and under wasm32 a struct that is
   * not a single scalar is passed indirectly — the callee receives a pointer to a caller-owned
   * copy. So these write the bytes and pass the pointer. The browser test asserts a world matrix
   * round-trips through `cna_effect_matrices_get_world`, which is what turns that from a claim
   * about the ABI into a measurement.
   */
  #matrix(scope: WasmScope, values: readonly number[]): number {
    const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
    const view = new DataView(this.#routes.module.HEAPU8.buffer as ArrayBuffer);
    for (let index = 0; index < 16; index += 1) {
      view.setFloat32(pointer + index * 4, values[index] ?? 0, true);
    }
    return pointer;
  }

  #vector3(scope: WasmScope, values: readonly number[]): number {
    const pointer = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Vector3.size);
    const view = new DataView(this.#routes.module.HEAPU8.buffer as ArrayBuffer);
    for (let index = 0; index < 3; index += 1) {
      view.setFloat32(pointer + index * 4, values[index] ?? 0, true);
    }
    return pointer;
  }

  public override syncStockEffect(
    effect: NativeHandle, kind: number, snapshot: StockEffectSnapshot,
  ): void {
    if (kind !== BASIC_EFFECT) {
      throw new Error(
        `the WebAssembly backend can only synchronise a BasicEffect; kind ${kind} needs the ` +
        "Node-API backend",
      );
    }
    const scope = this.#routes.scope();
    try {
      const invoke = (name: string, ...args: readonly (number | bigint)[]): void =>
        this.#routes.invoke(name, effect, ...args);
      invoke("cna_effect_matrices_set_world", this.#matrix(scope, snapshot.World));
      invoke("cna_effect_matrices_set_view", this.#matrix(scope, snapshot.View));
      invoke("cna_effect_matrices_set_projection", this.#matrix(scope, snapshot.Projection));
      invoke("cna_effect_fog_set_color", this.#vector3(scope, snapshot.FogColor));
      invoke("cna_effect_fog_set_enabled", snapshot.FogEnabled ? 1 : 0);
      invoke("cna_effect_fog_set_start", snapshot.FogStart);
      invoke("cna_effect_fog_set_end", snapshot.FogEnd);
      invoke("cna_basic_effect_set_alpha", snapshot.Alpha);
      invoke("cna_basic_effect_set_diffuse_color", this.#vector3(scope, snapshot.DiffuseColor));
      invoke("cna_basic_effect_set_emissive_color", this.#vector3(scope, snapshot.EmissiveColor));
      invoke("cna_basic_effect_set_specular_color", this.#vector3(scope, snapshot.SpecularColor));
      invoke("cna_basic_effect_set_specular_power", snapshot.SpecularPower);
      invoke(
        "cna_basic_effect_set_prefer_per_pixel_lighting",
        snapshot.PreferPerPixelLighting ? 1 : 0,
      );
      invoke("cna_basic_effect_set_vertex_color_enabled", snapshot.VertexColorEnabled ? 1 : 0);
      invoke("cna_basic_effect_set_texture_enabled", snapshot.TextureEnabled ? 1 : 0);
      invoke("cna_basic_effect_set_texture", snapshot.Texture);
      invoke(
        "cna_effect_lights_set_ambient_color", this.#vector3(scope, snapshot.AmbientLightColor),
      );
      invoke("cna_effect_lights_set_enabled", snapshot.LightingEnabled ? 1 : 0);
      // XNA's stock effects have exactly three directional lights, and the managed side always
      // sends three; anything else is a snapshot this facade did not build and will not guess at.
      if (snapshot.Lights.length !== 3) {
        throw new Error("a stock effect carries exactly three directional lights");
      }
      snapshot.Lights.forEach((light, index) => {
        const handle = this.#routes.outHandle(
          "cna_effect_lights_get_directional_light", effect, index,
        );
        try {
          this.#routes.invoke(
            "cna_directional_light_set_direction", handle, this.#vector3(scope, light.Direction),
          );
          this.#routes.invoke(
            "cna_directional_light_set_diffuse_color", handle,
            this.#vector3(scope, light.DiffuseColor),
          );
          this.#routes.invoke(
            "cna_directional_light_set_specular_color", handle,
            this.#vector3(scope, light.SpecularColor),
          );
          this.#routes.invoke(
            "cna_directional_light_set_enabled", handle, light.Enabled ? 1 : 0,
          );
        } finally {
          // The light is a borrowed view onto the effect's own; releasing the handle does not
          // touch the light, and holding it would leak one per Apply.
          this.#routes.invoke("cna_directional_light_destroy", handle);
        }
      });
    } finally {
      scope.dispose();
    }
  }

  public override getEffectReflection(effect: NativeHandle): NativeEffectReflectionSnapshot {
    const current = this.#routes.outHandle("cna_effect_get_current_technique", effect);
    let currentIndex = 0;
    try {
      currentIndex = this.#routes.outU32("cna_effect_technique_get_index_ext", current);
    } finally {
      this.#routes.invoke("cna_effect_technique_destroy", current);
    }
    const collection = this.#routes.outHandle("cna_effect_get_techniques", effect);
    try {
      const count = Number(this.#routes.outU64("cna_effect_technique_collection_get_count", collection));
      const techniques: NativeEffectTechniqueSnapshot[] = [];
      for (let index = 0; index < count; index += 1) {
        const technique = this.#routes.outHandle(
          "cna_effect_technique_collection_get_at", collection, BigInt(index),
        );
        try {
          const name = this.#routes.copyString(
            "cna_effect_technique_get_name_byte_count", "cna_effect_technique_copy_name", technique,
          );
          const passCollection = this.#routes.outHandle(
            "cna_effect_technique_get_passes", technique,
          );
          try {
            const passCount = Number(
              this.#routes.outU64("cna_effect_pass_collection_get_count", passCollection),
            );
            const passes: NativeEffectPassSnapshot[] = [];
            for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
              const pass = this.#routes.outHandle(
                "cna_effect_pass_collection_get_at", passCollection, BigInt(passIndex),
              );
              passes.push({
                Handle: pass,
                Name: this.#routes.copyString(
                  "cna_effect_pass_get_name_byte_count", "cna_effect_pass_copy_name", pass,
                ),
              });
            }
            techniques.push({ Handle: technique, Name: name, Passes: passes });
          } finally {
            this.#routes.invoke("cna_effect_pass_collection_destroy", passCollection);
          }
        } catch (error) {
          this.#routes.invoke("cna_effect_technique_destroy", technique);
          throw error;
        }
      }
      return { CurrentTechnique: currentIndex, Techniques: techniques };
    } finally {
      this.#routes.invoke("cna_effect_technique_collection_destroy", collection);
    }
  }

  public override applyEffectPass(pass: NativeHandle): void {
    this.#routes.invoke("cna_effect_pass_apply", pass);
  }

  public override destroyEffectTechnique(technique: NativeHandle): void {
    this.#routes.invoke("cna_effect_technique_destroy", technique);
  }

  public override destroyEffectPass(pass: NativeHandle): void {
    this.#routes.invoke("cna_effect_pass_destroy", pass);
  }

  public override beginSpriteBatchWithEffect(
    _spriteBatch: NativeHandle, _sortMode: number, _blend: BlendStateSnapshot,
    _sampler: SamplerStateSnapshot, _depth: DepthStencilStateSnapshot,
    _rasterizer: RasterizerStateSnapshot, _effect: NativeHandle,
    _transform: readonly number[] | null,
  ): void { return this.unsupported("beginSpriteBatchWithEffect"); }
}
