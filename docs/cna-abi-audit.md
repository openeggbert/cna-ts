# CNA C ABI migration and requalification audit

Audit date: 2026-08-31 (requalified against the live dependency state at CNA C ABI 0.21.0)

This audit treats `cnanext` and `sharp-runtimenext` as read-only evidence. Neither repository was
modified. The binding first targeted CNA C ABI `0.7.0` from the older `cna` checkout, then `0.20.0`;
the live canonical headers now declare `0.21.0`. Each crossing re-measured every imported route, the
acceptance policy and the runtime evidence rather than renumbering them, and each is recorded here
in the order it happened.

## Live dependency provenance

```text
CNA_SOURCE=/rv/data/development/github.com/openeggbert/cnanext
CNA_HEAD=599d14e54e073b566d77b3d6fb30ac52d3d810b7
CNA_BRANCH=next
SHARP_RUNTIME_SOURCE=/rv/data/development/github.com/openeggbert/sharp-runtimenext
SHARP_RUNTIME_HEAD=4a49afb0cfe6a41e6e0af0bb62dc5175976731bb
SHARP_RUNTIME_BRANCH=next
```

Both artifacts were previously built from `cnanext` 17b5a90a and have been rebuilt from the
revisions above. **This time the C contract did move**, which is why it was measured rather than
assumed: `git diff 17b5a90a..599d14e5 -- modules/c-api/include` touches six headers, and one of
them is `abi.h`.

```text
PREVIOUS_ARTIFACT_SOURCE=17b5a90a  ABI 0.20.0  4051 exported declarations
CURRENT_ARTIFACT_SOURCE=599d14e5   ABI 0.21.0  4054 exported declarations
```

Under this package's own acceptance policy an experimental `0.x` minor increment is an
incompatible change, so an ABI 0.21 library would have been **rejected** by the 0.20 window rather
than silently mis-driven. `src/internal/abi.ts` now declares 0.21 and
`TARGETED_ABI_MATCHES_HEADERS` proves it against the headers.

What actually changed, read declaration by declaration rather than inferred from the version bump:

```text
ADDED   cna_environment_get_device_type                            devices.h
ADDED   cna_object_dictionary_ext_get_runtime_type_name_size       content_readers.h
ADDED   cna_object_dictionary_ext_copy_runtime_type_name           content_readers.h
REMOVED (none)
RENAMED (none)
SIGNATURE CHANGES to imported routes: 0 (all 594 recompile under -Wall -Wextra -Werror)
```

Three documented *behaviour* changes accompany them, none of which alters a prototype:
`cna_content_manager_load_texture2d` and `cna_graphics_device_create_texture2d` now accept any
renderer-supported surface format rather than only `Color`; `cna_network_session_create*` document
a two-through-31 `max_gamers` range; and `cna_network_session_create_async` now preserves the
requested gamer limit instead of substituting its own. Only the last was previously asserted here,
and it was asserted as an ABI *fact* rather than as a CNA-TS behaviour, so nothing in the binding
depended on the old answer.

A moved HEAD is not evidence of an ABI change, and an unchanged ABI version is not evidence that
the headers held still: both directions have now been observed on this dependency.

Both dependency worktrees carried another session's uncommitted work throughout. Nothing in this
audit modified either.

## Qualified artifact

Built out of tree; neither dependency checkout was dirtied.

```text
BUILD_DIRECTORY=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tsnext
GENERATOR=Ninja
CMAKE=3.31.6
COMPILER=gcc (Debian 14.2.0-19) 14.2.0
CMAKE_BUILD_TYPE=Debug
CNA_BUILD_C_API=ON
CNA_SHARP_RUNTIME_ROOT=/rv/data/development/github.com/openeggbert/sharp-runtimenext
CNA_PLATFORM=HEADLESS
CNA_GRAPHICS_RENDERER=HEADLESS
CNA_AUDIO_PLATFORM=NULL
CNA_CNAEXT=ON
CNA_DEVICES=ON
CNA_ENABLE_NET=ON
CNA_ENABLE_VIDEO=AUTO
PATH=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tsnext/modules/c-api/libcna_c_api.so
SHA256=17131a4d4b8bf0dc4f35fd7a1b64dd2ae7969a8f0c879aa9c0265f6a6cf0bcda
BYTES=188973392
REPORTED_ABI=0.21.0
EXPORTED_CNA_SYMBOLS=4054
```

Reproduce the header, compiler-signature and artifact-export checks with:

```bash
CNA_SOURCE_PATH=/path/to/cnanext \
CNA_NATIVE_LIBRARY=/path/to/libcna_c_api.so \
npm run audit:cna-abi
```

## Migration result

The 0.7 to 0.20 crossing itself, kept as the record of that event. The import count below is what
it was at the end of that migration; the *current* one is in "The contract counts this audit holds"
further down, and grew because later sessions bound more of the ABI, not because anything here
changed.

```text
PREVIOUS_TARGET_ABI=0.7.0
LIVE_TARGET_ABI=0.20.0
PREVIOUS_PUBLIC_HEADERS=59
LIVE_PUBLIC_HEADERS=61
PREVIOUS_CANONICAL_DECLARATIONS=2861
LIVE_CANONICAL_DECLARATIONS=4051
IMPORTED_SYMBOLS_BEFORE=360
IMPORTED_SYMBOLS_AFTER=361
RETAINED_IMPORTS=360
REMOVED_IMPORTS=0
RENAMED_IMPORTS=0
ADDED_IMPORTS=1
NODE_BRIDGE_SIGNATURES_VERIFIED=361
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
MISSING_NODE_BRIDGE_SYMBOLS=0
MISSING_QUALIFIED_LIBRARY_IMPORTS=0
UNEXPLAINED_IMPORTED_SYMBOL_GAPS=0
```

Every one of the 360 routes the binding imported against ABI 0.7 still exists in ABI 0.20 with an
identical prototype: the whole import list recompiles against the live `CNA/C/*.h` under
`-std=c11 -Wall -Wextra -Werror`, with each imported symbol assigned to its declared
function-pointer type, so a changed return type, parameter count, signedness, pointer depth or
callback shape would be a compile error rather than a silent mismatch. The single added import is
`cna_vertex_buffer_set_data_raw_at_with_options` (see below).

## What actually changed for this binding

### 1. The version acceptance policy is derived, not literal

The adapter used to require the encoded version to equal `CNA_ABI_VERSION` exactly and said so in a
message that named `0.7.0`. It now applies the policy `docs/c-api/ABI_VERSIONING.md` states -- reject
a different major, require a minimum minor -- with the experimental-`0.x` refinement that an
incompatible change is a minor increment, so under `0.x` the minor must match exactly and the patch
component is free. The window is taken from `CNA_ABI_VERSION_MAJOR`/`CNA_ABI_VERSION_MINOR` in the
headers the adapter compiles against, and the same window is declared once in TypeScript in
`src/internal/abi.ts`. `npm run audit:cna-abi` fails when those two disagree
(`TARGETED_ABI_MATCHES_HEADERS`), so the declared generation cannot drift away from the headers.

### 2. A documented ABI-0.7 limitation is gone

ABI 0.16.0 added the options-carrying raw vertex upload in its windowed form. CNA-TS refused
`VertexBuffer.SetData` with both an `offsetInBytes` and `Discard`/`NoOverwrite`, which was accurate
against 0.7 and is no longer accurate. The adapter now imports
`cna_vertex_buffer_set_data_raw_at_with_options` and routes non-`None` options through it;
`CNA_SET_DATA_NONE` keeps taking `cna_vertex_buffer_set_data_raw_at`, which `vertex_resources.h`
documents as the same operation, so both routes stay reached rather than one becoming a stale
import.

### 3. A documented ABI-0.9 contract change invalidated a binding test

`SoundEffectInstance.Apply3D` used to refuse every listener count but one; ABI 0.9.0 made it accept
any positive count, and made it refuse with `CNA_RESULT_INVALID_STATE` on a playing instance that
was never positioned. The native integration suite asserted the old refusal and now asserts both
halves of the new contract against the live artifact.

### 4. Stale version attribution in public diagnostics

Four public messages named "CNA ABI 0.7" as the reason for a limitation. Each was re-measured
against the live headers: the `VertexBuffer` one was false and was removed, and the `GameWindow`
supported-orientation, `Texture3D` and `TextureCube` element-type boundaries are still real and now
name the measured generation through the shared constants instead of a frozen literal.

## Upstream C API test observations

`ctest -R '^CApi_'` in this configuration reports 86 of 92 passing. The six failures are recorded
here as observations about this build's option combination rather than as CNA-TS defects, and none
of them touch a route this binding imports:

```text
CApi_AudioSmoke=CONFIGURATION_NULL_AUDIO (duration of a PCM16 effect is zero without a mixer)
CApi_AudioUnavailableSmoke=CONFIGURATION_NULL_AUDIO
CApi_ContentSmoke=CONFIGURATION_NULL_AUDIO (the sound asset in its fixture set)
CApi_DevicesSmoke=CONFIGURATION_HEADLESS_PLATFORM (CNA_DEVICES=ON with no SDL platform)
CApi_CoreExtSmoke=UNEXPLAINED_UPSTREAM (logger route validation, exit code 5)
CApi_Utf8Oracle=TARGET_NOT_BUILT (no cna_c_api_utf8_oracle_test target in this tree)
```

`CApi_LifecycleSmoke`, which validates game create/run/destroy, update and draw callbacks, sprite
submission and texture readback, passes -- so the game loop this binding depends on is exercised and
sound in this configuration. Rebuilding against `cnanext` 17b5a90a reproduced the same 86 of 92 with
the same six names, which is what makes it a baseline rather than a snapshot.

The wider `ctest -R CApi` selection additionally runs three upstream record-keeping gates
(`CApiCoverageMatrix`, `CApiLimitations`, `CApiReleaseGate`). All three currently fail on
`cnanext`'s own plan bookkeeping -- `CBIND-037` and `CBIND-114` are recorded complete while still
owning planned rows -- with no C API surface involved. That is another session's work in progress in
a repository this one does not modify, and it is recorded here only so a future run does not mistake
it for a regression this binding caused.

## The contract counts this audit holds

```text
ABI_VERSION=0.21.0
TARGETED_ABI_MATCHES_HEADERS=1
PUBLIC_HEADERS=61
EXPORTED_FUNCTIONS=4054
NODE_BRIDGE_IMPORTED_SYMBOLS=594
NODE_BRIDGE_SIGNATURES_VERIFIED=594
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
MISSING_QUALIFIED_LIBRARY_IMPORTS=0
WASM_ARTIFACT_EXPORTED_FUNCTIONS=4056
WASM_BACKEND_ROUTES=169
MISSING_WASM_BACKEND_EXPORTS=0
WASM_ARTIFACT_ASYNCIFY_RUNTIME=0
WASM_ARTIFACT_WEBGL_MAJOR_VERSIONS=2
WASM_ARTIFACT_LINK_CONTRACT=OK_ASYNCIFY_OFF_WEBGL2
BROWSER_ARTIFACT_STATUS=PRESENT_NOT_EXECUTION_VERIFIED
```

`NODE_BRIDGE_IMPORTED_SYMBOLS` and `WASM_BACKEND_ROUTES` are *backend reachability* — how many C
routes each adapter actually imports. They are not the same dimension as the coverage report's
purpose classification, and neither is the canonical declaration count. All three are printed
separately here and in `docs/cna-api-coverage.md` for exactly that reason.

`WASM_ARTIFACT_LINK_CONTRACT` is new in this generation: it measures, out of the artifact's own
generated JavaScript, the two Emscripten link properties this package used to supply itself before
CNA repaired them. See `docs/upstream-cna-findings.md` items 3 and 4.

`BROWSER_ARTIFACT_STATUS` used to be derived from whether a `.wasm` was *committed* to the CNA
worktree, which answered nothing: the artifact is built out of tree and never checked in, so the
audit reported `MISSING` beside a module that had just run 600 browser frames. It now measures the
artifact the binding actually loads -- hashes, byte size, and whether the loader exposes every route
`WasmBackend` resolves at construction. The route names come from the ESM loader rather than the
`.wasm` export section, because a Release link minifies wasm export names to `Mi`, `Ni`, ... and the
loader is what maps a readable `Module["_cna_..."]` onto one. `PRESENT_NOT_EXECUTION_VERIFIED` is
deliberate: a complete artifact is not a running one, and execution evidence belongs to
`npm run test:wasm-browser`.

## The header-derived contract

Hand-maintaining hundreds of prototypes and constants beside a moving ABI is how a binding drifts.
`tools/cna-abi/contract.json` states, once, what CNA-TS depends on at the C boundary, and
`npm run verify:cna-contract` proves it by *generating a C translation unit and compiling it*
against `CNA/C/*.h` under `-std=c11 -Wall -Wextra -Werror`. Every claim is a `_Static_assert`, so an
absent constant, a changed value, a changed scalar width or a changed descriptor version is a
compile error. The TypeScript half of each claim is read out of `src/` rather than copied into the
contract, so what the package actually publishes is what gets proved.

```text
TYPESCRIPT_ENUMS=52
VERIFIED_ENUM_FAMILIES=51
MANAGED_ONLY_ENUMS=1
ENUM_MEMBER_CLAIMS=432
IDENTICAL_CLAIMS=429
TRANSLATED_CLAIMS=3
SCALAR_ASSERTIONS=6
RESULT_CODE_ASSERTIONS=15
STRUCT_VERSION_ASSERTIONS=6
STATIC_ASSERTIONS_COMPILED=PASS
CNA_ONLY_FAMILY_CONSTANTS=46
DECLARED_CNA_ONLY_CONSTANTS=46
DIAGNOSTICS=0
```

### What the first run found

429 of the 432 projected enum members already carry the identical number on both sides. Exactly
three do not, and two of them were live defects:

- **`BlendFunction.Min`/`Max` were exchanged on every native path.** XNA 4.0 numbers `Min = 3` and
  `Max = 4`; the CNA C ABI numbers `CNA_BLEND_FUNCTION_MAX = 3` and `CNA_BLEND_FUNCTION_MIN = 4`.
  The adapter passed the XNA number straight into `CNA_BlendState`, so a game asking for a minimum
  blend got a maximum and vice versa, through `GraphicsDevice.BlendState` and through both
  `SpriteBatch.Begin` overloads that take one. `src/internal/cna-enums.ts` now translates both
  directions and the three call sites use it.
- **`GamePadType.BigButtonPad`** is `0x300` in XNA and `9` in the C ABI. The adapter already handled
  this, as an unexplained inline `=== 9 ? 0x300` in the capability path; it is now a named,
  contract-declared translation with a round-trip test.

The 46 constants that share a mapped family's prefix without an XNA counterpart -- `_MAXIMUM`
sentinels, the `_EXT` surface beyond XNA 4.0, state presets, and sub-families such as
`CNA_KEY_MODIFIER_*` -- are listed in the contract, so a newly added one arrives as a diagnostic
rather than passing unnoticed. `CNA_SURFACE_FORMAT_BC7_EXT`, `CNA_PRIMITIVE_POINT_LIST_EXT` and
their neighbours are modern-CNA surface and belong outside `Microsoft.Xna.Framework.*`.

### Mutation controls

`test/cna-abi-contract.test.mjs` proves the verifier can fail, which is the only thing that makes a
green run evidence. Thirteen deliberate mutations are each asserted to produce their own diagnostic:
a wrong scalar width, a wrong result code, a wrong descriptor version, a suffix override naming no
constant, a prefix pointing at the wrong family, a dropped family, a translation with no translator,
a translation claiming the wrong value, a removed translation, an undeclared CNA-only constant, a
declared constant the headers no longer define, and a TypeScript enum member whose value drifts in a
copied source tree.
