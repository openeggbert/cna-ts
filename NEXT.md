# NEXT — measured session history

## 2026-08-22: canonical TypeScript consolidation

### Repository invariants

- `cna-ts` started clean at `553fe713e3de61d5a7a35296b84e2b7184328100`.
- `cna-ts-template` started clean at `6b6b533e0816dd15d8bc06088b23a0d84287ac96`.
- read-only `cna-js` started clean at `bcd6ee1effef38846af0883b6f93d3b137bb06cf`.
- read-only `cna-js-template` started clean at
  `bc88cc766929bff1743405b47cf3d9f58e46e39a`.
- `cna-cs` and `cna-java` already contained unrelated uncommitted work and were read only.

### Evidence gathered

- Legacy CNA-JS runtime source/tests matched the pre-conversion CNA-TS implementation; no unique
  binding code was found.
- Both templates carry the identical logo asset; the legacy JS template has no unique runtime.
- The actual CNA headers report C ABI 0.7.0. A declaration scan found 59 headers and 2,861 unique
  `CNA_C_API` functions.
- CNA contains Emscripten-aware platform/renderers and prior WebAssembly build evidence, but no
  packaged CNA C-ABI ESM loader/Wasm artifact was present and `emcc` was unavailable locally.
- The selected seven XNA assemblies matched the hashes recorded by the sibling verifier.
- Reflection extraction from those assemblies reported `REFERENCE_TYPES=257` and
  `REFERENCE_MEMBERS=2964`.

### Delivered and pushed

Commit `714336d` converts runtime ownership to TypeScript, pins TypeScript 5.9.2, emits ESM and
generated declarations/maps to `dist`, adds package subpaths, introduces tick-precise `TimeSpan`,
repairs initial value mutability/names, and adds runtime-independent tests/type probes.

Local verification used the official Node.js 22.14.0 Linux archive after matching its published
SHA-256:

```text
tsc -p tsconfig.json                 PASS
tsc -p tsconfig.types.json           PASS
node --test                          PASS (6 tests)
npm pack --dry-run --ignore-scripts  PASS (61 files at this checkpoint)
git diff --check                     PASS
```

### Immediate next gates

The CLR extractor/profile, TypeScript-AST verifier, runtime-symbol verifier, and leak gate landed in
the next thematic change. Its first report-only baseline is:

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=264
TARGET_TYPES=7
TOTAL_DIFFERENCES=443
MISSING_TYPE=257
MISSING_MEMBER=184
INTERFACE_MISMATCH=1
OVERLOAD_MISMATCH=1
all other structural/signature/enum/mapping/leak categories=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
```

The strict verifier exits 1 as intended. Immediate next gates are the coherent math/value group,
differential fixtures, packed consumers/template, and one real CNA backend artifact.

## 2026-08-22: first coherent value/geometry group

The runtime-independent foundation now includes mutable Vector2/3/4, Matrix, Quaternion,
MathHelper, Color packed-vector behavior, Point, Rectangle, Plane, Ray, BoundingBox,
BoundingSphere, and BoundingFrustum. Constructors snapshot struct-like inputs at API boundaries;
array and allocating corner overloads are both exercised.

The verifier learned TypeScript generic type parameters, inferred field types, enum literal values,
and the public structural-interface projection required when CLR uses an explicit interface
implementation. No per-member exception was added. The measured post-foundation baseline is:

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=264
TARGET_TYPES=23
TOTAL_DIFFERENCES=450
MISSING_TYPE=241
MISSING_MEMBER=209
all other structural/signature/enum/mapping/leak categories=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
```

The larger difference total versus the seven-type baseline is expected: a missing type is one
diagnostic, while making it present exposes each still-missing member. The strict gate remains
nonzero and therefore truthful.

Package verification now creates the exact `cna-ts-0.1.0.tgz`, installs it without sibling paths
into fresh JavaScript and TypeScript consumers, executes the JavaScript consumer, compiles the
strict TypeScript consumer with `skipLibCheck=false`, checks all four public package entry points,
and proves `cna-ts/internal/backend` is blocked by `exports`.

## 2026-08-22: canonical template consolidation

`cna-ts-template` commit `d66690a` removes the stale `@openeggbert/cna-js` import, preview package
version, CommonJS/ESM conflict, fake renderer capability probing, three-frame pseudo-smoke, and
decorative Electron/Capacitor dependencies and claims. The identical unused PNG was deleted rather
than misrepresented as XNB content.

The template pins `cna-ts` 0.1.0, TypeScript 5.9.2, and Vite 8.2.2 (whose published Node engine is
`^20.19.0 || >=22.12.0`). Its maintained source is TypeScript. `tools/create-project.mjs` emits
either that source or ordinary transpiled JavaScript; the latter has no TypeScript source or
TypeScript dependency. Verification against the exact packed artifact reported:

```text
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
```

The canary reports browser bundling separately from native runtime availability. Browser CNA,
Electron, Android, and iOS remain unverified; the exact blocker is still the absent packaged CNA
C-ABI ESM/Wasm artifact.

## 2026-08-22: first XNA differential corpus

A neutral 26-observation JSON corpus now carries XNA 4.0 Windows runtime expected results into
CNA-TS. Finite floats, infinities, and signed zero compare binary32 bits; NaN compares
classification because JavaScript cannot guarantee CLR NaN payload/sign preservation.

The new gate exposed and fixed behavior that tolerance-only tests missed:

- XNA float operation grouping for quaternion multiply/slerp/conversion and math splines;
- fixed-adjugate `Matrix.Invert`, including NaNs rather than an exception for singular matrices;
- `MathHelper.WrapAngle` IEEE remainder and Hermite's infinity-at-endpoint behavior;
- `Color` UNorm round-to-even, midpoint interpolation, packed infinity/NaN handling, and XNA's
  white-with-zero-alpha `Transparent`;
- NaN-aware box comparisons, strict tangent sphere intersection, boundary containment, negative
  radius validation, Ritter-style `CreateFromPoints`, ray epsilon behavior, and near-unit planes.

```text
XNA_DIFFERENTIAL_OBSERVATIONS=26
XNA_DIFFERENTIAL_ASSERTIONS=27
XNA_DIFFERENTIAL_FAILURES=0
```

## 2026-08-22: reproducible CNA C ABI audit

`tools/audit-cna-abi.mjs` now verifies an explicit read-only CNA checkout instead of preserving the
old claim that canonical exports do not exist. At CNA revision
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`, it reports ABI 0.7.0, 59 public headers, 2,861 unique
functions, and zero missing symbols from the 32-route first executable slice spanning version/error,
lifecycle, graphics, Texture2D, SpriteBatch, input, content, and audio.

The same audit reports zero tracked `.wasm` files, zero C-API ESM loaders, and no local `emcc` or
`emcmake`. `docs/cna-abi-audit.md` therefore records the exact Emscripten artifact/loader contract
needed next. No unavailable backend was replaced with a fake implementation, and no CNA ABI route
is claimed as executed yet.

## 2026-08-22: backend-independent native ownership state machine

`src/internal/ownership.ts` now models opaque handles as private bigint values with explicit
owned, borrowed, parent-owned, and adopted states. Disposal is idempotent; callback registrations
tear down before reverse-ordered children and the parent release; borrowed wrappers never release;
transfer invalidates the source wrapper; and partial construction rolls back in reverse order.
Sibling cleanup continues when an individual release fails, but parent release is blocked until
the failed child succeeds on retry. Failed partial-construction rollback likewise retains only the
resources still requiring release.

The module remains unreachable through package `exports`. Its tests use synthetic handles and
release callbacks only: they prove binding lifetime logic without claiming that CNA native code ran.

## 2026-08-22: final measured gates

The final source state passed strict TypeScript build/type checking and five Node test files. The
neutral XNA behavior corpus passed all 26 observations and 27 assertions. The structural verifier
intentionally exited 1 with the truthful incomplete baseline:

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=264
TARGET_TYPES=23
TOTAL_DIFFERENCES=450
MISSING_TYPE=241
MISSING_MEMBER=209
all other diagnostic categories=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
INTERNAL_LEAK=0
```

The exact `cna-ts-0.1.0.tgz` passed fresh plain-JavaScript and strict-TypeScript consumer tests,
including the blocked internal subpath. Fresh generated template projects then reported TypeScript
build PASS, JavaScript build PASS, JavaScript managed smoke PASS, and zero legacy/sibling
references. No native/Wasm or browser frame smoke ran because the audited artifact remains absent.

End-of-session checks found `cna-ts` and `cna-ts-template` clean and synchronized with their
`origin/develop` branches. Both read-only legacy worktrees were still clean at their exact starting
HEADs, so the measured legacy worktree change count is zero.

## 2026-08-22: coherent XNA implementation expansion

This run began from the 23-target hard baseline above and moved from verifier infrastructure into
coherent managed XNA implementation. The completed groups are:

- the remaining mapped math/geometry members, including exact binary32 grouping, array transforms,
  hashes/strings, frustum planes/corners/intersections, and XNA singular/NaN behavior;
- `Curve`, `CurveKey`, `CurveKeyCollection`, `CurveLoopType`, `CurveContinuity`, and
  `CurveTangent` as one behavior-tested group;
- all 17 selected packed values with nearest-even packing, signed/unsigned normalization, half
  saturation, packed storage width, equality, hash, and string contracts;
- the complete selected input/touch value profile: enums/flags, keyboard/mouse snapshots,
  gamepad buttons/D-pad/triggers/thumbsticks/state/capabilities, touch values/collection/enumerator,
  and polling facades that fail explicitly through the unavailable backend;
- typed events, component interfaces, `GameComponent`, `GameComponentCollection`, stable
  update/draw ordering, `GameServiceContainer`, `LaunchParameters`, and the managed `Game` pipeline;
- `GameWindow`, `ContentManager`/`ContentLoadException`, `Viewport`, graphics presentation enums,
  `PresentationParameters`, and backend-created display-mode snapshots/collections.

`ContentManager` implements root-directory, case-insensitive clean-name caching, class-token type
checks, disposable tracking, unload, and disposal. Its base XNB read path remains explicitly
unavailable. Raw PNG is still not treated as XNB content. `Game.GraphicsDevice` is intentionally the
sole missing member on a present type: adding its 57-member resource-dependent class as a throwing
shell would violate the coherent-group rule.

### Shared neutral behavior corpus

The neutral inputs came from the Ms-PL CNA-C# `MathBehaviorCorpus` and `InputBehaviorCorpus`.
Expected observations were produced from the XNA 4.0 Windows reference source/IL and carried by the
normalized sibling corpus; CNA-C# implementation code was not used as the specification. CNA-TS
executes the cases independently and compares finite values/infinities/signed zero by binary32 bits,
with NaN compared by classification.

```text
STARTING_OBSERVATIONS=26
FINAL_OBSERVATIONS=106
MATH_GEOMETRY_OBSERVATIONS=83
INPUT_TOUCH_OBSERVATIONS=23
FINAL_ASSERTIONS=107
FAILURES=0
```

Covered groups are `MathHelper`, Vector2/3/4, Matrix, Quaternion, Color, Point, Rectangle, Plane,
Ray, BoundingBox/Sphere/Frustum, curves, packed vectors, KeyboardState, MouseState, GamePad value
semantics, and touch values/collections.

### Strict API result

The seven reference assemblies and their member total did not change. Expected mapped types rose
from 264 to 271 only because the verifier now machine-models the necessary synthetic projections
`IComparable`, `EventArgs`, `XnaEvent`, `XnaEventHandler`, `XnaType`, `IServiceProvider`, and
`XnaAction`. No allowlist was introduced.

```text
                         BEFORE  AFTER
REFERENCE_TYPES             257    257
REFERENCE_MEMBERS          2964   2964
EXPECTED_MAPPED_TYPES       264    271
TARGET_TYPES                 23    104
TOTAL_DIFFERENCES           450    168
MISSING_TYPE                241    167
MISSING_MEMBER              209      1

UNEXPECTED_TYPE               0      0
BASE_MISMATCH                 0      0
INTERFACE_MISMATCH            0      0
UNEXPECTED_MEMBER             0      0
PROPERTY_MISMATCH             0      0
PARAMETER_MISMATCH            0      0
RETURN_TYPE_MISMATCH          0      0
OVERLOAD_MISMATCH             0      0
GENERIC_MISMATCH              0      0
ENUM_VALUE_MISMATCH           0      0
EVENT_MAPPING_MISMATCH        0      0
OPERATOR_MAPPING_MISMATCH     0      0
LANGUAGE_MAPPING_MISMATCH     0      0
ALLOWLIST_SIZE                0      0
RUNTIME_DIFFERENCES           0      0
INTERNAL_LEAK                 0      0
```

Verifier changes were evidence-driven: input-only `ref` projection, CLR collection inheritance,
events, `Content.Load` type tokens, the JavaScript iterable protocol, and erased abstract runtime
slots are now modeled explicitly. Generic-constraint depth remains known future work; it was not
weakened or used to suppress a current diagnostic.

### Backend and platform status

The private backend now defines typed executable operations for ABI/error access, Game lifecycle,
graphics manager/device borrowing, clear/present, Texture2D/SpriteBatch creation and destruction,
and input. An internal test backend executes the managed Game route
`initialize -> create -> exit -> run -> one-frame -> destroy` and proves that the owned handle is
released through `NativeResourceLifetime`; it is not a public test injection API.

| Platform | Source/build evidence | Managed runtime | CNA runtime |
| --- | --- | --- | --- |
| Browser/WASM | CNA headers and Emscripten-aware source audited; generated Vite bundles pass | bundle only, no browser frame claim | blocked: no packaged C-ABI ESM/Wasm artifact and no local Emscripten toolchain |
| Node managed | package, tests, differential corpus, and generated JS smoke pass | verified | unavailable by design |
| Node CNA native | isolated unmodified HEADLESS C-API configure passed | n/a | blocked during build at renderer identity assertion `49 == 50`; no shared library |
| Electron | no application build | not verified | planned |
| Android | no application build | not verified | planned |
| iOS | no application build | not verified | planned |

No real CNA ABI function was executed in this run. The isolated native build used CNA revision
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`, ABI 0.7.0, and stopped in
`modules/c-api/src/CnaCApiCoreExt.cpp:250` before producing `libcna_c_api.so`. Upstream CNA was not
modified and no FFI dependency was added.

### Final gates and package

`npm run check`, all nine Node test files, `npm run test:differential`, `npm run api:report`,
`npm run verify:runtime`, `npm run verify:leaks`, `npm run verify:package`, the 32-symbol CNA ABI
audit, and `git diff --check` passed at the measured state. The report-only API command remains
truthfully nonzero in content because 168 APIs are still absent, while the command itself succeeds
as designed.

The exact final package artifact is:

```text
NAME=cna-ts-0.1.0.tgz
SHA256=096c4785f6978bff5b7c8479c96948b91c4287f93a9eca9627d0c8b77fe6a014
FILES=320
PACKED_JAVASCRIPT_CONSUMER=PASS
PACKED_TYPESCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
```

Both generated template forms installed that same tarball. The canary now exercises components,
services, keyboard snapshots, and matrix/vector behavior while retaining its explicit statement
that it is not yet a playable CNA game.

## 2026-08-22: graphics/resource expansion starting inventory

The strict verifier was rerun against all seven SHA-256-pinned XNA 4.0 Windows reference
assemblies before implementation. `tools/api-compat/missing-type-inventory.mjs` groups its exact
`MISSING_TYPE` diagnostics; the generated Markdown and JSON queues live in
`docs/missing-type-inventory.*` and are not maintained by hand.

| Family | Starting missing types |
| --- | ---: |
| Framework/core | 4 |
| Graphics foundation | 13 |
| Graphics resources | 10 |
| Graphics states | 15 |
| Vertex/buffer | 18 |
| SpriteBatch/font | 4 |
| Effects | 21 |
| Models | 12 |
| Content readers | 10 |
| Audio/XACT | 19 |
| Media | 24 |
| Storage | 3 |
| GamerServices/other selected-profile runtime types | 14 |
| **Total** | **167** |

The measured Framework/core queue is exactly `DrawableGameComponent`, `FrameworkDispatcher`,
`TitleContainer`, and the synthetic `TryResult` projection. `TitleLocation` is not present in this
selected profile. The only selected GamerServices type is `GamerServicesComponent`; Net and the
rest of GamerServices remain outside this profile.

## 2026-08-22: foundational graphics graph and first real CNA-TS runtime

### Exact missing-type queue

The generated queue, not a handwritten list, measured these changes:

| Family | Before | After |
| --- | ---: | ---: |
| Framework/core | 4 | 0 |
| Graphics foundation | 13 | 0 |
| Graphics resources | 10 | 0 |
| Graphics states | 15 | 0 |
| Vertex/buffer | 18 | 0 |
| SpriteBatch/font | 4 | 4 |
| Effects | 21 | 21 |
| Models | 12 | 12 |
| Content readers | 10 | 10 |
| Audio/XACT | 19 | 19 |
| Media | 24 | 24 |
| Storage | 3 | 3 |
| GamerServices/other selected-profile runtime types | 14 | 14 |
| **Total** | **167** | **107** |

The completed missing-type queues comprise the Framework stragglers; device/adapter/presentation
foundation; `GraphicsResource` and texture/render-target declarations; all graphics states and
stock presets; and vertex declarations/values plus static/dynamic buffer declarations. “Queue at
zero” means every mapped declaration is present, not that every native capability is implemented.
Texture3D/Cube, render targets, buffer transfer, adapter discovery, device-status queries, and
nontrivial device operations still fail explicitly where the 50-symbol backend slice has no route.

`GraphicsDeviceManager` now owns configuration and native manager lifecycle, `GraphicsDevice`
resolves its callback-scoped borrowed handle rather than retaining it, and resource wrappers retain
the one creating device identity. `Game.GraphicsDevice` is implemented, so missing members reached
zero. Texture2D is real for validated creation, dimensions/mips/device identity, deterministic
destroy, and parent shutdown. Generic SetData/GetData, encoded stream load/save, and raw byte
packing remain unavailable pending an explicit TypeScript representation and imported transfer
routes. The strict public SpriteBatch/effect dependency graph was not added as a shell.

### Strict API result

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=271
TARGET_TYPES=164

TOTAL_DIFFERENCES=107
MISSING_TYPE=107
MISSING_MEMBER=0

UNEXPECTED_TYPE=0
BASE_MISMATCH=0
INTERFACE_MISMATCH=0
UNEXPECTED_MEMBER=0
PROPERTY_MISMATCH=0
PARAMETER_MISMATCH=0
RETURN_TYPE_MISMATCH=0
OVERLOAD_MISMATCH=0
GENERIC_MISMATCH=0
ENUM_VALUE_MISMATCH=0
EVENT_MAPPING_MISMATCH=0
OPERATOR_MAPPING_MISMATCH=0
LANGUAGE_MAPPING_MISMATCH=0
INTERNAL_LEAK=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
```

The verifier gained machine-readable expected-contract output, structural `IDisposable`, inherited
TypeScript overload-set projection, and erasure of CNA-internal resource marker interfaces. No
allowlist or weakened expected signature was introduced.

### Real Node CNA evidence

Before rebuilding upstream, the run found the compatible library already produced by the sibling
Java verification:

```text
LIBRARY=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a64
LIBRARY_SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
PLATFORM=Linux x86-64 HEADLESS/NULL-audio
REPORTED_CNA_ABI=0.7.0
NODE_BRIDGE=N-API C adapter with runtime dynamic loading
IMPORTED_CNA_SYMBOLS=50
```

The adapter uses only CNA C ABI headers/routes, exact ABI equality, bigint handles, caller-owned
UTF-8 error buffers, synchronous callback trampolines, and explicit destruction. It is source-only
in the package; neither this temporary library path nor a compiled `.node` binary is distributed.

`npm run test:native` contains six native scenarios (reported by Node as one isolated TAP top-level)
and completed six CNA game lifetimes:

```text
REAL_CNA_ABI_FUNCTION_EXECUTED=yes
GAME_LIFECYCLE=CNA native verified
GRAPHICS_DEVICE=CNA native verified for borrow/clear/present and renderer queries
TEXTURE2D=CNA native verified for create/destroy and ownership
SPRITEBATCH=CNA native verified for create/destroy only; strict public API still planned
INPUT_POLLING=CNA native verified for keyboard/mouse/gamepad/touch HEADLESS snapshots
60_FRAMES=PASS
600_FRAMES=PASS
DOUBLE_DISPOSE=PASS
PARENT_SHUTDOWN_WITH_LIVE_TEXTURE=PASS
REPEATED_GAME_CREATE_DESTROY=PASS (3 additional lifetimes)
RENDERER=HEADLESS (queried from CNA)
```

Current CNA HEAD `1bb2145d99ed572dd4eb15009c34e2e5f410fcf0` still fails the previously
documented unmodified C-API build guard (`49 == 50`). The compatible artifact proves CNA-TS runtime
integration but does not remove the reproducible-build blocker. Browser/Wasm remains blocked by
zero tracked C-API Wasm artifacts/loaders and no local Emscripten toolchain.

### Feature status

| Group | Status |
| --- | --- |
| Game.GraphicsDevice | managed + CNA native verified |
| GraphicsDeviceManager | complete mapped declaration; CNA configuration/lifecycle verified |
| GraphicsDevice | complete mapped declaration; imported operations verified, remainder explicit |
| GraphicsAdapter | complete mapped declaration; native adapter discovery unavailable |
| GraphicsResource | managed ownership/identity verified; real Texture2D child verified |
| Texture2D | partial native functionality as described above |
| SpriteBatch | native create/destroy verified internally; strict public type planned |
| States | managed verified; real device binding planned |
| Buffers | declaration/managed validation verified; native allocation/transfer planned |
| Effects | planned (21 missing types) |
| Models | planned (12 missing types) |
| Browser | blocked/unverified |

### Final gates and exact package

The final managed/API gates passed: strict TypeScript check, 10 pure-managed Node files, the
unchanged 106-observation/107-assertion differential corpus, report-only API measurement, runtime
symbols, leak guard, 50-symbol bridge audit, package consumers, and both generated template forms.
Strict API verification exited 1 as intended because 107 types remain missing; it reported no
other category.

The exact final artifact was then reused, not repacked between consumers:

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-final-pack.4FMhY2/cna-ts-0.1.0.tgz
SHA256=6286371bb50ecf1a56529ec812716d676a5bae9d857c5250fd09d6d3ac7aa37b
FILES=484
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
```

The sibling template also passed its new opt-in Node-native smoke against that installed tarball
at both 60 and 600 frames, reporting the CNA renderer as `HEADLESS`. Its browser canary and browser
support statement were left unchanged: no C-ABI Wasm/ESM artifact was available or executed.

## 2026-08-23: real graphics/content vertical slice

### Exact strict contract movement

The run began by regenerating the stale inventory from a strict verifier JSON. Its exact 107
`MISSING_TYPE` names matched the generated Markdown and JSON before implementation. The final
verifier JSON at `/tmp/cna-ts-final-api-report.json` and both regenerated inventories again contain
the same exact diagnostic list, now 60 names.

```text
                                      BEFORE   AFTER
REFERENCE_TYPES                         257      257
REFERENCE_MEMBERS                      2964     2964
EXPECTED_MAPPED_TYPES                   271      271
TARGET_TYPES                            164      211
TOTAL_DIFFERENCES                       107       60
MISSING_TYPE                            107       60
MISSING_MEMBER                            0        0
UNEXPECTED_TYPE                           0        0
BASE_MISMATCH                             0        0
INTERFACE_MISMATCH                        0        0
UNEXPECTED_MEMBER                         0        0
PROPERTY_MISMATCH                         0        0
PARAMETER_MISMATCH                        0        0
RETURN_TYPE_MISMATCH                      0        0
OVERLOAD_MISMATCH                         0        0
GENERIC_MISMATCH                          0        0
ENUM_VALUE_MISMATCH                       0        0
EVENT_MAPPING_MISMATCH                    0        0
OPERATOR_MAPPING_MISMATCH                 0        0
LANGUAGE_MAPPING_MISMATCH                 0        0
INTERNAL_LEAK                             0        0
ALLOWLIST_SIZE                            0        0
RUNTIME_DIFFERENCES                       0        0
```

| Missing family | Before | After |
| --- | ---: | ---: |
| SpriteBatch/font | 4 | 0 |
| Effects | 21 | 0 |
| Models | 12 | 0 |
| Content readers | 10 | 0 |
| Audio/XACT | 19 | 19 |
| Media | 24 | 24 |
| Storage | 3 | 3 |
| Design/GamerServices/other | 14 | 14 |
| **Total** | **107** | **60** |

No implemented type ended with a missing member. `ReadOnlyCollection<T>` erasure plus explicit
inherited read-only surface projection is now a formal mapping rule for Model collections; no
allowlist was introduced.

### Implemented families and capability boundaries

| Surface | Status | Exact evidence or boundary |
| --- | --- | --- |
| Texture2D transfer | verified | Color and mapped packed/typed representations; mip, region, start/count validation; native Color region/mip round trips |
| Texture2D FromStream | verified | PNG byte stream decoded by CNA; PNG encode copied into caller capacity; JPEG route present |
| SpriteBatch public API | verified | strict typed Begin/Draw/End overloads and deterministic validation/ownership |
| SpriteBatch native Draw | verified | real CNA batched submit at 60 and 600 frames |
| Effect | verified | owned parent plus stable borrowed reflection views and clone isolation |
| EffectParameter | verified | typed scalar/vector/matrix/array/texture value overloads and snapshots |
| EffectTechnique | verified | stable collection/name identity and wrong-parent assignment rejection |
| EffectPass reflection | verified | stable parent-owned views and disposal behavior |
| EffectPass.Apply | blocked | no effect execution routes imported; never a no-op |
| BasicEffect | verified | complete managed matrices/fog/light/material/texture state and cloning |
| BasicEffect execution / 3D | blocked | bridge lacks effect/indexed-draw routes; HEADLESS compiled-effects bit is false |
| ContentReader | verified | XNB framing, primitive reads, reader indexes, shared fixups, disposal tracking |
| ContentTypeReader | verified | versioned table activation and existing-instance dispatch |
| custom readers | verified | user class/reader selected through public `cna-ts/extensions` registration and normal XNB table |
| shared resources | verified | deferred root finalization and invalid-index/truncation cleanup coverage |
| XNB | verified | uncompressed Windows XNB v5, synthetic legal custom/SpriteFont/Model fixtures |
| compressed XNB / external references | blocked | LZX and general external-reference resolution remain explicit errors |
| ResourceContentManager | verified | byte resource snapshots feed the same managed reader pipeline |
| SpriteFont | verified | real atlas/glyph/cropping/kerning/character graph and MeasureString |
| DrawString | verified | real glyph commands submitted through native SpriteBatch |
| Model | verified | stable bone/mesh collections, transforms, effects, and content graph |
| ModelMesh | verified | stable parent/part/effect graph; draw execution remains blocked |
| ModelMeshPart | verified | real native vertex/index buffers and managed effect relationships from XNB |
| model rendering | blocked | EffectPass.Apply and indexed drawing are not imported |

The differential gate grew without changing any existing expected value:

```text
OBSERVATIONS=114
ASSERTIONS=115
FAILURES=0
NEW_GRAPHICS_CONTENT_OBSERVATIONS=8
```

### Native bridge and runtime evidence

The bridge grew only for completed work:

```text
STARTING_IMPORTED_SYMBOLS=50
FINAL_IMPORTED_SYMBOLS=69
TEXTURE2D_NEW_SYMBOLS=6
SPRITEBATCH_NEW_SYMBOLS=3
VERTEX_INDEX_BUFFER_NEW_SYMBOLS=10
ABI_VERSION=0.7.0
```

The working external evidence artifact remains:

```text
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
LIBRARY_SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
ELF_BUILD_ID=f2ef34a34f7620d3627fef68bf55aed0f883f168
PLATFORM=Linux x86-64 HEADLESS/NULL-audio
EXPORTED_CNA_SYMBOLS=2861
```

Six real CNA game lifetimes cover 60/600 frames, live-child parent shutdown, three repeated game
lifetimes, double disposal, Texture2D transfers and encoded images, SpriteBatch cycles,
SpriteFont/DrawString, content-loaded resource disposal, and Model XNB vertex/index resources.
Actual renderer flags report custom effects available and compiled effects unavailable; CNA-TS has
not imported custom-effect execution routes.

| Runtime evidence | Status |
| --- | --- |
| 2D drawing | verified |
| 60 real draw frames | verified |
| 600 real draw frames | verified |
| Effect execution | blocked |
| BasicEffect / 3D | blocked |
| uncompressed XNB content loading | verified |
| SpriteFont / DrawString | verified |
| model loading | verified |
| model rendering | blocked |

Current read-only CNA HEAD remains
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`. A clean unmodified C-API build was repeated in
`/tmp/cna-ts-cna-head-20260823`; configure passed, then compilation failed at
`modules/c-api/src/CnaCApiCoreExt.cpp:250` with the same renderer identity assertion
`49 == 50`. CNA source was not modified and no current-HEAD library was produced.

### Exact package, template, and platforms

One produced artifact was reused for every packed consumer and template check:

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-final-20260823/cna-ts-0.1.0.tgz
SHA256=639cf0df2d751b8f1f02886f25203babd34be95de377ad46da6606f866b96050
FILES=572
BYTES=271684
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
TEMPLATE_60_NATIVE_DRAW_FRAMES=PASS
TEMPLATE_600_NATIVE_DRAW_FRAMES=PASS
```

The template's maintained `HelloGame` now performs real PNG `FromStream`, moving-sprite state,
Clear, SpriteBatch Begin/Draw/End, keyboard/mouse/gamepad polling, and deterministic disposal. Its
browser claims are unchanged.

| Platform | Status |
| --- | --- |
| Node managed | verified |
| Node CNA native (Linux x86-64 HEADLESS) | verified |
| Browser/Wasm | blocked |
| Electron | not attempted |
| Android | not attempted |
| iOS | not attempted |

Final gates passed: `npm run check`, `npm test`, `npm run test:differential`, `npm run api:report`,
`npm run api:verify`, `npm run api:inventory`, `npm run verify:runtime`, `npm run verify:leaks`,
`npm run verify:package -- --package <exact tarball>`, `npm run audit:cna-abi`, native integration,
template builds/smokes, and both repositories' `git diff --check`.

## 2026-08-23: selected Windows runtime projection reaches strict zero

### Exact API movement

This run began from the generated 60-type queue and implemented the remaining families as coherent
groups. The inventory was regenerated from verifier diagnostics; it now reports zero in every
family.

```text
                                      BEFORE   AFTER
REFERENCE_TYPES                         257      257
REFERENCE_MEMBERS                      2964     2964
EXPECTED_MAPPED_TYPES                   271      271
TARGET_TYPES                            211      271
TOTAL_DIFFERENCES                        60        0
MISSING_TYPE                             60        0
MISSING_MEMBER                            0        0
UNEXPECTED_TYPE                           0        0
BASE_MISMATCH                             0        0
INTERFACE_MISMATCH                        0        0
UNEXPECTED_MEMBER                         0        0
PROPERTY_MISMATCH                         0        0
PARAMETER_MISMATCH                        0        0
RETURN_TYPE_MISMATCH                      0        0
OVERLOAD_MISMATCH                         0        0
GENERIC_MISMATCH                          0        0
ENUM_VALUE_MISMATCH                       0        0
EVENT_MAPPING_MISMATCH                    0        0
OPERATOR_MAPPING_MISMATCH                 0        0
LANGUAGE_MAPPING_MISMATCH                 0        0
INTERNAL_LEAK                             0        0
ALLOWLIST_SIZE                            0        0
RUNTIME_DIFFERENCES                       0        0
```

```text
STRICT_XNA_WINDOWS_RUNTIME_PROJECTION_ZERO=true
```

| Family | Before | After |
| --- | ---: | ---: |
| Audio/XACT | 19 | 0 |
| Media | 24 | 0 |
| Storage | 3 | 0 |
| Design | 13 | 0 |
| GamerServices | 1 | 0 |
| **Total** | **60** | **0** |

All introduced types finished member-complete. The mapping allowlist remains empty and no
expected signature was weakened.

### Behavior corpus

The reference-backed Audio group adds exact enum/default/vector observations, XNA-ordered
binary32 `SoundEffect.GetSampleDuration`/`GetSampleSizeInBytes` arithmetic, and constructor
validation. The subsystem projection group adds deterministic instance lifecycle/disposal, media
collection identity, global MediaPlayer state/events/settings, isolated managed Storage path
behavior, and Design conversion/decomposition.

```text
STARTING_OBSERVATIONS=114
FINAL_OBSERVATIONS=168
STARTING_ASSERTIONS=115
FINAL_ASSERTIONS=169
FAILURES=0
NEW_AUDIO_REFERENCE_OBSERVATIONS=47
NEW_SUBSYSTEM_PROJECTION_OBSERVATIONS=7
```

Asset-dependent and hardware-dependent behavior is not encoded as a deterministic golden value.

### Native bridge and runtime truth

The typed bridge grew from 69 to 219 exact ABI-0.7 imports. Every imported name is declared by the
audited current CNA headers.

```text
STARTING_IMPORTED_SYMBOLS=69
FINAL_IMPORTED_SYMBOLS=219
AUDIO_ROUTES=43
XACT_ROUTES=46
MEDIA_ROUTES=23
VIDEO_ROUTES=11
STORAGE_ROUTES=27
ABI_VERSION=0.7.0
MISSING_NODE_BRIDGE_SYMBOLS=0
NATIVE_SCENARIO_GROUPS=7
```

The external runtime evidence artifact was not shipped:

```text
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
LIBRARY_SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
PLATFORM=Linux x86-64 HEADLESS/NULL-audio
EXPORTED_CNA_SYMBOLS=2861
```

| Runtime operation | Status | Boundary |
| --- | --- | --- |
| SoundEffect | verified | PCM creation, globals, instances, Apply3D and deterministic disposal; NULL playback is not an audibility claim |
| DynamicSoundEffectInstance | verified | submit/pending/refill through the canonical framework pump |
| XACT authored-bank playback | asset-pending | invalid/missing XGS behavior is verified; no legal XGS/XSB/XWB fixture was available |
| MediaPlayer | verified | generated legal silent WAV, controls, queue/settings/position/visualization under NULL audio |
| VideoPlayer | backend-blocked | player controls are verified; no legal decode fixture and no safe player-owned transient texture facade |
| Storage | verified | native selector/device/container CRUD and managed isolated-directory adapter |

HEADLESS enumerated zero microphones, so the strict Microphone shape and unavailable state are
complete while hardware capture is not claimed verified. No audio/media callback registration is
imported; dynamic and media work is delivered on the JavaScript thread by the single Game/
FrameworkDispatcher pump. A successful Game update pumps once; a throwing update skips the pump.

### Ownership truth

| Relationship | Status | Evidence |
| --- | --- | --- |
| SoundEffect → SoundEffectInstance | verified | parent-owned native child, child-first and parent-first disposal, double Dispose, cached properties after disposal |
| AudioEngine → category/bank/cue | verified | strong managed dependencies and reverse deterministic teardown; authored success remains asset-pending |
| Dynamic callbacks | verified | rooted managed handler, self-removal, reentrant submit, throwing handler containment, disposal with pending buffers |
| VideoPlayer → frame texture | backend-blocked | `GetTexture` fails explicitly instead of wrapping a player-owned transient CNA texture as owned |
| StorageDevice → StorageContainer | verified | repeated container identity and parent shutdown invalidation on the native route |
| backend shutdown | verified | live Audio, VideoPlayer, and Storage children are invalidated/released before Game destruction |

Explicit `Dispose` remains authoritative; normal cleanup does not depend on JavaScript finalizers.

### CNA HEAD and unchanged blockers

Read-only CNA HEAD remains `1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`. Its unmodified C-API
build still fails the renderer identity assertion (49 C identities versus 50 canonical entries),
so the exact compatible ABI-0.7 artifact above remains test evidence only. CNA was not modified and
ABI 0.8 was not accepted.

The prior truthful boundaries are unchanged: `EffectPass.Apply`, BasicEffect/3D execution,
compressed XNB/LZX, generic external references, and model rendering remain blocked.

### Exact final package and template

One final artifact was reused for every packed consumer and template check:

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-strict-zero-20260823.ZA0H8D/cna-ts-0.1.0.tgz
SHA256=f51ca05a569c2251806e307021c37fbf77fbafaaf0d4f81ee890f30e7d603bdd
FILES=676
BYTES=345746
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
TEMPLATE_BUILD=PASS
TEMPLATE_60_NATIVE_DRAW_FRAMES=PASS
TEMPLATE_600_NATIVE_DRAW_FRAMES=PASS
```

Generated `.js`, `.d.ts`, source maps, and declaration maps remain outputs of the one canonical
TypeScript source tree. The template only removed its redundant explicit dispatcher call because
`Game` now owns the canonical per-update pump; it did not add fake Audio, Media, or Video demos.

Platform evidence remains Node managed plus Node CNA native on Linux x86-64 HEADLESS/NULL audio.
Browser/Wasm, Electron, Android, and iOS remain unverified.

## 2026-08-23: strict-zero runtime-fidelity qualification

This continuation did not add public XNA surface. It strengthened what strict zero measures,
implemented the two managed content blockers, separated runtime capability from API shape, and
made the package/CI boundary reproducible and explicit. The generated evidence is committed as
`docs/api-compat-report.json`, `docs/runtime-symbol-report.json`,
`docs/internal-leak-report.json`, `docs/missing-type-inventory.*`,
`docs/runtime-capabilities.*`, and `docs/cna-abi-report.json`.

### Strict API and verifier depth

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=271
TARGET_TYPES=271
TOTAL_DIFFERENCES=0
MISSING_TYPE=0
MISSING_MEMBER=0
UNEXPECTED_TYPE=0
BASE_MISMATCH=0
INTERFACE_MISMATCH=0
UNEXPECTED_MEMBER=0
PROPERTY_MISMATCH=0
PARAMETER_MISMATCH=0
RETURN_TYPE_MISMATCH=0
OVERLOAD_MISMATCH=0
GENERIC_MISMATCH=0
ENUM_VALUE_MISMATCH=0
EVENT_MAPPING_MISMATCH=0
OPERATOR_MAPPING_MISMATCH=0
LANGUAGE_MAPPING_MISMATCH=0
INTERNAL_LEAK=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
STRICT_BASELINE_ASSERTION=PASS
```

The verifier now measures generic arity, parameter identity/order, type and generic-method
constraints, nested generic substitution, and inherited members through substituted mapped
interfaces. Method generic parameters use their own CLR identity (`!!n`) rather than being confused
with type parameters (`!n`). Deliberately broken fixtures prove parameter-order, method-constraint,
and nested-interface-substitution diagnostics.

```text
REFERENCE_GENERIC_TYPES=2
REFERENCE_GENERIC_METHODS=55
REFERENCE_GENERIC_PARAMETERS=57
CONSTRAINED_GENERIC_PARAMETERS=43
REFERENCE_TYPE_CONSTRAINTS=3
REFERENCE_REFERENCE_TYPE_CONSTRAINTS=0
REFERENCE_VALUE_TYPE_CONSTRAINTS=43
REFERENCE_DEFAULT_CONSTRUCTOR_CONSTRAINTS=43
MAPPED_TYPESCRIPT_CONSTRAINTS=2
NESTED_GENERIC_SUBSTITUTIONS=44
```

Value-type and `new()` constraints are measured even though the normative TypeScript projection
cannot express them faithfully. The profile freezes `TARGET_TYPES=271`, `TOTAL_DIFFERENCES=0`, and
`ALLOWLIST_SIZE=0`; strict execution fails if expected-map regeneration tries to normalize a
regression.

```text
STRICT_XNA_WINDOWS_RUNTIME_PROJECTION_ZERO=true
```

### Managed content

The explicit LZX blocker is closed. `ContentReader` now implements the XNA 4.0 compressed-XNB
wrapper around a persistent managed LZX decoder: compressed flag, declared decompressed size,
short and extended frame/block headers, multi-frame state, truncation, invalid lengths, decoder
errors, trailing data, and exact final byte count are checked. XNB LZX is kept separate from DXT or
other GPU texture formats; compressed texture payloads are not reinterpreted.

General external references now use the same class-token rule as `Content.Load`, resolve relative
to the referring asset, normalize slash/`.`/`..` and case through the manager cache, preserve
identity, recurse through compressed targets/shared resources, detect cycles, validate runtime
type, and retain ordinary `Unload` ownership. Missing/malformed targets and failures after a nested
load remain explicit and leave the manager in a coherent state.

```text
LEGAL_SYNTHETIC_COMPRESSED_MANAGED_VARIANTS=6
MALFORMED_COMPRESSED_VARIANTS=9
QUALIFIED_NATIVE_COMPRESSED_GRAPH_TYPES=3
INDEPENDENT_REAL_XNB_EXACT_BYTE_COMPARISONS=2
EXTERNAL_REFERENCE_SUCCESS_TOPOLOGIES=2
EXTERNAL_REFERENCE_FAILURE_VARIANTS=5
```

The two independent XNB comparisons decoded 16,561-byte and 44,032-byte real reference payloads
exactly against independently decompressed bytes; those proprietary inputs are not committed. The
legal committed fixtures are deterministic synthetic XNB data. Texture2D, SpriteFont, and Model
reader paths all execute through compressed XNB where their managed graphs permit.

### Behavioral evidence

Thirteen content observations were added from the authoritative XNA/CNA-CS neutral snapshot:
platform/version/header/declared-length behavior, profile flags, legal and truncated LZX, unknown
reader, reader-version mismatch, reader-index failure, and normalized cache identity.

```text
STARTING_OBSERVATIONS=168
FINAL_OBSERVATIONS=181
STARTING_ASSERTIONS=169
FINAL_ASSERTIONS=182
FAILURES=0
NEW_CONTENT_OBSERVATIONS=13
PURE_DETERMINISTIC_OBSERVATIONS=181
```

Native deterministic and backend/platform qualification remain separate from this golden corpus.
No microphone, audio-device, timing, or other nondeterministic hardware output was encoded.

### Runtime capability boundary

`tools/runtime-capabilities/source.json` is now the machine source for generated JSON and Markdown.
Its granularity is reviewed operation families, with overloads sharing one implementation/evidence
row. The generator also freezes an audit of all 74 `NativeUnavailableError` and two
`NotSupportedException` construction sites across 28 selected-framework files.

```text
RUNTIME_CAPABILITY_ENTRIES=62
VERIFIED_MANAGED=18
VERIFIED_NATIVE=14
EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND=2
UPSTREAM_CNA_BLOCKED=5
FIXTURE_PENDING=3
HARDWARE_PENDING=4
PLATFORM_PENDING=3
UNIMPLEMENTED_CNA_TS=12
NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT=1
```

This inventory explicitly separates CNA-TS gaps from missing CNA C-ABI semantics. It includes
EffectPass/stock effects/model rendering, graphics state and indexed routes, dynamic buffers,
render targets, window events, VideoPlayer frame ownership, microphone/XACT/media-library
fixtures, and Browser/Wasm. It is not part of the strict API difference count.

### Native ABI and ownership

```text
IMPORTED_SYMBOLS=219
ABI_VERSION=0.7.0
NODE_BRIDGE_SIGNATURES_VERIFIED=219
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
MISSING_NODE_BRIDGE_SYMBOLS=0
NATIVE_SCENARIO_GROUPS=7
REAL_CNA_GAME_LIFETIMES=7
OWNERSHIP_AND_SUBSYSTEM_TEST_GROUPS=11
SANITIZER_BACKED_NATIVE_BUILD=NO
ALLOCATOR_LEVEL_LEAK_FREEDOM_CLAIM=NO
```

The ABI audit now compiles every bridge function-pointer type against the exact CNA declarations,
covering pointer depth, fixed-width signedness, `CNA_Bool`, structures, and callback ABI. Existing
ownership/error handling remains explicit: caller-owned UTF-8 buffers, copied last-error text,
synchronous game-thread callbacks, managed framework pumping instead of foreign audio-thread JS,
reverse parent/child teardown, double-dispose safety, callback self-removal/reentrancy/exception
containment, failed-create rollback, and repeated Game recreation.

The native content lifecycle now loads compressed SpriteFont and Model assets; the model's relative
external reference resolves a separately compressed Texture2D with cache identity and disposal
checks. The exact external artifact remains unchanged and unshipped:

```text
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
LIBRARY_SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
PLATFORM=Linux x86-64 HEADLESS/NULL-audio
EXPORTED_CNA_SYMBOLS=2861
```

Read-only CNA HEAD was rechecked once at
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`. The unmodified `cna_c_api` target again failed at
`modules/c-api/src/CnaCApiCoreExt.cpp:250`, exactly `49 == 50` renderer identities. CNA-TS did not
patch CNA, did not switch to ABI 0.8, and continues using only the already-qualified ABI-0.7
artifact. No ASan/LSan artifact was available, so this is deterministic lifetime evidence rather
than an allocator-level leak claim.

### CI, package, and template

The new qualification workflow always gates locked install, clean build, strict type checking,
unit/differential tests, runtime symbols, internal leak guard, runtime-inventory generation,
compiler-backed ABI audit, `npm pack`, exact TS/JS packed consumers, internal export blocking,
byte-level `dist`/package reproducibility, and both generated template consumers. XNA reference
metadata and native integration are conditional self-hosted jobs using repository-controlled
paths. Missing protected artifacts are reported as `NOT_CONFIGURED`; no random native binary is
downloaded.

One artifact was reused for all package and template consumers:

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-runtime-qualification-final4-20260823/cna-ts-0.1.0.tgz
SHA256=6c7e2d9fa6e9233fdc87aeace91523eb93c65c63dc760523bf4230653bb19d9d
FILES=686
BYTES=366511
DIST_FILES=668
DIST_SHA256=ec0564236abf867e26441b777b1043584e9d56537c490eaa3d54023f97a3090f
DIST_BYTE_IDENTICAL=PASS
PACKAGE_BYTE_IDENTICAL=PASS
TAR_PAYLOAD_IDENTICAL=PASS
FILE_LIST_IDENTICAL=PASS
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
```

The sibling template remained unchanged and small; no Audio/XACT/Media/Video, fake 3D, browser
backend, Electron, or mobile dependency was added.

### Platform qualification

| Platform | Managed/package evidence | CNA runtime evidence | Status |
| --- | --- | --- | --- |
| Node managed | clean build, 14 unit files, 181-observation corpus, exact TS/JS consumers | not required | verified |
| Linux x86-64 Node/native | exact ABI-0.7 HEADLESS/NULL artifact, seven lifetimes, 60/600 frames | real CNA | verified for selected environment |
| Windows | declarations are the selected Windows API profile | no qualified native artifact/job | platform pending |
| macOS | package source is portable | no qualified native artifact/job | platform pending |
| Browser/Wasm | generated Vite bundles only | no provenance-verifiable C-ABI ESM/Wasm artifact | upstream artifact blocked |
| Electron | no application/runtime test | no windowed artifact | not verified |
| Android | no application/runtime test | no mobile artifact/toolchain | not verified |
| iOS | no application/runtime test | no mobile artifact/toolchain | not verified |

The next milestone remains behavioral/runtime qualification within these measured boundaries, not
expansion of the selected public XNA surface.

## 2026-08-23: coherent ABI-0.7 graphics runtime milestone

This milestone rebaselined every one of the 12 CNA-TS-owned runtime gaps against the canonical CNA
C headers, exact ABI generation, qualified library, ownership, thread/callback model, and actual
XNA representability before implementation. The temporary route matrix was removed after its
classifications were transferred into the generated runtime inventory and ABI audit. No selected
public API was added.

### Strict API

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=271
TARGET_TYPES=271
TOTAL_DIFFERENCES=0
MISSING_TYPE=0
MISSING_MEMBER=0
UNEXPECTED_TYPE=0
UNEXPECTED_MEMBER=0
BASE_MISMATCH=0
INTERFACE_MISMATCH=0
PROPERTY_MISMATCH=0
PARAMETER_MISMATCH=0
RETURN_TYPE_MISMATCH=0
OVERLOAD_MISMATCH=0
GENERIC_MISMATCH=0
ENUM_VALUE_MISMATCH=0
EVENT_MAPPING_MISMATCH=0
OPERATOR_MAPPING_MISMATCH=0
LANGUAGE_MAPPING_MISMATCH=0
INTERNAL_LEAK=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
STRICT_XNA_WINDOWS_RUNTIME_PROJECTION_ZERO=true
```

### Runtime capability rebaseline

```text
BEFORE_RUNTIME_CAPABILITY_ENTRIES=62
BEFORE_VERIFIED_MANAGED=18
BEFORE_VERIFIED_NATIVE=14
BEFORE_EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND=2
BEFORE_UPSTREAM_CNA_BLOCKED=5
BEFORE_FIXTURE_PENDING=3
BEFORE_HARDWARE_PENDING=4
BEFORE_PLATFORM_PENDING=3
BEFORE_UNIMPLEMENTED_CNA_TS=12
BEFORE_LANGUAGE_MAPPING_LIMITATION=0
BEFORE_NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT=1

AFTER_RUNTIME_CAPABILITY_ENTRIES=69
AFTER_VERIFIED_MANAGED=19
AFTER_VERIFIED_NATIVE=24
AFTER_EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND=4
AFTER_UPSTREAM_CNA_BLOCKED=8
AFTER_FIXTURE_PENDING=3
AFTER_HARDWARE_PENDING=4
AFTER_PLATFORM_PENDING=3
AFTER_UNIMPLEMENTED_CNA_TS=0
AFTER_LANGUAGE_MAPPING_LIMITATION=3
AFTER_NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT=1
```

Implemented rows are GraphicsDevice state/scalar/resource/render-target binding and status;
bound/indexed/instanced and four-codec user draws; advanced non-effect SpriteBatch state/transform
Begin; DynamicVertexBuffer/DynamicIndexBuffer creation and transfers; RenderTarget2D/Cube
construction, metadata, inherited transfers and binding; OcclusionQuery lifecycle; GameWindow
borrowed identity/state and removable registrations; TitleContainer/default ContentManager title
storage; and the formally mapped VertexBuffer/IndexBuffer value transfers. Texture3D/Cube now have
exact managed Color codecs, validation and real ABI dispatch, while the qualified HEADLESS backend
returns `CNA_RESULT_NOT_SUPPORTED` at creation.

Rows split or reclassified instead of being painted green are:

- direct standalone GraphicsDevice ownership, Effect-bearing SpriteBatch Begin, DynamicBuffer
  ContentLost events, and RenderTarget ContentLost events: `UPSTREAM_CNA_BLOCKED`;
- physical GameWindow event stimulus and Texture3D/Cube backend execution:
  `EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND`;
- `ContentReader.ReadRawObject<T>()` without a token, arbitrary custom generic vertex objects, and
  `number[]` erasure of CLR `Int16[]` versus `Int32[]` user-index overload identity:
  `LANGUAGE_MAPPING_LIMITATION`.

The language mappings are deterministic: explicit content-reader tokens remain supported, four
built-in XNA vertex structs use exact binary codecs, and public user `number[]` indices select the
32-bit route. No fake reflection, JSON vertex serialization, value-based index-width guessing, or
arbitrary host filesystem fallback was introduced.

### Graphics and native qualification

Graphics state facades preserve stable identity after successful native assignment. Validation
covers null/unbind, slot/range bounds, repeated/same-object assignment, disposed resources,
wrong-device resources, duplicate targets, rollback on native failure, parent shutdown, and bound
target disposal. The typed draw families validate their exact XNA-shaped ranges and dispatch real
CNA calls without clamping. On HEADLESS, all five draw families reach CNA and report result 12
because no effect has been applied; this is route evidence, not GPU-output evidence.

Dynamic buffer `None`, `Discard`, and `NoOverwrite` transfers are qualified. RenderTarget2D and
RenderTargetCube creation/metadata, 2D/cube-face binding, and backbuffer restore are qualified.
OcclusionQuery Begin/End/reuse and real completion/result calls are qualified without fabricating a
pixel count. Advanced SpriteBatch render-state/transform Begin is qualified; Effect Begin remains
blocked by executable Effect ownership/pass semantics. Texture3D/Cube exact ABI calls are present,
but volume storage is backend-unavailable on this artifact.

```text
IMPORTED_SYMBOLS_BEFORE=219
IMPORTED_SYMBOLS_AFTER=280
NEW_DEPENDENCY_COMPLETE_IMPORTS=61
NODE_BRIDGE_SIGNATURES_VERIFIED=280
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
MISSING_NODE_BRIDGE_SYMBOLS=0
ABI_VERSION=0.7.0
PATH=/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so
SOURCE_COMMIT=a09196a6477f69a7a57c8364f990658d31531a5b
LIBRARY_SHA256=42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086
PLATFORM=Linux x86-64 HEADLESS/NULL-audio
EXPORTED_CNA_SYMBOLS=2861
```

The compiler-backed verifier covers every imported canonical declaration, pointer depth,
signed/fixed-width types, `CNA_Bool`, enum/POD layout and callback ABI. All operations and event
callbacks used here are synchronous on the attached game thread. Graphics devices and windows are
borrowed; children/registrations are explicitly owned and released.

### Ownership and behavior

The final native integration has seven scenario groups and seven real Game lifetimes. Six graphics
lifetimes each exercise static/dynamic buffers, render targets, volume-texture creation attempts,
OcclusionQuery, state/binding, window registrations, title storage, and shutdown; the parent-live
case disposes all families through reverse ownership and three further games prove recreation.
Double disposal, failed creation, native failure rollback, bound-resource disposal, callback
removal, and parent-before-child invalidation are deterministic tests.

```text
NATIVE_SCENARIO_GROUPS=7
REAL_CNA_GAME_LIFETIMES=7
FINAL_NATIVE_CRASHES=0
FINAL_NATIVE_FAILURES=0
USE_AFTER_FREE_OBSERVATIONS=0
SANITIZER_BACKED_NATIVE_BUILD=NO
ALLOCATOR_LEVEL_LEAK_FREEDOM_CLAIM=NO
```

A deliberate pre-guard negative probe found that the qualified artifact aborts with an uncaught
canonical `InvalidOperationException` when destroying a still-bound render target, despite the C
header documenting an invalid-state result. CNA-TS now preflights that operation and restores the
backbuffer during shutdown. The abort is recorded as an upstream defect and is not counted as
passing final-suite evidence.

The deterministic differential corpus did not grow merely to encode HEADLESS behavior:

```text
OBSERVATIONS_BEFORE=181
OBSERVATIONS_AFTER=181
ASSERTIONS_BEFORE=182
ASSERTIONS_AFTER=182
FAILURES=0
```

New graphics runtime evidence resides in managed/native integration tests instead: state and
binding identity/validation, draw ranges and codecs, dynamic data options, target state/lifetime,
volume texture faces/boxes, query ordering, advanced SpriteBatch Begin, title storage, and window
registration cleanup.

### Package and template

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-graphics-final2.jXcttP/cna-ts-0.1.0.tgz
SHA256=3ae2d27aab3265141026f9dc5056f6192b904ed29b200219ffdaa71f5367ba3a
FILES=690
BYTES=412187
DIST_FILES=672
DIST_BYTES=2053644
DIST_SHA256=fad143234cff92b61fb519b727783284291cfcec1d3aa5952528a410d8a175ce
DIST_BYTE_IDENTICAL=PASS
PACKAGE_BYTE_IDENTICAL=PASS
TAR_PAYLOAD_IDENTICAL=PASS
FILE_LIST_IDENTICAL=PASS
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
TEMPLATE_CHANGED=NO
TEMPLATE_NATIVE_60=PASS
TEMPLATE_NATIVE_600=PASS
```

The exact retained tarball was consumed by both generated projects and by the unchanged sibling
template. Its native canaries passed PNG `FromStream`, SpriteBatch draw, input, and cleanup at 60
and 600 frames on the selected HEADLESS artifact. No 3D/render-target/query showcase or new
platform dependency was added.

### Remaining CNA boundaries

The eight runtime-inventory upstream rows are: EffectPass/compiled-or-stock effect execution;
Model.Draw (now blocked specifically at EffectPass.Apply after raw indexed dispatch); transient
VideoPlayer frame-texture ownership; Browser/Wasm artifact packaging; direct owned GraphicsDevice
construction; Effect-bearing SpriteBatch Begin; DynamicBuffer ContentLost signaling; and
RenderTarget ContentLost signaling. The qualified artifact's bound-render-target exception escape
is an additional concrete ABI implementation defect. Fixture, hardware, platform, and current
HEADLESS limitations remain separately classified in `docs/runtime-capabilities.md`.

Current CNA HEAD remains
`1bb2145d99ed572dd4eb15009c34e2e5f410fcf0`; its unmodified C-API build still fails its renderer
identity assertion at `49 == 50`. No CNA repository was modified, no ABI-0.8 artifact was accepted,
and runtime evidence remains pinned to the provenance/hash above.

Final verification passed `npm ci`, `npm run check`, `npm test`, `npm run test:differential`,
`npm run api:report`, `npm run api:verify`, `npm run verify:runtime`, `npm run verify:leaks`,
`npm run runtime:inventory`, `npm run audit:cna-abi`, `npm run verify:package`,
`npm run verify:build-reproducibility`, `npm run verify:package-reproducibility`, the exact native
integration suite, both generated packed consumers, and the template 60/600-frame canaries.

## 2026-08-23: ABI-0.7 Effect reconciliation

This narrow post-completion audit independently reconciled CNA-TS with canonical CNA ABI 0.7 and
the qualified artifact already used by the binding qualification work. It did not add a selected
XNA declaration or change CNA, another binding, or the 2D-only template source.

### Strict API

```text
TARGET_TYPES=271
TOTAL_DIFFERENCES=0
MISSING_TYPE=0
MISSING_MEMBER=0
UNEXPECTED_TYPE=0
UNEXPECTED_MEMBER=0
ALLOWLIST_SIZE=0
INTERNAL_LEAK=0
RUNTIME_DIFFERENCES=0
STRICT_XNA_WINDOWS_RUNTIME_PROJECTION_ZERO=true
```

### Effect, Model and SpriteBatch result

The previous `EffectPass.Apply = UPSTREAM_CNA_BLOCKED` result was stale. Canonical `effects.h`
declares `cna_effect_pass_apply(CNA_EffectPassHandle pass)`, and the exact qualified library exports
it. The old TypeScript facade was synthetic and had no corresponding native pass identity, so the
missing ownership projection was temporarily a CNA-TS gap. It is now implemented: native Effects
own hidden technique/pass views, passes retain but never destroy their parent Effect, parent
disposal invalidates the graph, and apply-after-disposal is deterministic.

```text
cna_effect_apply=VERIFIED_NATIVE
cna_effect_pass_apply=VERIFIED_NATIVE
cna_effect_create_compiled route=VERIFIED_NATIVE
compiled Effect execution on HEADLESS=EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND
BasicEffect construction/apply=VERIFIED_NATIVE
AlphaTestEffect construction/apply=VERIFIED_NATIVE
DualTextureEffect construction/apply=VERIFIED_NATIVE
EnvironmentMapEffect construction/apply=VERIFIED_NATIVE
SkinnedEffect construction/apply=VERIFIED_NATIVE
Model.Draw=VERIFIED_NATIVE
SpriteBatch Effect-bearing Begin=VERIFIED_NATIVE
```

All five distinct stock constructors succeed on HEADLESS and execute through generic Effect/pass
apply after dependency-complete typed state synchronization. Three exact-byte attempts with CNA's
legal `CnaConformanceEffect.fxb` reach `cna_effect_create_compiled`, return structured result 6,
and leave no Effect to dispose. This proves the binding route and failure rollback, not compiled
shader execution. The qualified Model XNB now executes mesh-part buffer/index binding, BasicEffect
matrix updates, native pass apply and indexed draw. Effect-bearing SpriteBatch Begin passes a real
BasicEffect, retains it through End, rejects disposal during that interval, and releases the lease
on Begin failure.

CNA-Rust was not wrong: it already constructed native Effects and native reflection views. Its
ownerless empty-pass test proved successful no-op dispatch, while its stock-effect stress used real
effect-owned passes. CNA-TS had only the synthetic facade and incorrectly described its unwired
identity bridge as upstream-blocked. Both bindings now agree on route presence and stock execution;
compiled execution remains unavailable only on the qualified HEADLESS renderer.

### Runtime inventory and ABI

```text
BEFORE_RUNTIME_CAPABILITY_ENTRIES=69
BEFORE_VERIFIED_MANAGED=19
BEFORE_VERIFIED_NATIVE=24
BEFORE_EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND=4
BEFORE_UPSTREAM_CNA_BLOCKED=8
BEFORE_FIXTURE_PENDING=3
BEFORE_HARDWARE_PENDING=4
BEFORE_PLATFORM_PENDING=3
BEFORE_UNIMPLEMENTED_CNA_TS=0
BEFORE_LANGUAGE_MAPPING_LIMITATION=3
BEFORE_NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT=1

AFTER_RUNTIME_CAPABILITY_ENTRIES=72
AFTER_VERIFIED_MANAGED=19
AFTER_VERIFIED_NATIVE=30
AFTER_EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND=4
AFTER_UPSTREAM_CNA_BLOCKED=5
AFTER_FIXTURE_PENDING=3
AFTER_HARDWARE_PENDING=4
AFTER_PLATFORM_PENDING=3
AFTER_UNIMPLEMENTED_CNA_TS=0
AFTER_LANGUAGE_MAPPING_LIMITATION=3
AFTER_NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT=1

IMPORTED_SYMBOLS_BEFORE=280
IMPORTED_SYMBOLS_AFTER=360
NEW_DEPENDENCY_COMPLETE_IMPORTS=80
NODE_BRIDGE_SIGNATURES_VERIFIED=360
NODE_BRIDGE_SIGNATURE_MISMATCHES=0
MISSING_NODE_BRIDGE_SYMBOLS=0
MISSING_QUALIFIED_LIBRARY_IMPORTS=0
ABI_VERSION=0.7.0
QUALIFIED_LIBRARY_EXPORTED_FUNCTIONS=2861
```

The exact artifact remains
`/tmp/cna-java-native-working-070/modules/c-api/libcna_c_api.so`, source commit
`a09196a6477f69a7a57c8364f990658d31531a5b`, SHA-256
`42e099146bf3b470f82fd963a516f8bdd7ff0406da8c37dd53747699117db086`. The compiler-backed audit
checks all 360 imported pointer types against canonical headers and the artifact-export audit finds
every imported symbol. ABI 0.8 remains rejected.

### Package and unchanged template

```text
FILENAME=cna-ts-0.1.0.tgz
PATH=/tmp/cna-ts-effect-reconciliation/cna-ts-0.1.0.tgz
SHA256=6f0eb42af5f2d5815366b1593d8ec5622575808acf9d274f0c78a5843bbc2c97
FILES=690
BYTES=425551
DIST_FILES=672
DIST_BYTES=2092872
DIST_SHA256=5f531e27b56159d999c403886048f563d066e7c69d1109e1026ffa07346ff203
DIST_BYTE_IDENTICAL=PASS
PACKAGE_BYTE_IDENTICAL=PASS
TAR_PAYLOAD_IDENTICAL=PASS
FILE_LIST_IDENTICAL=PASS
PACKED_TYPESCRIPT_CONSUMER=PASS
PACKED_JAVASCRIPT_CONSUMER=PASS
GENERATED_TYPESCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_BUILD=PASS
GENERATED_JAVASCRIPT_MANAGED_SMOKE=PASS
LEGACY_OR_SIBLING_REFERENCES=0
TEMPLATE_CHANGED=NO
TEMPLATE_NATIVE_60=PASS
TEMPLATE_NATIVE_600=PASS
```

Final verification passed the complete requested gate list, the exact ABI-0.7 native integration
suite at 60/600 frames, both packed generated consumers, both package reproducibility checks, and
`git diff --check` in CNA-TS and the unchanged sibling template.

## 2026-08-30: live cnanext, ABI 0.20, a browser backend and the complete XNA runtime surface

This session moved the binding's dependency from the older `cna` checkout at ABI 0.7 to the live
`cnanext` at ABI 0.20, gave it a second real backend, completed the XNA 4.0 runtime surface, and
started the modern CNA extension API. Eleven local commits; nothing pushed.

### Repository invariants

```text
CNA_TS_START=a0141809b7457047e911e7a7590c675916bd0ca0 (clean, == origin/develop)
CNA_TS_TEMPLATE_START=49620019729ae87208ea67d84504b568e8b08b0b (clean, == origin/develop)
CNANEXT_ARTIFACT_HEAD=72262a33ed5ae7657024c7f1251338748a3feee5
SHARP_RUNTIMENEXT_ARTIFACT_HEAD=eebebd862121953538e3b84d43384d70a8a1728d
CNANEXT_HEAD_AT_SESSION_END=17b5a90a0878f3f44c23bc8e3197d5d30373dc72
CNANEXT_MODIFIED_BY_THIS_SESSION=0
SHARP_RUNTIMENEXT_MODIFIED_BY_THIS_SESSION=0
```

Neither dependency was modified here. Both were dirty with another session's work when this one
started, and that session kept committing while this one ran: the `ARTIFACT_HEAD` values are the
revisions the two artifacts were actually built from, and `cnanext` has moved on since. Rebuilding
against the newer revision is the first thing the next session should do before trusting any
runtime number below.

### Live CNA build

```text
BUILD_DIRECTORY=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tsnext
GENERATOR=Ninja   CMAKE_BUILD_TYPE=Debug   COMPILER=gcc (Debian 14.2.0-19) 14.2.0
CNA_PLATFORM=HEADLESS   CNA_GRAPHICS_RENDERER=HEADLESS   CNA_AUDIO_PLATFORM=NULL
CNA_BUILD_C_API=ON   CNA_CNAEXT=ON   CNA_DEVICES=ON   CNA_ENABLE_NET=ON
CNA_SHARP_RUNTIME_ROOT=/rv/data/development/github.com/openeggbert/sharp-runtimenext
LIBRARY=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tsnext/modules/c-api/libcna_c_api.so
SHA256=53f513af7a81745df49e9214a9d93aa6e4487b8514891f75ebecab5d8c348fba
REPORTED_ABI=0.20.0   EXPORTED_CNA_SYMBOLS=4051
CAPI_CTEST=86/92 PASS
```

The six failures are configuration effects of this option combination, recorded with their causes
in `docs/cna-abi-audit.md`; none touches a route the binding imports, and `CApi_LifecycleSmoke`
— game create/run/destroy with update, draw and texture readback — passes.

A second artifact was built with Emscripten:

```text
BUILD_DIRECTORY=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tswasm
CMAKE_BUILD_TYPE=Release   CNA_GRAPHICS_RENDERER=WEBGL2   EMCC=6.0.3
MODULE=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tswasm/modules/c-api/cna_c_api.mjs
WASM=/rv/data/development/github.com/openeggbert/cnanext/cmake-build-tswasm/modules/c-api/cna_c_api.wasm
WASM_SHA256=1ae95cc266add93a8b956d6267e7bbd88c55c73c5a64ea948f51161e733f59d1
REPORTED_ABI=0.20.0
EXTRA_LINK_SETTINGS=-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2 -sASYNCIFY=0
CApi_WasmModuleSmoke=PASS   CApi_WasmBrowserProbe=PASS
```

Both extra link settings exist because of measured upstream gaps; see the blockers below.

### ABI migration

```text
PREVIOUS_TARGET_ABI=0.7.0        LIVE_TARGET_ABI=0.20.0
PREVIOUS_CANONICAL_DECLARATIONS=2861   LIVE_CANONICAL_DECLARATIONS=4051
IMPORTED_SYMBOLS_BEFORE=360      IMPORTED_SYMBOLS_AFTER=398
RETAINED=360   REMOVED=0   RENAMED=0   ADDED=38
NODE_BRIDGE_SIGNATURES_VERIFIED=398   SIGNATURE_MISMATCHES=0
MISSING_NODE_BRIDGE_SYMBOLS=0   MISSING_QUALIFIED_LIBRARY_IMPORTS=0
UNEXPLAINED_IMPORTED_SYMBOL_GAPS=0
```

Every 0.7 route survives 0.20 unchanged, and the whole import list recompiles against the live
headers under `-Wall -Wextra -Werror` with each symbol assigned to its declared function-pointer
type. What actually moved was the acceptance policy, one removed limitation
(`cna_vertex_buffer_set_data_raw_at_with_options`, ABI 0.16), one changed contract
(`SoundEffectInstance.Apply3D`, ABI 0.9) and four stale version attributions.

### The enum boundary, which nothing had been checking

```text
ENUM_MEMBER_CLAIMS=752   IDENTICAL=749   TRANSLATED=3
SCALAR_ASSERTIONS=6   RESULT_CODE_ASSERTIONS=15   STRUCT_VERSION_ASSERTIONS=6
STATIC_ASSERTIONS_COMPILED=PASS   DIAGNOSTICS=0
MUTATION_CONTROLS=13
```

`npm run verify:cna-contract` generates a C translation unit from
`tools/cna-abi/contract.json` and compiles it against the canonical headers, so every claim is a
`_Static_assert`. It found that **`BlendFunction.Min` and `Max` were exchanged on every native
path**: XNA numbers Min=3/Max=4 and the C ABI numbers MAX=3/MIN=4, so a game asking for a minimum
blend got a maximum through `GraphicsDevice.BlendState` and both `SpriteBatch.Begin` overloads
carrying one.

### CNA C API coverage

```text
TOTAL_C_API_FUNCTIONS=4051
NODE_IMPORTED_TOTAL=398   WASM_IMPORTED_TOTAL=79   IMPORTED_BY_BOTH=79
XNA_BACKING=551   CNA_EXTENSION_BACKING=1690   MANAGED_BY_DESIGN=457
TOOLING_ONLY=31   INTENTIONALLY_DEFERRED=924   UPSTREAM_RUNTIME_UNAVAILABLE=0
UNEXPLAINED=0
```

### XNA profiles

```text
xna40-windows-runtime          TARGET      7 assemblies  257 types  2964 members  0 differences
xna40-windows-live             TARGET      3 assemblies   74 types   676 members  0 differences
xna40-xbox360                  INVENTORY  10 assemblies  318 types  3577 members  318 projected
xna40-windows-content-pipeline INVENTORY   7 assemblies  128 types   743 members    0 projected
xna40-windows-full             INVENTORY  17 assemblies  459 types  4383 members  331 projected

RUNTIME_SUPERSET_TYPES=331   PROJECTED=331   UNPROJECTED=0
TYPESCRIPT_PROJECTED_TYPES=348   RUNTIME_SYMBOL_DIFFERENCES=0   INTERNAL_LEAK=0
```

Every retained Microsoft assembly is admitted by exact SHA-256 and none is committed or packaged.
The Xbox 360 contract differs from the Windows runtime by exactly thirteen
`Microsoft.Xna.Framework.Design` type converters, which the Compact Framework has no
`TypeConverter` to derive from.

### Backends

```text
NODE_NATIVE_60=PASS   NODE_NATIVE_600=PASS   NATIVE_SCENARIO_GROUPS=7
BROWSER_WASM_60=PASS  BROWSER_WASM_600=PASS  UNCAUGHT_PAGE_ERRORS=0
BROWSER=headless Chromium (Playwright), SwiftShader, WebGL 2.0, CNA renderer WEBGL2
WASM_ROUTES=79   WASM_VERTICAL_SLICE=game, device, Clear, Texture2D, SpriteBatch, input
```

`src/internal/backend-base.ts` and `src/internal/wasm/layout.ts` are generated — the first from
the backend interfaces, the second from a probe compiled by the same Emscripten toolchain — so a
partial backend refuses unimplemented members by name and no wasm32 offset is written by hand.
Reading the sprite-command stride from the measurement rather than restating it caught an assumed
80 against a measured 72.

### Modern CNA extensions

`cna-ts/extensions/runtime` is the first family: platform identity, renderer selection with its
availability set, fallback chain and recorded reasons, the runtime log, and the extended
graphics-layer availability probe. 37 handle-free routes, implemented on both backends, nine native
assertions and a browser assertion. Running one API on two backends is what surfaced the
pre-latch and non-desktop refusals CNA reports as state rather than failure.

### Capability inventory

```text
ENTRIES=82   PROVED=64   CONSISTENCY_GATE=PASS   MUTATION_CONTROLS=8
VERIFIED_MANAGED=20   VERIFIED_NATIVE=33   VERIFIED_WEBASSEMBLY=3
UPSTREAM_CNA_BLOCKED=0   UNIMPLEMENTED_CNA_TS=8
FIXTURE_PENDING=3   HARDWARE_PENDING=4   PLATFORM_PENDING=3
LANGUAGE_MAPPING_LIMITATION=3   NOT_APPLICABLE=1
```

Every row now carries machine-checkable proof and the generator refuses to write the document when
a claim does not hold. `UPSTREAM_CNA_BLOCKED` went from five to zero: every gap the previous
session recorded against CNA has since been closed upstream and is now honestly CNA-TS work.

### Upstream blockers

Two, both in `cnanext` and both worked around in build configuration rather than by editing it:

1. `cna_c_api_wasm` does not pin `MIN/MAX_WEBGL_VERSION`, so Emscripten negotiates WebGL 1 while
   EasyGL asks for GLES 3 and its GLSL ES 3.00 shaders fail to compile. The examples already set
   the pair.
2. `-sASYNCIFY=1` makes every route unrewindable. SDL3's Emscripten swap calls
   `emscripten_sleep(0)` on each present, Asyncify re-enters the bottom export with no arguments,
   and under `WASM_BIGINT` an `i64` parameter given `undefined` throws. Every route in this ABI
   takes a `CNA_Handle`.

Both are written up with proposed changes in `docs/wasm-backend.md`.

### Package and template

```text
PACKED_FILES=792   PACKED_BYTES=609121
DIST_BYTE_IDENTICAL=PASS   PACKAGE_BYTE_IDENTICAL=PASS
TAR_PAYLOAD_IDENTICAL=PASS  FILE_LIST_IDENTICAL=PASS
PACKED_TYPESCRIPT_CONSUMER=PASS   PACKED_JAVASCRIPT_CONSUMER=PASS
INTERNAL_EXPORT_BLOCK=PASS
TEMPLATE_TYPESCRIPT_BUILD=PASS   TEMPLATE_JAVASCRIPT_BUILD=PASS
TEMPLATE_NATIVE_60=PASS   TEMPLATE_NATIVE_600=PASS
TEMPLATE_BROWSER_WASM_60=PASS   TEMPLATE_BROWSER_WASM_600=PASS
TEMPLATE_EXTENSIONS_SMOKE=PASS
```

## 2026-08-31: CNB, the post-process chain, the host, the video frame, and pixels on two GPUs

This session requalified everything against the live dependency state and then widened the binding
along five fronts at once: CNA's compiled content format, the engine layer's post-process chain,
the extended device layer, the VideoPlayer's borrowed frame, and real gamer-services backing. It
also produced this project's first asserted GPU pixels — twice, once in a browser and once on a
desktop renderer. Twelve local commits here and one in the template; nothing pushed.

### Repository invariants

```text
CNA_TS_START=005edf8a330d0257565c70f527d749ba611f56f4 (clean, == origin/develop)
CNA_TS_END=4be530e (16 local commits)
CNA_TS_TEMPLATE_START=dfd9e14b18b143b6b33b829f5d63b6fe55b90fb7 (clean, == origin/develop)
CNA_TS_TEMPLATE_END=2ea39870941d0520c7599afd9455efda9cea4c6b
CNANEXT_ARTIFACT_HEAD=17b5a90a0878f3f44c23bc8e3197d5d30373dc72
SHARP_RUNTIMENEXT_ARTIFACT_HEAD=4a49afb0cfe6a41e6e0af0bb62dc5175976731bb
CNANEXT_HEAD_AT_SESSION_END=a20130686f03d8e6bc1446fc070380169d926e76
CNANEXT_MODIFIED_BY_THIS_SESSION=0
SHARP_RUNTIMENEXT_MODIFIED_BY_THIS_SESSION=0
```

`cnanext` moved twice more while this ran (71576a7b, then a2013068) and was dirty with another
session's work throughout. `git diff 17b5a90a..a2013068 -- modules/c-api/include` is empty, so the C
contract did not move with it and the artifacts stayed valid — measured, not assumed from two
unchanged numbers.

### Requalification against live dependencies

Both artifacts had been built from `cnanext` 72262a33, which had already moved, so neither could be
trusted. Both were rebuilt.

```text
NATIVE=cmake-build-tsnext HEADLESS/HEADLESS/NULL, CNAEXT+DEVICES+NET on
NATIVE_SHA256=c635aff6b3bbc5794ffd0a98c9a7193c375928b85d3451ece545a770e41e5c6d
WASM=cmake-build-tswasm WEBGL2, Emscripten 6.0.3
WASM_SHA256=6a5db6f6a6a3cc4e0906c0e108d31e850adf75b65ea805c1b8c99b7e30ff49f2
CAPI_CTEST=86/92, the same six configuration failures as before
NODE_60=PASS NODE_600=PASS BROWSER_60=PASS BROWSER_600=PASS
```

`git diff 72262a33..17b5a90a -- modules/c-api` was empty, so the ABI version, declaration set and
export set were identical by measurement.

### What the coverage report could not answer, and now can

Classifying an imported route by the import, before any rule ran, made both of the report's
questions unanswerable: every route both backends reached counted as Node's alone, so the
WebAssembly column was zero for every header, and an imported route had no purpose at all, so
`XNA_BACKING` counted only what the adapter does *not* import. Purpose and reachability are now
independent axes.

```text
                        BEFORE            AFTER
TOTAL_C_API_FUNCTIONS   4051              4051
XNA_BACKING             545               1152
CNA_EXTENSION_BACKING   1680              1736
INTERNAL_RUNTIME_ONLY   0                 1
MANAGED_BY_DESIGN       457               457
TOOLING_ONLY            31                31
INTENTIONALLY_DEFERRED  924               674
UNEXPLAINED             0                 0
REACHABLE_NODE          414               594
REACHABLE_WASM          79                169
REACHABLE_BUT_DEFERRED  n/a               0
```

`XNA_BACKING` reads 1152 rather than 545 for two reasons and neither is new binding: the axis split
put imported XNA routes back into their purpose, and `gamer_services.h` moved out of
`INTENTIONALLY_DEFERRED` once the dispatcher was bound. A new gate holds reachable-but-deferred at
zero — binding one `gamer_services.h` route while the family was still ruled deferred is exactly
what it caught, the moment it happened.

### CNB, CNA's own compiled content format

272 routes, none bound. `cna-ts/extensions/content` now projects three slices, each ending in
something a game can use rather than in a handle:

- the validated container — container version, asset type and schema version, `CMET` metadata,
  `XREF` external references, the table of contents and any chunk's logical bytes;
- the texture schema, ending in a real `Texture2D`;
- the sprite-font schema with its embedded atlas, ending in a drawable `SpriteFont`.

Fixtures are built with **CNA's own encoder**. A reader and a writer sharing one set of assumptions
agree whether or not either is right. Assertions are values: a chunk's CRC-32C recomputed against
its table-of-contents entry, four exact texels after a GPU round trip, `MeasureString` on a decoded
font, and the block rule that makes a 1×1 BC7 level sixteen bytes. Truncation, a flipped payload
byte and an XNB handed to `Parse` are each `CNA_RESULT_IO` rather than half-read.

The contract verifier earned its keep twice: it caught `CnbAssetType`'s ordering — the obvious guess
puts `SoundEffect` at 6 and CNB puts `AnimationClip` there — and refused three unclassified enums
until each was proved member by member.

### The engine layer's post-process chain

Bloom, tonemapping, FXAA, SSAO and screen-space reflections, each its own class with named
properties. Quality tiers come from CNA rather than from numbers written here. Every property
round-trips at float precision, including `SsrPass.RoughnessBlur`, where 0.625 comes back as 0.25
because CNA clamps it — recorded rather than avoided.

`Add` borrows and `AddOwned` transfers, as separate methods rather than a flag, and the transfer
found an upstream defect: `cna_post_process_chain_add_owned_pass` consumes the handle without the
`RemoveOwnedGraphicsResourceFor` its sibling `_destroy` performs, so the game's owned-resource
counter never falls and every later `cna_game_destroy` in the process refuses. One transfer poisons
the whole runtime. It is characterised by a probe that runs in its own process for exactly that
reason, and the suite asserts the defect as measured so a repaired upstream fails rather than
passes silently.

### The host, the frame, and the gamer

- **`cna-ts/extensions/devices`** reports the machine: cores, memory, power, display scale and safe
  area, locales, clipboard and cameras. Absences are absences — a missing battery charge is `null`,
  not zero, so a low-charge branch cannot misfire; a windowless session's zero content scale is
  CNA's answer, not a failure; system memory reads zero on HEADLESS because SDL answers it and
  HEADLESS starts no SDL subsystem, and the test records the zero and says why. The core count is
  checked against Node's own.
- **`VideoPlayer.GetTexture`** projects CNA's player-owned frame as a **borrowed** `Texture2D`.
  `cna_video_player_get_frame_ext`'s monotonic decode generation is what made it safe: the same
  object comes back while the generation is unchanged, and the facade is retired the moment
  anything else touches the player. Decode progression stays fixture-pending.
- **`GamerServicesDispatcher` and `Guide`** are backed by real CNA state. Two XNA rules CNA does not
  enforce are enforced in the projection and asserted: an un-initialised `Update` raises, and
  `IsTrialMode` is the disjunction with `SimulateTrialMode`. One place CNA was right and the
  projection was wrong: `IsScreenSaverEnabled` is a platform display property, so with no displays a
  write does not take. Nothing fabricates a gamer.

### Pixels, on two GPUs

The first evidence in this project that comes out of a GPU rather than out of a route returning
success — and it is the same assertion in both places:

```text
BROWSER  RenderTarget2D 4x4, Clear(12, 34, 56, 255), 16 of 16 texels exact, WebGL2/SwiftShader
DESKTOP  RenderTarget2D 4x4, same clear, 16 of 16 texels exact, OPENGLES3 under Xvfb
```

The windowed qualification needed no new CNA build: an OPENGLES3/SDL3 library with the same ABI
already existed in another session's tree and is consumed read-only. It also reaches what HEADLESS
cannot — a 16384-texel limit, `0x7ffff` capability flags, and a stock `BasicEffect` pass that
applies for real. It is opt-in through `CNA_WINDOWED_LIBRARY` and skips with a reason.

### The browser slice

```text
WASM_BACKEND_ROUTES=169 (was 79)   MISSING_WASM_BACKEND_EXPORTS=0
ADDED: title storage and the whole managed content stack, render targets, sound effects, CNB
BROWSER_60=PASS BROWSER_600=PASS UNCAUGHT_PAGE_ERRORS=0
```

CNB crossing to the browser needed no public API at all, which is what a backend-neutral design is
supposed to buy: the browser test makes the same exact-texel assertion the Node suite makes, through
the same `CnbDocument` and `CreateTexture2DFromCnb`. Seven more structures joined the Emscripten
layout probe for it, none of their offsets written by hand.

Title storage is the one route the managed content stack was missing: XNB framing, the reader table,
the LZX decompressor and every built-in reader graph are TypeScript that already ran on Node, so a
page that writes its assets into the module filesystem can call `ContentManager.Load`. That
immediately exposed a behavioural gap on *both* backends, invisible to a structural verifier:
XNA's `GraphicsDeviceManager` constructor registers itself in `Game.Services`, and ours did not, so
`Content.Load` inside an ordinary `Game` failed everywhere.

Sound is duration-exact (250 ms from a quarter second of 8 kHz mono) and state-machine-exact;
audibility is deliberately not claimed, because a browser will not start a WebAudio context without
a user gesture.

### Result codes, and one gate that could not have caught anything

The contract verifier proved the CNA result codes against the headers while the TypeScript that
branches on them restated the numbers inline — so a wrong literal in a backend was invisible to it.
The first draft of the browser title route spelled `BUFFER_TOO_SMALL` as 6, which is
`NOT_SUPPORTED`. `src/internal/cna-results.ts` is now the one table, proved value by value with
mutation controls for a wrong number and an unnamed member.

`docs/internal-leak-report.json` was text despite the name while CI generated JSON and compared byte
for byte — a gate that could only ever fail. The ABI and contract reports carried absolute host
paths and the dependency's git HEAD, so neither could be reproduced from a pinned checkout. All
three are portable now, and every `cmp` the workflow performs was replayed locally.

### Sensors, and the Content Pipeline boundary

`cna-ts/extensions/sensors` projects the platform's sensor support and the accelerometer around one
rule: **a missing sensor is not a sensor reading zero**. `NotSupported`, `NoPermissions`, `Disabled`
and `NoData` stay distinct — "cannot" and "not yet" are different answers a game acts on differently
— and `CurrentValue` refuses rather than inventing a measurement. This host has no accelerometer,
and the test asserts the whole family agreeing about that end to end.

`docs/content-pipeline-boundary.md` measures the question the plan had left open and decides it: the
128 content-pipeline types stay unprojected, because four of the pipeline's load-bearing mechanisms
— attribute-driven importer discovery, a reflection-based `IntermediateSerializer`, four MSBuild
tasks, and XNB output CNA does not produce — have no counterpart here. Projecting them would be the
first place in this package where a shape was published without the behaviour behind it, and a
strict verifier reporting zero differences would make that look fine. Content authoring belongs to a
separate build-time package over CNA's own compiler, whose write half already exists and is
backend-neutral.

### Final qualification

```text
npm ci PASS   npm run check PASS   npm test 304/304   test:differential 182/182
api:verify TOTAL_DIFFERENCES=0    api:verify:live TOTAL_DIFFERENCES=0
verify:runtime RUNTIME_DIFFERENCES=0   verify:leaks INTERNAL_LEAK=0   ALLOWLIST_SIZE=0
audit:cna-abi ABI=0.20.0 HEADERS=61 EXPORTS=4051 IMPORTS=594 SIGNATURE_MISMATCHES=0
                MISSING_QUALIFIED_LIBRARY_IMPORTS=0 WASM_ROUTES=169 MISSING_WASM_EXPORTS=0
verify:cna-contract ENUM_CLAIMS=827 TRANSLATED=3 DIAGNOSTICS=0 STATIC_ASSERTIONS_COMPILED=PASS
coverage:cna-abi UNEXPLAINED=0 REACHABLE_BUT_DEFERRED=0 NODE=594 WASM=169
runtime:inventory ENTRIES=98 CONSISTENCY_GATE=PASS PROVED=79
test:native 14/14   test:extensions 10/10   test:cnb 11/11
test:wasm-browser 7/7   test:windowed 2/2 (OPENGLES3, readback EXACT, stock effect SUCCESS)
verify:package PASS   build reproducibility PASS   package reproducibility PASS
PACKED_SHA256=d2fd57d1dca7cda22d9bdb0d1aaec3f6bab8248002316203e298253362070913
PACKED_FILES=830  PACKED_BYTES=749737

TEMPLATE  build PASS  native 60/600 PASS  browser 60/600 PASS  extensions PASS
          generated TypeScript/JavaScript PASS  LEGACY_OR_SIBLING_REFERENCES=0
```

### Public package subpaths

```text
.  /xna  /runtime  /extensions
/extensions/runtime  /extensions/graphics  /extensions/content  /extensions/devices
/extensions/sensors
```

Three of those five extension subpaths are new this session, and every one of them is proved blocked
from reaching `src/internal` by a fresh consumer install.

### Upstream status

```text
add_owned_pass owned-resource leak       NEW, measured, characterised, not fixed here
SDL3 mixer stderr notice on success      NEW, measured, classified in the harness
cna_c_api_wasm MIN/MAX_WEBGL_VERSION     STILL PRESENT (verified in the live CMake source)
-sASYNCIFY=1 on every Emscripten link    STILL PRESENT (verified in the live CMake source)
```

Neither Emscripten workaround was removed on the strength of the build merely continuing to
succeed with it; both were re-read out of `cnanext`'s own CMake.

## 2026-08-31: the engine layer end to end, and two draw passes accepted on their pixels

### Repository invariants

```text
CNA_TS_START=4068b21 (clean, == origin/develop)
CNA_TS_END=a2b1a45 + this record   (29 commits; 26 pushed, the last 3 local)
CNA_TS_TEMPLATE=8a806d8 (2 commits this session, pushed, clean)
CNANEXT=0fd4d4e39         read-only, 0 modified, 0 untracked, unchanged all session
SHARP_RUNTIMENEXT=4a49afb0 read-only, 0 modified, 0 untracked, unchanged all session
CNA_SAMPLES               another workflow's; it advanced a0c50e205 -> 154502d at 13:45
                          under that workflow while this session ran. Not touched here.
LIBRARIES  cmake-build-tsnext (HEADLESS)   cmake-build-debug (OPENGLES3)
           cmake-build-sdlrenderer (SDL_RENDERER)   cmake-build-software (SOFTWARE)
           cmake-build-tswasm (WEBGL2) — all read-only, none reconfigured or rebuilt here
```

### What was built

The compute path, clustered lighting, level-of-detail groups, the shadow-map maths for all four
shadow kinds, the particle simulation, XNA's public `GraphicsDevice` constructor, camera frame
capture, CNB's writers on both backends, a `.cnj` compiler, the Guide's two async screens — and
then the two things the plan had left standing: **a shadow map's depth pass** and **a particle
system's draw**.

Both were blocked on the same thing until this week. A render target read back as zeros on the one
renderer that could run either pass, which this package had recorded as upstream finding 7 and
*asserted* rather than worked around. CNA fixed it in `48ab0de7f`, along with finding 9, and the
assertions fired the moment the repair landed. That is what made both passes writable.

### The two draw passes, and what they are accepted on

Neither is accepted on a call returning success. Each is accepted on a picture, checked against a
prediction the test computes from inputs it chose itself.

**The depth pass.** An empty `Begin`/`End` leaves all 262144 texels at exactly 1.0. Then one
asymmetric quad in an asymmetric scene box, cast at two heights. The pass transform is
cross-checked first: it must equal `ComputeLightView` times `ComputeLightProjection` for the same
light and box — pure routes that touch no shadow map — multiplied by the test itself. Only then are
the quad's corners projected through it, and the rendered rectangle has to match within 1.5 texels
on every edge, fill 98% of its predicted area, and hold exactly the predicted depth to 1e-5. Two
heights eight units apart differ by exactly the projection's depth scale times eight and cover
identical texels; the same draw outside the pass reaches none of the map.

The borrow contract is the part that needed measuring rather than guessing. CNA counts the effects
and the texture it lends, hands out a *fresh handle for every borrow*, and refuses to destroy a map
while one is outstanding. So each is taken once and returned before the map. That handle behaviour
also broke the first version of the test: comparing the two caster facades by identity let a
swapped getter through, because two borrows are always two objects. They are told apart now by what
they rasterise — the skinned program writes nothing from vertices carrying no bone weights.

**The particle draw.** Pinned to the CPU simulation with every variance zero and the emitter's
speed zero, all 32 particles stand exactly on the emitter, which the pool read back confirms. Two
systems at different world positions with different particle sizes paint two squares, each checked
against where the test's own `CreateLookAt`/`CreateOrthographic` camera puts that emitter and how
wide that particle size is there — within 1.5 texels, in the particle texture's colour and no
other. Drawing either alone puts its square in the same place, an emission rate of zero paints
nothing and does not fail, and moving the camera two units slides both by what the new view
predicts.

### Mutation results

```text
SHADOW DEPTH PASS      15 killed, 2 survived
PARTICLE DRAW           9 killed, 1 survived
HEADLESS BOUNDARY       2 killed, 0 survived
```

Killed: a dropped scene box; the box's Max sent as both corners; Color read as the light direction;
a negated light direction; an `End` reporting success without closing the pass; the shadow-texture
route wired to the caster-effect route; either caster getter wired to the other; a skinned caster
ignoring the palette length; a depth texture re-borrowed on every read; a `Dispose` destroying the
map before returning its borrows; a binding pre-empting CNA's own bone-palette limit; `Begin`
inventing a refusal on a renderer that cannot cast; a caster getter wrapping the invalid handle CNA
answers with; a particle draw swapping view and projection; one sending the view as both; one
dropping the texture; a settings setter losing the particle size; a softness setter never reaching
CNA; a stated shader binding point instead of CNA's.

Survived, each with a measured reason rather than an excuse:

- **Swapping the scene box's Min and Max.** Not an escape — CNA normalises the box. Measured: the
  pure-maths routes return a bit-identical matrix for a box and its swapped twin, so no route can
  distinguish them.
- **Ignoring a light's Intensity.** Every consumer of `CNA_DirectionalLightEXT` in the ABI — the
  shadow pass, the shadow maths, a cascaded update, the pipeline's shadow scene, the debug gizmo —
  takes it as input and none reports it back. Unobservable.
- **Creating at the default capacity by asking for 1024 explicitly.** Indistinguishable, because no
  route says which create was used. The number itself is not free-floating: the ABI contract now
  compiles `_Static_assert((uint32_t) CNA_PARTICLE_SYSTEM_DEFAULT_CAPACITY == 1024)`.

### Upstream finding 12: soft particles never fade

The depth image and the softness reach CNA, store, and read back, and the drawn particle does not
change — not even given a depth image saying every pixel is at the camera, which should erase it.
The GPU draw path is genuinely the one running: it paints 144 texels where the CPU billboard path
paints 169 for the same particle, so this is not a quiet fallback to the path that never had a
fade. Both extremes of the depth image were tried, in `Color` and `Single` render-target form and
as a plain `Texture2D`. No cause is claimed beyond the observable. `SetDepthInput` documents it on
itself, and the windowed test asserts the current behaviour so a repair fails it and says so.

### Boundaries asserted, not skipped

HEADLESS cannot compile a caster effect, and CNA's documented answer is to accept the pass and
render unshadowed rather than fail the frame, returning success with `CNA_INVALID_HANDLE` from both
effect getters. The binding passes the first through and refuses the second by name — it used to
raise an `AggregateError` about a failed reflection rollback, which is what wrapping a zero looks
like. The SDL_RENDERER and SOFTWARE builds have the engine layer compiled out entirely, so there is
no shadow map and no particle system to make; that `NOT_SUPPORTED` is checked against the separate
route that reports whether the layer is present.

### Final qualification

```text
npm test 332/332          test:differential 182/182    test:native 30/30 (HEADLESS)
test:extensions 10/10     test:cnb 39/39               test:content 10/10
test:wasm-browser 11/11   test:windowed 7/7 on each of OPENGLES3, SDL_RENDERER, SOFTWARE
verify:runtime RUNTIME_DIFFERENCES=0   verify:leaks PASS   verify:package PASS

audit:cna-abi   ABI=0.21.0 HEADERS=61 EXPORTS=4054 REQUIRED=46 MISSING_REQUIRED=0
                IMPORTS=1014 SIGNATURES_VERIFIED=1014 SIGNATURE_MISMATCHES=0
coverage:cna-abi UNEXPLAINED=0 REACHABLE_BUT_DEFERRED=0 NODE=1014 WASM=276
verify:cna-contract SCALAR_ASSERTIONS=37 DIAGNOSTICS=0 STATIC_ASSERTIONS_COMPILED=PASS
runtime:inventory ENTRIES=133 CONSISTENCY_GATE=PASS PROVED=112
                  VERIFIED_NATIVE=73 VERIFIED_MANAGED=21 VERIFIED_WEBASSEMBLY=13
```

Every one of the 1014 imported symbols is compiler-verified: the audit assigns each to its declared
function-pointer type in a C translation unit built with `-std=c11 -Wall -Wextra -Werror`. Four of
the six new particle routes were briefly invisible to that gate because they were loaded through
inline function-pointer types the audit's parser skips; they are named typedefs now, and the
verified count equals the imported count again.

### Upstream status

```text
 1  add_owned_pass owned-resource leak         still present
 2  SDL3 mixer stderr notice on success        still present
 3  cna_c_api_wasm WebGL version pin           FIXED in 0.21.0
 4  -sASYNCIFY=1 on every Emscripten link      FIXED in 0.21.0
 5  motion sensor IsDataValid disagreement     still present
 6  gyroscope has no synthetic test backend    still present
 7  OPENGLES3 render-target readback zeros     FIXED in 48ab0de7f
 8  cna_compute_shader_create vs its header    still present
 9  OPENGLES3 compute limits zeroed by a draw  FIXED in 48ab0de7f
10  four clustered creates document a game     still present
11  test-backend camera leaves a dangling      still present (SIGSEGV, child-process detector)
12  soft particles never fade                  NEW, measured, not fixed here
```

Four of twelve closed. Nothing in `cnanext` was edited from here to make any of them go away.

## 2026-08-31: seven modern-graphics families, and where the next session picks up

Seven families of the CNA engine layer were bound and qualified in one run, each committed on its
own with its own evidence. `native/cna_node_bridge.c` went from **1014 to 1547 imported symbols**,
every one of them compiler-verified against the real headers with `NODE_BRIDGE_SIGNATURE_MISMATCHES=0`
— a gate that earned its keep twice, catching a create route given a plain handle signature and a
draw route typed `int32_t` where the header says `CNA_PrimitiveType`.

```text
commit    family                        routes   the evidence that makes it more than "returned success"
6a79212   post-process passes             93     a LUT this test wrote, applied byte-exactly through
                                                 both a strip and a volume; the tonemapper predicted
                                                 texel by texel from CNA's own CPU curve; eight
                                                 byte-exact identities; CRT scanlines at exactly
                                                 source x (1 - intensity)
0e3260f   PBR materials and effects      121     two independent paths into one state -- a whole
                                                 material applied, read back through the per-field
                                                 accessors, then through the extractor; ApplyState
                                                 read back from CNA rather than the wrapper
b8c5c85   volumetric passes                39     Kasten-Young, Rayleigh-plus-Mie and a fog integral
                                                 written out from their own closed forms; a
                                                 three-state fallback ladder that names its missing
                                                 input
a376d7a   culling                          24     CNA's frustum culler against this package's own
                                                 XNA BoundingFrustum on the same geometry
9113f9f   debug draw                       20     every gizmo read back as its line list: a box's
                                                 exact ordered edges, a sphere's rings, a frustum's
                                                 eight BoundingFrustum corners
5a3edee   HDR display and exposure         35     SMPTE ST 2084 and BT.2087 from their own constants;
                                                 the composite encode bit-identical to its parts
e3a6418   render-pipeline settings         26     forty-seven fields moved by offsetof table; floors,
                                                 refused enums, a preset ladder, a parser that counts
```

Sixty-two planted binding defects were run across the seven batches. Fifty-eight fail. Four survive
and are recorded rather than hidden: two are **equivalent mutants** (a Reinhard roll-off and an "are
these sizes equal" predicate are both symmetric in the arguments the mutation swaps), one cannot be
observed while upstream finding 20 stands, and one replaces a constant-valued route with the constant
it returns, which no test can distinguish.

### Gates at the end of the run

```text
api:verify           TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0   (Windows and LIVE profiles)
verify:runtime       RUNTIME_DIFFERENCES=0   TARGET_TYPES=348
verify:leaks         INTERNAL_LEAK=0
audit:cna-abi        IMPORTED=1547  VERIFIED=1547  MISMATCHES=0  MISSING=0
verify:cna-contract  DIAGNOSTICS=0  ENUM_MEMBER_CLAIMS=978+
coverage:cna-abi     REACHABLE_NODE=1547  UNEXPLAINED=0  REACHABLE_BUT_DEFERRED=0
runtime:inventory    ENTRIES=158  CONSISTENCY_GATE=PASS  PROVED=137
npm test             332/332      native 41/41      windowed 16/16
```

### Upstream findings 17 to 20, all new here

```text
17  effect-pass borrow says "do not destroy it" and leaks if obeyed   NEW, measured
18  a REFUSED cna_game_destroy makes the process segfault at exit     NEW, measured, general
19  a PBR effect's texture slots have two sources of truth            NEW, measured
20  the GPU instance culler runs, reports success and culls nothing   NEW, measured
21  the OIT bracket's documented behaviour was corrected in the code,
    and its header and C shim still say the old thing                 NEW, measured
22  a ShaderEffect's FIRST SpriteBatch draw produces nothing at all   NEW, measured
23  three _init routes document identity transforms and write zeros   NEW, measured
24  a missing .cube and a malformed one are both NOT_SUPPORTED        NEW, measured
```

Item 18 is the one to read first: it multiplies every leak finding in the document, and it was found
by noticing that a probe process died *after* printing everything it meant to print.

### 9. One last sweep, which found dead code carrying a defect

The generator emitted a `#with...` writer beside every `#read...` reader whether or not anything
wrote that structure, and **seven were never called** — all output structures CNA fills. One of them
was wrong: `#withRenderPipelineStatistics` wrote `passes_run` twice, once from `PassesRun` and once
from `LastFramePassCount`, the second silently overwriting the first.
`CNA_RenderPipelineFrameStatisticsEXT` has no last-frame-pass-count field at all; the live reader
takes it from `cna_render_pipeline_get_last_frame_pass_count`, as the Node bridge does.

That is the argument for deleting dead code rather than leaving it: **no test can catch a defect in
code nothing calls**, so it passed every gate this package has. 214 lines removed, and 35 writer
bodies reindented out of the `try` block they only looked like they had left.

### Where the next session picks up

**`ACTIONABLE_LOCAL` is 0.** Every engine-layer route this package can honestly project is bound —
1718 imported symbols, all compiler-verified against the real headers, no signature mismatches.

The fifteen routes that remain unbound are the deliberate list, and binding them would be a
regression rather than progress:

```text
14  instanced_renderer_ext   needs CNA_ModelMeshPartHandle
 1  lod_group_ext_select     needs the same
```

This package's `ModelMeshPart` is a managed XNB projection with no native handle, so these routes
could only ever be handed zero. Fourteen of them were bound once and *unbound again* rather than
left counted as reachable in `docs/cna-api-coverage.md`. Both are recorded in comments in the bridge
beside the routes they belong to. **Do not "fix" this by binding them.**

### The qualification, as it stands

Every gate and every suite, run together on 2026-09-01 against `cnanext` at CNA C ABI 0.21.0:

```text
audit:cna-abi        IMPORTED=1718  MISSING=0  SIGNATURE_MISMATCHES=0
verify:cna-contract  DIAGNOSTICS=0
verify:leaks         INTERNAL_LEAK=0
api:verify           TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0   (frozen profile)
api:verify:live      TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0   (live reflection)
verify:runtime       RUNTIME_DIFFERENCES=0  TARGET_TYPES=348
verify:package       JAVASCRIPT_CONSUMER, TYPESCRIPT_CONSUMER, INTERNAL_EXPORT_BLOCK all PASS
verify:build-reproducibility  DIST_BYTE_IDENTICAL=PASS  (816 files, 5,443,270 bytes)

npm test             332 pass
test:differential    182 pass
test:native           52 pass   (HEADLESS)
test:windowed         20 pass   (OPENGLES3 under Xvfb)
test:cnb              39 pass
test:extensions       10 pass
test:content          10 pass   -- NEEDS CNA_NATIVE_LIBRARY or it silently skips all ten
test:wasm-browser     11 pass
test:wasm-browser-input 7 pass
```

`docs/runtime-capabilities.md` carries 167 qualified operations. Every one names what was measured
rather than what was called.

### What is left, which is not more binding

- **The four open upstream findings from this run.** 21 and 23 are documentation that no longer
  matches its own code; 22 and 24 are behaviour. Each has a detector here that *fails* when the
  behaviour changes, which is how a repaired upstream gets noticed rather than silently outgrowing
  a workaround. Finding 22 is the one to read first: it eats a frame.
- **Non-engine-layer headers**, if the brief is ever widened. `effects.h`'s `shader_effect` family
  was bound this run because the transparency qualification needed it; the rest of that header, and
  the other headers, are outside what was asked for.
- **The final handoff itself**, which this section is.

**Read finding 22 before writing anything that draws with a custom shader.** A fresh `ShaderEffect`
loses its first `SpriteBatch` draw, and a custom-shader draw leaves a GL error pending that the next
multiple-render-target bind refuses on. Both are asserted rather than worked around, and the
weighted-blended accumulation test shows the shape a test has to take to live with them.

## 2026-09-01: a native ModelMeshPart, the non-engine census, and two false floors

### 1. Repository state

- `cna-ts` started clean at `22de02d` on `develop` and ends clean, **nothing pushed**.
- `cna-ts-template` was not modified this session.
- `cnanext` and `sharp-runtimenext` are read only and **unmodified**: `git status` in both is clean
  and neither HEAD was moved by this session. The only files written under `cnanext` are untracked
  probe sources and binaries in the shared `build-probe/`, which is what that directory is for.

`cnanext` moved underneath the session, twice, which matters for every measurement below:

```text
e5ae0820e  11:51  fix(SAMPLE-092): register XNA List<string> content reader
c195fe8ce  14:56  fix(SAMPLE-100): replicate mutable session properties
7712534d3  16:11  fix(CABI-49): preserve mutable session properties in C
```

The two libraries under test were **not** rebuilt by this session — they belong to another agent's
build directories — so what each one contains is decided by when it was built:

| Library | Built | Contains |
| --- | --- | --- |
| `cmake-build-tsnext` (HEADLESS) | 12:51 | `e5ae0820e` |
| `cmake-build-debug` (windowed OPENGLES3) | 15:55 | `c195fe8ce` |

`7712534d3` is in neither. All three post-`e5ae0820e` commits concern mutable session properties, a
family this session classified and deliberately did not bind, so nothing here depends on them.
`docs/non-engine-census.md` carries this table, because a document that cited one revision for both
halves of its evidence would have been wrong about half of them.

### 2. What was asked, and what the answer turned out to be

The session's central question was whether CNA's model API could support a **truthful native
`ModelMeshPart` bridge** — one that does not upload the same geometry twice and does not give one
logical resource two owners. It can, and it does now. But the more useful finding is the one the
mandatory census produced at the end, and it is a lesson about method rather than about models:

> Four capability claims in this repository were measured on the headless build and then written
> down about "the current qualified backend". This repository qualifies **two** backends. Three of
> those four claims were false on the other one.

That is how `Effect.Parameters` came to be built empty for every compiled effect — a real, shipped
capability gap sitting behind a reason that read as settled architecture.

### 3. The native ModelMeshPart side-car, and what was measured before writing it

`docs/native-model-graph.md` is the ownership map, and it was written **before** any binding, from
a pure-C probe (`build-probe/cbind_modelpart_bridge_probe.c`). Four measurements decided the design:

| Stage | Measured | Consequence |
| --- | --- | --- |
| `vb_same=1 ib_same=1` | a part built over existing buffers uploads no second copy | no duplicate geometry, which the brief forbade |
| `vb_destroy=3` | CNA refuses to destroy a buffer a part retains (`INVALID_STATE`) | retention is enforced by CNA, not by convention here |
| `STAGE6_NEAR/FAR` identical handle | LOD select returns the handle it was given | `select` is a **borrow**, and is the one route that can be |
| `first_is_original=0 second_is_first=0` | collection getters mint a fresh handle every call | handle equality is **not** identity, so a reverse map keyed on handles would be wrong |

The last one is why the side-car exists at all. `src/internal/native-mesh-part.ts` keeps a `WeakMap`
from the public `ModelMeshPart` to a private native view, a reverse map keyed on the handle's
string, and a teardown hung on `NativeResourceLifetime.TrackCallback` for both buffers. Nothing
public exposes a handle, a bigint id, or any bridge internal: the strict XNA surface did not change,
and `api:verify` proves it.

Ownership, in the vocabulary the brief required:

| Object | Label |
| --- | --- |
| the managed `VertexBuffer` / `IndexBuffer` | **OWNED** by the managed side |
| the native `CNA_ModelMeshPartHandle` | **OWNED** by the side-car |
| those buffers, as CNA sees them | **RETAINED_DEPENDENCY** — CNA refuses to destroy them, measured |
| the handle returned by `lod_group_select` | **BORROWED** — it is the handle that went in |
| a collection getter's handle | **TRANSIENT_VIEW** — fresh per call, released immediately |

The teardown moved from `GraphicsResource.Dispose` to the lifetime callback after a real failure:
disposing the *game* cascades to children and bypassed the Dispose guard, so a retained buffer was
destroyed under CNA and produced `CNA result 3`. Hanging it on the lifetime fixes both paths.

With real identity in place the **fifteen** engine model-part routes that had been unbound are bound
and exercised. The comment that used to say `ModelMeshPart` had no native handle to give was
replaced with what is now true, including why `select` is the one borrow.

### 4. The content decision, taken rather than left as UNIMPLEMENTED

`docs/native-content-survey.md`. Loading **stays managed** — one authority for asset identity — and
CNA's content *survey* is adopted, because it answers a question the managed loader does not: what
is in a content root and which readers does it need. The CNB loader registry is deferred **with**
the load routes and for their reason, not as a leftover.

### 5. The non-engine census

`docs/non-engine-census.md` retired the blanket reason —

> the adapter imports nothing from this header, so the whole family is measured and deferred

— from eleven headers. That sentence described history, and it was hiding working capability. Three
families were not blocked at all:

| Family | Was reported | Actually |
| --- | --- | --- |
| `MediaLibrary` | empty collections, `SavePicture` refuses | indexes Music and Pictures; a WAV gives a song, an album, an artist |
| the clipboard | writable, not readable | round-trips exactly, non-ASCII included |
| attached input devices | nothing projected | one mouse and one keyboard, by the platform's names |

`AvatarDescription` was a fourth, with a twist worth keeping: `CreateRandom` returns **1021 zero
bytes, identical every call, with `IsValid` false**, and the `bodyType` overload validates its
argument and then ignores it. That is XNA's own behaviour, which CNA reproduces on purpose and says
so in its source. The honest projection hands back the zeros.

`INTENTIONALLY_DEFERRED` went **515 → 0**.

### 6. `effects.h`: the false floor

`Effect.Parameters` was built **empty** for every natively reflected effect. The code said
`Parameters: []`, and the obvious check agreed with it: a stock effect's native parameter collection
really is empty — `cna_basic_effect_create` then `cna_effect_get_parameters` answers **count 0** on
both builds. So forty-five routes looked like a container CNA offers and never fills.

`effects.h` says compiled-effect support "is a renderer property, not a property of this ABI".
Asked of the running binary instead of inferred from the renderer's name:

```text
HEADLESS            COMPILED_EFFECTS=0   cna_effect_create_compiled -> result 6 (refused)
windowed OPENGLES3  COMPILED_EFFECTS=1   cna_effect_create_compiled -> SUCCESS
```

And the reflection is real. XNA's own `BasicEffect.fxb` gives **23** parameters with names, classes,
types and dimensions: `World` as a 4×4 matrix of singles, `Texture` as an Object of type `Texture2D`,
`VSIndices` and `PSIndices` as 32-element arrays, `DiffuseColor` as a float4 — not the float3 a guess
would have written, and there is no `Alpha` parameter at all because FNA's BasicEffect packs alpha
into `.w`. `CnaConformanceEffect.fxb` gives its own six, which is what proves the reflection comes
from the effect that was loaded rather than from somewhere else.

So a consumer who loaded a compiled effect on a renderer that could run it got a shader it could
draw with and **not one uniform it could set**. That is bound now, with the pieces that make it
truthful rather than merely present:

- **`SetValue` writes through.** The test sets a `Matrix`, a `Vector4` and a scalar and reads each
  back through `cna_effect_parameter_get_value`, because `GetValue*` answers from managed state and
  would have passed either way.
- **`SetValueTranspose` too.** It stored without writing through — the same defect one method along
  — and is fixed and asserted with a non-symmetric matrix, after the assertion guard caught a first
  fixture (`CreateScale`) that was symmetric and therefore proved nothing.
- **Arrays, textures and strings each get their real route**, so `SetValue(Matrix[])` and a sampler
  reach the shader instead of being stored and silently dropped.
- **A shape CNA cannot carry is refused by name.** A `SetValue` that returns normally and never
  reaches the shader is the worst failure available here.
- **Annotations are read, not invented.** Parameters, techniques and passes all carried an empty
  annotation array; all three are reflected now, and an annotation whose value CNA has no accessor
  for is **dropped** rather than published with a stand-in zero.
- **Stock effects stay managed-authoritative**, asserted as a control so the split is checked.

Ownership: each parameter view CNA mints is **OWNED** and released through a
`NativeResourceLifetime` parented on the effect, exactly as the technique and pass views already
were. No handle reaches public API.

### 7. Three more claims that generalised from one backend

`effects.h` was not a one-off; the *shape* of its error was the finding. Every capability the
inventory called `EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND` was re-asked of the windowed build:

| Claim | Windowed build |
| --- | --- |
| Texture3D/TextureCube creation "returns NOT_SUPPORTED" | creates a 4×4×4 volume and an 8-wide cube; the volume round-trips two different texels |
| "no windowed adapter/display evidence" | already superseded by a later entry binding all fourteen adapter routes — the stale one was a duplicate, removed |
| "no physical window or event stimulus" | `ApplyChanges` resizes 320×240 → 512×384 and `ClientSizeChanged` fires once with the new bounds |
| `ContentLost` | **stands**: CNA raises it only where the API can lose a device, and OPENGLES3 is not such a renderer |

Each correction is now a test rather than a sentence. The window case also asserts the negative:
unsubscribing and resizing again to 400×300 delivers no second event *while the resize still
happens*, which separates removal from a resize that never occurred.

### 8. WebAssembly

276 → 343 routes, selected for what a browser can actually do rather than for parity. The slice now
draws **3D geometry** and reads the texels back: a triangle into an 8×8 render target, three times —
identity, translated off-screen, nudged — with the pixels compared.

The first attempt produced only the clear colour. Running the identical code against the proven Node
backend produced the same nothing, which is what proved the *scene* was wrong rather than the slice:
XNA culls counter-clockwise by default. `RasterizerState.CullNone` and `DepthStencilState.None` fixed
it. That comparison is the technique worth keeping — a second implementation is a cheaper oracle than
reasoning about a backend.

Layouts remain Emscripten-measured; no offsets were handwritten. The wasm32 by-value struct
convention was measured with a probe and written down, closing an item `docs/c-api/WASM_ARTIFACT.md`
had left open.

### 9. Route coverage

```text
                     start of session   end of session
Node imported              1718              1889
Wasm routes                 276               343
INTENTIONALLY_DEFERRED      515                 0
UNEXPLAINED                   0                 0
REACHABLE_BUT_DEFERRED        0                 0
SIGNATURE_MISMATCHES          0                 0
NEVER_LOADED_FIELDS           -                 0
```

`coverage-rules.json` went 14 → 46 rules. Every remaining unreached family carries a reason about
the route rather than about the calendar; the four rules added for `effects.h` are the model:
collection *builders* are unbound because this package reflects an effect rather than authoring one;
`find_name`/`find_semantic` because the managed collections already index the same rows by both keys
and CNA's find mints a fresh owned view per call; the value read-backs because the write-through
keeps managed and native in step; the stock-effect getters because the managed snapshot is
authoritative and CNA offers no reflected state for a stock effect to be authoritative over —
measured, not assumed.

### 10. A permanent gate that came out of a crash

Three `g_api` fields had been declared by an earlier session with no `LOAD_REQUIRED`. They were NULL
function pointers, and calling one segfaulted the model-part test. `tools/audit-cna-abi.mjs` now has
a `NODE_BRIDGE_NEVER_LOADED_FIELDS` gate, **proven to fail on a planted defect**, so a declared-but-
unloaded field is a failing audit rather than a crash in whichever test reaches it first.

### 11. Mutation evidence, including a run that was wrong

Eleven planted defects across the media-library and avatar suites: **eight fail**. The three that
survive are recorded with what makes each unobservable — an equivalent mutant (CNA generates no
separate thumbnail, so album art and thumbnail return the same bytes by design), a fixture-limited
one (`BodyType` and `Height` are both zero in every description obtainable without a gamer), and an
unobservable one (a native handle leak, where CNA exposes no live-object count — checked — and
`verify:leaks` is an API-surface gate, not a memory one). A fourth "survivor" was **vacuous**: it
mutated a call that the baseline deliberately never makes.

The part worth carrying forward is that the **first media-library run reported `KILLED=0` and was
wrong**. Its picture mutant swaps width for height against a deliberately 2×1 PNG that the suite
asserts exactly; it cannot survive. The harness had scored a run whose tests never executed. Rebuilt
to parse the TAP summary and refuse a verdict when `pass + fail == 0`, it killed that mutant and the
source-name mutant immediately. It also now refuses an anchor that does not match exactly once,
which caught the source-name mutation patching the wrong call site — reported as `ANCHOR x2` rather
than scored.

**A mutation run that cannot prove the test executed against the mutated artifact is not evidence,
and the number it prints is worse than no number at all.**

### 12. Upstream findings

17–24 preserved and re-detected. Three new, none fixed from here:

- **25** — a `logic_error` arm reachable through a public route.
- **26** — `AvatarDescription::CreateRandom`'s header describes randomisation the implementation
  deliberately does not do (CNA's own comment says it is preserving XNA exactly; the *header* is
  what misleads).
- **27** — `SpriteFont::MeasureString` counts a **negative trailing right side bearing** into the
  width. Settled against XNA's own IL: `monodis` on `Microsoft.Xna.Framework.Graphics.dll` shows
  `InternalMeasure` adding `Math.Max(pending, 0f)` at each line break and once after the loop, so
  the trailing bearing is clamped. This package matches XNA; CNA does not. The five diverging
  strings are asserted exactly, so a repaired CNA fails them.

Finding 27 came out of building a **second implementation as an oracle**: CNA's own `SpriteFont`,
over the same texture and glyph table, sharing no code. Over twenty-four strings the two agree
eighteen times.

### 13. Gates and suites at the end of the run

```text
api:verify                TOTAL_DIFFERENCES=0   ALLOWLIST_SIZE=0   (Windows profile)
api:verify:live           TOTAL_DIFFERENCES=0   ALLOWLIST_SIZE=0   (live reflection)
verify:leaks              INTERNAL_LEAK=0
verify:runtime            RUNTIME_DIFFERENCES=0   TARGET_TYPES=348
verify:cna-contract       DIAGNOSTICS=0
audit:cna-abi             IMPORTED=1889  VERIFIED=1889  MISMATCHES=0  NEVER_LOADED=0
                          WASM_BACKEND_ROUTES=343  MISSING_WASM_BACKEND_EXPORTS=0
coverage:cna-abi          UNEXPLAINED=0  REACHABLE_BUT_DEFERRED=0  INTENTIONALLY_DEFERRED=0
                          REACHABLE_NODE=1889  REACHABLE_WASM=343
runtime:inventory         ENTRIES=174  CONSISTENCY_GATE=PASS  PROVED=158
verify:package            PASS      verify:build-reproducibility  PASS
verify:package-reproducibility  PASS
```

Suites, all green:

```text
npm test                 332      differential            182
native                    52      cnb                      39
extensions                10      content (required)       10   <- executed, 0 skipped
model-part                 9      content-survey            8
input-devices              3      media-library             6
avatars                    8      sprite-font-oracle        5
effect-reflection          5      windowed                 22
wasm-browser              12      wasm-browser-input        7
```

`windowed` is 20 → 22 and `effect-reflection` is new; both need `CNA_WINDOWED_LIBRARY` and a
display, and both skip cleanly without one. That skip is exactly the trap `test:content` had, so it
is worth saying plainly: **these suites are where three of this session's four findings live, and a
CI job that omits the windowed library will report green while testing none of them.**

### 14. What was measured wrong first, and caught

Six readings in this session were wrong on the first measurement. None reached a document or a
finding, and the reason they did not is worth more than the findings themselves.

| Wrong reading | Cause | Caught by |
| --- | --- | --- |
| media-library collection getters "return SUCCESS with the invalid handle" | C leaves argument evaluation order unspecified; the out-parameter was read in the call that filled it | sequencing the calls |
| avatar `get_info` reports zero bytes while declaring 1021 | the same bug again | the same fix |
| "two random avatar descriptions differ" | `memcmp` over 1021 bytes in a 512-byte buffer | sizing the buffer |
| media-library mutation score `KILLED=0` | the harness scored a run whose tests never executed | a harness that refuses a verdict when `pass + fail == 0` |
| the browser 3D draw produced only the clear colour | the *scene* was wrong — XNA culls counter-clockwise | running the same code on the proven Node backend |
| `SetValueTranspose` "proved" by a `CreateScale` fixture | a scale matrix is symmetric, so the transpose proved nothing | the assertion written to fail on a vacuous fixture |

Two of these — the argument-order pair — nearly became upstream findings against CNA. **Nothing was
filed from them**, which is the only reason the census describes CNA's behaviour rather than a
defect that was never there.

### 15. What is deliberately not bound, and why

The reasons that matter, in one place, none of them "historically deferred":

- **`net_sessions.h` / `net_gamers.h`** — not blocked by CNA. Sessions are created on this host,
  Local and SystemLink, and report their state. They are blocked by what a session needs first: a
  signed-in gamer. The only route that makes one is CNA's hook for a *platform layer* to publish
  one, so calling it from the binding would be inventing the player and every session claim built on
  it would be false. A synthetic-gamer test hook, in the style of `CnaCamera.OpenForTests`, is the
  one honest route to local exercise. Recorded, not done.
- **`graphics_resource.h`** — twelve routes, all working, none bound. This package's `Name` and `Tag`
  are authoritative in TypeScript, and XNA's `Tag` is a managed object of any type where CNA's is a
  `uint64`: the two cannot hold the same value.
- **`runtime_components.h`** — CNA's header states a game owns exactly one component collection.
  Binding these would give one game two.
- **`models.h`** — a parallel native model graph. CNA's getters mint a fresh owned handle per call,
  so it cannot even preserve the object identity the managed graph has. The one place a native
  object is genuinely needed — a part handle for the engine extensions — is the side-car above.
- **CNA's XNB reader stack** — a parallel decoder for a format this package already decodes;
  adopting it needs the native `ContentManager` that would be a second asset cache.

### 16. Build and artifact hygiene

Every build reused an existing directory. Nothing was built in the scratchpad or under `/tmp`. No
new build directory was invented and none was suffixed with a ticket or a date: all probes went into
`cnanext`'s shared `build-probe/` under the `cbind_*` file-name prefix. Dependencies were not
re-cloned. `ccache` was used throughout. The two dependency build directories belong to another
agent and were read only — neither was reconfigured, cleaned, or rebuilt.

Probe binaries left in `build-probe/` are small; the sources are worth keeping since each one is the
evidence behind a documented claim, and they are untracked in a repository this session must not
commit to.

### 17. What remains ACTIONABLE_LOCAL

**Zero, as of the sweep above** — but that claim is worth less than it was this morning, and the
next session should treat it as a starting hypothesis rather than a result. It was zero before
`effects.h` was re-examined too.

The check that found four real items, and the one to run again when the dependency moves:

1. Take every claim of unavailability and ask **which backend** it was measured on. Anything that
   says "the current qualified backend" is suspect: there are two, and a capability that is a
   renderer property has to be asked of each.
2. Take every collection this package projects as empty and ask whether CNA has rows for it. The
   `Parameters: []` line had been correct once and stopped being correct without anything changing
   in this repository.
3. Prefer asking the running binary over reading the renderer's name. `COMPILED_EFFECTS` is true on
   OPENGLES3 *when the build option is on*, which no amount of reading the renderer identity tells
   you.

Named, unfinished, and honest:

- **Orientation and screen-device-name events** have no stimulus on this host: one display, no
  rotation. Not a binding gap.
- **`ContentLost`** needs a renderer whose API can lose a device. Not available here.
- **A synthetic signed-in gamer test hook** would make `net_sessions.h` and `net_gamers.h` locally
  exercisable without fabricating a player in the shipping path. This is the largest remaining block
  (136 routes) and the only one whose reason is "no honest fixture" rather than "no capability".
- **Compiled-effect *execution*** — parameters are set and read back, but no test yet draws with a
  compiled effect and asserts pixels. The reflection is proved; the draw is not.

### 18. Git state

Nine commits on `develop`, **nothing pushed**, working tree clean. No prior engine commit was
rewritten. Before each commit: the diff was read, focused tests were run, `git diff --check` was
clean, generated output was regenerated and inspected, and the mutation artifact was proved back at
baseline.

### 19. The gates, and one that had to be strengthened

`npm run test:content` silently skips all ten of its tests when `CNA_NATIVE_LIBRARY` is absent and
still reports zero failures. That is convenient for a developer and dangerous for a handoff, so the
ordinary behaviour is unchanged and a new `test:content:required` sets `CNA_REQUIRE_CONTENT_TESTS=1`
and turns the skip into a **named failure**. The final gate uses it.

**`CONTENT_TESTS_EXECUTED=10`, skipped 0.**

### 20. Where the next session picks up

The engine and non-engine surfaces are closed to the best of this session's ability to measure them.
The highest-value work is not more binding:

1. **Draw with a compiled effect and assert the pixels.** The parameters demonstrably reach CNA; the
   remaining question is whether a pass drawn with them produces the image XNA would. That is the
   natural completion of section 6, and it needs the windowed renderer.
2. **The synthetic-gamer hook**, which would unlock the largest deliberately-unbound block without
   inventing a player anywhere a consumer could reach.
3. **Re-run the two audits in section 17 whenever `cnanext` moves.** Both found real, shipped gaps
   this session, and neither is expensive.

Read `docs/upstream-cna-findings.md` finding 22 before writing anything that draws with a custom
shader; it has not changed and still applies.

## 2026-09-01: pixels from a compiled effect, gates that cannot be vacuous, and a window nobody meant to open

### 1. Where this started

`cna-ts` clean at `ecaf8ba`, nine commits unpushed. `cna-ts-template` clean at `8a806d8`.
`cnanext` at `7712534d` and `sharp-runtimenext` at `bd282d10`, both read-only and both untouched.

The handoff named one thing above all others: the parameters of a compiled effect demonstrably
reached CNA, and nothing said they reached the *shader*.

### 2. Dependency identity, and why it needed two rows rather than one

`cnanext` had not moved in any way that mattered — one commit, `CABI-49`, touching `net_sessions`
alone. The interesting part is that the **artifacts are not the source**, and their timestamps bound
them differently:

| artifact | built | carries at most | behind HEAD by |
| --- | --- | --- | --- |
| windowed OPENGLES3 `cmake-build-debug` | 15:55 | `c195fe8ce` | `7712534d` |
| HEADLESS `cmake-build-tsnext` | 12:51 | `e5ae0820e` | `c195fe8ce`, `7712534d` |
| WEBGL2 `cmake-build-tswasm` | 08-31 06:57 | — | — |

Everything between is `modules/net`. No measurement here depends on the gap, which is why it is
written down rather than smoothed over.

### 3. The main result: a compiled effect draws, and the pixels were predicted first

`CnaConformanceEffect.fxb` is the fixture because CNA ships **its HLSL source** beside it. That is
what makes the expectation independent: it is computed from the shader's own arithmetic and the
values the test sets, never from `GetValue*`, which answers from managed state and would agree with
its own setter whether or not a uniform ever moved.

`SecondTechnique/P1` is `return Tint * Weights[1];` and samples nothing:

| state | Tint | Weights[1] | predicted | measured |
| --- | --- | --- | --- | --- |
| declared | 0.1, 0.2, 0.3, 0.4 | 0.8 | 20, 41, 61, 82 | 20, 41, 61, 82 |
| A | 0.8, 0.6, 0.4, 1.0 | 0.5 | 102, 76.5, 51, 127.5 | 102, 76, 51, 128 |
| B | 0.2, 1.0, 0.8, 0.6 | 0.5 | 25.5, 127.5, 102, 76.5 | 25, 128, 102, 76 |
| C | 0.2, 1.0, 0.8, 0.6 | 0.25 | 12.75, 63.75, 51, 38.25 | 13, 64, 51, 38 |

A to B moves only `Tint`; B to C only `Weights[1]`. `FirstTechnique/P0` is a different program over
identical parameter state — it samples a white texel and scales by `Gain` and the `Lighting` struct
— so its disagreement with P1 is what makes `CurrentTechnique` selection *evidence* rather than an
assumption, and `Lighting.Intensity` with `Lighting.Thresholds[0]` are a struct member and a struct
array element that only the pixels could prove. Halving `Gain` alone halves that image.

The declared row is the same four bytes CNA's own
`EasyGLCompiledEffectDrawTest.RendersTheAppliedPassesExpectedPixelsIntoARenderTarget` expects
through its internal renderer API — a second implementation of the expectation, reached by a
different route.

### 4. Two things went the other way from what finding 22 predicted

Finding 22 says a fresh `ShaderEffect`'s first `SpriteBatch` draw produces nothing, and that a
custom-shader draw leaves a GL error that refuses the next multiple-render-target bind. Both were
**measured** for the compiled route rather than assumed:

- a freshly constructed compiled effect's *first* draw is already correct, with nothing priming it;
- an MRT bind straight after a compiled-effect draw succeeds.

So both halves of finding 22 belong to `ShaderEffect`, not to custom shaders generally. The finding
now says so, and both are asserted, so a compiled effect acquiring either defect fails.

### 5. The mutation harness is committed this time

It lived in a previous session's scratchpad and was gone. `tools/mutation-harness.mjs` refuses a
verdict it cannot justify: an anchor not matching exactly once, a build whose output is
byte-identical to the baseline, or a run where `pass + fail == 0`. Source and artifact are proved
back at the baseline hash.

Compiled effect: **8 planted, 8 killed** — four dropped write-throughs, a truncated array, a no-op
`Apply`, an ignored technique, a zeroed `Vector4` W. Audio: **5 planted, 4 killed**; the survivor is
recorded as fixture-limited, because how many capture devices this host has is only knowable from
the routine under test, and killing it would need a second call to the same C route dressed up as an
oracle.

### 6. Gates that could not be vacuous

`test:windowed` and `test:effect-reflection` skipped cleanly without `CNA_WINDOWED_LIBRARY` or a
display, and `node --test` reports a suite that ran nothing exactly like a suite that passed. CI was
walking into it: the windowed step ran the optional suite with a variable that may be empty, and the
content pipeline was not in the workflow at all.

`test/support/required-suite.mjs` is now shared by all three suites. Four arms, all measured:

```text
required, no CNA_WINDOWED_LIBRARY             exit 1, names the variable
required, no DISPLAY                          exit 1, names the display
required, environment present, all tests skip exit 1, names the count
optional, no environment                      exit 0, ten skips -- unchanged
```

### 7. The audit rule that keeps paying: which backend was this measured on?

Two capability rows said microphones enumerate as none and that playback "verifies state and
lifetime only". Both were true of HEADLESS, whose audio platform is `NULL`, and were written down as
facts about CNA. The windowed build is `CNA_AUDIO_PLATFORM=SDL3`:

| | HEADLESS (NULL) | windowed (SDL3) |
| --- | --- | --- |
| microphones | 0 | 3, named, 44100 Hz |
| Play / Pause / Resume / Stop | Stopped, Stopped, Stopped, Stopped | Playing, Paused, Playing, Stopped |
| `SoundEffect.Duration` of 4410 frames at 22050 Hz | 0 ms | 200 ms |

Capture is deliberately never started: enumerating devices touches no audio, where opening a capture
stream would record from this host's real microphone. Audible output stays UNVERIFIED and the suite
prints it that way.

Two more rows were stale the same way — "GPU custom-effect and rendering output" and "Windowed
renderer behavior on Linux" both described HEADLESS — and one had a stale clause ("Electron: no
windowed artifact"). PROVED went 158 → 163, `HARDWARE_PENDING` 6 → 3, `NOT_APPLICABLE` 1 → 0.

### 8. Upstream finding 28, and a wrong reading caught on the way

`Microphone.BufferDuration` reports 1000 ms and its own setter **refuses 1000 ms**, so
`m.BufferDuration = m.BufferDuration` throws. It also accepts 1100, 1500 and 2500 ms, which XNA
rejects. XNA's IL settles the contract — `blt 100.` and `bgt 1000.` on `get_TotalMilliseconds`, both
strict — and CNA's `Microphone.cpp` reads `getMillisecondsProperty()`, the **sub-second component**.
That one substitution produces every row: 1000 ms arrives as 0 and fails the lower bound. CNA's own
source and its own test each note the `> 1000` branch is unreachable and treat it as harmless; it is
the symptom.

**A sweep first reported that 500 ms was refused, and that was wrong.** The throw came from the
restore write of 1000 ms afterwards and I had attributed it to the statement before it. Isolating
each value in its own process gave the table and a root cause that *predicts* every row — including
the three where CNA is more permissive than XNA, which were predicted from the source and then
measured, not the reverse.

### 9. Upstream finding 29: net sessions, and the only honest way to reach them

Reproduced against the live C ABI with every out-parameter poisoned first:

```text
cna_gamer_get_signed_in_gamer_count            SUCCESS, count 0
cna_network_session_create(LOCAL, 1, 4, &out)  INVALID_ARGUMENT, out invalid
cna_signed_in_gamer_create_ext("Player", ...)  SUCCESS
cna_gamer_set_signed_in_gamers_ext(&gamer, 1)  SUCCESS, count 1
cna_network_session_create(LOCAL, 2, 8, &out)  SUCCESS, session valid
```

Steps two and five are the same call. CNA's own `pure_c/NetSmoke.c` runs this and has to invent a
gamer called `"Player"` to get past step two — which a binding must not do, because
`cna_signed_in_gamer_create_ext` exists so a *platform layer* can publish the gamer that is really
signed in. **No synthetic gamer test backend has been added**; the header and `docs/c-api/NET.md`
were both re-read.

The request has a shape CNA has designed five times already —
`cna_compass_set_test_backend_ext` and four siblings — and the compass header's rationale is this
finding with one noun changed. `tools/upstream-repro/net-signed-in-gamer.py` keeps the sequence
runnable. The family stays `BLOCKED_UPSTREAM_TESTABILITY`.

### 10. WebAssembly: the artifact was never asked

`createEffectCompiled` was not in the WebAssembly effect slice, so the binding declined a compiled
effect before CNA saw it — and a consumer whose artifact *did* carry the runtime would have been
told the wrong thing about whose limitation it was. The route is registered now and the bytes go
through, so the answer is CNA's:

```text
CNA result 6: ... (GraphicsCapability::CompiledEffects is false).
```

the same result and sentence the Node HEADLESS backend gives. The test asserts that and takes the
other branch — six parameters, two techniques — if an artifact ever answers differently, so today's
answer is a build option (`CNA_EASYGL_COMPILED_EFFECTS=OFF`) rather than permanent behaviour. No
separate browser Effect API; this is the public XNA constructor reaching one more private route.
`WASM_BACKEND_ROUTES` 343 → 344.

### 11. Two gates that existed, were correct, and had been failing quietly

- The workflow pins a CNA SHA and `cmp`s three reports against a fresh run from it. Measured by
  extracting `modules/c-api/include` at each revision: the pin `17b5a90a0` declares **4051** routes,
  the checked-in report said **4054**. The `cmp` could not have passed. Both now name `89024e0d4` —
  the newest commit that exists on the CNA *remote*, because `cnanext` has ten local-only commits
  and a SHA the workflow cannot fetch is not a pin.
- `src/internal/backend-base.ts` was stale against its own generator, which the workflow also
  checks. Regenerating reorders members; the member and class multisets are identical and the
  generator is idempotent on its own output.

Seven suites that pass locally were never invoked by CI at all and now are.

### 12. The window nobody meant to open

**A user asked what kept flashing blue windows onto their desktop. It was this project.**

`xvfb-run` sets `DISPLAY` and leaves `WAYLAND_DISPLAY` alone; SDL3 prefers Wayland whenever that is
set, so every windowed run since this host became a Wayland session had ignored Xvfb and opened real
windows. Nothing failed — the renderer initialized, the pixels were correct, the suites were green.
The only symptom was on a screen the run could not see.

Both suites now pin SDL to `x11` before the backend loads, so `DISPLAY` is honoured. And it changed
what was being measured:

```text
real desktop   AMD Radeon 780M (radeonsi)   MSAA up to 8x
Xvfb           llvmpipe (LLVM 19.1.7)       MSAA up to 4x
```

Every windowed measurement in this project had been made on the GPU. Two tests had pinned that
rasterizer's rounding as exact and fail on the other — `0.125 × 255 = 31.875` resolves to 32 on the
AMD part and 31 on llvmpipe — and now assert the arithmetic to within a byte, naming both. The
distinctions they exist to make are separated by tens, not by one.

**The compiled-effect pixel tests needed no change.** They were written with a one-byte tolerance
from the start and pass unaltered on both rasterizers, and all eight mutants still die on llvmpipe.
That turns section 3 from a property of this GPU into a property of the shader.

### 13. Gates at the end of the run

```text
api:verify / api:verify:live   TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0
verify:runtime                 RUNTIME_DIFFERENCES=0   TARGET_TYPES=348
verify:leaks                   INTERNAL_LEAK=0
verify:cna-contract            DIAGNOSTICS=0
audit:cna-abi                  IMPORTED=1889  VERIFIED=1889  MISMATCHES=0  NEVER_LOADED=0
                               WASM_BACKEND_ROUTES=344  MISSING_WASM_BACKEND_EXPORTS=0
coverage:cna-abi               UNEXPLAINED=0  REACHABLE_BUT_DEFERRED=0  NODE=1889  WASM=344
runtime:inventory              ENTRIES=175  CONSISTENCY_GATE=PASS  PROVED=163
verify:package / build- / package-reproducibility   all PASS
```

```text
test 332   differential 182   native 52   cnb 39   extensions 10
content (required) 10, skipped 0        windowed (required) 25, skipped 0
effect-reflection (required) 10, skipped 0
model-part 9   content-survey 8   input-devices 3   media-library 6
avatars 8   sprite-font-oracle 5   wasm-browser 13   wasm-browser-input 7
```

Template: build PASS, Node 60 and 600 PASS, Browser 60 and 600 PASS, extensions smoke PASS,
generated TypeScript and JavaScript consumers PASS.

### 14. What was measured wrong first, and caught

| Wrong reading | Cause | Caught by |
| --- | --- | --- |
| "`BufferDuration` refuses 500 ms" | the throw came from the *restore* write of 1000 ms on the next line | isolating each value in its own process |
| "the browser refuses compiled effects" | the *binding* refused before CNA was asked | reading the message instead of the outcome |
| "the artifacts are at `cnanext` HEAD" | HEAD landed after both were built | comparing mtimes against commit timestamps |
| "the CI pin matches the reports" | it declares 4051 routes and they say 4054 | running the workflow's own `cmp` locally |
| "`xvfb-run` means Xvfb" | SDL3 prefers Wayland when `WAYLAND_DISPLAY` is set | a user asking what was on their screen |

The last one is the one to carry forward: **it produced no failure of any kind.** Every suite was
green, on a better GPU than intended, writing windows onto somebody's desktop. No gate in this
project could have caught it, and none can — the check that found it was a person looking at a
screen.

### 15. Where the next session picks up

`ACTIONABLE_LOCAL = 0`. Everything left is external:

- `BLOCKED_UPSTREAM_TESTABILITY` — the synthetic signed-in gamer (finding 29, ~136 routes).
- `BLOCKED_UPSTREAM` — findings 1, 2, 5, 6, 8, 10–28 as recorded; the gyroscope's reading path.
- `BLOCKED_RENDERER` — `ContentLost` needs a renderer whose API can lose a device.
- `BLOCKED_FIXTURE` — XACT (no legal XGS/XSB/XWB corpus), `VideoPlayer` decode.
- `BLOCKED_HARDWARE` — physical joystick/haptics, physical keyboard/mouse/gamepad/touch (asked of
  both backends this session; both answer nothing attached, which is a fact about a host with nobody
  at it).
- `BLOCKED_PLATFORM` — Android/iOS, Electron, Windows/macOS runtimes.
- `DELIBERATE_NON_BINDING` — `graphics_resource.h`, `runtime_components.h`, `models.h`, CNA's XNB
  reader stack, all for the architectural reasons the census records.

Three things would change that from outside: a **gamer test backend** upstream; a Wasm artifact
built with **`CNA_EASYGL_COMPILED_EFFECTS=ON`**, which would make section 10 take its other branch
and put compiled-effect pixels in a browser; and **pushing `cnanext`**, which would let the CI pin
move past `89024e0d4`.

And one habit: when `cnanext` moves, ask every claim of unavailability *which backend* it was
measured on. That question has now found six stale rows across two sessions, and it found two of
this session's three upstream findings.

## 2026-09-01: the artifact was the limitation, and it was liftable

### Where this started

The previous session left `ACTIONABLE_LOCAL = 0` and three external unblockers, two of which were
CMake options on the WebAssembly artifact. Both were taken. Everything below follows from that one
move, and the point of writing it down this way is that **none of it was a limitation of this
binding** — it was a limitation of the binary a consumer happens to build.

`cna-ts` started clean at `96bedcc`, `cna-ts-template` at `8a806d8`, `cnanext` at `7712534d` and
`sharp-runtimenext` at `9cc96cd5`. Both dependencies end with **zero modified tracked files**.

### 1. Two artifacts, and the binding answers truthfully for both

`cmake-build-tswasm-fx` is a new, config-named build directory in `cnanext` — `WEBGL2`,
`CNA_EASYGL_COMPILED_EFFECTS=ON`, `CNA_CNAEXT=ON`, MojoShader through the shared `~/deps/FNA3D`
checkout. The default `cmake-build-tswasm` is untouched and still the one the ordinary suites run
against.

| asked of the running artifact | default | strong |
| --- | --- | --- |
| `cna_graphics_ext_is_available` | false | true |
| `cna_instanced_renderer_ext_get_instance_stride` | `NOT_SUPPORTED` | 64 |
| `GraphicsCapability.CompiledEffects` | false | **true** |
| `new Effect(device, fxb)` | `NOT_SUPPORTED`, naming the capability | a live effect |
| device capabilities | 16/19 | 17/19 |

The last row is the sharpest: **`CompiledEffects` is the only identity that moves**. That is a
second, independent confirmation of the compiled-effect capability, reached without touching the
`Effect` constructor — and it is why the two artifacts can be compared at all rather than merely
described.

No binding-specific link setting was needed. Both ABI-0.20-era workarounds are still fixed upstream,
and `WASM_ARTIFACT_LINK_CONTRACT` proves it out of the built module rather than out of the recipe.

### 2. What a browser consumer can now do

Seven families, each with its own semantic evidence rather than a route count.

**Compiled effects.** The same scenario the windowed OPENGLES3 suite runs — same `.fxb`, same
values, same techniques, same 8×8 target — with expectations computed from CNA's own shipped HLSL
rather than from `GetValue*`, which answers from managed state and would agree with its own setter
whether or not a uniform ever moved. Six parameters reflected with their classes, types and
array/struct shape; native write-through read back through CNA; `SecondTechnique/P1` drawing
`Tint * Weights[1]` through three states where A→B moves only `Tint` and B→C only `Weights[1]`; the
other technique disagreeing over identical parameter state; `Lighting.Intensity` and
`Lighting.Thresholds[0]` proved by pixels alone.

**Post-processing.** The blit, colour grading, the tonemapper, bloom, FXAA, chromatic aberration,
film grain, and the chain. Two of them are checked **by CNA against itself**: `TonemapChannel` and
`ExtractChannel` are pure scalars of the same arithmetic the shaders do, so a rendered texel is
compared to CNA's own answer for that texel rather than to a picture taken earlier. The colour grade
is exactly predictable for a different reason — a size-2 `.cube` whose transfer is the channel
rotation is linear per channel, so trilinear interpolation reproduces it exactly. And the chain's
*order* is provable because that rotation composed with itself is a third distinct permutation: a
chain that ran one pass, or ran both and discarded the intermediate, lands somewhere else.

**Shadow maps.** The device was asked rather than assumed, and said yes to both casting and
sampling. A 512-texel map then clears to the far plane, records an occluder at two heights covering
48,960 identical texels at depths 0.625 and 0.875, refuses a draw outside `Begin`/`End`, and refuses
three ordering mistakes with CNA's own result codes. Every extent and depth is predicted from the
light view-projection CNA reported — which is itself cross-checked against the product of the two
pure maths routes, so three CNA routes and one local identity have to agree.

**Level of detail**, bound whole rather than sliced, because every route of it is arithmetic.
**Device capability queries**, which is how a page decides what to reach for and which had no answer
in a browser at all. **The instancing stream's layout**, which is the half of that family a browser
can have.

### 3. The gates that had to be built before any of it could be claimed

`test:wasm-browser` asks the artifact in front of it and asserts the consequences of *either*
answer, so it is green on both and prints which one it measured. That is right for a suite a
consumer runs and **useless as a claim**: against the default artifact it takes the refusal branch,
passes, and proves nothing.

So the claim lives in `test:wasm-browser:strong:required`, which cannot take a weaker branch.
Measured, all four arms:

```text
required, no artifact        exit 1, names CNA_WASM_ARTIFACT_DIR
required, DEFAULT artifact   exit 1, names -DCNA_CNAEXT=ON
optional, DEFAULT artifact   exit 0, seven skips, executed 0
required, strong artifact    exit 0, executed 7, skipped 0
```

Its refusal logic is a pure function, because reaching that decision inside the suite costs a served
package, a headless Chromium and a compiled artifact — which makes "does this refuse the default
artifact?" an expensive question asked rarely. `wasm-strong-gate.test.mjs` exercises all nine arms
in milliseconds, one of them transcribed verbatim from a real default-artifact run.

### 4. Twenty-nine planted defects, twenty-eight killed, one equivalent

The survivor is the interesting one. Swapping a scene box's min and max **looks** like it must move
the shadow and cannot: `computeLightView` takes the centre, symmetric under the swap, and a radius
from summed squared extents whose signs cancel; `computeLightProjection` enumerates all eight
corners, and a swapped box has the same eight. There is nothing there for a test to catch, so it is
reported as surviving with the source that explains it rather than reclassified or deleted.

Two of the killed ones catch defects no pixel could. `vector3-components-out-of-order` leaves the
table CNA holds entirely correct and permutes only the read-back, so every graded texel still
passes — it dies on the entries asserted before any pixel is drawn. `tonemap-scalar-ignores-its-mode`
leaves the `None` branch agreeing with its shader and only Reinhard disagreeing, which is exactly the
half-right shape a shared-oracle test has to catch.

### 5. Five expectations written wrong, and what caught each

| Wrong reading | Truth | Caught by |
| --- | --- | --- |
| `VertexElementUsage.TextureCoordinate` is 5 | it is 2; 5 is Tangent | the browser, on the first run |
| a light view puts −1 on the Y-to-Z term | it puts +1; the sign is an axis convention, not a property | asserting what the transform *does* instead |
| the bloom bright pass is a hard threshold | it has a soft knee half the threshold wide, squared | `ExtractChannel(0.5, 0.5)` answering 0.125 |
| 0.25 is a chromatic aberration strength | CNA clamps to `[0, 0.1]` | the round-trip returning 0.1 |
| a LOD level covers "up to and including" | the boundary is strict — `upper_bound` on `<` | selecting 1 at exactly 10 |

Every one was a guess where CNA's own source or its own scalar was available. The tests now restate
the source beside the assertion, which is why the last three are stronger than what they replaced:
the bright-pass curve is computed rather than pinned, the clamp is asserted rather than avoided, and
the strict boundary is stated where a reader will meet it.

### 6. A gap the mutants found in the tests, not the code

`lod-levels-read-at-a-fixed-stride` survived — because the strong-artifact suite asserted *less*
about LOD than the ordinary one, on exactly the run that exists to make the claim. The assertions
became `support/lod-oracle.mjs`, shared by both, and the mutant dies. That is the fourth shared
oracle for the same reason. Two suites with their own copy of an expectation is how they come to
disagree about what they measured.

### 7. Gates at the end of the run

```text
api:verify / api:verify:live   TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0
verify:runtime                 RUNTIME_DIFFERENCES=0   TARGET_TYPES=348
verify:leaks                   INTERNAL_LEAK=0
verify:cna-contract            DIAGNOSTICS=0
audit:cna-abi                  IMPORTED=1889  VERIFIED=1889  MISMATCHES=0  NEVER_LOADED=0
                               WASM_BACKEND_ROUTES=504  MISSING_WASM_BACKEND_EXPORTS=0
coverage:cna-abi               UNEXPLAINED=0  REACHABLE_BUT_DEFERRED=0  NODE=1889  WASM=502
runtime:inventory              ENTRIES=180  CONSISTENCY_GATE=PASS  PROVED=168
verify:package / build- / package-reproducibility   all PASS
```

```text
test 341   differential 182   native 52   cnb 39   extensions 10
content (required) 10, skipped 0        windowed (required) 25, skipped 0
effect-reflection (required) 10, skipped 0
model-part 9   content-survey 8   input-devices 3   media-library 6
avatars 8   sprite-font-oracle 5   wasm-browser-input 7

default artifact   wasm-browser 17   strong suite: 0 executed, 7 skipped, required exits 1
strong artifact    wasm-browser 17   strong required: 7 executed, 0 skipped
                   COMPILED_EFFECT_BROWSER_TESTS_EXECUTED=2
```

Template: build PASS; Node 60 and 600 PASS; browser 60 and 600 PASS on **both** artifacts;
extensions smoke PASS; generated TypeScript and JavaScript consumers PASS.

### 8. Where the next session picks up

The two external unblockers this project had been recording are **gone**, and what they revealed is
a frontier rather than an endpoint. CNA's engine layer is 857 C routes behind a 603-member
interface; seven families of it are now reachable from a browser with semantic evidence, and the
rest are in three groups:

- **Renderer-blocked, measured.** Compute shaders, storage buffers, GPU timers, indirect draw and
  GPU culling. `ComputeShaders` and `IndirectDraw` are false on WebGL 2.0 and no CNA build option
  changes that; GPU timing was asked for and refused. These are facts about the context.
- **Architecturally out of reach.** `InstancedRenderer`'s draw, the skinned shadow caster, and
  anything else that needs a `ModelMeshPart` — those arrive through a native content manager this
  package deliberately does not have. The census already records that decision.
- **Neither.** PBR materials, the render pipeline, particles, light probes, atmosphere, decals, the
  depth-normal prepass, clustered lighting, cascaded/spot/cube shadow maps, the remaining
  post-process passes, and the rest. **These are not blocked.** They are unbound, and the pattern
  for binding one is now established and worth following exactly: measure the capability from the
  running artifact first, bind only what that answer justifies, put the expectation in a shared
  oracle both suites use, and plant mutants until something that should fail does.

Three things would change the picture from outside: a **gamer test backend** upstream (finding 29,
still absent — five `..._set_test_backend_ext` routes exist and none of them is for a gamer); CNA
repairing `add_owned_pass`'s leaked runtime counter (finding 1), which is the only reason
`PostProcessChain.AddOwned` is refused here; and **pushing `cnanext`**, which would let the CI pin
move past `89024e0d4`.

And the habit that paid again: **ask CNA rather than remember it.** Five of this session's
expectations were guesses where the source or a pure scalar was available, and all five were wrong.

## 2026-09-02: the engine layer bound whole, and four things that were quietly not being tested

### Where this started

The previous session lifted the artifact limitation and left seven modern-graphics families
qualified against a strong WebAssembly build. The brief for this one was to finish the engine layer
on that artifact — same public API, private backend only — and to keep going until nothing engine-
shaped remained locally actionable.

`cna-ts` started clean at `01facb5`, `cna-ts-template` at `8a806d8`, read-only `cnanext` at
`7712534d` and `sharp-runtimenext` at `9cc96cd5`. Both dependencies end with **zero modified tracked
files**. Sixteen commits, none pushed.

### 1. The layer, finished

Eighteen backend interfaces, **1252 methods, every one bound, none partial**:

```text
GraphicsExtension 603   Content 126   Shadow 78   ClusteredLighting 54   WasmBackend 52
Graphics 48   LightProbe 46   Atmosphere 41   Compute 37   Audio 30   DepthNormalPrepass 27
Particle 24   Effect 21   RuntimeServices 15   InstancedRenderer 14   Lod 14   Decal 12
NativeMeshPart 10
```

`WASM_BACKEND_ROUTES=1403`, `REACHABLE_WASM=1403`, `MISSING_WASM_BACKEND_EXPORTS=0`,
`UNEXPLAINED=0`, `REACHABLE_BUT_DEFERRED=0`.

### 2. Three structures that threw the first time anything touched them

`GltfMaterialBridge.CreateSource()` answered *"the measured layout has no field
`texture_coordinate_sets_ext`"*. The layout spec carried a **hand-maintained field list per
structure**, and a field left off it was never measured, so `WasmStruct` threw on first use.
`CNA_GltfMaterialSourceEXT`, `CNA_GltfMaterialTexturesEXT` and `CNA_ShadowCascadeStateEXT` had all
shipped that way — five fields the backend reads and the probe never measured.

No test could have caught them, and that is the interesting part: the browser census reads every
zero-argument accessor on every public class, and none of these three is reachable that way.

The repair is not three repairs. `tools/wasm/generate-layout.mjs` now **derives** the field list from
CNA's own headers and the spec names only which structures to measure — **90 fields that were never
measured now are**. A misparse cannot pass silently either: every name found becomes an `offsetof`
in a probe compiled `-Werror`.

### 3. What a census cannot see

A census reads accessors, so a field dropped *inside* a structure round-trips perfectly through a
getter that never reads it either — both halves are the binding's and both are wrong the same way.
The question has to go to something that is not the binding.

CNA compares two materials itself. `PbrMaterialExtOperations.Equals` is asked **nineteen times**,
once per field, about CNA's defaults and a copy with exactly one field changed. Four more shapes
that cross nested inside something else are proved by what CNA *does* with them:

| shape | what sees it |
| --- | --- |
| `CNA_BoundingBox` written | `FrustumCuller.IsVisible` on a box 900 units out — outside the frustum with both corners, spanning the camera with one |
| `CNA_Vector4` read | glTF's default base colour, which is opaque white, so `W` is 1 |
| `CNA_Handle[7]` read | the seven glTF texture slots, which become thirteen at a pointer's stride |
| `CNA_Matrix[4]` + `float[4]` | a cascade state round-tripped whole, split distances past `Count` included |
| a two-output texture slot | the handle output **poisoned** first, so an empty slot answering with a value CNA cannot issue is the binding and not CNA |

That last one turned an assumption into a measurement. Poisoning proved CNA writes
`CNA_INVALID_HANDLE` into the output whether or not a texture is present, so ignoring the presence
flag genuinely cannot be observed. The check stays — the header promises the flag, not the zero —
and the mutant stays as the only thing that would notice if CNA stopped.

### 4. Four things that were not being tested, and now are

This is the session's real theme. Each was invisible, and each is now a gate that runs in CI.

**`verify-struct-fields.mjs` — 1056 field accesses, 0 unmeasured.** Every field the backend names,
checked against the measured layout, resolving the structure by scope: a method that allocates one
names it; a helper that takes a `WasmStruct` from its caller names it in its doc comment, which was
already the convention and is now load-bearing. It reads the *helpers* from their own signatures
rather than guessing — a first version matched only `structure.getF32("field")` and missed the glTF
coordinate sets, the very defect it exists for; a second, looser version read
`#retainSceneCallback(pipeline, "shadow")` as a field access.

**`check-anchors.mjs` — 114 mutants, 0 stale.** A mutation plan is evidence only while its anchors
match. One refactor left **12 of 29 anchors stale in one plan and 5 more across two others**: 17
mutants the plans still claimed to cover and that were testing nothing. The harness does report
`ANCHOR x0`, but only to whoever runs the plan, and plans take an hour. All 17 repaired;
compiled-effect went from 17 killed / 12 refused to **29 of 29**.

**`test/oracles.test.mjs` — 18 cases.** Every browser claim is an oracle applied to evidence, and an
oracle that accepts anything makes its suite green and meaningless. The mutation harness cannot
catch that: an oracle lives in `test/support`, which `dist` does not contain, so mutating one leaves
the artifact byte-identical and the harness rightly refuses to score it. So each oracle is now given
evidence with exactly one thing wrong and required to say so.

**`report-frontier.mjs`.** "Absent" was one word covering two opposite conditions.

### 5. The frontier, asked rather than inferred

Fifteen interfaces are absent, 267 methods, none engine-layer. Whether that is CNA refusing or
merely nobody having bound them is not something a family name answers, so all 156 routes were
called on the strong artifact with null handles — making `INVALID_HANDLE` the expected answer and
`NOT_SUPPORTED` the one that means something.

- **`Device` is CNA-blocked**: 27 of 29 routes answer `NOT_SUPPORTED`.
- **`ExtendedInput` (41) and `GraphicsAdapter` (11) have no CNA routes at all** — the Node backend
  implements them without reaching the C ABI.
- **The other twelve are simply unbound**, and that is reported rather than acted on. The scope here
  is the engine layer; binding a sensor to raise a count is what this package does not do.

The tool guessed CNA's result codes on its first run and read `INVALID_HANDLE` as `OUT_OF_MEMORY`,
which would have made fourteen healthy families look broken and the one genuinely blocked family
look ordinary. `src/internal/cna-results.ts` holds the verified table.

### 6. A false classification, caught by testing the claim

A prepass survivor was written up as *"the windowed suite is where this one can be killed."* It
cannot: the windowed suite exercises the **Node-API** backend and never loads the WebAssembly one,
so no mutation of this backend can reach it. Planting the mutant and running that suite is what
showed it — **25 of 25 passing with the defect in place**.

Both prepass survivors are blocked by upstream finding 30, which stops the browser prepass drawing
anything, and neither is killable anywhere today. Exchanging the depth and normal borrows is
invisible through size, surface format, level count, clear value and object identity — the two
accessors memoise separately, so they are two objects whichever handle each holds. The clear values
are now measured and asserted (both white) rather than assumed.

### 7. Mutation

**114 mutants across 8 plans: 102 killed, 12 survivors, 0 unscored.** Every survivor carries
`expect: "survives"` and a reason: three equivalent by measurement, four architecture- or
upstream-blocked, five behaviourally identical to CNA's own clamp or floor.

### 8. Qualification

Every gate, after `npm ci`:

```text
test 360 pass 0 skipped        api:verify TOTAL_DIFFERENCES=0 ALLOWLIST_SIZE=0
test:native 52                 api:verify:live TOTAL_DIFFERENCES=0 ALLOWLIST_SIZE=0
test:extensions 10             verify:runtime RUNTIME_DIFFERENCES=0
test:cnb 39                    verify:leaks INTERNAL_LEAK=0
test:content:required 10       verify:cna-contract DIAGNOSTICS=0
test:differential 182          audit:cna-abi 1889/1889, MISMATCHES=0, NEVER_LOADED=0
windowed-renderer 25           MISSING_WASM_BACKEND_EXPORTS=0
effect-reflection 10           coverage UNEXPLAINED=0 REACHABLE_BUT_DEFERRED=0
                               verify:wasm — routes 1403/1403, calls 1186, fields 1056, anchors 114
```

Both browser suites on both artifacts, all with **0 skipped**: default 24 on each — recording
`ABSENT` on the plain artifact and `PRESENT` on the strong one, so both branches are exercised —
and strong 14 on the strong artifact. Against the plain artifact the strong suite skips all 14 with
`STRONG_WASM_TESTS_SKIPPED=14` and the `:required` form fails, which is the point.

The three pinned ABI reports regenerate byte-identically at `89024e0d4`. `dist` and the npm package
are both byte-reproducible.

Template: build, native smoke and browser smoke at **60 and 600 frames**, browser on **both**
artifacts, extensions smoke, and both generated consumers — `GENERATED_TYPESCRIPT_BUILD=PASS`,
`GENERATED_JAVASCRIPT_BUILD=PASS`, `LEGACY_OR_SIBLING_REFERENCES=0`.

### 9. One last sweep, which found dead code carrying a defect

The generator emitted a `#with...` writer beside every `#read...` reader whether or not anything
wrote that structure, and **seven were never called** — all output structures CNA fills. One of them
was wrong: `#withRenderPipelineStatistics` wrote `passes_run` twice, once from `PassesRun` and once
from `LastFramePassCount`, the second silently overwriting the first.
`CNA_RenderPipelineFrameStatisticsEXT` has no last-frame-pass-count field at all; the live reader
takes it from `cna_render_pipeline_get_last_frame_pass_count`, as the Node bridge does.

That is the argument for deleting dead code rather than leaving it: **no test can catch a defect in
code nothing calls**, so it passed every gate this package has. 214 lines removed, and 35 writer
bodies reindented out of the `try` block they only looked like they had left.

### Where the next session picks up

`ACTIONABLE_LOCAL = 0` for engine work: every engine interface is bound whole, every mutant scores,
every gate is green. What remains is not local:

1. **Upstream finding 30** (WEBGL2 multiple-render-target draw reaches no target) is the largest
   single unblocker. It gates the browser prepass entirely, and two mutants are waiting on it.
   `tools/upstream-repro/webgl2-multiple-render-targets.mjs` exits 0 while it reproduces and 1 when
   repaired, so the day it is fixed is detectable rather than guessable.
2. **The other upstream findings** — 1, 12, 19, 20 and the rest — each hold a documented partial
   binding in place.
3. **The twelve unbound non-engine families**, if they are wanted. `report-frontier.mjs` says which
   are possible; whether they are worth it is a product question, not a binding one. A route that
   validates its arguments has not promised to work.

## 2026-09-02: the non-engine backend in a browser, and a duplicate pump nobody was paying for

### Where this started

The previous session bound CNA's engine layer whole on the WebAssembly artifact and left fifteen
non-engine interfaces — 267 methods — outside it. The brief for this one was to implement every one
that can be represented **truthfully** on a browser artifact and to classify the rest with measured
evidence, stopping only when `ACTIONABLE_LOCAL = 0` *and* `UNCLASSIFIED_WASM_BACKEND_GAP = 0`.

`cna-ts` started clean at `9b7daac`, `cna-ts-template` at `8a806d8`, read-only `cnanext` at
`5347b52ea` and `sharp-runtimenext` at `9cc96cd5`. Both dependencies end with **zero modified
tracked files**. Five commits, none pushed.

### 1. Fifteen families, bound and driven

| before | after |
| --- | --- |
| 18 interfaces, 1252 methods | **33** interfaces (32 bound, 1 partial), **1525** methods |
| `WASM_BACKEND_ROUTES=1403` | **1864**, against the Node adapter's 1889 |
| 15 absent interfaces | **0** absent interfaces, 2 absent methods, both classified |

Avatars, the sprite-font oracle, the game window, storage, the input-device inventory, four sensors,
the content survey, the media player, the media library, gamer services, XACT, the video player's
control surface, extended input, graphics adapters and CNA's device layer. `REACHABLE_NODE_ONLY=25`
and every one of the 25 carries a blocker: the CNB content pipeline takes filesystem paths, the
signed-in gamer is finding 29, the standalone `GraphicsDevice` is finding 32.

Binding is not evidence, so each family is driven through the public API in a browser and checked by
`test/support/non-engine-oracle.mjs` — **the same oracle the Node backend's evidence is checked
by**, so a browser and a desktop disagreeing is a failure rather than two green suites.

### 2. Four kinds of gap a member count cannot see

`tools/wasm/backend-gap.mjs` resolves each boundary method through the *Node backend's own*
`this.#bridge.X` call and the bridge's loader table into CNA routes, so a family cannot be written
off because two names differ. Every widening of it found something real:

1. **A facade that exists and is never constructed** counts as bound to a prototype walk. It must
   now be reachable from `WasmBackend`.
2. **A prototype walk that reaches the refusing base** picks up the base's own members, so any
   family with *any* facade looks complete. The walk stops at the base.
3. **Getters and optional (`?(`) members** are invisible to `typeof descriptor.value === "function"`
   and have no refusing base. Eight real gaps hid there: `mouseWindowHandle`, five microphone
   members, and both halves of standalone `GraphicsDevice` construction.
4. **A method that refuses most of its input.** `createStockEffect` covered `BasicEffect` and threw
   by name for the other four. The gate is now route parity *per method*.

The previous session's family-level probe had been wrong about two of its three conclusions, and
both errors were the tool: `Device` was blocked by `CNA_DEVICES`, a CMake option defaulting `OFF`
that neither of this repo's wasm recipes set, and `ExtendedInput`/`GraphicsAdapter` were reported as
reaching no CNA routes at all when they reach sixty and fifteen — the probe had matched boundary
methods to bridge exports *of the same name*, and this family renames them
(`getJoystickCount` → `joysticksGetCount`).

### 3. XACT was not fixture-blocked

`test/fixtures/xact.mjs` writes a settings file, a wave bank and a sound bank from scratch, in CNA's
own binary formats, following its parser and its demo's generator. Nothing is downloaded and nothing
proprietary is used. A cue runs prepared → playing → paused → playing → stopped in a browser.

Watch the accessibility byte: CNA's demo comment calls `0x03` "global + settable" and it is
PUBLIC|**READONLY** (finding 31), so the fixture defines one variable of each kind and a write that
lands and a write that is ignored are two separate assertions.

### 4. A standalone GraphicsDevice, implemented and then withdrawn

It works — the device is created, its viewport is the 64×48 its presentation parameters asked for
rather than the game's 800×480, and destroying it succeeds. Then `cna_game_destroy` throws an
Emscripten `ErrnoError` with errno 44 instead of returning a result, with CNA's last-error message
empty, reproduced in plain C with no binding involved. A public XNA constructor that silently costs
the consumer their `Game.Dispose` is worse than one that refuses by name, so the implementation was
withdrawn, classified `BLOCKED_UPSTREAM`, recorded as finding 32 — and the refusal is asserted, so a
repaired CNA fails the assertion and asks for the implementation back.

### 5. The duplicate pump, which the WebAssembly backend exposed by working

Implementing `updateFrameworkDispatcher` broke `test/wasm-browser-input.mjs`. That was the useful
kind of breakage: the defect was already there, and only the Node backend had been paying for it.

`Game` pumped the dispatcher from its managed `update` callback, and CNA's own `Game::Update` ends
with `FrameworkDispatcher::Update()` — which the C API's game shim runs the moment that callback
returns. Two pumps a frame, invisible while the WebAssembly implementation did nothing.

It is not invisible, because CNA ages the touch state machine inside the dispatcher and
`TouchPanel::GetState()` deliberately does not:

```text
one pump    frame 1: Pressed, no previous   frame 2: Moved, previous Pressed
two pumps   frame 1: Pressed, no previous   frame 2: Moved, previous MOVED
```

The pinned XNA assemblies settle which is right rather than memory:
`TouchPanel::GetState()` calls `TouchCollection::Update`, so XNA ages on the *read*, and
`FrameworkDispatcher::Update()` polls events and drains pending managed calls without mentioning the
panel. XNA's dispatcher is idempotent within a frame; CNA's is not, which is **finding 33** — worth
reporting because a game calling `FrameworkDispatcher.Update()` itself is doing an ordinary XNA
thing and will lose the same transition.

### 6. The hazard that nearly recurred

`test:effect-reflection:required` was started without the Xvfb wrapper while this host has a real
`DISPLAY=:0` **and** `WAYLAND_DISPLAY=wayland-0`. That is exactly the accident the brief forbids. It
was killed before it created a window (`S`, 0:00 CPU), and the battery now runs both windowed
sections as `env -u WAYLAND_DISPLAY SDL_VIDEODRIVER=x11 xvfb-run -a`. `xvfb-run` alone is not
enough: SDL3 prefers Wayland whenever `WAYLAND_DISPLAY` is set.

### 7. Gates, and what they measure

```text
WASM_ROUTES_LISTED=1864          WASM_ROUTE_CALLS_CHECKED=1420
WASM_STRUCT_FIELD_ACCESSES_CHECKED=1259   WASM_STRUCT_FIELD_UNMEASURED=0
MUTATION_PLANS=9  MUTATION_PLAN_MUTANTS=145  MUTATION_PLAN_STALE_ANCHORS=0
ORACLES_EXPORTED=33  ORACLES_UNWATCHED=0
ACTIONABLE_LOCAL=0  UNCLASSIFIED_WASM_BACKEND_GAP=0  STALE_CLASSIFICATIONS=0
UNWIRED_WASM_FACADES=0  WASM_PARTIAL_METHODS=8  UNCLASSIFIED_PARTIAL_METHODS=0
```

`tools/wasm/verify-oracles.mjs` is new, and it exists for the thing the mutation harness structurally
cannot see: an oracle lives in `test/support`, which `dist` does not contain, so mutating one leaves
the artifact byte-identical and the harness scores nothing. An oracle is watched by a rejection case
or by a mutation plan whose command runs a suite importing it — and three oracles in
`post-process-oracle.mjs` were watched by neither.

`tools/mutation-harness.mjs` had been scoring a killed mutant as `REFUSED`: `execSync`'s default
1 MiB buffer truncated the TAP summary when an assertion message carried megabytes of wasm heap.

### 8. Mutation evidence

31 mutants planted in the browser backend, all marshalling defects rather than logic ones — an axis
pair swapped, a flag read from its neighbour, an array walked at a pointer's stride, a count taken in
the wrong unit, a rooted callback released too early. **24 killed, 7 survived, 0 unscored**, source
and artifact both restored.

Every survivor is recorded with the reason it cannot be killed *here*: two avatar fields that are
both zero for the only description this host can make; a battery percentage this host reports as 0
rather than -1; two adjacent 1024-byte visualisation arrays that are both silent; a media relation an
empty library has none of (killed by the Node suite, where the library has a song); two adapter flags
that are both true on a single-adapter host; and the dispatcher itself, because CNA completes every
asynchronous operation this host can start synchronously.

### 9. Qualification

Every suite, executed and skipped, with **0 skipped anywhere**:

```text
unit 430   differential 182   native 52   extensions 10   cnb 39   content 10
model-part 9   content-survey 8   input-devices 3   media-library 6   avatars 9
sprite-font-oracle 6   compiled effects 10   windowed 25
browser default 24   browser strong 24   browser strong:required 14
browser input 7 + 7 (both artifacts)   non-engine 17 + 17 (both artifacts)
TOTAL_DIFFERENCES=0  ALLOWLIST_SIZE=0  RUNTIME_DIFFERENCES=0  INTERNAL_LEAK=0
UNEXPLAINED=0  MISSING_WASM_BACKEND_EXPORTS=0  DIAGNOSTICS=0
RUNTIME_CAPABILITY_ENTRIES=200  CONSISTENCY_GATE=PASS
DIST_BYTE_IDENTICAL=PASS  TAR_PAYLOAD_IDENTICAL=PASS
```

### Where the next session picks up

`ACTIONABLE_LOCAL = 0` and `UNCLASSIFIED_WASM_BACKEND_GAP = 0`. What remains is external:

1. **Finding 32** — the standalone `GraphicsDevice` that makes a WebAssembly game undestroyable. It
   is the only *implemented and withdrawn* item in the package, so repairing it upstream turns an
   existing implementation back on rather than starting one.
2. **Finding 30** (WEBGL2 multiple-render-target draw) still gates the browser prepass, and
   **finding 29** (no test-only signed-in gamer) still gates avatars-with-a-gamer, net sessions and
   anything that would make the dispatcher mutant killable.
3. **Video decoding** needs `CNA_ENABLE_VIDEO` to stop being a configure-time fatal error on
   Emscripten — a CNA build-system decision, not a binding one.
4. **Physical hardware** — sensors, joysticks, haptics, cameras, a microphone — is the only thing
   separating `SYNTHETIC_BACKEND_VERIFIED` from a physical claim, and no amount of local work
   substitutes for it.

## 2026-09-02: a real user gesture, a fixture an octave high, and a microphone that is not one

### Where this started

The previous session closed the WebAssembly backend and left one sentence in the blocked table:

> XACT audibility / Media spectrum: blocked because WebAudio needs a user gesture.

The brief for this one was to challenge exactly that sentence before accepting it, on the grounds
that the harness had never given a page a **browser-trusted** activation — a Playwright input
action is not `element.click()` — so "needs a gesture" was an untested explanation rather than a
measured blocker.

`cna-ts` started clean at `c77e5ed`, level with `origin/develop` rather than six ahead as the
handoff said; `cna-ts-template` at `8a806d8`; `cnanext` at `9ca0d4188` and moving — another agent
committed to it during this session and it ends at `e3e72bcac`; `sharp-runtimenext` at `9cc96cd5`.
The whole `cnanext` delta from the `5347b52ea` baseline is a `SpriteBatch` const-correctness fix
and one markdown file, which is why every upstream finding below is re-checked by inspection rather
than by re-running its reproducer. Both dependencies end with **zero modified tracked files**.

The sentence was hiding two different facts and one accident, and finding them cost four things
this package did not know about itself.

### 1. The gesture is real, and the harness had been supplying one by accident

Measured with nothing having touched the page through CDP:

| | `isTrusted` | `hasBeenActive` | `isActive` | a fresh `AudioContext` |
| --- | --- | --- | --- | --- |
| at page parse | — | false | false | **suspended** |
| page-initiated `element.click()` | **false** | **false** | **false** | **suspended** |
| Playwright `locator.click()` | **true** | **true** | **true** | **running** |
| inside `page.evaluate` | — | **true** | **true** | — |

The last row is the accident. **Playwright issues CDP `Runtime.evaluate` with `userGesture: true`**,
so `page.evaluate`, `page.waitForFunction` and `page.title()` all *grant* an activation as a side
effect. `runFrames` waits for completion with `waitForFunction`, so every browser suite in this
package has been handing its page a gesture it never asked for — and any pre-gesture measurement
read back that way would have been measuring the question.

So the harness gained an HTTP **page-to-harness channel**, and `runFrames(frames, page,
{ activate: true })` waits on *that* for the page's own "I am ready" and then sends a real
`locator.click()`. The pre-gesture facts come back over HTTP before Playwright has run a line of
script in the page. It is opt-in, because most pages have nothing to say about gestures and a click
before their first frame would be a different run.

### 2. What the gesture does not gate

CNA mixes either way, and the numbers are identical to every digit:

```text
                        peak bin   magnitude   sample peak   AudioContext
before any activation       3       0.42607     0.854462      suspended
after a trusted click       3       0.42607     0.854462      running
```

`third_party/SDL/src/audio/emscripten/SDL_emscriptenaudio.c:276` is why: finding the context
suspended, SDL installs a `setInterval` that calls the audio thread's iterate function with a
buffer it *discards*, and resumes the context the moment `navigator.userActivation.hasBeenActive`
turns true. The mixer runs the whole time; only the output is thrown away.

That is the precise statement the old sentence should have been. The gesture gates **output**, not
mixing — so every sample-consuming path was provable without one, and audibility is not provable
with one, because a headless browser has no speaker. The claim is
`WEB_AUDIO_RENDERING_VERIFIED`, never `AUDIBLE_OUTPUT_VERIFIED`.

### 3. The fixture had been playing every tone an octave high

The first thing anyone had ever done was ask *which bin* a known tone lands in, and the answer was
wrong by exactly a factor of two — 261.6 Hz answered bin 6, and bin 6 is 523 Hz.

`test/fixtures/xact.mjs` wrote `nChannels = 0` into the wave bank's `FACTWaveBankMiniWaveFormat`,
with a comment saying "channels-1 = 0 (mono)". The field holds the count itself: FAudio's `FACT.h`
declares `nChannels : 3` and multiplies by it directly, and CNA reads it as
`(entry.channels == 1) ? Mono : Stereo` — so a zero made every mono wave in this repository decode
as interleaved stereo, through in half the time, at double its authored frequency.

Nothing had noticed, and nothing could have: the states were right, the names were right, the
lengths were right, and the Node suite passes 52/52 either way. **No test in this package had ever
measured pitch or duration of audio.** That is the argument for a semantic oracle rather than a
structural one, made by the defect rather than about it.

### 4. Four tones, and a spectrum predicted rather than recorded

With that fixed, every tone lands where arithmetic says:

| source | Hz | `round(f x 512 / 44100)` | measured bin | magnitude | predicted |
| --- | --- | --- | --- | --- | --- |
| XACT `Tone261` | 261.6 | 3.04 → 3 | **3** | 0.42607 | 0.42725 |
| XACT `Tone523` | 523.3 | 6.08 → 6 | **6** | 0.42486 | 0.42725 |
| SoundEffect | 1378.125 | 16.00 → 16 | **16** | 0.39921 | 0.4 |
| SoundEffect | 2756.25 | 32.00 → 32 | **32** | 0.39921 | 0.4 |

The magnitude is predicted too, from the transform's own documented scaling: `2/N` with the Hann
window's 0.5 coherent gain left uncompensated, so amplitude/2. The two page-authored tones sit
exactly on a bin centre, where the window's response is textbook — `s[k±1]` measured 0.20019 beside
a peak of 0.39921, which is 0.5013 of it, and `s[k±2]` measured 0.00026. That shape is what a
fabricated peak cannot produce, and it is asserted.

Two things make the spectrum reachable at all. `MediaPlayer.GetVisualizationData` is fed by a
post-mix callback on **the whole mixer** rather than on the media player's own track
(`MediaPlayer.cpp:224`), so an XACT cue, a `SoundEffect` and a `DynamicSoundEffectInstance` all
reach it — the brief said not to assume XACT contributes to it, and it does. And the rate the bins
are worth is **44100**, not the browser's 48000: SDL resamples between them, and reading the axis
at the AudioContext's rate would put 1378.125 Hz in bin 15 instead of 16 and still look healthy.
That is upstream finding 35 — CNA has the number and does not publish it.

A second observable owes nothing to this arithmetic:
`DynamicSoundEffectInstance.PendingBufferCount` drains 6 → 0 as CNA's mixer finishes with the
buffers, which is CNA counting its own consumption.

### 5. A microphone that is not one

The capture row said `PHYSICAL_CAPTURE_NOT_VERIFIED` because a page needs microphone permission.
It does — and Chromium can supply a capture device that is not hardware at all. Launched with
`--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture`, every capture device
Chromium offers is synthetic and plays a file this repository wrote.

The safety rule is enforced in three places rather than promised in one: the harness **refuses to
launch** when the fixture is missing, because a run granted the permission without the file flag
would open this host's real device; the permission is granted to the run's origin in a context of
its own that dies with it; and the oracle asserts both flags were present *and* that every audio
input the **browser** enumerated is one of Chromium's fake ones, so flags and platform have to
agree.

What is asserted is the shape, not the level. Chromium's gain control and noise suppression — which
SDL's unconstrained `getUserMedia({ audio: true })` gives no way to switch off — cost about 20 dB
and leave the ratio alone:

```text
authored   1500.0 Hz at 0.6   and   3187.5 Hz at 0.3      ratio 2.000
measured   scan peak at 1500 Hz exactly                   ratio 2.007
           worst off-tone magnitude 0.000621              50.7 : 1
```

Room audio, a buffer of zeroes and a single hard-coded frequency all fail that.
`SYNTHETIC_BROWSER_CAPTURE_VERIFIED`, and `PHYSICAL_MICROPHONE_ACCESSED = 0`,
`PHYSICAL_CAPTURE_VERIFIED = 0` — a synthetic device passing says nothing about a physical one.

Two things had to be found on the way. **Playwright's bundled headless shell has no media-capture
stack at all** — `getUserMedia({ audio: true })` rejects with `NotSupportedError: Not supported`
before any permission question is reached — so the run asks for the full `chromium` channel by name
and skips with a reason where it is absent, rather than degrading to something that cannot capture.
And SDL3's Emscripten recording backend **writes zeroes on a timer** until its own `getUserMedia`
resolves, so a capture that stopped at the first buffer would collect that silence and read it as a
microphone that delivered nothing; the page waits for sound and drops the silent buffers rather
than averaging them into the signal.

How many silent buffers it saw is deliberately *not* asserted, and that was a correction rather
than a choice. The first version required the count to be positive, which is requiring a promise to
lose a race against a timer — it did on four runs and did not on the fifth, and the suite failed
once in the qualification battery for no reason connected to CNA. Asserting a race is how a suite
becomes flaky without becoming wrong, so the count is now reported (`1` or `2` on this host) and
only the properties are asserted.

### 6. The camera, which was never hardware-pending

The same launch makes the camera synthetic too, so it cost one page to ask. The browser enumerates
one `videoinput`. CNA reports `IsSupported: true` and enumerates **zero**, and opening the platform
camera answers `NotSupported` with a 0×0 frame.

`Sdl3CameraProvider::GetCameras` calls `SDL_GetCameras` and **nothing in CNA has ever called
`SDL_InitSubSystem(SDL_INIT_CAMERA)`** — the constant does not appear in `modules/` at all — and
SDL returns null with "Camera subsystem is not initialized" until it has. `IsSupported` answers
true because `SDL_GetNumCameraDrivers` reads a compiled-in table and needs no initialisation, so a
caller is told the platform supports cameras and handed an empty list. The Emscripten camera driver
*is* compiled into the artifact.

That is upstream finding 34, it is not browser-specific — the same provider serves every SDL3
platform, which is very likely why the only camera evidence this package has ever had comes from
CNA's test backend — and the camera row moves from hardware-pending to `BLOCKED_UPSTREAM`. The
refusal is asserted, so a repaired CNA fails and asks for the frames.

### 7. Gates, and what they measure

```text
WASM_BACKEND_ROUTES=1864 (unchanged -- no route was added or needed)
ACTIONABLE_LOCAL=0  UNCLASSIFIED_WASM_BACKEND_GAP=0  STALE_CLASSIFICATIONS=0
UNWIRED_WASM_FACADES=0  UNCLASSIFIED_PARTIAL_METHODS=0
ORACLES_EXPORTED=40  ORACLES_UNWATCHED=0  ORACLE_REJECTION_CASES=139
MUTATION_PLANS=11  MUTATION_PLAN_MUTANTS=159  MUTATION_PLAN_STALE_ANCHORS=0
RUNTIME_CAPABILITY_ENTRIES=201  CONSISTENCY_GATE=PASS
```

### 8. Mutation evidence, and the mutant that scored itself wrong

Fourteen mutants across two new plans: **14 killed, 0 survived, 0 unscored**, source and artifact
both restored. What is interesting about them is what they would have survived a day earlier. The
visualisation arrays used to be read as two lengths of zeroes, correctly recorded as silence — so a
defect that **swapped** them, or read one over the other, or left the tap uninstalled, produced
exactly the evidence a working backend produced. A capture assertion that counted bytes would have
passed an endianness split, a one-byte-late read, and a buffer answered at its requested length.

One of them survived first time round, and the reason was the plan rather than the mutant.
`cameras-enumerated-from-the-supported-flag` fabricates a camera out of the driver-count flag —
finding 34's own confusion, planted — and the suite passed 5 of 5 because the plan's command did
not name an artifact, so it ran against the default one, which has no device layer, so the
assertion that would have refused it was **never reached**.

That is worth writing down because a skipped branch and a passing branch are the same verdict to a
mutation harness. The plan now sets `CNA_REQUIRE_WASM_DEVICE_LAYER=1` in its own command and says
in its `environment` that `CNA_WASM_ARTIFACT_DIR` must point at a `-DCNA_DEVICES=ON` build, so the
branch is a claim rather than a possibility — and the mutant dies 5 of 5.

### Where the next session picks up

`ACTIONABLE_LOCAL = 0`. What remains is external, and one item left the list:

1. **Finding 34** is new and cheap to fix — one `SDL_InitSubSystem` call — and it unblocks the
   camera on every platform, not just in a browser.
2. **Finding 32**, **finding 30** and **finding 29** are unchanged, checked by inspection rather
   than by belief: the whole delta between the measured baseline and current `cnanext` HEAD is a
   `SpriteBatch` const-correctness fix and a markdown file, and no graphics-renderer, C-API,
   framework, gamer-services or build-system file lies between them. Finding 29 was re-checked by
   enumerating every `*_test_backend_ext` route CNA has — sensors, vibration, message box, file
   dialog, system tray and camera — and there is still none for a signed-in gamer.
3. **Emscripten video** is unchanged and was read rather than assumed:
   `modules/CMakeLists.txt:20` still puts `EMSCRIPTEN` in the set that makes FFmpeg unsupported,
   and `CNA_ENABLE_VIDEO=ON` there is still a `FATAL_ERROR`.
4. **Physical hardware** — sensors, joysticks, haptics, a real camera, a real microphone — is what
   separates synthetic from physical, and no amount of local work substitutes for it. The
   microphone half is now as close as software can get: the path is proved end to end against
   authored samples, and only the transducer is untested.
