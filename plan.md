# CNA-TS implementation plan

Status date: 2026-08-31

Selected profiles: XNA 4.0 Windows runtime and XNA 4.0 Windows LIVE (GamerServices, Net, Avatar)

Package: `cna-ts` 0.1.x; the complete XNA 4.0 runtime surface is projected at zero differences

This is the normative roadmap. A checkbox means the named evidence exists; it never means a larger
phase is complete. API completeness can only be claimed from a reproducible strict verifier run.

## Current verified state

- [x] `src/` contains canonical TypeScript implementation only.
- [x] TypeScript 5.9.2 generates ESM JavaScript, declarations, declaration maps, and source maps in
  `dist/` under strict NodeNext settings.
- [x] Root, `xna`, `extensions`, `extensions/runtime`, `extensions/graphics`, `extensions/content`,
  `extensions/devices`, `extensions/sensors`, `extensions/input` and `runtime` package exports
  resolve in compile probes; internal paths, including the WebAssembly internals, do not.
- [x] Node baseline is 20+.
- [x] Both strict profiles hold at zero differences: the Windows runtime (257 reference types,
  2,964 members) and the LIVE set (74 types, 676 members).
- [x] The runtime superset — the union of the profiles a game runs against, Xbox 360 included — is
  331 types, all projected. The 128-type content pipeline is deliberately not projected: it runs in
  the content build rather than in a game.
- [x] `Game` drives its managed pipeline from real CNA lifecycle callbacks on both backends; the
  default/backendless path remains explicitly unavailable.
- [x] Linux x86-64 HEADLESS Node execution is verified against a CNA C ABI 0.21.0 artifact built
  out of tree from `cnanext` against `sharp-runtimenext`.
- [x] A windowed Linux qualification exists beside it, now across **three renderers** — OPENGLES3,
  SDL_RENDERER and SOFTWARE, all under Xvfb. Each reports its own identity and capability flags,
  applies a stock `BasicEffect` for real, runs 60 and 600 frames, fills a real `GraphicsAdapter`,
  and exercises `GameWindow` state HEADLESS cannot reach. All three read back all sixteen
  `RenderTarget2D` texels exactly. OPENGLES3 briefly did not: that regression was asserted as
  measured rather than skipped (`docs/upstream-cna-findings.md` item 7), CNA fixed it in
  `48ab0de7f`, and the assertion failing is how this package found out. Opt-in through
  `CNA_WINDOWED_LIBRARY`; skips with a reason where no windowed library or display exists.
- [x] A WebAssembly backend runs the same public XNA API for 60 and 600 real frames in headless
  Chromium on a WebGL2 context.
- [x] The XNA structural difference count is zero on both profiles, with no missing members and an
  empty allowlist.
- [x] The CNA enum boundary is proved member by member against the canonical headers by generated
  `_Static_assert`s, with mutation controls that prove the check can fail.
- [x] Every public CNA C API declaration is classified; `UNEXPLAINED` is zero.
- [x] Every runtime-capability row carries machine-checkable proof, and the generator refuses to
  write the document when a claim does not hold.

## Canonical JavaScript/TypeScript consolidation

- [x] One TypeScript implementation serves TypeScript and JavaScript.
- [x] No handwritten source declaration aggregate remains.
- [x] No checked-in generated JavaScript implementation remains.
- [x] Legacy binding/template audit is recorded in `docs/cna-js-consolidation.md`.
- [x] Unified template generates fresh TypeScript and JavaScript consumers from one source.

## Compatibility definition and mapping

- [x] XNA 4.0 Windows runtime is the first named strict profile.
- [x] `docs/xna-typescript-mapping.md` defines names, properties, fields, value aliasing, operators,
  overloads, generics, events, `ref/out`, `TimeSpan`, enums, and lifecycle adaptation.
- [x] Actual seven-assembly metadata measures 257 visible types and 2,964 declared visible members.
- [x] Current language rules are represented in `mapping-rules.json`; its allowlist is empty.
- [x] Later profiles separately inventory GamerServices, Net, Avatar, Xbox 360 and Content
  Pipeline assemblies; `docs/xna-profile-inventory.md` records each with its exact hashes.
- [x] The Content Pipeline's product boundary is measured and decided in
  `docs/content-pipeline-boundary.md`: its 128 types stay unprojected, because four of its
  load-bearing mechanisms — attribute-driven discovery, reflection-based `IntermediateSerializer`,
  MSBuild tasks and XNB output — have no JavaScript or CNA counterpart. Content authoring belongs
  to a separate build-time package over CNA's own compiler. **That package now exists**: `content/`
  is `cna-ts-content`, with its own exports and tests, and the runtime tarball contains none of it.
  A PNG and a WAV written from their own specifications compile to `.cnb` and load through the real
  runtime with their exact texels and sample bytes.
- [x] GamerServices, Net and Avatar are a projected strict profile of their own.
- [ ] No Windows Phone reference corpus is retained on this host; that profile stays unmeasured
  until one is.

## Strict verifier baseline

- [x] Extract the neutral contract only after all reference-assembly hashes match.
- [x] Transform CLR metadata to the expected TypeScript contract.
- [x] Read generated declarations with the TypeScript compiler API.
- [x] Compare type identity, bases/interfaces, members, overloads, parameters, properties, fields,
  events, nested identity, enum values, generic arity/identity/order, expressible constraints,
  generic methods, and nested substitution through mapped interfaces.
- [x] Count CLR reference/value/new() and named generic constraints even where the formal
  TypeScript mapping erases them; deliberate broken-contract fixtures prove the generic gate.
- [x] Emit text and JSON diagnostics with the required categories.
- [x] Strict mode exits nonzero; report-only records 443 initial differences.
- [x] Runtime-symbol verifier reports zero differences for all 348 declared types, including
  abstract-member and JavaScript iterable-protocol handling.
- [x] Strict internal/native leak gate reports zero.
- [x] Allowlist size is zero and blanket allowlisting is prohibited.

Current measured report:

```text
REFERENCE_TYPES=257
REFERENCE_MEMBERS=2964
EXPECTED_MAPPED_TYPES=274
TARGET_TYPES=274
DECLARED_TYPES=348
TOTAL_DIFFERENCES=0
MISSING_TYPE=0
MISSING_MEMBER=0
all other diagnostic categories=0
ALLOWLIST_SIZE=0
RUNTIME_DIFFERENCES=0
INTERNAL_LEAK=0
REFERENCE_GENERIC_TYPES=2
REFERENCE_GENERIC_METHODS=55
REFERENCE_GENERIC_PARAMETERS=57
CONSTRAINED_GENERIC_PARAMETERS=43
REFERENCE_TYPE_CONSTRAINTS=3
REFERENCE_VALUE_TYPE_CONSTRAINTS=43
REFERENCE_DEFAULT_CONSTRUCTOR_CONSTRAINTS=43
MAPPED_TYPESCRIPT_CONSTRAINTS=2
NESTED_GENERIC_SUBSTITUTIONS=44
STRICT_BASELINE_ASSERTION=PASS
STRICT_XNA_WINDOWS_RUNTIME_PROJECTION_ZERO=true
```

## Definition of done

The selected strict profile meets its declaration, runtime-symbol, leak, and mapping gates.
Behavior and native capability claims remain independently scoped: strict API completeness does
not imply authored XACT assets, microphone hardware, video decode/frame ownership, browser/Wasm,
Electron, or mobile support.

## Package/module architecture

- [x] ESM is the sole primary format; CommonJS is not built without evidence of a consumer need.
- [x] `cna-ts` exports aliases and the `Microsoft` namespace object.
- [x] `cna-ts/xna`, `/extensions`, and `/runtime` are explicit subpaths.
- [x] `src/internal/**` is blocked by package `exports`.
- [x] Packed tarball installs and passes strict TS and plain-JS consumers in fresh directories;
  internal package subpaths are proven blocked.

## Runtime/backend architecture

- [x] Private backend contract distinguishes unavailable, WebAssembly, and Node/native kinds and
  defines typed lifecycle, device, resource, and input operations.
- [x] Runtime status does not expose backend objects or handles.
- [x] Managed lifecycle tests execute the contract through an internal backend and the native
  ownership state machine without exposing public injection.
- [x] Implement the first real backend as a small N-API adapter over an explicitly supplied CNA
  ABI 0.21 library.
- [x] Implement the second real backend over the `cna_c_api` Emscripten module, answering the same
  private boundary from a browser.
- [x] Exact ABI version, UTF-8 errors, synchronous callbacks, bigint handles, child ownership, and
  shutdown have Linux HEADLESS integration evidence; GameWindow state/handle/event registrations
  are now routed, while physical event delivery remains unqualifiable under HEADLESS.

## CNA C ABI status

- [x] Current CNA exposes experimental C ABI 0.21.0 across 61 public headers and 4,054 unique
  exported declarations, measured from `cnanext` 599d14e5. The 0.20.0/4,051 generation and the
  historical 0.7.0/2,861 baseline are recorded in `NEXT.md` and `docs/cna-abi-audit.md`, not here.
  0.21 added exactly three declarations, removed and renamed none, and changed no prototype this
  binding imports; under the experimental-`0.x` acceptance policy a 0.21 library would have been
  refused by the 0.20 window rather than mis-driven, so the window was moved deliberately.
- [x] The ABI covers version/error handling plus runtime, graphics, textures, SpriteBatch routes,
  input, content, audio/XACT, media, storage, events, and resource handles, and beyond XNA it adds
  CNB, the modern engine layer, devices, sensors and the extended input families.
- [x] A reproducible read-only audit verifies ABI version/header/function counts and all 46 exact
  cross-subsystem sentinel symbols.
- [x] Produce or obtain a consumable C-ABI WebAssembly ESM artifact: `cna_c_api.mjs` plus
  `cna_c_api.wasm` are built out of tree with Emscripten 6.0.3 and executed in a browser.
- [x] The audit measures that artifact directly — its hashes, its exposed route count and whether
  every route the WebAssembly backend resolves is present — rather than looking for a `.wasm`
  committed to the CNA worktree, which is not how the artifact is produced.
- [x] Define the first exact symbol subset rather than binding all 4,054 routes blindly.
- [x] The audit extracts and verifies the adapter's exact imported symbols separately from the
  sentinel list and checks the qualified library exports each. Three counts are reported on three
  independent axes and must not be conflated: **4,054 canonical declarations** (what CNA
  publishes), **594 Node backend reachability** and **169 WebAssembly backend reachability** (what
  each adapter actually imports), and the purpose classification in `docs/cna-api-coverage.md`
  (what each route is *for*). A route can be `XNA_BACKING` and reached by neither backend, or
  reached by both and `CNA_EXTENSION_BACKING`.
- [x] Every imported route's declared function-pointer type is verified against the canonical
  headers under `-Wall -Wextra -Werror`; signature mismatches are zero.

## Ownership and lifetime

- [x] Architecture names owned, borrowed, parent-owned, and adopted states.
- [x] `Game` native-handle release is idempotent through `NativeResourceLifetime`, and
  use-after-dispose is tested.
- [x] Implement the private native resource state machine, partial-construction rollback, reverse
  child ordering, borrowed invalidation, callback-first teardown, transfer/adoption, and aggregate
  cleanup errors; failed releases retain ownership for retry and block parent release.
- [x] Connect the state machine to real CNA and verify 60/600 frames, double disposal, live-child
  parent shutdown, and repeated Game/resource creation/destruction.
- [x] Verify SoundEffect parent/child, AudioEngine category/bank/cue, dynamic pump teardown, and
  Storage device/container ownership. VideoPlayer frame-texture ownership remains blocked because
  the current CNA route is transient and player-owned.
- [x] Exercise compressed SpriteFont/Model/Texture2D reader graphs, relative external references,
  cache identity, content disposal, and parent shutdown in the qualified native lifecycle.
- [x] Extend deterministic ownership to dynamic buffers, render targets, Texture3D/Cube,
  OcclusionQuery and binding references; reject bound render-target disposal in CNA-TS before the
  qualified artifact's aborting native path can execute.

## Core/value API

- [x] Initial coherent math/geometry group is managed and runtime-independent, including
  `MathHelper`, Vector2/3/4, Matrix, Quaternion, Color, Point, Rectangle, Plane, Ray, and bounding
  volumes.
- [x] Complete the selected mapped surfaces for `MathHelper`, Vector2/3/4, Matrix, Quaternion,
  Color, Point, Rectangle, Plane, Ray, bounding volumes/frustum, curves, and all 17 packed values.
- [x] Import the first 26-observation neutral XNA differential JSON corpus, including NaN,
  infinities, signed zero, rounding, clamping, packing, matrix inversion, and geometry edges.
- [x] Expand the corpus to 181 observations: 83 math/value, 23 input/touch, 47 Audio reference
  observations, seven deterministic subsystem-projection observations, and 21 graphics/content
  observations, producing 182 passing TAP assertions and zero failures.
- [x] Add compile/type probes and managed regressions for the completed value/input groups.

## Game/device/window

- [x] Implement typed events, `GameServiceContainer`, `LaunchParameters`, component collection
  mutation, stable update/draw ordering, initialization, filtering, and disposal behavior.
- [x] Implement the complete mapped `GameWindow`, `PresentationParameters`, `Viewport`, display
  mode snapshots/collections, graphics profile/formats, and explicit unavailable window access.
- [x] Implement the complete mapped `GraphicsDeviceManager`, `GraphicsDevice`, and
  `GraphicsAdapter` declarations with real manager/device/clear/present routes where imported and
  explicit unavailability elsewhere; `Game.GraphicsDevice` is implemented.
- [x] **`GraphicsAdapter` is filled from CNA rather than only declared.** Its fourteen routes are
  bound, and the adapter list, its display modes, both profile answers and both format queries are
  real on HEADLESS and on all three windowed renderers. The read is lazy because CNA permits
  borrowing a device handle only inside a lifecycle callback; a renderer with no adapters still
  refuses by name rather than being handed an invented one.

## Graphics

- [x] Implement the runtime-independent presentation/display value foundation without fake adapter
  descriptions or capabilities.
- [x] Implement `GraphicsResource`, identity-preserving device association, events, and explicit
  deterministic disposal.
- [x] Complete graphics states and stock presets, texture/render-target declarations, vertex
  declarations/values, and buffer declarations; real Texture2D create/destroy is verified.
- [x] Implement typed Texture2D transfer/encoded streams, strict public SpriteBatch, SpriteFont,
  Effect reflection, BasicEffect/stock-effect managed state, and Model graphs in dependency order.
- [x] Route real Texture2D transfer/PNG and SpriteBatch Begin/Draw/End through CNA and construct
  native vertex/index resources from managed XNB Model readers.
- [x] Import and signature-audit bound/indexed/instanced and four-codec user draw routes; the
  qualified HEADLESS pipeline reaches CNA and returns result 12 because no effect is applied, so
  dispatch is verified without claiming GPU output.
- [x] Import state/scalar/sampler/texture/buffer/render-target binding, dynamic-buffer,
  render-target, volume-texture, query and advanced SpriteBatch routes the ABI supports.
- [x] Reconcile Effect against the canonical ABI: project owned native technique/pass identities,
  execute all five stock effects, route Model.Draw and Effect-bearing SpriteBatch Begin, and keep
  compiled execution separately backend-unavailable on HEADLESS after real route dispatch.

## Input/touch

- [x] Implement the complete selected keyboard, mouse, gamepad, and touch value/state declarations,
  including enums, flags, filtering, dead-zone transforms, equality/hash/string behavior, and
  collection semantics.
- [x] Route polling APIs through the private backend and fail explicitly when unavailable.
- [x] Verify keyboard/mouse/gamepad/touch polling over real CNA ABI routes under HEADLESS; physical
  device behavior on a windowed platform remains unverified.
- [x] Verify `GamePad` and `TouchPanel` in a browser with real events reaching the public XNA API,
  including button/stick/trigger values, the packet number, and XNA's `Pressed`/`Moved`/`Released`
  touch transitions with identity preserved across frames.

## Content and models

- [x] Implement and machine-verify the class-token `Content.Load(Type, name)` mapping consistently.
- [x] Implement `ContentManager` root/cache/type/disposable/unload state and managed uncompressed
  Windows XNB v5 framing.
- [x] Implement reader tables/versions/indexes, shared resources, cleanup, public extension-based
  custom reader registration, and Texture2D/SpriteFont/Model built-in reader graphs.
- [x] Keep raw PNG loading on `Texture2D.FromStream`, separate from XNB content loading.
- [x] Implement the XNA LZX frame/block wrapper with persistent managed decoding, exact output-size
  validation, deterministic legal fixtures, and independent real-XNB byte comparison.
- [x] Implement relative/nested external-reference resolution, normalized cache identity, type and
  cycle checks, failure cleanup, shared-resource interaction, compressed targets, and unload.
- [x] Route `TitleContainer.OpenStream` and base `ContentManager` acquisition through CNA title
  storage, normalize separators, append `RootDirectory`/`.xnb`, and reject absolute/traversal host
  paths.

## Audio/XACT, media, storage, GamerServices

- [x] Implement all selected-profile Audio/XACT, Media/Video, Storage, Design, and
  GamerServices declarations without missing members.
- [x] Import typed CNA routes for SoundEffect/instances/dynamic audio/microphones, XACT engines and
  authored banks/cues, MediaPlayer, VideoPlayer controls, and Storage selectors/containers.
- [x] Verify PCM SoundEffect, dynamic buffers, generated-WAV MediaPlayer state, VideoPlayer control
  state, and isolated Storage on Linux HEADLESS/NULL audio.
- [x] `VideoPlayer.GetTexture` projects CNA's player-owned frame as a **borrowed** `Texture2D`:
  `cna_video_player_get_frame_ext`'s monotonic decode generation is what made that safe, so the
  same object comes back while the generation is unchanged and the facade is retired the moment
  anything else touches the player. `cna-ts/extensions` exposes the generation, which XNA has no
  member for.
- [x] The Guide's two asynchronous screens work. `BeginShowMessageBox` and
  `BeginShowKeyboardInput` are the only genuinely asynchronous begin/end pairs in XNA, and both now
  run for real: the continuation fires once with the result `Begin` returned, `EndShowMessageBox`
  answers with the button that was pressed, and a cancelled keyboard input returns null rather than
  an empty string. CNA draws those screens itself and answers them deterministically —
  `cna-ts/extensions/gamer-services` exposes that, and nothing in it fabricates a gamer or a peer.
- [ ] Authored XACT playback is asset-pending; microphone capture has no HEADLESS device; video
  *decode progression* remains fixture-blocked — no redistributable video is available on this
  host, so nothing beyond the no-frame control path is claimed.
- [x] Inventory non-selected GamerServices/Net profiles separately; both are now a projected
  strict profile of their own, refusing at runtime with `GamerServicesNotAvailableException`
  where the platform is absent rather than fabricating a signed-in gamer.

## CNA extensions

- [x] Separate extension subpath exists.
- [x] Renderer information and capability flags come from CNA device queries and remain outside
  strict `GraphicsDevice`; they are unavailable before a real device callback executes.
- [x] `cna-ts/extensions/runtime` projects platform identity, renderer selection with its
  availability set, fallback chain and recorded reasons, and the runtime log, over both backends.
- [x] `cna-ts/extensions/graphics` projects the PBR material, the render pipeline and its frame
  statistics, and reports the truthful not-supported branch where the extended layer is absent.
- [x] The same subpath projects the post-process chain — blit, bloom, tonemapping, FXAA, SSAO and
  screen-space reflections — with CNA's own quality tiers, its per-pass support answer, its GPU
  timings, and both of its ownership rules kept distinct. `AddOwned` is bound and documented as
  upstream-blocked: CNA consumes the handle without its owned-resource accounting.
- [x] The same subpath projects the engine layer's compute path — storage buffers, compute shaders
  and GPU timers — with the capability query that has to precede it. A dispatch computes
  `values[i] * uScale + uOffset + i` over 64 elements on OPENGLES3, and HEADLESS, SDL_RENDERER and
  SOFTWARE refuse every create with NOT_SUPPORTED, which is asserted rather than skipped.
- [x] And CNA's clustered lighting: a light set, the cluster grid, the assignment a GPU would read
  and the shadow-budget policy. None of it touches the GPU, so all sixty-four clusters of a 4x2x8
  grid and the logarithmic depth axis are checked with exact numbers on the default backend.
- [x] And level-of-detail groups, whose hysteresis is the interesting part: with a margin of 3
  around a boundary at 25, climbing holds the near level until 28 and descending holds the far one
  until 22, while a jump of more than one level is deliberately undamped. CNA's part-returning
  `select` is not projected — this package's `ModelMeshPart` is managed and has no native handle
  to give it.
- [x] And the shadow-map maths: a quality tier's texture size and filter radius, and the view and
  projection that frame a scene from a directional light. Checked as geometry rather than against
  recorded numbers — the view's rotation is orthonormal, and all eight corners of the scene box
  land inside the light's clip volume, fitted rather than merely contained, with the depth range
  exactly zero to one.
- [x] And the particle simulation: `Step` integrates one particle with no system, device or GPU,
  and `Random` is the deterministic generator the emitter draws from, so the simulation is checked
  against arithmetic rather than recorded numbers. Two half steps and one whole step both reach the
  same velocity but land in different places, which is what shows a stepwise integrator.
- [x] Both draw passes. **A shadow map's depth pass** runs on a windowed OPENGLES3 renderer and is
  accepted on its texels: an empty pass leaves all 262144 at exactly the far plane, an asymmetric
  quad in an asymmetric scene box darkens exactly the rectangle its corners project to through the
  light transform CNA reports, at exactly the depth that transform predicts, and the same draw
  outside `Begin`/`End` reaches none of the map. The transform is cross-checked first against
  `ComputeLightView` times `ComputeLightProjection` for the same light and box — pure routes that
  touch no shadow map — so the geometry checks cannot move with a defect that corrupts the matrix.
  The two lent caster programs are told apart by what they rasterise, because their handles cannot:
  every borrow is a new handle. **A particle system's draw** is accepted the same way: with the
  simulation pinned to the CPU and every variance zero, all 32 particles stand on the emitter, and
  two systems at different world positions with different particle sizes paint two squares exactly
  where the test's own `CreateLookAt`/`CreateOrthographic` camera puts them, in the particle
  texture's colour; moving the camera slides both by what the new view predicts, and a system with
  nothing alive paints nothing and does not fail. Both were blocked until CNA fixed upstream
  findings 7 and 9 in `48ab0de7f`, because render-target readback answered zeros and there was no
  picture to accept anything on.
- [ ] Soft particles are the one part of the particle draw not accepted. The depth image and the
  softness reach CNA, store and read back, and the drawn particle does not change — not even given
  a depth image saying every pixel is at the camera, which should erase it. The GPU draw path is
  the one running, which its texel count shows. That is `docs/upstream-cna-findings.md` item 12,
  asserted as it currently behaves so a repair is noticed.
- [x] And the rest of the shadow-map maths: a cascaded map's split distances checked against both
  closed forms and their midpoint, the bounding sphere that sizes a cascade snugly, a spot light's
  cone, and a cube map's six faces proved to be three opposite pairs.
- [x] **And the three passes that maths belongs to.** `CascadedShadowMap`, `SpotShadowMap` and
  `CubeShadowMap` are projected beside the flat one, and each is checked against the pure routes
  rather than against recorded numbers: a cascade's splits against `ComputeCascadeSplitDistances`
  for two different lambdas, a spot map's transform against `ComputeSpotLightView` times
  `ComputeSpotLightProjection` multiplied by the test, and a cube's face size against the cube
  route rather than the flat one. The atlas is surveyed slice by slice at six steps so what is
  asserted is the change at each: a cast into cascade zero changes that slice alone and a later cast
  into the last leaves it exactly as it was, which is what says a `Begin` clears its own viewport.
  Moving the light moves every cascade transform and not one split. Twenty-two planted defects were
  run and twenty-one fail; the survivor is `docs/upstream-cna-findings.md` item 16 — three of the
  four maps refuse to be destroyed while lending and the spot map, alone, does not, so reversing
  that order in its `Dispose` cannot be observed from outside.
- [x] **The depth/normal prepass and the decal projector**, which are one pipeline and are
  projected as one. The prepass is accepted against CNA's own rasteriser: the same flat quad drawn
  through a stock `BasicEffect` and through the prepass, into targets of the same size in the same
  frame, agree to within 1.5 texels on every edge — so the renderer's screen and readback
  conventions cancel between them — and the depth it recorded is the number CNA's own pack and
  unpack routes give for that camera, to five decimals, in a buffer holding exactly two values.
  Every covered texel's normal is exactly the encoded view normal. The decal projector is accepted
  **texel for texel with no tolerance at all**: for every screen texel the test rebuilds the world
  point the shader rebuilds, inverts the box's own world matrix and asks
  `cna_decal_pass_is_inside_decal_box` whether it lands inside, intersected with the surface the
  prepass actually drew. Five boxes over one surface each match that prediction exactly, including
  a box rolled thirty degrees about the view axis that paints a diagonal band no axis-aligned box
  could. Opacity is checked through the `NonPremultiplied` blend as an arithmetic identity rather
  than through its getter, a green tint on a red decal leaves black, and the slope limit is
  semantic: with the box left exactly where it is, a surface tilted 60 degrees shows, 80 does not,
  and widening the limit to 85 brings the same picture back. Twenty planted binding defects fail
  and none survives.
- [x] **Light probes**, all three of them: the probe value, the volume, and the baker. The value is
  checked against arithmetic with every constant *measured from CNA* rather than written down — the
  test lights one coefficient at a time to read each of the five out, twice over for the two that
  appear in more than one term, then predicts what a probe with nine distinct coefficients answers
  for nine normals, to 1e-4 on every channel. The grid's positions, its trilinear sampling and
  Chebyshev's visibility bound are the same kind of check. The baker is accepted on real captures:
  which face the scene callback is drawing is decided *inside the callback*, by matching the view
  CNA handed over against what `FaceView` reports for that face and that point, so the callback's
  own behaviour is the evidence that each face got its own camera. Light one face and the probe is
  brightest looking that way and a hundredfold darker looking the other; light the opposite face and
  the two swap; paint the same face at half a byte and every coefficient scales by that fraction. A
  two-cell volume lit only for the cell the callback recognises leaves the other carrying nothing.
  Visibility records exactly the fraction of the far plane its byte encodes. Twenty-two planted
  binding defects fail and none survives.
- [x] **Atmospheric rendering**, and it is the strongest acceptance in this package. CNA ships the
  scattering model twice — once as the GLSL its sky shader runs, once as a CPU route that needs no
  device — and ships a third route saying which way a screen point looks. So every texel of a drawn
  sky has a prediction assembled from two routes that never touch the GPU: six skies of 1024 texels
  each agree with it to within one part in 255 everywhere, most of them bit-identical. Around that:
  a sun below the horizon is ten times darker, a sun inside the frustum makes that half the bright
  one while a sun overhead lights both halves to within two per cent, halving the intensity halves
  every unclipped texel, and a turbidity change moves the picture the same way and by the same
  amount as it moves the model — asserted rather than guessed, because near the horizon aerosol both
  adds scattered light and takes sunlight away. The captured sky is checked without assuming a
  cube-map convention: six flat faces down six axes give six colours, and a right angle about the up
  axis moves exactly the four equatorial ones. Its arithmetic half — the ramp, the Hammersley
  sequence, GGX sampling, the face and panorama mappings, and the yaw as a rotation rather than an
  angle — is checked against its own definitions on HEADLESS. Twenty-three planted defects fail and
  none survives. Two ownership traps came out of it, both by writing the binding to the header and
  measuring what happened: `docs/upstream-cna-findings.md` item 15.
- [x] **The whole post-process family**, in one pass over `graphics_ext.h` and the rest of the
  engine layer's passes. Colour grading is the clean case: a size-2 `.cube` whose transfer is the
  channel rotation `(r,g,b) -> (b,r,g)` is written by the test, parsed by CNA, checked corner by
  corner, then applied twice — as the 4x2 strip texture and as the 2x2x2 volume — and every channel
  of every texel comes back **byte-identical** to the rotation computed in JavaScript, through both
  tables. The rotation is linear in each channel, so trilinear interpolation reproduces it exactly;
  half strength is the exact midpoint and zero strength the exact source. The gradient it runs over
  is asserted asymmetric under mirror, flip and transpose first, so no such error could hide. The
  tonemapper is checked against the model rather than against itself: CNA ships the curve as a
  shader and as a CPU route, HEADLESS pins the CPU route to the published closed forms — Reinhard is
  exactly `v/(1+v)`, ACES is the Narkowicz fit, `None` is a clamp and not a curve, exposure
  multiplies before and gamma raises after — and the windowed suite then predicts every texel of a
  drawn frame through it at five settings that give five different frames. Every pass's own "off"
  switch is a byte-exact identity on a real GPU, eight of them, and turned on each must change the
  frame the way its name means: a bloom only ever adds light, chromatic aberration moves red and
  blue and leaves green untouched at every texel, grain differs per texel rather than offsetting
  the frame, and FXAA leaves a smooth interior alone. The CRT is drawn over flat grey through the
  layer's own fullscreen pass: all parameters at zero is an exact copy, scanlines darken alternate
  rows by exactly the intensity — 200 to 100 at 0.5, to 150 at 0.25 — and the vignette is verified
  as *radial*, symmetric under both mirrors at all 64 texels and strictly brightening along the
  diagonal. The ASCII grid is the source size over the cell size and never the destination's,
  checked at three cell sizes against that division. Bloom's extraction turned out to be a soft knee
  rather than the subtraction its own comment claimed, and the comment now says what it measured.
  Depth-of-field's circle of confusion is checked against the thin-lens equation written out in the
  test. The depth effect is labelled native state rather than pixels, because its input is a depth
  buffer a colour blit does not supply. Twelve planted binding defects fail and none survives, and
  two more real ones were found by running it: the two colour-grade getters mint different kinds of
  handle, and an `Effect` always has child views, so the route that *consumes* an effect has to be
  given them back first.
- [x] **Physically-based materials**, the largest family in the engine layer and the one that is
  most nearly pure value semantics. CNA carries the material in two C shapes — the layout frozen
  before the `KHR_materials_*` factors existed, and the canonical one every accessor on the C++ type
  corresponds to — and this projects the canonical one, with the glTF extension set beside it and
  the two effects that carry both. A material is a value and is checked as one: two built the same
  way compare equal and hash alike, one edited field makes them differ, the same edit twice gives
  the same material again, and two never share their per-slot arrays. Its defaults are glTF's, each
  asserted against what glTF specifies rather than against a run: fully metallic, fully rough, an IOR
  of 1.5, an opaque white base colour, every slot on UV channel zero with a neutral transform. The
  effect acceptance is **two independent paths into one state**: a whole material goes on, every
  field is read back through the per-field accessors the apply never touched, and only then is the
  extractor asked and CNA's own equality used to compare. The per-field setters then move the same
  state, which is what makes those two paths two. `ApplyState` is qualified by reading CNA's device
  state back — the wrapper cannot see it — and predicted from the XNA states the C++ names:
  `SourceAlpha`/`InverseSourceAlpha` for a blended material, `One`/`Zero` otherwise, `CullNone` when
  double-sided. The glTF bridge is the one thing here that converts rather than carries, and its
  conversion is measured over a table of seven inputs and matches `round(x * 255)` at every one. The
  extension set's `IsNeutral` turned out to mean "no feature contributes" rather than "no field was
  written", which is measured one field at a time from a fresh set each time — a sheen roughness or
  a subsurface wrap stores its value and leaves the set neutral, while the factor that enables the
  term does not. Fifteen planted defects fail and none survives. One upstream finding came out of
  it: a PBR effect's texture slots have two sources of truth that never agree, so a material
  carrying a texture cannot be round-tripped through an effect (item 19).
- [x] **The volumetric and atmospheric screen-space passes** — aerial perspective, height fog,
  light shafts and volumetric fog. Three of the four publish the arithmetic their shader runs as a
  pure C route, and that is where the acceptance lives: air mass against Kasten–Young written out
  from the published formula (one atmosphere straight up, about thirty-eight along the horizon,
  linear in distance until that ceiling, a zero-length direction treated as straight up rather than
  divided by), transmittance against Rayleigh per channel plus a grey Mie term (blue scattered
  hardest, and more aerosol narrowing the spread between channels rather than tinting them), and
  height fog's optical depth against the closed form of the integral the shader marches, in all
  three of its branches — no fog, a level ray that accumulates linearly, a climbing ray that
  converges while a descending one runs away. Moving the layer up with the camera puts the answer
  back exactly. On a real renderer each pass's own off switch is a byte-exact copy, and turned on
  the fog moves every texel monotonically towards its own colour and never past it, a descending
  camera gathers more than a level one, and enough density gives exactly the fog colour. The aerial
  pass is the only thing in the layer that says *why* it could not work, and that is qualified as a
  three-state ladder — no depth, then no camera, then nothing — so the reason is asserted to change
  as inputs are supplied rather than to be one constant string. Writing it closed a real gap in this
  binding: the post-process frame carried no camera at all, so every pass that rebuilds a world
  position out of the depth image was falling back through it. It now carries the projection, both
  inverses, the previous frame's view-projection and whether there was one. Eight planted defects
  fail and none survives.
- [x] **Culling**, where the acceptance is two implementations of one predicate. CNA's
  `FrustumCuller` and this package's own XNA `BoundingFrustum` are asked about the same eleven boxes
  and five spheres for the same camera and agree on every one, with the fixture asserted to be
  mixed so the agreement cannot be vacuous. The batch routes are checked against the single test —
  culling a batch keeps exactly what testing one at a time keeps, in order. Culling *transforms*
  carries two traps and both are pinned: the bounds match by index and are already world-space, so a
  single shared local box keeps every transform rather than testing them all against it, and a
  transform with no matching bound is **kept** rather than dropped, which is the opposite of what a
  caller who miscounted expects. The instancing streams are described by CNA rather than restated:
  four `Vector4` rows on consecutive texture-coordinate channels at sixteen-byte offsets, stride
  sixty-four; one packed `Color` for a tint, stride four. The renderer object around them is
  deliberately not projected, for the reason the LOD group is not — it is built on a
  `CNA_ModelMeshPartHandle` and this package's `ModelMeshPart` is managed with no native handle to
  give, so binding it would offer routes that could only ever be handed zero. The GPU instance
  culler is item 20: it runs, reports success, and keeps every instance, including ones ten thousand
  units outside a hundred-unit frustum. Two planted defects survive and are recorded rather than
  hidden — one cannot be observed while the cull rejects nothing, and the other replaces a constant
  route with the constant it returns, which no test can distinguish.
- [x] **The debug drawer**, which is the easiest family in the layer to qualify well and was
  qualified accordingly: everything it draws is a line list, and CNA hands the whole list back, so
  what a gizmo *consists of* is read rather than looked at. A line is its two endpoints in order; a
  cross is three lines reaching its size along each axis and nowhere else; a box is the exact ordered
  list of twelve edges over eight corners, on a box asymmetric in all three axes so a swapped `Min`
  and `Max` is a different picture rather than the same corners reordered, with each corner used by
  exactly three edges. A sphere is three rings of its segment count with every vertex exactly on the
  sphere and on one of the three axis planes through its centre. A frustum's edges use all eight of
  the corners `BoundingFrustum` gives for the same matrix — a second independent implementation
  again. The gizmos are checked against the light they describe: a point light is a sphere at
  exactly its range, a spot light is *two* cones whose rims sit at range times the tangent of the
  outer and the inner angle, and a directional light is an arrow starting a length back along its
  direction. Seven planted defects fail and none survives. `cna_debug_draw_add_cluster_slice_gizmo`
  is left unbound: it needs a clustered light *grid*, which is not projected yet.
- [x] **The HDR display chain, automatic exposure and spatial upscaling.** CNA publishes the whole
  display transfer chain as pure routes, so each part is checked against the standard it implements:
  the PQ curve against SMPTE ST 2084's own five constants, clamped at both ends and an exact inverse
  of its decode; the primaries against the BT.2087 matrix, where white stays white because the rows
  sum to one and a Rec.709 red becomes a less saturated mixture in the wider gamut. The roll-off
  turned out to be **Reinhard against the peak rather than a knee** — a hundred nits against a
  thousand-nit peak comes back as ninety-one — and the binding's own comment was corrected to say
  so. The composition is the claim worth making and it is *bit-identical*: brightness and the
  roll-off happen first, in the source primaries, and only then is the gamut converted and the curve
  applied; rolling off after the conversion gives a different answer, which the test also asserts so
  the ordering claim is not vacuous. That an sRGB display gets the scene value unchanged is proved
  twice — from the pure route, and as a byte-exact drawn frame. The auto exposure needs compute
  shaders, so HEADLESS refuses it honestly and it is qualified windowed: the measurement is exactly
  the average channel value, and every step of the adaptation is predicted by
  `target + (current − target)·exp(−speed·seconds)`, with the speed chosen by which way the *scene*
  moved. Eight planted defects fail; two survive and are recorded as **equivalent** rather than as
  gaps, because a Reinhard roll-off and an "are these sizes equal" predicate are both symmetric in
  the arguments the mutation swaps.
- [x] **The canonical render-pipeline settings** — forty-seven fields moved through the bridge by
  three `offsetof` tables rather than by hand, so a field added upstream is a compile error in the
  ABI audit rather than a silently dropped value. Normalizing is a *floor* rather than a two-sided
  clamp, gamma's is 0.01 because dividing by it is what gamma is for, and CNA's own defaults pass
  through unchanged field for field. The enums are **validated rather than clamped**: an undefined
  quality is refused, because guessing which tier a caller meant would be worse than saying so. The
  quality preset sets how much work each pass does — eight ambient-occlusion samples to sixty-four
  across four tiers — and never which passes run, which stays the caller's decision. The settings
  text answers *how many fields it recognised*, which is how a caller tells a settings file that
  loaded from one that was mostly typos, and a loaded value goes through the same clamping a written
  one does. Four planted defects fail and none survives.
- [x] **Clustered lighting**, where the shading model is published as a pure route and the
  acceptance is therefore a *second implementation of it*: a Cook-Torrance BRDF with a GGX
  distribution, a Smith-Schlick geometry term and a Schlick Fresnel, plus the sheen, clearcoat,
  iridescence and subsurface layers, written out in the test and compared against CNA's at fifteen
  parameter combinations — head-on, off to the side and grazing, each layer alone and all at once —
  agreeing everywhere. The comparison is asserted not to be vacuous: fourteen of the fifteen results
  are distinct and every optional layer is asserted to change the answer, so no branch of the
  reference is dead. A *rough* sheen is used deliberately, because the lobe's width is
  `1/max(roughness², 0.07)` and a smooth one is too narrow to reach a grazing geometry at all —
  physics, not a defect. Volume absorption is Beer–Lambert, pinned by the fact that at a thickness
  equal to the attenuation distance the answer *is* the attenuation colour. The buffer's three
  counts are checked against the three objects it was uploaded from rather than against numbers. Six
  planted defects fail and none survives. Two corrections came out of it: the clustered light grid
  **is** projected (as `ClusterGrid`), so `cna_debug_draw_add_cluster_slice_gizmo` is bound after
  all; and `Dispose` on the forward effect used to clear its handle *before* the destroy, so CNA's
  refusal while it lends its shader stranded the effect and made the game undestroyable.
- [x] **Area lights**, where four of the shading routes are pure functions and the split between
  what is *closed* and what is not is made explicit. Closed and checked exactly: the lobe width is
  the GGX alpha floored at 0.02, checked at both ends of the clamp and at the exact point the floor
  takes over; a rectangle's quad is its own corners; a disc's is the rectangle scaled by
  `sqrt(π)/2`, the equal-area scale. A tube is a *billboard* and is asserted as one — its quad turns
  with the surface it is seen from and keeps the cylinder's axis as its long side either way. Not
  closed, so checked as relationships only the real model satisfies: coverage falls as the lobe
  widens, a lobe pointing away sees nothing and two-sidedness does not change that — because
  two-sidedness is about the *quad's* facing, shown separately by winding the same quad the other
  way and watching only the two-sided light still reach it. The table reports the size and sample
  count the caller chose and its texture is exactly that size. Six planted defects fail and none
  survives.
- [x] **Contact shadows**, whose two decisions are published and therefore checkable without a
  depth buffer. The occlusion test is a **band**, not a threshold, and every side of it is pinned:
  a surface does not shadow itself, nor does a ray within the bias; a ray behind it by more than the
  bias and less than the thickness is occluded; and one behind it by more than the thickness has
  gone *around* the occluder rather than into it — which is what stops a contact shadow smearing
  into a streak behind every object, and is exactly the half a one-sided test gets wrong. A
  thickness equal to the bias leaves a band with nothing in it, so nothing is ever occluded. The
  reference is computed in **float** rather than double, because at a boundary like `1.05 − 1.0` the
  two land on opposite sides and the float one is what ships. Combining with a shadow map's own
  visibility is a clamped product, so two half shadows compound rather than one winning. Five
  planted defects fail and none survives.
- [x] The CNB API is backend-neutral and proved so: a browser gets the same `CnbDocument`,
  `CnbModelData` and `CreateTexture2DFromCnb` a Node consumer gets, and the browser tests make the
  same exact-texel and exact-model assertions. The model is the strongest form of that claim: a
  page builds a rig, encodes it with CNA's writer and decodes it back, asserting both bone parents
  and transforms, the exact vertex and index payloads through wasm32 memory, the named texture
  slots, the mesh graph and all three skeleton matrix sets.
- [x] `cna-ts/extensions/content` projects CNB, CNA's own compiled content format: the validated
  container with its table of contents, metadata, external references and chunk bytes; the texture
  schema, ending in a real `Texture2D`; and the sprite-font schema with its embedded atlas, ending
  in a drawable `SpriteFont`. Fixtures are built with CNA's own encoder rather than hand-rolled, so
  the reader is proved against the writer instead of against itself.
- [x] The same subpath projects **CNB's model schema**, the largest one CNB carries: the bone
  hierarchy with its exact transforms, parts with their vertex and index payloads, glTF-style
  materials with all eight texture roles, meshes with their part membership, the skinning skeleton
  with all three of its per-joint matrix sets, and baked lights. `CnbModelData` is both halves —
  a consumer decodes CNA's containers with it and a build script authors them — so the reader is
  proved against CNA's own writer rather than against itself. It deliberately stops short of
  producing an XNA `Model`: CNB records a part's `VertexStride` and no vertex declaration, so a
  `ModelMeshPart` would need an invented `VertexDeclaration`, which is the trade
  `docs/content-pipeline-boundary.md` rejects.
- [x] The same subpath projects **CNB's three media schemas**. A sound effect round-trips its
  format, rate, channels, frame count, both loop numbers and its exact sample bytes, CNA's own WAV
  decoder reads a RIFF image into one, and `CreateSoundEffectFromCnb` produces a real XNA
  `SoundEffect` — refusing by name for a format XNA cannot represent rather than reinterpreting it.
  A song and a video carry a **stream reference** rather than the media, so both schemas are
  complete and fully testable with no encoded audio or video: this package projects the containers
  truthfully and makes no claim about decoding what they name.
- [x] The same subpath projects **CNB's curve and animation-clip schemas**. A curve decodes into an
  ordinary managed XNA `Curve` — the native handle and its key collection are both released inside
  the decode, so what a consumer holds evaluates in TypeScript as always — and the round trip is
  checked by *evaluating* both curves between the keys, where the tangents and continuity decide
  the answer. An animation clip keeps its handle, because XNA has no clip type to become.
- [x] The three path-taking importers — image, DDS cube and WAV — are projected in
  **`cna-ts-content`**, the separate build-time package. Bytes cross that package boundary and
  handles do not: each operation imports, describes, encodes and releases inside one native call.
- [x] CNB's writers are projected on both backends: the primitive byte writer lays out a chunk's
  payload in CNB's own byte order and the container writer builds a `.cnb` for an asset type CNA
  has no schema for, with every primitive decoded back at its exact offset. A browser builds the
  same 52-byte payload and the same 326-byte container as a build script, byte for byte.
- [x] The `.cnj` compile front end is projected in `cna-ts-content`, where a path-taking route
  belongs, together with the two dependency lists a build system needs — what the compiler
  absorbed, and what it recorded as an external reference.
- [ ] CNB's loader registry, plus the model's morph targets and per-slot texture arrays, are
  measured and unprojected. The registry itself works — a C probe registers a loader, writes a
  `.cnb` of a minted custom type, and `cna_content_manager_load_foreign_ext` calls the loader and
  caches its object exactly as XNA caches a reference type. What blocks it is this package's own
  architecture: that retrieval route needs a **native** content manager, and `ContentManager` here
  is a managed XNB reader that opens the file through `TitleContainer`. Adopting it means
  projecting CNA's own `ContentManager` as a second content path with its own cache, which is a
  decision to take deliberately rather than as a side effect. The callback shape is not the
  obstacle. `cna_cnb_writer_write_to_file` and `cna_cnb_build_model_from_cnj` are deliberately
  unprojected — the first would put a filesystem API back into the runtime package, and the second
  duplicates `cna_cnb_compile_cnj`.
- [x] `cna-ts/extensions/devices` projects CNA's extended device layer: the host's cores and
  memory, its power state with absences reported as absences, the display's content scale and safe
  area, the user's preferred locales, the clipboard, and camera enumeration that keeps "no camera
  support" apart from "no cameras attached". Availability is asked before any reader is offered,
  because every route exists in both build states.
- [x] `cna-ts/extensions/sensors` projects the platform's sensor support and the accelerometer,
  built around the rule the whole family exists for: a missing sensor is not a sensor reading zero.
  `NotSupported`, `NoPermissions`, `Disabled` and `NoData` stay distinct, and `CurrentValue`
  refuses rather than inventing a measurement.
- [x] `cna-ts/extensions/input` projects CNA's **raw joysticks and force feedback** — the layer XNA
  had no equivalent for. It stays outside `Microsoft.Xna.Framework.Input` deliberately: a
  joystick's axes are raw, its identity is the platform's GUID, and it may carry hats and
  trackballs `GamePadState` has no member for. A captured state is a snapshot the backend reads
  whole and releases; an opened haptic device owns a real lifetime and is an explicit `Dispose`.
  The absence contract is CNA's and is measured rather than assumed: an unknown identifier is
  answered *absent* rather than refused, and an absent haptic device declines every operation.
- [x] The same subpath projects **typed text, IME composition and the mouse cursor**. Text input is
  the one input family CNA pushes rather than letting a game poll, because composition is: an IME
  sends editing updates and candidate lists between the keystroke and the committed character.
  Nothing assumes ASCII — a committed character arrives as one UTF-16 code unit, so a non-BMP
  character arrives as its surrogate pair and a caller's accumulator rebuilds it exactly. Driven
  through CNA's own `_ext` injection hooks, which is injection evidence rather than hardware
  evidence and is labelled as such.
- [x] `cna-ts/extensions/sensors` projects the **compass, the gyroscope and the motion sensor**
  beside the accelerometer, with the same rule: a missing sensor is not a sensor reading zero, and
  a heading of zero is a perfectly plausible heading. The compass and motion **data paths** are
  proved through CNA's own synthetic-backend hooks — injection evidence, labelled as such, not a
  measurement of physical hardware. The gyroscope's reading path is not reachable here and
  `docs/upstream-cna-findings.md` records why.
- [x] Camera frame capture is projected: a frame published through CNA's own test backend arrives
  in a caller-owned `Texture2D` with its four texels exact, a wrong-sized texture is refused rather
  than resized, and the platform's real camera on this host reports `NotSupported` honestly.
  Opening the platform camera after a test one is an upstream segmentation fault, asserted in a
  child process — see `docs/upstream-cna-findings.md` item 11.

## Runtime capability inventory

- [x] Keep runtime capability claims independent of the strict structural verifier.
- [x] Generate machine-readable JSON and human-readable Markdown from one reviewed source.
- [x] Every capability row carries machine-checkable proof and the generator refuses to write the
  document when a claim does not hold; mutation controls prove the gate can fail.
- [x] Current baseline is 162 operation families: 21 verified managed, 100 verified native, 13
  verified WebAssembly, five explicitly unavailable on the qualified backend, five upstream-CNA
  blocked, three fixture pending, six hardware pending, three platform pending, two unimplemented
  in CNA-TS, three language-mapping limitations, and one not applicable to HEADLESS Linux.
- [x] Audit every `NativeUnavailableError` and `NotSupportedException` construction site in the
  selected-framework source into those operation-family boundaries; the generator refuses to run
  when a count moves without the audit being revisited.

## Template

- [x] Remove stale `cna-js` identity, fictional APIs/version claims, and unused parallel asset.
- [x] Replace aspirational cube/mobile claims with the smallest truthful managed/build canary.
- [x] Expand the managed canary to exercise components, services, keyboard snapshots, and matrix
  math without treating those as rendering or hardware polling evidence.
- [x] Make the template's actual `HelloGame` an opt-in Node-native 2D demo using embedded PNG
  `FromStream`, public SpriteBatch drawing, moving state, input polling, and deterministic cleanup.
- [x] Verify the template at 60 and 600 real SpriteBatch draw frames against the final package.
- [x] Run the same template game in a browser on the WebAssembly backend at 60 and 600 frames, and
  keep an extensions smoke that reports what the modern CNA surface actually answers.
- [ ] Implement native window/resize and a packaged windowed renderer before making windowed claims
  *in the template*. The library is qualified on three windowed renderers now — OPENGLES3,
  SDL_RENDERER and SOFTWARE, under Xvfb — but the template ships a HEADLESS canary and packages no
  windowed renderer, so it still claims none.
- [x] Keep the template as a 2D-only canary. The library now has native stock Effects, but no cube,
  Model, shader asset, or 3D/effect demo was added to the template.
- [x] Generate TypeScript and ordinary JavaScript projects from one canonical source; both install
  the packed artifact and build, and JavaScript runs a managed smoke without TypeScript.

## Browser/WASM

- [x] CNA contains real Emscripten-aware renderer/runtime code.
- [x] The C-ABI ESM loader and `.wasm` are built out of tree from `cnanext` with Emscripten 6.0.3;
  `docs/wasm-backend.md` records the exact recipe, including the two link settings the upstream
  target does not set for itself.
- [x] Record the required module factory, memory/UTF-8, callback, canvas, shutdown, ABI provenance,
  and CI artifact contract in `docs/cna-abi-audit.md`.
- [x] Browser smoke verifies initialization, graphics/resources, 60 frames, shutdown, and zero
  unhandled console errors; the 600-frame stability target passes on a real WebGL2 context in
  headless Chromium.
- [x] wasm32 structure layouts and callback signatures are generated from an Emscripten-compiled
  probe; nothing at that boundary is hand-written.
- [x] Handles cross the boundary as `bigint` under `WASM_BIGINT` and are never converted through
  `Number`.
- [x] The browser slice reaches 247 routes: the game loop, the graphics device, `Clear`,
  `Texture2D`, `SpriteBatch`, keyboard and mouse, **`GamePad` and `TouchPanel`**, the modern runtime
  services, **title storage and the whole managed content stack**, **render targets with asserted
  pixel readback**, **sound effects**, and **CNB including its model schema**.
- [x] Browser `GamePad` and `TouchPanel` answer the same public XNA API a Node consumer uses, a
  frame at a time, with real Chromium touch events and a Gamepad API device emulated at the browser
  boundary SDL3 actually reads. Absence is reported as absence: with no controller attached all four
  `PlayerIndex` slots report `IsConnected` false and `SetVibration` refuses. Three planted defects
  prove the tests can fail.
- [ ] It is still a slice: members outside it refuse by name through the generated `CnaBackendBase`
  or `CnaGraphicsBackendBase` instead of returning a plausible value.

## Node, desktop, and mobile

- [x] Node managed values, components/services, content lifetime, and package consumers are
  verified.
- [x] Node CNA runtime execution is verified on Linux x86-64 HEADLESS with an explicit compatible
  ABI 0.20 artifact.
- [ ] Electron is planned, not supported or build-verified.
- [ ] Android and iOS are planned, not supported or build-verified.
- [ ] Capacitor/Electron dependencies stay out of the template until they prove a real runtime path.

## Packaging and CI gates

- [x] `npm ci`, clean build, strict type check, unit/differential tests, runtime symbols, leak
  guard, ABI audit, the compiled C contract, route coverage with backend reachability, generated-file
  currency, capability generation, and `npm pack` are always-on CI gates; strict XNA metadata,
  native, CNB, extension, browser and windowed integration are protected conditional jobs that
  report `NOT_CONFIGURED` when their artifact is absent.
- [x] Every checked-in report is reproducible from a pinned checkout: absolute host paths, artifact
  hashes and the dependency revision are printed by the text run and left out of the JSON CI
  compares.
- [x] Install the exact tarball in independent TS and JS consumers with no sibling paths.
- [x] Package exports contain no internal subpath and fresh consumers prove the guard.
- [x] Final generated template TypeScript/JavaScript projects both install the one exact final
  `cna-ts-0.1.0.tgz`; its measured SHA-256 and file count are recorded in `NEXT.md`.
- [x] CI rebuilds `dist` twice and packs twice; it requires identical generated-tree hashes,
  tar payloads, and file lists. Current npm gzip output is byte-identical as well.
- [x] Manual source `.d.ts` duplication = 0.
- [x] Hand-maintained duplicate JavaScript implementation = 0.
- [x] Legacy worktree changes from start through end-of-session verification = 0.

## Upstream CNA blockers

Ten runtime defects and two build-system gaps remain, all in `cnanext`, all measured here and none
fixed from this session. `docs/upstream-cna-findings.md` records each with its reproduction and a
proposed change, and each has a test in this package that fails when the behaviour changes.

Three of the runtime four came out of the draw work. Soft particles never fade, although the depth
image and the softness reach CNA and read back (item 12). The prepass's packed depth encoding is
exact in arithmetic and loses all of it in the eight-bit target it is written into, delivering one
part in 255 where its own source claims one part in 2^24 — measured with a sweep, and demonstrated
rather than guessed by a 256-level control that restores the exact accuracy (item 13). And three
depth/normal prepass routes answer `INTERNAL` where their header documents `INVALID_STATE`, because
`std::logic_error` is not translated where CNA's own render pipeline translates it in the same
source file (item 14). The fifth came out of the atmosphere: two getters document the same
counted-borrow contract and only one of them keeps it, so a caller who follows the header either
leaks a handle that makes the game undestroyable or destroys their own skybox, depending which
route they read (item 15). The sixth is the same shape one level down: all four shadow maps
document the counted-borrow rule in the same words and the spot map is the only one whose destroy
never reads the borrow count its own resource keeps, so the mistake the other three catch is a
use-after-free there (item 16).

The last two came out of the post-process passes. One is the borrow rule again from a third door:
three engine-layer routes lend an `Effect`, all three mint a registered handle, and only
`cna_post_process_effect_pass_get_effect` tells the caller not to destroy it -- so obeying that
header is what makes the game undestroyable (item 17). The other is the consequence every leak
finding here shares, and it is worse than the refusal itself: a process that *ends* with a game
whose destroy was refused takes SIGSEGV after its last statement has run, and an explicit
`process.exit(0)` does not avoid it. A game simply left alive exits cleanly and a refusal that is
cleaned up and retried exits cleanly, so the crash belongs to the refusal rather than to a live
game at exit (item 18).

The ninth came out of the physically-based materials, and it is the borrow rule's opposite number: a
PBR effect's seven texture slots have **two** sources of truth. Applying a material writes the C++
effect's pointers; the slot setter writes the C API's own retained-handle table, which is the only
thing the slot getter reads. Measured identically on HEADLESS and OPENGLES3, a texture applied with
a material is invisible to the getter, a texture placed through the setter is invisible to the
extractor, and applying a material with an empty slot does not clear one the setter filled (item 19).

The tenth is the quietest and the most expensive to adopt. The GPU instance culler dispatches a
compute shader that tests every instance against the camera's six frustum planes and increments a
visible count — and it keeps everything. Three instances ten thousand units outside a hundred-unit
frustum all survive, on the only renderer built here that supports the culler at all. `is_supported`
answers true and the unsupported reason is empty, so a game that adopts it pays for the dispatch,
the upload and the readback and then draws exactly what it would have drawn (item 20).

The runtime one: `cna_post_process_chain_add_owned_pass` consumes a pass handle without the
`RemoveOwnedGraphicsResourceFor` its sibling `_destroy` performs, so the game's
owned-graphics-resource counter never falls and every later `cna_game_destroy` in the process
refuses. It is the capability inventory's single `UPSTREAM_CNA_BLOCKED` row.

The build-system two, both worked around in this binding's build configuration rather than by
editing it, and both written up in `docs/wasm-backend.md`:

- `cna_c_api_wasm` does not pin `MIN_WEBGL_VERSION`/`MAX_WEBGL_VERSION`, so Emscripten negotiates a
  WebGL 1 context while EasyGL asks SDL for GLES 3 and its GLSL ES 3.00 shaders fail to compile.
  The graphics examples already set the pair; the artifact a binding consumes does not;
- `CNA::EmscriptenAbi` adds `-sASYNCIFY=1` to every Emscripten link. SDL3's Emscripten swap calls
  `emscripten_sleep(0)` on each present, and Asyncify's rewind re-enters the bottom export with no
  arguments — under `WASM_BIGINT` an `i64` handle given `undefined` throws. Every route in this ABI
  takes a `CNA_Handle`, so no route survives an unwind.

Separately, and not a blocker for this binding: compiled `Effect` execution returns not-supported
on the HEADLESS renderer, which is a renderer property rather than a missing route. Two entries
that used to sit here are gone. `GraphicsAdapter.DefaultAdapter` is qualified on four renderers
now; and XNA's standalone `GraphicsDevice` constructor works — `cna_graphics_device_create` takes
an adapter index and presentation parameters and no game at all, so the claim that no path could
exercise it was wrong, and a caller-created device now round-trips a texture's exact texels and
releases its own handle.

These are narrower than “CNA has no ABI”: the native C ABI exists and is broad.
