# CNA C ABI 0.20 migration audit

Audit date: 2026-08-30

This audit treats `cnanext` and `sharp-runtimenext` as read-only evidence. Neither repository was
modified. The binding previously targeted CNA C ABI `0.7.0` from the older `cna` checkout; the live
canonical headers now declare `0.20.0`, so every imported route, the acceptance policy and the
runtime evidence were re-measured rather than renumbered.

## Live dependency provenance

```text
CNA_SOURCE=/rv/data/development/github.com/openeggbert/cnanext
CNA_HEAD=72262a33ed5ae7657024c7f1251338748a3feee5
CNA_BRANCH=next
SHARP_RUNTIME_SOURCE=/rv/data/development/github.com/openeggbert/sharp-runtimenext
SHARP_RUNTIME_HEAD=eebebd862121953538e3b84d43384d70a8a1728d
SHARP_RUNTIME_BRANCH=next
```

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
SHA256=53f513af7a81745df49e9214a9d93aa6e4487b8514891f75ebecab5d8c348fba
BYTES=188621656
REPORTED_ABI=0.20.0
EXPORTED_CNA_SYMBOLS=4051
```

Reproduce the header, compiler-signature and artifact-export checks with:

```bash
CNA_SOURCE_PATH=/path/to/cnanext \
CNA_NATIVE_LIBRARY=/path/to/libcna_c_api.so \
npm run audit:cna-abi
```

## Migration result

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
sound in this configuration.

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
