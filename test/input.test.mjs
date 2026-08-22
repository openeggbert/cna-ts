import assert from "node:assert/strict";
import test from "node:test";

import {
  Input,
  NativeUnavailableError,
  Vector2,
} from "../dist/index.js";

const {
  ButtonState,
  Buttons,
  GamePadState,
  GamePadThumbSticks,
  GamePadTriggers,
  Keyboard,
  KeyboardState,
  Keys,
  Mouse,
  MouseState,
} = Input;

test("keyboard and mouse snapshots preserve XNA value semantics", () => {
  const keyboard = new KeyboardState([Keys.Z, Keys.A, Keys.A, 999]);
  assert.deepEqual(keyboard.GetPressedKeys(), [Keys.A, Keys.Z]);
  assert.equal(keyboard.IsKeyDown(Keys.A), true);
  assert.equal(keyboard.IsKeyUp(Keys.B), true);

  const mouse = new MouseState(
    12, -3, 120,
    ButtonState.Pressed, ButtonState.Released, ButtonState.Pressed,
    ButtonState.Pressed, ButtonState.Released,
  );
  assert.equal(mouse.ToString(), "{X:12 Y:-3 Buttons:Left Right XButton1 Wheel:120}");
  assert.equal(mouse.Equals(new MouseState(
    12, -3, 120,
    ButtonState.Pressed, ButtonState.Released, ButtonState.Pressed,
    ButtonState.Pressed, ButtonState.Released,
  )), true);
});

test("gamepad values clamp analog inputs and derive virtual buttons", () => {
  const sticks = new GamePadThumbSticks(new Vector2(2, -2), new Vector2(0.5, 0));
  const triggers = new GamePadTriggers(-1, 2);
  assert.ok(sticks.Left.Equals(new Vector2(1, -1)));
  assert.deepEqual([triggers.Left, triggers.Right], [0, 1]);

  const state = new GamePadState(Vector2.UnitX, Vector2.Zero, 0, 0, [Buttons.A]);
  assert.equal(state.IsButtonDown(Buttons.A), true);
  assert.equal(state.IsButtonDown(Buttons.LeftThumbstickRight), true);
  assert.equal(state.IsButtonUp(Buttons.B), true);
});

test("polling APIs fail explicitly when no CNA backend is loaded", () => {
  assert.throws(() => Keyboard.GetState(), NativeUnavailableError);
  assert.throws(() => Mouse.GetState(), NativeUnavailableError);
  assert.throws(() => Input.GamePad.GetState(0), NativeUnavailableError);
});
