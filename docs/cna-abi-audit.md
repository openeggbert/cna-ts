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

The broad 32-symbol sentinel set remains an audit of planned subsystems. The implemented Node
adapter separately resolves exactly 50 symbols; `tools/audit-cna-abi.mjs` extracts those names from
the adapter source and confirms that current headers declare every one.

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
that an npm binding can import. CNA-TS consequently keeps its browser backend unavailable and does
not claim Web support.

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

## Native Node evidence

The attempt to build current CNA HEAD remains relevant. A separate `/tmp` directory configured the
unmodified, read-only revision with:

```text
CMAKE_BUILD_TYPE=Release
CNA_BUILD_C_API=ON
CNA_C_API_BUILD_STATIC=OFF
CNA_GRAPHICS_RENDERER=HEADLESS
CNA_BUILD_TESTS=OFF
CNA_BUILD_EXAMPLES=OFF
CNA_DEVICES=OFF
CNA_USE_CCACHE=OFF
```

That build progressed into the C API target but stopped at
`modules/c-api/src/CnaCApiCoreExt.cpp:250`. Its compile-time renderer identity guard compared 49 C
identities with 50 canonical renderer entries and failed with “A renderer was added to
`CNA::GraphicsRendererType` without a C identity.” No shared library was produced, and CNA-TS did
not patch upstream.

Before attempting another build, this run searched for compatible artifacts already produced by
the sibling Java/Rust verification. It selected:

```text
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a64
BUILD=Linux x86-64, HEADLESS renderer/platform, NULL audio
SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
REPORTED_ABI=0.7.0 (encoded 0x00000700)
EXPORTED_CNA_SYMBOLS=2861
```

This path is test evidence only and is not embedded in source, package metadata, or generated
projects. All dynamic dependencies resolved locally. The small C Node-API adapter loads a path
supplied by the caller, rejects any ABI other than exact 0.7.0, imports 50 named symbols, carries
64-bit handles as bigint, and uses synchronous callback trampolines. It adds no generic FFI
dependency and no finalizer-based ownership.

The native integration command completed six real CNA game lifetimes. Its six scenario groups
(one Node TAP top-level) cover ABI/symbol validation; 60 frames; 600 frames; live-child parent
shutdown; repeated creation/destruction; and renderer identity. Across those lifetimes it created
and released six managers, six device views, six Texture2D resources, and six SpriteBatch resources,
and polled keyboard, mouse, gamepad, and touch routes. Renderer data reported `HEADLESS` from CNA,
not the former binding label `CNA`.

## Selected backend status

The package defaults to the unavailable backend. `LoadNodeNativeBackend` is an explicit opt-in that
accepts the compiled adapter and CNA library paths; no platform artifact is selected implicitly.
Node CNA execution is verified only for Linux x86-64 HEADLESS with the compatible artifact above.
Windowed/GPU renderers, Windows, macOS, Electron, mobile, and browser runtime remain unverified.

The imported slice supports ABI/errors, game lifecycle and frame hooks, FrameworkDispatcher,
GraphicsDeviceManager configuration/lifecycle, callback-scoped GraphicsDevice borrowing,
clear/present, renderer information, Texture2D and SpriteBatch create/destroy, and the already
modeled keyboard/mouse/gamepad/touch routes. Texture transfer, SpriteBatch begin/draw/end, and
native GameWindow events are not imported by this bridge yet, so the corresponding strict public
features remain partial or unavailable rather than simulated.
