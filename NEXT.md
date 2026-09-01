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
```

Item 18 is the one to read first: it multiplies every leak finding in the document, and it was found
by noticing that a probe process died *after* printing everything it meant to print.

### Where the next session picks up

`ACTIONABLE_LOCAL` is **59 unbound engine-layer routes**, of which 14 are the deliberate
non-binding below, so **45 are work**:

```text
16  effect (get/set extras)        4  shader_effect_factory   2  image_based_light_ext
14  instanced_renderer_ext (NO)    2  render_pipeline (draw)  2  graphics_device
 6  render_target_pool             2  indirect               ~11 singles
```

`shader_effect` from `effects.h` is now bound in full (24 routes), and with it the weighted-blended
accumulation is qualified to the pixel. `shader_effect_factory` (4) is the natural next step, then
`effect` get/set extras (16) and `render_target_pool` (6), which are the two largest remaining
engine-layer families.

Two are deliberate non-bindings rather than work, and both are recorded in the bridge beside the
routes they belong to: the **instanced renderer's object** and
`cna_debug_draw_add_cluster_slice_gizmo` need a `CNA_ModelMeshPartHandle` and a
`CNA_ClusteredLightGridHandle` respectively, and this package's `ModelMeshPart` is a managed
projection with no native handle while the clustered light *grid* is not projected at all. Binding
either would offer routes that could only ever be handed zero — the same reason
`cna_lod_group_ext_select` is unbound.

**Read finding 22 before writing anything that draws with a custom shader.** A fresh `ShaderEffect`
loses its first `SpriteBatch` draw, and a custom-shader draw leaves a GL error pending that the next
multiple-render-target bind refuses on. Both are asserted rather than worked around, and the
accumulation test shows the shape a test has to take to live with them.
