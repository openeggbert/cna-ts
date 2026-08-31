# Upstream CNA findings

Defects and gaps this binding measured in `cnanext` and did not fix, because fixing them is the CNA
agent's work and editing that repository from here would be worse than reporting it. Each entry says
exactly what was run, what happened, and what a fix would look like — and each has a test in this
package that fails when the behaviour changes, so a repaired upstream is noticed rather than
silently outgrowing its workaround.

`docs/wasm-backend.md` carries the two Emscripten build-system gaps separately, because they are
build configuration rather than runtime behaviour. **Both of those are now fixed upstream and
verified here** — see items 3 and 4 below.

Re-checked against `cnanext` 599d14e5 (CNA C ABI 0.21.0) on 2026-08-31. Items 5 and 6 are new,
found while projecting the sensor families; item 7 is new, found while widening the windowed
qualification to three renderers; items 8 and 9 are new, found while projecting the engine
layer's compute path, item 10 while projecting its clustered lighting, item 11 -- a
segmentation fault -- while projecting camera frame capture, and item 12 while projecting the
particle draw.

**Items 7 and 9 are now fixed upstream**, in `48ab0de7f`, and verified here against the rebuilt
library. Both were found by this package, both were *asserted* rather than worked around, and both
detectors fired the moment the repair landed. Four of the twelve findings are now closed.

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
