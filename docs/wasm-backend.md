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
WASM_BACKEND_ROUTES=429
MISSING_WASM_BACKEND_EXPORTS=0
UNCAUGHT_PAGE_ERRORS=0
```

Every one of those 429 routes is resolved when the backend is constructed, so a module missing any of
them fails at load rather than mid-frame; `npm run audit:cna-abi` checks the same list against the
artifact's loader before a browser is started. The count is accounting, not the capability: what a
browser consumer can now do is the subject of the sections below.

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

Everything else in the 603-member interface still refuses **by name** through
`CnaGraphicsExtensionBackendBase`. The object being present rather than absent is the point: a
route outside the slice names itself, and a route inside it gets CNA's own answer for the artifact
in front of it, `NOT_SUPPORTED` included.

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
