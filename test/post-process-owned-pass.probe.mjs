#!/usr/bin/env node

/**
 * Characterises `PostProcessChain.AddOwned` against the live CNA library, in its own process.
 *
 * It needs its own process because of what it finds. `cna_post_process_chain_add_owned_pass`
 * consumes the pass handle -- `GetRuntimeHandles().Release(pass)` -- but does not call the
 * `RemoveOwnedGraphicsResourceFor` that `cna_post_process_pass_destroy` calls beside its own
 * release. The game's owned-graphics-resource counter therefore never comes back down, and every
 * later `cna_game_destroy` on that process refuses with `CNA_RESULT_INVALID_STATE`. One transfer
 * poisons the whole runtime for the rest of the process, so running this beside the other
 * integration tests would fail all of them for a reason that has nothing to do with them.
 *
 * This prints one JSON line and the suite asserts it. When CNA fixes the accounting, `gameDisposed`
 * becomes true and the assertion in `native-cna.integration.mjs` fails -- which is the point: this
 * is a regression detector for a known upstream defect, not a permanent excuse for one.
 */

import path from "node:path";

import { Game, GraphicsDeviceManager, LoadNodeNativeBackend } from "../dist/index.js";
import * as graphics from "../dist/extensions/graphics/index.js";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  process.stdout.write(`${JSON.stringify({ status: "NOT_CONFIGURED" })}\n`);
  process.exit(0);
}

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

const evidence = { status: "ok" };

class OwnedPassProbe extends Game {
  constructor() {
    super();
    this.manager = new GraphicsDeviceManager(this);
  }

  LoadContent() {
    evidence.layerAvailable = graphics.IsGraphicsExtensionLayerAvailable();
    if (!evidence.layerAvailable) {
      this.Exit();
      super.LoadContent();
      return;
    }
    const chain = new graphics.PostProcessChain(this.GraphicsDevice);
    const owned = new graphics.FxaaPass(this.GraphicsDevice);
    chain.AddOwned(owned);
    evidence.passCount = chain.PassCount;
    evidence.isOwnedByChain = owned.IsOwnedByChain;
    // Disposing a transferred pass must release nothing: CNA already consumed the handle, and a
    // second release would be a double free.
    owned.Dispose();
    evidence.disposeAfterTransferIsNoOp = owned.IsOwnedByChain;
    try {
      owned.Name;
      evidence.useAfterTransfer = "allowed";
    } catch (error) {
      evidence.useAfterTransfer = error.message;
    }
    chain.Clear();
    evidence.countAfterClear = chain.PassCount;
    chain.Dispose();
    this.Exit();
    super.LoadContent();
  }
}

const probe = new OwnedPassProbe();
await probe.Run();
try {
  probe.Dispose();
  evidence.gameDisposed = true;
} catch (error) {
  evidence.gameDisposed = false;
  evidence.gameDisposeError = (error.errors ?? [error]).map((entry) => entry.message).join("; ");
}
process.stdout.write(`${JSON.stringify(evidence)}\n`);
