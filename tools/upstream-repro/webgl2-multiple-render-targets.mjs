#!/usr/bin/env node
// SPDX-License-Identifier: MS-PL
//
// Upstream finding 30's reproduction, on its own and runnable against any WebAssembly artifact.
//
// One triangle, drawn twice through a stock `BasicEffect`, into render targets that differ only in
// how many of them are bound. On WEBGL2 the one-target draw lands and the two-target draw does not,
// while the `Clear` reaches both -- which is what makes it a lost draw rather than a failed bind.
//
// The single-target run is taken **first** on purpose. A draw into a two-target bind leaves
// `InvalidOperation(0x502)` pending on this renderer and the next multi-target bind refuses on it,
// so a control taken afterwards measures the pending error instead of the draw.
//
//   CNA_WASM_ARTIFACT_DIR=/path/to/modules/c-api \
//     node tools/upstream-repro/webgl2-multiple-render-targets.mjs
//
// Exits 0 when it reproduces (one target paints, two paint nothing), 1 when the renderer draws
// into both -- which is what a repair looks like.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WASM_DIR = process.env.CNA_WASM_ARTIFACT_DIR
  ? path.resolve(process.env.CNA_WASM_ARTIFACT_DIR)
  : path.join(ROOT, "../../cnanext/cmake-build-tswasm/modules/c-api");

if (!fs.existsSync(path.join(WASM_DIR, "cna_c_api.mjs"))) {
  console.error(`no artifact at ${WASM_DIR}; set CNA_WASM_ARTIFACT_DIR`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, "dist/index.js"))) {
  console.error("run npm run build first");
  process.exit(2);
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<canvas id="canvas" width="80" height="48"></canvas>
<script type="module">
const out = { status: "running" };
globalThis.__probe = out;
try {
  const { Color, Game, Graphics, GraphicsDeviceManager, LoadWasmBackend, Matrix, Vector3 } =
    await import("/cna-ts/index.js");
  const createCnaCApi = (await import("/wasm/cna_c_api.mjs")).default;
  const module = await createCnaCApi({ canvas: document.getElementById("canvas") });
  await LoadWasmBackend({ Module: module });
  const WIDTH = 80, HEIGHT = 48;
  const CLEARED = new Color(12, 34, 56, 255);
  class ProbeGame extends Game {
    constructor() { super(); this.g = new GraphicsDeviceManager(this); }
    LoadContent() {
      const device = this.GraphicsDevice;
      out.capabilities = {
        multipleRenderTargets: (() => {
          try {
            const g = globalThis.__extensions;
            return g ? g.GraphicsDeviceCapabilities.Supports(device, 3) : "unread";
          } catch { return "unread"; }
        })(),
      };
      const one = new Graphics.RenderTarget2D(device, WIDTH, HEIGHT);
      const two = new Graphics.RenderTarget2D(device, WIDTH, HEIGHT);
      const effect = new Graphics.BasicEffect(device);
      effect.VertexColorEnabled = true;
      effect.World = Matrix.Identity;
      effect.View = Matrix.CreateLookAt(new Vector3(0, 0, 10), Vector3.Zero, Vector3.Up);
      effect.Projection =
        Matrix.CreatePerspectiveFieldOfView(Math.PI / 2, WIDTH / HEIGHT, 1, 100);
      device.RasterizerState = Graphics.RasterizerState.CullNone;
      const triangle = [
        new Graphics.VertexPositionColor(new Vector3(-6, -6, 0), new Color(0, 255, 0, 255)),
        new Graphics.VertexPositionColor(new Vector3(10, -6, 0), new Color(0, 255, 0, 255)),
        new Graphics.VertexPositionColor(new Vector3(10, -1, 0), new Color(0, 255, 0, 255)),
      ];
      const painted = (texture) => {
        const px = new Array(WIDTH * HEIGHT);
        texture.GetData(px);
        return {
          drawn: px.filter((t) => t.PackedValue !== CLEARED.PackedValue).length,
          cleared: px.some((t) => t.PackedValue === CLEARED.PackedValue),
        };
      };
      const attempt = (targets) => {
        try {
          device.SetRenderTargets(targets.map((t) => new Graphics.RenderTargetBinding(t)));
          device.Clear(CLEARED);
          effect.CurrentTechnique.Passes.Get(0).Apply();
          device.DrawUserPrimitives(Graphics.PrimitiveType.TriangleList, triangle, 0, 1);
          device.SetRenderTarget(null);
          return targets.map(painted);
        } catch (error) {
          try { device.SetRenderTarget(null); } catch { /* already unbound */ }
          return \`\${error?.constructor?.name}: \${error?.message}\`;
        }
      };
      out.oneTarget = attempt([one]);
      out.twoTargets = attempt([one, two]);
      for (const item of [effect, two, one]) { try { item.Dispose(); } catch { /* ignore */ } }
      super.LoadContent();
    }
  }
  const game = new ProbeGame();
  game.RunOneFrame();
  game.Exit();
  game.Dispose();
  out.status = "ok";
} catch (error) {
  out.status = "failed";
  out.error = String(error?.stack ?? error);
}
</script></body></html>`;

const TYPES = new Map(Object.entries({
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".wasm": "application/wasm",
  ".data": "application/octet-stream",
}));
const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    return;
  }
  let file = null;
  if (url.pathname.startsWith("/cna-ts/")) file = path.join(ROOT, "dist", url.pathname.slice(8));
  else if (url.pathname.startsWith("/wasm/")) file = path.join(WASM_DIR, url.pathname.slice(6));
  if (file == null || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream",
  });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const playwrightPath = path.resolve(
  path.dirname(process.execPath), "../lib/node_modules/playwright/index.mjs");
const playwright = await import(
  process.env.CNA_PLAYWRIGHT_MODULE ?? pathToFileURL(playwrightPath).href);
const browser = await playwright.chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
await page.waitForFunction(
  () => globalThis.__probe && globalThis.__probe.status !== "running", undefined,
  { timeout: 180_000 });
const result = await page.evaluate(() => globalThis.__probe);
await browser.close();
server.close();

console.log(`ARTIFACT=${WASM_DIR}`);
console.log(`STATUS=${result.status}${result.error ? `\n${result.error}` : ""}`);
if (result.status !== "ok") process.exit(2);
const describe = (label, answer) => {
  if (typeof answer === "string") { console.log(`${label}=REFUSED ${answer}`); return null; }
  console.log(`${label}=${answer.map((t) => `drawn:${t.drawn} cleared:${t.cleared}`).join(" | ")}`);
  return answer;
};
const one = describe("ONE_TARGET", result.oneTarget);
const two = describe("TWO_TARGETS", result.twoTargets);
if (one == null || one[0].drawn === 0) {
  console.log("INCONCLUSIVE: the single-target control drew nothing");
  process.exit(2);
}
if (two != null && two.some((target) => target.drawn > 0)) {
  console.log("FINDING_30=REPAIRED: a draw reached a multiple-render-target bind");
  process.exit(1);
}
console.log("FINDING_30=REPRODUCED: one target receives the draw, two receive none");
