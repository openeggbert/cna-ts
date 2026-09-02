# Upstream CNA findings

Defects and gaps this binding measured in `cnanext` and did not fix, because fixing them is the CNA
agent's work and editing that repository from here would be worse than reporting it. Each entry says
exactly what was run, what happened, and what a fix would look like — and each has a test in this
package that fails when the behaviour changes, so a repaired upstream is noticed rather than
silently outgrowing its workaround.

`docs/wasm-backend.md` carries the two Emscripten build-system gaps separately, because they are
build configuration rather than runtime behaviour. **Both of those are now fixed upstream and
verified here** — see items 3 and 4 below.

Re-checked on 2026-09-01, and the artifact is named separately from the source because they are not
the same revision. `cnanext` HEAD is `7712534d`. The libraries every measurement below was made
against were built earlier the same day and are therefore older, by a bound their timestamps give
rather than by a revision either of them records:

| artifact | built | carries at most | behind HEAD by |
| --- | --- | --- | --- |
| windowed OPENGLES3, `cmake-build-debug` (EasyGL, Mesa 25.0.7, OpenGL ES 3.2) | 15:55 | `c195fe8ce` | `7712534d` |
| HEADLESS, `cmake-build-tsnext` | 12:51 | `e5ae0820e` | `c195fe8ce`, `7712534d` |

Both of those commits are `modules/net` and `net_sessions.h` only -- no graphics, audio, effect,
content or renderer file between them -- so no finding below depends on the gap. It is stated rather
than papered over because the two are genuinely different revisions and a later session should not
have to re-derive that.

**Where "under `xvfb-run`" below actually ran.** Until 2026-09-01 it did not run under Xvfb at all.
`xvfb-run` sets `DISPLAY` and leaves `WAYLAND_DISPLAY` alone, and SDL3 prefers Wayland whenever that
is set, so every windowed measurement went to a real window on this host's desktop and therefore to
the **AMD Radeon 780M (radeonsi)**. The suites now pin SDL to `x11`, which reaches Xvfb and Mesa's
**llvmpipe**. Both are legitimate OpenGL ES 3.2 implementations and the findings below reproduce on
whichever one is behind the window; two *tests* had pinned the AMD part's float-to-unorm8 rounding
as exact and were corrected to a one-byte tolerance. Where a finding's numbers could depend on the
rasterizer, it is the AMD part that produced them. Every detector was re-run and every one still fires: windowed 25,
native 52, extensions 10, CNB 39, model-part 9, content-survey 8, input-devices 3, media-library 6,
avatars 8, sprite-font-oracle 5, compiled effects 10, browser 13 -- all passing, which for a
detector means the behaviour it pins has not changed.

**Re-checked on 2026-09-02.** `cnanext` HEAD is `9ca0d4188`, one commit past the `5347b52ea` the
items below were measured against, and that commit is `fix(SAMPLE-148): accept const SpriteBatch
states` — `SpriteBatch.hpp`, `SpriteBatch.cpp` and its tests, nothing else. No graphics-renderer,
game-teardown, gamer-services or build-system file lies between the two, so items 29, 30 and 32 and
the Emscripten video rule are unchanged by inspection rather than by re-running their reproducers.
The video rule was read rather than assumed: `modules/CMakeLists.txt:20` still puts `EMSCRIPTEN` in
the set that makes `_cna_ffmpeg_platform_supported` false, and `CNA_ENABLE_VIDEO=ON` there is still
a `FATAL_ERROR`. Finding 29 was re-checked by enumerating every `*_test_backend_ext` route CNA has —
sensors, vibration, message box, file dialog, system tray and camera — and there is still none for a
signed-in gamer.

Items 34 and 35 are new, and both came out of the same session: the first browser run that put a
tone of a known frequency through CNA's mixer and asked where it landed.

Items 31, 32 and 33 are new. Items 2 and 11 gained WebAssembly measurements: four more of CNA's own notices
arrive on `stderr` with no level and one of them fires on a clean sine tone, and the dangling
camera provider of item 11 turns out to be reachable through `cna_camera_get_count_ext` as well as
through `cna_camera_create` — which under WebAssembly traps by name rather than taking a signal.

Item 30 is new, and is the first finding in this document measured on the **WEBGL2** renderer
rather than on OPENGLES3 or HEADLESS. It was found by asking why a depth/normal prepass that
reported itself supported, began, drew and ended without a single failure had written nothing at
all, and the answer turned out to have nothing to do with the prepass.

Item 28 is new, found by asking the two audio capability rows which backend they had been measured
on -- both said HEADLESS, whose audio platform is `NULL`. Item 29 is new, and is a testability
request rather than a defect. Items 5 and 6 are new,
found while projecting the sensor families; item 7 is new, found while widening the windowed
qualification to three renderers; items 8 and 9 are new, found while projecting the engine
layer's compute path, item 10 while projecting its clustered lighting, item 11 -- a
segmentation fault -- while projecting camera frame capture, and item 12 while projecting the
particle draw. Items 13 and 14 are new, found while projecting the depth/normal prepass and the
decal projector that reads it, item 15 while projecting the atmosphere, item 16 while
projecting the cascaded, spot and cube shadow passes, items 17 and 18 while projecting the
post-process passes, item 19 while projecting the physically-based materials, item 20 while
projecting the culling families, and items 21 and 22 while projecting the transparency
families and the custom shader effects they need, and items 23 and 24 while projecting the
shadow-receiver contract and the last of the engine layer.

**Items 7 and 9 are now fixed upstream**, in `48ab0de7f`, and verified here against the rebuilt
library. Both were found by this package, both were *asserted* rather than worked around, and both
detectors fired the moment the repair landed. Four of the twenty-four findings are now closed.

## 1. `cna_post_process_chain_add_owned_pass` leaks the owned-resource count

**Status: still present** in `cnanext` 599d14e5. Re-read from source at that revision:
`cna_post_process_chain_add_owned_pass` still performs the `Release` with no
`RemoveOwnedGraphicsResourceFor` beside it.

**Measured:** CNA ABI 0.20.0, `cnanext` 17b5a90a, HEADLESS platform/renderer, `CNA_CNAEXT=ON`;
re-read unchanged at 0.21.0.

Handing a post-process pass to a chain makes the game undestroyable for the rest of the process:

```text
cna_post_process_chain_create        -> SUCCESS
cna_fxaa_pass_create                 -> SUCCESS
cna_post_process_chain_add_owned_pass-> SUCCESS   (handle consumed, as documented)
cna_post_process_chain_clear         -> SUCCESS
cna_post_process_chain_destroy       -> SUCCESS
cna_game_destroy                     -> CNA_RESULT_INVALID_STATE
                                        "All owned C child resources must be destroyed before the game."
```

**Cause**, read out of `modules/c-api/src/CnaCApiEngineLayer.cpp`. `cna_post_process_pass_destroy`
does two things when it releases a pass:

```c
const CNA_Result releaseResult = GetRuntimeHandles().Release(passHandle);
...
RemoveOwnedGraphicsResourceFor(parentGame);
```

`cna_post_process_chain_add_owned_pass` does only the first:

```c
c->ownedPasses.push_back(passResource->value);
c->value->addPass(passResource->value.get());
const CNA_Result releaseResult = GetRuntimeHandles().Release(pass);
```

So `RuntimeState::ownedGraphicsResourceCount` is incremented by `cna_fxaa_pass_create` and never
decremented. `cna_game_destroy` consults it through `HasOwnedGraphicsResources()` and refuses. The
count is per-runtime, so one transfer poisons every later game in the process, not only the one that
owned the pass.

**Proposed fix:** call `RemoveOwnedGraphicsResourceFor(passResource->parentGame)` after the
successful `Release` in `add_owned_pass`, and restore it on the rollback path beside the existing
`ownedPasses.pop_back()`.

**Consequence here:** `PostProcessChain.AddOwned` is projected — the contract it implements is the
right one and the managed half of the transfer is correct — but the documentation says to prefer
`Add` until this is repaired. `test/post-process-owned-pass.probe.mjs` runs the transfer in its own
process, because a leaked counter would otherwise fail every later test in the integration suite,
and `native-cna.integration.mjs` asserts the defect as measured. **When CNA fixes this, that
assertion fails**, which is what it is for.

## 2. The SDL3 mixer prints its negotiated format to stderr on the success path

**Status: still present** in `cnanext` 599d14e5. `AudioMixer.cpp:197` is unchanged and still an
unconditional `std::cerr` on the success path, so `test/wasm-browser.mjs` still carries the
special case.

**Measured:** CNA ABI 0.20.0, Emscripten build, `CNA_AUDIO_PLATFORM=SDL3`, headless Chromium;
re-measured unchanged at 0.21.0.

`AudioMixer.cpp:197` writes one line to `std::cerr` unconditionally, *after* `MIX_CreateMixer` has
succeeded:

```text
[AudioMixer] Requested format=0x0 channels=2 freq=44100; application format=0x8010 channels=2 freq=44100
```

On a desktop that is a harmless diagnostic. In a browser it is not quite: Emscripten routes stderr
to `console.error`, so every page that opens audio reports a console error on a path where nothing
went wrong, and any consumer collecting page errors — a crash reporter, a CI gate, this package's
own browser harness — has to special-case it.

**Proposed fix:** route it through CNA's logger at INFO, as the rest of the runtime's notices are,
so it carries a level a consumer can filter on.

**Consequence here:** `test/wasm-browser.mjs` classifies that exact line out by shape rather than
widening its "not an error" rule, and still fails on any other console error. When CNA routes it
through the logger the existing `[INFO][...]` rule covers it and the special case can go.

**Four more of the same shape, found while binding XACT and measured at ABI 0.21.0.** Every one is
written straight to `stderr` with no level, so a browser consumer collecting page errors sees them
as errors:

```text
[AudioEngine] Loaded XGS: /xact/cna-ts.xgs (2 categories, 2 variables)
[WaveBank] Loaded XWB: /xact/cna-ts.xwb bank="cna-ts" entries=4
[SoundBank] Loaded XSB: /xact/cna-ts.xsb cues=4 sounds=4
[SoundEffect] Warning: raw PCM buffer has implausibly high byte-level entropy for real 16-bit audio ...
```

The three loader lines are success notices and belong at INFO with the rest. The fourth is
different and worth its own note: `SoundEffect.cpp:120` flags raw PCM16 whose byte histogram
exceeds **7.9 bits of entropy** as probably not being PCM at all, and a clean high-amplitude sine
tone crosses that line, because the low byte of a smooth loud sinusoid is very nearly uniform.
Measured on this package's own synthesised XACT tones at 44100 Hz, amplitude 28000, 0.25 s:

| tone | byte entropy |
| --- | ---: |
| 261.6 Hz | 7.9071 |
| 329.6 Hz | 7.9036 |
| 523.3 Hz | 7.9026 |
| 392.0 Hz | 7.7146 |

Three of the four exceed the threshold. The heuristic's own comment says it is "deliberately
conservative to avoid flagging genuinely loud/noisy game audio", and a pure tone is the case it did
not consider. The fixture was deliberately *not* made quieter to dodge it: shaping test content to
avoid a diagnostic hides the observation.

**Proposed fix:** route all four through CNA's logger — the three notices at INFO and the advisory
at WARN — and, for the advisory, consider whether a periodic signal should be excluded before the
entropy test, since a compressed bitstream is aperiodic and a tone is not.

**Consequence here:** `test/support/browser-harness.mjs` classifies all four out by exact shape,
beside the mixer notice, and still fails on any other console error.

## 3. `cna_c_api_wasm` did not pin its renderer's WebGL version — FIXED in 0.21.0

**Fixed and independently verified.** `cnanext` 599d14e5 adds
`cna_apply_emscripten_renderer_link_contract` in `cmake/RendererSelection.cmake`, which derives
`MIN_WEBGL_VERSION`/`MAX_WEBGL_VERSION` from `CNA_GRAPHICS_RENDERER`, and applies it to
`cna_c_api_wasm`.

Verified rather than accepted from the commit: the `cna_c_api_wasm` target was rebuilt **stock**,
with this package's `CMAKE_EXE_LINKER_FLAGS` override removed, and the resulting artifact was
measured. Its generated JavaScript requests `majorVersion:2` exactly once and `majorVersion:1` zero
times, and all seven browser tests pass on it, including the render-target readback whose GLSL ES
3.00 shaders are what a WebGL 1 context cannot compile.

## 4. `-sASYNCIFY=1` was added to every Emscripten link — FIXED in 0.21.0

**Fixed and independently verified.** `cnanext` 599d14e5 sets `CNA_EMSCRIPTEN_ASYNCIFY OFF` on
`cna_c_api_wasm` and states `-sASYNCIFY=0` in the target's own `target_link_options`, so the
project-wide support pass in `cmake/BuildPerformance.cmake` cannot append a later `-sASYNCIFY=1`
that wins by link order. CNA also added `CApi_WasmLinkContract`, a CMake test that greps the linked
JavaScript instead of trusting option order — the same shape of check this package now makes.

Verified rather than accepted from the commit: the stock artifact, built with this package's
`CMAKE_CXX_STANDARD_LIBRARIES` override removed, contains no `Asyncify` runtime object, and the
browser suite runs 600 real frames with zero uncaught page errors. Under the old defect that same
run lost frames to `TypeError: Cannot convert undefined to a BigInt`.

**Consequence here:** both binding-specific link overrides are removed;
`BINDING_LINK_OVERRIDES=0`. `npm run audit:cna-abi` now measures both properties out of the
artifact it consumes and reports `WASM_ARTIFACT_LINK_CONTRACT`, failing the run on either
regression. `test/wasm-artifact-link-contract.test.mjs` plants each defect in a copy of the real
artifact and proves the audit rejects it, so the gate is known to be able to fail.

## 5. A motion sensor's `IsDataValid` and `get_current_value` disagree after its backend is withdrawn

**Measured:** CNA ABI 0.21.0, `cnanext` 599d14e5, HEADLESS platform, through
`cna_motion_set_test_backend_ext`.

Install a synthetic motion backend, start it, inject a reading, stop it, then withdraw the backend:

```text
cna_motion_set_test_backend_ext(installed=1, supported=1)  -> SUCCESS
cna_motion_start                                           -> SUCCESS
cna_motion_inject_synthetic_update_ext                     -> SUCCESS
cna_motion_stop                                            -> SUCCESS
cna_motion_get_state                                       -> 5   (Disabled)
cna_motion_get_is_data_valid                               -> CNA_TRUE
cna_motion_set_test_backend_ext(installed=0, supported=0)  -> SUCCESS
cna_motion_get_state                                       -> 5   (Disabled)
cna_motion_get_is_data_valid                               -> CNA_TRUE      <-- still yes
cna_motion_get_current_value                               -> CNA_RESULT_NOT_SUPPORTED
                                        "The sensor is not supported on this device."
```

`IsDataValid` is the question a caller asks *before* reading a value — it exists precisely so that
reading one never has to be guarded by a try. After the backend is withdrawn it keeps answering
yes while the read refuses, so a caller that trusted it is told there is a reading and then denied
it. Note the state stays `Disabled` rather than returning to `NotSupported`, which is the other
half of the same thing: nothing in the sensor's reported state reflects that its source is gone.

**Proposed fix:** clear the retained reading when a backend is withdrawn, so `IsDataValid` answers
false, and return the state to `NotSupported` when support itself is withdrawn.

**Consequence here:** `test/native-cna.integration.mjs` asserts all three values as measured, so a
repaired upstream fails that assertion, which is what it is for. `Motion.CurrentValue` checks
`IsDataValid` first — as XNA's contract expects — so on this path a consumer gets CNA's own
`NOT_SUPPORTED` message rather than the managed `InvalidOperationException`. That is the honest
outcome and it is not worked around here.

## 6. The gyroscope has no synthetic test backend, while the compass and motion sensor do

**Measured:** CNA ABI 0.21.0, `cnanext` 599d14e5, HEADLESS platform.

`sensors.h` gives the compass `cna_compass_set_test_backend_ext(sensor, installed, supported)` and
the motion sensor `cna_motion_set_test_backend_ext(sensor, installed, supported, north_referenced)`.
Both install a synthetic source, so `Start` succeeds and an injected reading becomes readable —
which is what makes those two families' data paths testable on a machine with no hardware.

The gyroscope has only `cna_gyroscope_set_supported_for_tests_ext(sensor, supported)`, which flips
the support answer without installing anything behind it:

```text
cna_gyroscope_set_supported_for_tests_ext(1)     -> SUCCESS
cna_gyroscope_get_state                          -> 0   (NotSupported, unchanged)
cna_gyroscope_start                              -> CNA_RESULT_INVALID_STATE
              "Failed to start gyroscope data acquisition: selected platform has no sensor service"
cna_gyroscope_inject_synthetic_update_ext        -> SUCCESS   (accepted, but nothing reads it)
cna_gyroscope_get_is_data_valid                  -> CNA_FALSE
```

So the gyroscope's reading path cannot be exercised on any platform without a real sensor service,
while its two siblings can. That is an asymmetry in the test-hook surface rather than a runtime
defect, but it is the difference between one family being provable on a build machine and another
not.

**Proposed change:** give the gyroscope a `cna_gyroscope_set_test_backend_ext` matching the compass's
shape, so all three families are testable the same way.

**Consequence here:** the compass and motion data paths are verified end to end with real values;
the gyroscope's is not, and `test/native-cna.integration.mjs` asserts exactly that -- the support
override alone leaves the state `NotSupported`, `Start` is refused, the injection is accepted and
no valid reading appears. If CNA adds the backend, those assertions fail and the coverage can grow.

## 7. OPENGLES3 render-target readback returned zeros — FIXED in 48ab0de7f

**Measured:** CNA ABI 0.21.0, `CNA_GRAPHICS_RENDERER=OPENGLES3`, `CNA_PLATFORM=SDL3`, under Xvfb
with Mesa 25.0.7 (OpenGL ES 3.2). This is the renderer whose exact-texel readback was this
package's first windowed qualification, and it no longer produces one.

Every render-target readback path answers zero, while an ordinary texture readback on the same
device answers correctly:

```text
                        OPENGLES3      SOFTWARE / SDL_RENDERER
texture SetData/GetData  ff0000ff ...   ff0000ff ...            (correct on all three)
render target, unbound   00000000       ff38220c
render target, bound     00000000       ff38220c
with Depth24             00000000       ff38220c
PreserveContents         00000000       ff38220c
64x64 instead of 4x4     00000000       ff38220c
```

`ff38220c` is `Color(12, 34, 56, 255)` as XNA packs it, which is what `Clear` was given. So this is
specific to reading a render target, not to reading back at all, and it does not depend on the
binding state, the depth format, the usage flag or the size.

**Likely cause, stated as a hypothesis rather than a bisection.** `EasyGLRenderer::RestoreBinding`
changed in 599d14e5 to stop restoring the renderer's own context at a lease boundary:

```cpp
-            if (binding.context != nullptr)
+            if (binding.context != nullptr && binding.context != context_)
             {
                 service_.MakeCurrent(binding.window, binding.context);
             }
```

The reason given is sound for the threaded content case it fixes. But it also means that after any
lease taken on the renderer's own context, that context is no longer current — and a subsequent
`glReadPixels` against the render target's framebuffer would then read from no bound framebuffer,
which is exactly a field of zeros. The library measured here was built at 03:52 on 2026-08-31, the
same minute as that commit.

This was not confirmed by bisection: `cmake-build-debug` is another session's build directory, its
exact source revision cannot be recovered from the artifact, and building a second OPENGLES3 tree
or checking out an earlier revision would mean modifying a dependency this session must not touch.
The mechanism and the timing are offered as the lead; the measurement above is the fact.

**Fixed, and the hypothesis was right.** CNA repaired it in `48ab0de7f`, *"fix(CABI-46): separate
frame context handoff from operation leases"* — which touches `EasyGLRenderer.cpp` and
`GraphicsDevice.cpp`, the two files the lead above named. Verified independently here rather than
taken on the commit message: `test/windowed-renderer.integration.mjs` asserted the zeros rather
than skipping the check, and on the rebuilt library that assertion **failed** with all sixteen
texels reading `ff38220c` — `Color(12, 34, 56, 255)`, exactly what `Clear` was given. The test now
asserts the correct texels on all three windowed renderers.

That is the whole point of asserting a defect instead of working around it: nobody had to remember
to come back and look.

**Proposed fix:** re-acquire the renderer's own context before a readback, or restore it at the
lease boundary for the non-threaded path while keeping the release the threaded path needs.

**Consequence here:** `test/windowed-renderer.integration.mjs` now runs against every windowed
renderer it is pointed at and **asserts this defect as measured** for OPENGLES3 — so the assertion
fails when it is repaired, which is what it is for — while asserting the exact texels on
SDL_RENDERER and SOFTWARE, which both produce them. The windowed pixel qualification therefore
still exists; it has moved to the two renderers that currently earn it.

## 8. `cna_compute_shader_create` cannot behave as its own header documents

**Measured:** CNA ABI 0.21.0, revision 599d14e5, `CNA_GRAPHICS_RENDERER=OPENGLES3` under Xvfb.

`engine_layer.h` documents creation as succeeding for source that does not compile, so that a
caller can read the compiler's log:

> Creation succeeds even when the source does not compile: ask `cna_compute_shader_is_valid` and
> read `cna_compute_shader_copy_compile_error`. That mirrors the canonical class, which records
> the failure rather than throwing, because a renderer without compute is a documented boundary
> rather than a defect.

The canonical class does throw. `modules/graphics-ext/src/ComputeShader.cpp:35`:

```cpp
        if (!renderer_->IsValid())
        {
            compileError_ = renderer_->GetCompileError();
            throw std::runtime_error("CNA::Graphics::ComputeShader: the program did not compile: "
                                     + compileError_);
        }
```

`cna_compute_shader_create` constructs that class inside `CallWithExceptionBarrier`, so the throw
becomes `CNA_RESULT_INTERNAL` and `*out_shader` is left invalid. Measured with a shader containing
`void main() { this is not glsl }`:

```text
create -> 12 (INTERNAL), out_shader = 0
the compile log is unreachable: no handle was produced
```

The consequence is that `cna_compute_shader_is_valid` can never answer `false` and
`cna_compute_shader_copy_compile_error` can never return a non-empty log — the two routes exist
only to describe a case that no reachable handle can be in. A caller that follows the header gets
a refusal it was told not to expect; one that follows the implementation never uses either route.

**Not a blocker.** A compile failure is still reported, with the compiler's log in the exception
message, and CNA's own `ComputeTest.ABrokenShaderThrowsWithItsCompilerLog` asserts exactly the
throwing behaviour — so the header is the part that is out of date, not the code. Either half could
be made to match the other; which one is upstream's call.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` asserts the behaviour as measured
(`created: false`, `cnaResult: 12`) with a message naming this finding, so the day the header and
the implementation agree, that assertion fails rather than the difference going unnoticed.
`ComputeShader.IsValid` and `ComputeShader.CompileError` are projected regardless, because they are
the documented contract.

## 9. OPENGLES3 compute work-group limits went to zero at the first draw — FIXED in 48ab0de7f

**Measured:** CNA ABI 0.21.0, revision 599d14e5, `CNA_GRAPHICS_RENDERER=OPENGLES3`, Mesa 25.0.7
(OpenGL ES 3.2), under Xvfb. All three `_ext` limit routes, read repeatedly on one device:

```text
                                    supports(COMPUTE)   sizeX/invocations, three reads
1. fresh device                     true                1024/1024  1024/1024  1024/1024
2. immediately again                true                1024/1024  1024/1024  1024/1024
3. after one device.Clear()         true                   0/0        0/0        0/0
4. again, no operation in between   true                   0/0        0/0        0/0
5. while a render target is bound   true                   0/0        0/0        0/0
6. unbound again                    true                   0/0        0/0        0/0
7. render target disposed           true                   0/0        0/0        0/0
```

One `Clear` is enough, and the values never come back for the life of the device.

What makes this a defect rather than a boundary is that everything around it keeps working.
`cna_graphics_device_supports_capability(CNA_GRAPHICS_CAPABILITY_COMPUTE_SHADERS)` keeps answering
`true`, and compute keeps producing exact results: a 64-element dispatch measured immediately after
the zeroed read still computes `values[i] * uScale + uOffset + i` correctly for every element. So
the device reports that it supports compute, computes correctly, and simultaneously reports that
its maximum work-group size is zero — which no legal dispatch could satisfy.

CNA's own `ComputeTest.TheCapabilityAndTheLimitsAgreeWithEachOther` checks exactly this agreement:

> a device that claims compute must be able to say how large a dispatch it takes, and one that does
> not must report zero rather than a plausible-looking number

It passes on this renderer, because the test's fixture is a bare `GraphicsDevice` that never draws
before asking. That is why the disagreement is invisible upstream.

The zeros are the correct answer on a renderer with no compute at all — HEADLESS reports
`[[0,0],[0,0],[0,0]]` and `supports(COMPUTE) == false`, which agree — so the defect is specifically
the combination of `true` support with zero limits, and only after a draw.

**Relationship to finding 7.** Both are OPENGLES3, both are a GL read returning zeros where the
renderer's own context ought to be current, and both appeared at the same revision. They are
recorded separately because only one mechanism is hypothesised, and this one has a sharper trigger
that a bisection could use: the transition happens at the first draw, on a device that is otherwise
fully working.

**Fixed by the same commit as item 7**, `48ab0de7f`. The two were one defect: a GL query and a
`glReadPixels` both answering as though no context were current, after a lease boundary stopped
restoring the renderer's own. On the rebuilt library the limits read `2147483646 / 1024 / 1024`
after a `Clear` — the same values as before it.

**Detector in cna-ts:** the test read the limits before anything drew — the only point at which
they were meaningful — and asserted the zeros after one `Clear`, together with the capability query
still answering `true`. Both halves had to change together for that assertion to pass again, which
is exactly what happened. It now asserts the agreement itself: the limits after a draw equal the
limits before it, on both sides, which is the property CNA's own
`ComputeTest.TheCapabilityAndTheLimitsAgreeWithEachOther` checks and could not have caught, because
its fixture never draws first.

## 10. Four clustered-lighting creates document a game handle and require a device handle

**Measured:** CNA ABI 0.21.0, revision 599d14e5, HEADLESS. Four routes in `engine_layer.h` declare
their first parameter as `CNA_Handle game` and document it as "The owning game":

```c
CNA_C_API CNA_Result cna_clustered_light_set_create(CNA_Handle game, ...);
CNA_C_API CNA_Result cna_clustered_light_grid_create(CNA_Handle game, ...);
CNA_C_API CNA_Result cna_clustered_light_assignment_create(CNA_Handle game, ...);
CNA_C_API CNA_Result cna_clustered_shadow_policy_create(CNA_Handle game, ...);
```

The grid's handle type reinforces it: *"A pure CPU object; it is parented to a game only so its
lifetime is accounted for."* But each implementation calls
`GetBorrowedGraphicsDevice(gameHandle, &graphicsDevice)`, so a real game handle is refused:

```text
route                                    with the GAME handle   with the DEVICE handle
cna_clustered_light_set_create           INVALID_HANDLE (2)     SUCCESS
cna_clustered_light_assignment_create    INVALID_HANDLE (2)     SUCCESS
cna_clustered_light_grid_create          INVALID_HANDLE (2)     SUCCESS
cna_clustered_shadow_policy_create       INVALID_HANDLE (2)     SUCCESS
cna_gpu_timer_create (documented device) INVALID_HANDLE (2)     SUCCESS
```

The last row is the control: a route whose header correctly says "graphics device" behaves
identically. So the *behaviour* is uniform across the engine layer and it is the documentation of
those four that is wrong — which is the worse way round, because a caller who reads the header gets
`INVALID_HANDLE` with nothing to suggest that the parameter name is the problem.

**Cost of the difference.** These are the only routes in the family that a consumer reaches first,
so the whole clustered-lighting API is unreachable until someone guesses. A one-word change in four
`@param` lines fixes it; the alternative — accepting a game handle and resolving the device from it
— would match the documentation instead, and would also be consistent with `parented to a game`.

**Detector in cna-ts:** `ClusteredLightSet`, `ClusterGrid`, `ClusteredLightAssignment` and
`ClusteredShadowPolicy` all take a `GraphicsDevice`, because that is what works, and each says so in
its own documentation. `test/native-cna.integration.mjs` constructs all four from a live device, so
if CNA ever switches to accepting a game handle *instead*, that test fails rather than the
difference passing unnoticed.

## 11. Destroying a test-backend camera leaves a dangling platform override, and the next real camera dereferences it

**Measured:** CNA ABI 0.21.0, revision 599d14e5, HEADLESS. This one is a segmentation fault, and
it reproduces in plain C with no binding involved:

```text
sequence   result
r          SURVIVED     (create platform camera, destroy)
t          SURVIVED     (create test-backend camera, destroy)
rr         SURVIVED
tt         SURVIVED
rt         SURVIVED     (platform then test)
tr         *** SIGSEGV ***  (test then platform)
rrr        SURVIVED
```

Two calls are enough: `cna_camera_create_with_test_backend_ext`, `cna_camera_destroy`,
`cna_camera_create`. Backtrace, resolved with `addr2line`:

```text
CNA::Devices::Camera::Camera()                  modules/devices-ext/src/Camera.cpp:68
std::make_unique<CNA::Devices::Camera>()        unique_ptr.h:1077
cna_camera_create::{lambda()#1}::operator()()   modules/c-api/src/CnaCApiDevices.cpp:2068
CNA::C::Detail::CallWithExceptionBarrier<...>
cna_camera_create
```

`Camera.cpp:68` is the first dereference of the provider:

```cpp
    Camera::Camera()
    {
        CNA::Platform::IPlatformCameraProvider* provider =
            CNA::Platform::GetCurrentPlatform().GetCamera();
        if (provider == nullptr) { return; }
        const std::vector<CNA::Platform::PlatformCameraInfo> cameras = provider->GetCameras();
```

The null guard passes, because the pointer is not null — it is freed. `CnaCApiDevices.cpp` installs
the test provider as a **process-wide** override holding a raw pointer into the camera resource:

```cpp
        resource->testService = std::make_unique<TestCameraProvider>(resource->testState);
        CNA::C::Detail::GetPlatformOverride().SetCamera(resource->testService.get());
        resource->value = std::make_unique<Camera>();
```

and `cna_camera_destroy` releases that resource — freeing `testService` — without ever clearing
the override. The only `SetCamera(nullptr)` in the C ABI is in `CnaCApiPlatformOverride.cpp`, on a
path a destroy does not reach. So the next `cna_camera_create` reads a dangling
`IPlatformCameraProvider*` and calls a virtual function through it.

**Why it matters more than the sequence suggests.** The test backend exists so that a host with no
camera can exercise the acquisition path, which is exactly what this package uses it for — and the
natural shape of such a test is "check the real device reports absence, then inject a frame and
check it arrives". That order is the crashing one. A consumer writing the obvious test finds a
segfault with no diagnostic.

**A fix is small.** Clearing the override when the resource that owns the provider is released, or
giving the override shared ownership of it, removes the dangling pointer. The scope is process-wide
either way, so a second live test camera would still replace the first's provider — worth deciding
deliberately rather than by lifetime accident.

**Detector in cna-ts:** `test/native-cna.integration.mjs` runs the crashing sequence in a child
process through `test/fixtures/camera-test-backend-then-platform.mjs` and asserts that the child
dies with `SIGSEGV`. The child prints `SURVIVED` if CNA is repaired, and the assertion then fails
and says so. Every probe in this package that opens the platform camera runs before the first
test-backend one, and `CnaCamera.OpenForTests` documents the hazard on itself.

**Also reproduced on WebAssembly, through a shorter sequence and with a louder failure.** Measured
on `cmake-build-tswasm-fx` built `CNA_DEVICES=ON`, ABI 0.21.0, headless Chromium, in plain C calls
with no binding involved:

```text
cna_camera_get_is_supported_ext      0     (before any camera)
cna_camera_get_count_ext             0
cna_camera_create_with_test_backend_ext  0
cna_camera_get_count_ext             0     (while the test camera is alive)
cna_camera_destroy                   0
cna_camera_get_is_supported_ext      0     (still fine: it reads a capability, not the provider)
cna_camera_get_count_ext             *** RuntimeError: table index is out of bounds ***
```

Two things this adds. First, `cna_camera_create` is not the only route that dereferences the freed
provider — `cna_camera_get_count_ext` reaches `Camera::getAvailableCamerasProperty()`, which calls
`provider->GetCameras()` through the same dangling pointer, so merely *enumerating* cameras after a
test camera has been destroyed is enough. Second, the failure mode differs by target and the
WebAssembly one is the better diagnostic: a virtual call through freed memory lands on a function
index outside the module's table and traps immediately with a named error, where the native build
takes a signal with nothing to say. `cna_camera_get_is_supported_ext` keeps working throughout,
which is what localises the fault to the provider rather than to the platform.

`test/wasm-browser-non-engine.mjs` asserts the trap, so a repaired CNA fails that assertion and
says which one. Every other device-layer route in that page runs *before* the camera for the same
reason the native suite orders its probes that way.

## 12. Soft particles never fade: the depth input reaches CNA and changes nothing it draws

`cna_particle_system_set_depth_input_ext` supplies the prepass depth image particles fade against,
and `cna_particle_system_set_softness_ext` says over what distance. Both are accepted, and the
softness round-trips through its getter. The drawn picture is unaffected by either.

Measured on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, in one process, drawing
eight particles of size 4 standing on the origin into a 64×64 `Color` render target cleared to
(12, 34, 56):

```text
                                  painted texels   colour
CPU draw path (ForceSimulationOnCpu)     169        0xff0000ff
GPU draw path                            144        0xff0000ff
GPU + softness 50, depth image all 0     144        0xff0000ff   <- expected: nothing painted
GPU + softness 50, depth image all 255   144        0xff0000ff
GPU + depth input cleared                144        0xff0000ff
```

The GPU draw path is genuinely the one running: it paints 144 texels where the CPU billboard path
paints 169, so this is not a silent fallback to the path that has no fade. `getSoftnessEXT` reads
back the 50 that was set, and the far plane is 100.

What the shader says should happen, from `modules/graphics-ext/src/ParticleSystem.cpp`:

```glsl
    if (uHasDepth > 0.5 && uSoftness > 0.0) {
        vec2 uv = gl_FragCoord.xy / max(uViewport, vec2(1.0));
        float behind = cnaDecodeLinearDepth(texture(uSceneDepth, uv)) * uDepthFarPlane;
        colour.a *= clamp((behind - vViewDepth) / uSoftness, 0.0, 1.0);
    }
```

With a depth image of zeros, `behind` is 0 and the particle sits about 20 units in front of the
camera, so the clamp is 0 and every particle fragment should end up fully transparent. Instead the
image is byte-identical to the one drawn with no depth input at all — the same 144 texels at full
alpha — which means the branch is not being taken. `fading` is computed as
`sceneDepth_ != nullptr && depthFarPlane_ > 0.0f && softness_ > 0.0f`, and all three hold here.

Both extremes of the depth image were tried, in `Color` and in `Single` render-target form, and a
plain `Color` `Texture2D` filled with `SetData`. None of them changes a texel. A `Single`-format
`Texture2D` cannot be created on this renderer at all (`CNA_RESULT_NOT_SUPPORTED`: "The Texture2D
surface format is unavailable on the active graphics renderer"), so a float depth image has to be a
render target, which is what the shader's own comment assumes.

**Not reproduced further than this.** Whether the uniform, the sampler binding, the viewport
division or the depth decode is at fault is not something this package can tell from outside, and
guessing would not help. What is certain is the observable: the depth input and the softness reach
CNA, are stored, are readable back, and make no difference to what is drawn.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` asserts the current behaviour --
that a depth image of zeros with a softness of 50 leaves the drawn particle unchanged -- rather
than skipping the check. That is the same discipline that made findings 7 and 9 visible the moment
CNA repaired them: the assertion fails when the fade starts working, and says so. `ParticleSystem`
documents on `SetDepthInput` itself that the fade is not observable on any renderer this package
qualifies against.

## 13. The packed depth encoding loses every bit the packing bought, in the target it is stored in

`DepthNormalPrepass` packs linear depth across the four channels of a `Color` target rather than
into one half-float channel, and its own source says why: "1 part in 2^24 against a half-float's
11-bit mantissa, at the price of a little arithmetic on both ends". The arithmetic is exactly that
good. The storage is not, and what a consumer reads back is no better than a single eight-bit
channel would have given.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, and on
`cmake-build-tsnext` (HEADLESS) for the arithmetic half, through
`cna_depth_normal_prepass_pack_depth` and `cna_depth_normal_prepass_unpack_depth` over 2001 depths
spanning the range:

```text
                                                        worst error over the range
encoder into decoder, channels left as floats                  2.978e-8   (2^-24 = 5.96e-8)
the same channels quantised to 255 levels, as an 8-bit
  UNORM target stores them                                     1.967e-3
the depth alone in one 8-bit channel, no packing at all         1.960e-3
the same channels quantised to 256 levels instead              2.978e-8
```

The last row is the whole finding. `cnaPackDepth` is written in powers of 256 —
`shift = vec4(16777216, 65536, 256, 1)`, `mask = 1/256` — and `cnaUnpackDepth` weights the low
channel by one. An eight-bit UNORM target stores `round(c * 255) / 255`, so the low channel's own
quantisation error, up to `0.5/255`, passes straight through the reconstruction. The three high
channels then contribute at most `1/256` of a step between them and cannot correct it.

Confirmed against a real GPU buffer rather than only on the CPU: a quad at view depth 10 with a far
plane of 100 is stored by the prepass and reads back as `0.10038`, which is exactly what packing
`0.1`, quantising each channel to 255 levels and unpacking gives. The two agree to five decimals, so
the model above is of CNA and not of the test.

**Consequence.** Every screen-space effect driven by this buffer — the decal projector's box test,
SSAO, screen-space reflections — is working with about 0.4% of the far plane, not the 6e-6% the
encoding is documented to provide. With a far plane of 1000 that is a four-unit uncertainty on every
depth comparison.

**Proposed change.** Either quantise in the base the target actually uses — divide by 255 rather
than 256 in `cnaPackDepth`'s `mask` and in `cnaUnpackDepth`'s `shift`, so the round trip is exact in
the storage as well as in the arithmetic — or say in `DepthNormalPrepass`'s documentation that the
delivered resolution is one part in 255 and that the packing buys robustness rather than precision.
The comment that chose packing over half-float rests on the 2^24 figure, so the choice is worth
re-measuring either way.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` runs the sweep above and asserts
that the eight-bit error is more than a hundred times the arithmetic error, that it equals a half
channel step, and that 256-level quantisation restores the exact accuracy. A repair fails the first
of those and says so. `DepthNormalPrepassMath.PackDepth` documents the delivered resolution on
itself, so a consumer budgets for the real number rather than the documented one.

## 14. Three depth/normal prepass routes answer `INTERNAL` where their header documents `INVALID_STATE`

`cna_depth_normal_prepass_begin`, `_end` and `_resize` each document a `CNA_RESULT_INVALID_STATE`
for the ordering mistake a caller can actually make — a pass already open, no pass open, and a
resize while a pass holds the targets. All three answer `CNA_RESULT_INTERNAL` instead, which tells a
caller their own call sequence was a bug in CNA.

**Measured** on `cmake-build-debug` (OPENGLES3) and `cmake-build-tsnext` (HEADLESS), ABI 0.21.0:

```text
call                                            documented        returned
begin(0, ...) with a pass already open          INVALID_STATE (3) INTERNAL (12)
end() with no pass open                         INVALID_STATE (3) INTERNAL (12)
resize(32, 32) inside begin/end                 INVALID_STATE (3) INTERNAL (12)
begin(0, view, projection, 50, 10)              INVALID_ARGUMENT  INVALID_ARGUMENT (1)
```

The error *message* is right in every case — `end()` answers "CNA::Graphics::DepthNormalPrepass::end:
no pass is open" — so what is lost is only the code, which is the part a program branches on.

**Cause, from the source rather than inferred.** The three ordering failures are
`std::logic_error`; the plane failure is `std::invalid_argument`. `CNA_WITH_PREPASS` wraps each body
in `CallWithExceptionBarrier`, which translates `std::invalid_argument` and lets everything else
fall through to `CNA_RESULT_INTERNAL`. CNA's own render pipeline, in the same source file, does the
translation the prepass is missing:

```cpp
} catch (const std::logic_error&) {
    return Fail(CNA_RESULT_INVALID_STATE, CNA_ERROR_CATEGORY_STATE, "A frame is already open.");
}
```

`cna_render_pipeline_begin_frame`, `_end_frame`, `_reset_targets` and `cna_decal_pass_draw` all have
that clause. The three prepass routes do not.

**Proposed change.** Add the same `catch (const std::logic_error&)` to
`cna_depth_normal_prepass_begin`, `_end` and `_resize`, with `CNA_ERROR_CATEGORY_STATE` and the
message each already produces. `begin`'s out-of-range pass index deserves the same treatment against
`std::out_of_range`, which the header calls an argument error.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` asserts all four codes as returned,
and `test/native-cna.integration.mjs` asserts the unopened close by its code and its message
together. Both name the finding and fail when the codes become the documented ones.

## 15. Two skybox getters document the same borrow contract and only one of them mints a handle

The engine layer's counted-borrow rule is consistent everywhere else in this ABI: a getter that
lends something returns a **fresh handle** the caller releases, and releasing it releases the handle
and nothing else. Two routes document exactly that and behave differently.

`cna_skybox_get_environment` keeps the contract. Its answer is a new owned handle aliasing the
skybox — `CreateOwnedTextureCube(shared_ptr(s, cube), s->parentGame, outEnvironment)` — so a caller
must release it, and a caller who does not leaves the game counting an owned graphics resource it
can no longer name. That is what happens: reading it once per frame and dropping the answer makes
`cna_game_destroy` refuse for the rest of the process.

`cna_render_pipeline_get_skybox` documents the identical contract — "The handle **borrows**: it
keeps the pipeline alive while it exists and releases only itself" — and its body is:

```cpp
*outSkybox = p->skybox;
return CNA_RESULT_SUCCESS;
```

It hands back the caller's own handle. Releasing it, which is what the documentation instructs, calls
`cna_skybox_destroy` on the skybox the caller still holds and still owns.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, ABI 0.21.0, in one
process:

```text
route                                   released by the caller?   result
cna_skybox_get_environment              no                        cna_game_destroy refuses,
                                                                  every later cna_game_create
                                                                  answers INVALID_STATE
cna_skybox_get_environment              yes                       clean shutdown
cna_render_pipeline_get_skybox          no                        clean shutdown
cna_render_pipeline_get_skybox          yes                       the caller's own Skybox.Dispose
                                                                  then fails: "The Skybox handle is
                                                                  invalid for this call."
```

Both halves of the table were reached by writing this binding to the documentation and then
measuring: the environment getter without a release, and the pipeline getter with one. Each broke in
its own direction.

**Proposed change.** Make the pipeline getter mint a borrow the way the skybox getter does — an
alias of the pipeline resource, released with `cna_skybox_destroy` — so the documented rule holds
everywhere; or, if echoing the stored handle is deliberate, say so in the header and drop the
sentence about the handle keeping the pipeline alive, because that sentence is what makes a careful
caller destroy their own object.

**Detector in cna-ts:** `Skybox.HasEnvironment` takes the environment handle, tests it and gives it
straight back, and documents why on itself; `RenderPipeline.Skybox` deliberately does not release
what it is given and documents that too. `test/windowed-renderer.integration.mjs` reads both inside
one game and asserts that the game still destroys cleanly, so either behaviour changing upstream
fails here.

## 16. Three of the four shadow maps refuse to be destroyed while lending, and the fourth does not

Every object in the engine layer that lends a handle uses the same counted-borrow rule, and all four
shadow maps document it in the same words. `cna_spot_shadow_map_get_shadow_texture`, for instance:

> The handle is a borrow that keeps the map alive; release it with `cna_render_target_destroy`, which
> does not dispose the map's own texture. The map refuses to be destroyed while a borrow is
> outstanding.

Three of the four keep that promise. The spot map does not: it destroys itself with a lent handle
still pointing at it, and the caller is left holding a texture whose object is gone.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, and identically on
`cmake-build-tsnext` (HEADLESS). Each map is created, its shadow texture borrowed, and the map
destroyed with the borrow still outstanding:

```text
map                 destroy while lending
cna_shadow_map      INVALID_STATE  "The shadow map is still lending an effect or its shadow texture."
cna_cascaded_...    INVALID_STATE  "The cascaded shadow map is still lending its effect or its atlas."
cna_cube_shadow_map INVALID_STATE  "The cube shadow map is still lending its effect or its cube."
cna_spot_shadow_map SUCCESS        -- the map is gone and the borrow is not
```

**Cause, from the source rather than inferred.** `SpotShadowMapResource` carries an
`activeBorrowCount` exactly as its three siblings do, and `cna_spot_shadow_map_get_shadow_texture`
and `_get_caster_effect` increment it. `cna_spot_shadow_map_destroy` is the only one of the four
whose body never reads it:

```cpp
// cna_shadow_map_destroy, cna_cascaded_shadow_map_destroy, cna_cube_shadow_map_destroy
if (map->activeBorrowCount != 0U) {
    return Fail(CNA_RESULT_INVALID_STATE, CNA_ERROR_CATEGORY_STATE,
                "The … is still lending …");
}
// cna_spot_shadow_map_destroy: no such check
```

**Consequence.** A caller who releases in the order the other three force -- borrows first, then the
map -- is unaffected. A caller who does it the other way round gets a refusal from three maps and a
use-after-free from the fourth, which is the worst possible way for an inconsistency to present: the
mistake is caught everywhere except in the one place it is not.

**Proposed change.** Add the same `activeBorrowCount` check to `cna_spot_shadow_map_destroy`, with
the message its siblings use.

**Detector in cna-ts:** `test/native-cna.integration.mjs` asks all four maps directly, below the
public API, and asserts three refusals and one success. A repair fails the fourth assertion and says
so. The binding itself returns every borrow before the map it came from in all four cases, so no
consumer of this package can reach the defect -- which is also why the mutation that reverses that
order in `SpotShadowMap.Dispose` survives, and is recorded rather than hidden.

## 17. One borrow route in the effect family says "do not destroy it", and obeying it wedges the game

Three engine-layer routes lend an `Effect` a caller did not create, and all three reach the same
handle registry. Two document the release the registry needs, one forbids it:

| route | header sentence | what the body does |
| --- | --- | --- |
| `cna_shader_effect_factory_acquire` | "Release it with `cna_effect_destroy`." | `CreateBorrowedEffect(...)` |
| `cna_ascii_pass_get_effect` | "releasing the returned handle does not release the pass" | `GetRuntimeHandles().Create(...)` |
| `cna_post_process_effect_pass_get_effect` | "The returned handle is borrowed from the pass; **do not destroy it**." | `CreateBorrowedEffect(...)` |

All three mint a **new registered handle** parented to the game. `CreateBorrowedEffect` is
`CreateEffectHandle(std::move(effect), parentGame, outEffect, /*owning=*/false)`: the `false` decides
whether destroying the handle disposes the `Effect` behind it, not whether the handle exists. It
exists, the game counts it, and nothing else will ever release it.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, one `EffectPass` built
over a `CrtEffect`, its effect read four times, then the pass, the effect and the game released in
that order:

```text
caller releases each borrow?   reads saw an effect   effect still attached   cna_game_destroy   next cna_game_create
no  (what the header says)     true,true,true        true                   REFUSED: "All      INVALID_STATE: "Only
                                                                            owned C child      one C-owned CNA game
                                                                            resources must be  may be active at a
                                                                            destroyed before   time"
                                                                            the game"
yes (what the siblings say)    true,true,true        true                   OK                 OK
```

The `effect still attached` column is the point: releasing the borrow four times does **not** detach
or destroy the pass's effect. The release costs the caller nothing and is the only way to shut down.
Following the header instead makes the game undestroyable for the rest of the process — the same
shape as findings 1 and 15, reached from a different door.

**Proposed change.** Replace the sentence with the one `cna_shader_effect_factory_acquire` already
uses: "Release it with `cna_effect_destroy`; releasing it does not release the pass." If a
zero-cost non-registering borrow is wanted here, that is a different fix — echo the effect handle
the caller already owns, as `cna_render_pipeline_get_skybox` does — but then finding 15's objection
applies and the header has to say which handle it is giving back.

**Detector in cna-ts:** `EffectPass.HasEffect` takes the handle, tests it, and gives it straight back
through `cna_effect_destroy`, documenting on itself why it disobeys the header. The windowed test
reads it on both sides of a `SetEffect(null)`/`SetEffect(effect)` pair and then asserts the game
destroys cleanly, so a repaired route — or a regression that starts refusing the release — fails
here.

## 18. A refused `cna_game_destroy` is not side-effect-free: the process then segfaults on the way out

Every leak finding in this document ends the same way — `cna_game_destroy` answers
`CNA_RESULT_INVALID_STATE`, "All owned C child resources must be destroyed before the game." That
refusal is recoverable, and it is documented as one. What is not documented is that a process which
*ends* in that state does not exit: it takes SIGSEGV after the last line of the program has run.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, one game per process,
the leak being a single `cna_texture_2d_create` handle the program forgets. Nothing in the table
depends on which route made the resource — an effect-pass borrow gives the identical result:

```text
what the process did                                                      exit
game created, never destroyed at all                                      0
game created and destroyed                                                0
destroy refused, leaked handle released, destroy retried and succeeded     0
destroy refused, leaked handle released, destroy NOT retried             139 (SIGSEGV)
destroy refused, nothing else done                                        139 (SIGSEGV)
```

Read the first and the last rows together: a game that is simply left alive tears down cleanly, and
a game that is left alive *after a refused destroy* does not. So the crash is not "a live game at
exit". The refusal itself leaves the game in a state its own teardown cannot survive, and the only
way back out is to complete the destroy — releasing the offending resource is necessary but not
sufficient, as row four shows. The crash happens after the script's last statement and survives an
explicit `process.exit(0)`, which places it in the library's own teardown rather than in the host.

**Consequence.** This multiplies findings 1, 15 and 17. Each of those turns a documented-looking
call into an undestroyable game; this turns an undestroyable game into a crashing process. It also
makes the failure look like it belongs to whatever ran last, because the segfault arrives after the
program has finished and printed everything it meant to print.

**Proposed change.** Make the refusal path leave the game exactly as it found it, so that a refused
destroy is inert; or, if the refusal must partially tear the game down, say so in the header and
document that the caller has to complete the destroy before exiting.

**Detector in cna-ts:** every windowed and headless probe game in this package destroys its game and
asserts that the destroy succeeded, and the suites run one game per process — so any regression that
starts refusing a destroy shows up as a failing assertion *and* as a non-zero exit code, rather than
as a passing test file that crashes on the way out.

## 19. A PBR effect's texture slots have two sources of truth, and they never agree

`PbrEffect` carries seven texture slots, and the C API offers two ways to fill them: put a whole
material on with `cna_pbr_effect_apply_material`, or set one slot with `cna_pbr_effect_set_texture`.
They write to different places. `applyMaterial` goes through the engine layer's `ApplyTo`, which
calls `effect.setTextureProperty(...)` and its six siblings on the C++ object. `set_texture` writes
the C API's own retained-handle table, `GetEffectState(view.resource)->lifetime->pbrTextures[slot]`,
which is the *only* thing `cna_pbr_effect_get_texture` reads.

**Measured** on `cmake-build-tsnext` (HEADLESS) and `cmake-build-debug` (OPENGLES3), ABI 0.21.0,
byte-identical on both, one `Texture2D` whose handle is `0x100000004`:

```text
what the caller did                                    get_texture   extract_material's slot
apply a material whose albedo slot holds the texture   invalid       invalid
set_texture on the albedo slot                         0x100000004   invalid
then apply a material whose albedo slot is empty       0x100000004   invalid
```

Three separate problems, in one table:

1. **A texture applied with a material is invisible.** The effect really is sampling it — `ApplyTo`
   set the pointer — but `get_texture` says the slot is empty, so a caller cannot read back what
   they just applied.
2. **`extract_material` never reports a texture at all**, in any row, including the one where
   `set_texture` filled the slot and `get_texture` agrees it is filled. So a material cannot be
   round-tripped through an effect without silently losing every texture, and the loss is not
   visible from either side.
3. **Applying a material does not clear a slot the setter filled.** The third row is the worst of
   the three: the material said "no albedo texture", the C++ effect was cleared to `nullptr`, and
   the C API still hands out — and still retains — the handle. The two sources of truth now
   disagree in the opposite direction from row one.

**Proposed change.** Make `apply_material` and `extract_material` go through the same retained-handle
table `set_texture` and `get_texture` use: apply should fill or clear each slot's entry from the
material, and extract should read it back. That makes one source of truth out of two and fixes all
three rows at once. If the material's slots are deliberately not part of the C API's retained state,
say so in all four headers, because today none of them mentions the other route.

**Detector in cna-ts:** `PbrEffect.ExtractMaterial` documents on itself that the slots come back
empty and why; `test/native-cna.integration.mjs` asserts a textureless material round-trips exactly
while `test/windowed-renderer.integration.mjs` asserts that a material *with* a texture does not, and
that the difference is exactly the slots. Both files assert all three measured rows, so a repair
fails here rather than passing unnoticed.

## 20. The GPU instance culler runs, reports success, and culls nothing

`cna_gpu_instance_culler_cull` uploads an indirect draw command with a visible count of zero and
dispatches a compute shader that tests each instance against the camera's six frustum planes and
increments that count for the ones it keeps. `cna_gpu_instance_culler_read_visible_count_ext` reads
the count back. The shader runs — the count is never the zero the CPU wrote — and it keeps every
instance it is given, wherever the instance is.

**Measured** on `cmake-build-debug` (OPENGLES3, ABI 0.21.0) under `xvfb-run`, camera at
`(0, 0, 10)` looking at the origin with a 45° field of view and a far plane of 100, one unit box per
instance. The CPU column is this package's own `BoundingFrustum.Intersects` over the same
world-space boxes:

```text
instances                                        offered   CPU keeps   GPU count
three inside the frustum                         3         3           3
three at ±10000 units, far outside it            3         0           3
two inside and two far outside                   4         2           4
none                                             0         0           0
```

The last row is the only one where the count is not simply the instance count: it is zero because
there is nothing to count, not because anything was rejected. Nothing else in the table is rejected
at all — an instance ten thousand units off the side of a hundred-unit frustum survives.

None of this is announced. `cna_gpu_instance_culler_is_supported` answers true and
`cna_gpu_instance_culler_copy_unsupported_reason` is empty, so a game that adopts the culler pays
for the compute dispatch, the buffer upload and the readback, and then draws exactly what it would
have drawn without any of them. On the other three renderers built here — HEADLESS, SOFTWARE and
SDL_RENDERER — the culler answers `CNA_RESULT_NOT_SUPPORTED` and the question does not arise, so
OPENGLES3 is the only place the defect is reachable and the only place it was measured.

**Proposed change.** Compare the compute shader's plane test against
`CNA::Graphics::FrustumCuller`, which is right — the two are asked the same question about the same
boxes in the table above and disagree on every row where anything should be rejected. The most
likely cause is the six plane equations reaching the shader in a different sign or order convention
from the one it tests against, which would make every instance pass; the plane upload packs
`frustum.getNearProperty()` and its five siblings into 24 floats, and that packing is where to look
first.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` runs the four rows above and
asserts the measured counts, with the CPU expectation computed beside them from this package's own
`BoundingFrustum`. A repaired culler makes the second and third rows fail, which is the point. The
`FrustumCuller` next to it is checked against `BoundingFrustum` on the same geometry and agrees on
every case, so the test also shows the two cullers disagreeing with each other.

## 21. The weighted-blended bracket's documented behaviour was corrected in the code and not in the header

**Severity:** documentation, and the wrong half is the one a careful caller reads.
**Reproduced on:** HEADLESS (which cannot resolve) and OPENGLES3 (which can), CNA C ABI 0.21.0,
2026-09-01.

`CNA/C/engine_layer.h` says of `cna_weighted_blended_transparency_begin`:

> **On a renderer that cannot run the resolve this succeeds without opening anything**, so
> `cna_weighted_blended_transparency_is_accumulating` still reports `CNA_FALSE` and a matching
> `cna_weighted_blended_transparency_end` refuses. That is the canonical behaviour, reproduced
> rather than corrected; ask `is_supported` before bracketing, or treat `end`'s refusal on an
> unsupported renderer as expected. See `plans/plan_binding.md` `CBIND-098`.

`CnaCApiEngineLayer.cpp` repeats it in a comment on the shim. Neither is true any more.
`WeightedBlendedTransparency::begin` was corrected the other way, and its own comment says so:

> The bracket opens whether or not the resolve can run — the same correction ShadowMap needed
> (`plans/plan_modern.md` MOD-1697) and for the same reason. Returning here before `accumulating_`
> was set left a renderer that cannot resolve with a `begin()` that reported success and an `end()`
> that threw "accumulation is not open" […] What the unsupported path skips is the device work, not
> the bracket.

Measured on HEADLESS, which reports `is_supported = CNA_FALSE` with the reason "this renderer has no
half-float render target, and the accumulation sums values far outside 0..1":

| call | header says | measured |
| --- | --- | --- |
| `begin(100)` | success | success |
| `is_accumulating` | `CNA_FALSE` | **`CNA_TRUE`** |
| `end()` | `CNA_RESULT_INVALID_STATE` | **success** |

The code is right and the documentation is wrong, which is the harmless direction for a caller who
writes the obvious `begin`/`end` pair and the harmful one for a caller who believes the header: the
defensive `if (!is_supported) { /* skip end */ }` the header asks for leaves the bracket open
forever, and the next `begin` then fails with `INVALID_STATE` on the renderer least able to explain
why. That is the exact failure MOD-1697 removed, reintroduced by following the documentation.

**Proposed change.** Delete the paragraph from `engine_layer.h` and the matching comment in
`CnaCApiEngineLayer.cpp`, and say instead that the bracket opens on every renderer and that an
unsupported one skips the device work inside it. `plan_binding.md` CBIND-098 should point at
MOD-1697 rather than at the behaviour MOD-1697 removed.

**Detector in cna-ts:** `test/native-cna.integration.mjs`, "the weighted-blended bracket opens on
every renderer, including one that cannot resolve", asserts the measured column on whichever
renderer it runs against. If the header is ever made true again — that is, if the code regresses to
what it documents — that test fails, which is what it is for.

## 22. A `ShaderEffect`'s first draw through `SpriteBatch` produces nothing at all

**Severity:** a silent wrong picture, and the frame it eats is the first one.
**Reproduced on:** OPENGLES3 (EasyGL, Mesa 25.0.7, OpenGL ES 3.2), CNA C ABI 0.21.0, 2026-09-01.

A freshly created `ShaderEffect` drawn through `SpriteBatch` draws **nothing** the first time. Every
later draw with the same effect is correct. Measured with a 4×4 render target cleared to opaque
black, a 1×1 white sprite stretched over it, `BlendState.Opaque`, and a fragment shader whose only
output is `vec4(uValue, 0, 0, 1)` with `uValue = 0.125`:

| what was run | pixel (0,0) |
| --- | --- |
| a new effect's first `Begin`/`Draw`/`End` | `0, 0, 0, 255` — **nothing was drawn** |
| the same effect, second run | `32, 0, 0, 255` — correct (`0.125 × 255 = 31.875`) |
| the same effect, third run | `32, 0, 0, 255` |
| a *second* new effect, first run | `0, 0, 0, 255` — **nothing again** |
| that second effect, second run | `32, 0, 0, 255` |
| `SpriteBatch` with **no** custom effect, first run | `40, 80, 120, 255` — correct |

So it is once per effect, not once per render target, per batch or per frame: the target is rebound
and cleared before each run above, and a batch with no custom effect draws correctly the first time.

**It is the first `Apply` that matters, and that is the whole diagnosis.** Applying the effect's
pass once *outside* any batch, immediately after construction, makes its first batch draw correctly:

| what was run | pixel (0,0) |
| --- | --- |
| a new effect, `CurrentTechnique.Passes[0].Apply()`, then its first run | `32, 0, 0, 255` — correct |

So the first `Apply` of a `ShaderEffect` has a side effect the draw depends on — the program being
made current, its attribute bindings resolved, or its uniform locations looked up — and when that
first `Apply` is the one `SpriteBatch.Begin` performs, the draw that follows it still goes out
without it. A second `Apply` finds the work already done and the draw is correct.

The effect itself is fine before the lost draw: `IsEffectValid` is already `true` and
`GetCompileErrorEXT` is already empty, so nothing in the public state says a draw is about to be
discarded.

**What it costs.** A game that draws many frames loses one and never notices. A game that draws
*once* with a fresh effect gets nothing at all and no error: a thumbnail, a lightmap or impostor
bake, an offline render, a test. It also makes a custom shader impossible to qualify from a single
frame, which is how this was found — the accumulation half of `WeightedBlendedTransparency` needs a
shader calling `cnaOitEmit`, and with one batch per layer the first layer never reaches the buffer.

**Proposed change.** Make the first `Apply` complete before the draw that follows it, rather than
alongside it — whatever `Apply` does lazily on first use (program link, attribute or uniform-location
resolution) should happen at construction or at the top of `Apply`, before `SpriteBatch` records the
draw. The `Apply`-then-draw table above localises it: whatever the second `Apply` finds already done
is what the first one does too late.

**Workaround, with one caveat.** Apply the effect once immediately after constructing it: one line,
no draw call, and it costs nothing on a renderer where the defect is absent. The caveat is that the
bare `Apply` leaves a GL error pending — `cna_weighted_blended_transparency_begin` immediately after
one fails with `CNA_RESULT_INTERNAL` and "EasyGL SetRenderTargets: native GL errors were pending
before MRT setup: InvalidOperation(0x502)". So does a custom-shader *draw*: a
`SpriteBatch.Begin`/`Draw`/`End` with a `ShaderEffect` leaves the same error pending, and the next
multiple-render-target bind refuses on it while a bind with no custom-shader draw before it
succeeds. Both were measured here. Where a multiple-render-target bind follows, spend the lost draw
*inside* the bracket instead — a fragment that contributes nothing is enough, and that is what this
package's own accumulation test does.

The pending error is worth repairing on its own: `SetRenderTargets` is refusing over an error some
earlier, unrelated call left behind, which makes the first `SetRenderTargets` after any custom
shader unreliable.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` runs the first table above and
asserts every row, including the blank first draw. When this is repaired the "nothing was drawn" row
fails, which is the point. The weighted-blended accumulation test beside it applies its effect once
before the bracket opens and says why.

**It does not reach the compiled-effect route, and that was measured rather than assumed.**
`test/effect-reflection.integration.mjs` constructs a compiled `Effect` from
`CnaConformanceEffect.fxb`, selects a technique, applies a pass and draws once -- the first draw that
effect has ever performed, with nothing priming it -- and the texels are already the ones the shader's
own arithmetic predicts. The second half does not reach it either: a multiple-render-target bind
issued straight after a compiled-effect draw succeeds, where the same bind after a `ShaderEffect`
draw refuses on the pending `InvalidOperation(0x502)` above. So both halves of this finding belong to
`ShaderEffect`, not to "custom shaders" generally, and a fix should not assume the compiled path
needs the same repair. Both are asserted in that file, so a compiled effect acquiring either defect
fails there.

## 23. Three `_init` routes document identity transforms and write zero matrices

**Severity:** documentation, and the implementation is the half that is right.
**Reproduced on:** HEADLESS, CNA C ABI 0.21.0, 2026-09-01. Both routes are pure functions of their
output, so the renderer does not enter into it.

`cna_shadow_cascade_state_ext_init` says:

> @param out_state Receives zero cascades, **identity transforms**, zero splits, no blend band and
> no debug tint — which is the state that disables cascaded shadows.

`cna_punctual_light_ext_init` says:

> @param out_light Receives kind `NONE`, the origin, direction (0, -1, 0), white, range 20, inner
> angle 0.35, outer angle 0.5, depth bias 0.004, no shadow textures and **an identity transform**.

Measured, every other documented default is exact — kind, position, direction, colour, range, both
angles, the depth bias, the absent textures, the zero count, the zero splits, the zero blend band
and the absent debug tint all match to the bit. The transforms do not:

| what the header promises | what is written |
| --- | --- |
| `world_to_atlas[0..3]` identity | all sixteen floats zero, in all four |
| `camera_view` (unstated) | all sixteen floats zero |
| `shadow_view_projection` identity | all sixteen floats zero |
| `cna_gpu_cullable_instance_init`'s `world` identity | all sixteen floats zero |

The third is `cna_gpu_cullable_instance_init`, whose header says it "receives an instance with an
**identity world** and an empty box". The empty box is exact; the world is zero. Same wording, same
cause, same one-word correction.

The implementation is deliberate and says so in its own words, which is what makes this a
documentation defect rather than a behaviour one. `cna_shadow_cascade_state_ext_init`:

> The canonical arrays are value-initialized, and `Matrix()` is all zeros — so these stay zero. That
> matters: with `count` at 0 no cascade transform is read at all, and inventing an identity here
> would make a defaulted C state differ from a defaulted C++ one for no gain.

and `cna_punctual_light_ext_init`:

> `ShadowViewProjection{}` is a value-initialized Matrix, which is all zeros; the memset above
> already left exactly that.

Both arguments are good ones. The header is simply describing a different decision from the one
that was taken.

**What it costs.** A caller who believes the header treats the unused slots as pass-through. The
cascade array is a **fixed four** whatever `count` says, so a game that sets two cascades leaves two
zero matrices behind it — and a zero matrix is not a harmless identity, it collapses every position
it multiplies to the origin. Anything that reads past `count` — a blend band at the last cascade's
edge, a debug view, a shader that loops to four — sees the origin instead of the point it asked
about. The same for a punctual light whose transform is never set: "identity" would mean world
space, and zero means everything is at the eye.

**Proposed change.** Correct the two `@param` lines to say the transforms are **zero** matrices, and
keep the implementation comments' reasoning where a reader will find it — that a defaulted C state
matches a defaulted C++ one, and that no transform past `count` is read. The word to remove is
"identity", in both places.

**Detector in cna-ts:** `test/native-cna.integration.mjs`, "the shadow-receiver contract" and "the
last of the engine layer", assert every documented default including these, so the table above is
checked field by field. The transform rows assert **zero**; if the routes are ever changed to write
identity — that is, if the documentation is made true by moving the code — those assertions fail and
say so.

## 24. A missing `.cube` file and a malformed one both come back as `NOT_SUPPORTED`

**Severity:** a caller cannot tell "your build has no engine layer" from "your file has a typo".
**Reproduced on:** HEADLESS, CNA C ABI 0.21.0, 2026-09-01, with the engine layer present — the same
call loads a valid file successfully in the same process.

`cna_cube_lut_load_from_file` answers `CNA_RESULT_NOT_SUPPORTED` for every failure:

| what was loaded | result | message |
| --- | --- | --- |
| a path that does not exist | **6** `NOT_SUPPORTED` | `CNA::Graphics::CubeLut: cannot open '…'` |
| a file that is not a `.cube` | **6** `NOT_SUPPORTED` | `…the document declares no LUT_3D_SIZE…` |
| a valid 2×2×2 `.cube` | 0 `SUCCESS` | — |

That is not what the shim intends. It contains a branch written precisely to tell the two apart:

```cpp
} catch (const CNA::CNAException& failure) {
    // "cannot open" is an IO failure the caller can act on; anything else is malformed content.
    const std::string what = failure.what();
    if (what.find("cannot open") != std::string::npos) {
        return Fail(CNA_RESULT_IO, CNA_ERROR_CATEGORY_IO, "The LUT file cannot be read.");
    }
    return Fail(CNA_RESULT_INVALID_ARGUMENT, …, "The file is not a well-formed .cube LUT.");
}
```

Neither `CNA_RESULT_IO` nor `CNA_RESULT_INVALID_ARGUMENT` ever comes out, and neither of those two
messages does either — the message that arrives is `CubeLut`'s own.

**The cause, read from the source rather than guessed.** `CubeLut::loadFromFile` throws
`CNA::Graphics::EngineException`, and `EngineException` and `CNA::CNAException` are **siblings**:
both derive from `System::Exception` and neither derives from the other. So the `catch` above cannot
match, the exception leaves the lambda, and `CallWithExceptionBarrier`'s own
`catch (const CNA::Graphics::EngineException&)` arm — which maps to `NOT_SUPPORTED` because that arm
exists for capability refusals — is what answers.

**What it costs.** `NOT_SUPPORTED` is load-bearing in this ABI: every engine-layer route returns it
for "this build has no engine layer", and callers branch on it to decide whether a whole feature is
available. A bad file path now produces the same code, so a game that checks the result — rather
than parsing the message — concludes the engine layer is missing and disables colour grading
entirely, because one LUT path had a typo.

**Proposed change.** Catch `CNA::Graphics::EngineException` in the shim instead of
`CNA::CNAException` — one identifier. The message-sniffing branch inside it then works as written,
and the two failures separate into `CNA_RESULT_IO` and `CNA_RESULT_INVALID_ARGUMENT` as intended.
Worth a look at the other shims that catch `CNAException` around an engine-layer call for the same
reason.

**Detector in cna-ts:** `test/native-cna.integration.mjs`, "the last of the engine layer", loads a
missing path, a malformed file and a valid one written by the test, and asserts all three results.
When this is repaired the first two rows fail, which is the point.

## 25. The exception barrier has no `std::logic_error` arm, so two documented refusals arrive as `INTERNAL`

**Measured** 2026-09-01 against `cnanext` `e5ae0820e`, CNA C ABI 0.21.0, HEADLESS. Reproduced in
pure C first — `build-probe/cbind_instanced_draw_probe.c` — before any binding was involved.

`cna_instanced_renderer_ext_draw` has two canonical refusals, and its header documents both as
`CNA_RESULT_INVALID_STATE`:

> `CNA_RESULT_INVALID_STATE` when this renderer cannot instance and the fallback is disabled, or
> when the fallback is enabled and the effect cannot carry a per-instance transform

The C shim says the same thing about itself, in a comment written to explain why it does not
translate the messages by hand:

```cpp
// Both canonical refusals are logic_error, and both are state rather than argument errors:
// the layer is here and the arguments are fine, this combination of renderer, setting and
// effect is not. The exception barrier maps logic_error to INVALID_STATE, so they arrive
// with their own messages without being restated here.
r->value->draw(*effect->value);
```

What actually comes back on a renderer that cannot instance with the fallback off:

```text
CAPS supported=0 fallback=0
DRAW_NO_FALLBACK result=12 message="CNA::Graphics::InstancedRendererEXT::draw: this renderer
                                    does not support instancing and the per-instance fallback
                                    is not enabled"
```

`12` is `CNA_RESULT_INTERNAL`. The message is exactly the intended one; the *classification* is not.

**The cause, read from the source.** `InstancedRendererEXT::draw` throws `std::logic_error` for
both refusals. `CallWithExceptionBarrier` in `modules/c-api/src/CnaCApiDetail.hpp` catches
`std::out_of_range` and `std::invalid_argument` — two *derived* classes of `std::logic_error` — but
has **no arm for `std::logic_error` itself**. A plain one therefore falls all the way through to

```cpp
} catch (const std::exception& exception) {
    return Fail(CNA_RESULT_INTERNAL, CNA_ERROR_CATEGORY_INTERNAL, exception.what());
}
```

The shim's comment describes a mapping that does not exist.

**What it costs.** `CNA_RESULT_INTERNAL` means "a bug in CNA" everywhere else in this ABI, and it is
the one code a caller cannot act on: there is no state to change and no argument to fix. Here it is
returned for the most ordinary thing in the world — a renderer on a backend without instancing,
asked to draw with the fallback left at its default of off. A game that logs `INTERNAL` as a defect
and carries on will report a bug against CNA every frame; one that treats it as fatal will stop.
The two refusals are precisely the ones a caller *should* branch on, since enabling the fallback
fixes the first and choosing an `IEffectMatrices` effect fixes the second.

This is wider than the instanced renderer: any route in the ABI that throws a bare
`std::logic_error` is misclassified the same way, and the comment above shows at least one author
already believed the arm was there.

**Proposed change.** Add one arm to the barrier, after `std::out_of_range` and
`std::invalid_argument` so their more specific mappings still win:

```cpp
} catch (const std::logic_error& exception) {
    return Fail(CNA_RESULT_INVALID_STATE, CNA_ERROR_CATEGORY_STATE, exception.what());
}
```

**Detector in cna-ts:** `test/native-model-part.integration.mjs`, "drawing names which path it took
rather than only whether it succeeded", asserts `Error(12)` for the fallback-disabled refusal. When
this is repaired that line fails and names the finding, rather than the binding quietly outgrowing a
stale expectation.

## 26. `cna_avatar_description_create_random`'s header does not say that it never randomises

**Measured** 2026-09-01 against `cnanext` `e5ae0820e`, CNA C ABI 0.21.0, HEADLESS.
`build-probe/cbind_avatar2_probe.c`.

The header documents the route the way its name reads:

```c
/**
 * @brief Creates a random avatar description.
 *
 * @param out_description Receives an owned description handle.
 * @return `CNA_RESULT_SUCCESS` or a documented argument/thread failure.
 */
CNA_C_API CNA_Result cna_avatar_description_create_random(
    CNA_AvatarDescriptionHandle* out_description);
```

and the body-type overload documents its parameter without qualification.

What comes back:

```text
A bytes=1021 body=0 height=0.000000 valid=0
B bytes=1021 body=0 height=0.000000 valid=0
C(female) bytes=1021 body=0 height=0.000000 valid=0
A_vs_B_identical=1  A_vs_C_identical=1
A nonzero_bytes=0 of 1021
```

Every call returns the same 1021 zero bytes, `is_valid` is false, and the requested body type
changes nothing.

**This is not a defect.** The implementation says so in as many words, and is right to:

```cpp
// Despite the name, the real XNA implementation never actually randomizes anything -
// always an all-zero (invalid) description. Preserved exactly, not "fixed."
...
// bodyType is validated but, matching the real XNA implementation, never actually used.
```

Reproducing XNA exactly is the correct choice, and this ABI's whole value rests on it.

**What is worth changing is only the header.** A C consumer reads `gamer_services.h`, not
`AvatarDescription.cpp`. As it stands the two documented behaviours a caller would most reasonably
expect — that two "random" descriptions differ, and that asking for a body type produces one —
are both false, and nothing in the header hints at it. A caller who tests for variety concludes the
ABI is broken; one who does not, ships an avatar system that always shows the same invalid avatar.

This is the same class as findings 21 and 23: behaviour the code states deliberately and the header
does not carry.

**Proposed change.** Two sentences in the header, saying what the implementation already says —
that the canonical operation returns an all-zero, invalid description and that the body type is
validated but unused. No code change, and the behaviour must not be "fixed".

**Detector in cna-ts:** `test/avatar-description.integration.mjs` asserts the zeros, the identical
results across calls, and that both body types produce the same bytes. If a future CNA ever did
start randomising, those three fail together and say why.

## 27. `SpriteFont::MeasureString` counts a negative trailing side bearing into the width

**Measured** 2026-09-01 against `cnanext` `e5ae0820e`, CNA C ABI 0.21.0.
**Settled against XNA's own IL**, not against an opinion about what XNA ought to do.

A glyph's kerning is `(left side bearing, width, right side bearing)`, and a right side bearing may
be negative — that is how a font tucks the next glyph under an overhang. CNA and this package
disagree about what a *trailing* negative one does to the measured width. Built over one glyph
table, on a font whose `j` has kerning `(1, 6, -3)`:

| string | CNA | this package |
| --- | ---: | ---: |
| `"j"` | 4 | **7** |
| `"Aj"` | 18.5 | **21.5** |
| `"jj"` | 9.5 | **12.5** |
| `"A.j"` | 23 | **26** |
| every other string tested (18 of them) | agree | agree |

The difference is exactly the bearing's magnitude, only in width, and only when the widest line
*ends* in such a glyph. `"jA"` and `"AjW."` agree, because there the negative bearing is interior
and both implementations add it unclamped.

**Which is XNA's.** `Microsoft.Xna.Framework.Graphics.dll` was disassembled.
`SpriteFont::InternalMeasure` keeps each glyph's right side bearing in a local and adds it to the
next glyph on the same line *unclamped*:

```text
IL_00da:  size.X = size.X + (spacing + pendingZ)      // interior glyph: raw
IL_010d:  pendingZ = kerning.Z                        // carried forward
```

and adds it **clamped at zero** at every line break and once more after the loop:

```text
IL_0054:  size.X = size.X + Math.Max(pendingZ, 0)     // at '\n'
IL_015c:  size.X = size.X + Math.Max(pendingZ, 0)     // after the last glyph
```

CNA has no such carry. `modules/graphics/src/Xna/SpriteFont.cpp` adds both components of every
glyph as it goes:

```cpp
curLineWidth += cKern.Y + cKern.Z;
```

which is right for interior glyphs and wrong for the last one on a line.

**What it costs.** Text laid out with a measured width — a centred string, a wrapped paragraph, a
button sized to its label — is short by the overhang whenever the line ends in a glyph that has
one. It is silent, it is font-dependent, and it grows with the number of lines, since every line's
last glyph can contribute.

**Proposed change.** Carry the right side bearing the way the canonical implementation does: add
`cKern.Y` in the loop, keep `cKern.Z` in a pending local added unclamped before the next glyph, and
add `std::max(pending, 0.0f)` at each line break and once after the loop. The same file's
first-glyph rule is already derived that carefully, and its comment records the live XNA
measurement it came from.

**Detector in cna-ts:** `test/sprite-font-oracle.integration.mjs` builds CNA's own `SpriteFont`
from this package's glyph table and measures twenty-four strings with both. Eighteen must agree
exactly; five must differ by exactly the bearing's magnitude in width and not at all in height.
When this is repaired the second group fails and the first grows to cover it.

This is what the oracle was built for, and it found the divergence on its first run.

## 28. `Microphone::BufferDuration` refuses its own default and accepts durations XNA rejects

**Severity:** a legal value is refused, an illegal one is accepted, and the refused one is the value
the property reports before anything sets it.
**Reproduced on:** SDL3 platform with `CNA_AUDIO_PLATFORM=SDL3` (OPENGLES3 windowed build), CNA C
ABI 0.21.0, 2026-09-01, against three real capture devices this host enumerates.

`Microphone.BufferDuration` reports `1000 ms` on a fresh microphone. Assigning that same value back
throws:

```text
cna_microphone_set_buffer_duration_ticks_at failed with CNA result 1:
Specified argument was out of the range of valid values. (Parameter 'BufferDuration')
```

so `microphone.BufferDuration = microphone.BufferDuration` is a round trip that cannot complete.
Each row below was measured in its own process, from the untouched initial state:

| requested | CNA | XNA 4.0 |
| --- | --- | --- |
| 50 ms | refused | refused |
| 90 ms | refused | refused |
| 100 ms | accepted | accepted |
| 500 ms | accepted | accepted |
| 990 ms | accepted | accepted |
| **1000 ms** | **refused** | **accepted** |
| **1100 ms** | **accepted** | **refused** |
| **1500 ms** | **accepted** | **refused** |
| **2500 ms** | **accepted** | **refused** |
| 60000 ms | refused | refused |

**The contract is XNA's, and XNA's own IL settles it.** `monodis` on
`Microsoft.Xna.Framework.dll`, `Microphone::set_BufferDuration`:

```text
IL_0013:  call TimeSpan::get_TotalMilliseconds()
IL_0018:  ldc.r8 100.       IL_0021:  blt.s   -> throw
IL_002a:  ldc.r8 1000.      IL_0033:  bgt.s   -> throw
IL_003c:  ldc.r8 10.  rem   IL_004f:  bne     -> throw
```

`blt`/`bgt` are strict, so XNA accepts exactly `[100, 1000]` in 10 ms steps, endpoints included, and
it reads **`get_TotalMilliseconds`**.

**Root cause, and CNA's own source already names half of it.**
`modules/audio/src/Xna/Microphone.cpp`:

```cpp
const auto milliseconds = value.getMillisecondsProperty();

// getMillisecondsProperty() is the sub-second component, bounded to [-999, 999], so the
// "> 1000" branch below can never be true; kept as-is to match FNA (Microphone.cs:60).
if (milliseconds < 100 || milliseconds > 1000 || milliseconds % 10 != 0)
```

`getMillisecondsProperty()` is the **sub-second component**, where XNA reads the **total**. That one
substitution produces every row above: `1000 ms` has a sub-second component of `0`, which fails
`< 100`; `1500 ms` has one of `500`, which passes; `60000 ms` has one of `0`, so it is refused for
the wrong reason and only looks correct.

The comment records that the `> 1000` branch is unreachable and treats that as harmless. It is the
symptom: a bound that cannot be reached is a bound being applied to the wrong quantity. The same
observation appears a second time in `MicrophoneTests.cpp` -- "the setter's `>1000` branch is
unreachable -- not tested here since no TimeSpan value can trigger it" -- and the suite stays green
because `BufferDurationValidRoundTrip` uses `500 ms` and no case sits at or above `1000`.

The constructor is unaffected because it assigns `bufferDuration_` directly, which is what lets the
default be a value the setter rejects. `CnaCApiAudio.cpp` is a pure pass-through, so the C ABI
inherits this exactly and adds nothing.

**What it costs.** XNA's maximum buffer is the setting a game picks when it wants the fewest
`BufferReady` callbacks -- voice chat, a push-to-talk recorder -- and it is the one value that
cannot be set. A game that saves and restores the property, or that clamps to the documented maximum,
fails on a value XNA's own documentation names. In the other direction a five-second buffer is
accepted silently, and the caller gets a capture buffer XNA would have refused.

**Proposed change.** Read the total rather than the component:

```cpp
const auto milliseconds = value.getTotalMillisecondsProperty();
```

which makes both bounds live and matches the IL above exactly. Add the two cases the current suite
has no room for -- `1000 ms` accepted, `1100 ms` refused -- since neither can pass today.

**Detector in cna-ts:** `test/windowed-renderer.integration.mjs` asserts the measured table above,
including the two rows where CNA and XNA disagree. This package does **not** work around it: the
property is a pass-through to CNA and adding managed validation would report a limit the runtime
does not have. When the setter is repaired the two disagreeing rows fail, which is the point.

## 29. Net sessions are reachable, and no binding can honestly reach them: there is no test-only signed-in gamer

**Severity:** a testability gap, not a defect. CNA behaves correctly at every step below. The
consequence is that roughly 136 `net_sessions.h` and `net_gamers.h` routes cannot be qualified by a
language binding without that binding fabricating a player.
**Reproduced on:** HEADLESS build, CNA C ABI 0.21.0, 2026-09-01, directly against the C ABI with
every out-parameter poisoned before its call.

```text
1. cna_gamer_get_signed_in_gamer_count            -> SUCCESS, count 0
2. cna_network_session_create(LOCAL, 1, 4, &out)  -> INVALID_ARGUMENT, out CNA_INVALID_HANDLE
3. cna_signed_in_gamer_create_ext("Player", ...)  -> SUCCESS, gamer valid
   cna_gamer_set_signed_in_gamers_ext(&gamer, 1)  -> SUCCESS, count 1
4. cna_network_session_create(LOCAL, 2, 8, &out)  -> SUCCESS, session valid
```

Step 2 and step 4 are the same call. The only thing between them is a published gamer, which is
exactly what `docs/c-api/NET.md` says: "the canonical constructor selects its host from its local
gamers and fails while that list is empty." CNA's own `modules/c-api/tests/pure_c/NetSmoke.c` runs
this sequence, and to get past step 2 it has to invent a gamer called `"Player"`.

**Why a binding cannot do what that smoke test does.** `cna_signed_in_gamer_create_ext`'s own header
says what it is for: "the canonical factory exists so a **platform layer** can publish a signed-in
gamer." A platform layer publishing the gamer that is actually signed in is correct. A *binding*
calling it is fabricating a player, and every claim built on the session that follows -- the host's
identity, the local gamer roster, who a `NetworkGamer` is -- would be a claim about a player nobody
signed in as. So this package does not bind those routes, and the reason is not that CNA lacks
networking: Local and SystemLink sessions are created on this host and report their state.

**What would unblock it, and CNA has already designed the shape five times.**
`cna_compass_set_test_backend_ext`, `cna_motion_set_test_backend_ext`,
`cna_vibrate_controller_set_test_backend_ext`, `cna_file_dialog_set_test_backend_ext` and
`cna_message_box_set_test_backend_ext` all exist, and the compass one's header gives the argument
verbatim: "Without it there is no compass on any verification machine and no way to reach a single
line past the unsupported refusal." Substitute "signed-in gamer" and the sentence is this finding.

A sixth in that family would do it -- sketched, not prescribed:

```c
/* Installs or removes this ABI's own signed-in-gamer backend for testing. */
CNA_C_API CNA_Result cna_gamer_set_test_backend_ext(CNA_Bool installed, int32_t gamer_count);
```

What matters is not the signature but the two properties the existing five have. It is **named as a
test route**, so a shipping consumer reading the header knows it is not for them; and the gamers it
publishes are **visibly synthetic**, so nothing downstream can mistake one for a real sign-in. Both
are what make the difference between a binding qualifying its session code and a binding inventing a
player.

**What this package will do with it.** Bind `net_sessions.h` and `net_gamers.h` behind it, in tests
and internal qualification only, with the evidence labelled `SYNTHETIC_LOCAL_VERIFIED` and never
`REAL_PLATFORM_VERIFIED`. Until then the family stays unbound and is classified
`BLOCKED_UPSTREAM_TESTABILITY` rather than deferred, because nothing local can move it.

**Detector in cna-ts:** none, and deliberately. There is no behaviour here to assert -- CNA is
right at every step -- so a test would only pin the absence of a route, which the coverage report
already records. `tools/upstream-repro/net-signed-in-gamer.py` is the reproduction above, kept
runnable so the sequence can be re-measured when the dependency moves.

## 30. On WEBGL2, a draw into more than one bound render target reaches none of them

**Severity:** a silent wrong picture, and it takes the whole depth/normal prepass with it.
**Reproduced on:** WEBGL2 (EasyGL, WebGL 2.0 / OpenGL ES 3.0, headless Chromium with SwiftShader),
CNA C ABI 0.21.0, 2026-09-01. **Does not reproduce on OPENGLES3.**

`GraphicsDevice.Capabilities` reports `MultipleRenderTargets` on this context, and CNA's own startup
log agrees — "MRT up to 4 targets (GL draw buffers=6, color attachments=6, CNA/FNA cap=4)". A draw
into two bound targets nevertheless reaches neither, with no error at the time.

**Measured** through the public API only, with a stock `BasicEffect` so that no custom shader is
anywhere near it. One triangle, one 80×48 target pair, the two runs identical but for how many
targets are bound:

```text
bound targets   Clear reached the target   texels the triangle painted
one             yes                        233
two             yes                        0 and 0
```

The `Clear` column is the point. The bind succeeds, the clear reaches the targets, and the draw that
follows them reaches nothing.

**It is not an engine-layer defect.** `tools/upstream-repro/webgl2-multiple-render-targets.mjs`
reproduces the table above identically on an artifact built **without** `CNA_CNAEXT`, using only
`GraphicsDevice.SetRenderTargets`, `Clear`, `BasicEffect` and `DrawUserPrimitives` -- four pieces of
the XNA surface with no extended graphics anywhere near them. The prepass is where it was noticed
and not where it lives. The single-target run is taken **first** because the two-target draw
leaves `InvalidOperation(0x502)` pending: the next `SetRenderTargets` with more than one binding
refuses with `CNA_RESULT_INTERNAL` and "EasyGL SetRenderTargets: native GL errors were pending
before MRT setup", so a control taken after the experiment is measuring the pending error instead.

**What it costs.** `DepthNormalPrepass` reports `IsUsingMultipleRenderTargets` here and therefore
`PassCount` of one, and does all of its work inside a single such bind. So on WEBGL2 it writes no
depth and no normals at all — `IsSupported` is true, `Begin` succeeds, the draw succeeds, `End`
succeeds, and both buffers come back holding nothing but their clear. Everything downstream of that
buffer is empty for the same reason: the decal projector paints nothing, and SSAO, screen-space
reflections, depth of field, motion blur, contact shadows and aerial perspective have no depth to
read. **No call in that sequence fails**, so a browser consumer gets an unlit, undecalled frame and
no diagnostic of any kind.

**It is that renderer's path and not the API.** The identical scenario — same 80×48 target, same
camera, same rectangle, same prepass, same decal boxes — passes on the windowed OPENGLES3 build
under Xvfb, where the prepass fills its buffers and the projector lands on the texels CNA's own box
test predicts. That test is `test/windowed-renderer.integration.mjs`, and it is the control for this
finding.

**Proposed change.** Find why the draw is dropped under a multi-attachment framebuffer in the
WEBGL2 path specifically — the pending `InvalidOperation` says the draw call itself is rejected, so
the likely candidates are the `glDrawBuffers` configuration for the attachment set, a fragment
output count the program does not declare for WebGL 2.0's stricter rules, or an attachment format
combination that is complete under desktop GL and not under WebGL 2.0. Until then,
`EasyGLRenderer`'s WEBGL2 capability report should not advertise `MultipleRenderTargets`, because
`DepthNormalPrepass` reads exactly that capability to choose the one-pass path, and the two-pass
path it would otherwise take works on this renderer.

**Detector in cna-ts:** `test/wasm-browser-strong.mjs`, through
`test/support/prepass-decal-oracle.mjs`. The two-draw probe above runs in the browser suite and its
result decides what the prepass is held to: while a two-target bind receives nothing, the suite
requires the prepass to write nothing and the decal to paint nothing, and it says so by name. The
moment a two-target draw lands, `multipleRenderTargetsDraw` returns true and the suite requires the
prepass pixels instead — so a repair fails here and asks for the geometric predictions the windowed
suite already makes. `tools/upstream-repro/webgl2-multiple-render-targets.mjs` is the probe on its
own, runnable against any artifact.

## 31. CNA's XACT example describes its variable accessibility byte as "settable", and 0x2 is READONLY

**Measured:** CNA ABI 0.21.0, revision 5347b52e, on the WebAssembly artifact in headless Chromium,
and it is a documentation defect rather than a runtime one — which is why it cost an hour instead
of being caught by a test.

`modules/audio/examples/demo_xact/src/XactFileGen.hpp` writes an `.xgs` settings file for the XACT
demo, and its one global variable carries:

```cpp
        w8(out,  0x03);    // accessibility: global + settable
```

The bit values are `PUBLIC = 0x1`, `READONLY = 0x2`, `CUE = 0x4` — CNA's own
`AudioEngineTests.cpp` says so, in a comment written after an earlier version of *that* fixture
made the same mistake:

> P12-VAR-001: PUBLIC only (0x1) ... this variable must be plain engine-global (PUBLIC set, CUE
> clear) and writable (READONLY clear) ... Previously 0x03 (PUBLIC|READONLY), an arbitrary nonzero
> byte chosen before this project enforced accessibility semantics at all — silently made
> SetGlobalVariableValidUpdatesValue test a no-op-writable variable by accident.

So `0x03` is PUBLIC **and READONLY**, and the demo's comment says the opposite of what the byte
means. A binding author following the example writes a settings file whose variable silently
ignores every write, and what they see is `SetGlobalVariable(500)` followed by
`GetGlobalVariable() == 343` — which reads exactly like a marshalling bug in their own float
argument. That is where this was found.

**Proposed fix:** correct the comment to `// accessibility: PUBLIC | READONLY`, or change the byte
to `0x01` if the demo meant its variable to be writable. The test fixture in the same repository
already carries the explanation; the example is the copy people read.

**Consequence here:** `test/fixtures/xact.mjs` defines **two** global variables rather than one —
`SpeedOfSound` at `0x01` and `Ceiling` at `0x03` — so a write that lands and a write that is
ignored are two separate assertions instead of one ambiguous result. `test/support/non-engine-oracle.mjs`
asserts both, and would fail if CNA started honouring a write to a READONLY variable.

## 32. On the WebAssembly target, creating a standalone `GraphicsDevice` makes the game undestroyable

**Measured:** CNA ABI 0.21.0, revision 5347b52e, `cmake-build-tswasm-fx` (SDL3 / WEBGL2 /
`CNA_CNAEXT=ON` / `CNA_DEVICES=ON`), headless Chromium. In **plain C calls with no binding
involved**: a game is created and run through one frame, then

```text
cna_presentation_parameters_init   0
cna_graphics_device_create(0, 0, parameters, &device)   0        (a 64x48 device)
cna_graphics_device_destroy(device)                     0
cna_game_destroy(game)             *** ErrnoError, errno 44 ***
```

The last line is not a CNA result. It is an Emscripten `FS.ErrnoError` with `errno` 44 — `ENOENT`
in that build's errno table — escaping from inside `cna_game_destroy`, and
`cna_error_get_last_message_size` answers **zero bytes afterwards**, so nothing reached CNA's own
exception barrier. Something under the destroy makes a JavaScript-side filesystem call on a path
that does not exist, and the error propagates out of the export rather than being converted.

**What works, which is most of it.** The device itself is fine: `cna_graphics_device_create`
succeeds, the device's viewport is the 64×48 its presentation parameters asked for rather than the
game's 800×480 — so it is genuinely its own device and not a second view of the manager's — and
`cna_graphics_device_destroy` returns success. Only the *game's* teardown afterwards fails, and it
fails whether or not the standalone device was destroyed first. Without the standalone device the
same game disposes cleanly, in the same page, on the same frame count.

**Why it matters.** `GraphicsDevice`'s public constructor is XNA API, not an extension: a game that
constructs one is doing an ordinary thing. On this target it silently costs the consumer their
`Game.Dispose`, and the diagnostic they get is an Emscripten errno with no stack and no CNA
message — which points at their filesystem rather than at their device.

**Proposed fix:** find the filesystem call under `cna_game_destroy` that a standalone device's
existence makes reachable — the likely candidates are a preference-path or persistent-storage probe
in the SDL3 Emscripten platform layer, and a device-scoped resource whose cleanup path differs when
more than one device has existed — and either make the path optional or let the exception barrier
convert it. Whichever it is, an Emscripten `ErrnoError` should not be able to leave a `CNA_C_API`
function: every one of them documents a `CNA_Result`.

**Consequence here:** `WasmBackend` deliberately does **not** implement
`createStandaloneGraphicsDevice`. The implementation was written, measured and withdrawn — a public
constructor that silently makes `Game.Dispose` fail is worse than one that refuses by name — so the
member falls through `CnaBackendBase` and `GraphicsDevice`'s constructor refuses in a browser.
`test/wasm-browser-non-engine.mjs` asserts that refusal through
`test/support/non-engine-oracle.mjs`, so a repaired CNA fails that assertion and asks for the
implementation back. The Node-API backend is unaffected and `test/standalone-device.test.mjs`
continues to prove the whole family there.

## 33. `FrameworkDispatcher::Update` ages the touch state machine, so calling it twice in one frame costs `TouchLocation`'s previous state

**Where.** `modules/audio/src/Xna/FrameworkDispatcher.cpp:67` — the dispatcher ends by calling
`Input::Touch::TouchPanel::Update()` whenever a touch device exists, and that is what runs
`advanceEventTouches()`: `previousState = state`, `previousPosition = position`, and `Pressed`
becomes `Moved`. `TouchPanel::GetState()` deliberately does not age; its own comment explains why
(CNA's input bridge is event-driven rather than poll-driven, so the panel's event snapshot is the
source of truth and `SetFinger`/`touches_` stay empty in production).

**What XNA does, from the pinned reference assemblies rather than from memory.**
`Microsoft.Xna.Framework.Input.Touch.TouchPanel::GetState()` calls
`TouchCollection::Update(...)` — the aging is tied to the *read*.
`Microsoft.Xna.Framework.FrameworkDispatcher::Update()` sets `UpdateCalledAtLeastOnce`, calls
`PollForEvents()` and drains a list of pending managed calls; it does not mention `TouchPanel` at
all. So in XNA the dispatcher is idempotent within a frame, and a game may call it as often as it
likes — which is exactly what the documentation asks of a game that does not derive from `Game`.

**Measured**, in headless Chromium against the WebAssembly artifact, one finger pressed at (40,50)
through `Input.dispatchTouchEvent` and then two frames run with no further events. Each frame reads
`TouchPanel.GetState()` once, inside `Game.Update`:

| dispatcher pumps per frame | frame 1 | frame 2 |
| --- | --- | --- |
| one | `Pressed`, no previous location | `Moved`, previous `Pressed` |
| two | `Pressed`, no previous location | `Moved`, previous **`Moved`** |

The second row is XNA-wrong: after a press, `TouchLocation.TryGetPreviousLocation()` must report
`Pressed`, and a game that distinguishes a tap from a drag by that transition cannot. Nothing else
degrades — identifiers, positions, the previous *position*, the `Released` frame and the erase
afterwards are all identical between the two rows — which is why it survives casual testing.

**Why it matters.** The dispatcher is public API that games call directly, and XNA's contract makes
that safe. Under CNA a second call in the same frame is not a redundant call, it is a state
transition, and the damage lands in a family the caller was not touching.

**Proposed fix:** age the panel from the game tick rather than from the dispatcher — CNA's own
`Game::Update` already calls `FrameworkDispatcher::Update()` at the end of the base pass, so the
call site is available — or make `advanceEventTouches()` idempotent within a tick by keying it on
the frame counter and letting extra dispatcher calls be the no-ops XNA promises they are.

**Consequence here:** `cna-ts`'s `Game` no longer pumps the dispatcher itself. It used to, from the
managed `update` callback, and that was a duplicate from the start: the C API's game shim runs
`Game::Update`'s base pass — dispatcher included — as soon as the callback returns. The duplicate
was invisible while the WebAssembly backend's `updateFrameworkDispatcher` did nothing, and became
visible the moment it was implemented. `test/wasm-browser-input.mjs` asserts the one-pump row above,
so a repaired CNA (or a returning duplicate) fails it, and `test/framework-components.test.mjs`
asserts that the managed `update` callback pumps managed services only.

## 34. `SDL_GetCameras` is called without `SDL_INIT_CAMERA`, so CNA enumerates no camera anywhere while `IsSupported` says it has drivers

**Where.** `modules/platform/src/Sdl3/Sdl3Camera.cpp:198` — `Sdl3CameraProvider::GetCameras()`
calls `SDL_GetCameras(&count)` and returns `{}` when it answers null. `SDL_INIT_CAMERA` does not
appear anywhere in `modules/`, and neither does any other route into SDL's camera subsystem:

```console
$ grep -rn "SDL_INIT_CAMERA" modules/ --include=*.cpp --include=*.hpp
$
```

SDL3 requires it. `third_party/SDL/src/camera/SDL_camera.c:739` is the first thing `SDL_GetCameras`
does:

```c
SDL_SetError("Camera subsystem is not initialized");
return NULL;
```

**Measured:** CNA ABI 0.21.0, revision 5347b52e, `cmake-build-tswasm-fx` (SDL3 / WEBGL2 /
`CNA_CNAEXT=ON` / `CNA_DEVICES=ON`), headless Chromium 151 launched with
`--use-fake-device-for-media-stream`, camera permission granted to the page's origin:

| asked | answer |
| --- | --- |
| `navigator.mediaDevices.enumerateDevices()` | one `videoinput`, `fake_device_0` |
| `cna_camera_get_is_supported_ext` | `true` |
| `cna_camera_get_count_ext` | **0** |
| `cna_camera_create` → `cna_camera_get_state_ext` | `NotSupported` |
| frame size | 0 × 0 |

The browser has a camera. CNA does not see it.

**The inconsistency is the tell.** `IsSupported()` is `SDL_GetNumCameraDrivers() > 0`, which reads
a compiled-in table and needs no initialisation, so it answers `true`. `GetCameras()` needs the
subsystem and gets nothing. A caller is therefore told the platform supports cameras and handed an
empty list, which reads as "this host has no camera attached" — the one thing it does not mean.

**It is not the browser half that is missing.** `SDL_CAMERA_DRIVER_EMSCRIPTEN` is wired up in
SDL's own `CMakeLists.txt:1731`, and the built artifact contains both the `emscripten` and `dummy`
camera driver names alongside the `Camera subsystem is not initialized` string. The driver is
compiled in and unreachable.

**Why it matters, and it is not browser-specific.** Nothing in the path above is Emscripten's: the
same `Sdl3CameraProvider` serves every SDL3 platform, so `CnaCamera` enumerates zero devices on a
desktop with a webcam for exactly the same reason. That is very likely why the only camera evidence
this package has ever had comes from `cna_camera_create_with_test_backend_ext` — the real path has
never enumerated anything on any host, and "this host has no camera" was an available explanation
every time.

**Proposed fix:** `SDL_InitSubSystem(SDL_INIT_CAMERA)` before the first enumeration, paired with a
`SDL_QuitSubSystem` on teardown, the way `Sdl3AudioDevice::Open` already brackets
`SDL_INIT_AUDIO`. If initialising lazily is unwanted, `IsSupported()` should stop answering `true`
for a subsystem that will then enumerate nothing, because the pair as it stands is worse than
either answer alone.

**Consequence here:** `test/wasm-browser-audio-capture.mjs` asserts the refusal — the browser
offering a camera and CNA enumerating none — through
`assertBrowserCameraEvidence` in `test/support/audio-oracle.mjs`, in the same shape finding 32 is
held in: **a repaired CNA fails that assertion** and asks the suite to acquire frames instead. The
camera row in `docs/runtime-capabilities.md` is `BLOCKED_UPSTREAM` rather than hardware-pending,
because a camera was present and the failure was CNA's.

## 35. The mixer's negotiated sample rate is not on the C ABI, so `VisualizationData.Frequencies` has no frequency axis

**Measured:** CNA ABI 0.21.0, revision 5347b52e, `cmake-build-tswasm`, headless Chromium.
`MediaPlayer.GetVisualizationData` publishes 256 magnitudes from a 512-point transform, so bin *i*
is `i * sampleRate / 512` Hz — and a consumer has no supported way to learn `sampleRate`.

- `GetMixerSampleRate()` exists (`modules/audio/src/Backend/Sdl3Mixer/MixerEngine.cpp`) and is
  internal. No `cna_*` route exposes it; the only sample rate anywhere on the audio ABI is
  `cna_microphone_get_sample_rate_at`, which is a capture device's.
- The browser's own `AudioContext.sampleRate` is a *different number*. Measured here: the
  AudioContext runs at **48000** and CNA's mixer at **44100**, with SDL resampling between them.
  A page that reasonably assumed they were the same would put a 1378.125 Hz tone in bin 15 instead
  of bin 16, and every other tone with it — a wrong frequency axis that still looks like a working
  spectrum, because the shape is right and only the labels are wrong.
- The one place CNA states it is a stderr line with no log level, from the same unconditional
  `printf` recorded as finding 2:
  `[AudioMixer] Requested format=0x0 channels=2 freq=44100; application format=0x8010 channels=2 freq=44100`.

**Why it matters.** A spectrum analyser is the obvious thing to build with this API, and it is the
one thing the API cannot support: the caller can draw 256 bars and cannot label the axis. XNA has
the same gap, which is an explanation rather than a defence — CNA already has the number and
already exposes far more than XNA did through `*_ext` routes.

**Proposed fix:** `cna_media_player_get_visualization_sample_rate_ext`, or more generally
`cna_audio_get_mixer_format_ext` answering the rate and channel count `MIX_GetMixerFormat` already
returns. Either makes the frequency axis derivable rather than guessable.

**Consequence here:** `test/wasm-browser-audio.mjs` takes the rate from that stderr notice, which
`test/support/browser-harness.mjs` parses out of the console stream it was already classifying as
a non-error. That is a workaround on a log line and it is recorded as one: it will break the day
the line changes, which is a better failure than a spectrum silently measured against the wrong
axis. The suite asserts that the mixer's rate and the AudioContext's really do differ, so the trap
is pinned rather than described.
