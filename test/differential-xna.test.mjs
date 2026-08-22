import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  BoundingBox,
  BoundingSphere,
  Color,
  MathHelper,
  Matrix,
  Plane,
  Quaternion,
  Ray,
  Vector2,
  Vector3,
  Vector4,
} from "../dist/index.js";

const corpus = JSON.parse(fs.readFileSync(new URL("./fixtures/xna40-value-corpus.json", import.meta.url), "utf8"));
const view = new DataView(new ArrayBuffer(4));

function decode(value) {
  if (value === "NaN") return Number.NaN;
  if (value === "+Infinity") return Number.POSITIVE_INFINITY;
  if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
  return value;
}

function bits(value) {
  view.setFloat32(0, value, false);
  return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0");
}

function vector3(value) {
  return new Vector3(...value.map(decode));
}

function quaternionBits(value) {
  return [value.X, value.Y, value.Z, value.W].map(bits);
}

function matrixBits(value) {
  return [
    value.M11, value.M12, value.M13, value.M14, value.M21, value.M22, value.M23, value.M24,
    value.M31, value.M32, value.M33, value.M34, value.M41, value.M42, value.M43, value.M44,
  ].map(bits);
}

function execute(fixture) {
  const input = fixture.input;
  switch (fixture.operation) {
    case "Vector.NormalizeZero": {
      const v2 = Vector2.Normalize(Vector2.Zero);
      const v3 = Vector3.Normalize(Vector3.Zero);
      const v4 = Vector4.Normalize(Vector4.Zero);
      return [v2.X, v2.Y, v3.X, v3.Y, v3.Z, v4.X, v4.Y, v4.Z, v4.W].map(Number.isNaN);
    }
    case "Vector.DivideScalar":
      return [
        Vector2.Divide(new Vector2(input.v2[0]), input.v2[1]).X,
        Vector3.Divide(new Vector3(input.v3[0]), input.v3[1]).X,
        Vector4.Divide(new Vector4(input.v4[0]), input.v4[1]).X,
        Matrix.Divide(Matrix.Identity, input.matrix[1]).M11,
      ].map(bits);
    case "Quaternion.Multiply":
      return quaternionBits(Quaternion.Multiply(new Quaternion(...input.left), new Quaternion(...input.right)));
    case "Quaternion.SlerpAxes": {
      const yaw = Quaternion.CreateFromAxisAngle(Vector3.Up, input.yaw);
      const pitch = Quaternion.CreateFromAxisAngle(Vector3.Right, input.pitch);
      return quaternionBits(Quaternion.Slerp(yaw, pitch, input.amount));
    }
    case "Quaternion.AxisAngleY":
      return quaternionBits(Quaternion.CreateFromAxisAngle(Vector3.Up, Math.fround(input.angle)));
    case "Quaternion.FromRotationY":
      return quaternionBits(Quaternion.CreateFromRotationMatrix(Matrix.CreateRotationY(input.angle)));
    case "Matrix.InverseProduct": {
      const matrix = Matrix.Multiply(
        Matrix.Multiply(Matrix.CreateScale(...input.scale), Matrix.CreateRotationY(input.rotationY)),
        Matrix.CreateTranslation(...input.translation),
      );
      return matrixBits(Matrix.Multiply(matrix, Matrix.Invert(matrix)));
    }
    case "Matrix.InverseSingular": {
      const zero = new Matrix(...Array(16).fill(0));
      const inverse = Matrix.Invert(zero);
      return [inverse.M11, inverse.M22, inverse.M33, inverse.M44].map(Number.isNaN);
    }
    case "Color.FromVector4":
      return new Color(new Vector4(...input.map(decode))).PackedValue.toString(16).toUpperCase().padStart(8, "0");
    case "Color.Lerp":
      return Color.Lerp(new Color(...input.left), new Color(...input.right), input.amount).PackedValue.toString(16).toUpperCase().padStart(8, "0");
    case "Color.Transparent":
      return Color.Transparent.PackedValue.toString(16).toUpperCase().padStart(8, "0");
    case "BoundingBox.ContainsPoint":
      return new BoundingBox(vector3(input.min), vector3(input.max)).Contains(vector3(input.point));
    case "BoundingBox.NaN": {
      const box = new BoundingBox(new Vector3(-1), new Vector3(1));
      const nanBox = new BoundingBox(new Vector3(Number.NaN, -1, -1), new Vector3(Number.NaN, 1, 1));
      return [box.Contains(new Vector3(Number.NaN, 0, 0)), box.Intersects(nanBox)];
    }
    case "BoundingSphere.ContainsPoint":
      return new BoundingSphere(vector3(input.center), input.radius).Contains(vector3(input.point));
    case "BoundingSphere.IntersectsSphere":
      return new BoundingSphere(vector3(input.left[0]), input.left[1]).Intersects(
        new BoundingSphere(vector3(input.right[0]), input.right[1]),
      );
    case "BoundingSphere.CreateFromPoints": {
      const sphere = BoundingSphere.CreateFromPoints(input.map(vector3));
      return [sphere.Center.X, sphere.Center.Y, sphere.Center.Z, sphere.Radius].map(bits);
    }
    case "Ray.IntersectsSphere":
      return bits(new Ray(vector3(input.position), vector3(input.direction)).Intersects(
        new BoundingSphere(vector3(input.sphere[0]), input.sphere[1]),
      ));
    case "MathHelper.Clamp":
      return bits(MathHelper.Clamp(...input));
    case "MathHelper.WrapAngle":
      return bits(MathHelper.WrapAngle(Math.fround(input)));
    case "MathHelper.Splines":
      return [MathHelper.CatmullRom(...input.catmull), MathHelper.Hermite(...input.hermite)].map(bits);
    case "MathHelper.HermiteNaN":
      return Number.isNaN(MathHelper.Hermite(...input.map(decode)));
    case "Vector3.MinNaN": {
      const value = Vector3.Min(new Vector3(Number.NaN, 1, Number.NaN), new Vector3(7, Number.NaN, Number.NaN));
      return [bits(value.X), Number.isNaN(value.Y) ? "NaN" : bits(value.Y), Number.isNaN(value.Z) ? "NaN" : bits(value.Z)];
    }
    case "Vector3.ClampReversed": {
      const value = Vector3.Clamp(Vector3.Zero, new Vector3(2), new Vector3(1));
      return [value.X, value.Y, value.Z].map(bits);
    }
    case "Plane.Normalize": {
      const value = Plane.Normalize(new Plane(vector3(input.normal), input.d));
      return [value.Normal.X, value.Normal.Y, value.Normal.Z, value.D].map(bits);
    }
    case "Plane.IntersectsBox":
      return new BoundingBox(vector3(input.box[0]), vector3(input.box[1])).Intersects(
        new Plane(vector3(input.plane[0]), input.plane[1]),
      );
    case "Value.NegateSignedZero": {
      const matrix = Matrix.Negate(new Matrix(...Array(16).fill(0)));
      return [Vector4.Negate(Vector4.Zero).X, Quaternion.Negate(new Quaternion(0, 0, 0, 0)).X, matrix.M11].map(bits);
    }
    default:
      throw new Error(`unsupported corpus operation: ${fixture.operation}`);
  }
}

test(`XNA differential corpus: ${corpus.cases.length} observations`, async (context) => {
  assert.equal(corpus.profile, "XNA 4.0 Windows runtime");
  for (const fixture of corpus.cases) {
    await context.test(fixture.id, () => {
      assert.deepEqual(execute(fixture), fixture.expected);
    });
  }
});
