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
found while projecting the sensor families.

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
