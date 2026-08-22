import assert from "node:assert/strict";
import test from "node:test";

import {
  Color,
  MathHelper,
  Matrix,
  Quaternion,
  Vector2,
  Vector3,
  Vector4,
} from "../dist/index.js";

function approximately(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function vectorApproximately(actual, expected, tolerance = 1e-5) {
  for (const component of Object.keys(expected)) approximately(actual[component], expected[component], tolerance);
}

test("MathHelper preserves clamping, interpolation, and angle behavior", () => {
  assert.equal(MathHelper.Clamp(12, -2, 5), 5);
  assert.equal(MathHelper.Clamp(-3, -2, 5), -2);
  assert.ok(Number.isNaN(MathHelper.Clamp(Number.NaN, 0, 1)));
  approximately(MathHelper.Lerp(10, 20, 0.25), 12.5);
  approximately(MathHelper.SmoothStep(0, 1, 0.5), 0.5);
  approximately(MathHelper.ToDegrees(MathHelper.Pi), 180, 2e-5);
  approximately(MathHelper.WrapAngle(MathHelper.Pi * 3), MathHelper.Pi, 2e-5);
});

test("Vector2/3/4 named operations return snapshots and preserve mutation", () => {
  const cross = Vector3.Cross(Vector3.UnitX, Vector3.UnitY);
  assert.ok(cross.Equals(Vector3.UnitZ));
  assert.equal(Vector3.Dot(cross, Vector3.UnitX), 0);
  const source = new Vector4(1, 2, 3, 4);
  const scaled = Vector4.Multiply(source, 2);
  source.X = 100;
  vectorApproximately(scaled, { X: 2, Y: 4, Z: 6, W: 8 });
  const normalized = Vector2.Normalize(new Vector2(3, 4));
  vectorApproximately(normalized, { X: 0.6, Y: 0.8 });
  const zero = Vector3.Zero;
  zero.Normalize();
  assert.ok(Number.isNaN(zero.X) && Number.isNaN(zero.Y) && Number.isNaN(zero.Z));
});

test("matrix construction, composition, inversion, and transforms agree", () => {
  const scale = Matrix.CreateScale(2);
  const translation = Matrix.CreateTranslation(5, -1, 3);
  const combined = Matrix.Multiply(scale, translation);
  const transformed = Vector3.Transform(new Vector3(1, 2, 3), combined);
  vectorApproximately(transformed, { X: 7, Y: 3, Z: 9 });

  const inverse = Matrix.Invert(combined);
  const roundTrip = Vector3.Transform(transformed, inverse);
  vectorApproximately(roundTrip, { X: 1, Y: 2, Z: 3 });
  approximately(combined.Determinant(), 8);
  assert.ok(Matrix.Multiply(combined, inverse).Equals(Matrix.Identity));
});

test("quaternion and matrix rotations share the same convention", () => {
  const quaternion = Quaternion.CreateFromAxisAngle(Vector3.UnitZ, MathHelper.PiOver2);
  const viaQuaternion = Vector3.Transform(Vector3.UnitX, quaternion);
  const viaMatrix = Vector3.Transform(Vector3.UnitX, Matrix.CreateRotationZ(MathHelper.PiOver2));
  vectorApproximately(viaQuaternion, { X: 0, Y: 1, Z: 0 });
  vectorApproximately(viaMatrix, { X: 0, Y: 1, Z: 0 });
  const reconstructed = Quaternion.CreateFromRotationMatrix(Matrix.CreateFromQuaternion(quaternion));
  approximately(Math.abs(Quaternion.Dot(quaternion, reconstructed)), 1);
});

test("Color vector overloads clamp and round through XNA channels", () => {
  const fromVector = new Color(new Vector4(1.2, -0.5, 0.5, 1));
  assert.deepEqual(
    { R: fromVector.R, G: fromVector.G, B: fromVector.B, A: fromVector.A },
    { R: 255, G: 0, B: 128, A: 255 },
  );
  vectorApproximately(fromVector.ToVector4(), { X: 1, Y: 0, Z: 128 / 255, W: 1 });
  fromVector.PackFromVector4(new Vector4(0, 1, 0.5, 0.25));
  assert.deepEqual(
    { R: fromVector.R, G: fromVector.G, B: fromVector.B, A: fromVector.A },
    { R: 0, G: 255, B: 128, A: 64 },
  );
  assert.deepEqual(
    { R: Color.Transparent.R, G: Color.Transparent.G, B: Color.Transparent.B, A: Color.Transparent.A },
    { R: 255, G: 255, B: 255, A: 0 },
  );
  assert.deepEqual(Color.Multiply(new Color(100, 50, 10, 200), 0.5).PackedValue, new Color(50, 25, 5, 100).PackedValue);
});

test("invalid projection arguments fail deterministically", () => {
  assert.throws(() => Matrix.CreatePerspectiveFieldOfView(0, 1, 0.1, 100), RangeError);
  assert.throws(() => Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, 1, 10, 1), RangeError);
  assert.throws(() => Vector3.Add(null, Vector3.Zero), TypeError);
});
