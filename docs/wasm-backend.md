# The CNA-TS WebAssembly backend

TypeScript's most valuable environment is the browser, and this is the backend that gets there. The
public API does not change: `Game`, `GraphicsDeviceManager`, `Texture2D`, `SpriteBatch` and the
input snapshots are the same `Microsoft.Xna.Framework` classes a Node consumer uses. What differs is
only which object answers the private backend boundary.

```js
import { LoadWasmBackend, Game, GraphicsDeviceManager, Color } from "cna-ts";
const createCnaCApi = (await import("./cna_c_api.mjs")).default;
await LoadWasmBackend({ Factory: createCnaCApi, FactoryOptions: { canvas } });
```

## What is proved, and what is not

```text
BROWSER_BUNDLE=NOT_APPLICABLE (the harness serves the built package directly, no bundler)
BROWSER_RUNTIME=PASS
BROWSER_FRAMES_60=PASS
BROWSER_FRAMES_600=PASS
BROWSER=headless Chromium via Playwright, SwiftShader
CONTEXT=WebGL 2.0 (OpenGL ES 3.0)
CNA_RENDERER=WEBGL2 through EasyGL
ABI=0.21.0
WASM_BACKEND_ROUTES=1403
MISSING_WASM_BACKEND_EXPORTS=0
UNCAUGHT_PAGE_ERRORS=0
```

Every one of those 1403 routes is resolved when the backend is constructed, so a module missing any of
them fails at load rather than mid-frame; `npm run audit:cna-abi` checks the same list against the
artifact's loader before a browser is started. The count is accounting, not the capability: what a
browser consumer can now do is the subject of the sections below.

Route calls are checked as well as route names. `node tools/wasm/verify-route-calls.mjs` reads the C
declaration of every route this backend calls and compares it with the call: the **argument count**,
and which arguments must be `BigInt` because the artifact is linked `WASM_BIGINT` and an `i64`
parameter given a `Number` throws from inside the export. That check found seven real defects the
day it was written — a storage buffer's `uint64_t` size passed as a number, three counted `int32_t`
arrays read through the *matrix* reader because their TypeScript answer is `readonly number[]` and
so is a matrix's, two settings blocks normalised through a two-structure call where CNA edits one in
place, and a Hammersley point read as one `CNA_Vector2` where the route writes two separate floats.
It is the WebAssembly counterpart of the signature verification `audit:cna-abi` already does for the
Node-API bridge.

The list is **derived rather than maintained**. `node tools/wasm/sync-routes.mjs --check` reads the
`"cna_..."` literals out of every file in `src/internal/wasm` and requires the array to equal them
exactly, in both directions. The reverse direction is the one that matters for honesty: a route
left in the array after nothing calls it any more is still resolved, still exported, and still
counted as bound. Introducing the check found six such routes and two duplicated entries -- five
avatar-description routes for a sub-backend the WebAssembly build does not have, and a
renderer-name-size route superseded by a struct field -- so the count before this was eight higher
than the number of routes anything reached.

`npm run test:wasm-browser` serves `dist/` and the artifact over HTTP, drives an ordinary XNA `Game`
from `requestAnimationFrame`, and asserts the frame, update and draw counts, the texture the game
created, deterministic disposal and an empty page-error list. A page that merely *builds* is not
evidence of a runtime, so nothing here is claimed from a successful bundle.

This is a **vertical slice**, not the whole boundary. Every member outside it refuses by name --
through the generated `CnaBackendBase` for the game boundary and `CnaGraphicsBackendBase` for the
device's own -- rather than pretending to work, so a consumer reaching past the slice gets a
diagnostic naming the member instead of a silent wrong answer.

In the slice: ABI query, initialization, game create/run-one-frame/exit/destroy,
graphics-device-manager configuration and device creation, renderer identity, `Clear`, `Texture2D`
create/upload/read/destroy, `SpriteBatch` begin/submit/end/destroy, keyboard and mouse snapshots,
**`GamePad`**, **`TouchPanel`**, the modern runtime-services family, **title storage**,
**render targets**, **sound effects**, and **CNB**, CNA's own compiled content format — including
its **model schema**, the largest one it carries, its three **media schemas**, and its **curve and
animation-clip schemas**.

CNB crossing to the browser needed no new public API at all, which is the point of having designed
it backend-neutrally: a page gets the same `CnbDocument`, `CnbTextureData`, `CnbModelData` and
`CreateTexture2DFromCnb` a desktop consumer gets, and the browser tests make the same exact-texel
and exact-model assertions the Node suite makes.

The model is the strongest form of that claim, because it is the largest schema and the one with
the most places to go wrong. A page builds a rig with `CnbModelData`, encodes it with CNA's writer
and decodes it back, and the test asserts both bone parents and both transforms, the part's exact
vertex and index payloads read through wasm32 memory, two named texture slots beside a third left
empty, the mesh's parent bone and part list, and all three skeleton matrix sets kept apart by their
own diagonals. Every structure layout involved is measured by the Emscripten probe rather than
written by hand — `CNA_CnbMaterialInfo` alone has fourteen fields whose native offsets are not the
wasm32 ones.

One of the planted defects there is worth recording, because it did **not** fail at first. A reader
that returned zero for every bone parent passed, since the test sampled only the child bone, whose
parent is zero. The test now samples the root as well, and the same defect fails it. A gate is only
evidence once it has been seen to fail for the reason it exists.

## Controllers and fingers

`GamePad` and `TouchPanel` are the same `Microsoft.Xna.Framework.Input` classes on both backends.
What a browser adds is a different device layer underneath — the page's Gamepad API and its touch
events, by way of SDL3's Emscripten platform — and none of that reaches a consumer.

`npm run test:wasm-browser-input` proves it a frame at a time. The main harness runs sixty frames
and reports at the end; input needs the opposite shape, because the evidence is what the facade
answers *between* one frame and the next while a browser event is delivered. So
`test/wasm/browser-input-page.html` exposes one frame at a time and the driver interleaves real
input with real frames, sampling inside an ordinary `Update`.

```text
NO CONTROLLER   GamePad.GetState(One..Four).IsConnected = false, and GetCapabilities agrees
                SetVibration                             = false
CONTROLLER      GetCapabilities  IsConnected, GamePadType.GamePad, A/B/Start/D-pad/sticks/triggers
                                 HasLeftVibrationMotor = false, HasVoiceSupport = false
                Buttons.A        Released -> Pressed -> Released
                ThumbSticks      left (0.5, 0.25), right (-0.75, -0.125)
                Triggers         left 0.5, right 0.0
                PacketNumber     advances on press and again on release
TOUCH           before any finger  IsConnected = false, Count = 0
                press              Pressed, no previous location
                next frame         Moved, previous = the press
                move               same Id, previous = the press position
                two fingers        Ids 1 and 2, the new one Pressed, the old one Moved
                release            Released once, then the collection empties
```

Two of those deserve saying out loud. **`HasLeftVibrationMotor` is false and `SetVibration` returns
false**, because the browser's standard gamepad mapping exposes no rumble to SDL3 — a backend that
answered true would be lying to a game that uses the return value to decide whether to offer a
haptics setting. And **the thumbstick Y axes are inverted**: the browser reports Y down-positive and
XNA reports Y up-positive, so the test asserts the sign as well as the magnitude, which is what
catches a backend that passed the axis straight through. Releasing the stick returns negative zero
for exactly that reason, and the test says so rather than rounding the fact away.

The touch half is genuine browser input: Chromium's own touch emulation, dispatched through
`Input.dispatchTouchEvent`, so the page receives ordinary trusted touch events. The gamepad half is
emulated **at the browser API boundary** — `navigator.getGamepads` is what SDL3's Emscripten
joystick driver reads, and neither Playwright nor the DevTools protocol can attach a virtual
controller — so everything below that one function is the real chain and nothing is stubbed. That
distinction is stated here rather than blurred, and the "no controller" case above is what keeps it
honest.

Three planted defects prove the tests can fail: swapping the thumbsticks fails the value test, an
always-connected capability table fails the no-controller test, and reporting the current touch
position as the previous one fails the touch test. Each fails exactly one test and no others.

## Sound

A game without sound is not much of a game, so `SoundEffect` and `SoundEffectInstance` are the same
public classes here that a Node consumer uses. What a browser adds is one rule this backend does not
pretend away: a page will not start a WebAudio context until it has had a user gesture. So building
a sound, reading its duration, making instances and driving their state all work regardless, and
whether a sample is *audible* is the page's business. `SoundEffect.Play` reports whether the runtime
accepted it, which is the most a caller can truthfully be told from here.

```text
DURATION=250 ms exactly, from a quarter second of 8 kHz mono PCM
INSTANCE_STATES=Stopped -> Playing -> Paused -> Playing -> Stopped
VOLUME/PITCH/PAN/LOOPED=round-trip at float precision
```

Duration is arithmetic on the sample count, so it is exact evidence that does not depend on anything
being heard. XACT, microphones, 3D positioning and dynamic buffers are outside the slice and refuse
by name.

That arithmetic is also why the **compiled** sound effect is measured here rather than on Node. This
artifact is built with SDL3 audio; the Node one is built with `CNA_AUDIO_PLATFORM=NULL`, and CNA's
own `CApi_AudioSmoke` records that a PCM16 effect has no duration without a mixer. So a quarter
second of 8 kHz mono encoded to `.cnb`, decoded back and turned into an XNA `SoundEffect` reports
exactly 250 ms and 2,500,000 ticks **in a page**, and the Node suite asserts the zero it actually
gets rather than the number it would like. A song and a video cross too: both containers carry a
stream reference rather than the media, so both schemas are complete in a browser with no encoded
audio or video at all.

## Content in a browser

A browser game's assets have to reach the module's filesystem, because that is what CNA reads.
`TitleContainer.OpenStream` and therefore `ContentManager.Load` work in a page once they are there:

```js
const module = await createCnaCApi({ canvas });
module.FS.mkdir("/Content");
module.FS.writeFile("/Content/Atlas.xnb", new Uint8Array(await (await fetch("/Atlas.xnb")).arrayBuffer()));
await LoadWasmBackend({ Module: module });
// ...then, inside the Game, the ordinary XNA call:
const atlas = new Content.ContentManager(this.Services, "Content").Load(Graphics.Texture2D, "Atlas");
```

Nothing about `ContentManager` is browser-specific: XNB framing, the reader table, the LZX
decompressor and every built-in reader graph are managed TypeScript and already ran on Node. What
the browser needed was the one route underneath them. `cna_title_container_read_ext` is a
count/copy pair delivering a whole file, so the backend probes for the size, copies once, and
releases the module allocation before returning -- the bytes a consumer holds are a JavaScript copy,
never a pointer into a heap that `ALLOW_MEMORY_GROWTH` can move. A missing asset is
`CNA_RESULT_IO`, which surfaces as a failure rather than as an empty asset.

Loading content inside a `Game` also needed a behavioural fix that had nothing to do with
WebAssembly: `GraphicsDeviceManager`'s constructor now registers itself in `Game.Services`, as XNA's
does under `IGraphicsDeviceService`/`IGraphicsDeviceManager`. The built-in texture, font and model
readers look for exactly that, and without it `Content.Load` inside an ordinary `Game` failed on
either backend. A TypeScript interface has no runtime token to key a service by, so the concrete
class is the key.

## Off-screen rendering, and the first asserted pixels

`RenderTarget2D` is the whole reason the graphics boundary got its own facade here. A browser test
can now clear a target to an exact colour and read every texel back:

```text
RENDER_TARGET=4x4 DepthFormat.None DiscardContents
CLEAR=(12, 34, 56, 255)
READBACK=16 of 16 texels exactly equal
BOUND_DISPOSAL=refused ("A bound RenderTarget2D cannot be disposed")
```

That is the first evidence in this project that comes out of a GPU rather than out of a route
returning success: the bind, the clear, the unbind and the readback all have to reach real WebGL2
storage for those sixteen values to be right.

`ContentLost` is deliberately **not** implemented on this backend. `render_target.h` says only the
`DIRECTX9`, `DIRECT2D` and `SKIA` families can report a lost device, so a WebGL2 subscription would
be valid and permanently silent. The managed helper already treats a refused subscription as "this
renderer cannot lose a device", which is what XNA does, so the honest answer is to leave the event
declared and unproduced rather than to register a producer that can never fire.

## Building the artifact

The artifact is `cna_c_api.mjs` plus `cna_c_api.wasm`, from the `cna_c_api_wasm` target of an
Emscripten tree, built out of tree. **It no longer needs any binding-specific link setting.** Two
were required until ABI 0.21; CNA now sets both itself, and the recipe below is the stock target:

```sh
source ~/emsdk/emsdk_env.sh
emcmake cmake -S . -B cmake-build-tswasm -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCNA_BUILD_C_API=ON \
  -DCNA_SHARP_RUNTIME_ROOT=/path/to/sharp-runtimenext \
  -DCNA_GRAPHICS_RENDERER=WEBGL2 \
  -DCNA_BUILD_TESTS=ON -DCNA_BUILD_EXAMPLES=OFF \
  -DCNA_ENABLE_DRACO=OFF -DCNA_ENABLE_VIDEO=OFF \
  -DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DCMAKE_C_COMPILER_LAUNCHER=ccache
cmake --build cmake-build-tswasm --target cna_c_api_wasm
```

The artifact this build produces, requalified against `cnanext` 599d14e5:

```text
EMCC=6.0.3
CMAKE_BUILD_TYPE=Release   CNA_GRAPHICS_RENDERER=WEBGL2   CNA_PLATFORM=SDL3
MODULE_SHA256=b33248e3e0a822e373c5a923c2a6c3b473017220d560e70f456336c81559fdf8
WASM_SHA256=7479a41a59a4ea5cf129e1e39598dbea7e62e3349c37b9021c54d414b694f35f
WASM_BYTES=18958610
BINDING_LINK_OVERRIDES=0
```

### Two optional CNA runtimes, and what turning them on is worth

Two CMake options are off by default, each because it pulls something the renderer does not
otherwise need, and each one gates a capability this binding can already reach. Adding both to the
recipe above produces a second artifact:

```sh
emcmake cmake -S . -B cmake-build-tswasm-fx -G Ninja \
  ...the same settings, plus... \
  -DCNA_EASYGL_COMPILED_EFFECTS=ON \
  -DCNA_CNAEXT=ON \
  -DFETCHCONTENT_SOURCE_DIR_FNA3D=~/deps/FNA3D
cmake --build cmake-build-tswasm-fx --target cna_c_api_wasm
```

`CNA_EASYGL_COMPILED_EFFECTS` fetches MojoShader through FNA3D, which is why the recipe points at a
shared checkout rather than cloning one per build. Measured, against `cnanext` 7712534d:

```text
EMCC=6.0.3
CNA_GRAPHICS_RENDERER=WEBGL2   CNA_EASYGL_COMPILED_EFFECTS=ON   CNA_CNAEXT=ON
MODULE_SHA256=bbe0a94a8e50ddb4ea89b803cac74a901170990ea7ae79bf36d944359a83e22f
WASM_SHA256=419475e19391c4bdb8dfd443e308b8dc107fcc100c5f66a8adaaf32f6580b756
WASM_BYTES=24398416
BINDING_LINK_OVERRIDES=0
```

**Neither artifact is the other's replacement, and the binding answers truthfully for both.** The
same public API, the same bytes, two different answers -- and both of them CNA's:

| asked of the running artifact | default | with both options |
| --- | --- | --- |
| `cna_graphics_ext_is_available` | `false` | `true` |
| `cna_instanced_renderer_ext_get_instance_stride` | `NOT_SUPPORTED` | `SUCCESS`, stride 64 |
| `new Effect(device, fxb)` | `NOT_SUPPORTED`, naming `GraphicsCapability::CompiledEffects` | a live effect, six parameters, two techniques |
| `new FullscreenPass(device)` | `NOT_SUPPORTED` | a pass that blits |

`npm run test:wasm-browser` runs against whichever artifact it is pointed at and asserts the
consequences of *either* answer, so it is green on both and prints which one it measured
(`CNA_TS_WASM_CNAEXT`, `CNA_TS_WASM_COMPILED_EFFECT`, `CNA_TS_WASM_ENGINE_LAYER`). That is the
right shape for a suite a consumer runs and useless as a claim, because against the default
artifact it takes the refusal branch and proves nothing about either capability. The claim lives in
`npm run test:wasm-browser:strong:required`, which fails by name -- before a test registers -- on a
missing artifact, on `cna_graphics_ext_is_available` false, on a refused compiled effect, on a
missing fixture, and on a run in which nothing executed or anything skipped. Its refusals are
exercised in `test/wasm-strong-gate.test.mjs`, one of them transcribed from a real default-artifact
run.

## The two upstream gaps this backend measured, and their repair

Both are **fixed in `cnanext` 599d14e5** and the fix is verified here against the artifact rather
than against the commit message. The measurements that found them are kept, because they are what
makes the repair checkable.

### 1. `cna_c_api_wasm` did not pin the WebGL version its renderer needs

Without `-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2`, Emscripten negotiates a WebGL 1 context while
`EasyGLGraphicsBackend` asks SDL for GLES 3, its GLSL ES 3.00 shaders fail to compile
(`ERROR: 0:1: '' : unsupported shader version 300`), and the module aborts on the first draw.
`modules/graphics/examples/CMakeLists.txt` set the pair for the demos; `cna_c_api_wasm`, the
artifact a binding is meant to consume, did not, so this package supplied the pair through
`CMAKE_EXE_LINKER_FLAGS`.

**Repaired upstream** by `cna_apply_emscripten_renderer_link_contract` in
`cmake/RendererSelection.cmake`, which derives the pair from `CNA_GRAPHICS_RENDERER` and is applied
to `cna_c_api_wasm`. **Verified here**: the stock artifact's generated JavaScript requests
`majorVersion:2` exactly once and `majorVersion:1` zero times, and the browser suite renders a
render target through GLSL ES 3.00 shaders and reads its exact texels back.

### 2. `-sASYNCIFY=1` made every route unrewindable, because every route takes a handle

`CNA::EmscriptenAbi` added `-sASYNCIFY=1` to every Emscripten link. SDL3's
`Emscripten_GLES_SwapWindow` then calls `emscripten_sleep(0)` on each present
(`third_party/SDL/src/video/emscripten/SDL_emscriptenopengles.c:145`, guarded by
`emscripten_has_asyncify()`), which unwinds the JS-entered export.

Asyncify's rewind re-enters the bottom export of the call stack **with no arguments**. Under
`WASM_BIGINT` an `i64` parameter given `undefined` throws
`TypeError: Cannot convert undefined to a BigInt`, so the rewind fails and the frame is lost. Every
route in this ABI takes a `CNA_Handle`, which is `uint64_t`, so **no route could be driven from
JavaScript while Asyncify might unwind it**. Measured then: with Asyncify on, 5 requested frames
produced 3 updates and 3 unhandled rejections; with `-sASYNCIFY=0`, 5 frames produced 5 updates,
5 draws and no errors.

**Repaired upstream** by setting `CNA_EMSCRIPTEN_ASYNCIFY OFF` on the target and stating
`-sASYNCIFY=0` in its own `target_link_options`, so the project-wide support pass cannot append a
later `-sASYNCIFY=1` that wins by order. CNA also added its own `CApi_WasmLinkContract` test, which
greps the linked JavaScript rather than trusting option order. **Verified here**: the stock
artifact's generated JavaScript contains no `Asyncify` runtime object, and the browser suite runs
600 real frames with zero uncaught page errors.

## Frame pacing in a browser

`Game.Run` refuses on this backend, and that refusal is the honest answer: a browser owns its event
loop and a blocking loop would freeze the page. Drive `Game.RunOneFrame` from
`requestAnimationFrame`.

Set `IsFixedTimeStep = false` for a browser game. With a fixed timestep, CNA's `Game::Tick` waits out
the remainder of each frame through `Platform::Delay`, and without Asyncify that is a busy wait
inside the page's own frame callback. `requestAnimationFrame` is already the display's clock, so the
variable timestep is both correct and what the browser wants.

## What the layout module is for

`src/internal/wasm/layout.ts` is generated by `tools/wasm/generate-layout.mjs` from a probe compiled
by the same Emscripten toolchain that builds the artifact. wasm32 pointers are four bytes, so the
native ABI baseline places several structure fields somewhere the module does not look --
`docs/c-api/WASM_ARTIFACT.md` names hand-rolling `CNA_GameCreateInfo` from the native layout as
exactly how a binding earns `CNA_RESULT_INVALID_ARGUMENT` with nothing visibly wrong. Nothing in that
file is written by hand, and the sprite-command array stride is read from it rather than restated,
which is what caught an assumed 80-byte stride against a measured 72.

## A wasm32 convention this backend pinned

`docs/c-api/WASM_ARTIFACT.md` records that how a `CNA_StringView` passed **by value** is expanded in
the wasm32 calling convention "was not established", and advises using pointer-and-length routes
where there is a choice. Three routes this binding needs offer no choice --
`cna_graphics_renderer_set_preferred_by_name_ext`, `cna_graphics_renderer_try_parse_name_ext` and
`cna_logger_log` all take the view by value.

Measured: Emscripten lowers the by-value aggregate to **a pointer to the structure in module
memory**, laid out exactly as the generated `CNA_StringView` layout says. The browser test asserts
the round trip -- `TryParseName("webgl2")` returns 6 and `TryParseName("not-a-renderer")` returns
null -- so a wrong lowering would fail rather than pass quietly. That is one fewer unpinned item in
the artifact contract.

## Two states this backend learned to model

Both were found by running the same code on two backends, which is the point of having two.

- **`cna_graphics_renderer_get_active_ext` refuses before any renderer exists**, with
  `CNA_RESULT_INVALID_STATE` and the message "was called before any graphics renderer had been
  created". That is a state, not a failure, so `RendererSelectionState.Active` is `null` there
  rather than an exception or a fabricated `Unknown`.
- **`cna_desktop_os_get_current` refuses off a desktop**, which is exactly what a browser is. Node
  reaches this route happily and would never have shown it; the browser run failed on the first
  call. `CnaPlatformInfo.DesktopOperatingSystem` is now `null` on a non-desktop platform.

## Geometry: what a browser can now draw

Until this slice existed a browser could draw sprites and read pixels back, and nothing else. There
was no vertex buffer, no index buffer, no effect and no indexed draw, so a browser consumer could
not put a triangle on the screen through the public API. Twenty-one routes changed that, and
`test/wasm-browser.mjs` asserts the result texel by texel:

| what | evidence |
| --- | --- |
| a triangle covering the target | all sixty-four texels are the vertex colour, not the clear colour |
| the same triangle translated off it | all sixty-four are the clear colour |
| translated a little | the vertex colour again, so the two above are not both "the draw failed" |

The middle row is the one that earns its keep. A `CNA_Matrix` is taken **by value**, and a world
matrix that arrived as zeroes would collapse the triangle rather than move it — so a target that
goes exactly clear and then exactly red again is the by-value convention working.

### The by-value convention, measured rather than assumed

`CNA_Matrix` is sixty-four bytes and `CNA_Vector3` is twelve, and both are taken by value by routes
this slice needs. An Emscripten probe settles how wasm32 lowers them:

```c
EMSCRIPTEN_KEEPALIVE float take_v3(V3 v) { return v.x * 100.0f + v.y * 10.0f + v.z; }
EMSCRIPTEN_KEEPALIVE float take_m4(M4 m) { return m.m[0] * 100.0f + m.m[15]; }
```

```text
take_v3(pointer) = 123          take_v3(1, 2, 3) → Aborted: called with 3 args but expects 1
take_m4(pointer) = 709          take_handle_and_v3(5n, pointer) = 6
```

**Both are passed as a pointer to a caller-owned copy**, and a scalarised call is rejected outright
rather than misread. This extends what the `CNA_StringView` finding above established from one
struct to aggregates of both sizes, and to a `uint64_t` handle followed by one.

### What is not here, and why

**The engine layer is absent from the *default* artifact**, not merely unbound. That build sets
`CNA_CNAEXT=OFF`, which compiles out `engine_layer.h`'s implementation and leaves the exported
symbols as `ExtensionUnavailable()` stubs. Measured on both artifacts, the same route:

```text
cna_instanced_renderer_ext_get_instance_stride   default → 6 (NOT_SUPPORTED)
                                                 -DCNA_CNAEXT=ON → 0, stride 64
```

So on the default artifact the instanced renderer, LOD selection and every post-process pass answer
`NOT_SUPPORTED` however carefully they are bound. **On an artifact built with `-DCNA_CNAEXT=ON`
they do not**, and until recently the binding was the thing standing in the way: the WebAssembly
backend had no `GraphicsExtensions` object at all, so every public API in
`cna-ts/extensions/graphics` failed with "CNA extended graphics requires a loaded backend" -- a
statement about this package, when what varies is how the consumer built their artifact.

There is now a slice: **the fullscreen blit and colour grading**, one family of the layer's 857
routes. It was chosen because its output is exactly predictable rather than merely plausible. A
size-2 `.cube` whose transfer is the channel rotation `(r,g,b) -> (b,r,g)` is linear in each
channel, so trilinear interpolation of its eight corners reproduces it exactly -- which means every
graded texel is arithmetic from the source rather than a number read off a run. Over a 4x4 gradient
on WebGL2, all asserted:

| draw | expectation |
| --- | --- |
| a straight blit | the source exactly -- the control the grades are read against |
| the strip LUT at full strength | the rotation, within a byte |
| the volume LUT at full strength | the rotation, and agreeing with the strip within a byte |
| the strip LUT at half strength | exactly the midpoint of source and rotation |
| zero strength, and no LUT at all | the source |

with the table read back out of CNA before a pixel is drawn -- title, size, unit domain, all eight
entries in order, a 4x2 strip and a 2x2x2 volume -- and the pass state a pixel cannot reach: its
name, whether it is supported here, which table it holds through strip, volume, both and neither
again, its interpolation and its strength.

### The rest of the post-process family

The passes above take the frame that is already on screen and nothing else. The twelve that read
something further -- depth, normals, velocity, a sun, a light's position on screen, or a game's own
compiled effect -- were unbound, and the reason was never that a browser could not run them. It was
that nobody had asked the artifact.

Asked, per pass, through `cna_post_process_pass_is_supported` with the device: **SSAO, SSR, depth of
field, lens flare, motion blur, ASCII, aerial perspective, height fog, light shafts, volumetric fog
and contact shadows all answer true** on a WebGL 2.0 context, plus the spatial upscaler, which is
its own object rather than a pass. On the default artifact every one of their `create` routes
answers `NOT_SUPPORTED` (6) instead, which is the same distinction the rest of this layer draws.

Three kinds of evidence, in increasing order of what they prove.

**The pass is the pass it says it is.** Eleven near-identical families sit behind eleven
near-identical `create` routes, and a `create` wired to a sibling's would still take every setter
that pass's public class calls and round-trip every one of them. So each pass's own name is read
back out of CNA, which is the only thing that disagrees.

**The value reached CNA.** Nine of these properties clamp or refuse what they are given, in ranges
that live in the pass sources rather than in any header -- `setRoughnessBlur` to `[0, 0.25]`,
`setEdgeFade` to `[0, 0.5]`, `setAnisotropy` to `[-0.95, 0.95]`, `setTurbidity` to at least one, and
so on, with several others leaving the previous value standing rather than accepting a non-positive
one. Writing outside each range and reading back is this family's equivalent of the compiled
effect's native read-back: **a binding that kept these values in JavaScript would hand every one of
them back unchanged.** The first draft of the test did not know about the clamps and wrote `0.6875`
to a `[0, 0.25]` property; CNA answering `0.25` is what put them here.

**CNA's own arithmetic.** Seven of these passes ship a pure function of the same computation their
shader does, so a browser can be held to CNA's answer rather than to a picture taken earlier:

| route | what it settles |
| --- | --- |
| `cna_depth_of_field_pass_circle_of_confusion_millimetres` | the thin-lens diameter; exactly zero at the focus distance and monotone away from it on both sides |
| `cna_ssao_pass_sample_count_for_quality` | 8, 16, 32, 64 |
| `cna_ssao_pass_copy_kernel` | the 64 vectors the shader really samples |
| `cna_aerial_perspective_pass_air_mass_for_distance` | linear in distance up to the Kasten-Young ceiling for that direction |
| `cna_aerial_perspective_pass_transmittance` | Rayleigh extinction plus a turbidity Mie term, per channel |
| `cna_height_fog_pass_optical_depth` | the fog integral, in both its branches |
| `cna_contact_shadow_pass_is_occluded` | the ray-march acceptance test, whose bounds are **both strict** |
| `cna_spatial_upscale_pass_is_identity_scale` | whether the upscaler is a no-op |

The SSAO kernel is the sharpest of them. It is a deterministic Van der Corput sequence, so the
oracle produces all 64 samples in JavaScript and compares them component by component to the ones
CNA will sample -- the same sequence twice, in two languages, rather than "it looks like a
hemisphere". (It is also asserted to *be* a hemisphere, separately, so a reimplementation that
matched a wrong transcription still has to pass.)

### Pixels without a depth buffer: the ASCII quantizer

One pass in the group produces an image predictable to the texel with no prepass at all, and its
whole specification is in `AsciiQuantizer.cpp` and `AsciiPostProcessEffect::draw`: ceil-divide the
source into cells, average RGB per cell, take luminance `0.299R + 0.587G + 0.114B`, round onto the
ten-character ramp `" .:-=+*#%@"`, and in Color mode paint a background of exactly the average over
four before the glyph.

The ramp's first character is a **space**, which lights no pixels. So a source whose quadrants are
dark enough to quantize to index zero has an output whose every texel is named:

| 4x4 source quadrant | luminance | glyph | every texel of its cell |
| --- | --- | --- | --- |
| `(40, 0, 0)` | 11.96 | `' '` | `(10, 0, 0, 255)` |
| `(0, 20, 0)` | 11.74 | `' '` | `(0, 5, 0, 255)` |
| `(0, 0, 80)` | 9.12 | `' '` | `(0, 0, 20, 255)` |
| `(255, 255, 255)` | 255 | `'@'` | `(255,255,255,255)` or `(63,63,63,255)`, both present |

measured and matching. The cell size is then doubled, which must collapse the grid to one cell whose
average is the average of the four quadrants, and set to a **non-square** 2x4, which must give four
columns and two rows -- the case that separates a transposed cell size from a correct one. Switching
to `BlackWhite` must leave no hue in any texel, which is the assertion a mode stored managed-side
and never sent fails.

Fifteen planted defects, thirteen killed. The two survivors are equivalent rather than missed: a
`CNA_Bool` read four bytes wide cannot differ while `WasmScope.allocate` zeroes its allocation, and
an array length taken from the requested capacity cannot differ while both bound array routes fill
exactly what was asked for. A third survivor was **not** equivalent -- forcing the height fog's base
height to zero passed, because every optical-depth sample in the test used a zero base height. That
was a gap in the test, and the fix was to vary all six of that function's arguments.

### The depth/normal prepass, the decal projector, and the draw that vanishes

Those eleven passes read a depth image, and until now a browser had no way to make one. The prepass
and the decal projector that consumes it are bound together for that reason -- and because
`DecalPass` cannot be handed an uploaded `Texture2D` as its depth input, so it becomes reachable in
a browser at exactly the moment the prepass does.

**The prepass reports itself supported here, and writes nothing.** `IsSupported` is true, `Begin`
succeeds, the draw succeeds, `End` succeeds, and both buffers come back holding their clear. That
is not the prepass: on WEBGL2 a draw into a multiple-render-target bind reaches none of its targets,
and the prepass reports `IsUsingMultipleRenderTargets` here and does all of its work inside one such
bind. Measured with a stock `BasicEffect` and no custom shader anywhere near it:

| bound targets | the `Clear` reached them | texels the triangle painted |
| --- | --- | --- |
| one | yes | 233 |
| two | yes | 0 and 0 |

That is **upstream finding 30**, and it reproduces on the default artifact too, through nothing but
`SetRenderTargets`, `Clear`, `BasicEffect` and `DrawUserPrimitives`. The same scenario passes on the
windowed OPENGLES3 build. `tools/upstream-repro/webgl2-multiple-render-targets.mjs` is the probe on
its own.

So this family divides, and the browser suite says which half it is asserting:

| reachable, and asserted | blocked by finding 30 |
| --- | --- |
| the packed-depth arithmetic, and finding 13's 2001-point sweep on this backend | the depth image |
| both GLSL dialects, and which one carries the unpacker | the normal image |
| the velocity encoding, its threshold and its centred channels | every screen-space pass's input |
| the lifecycle, the pass count, the borrowed textures and both effects | the decal's painted footprint |
| the roughness clamp, and finding 14's three `INTERNAL` codes | |
| the decal's opacity clamp, its unclamped tint and its slope clamp | |
| `IsInsideDecalBox`, on and off both sides of every face | |

The suite does not skip the right-hand column. It **asserts** that the prepass writes nothing and
the decal paints nothing, by name, so a repaired renderer fails here and is told to extend the
suite to the geometric predictions the windowed one already makes.

Finding 13 and finding 14 are now asserted through `test/support/prepass-decal-oracle.mjs` by
**both** the windowed and browser suites. They are one claim about one piece of CNA, and two copies
of a claim is how two suites come to disagree about whether it has been repaired.

Fifteen more planted defects, eleven killed. Of the four survivors, one is equivalent -- CNA clamps
roughness to the same unit range a binding-side clamp would -- one is unreachable through the public
API, and two are limited by finding 30: with both buffers holding nothing but their shared clear, a
depth getter that returns the normal buffer is indistinguishable from one that does not. A fifth
survivor was a real gap and is now killed: a transposed `CNA_Matrix` write reached every camera in
the engine layer and nothing could read one back, so the engine layer and the effect backend were
made to share one writer -- and the browser suite's existing world-matrix round-trip through
`cna_effect_matrices_get_world` catches it.

### Particles, which are the family a browser gets whole

Particle systems draw into whatever single target is bound, so upstream finding 30 takes nothing
from them: this is the one family in this slice whose pixels a browser gets rather than only its
state. The scenario is the windowed suite's, run unchanged and asserted through the same
`test/support/particle-oracle.mjs` — every source of variance off and no speed at all, so each
system paints one square where the camera puts its emitter, as wide as its particle size.

The two backends land on the same texels:

```text
windowed OPENGLES3   NEAR=49px@80,48  FAR=156px@20,77  CAMERA_SHIFT=13px
browser WEBGL2       NEAR=49px@80,48  FAR=156px@20,77  CAMERA_SHIFT=13px
```

Those numbers are the *camera's*: the view and projection are built in the test from `CreateLookAt`
and `CreateOrthographic`, and the emitter positions and particle sizes are chosen there. A draw that
ignored the view, the projection, the emitter position or the particle size lands somewhere the
prediction cannot follow.

A second half the windowed suite does not have: `ParticleMath.Random` and `ParticleMath.Step` are
pure, so a trajectory is integrated forward here through CNA's own step and compared with the
closed form for the same motion. Under gravity alone, twelve steps of 0.05 s at 9.8 fell exactly
`g·dt²·n(n+1)/2` — semi-implicit Euler, measured rather than assumed — with the velocity linear and
the age advancing by exactly one step each time. That is what says this backend's marshalling of
`CNA_Particle` and `CNA_ParticleEmitterSettings` — three `CNA_Vector4`s and fourteen fields across
two *growable* structures whose `struct_size` selects what CNA reads — agrees with what CNA reads
out of the same memory. Both layouts are measured by `tools/wasm/generate-layout.mjs`, not written
here.

**Soft particles stay blocked, and are asserted as blocked.** Upstream finding 12: the depth input
and the softness reach CNA, store, and read back, and the drawn picture is byte-identical with a
depth image of zeros, with one of ones, and with none at all. The suite asserts that unchangedness
rather than skipping it, so a repair fails and says so.

Fourteen planted defects, twelve killed. The two survivors are equivalent or blocked — CNA floors
softness to the same zero a binding-side floor would, and the depth input's far plane cannot matter
while finding 12 holds. A third survivor was a real gap: dropping `Update`'s elapsed time changed no
count, no position and no texel, because `Reset` fills the pool. The particles' own age is the only
thing that can tell, and asserting it is what the mutant asked for.

### The three shadow maps that are not a directional one

A spot light's shadow is one perspective map, a point light's is six, and a directional light over a
large scene wants several over nested slices of its frustum. All three answered `..._is_supported`
with true here, and the shadow family is now bound whole — 78 of 78 members.

Each ships the transforms behind it as pure routes, so the browser suite checks what a map *holds*
against what those say it should hold. Nothing below is a number read off a run:

| claim | checked against |
| --- | --- |
| the cascade splits | the practical-split blend, recomputed: `λ·near·(far/near)^(i/n) + (1−λ)·(near + (far−near)·i/n)` |
| `SelectCascade` | the map's own splits, at depths straddling every one of them |
| the texel snap | the quantum a cascade of that radius and that size has, `2r/s`, on the two axes it rasterises across and not on depth |
| the spot map's transform | the **product** of the two pure routes that compute its halves — three CNA routes that have to agree, none of which shares state with another |
| the spot frustum | `1 / tan(outerAngle)`, so the field of view is twice the cone's outer angle; the inner angle is a falloff and must move nothing |
| each cube face's view | what that view must do to a point one unit along **its own** axis: centred across, centred down, and one unit at −Z |
| the cube projection | exactly ninety degrees, which is the only angle whose frustums tile a cube |
| the frustum sphere | it contains all eight corners CNA computed, and is tight around them |

The cube-face table is the one that cannot be satisfied by a permutation: each face is asked about a
*different* axis, and only its own view puts that axis in front of the camera.

Fourteen planted defects, fourteen killed — but only after four of them found real gaps in the
tests. The cascade lambda was being set to CNA's own default, so a setter wired to a neighbour left
it in place and every split still agreed. The cube face projection was checked only on its
angle terms, so dropping the light's range changed nothing asserted. The spot cone's two angles
moved the projection together, so the product comparison could not tell them apart. And the bone
palette's count could not be observed at all until CNA was asked at the two edges only a
caller-supplied count has — an empty palette and an implausibly large one, both refused with
`INVALID_ARGUMENT`, where one bone and seventy-two are accepted.

The skinned caster is bound with the rest, and the reason it was once thought unreachable is worth
recording: it takes a bone palette from the *caller*, not from a model. What needs a native content
manager is drawing a skinned `ModelMeshPart`, which is a different thing and stays out of reach.

### The sky, light probes, clustered lighting — and the core graphics gap they exposed

Three more families, all bound whole, and all checkable without a picture.

`cna_atmospheric_sky_is_supported` and `cna_light_probe_baker_is_supported` both answer **true**
here. `cna_clustered_light_compute_is_supported` answers **false** — but that is one object, and the
other four in the clustered family compute entirely on the CPU, so "clustered lighting" is bound and
its GPU cluster builder is renderer-blocked. Those are different statements and the census keeps
them apart.

| what | checked against |
| --- | --- |
| a skybox's view ray | a ninety-degree frustum's own corners: `(0,0,−1)` at the centre and `(±1/√2, 0, −1/√2)` at the edges, and a quarter-turn of yaw taking the centre onto −X |
| the equirectangular mapping | `u = 0.5 + atan2(x, −z)/2π`, `v = 0.5 − asin(y)/π`, for all six axes |
| the GGX importance sample | the normal itself at roughness zero, whatever the sample point — a mirror scatters once |
| a probe's irradiance | Ramamoorthi and Hanrahan's nine terms, restated in the oracle from `LightProbeEXT.cpp` |
| a volume's interpolation | the straight line two corner probes make: 1 at one end, 3 at the other, exactly 1 + 2t between |
| the cluster grid | `near · (far/near)^(slice/count)` for all 25 boundaries, and `slice·tx·ty + y·tx + x` for the flattening a shader has to agree with |
| the assignment | its own 3072 per-cluster lists, summed, against its own total — two routes over one table, both 2165 |
| the shadow budget | one request per *shadow-casting* light, which is one of the two, and a budget of one accepting it |

The baker is the one with a callback, and the callback is the interesting part: six faces, six
different views, one shared projection, with CNA's own capture target bound each time. So it binds
no target of its own, and a JavaScript exception thrown inside it is **held and rethrown after the
bake** rather than unwound into compiled C — asserted, because "swallowed" would mean a page whose
draw failed got a probe baked from nothing and no indication of it.

Two corrections the measurements made: the sun direction comes back **normalised**, and a clustered
light with **no intensity is still usable** while one with no range is not. Neither was the guess.

**The core graphics slice is now complete too, at 48 of 48**, and the reason is that the engine layer
reached it: a skybox is a `TextureCube`, a colour-grade volume is a `Texture3D`, and a page drawing
its own geometry sets its own blend, sampler, scissor and viewport state. `ContentLost` is bound with
them — WebGL 2.0 does not raise it, and a binding that refused would be answering a question about
itself rather than about the renderer. That last addition also found a hole in the route gate: route
names composed from a prefix at runtime never reach `ROUTES`, so `sync-routes.mjs` counted three
prefixes as routes and missed six real ones. The names are written out now, and the reason is a
comment on them.

### The rest of the layer, and how a slice this size is qualified

Every backend interface the WebAssembly build provides is now bound **whole**:

```text
GraphicsExtension 603/603   Content 126/126   Shadow 78/78   ClusteredLighting 54/54
Graphics 48/48              LightProbe 46/46  Atmosphere 41/41  Compute 37/37
DepthNormalPrepass 27/27    Particle 24/24    Effect 21/21   InstancedRenderer 14/14
Lod 14/14                   Decal 12/12       NativeMeshPart 10/10   Audio 30/30
the game boundary 52/52     runtime services 15/15
```

Two of those were recorded by an earlier session as architecturally out of reach, and that record
was right about the content path and wrong about the route.
`cna_model_mesh_part_create` takes a vertex buffer, an index buffer and four counts — **all of them
the caller's own** — so a page that builds its own geometry can make a model mesh part with no
native content manager anywhere near it, and the instanced renderer draws over one. What still needs
a content manager is loading a `Model` out of XNB, and that decision is unchanged.

Most of this was **generated rather than typed**, from three facts and no judgement: the member's
signature in `CnaGraphicsExtensionBackend`, the route the Node-API bridge proves it against, and the
C declaration of that route — which is what decides whether a `number` argument is truncated to an
integer or passed as a float, because `size` is an `int32_t` in one route here and a `float` in the
next. Seventeen CNA structures cross the boundary and each marshaller is paired field by field
between the C declaration and the TypeScript snapshot, with the pairing required to be **total in
both directions**: a member with no field, or a field with no member, is an error rather than a
silently dropped value.

**How a slice this size is qualified.** The family oracles above prove particular families against
arithmetic. They cannot scale to nine hundred routes, and pretending otherwise would be the
dishonest part. So there is a second kind of evidence beside them: a **census** that constructs
every public engine class in a browser, reads every accessor on it, and writes and reads back every
settable one — 22 classes, 69 accessors, 19 setters. That is not a claim about what any shader
draws. It is a claim that every member marshals, and it is the only kind of claim that catches a
field read four bytes off or a structure whose `struct_size` was never written.

It earns its place: the census found four real defects on its first run, three of which the static
route-call verifier then found too. The fourth — a `StorageBuffer` size reaching CNA as a `Number` —
is why that verifier exists.

The census also records what CNA refuses and why. On the strong artifact **exactly three** classes
are refused, all with CNA's own `NOT_SUPPORTED`: `AutoExposure`, `StorageBuffer` and its typed form,
all of which need a compute stage WebGL 2.0 does not have. On the default artifact eighteen are
refused for the other reason — no `CNA_CNAEXT` — and four still construct, because `PbrEffect`,
`SkinnedPbrEffect`, `FrustumCuller` and `TransparentDrawList` are not behind that build option.

**And the chain, which is what makes the family usable.** A game applies several passes in order,
so `PostProcessChain` is the API a consumer actually reaches for, and its pass order is what a
single-pass test cannot see. Composing the rotation with itself is how that becomes provable: one
pass gives `(b,r,g)` and two give `(g,b,r)`, a third distinct permutation of this gradient. A chain
that ran one pass lands on the first; a chain that ran both and threw the intermediate away lands
on the first too; only a real ping-pong between two pooled targets lands on the second. `Clear`
takes the count back to zero, and `ResetTargets` drops the pool and draws the same picture again,
because the pool is a cache and not state the answer depends on.

`GpuTimingEnabled` is asked for and **refused** on this WebGL2 context -- SwiftShader has no
disjoint-timer query -- and CNA reports that through the getter rather than by throwing, so the
suite reads the value back and takes the branch it finds rather than asserting the one it wanted.

`AddOwned` is refused **by name**, and for an upstream reason rather than an effort one:
`cna_post_process_chain_add_owned_pass` releases the pass handle without decrementing
`RuntimeState::ownedGraphicsResourceCount`, so every later `cna_game_destroy` in the runtime refuses
(finding 1). In a page, a game that cannot be destroyed is a worse outcome than a refusal that says
so, and `Add` does everything the chain needs. When CNA repairs it this becomes two lines.

### The rest of the family, and CNA checking itself

The blit, the tonemapper, bloom, FXAA, chromatic aberration and film grain are bound beside the
colour grade -- each is a `PostProcessPass`, so the apply, the chain and the frame context already
serve them, and what each adds is its creation and its parameters.

The tonemapper is the one worth describing, because **CNA checks it against itself**. It ships
`TonemapPass.TonemapChannel(mode, value, exposure, gamma)`, a pure scalar of the same arithmetic
its shader does, so the browser compares a rendered texel to CNA's own answer for that texel --
two implementations of one specification reached by two different routes, rather than a picture
compared to a picture taken earlier. Every channel of every source texel, in two modes that must
also disagree with each other, or comparing each to its own scalar would prove only that the scalar
was consulted twice.

Bloom's bright pass is checked the same way, against a soft-knee curve restated from
`BloomPass.cpp` rather than pinned as five numbers: `knee = threshold/2`, contribution squared,
scaled by the value. The rest assert that they ran, that their output is not the blit's identity,
and that their parameters round-trip -- **including CNA's clamp of chromatic aberration to
`[0, 0.1]`**, which a test that only ever set an in-range value would never have found. Two
expectations in this area were written wrong and the browser caught both: that bright pass is not a
hard threshold, and 0.25 is not a legal aberration strength.

### Level of detail, bound whole

The one engine family here implemented **completely** rather than in a slice, because there is
nothing about it to slice: every route is arithmetic over thresholds -- no device, no resource,
nothing drawn -- so there is no capability question to ask and nothing a browser could do
differently from Node. Every answer is predicted rather than recognised:

```text
distance mode      the boundary is STRICT: a level covers distances below its threshold, so at
                   exactly 10 the group has already moved on. That is upper_bound on
                   `value < MaxDistance` in LodGroupEXT.cpp, and it is the reading this test
                   started with backwards.
past the last one  -1, which is CNA saying "draw nothing at this range" rather than clamping
hysteresis         settled at level 2 by distance 30, a step back to 24 stays -- inside the
                   5-unit margin -- and a step to 15 switches
screen space       radius / (distance * tan(fov/2)) * (height/2), agreeing to one part in 1e4,
                   halving with doubled distance, and the largest float at and behind the eye
```

Levels carry no `ModelMeshPart` in a browser, and CNA already treats that as a real state -- a
level that deliberately draws nothing -- separating it from an empty group through
`SelectIndex`. So a page gets the selection behaviour in full and only the payload is missing.

### What this device can be asked, and what that settles

A page decides what to reach for by asking, and until now it could not: `backend.Compute` was
absent, so `GraphicsDeviceCapabilities.Supports` failed with a message about the binding and the
only way to learn a context has no compute shaders was to build something that needed them and read
the exception. All nineteen identities and the three compute work-group limits are now pure queries
against the device CNA already has. Measured in headless Chromium on WebGL2:

```text
default artifact   16/19    strong artifact   17/19
on both:  ThreeD DepthStencilBuffer MultiSampleAntiAliasing MultipleRenderTargets
          AnisotropicFiltering WireFrame OcclusionQuery CustomEffects Texture3D
          MultiStreamVertexInput Instancing StencilBuffer AdditiveBlending
          FloatRenderTargets HalfFloatRenderTargets HalfFloatTextureLinearFiltering
only with -DCNA_EASYGL_COMPILED_EFFECTS=ON:  CompiledEffects
off on both:  ComputeShaders  IndirectDraw
```

Two things follow, and both are measurements rather than judgements. `CompiledEffects` is **the
only identity that moves** between the two artifacts, which confirms the compiled-effect capability
by a second route that never touches the `Effect` constructor. And `ComputeShaders` and
`IndirectDraw` are off on both and no CNA build option changes them, because WebGL 2.0 has no
compute stage and no indirect draw in its specification at all -- so every engine family that needs
either is **renderer-blocked** on this context rather than merely unbound, and the compute slice
that answers these questions deliberately dispatches nothing.

Everything else in the 603-member interface still refuses **by name** through
`CnaGraphicsExtensionBackendBase`. The object being present rather than absent is the point: a
route outside the slice names itself, and a route inside it gets CNA's own answer for the artifact
in front of it, `NOT_SUPPORTED` included.

### Shadows: the device was asked, and said yes

The most-used engine feature in a 3D game, and the one whose availability had to be *measured*
rather than judged. Both of CNA's shadow capabilities -- casting and sampling, which are separate
questions a renderer can answer differently -- are true on a WebGL2 context with an artifact built
`-DCNA_CNAEXT=ON`, so the rigid casting pass is bound and held to the same oracle the windowed
OPENGLES3 suite uses (`test/support/shadow-oracle.mjs`, shared by both).

The oracle knows two things CNA was never told together: where the occluder is in world space, and
the light view-projection the pass built from a light and a scene box. Multiplying one by the other
gives the texel each corner lands on and the depth it records, so a binding that transposed the
matrix, dropped a row, mixed up the axes or ignored the light direction moves the *predicted*
rectangle away from the rendered one instead of moving both together. Measured in headless Chromium:

```text
map                512 texels square, SurfaceFormat.Single, borrowed once
empty pass         every texel at the far plane -- low 1, high 1, occluded 0
occluder high      48960 texels, depth 0.625        occluder low  48960 texels, depth 0.875
                   same rectangle, to within 1.5 texels of the prediction on all four edges
                   and the 8-unit height gap is exactly what the projection's depth scale says
outside the pass   nothing reaches the map, so End really unbinds it
ordering           End without Begin, ApplyCaster outside a pass, and a second Begin are each
                   refused by CNA with a result code rather than by a managed guard
```

Before any of that, the transform is cross-checked: `Begin` built its matrix inside CNA, and the
product of the two pure maths routes -- which take the same light and box and touch no shadow map
-- has to equal it. Three CNA routes and one local arithmetic identity have to agree, and a `Begin`
that dropped the bounds cannot be rescued by the geometry checks, because those use CNA's own
reported matrix and would move with it.

The **skinned** caster is not bound, for an architectural reason rather than a capability one: it
takes a bone palette, and skinned meshes reach a game through a native content manager this package
deliberately does not have.

One more piece of the layer is reachable and worth naming, because it is the part of a family whose
other half is not: **the instancing stream's layout**. `InstancedRenderer` itself draws a
`ModelMeshPart`, and native model mesh parts arrive through a native content manager this package
deliberately does not have, so the renderer is out of reach in a browser for an architectural
reason rather than a capability one. Its two vertex declarations are not: they are pure computation
about the layer's own shaders, and a page building its own instance buffer has to describe it
*identically* to what the layer reads. Both are asserted against the declaration CNA's header
documents -- four `Vector4` elements at `TextureCoordinate` usage indices one to four filling a
64-byte stride, one `Color` at `Color` index one in four -- rather than against a recorded run.

`Texture3D` gains exactly the lifecycle of a volume LUT CNA hands out -- describe it, release it --
and nothing else. This backend creates no 3D texture and uploads to none, and `createTexture3D`
and the data transfers say so rather than guessing.

**The other four stock effects** refuse by name. `BasicEffect` is what draws untextured and
textured geometry, and each of the others needs its own dozen routes and its own evidence; a facade
that accepted them and set only the fields they happen to share would draw the wrong thing rather
than say it could not.

**A compiled effect is not one of those refusals, and used to be treated as one.** The Node windowed
suite draws with `CnaConformanceEffect.fxb` and asserts its texels, so the honest question is
whether a browser consumer can do the same. That is a property of the *artifact*, not of this
package: CNA builds the compiled-effect runtime into the EasyGL family -- `WEBGL2` included -- only
when `CNA_EASYGL_COMPILED_EFFECTS` is on, which is off by default because the runtime is a fetched
dependency those renderers do not otherwise need.

While `createEffectCompiled` was absent from this slice, that question could not be asked. The
binding declined first, with its own message about a slice it had not implemented, and a consumer
whose artifact *did* have the runtime would have been told the wrong thing. The route is now
resolved and the bytes go through, so what comes back is CNA's own answer for the artifact in front
of it. On the default artifact:

```text
cna_effect_create_compiled failed with CNA result 6: The active graphics renderer does not
support compiled XNA/FNA Effect Framework bytecode (GraphicsCapability::CompiledEffects is false).
```

which is the same result and the same sentence the Node HEADLESS backend gives for the same bytes.

**On an artifact built with `-DCNA_EASYGL_COMPILED_EFFECTS=ON`, the same bytes through the same
public constructor produce a working effect**, and the whole consumer scenario is available. This
is the same scenario `test/effect-reflection.integration.mjs` runs against windowed OPENGLES3 --
same fixture, same values, same techniques, same 8x8 target -- and the expectations are computed
from CNA's own shipped HLSL rather than from `GetValue*`, which answers from managed state and
would agree with its own setter whether or not a uniform ever moved.

`SecondTechnique/P1` is `return Tint * Weights[1];` and samples nothing:

| state | Tint | Weights[1] | predicted | measured on WebGL2 |
| --- | --- | --- | --- | --- |
| A | 0.8, 0.6, 0.4, 1.0 | 0.5 | 102, 76.5, 51, 127.5 | 102, 76, 51, 128 |
| B | 0.2, 1.0, 0.8, 0.6 | 0.5 | 25.5, 127.5, 102, 76.5 | 25, 128, 102, 76 |
| C | 0.2, 1.0, 0.8, 0.6 | 0.25 | 12.75, 63.75, 51, 38.25 | 13, 64, 51, 38 |

A to B moves only `Tint`; B to C only `Weights[1]`. `FirstTechnique/P0` is a different program over
identical parameter state -- it samples a white texel and scales by `Gain` and the `Lighting`
struct -- so its disagreement with P1 is what makes `CurrentTechnique` selection evidence rather
than an assumption, and `Lighting.Intensity` with `Lighting.Thresholds[0]` are a struct member and
a struct array element only the pixels could prove. The one-byte tolerance is the same one the
windowed suite uses, for the same reason: two rasterizers round a half differently, and every pair
of states above differs by tens.

Beside the pixels, the reflection itself: six parameters with their classes, types, row and column
counts, `Weights` as a two-element array, `Lighting` as a struct with members, both techniques by
name in declaration order -- and native write-through, read back through CNA rather than through
this package's getters. Fourteen planted defects die on it
(`tools/mutation-plans/compiled-effect-browser.json`).

### A defect this slice found in its own first test

The first version drew nothing at all — every texel the clear colour, in the browser *and* on Node.
The scene was wrong, not the backend: XNA culls counter-clockwise by default and the triangle was
wound that way. Running the identical code on the Node backend, which is long proven, is what
separated "my slice is broken" from "my triangle is inside out" in one step. It is the reason the
test now sets `RasterizerState.CullNone` and says why in a comment.
