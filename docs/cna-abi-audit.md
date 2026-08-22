# CNA C ABI audit

Audit date: 2026-08-22

This is a read-only binding-side audit of CNA revision
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`. CNA itself remains the authority. Reproduce the
header and artifact inventory from a CNA checkout with:

```bash
npm run audit:cna-abi -- --cna-root /path/to/cna
```

The audit is a development command, not a build or runtime dependency on a sibling checkout.

## Measured native contract

The inspected tree declares experimental C ABI **0.7.0** in 59 public headers. A comment-stripped
declaration scan finds 2,861 unique `CNA_C_API` function names. The ABI uses fixed-width result
codes, UTF-8 string views/caller-owned buffers, versioned structures, and opaque generation-checked
`uint64_t` handles; zero is the invalid handle.

The binding's first executable slice needs only this audited sentinel set, not eager bindings for
all 2,861 routes:

| Group | Required routes | Evidence |
| --- | ---: | --- |
| version/errors | 4 | ABI version plus structured/UTF-8 last-error access |
| lifecycle | 5 | create, one-frame run, loop run, exit request, destroy |
| graphics device | 4 | manager creation/device borrow, clear, present |
| Texture2D | 4 | encoded-memory create, data set/get, destroy |
| SpriteBatch | 5 | create, begin, batched submit, end, destroy |
| input | 3 | keyboard snapshot/query and mouse snapshot |
| content | 4 | manager create/load/unload/destroy |
| audio | 3 | capabilities, PCM sound creation, destroy |

All 32 sentinel symbols are present. Important lifetime evidence is explicit in the headers:

- the game, device manager, Texture2D, SpriteBatch, content manager, and sound resources have
  owned handles and explicit release routes;
- the graphics device returned during lifecycle work is borrowed/callback-scoped;
- SpriteBatch and Texture2D children must be destroyed before their game;
- successful destruction invalidates a handle and a second destroy reports invalid handle;
- game creation copies a versioned callback table, and subscription APIs return separately owned
  registration handles.

These contracts justify the binding's internal `owned`, `borrowed`, `parent-owned`, and
`adopted/transferred` states. They do not justify exposing the numeric handle publicly.

## Browser artifact finding

CNA's build is genuinely Emscripten-aware: the root build selects WebAssembly exception handling,
and renderer selection defaults to WebGL 2 under Emscripten. The C API is a real CMake shared-library
target named `cna_c_api`/`CNA::CApi`, linked to canonical CNA modules.

However, the inspected tracked tree contains:

```text
TRACKED_WASM_ARTIFACTS=0
TRACKED_C_API_ESM_LOADERS=0
EMCC_AVAILABLE=0
EMCMAKE_AVAILABLE=0
```

Therefore this run cannot build, load, or browser-test a C-ABI WebAssembly backend. Existing CNA
browser test scripts exercise engine renderer work, but they are not a packaged CNA C-ABI module
that an npm binding can import. CNA-TS consequently keeps its backend unavailable and does not
claim Web support.

## Required upstream/artifact contract

The next real backend needs a reproducible CNA build that publishes:

- an asynchronous ESM module factory and its matching `.wasm` file;
- the audited ABI 0.7 version/error/lifecycle symbols and the exact feature subset used;
- stable Emscripten memory access for POD structures, arrays, UTF-8 buffers, and 64-bit handles;
- callback registration/trampolines and deterministic teardown;
- canvas/window selection before game/graphics initialization;
- a documented shutdown sequence and error behavior;
- a CI command that rebuilds the artifact and records the CNA revision/ABI version.

The `cna_c_api` CMake target also applies ELF version-script options under `UNIX AND NOT APPLE`.
An Emscripten configure/link must be executed to determine whether that guard and the shared-library
target produce the intended modular ESM output; this audit does not guess from CMake conditionals.

## Selected backend status

No native backend is selected yet. Browser WebAssembly remains the strategic first candidate, and
the same WebAssembly ABI could be reused under Node if the produced module is host-neutral enough.
No CNA ABI route is currently called by shipped CNA-TS JavaScript. Node is verified only for pure
managed/value behavior, package loading, and consumer tests.
