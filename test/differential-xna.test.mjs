import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  Audio, BoundingBox, BoundingFrustum, BoundingSphere, Color, Content, Curve, CurveContinuity, CurveKey,
  CurveKeyCollection, CurveLoopType, CurveTangent, Design, Graphics, Input, MathHelper, Matrix, Media, Plane,
  Game, GraphicsDeviceManager, Point, Quaternion, Ray, Rectangle, Storage, TimeSpan, Vector2, Vector3, Vector4,
} from "../dist/index.js";
import { FileMode } from "../dist/IO/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";
import { touchLocationsEqual } from "../dist/Microsoft/Xna/Framework/Input/Touch/TouchValues.js";

const corpus = JSON.parse(fs.readFileSync(new URL("./fixtures/xna40-value-corpus.json", import.meta.url), "utf8"));
const floatView = new DataView(new ArrayBuffer(4));

function bits(value) {
  if (Number.isNaN(value)) return "NaN";
  floatView.setFloat32(0, value, false);
  return floatView.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0");
}
function flag(value) { return value ? "1" : "0"; }
function nullableBits(value) { return value == null ? "none" : bits(value); }
function vectorBits(value) {
  return [value.X, value.Y, ...(value.Z === undefined ? [] : [value.Z]), ...(value.W === undefined ? [] : [value.W])]
    .map(bits).join(",");
}
function quaternionBits(value) { return [value.X, value.Y, value.Z, value.W].map(bits).join(","); }
function matrixBits(value) {
  return [
    value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
  ].map(bits).join(",");
}
function exceptionName(action) {
  try { action(); return "none"; }
  catch (error) { return error instanceof Error ? error.name : typeof error; }
}
function exceptionDetail(action) {
  try { action(); return "none"; }
  catch (error) {
    if (!(error instanceof Error)) return typeof error;
    const parameter = ["sizeInBytes", "sampleRate", "channels", "duration", "value"]
      .find((name) => error.message.includes(name));
    return parameter ? `${error.name}:${parameter}` : error.name;
  }
}
function hex(value, width) { return Number(value).toString(16).toUpperCase().padStart(width, "0"); }

function captureMath() {
  const observed = new Map();
  const add = (id, value) => observed.set(id, value);

  add("v2.normalize.zero", vectorBits(Vector2.Normalize(Vector2.Zero)));
  add("v3.normalize.zero", vectorBits(Vector3.Normalize(Vector3.Zero)));
  add("v4.normalize.zero", vectorBits(Vector4.Normalize(Vector4.Zero)));
  add("vector.divide.scalar", [
    Vector2.Divide(new Vector2(3), 7).X,
    Vector3.Divide(new Vector3(7), 3).X,
    Vector4.Divide(new Vector4(12345.67), 3).X,
    Matrix.Divide(Matrix.Identity, 3).M11,
  ].map(bits).join(","));
  add("q.normalize.zero", quaternionBits(Quaternion.Normalize(new Quaternion(0, 0, 0, 0))));
  add("q.inverse.zero", quaternionBits(Quaternion.Inverse(new Quaternion(0, 0, 0, 0))));

  const yaw = Quaternion.CreateFromAxisAngle(Vector3.Up, 0.7);
  const pitch = Quaternion.CreateFromAxisAngle(Vector3.Right, -0.4);
  add("q.multiply", quaternionBits(Quaternion.Multiply(yaw, pitch)));
  add("q.multiply.grouped", quaternionBits(Quaternion.Multiply(
    new Quaternion(45889.05859375, -42412.4453125, 96034.96875, -76386.84375),
    new Quaternion(-16375.435546875, 51428.1875, -69603.09375, -2207.3798828125),
  )));
  add("q.concatenate", quaternionBits(Quaternion.Concatenate(yaw, pitch)));
  add("v3.qtransform", vectorBits(Vector3.Transform(
    new Vector3(1.25, -2.5, 3.75), Quaternion.Multiply(yaw, pitch),
  )));

  const matrix = Matrix.Multiply(
    Matrix.Multiply(Matrix.CreateScale(2, 3, 4), Matrix.CreateRotationY(0.25)),
    Matrix.CreateTranslation(5, 6, 7),
  );
  add("v2.transform", vectorBits(Vector2.Transform(new Vector2(1.5, -2), matrix)));
  add("v3.transform", vectorBits(Vector3.Transform(new Vector3(1.5, -2, 0.25), matrix)));
  add("v4.transform", vectorBits(Vector4.Transform(new Vector4(1.5, -2, 0.25, 1), matrix)));
  add("matrix.inverse.product", matrixBits(Matrix.Multiply(matrix, Matrix.Invert(matrix))));
  add("matrix.inverse.singular", matrixBits(Matrix.Invert(new Matrix(...Array(16).fill(0)))));

  const viewport = new Graphics.Viewport(11, 13, 640, 360);
  viewport.MinDepth = 0.2;
  viewport.MaxDepth = 0.9;
  const viewportWorld = Matrix.Multiply(
    Matrix.Multiply(Matrix.CreateScale(1.5, 0.75, 2), Matrix.CreateRotationY(0.31)),
    Matrix.CreateTranslation(2, -1, 0.5),
  );
  const viewportView = Matrix.CreateLookAt(new Vector3(4, 3, 8), Vector3.Zero, Vector3.Up);
  const viewportProjection = Matrix.CreatePerspectiveFieldOfView(0.9, 16 / 9, 0.1, 100);
  const projected = viewport.Project(new Vector3(0.25, -0.5, 1.25), viewportProjection, viewportView, viewportWorld);
  add("viewport.project", vectorBits(projected));
  add("viewport.unproject", vectorBits(viewport.Unproject(projected, viewportProjection, viewportView, viewportWorld)));
  add("viewport.unproject.singular", vectorBits(viewport.Unproject(
    new Vector3(100, 50, 0.5), Matrix.Identity, Matrix.Identity, new Matrix(...Array(16).fill(0)),
  )));

  add("color.pack", hex(new Color(new Vector4(0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).PackedValue, 8));
  add("color.lerp", hex(Color.Lerp(new Color(0, 0, 0, 0), new Color(255, 255, 255, 255), 0.5).PackedValue, 8));
  add("color.nonpremultiplied.extreme", hex(Color.FromNonPremultiplied(
    0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff,
  ).PackedValue, 8));

  const transformedPlane = Plane.Transform(new Plane(Vector3.Up, -2), Matrix.CreateTranslation(0, 5, 0));
  add("plane.transform", vectorBits(new Vector4(transformedPlane.Normal, transformedPlane.D)));
  const box = new BoundingBox(new Vector3(-1), new Vector3(1));
  add("box.contains.edge", String(box.Contains(new Vector3(1, 0, 0))));
  const nanBox = new BoundingBox(new Vector3(Number.NaN, -1, -1), new Vector3(Number.NaN, 1, 1));
  add("box.nan", `${box.Contains(new Vector3(Number.NaN, 0, 0))},${flag(box.Intersects(nanBox))}`);
  const sphere = new BoundingSphere(Vector3.Zero, 1);
  add("sphere.contains.edge", String(sphere.Contains(Vector3.UnitX)));
  const pointsSphere = BoundingSphere.CreateFromPoints([
    new Vector3(-4, 1, 0), new Vector3(6, -2, 3), new Vector3(0, 8, -5), new Vector3(2, 0, 9),
  ]);
  add("sphere.points", vectorBits(new Vector4(pointsSphere.Center, pointsSphere.Radius)));
  add("ray.sphere", nullableBits(new Ray(new Vector3(-5, 0.25, 0), Vector3.UnitX).Intersects(sphere)));

  const nanVector = new Vector2(Number.NaN, 0);
  add("v2.equals.nan", `${flag(nanVector.Equals(nanVector))},${flag(nanVector.Equals(nanVector))}`);
  const nanMatrix = Matrix.Identity;
  nanMatrix.M11 = Number.NaN;
  const nanMatrixCopy = Matrix.Identity;
  nanMatrixCopy.M11 = Number.NaN;
  add("matrix.equals.nan", `${flag(nanMatrix.Equals(nanMatrixCopy))},${flag(nanMatrix.Equals(nanMatrixCopy))}`);
  add("v3.hash", String(new Vector3(1, 2, 3).GetHashCode()));
  add("matrix.identity.hash", String(Matrix.Identity.GetHashCode()));
  add("integer.hash", `${new Point(1, 2).GetHashCode()},${new Rectangle(1, 2, 3, 4).GetHashCode()}`);
  add("sphere.negative", exceptionName(() => new BoundingSphere(Vector3.Zero, -1)));
  add("math.clamp.reversed", bits(MathHelper.Clamp(0, 2, 1)));
  add("math.wrap.large", bits(MathHelper.WrapAngle(Math.fround(123456.789))));
  add("math.splines", [
    MathHelper.CatmullRom(-10, -10, -10, -7, 0.3),
    MathHelper.Hermite(-10, -10, -10, -10, 1.1),
  ].map(bits).join(","));
  add("math.hermite.endpoint.nan", flag(Number.isNaN(MathHelper.Hermite(1, Number.POSITIVE_INFINITY, 2, 0, 0))));
  add("sphere.intersects.tangent", flag(sphere.Intersects(new BoundingSphere(new Vector3(2, 0, 0), 1))));
  add("box.ray.nearparallel", nullableBits(new Ray(
    new Vector3(2, 0, 0), new Vector3(-5e-7, 0, 0),
  ).Intersects(new BoundingBox(new Vector3(-1), new Vector3(1)))));
  add("ray.plane.nearparallel", nullableBits(new Ray(
    Vector3.Zero, new Vector3(5e-6, 1, 0),
  ).Intersects(new Plane(Vector3.UnitX, -1))));
  const justBehind = new Ray(new Vector3(5e-6, 0, 0), Vector3.UnitX);
  const originPlane = new Plane(Vector3.UnitX, 0);
  add("ray.plane.overloads", `${nullableBits(justBehind.Intersects(originPlane))},${nullableBits(justBehind.Intersects(originPlane))}`);
  add("v3.transform.negative.length", exceptionName(() => Vector3.Transform(
    [Vector3.Zero], 0, Matrix.Identity, [Vector3.Zero], 0, -1,
  )));
  add("v3.transform.negative.index", exceptionName(() => Vector3.Transform(
    [Vector3.Zero], -1, Matrix.Identity, [Vector3.Zero], 0, 1,
  )));
  add("v3.min.nan", vectorBits(Vector3.Min(
    new Vector3(Number.NaN, 1, Number.NaN), new Vector3(7, Number.NaN, Number.NaN),
  )));
  add("v3.clamp.reversed", vectorBits(Vector3.Clamp(Vector3.Zero, new Vector3(2), new Vector3(1))));
  add("q.slerp", quaternionBits(Quaternion.Slerp(yaw, pitch, 0.37)));
  add("q.axis.large", quaternionBits(Quaternion.CreateFromAxisAngle(Vector3.Up, Math.fround(123456.789))));
  add("q.from.matrix", quaternionBits(Quaternion.CreateFromRotationMatrix(Matrix.CreateRotationY(0.7))));

  const largeRotation = Matrix.CreateRotationY(Math.fround(123456.789));
  add("matrix.rotation.large", [largeRotation.M11, largeRotation.M31].map(bits).join(","));
  const infinitePerspective = Matrix.CreatePerspective(4, 3, 0.1, Number.POSITIVE_INFINITY);
  add("matrix.perspective.infinity", [infinitePerspective.M33, infinitePerspective.M43].map(bits).join(","));
  add("matrix.fov.invalid", exceptionName(() => Matrix.CreatePerspectiveFieldOfView(0, 1, 0.1, 100)));
  const mirrored = Matrix.Multiply(
    Matrix.Multiply(Matrix.CreateScale(-2, 3, 4), Matrix.CreateRotationY(0.25)),
    Matrix.CreateTranslation(5, 6, 7),
  );
  const decomposition = mirrored.Decompose();
  add("matrix.decompose.mirror", [
    flag(decomposition.Success),
    ...[decomposition.Scale.X, decomposition.Scale.Y, decomposition.Scale.Z,
      decomposition.Rotation.X, decomposition.Rotation.Y, decomposition.Rotation.Z, decomposition.Rotation.W,
      decomposition.Translation.X, decomposition.Translation.Y, decomposition.Translation.Z].map(bits),
  ].join(","));
  const billboard = Matrix.CreateConstrainedBillboard(
    new Vector3(0, 10, 0), Vector3.Zero, new Vector3(0, 2, 0), null, null,
  );
  add("matrix.billboard.axis", [billboard.M11, billboard.M22, billboard.M33].map(bits).join(","));
  const shadow = Matrix.CreateShadow(Vector3.Forward, new Plane(Vector3.Zero, 0));
  add("matrix.shadow.zero.nan", `${flag(Number.isNaN(shadow.M11))},${flag(Number.isNaN(shadow.M44))}`);
  const reflectionPlane = new Plane(new Vector3(2, 0, 0), 4);
  const reflection = Matrix.CreateReflection(reflectionPlane);
  const normalizedReflectionPlane = Plane.Normalize(reflectionPlane);
  add("matrix.reflection.ref", [
    normalizedReflectionPlane.Normal.X, normalizedReflectionPlane.D, reflection.M11, reflection.M41,
  ].map(bits).join(","));
  add("matrix.lookat.degenerate", matrixBits(Matrix.CreateLookAt(Vector3.Zero, Vector3.Zero, Vector3.Up)));
  const infinityMatrix = Matrix.Identity;
  infinityMatrix.M14 = Number.POSITIVE_INFINITY;
  const infinityResult = Matrix.Transform(infinityMatrix, Quaternion.Identity);
  add("matrix.transform.infinity", `${bits(infinityResult.M11)},${bits(infinityResult.M14)},${flag(Number.isNaN(infinityResult.M11))}`);
  add("negate.signedzero", [
    Vector4.Negate(Vector4.Zero).X,
    Quaternion.Negate(new Quaternion(0, 0, 0, 0)).X,
    Matrix.Negate(new Matrix(...Array(16).fill(0))).M11,
  ].map(bits).join(","));
  add("matrix.tostring", Matrix.Identity.ToString());
  const degeneratePlane = new Plane(Vector3.Zero, Vector3.Zero, Vector3.Zero);
  add("plane.points.degenerate", vectorBits(new Vector4(degeneratePlane.Normal, degeneratePlane.D)));
  const nearUnitPlane = Plane.Normalize(new Plane(new Vector3(0.6, 0.79999995, 0), 2));
  add("plane.normalize.nearunit", vectorBits(new Vector4(nearUnitPlane.Normal, nearUnitPlane.D)));
  add("plane.box.coplanar", String(new Plane(Vector3.Zero, 0).Intersects(box)));

  const curveKey = new CurveKey(1, 2, 3, 4, CurveContinuity.Step);
  add("curve.key.hash", String(curveKey.GetHashCode()));
  const nanCurveKey = new CurveKey(Number.NaN, 0);
  const finiteCurveKey = new CurveKey(0, 0);
  add("curve.key.compare", `${nanCurveKey.CompareTo(finiteCurveKey)},${finiteCurveKey.CompareTo(nanCurveKey)},${exceptionName(() => finiteCurveKey.CompareTo(null))}`);
  const curveKeys = new CurveKeyCollection();
  curveKeys.Add(new CurveKey(0, 1));
  curveKeys.Add(new CurveKey(5e-8, 2));
  const replacementKey = new CurveKey(1e-7, 3);
  curveKeys.Set(0, replacementKey);
  add("curve.collection.reposition", `${bits(curveKeys.Get(0).Value)},${bits(curveKeys.Get(1).Value)}`);
  add("curve.collection.oob", `${exceptionName(() => curveKeys.Set(-1, replacementKey))},${exceptionName(() => curveKeys.Set(curveKeys.Count, replacementKey))}`);
  const tangentCurve = new Curve();
  tangentCurve.Keys.Add(new CurveKey(0, 0));
  tangentCurve.Keys.Add(new CurveKey(1, 5e-9));
  tangentCurve.Keys.Add(new CurveKey(2, 1e-8));
  tangentCurve.ComputeTangent(1, CurveTangent.Smooth);
  add("curve.tangent.epsilon", `${bits(tangentCurve.Keys.Get(1).TangentIn)},${bits(tangentCurve.Keys.Get(1).TangentOut)}`);
  const loopCurve = new Curve();
  loopCurve.PreLoop = CurveLoopType.Cycle;
  loopCurve.Keys.Add(new CurveKey(0, 10, 0, 0, CurveContinuity.Step));
  loopCurve.Keys.Add(new CurveKey(1, 20, 0, 0, CurveContinuity.Step));
  add("curve.cycle.preboundary", bits(loopCurve.Evaluate(-1)));
  add("curve.step.nan", bits(loopCurve.Evaluate(Number.NaN)));

  const Packed = Graphics.PackedVector;
  const alphaMidpoint = new Packed.Alpha8(0.5 / 255);
  const alphaOneBit = new Packed.Bgra5551(0, 0, 0, 0.5);
  add("packed.unorm.midpoint", `${hex(alphaMidpoint.PackedValue, 2)},${hex(alphaOneBit.PackedValue, 4)}`);
  add("packed.unsigned.rounding", hex(new Packed.Byte4(0.5, 1.5, 2.5, 3.5).PackedValue, 8));
  add("packed.snorm.rounding", hex(new Packed.NormalizedByte2(0.5 / 127, -0.5 / 127).PackedValue, 4));
  const minimumSNorm = new Packed.NormalizedByte2(0, 0);
  minimumSNorm.PackedValue = 0x8080;
  add("packed.snorm.minimum", vectorBits(minimumSNorm.ToVector2()));
  add("packed.signed.rounding", hex(new Packed.Short2(0.5, 1.5).PackedValue, 8));
  const exponent31Half = new Packed.HalfSingle(0);
  exponent31Half.PackedValue = 0x7c00;
  add("packed.half.saturation", `${hex(new Packed.HalfSingle(Number.POSITIVE_INFINITY).PackedValue, 4)},${hex(new Packed.HalfSingle(Number.NaN).PackedValue, 4)},${bits(exponent31Half.ToSingle())}`);
  const alphaString = new Packed.Alpha8(0); alphaString.PackedValue = 0x0a;
  const bgraString = new Packed.Bgra5551(0, 0, 0, 0); bgraString.PackedValue = 0x000a;
  const byteString = new Packed.Byte4(0, 0, 0, 0); byteString.PackedValue = 0x0000000a;
  add("packed.tostring", `${alphaString.ToString()},${bgraString.ToString()},${byteString.ToString()}`);

  const frustumProjection = Matrix.CreatePerspectiveFieldOfView(MathHelper.PiOver4, 4 / 3, 1, 10);
  const frustumMatrix = Matrix.Multiply(
    Matrix.CreateLookAt(new Vector3(0, 0, 5), Vector3.Zero, Vector3.Up), frustumProjection,
  );
  const frustum = new BoundingFrustum(frustumMatrix);
  add("frustum.near", vectorBits(new Vector4(frustum.Near.Normal, frustum.Near.D)));
  add("frustum.top", vectorBits(new Vector4(frustum.Top.Normal, frustum.Top.D)));
  const corners = frustum.GetCorners();
  add("frustum.corner0", vectorBits(corners[0]));
  add("frustum.corner6", vectorBits(corners[6]));
  add("frustum.contains", [
    frustum.Contains(Vector3.Zero), frustum.Contains(new Vector3(0, 0, 6)),
    frustum.Contains(new BoundingBox(new Vector3(-0.5), new Vector3(0.5))),
    frustum.Contains(new BoundingSphere(Vector3.Zero, 0.5)),
  ].join(","));
  const distantFrustum = new BoundingFrustum(Matrix.Multiply(
    Matrix.CreateLookAt(new Vector3(100, 0, 5), new Vector3(100, 0, 0), Vector3.Up),
    frustumProjection,
  ));
  add("frustum.gjk", [
    frustum.Intersects(new BoundingBox(new Vector3(-0.5), new Vector3(0.5))),
    frustum.Intersects(new BoundingBox(new Vector3(100), new Vector3(101))),
    frustum.Intersects(new BoundingSphere(Vector3.Zero, 0.5)),
    frustum.Intersects(new BoundingSphere(new Vector3(100), 0.5)),
    frustum.Intersects(distantFrustum),
  ].map(flag).join(","));
  add("frustum.ray", nullableBits(frustum.Intersects(new Ray(new Vector3(0, 0, 20), Vector3.Forward))));

  return observed;
}

function captureInput() {
  const observed = new Map();
  const add = (id, value) => observed.set(id, value);
  const {
    ButtonState, Buttons, GamePadButtons, GamePadDPad, GamePadState, GamePadThumbSticks,
    GamePadTriggers, KeyboardState, Keys, MouseState, Touch,
  } = Input;

  const nullKeyboard = new KeyboardState(null);
  add("keyboard.null.count", String(nullKeyboard.GetPressedKeys().length));
  const keyboard = new KeyboardState([Keys.Z, 7, Keys.A, Keys.A, 300]);
  add("keyboard.pressed", keyboard.GetPressedKeys().join(","));
  add("keyboard.invalid", `${flag(keyboard.IsKeyDown(7))},${flag(keyboard.IsKeyDown(300))}`);
  add("keyboard.hash", String(keyboard.GetHashCode()));
  const mouse = new MouseState(12, -3, 120, ButtonState.Pressed, ButtonState.Released,
    ButtonState.Pressed, ButtonState.Pressed, ButtonState.Released);
  add("mouse.string", mouse.ToString());
  add("mouse.hash", String(mouse.GetHashCode()));
  const thumbSticks = new GamePadThumbSticks(new Vector2(2, -2), new Vector2(0.25, -0.5));
  add("thumbs.clamp", [thumbSticks.Left.X, thumbSticks.Left.Y, thumbSticks.Right.X, thumbSticks.Right.Y].map(bits).join(","));
  const triggers = new GamePadTriggers(-0.5, 1.5);
  add("triggers.clamp", `${bits(triggers.Left)},${bits(triggers.Right)}`);
  add("gamepad.null", exceptionName(() => new GamePadState(
    new Vector2(0.1, -0.3), new Vector2(0.3, -0.3), 0.1, 0.2, null,
  )));
  const state = new GamePadState(new Vector2(0.1, -0.3), new Vector2(0.3, -0.3), 0.1, 0.2, []);
  add("gamepad.virtual", [
    Buttons.LeftThumbstickRight, Buttons.LeftThumbstickDown, Buttons.RightThumbstickRight,
    Buttons.RightThumbstickDown, Buttons.LeftTrigger, Buttons.RightTrigger,
  ].map((button) => flag(state.IsButtonDown(button))).join(","));
  const filtered = new GamePadState(Vector2.Zero, Vector2.Zero, 0, 0,
    [Buttons.A, Buttons.LeftTrigger, 0x40000000, -2147483648]);
  add("gamepad.filtered", [Buttons.A, Buttons.LeftTrigger, 0x40000000, -2147483648]
    .map((button) => flag(filtered.IsButtonDown(button))).join(","));
  add("gamepad.string", state.ToString());
  const buttons = new GamePadButtons(Buttons.A | Buttons.Y | Buttons.Back);
  add("buttons.string", buttons.ToString());
  add("buttons.hash", String(buttons.GetHashCode()));
  const dPad = new GamePadDPad(ButtonState.Pressed, ButtonState.Released, ButtonState.Released, ButtonState.Pressed);
  add("dpad.string", dPad.ToString());
  add("dpad.hash", String(dPad.GetHashCode()));

  const withoutPrevious = new Touch.TouchLocation(7, Touch.TouchLocationState.Pressed, new Vector2(1, 2));
  const previous = withoutPrevious.TryGetPreviousLocation();
  add("touch.previous.none", `${flag(previous.Success)},${previous.Value.Id},${previous.Value.State}`);
  const first = new Touch.TouchLocation(5, Touch.TouchLocationState.Pressed, new Vector2(1, 2),
    Touch.TouchLocationState.Moved, new Vector2(0.5, 1.5));
  const sameCoordinates = new Touch.TouchLocation(5, Touch.TouchLocationState.Released, new Vector2(1, 2),
    Touch.TouchLocationState.Released, new Vector2(0.5, 1.5));
  add("touch.equals", `${flag(first.Equals(sameCoordinates))},${flag(touchLocationsEqual(first, sameCoordinates))}`);
  add("touch.hash", String(first.GetHashCode()));
  add("touch.string", first.ToString());
  const source = [first];
  const collection = new Touch.TouchCollection(source);
  source[0] = new Touch.TouchLocation(99, Touch.TouchLocationState.Released, Vector2.Zero);
  add("touch.collection.clone", String(collection.Get(0).Id));
  add("touch.collection.contains", flag(collection.Contains(sameCoordinates)));
  add("touch.collection.oob", exceptionName(() => collection.Get(1)));
  return observed;
}

function captureAudio() {
  const observed = new Map();
  const add = (id, value) => observed.set(id, value);
  const {
    AudioChannels, AudioEmitter, AudioListener, AudioStopOptions, DynamicSoundEffectInstance,
    MicrophoneState, RendererDetail, SoundEffect, SoundState,
  } = Audio;

  add("audio.enum.channels", `${AudioChannels.Mono},${AudioChannels.Stereo}`);
  add("audio.enum.state", `${SoundState.Playing},${SoundState.Paused},${SoundState.Stopped}`);
  add("audio.enum.stop", `${AudioStopOptions.AsAuthored},${AudioStopOptions.Immediate}`);
  add("audio.enum.microphone_state", `${MicrophoneState.Started},${MicrophoneState.Stopped}`);
  const renderer = new RendererDetail();
  add("audio.renderer.default", `${renderer.FriendlyName ?? "<null>"},${renderer.RendererId ?? "<null>"}`);
  add("audio.renderer.equals", `${flag(renderer.Equals(renderer))},${flag(renderer.Equals(null))}`);

  const listener = new AudioListener();
  add("audio.listener.position", vectorBits(listener.Position));
  add("audio.listener.velocity", vectorBits(listener.Velocity));
  add("audio.listener.forward", vectorBits(listener.Forward));
  add("audio.listener.up", vectorBits(listener.Up));
  const emitter = new AudioEmitter();
  add("audio.emitter.position", vectorBits(emitter.Position));
  add("audio.emitter.velocity", vectorBits(emitter.Velocity));
  add("audio.emitter.forward", vectorBits(emitter.Forward));
  add("audio.emitter.up", vectorBits(emitter.Up));
  add("audio.emitter.doppler.default", bits(emitter.DopplerScale));
  add("audio.emitter.doppler.negative", exceptionDetail(() => emitter.DopplerScale = -1));
  add("audio.emitter.doppler.nan", exceptionDetail(() => emitter.DopplerScale = Number.NaN));

  add("audio.duration.zero", String(SoundEffect.GetSampleDuration(0, 44100, AudioChannels.Mono).Ticks));
  add("audio.duration.mono", String(SoundEffect.GetSampleDuration(88200, 44100, AudioChannels.Mono).Ticks));
  add("audio.duration.stereo", String(SoundEffect.GetSampleDuration(88200, 44100, AudioChannels.Stereo).Ticks));
  add("audio.duration.partial", String(SoundEffect.GetSampleDuration(3, 44100, AudioChannels.Mono).Ticks));
  add("audio.duration.rounding", String(SoundEffect.GetSampleDuration(10, 8000, AudioChannels.Mono).Ticks));
  add("audio.duration.negative", exceptionDetail(() => SoundEffect.GetSampleDuration(-1, 44100, AudioChannels.Mono)));
  add("audio.duration.rate.low", exceptionDetail(() => SoundEffect.GetSampleDuration(2, 7999, AudioChannels.Mono)));
  add("audio.duration.rate.high", exceptionDetail(() => SoundEffect.GetSampleDuration(2, 48001, AudioChannels.Mono)));
  add("audio.duration.rate.order", exceptionDetail(() => SoundEffect.GetSampleDuration(-1, 7999, AudioChannels.Mono)));
  add("audio.duration.channels", exceptionDetail(() => SoundEffect.GetSampleDuration(2, 44100, 0)));

  add("audio.size.zero", String(SoundEffect.GetSampleSizeInBytes(TimeSpan.Zero, 44100, AudioChannels.Mono)));
  add("audio.size.mono", String(SoundEffect.GetSampleSizeInBytes(TimeSpan.FromSeconds(1), 44100, AudioChannels.Mono)));
  add("audio.size.stereo", String(SoundEffect.GetSampleSizeInBytes(TimeSpan.FromSeconds(1), 44100, AudioChannels.Stereo)));
  add("audio.size.rounding", String(SoundEffect.GetSampleSizeInBytes(TimeSpan.FromMilliseconds(1), 44100, AudioChannels.Stereo)));
  add("audio.size.negative", exceptionDetail(() => SoundEffect.GetSampleSizeInBytes(TimeSpan.FromTicks(-1n), 44100, AudioChannels.Mono)));
  add("audio.size.overflow", exceptionDetail(() => SoundEffect.GetSampleSizeInBytes(TimeSpan.MaxValue, 44100, AudioChannels.Mono)));
  add("audio.size.rate.order", exceptionDetail(() => SoundEffect.GetSampleSizeInBytes(TimeSpan.FromTicks(-1n), 7999, AudioChannels.Mono)));

  add("audio.ctor.basic.null", exceptionName(() => new SoundEffect(null, 44100, AudioChannels.Mono)));
  add("audio.ctor.basic.empty", exceptionName(() => new SoundEffect([], 44100, AudioChannels.Mono)));
  add("audio.ctor.rate_before_buffer", exceptionDetail(() => new SoundEffect([], 7999, AudioChannels.Mono)));
  add("audio.ctor.channels_before_buffer", exceptionDetail(() => new SoundEffect([], 44100, 0)));
  add("audio.ctor.unaligned_buffer", exceptionName(() => new SoundEffect([0], 44100, AudioChannels.Mono)));
  add("audio.ctor.offset", exceptionName(() => new SoundEffect([0, 0, 0, 0], -1, 2, 44100, AudioChannels.Mono, 0, 0)));
  add("audio.ctor.count", exceptionName(() => new SoundEffect([0, 0, 0, 0], 0, 3, 44100, AudioChannels.Mono, 0, 0)));
  add("audio.ctor.range_overflow", exceptionName(() => new SoundEffect([0, 0, 0, 0], 2, 4, 44100, AudioChannels.Mono, 0, 0)));
  add("audio.ctor.loop_negative", exceptionName(() => new SoundEffect([0, 0, 0, 0], 0, 4, 44100, AudioChannels.Mono, -1, 0)));
  add("audio.ctor.loop_past_end", exceptionName(() => new SoundEffect([0, 0, 0, 0], 0, 4, 44100, AudioChannels.Mono, 2, 1)));
  add("audio.ctor.loop_overflow", exceptionName(() => new SoundEffect([0, 0, 0, 0], 0, 4, 44100, AudioChannels.Mono, 0x7fffffff, 1)));
  add("audio.dynamic.rate", exceptionDetail(() => new DynamicSoundEffectInstance(7999, AudioChannels.Mono)));
  add("audio.dynamic.channels", exceptionDetail(() => new DynamicSoundEffectInstance(44100, 0)));
  return observed;
}

async function captureSubsystemProjection() {
  const observed = new Map();
  const add = (id, value) => observed.set(id, value);
  const previous = getBackend();
  const { NativeResourceLifetime } = await import("../dist/internal/ownership.js");
  let next = 9000n;
  const instances = new Map();
  const parent = new NativeResourceLifetime({
    Handle: next++, Ownership: "owned", Release() {}, Label: "differential subsystem backend",
  });
  const audio = {
    ParentLifetime: parent,
    createSoundEffect: () => next++, createSoundEffectFromEncoded: () => next++,
    getSoundEffectDurationTicks: () => 625n, getSoundEffectName: () => "", setSoundEffectName() {},
    createSoundEffectInstance() {
      const handle = next++;
      instances.set(handle, { State: Audio.SoundState.Stopped, Volume: 1, Pitch: 0, Pan: 0, IsLooped: false });
      return handle;
    },
    playSoundEffect: () => true, destroySoundEffect() {},
    getMasterVolume: () => 1, setMasterVolume() {}, getDistanceScale: () => 1, setDistanceScale() {},
    getDopplerScale: () => 1, setDopplerScale() {}, getSpeedOfSound: () => 343.5, setSpeedOfSound() {},
    playSoundEffectInstance(handle) { instances.get(handle).State = Audio.SoundState.Playing; },
    pauseSoundEffectInstance(handle) {
      const value = instances.get(handle);
      if (value.State === Audio.SoundState.Playing) value.State = Audio.SoundState.Paused;
    },
    resumeSoundEffectInstance(handle) { instances.get(handle).State = Audio.SoundState.Playing; },
    stopSoundEffectInstance(handle) { instances.get(handle).State = Audio.SoundState.Stopped; },
    getSoundEffectInstanceInfo(handle) { return { ...instances.get(handle) }; },
    setSoundEffectInstanceVolume(handle, value) { instances.get(handle).Volume = value; },
    setSoundEffectInstancePitch(handle, value) { instances.get(handle).Pitch = value; },
    setSoundEffectInstancePan(handle, value) { instances.get(handle).Pan = value; },
    setSoundEffectInstanceLooped(handle, value) { instances.get(handle).IsLooped = value; },
    applySoundEffectInstance3D() {},
    destroySoundEffectInstance(handle) { instances.delete(handle); },
    createDynamicSoundEffectInstance: () => next++, getDynamicPendingBufferCount: () => 0, submitDynamicBuffer() {},
  };
  const media = {
    getAvailableMediaSources: () => [], playSongs() {}, pause() {}, resume() {}, stop() {},
    moveNext() {}, movePrevious() {}, setVolume() {}, setMuted() {}, setRepeating() {}, setShuffled() {},
    setVisualizationEnabled() {}, getGameHasControl: () => true, getPlayPositionTicks: () => 0n,
    getVisualizationData: () => ({ Frequencies: new Array(256).fill(0), Samples: new Array(256).fill(0) }),
    update() {},
  };
  const backend = Object.create(previous);
  Object.assign(backend, {
    Kind: "node-native", IsAvailable: true, AbiVersion: "0.7.0-projection",
    Detail: "deterministic subsystem projection backend", Audio: audio, Media: media,
  });
  setBackendForInternalUse(backend);
  let effect;
  let first;
  let second;
  let songs;
  try {
    effect = new Audio.SoundEffect([0, 0], 8000, Audio.AudioChannels.Mono);
    const instance = effect.CreateInstance();
    const transitions = [instance.State];
    instance.Pause(); transitions.push(instance.State);
    instance.IsLooped = true;
    instance.Volume = 0.25; instance.Pitch = -0.5; instance.Pan = 0.75;
    instance.Resume(); transitions.push(instance.State);
    instance.Stop(false); transitions.push(instance.State);
    instance.Play(); instance.Play(); transitions.push(instance.State);
    add("audio.instance.transitions", transitions.join(","));
    effect.Dispose();
    add("audio.instance.dispose", [
      flag(instance.IsDisposed), bits(instance.Volume), bits(instance.Pitch), bits(instance.Pan),
      flag(instance.IsLooped), exceptionName(() => instance.State),
    ].join(","));

    const { createSongCollectionForInternalUse } = await import(
      "../dist/Microsoft/Xna/Framework/Media/Collections.js"
    );
    first = Media.Song.FromUri("first", new URL("file:///projection/first.wav"));
    second = Media.Song.FromUri("second", new URL("file:///projection/second.wav"));
    songs = createSongCollectionForInternalUse([first, second]);
    add("media.collection.identity", [
      songs.Count, flag(songs.Get(0) === first), flag(songs.Get(0) === songs.Get(0)),
      flag([...songs][1] === second),
    ].join(","));

    Media.MediaPlayer.Stop();
    const events = [];
    const active = () => { events.push("A"); Media.MediaPlayer.ActiveSongChanged.Remove(active); };
    const changed = () => events.push(`S${Media.MediaPlayer.State}`);
    Media.MediaPlayer.ActiveSongChanged.Add(active);
    Media.MediaPlayer.MediaStateChanged.Add(changed);
    const states = [Media.MediaPlayer.State];
    Media.MediaPlayer.Play(songs); states.push(Media.MediaPlayer.State);
    Media.MediaPlayer.Pause(); states.push(Media.MediaPlayer.State);
    Media.MediaPlayer.Resume(); states.push(Media.MediaPlayer.State);
    Media.MediaPlayer.MoveNext();
    const throwing = () => { throw new Error("projection handler"); };
    Media.MediaPlayer.MediaStateChanged.Add(throwing);
    const thrown = exceptionName(() => Media.MediaPlayer.Stop());
    states.push(Media.MediaPlayer.State);
    Media.MediaPlayer.MediaStateChanged.Remove(throwing);
    Media.MediaPlayer.MediaStateChanged.Remove(changed);
    add("media.player.transitions", `${states.join(",")}|${events.join(",")}|${thrown}|${Media.MediaPlayer.Queue.ActiveSong.Name}`);
    Media.MediaPlayer.Volume = 2;
    const clampedVolume = bits(Media.MediaPlayer.Volume);
    Media.MediaPlayer.Volume = Number.NaN;
    Media.MediaPlayer.IsMuted = true;
    Media.MediaPlayer.IsRepeating = true;
    Media.MediaPlayer.IsShuffled = true;
    add("media.player.settings", `${clampedVolume},${bits(Media.MediaPlayer.Volume)},1,1,1`);

    const select = () => new Promise((resolve, reject) => {
      Storage.StorageDevice.BeginShowSelector((result) => {
        try { resolve(Storage.StorageDevice.EndShowSelector(result)); } catch (error) { reject(error); }
      }, null);
    });
    const open = (device, name) => new Promise((resolve, reject) => {
      device.BeginOpenContainer(name, (result) => {
        try { resolve(device.EndOpenContainer(result)); } catch (error) { reject(error); }
      }, null);
    });
    const device = await select();
    const container = await open(device, "differential");
    const same = await open(device, "differential");
    container.CreateDirectory("saves");
    container.CreateFile("slot.dat");
    const appended = container.OpenFile("new.dat", FileMode.Append);
    add("storage.managed.paths", [
      flag(device.IsConnected), flag(container === same), container.GetDirectoryNames("sav*").join(";"),
      container.GetFileNames("*.dat").join(";"), appended.byteLength,
      exceptionName(() => container.CreateDirectory("../escape")),
    ].join(","));
    container.Dispose();
    device.DeleteContainer("differential");

    const converter = new Design.Vector3Converter();
    const culture = { ListSeparator: ";", DecimalSeparator: "," };
    const vector = converter.ConvertFrom({}, culture, "1,5; 2,5; 3,5");
    const recreated = converter.CreateInstance({}, new Map([["X", 7], ["Y", 8], ["Z", 9]]));
    add("design.vector3.converter", [
      converter.ConvertTo({}, culture, vector, String),
      [...converter.GetProperties({}, vector, [])].join(":"),
      `${recreated.X}:${recreated.Y}:${recreated.Z}`,
    ].join("|"));
  } finally {
    songs?.Dispose();
    first?.Dispose();
    second?.Dispose();
    effect?.Dispose();
    parent.Dispose();
    setBackendForInternalUse(previous);
  }
  return observed;
}

function graphicsBackend() {
  let next = 100n;
  return {
    Kind: "node-native", IsAvailable: true, AbiVersion: "0.7.0-reference",
    Detail: "deterministic differential backend",
    async initialize() {}, updateFrameworkDispatcher() {}, getLastError() { return null; },
    createGame() { return next++; }, async runGame() {}, runGameOneFrame() {}, exitGame() {}, destroyGame() {},
    createGraphicsDeviceManager() { return next++; }, configureGraphicsDeviceManager() {},
    applyGraphicsDeviceManagerChanges() {}, toggleGraphicsDeviceManagerFullScreen() {},
    createManagedGraphicsDevice() {}, beginGraphicsDeviceManagerDraw() { return true; },
    endGraphicsDeviceManagerDraw() {}, destroyGraphicsDeviceManager() {}, borrowGraphicsDevice() { return 500n; },
    clearGraphicsDevice() {}, presentGraphicsDevice() {},
    createTexture2D() { return next++; }, destroyTexture2D() {},
    createSpriteBatch() { return next++; }, beginSpriteBatch() {}, submitSpriteBatch() {},
    endSpriteBatch() {}, destroySpriteBatch() {},
  };
}

async function captureGraphicsContent() {
  const observed = new Map();
  const add = (id, value) => observed.set(id, value);
  const previous = getBackend();
  setBackendForInternalUse(graphicsBackend());
  const game = new Game();
  const manager = new GraphicsDeviceManager(game);
  manager.CreateDevice();
  const device = manager.GraphicsDevice;
  const texture = new Graphics.Texture2D(device, 4, 4);
  const batch = new Graphics.SpriteBatch(device);
  try {
    add("graphics.texture.validation", [
      exceptionName(() => texture.SetData(1, null, new Array(16).fill(Color.White), 0, 16)),
      exceptionName(() => texture.SetData(0, new Rectangle(-1, 0, 1, 1), [Color.White], 0, 1)),
      exceptionName(() => texture.SetData(new Uint8Array(64))),
    ].join(","));
    add("graphics.spritebatch.pairing", [
      exceptionName(() => batch.End()),
      exceptionName(() => batch.Draw(texture, Vector2.Zero, Color.White)),
      (() => { batch.Begin(); const value = exceptionName(() => batch.Begin()); batch.End(); return value; })(),
    ].join(","));

    const { createSpriteFontForInternalUse } = await import(
      "../dist/Microsoft/Xna/Framework/Graphics/SpriteFont.js"
    );
    const font = createSpriteFontForInternalUse({
      Texture: texture,
      GlyphBounds: [new Rectangle(0, 0, 4, 7), new Rectangle(4, 0, 4, 7)],
      Cropping: [new Rectangle(0, 1, 4, 7), new Rectangle(0, 1, 4, 7)],
      Characters: ["A", "?"], LineSpacing: 9, Spacing: 1,
      Kerning: [new Vector3(1, 4, 1), new Vector3(0, 4, 0)], DefaultCharacter: "?",
    });
    const measured = font.MeasureString("AA");
    add("graphics.spritefont.measure", `${bits(measured.X)},${bits(measured.Y)}`);

    const { createEffectForInternalUse } = await import(
      "../dist/Microsoft/Xna/Framework/Graphics/Effect.js"
    );
    const effect = createEffectForInternalUse(device, {
      Parameters: [{
        Name: "Offset", Semantic: "POSITION",
        ParameterClass: Graphics.EffectParameterClass.Vector,
        ParameterType: Graphics.EffectParameterType.Single,
        RowCount: 1, ColumnCount: 2, Value: new Vector2(1, 2), Annotations: [],
      }],
      Techniques: [{ Name: "Default", Passes: [{ Name: "P0" }] }],
    });
    const parameter = effect.Parameters.Get("Offset");
    const input = new Vector2(7, 8);
    parameter.SetValue(input);
    input.X = 99;
    const value = parameter.GetValueVector2();
    add("graphics.effect.parameter", `${flag(parameter === effect.Parameters.GetParameterBySemantic("POSITION"))},${bits(value.X)},${bits(value.Y)}`);
    const pass = effect.CurrentTechnique.Passes.Get(0);
    add("graphics.effect.identity", `${flag(effect.CurrentTechnique === effect.Techniques.Get(0))},${flag(pass === effect.CurrentTechnique.Passes.Get("P0"))}`);
    effect.Dispose();

    const basic = new Graphics.BasicEffect(device);
    add("graphics.basiceffect.defaults", [
      bits(basic.Alpha), flag(basic.FogEnabled), bits(basic.FogStart), bits(basic.FogEnd),
      flag(basic.LightingEnabled), flag(basic.TextureEnabled), flag(basic.VertexColorEnabled),
      bits(basic.SpecularPower),
    ].join(","));

    const { createModelForInternalUse } = await import(
      "../dist/Microsoft/Xna/Framework/Graphics/Model.js"
    );
    const model = createModelForInternalUse(device, {
      Bones: [
        { Name: "Root", Transform: Matrix.CreateTranslation(1, 1, 1) },
        { Name: "Child", Transform: Matrix.CreateTranslation(2, 3, 4), ParentIndex: 0 },
      ],
      RootBoneIndex: 0,
      Meshes: [],
    });
    const transforms = new Array(2);
    model.CopyAbsoluteBoneTransformsTo(transforms);
    add("graphics.model.absolute", vectorBits(transforms[1].Translation));

    class InvalidXnbContent extends Content.ContentManager {
      constructor() { super({ GetService() { return null; } }); }
      OpenStream() { return Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); }
    }
    class InvalidAsset {}
    add("content.xnb.badmagic", exceptionName(() => new InvalidXnbContent().Load(InvalidAsset, "bad")));
    basic.Dispose();
  } finally {
    batch.Dispose();
    texture.Dispose();
    game.Dispose();
    setBackendForInternalUse(previous);
  }
  return observed;
}

test(`XNA differential corpus: ${corpus.cases.length} observations`, async (context) => {
  assert.equal(corpus.profile, "XNA 4.0 Windows runtime");
  const observations = new Map([
    ...captureMath(), ...captureInput(), ...captureAudio(), ...(await captureSubsystemProjection()),
    ...(await captureGraphicsContent()),
  ]);
  assert.equal(observations.size, corpus.cases.length);
  for (const fixture of corpus.cases) {
    await context.test(fixture.id, () => assert.equal(observations.get(fixture.id), fixture.expected));
  }
});
