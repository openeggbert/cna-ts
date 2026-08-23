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
