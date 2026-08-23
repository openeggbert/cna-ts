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
