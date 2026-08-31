# Upstream CNA findings

Defects and gaps this binding measured in `cnanext` and did not fix, because fixing them is the CNA
agent's work and editing that repository from here would be worse than reporting it. Each entry says
exactly what was run, what happened, and what a fix would look like — and each has a test in this
package that fails when the behaviour changes, so a repaired upstream is noticed rather than
silently outgrowing its workaround.

`docs/wasm-backend.md` carries the two Emscripten build-system gaps separately, because they are
build configuration rather than runtime behaviour. **Both of those are now fixed upstream and
verified here** — see items 3 and 4 below.

Re-checked against `cnanext` 599d14e5 (CNA C ABI 0.21.0) on 2026-08-31.

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
