# CNA C ABI 0.7 audit and Effect reconciliation

Audit date: 2026-08-23

This audit treated CNA and the other bindings as read-only evidence. CNA was not modified. Canonical declarations were checked
at current CNA HEAD `1bb2145d99ed572dd4eb15009c34e2e5f410fcf0` and at the exact source revision
of the qualified library, `a09196a6477f69a7a57c8364f990658d31531a5b`. Their public
`modules/c-api/include/CNA/C/effects.h` files are byte-identical for the routes below.

Qualified artifact:

```text
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
BUILD=Linux x86-64, HEADLESS renderer/platform, NULL audio
SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
REPORTED_ABI=0.7.0 (0x00000700)
EXPORTED_CNA_SYMBOLS=2861
```

Reproduce the header, compiler-signature and artifact-export checks with:

```bash
CNA_SOURCE_PATH=/path/to/cna \
CNA_NATIVE_LIBRARY=/path/to/libcna_c_api.so \
npm run audit:cna-abi
```

## Result

The old `EffectPass.Apply = UPSTREAM_CNA_BLOCKED` classification was stale. ABI 0.7 declares
`cna_effect_pass_apply(CNA_EffectPassHandle pass)`, and the qualified library exports it. The old
CNA-TS facade could not safely invoke the route because its reflection graph was synthetic and held
no native pass identity. That missing identity projection was a CNA-TS implementation gap, not an
upstream ABI gap.

CNA-TS now creates owned native Effects, projects owned technique/pass view handles behind the
public facades, retains the parent Effect, destroys views before the Effect, and invalidates all
views when the parent is disposed. The pass facade owns only its view handle; it never destroys its
parent Effect. Apply after parent disposal fails before native dispatch.

| Question | Evidence-backed answer |
| --- | --- |
| ABI 0.7 contains `cna_effect_pass_apply` | Yes; exact prototype is one pass handle, not `(device, pass)` |
| Qualified artifact exports it | Yes; `nm -D --defined-only` and the audit find it |
| CNA-TS can bind/invoke it safely | Yes; compiler-verified import plus hidden owned view lifetime |
| Existing pre-run TS pass facade had native identity | No; it was synthetic. This was `UNIMPLEMENTED_CNA_TS` until fixed in this run |
| Effects can have executable native ownership | Yes through all five stock constructors; compiled creation is renderer-dependent |
| HEADLESS supports compiled effects | No; capability is false and legal conformance FXB returns result 6 |
| Built-in stock effects are constructible/executable | Yes; all five construct and apply successfully on HEADLESS |
| `Model.Draw` has an executable effect | Yes for the qualified BasicEffect Model XNB path |
| SpriteBatch Effect Begin has an executable effect | Yes; the real BasicEffect handle succeeds and is leased through End |

## Exact ABI matrix

`HEADER` and `LIB` refer to ABI-0.7 `effects.h` and the qualified artifact. “Rust: yes” means an
exact `cna-sys` declaration exists; it is not inferred from a similarly named high-level method.
All calls are synchronous on the attached game/callback thread. Device handles are callback-scoped
borrows. Returned Effect and reflection-view handles are owned and must be destroyed explicitly.

| Symbol | HEADER | LIB | Exact prototype | Ownership | TS import | Rust import |
| --- | --- | --- | --- | --- | --- | --- |
| `cna_effect_create_empty` | yes | yes | `(CNA_Handle device, CNA_EffectHandle* out)` | borrowed device; owned Effect out | yes | yes |
| `cna_effect_create_compiled` | yes | yes | `(CNA_Handle device, const uint8_t* bytes, uint64_t count, CNA_EffectHandle* out)` | bytes copied; owned Effect on success; invalid out on failure | yes | yes |
| `cna_effect_clone` | yes | yes | `(CNA_EffectHandle source, CNA_EffectHandle* out)` | borrowed source; owned clone out | yes | yes |
| `cna_effect_destroy` | yes | yes | `(CNA_EffectHandle effect)` | consumes owned Effect handle | yes | yes |
| `cna_effect_apply` | yes | yes | `(CNA_EffectHandle effect)` | borrowed live Effect for the call | yes | yes |
| `cna_effect_get_parameters` | yes | yes | `(CNA_EffectHandle effect, CNA_EffectParameterCollectionHandle* out)` | owned collection view retaining Effect | no (not needed by qualified stock graph) | yes |
| `cna_effect_get_techniques` | yes | yes | `(CNA_EffectHandle effect, CNA_EffectTechniqueCollectionHandle* out)` | owned collection view retaining Effect | yes | yes |
| `cna_effect_get_current_technique` | yes | yes | `(CNA_EffectHandle effect, CNA_EffectTechniqueHandle* out)` | owned technique view retaining Effect | yes | yes |
| `cna_effect_set_current_technique` | yes | yes | `(CNA_EffectHandle effect, CNA_EffectTechniqueHandle technique)` | both borrowed for call; same Effect identity required | yes | yes |
| technique collection count/get-at/destroy | yes | yes | `(collection, uint64_t* out)` / `(collection, uint64_t index, CNA_EffectTechniqueHandle* out)` / `(collection)` | owned collection and owned stable element views | yes | yes |
| technique name size/copy | yes | yes | `(technique, uint64_t* out)` / `(technique, char* dst, uint64_t cap, uint64_t* out)` | caller-owned UTF-8 buffer | yes | yes |
| `cna_effect_technique_get_index_ext` | yes | yes | `(CNA_EffectTechniqueHandle technique, uint32_t* out)` | borrowed technique | yes | yes |
| `cna_effect_technique_get_passes` | yes | yes | `(CNA_EffectTechniqueHandle technique, CNA_EffectPassCollectionHandle* out)` | owned collection view retaining technique/Effect | yes | yes |
| `cna_effect_technique_destroy` | yes | yes | `(CNA_EffectTechniqueHandle technique)` | consumes technique view, never parent Effect | yes | yes |
| pass collection count/get-at/destroy | yes | yes | `(collection, uint64_t* out)` / `(collection, uint64_t index, CNA_EffectPassHandle* out)` / `(collection)` | owned collection and owned stable pass views | yes | yes |
| pass name size/copy | yes | yes | `(pass, uint64_t* out)` / `(pass, char* dst, uint64_t cap, uint64_t* out)` | caller-owned UTF-8 buffer | yes | yes |
| `cna_effect_pass_get_annotations` | yes | yes | `(CNA_EffectPassHandle pass, CNA_EffectAnnotationCollectionHandle* out)` | owned annotation collection view | no | yes |
| `cna_effect_pass_apply` | yes | yes | `(CNA_EffectPassHandle pass)` | borrowed live pass; ownerless pass is documented successful no-op | yes | yes |
| `cna_effect_pass_destroy` | yes | yes | `(CNA_EffectPassHandle pass)` | consumes pass view, never parent Effect | yes | yes |
| `cna_effect_parameter_get_info` | yes | yes | `(CNA_EffectParameterHandle parameter, CNA_EffectParameterInfo* out)` | borrowed parameter; caller-owned versioned struct | no | yes |
| parameter elements/structure-members/annotations getters | yes | yes | `(CNA_EffectParameterHandle parameter, <collection-handle>* out)` | owned nested collection views | no | yes |
| parameter tagged scalar/array get | yes | yes | `(parameter, CNA_EffectValueType, void* out)` / `(parameter, type, uint64_t requested, void* dst, uint64_t cap, uint64_t* out)` | tagged caller-owned output storage | no | yes |
| parameter tagged scalar/array set | yes | yes | `(parameter, CNA_EffectValueType, const void* value)` / `(parameter, type, const void* values, uint64_t count)` | input copied synchronously | no | yes |
| parameter texture get/set | yes | yes | `(parameter, CNA_EffectTextureType, CNA_Handle* out)` / `(parameter, texture_type, CNA_Handle texture)` | getter returns retained handle; setter retains texture until cleared/destroyed | no | yes |
| parameter collection count/get-at/destroy | yes | yes | `(collection, uint64_t* out)` / `(collection, uint64_t index, CNA_EffectParameterHandle* out)` / `(collection)` | owned collection and owned stable element views | no | yes |
| annotation reflection (`get_info`, names, values, collection count/get/destroy) | yes | yes | exact typed functions in `effects.h` | owned annotation/collection views; caller-owned outputs | no | yes |

The parameter/annotation routes are real ABI surface and were audited even though CNA-TS did not
add speculative imports for them. The qualified stock Effects are native stock classes constructed
from the empty Effect base and report no compiled parameter graph; their public XNA stock state is
synchronized through typed stock interfaces. Compiled Effect creation fails with result 6 on this
renderer before a compiled reflection graph exists. Omitting those unused routes therefore does not
hide a qualified-runtime gap or justify claiming compiled execution.

## Stock-effect matrix

There is no separate stock “apply” symbol. Each stock constructor creates an owned
`CNA_EffectHandle`; state uses its exact typed interface setters, and execution uses
`cna_effect_apply` or an effect-owned `cna_effect_pass_apply` view.

| Strict API | Managed state | Native create route | Native apply route | HEADLESS status |
| --- | --- | --- | --- | --- |
| `BasicEffect` | matrices, fog, material, texture, vertex color, lighting and 3 lights | `cna_basic_effect_create(device, out)` | generic Effect/pass apply | construct + apply success |
| `AlphaTestEffect` | matrices, fog, diffuse/alpha, texture, vertex color, compare/reference alpha | `cna_alpha_test_effect_create(device, out)` | generic Effect/pass apply | construct + apply success |
| `DualTextureEffect` | matrices, fog, diffuse/alpha, two textures, vertex color | `cna_dual_texture_effect_create(device, out)` | generic Effect/pass apply | construct + apply success |
| `EnvironmentMapEffect` | matrices, fog, material, 2D/cube textures, environment terms, lighting and 3 lights | `cna_environment_map_effect_create(device, out)` | generic Effect/pass apply | construct + apply success |
| `SkinnedEffect` | matrices, fog, material, texture, bones/weights, lighting and 3 lights | `cna_skinned_effect_create(device, out)` | generic Effect/pass apply | construct + apply success |

Texture setters retain native textures. CNA-TS listens for texture disposal and clears the stock
slot before native texture destruction. Content teardown also unwinds recorded XNB disposables in
reverse construction order so effects release dependencies before textures/buffers.

## Compiled Effect result

`cna_effect_create_compiled` accepts copied XNA/FNA Direct3D 9 Effect Framework `.fxb` bytes or the
same XNB payload. It does not accept MGFX, shader source, GLSL, SPIR-V or Metal source. The exact
qualified artifact exports the route but reports the compiled-effects capability false. Three
calls with CNA's legal `CnaConformanceEffect.fxb` each returned structured result 6 and left no
owned output to dispose.

```text
compiled Effect binding route = VERIFIED_NATIVE
compiled Effect execution on HEADLESS = EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND
```

No successful shader execution or visible renderer output is claimed.

## Model and SpriteBatch

`Model.Draw` now follows the existing graph: mesh part buffer/index binding, BasicEffect matrix
updates, current technique/pass, `EffectPass.Apply`, then `DrawIndexedPrimitives`. The qualified
synthetic Model XNB succeeds on HEADLESS. No native Model renderer was added.

Effect-bearing `SpriteBatch.Begin` supplies the real Effect handle to
`cna_sprite_batch_begin_with_effect`. It checks same-device ownership and disposed state,
synchronizes stock state, leases the Effect until successful End, preserves null/default behavior,
and releases the lease if native Begin fails. Explicit disposal during an active interval is
rejected so CNA's SpriteBatch never holds a dangling Effect pointer.

## ABI/import result

The Node adapter changed from 280 to 360 imports: exactly 80 Effect ownership, reflection,
stock-construction and typed stock-state routes. The audit independently confirms:

```text
ABI_VERSION=0.7.0
NODE_BRIDGE_IMPORTED_SYMBOLS=360
MISSING_NODE_BRIDGE_SYMBOLS=0
NODE_BRIDGE_SIGNATURES_VERIFIED=360
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
QUALIFIED_LIBRARY_EXPORTED_FUNCTIONS=2861
MISSING_QUALIFIED_LIBRARY_IMPORTS=0
```

The generated compiler translation unit assigns every canonical function address to the bridge's
declared function-pointer type under `-Wall -Wextra -Werror`. This verifies pointer depth,
fixed-width signedness, POD-by-value layout, `CNA_Bool`, and callback/structure ABI. ABI 0.8 is not
accepted; runtime loading still requires encoded ABI `0x00000700`.

## CNA-Rust/CNA-TS consistency

CNA-Rust was not wrong about route presence. It imported the real Effect ABI earlier and used two
different construction paths:

- synthetic empty Effects can contain ownerless passes, whose native Apply is a documented
  successful no-op; this proves dispatch but not shader execution;
- native stock constructors produce effect-owned passes, and Rust's stock/pass stress proves real
  effect-owned pass activation.

CNA-TS previously had only a managed synthetic reflection graph and no native Effect, technique or
pass handle. Its documentation then incorrectly promoted that binding gap to
`UPSTREAM_CNA_BLOCKED`. Rust verified route dispatch with stronger native identity, while TS
required (but had not implemented) the ownership projection. After this run both bindings agree:
the pass/stock routes are real, compiled creation is real, and compiled execution is unavailable
only on the qualified HEADLESS renderer.

## Remaining unrelated ABI boundaries

The Effect reconciliation does not change the existing blockers for transient
`VideoPlayer.GetTexture`, standalone owned `GraphicsDevice` construction, browser/Wasm artifact
packaging, or buffer/render-target loss callbacks. No allocator-level ASan/LSan claim is made; the
evidence is deterministic handle teardown, repeated construction failure rollback, native stress,
and 60/600-frame qualification.
