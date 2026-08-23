import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { Matrix } from "../Matrix.js";
import { Vector3 } from "../Vector3.js";
import {
  createManagedStockEffectCodeForInternalUse,
  Effect,
  type EffectParameter,
} from "./Effect.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import { CompareFunction } from "./StateEnums.js";
import type { Texture2D } from "./Texture2D.js";
import type { TextureCube } from "./TextureCube.js";

export interface IEffectFog {
  get FogColor(): Vector3;
  set FogColor(value: Vector3);
  get FogEnabled(): boolean;
  set FogEnabled(value: boolean);
  get FogEnd(): number;
  set FogEnd(value: number);
  get FogStart(): number;
  set FogStart(value: number);
}

export interface IEffectLights {
  get AmbientLightColor(): Vector3;
  set AmbientLightColor(value: Vector3);
  get DirectionalLight0(): DirectionalLight;
  get DirectionalLight1(): DirectionalLight;
  get DirectionalLight2(): DirectionalLight;
  get LightingEnabled(): boolean;
  set LightingEnabled(value: boolean);
  EnableDefaultLighting(): void;
}

export interface IEffectMatrices {
  get Projection(): Matrix;
  set Projection(value: Matrix);
  get View(): Matrix;
  set View(value: Matrix);
  get World(): Matrix;
  set World(value: Matrix);
}

type DirectionalLightState = {
  readonly Owner: Effect | null;
  readonly DirectionParameter: EffectParameter | null;
  readonly DiffuseParameter: EffectParameter | null;
  readonly SpecularParameter: EffectParameter | null;
  Direction: Vector3;
  DiffuseColor: Vector3;
  SpecularColor: Vector3;
  Enabled: boolean;
};
const lightStates = new WeakMap<DirectionalLight, DirectionalLightState>();

export class DirectionalLight {
  public constructor(
    directionParameter: EffectParameter,
    diffuseColorParameter: EffectParameter,
    specularColorParameter: EffectParameter,
    cloneSource: DirectionalLight,
  ) {
    const source = cloneSource == null ? null : lightState(cloneSource);
    lightStates.set(this, {
      Owner: null,
      DirectionParameter: directionParameter ?? null,
      DiffuseParameter: diffuseColorParameter ?? null,
      SpecularParameter: specularColorParameter ?? null,
      Direction: source ? copyVector3(source.Direction) : Vector3.Down,
      DiffuseColor: source ? copyVector3(source.DiffuseColor) : Vector3.One,
      SpecularColor: source ? copyVector3(source.SpecularColor) : Vector3.One,
      Enabled: source?.Enabled ?? true,
    });
  }
  public get DiffuseColor(): Vector3 { return copyVector3(lightState(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) {
    const state = lightState(this); state.DiffuseColor = snapshotVector3(value, "value");
    state.DiffuseParameter?.SetValue(state.DiffuseColor);
  }
  public get Direction(): Vector3 { return copyVector3(lightState(this).Direction); }
  public set Direction(value: Vector3) {
    const state = lightState(this); state.Direction = snapshotVector3(value, "value");
    state.DirectionParameter?.SetValue(state.Direction);
  }
  public get Enabled(): boolean { return lightState(this).Enabled; }
  public set Enabled(value: boolean) { lightState(this).Enabled = Boolean(value); }
  public get SpecularColor(): Vector3 { return copyVector3(lightState(this).SpecularColor); }
  public set SpecularColor(value: Vector3) {
    const state = lightState(this); state.SpecularColor = snapshotVector3(value, "value");
    state.SpecularParameter?.SetValue(state.SpecularColor);
  }
}

function lightState(light: DirectionalLight): DirectionalLightState {
  const state = lightStates.get(light);
  if (!state) throw new TypeError("DirectionalLight construction did not complete");
  if (state.Owner?.IsDisposed) throw new ObjectDisposedException("Effect");
  return state;
}

function createLight(owner: Effect): DirectionalLight {
  const light = new DirectionalLight(
    null as unknown as EffectParameter,
    null as unknown as EffectParameter,
    null as unknown as EffectParameter,
    null as unknown as DirectionalLight,
  );
  const state = lightStates.get(light) as DirectionalLightState;
  lightStates.set(light, { ...state, Owner: owner });
  return light;
}

type StockState = {
  World: Matrix;
  View: Matrix;
  Projection: Matrix;
  FogColor: Vector3;
  FogEnabled: boolean;
  FogStart: number;
  FogEnd: number;
  Alpha: number;
  DiffuseColor: Vector3;
  EmissiveColor: Vector3;
  SpecularColor: Vector3;
  SpecularPower: number;
  AmbientLightColor: Vector3;
  LightingEnabled: boolean;
  PreferPerPixelLighting: boolean;
  VertexColorEnabled: boolean;
  TextureEnabled: boolean;
  Texture: Texture2D | null;
  Texture2: Texture2D | null;
  EnvironmentMap: TextureCube | null;
  EnvironmentMapAmount: number;
  EnvironmentMapSpecular: Vector3;
  FresnelFactor: number;
  AlphaFunction: CompareFunction;
  ReferenceAlpha: number;
  WeightsPerVertex: number;
  BoneTransforms: Matrix[];
  readonly Lights: readonly [DirectionalLight, DirectionalLight, DirectionalLight];
};
const stockStates = new WeakMap<Effect, StockState>();

function newStockState(owner: Effect): StockState {
  return {
    World: Matrix.Identity, View: Matrix.Identity, Projection: Matrix.Identity,
    FogColor: Vector3.Zero, FogEnabled: false, FogStart: 0, FogEnd: 1,
    Alpha: 1, DiffuseColor: Vector3.One, EmissiveColor: Vector3.Zero,
    SpecularColor: Vector3.One, SpecularPower: 16,
    AmbientLightColor: Vector3.Zero, LightingEnabled: false, PreferPerPixelLighting: false,
    VertexColorEnabled: false, TextureEnabled: false, Texture: null, Texture2: null,
    EnvironmentMap: null, EnvironmentMapAmount: 1, EnvironmentMapSpecular: Vector3.Zero,
    FresnelFactor: 1, AlphaFunction: CompareFunction.Greater, ReferenceAlpha: 0,
    WeightsPerVertex: 4, BoneTransforms: [Matrix.Identity],
    Lights: [createLight(owner), createLight(owner), createLight(owner)],
  };
}

function cloneStockState(owner: Effect, source: StockState): StockState {
  const result = newStockState(owner);
  for (const key of ["World", "View", "Projection"] as const) result[key] = copyMatrix(source[key]);
  for (const key of [
    "FogColor", "DiffuseColor", "EmissiveColor", "SpecularColor", "AmbientLightColor",
    "EnvironmentMapSpecular",
  ] as const) result[key] = copyVector3(source[key]);
  for (const key of [
    "FogEnabled", "LightingEnabled", "PreferPerPixelLighting", "VertexColorEnabled", "TextureEnabled",
  ] as const) result[key] = source[key];
  for (const key of [
    "FogStart", "FogEnd", "Alpha", "SpecularPower", "EnvironmentMapAmount", "FresnelFactor",
    "ReferenceAlpha", "WeightsPerVertex",
  ] as const) result[key] = source[key];
  result.AlphaFunction = source.AlphaFunction;
  result.Texture = source.Texture; result.Texture2 = source.Texture2; result.EnvironmentMap = source.EnvironmentMap;
  result.BoneTransforms = source.BoneTransforms.map(copyMatrix);
  source.Lights.forEach((light, index) => copyLight(result.Lights[index], light));
  return result;
}

function initializeStock(effect: Effect, source?: Effect): void {
  stockStates.set(effect, source ? cloneStockState(effect, stock(source)) : newStockState(effect));
}

function stock(effect: Effect): StockState {
  if (effect.IsDisposed) throw new ObjectDisposedException(effect.constructor.name);
  const state = stockStates.get(effect);
  if (!state) throw new TypeError("Stock effect construction did not complete");
  return state;
}

function copyLight(target: DirectionalLight, source: DirectionalLight): void {
  target.Direction = source.Direction; target.DiffuseColor = source.DiffuseColor;
  target.SpecularColor = source.SpecularColor; target.Enabled = source.Enabled;
}

function initializeStockBase(effect: Effect, sourceOrDevice: Effect | GraphicsDevice): void {
  void effect; void sourceOrDevice;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new ArgumentOutOfRangeException(name);
  return Math.fround(value);
}
function snapshotVector3(value: Vector3, name: string): Vector3 {
  if (!(value instanceof Vector3) || !Number.isFinite(value.X) || !Number.isFinite(value.Y) || !Number.isFinite(value.Z)) {
    throw new ArgumentException(`${name} must be a finite Vector3`);
  }
  return new Vector3(value.X, value.Y, value.Z);
}
function copyVector3(value: Vector3): Vector3 { return new Vector3(value.X, value.Y, value.Z); }
function copyMatrix(value: Matrix): Matrix {
  if (!(value instanceof Matrix)) throw new ArgumentException("value must be a Matrix");
  return new Matrix(
    value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
  );
}
function validateTexture(effect: Effect, value: Texture2D | null): Texture2D | null {
  if (value !== null && value.GraphicsDevice !== effect.GraphicsDevice) {
    throw new ArgumentException("The texture belongs to a different GraphicsDevice");
  }
  return value;
}
function applyUnavailable(): never {
  throw new NativeUnavailableError("Stock effect execution requires CNA stock-effect and apply routes");
}

function constructStock<T extends Effect>(
  target: T,
  sourceOrDevice: T | GraphicsDevice,
): void {
  initializeStockBase(target, sourceOrDevice);
  initializeStock(target, sourceOrDevice instanceof Effect ? sourceOrDevice : undefined);
}

function defaultLighting(effect: Effect): void {
  const state = stock(effect);
  state.LightingEnabled = true;
  state.AmbientLightColor = new Vector3(0.05333332, 0.09882354, 0.1819608);
  const defaults = [
    [new Vector3(-0.5265408, -0.5735765, -0.6275069), new Vector3(1, 0.9607844, 0.8078432), new Vector3(1, 0.9607844, 0.8078432)],
    [new Vector3(0.7198464, 0.3420201, 0.6040227), new Vector3(0.9647059, 0.7607844, 0.4078432), Vector3.Zero],
    [new Vector3(0.4545195, -0.7660444, 0.4545195), new Vector3(0.3231373, 0.3607844, 0.3937255), Vector3.Zero],
  ];
  defaults.forEach(([direction, diffuse, specular], index) => {
    const light = state.Lights[index];
    light.Direction = direction; light.DiffuseColor = diffuse; light.SpecularColor = specular; light.Enabled = true;
  });
}

export class BasicEffect extends Effect implements IEffectFog, IEffectLights, IEffectMatrices {
  public constructor(cloneSource: BasicEffect);
  public constructor(device: GraphicsDevice);
  public constructor(sourceOrDevice: BasicEffect | GraphicsDevice) {
    super(
      sourceOrDevice as GraphicsDevice,
      sourceOrDevice instanceof Effect ? [] : createManagedStockEffectCodeForInternalUse(),
    );
    constructStock(this, sourceOrDevice);
  }
  public override Clone(): Effect { return new BasicEffect(this); }
  protected override OnApply(): void { applyUnavailable(); }
  public get Alpha(): number { return stock(this).Alpha; }
  public set Alpha(value: number) { stock(this).Alpha = finite(value, "value"); }
  public get AmbientLightColor(): Vector3 { return copyVector3(stock(this).AmbientLightColor); }
  public set AmbientLightColor(value: Vector3) { stock(this).AmbientLightColor = snapshotVector3(value, "value"); }
  public get DiffuseColor(): Vector3 { return copyVector3(stock(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) { stock(this).DiffuseColor = snapshotVector3(value, "value"); }
  public get DirectionalLight0(): DirectionalLight { return stock(this).Lights[0]; }
  public get DirectionalLight1(): DirectionalLight { return stock(this).Lights[1]; }
  public get DirectionalLight2(): DirectionalLight { return stock(this).Lights[2]; }
  public get EmissiveColor(): Vector3 { return copyVector3(stock(this).EmissiveColor); }
  public set EmissiveColor(value: Vector3) { stock(this).EmissiveColor = snapshotVector3(value, "value"); }
  public get FogColor(): Vector3 { return copyVector3(stock(this).FogColor); }
  public set FogColor(value: Vector3) { stock(this).FogColor = snapshotVector3(value, "value"); }
  public get FogEnabled(): boolean { return stock(this).FogEnabled; }
  public set FogEnabled(value: boolean) { stock(this).FogEnabled = Boolean(value); }
  public get FogEnd(): number { return stock(this).FogEnd; }
  public set FogEnd(value: number) { stock(this).FogEnd = finite(value, "value"); }
  public get FogStart(): number { return stock(this).FogStart; }
  public set FogStart(value: number) { stock(this).FogStart = finite(value, "value"); }
  public get LightingEnabled(): boolean { return stock(this).LightingEnabled; }
  public set LightingEnabled(value: boolean) { stock(this).LightingEnabled = Boolean(value); }
  public get PreferPerPixelLighting(): boolean { return stock(this).PreferPerPixelLighting; }
  public set PreferPerPixelLighting(value: boolean) { stock(this).PreferPerPixelLighting = Boolean(value); }
  public get Projection(): Matrix { return copyMatrix(stock(this).Projection); }
  public set Projection(value: Matrix) { stock(this).Projection = copyMatrix(value); }
  public get SpecularColor(): Vector3 { return copyVector3(stock(this).SpecularColor); }
  public set SpecularColor(value: Vector3) { stock(this).SpecularColor = snapshotVector3(value, "value"); }
  public get SpecularPower(): number { return stock(this).SpecularPower; }
  public set SpecularPower(value: number) { stock(this).SpecularPower = finite(value, "value"); }
  public get Texture(): Texture2D { return stock(this).Texture as Texture2D; }
  public set Texture(value: Texture2D) { stock(this).Texture = validateTexture(this, value ?? null); }
  public get TextureEnabled(): boolean { return stock(this).TextureEnabled; }
  public set TextureEnabled(value: boolean) { stock(this).TextureEnabled = Boolean(value); }
  public get VertexColorEnabled(): boolean { return stock(this).VertexColorEnabled; }
  public set VertexColorEnabled(value: boolean) { stock(this).VertexColorEnabled = Boolean(value); }
  public get View(): Matrix { return copyMatrix(stock(this).View); }
  public set View(value: Matrix) { stock(this).View = copyMatrix(value); }
  public get World(): Matrix { return copyMatrix(stock(this).World); }
  public set World(value: Matrix) { stock(this).World = copyMatrix(value); }
  public EnableDefaultLighting(): void { defaultLighting(this); }
}

export class AlphaTestEffect extends Effect implements IEffectFog, IEffectMatrices {
  public constructor(cloneSource: AlphaTestEffect);
  public constructor(device: GraphicsDevice);
  public constructor(sourceOrDevice: AlphaTestEffect | GraphicsDevice) {
    super(
      sourceOrDevice as GraphicsDevice,
      sourceOrDevice instanceof Effect ? [] : createManagedStockEffectCodeForInternalUse(),
    );
    constructStock(this, sourceOrDevice);
  }
  public override Clone(): Effect { return new AlphaTestEffect(this); }
  protected override OnApply(): void { applyUnavailable(); }
  public get Alpha(): number { return stock(this).Alpha; }
  public set Alpha(value: number) { stock(this).Alpha = finite(value, "value"); }
  public get AlphaFunction(): CompareFunction { return stock(this).AlphaFunction; }
  public set AlphaFunction(value: CompareFunction) {
    if (!Number.isInteger(value) || value < CompareFunction.Always || value > CompareFunction.NotEqual) {
      throw new ArgumentOutOfRangeException("value");
    }
    stock(this).AlphaFunction = value;
  }
  public get DiffuseColor(): Vector3 { return copyVector3(stock(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) { stock(this).DiffuseColor = snapshotVector3(value, "value"); }
  public get FogColor(): Vector3 { return copyVector3(stock(this).FogColor); }
  public set FogColor(value: Vector3) { stock(this).FogColor = snapshotVector3(value, "value"); }
  public get FogEnabled(): boolean { return stock(this).FogEnabled; }
  public set FogEnabled(value: boolean) { stock(this).FogEnabled = Boolean(value); }
  public get FogEnd(): number { return stock(this).FogEnd; }
  public set FogEnd(value: number) { stock(this).FogEnd = finite(value, "value"); }
  public get FogStart(): number { return stock(this).FogStart; }
  public set FogStart(value: number) { stock(this).FogStart = finite(value, "value"); }
  public get Projection(): Matrix { return copyMatrix(stock(this).Projection); }
  public set Projection(value: Matrix) { stock(this).Projection = copyMatrix(value); }
  public get ReferenceAlpha(): number { return stock(this).ReferenceAlpha; }
  public set ReferenceAlpha(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new ArgumentOutOfRangeException("value");
    stock(this).ReferenceAlpha = value;
  }
  public get Texture(): Texture2D { return stock(this).Texture as Texture2D; }
  public set Texture(value: Texture2D) { stock(this).Texture = validateTexture(this, value ?? null); }
  public get VertexColorEnabled(): boolean { return stock(this).VertexColorEnabled; }
  public set VertexColorEnabled(value: boolean) { stock(this).VertexColorEnabled = Boolean(value); }
  public get View(): Matrix { return copyMatrix(stock(this).View); }
  public set View(value: Matrix) { stock(this).View = copyMatrix(value); }
  public get World(): Matrix { return copyMatrix(stock(this).World); }
  public set World(value: Matrix) { stock(this).World = copyMatrix(value); }
}

export class DualTextureEffect extends Effect implements IEffectFog, IEffectMatrices {
  public constructor(cloneSource: DualTextureEffect);
  public constructor(device: GraphicsDevice);
  public constructor(sourceOrDevice: DualTextureEffect | GraphicsDevice) {
    super(
      sourceOrDevice as GraphicsDevice,
      sourceOrDevice instanceof Effect ? [] : createManagedStockEffectCodeForInternalUse(),
    );
    constructStock(this, sourceOrDevice);
  }
  public override Clone(): Effect { return new DualTextureEffect(this); }
  protected override OnApply(): void { applyUnavailable(); }
  public get Alpha(): number { return stock(this).Alpha; }
  public set Alpha(value: number) { stock(this).Alpha = finite(value, "value"); }
  public get DiffuseColor(): Vector3 { return copyVector3(stock(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) { stock(this).DiffuseColor = snapshotVector3(value, "value"); }
  public get FogColor(): Vector3 { return copyVector3(stock(this).FogColor); }
  public set FogColor(value: Vector3) { stock(this).FogColor = snapshotVector3(value, "value"); }
  public get FogEnabled(): boolean { return stock(this).FogEnabled; }
  public set FogEnabled(value: boolean) { stock(this).FogEnabled = Boolean(value); }
  public get FogEnd(): number { return stock(this).FogEnd; }
  public set FogEnd(value: number) { stock(this).FogEnd = finite(value, "value"); }
  public get FogStart(): number { return stock(this).FogStart; }
  public set FogStart(value: number) { stock(this).FogStart = finite(value, "value"); }
  public get Projection(): Matrix { return copyMatrix(stock(this).Projection); }
  public set Projection(value: Matrix) { stock(this).Projection = copyMatrix(value); }
  public get Texture(): Texture2D { return stock(this).Texture as Texture2D; }
  public set Texture(value: Texture2D) { stock(this).Texture = validateTexture(this, value ?? null); }
  public get Texture2(): Texture2D { return stock(this).Texture2 as Texture2D; }
  public set Texture2(value: Texture2D) { stock(this).Texture2 = validateTexture(this, value ?? null); }
  public get VertexColorEnabled(): boolean { return stock(this).VertexColorEnabled; }
  public set VertexColorEnabled(value: boolean) { stock(this).VertexColorEnabled = Boolean(value); }
  public get View(): Matrix { return copyMatrix(stock(this).View); }
  public set View(value: Matrix) { stock(this).View = copyMatrix(value); }
  public get World(): Matrix { return copyMatrix(stock(this).World); }
  public set World(value: Matrix) { stock(this).World = copyMatrix(value); }
}

export class EnvironmentMapEffect extends Effect implements IEffectFog, IEffectLights, IEffectMatrices {
  public constructor(cloneSource: EnvironmentMapEffect);
  public constructor(device: GraphicsDevice);
  public constructor(sourceOrDevice: EnvironmentMapEffect | GraphicsDevice) {
    super(
      sourceOrDevice as GraphicsDevice,
      sourceOrDevice instanceof Effect ? [] : createManagedStockEffectCodeForInternalUse(),
    );
    constructStock(this, sourceOrDevice);
  }
  public override Clone(): Effect { return new EnvironmentMapEffect(this); }
  protected override OnApply(): void { applyUnavailable(); }
  public get Alpha(): number { return stock(this).Alpha; }
  public set Alpha(value: number) { stock(this).Alpha = finite(value, "value"); }
  public get AmbientLightColor(): Vector3 { return copyVector3(stock(this).AmbientLightColor); }
  public set AmbientLightColor(value: Vector3) { stock(this).AmbientLightColor = snapshotVector3(value, "value"); }
  public get DiffuseColor(): Vector3 { return copyVector3(stock(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) { stock(this).DiffuseColor = snapshotVector3(value, "value"); }
  public get DirectionalLight0(): DirectionalLight { return stock(this).Lights[0]; }
  public get DirectionalLight1(): DirectionalLight { return stock(this).Lights[1]; }
  public get DirectionalLight2(): DirectionalLight { return stock(this).Lights[2]; }
  public get EmissiveColor(): Vector3 { return copyVector3(stock(this).EmissiveColor); }
  public set EmissiveColor(value: Vector3) { stock(this).EmissiveColor = snapshotVector3(value, "value"); }
  public get EnvironmentMap(): TextureCube { return stock(this).EnvironmentMap as TextureCube; }
  public set EnvironmentMap(value: TextureCube) {
    if (value != null && value.GraphicsDevice !== this.GraphicsDevice) {
      throw new ArgumentException("The texture belongs to a different GraphicsDevice");
    }
    stock(this).EnvironmentMap = value ?? null;
  }
  public get EnvironmentMapAmount(): number { return stock(this).EnvironmentMapAmount; }
  public set EnvironmentMapAmount(value: number) { stock(this).EnvironmentMapAmount = finite(value, "value"); }
  public get EnvironmentMapSpecular(): Vector3 { return copyVector3(stock(this).EnvironmentMapSpecular); }
  public set EnvironmentMapSpecular(value: Vector3) {
    stock(this).EnvironmentMapSpecular = snapshotVector3(value, "value");
  }
  public get FogColor(): Vector3 { return copyVector3(stock(this).FogColor); }
  public set FogColor(value: Vector3) { stock(this).FogColor = snapshotVector3(value, "value"); }
  public get FogEnabled(): boolean { return stock(this).FogEnabled; }
  public set FogEnabled(value: boolean) { stock(this).FogEnabled = Boolean(value); }
  public get FogEnd(): number { return stock(this).FogEnd; }
  public set FogEnd(value: number) { stock(this).FogEnd = finite(value, "value"); }
  public get FogStart(): number { return stock(this).FogStart; }
  public set FogStart(value: number) { stock(this).FogStart = finite(value, "value"); }
  public get FresnelFactor(): number { return stock(this).FresnelFactor; }
  public set FresnelFactor(value: number) { stock(this).FresnelFactor = finite(value, "value"); }
  public get LightingEnabled(): boolean { return stock(this).LightingEnabled; }
  public set LightingEnabled(value: boolean) { stock(this).LightingEnabled = Boolean(value); }
  public get Projection(): Matrix { return copyMatrix(stock(this).Projection); }
  public set Projection(value: Matrix) { stock(this).Projection = copyMatrix(value); }
  public get Texture(): Texture2D { return stock(this).Texture as Texture2D; }
  public set Texture(value: Texture2D) { stock(this).Texture = validateTexture(this, value ?? null); }
  public get View(): Matrix { return copyMatrix(stock(this).View); }
  public set View(value: Matrix) { stock(this).View = copyMatrix(value); }
  public get World(): Matrix { return copyMatrix(stock(this).World); }
  public set World(value: Matrix) { stock(this).World = copyMatrix(value); }
  public EnableDefaultLighting(): void { defaultLighting(this); }
}

export class SkinnedEffect extends Effect implements IEffectFog, IEffectLights, IEffectMatrices {
  public static readonly MaxBones = 72;
  public constructor(cloneSource: SkinnedEffect);
  public constructor(device: GraphicsDevice);
  public constructor(sourceOrDevice: SkinnedEffect | GraphicsDevice) {
    super(
      sourceOrDevice as GraphicsDevice,
      sourceOrDevice instanceof Effect ? [] : createManagedStockEffectCodeForInternalUse(),
    );
    constructStock(this, sourceOrDevice);
  }
  public override Clone(): Effect { return new SkinnedEffect(this); }
  protected override OnApply(): void { applyUnavailable(); }
  public get Alpha(): number { return stock(this).Alpha; }
  public set Alpha(value: number) { stock(this).Alpha = finite(value, "value"); }
  public get AmbientLightColor(): Vector3 { return copyVector3(stock(this).AmbientLightColor); }
  public set AmbientLightColor(value: Vector3) { stock(this).AmbientLightColor = snapshotVector3(value, "value"); }
  public get DiffuseColor(): Vector3 { return copyVector3(stock(this).DiffuseColor); }
  public set DiffuseColor(value: Vector3) { stock(this).DiffuseColor = snapshotVector3(value, "value"); }
  public get DirectionalLight0(): DirectionalLight { return stock(this).Lights[0]; }
  public get DirectionalLight1(): DirectionalLight { return stock(this).Lights[1]; }
  public get DirectionalLight2(): DirectionalLight { return stock(this).Lights[2]; }
  public get EmissiveColor(): Vector3 { return copyVector3(stock(this).EmissiveColor); }
  public set EmissiveColor(value: Vector3) { stock(this).EmissiveColor = snapshotVector3(value, "value"); }
  public get FogColor(): Vector3 { return copyVector3(stock(this).FogColor); }
  public set FogColor(value: Vector3) { stock(this).FogColor = snapshotVector3(value, "value"); }
  public get FogEnabled(): boolean { return stock(this).FogEnabled; }
  public set FogEnabled(value: boolean) { stock(this).FogEnabled = Boolean(value); }
  public get FogEnd(): number { return stock(this).FogEnd; }
  public set FogEnd(value: number) { stock(this).FogEnd = finite(value, "value"); }
  public get FogStart(): number { return stock(this).FogStart; }
  public set FogStart(value: number) { stock(this).FogStart = finite(value, "value"); }
  public get LightingEnabled(): boolean { return stock(this).LightingEnabled; }
  public set LightingEnabled(value: boolean) { stock(this).LightingEnabled = Boolean(value); }
  public get PreferPerPixelLighting(): boolean { return stock(this).PreferPerPixelLighting; }
  public set PreferPerPixelLighting(value: boolean) { stock(this).PreferPerPixelLighting = Boolean(value); }
  public get Projection(): Matrix { return copyMatrix(stock(this).Projection); }
  public set Projection(value: Matrix) { stock(this).Projection = copyMatrix(value); }
  public get SpecularColor(): Vector3 { return copyVector3(stock(this).SpecularColor); }
  public set SpecularColor(value: Vector3) { stock(this).SpecularColor = snapshotVector3(value, "value"); }
  public get SpecularPower(): number { return stock(this).SpecularPower; }
  public set SpecularPower(value: number) { stock(this).SpecularPower = finite(value, "value"); }
  public get Texture(): Texture2D { return stock(this).Texture as Texture2D; }
  public set Texture(value: Texture2D) { stock(this).Texture = validateTexture(this, value ?? null); }
  public get View(): Matrix { return copyMatrix(stock(this).View); }
  public set View(value: Matrix) { stock(this).View = copyMatrix(value); }
  public get WeightsPerVertex(): number { return stock(this).WeightsPerVertex; }
  public set WeightsPerVertex(value: number) {
    if (![1, 2, 4].includes(value)) throw new ArgumentOutOfRangeException("value");
    stock(this).WeightsPerVertex = value;
  }
  public get World(): Matrix { return copyMatrix(stock(this).World); }
  public set World(value: Matrix) { stock(this).World = copyMatrix(value); }
  public EnableDefaultLighting(): void { defaultLighting(this); }
  public GetBoneTransforms(count: number): Matrix[] {
    if (!Number.isInteger(count) || count < 0 || count > SkinnedEffect.MaxBones) {
      throw new ArgumentOutOfRangeException("count");
    }
    return stock(this).BoneTransforms.slice(0, count).map(copyMatrix);
  }
  public SetBoneTransforms(boneTransforms: Matrix[]): void {
    if (boneTransforms == null) throw new ArgumentNullException("boneTransforms");
    if (boneTransforms.length > SkinnedEffect.MaxBones) throw new ArgumentOutOfRangeException("boneTransforms");
    stock(this).BoneTransforms = boneTransforms.map(copyMatrix);
  }
}
