# CNA C ABI audit

Audit date: 2026-08-23

This is a read-only binding-side audit. Current CNA HEAD
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0` is the upstream-build/blocker reference. The exact
machine-readable import/signature report uses qualified ABI-0.7 artifact source revision
`a09196a6477f69a7a57c8364f990658d31531a5b`. CNA itself remains the authority. Reproduce the
header and artifact inventory from either explicit CNA checkout with:

```bash
npm run audit:cna-abi -- --cna-root /path/to/cna
```

The audit is a development command, not a build or runtime dependency on a sibling checkout.

## Measured native contract

The inspected tree declares experimental C ABI **0.7.0** in 59 public headers. A comment-stripped
declaration scan finds 2,861 unique `CNA_C_API` function names. The ABI uses fixed-width result
codes, UTF-8 string views/caller-owned buffers, versioned structures, and opaque generation-checked
`uint64_t` handles; zero is the invalid handle.

The broad 32-symbol sentinel set remains an audit of cross-subsystem availability. The implemented
Node adapter separately resolves exactly 219 symbols; `tools/audit-cna-abi.mjs` extracts those
names from the adapter source and confirms that the selected headers declare every one. It also
generates a C translation unit that assigns every declared CNA function to the bridge's exact
function-pointer typedef and compiles it with warnings as errors. All 219 signatures pass, covering
pointer depth, fixed-width integer signedness, `CNA_Bool`, structures, and callback typedef ABI.
The machine-readable result is [`cna-abi-report.json`](cna-abi-report.json).

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

- the game, device manager, Texture2D, SpriteBatch, content manager, sound/XACT, media/video, and
  storage resources have owned handles and explicit release routes;
- the graphics device returned during lifecycle work is borrowed/callback-scoped;
- SpriteBatch and Texture2D children must be destroyed before their game;
- successful destruction invalidates a handle and a second destroy reports invalid handle;
- game creation copies a versioned callback table, and subscription APIs return separately owned
  registration handles.

These contracts justify the binding's internal `owned`, `borrowed`, `parent-owned`, and
`adopted/transferred` states. They do not justify exposing the numeric handle publicly.

The adapter grew from 69 to 219 symbols only for implemented routes:

| Exact adapter group | Symbols | Change |
| --- | ---: | ---: |
| ABI/error | 3 | 0 |
| game/framework lifecycle | 7 | 0 |
| manager/device/renderer information | 22 | 0 |
| Texture2D | 8 | 0 |
| SpriteBatch | 5 | 0 |
| vertex declaration/buffer and index buffer | 10 | 0 |
| keyboard/mouse/gamepad/touch | 14 | 0 |
| Audio/SoundEffect/dynamic/microphone | 43 | +43 |
| XACT engine/category/bank/cue | 46 | +46 |
| Media source/song/player | 23 | +23 |
| VideoPlayer controls | 11 | +11 |
| Storage device/container/stream | 27 | +27 |
| **Total** | **219** | **+150** |

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

The attempt to build current CNA HEAD was rechecked on 2026-08-23 at exact revision
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`. A separate `/tmp`
directory configured the unmodified, read-only revision with:

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
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
BUILD=Linux x86-64, HEADLESS renderer/platform, NULL audio
SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
REPORTED_ABI=0.7.0 (encoded 0x00000700)
EXPORTED_CNA_SYMBOLS=2861
```

This path is test evidence only and is not embedded in source, package metadata, or generated
projects. All dynamic dependencies resolved locally. The small C Node-API adapter loads a path
supplied by the caller, rejects any ABI other than exact 0.7.0, imports 219 named symbols, and
carries 64-bit handles as bigint. Game lifecycle callbacks are synchronous on the attached Node
thread and contain/rethrow JavaScript exceptions after the native call returns. No native
audio/media callback subscription is imported: dynamic buffer delivery and media updates use the
single Game/FrameworkDispatcher managed pump, so JavaScript is never invoked from an arbitrary
foreign audio thread. The bridge adds no generic FFI dependency and no finalizer-based ownership.

The native integration command exposes seven scenario groups (one isolated Node TAP top-level) and
completed seven real CNA game lifetimes. It covers ABI/symbol validation; typed Audio/XACT,
Media/Video, and Storage routes; 60 real draw frames; 600 real draw frames; live-child parent
shutdown; repeated creation/destruction; and renderer identity/capabilities.
Each full lifecycle exercises Texture2D Color transfer and region readback, PNG `FromStream` and
PNG encoding, public SpriteBatch Begin/Draw/End, synthetic LZX SpriteFont XNB plus DrawString, and a
synthetic LZX Model XNB whose relative external reference resolves to a separately compressed
Texture2D. The model creates and reads back real vertex/index buffers; cache identity and content
disposal are checked before game shutdown. The subsystem scenario additionally exercises PCM SoundEffect and
instance state, dynamic buffer queue transitions, one-listener Apply3D plus explicit multi-listener
rejection, empty microphone enumeration, generated-silent-WAV MediaPlayer controls and
visualization, VideoPlayer control state, and Storage selector/container CRUD in an isolated XDG
directory. Invalid XACT settings construction is verified with a structured CNA result; no legal
XGS/XSB/XWB fixture was available. Renderer data reports `HEADLESS` from CNA; its actual capability bits
report custom effects available and compiled effects unavailable. CNA-TS has not imported the
custom-effect execution routes, so the capability bit is evidence about CNA, not a binding claim.

## Selected backend status

The package defaults to the unavailable backend. `LoadNodeNativeBackend` is an explicit opt-in that
accepts the compiled adapter and CNA library paths; no platform artifact is selected implicitly.
Node CNA execution is verified only for Linux x86-64 HEADLESS with the compatible artifact above.
Windowed/GPU renderers, Windows, macOS, Electron, mobile, and browser runtime remain unverified.

The imported slice supports ABI/errors, game lifecycle and frame hooks, FrameworkDispatcher,
GraphicsDeviceManager configuration/lifecycle, callback-scoped GraphicsDevice borrowing,
clear/present, renderer information, Texture2D transfer/encoded image routes, SpriteBatch
Begin/Draw/End, vertex/index buffer construction and raw built-in-content transfer, and the already
modeled keyboard/mouse/gamepad/touch routes. Effect execution/reflection routes, indexed drawing,
generic public vertex transfer, video asset/frame-texture routes, and native GameWindow events are
not imported; those capabilities remain explicit blockers rather than simulations. Authored XACT
success remains asset-pending, and HEADLESS exposes no microphone device.

## Actionable missing C API routes

These are binding-side requirements, not patches applied to CNA:

| Affected XNA API | Required CNA operation and ownership | Callback/thread requirement | Minimal prospective ABI shape | Current CNA-TS behavior |
| --- | --- | --- | --- | --- |
| `ContentManager.Load` default stream acquisition | Copy the complete XNB bytes for an asset identity into caller-owned memory; CNA retains no buffer pointer | synchronous, no callback | byte-count query plus `cna_content_manager_copy_asset_xnb(manager, CNA_StringView, uint8_t*, uint64_t, uint64_t*)` | protected providers work; the base manager fails explicitly and does not expose host filesystem paths |
| `EffectPass.Apply` and stock effects | Create/destroy compiled-effect ownership and apply a borrowed pass to the callback-scoped device | synchronous on the game thread | owned effect handle, borrowed pass identity, `cna_effect_pass_apply(device, pass)` with structured error | managed reflection/state works; apply fails explicitly |
| `Model.Draw` | Bind borrowed vertex/index/effect resources and issue indexed draws without transferring child ownership | synchronous on the draw callback thread | typed vertex/index binding plus indexed-draw descriptor carrying primitive/base/start/count fields | model graph/resources load; rendering fails explicitly |
| `VideoPlayer.GetTexture` | Either copy a decoded frame into a caller-owned texture or issue an explicit borrowed lease with generation validation | frame production may be asynchronous; delivery must be polled or marshalled to the game thread, never call JS from a decoder thread | preferred copy route, or acquire/release lease handles with documented invalidation | player controls work; frame texture fails explicitly |
| `Game.Window` and window events | Expose a borrowed platform-window identity and separately owned event-registration handles | callbacks must identify their thread and support removal before parent destruction | window snapshot/mutation routes plus versioned callback table returning a registration handle | window access/events fail explicitly on HEADLESS |

No allocator-level or sanitizer-backed leak claim is made. This run verifies deterministic managed
and native ownership behavior, but the selected library was not built under ASan/LSan.
