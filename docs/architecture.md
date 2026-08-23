# Architecture

```text
Canonical TypeScript source
          │
          ├── tsc ──> dist/*.js ──> JavaScript and TypeScript consumers
          └── tsc ──> dist/*.d.ts ─> TypeScript consumers
                                │
                    XNA projection objects
                                │
                       private backend contract
                      ┌─────────┴─────────┐
                 WebAssembly         Node/native
                      └─────────┬─────────┘
                           CNA C ABI
                                │
                             CNA C++
```

## Public package boundaries

- `cna-ts` provides convenient root aliases and the `Microsoft` runtime namespace.
- `cna-ts/xna` is the strict `Microsoft.Xna.Framework.*` projection plus the same module aliases.
- `cna-ts/extensions` contains opt-in CNA-specific APIs.
- `cna-ts/runtime` exposes loading/status concepts without exposing a backend instance.
- `src/internal/**` owns handles, memory, callbacks, error translation, and resource ownership. It
  is compiled into the package but cannot be imported through package `exports`.

The root alias `Vector2` and `Microsoft.Xna.Framework.Vector2` are the same constructor. Aliases are
module conveniences, not extra members of the strict namespace.

## Source and generated artifacts

Only `.ts` implementation files live under `src/`. TypeScript 5.9.2 runs in strict NodeNext/ESM
mode and writes JavaScript, declaration files, declaration maps, and source maps to `dist/`. There
is no handwritten aggregate declaration and no checked-in JavaScript implementation copy.

## Runtime boundary

Pure values and math stay in TypeScript. Native resources cross only an internal backend interface
and use CNA's versioned C ABI, never the CNA C++ ABI. The public XNA surface must not
contain raw pointers, numeric native handles, memory offsets, callback IDs, or backend classes.

The backend interface is executable rather than status-only: it defines initialization and error
access, Game create/run-one-frame/run/exit/destroy, graphics-manager/device borrowing,
clear/present, Texture2D and SpriteBatch creation/destruction, renderer information, and
keyboard/mouse/gamepad/touch operations. The unavailable backend implements the same contract and
fails explicitly. Managed tests install an internal backend to prove lifecycle call order and
`NativeResourceLifetime` behavior without exposing public injection.

The inspected CNA revision publishes experimental C ABI version 0.7.0 through 59 public C headers
and 2,861 unique `CNA_C_API` declarations. CNA has real Emscripten-aware engine and renderer code,
but the inspected worktree has no packaged CNA C-ABI ESM loader/Wasm artifact and the local
environment has no `emcc` toolchain. Consequently the default/browser backend remains unavailable;
Node users may explicitly load the adapter and a compatible library. This is an artifact/toolchain
gap, not absence of a CNA C ABI.

The package now carries a small C Node-API adapter source. It dynamically loads one explicitly
selected library, checks encoded ABI `0x00000700`, resolves exactly 219 named C symbols, uses bigint
for opaque 64-bit handles, marshals synchronous game callbacks on the Node thread, and translates
CNA UTF-8 errors into JavaScript errors. It does not use the CNA C++ ABI, a generic FFI dependency,
or finalizers. The adapter source/build helper are portable inputs; no platform binary or CNA
library is packed.

Linux x86-64 integration used an existing HEADLESS/NULL-audio CNA ABI-0.7 library built by the
sibling Java verification from CNA commit `a09196a6477f69a7a57c8364f990658d31531a5b`. Seven real game lifetimes covered 60 and 600
frames, callback-scoped device access, Texture2D and SpriteBatch child ownership, all modeled input
polling families, PCM/dynamic audio, media/video controls, isolated storage, renderer identity,
double disposal, live-child parent shutdown, and repeated creation/destruction. Current CNA HEAD
still cannot reproduce that artifact because its unmodified
C-API build stops at the renderer identity guard (49 mapped identities versus 50 canonical
entries). This is recorded separately from the successful compatible-artifact evidence.

The reproducible evidence, 32-symbol sentinel inventory, 219-symbol imported Node slice, and
required upstream artifact contract are recorded in [`cna-abi-audit.md`](cna-abi-audit.md). The audit accepts an explicit CNA checkout
path and is not part of normal build, package installation, or runtime.

## Ownership

Native-backed resources carry one private state: owned, borrowed, parent-owned, or adopted.
`Dispose()` is the primary lifetime contract and must be idempotent. Finalization may only be a
safety net. The internal lifetime state machine tears down callback registrations first, children
in reverse creation order, and then the owned parent handle. Borrowed and parent-owned wrappers are
invalidated without destroying their referent. Partial construction rolls already-acquired
resources back in reverse order, while transfer invalidates the old wrapper and requires immediate
adoption by another owner. A failed release retains its opaque handle in an unusable, retryable
internal state; a parent is not released while any child remains live.
