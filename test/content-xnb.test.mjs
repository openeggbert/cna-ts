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

class ExternalOwner {
  constructor(first = null, second = null) {
    this.first = first;
    this.second = second;
    this.disposeCount = 0;
  }
  Dispose() { this.disposeCount += 1; }
}

class ExternalOwnerReader extends Content.ContentTypeReaderOfT {
  Read(input) {
    return new ExternalOwner(
      input.ReadExternalReference(Payload),
      input.ReadExternalReference(Payload),
    );
  }
}

class ExternalChainReader extends Content.ContentTypeReaderOfT {
  Read(input) { return new ExternalOwner(input.ReadExternalReference(ExternalOwner)); }
}

class ThrowAfterExternalReader extends Content.ContentTypeReaderOfT {
  Read(input) {
    input.ReadExternalReference(Payload);
    throw new Error("failure after external load");
  }
}

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
  RegisterContentTypeReader("Tests.ExternalOwnerReader", ExternalOwnerReader, ExternalOwner),
  RegisterContentTypeReader("Tests.ExternalChainReader", ExternalChainReader, ExternalOwner),
  RegisterContentTypeReader("Tests.ThrowAfterExternalReader", ThrowAfterExternalReader, WrongAsset),
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

function lzxUncompressedBlock(payload, firstBlock) {
  if (payload.length <= 0 || payload.length > 0x8000) throw new RangeError("payload");
  const headerBits = firstBlock
    ? ((3 << 28) | (payload.length << 4))
    : ((3 << 29) | (payload.length << 5));
  const result = new Uint8Array(16 + payload.length);
  result[0] = headerBits >>> 16;
  result[1] = headerBits >>> 24;
  result[2] = headerBits;
  result[3] = headerBits >>> 8;
  result[4] = 1;
  result[8] = 1;
  result[12] = 1;
  result.set(payload, 16);
  return result;
}

function lzxFrame(block, frameSize) {
  const result = new Uint8Array(5 + block.length);
  result.set([0xff, frameSize >>> 8, frameSize, block.length >>> 8, block.length]);
  result.set(block, 5);
  return result;
}

function compressedXnb(uncompressed, splitAt = -1) {
  const payload = uncompressed.slice(10);
  const parts = splitAt < 0
    ? [payload]
    : [payload.slice(0, splitAt), payload.slice(splitAt)];
  const frames = parts.map((part, index) => lzxFrame(lzxUncompressedBlock(part, index === 0), part.length));
  const compressedLength = frames.reduce((total, frame) => total + frame.length, 0);
  const result = new Uint8Array(14 + compressedLength);
  result.set([0x58, 0x4e, 0x42, 0x77, 5, 0x80]);
  result.set(int32(result.length), 6);
  result.set(int32(payload.length), 10);
  let offset = 14;
  for (const frame of frames) { result.set(frame, offset); offset += frame.length; }
  return result;
}

function shortFrameCompressedXnb(uncompressed) {
  const payload = new Uint8Array(0x8000);
  payload.set(uncompressed.slice(10));
  const block = lzxUncompressedBlock(payload, true);
  const frame = new Uint8Array(2 + block.length);
  frame.set([block.length >>> 8, block.length]);
  frame.set(block, 2);
  const result = new Uint8Array(14 + frame.length);
  result.set([0x58, 0x4e, 0x42, 0x77, 5, 0x80]);
  result.set(int32(result.length), 6);
  result.set(int32(payload.length), 10);
  result.set(frame, 14);
  return result;
}

function payloadAsset(value) {
  return xnb([
    ...seven(1), ...string("Tests.PayloadReader, Tests"), ...int32(0),
    ...seven(0), ...seven(1), ...string(value),
  ]);
}

function externalAsset(readerName, ...references) {
  return xnb([
    ...seven(1), ...string(`${readerName}, Tests`), ...int32(0),
    ...seven(0), ...seven(1), ...references.flatMap(string),
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

test("LZX XNB framing supports short, extended, and persistent multi-frame reader graphs", () => {
  const ordinary = xnb(customPayload());
  const single = compressedXnb(ordinary);
  const split = 20;
  const multi = compressedXnb(ordinary, split);
  const manager = new MemoryContentManager(new Map([
    ["single", single],
    ["multi", multi],
    ["short", shortFrameCompressedXnb(ordinary)],
  ]));
  const one = manager.Load(CustomAsset, "single");
  const two = manager.Load(CustomAsset, "multi");
  const three = manager.Load(CustomAsset, "short");
  assert.deepEqual([one.name, one.shared.value, two.name, two.shared.value, three.name, three.shared.value],
    ["custom", "shared", "custom", "shared", "custom", "shared"]);
  assert.equal(manager.Load(CustomAsset, "multi"), two);
  manager.Unload();
  assert.deepEqual([
    one.disposeCount, one.shared.disposeCount, two.disposeCount, two.shared.disposeCount,
    three.disposeCount, three.shared.disposeCount,
  ], [1, 1, 1, 1, 1, 1]);
  manager.Dispose();
});

test("LZX XNB framing rejects truncated headers, payloads, lengths, and decoder failures", () => {
  const ordinary = xnb(customPayload());
  const valid = compressedXnb(ordinary);
  const cases = [];
  cases.push(valid.slice(0, 11));
  cases.push(Uint8Array.from([...valid.slice(0, 14), 0xff]));

  const truncatedPayload = valid.slice(0, -1);
  truncatedPayload.set(int32(truncatedPayload.length), 6);
  cases.push(truncatedPayload);

  const zeroBlock = valid.slice();
  zeroBlock[17] = 0;
  zeroBlock[18] = 0;
  cases.push(zeroBlock);

  const zeroFrame = valid.slice();
  zeroFrame[15] = 0;
  zeroFrame[16] = 0;
  cases.push(zeroFrame);

  const oversizedFrame = valid.slice();
  oversizedFrame[15] = 0x80;
  oversizedFrame[16] = 1;
  cases.push(oversizedFrame);

  const negativeOutput = valid.slice();
  negativeOutput.set(int32(-1), 10);
  cases.push(negativeOutput);

  const wrongOutput = valid.slice();
  wrongOutput.set(int32(ordinary.length - 9), 10);
  cases.push(wrongOutput);

  const decoderFailure = Uint8Array.from([
    0x58, 0x4e, 0x42, 0x77, 5, 0x80,
    ...int32(23), ...int32(1),
    0xff, 0, 1, 0, 4, 0, 0, 0, 0,
  ]);
  cases.push(decoderFailure);

  for (const [index, bytes] of cases.entries()) {
    const manager = new MemoryContentManager(new Map([["bad", bytes]]));
    assert.throws(() => manager.Load(CustomAsset, "bad"), Content.ContentLoadException, `case ${index}`);
    manager.Dispose();
  }
});

test("external references normalize paths, recurse, share cache identity, and load compressed assets", () => {
  const shared = compressedXnb(payloadAsset("shared"));
  const nested = externalAsset("Tests.ExternalOwnerReader", "..\\..\\shared", "../../shared");
  const outer = externalAsset("Tests.ExternalChainReader", "nested/owner");
  const manager = new MemoryContentManager(new Map([
    ["shared", shared],
    ["root\\nested\\owner", nested],
    ["root\\outer", outer],
  ]));
  const root = manager.Load(ExternalOwner, "root/outer");
  assert.equal(root.first.first.value, "shared");
  assert.equal(root.first.first, root.first.second);
  assert.equal(manager.Load(Payload, "shared"), root.first.first);
  manager.Unload();
  assert.equal(root.first.first.disposeCount, 1);
  manager.Dispose();
});

test("external references report missing, malformed, wrong-type, and circular targets coherently", () => {
  const missing = externalAsset("Tests.ExternalOwnerReader", "missing", "");
  const malformed = externalAsset("Tests.ExternalOwnerReader", "malformed", "");
  const circular = externalAsset("Tests.ExternalChainReader", "cycle");
  const manager = new MemoryContentManager(new Map([
    ["missing-owner", missing],
    ["malformed-owner", malformed],
    ["malformed", xnb([], { magic: [1, 2, 3] })],
    ["cycle", circular],
  ]));
  assert.throws(() => manager.Load(ExternalOwner, "missing-owner"), /missing missing/);
  assert.throws(() => manager.Load(ExternalOwner, "malformed-owner"), Content.ContentLoadException);
  assert.throws(() => manager.Load(ExternalOwner, "cycle"), /Circular external content reference/);

  const wrong = new MemoryContentManager(new Map([["value", payloadAsset("value")]]));
  assert.throws(() => wrong.Load(WrongAsset, "value"), /requested runtime type/);
  manager.Dispose();
  wrong.Dispose();
});

test("failure after a nested external load preserves the completed cache entry and later unloads it", () => {
  const shared = payloadAsset("retained");
  const owner = externalAsset("Tests.ThrowAfterExternalReader", "shared");
  const manager = new MemoryContentManager(new Map([["shared", shared], ["owner", owner]]));
  assert.throws(() => manager.Load(WrongAsset, "owner"), Content.ContentLoadException);
  const retained = manager.Load(Payload, "shared");
  assert.equal(retained.value, "retained");
  manager.Unload();
  assert.equal(retained.disposeCount, 1);
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
