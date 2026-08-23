import assert from "node:assert/strict";
import test from "node:test";

import { Content, Game, Graphics, GraphicsDeviceManager } from "../dist/index.js";
import { getBackend, setBackendForInternalUse } from "../dist/internal/backend.js";

function backend() {
  let next = 1n;
  return {
    Kind: "node-native", IsAvailable: true, AbiVersion: "0.7.0-test", Detail: "font test",
    async initialize() {}, updateFrameworkDispatcher() {}, getLastError() { return null; },
    createGame() { return next++; }, async runGame() {}, runGameOneFrame() {}, exitGame() {}, destroyGame() {},
    createGraphicsDeviceManager() { return next++; }, configureGraphicsDeviceManager() {},
    applyGraphicsDeviceManagerChanges() {}, toggleGraphicsDeviceManagerFullScreen() {},
    createManagedGraphicsDevice() {}, beginGraphicsDeviceManagerDraw() { return true; },
    endGraphicsDeviceManagerDraw() {}, destroyGraphicsDeviceManager() {}, borrowGraphicsDevice() { return 50n; },
    clearGraphicsDevice() {}, presentGraphicsDevice() {},
    createTexture2D() { return next++; }, setTexture2DData() {}, destroyTexture2D() {},
    createSpriteBatch() { return next++; }, beginSpriteBatch() {}, submitSpriteBatch() {}, endSpriteBatch() {},
    destroySpriteBatch() {},
  };
}

class MemoryManager extends Content.ContentManager {
  constructor(device, bytes) {
    super({ GetService(type) { return type === Graphics.GraphicsDevice ? device : null; } });
    this.bytes = bytes;
  }
  OpenStream() { return this.bytes; }
}

test("uncompressed SpriteFont XNB constructs atlas and glyph graph", (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  setBackendForInternalUse(backend());
  const game = new Game();
  const graphics = new GraphicsDeviceManager(game);
  graphics.CreateDevice();
  const content = new MemoryManager(graphics.GraphicsDevice, fixture());
  const font = content.Load(Graphics.SpriteFont, "font");
  assert.deepEqual([font.MeasureString("A?").X, font.MeasureString("A?").Y], [9, 8]);
  content.Dispose();
  game.Dispose();
});

function seven(value) {
  const result = [];
  value >>>= 0;
  do { let item = value & 0x7f; value >>>= 7; if (value) item |= 0x80; result.push(item); } while (value);
  return result;
}
function integer(value) {
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, true); return [...bytes];
}
function single(value) {
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setFloat32(0, value, true); return [...bytes];
}
function text(value) { const bytes = [...new TextEncoder().encode(value)]; return [...seven(bytes.length), ...bytes]; }
function rect(x, y, w, h) { return [...integer(x), ...integer(y), ...integer(w), ...integer(h)]; }
function fixture() {
  const names = [
    "Microsoft.Xna.Framework.Content.SpriteFontReader", "Microsoft.Xna.Framework.Content.Texture2DReader",
    "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Rectangle]]",
    "Microsoft.Xna.Framework.Content.RectangleReader", "Microsoft.Xna.Framework.Content.ListReader`1[[System.Char]]",
    "Microsoft.Xna.Framework.Content.CharReader", "Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Vector3]]",
    "Microsoft.Xna.Framework.Content.Vector3Reader",
  ];
  const atlas = new Array(256).fill(255);
  const payload = [
    ...seven(8), ...names.flatMap((name) => [...text(`${name}, Microsoft.Xna.Framework`), ...integer(0)]),
    ...seven(0), ...seven(1),
    ...seven(2), ...integer(0), ...integer(8), ...integer(8), ...integer(1), ...integer(256), ...atlas,
    ...seven(3), ...integer(2), ...rect(0, 0, 4, 8), ...rect(4, 0, 4, 8),
    ...seven(3), ...integer(2), ...rect(0, 0, 4, 8), ...rect(0, 0, 4, 8),
    ...seven(5), ...integer(2), 65, 0, 63, 0, ...integer(8), ...single(1),
    ...seven(7), ...integer(2), ...single(0), ...single(4), ...single(0), ...single(0), ...single(4), ...single(0),
    1, 63, 0,
  ];
  return Uint8Array.from([88, 78, 66, 119, 5, 0, ...integer(10 + payload.length), ...payload]);
}
