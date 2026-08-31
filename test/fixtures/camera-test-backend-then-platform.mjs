#!/usr/bin/env node
/**
 * The upstream camera crash, run where it can only kill itself.
 *
 * Opening CNA's test-backend camera, destroying it, and then opening the platform's own camera is
 * a use-after-free in CNA 0.21.0: the C ABI installs the test provider as a process-wide platform
 * override holding a raw pointer into the camera resource, and destroying that resource frees the
 * provider without clearing the override. See docs/upstream-cna-findings.md.
 *
 * This script exists so a test can assert that behaviour without taking the test runner down with
 * it. It prints SURVIVED and exits 0 only if CNA has been repaired.
 */
import path from "node:path";

import { Game, GraphicsDeviceManager, LoadNodeNativeBackend } from "../../dist/index.js";
import { CnaCamera } from "../../dist/extensions/devices/index.js";

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(process.env.CNA_NATIVE_LIBRARY),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

class CrashProbe extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
  }

  LoadContent() {
    const test = CnaCamera.OpenForTests();
    test.Dispose();
    // The next line is the one that dies.
    const platform = CnaCamera.Open();
    platform.Dispose();
    console.log("SURVIVED");
    this.Exit();
    super.LoadContent();
  }

  Draw(gameTime) {
    this.Exit();
    super.Draw(gameTime);
  }
}

const game = new CrashProbe();
await game.Run();
game.Dispose();
