import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type {
  CnaEffectBackend,
  NativeEffectReflectionSnapshot,
  NativeEffectTechniqueSnapshot,
  StockEffectSnapshot,
} from "../../../../internal/backend.js";
import { NativeResourceLifetime, type NativeHandle } from "../../../../internal/ownership.js";
import { Matrix } from "../Matrix.js";
import { Quaternion } from "../Quaternion.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import { Vector4 } from "../Vector4.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "./GraphicsDevice.js";
import {
  assertGraphicsResourceActiveForInternalUse,
  attachGraphicsResourceForInternalUse,
  GraphicsResource,
  guardGraphicsResourceDisposeForInternalUse,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";
import { Texture } from "./Texture.js";
import { Texture2D } from "./Texture2D.js";
import { Texture3D } from "./Texture3D.js";
import { TextureCube } from "./TextureCube.js";

export enum EffectParameterClass {
  Scalar = 0,
  Vector = 1,
  Matrix = 2,
  Object = 3,
  Struct = 4,
}

export enum EffectParameterType {
  Void = 0,
  Bool = 1,
  Int32 = 2,
  Single = 3,
  String = 4,
  Texture = 5,
  Texture1D = 6,
  Texture2D = 7,
  Texture3D = 8,
  TextureCube = 9,
}

type EffectValue =
  boolean | number | string | Matrix | Quaternion | Vector2 | Vector3 | Vector4 | Texture |
  boolean[] | number[] | Matrix[] | Quaternion[] | Vector2[] | Vector3[] | Vector4[];

type NativeEffectState = {
  readonly Backend: CnaEffectBackend;
  readonly Lifetime: NativeResourceLifetime;
  BeforeApply: (() => void) | null;
  LeaseCount: number;
};

type EffectOwner = {
  Disposed: boolean;
  readonly Device: GraphicsDevice;
  Native: NativeEffectState | null;
};

function active(owner: EffectOwner): void {
  if (owner.Disposed || owner.Device.IsDisposed) throw new ObjectDisposedException("Effect");
}

type EffectAnnotationDescription = {
  readonly Name: string;
  readonly Semantic?: string;
  readonly ParameterClass: EffectParameterClass;
  readonly ParameterType: EffectParameterType;
  readonly RowCount?: number;
  readonly ColumnCount?: number;
  readonly Value: boolean | number | string | Matrix | Vector2 | Vector3 | Vector4;
}

type AnnotationState = EffectAnnotationDescription & { readonly Owner: EffectOwner };
const annotationStates = new WeakMap<EffectAnnotation, AnnotationState>();

export class EffectAnnotation {
  public get ColumnCount(): number { return annotationState(this).ColumnCount ?? 1; }
  public get Name(): string { return annotationState(this).Name; }
  public get ParameterClass(): EffectParameterClass { return annotationState(this).ParameterClass; }
  public get ParameterType(): EffectParameterType { return annotationState(this).ParameterType; }
  public get RowCount(): number { return annotationState(this).RowCount ?? 1; }
  public get Semantic(): string { return annotationState(this).Semantic ?? ""; }
  public GetValueBoolean(): boolean { return scalarAnnotation(this, "boolean") as boolean; }
  public GetValueInt32(): number { return Math.trunc(scalarAnnotation(this, "number") as number); }
  public GetValueMatrix(): Matrix { return copyMatrix(valueInstance(annotationState(this).Value, Matrix)); }
  public GetValueSingle(): number { return Math.fround(scalarAnnotation(this, "number") as number); }
  public GetValueString(): string { return scalarAnnotation(this, "string") as string; }
  public GetValueVector2(): Vector2 { return copyVector2(valueInstance(annotationState(this).Value, Vector2)); }
  public GetValueVector3(): Vector3 { return copyVector3(valueInstance(annotationState(this).Value, Vector3)); }
  public GetValueVector4(): Vector4 { return copyVector4(valueInstance(annotationState(this).Value, Vector4)); }
}

function annotationState(value: EffectAnnotation): AnnotationState {
  const state = annotationStates.get(value);
  if (!state) throw new TypeError("EffectAnnotation is an effect-owned reflection view");
  active(state.Owner);
  return state;
}

function scalarAnnotation(value: EffectAnnotation, type: string): unknown {
  const result = annotationState(value).Value;
  if (typeof result !== type) throw new InvalidOperationException(`Annotation value is not ${type}`);
  return result;
}

export class EffectAnnotationCollection implements Iterable<EffectAnnotation> {
  readonly #owner: EffectOwner;
  readonly #items: readonly EffectAnnotation[];
  private constructor(owner: EffectOwner, items: readonly EffectAnnotation[]) {
    this.#owner = owner; this.#items = items;
  }
  public get Count(): number { active(this.#owner); return this.#items.length; }
  public Get(index: number): EffectAnnotation;
  public Get(name: string): EffectAnnotation;
  public Get(indexOrName: number | string): EffectAnnotation {
    return collectionGet(this.#owner, this.#items, indexOrName, (item) => item.Name);
  }
  public GetEnumerator(): IterableIterator<EffectAnnotation> {
    active(this.#owner); return this.#items[Symbol.iterator]();
  }
  public [Symbol.iterator](): Iterator<EffectAnnotation> { return this.GetEnumerator(); }
}

type EffectParameterDescription = {
  readonly Name: string;
  readonly Semantic?: string;
  readonly ParameterClass: EffectParameterClass;
  readonly ParameterType: EffectParameterType;
  readonly RowCount?: number;
  readonly ColumnCount?: number;
  readonly Value?: EffectValue;
  readonly Annotations?: ReadonlyArray<EffectAnnotationDescription>;
  readonly Elements?: ReadonlyArray<EffectParameterDescription>;
  readonly StructureMembers?: ReadonlyArray<EffectParameterDescription>;
}

type ParameterState = {
  readonly Owner: EffectOwner;
  readonly Device: GraphicsDevice;
  readonly Description: EffectParameterDescription;
  readonly Annotations: EffectAnnotationCollection;
  readonly Elements: EffectParameterCollection;
  readonly StructureMembers: EffectParameterCollection;
  Value: EffectValue;
};
const parameterStates = new WeakMap<EffectParameter, ParameterState>();

export class EffectParameter {
  public get Annotations(): EffectAnnotationCollection { return parameterState(this).Annotations; }
  public get ColumnCount(): number { return parameterState(this).Description.ColumnCount ?? 1; }
  public get Elements(): EffectParameterCollection { return parameterState(this).Elements; }
  public get Name(): string { return parameterState(this).Description.Name; }
  public get ParameterClass(): EffectParameterClass { return parameterState(this).Description.ParameterClass; }
  public get ParameterType(): EffectParameterType { return parameterState(this).Description.ParameterType; }
  public get RowCount(): number { return parameterState(this).Description.RowCount ?? 1; }
  public get Semantic(): string { return parameterState(this).Description.Semantic ?? ""; }
  public get StructureMembers(): EffectParameterCollection { return parameterState(this).StructureMembers; }

  public GetValueBoolean(): boolean { return getScalar(this, "boolean") as boolean; }
  public GetValueBooleanArray(count: number): boolean[] { return getArray(this, count, "boolean") as boolean[]; }
  public GetValueInt32(): number { return Math.trunc(getScalar(this, "number") as number); }
  public GetValueInt32Array(count: number): number[] {
    return (getArray(this, count, "number") as number[]).map(Math.trunc);
  }
  public GetValueMatrix(): Matrix { return copyMatrix(getInstance(this, Matrix)); }
  public GetValueMatrixArray(count: number): Matrix[] { return getInstances(this, count, Matrix).map(copyMatrix); }
  public GetValueMatrixTranspose(): Matrix { return Matrix.Transpose(this.GetValueMatrix()); }
  public GetValueMatrixTransposeArray(count: number): Matrix[] {
    return this.GetValueMatrixArray(count).map(Matrix.Transpose);
  }
  public GetValueQuaternion(): Quaternion { return copyQuaternion(getInstance(this, Quaternion)); }
  public GetValueQuaternionArray(count: number): Quaternion[] {
    return getInstances(this, count, Quaternion).map(copyQuaternion);
  }
  public GetValueSingle(): number { return Math.fround(getScalar(this, "number") as number); }
  public GetValueSingleArray(count: number): number[] {
    return (getArray(this, count, "number") as number[]).map(Math.fround);
  }
  public GetValueString(): string { return getScalar(this, "string") as string; }
  public GetValueTexture2D(): Texture2D { return getInstance(this, Texture2D); }
  public GetValueTexture3D(): Texture3D { return getInstance(this, Texture3D); }
  public GetValueTextureCube(): TextureCube { return getInstance(this, TextureCube); }
  public GetValueVector2(): Vector2 { return copyVector2(getInstance(this, Vector2)); }
  public GetValueVector2Array(count: number): Vector2[] { return getInstances(this, count, Vector2).map(copyVector2); }
  public GetValueVector3(): Vector3 { return copyVector3(getInstance(this, Vector3)); }
  public GetValueVector3Array(count: number): Vector3[] { return getInstances(this, count, Vector3).map(copyVector3); }
  public GetValueVector4(): Vector4 { return copyVector4(getInstance(this, Vector4)); }
  public GetValueVector4Array(count: number): Vector4[] { return getInstances(this, count, Vector4).map(copyVector4); }

  public SetValue(value: Texture): void;
  public SetValue(value: Matrix): void;
  public SetValue(value: Matrix[]): void;
  public SetValue(value: Quaternion): void;
  public SetValue(value: Quaternion[]): void;
  public SetValue(value: Vector2): void;
  public SetValue(value: Vector2[]): void;
  public SetValue(value: Vector3): void;
  public SetValue(value: Vector3[]): void;
  public SetValue(value: Vector4): void;
  public SetValue(value: Vector4[]): void;
  public SetValue(value: boolean): void;
  public SetValue(value: boolean[]): void;
  public SetValue(value: number): void;
  public SetValue(value: number[]): void;
  public SetValue(value: string): void;
  public SetValue(value: EffectValue): void {
    const state = parameterState(this);
    if (value == null) throw new ArgumentNullException("value");
    if (value instanceof Texture && value.GraphicsDevice !== state.Device) {
      throw new InvalidOperationException("The texture belongs to a different GraphicsDevice");
    }
    state.Value = cloneValue(value);
  }
  public SetValueTranspose(value: Matrix): void;
  public SetValueTranspose(value: Matrix[]): void;
  public SetValueTranspose(value: Matrix | Matrix[]): void {
    parameterState(this).Value = Array.isArray(value)
      ? value.map(Matrix.Transpose)
      : Matrix.Transpose(value);
  }
}

function parameterState(value: EffectParameter): ParameterState {
  const state = parameterStates.get(value);
  if (!state) throw new TypeError("EffectParameter is an effect-owned reflection view");
  active(state.Owner);
  return state;
}

function getScalar(parameter: EffectParameter, type: string): unknown {
  const value = parameterState(parameter).Value;
  if (typeof value !== type) throw new InvalidOperationException(`Parameter value is not ${type}`);
  return value;
}

function checkedCount(count: number, length: number): number {
  if (!Number.isInteger(count) || count < 0 || count > length) throw new ArgumentOutOfRangeException("count");
  return count;
}

function getArray(parameter: EffectParameter, count: number, type: string): unknown[] {
  const value = parameterState(parameter).Value;
  if (!Array.isArray(value) || !value.every((item) => typeof item === type)) {
    throw new InvalidOperationException(`Parameter value is not a ${type} array`);
  }
  return value.slice(0, checkedCount(count, value.length));
}

type Constructor<T> = abstract new (...args: never[]) => T;
function valueInstance<T>(value: unknown, type: Constructor<T>): T {
  if (!(value instanceof type)) throw new InvalidOperationException(`Value is not ${type.name}`);
  return value;
}
function getInstance<T>(parameter: EffectParameter, type: Constructor<T>): T {
  return valueInstance(parameterState(parameter).Value, type);
}
function getInstances<T>(parameter: EffectParameter, count: number, type: Constructor<T>): T[] {
  const value = parameterState(parameter).Value;
  if (!Array.isArray(value) || !value.every((item) => item instanceof type)) {
    throw new InvalidOperationException(`Parameter value is not a ${type.name} array`);
  }
  return value.slice(0, checkedCount(count, value.length)) as T[];
}

export class EffectParameterCollection implements Iterable<EffectParameter> {
  readonly #owner: EffectOwner;
  readonly #items: readonly EffectParameter[];
  private constructor(owner: EffectOwner, items: readonly EffectParameter[]) {
    this.#owner = owner; this.#items = items;
  }
  public get Count(): number { active(this.#owner); return this.#items.length; }
  public Get(index: number): EffectParameter;
  public Get(name: string): EffectParameter;
  public Get(indexOrName: number | string): EffectParameter {
    return collectionGet(this.#owner, this.#items, indexOrName, (item) => item.Name);
  }
  public GetParameterBySemantic(semantic: string): EffectParameter {
    active(this.#owner);
    for (const parameter of this) if (parameter.Semantic === semantic) return parameter;
    return undefined as unknown as EffectParameter;
  }
  public GetEnumerator(): IterableIterator<EffectParameter> {
    active(this.#owner); return this.#items[Symbol.iterator]();
  }
  public [Symbol.iterator](): Iterator<EffectParameter> { return this.GetEnumerator(); }
}

type EffectPassDescription = {
  readonly Name: string;
  readonly Annotations?: ReadonlyArray<EffectAnnotationDescription>;
}
type PassState = {
  readonly Owner: EffectOwner;
  readonly Effect: Effect | null;
  readonly Name: string;
  readonly Annotations: EffectAnnotationCollection;
  readonly NativeLifetime: NativeResourceLifetime | null;
};
const passStates = new WeakMap<EffectPass, PassState>();

export class EffectPass {
  public get Annotations(): EffectAnnotationCollection { return passState(this).Annotations; }
  public get Name(): string { return passState(this).Name; }
  public Apply(): void {
    const state = passState(this);
    const native = state.Owner.Native;
    if (native != null && state.NativeLifetime != null) {
      native.BeforeApply?.();
      native.Backend.applyEffectPass(state.NativeLifetime.Handle);
      return;
    }
    throw new NativeUnavailableError("EffectPass.Apply requires the compiled CNA effect execution route");
  }
}

function passState(value: EffectPass): PassState {
  const state = passStates.get(value);
  if (!state) throw new TypeError("EffectPass is an effect-owned reflection view");
  active(state.Owner);
  return state;
}

export class EffectPassCollection implements Iterable<EffectPass> {
  readonly #owner: EffectOwner;
  readonly #items: readonly EffectPass[];
  private constructor(owner: EffectOwner, items: readonly EffectPass[]) {
    this.#owner = owner; this.#items = items;
  }
  public get Count(): number { active(this.#owner); return this.#items.length; }
  public Get(index: number): EffectPass;
  public Get(name: string): EffectPass;
  public Get(indexOrName: number | string): EffectPass {
    return collectionGet(this.#owner, this.#items, indexOrName, (item) => item.Name);
  }
  public GetEnumerator(): IterableIterator<EffectPass> {
    active(this.#owner); return this.#items[Symbol.iterator]();
  }
  public [Symbol.iterator](): Iterator<EffectPass> { return this.GetEnumerator(); }
}

type EffectTechniqueDescription = {
  readonly Name: string;
  readonly Annotations?: ReadonlyArray<EffectAnnotationDescription>;
  readonly Passes: ReadonlyArray<EffectPassDescription>;
}
type TechniqueState = {
  readonly Owner: EffectOwner;
  readonly Name: string;
  readonly Annotations: EffectAnnotationCollection;
  readonly Passes: EffectPassCollection;
  readonly NativeLifetime: NativeResourceLifetime | null;
};
const techniqueStates = new WeakMap<EffectTechnique, TechniqueState>();

export class EffectTechnique {
  public get Annotations(): EffectAnnotationCollection { return techniqueState(this).Annotations; }
  public get Name(): string { return techniqueState(this).Name; }
  public get Passes(): EffectPassCollection { return techniqueState(this).Passes; }
}

function techniqueState(value: EffectTechnique): TechniqueState {
  const state = techniqueStates.get(value);
  if (!state) throw new TypeError("EffectTechnique is an effect-owned reflection view");
  active(state.Owner);
  return state;
}

export class EffectTechniqueCollection implements Iterable<EffectTechnique> {
  readonly #owner: EffectOwner;
  readonly #items: readonly EffectTechnique[];
  private constructor(owner: EffectOwner, items: readonly EffectTechnique[]) {
    this.#owner = owner; this.#items = items;
  }
  public get Count(): number { active(this.#owner); return this.#items.length; }
  public Get(index: number): EffectTechnique;
  public Get(name: string): EffectTechnique;
  public Get(indexOrName: number | string): EffectTechnique {
    return collectionGet(this.#owner, this.#items, indexOrName, (item) => item.Name);
  }
  public GetEnumerator(): IterableIterator<EffectTechnique> {
    active(this.#owner); return this.#items[Symbol.iterator]();
  }
  public [Symbol.iterator](): Iterator<EffectTechnique> { return this.GetEnumerator(); }
}

type EffectDescription = {
  readonly Parameters?: ReadonlyArray<EffectParameterDescription>;
  readonly Techniques: ReadonlyArray<EffectTechniqueDescription>;
  readonly CurrentTechnique?: number;
}

type EffectState = {
  readonly Owner: EffectOwner;
  readonly Device: GraphicsDevice;
  readonly Parameters: EffectParameterCollection;
  readonly Techniques: EffectTechniqueCollection;
  readonly Description: EffectDescription;
  readonly Native: NativeEffectState | null;
  CurrentTechnique: EffectTechnique;
};
const effectStates = new WeakMap<Effect, EffectState>();
const managedStockCodes = new WeakMap<number[], number>();

export class Effect extends GraphicsResource {
  public constructor(cloneSource: Effect);
  public constructor(graphicsDevice: GraphicsDevice, effectCode: number[]);
  public constructor(
    graphicsDeviceOrClone: GraphicsDevice | Effect,
    effectCode?: number[],
    adoptedDescription?: EffectDescription,
    adoptedNative?: { readonly Backend: CnaEffectBackend; readonly Handle: NativeHandle },
  ) {
    super();
    if (graphicsDeviceOrClone == null) throw new ArgumentNullException("graphicsDevice");
    if (adoptedNative !== undefined && !(graphicsDeviceOrClone instanceof Effect)) {
      // Implementation-only adoption channel; the public overloads are unchanged.
      initializeReflectedNativeEffect(
        this, graphicsDeviceOrClone, adoptedNative.Backend, adoptedNative.Handle,
      );
      return;
    }
    if (graphicsDeviceOrClone instanceof Effect) {
      const source = effectState(graphicsDeviceOrClone);
      if (source.Native != null) {
        const handle = source.Native.Backend.cloneEffect(source.Native.Lifetime.Handle);
        initializeReflectedNativeEffect(this, source.Device, source.Native.Backend, handle);
      } else {
        initializeEffect(this, source.Device, snapshotEffectDescription(source));
      }
      return;
    }
    if (adoptedDescription !== undefined) {
      initializeEffect(this, graphicsDeviceOrClone, adoptedDescription);
      return;
    }
    const stockKind = effectCode === undefined ? undefined : managedStockCodes.get(effectCode);
    if (stockKind !== undefined) {
      const backend = graphicsDeviceBackendForInternalUse(graphicsDeviceOrClone).Effects;
      if (backend == null) {
        initializeEffect(this, graphicsDeviceOrClone, {
          Techniques: [{ Name: "Default", Passes: [{ Name: "P0" }] }],
        });
      } else {
        const handle = backend.createStockEffect(
          resolveGraphicsDeviceHandleForInternalUse(graphicsDeviceOrClone), stockKind,
        );
        initializeReflectedNativeEffect(this, graphicsDeviceOrClone, backend, handle);
      }
      return;
    }
    if (effectCode == null) throw new ArgumentNullException("effectCode");
    if (!Array.isArray(effectCode) || !effectCode.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new ArgumentException("effectCode must contain bytes");
    }
    const backend = graphicsDeviceBackendForInternalUse(graphicsDeviceOrClone).Effects;
    if (backend == null) {
      throw new NativeUnavailableError("Compiled Effect construction requires the CNA Effect backend");
    }
    const handle = backend.createEffectCompiled(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDeviceOrClone), Uint8Array.from(effectCode),
    );
    initializeReflectedNativeEffect(this, graphicsDeviceOrClone, backend, handle);
  }

  public get CurrentTechnique(): EffectTechnique { return effectState(this).CurrentTechnique; }
  public set CurrentTechnique(value: EffectTechnique) {
    if (value == null) throw new ArgumentNullException("value");
    const state = effectState(this);
    if (![...state.Techniques].includes(value)) {
      throw new InvalidOperationException("The technique belongs to a different Effect");
    }
    if (state.Native != null) {
      const technique = techniqueState(value).NativeLifetime;
      if (technique == null) throw new InvalidOperationException("The technique has no native identity");
      state.Native.Backend.setEffectCurrentTechnique(
        state.Native.Lifetime.Handle, technique.Handle,
      );
    }
    state.CurrentTechnique = value;
  }
  public get Parameters(): EffectParameterCollection { return effectState(this).Parameters; }
  public get Techniques(): EffectTechniqueCollection { return effectState(this).Techniques; }
  public Clone(): Effect { return new Effect(this); }
  protected OnApply(): void {
    const state = effectState(this);
    if (state.Native != null) {
      state.Native.BeforeApply?.();
      state.Native.Backend.applyEffect(state.Native.Lifetime.Handle);
      return;
    }
    throw new NativeUnavailableError("Effect execution requires the CNA effect apply route");
  }
}

export class EffectMaterial extends Effect {
  public constructor(cloneSource: Effect) { super(cloneSource); }
}

export function createEffectForInternalUse(
  graphicsDevice: GraphicsDevice,
  description: EffectDescription,
): Effect {
  type InternalEffectConstructor = new (
    device: GraphicsDevice,
    effectCode: number[],
    adoptedDescription: EffectDescription,
  ) => Effect;
  return new (Effect as unknown as InternalEffectConstructor)(graphicsDevice, [], description);
}

export function createManagedStockEffectCodeForInternalUse(kind = 0): number[] {
  const code: number[] = [];
  managedStockCodes.set(code, kind);
  return code;
}

export function configureStockEffectForInternalUse(
  effect: Effect,
  kind: number,
  snapshot: () => StockEffectSnapshot,
): void {
  const state = effectState(effect);
  const native = state.Native;
  if (native == null) return;
  native.BeforeApply = () => native.Backend.syncStockEffect(
    native.Lifetime.Handle, kind, snapshot(),
  );
}

export function prepareEffectForInternalUse(effect: Effect): void {
  const state = effectState(effect);
  if (state.Native == null) return;
  state.Native.BeforeApply?.();
}

/**
 * Wraps a native effect CNA handed out, in an `Effect` that releases it on `Dispose`.
 *
 * CNA's shadow map lends its caster effects: each `get` is a counted borrow that `cna_effect_destroy`
 * gives back, and the map refuses to be destroyed while one is outstanding. That release route is
 * exactly what an owned `Effect` lifetime already calls, so an adopted facade returns the borrow at
 * the moment its owner disposes it.
 */
export function adoptNativeEffectForInternalUse(
  device: GraphicsDevice, backend: CnaEffectBackend, handle: NativeHandle,
): Effect {
  return new (Effect as unknown as new (
    device: GraphicsDevice,
    effectCode: undefined,
    adoptedDescription: undefined,
    adoptedNative: { readonly Backend: CnaEffectBackend; readonly Handle: NativeHandle },
  ) => Effect)(device, undefined, undefined, { Backend: backend, Handle: handle });
}

export function resolveEffectHandleForInternalUse(effect: Effect): NativeHandle {
  const native = effectState(effect).Native;
  if (native == null) throw new NativeUnavailableError("Effect has no native handle");
  return native.Lifetime.Handle;
}

/** Internal: the Effect twin of {@link trackVertexBufferReleaseForInternalUse}. */
export function trackEffectReleaseForInternalUse(
  effect: Effect,
  teardown: () => void,
): () => void {
  const native = effectState(effect).Native;
  if (native == null) throw new NativeUnavailableError("Effect has no native handle");
  return native.Lifetime.TrackCallback(teardown);
}

/**
 * Hands the effect's native handle to another owner and leaves this wrapper owning nothing.
 *
 * For the CNA routes that consume an effect rather than borrowing it --
 * `cna_post_process_effect_pass_create_owning` is the one in the engine layer. After this the
 * wrapper is transferred rather than disposed: releasing it again would be a double free, and CNA
 * refuses the consumed handle with `INVALID_HANDLE` rather than crashing, which is how this was
 * measured.
 *
 * An Effect always has children -- a technique view and a pass view per technique, minted when the
 * reflection is read -- so the views are given back here before the handle goes. They release
 * cleanly on either side of the consume; doing it first is what keeps this wrapper's own teardown
 * from reaching a handle that is no longer ours.
 */
export function markEffectTransferredForInternalUse(effect: Effect): void {
  const native = effectState(effect).Native;
  if (native == null) throw new NativeUnavailableError("Effect has no native handle to transfer");
  native.Lifetime.ReleaseChildren();
  native.Lifetime.Transfer();
}

export function leaseEffectForInternalUse(effect: Effect): () => void {
  const native = effectState(effect).Native;
  if (native == null) throw new NativeUnavailableError("Effect has no executable native ownership");
  native.LeaseCount += 1;
  let activeLease = true;
  return () => {
    if (!activeLease) return;
    activeLease = false;
    native.LeaseCount -= 1;
  };
}

function effectState(effect: Effect): EffectState {
  assertGraphicsResourceActiveForInternalUse(effect);
  const state = effectStates.get(effect);
  if (!state) throw new NativeUnavailableError("Effect construction did not complete");
  active(state.Owner);
  return state;
}

function initializeEffect(effect: Effect, device: GraphicsDevice, description: EffectDescription): void {
  if (device == null) throw new ArgumentNullException("graphicsDevice");
  if (description.Techniques.length === 0) throw new ArgumentException("An Effect requires a technique");
  const owner: EffectOwner = { Device: device, Disposed: false, Native: null };
  const parameters = createParameters(owner, device, description.Parameters ?? []);
  const techniques = description.Techniques.map((item) => createTechnique(owner, item));
  const techniqueCollection = createCollection<EffectTechniqueCollection, EffectTechnique>(
    EffectTechniqueCollection, owner, techniques,
  );
  const current = description.CurrentTechnique ?? 0;
  if (!Number.isInteger(current) || current < 0 || current >= techniques.length) {
    throw new ArgumentOutOfRangeException("CurrentTechnique");
  }
  const state: EffectState = {
    Owner: owner,
    Device: device,
    Description: cloneDescription(description),
    Native: null,
    Parameters: parameters,
    Techniques: techniqueCollection,
    CurrentTechnique: techniques[current],
  };
  effectStates.set(effect, state);
  attachGraphicsResourceForInternalUse(effect, device);
  const parent = graphicsDeviceParentLifetimeForInternalUse(device);
  const lifetime = new NativeResourceLifetime({
    Handle: parent.Handle,
    Ownership: "owned",
    Parent: parent,
    Release: () => { owner.Disposed = true; },
    Label: "managed Effect state",
  });
  setGraphicsResourceLifetimeForInternalUse(
    effect,
    () => lifetime.Dispose(),
    () => lifetime.State === "active",
  );
}

function initializeReflectedNativeEffect(
  effect: Effect,
  device: GraphicsDevice,
  backend: CnaEffectBackend,
  handle: NativeHandle,
): void {
  let reflection: NativeEffectReflectionSnapshot;
  try {
    reflection = backend.getEffectReflection(handle);
  } catch (error) {
    try {
      backend.destroyEffect(handle);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "native Effect reflection rollback failed");
    }
    throw error;
  }
  const owner: EffectOwner = { Device: device, Disposed: false, Native: null };
  const lifetime = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "owned",
    Parent: graphicsDeviceParentLifetimeForInternalUse(device),
    Release: (value) => {
      try {
        backend.destroyEffect(value);
      } finally {
        owner.Disposed = true;
      }
    },
    Label: "CNA Effect",
  });
  const native: NativeEffectState = {
    Backend: backend, Lifetime: lifetime, BeforeApply: null, LeaseCount: 0,
  };
  owner.Native = native;
  try {
    if (reflection.Techniques.length === 0) {
      throw new InvalidOperationException("CNA Effect reflection returned no techniques");
    }
    const description: EffectDescription = {
      CurrentTechnique: reflection.CurrentTechnique,
      Parameters: [],
      Techniques: reflection.Techniques.map((technique) => ({
        Name: technique.Name,
        Passes: technique.Passes.map((pass) => ({ Name: pass.Name })),
      })),
    };
    const parameters = createParameters(owner, device, []);
    const techniques = reflection.Techniques.map((item, index) =>
      createTechnique(owner, description.Techniques[index], effect, backend, lifetime, item));
    if (
      !Number.isInteger(reflection.CurrentTechnique) || reflection.CurrentTechnique < 0 ||
      reflection.CurrentTechnique >= techniques.length
    ) {
      throw new InvalidOperationException("CNA Effect reflection returned an invalid current technique");
    }
    const techniqueCollection = createCollection<EffectTechniqueCollection, EffectTechnique>(
      EffectTechniqueCollection, owner, techniques,
    );
    const state: EffectState = {
      Owner: owner,
      Device: device,
      Description: description,
      Native: native,
      Parameters: parameters,
      Techniques: techniqueCollection,
      CurrentTechnique: techniques[reflection.CurrentTechnique],
    };
    effectStates.set(effect, state);
    attachGraphicsResourceForInternalUse(effect, device);
    setGraphicsResourceLifetimeForInternalUse(
      effect,
      () => lifetime.Dispose(),
      () => lifetime.State === "active",
    );
    guardGraphicsResourceDisposeForInternalUse(effect, () => {
      if (native.LeaseCount !== 0) {
        throw new InvalidOperationException("Effect cannot be disposed during an active SpriteBatch interval");
      }
    });
  } catch (error) {
    try {
      lifetime.Dispose();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "native Effect construction rollback failed");
    }
    throw error;
  }
}

function createAnnotations(
  owner: EffectOwner,
  descriptions: ReadonlyArray<EffectAnnotationDescription>,
): EffectAnnotationCollection {
  const items = descriptions.map((description) => {
    const item = new EffectAnnotation();
    annotationStates.set(item, { ...description, Value: cloneValue(description.Value), Owner: owner });
    return item;
  });
  return createCollection<EffectAnnotationCollection, EffectAnnotation>(
    EffectAnnotationCollection, owner, items,
  );
}

function createParameters(
  owner: EffectOwner,
  device: GraphicsDevice,
  descriptions: ReadonlyArray<EffectParameterDescription>,
): EffectParameterCollection {
  const items = descriptions.map((description) => {
    const item = new EffectParameter();
    parameterStates.set(item, {
      Owner: owner,
      Device: device,
      Description: description,
      Value: cloneValue(description.Value ?? defaultValue(description.ParameterType)),
      Annotations: createAnnotations(owner, description.Annotations ?? []),
      Elements: createParameters(owner, device, description.Elements ?? []),
      StructureMembers: createParameters(owner, device, description.StructureMembers ?? []),
    });
    return item;
  });
  return createCollection<EffectParameterCollection, EffectParameter>(
    EffectParameterCollection, owner, items,
  );
}

function createTechnique(
  owner: EffectOwner,
  description: EffectTechniqueDescription,
  effect: Effect | null = null,
  backend: CnaEffectBackend | null = null,
  parent: NativeResourceLifetime | null = null,
  nativeDescription: NativeEffectTechniqueSnapshot | null = null,
): EffectTechnique {
  const technique = new EffectTechnique();
  const nativeLifetime = nativeDescription == null || backend == null || parent == null
    ? null
    : new NativeResourceLifetime({
      Handle: nativeDescription.Handle,
      Ownership: "owned",
      Parent: parent,
      Release: (handle) => backend.destroyEffectTechnique(handle),
      Label: "CNA EffectTechnique view",
    });
  const passes = description.Passes.map((value, index) => {
    const pass = new EffectPass();
    const nativePass = nativeDescription?.Passes[index];
    const passLifetime = nativePass == null || backend == null || parent == null
      ? null
      : new NativeResourceLifetime({
        Handle: nativePass.Handle,
        Ownership: "owned",
        Parent: parent,
        Release: (handle) => backend.destroyEffectPass(handle),
        Label: "CNA EffectPass view",
      });
    passStates.set(pass, {
      Owner: owner,
      Effect: effect,
      Name: value.Name,
      Annotations: createAnnotations(owner, value.Annotations ?? []),
      NativeLifetime: passLifetime,
    });
    return pass;
  });
  techniqueStates.set(technique, {
    Owner: owner,
    Name: description.Name,
    Annotations: createAnnotations(owner, description.Annotations ?? []),
    Passes: createCollection<EffectPassCollection, EffectPass>(EffectPassCollection, owner, passes),
    NativeLifetime: nativeLifetime,
  });
  return technique;
}

function defaultValue(type: EffectParameterType): EffectValue {
  switch (type) {
    case EffectParameterType.Bool: return false;
    case EffectParameterType.Int32:
    case EffectParameterType.Single: return 0;
    case EffectParameterType.String: return "";
    default: return 0;
  }
}

function cloneDescription(value: EffectDescription): EffectDescription {
  const result: {
    Parameters?: ReadonlyArray<EffectParameterDescription>;
    Techniques: ReadonlyArray<EffectTechniqueDescription>;
    CurrentTechnique?: number;
  } = {
    Techniques: value.Techniques.map((technique) => ({
      ...technique,
      Passes: technique.Passes.map((pass) => ({ ...pass })),
    })),
  };
  if (value.CurrentTechnique !== undefined) result.CurrentTechnique = value.CurrentTechnique;
  if (value.Parameters !== undefined) {
    result.Parameters = value.Parameters.map(cloneParameterDescription);
  }
  return result;
}

function snapshotEffectDescription(state: EffectState): EffectDescription {
  return {
    CurrentTechnique: [...state.Techniques].indexOf(state.CurrentTechnique),
    Parameters: [...state.Parameters].map(snapshotParameterDescription),
    Techniques: [...state.Techniques].map((technique) => ({
      Name: technique.Name,
      Annotations: [...technique.Annotations].map(snapshotAnnotationDescription),
      Passes: [...technique.Passes].map((pass) => ({
        Name: pass.Name,
        Annotations: [...pass.Annotations].map(snapshotAnnotationDescription),
      })),
    })),
  };
}

function snapshotParameterDescription(parameter: EffectParameter): EffectParameterDescription {
  const state = parameterState(parameter);
  return {
    ...state.Description,
    Value: cloneValue(state.Value),
    Annotations: [...state.Annotations].map(snapshotAnnotationDescription),
    Elements: [...state.Elements].map(snapshotParameterDescription),
    StructureMembers: [...state.StructureMembers].map(snapshotParameterDescription),
  };
}

function snapshotAnnotationDescription(annotation: EffectAnnotation): EffectAnnotationDescription {
  const state = annotationState(annotation);
  return { ...state, Value: cloneValue(state.Value) };
}

function cloneParameterDescription(value: EffectParameterDescription): EffectParameterDescription {
  const result = { ...value };
  if (value.Value !== undefined) result.Value = cloneValue(value.Value);
  if (value.Elements !== undefined) result.Elements = value.Elements.map(cloneParameterDescription);
  if (value.StructureMembers !== undefined) {
    result.StructureMembers = value.StructureMembers.map(cloneParameterDescription);
  }
  return result;
}

function cloneValue<T extends EffectValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item as EffectValue)) as T;
  if (value instanceof Matrix) return copyMatrix(value) as T;
  if (value instanceof Quaternion) return copyQuaternion(value) as T;
  if (value instanceof Vector2) return copyVector2(value) as T;
  if (value instanceof Vector3) return copyVector3(value) as T;
  if (value instanceof Vector4) return copyVector4(value) as T;
  return value;
}

function copyMatrix(value: Matrix): Matrix {
  return new Matrix(
    value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
  );
}
function copyQuaternion(value: Quaternion): Quaternion { return new Quaternion(value.X, value.Y, value.Z, value.W); }
function copyVector2(value: Vector2): Vector2 { return new Vector2(value.X, value.Y); }
function copyVector3(value: Vector3): Vector3 { return new Vector3(value.X, value.Y, value.Z); }
function copyVector4(value: Vector4): Vector4 { return new Vector4(value.X, value.Y, value.Z, value.W); }

function collectionGet<T>(
  owner: EffectOwner,
  items: readonly T[],
  indexOrName: number | string,
  nameOf: (value: T) => string,
): T {
  active(owner);
  if (typeof indexOrName === "number") {
    if (!Number.isInteger(indexOrName) || indexOrName < 0 || indexOrName >= items.length) {
      throw new ArgumentOutOfRangeException("index");
    }
    return items[indexOrName];
  }
  return items.find((item) => nameOf(item) === indexOrName) as T;
}

type CollectionConstructor<TCollection, TItem> = new (
  owner: EffectOwner,
  items: readonly TItem[],
) => TCollection;

function createCollection<TCollection, TItem>(
  type: unknown,
  owner: EffectOwner,
  items: readonly TItem[],
): TCollection {
  return new (type as unknown as CollectionConstructor<TCollection, TItem>)(owner, items);
}
