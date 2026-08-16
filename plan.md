# CNA-JS implementation plan

**Status:** foundation scaffold in place

**Date:** 2026-08-16

**Sources:** `../cnabinding/analysis_binding.md`,
`../cnabinding/analysis_binding_sharp_runtime.md`, and
`../cna/analysis_binding_languages.md`

## Goal

Expose CNA's canonical C++ engine to JavaScript and TypeScript through a
browser-first WebAssembly package. Preserve CNA/XNA concepts while using normal
JS objects, promises, typed arrays, explicit disposal, and local math.

## Phase 0 — repository scaffold (this commit)

- [x] README, plan, architecture, license, notices, editor settings, ignores.
- [x] Dependency-free ESM package with TypeScript declarations.
- [x] Local `Vector2`, `Color`, and `GameTime` with Node tests.
- [x] `Game` lifecycle and explicit unavailable-runtime rejection.
- [x] Reserved private native/WASM adapter without guessed exports.

## Phase 1 — canonical WebAssembly ABI

- [ ] Wait for C ABI headers/implementation in `openeggbert/cna` and expose the
      same contract from the Emscripten build.
- [ ] Add async module loading, ABI-version validation, UTF-8 conversion,
      structured errors, opaque handles, and deterministic shutdown.
- [ ] Define canvas, browser main-loop, callback rooting, and Web Worker rules.
- [ ] Test missing/corrupt WASM, wrong ABI versions, stale handles, disposal,
      UTF-8, callback re-entrancy, and browser shutdown.

## Phase 2 — first playable browser loop

- [ ] Add `GraphicsDevice`, `Texture2D`, `SpriteBatch`, `ContentManager`, and
      keyboard snapshots over a supported WebGL2/WebGPU CNA renderer.
- [ ] Buffer SpriteBatch calls in JS and flush them in bulk at `end()`.
- [ ] Run HelloGame in a canvas: clear, load/draw, exit, and dispose cleanly.
- [ ] Reuse the WASM package in Node where platform capabilities permit.

## Phase 3 — packaging and compatibility

- [ ] Add generated declaration/API checks and browser integration tests.
- [ ] Publish an experimental `@openeggbert/cna` npm package only after
      end-to-end execution works.
- [ ] Document supported browsers, renderer capabilities, threading, content
      loading, and CSP/deployment requirements.

## Phase 4 — broader CNA/XNA concepts

- [ ] Complete JS-local math, geometry, colors, and input values.
- [ ] Add audio, fonts, effects, render targets, models, and 3D incrementally.
- [ ] Consider native Node N-API only after a measured need.
- [ ] Publish an honest compatibility matrix for real projects.

## Invariants

1. CNA C++ stays canonical; JS crosses only CNA's stable ABI/WASM exports.
2. C++ exceptions and Sharp Runtime types never cross the boundary.
3. UTF-8, ABI versioning, ownership, threading, and callbacks are explicit.
4. Math stays local; input uses snapshots; high-frequency traffic batches.
5. Raw handles, WASM memory pointers, and Emscripten details remain private.
