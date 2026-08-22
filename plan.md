# CNA-TS implementation plan

Status date: 2026-08-22

Selected profile: XNA 4.0 Windows runtime

Package: `cna-ts` 0.1.x before compatibility completion

This is the normative roadmap. A checkbox means the named evidence exists; it never means a larger
phase is complete. API completeness can only be claimed from a reproducible strict verifier run.

## Current verified state

- [x] `src/` contains canonical TypeScript implementation only.
- [x] TypeScript 5.9.2 generates ESM JavaScript, declarations, declaration maps, and source maps in
  `dist/` under strict NodeNext settings.
- [x] Root, `xna`, `extensions`, and `runtime` package exports resolve in compile probes.
- [x] Node baseline is 20+; local verification currently uses checksum-verified Node 22.14.0.
- [x] Runtime-independent foundation now has 23 measured target types: time, mutable vectors,
  matrix/quaternion, color/packed-vector contracts, point/rectangle, planes/rays, and bounding
  volumes; missing members remain explicitly measured.
- [x] `Game` reports unavailable native execution honestly and has disposal guards.
- [ ] No WebAssembly or Node CNA backend is loaded.
- [ ] The XNA structural difference count is not yet at zero.

## Canonical JavaScript/TypeScript consolidation

- [x] One TypeScript implementation serves TypeScript and JavaScript.
- [x] No handwritten source declaration aggregate remains.
- [x] No checked-in generated JavaScript implementation remains.
- [x] Legacy binding/template audit is recorded in `docs/cna-js-consolidation.md`.
- [x] Unified template generates fresh TypeScript and JavaScript consumers from one source.

## Compatibility definition and mapping

- [x] XNA 4.0 Windows runtime is the first named strict profile.
- [x] `docs/xna-typescript-mapping.md` defines names, properties, fields, value aliasing, operators,
  overloads, generics, events, `ref/out`, `TimeSpan`, enums, and lifecycle adaptation.
- [x] Actual seven-assembly metadata measures 257 visible types and 2,964 declared visible members.
- [x] Current language rules are represented in `mapping-rules.json`; its allowlist is empty.
- [ ] Later profiles separately inventory GamerServices, Net, Avatar, Xbox/Phone, and Content
  Pipeline assemblies.

## Strict verifier baseline

- [x] Extract the neutral contract only after all reference-assembly hashes match.
- [x] Transform CLR metadata to the expected TypeScript contract.
- [x] Read generated declarations with the TypeScript compiler API.
- [x] Compare type identity, bases/interfaces, members, overloads, parameters, properties, fields,
  events, nested identity, and enum values; generic-constraint depth still needs expansion.
- [x] Emit text and JSON diagnostics with the required categories.
- [x] Strict mode exits nonzero; report-only records 443 initial differences.
- [x] Runtime-symbol verifier reports zero differences for all 23 current target types.
- [x] Strict internal/native leak gate reports zero.
- [x] Allowlist size is zero and blanket allowlisting is prohibited.

## Definition of done

The selected profile is complete only when mapped declaration differences, runtime-symbol
differences, internal leaks, and unreviewed mapping differences are zero; differential behavior,
lifecycle, native ownership, packed-package consumers, and every claimed platform all pass their
reproducible gates. Until then documentation says “XNA 4.0 TypeScript/JavaScript API projection in
progress.”

## Package/module architecture

- [x] ESM is the sole primary format; CommonJS is not built without evidence of a consumer need.
- [x] `cna-ts` exports aliases and the `Microsoft` namespace object.
- [x] `cna-ts/xna`, `/extensions`, and `/runtime` are explicit subpaths.
- [x] `src/internal/**` is blocked by package `exports`.
- [x] Packed tarball installs and passes strict TS and plain-JS consumers in fresh directories;
  internal package subpaths are proven blocked.

## Runtime/backend architecture

- [x] Private backend contract distinguishes unavailable, WebAssembly, and Node/native kinds.
- [x] Runtime status does not expose backend objects or handles.
- [ ] Implement one real backend before expanding the abstraction.
- [ ] ABI version, UTF-8 errors, callbacks, memory, arrays, shutdown, and canvas/window integration
  have integration tests.

## CNA C ABI status

- [x] Current CNA exposes experimental C ABI 0.7.0, 59 public headers, and 2,861 unique exported
  declarations. The old “waiting for canonical exports” claim was removed.
- [x] The ABI covers version/error handling plus runtime, graphics, textures, SpriteBatch routes,
  input, content, audio/XACT, media, storage, events, and resource handles.
- [x] A reproducible read-only audit verifies ABI version/header/function counts and all 32 exact
  first-slice sentinel symbols; it separately reports tracked C-ABI Wasm/ESM artifacts.
- [ ] Produce or obtain a consumable C-ABI WebAssembly ESM artifact.
- [x] Define the first exact symbol subset rather than binding all 2,861 routes blindly.
- [ ] Narrow that subset further as the implemented backend records every actually imported route.

## Ownership and lifetime

- [x] Architecture names owned, borrowed, parent-owned, and adopted states.
- [x] Current `Game.Dispose()` is idempotent and use-after-dispose is tested.
- [ ] Implement the native resource state machine, partial-construction rollback, child ordering,
  borrowed wrappers, callback teardown, and stress tests.

## Core/value API

- [x] Initial coherent math/geometry group is managed and runtime-independent, including
  `MathHelper`, Vector2/3/4, Matrix, Quaternion, Color, Point, Rectangle, Plane, Ray, and bounding
  volumes.
- [ ] Complete `MathHelper`, Vector2/3/4, Matrix, Quaternion, Point, Rectangle, Plane, Ray,
  bounding volumes, curves, and packed vectors in coherent groups.
- [x] Import the first 26-observation neutral XNA differential JSON corpus, including NaN,
  infinities, signed zero, rounding, clamping, packing, matrix inversion, and geometry edges.
- [ ] Expand the shared corpus across remaining values, curves, packed vectors, and later runtime
  subsystems.
- [ ] Add compile/type probes and mutation/snapshot regressions for every value group.

## Game/device/window

- [ ] Implement events/services/components and truthful lifecycle state transitions.
- [ ] Implement GameWindow, GraphicsDeviceManager, GraphicsDevice, adapter, presentation parameters,
  and Viewport over the selected backend.

## Graphics

- [ ] Implement resource base types and explicit disposal.
- [ ] Implement Texture2D/raw image stream, states, buffers, vertex declarations, SpriteBatch,
  effects, BasicEffect, models, and render targets in dependency order.

## Input/touch

- [ ] Implement keyboard, mouse, gamepad, and touch semantics over real ABI routes.

## Content and models

- [ ] Implement the class-token `Content.Load(Type, name)` mapping consistently.
- [ ] Implement XNB header/reader table, caching, unload, built-in readers, shared resources, and
  custom readers before claiming ContentManager functionality.
- [ ] Keep raw PNG loading separate from XNB content loading.

## Audio/XACT, media, storage, GamerServices

- [ ] Implement the selected profile over real ABI routes with deterministic unsupported behavior
  only where the platform genuinely cannot support a projected API.
- [ ] Inventory non-selected GamerServices/Net profiles separately.

## CNA extensions

- [x] Separate extension subpath exists.
- [ ] Renderer information and capabilities use verified backend data, never strict
  `GraphicsDevice` properties or dynamic probing.

## Template

- [x] Remove stale `cna-js` identity, fictional APIs/version claims, and unused parallel asset.
- [x] Replace aspirational cube/mobile claims with the smallest truthful managed/build canary.
- [ ] First functional slice: lifecycle, GameTime, device, raw Texture2D, SpriteBatch, keyboard,
  resize, deterministic update/draw, and clean shutdown.
- [ ] Add 3D/BasicEffect only after the 2D route works.
- [x] Generate TypeScript and ordinary JavaScript projects from one canonical source; both install
  the packed artifact and build, and JavaScript runs a managed smoke without TypeScript.

## Browser/WASM

- [x] CNA contains real Emscripten-aware renderer/runtime code.
- [ ] No packaged C-ABI ESM loader/Wasm artifact was found in the inspected CNA worktree.
- [ ] Local environment currently has no `emcc`; record exact toolchain/artifact recipe upstream.
- [x] Record the required module factory, memory/UTF-8, callback, canvas, shutdown, ABI provenance,
  and CI artifact contract in `docs/cna-abi-audit.md`.
- [ ] Browser smoke verifies initialization, graphics/resources, 60 frames, shutdown, and zero
  unhandled console errors; stability target is 600 frames.

## Node, desktop, and mobile

- [x] Node pure value/API tests are verified.
- [ ] Node CNA runtime execution is not yet verified.
- [ ] Electron is planned, not supported or build-verified.
- [ ] Android and iOS are planned, not supported or build-verified.
- [ ] Capacitor/Electron dependencies stay out of the template until they prove a real runtime path.

## Packaging and CI gates

- [ ] `npm ci`, build, type check, tests, verifier, runtime symbols, leak guard, and `npm pack` are CI
  gates.
- [x] Install the exact tarball in independent TS and JS consumers with no sibling paths.
- [x] Package exports contain no internal subpath and fresh consumers prove the guard.
- [ ] Preserve deterministic generated artifact hashes in CI.
- [x] Manual source `.d.ts` duplication = 0.
- [x] Hand-maintained duplicate JavaScript implementation = 0.
- [x] Legacy worktree changes during the initial audit = 0; recheck at session end.

## Upstream CNA blockers

- consumable C-ABI Emscripten module packaging and documented exported-symbol/loading contract;
- a reproducible browser artifact recipe accessible to binding CI;
- platform-specific renderer/window integration evidence for WebView/Electron claims.

These are narrower than “CNA has no ABI”: the native C ABI exists and is broad.
