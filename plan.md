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
  and exercises `GameWindow` state HEADLESS cannot reach. SDL_RENDERER and SOFTWARE read back all
  sixteen `RenderTarget2D` texels exactly; OPENGLES3 no longer does, and that regression is
  asserted as measured rather than skipped — `docs/upstream-cna-findings.md` item 7. Opt-in through
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
- [ ] The rest of the engine layer — cascaded, spot and cube shadow maps, particles, decals, light
  probes and atmospheric rendering — is measured and unprojected.
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
  measured and unprojected. The registry needs a typed abstraction designed rather than
  transcribed: this package will not publish `void*` or a table of function pointers.
  `cna_cnb_writer_write_to_file` and `cna_cnb_build_model_from_cnj` are deliberately unprojected —
  the first would put a filesystem API back into the runtime package, and the second duplicates
  `cna_cnb_compile_cnj`.
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
- [x] Current baseline is 98 operation families: 20 verified managed, 46 verified native, seven
  verified WebAssembly, five explicitly unavailable on the qualified backend, one upstream-CNA
  blocked, three fixture pending, four hardware pending, three platform pending, five unimplemented
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

One runtime defect and two build-system gaps remain, all in `cnanext`, all measured here and none
fixed from this session. `docs/upstream-cna-findings.md` records each with its reproduction and a
proposed change, and each has a test in this package that fails when the behaviour changes.

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
