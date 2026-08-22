import assert from "node:assert/strict";
import test from "node:test";

import {
  bindingsAvailable,
  Color,
  Game,
  GameTime,
  GetRuntimeStatus,
  Microsoft,
  NativeUnavailableError,
  TimeSpan,
  Vector2,
} from "../dist/index.js";

test("root aliases and namespace projection share implementations", () => {
  assert.equal(Microsoft.Xna.Framework.Vector2, Vector2);
  assert.equal(Microsoft.Xna.Framework.Color, Color);
  assert.equal(Microsoft.Xna.Framework.GameTime, GameTime);
});

test("Vector2 is mutable and named arithmetic snapshots inputs", () => {
  const left = new Vector2(2, 3);
  const right = new Vector2(4, -1);
  const result = Vector2.Add(left, right);
  assert.deepEqual({ X: result.X, Y: result.Y }, { X: 6, Y: 2 });
  assert.equal(new Vector2(3, 4).LengthSquared(), 25);
  left.X = 50;
  assert.equal(result.X, 6);
});

test("Color clamps XNA integer channels, packs AABBGGRR, and stays mutable", () => {
  const color = new Color(300, -1, 128, 255);
  assert.deepEqual(
    { R: color.R, G: color.G, B: color.B, A: color.A },
    { R: 255, G: 0, B: 128, A: 255 },
  );
  assert.equal(color.PackedValue, 0xff8000ff);
  color.G = 42;
  assert.equal(color.G, 42);
  assert.notEqual(Color.White, Color.White);
});

test("TimeSpan and GameTime retain tick precision", () => {
  const elapsed = TimeSpan.FromTicks(166_667n);
  const total = TimeSpan.FromSeconds(5).Add(elapsed);
  const gameTime = new GameTime(total, elapsed, true);
  assert.equal(gameTime.ElapsedGameTime.Ticks, 166_667n);
  assert.equal(gameTime.TotalGameTime.TotalMilliseconds, 5016.6667);
  assert.equal(gameTime.IsRunningSlowly, true);
});

test("native execution truthfully reports the absent backend", async () => {
  assert.equal(bindingsAvailable, false);
  const status = GetRuntimeStatus();
  assert.deepEqual(status.Backend, "unavailable");
  assert.match(status.Detail, /experimental C ABI 0\.7\.0/);
  assert.match(status.Detail, /no loaded WebAssembly or Node backend artifact/);
  await assert.rejects(new Game().Run(), NativeUnavailableError);
});

test("disposed games reject lifecycle control and double dispose is harmless", () => {
  const game = new Game();
  game.Dispose();
  game.Dispose();
  assert.throws(() => game.Exit(), /already disposed/);
});
