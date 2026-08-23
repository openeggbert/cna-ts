import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { BoundingSphere } from "../BoundingSphere.js";
import type { TryResult } from "../Contracts.js";
import { Matrix } from "../Matrix.js";
import { Vector3 } from "../Vector3.js";
import type { Effect } from "./Effect.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import type { IndexBuffer } from "./IndexBuffer.js";
import type { VertexBuffer } from "./VertexBuffer.js";
import {
  createEnumerator as createBoneEnumerator,
  Enumerator as BoneEnumerator,
} from "./ModelBoneCollection/Enumerator.js";
import {
  createEnumerator as createEffectEnumerator,
  Enumerator as EffectEnumerator,
} from "./ModelEffectCollection/Enumerator.js";
import {
  createEnumerator as createMeshEnumerator,
  Enumerator as MeshEnumerator,
} from "./ModelMeshCollection/Enumerator.js";
import {
  createEnumerator as createPartEnumerator,
  Enumerator as PartEnumerator,
} from "./ModelMeshPartCollection/Enumerator.js";

function copyMatrix(value: Matrix): Matrix {
  if (!(value instanceof Matrix)) throw new ArgumentException("value must be a Matrix");
  return new Matrix(
    value.M11, value.M12, value.M13, value.M14,
    value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34,
    value.M41, value.M42, value.M43, value.M44,
  );
}

function copySphere(value: BoundingSphere): BoundingSphere {
  if (!(value instanceof BoundingSphere)) throw new ArgumentException("value must be a BoundingSphere");
  return new BoundingSphere(new Vector3(value.Center.X, value.Center.Y, value.Center.Z), value.Radius);
}

function indexOf<T>(items: readonly T[], item: T): number { return items.indexOf(item); }

function checkedIndex(index: number, count: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new ArgumentOutOfRangeException("index");
  }
  return index;
}

function copyTo<T>(items: readonly T[], array: T[], arrayIndex: number): void {
  if (array == null) throw new ArgumentNullException("array");
  if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex + items.length > array.length) {
    throw new ArgumentOutOfRangeException("arrayIndex");
  }
  items.forEach((item, index) => { array[arrayIndex + index] = item; });
}

function missingName(): never {
  const error = new Error("The requested model item was not found");
  error.name = "KeyNotFoundException";
  throw error;
}

function validName(value: string, parameter: string): string {
  if (value == null || value.length === 0) throw new ArgumentNullException(parameter);
  return value;
}

type BoneState = {
  readonly Name: string;
  readonly Index: number;
  readonly ChildrenItems: ModelBone[];
  readonly Children: ModelBoneCollection;
  Parent: ModelBone | null;
  Transform: Matrix;
};
const boneStates = new WeakMap<ModelBone, BoneState>();

function boneState(value: ModelBone): BoneState {
  const state = boneStates.get(value);
  if (!state) throw new InvalidOperationException("ModelBone is created by the content model builder");
  return state;
}

export class ModelBone {
  private constructor() {}
  public get Children(): ModelBoneCollection { return boneState(this).Children; }
  public get Index(): number { return boneState(this).Index; }
  public get Name(): string { return boneState(this).Name; }
  public get Parent(): ModelBone { return boneState(this).Parent as unknown as ModelBone; }
  public get Transform(): Matrix { return copyMatrix(boneState(this).Transform); }
  public set Transform(value: Matrix) { boneState(this).Transform = copyMatrix(value); }
}

const boneCollectionItems = new WeakMap<ModelBoneCollection, readonly ModelBone[]>();
function bonesOf(value: ModelBoneCollection): readonly ModelBone[] {
  const result = boneCollectionItems.get(value);
  if (!result) throw new InvalidOperationException("ModelBoneCollection is model-owned");
  return result;
}

export class ModelBoneCollection implements Iterable<ModelBone> {
  private constructor() {}
  public get Count(): number { return bonesOf(this).length; }
  public Get(index: number): ModelBone;
  public Get(boneName: string): ModelBone;
  public Get(indexOrName: number | string): ModelBone {
    if (typeof indexOrName === "number") return bonesOf(this)[checkedIndex(indexOrName, this.Count)];
    const result = this.TryGetValue(indexOrName);
    return result.Success ? result.Value : missingName();
  }
  public Contains(item: ModelBone): boolean { return indexOf(bonesOf(this), item) >= 0; }
  public CopyTo(array: ModelBone[], arrayIndex: number): void { copyTo(bonesOf(this), array, arrayIndex); }
  public GetEnumerator(): BoneEnumerator { return createBoneEnumerator(this); }
  public IndexOf(item: ModelBone): number { return indexOf(bonesOf(this), item); }
  public TryGetValue(boneName: string): TryResult<ModelBone> {
    const name = validName(boneName, "boneName");
    const value = bonesOf(this).find((bone) => bone.Name === name);
    return value == null
      ? { Success: false, Value: undefined as unknown as ModelBone }
      : { Success: true, Value: value };
  }
  public *[Symbol.iterator](): IterableIterator<ModelBone> {
    for (let index = 0; index < this.Count; index += 1) yield this.Get(index);
  }
}

export namespace ModelBoneCollection { export const Enumerator = BoneEnumerator; }

type PartState = {
  readonly Device: GraphicsDevice;
  Parent: ModelMesh | null;
  Effect: Effect | null;
  readonly IndexBuffer: IndexBuffer | null;
  readonly VertexBuffer: VertexBuffer | null;
  readonly NumVertices: number;
  readonly PrimitiveCount: number;
  readonly StartIndex: number;
  readonly VertexOffset: number;
  Tag: unknown;
};
const partStates = new WeakMap<ModelMeshPart, PartState>();

function partState(value: ModelMeshPart): PartState {
  const state = partStates.get(value);
  if (!state) throw new InvalidOperationException("ModelMeshPart is created by the content model builder");
  return state;
}

export class ModelMeshPart {
  private constructor() {}
  public get Effect(): Effect { return partState(this).Effect as unknown as Effect; }
  public set Effect(value: Effect) {
    const state = partState(this);
    const next = value as Effect | null;
    if (next === state.Effect) return;
    if (next != null && next.GraphicsDevice !== state.Device) {
      throw new ArgumentException("The effect belongs to a different GraphicsDevice");
    }
    const parent = state.Parent;
    const previous = state.Effect;
    state.Effect = next;
    if (parent != null) updateMeshEffects(parent, previous, next, this);
  }
  public get IndexBuffer(): IndexBuffer { return partState(this).IndexBuffer as unknown as IndexBuffer; }
  public get NumVertices(): number { return partState(this).NumVertices; }
  public get PrimitiveCount(): number { return partState(this).PrimitiveCount; }
  public get StartIndex(): number { return partState(this).StartIndex; }
  public get Tag(): unknown { return partState(this).Tag; }
  public set Tag(value: unknown) { partState(this).Tag = value; }
  public get VertexBuffer(): VertexBuffer { return partState(this).VertexBuffer as unknown as VertexBuffer; }
  public get VertexOffset(): number { return partState(this).VertexOffset; }
}

const partCollectionItems = new WeakMap<ModelMeshPartCollection, readonly ModelMeshPart[]>();
function partsOf(value: ModelMeshPartCollection): readonly ModelMeshPart[] {
  const result = partCollectionItems.get(value);
  if (!result) throw new InvalidOperationException("ModelMeshPartCollection is model-owned");
  return result;
}

export class ModelMeshPartCollection implements Iterable<ModelMeshPart> {
  private constructor() {}
  public get Count(): number { return partsOf(this).length; }
  public Get(index: number): ModelMeshPart { return partsOf(this)[checkedIndex(index, this.Count)]; }
  public Contains(item: ModelMeshPart): boolean { return indexOf(partsOf(this), item) >= 0; }
  public CopyTo(array: ModelMeshPart[], arrayIndex: number): void { copyTo(partsOf(this), array, arrayIndex); }
  public GetEnumerator(): PartEnumerator { return createPartEnumerator(this); }
  public IndexOf(item: ModelMeshPart): number { return indexOf(partsOf(this), item); }
  public *[Symbol.iterator](): IterableIterator<ModelMeshPart> {
    for (let index = 0; index < this.Count; index += 1) yield this.Get(index);
  }
}

export namespace ModelMeshPartCollection { export const Enumerator = PartEnumerator; }

const effectCollectionItems = new WeakMap<ModelEffectCollection, Effect[]>();
function effectsOf(value: ModelEffectCollection): Effect[] {
  const result = effectCollectionItems.get(value);
  if (!result) throw new InvalidOperationException("ModelEffectCollection is mesh-owned");
  return result;
}

export class ModelEffectCollection implements Iterable<Effect> {
  private constructor() {}
  public get Count(): number { return effectsOf(this).length; }
  public Get(index: number): Effect { return effectsOf(this)[checkedIndex(index, this.Count)]; }
  public Contains(item: Effect): boolean { return indexOf(effectsOf(this), item) >= 0; }
  public CopyTo(array: Effect[], arrayIndex: number): void { copyTo(effectsOf(this), array, arrayIndex); }
  public GetEnumerator(): EffectEnumerator { return createEffectEnumerator(this); }
  public IndexOf(item: Effect): number { return indexOf(effectsOf(this), item); }
  public *[Symbol.iterator](): IterableIterator<Effect> {
    for (let index = 0; index < this.Count; index += 1) yield this.Get(index);
  }
}

export namespace ModelEffectCollection { export const Enumerator = EffectEnumerator; }

type MeshState = {
  readonly Device: GraphicsDevice;
  readonly Name: string;
  ParentBone: ModelBone | null;
  BoundingSphere: BoundingSphere;
  Tag: unknown;
  readonly PartItems: readonly ModelMeshPart[];
  readonly MeshParts: ModelMeshPartCollection;
  readonly Effects: ModelEffectCollection;
};
const meshStates = new WeakMap<ModelMesh, MeshState>();

function meshState(value: ModelMesh): MeshState {
  const state = meshStates.get(value);
  if (!state) throw new InvalidOperationException("ModelMesh is created by the content model builder");
  return state;
}

export class ModelMesh {
  private constructor() {}
  public get BoundingSphere(): BoundingSphere { return copySphere(meshState(this).BoundingSphere); }
  public get Effects(): ModelEffectCollection { return meshState(this).Effects; }
  public get MeshParts(): ModelMeshPartCollection { return meshState(this).MeshParts; }
  public get Name(): string { return meshState(this).Name; }
  public get ParentBone(): ModelBone { return meshState(this).ParentBone as unknown as ModelBone; }
  public get Tag(): unknown { return meshState(this).Tag; }
  public set Tag(value: unknown) { meshState(this).Tag = value; }
  public Draw(): void {
    const state = meshState(this);
    for (const part of state.PartItems) {
      const effect = part.Effect;
      if (effect == null) {
        throw new InvalidOperationException(`Model mesh '${state.Name}' contains a part with no effect`);
      }
      const passes = effect.CurrentTechnique.Passes;
      for (let index = 0; index < passes.Count; index += 1) passes.Get(index).Apply();
      throw new NativeUnavailableError(
        "ModelMesh.Draw requires CNA vertex/index binding and indexed-draw routes",
      );
    }
  }
}

function updateMeshEffects(
  mesh: ModelMesh,
  previous: Effect | null,
  next: Effect | null,
  changedPart: ModelMeshPart,
): void {
  const state = meshState(mesh);
  const effects = effectsOf(state.Effects);
  if (previous != null && !state.PartItems.some((part) => part !== changedPart && part.Effect === previous)) {
    const index = effects.indexOf(previous);
    if (index >= 0) effects.splice(index, 1);
  }
  if (next != null && !effects.includes(next)) effects.push(next);
}

const meshCollectionItems = new WeakMap<ModelMeshCollection, readonly ModelMesh[]>();
function meshesOf(value: ModelMeshCollection): readonly ModelMesh[] {
  const result = meshCollectionItems.get(value);
  if (!result) throw new InvalidOperationException("ModelMeshCollection is model-owned");
  return result;
}

export class ModelMeshCollection implements Iterable<ModelMesh> {
  private constructor() {}
  public get Count(): number { return meshesOf(this).length; }
  public Get(index: number): ModelMesh;
  public Get(meshName: string): ModelMesh;
  public Get(indexOrName: number | string): ModelMesh {
    if (typeof indexOrName === "number") return meshesOf(this)[checkedIndex(indexOrName, this.Count)];
    const result = this.TryGetValue(indexOrName);
    return result.Success ? result.Value : missingName();
  }
  public Contains(item: ModelMesh): boolean { return indexOf(meshesOf(this), item) >= 0; }
  public CopyTo(array: ModelMesh[], arrayIndex: number): void { copyTo(meshesOf(this), array, arrayIndex); }
  public GetEnumerator(): MeshEnumerator { return createMeshEnumerator(this); }
  public IndexOf(item: ModelMesh): number { return indexOf(meshesOf(this), item); }
  public TryGetValue(meshName: string): TryResult<ModelMesh> {
    const name = validName(meshName, "meshName");
    const value = meshesOf(this).find((mesh) => mesh.Name === name);
    return value == null
      ? { Success: false, Value: undefined as unknown as ModelMesh }
      : { Success: true, Value: value };
  }
  public *[Symbol.iterator](): IterableIterator<ModelMesh> {
    for (let index = 0; index < this.Count; index += 1) yield this.Get(index);
  }
}

export namespace ModelMeshCollection { export const Enumerator = MeshEnumerator; }

type ModelState = {
  readonly Bones: ModelBoneCollection;
  readonly BoneItems: readonly ModelBone[];
  readonly Meshes: ModelMeshCollection;
  readonly MeshItems: readonly ModelMesh[];
  readonly Root: ModelBone | null;
  Tag: unknown;
};
const modelStates = new WeakMap<Model, ModelState>();

function modelState(value: Model): ModelState {
  const state = modelStates.get(value);
  if (!state) throw new InvalidOperationException("Model is created by ContentManager");
  return state;
}

export class Model {
  private constructor() {}
  public get Bones(): ModelBoneCollection { return modelState(this).Bones; }
  public get Meshes(): ModelMeshCollection { return modelState(this).Meshes; }
  public get Root(): ModelBone { return modelState(this).Root as unknown as ModelBone; }
  public get Tag(): unknown { return modelState(this).Tag; }
  public set Tag(value: unknown) { modelState(this).Tag = value; }

  public CopyAbsoluteBoneTransformsTo(destinationBoneTransforms: Matrix[]): void {
    const state = modelState(this);
    checkTransformArray(destinationBoneTransforms, state.BoneItems.length, "destinationBoneTransforms");
    const visiting = new Set<ModelBone>();
    const complete = new Set<ModelBone>();
    const visit = (bone: ModelBone): Matrix => {
      if (complete.has(bone)) return destinationBoneTransforms[bone.Index];
      if (visiting.has(bone)) throw new InvalidOperationException("The model bone graph contains a cycle");
      visiting.add(bone);
      const parent = bone.Parent;
      const transform = parent == null ? bone.Transform : Matrix.Multiply(bone.Transform, visit(parent));
      destinationBoneTransforms[bone.Index] = transform;
      visiting.delete(bone);
      complete.add(bone);
      return transform;
    };
    state.BoneItems.forEach(visit);
  }

  public CopyBoneTransformsFrom(sourceBoneTransforms: Matrix[]): void {
    const state = modelState(this);
    checkTransformArray(sourceBoneTransforms, state.BoneItems.length, "sourceBoneTransforms");
    state.BoneItems.forEach((bone, index) => { bone.Transform = sourceBoneTransforms[index]; });
  }

  public CopyBoneTransformsTo(destinationBoneTransforms: Matrix[]): void {
    const state = modelState(this);
    checkTransformArray(destinationBoneTransforms, state.BoneItems.length, "destinationBoneTransforms");
    state.BoneItems.forEach((bone, index) => { destinationBoneTransforms[index] = bone.Transform; });
  }

  public Draw(world: Matrix, view: Matrix, projection: Matrix): void {
    const state = modelState(this);
    const absolute = new Array<Matrix>(state.BoneItems.length);
    this.CopyAbsoluteBoneTransformsTo(absolute);
    for (const mesh of state.MeshItems) {
      const parent = mesh.ParentBone ?? state.Root;
      const bone = parent == null ? Matrix.Identity : absolute[parent.Index];
      for (const effect of mesh.Effects) {
        const matrices = effect as unknown as {
          World?: Matrix; View?: Matrix; Projection?: Matrix;
        };
        if (!("World" in matrices) || !("View" in matrices) || !("Projection" in matrices)) {
          throw new InvalidOperationException(
            `${effect.constructor.name} does not implement IEffectMatrices`,
          );
        }
        matrices.World = Matrix.Multiply(bone, world);
        matrices.View = copyMatrix(view);
        matrices.Projection = copyMatrix(projection);
      }
      mesh.Draw();
    }
  }
}

function checkTransformArray(value: Matrix[], count: number, parameter: string): void {
  if (value == null) throw new ArgumentNullException(parameter);
  if (value.length < count) throw new ArgumentOutOfRangeException(parameter);
}

type ModelDescription = {
  readonly Bones: ReadonlyArray<{
    readonly Name: string;
    readonly Transform: Matrix;
    readonly ParentIndex?: number;
  }>;
  readonly Meshes: ReadonlyArray<{
    readonly Name: string;
    readonly ParentBoneIndex: number;
    readonly BoundingSphere: BoundingSphere;
    readonly Tag?: unknown;
    readonly Parts: ReadonlyArray<{
      readonly VertexBuffer: VertexBuffer | null;
      readonly IndexBuffer: IndexBuffer | null;
      readonly Effect: Effect | null;
      readonly NumVertices: number;
      readonly PrimitiveCount: number;
      readonly StartIndex: number;
      readonly VertexOffset: number;
      readonly Tag?: unknown;
    }>;
  }>;
  readonly RootBoneIndex?: number;
  readonly Tag?: unknown;
};

function construct<T>(type: unknown): T { return Object.create((type as { prototype: object }).prototype) as T; }

export function createModelForInternalUse(
  graphicsDevice: GraphicsDevice,
  description: ModelDescription,
): Model {
  if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
  if (description == null) throw new ArgumentNullException("description");
  const bones = description.Bones.map((item, index) => {
    if (item.Name == null) throw new ArgumentNullException("bone.Name");
    const bone = construct<ModelBone>(ModelBone);
    const childItems: ModelBone[] = [];
    const children = construct<ModelBoneCollection>(ModelBoneCollection);
    boneCollectionItems.set(children, childItems);
    boneStates.set(bone, {
      Name: item.Name, Index: index, Transform: copyMatrix(item.Transform),
      Parent: null, Children: children, ChildrenItems: childItems,
    });
    return bone;
  });
  description.Bones.forEach((item, index) => {
    if (item.ParentIndex == null || item.ParentIndex < 0) return;
    const parentIndex = checkedIndex(item.ParentIndex, bones.length);
    if (parentIndex === index) throw new ArgumentException("A model bone cannot parent itself");
    const parent = bones[parentIndex];
    const state = boneState(bones[index]);
    state.Parent = parent;
    boneState(parent).ChildrenItems.push(bones[index]);
  });

  const meshes = description.Meshes.map((item) => {
    if (item.Name == null) throw new ArgumentNullException("mesh.Name");
    const mesh = construct<ModelMesh>(ModelMesh);
    const parts = item.Parts.map((part) => {
      for (const [value, name] of [
        [part.NumVertices, "NumVertices"], [part.PrimitiveCount, "PrimitiveCount"],
        [part.StartIndex, "StartIndex"], [part.VertexOffset, "VertexOffset"],
      ] as const) {
        if (!Number.isInteger(value) || value < 0) throw new ArgumentOutOfRangeException(name);
      }
      if (part.Effect != null && part.Effect.GraphicsDevice !== graphicsDevice) {
        throw new ArgumentException("A model effect belongs to a different GraphicsDevice");
      }
      if (part.VertexBuffer != null && part.VertexBuffer.GraphicsDevice !== graphicsDevice) {
        throw new ArgumentException("A model vertex buffer belongs to a different GraphicsDevice");
      }
      if (part.IndexBuffer != null && part.IndexBuffer.GraphicsDevice !== graphicsDevice) {
        throw new ArgumentException("A model index buffer belongs to a different GraphicsDevice");
      }
      const result = construct<ModelMeshPart>(ModelMeshPart);
      partStates.set(result, {
        Device: graphicsDevice, Parent: mesh, Effect: part.Effect,
        IndexBuffer: part.IndexBuffer, VertexBuffer: part.VertexBuffer,
        NumVertices: part.NumVertices, PrimitiveCount: part.PrimitiveCount,
        StartIndex: part.StartIndex, VertexOffset: part.VertexOffset, Tag: part.Tag,
      });
      return result;
    });
    const partCollection = construct<ModelMeshPartCollection>(ModelMeshPartCollection);
    partCollectionItems.set(partCollection, parts);
    const effects = construct<ModelEffectCollection>(ModelEffectCollection);
    effectCollectionItems.set(effects, []);
    const parentBone = bones[checkedIndex(item.ParentBoneIndex, bones.length)];
    meshStates.set(mesh, {
      Device: graphicsDevice, Name: item.Name, ParentBone: parentBone,
      BoundingSphere: copySphere(item.BoundingSphere), Tag: item.Tag,
      PartItems: parts, MeshParts: partCollection, Effects: effects,
    });
    for (const part of parts) {
      const effect = part.Effect;
      if (effect != null && !effectsOf(effects).includes(effect)) effectsOf(effects).push(effect);
    }
    return mesh;
  });

  const boneCollection = construct<ModelBoneCollection>(ModelBoneCollection);
  boneCollectionItems.set(boneCollection, bones);
  const meshCollection = construct<ModelMeshCollection>(ModelMeshCollection);
  meshCollectionItems.set(meshCollection, meshes);
  const rootIndex = description.RootBoneIndex ?? (bones.length === 0 ? -1 : 0);
  const root = rootIndex < 0 ? null : bones[checkedIndex(rootIndex, bones.length)];
  const model = construct<Model>(Model);
  modelStates.set(model, {
    Bones: boneCollection, BoneItems: bones, Meshes: meshCollection, MeshItems: meshes,
    Root: root, Tag: description.Tag,
  });
  return model;
}
