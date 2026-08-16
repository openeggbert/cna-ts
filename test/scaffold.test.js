import assert from "node:assert/strict";
import test from "node:test";

import {
  CNA,
  Microsoft,
  NativeUnavailableError,
} from "../src/index.js";

test("vector arithmetic stays in JavaScript", () => {
  const vector = new CNA.Framework.Vector2(2, 3)
    .Add(new CNA.Framework.Vector2(4, -1));
  assert.deepEqual(vector, new CNA.Framework.Vector2(6, 2));
  assert.equal(new CNA.Framework.Vector2(3, 4).LengthSquared, 25);
});

test("known colors match XNA values", () => {
  assert.deepEqual(
    Microsoft.Xna.Framework.Color.CornflowerBlue,
    new CNA.Framework.Color(100, 149, 237, 255),
  );
  assert.throws(() => new CNA.Framework.Color(256, 0, 0), RangeError);
});

test("native execution reports scaffold status", async () => {
  assert.equal(CNA.Interop.bindingsAvailable, false);
  await assert.rejects(new Microsoft.Xna.Framework.Game().Run(), NativeUnavailableError);
});

test("disposed games reject lifecycle control", () => {
  const game = new CNA.Framework.Game();
  game.Dispose();
  assert.throws(() => game.Exit(), /already disposed/);
});
