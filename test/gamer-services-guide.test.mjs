/**
 * The Guide's async surface, covered where no backend is loaded.
 *
 * `test/native-cna.integration.mjs` drives it against a real CNA library. What this file covers is
 * the other half: what the two operations do when there is no platform at all, and that the
 * modern injection surface stays outside `Microsoft.Xna.Framework`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { GamerServices, NativeUnavailableError } from "../dist/index.js";
import { CnaGuide } from "../dist/extensions/gamer-services/index.js";

const { Guide, MessageBoxIcon } = GamerServices;

test("CNA's deterministic Guide surface stays outside Microsoft.Xna.Framework", async () => {
  const xna = await import("../dist/xna.js");
  assert.equal("CnaGuide" in xna, false, "CnaGuide must not leak into the strict XNA surface");
  assert.equal(
    "CnaGuide" in xna.Microsoft.Xna.Framework.GamerServices, false,
    "nor into the GamerServices namespace, which is XNA's",
  );
  // And the Guide itself is still XNA's, with the members XNA declares.
  for (const name of [
    "BeginShowMessageBox", "EndShowMessageBox", "BeginShowKeyboardInput", "EndShowKeyboardInput",
  ]) {
    assert.equal(
      typeof xna.Microsoft.Xna.Framework.GamerServices.Guide[name], "function",
      `Guide.${name} is XNA's own`,
    );
  }
});

test("without a backend the Guide refuses as XNA does, and the injection surface by name", () => {
  // XNA raises GamerServicesNotAvailableException where the platform is absent; that is what a
  // game catches, and it must not become a NativeUnavailableError just because this is a binding.
  const { GamerServicesNotAvailableException } = GamerServices;
  assert.throws(
    () => Guide.BeginShowMessageBox("t", "x", ["A"], 0, MessageBoxIcon.None, () => {}, null),
    GamerServicesNotAvailableException,
  );
  assert.throws(
    () => Guide.BeginShowKeyboardInput(0, "t", "d", "", () => {}, null),
    GamerServicesNotAvailableException,
  );
  // The modern surface is not XNA and refuses in this package's own terms instead.
  for (const call of [
    () => CnaGuide.HasPendingMessageBox,
    () => CnaGuide.PendingMessageBox,
    () => CnaGuide.HasPendingKeyboardInput,
    () => CnaGuide.PendingKeyboardInput,
    () => CnaGuide.WasKeyboardInputCanceled,
    () => CnaGuide.ForTests.ClickMessageBoxButton(0),
    () => CnaGuide.ForTests.CancelKeyboardInput(),
    () => CnaGuide.ForTests.ResetKeyboardInput(),
  ]) {
    assert.throws(call, NativeUnavailableError, call.toString());
  }
  // A bad button index is refused before the backend is even asked for.
  assert.throws(() => CnaGuide.ForTests.ClickMessageBoxButton(-1), RangeError);
  assert.throws(() => CnaGuide.ForTests.ClickMessageBoxButton(1.5), RangeError);
});
