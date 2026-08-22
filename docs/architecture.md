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

Pure values and math stay in TypeScript. Native resources will cross only an internal backend
interface and will use the stable CNA C ABI, never the CNA C++ ABI. The public XNA surface must not
contain raw pointers, numeric native handles, memory offsets, callback IDs, or backend classes.

The inspected CNA revision publishes experimental C ABI version 0.7.0 through 59 public C headers
and 2,861 unique `CNA_C_API` declarations. CNA has real Emscripten-aware engine and renderer code,
but the inspected worktree has no packaged CNA C-ABI ESM loader/Wasm artifact and the local
environment has no `emcc` toolchain. Consequently the current package reports the backend as
unavailable. This is a binding/toolchain integration gap, not absence of a CNA C ABI.

The reproducible evidence, 32-symbol first-slice inventory, and required upstream artifact contract
are recorded in [`cna-abi-audit.md`](cna-abi-audit.md). The audit accepts an explicit CNA checkout
path and is not part of normal build, package installation, or runtime.

## Ownership

Native-backed resources will carry one private state: owned, borrowed, parent-owned, or adopted.
`Dispose()` is the primary lifetime contract and must be idempotent. Finalization may only be a
safety net. Shutdown tears down callbacks before parents and owned children; borrowed wrappers
never destroy their referent.
