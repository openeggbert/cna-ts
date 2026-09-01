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
WASM_BACKEND_ROUTES=247
MISSING_WASM_BACKEND_EXPORTS=0
UNCAUGHT_PAGE_ERRORS=0
```

Every one of those 247 routes is resolved when the backend is constructed, so a module missing any of
them fails at load rather than mid-frame; `npm run audit:cna-abi` checks the same list against the
artifact's loader before a browser is started.

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

**The engine layer is absent from the artifact**, not merely unbound. The WebAssembly build sets
`CNA_CNAEXT=OFF`, which compiles out `engine_layer.h`'s implementation and leaves the exported
symbols as `ExtensionUnavailable()` stubs. Measured in a browser on WebGL2:

```text
cna_instanced_renderer_ext_get_instance_stride → 6   (CNA_RESULT_NOT_SUPPORTED)
cna_instanced_renderer_ext_create              → 6
```

against `0` and a stride of `64` on the Node artifact. So the instanced renderer, LOD selection and
every post-process pass would answer `NOT_SUPPORTED` here however carefully they were bound — the
routes exist, the layer behind them does not. Binding them would offer a browser consumer a
capability that cannot work.

The unblocker is external and specific: build `cna_c_api_wasm` with `-DCNA_CNAEXT=ON`. That is a
change to the artifact a consumer builds, not to this package, which is why it is recorded here
rather than worked around.

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
of it. On the artifact this package qualifies against:

```text
cna_effect_create_compiled failed with CNA result 6: The active graphics renderer does not
support compiled XNA/FNA Effect Framework bytecode (GraphicsCapability::CompiledEffects is false).
```

which is the same result and the same sentence the Node HEADLESS backend gives for the same bytes.
`test/wasm-browser.mjs` asserts that refusal and takes the other branch -- reflecting the fixture's
six parameters and two techniques -- if an artifact ever answers differently, so the unblocker is
recorded as a build option rather than pinned as permanent behaviour. The unblocker is external and
specific: build `cna_c_api_wasm` with `-DCNA_EASYGL_COMPILED_EFFECTS=ON`.

### A defect this slice found in its own first test

The first version drew nothing at all — every texel the clear colour, in the browser *and* on Node.
The scene was wrong, not the backend: XNA culls counter-clockwise by default and the triangle was
wound that way. Running the identical code on the Node backend, which is long proven, is what
separated "my slice is broken" from "my triangle is inside out" in one step. It is the reason the
test now sets `RasterizerState.CullNone` and says why in a comment.
