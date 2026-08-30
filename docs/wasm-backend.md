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
ABI=0.20.0
WASM_ROUTES_REACHED=42
UNCAUGHT_PAGE_ERRORS=0
```

`npm run test:wasm-browser` serves `dist/` and the artifact over HTTP, drives an ordinary XNA `Game`
from `requestAnimationFrame`, and asserts the frame, update and draw counts, the texture the game
created, deterministic disposal and an empty page-error list. A page that merely *builds* is not
evidence of a runtime, so nothing here is claimed from a successful bundle.

This is the **first vertical slice**. Every boundary member outside it refuses by name through the
generated `CnaBackendBase` rather than pretending to work, so a consumer reaching past the slice
gets a diagnostic naming the member instead of a silent wrong answer. In the slice: ABI query,
initialization, game create/run-one-frame/exit/destroy, graphics-device-manager configuration and
device creation, renderer identity, `Clear`, `Texture2D` create/upload/read/destroy, `SpriteBatch`
begin/submit/end/destroy, keyboard and mouse snapshots.

## Building the artifact

The artifact is `cna_c_api.mjs` plus `cna_c_api.wasm`, from the `cna_c_api_wasm` target of an
Emscripten tree. Out of tree, and with two link settings the target does not set itself:

```sh
source ~/emsdk/emsdk_env.sh
emcmake cmake -S . -B cmake-build-tswasm -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCNA_BUILD_C_API=ON \
  -DCNA_SHARP_RUNTIME_ROOT=/path/to/sharp-runtimenext \
  -DCNA_GRAPHICS_RENDERER=WEBGL2 \
  -DCNA_BUILD_TESTS=ON -DCNA_BUILD_EXAMPLES=OFF \
  -DCNA_ENABLE_DRACO=OFF -DCNA_ENABLE_VIDEO=OFF \
  -DCMAKE_EXE_LINKER_FLAGS="-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2" \
  -DCMAKE_CXX_STANDARD_LIBRARIES="-sASYNCIFY=0" \
  -DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DCMAKE_C_COMPILER_LAUNCHER=ccache
cmake --build cmake-build-tswasm --target cna_c_api_wasm
```

Both extra settings exist because of measured upstream gaps, recorded below. `CMAKE_CXX_STANDARD_LIBRARIES`
is the placement that works: CMake puts `CMAKE_EXE_LINKER_FLAGS` *before* a target's own link
options, and `emcc` lets the last `-s` win, so an `-sASYNCIFY=0` in the linker flags would be
overridden by the `-sASYNCIFY=1` the target inherits.

## Upstream gaps this backend measured

### 1. `cna_c_api_wasm` does not pin the WebGL version its renderer needs

Without `-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2`, Emscripten negotiates a WebGL 1 context while
`EasyGLGraphicsBackend` asks SDL for GLES 3, its GLSL ES 3.00 shaders fail to compile
(`ERROR: 0:1: '' : unsupported shader version 300`), and the module aborts on the first draw.
`cnanext/docs/web-emscripten-graphics-limitations.md` already records this exact failure for a
different target, and `modules/graphics/examples/CMakeLists.txt` sets the pair for the demos --
`cna_c_api_wasm`, the artifact a binding is meant to consume, does not.

**Proposed upstream change:** give `cna_c_api_wasm` the same renderer-conditional
`MIN_WEBGL_VERSION`/`MAX_WEBGL_VERSION` link options the examples already carry.

### 2. `-sASYNCIFY=1` makes every route unrewindable, because every route takes a handle

`CNA::EmscriptenAbi` adds `-sASYNCIFY=1` to every Emscripten link. SDL3's
`Emscripten_GLES_SwapWindow` then calls `emscripten_sleep(0)` on each present
(`third_party/SDL/src/video/emscripten/SDL_emscriptenopengles.c:145`, guarded by
`emscripten_has_asyncify()`), which unwinds the JS-entered export.

Asyncify's rewind re-enters the bottom export of the call stack **with no arguments**. Under
`WASM_BIGINT` an `i64` parameter given `undefined` throws
`TypeError: Cannot convert undefined to a BigInt`, so the rewind fails and the frame is lost. Every
route in this ABI takes a `CNA_Handle`, which is `uint64_t`, so **no route can be driven from
JavaScript while Asyncify may unwind it**. Measured: with Asyncify on, 5 requested frames produced 3
updates and 3 unhandled rejections; with `-sASYNCIFY=0`, 5 frames produced 5 updates, 5 draws and no
errors.

**Proposed upstream change:** either link `cna_c_api_wasm` with `-sASYNCIFY=0`, or set
`SDL_HINT_EMSCRIPTEN_ASYNCIFY` to false inside the C API's platform initialisation. The first is
correct for a library whose consumer owns the event loop; the second keeps Asyncify for consumers
who want a blocking `cna_game_run`.

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
