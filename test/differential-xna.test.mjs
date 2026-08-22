import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  BoundingBox, BoundingFrustum, BoundingSphere, Color, Curve, CurveContinuity, CurveKey,
  CurveKeyCollection, CurveLoopType, CurveTangent, Graphics, Input, MathHelper, Matrix, Plane,
  Point, Quaternion, Ray, Rectangle, Vector2, Vector3, Vector4,
} from "../dist/index.js";
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

test(`XNA differential corpus: ${corpus.cases.length} observations`, async (context) => {
  assert.equal(corpus.profile, "XNA 4.0 Windows runtime");
  const observations = new Map([...captureMath(), ...captureInput()]);
  assert.equal(observations.size, corpus.cases.length);
  for (const fixture of corpus.cases) {
    await context.test(fixture.id, () => assert.equal(observations.get(fixture.id), fixture.expected));
  }
});
