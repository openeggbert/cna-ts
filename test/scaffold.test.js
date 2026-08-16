import assert from "node:assert/strict";
import test from "node:test";

import {
  bindingsAvailable,
  Color,
  Game,
  NativeUnavailableError,
  Vector2,
} from "../src/index.js";

test("vector arithmetic stays in JavaScript", () => {
  const vector = new Vector2(2, 3).add(new Vector2(4, -1)).scale(2);
  assert.deepEqual(vector, new Vector2(12, 4));
  assert.equal(new Vector2(3, 4).lengthSquared, 25);
});

test("known colors match XNA values", () => {
  assert.deepEqual(Color.CORNFLOWER_BLUE, new Color(100, 149, 237, 255));
  assert.throws(() => new Color(256, 0, 0), RangeError);
});

test("native execution reports scaffold status", async () => {
  assert.equal(bindingsAvailable, false);
  await assert.rejects(new Game().run(), NativeUnavailableError);
});

test("disposed games reject lifecycle control", () => {
  const game = new Game();
  game.dispose();
  assert.throws(() => game.exit(), /already disposed/);
});
