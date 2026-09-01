// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaEffectBackend` facade: `BasicEffect`, and compiled effects.
//
// Until this existed a browser could draw sprites and nothing else: no effect meant no 3D draw,
// whatever buffers it had. `BasicEffect` is what XNA's own samples draw untextured and textured
// geometry with, so it is the one that makes the vertex and index buffers beside it useful.
//
// The other four stock effects refuse **by name**. Each needs its own dozen routes and its own
// evidence, and a facade that quietly accepted them and set only the fields it happened to share
// would draw the wrong thing rather than say it could not.
//
// The second half is a *compiled* effect, which is a different kind of thing entirely: a program
// CNA parses out of `.fxb` bytes, whose parameters exist only because that binary declares them.
// A stock effect's native parameter collection is genuinely empty, so this facade answered every
// reflection question with an empty array and was right to. A compiled effect's is not, and an
// artifact built with `CNA_EASYGL_COMPILED_EFFECTS` will load one -- so the same empty answer
// became a lie the moment the artifact could carry the runtime. Reflection, the tagged value
// accessors and technique selection are all real here now, and a stock effect still reflects
// nothing because CNA still says it has nothing.

import { CnaEffectBackendBase } from "../backend-base.js";
import type {
  BlendStateSnapshot, DepthStencilStateSnapshot, NativeEffectAnnotationSnapshot,
  NativeEffectParameterSnapshot, NativeEffectPassSnapshot,
  NativeEffectReflectionSnapshot, NativeEffectTechniqueSnapshot, RasterizerStateSnapshot,
  SamplerStateSnapshot, StockEffectSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmScope, WasmStruct, type WasmRouteTable } from "./module.js";

/** The `CNA_StockEffectKind` this slice implements. */
const BASIC_EFFECT = 0;

/**
 * How deep a parameter's elements and members are followed.
 *
 * A guard against a malformed effect describing a cycle, not a shape anything legal has -- the
 * same cap the Node-API backend applies, for the same reason.
 */
const PARAMETER_DEPTH_LIMIT = 8;

/** `CNA_EffectParameterClass` identities used to choose an annotation accessor. */
const PARAMETER_CLASS_VECTOR = 1;
const PARAMETER_CLASS_MATRIX = 2;

/** `CNA_EffectParameterType` identities used to choose an annotation accessor. */
const PARAMETER_TYPE_BOOL = 1;
const PARAMETER_TYPE_INT32 = 2;
const PARAMETER_TYPE_SINGLE = 3;
const PARAMETER_TYPE_STRING = 4;

/** The C type behind a `CNA_EffectValueType` tag. */
type EffectValueKind = "bool" | "int32" | "float";

/**
 * The C type and component count a `CNA_EffectValueType` tag names.
 *
 * Every tagged call has to agree with CNA about both, because the route takes a `void*` whose real
 * type the tag decides: disagreeing is a wrong-sized write into CNA's storage, not a type error.
 * The Node-API backend keeps the same table for the same reason, and the two must not drift --
 * a `Vector4` that arrived as three components on one backend and four on the other would be a
 * parity failure no public API could see.
 */
function describeEffectValueType(valueType: number): { kind: EffectValueKind; count: number } {
  switch (valueType) {
    case 0: return { kind: "bool", count: 1 };            // BOOLEAN
    case 1: return { kind: "int32", count: 1 };           // INT32
    case 2: return { kind: "float", count: 1 };           // SINGLE
    case 3: case 4: return { kind: "float", count: 16 };  // MATRIX, MATRIX_TRANSPOSE
    case 5: return { kind: "float", count: 4 };           // QUATERNION
    case 6: return { kind: "float", count: 2 };           // VECTOR2
    case 7: return { kind: "float", count: 3 };           // VECTOR3
    case 8: return { kind: "float", count: 4 };           // VECTOR4
    default: throw new RangeError(`unknown effect parameter value type ${valueType}`);
  }
}

/**
 * Writes `total` components of a tagged value.
 *
 * All three C types are four bytes wide under wasm32 -- `CNA_Bool` included -- so the stride is
 * the same and only the encoding differs. A caller always passes plain numbers, so a boolean
 * arrives as 0 or 1 and is written as CNA's own `CNA_TRUE`/`CNA_FALSE`.
 */
function writeTaggedValues(
  view: DataView, pointer: number, kind: EffectValueKind, components: readonly number[],
  total: number,
): void {
  for (let index = 0; index < total; index += 1) {
    const value = components[index] ?? 0;
    const at = pointer + index * 4;
    if (kind === "bool") view.setUint32(at, value !== 0 ? 1 : 0, true);
    else if (kind === "int32") view.setInt32(at, value | 0, true);
    else view.setFloat32(at, value, true);
  }
}

/** Reads `total` components of a tagged value back as plain numbers. */
function readTaggedValues(
  view: DataView, pointer: number, kind: EffectValueKind, total: number,
): number[] {
  const values: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const at = pointer + index * 4;
    if (kind === "bool") values.push(view.getUint32(at, true) !== 0 ? 1 : 0);
    else if (kind === "int32") values.push(view.getInt32(at, true));
    else values.push(view.getFloat32(at, true));
  }
  return values;
}

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

  /**
   * A compiled `.fxb`, handed straight to CNA.
   *
   * This slice covers `BasicEffect` and refuses the other stock effects by name, so a compiled
   * effect looks at first like something it should refuse too. It is not the same case. The stock
   * refusals are about routes this backend does not implement; a compiled effect is about a
   * *runtime* the artifact may or may not have been built with, and only the artifact can answer
   * that. CNA builds the compiled-effect runtime into the EasyGL family -- `WEBGL2` included --
   * when `CNA_EASYGL_COMPILED_EFFECTS` is on, reports the answer through
   * `CNA_GRAPHICS_CAPABILITY_COMPILED_EFFECTS`, and refuses the bytes with a named
   * `NOT_SUPPORTED` when it is off rather than drawing with a stock shader instead.
   *
   * Refusing here would have made that unanswerable: the binding would decline before CNA was
   * consulted, and a browser consumer would be told the *binding* has no route when what actually
   * varies is how their artifact was built. So the bytes go through, and whatever comes back is
   * CNA's own answer for the artifact in front of it.
   */
  public override createEffectCompiled(device: NativeHandle, bytes: Uint8Array): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const payload = scope.allocateBytes(bytes);
      const out = scope.allocate(8);
      this.#routes.invoke(
        "cna_effect_create_compiled", device, payload, BigInt(bytes.byteLength), out,
      );
      return this.#routes.view().getBigUint64(out, true);
    } finally {
      scope.dispose();
    }
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
                Annotations: this.#readAnnotations("cna_effect_pass_get_annotations", pass),
              });
            }
            techniques.push({
              Handle: technique,
              Name: name,
              Passes: passes,
              // Read rather than assumed empty: annotations are declared by the compiled binary,
              // so a stock effect answers with none and a compiled one answers with its own.
              Annotations: this.#readAnnotations(
                "cna_effect_technique_get_annotations", technique),
            });
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

  /**
   * Every parameter the loaded effect declares, with its array elements, structure members and
   * annotations.
   *
   * A stock effect still answers with an empty array -- CNA's own collection for one is empty, on
   * every build measured -- so nothing about `BasicEffect` changes here. What changes is that the
   * empty answer is now CNA's rather than this file's: a compiled effect loaded by an artifact
   * built with `CNA_EASYGL_COMPILED_EFFECTS` declares real parameters, and returning `[]` for one
   * of those would hand a browser consumer a shader it could draw with and not one uniform it
   * could set. That is exactly the defect `test/effect-reflection.integration.mjs` was written for
   * on the Node side.
   *
   * Each handle is an owned view CNA minted for this call. The managed `Effect` parents them to
   * its own lifetime and releases them through {@link destroyEffectParameter}, so a partial
   * failure here has to release the ones already taken -- otherwise a reflection that threw
   * half-way would leak a view per parameter with nobody left holding it.
   */
  public override getEffectParameters(effect: NativeHandle): readonly NativeEffectParameterSnapshot[] {
    const collection = this.#routes.outHandle("cna_effect_get_parameters", effect);
    const owned: NativeHandle[] = [];
    try {
      const parameters = this.#readParameterCollection(collection, 0, owned);
      this.#routes.invoke("cna_effect_parameter_collection_destroy", collection);
      return parameters;
    } catch (error) {
      for (const handle of owned) {
        try { this.#routes.invoke("cna_effect_parameter_destroy", handle); } catch { /* rollback */ }
      }
      try { this.#routes.invoke("cna_effect_parameter_collection_destroy", collection); }
      catch { /* rollback */ }
      throw error;
    }
  }

  /** One parameter collection, remembering every view it takes so a failure can release them. */
  #readParameterCollection(
    collection: NativeHandle, depth: number, owned: NativeHandle[],
  ): NativeEffectParameterSnapshot[] {
    const count = Number(
      this.#routes.outU64("cna_effect_parameter_collection_get_count", collection),
    );
    const parameters: NativeEffectParameterSnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      const handle = this.#routes.outHandle(
        "cna_effect_parameter_collection_get_at", collection, BigInt(index),
      );
      // Remembered before anything else can fail: a view that is not remembered is a leak.
      owned.push(handle);
      parameters.push(this.#readParameter(handle, depth, owned));
    }
    return parameters;
  }

  /**
   * One parameter and, recursively, its elements and members.
   *
   * The depth cap matches the Node-API backend's and exists for the same reason: it guards against
   * a malformed effect describing a cycle, not against a shape anything legal has.
   */
  #readParameter(
    parameter: NativeHandle, depth: number, owned: NativeHandle[],
  ): NativeEffectParameterSnapshot {
    const scope = this.#routes.scope();
    let info: { rows: number; columns: number; klass: number; type: number };
    try {
      const structure = allocateStruct(this.#routes.module, scope, "CNA_EffectParameterInfo");
      this.#routes.invoke("cna_effect_parameter_get_info", parameter, structure.pointer);
      info = {
        rows: structure.getI32("row_count"),
        columns: structure.getI32("column_count"),
        klass: structure.getU32("parameter_class"),
        type: structure.getU32("parameter_type"),
      };
    } finally {
      scope.dispose();
    }
    const name = this.#routes.copyString(
      "cna_effect_parameter_get_name_byte_count", "cna_effect_parameter_copy_name", parameter,
    );
    const semantic = this.#routes.copyString(
      "cna_effect_parameter_get_semantic_byte_count", "cna_effect_parameter_copy_semantic",
      parameter,
    );
    let elements: NativeEffectParameterSnapshot[] = [];
    let members: NativeEffectParameterSnapshot[] = [];
    if (depth < PARAMETER_DEPTH_LIMIT) {
      elements = this.#readNestedParameters(
        "cna_effect_parameter_get_elements", parameter, depth + 1, owned);
      members = this.#readNestedParameters(
        "cna_effect_parameter_get_structure_members", parameter, depth + 1, owned);
    }
    return {
      Handle: parameter,
      Name: name,
      Semantic: semantic,
      RowCount: info.rows,
      ColumnCount: info.columns,
      ParameterClass: info.klass,
      ParameterType: info.type,
      Elements: elements,
      StructureMembers: members,
      Annotations: this.#readAnnotations("cna_effect_parameter_get_annotations", parameter),
    };
  }

  /** A nested collection view, always destroyed: only the parameters inside it are handed out. */
  #readNestedParameters(
    route: string, parameter: NativeHandle, depth: number, owned: NativeHandle[],
  ): NativeEffectParameterSnapshot[] {
    const collection = this.#routes.outHandle(route, parameter);
    try {
      return this.#readParameterCollection(collection, depth, owned);
    } finally {
      this.#routes.invoke("cna_effect_parameter_collection_destroy", collection);
    }
  }

  /**
   * An annotation collection, read whole.
   *
   * Nothing later reads an annotation back through a handle, so both the collection and every
   * element view are released here rather than handed out -- the same lifetime the Node-API
   * backend gives them.
   */
  #readAnnotations(route: string, owner: NativeHandle): NativeEffectAnnotationSnapshot[] {
    const collection = this.#routes.outHandle(route, owner);
    try {
      const count = Number(
        this.#routes.outU64("cna_effect_annotation_collection_get_count", collection),
      );
      const annotations: NativeEffectAnnotationSnapshot[] = [];
      for (let index = 0; index < count; index += 1) {
        const annotation = this.#routes.outHandle(
          "cna_effect_annotation_collection_get_at", collection, BigInt(index),
        );
        try {
          annotations.push(this.#readAnnotation(annotation));
        } finally {
          this.#routes.invoke("cna_effect_annotation_destroy", annotation);
        }
      }
      return annotations;
    } finally {
      this.#routes.invoke("cna_effect_annotation_collection_destroy", collection);
    }
  }

  #readAnnotation(annotation: NativeHandle): NativeEffectAnnotationSnapshot {
    const scope = this.#routes.scope();
    let rows = 0, columns = 0, klass = 0, type = 0;
    try {
      const structure = allocateStruct(this.#routes.module, scope, "CNA_EffectAnnotationInfo");
      this.#routes.invoke("cna_effect_annotation_get_info", annotation, structure.pointer);
      rows = structure.getI32("row_count");
      columns = structure.getI32("column_count");
      klass = structure.getU32("parameter_class");
      type = structure.getU32("parameter_type");
    } finally {
      scope.dispose();
    }
    return {
      Name: this.#routes.copyString(
        "cna_effect_annotation_get_name_byte_count", "cna_effect_annotation_copy_name", annotation,
      ),
      RowCount: rows,
      ColumnCount: columns,
      ParameterClass: klass,
      ParameterType: type,
      Value: this.#readAnnotationValue(annotation, klass, type),
    };
  }

  /**
   * An annotation's value, through the accessor its declared class and type name.
   *
   * `null` for a shape CNA has no accessor for, never a stand-in zero: a zero would be
   * indistinguishable from an annotation that really says zero.
   */
  #readAnnotationValue(
    annotation: NativeHandle, klass: number, type: number,
  ): NativeEffectAnnotationSnapshot["Value"] {
    if (type === PARAMETER_TYPE_STRING) {
      return this.#routes.copyString(
        "cna_effect_annotation_get_value_string_byte_count",
        "cna_effect_annotation_copy_value_string", annotation,
      );
    }
    if (klass === PARAMETER_CLASS_MATRIX) {
      return this.#readAnnotationFloats("cna_effect_annotation_get_value_matrix", annotation, 16);
    }
    if (klass === PARAMETER_CLASS_VECTOR) {
      // Widest first: CNA refuses an accessor whose width the annotation does not have, which is a
      // cheaper and more truthful test than reading the column count and trusting it.
      for (const [route, width] of [
        ["cna_effect_annotation_get_value_vector4", 4],
        ["cna_effect_annotation_get_value_vector3", 3],
        ["cna_effect_annotation_get_value_vector2", 2],
      ] as const) {
        const value = this.#tryReadAnnotationFloats(route, annotation, width);
        if (value !== null) return value;
      }
      return null;
    }
    if (type === PARAMETER_TYPE_BOOL) {
      return this.#readAnnotationScalar("cna_effect_annotation_get_value_boolean", annotation, 1)
        !== 0;
    }
    if (type === PARAMETER_TYPE_INT32) {
      return this.#readAnnotationScalar("cna_effect_annotation_get_value_int32", annotation, 4);
    }
    if (type === PARAMETER_TYPE_SINGLE) {
      return this.#readAnnotationFloats(
        "cna_effect_annotation_get_value_single", annotation, 1)[0] ?? null;
    }
    return null;
  }

  #readAnnotationFloats(route: string, annotation: NativeHandle, count: number): number[] {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(count * 4);
      this.#routes.invoke(route, annotation, pointer);
      const view = this.#routes.view();
      return Array.from({ length: count }, (_, index) => view.getFloat32(pointer + index * 4, true));
    } finally {
      scope.dispose();
    }
  }

  /** The same, but a refusal is the answer rather than an error -- the width probe above needs it. */
  #tryReadAnnotationFloats(
    route: string, annotation: NativeHandle, count: number,
  ): number[] | null {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(count * 4);
      if (this.#routes.call(route, annotation, pointer) !== 0) return null;
      const view = this.#routes.view();
      return Array.from({ length: count }, (_, index) => view.getFloat32(pointer + index * 4, true));
    } finally {
      scope.dispose();
    }
  }

  #readAnnotationScalar(route: string, annotation: NativeHandle, width: number): number {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(4);
      this.#routes.invoke(route, annotation, pointer);
      const view = this.#routes.view();
      return width === 1 ? view.getUint8(pointer) : view.getInt32(pointer, true);
    } finally {
      scope.dispose();
    }
  }

  public override destroyEffectParameter(parameter: NativeHandle): void {
    this.#routes.invoke("cna_effect_parameter_destroy", parameter);
  }

  /**
   * One tagged scalar, written into CNA's own storage.
   *
   * The tag decides both the C type and the component count, so every call has to agree with CNA
   * about both: getting it wrong is a wrong-sized write into native storage rather than a type
   * error anything would catch. {@link describeEffectValueType} is that agreement in one place.
   */
  public override setEffectParameterValue(
    parameter: NativeHandle, valueType: number, components: readonly number[],
  ): void {
    const { kind, count } = describeEffectValueType(valueType);
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(count * 4);
      writeTaggedValues(this.#routes.view(), pointer, kind, components, count);
      this.#routes.invoke("cna_effect_parameter_set_value", parameter, valueType, pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getEffectParameterValue(parameter: NativeHandle, valueType: number): number[] {
    const { kind, count } = describeEffectValueType(valueType);
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(count * 4);
      this.#routes.invoke("cna_effect_parameter_get_value", parameter, valueType, pointer);
      return readTaggedValues(this.#routes.view(), pointer, kind, count);
    } finally {
      scope.dispose();
    }
  }

  /**
   * The array overload. XNA's `SetValue(Matrix[])` and friends land here; without it a reflected
   * effect would take an array, store it managed and never send it to the shader -- which looks
   * like a working call and draws the wrong thing.
   */
  public override setEffectParameterValues(
    parameter: NativeHandle, valueType: number, components: readonly number[],
  ): void {
    const { kind, count } = describeEffectValueType(valueType);
    if (count === 0 || components.length % count !== 0) {
      throw new RangeError("an effect parameter array needs a whole number of elements");
    }
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocate(Math.max(components.length * 4, 1));
      writeTaggedValues(this.#routes.view(), pointer, kind, components, components.length);
      this.#routes.invoke(
        "cna_effect_parameter_set_values", parameter, valueType, pointer,
        BigInt(components.length / count),
      );
    } finally {
      scope.dispose();
    }
  }

  public override getEffectParameterValues(
    parameter: NativeHandle, valueType: number, requested: number,
  ): number[] {
    const { kind, count } = describeEffectValueType(valueType);
    const capacity = requested * count;
    const scope = this.#routes.scope();
    try {
      const buffer = scope.allocate(Math.max(capacity * 4, 1));
      const produced = scope.allocate(8);
      this.#routes.invoke(
        "cna_effect_parameter_get_values", parameter, valueType, BigInt(requested), buffer,
        BigInt(capacity), produced,
      );
      const view = this.#routes.view();
      const total = Number(view.getBigUint64(produced, true)) * count;
      return readTaggedValues(view, buffer, kind, total);
    } finally {
      scope.dispose();
    }
  }

  /** A sampler is not a tagged value -- CNA gives it its own route -- so it gets its own crossing. */
  public override setEffectParameterTexture(
    parameter: NativeHandle, textureType: number, texture: NativeHandle,
  ): void {
    this.#routes.invoke(
      "cna_effect_parameter_set_value_texture", parameter, textureType, texture,
    );
  }

  public override setEffectParameterString(parameter: NativeHandle, value: string): void {
    const scope = this.#routes.scope();
    try {
      const text = scope.allocateUtf8(value);
      const view = new WasmStruct(
        this.#routes.module, "CNA_StringView", scope.allocate(WASM_STRUCT_LAYOUTS.CNA_StringView.size),
      );
      view.setPointer("data", text.pointer).setU64("byte_length", BigInt(text.byteLength));
      this.#routes.invoke("cna_effect_parameter_set_value_string", parameter, view.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setEffectCurrentTechnique(
    effect: NativeHandle, technique: NativeHandle,
  ): void {
    this.#routes.invoke("cna_effect_set_current_technique", effect, technique);
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
