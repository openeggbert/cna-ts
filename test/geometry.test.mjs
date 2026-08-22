import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  ContainmentType,
  Matrix,
  Plane,
  PlaneIntersectionType,
  Point,
  Ray,
  Rectangle,
  Vector3,
} from "../dist/index.js";

function approximately(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test("Point and Rectangle preserve XNA edge and intersection rules", () => {
  const rectangle = new Rectangle(10, 20, 30, 40);
  assert.equal(rectangle.Contains(new Point(10, 20)), true);
  assert.equal(rectangle.Contains(new Point(40, 60)), false);
  assert.deepEqual(rectangle.Center, new Point(25, 40));
  assert.equal(rectangle.Intersects(new Rectangle(39, 59, 3, 3)), true);
  assert.equal(rectangle.Intersects(new Rectangle(40, 60, 3, 3)), false);
  assert.deepEqual(Rectangle.Intersect(rectangle, new Rectangle(35, 55, 10, 10)), new Rectangle(35, 55, 5, 5));
});

test("planes and rays classify front, back, and hit distance", () => {
  const plane = new Plane(Vector3.UnitY, -2);
  assert.equal(plane.DotCoordinate(new Vector3(0, 3, 0)), 1);
  const ray = new Ray(new Vector3(0, 5, 0), Vector3.Down);
  approximately(ray.Intersects(plane), 3);
  assert.equal(new Ray(Vector3.Zero, Vector3.UnitX).Intersects(plane), null);
});

test("bounding boxes and spheres snapshot inputs and classify containment", () => {
  const minimum = new Vector3(-1, -1, -1);
  const box = new BoundingBox(minimum, new Vector3(1, 1, 1));
  minimum.X = -100;
  assert.equal(box.Min.X, -1);
  assert.equal(box.Contains(Vector3.Zero), ContainmentType.Contains);
  assert.equal(box.Contains(new Vector3(2, 0, 0)), ContainmentType.Disjoint);
  assert.equal(box.Intersects(new BoundingSphere(new Vector3(1.5, 0, 0), 0.75)), true);
  assert.equal(box.Intersects(new Plane(Vector3.UnitX, -2)), PlaneIntersectionType.Back);
  approximately(new Ray(new Vector3(-5, 0, 0), Vector3.UnitX).Intersects(box), 4);

  const sphere = BoundingSphere.CreateFromBoundingBox(box);
  approximately(sphere.Radius, Math.sqrt(3));
  assert.equal(sphere.Contains(box), ContainmentType.Intersects);
  assert.equal(new Ray(Vector3.Zero, Vector3.UnitX).Intersects(sphere), 0);
});

test("bounding point factories reject empty input and snapshot results", () => {
  assert.throws(() => BoundingBox.CreateFromPoints([]), RangeError);
  assert.throws(() => BoundingSphere.CreateFromPoints([]), RangeError);
  const box = BoundingBox.CreateFromPoints([new Vector3(-2, 1, 4), new Vector3(3, -5, 2)]);
  assert.ok(box.Min.Equals(new Vector3(-2, -5, 2)));
  assert.ok(box.Max.Equals(new Vector3(3, 1, 4)));
  const corners = box.GetCorners();
  corners[0].X = 999;
  assert.notEqual(box.GetCorners()[0].X, 999);
  const destination = Array.from({ length: BoundingBox.CornerCount });
  assert.equal(box.GetCorners(destination), undefined);
  assert.deepEqual(destination, box.GetCorners());
  assert.throws(() => box.GetCorners([]), RangeError);
});

test("frustum extracts normalized planes, corners, and copies its matrix", () => {
  const view = Matrix.CreateLookAt(new Vector3(0, 0, 5), Vector3.Zero, Vector3.Up);
  const projection = Matrix.CreatePerspectiveFieldOfView(Math.PI / 4, 16 / 9, 0.1, 100);
  const frustum = new BoundingFrustum(Matrix.Multiply(view, projection));
  assert.equal(frustum.Contains(Vector3.Zero), ContainmentType.Contains);
  assert.equal(frustum.Contains(new Vector3(0, 0, 10)), ContainmentType.Disjoint);
  assert.equal(frustum.GetCorners().length, BoundingFrustum.CornerCount);
  const destination = Array.from({ length: BoundingFrustum.CornerCount });
  frustum.GetCorners(destination);
  assert.deepEqual(destination, frustum.GetCorners());
  approximately(frustum.Near.Normal.Length(), 1);
  const corners = frustum.GetCorners();
  const external = frustum.Matrix;
  external.M11 = 999;
  assert.deepEqual(frustum.GetCorners(), corners);
  assert.notEqual(frustum.Matrix.M11, 999);
  assert.equal(new BoundingBox(new Vector3(-1), new Vector3(1)).Intersects(frustum), true);
  assert.equal(new BoundingSphere(Vector3.Zero, 1).Intersects(frustum), true);
  assert.notEqual(new Ray(new Vector3(0, 0, 5), Vector3.Forward).Intersects(frustum), null);
});
