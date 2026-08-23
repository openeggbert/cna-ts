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
Node adapter separately resolves exactly 280 symbols; `tools/audit-cna-abi.mjs` extracts those
names from the adapter source and confirms that the selected headers declare every one. It also
generates a C translation unit that assigns every declared CNA function to the bridge's exact
function-pointer typedef and compiles it with warnings as errors. All 280 signatures pass, covering
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

The adapter grew from 219 to 280 symbols only for dependency-complete implemented routes:

| Exact adapter group | Symbols | Change |
| --- | ---: | ---: |
| ABI/error | 3 | 0 |
| game/framework lifecycle | 7 | 0 |
| manager/device/renderer information | 22 | 0 |
| Texture2D | 8 | 0 |
| GraphicsDevice status/state/binding/draw | 18 | +18 |
| SpriteBatch | 7 | +2 |
| vertex declaration/buffer and index buffer | 15 | +5 |
| Texture3D/TextureCube | 10 | +10 |
| render targets | 5 | +5 |
| OcclusionQuery | 6 | +6 |
| title storage | 1 | +1 |
| GameWindow/event registration | 14 | +14 |
| keyboard/mouse/gamepad/touch | 14 | 0 |
| Audio/SoundEffect/dynamic/microphone | 43 | 0 |
| XACT engine/category/bank/cue | 46 | 0 |
| Media source/song/player | 23 | 0 |
| VideoPlayer controls | 11 | 0 |
| Storage device/container/stream | 27 | 0 |
| **Total** | **280** | **+61** |

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
supplied by the caller, rejects any ABI other than exact 0.7.0, imports 280 named symbols, and
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
disposal are checked before game shutdown. The graphics scenario additionally verifies copied
Blend/DepthStencil/Rasterizer/Sampler state, texture/buffer/render-target binding and stable facade
identity, DynamicVertexBuffer Discard plus DynamicIndexBuffer NoOverwrite round trips,
RenderTarget2D and RenderTargetCube metadata plus 2D/cube-face bind/unbind, OcclusionQuery
Begin/End/reuse, advanced non-effect
SpriteBatch Begin, GameWindow state/registrations, and title-storage reads. All five typed draw
families reach CNA; HEADLESS reports result 12 because no effect has been applied, so no pixel or
GPU-output claim is made. Texture3D and TextureCube creation both return the documented
`CNA_RESULT_NOT_SUPPORTED` on this artifact. The subsystem scenario additionally exercises PCM SoundEffect and
instance state, dynamic buffer queue transitions, one-listener Apply3D plus explicit multi-listener
rejection, empty microphone enumeration, generated-silent-WAV MediaPlayer controls and
visualization, VideoPlayer control state, and Storage selector/container CRUD in an isolated XDG
directory. Invalid XACT settings construction is verified with a structured CNA result; no legal
XGS/XSB/XWB fixture was available. Renderer data reports `HEADLESS` from CNA; its actual capability bits
report custom effects available and compiled effects unavailable. CNA-TS has not imported the
custom-effect execution routes, so the capability bit is evidence about CNA, not a binding claim.

One negative qualification deliberately attempted `cna_render_target_destroy` while the target
was still bound. Contrary to the header's documented invalid-state result, the qualified artifact
let `System::InvalidOperationException("Disposing target that is still bound")` escape and aborted
with `SIGABRT`. CNA-TS now rejects bound target disposal before native dispatch and restores the
backbuffer during device shutdown. This is a recorded upstream defect, not a passing native route;
the final native suite has zero crashes. No ASan/LSan build was available, so the ownership evidence
is deterministic handle/lifecycle stress rather than an allocator-level leak-freedom claim.

## Selected backend status

The package defaults to the unavailable backend. `LoadNodeNativeBackend` is an explicit opt-in that
accepts the compiled adapter and CNA library paths; no platform artifact is selected implicitly.
Node CNA execution is verified only for Linux x86-64 HEADLESS with the compatible artifact above.
Windowed/GPU renderers, Windows, macOS, Electron, mobile, and browser runtime remain unverified.

The imported slice supports ABI/errors, game lifecycle and frame hooks, FrameworkDispatcher,
GraphicsDeviceManager configuration/lifecycle, callback-scoped GraphicsDevice borrowing,
clear/present, renderer information, copied graphics state and binding, typed bound/user/instanced
draw dispatch, static/dynamic buffers, Texture2D/3D/Cube, render targets, OcclusionQuery,
SpriteBatch state/transform Begin, title storage, GameWindow state and removable registrations, and
the already modeled input/audio/media/storage routes. Effect execution, arbitrary custom JavaScript
vertex layouts, video asset/frame-texture routes, and standalone owned GraphicsDevice construction
remain explicit blockers or language limitations rather than simulations. Authored XACT
success remains asset-pending, and HEADLESS exposes no microphone device.

## Actionable missing C API routes

These are binding-side requirements, not patches applied to CNA:

| Affected XNA API | Required CNA operation and ownership | Callback/thread requirement | Minimal prospective ABI shape | Current CNA-TS behavior |
| --- | --- | --- | --- | --- |
| `EffectPass.Apply` and stock effects | Create/destroy compiled-effect ownership and apply a borrowed pass to the callback-scoped device | synchronous on the game thread | owned effect handle, borrowed pass identity, `cna_effect_pass_apply(device, pass)` with structured error | managed reflection/state works; apply fails explicitly |
| `Model.Draw` | Apply XNA-compatible compiled/stock effect passes before the now-available indexed draw | synchronous on the draw callback thread | executable effect/pass ownership and apply route | model graph/resources and raw indexed dispatch work; rendering remains blocked at `EffectPass.Apply` |
| `VideoPlayer.GetTexture` | Either copy a decoded frame into a caller-owned texture or issue an explicit borrowed lease with generation validation | frame production may be asynchronous; delivery must be polled or marshalled to the game thread, never call JS from a decoder thread | preferred copy route, or acquire/release lease handles with documented invalidation | player controls work; frame texture fails explicitly |
| Direct `GraphicsDevice` construction | Create a standalone owned device distinct from the game callback borrow | synchronous owner thread with explicit shutdown | owned device handle and standalone create/destroy contract | device status works; direct constructor fails explicitly because ABI 0.7 has only game-owned borrowing |
| Dynamic-buffer/render-target `ContentLost` events | Surface real loss/recreation notifications with removable registrations | game thread, removable before resource/game destruction | per-resource loss callback registration and unsubscribe handle | creation, transfer and loss queries work; events are never fabricated |
| Bound render-target destroy | Return the documented invalid-state result through the exception barrier | synchronous game thread | existing `cna_render_target_destroy` contract, fixed to contain the canonical exception | CNA-TS preflights and rejects the call; the qualified artifact otherwise aborts with `Disposing target that is still bound` |

No allocator-level or sanitizer-backed leak claim is made. This run verifies deterministic managed
and native ownership behavior, but the selected library was not built under ASan/LSan.
