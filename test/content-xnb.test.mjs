import assert from "node:assert/strict";
import test from "node:test";

import { Content } from "../dist/index.js";
import { RegisterContentTypeReader } from "../dist/extensions/index.js";

class Payload {
  constructor(value = "") { this.value = value; this.disposeCount = 0; }
  Dispose() { this.disposeCount += 1; }
}

class CustomAsset {
  constructor() {
    this.id = 0;
    this.name = "";
    this.nested = null;
    this.shared = null;
    this.disposeCount = 0;
  }
  Dispose() { this.disposeCount += 1; }
}

class WrongAsset {}

class PayloadReader extends Content.ContentTypeReaderOfT {
  Read(input, existingInstance) {
    const result = existingInstance ?? new Payload();
    result.value = input.ReadString();
    return result;
  }
}

class CustomAssetReader extends Content.ContentTypeReaderOfT {
  get TypeVersion() { return 3; }
  Initialize(manager) { this.manager = manager; }
  Read(input, existingInstance) {
    const result = existingInstance ?? new CustomAsset();
    result.id = input.ReadInt32();
    result.name = input.ReadString();
    result.nested = input.ReadObject(this.manager.GetTypeReader(Payload), new Payload());
    input.ReadSharedResource((value) => { result.shared = value; });
    return result;
  }
}

class ThrowingReader extends Content.ContentTypeReaderOfT {
  Read() { throw new Error("custom reader failure"); }
}

class MemoryContentManager extends Content.ContentManager {
  constructor(assets) { super({ GetService() { return null; } }); this.assets = assets; }
  OpenStream(assetName) {
    const value = this.assets.get(assetName);
    if (!value) throw new Content.ContentLoadException(`missing ${assetName}`);
    return new Uint8Array(value);
  }
}

const unregister = [
  RegisterContentTypeReader("Tests.CustomAssetReader", CustomAssetReader, CustomAsset),
  RegisterContentTypeReader("Tests.PayloadReader", PayloadReader, Payload),
  RegisterContentTypeReader("Tests.ThrowingReader", ThrowingReader, WrongAsset),
];
test.after(() => unregister.reverse().forEach((value) => value()));

function seven(value) {
  const result = [];
  value >>>= 0;
  do {
    let item = value & 0x7f;
    value >>>= 7;
    if (value !== 0) item |= 0x80;
    result.push(item);
  } while (value !== 0);
  return result;
}

function int32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return [...bytes];
}

function string(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...seven(bytes.length), ...bytes];
}

function xnb(payload, options = {}) {
  const platform = options.platform ?? 0x77;
  const version = options.version ?? 5;
  const flags = options.flags ?? 0;
  const declaredLength = options.declaredLength ?? 10 + payload.length;
  return Uint8Array.from([
    ...(options.magic ?? [0x58, 0x4e, 0x42]),
    platform,
    version,
    flags,
    ...int32(declaredLength),
    ...payload,
  ]);
}

function customPayload(options = {}) {
  const readerName = options.readerName ?? "Tests.CustomAssetReader, Tests";
  const readerVersion = options.readerVersion ?? 3;
  const rootIndex = options.rootIndex ?? 1;
  const sharedCount = options.sharedCount ?? 1;
  const includeShared = options.includeShared ?? true;
  return [
    ...seven(2),
    ...string(readerName), ...int32(readerVersion),
    ...string("Tests.PayloadReader, Tests"), ...int32(0),
    ...seven(sharedCount),
    ...seven(rootIndex),
    ...int32(42), ...string("custom"), ...string("existing"), ...seven(1),
    ...(includeShared ? [...seven(2), ...string("shared")] : []),
  ];
}

test("managed XNB dispatches a custom reader, existing instance, and shared resource", () => {
  const manager = new MemoryContentManager(new Map([["asset", xnb(customPayload())]]));
  const asset = manager.Load(CustomAsset, "asset");
  assert.equal(manager.Load(CustomAsset, "asset"), asset);
  assert.deepEqual(
    [asset.id, asset.name, asset.nested.value, asset.shared.value],
    [42, "custom", "existing", "shared"],
  );
  manager.Unload();
  assert.equal(asset.disposeCount, 1);
  assert.equal(asset.shared.disposeCount, 1);
  manager.Dispose();
});

test("wrong requested type and partial shared-resource failure clean up constructed disposables", () => {
  const bytes = xnb(customPayload());
  const manager = new MemoryContentManager(new Map([["asset", bytes]]));
  assert.throws(() => manager.Load(WrongAsset, "asset"), Content.ContentLoadException);
  const asset = manager.Load(CustomAsset, "asset");
  assert.equal(asset.disposeCount, 0);

  const truncated = new MemoryContentManager(new Map([[
    "broken",
    xnb(customPayload({ includeShared: false })),
  ]]));
  assert.throws(() => truncated.Load(CustomAsset, "broken"), Content.ContentLoadException);
  manager.Dispose();
  truncated.Dispose();
});

test("malformed XNB framing and reader tables fail deterministically", () => {
  const cases = [
    xnb([], { magic: [0, 0, 0] }),
    xnb([], { platform: 0x78 }),
    xnb([], { version: 4 }),
    xnb([], { flags: 1 }),
    Uint8Array.from([0x58, 0x4e]),
    xnb([], { declaredLength: 100 }),
    xnb([...seven(4097)]),
    xnb(customPayload({ readerName: "Tests.UnknownReader" })),
    xnb(customPayload({ readerVersion: 2 })),
    xnb(customPayload({ rootIndex: 3 })),
  ];
  cases.forEach((bytes, index) => {
    const manager = new MemoryContentManager(new Map([["bad", bytes]]));
    assert.throws(() => manager.Load(CustomAsset, "bad"), Error, `case ${index}`);
    manager.Dispose();
  });
});

test("custom reader exceptions are normalized without poisoning later loads", () => {
  const throwing = xnb([
    ...seven(1), ...string("Tests.ThrowingReader"), ...int32(0),
    ...seven(0), ...seven(1),
  ]);
  const manager = new MemoryContentManager(new Map([
    ["throwing", throwing],
    ["good", xnb(customPayload())],
  ]));
  assert.throws(() => manager.Load(WrongAsset, "throwing"), Content.ContentLoadException);
  assert.equal(manager.Load(CustomAsset, "good").id, 42);
  manager.Dispose();
});

test("ResourceContentManager snapshots byte resources", () => {
  const bytes = xnb(customPayload());
  const resources = { GetObject(name) { return name === "asset" ? bytes : null; } };
  const manager = new Content.ResourceContentManager({ GetService() { return null; } }, resources);
  const asset = manager.Load(CustomAsset, "asset");
  bytes.fill(0);
  assert.equal(asset.id, 42);
  manager.Dispose();
});
