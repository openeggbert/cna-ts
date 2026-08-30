# Upstream CNA findings

Defects and gaps this binding measured in `cnanext` and did not fix, because fixing them is the CNA
agent's work and editing that repository from here would be worse than reporting it. Each entry says
exactly what was run, what happened, and what a fix would look like — and each has a test in this
package that fails when the behaviour changes, so a repaired upstream is noticed rather than
silently outgrowing its workaround.

`docs/wasm-backend.md` carries the two Emscripten build-system gaps separately, because they are
build configuration rather than runtime behaviour.

## 1. `cna_post_process_chain_add_owned_pass` leaks the owned-resource count

**Measured:** CNA ABI 0.20.0, `cnanext` 17b5a90a, HEADLESS platform/renderer, `CNA_CNAEXT=ON`.

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

## 2. `cna_c_api_wasm` does not pin its renderer's WebGL version

Recorded in `docs/wasm-backend.md`. Still present in `cnanext` 17b5a90a: `cna_c_api_wasm`'s
`target_link_options` in `modules/c-api/CMakeLists.txt` set neither `MIN_WEBGL_VERSION` nor
`MAX_WEBGL_VERSION`, while the graphics examples set both.

## 3. `-sASYNCIFY=1` is added to every Emscripten link

Recorded in `docs/wasm-backend.md`. Still present in `cnanext` 17b5a90a:
`cna_emscripten_abi` in `cmake/BuildPerformance.cmake` adds it unconditionally, and no route in this
ABI survives an Asyncify unwind because every one of them takes an `i64` handle.
