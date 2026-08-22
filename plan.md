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
- [x] Runtime-independent implementation now has 104 measured target types across math/geometry,
  curves, every selected packed vector, input/touch values, components/services, content lifetime,
  GameWindow state, Viewport, and graphics presentation/display values.
- [x] `Game` has a managed component pipeline and executable private lifecycle boundary while still
  reporting unavailable native execution honestly.
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
- [x] Runtime-symbol verifier reports zero differences for all 104 current target types, including
  abstract-member and JavaScript iterable-protocol handling.
- [x] Strict internal/native leak gate reports zero.
- [x] Allowlist size is zero and blanket allowlisting is prohibited.

Current measured report:

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=271
TARGET_TYPES=104
TOTAL_DIFFERENCES=168
MISSING_TYPE=167
MISSING_MEMBER=1
all other diagnostic categories=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
INTERNAL_LEAK=0
```

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

- [x] Private backend contract distinguishes unavailable, WebAssembly, and Node/native kinds and
  defines typed lifecycle, device, resource, and input operations.
- [x] Runtime status does not expose backend objects or handles.
- [x] Managed lifecycle tests execute the contract through an internal backend and the native
  ownership state machine without exposing public injection.
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
- [x] An isolated unmodified HEADLESS native build was investigated and stopped at CNA's upstream
  C-API renderer table assertion (49 identities versus 50); no library or adapter was fabricated.

## Ownership and lifetime

- [x] Architecture names owned, borrowed, parent-owned, and adopted states.
- [x] `Game` native-handle release is idempotent through `NativeResourceLifetime`, and
  use-after-dispose is tested.
- [x] Implement the private native resource state machine, partial-construction rollback, reverse
  child ordering, borrowed invalidation, callback-first teardown, transfer/adoption, and aggregate
  cleanup errors; failed releases retain ownership for retry and block parent release.
- [ ] Connect the state machine to a real backend and add repeated resource/shutdown stress tests.

## Core/value API

- [x] Initial coherent math/geometry group is managed and runtime-independent, including
  `MathHelper`, Vector2/3/4, Matrix, Quaternion, Color, Point, Rectangle, Plane, Ray, and bounding
  volumes.
- [x] Complete the selected mapped surfaces for `MathHelper`, Vector2/3/4, Matrix, Quaternion,
  Color, Point, Rectangle, Plane, Ray, bounding volumes/frustum, curves, and all 17 packed values.
- [x] Import the first 26-observation neutral XNA differential JSON corpus, including NaN,
  infinities, signed zero, rounding, clamping, packing, matrix inversion, and geometry edges.
- [x] Expand the shared neutral corpus to all currently available 106 observations: 83 math/value
  and 23 input/touch, producing 107 passing TAP assertions and zero failures.
- [x] Add compile/type probes and managed regressions for the completed value/input groups.

## Game/device/window

- [x] Implement typed events, `GameServiceContainer`, `LaunchParameters`, component collection
  mutation, stable update/draw ordering, initialization, filtering, and disposal behavior.
- [x] Implement the complete mapped `GameWindow`, `PresentationParameters`, `Viewport`, display
  mode snapshots/collections, graphics profile/formats, and explicit unavailable window access.
- [ ] Implement `GraphicsDeviceManager`, `GraphicsDevice`, and `GraphicsAdapter` as one complete
  native-backed group; `Game.GraphicsDevice` is the sole remaining member on a present type.

## Graphics

- [x] Implement the runtime-independent presentation/display value foundation without fake adapter
  descriptions or capabilities.
- [ ] Implement resource base types and explicit disposal.
- [ ] Implement Texture2D/raw image stream, states, buffers, vertex declarations, SpriteBatch,
  effects, BasicEffect, models, and render targets in dependency order.

## Input/touch

- [x] Implement the complete selected keyboard, mouse, gamepad, and touch value/state declarations,
  including enums, flags, filtering, dead-zone transforms, equality/hash/string behavior, and
  collection semantics.
- [x] Route polling APIs through the private backend and fail explicitly when unavailable.
- [ ] Verify keyboard/mouse/gamepad/touch polling over real CNA ABI routes.

## Content and models

- [x] Implement and machine-verify the class-token `Content.Load(Type, name)` mapping consistently.
- [x] Implement `ContentManager` root/cache/type/disposable/unload state without claiming XNB
  decoding; base reading fails explicitly when no backend exists.
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
- [x] Expand the managed canary to exercise components, services, keyboard snapshots, and matrix
  math without treating those as rendering or hardware polling evidence.
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

- [x] Node managed values, components/services, content lifetime, and package consumers are
  verified.
- [ ] Node CNA runtime execution is not yet verified.
- [ ] Electron is planned, not supported or build-verified.
- [ ] Android and iOS are planned, not supported or build-verified.
- [ ] Capacitor/Electron dependencies stay out of the template until they prove a real runtime path.

## Packaging and CI gates

- [ ] `npm ci`, build, type check, tests, verifier, runtime symbols, leak guard, and `npm pack` are CI
  gates.
- [x] Install the exact tarball in independent TS and JS consumers with no sibling paths.
- [x] Package exports contain no internal subpath and fresh consumers prove the guard.
- [x] Final generated template TypeScript/JavaScript projects both install
  `cna-ts-0.1.0.tgz` at SHA-256
  `096c4785f6978bff5b7c8479c96948b91c4287f93a9eca9627d0c8b77fe6a014` and pass.
- [ ] Preserve deterministic generated artifact hashes in CI.
- [x] Manual source `.d.ts` duplication = 0.
- [x] Hand-maintained duplicate JavaScript implementation = 0.
- [x] Legacy worktree changes from start through end-of-session verification = 0.

## Upstream CNA blockers

- consumable C-ABI Emscripten module packaging and documented exported-symbol/loading contract;
- a reproducible browser artifact recipe accessible to binding CI;
- repair of the C-API renderer identity table (currently 49 entries for 50 canonical renderers) so
  the unmodified native shared target can compile;
- platform-specific renderer/window integration evidence for WebView/Electron claims.

These are narrower than “CNA has no ABI”: the native C ABI exists and is broad.
