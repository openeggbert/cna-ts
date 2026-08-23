import assert from "node:assert/strict";
import test from "node:test";

import {
  Content,
  Game,
  GameServiceContainer,
  NativeUnavailableError,
  TitleContainer,
} from "../dist/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";

class TestAsset {
  disposed = 0;
  Dispose() { this.disposed += 1; }
}

class OtherAsset {}

class DefaultStreamContentManager extends Content.ContentManager {
  Open(assetName) { return super.OpenStream(assetName); }
}

class ManagedContentManager extends Content.ContentManager {
  reads = [];

  ReadAsset(assetName, recordDisposableObject) {
    this.reads.push(assetName);
    const asset = new TestAsset();
    recordDisposableObject(asset);
    return asset;
  }
}

test("ContentManager caches case-insensitively and owns recorded disposable assets", () => {
  const services = new GameServiceContainer();
  const content = new ManagedContentManager(services, "Content");
  const first = content.Load(TestAsset, ".\\Models/../Textures/Ship");
  const cached = content.Load(TestAsset, "textures\\ship");

  assert.equal(cached, first);
  assert.deepEqual(content.reads, ["Textures\\Ship"]);
  assert.equal(content.ServiceProvider, services);
  assert.equal(content.RootDirectory, "Content");
  assert.throws(() => { content.RootDirectory = "Other"; }, { name: "InvalidOperationException" });
  assert.throws(
    () => content.Load(OtherAsset, "TEXTURES/SHIP"),
    Content.ContentLoadException,
  );

  content.Unload();
  assert.equal(first.disposed, 1);
  content.RootDirectory = "Other";
  assert.equal(content.RootDirectory, "Other");
});

test("ContentManager and Game reject false content availability", () => {
  const services = new GameServiceContainer();
  const content = new Content.ContentManager(services);
  assert.throws(() => content.Load(TestAsset, "asset"), NativeUnavailableError);
  content.Dispose();
  assert.throws(() => content.Load(TestAsset, "asset"), { name: "ObjectDisposedException" });

  const game = new Game();
  assert.equal(game.Content.ServiceProvider, game.Services);
  game.Content = new ManagedContentManager(game.Services);
  assert.throws(() => { game.Content = null; }, { name: "ArgumentNullException" });
});

test("ContentLoadException preserves its inner JavaScript cause", () => {
  const cause = new Error("source");
  const error = new Content.ContentLoadException("content", cause);
  assert.equal(error.name, "ContentLoadException");
  assert.equal(error.message, "content");
  assert.equal(error.cause, cause);
});

test("TitleContainer and default ContentManager stay within CNA title storage", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const names = [];
  const backend = Object.create(previous);
  backend.openTitleStream = (name) => {
    names.push(name);
    return Uint8Array.of(1, 2, 3);
  };
  setBackendForInternalUse(backend);

  assert.deepEqual(TitleContainer.OpenStream("Content\\asset.bin"), Uint8Array.of(1, 2, 3));
  const content = new DefaultStreamContentManager(new GameServiceContainer(), "Content");
  assert.deepEqual(content.Open("Models\\ship"), Uint8Array.of(1, 2, 3));
  assert.deepEqual(names, ["Content/asset.bin", "Content/Models/ship.xnb"]);
  assert.throws(() => TitleContainer.OpenStream("../outside.bin"), RangeError);
  assert.throws(() => TitleContainer.OpenStream("/etc/passwd"), RangeError);
  assert.throws(() => TitleContainer.OpenStream("C:\\outside.bin"), RangeError);
});
