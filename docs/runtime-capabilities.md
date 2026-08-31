# Runtime capability and blocker inventory

Profile: **XNA 4.0 Windows runtime**

Selected evidence environment: **Linux x86-64 Node with CNA ABI 0.21.0 HEADLESS renderer and NULL audio, plus headless Chromium with the CNA ABI 0.21.0 WEBGL2 WebAssembly artifact**

Each row is a reviewed operation family; overloads with the same implementation and evidence share a row.
This inventory is independent of the strict API verifier: API shape completeness does not imply runtime capability.

## Explicit failure-site audit

All selected-profile framework files containing explicit NativeUnavailableError or NotSupportedException construction were reviewed into the operation families below. Internal construction guards share their public operation family: the seventh NotSupportedException site is Texture2D's internal whole-level byte upload, which belongs to the CNB Texture2D family that uses it. The count fell by one when VideoPlayer.GetTexture stopped refusing outright and began projecting CNA's borrowed frame.

- NativeUnavailableError construction sites: 61
- NotSupportedException construction sites: 7
- Framework files containing those sites: 23

## Counts

| Category | Operation families |
| --- | ---: |
| VERIFIED_MANAGED | 20 |
| VERIFIED_NATIVE | 47 |
| VERIFIED_WEBASSEMBLY | 9 |
| EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND | 5 |
| UPSTREAM_CNA_BLOCKED | 1 |
| FIXTURE_PENDING | 3 |
| HARDWARE_PENDING | 4 |
| PLATFORM_PENDING | 3 |
| UNIMPLEMENTED_CNA_TS | 5 |
| LANGUAGE_MAPPING_LIMITATION | 3 |
| NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT | 1 |

## VERIFIED_MANAGED

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Audio enums, listener/emitter values and SoundEffect duration/size arithmetic | CNA-TS | 47 deterministic XNA differential observations |
| BlendState, DepthStencilState, RasterizerState and SamplerState managed values/presets | CNA-TS | graphics-foundation unit suite verifies snapshots, defaults and disposal |
| Content cache, failure cleanup, dependency-ordered Unload and Dispose | CNA-TS | content and content-xnb lifecycle tests including failed nested construction and native Effect-to-texture retention |
| ContentManager LZX-compressed XNB framing and decompression | CNA-TS | synthetic single/multi-frame tests plus exact independent 16,561/44,032-byte fixture comparison |
| ContentManager uncompressed XNB framing, reader tables, object dispatch and shared resources | CNA-TS | deterministic synthetic content-xnb fixtures |
| ContentReader.ReadExternalReference and nested ContentManager resolution | CNA-TS | relative/nested/repeated/circular/missing/malformed/compressed reference tests |
| Design TypeConverter projections and GamerServicesComponent lifecycle | CNA-TS | design and framework unit suites |
| Effect reflection, parameter values, techniques and managed stock-effect state | CNA-TS | graphics/content differential observations and graphics-foundation tests |
| Framework math, geometry, curves, packed vectors, TimeSpan, Color and value contracts | CNA-TS | 83 deterministic XNA differential observations plus math/geometry/graphics-value unit suites |
| GameComponent, DrawableGameComponent, collections, services and managed events | CNA-TS | framework-components unit suite covers ordering, mutation, filtering, services and disposal |
| GamerServices and Net declarations, identities, value shapes and exception hierarchy | CNA-TS | the xna40-windows-live profile holds at zero differences over 74 types and 676 members, with thirteen behaviour assertions over the identities, the catchable exception hierarchy, the empty signed-in collection, Guide title state, the mutable AvatarExpression, the null-preserving session property bag and a full packet round trip |
| Graphics presentation, viewport, display, vertex and render-target value objects | CNA-TS | graphics-foundation and graphics-values unit suites |
| KeyboardState, MouseState, GamePad values and Touch values/collections | CNA-TS | 23 deterministic XNA differential observations and input unit suite |
| Media collections, queue identity and MediaPlayer managed settings/events | CNA-TS | deterministic subsystem differential observations |
| Model graph collections, parent/child identity and absolute transforms | CNA-TS | graphics/content differential observation and managed Model tests |
| SoundEffectInstance managed lifecycle state and disposal guards | CNA-TS | differential and audio/media/storage design suites |
| SpriteBatch argument and Begin/End validation | CNA-TS | graphics/content differential observation and graphics-foundation tests |
| Storage path validation and isolated managed-directory adapter | CNA-TS | deterministic storage differential observation and design suite |
| Texture2D, SpriteFont and Model managed XNB reader graphs | CNA-TS | uncompressed and compressed synthetic reader-graph tests |
| Texture3D/TextureCube exact Color codec, bounds and CNA dispatch projection | CNA-TS | managed native-shaped backend verifies boxes, faces and exact packed Color round trips; all ABI signatures are compiler-audited and the qualified HEADLESS artifact returns documented NOT_SUPPORTED at creation |

## VERIFIED_NATIVE

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| BasicEffect, AlphaTestEffect, DualTextureEffect, EnvironmentMapEffect and SkinnedEffect native construction | CNA-TS + CNA | all five distinct ABI-0.7 constructors return owned effects with real technique/pass views under qualified HEADLESS integration |
| BasicEffect, AlphaTestEffect, DualTextureEffect, EnvironmentMapEffect and SkinnedEffect native state/apply execution | CNA-TS + CNA | qualified HEADLESS integration synchronizes dependency-complete stock state, applies every stock effect and verifies clone, texture retention and deterministic disposal |
| CNA renderer identity and capability query extension | CNA-TS + CNA | qualified artifact reports HEADLESS/custom-effects/compiled-effects capability bits |
| CNA sensors: support enumeration and the accelerometer's absence path | cna-ts/extensions/sensors | the platform answers for all four sensor families, and on a host with no accelerometer the whole family agrees: the state is NotSupported, no data is valid, and CurrentValue refuses with InvalidOperationException rather than returning three zeroes a game would integrate into an orientation nothing measured. Start, Stop and the update interval report what the platform did rather than what was asked, disposal is idempotent, and a released sensor does not block the next one |
| CNB container: parse, validate, walk the table of contents and read chunk bytes | cna-ts/extensions/content | a container encoded by CNA's own writer parses back with its container version, asset type, schema version, CMET metadata and chunk order; a chunk's bytes are exact and its CRC-32C recomputes to the table-of-contents value; truncation, a flipped payload byte and an XNB are each refused with CNA_RESULT_IO, and an unknown mandatory chunk refuses the whole file |
| CNB model: the bone hierarchy, parts and payloads, materials, meshes, skeleton and lights | cna-ts/extensions/content | CNB's largest schema, read and written through CnbModelData. A reference model with every projected level occupied at once -- two bones in a hierarchy, a part with real vertex and index payloads, a material with distinguishable values in every field and all eight texture slots named differently, a mesh, a skeleton with three matrix sets, a light -- is built with the public API, encoded by CNA's own writer and decoded back. Every assertion is a value: the exact parent links and transforms, the exact payload bytes and lengths, each of the eight texture names through its own slot, the mesh's parent bone and part membership, and all three skeleton matrix sets kept apart by their own diagonals. Refusals are asserted too: another asset type, a corrupted image, a payload that contradicts its declared part (which CNA validates at encode rather than at set, measured rather than assumed), and use after disposal. Two planted bridge defects -- an ignored skeleton matrix-set identity and an ignored texture slot -- each fail exactly one test |
| CNB SpriteFont: decode a compiled font with its embedded atlas into a drawable SpriteFont | cna-ts/extensions/content | a font CNA encoded decodes with its metrics, its ascending character map and its per-glyph rectangles and kerning; CreateSpriteFontFromCnb builds a SpriteFont whose MeasureString is exact, the copied atlas outlives the font it came from, an unsorted character map is refused at encode time, and an absent fallback character reads as null rather than U+0000 |
| CNB Texture2D: decode a compiled texture and upload it as a real XNA resource | cna-ts/extensions/content | a texture description CNA encoded decodes to the same shape, representation format and level bytes, and CreateTexture2DFromCnb produces a Texture2D whose four readback texels are exactly the RGBA the encoder was given; representation selection reports an unsupported format as absence rather than failure |
| Compiled Effect creation binding route | CNA-TS + CNA | exact byte payload reaches cna_effect_create_compiled with compiler-verified ABI; three legal conformance-FXB attempts deterministically return the qualified HEADLESS result 6 with invalid output and no shader-execution claim |
| Dynamic buffer ContentLost subscription and deterministic release | CNA-TS | the declared events now have a real CNA producer behind them: both subscriptions execute on the qualified artifact, the registration is released with the resource, and disposing twice with a live registration stays harmless |
| DynamicSoundEffectInstance submit, pending buffers and managed refill pump | CNA-TS + CNA | qualified native integration with reentrant/self-removing/throwing callback tests |
| DynamicVertexBuffer and DynamicIndexBuffer creation, typed transfer, readback and IsContentLost query | CNA-TS + CNA | qualified integration covers Discard/NoOverwrite, built-in vertex and 16-bit index round trips, double disposal and parent shutdown |
| Effect and EffectPass ABI-0.7 apply dispatch with native technique/pass reflection identity | CNA-TS + CNA | qualified integration executes cna_effect_apply and cna_effect_pass_apply on effect-owned stock passes; managed/native ownership tests retain the parent, destroy owned views, reject disposed parents and expose no raw handles |
| Extended graphics layer availability probe | cna-ts/extensions/runtime | cna_graphics_ext_is_available answers true on a CNA_CNAEXT=ON build and false on the WEBGL2 artifact, so structural presence is never reported as availability |
| FrameworkDispatcher.Update canonical native pump | CNA-TS + CNA | native lifecycle and dynamic/media pump integration |
| Game create, callbacks, one-frame/run/exit/destroy lifecycle | CNA-TS + CNA | qualified ABI-0.7 integration covers seven real game lifetimes and 60/600 frames |
| GamerServicesDispatcher lifetime and Guide state over real CNA gamer services | CNA-TS + CNA | the dispatcher initialises against the running game and reports CNA's own IsInitialized rather than a mirrored flag; a 64-bit platform window handle round-trips as a bigint; Guide's trial-mode simulation, notification position and visibility read and write through CNA. Two XNA rules CNA does not enforce are enforced here and asserted: an un-initialised Update raises InvalidOperationException, and IsTrialMode is the disjunction with SimulateTrialMode. IsScreenSaverEnabled is a platform display property, so with no displays the getter answers true and a write does not take -- reported rather than cached. Nothing fabricates a gamer: SignedInGamers is empty and every screen-showing operation still refuses with GamerServicesNotAvailableException |
| GameWindow stable facade, borrowed handle/state and removable event registrations | CNA-TS + CNA | qualified integration verifies stable Game.Window identity, zero HEADLESS handle, title/state queries, callback registration cleanup and repeated game lifetimes |
| GraphicsDevice bound, indexed, instanced and four-codec user draw dispatch | CNA-TS + CNA | 360-symbol bridge dispatch and argument layouts are signature-audited; qualified HEADLESS calls reach CNA; no visible-output claim |
| GraphicsDevice copied state, scalar state, sampler/texture, buffer and render-target binding routes | CNA-TS + CNA | qualified ABI-0.7 integration verifies successful assignment, null/unbind, stable read-after-write facade identity and render-target state; managed suite covers bounds, disposed, duplicate, wrong-device and rollback validation |
| GraphicsDevice status query | CNA-TS + CNA | qualified HEADLESS device reports the canonical Normal status through cna_graphics_device_get_status |
| GraphicsDevice.Clear and Present | CNA-TS + CNA | 60/600-frame qualified native integration |
| GraphicsDeviceManager create/configure/apply and callback-scoped device borrowing | CNA-TS + CNA | qualified native integration and ownership tests |
| Keyboard, Mouse, GamePad and Touch polling routes | CNA-TS + CNA | qualified HEADLESS native integration; physical device behavior is separate |
| MediaPlayer source/song creation, queue controls, position and visualization | CNA-TS + CNA | generated legal silent WAV under qualified NULL-audio integration |
| Model.Draw effect/pass/indexed-draw pipeline | CNA-TS + CNA | qualified HEADLESS Model XNB executes buffer/index binding, BasicEffect matrices, real EffectPass.Apply and DrawIndexedPrimitives without a special native model renderer |
| Modern CNA device layer: host CPU/memory, power, display scale and safe area, locales, clipboard, cameras | cna-ts/extensions/devices | the layer's availability is asked before any reader is offered, CNA's logical core count matches Node's independently, an absent battery charge reads as null rather than zero so a low-charge comparison cannot misfire, a windowless session's zero content scale and empty safe area are recorded as CNA's own answers, locales come back as language/country pairs, the clipboard reports acceptance rather than throwing where there is none, and camera support is kept distinct from camera count |
| Modern CNA PBR material and render-pipeline value defaults | cna-ts/extensions/graphics | cna_pbr_material_init and cna_render_pipeline_settings_init are pure value operations CNA documents as answering in either build, and they do on the qualified artifact; the facade seeds its value objects from them rather than from numbers written in TypeScript |
| Modern CNA platform identity, renderer selection and runtime log | cna-ts/extensions/runtime | nine native integration assertions over 37 handle-free routes, including the pre-latch and non-desktop refusals CNA reports as state |
| Modern CNA post-process chain: bloom, tonemapping, FXAA, SSAO, screen-space reflections | cna-ts/extensions/graphics | every pass property round-trips through CNA at float precision, CNA's own quality tiers rise with quality and its roughness-blur clamp is recorded rather than avoided, each pass reports its own name and its truthful IsSupportedOn answer on the HEADLESS renderer, a chain applies over real render targets, and GPU timing reports what the renderer actually gave rather than what was asked for |
| Modern CNA render pipeline object lifetime, resize, frame and statistics | cna-ts/extensions/graphics | on a CNA_CNAEXT=ON artifact a pipeline is created, resized, begun, ended, queried for statistics and disposed twice safely; where the layer is compiled out construction reports CNA_RESULT_NOT_SUPPORTED and the native suite asserts that branch instead |
| OcclusionQuery construction, ordering, reuse, completion/result dispatch and disposal | CNA-TS + CNA | qualified integration executes the real query state machine without fabricating PixelCount; managed suite covers completion and exact result identity |
| RenderTarget ContentLost subscription and deterministic release | CNA-TS | subscription executes on the qualified artifact and its registration is released before the target is, ordered after the bound-target guard so a refused disposal leaves the subscription in place |
| RenderTarget2D/Cube construction, metadata, binding and inherited exact transfer routes | CNA-TS + CNA | qualified HEADLESS integration verifies RenderTarget2D and RenderTargetCube creation, metadata, 2D/cube-face bind/unbind identity, bound-destroy rejection and parent shutdown; managed backend covers cube metadata, face identity and duplicate validation |
| SoundEffect PCM creation, instances, controls, Apply3D and disposal | CNA-TS + CNA | qualified NULL-audio integration; no audibility claim |
| SpriteBatch create, Begin, Draw/DrawString submission, End and destroy | CNA-TS + CNA | qualified native integration and template 60/600 frames |
| SpriteBatch Effect-bearing Begin | CNA-TS + CNA | qualified HEADLESS integration executes cna_sprite_batch_begin_with_effect with a real BasicEffect; managed lifetime lease, device checks, null behavior, disposal guard and native-failure rollback are covered |
| SpriteBatch explicit render-state and transform Begin | CNA-TS + CNA | qualified integration executes copied Blend/Sampler/DepthStencil/Rasterizer descriptors; managed tests verify identity, wrong-device checks and post-success immutability |
| StorageDevice selector, StorageContainer and stream CRUD | CNA-TS + CNA | qualified native integration in isolated XDG storage |
| Texture2D create, Color transfer, regions/mips, FromStream and PNG encoding | CNA-TS + CNA | qualified native integration with deterministic pixel checks |
| TitleContainer.OpenStream and default ContentManager title-storage acquisition | CNA-TS + CNA | qualified integration reads package.json through the CNA title-storage count/copy route; CNA-TS rejects absolute/traversal host paths and default ContentManager appends RootDirectory plus .xnb |
| VertexBuffer windowed upload with Discard or NoOverwrite | CNA-TS | ABI 0.16 added cna_vertex_buffer_set_data_raw_at_with_options; the adapter routes non-None options through it and keeps the plain route for None |
| VertexBuffer/IndexBuffer mapped public value transfer | CNA-TS + CNA | qualified integration verifies four exact built-in vertex codecs and 16-bit index transfer; no JavaScript object serialization or layout guessing is used |
| VertexDeclaration, VertexBuffer and IndexBuffer resource construction/readback used by Model XNB | CNA-TS + CNA | qualified native Model reader integration |
| VideoPlayer construction and control/cached-property state without decoded frames | CNA-TS + CNA | qualified native control-state integration |
| VideoPlayer.GetTexture borrowed frame projection and its decode identity | CNA-TS | cna_video_player_get_frame_ext's monotonic decode generation is what made a safe projection possible: GetTexture now hands back a non-owning Texture2D over the player's own frame, returns the same object while the generation is unchanged, and retires it the moment anything else touches the player -- the exact window CNA says the handle is valid for. Before any decode the identity reads absent with generation zero and a negative presentation time, reading it twice does not advance the count, and neither path fabricates a texture. Frame progression across a real decode stays fixture-pending |
| Windowed Linux qualification: real GPU pixels through the public XNA drawing path | CNA-TS | against an OPENGLES3/SDL3 CNA library under Xvfb, a RenderTarget2D cleared to (12, 34, 56, 255) through GraphicsDevice.Clear reads back all sixteen texels exactly, the renderer reports itself as OPENGLES3 with a 16384-texel limit and 0x7ffff capability flags, a stock BasicEffect pass applies for real rather than returning the HEADLESS not-supported branch, and 60 and 600 SpriteBatch frames run without drift. Opt-in through CNA_WINDOWED_LIBRARY, and it skips with a reason where no windowed library or display exists |

## VERIFIED_WEBASSEMBLY

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Browser GamePad: connection, capabilities, buttons, thumbsticks and triggers | CNA-TS | test/wasm-browser-input.mjs drives GamePad.GetState/GetCapabilities from inside an ordinary XNA Update in headless Chromium. With no controller attached all four PlayerIndex slots report IsConnected false rather than an invented device; with a Gamepad API device emulated at the browser boundary -- the integration point SDL3's Emscripten joystick driver actually reads -- the capability table, A and D-pad button states, both thumbstick axes with CNA's Y-inversion, the analog left trigger and an advancing PacketNumber all arrive, and releasing returns every one of them to zero. SetVibration reports false, because the browser's standard mapping exposes no rumble to SDL. Three planted defects -- swapped thumbsticks, an always-connected capability table and a previous-position that reports the current one -- each fail exactly one of these tests |
| Browser off-screen rendering with exact pixel readback | CNA-TS | a RenderTarget2D is created, bound, cleared to an exact colour and read back through Texture2D.GetData in headless Chromium on WebGL2; all sixteen texels equal the cleared value, and disposing a still-bound target is refused |
| Browser sound effects: PCM construction, exact duration and the instance state machine | CNA-TS | a quarter second of 16-bit mono PCM built in the page reports exactly 250 ms and 2,500,000 ticks, volume, pitch, pan and looping round-trip through CNA at float precision, and an instance walks stopped -> playing -> paused -> playing -> stopped. Audibility is deliberately not claimed: a browser will not start a WebAudio context without a user gesture, and SoundEffect.Play reports whether the runtime accepted the sample rather than whether anyone heard it |
| Browser title storage and ContentManager XNB loading | CNA-TS | the browser harness writes assets into the module filesystem, reads exact title bytes back through TitleContainer.OpenStream, and loads an uncompressed Texture2D XNB and an LZX-compressed SpriteFont XNB through an ordinary ContentManager; a missing asset refuses with CNA_RESULT_IO rather than reading as empty |
| Browser TouchPanel: the touch collection and XNA's press/move/release states | CNA-TS | test/wasm-browser-input.mjs dispatches real Chromium touch events and reads TouchPanel.GetState from inside Update. Before the first finger there is no touch device at all, which is distinct from a device with nothing on it. A press arrives as TouchLocationState.Pressed with no previous location, the next frame is Moved at the same point, a move keeps the identifier and reports the press position as its previous one, a second finger is Pressed while the first stays Moved, and lifting reports Released exactly once before the collection empties. The XNA enumerator visits the same identifiers in the same order as the indexer |
| Browser/Wasm CNA runtime | CNA-TS | 60 and 600 real frames of the public XNA Game/GraphicsDeviceManager/Texture2D/SpriteBatch path in headless Chromium on a WebGL2 context, ABI 0.21.0, no uncaught page error |
| CNB in a browser: the same compiled-content API, on the WebAssembly backend | cna-ts/extensions/content | a page encodes a texture with CNA's own writer, parses the container back and uploads it with CreateTexture2DFromCnb, and the four readback texels are exactly the RGBA the encoder was given -- the same assertion the Node suite makes, through the same public API, against a different backend. The container primitives agree across backends too: the CRC-32C check value and the magic are the same C routines either side |
| Modern CNA runtime services over WebAssembly | cna-ts/extensions/runtime | the browser harness reads platform, renderer selection and available renderers, and round-trips two by-value CNA_StringView routes |
| WebAssembly game lifecycle, device creation, Clear, Texture2D transfer, SpriteBatch and input snapshots | CNA-TS | test/wasm-browser.mjs drives the first vertical slice through the same public XNA classes the Node backend serves |

## EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Compiled-effect execution on the qualified renderer | current qualified backend | CNA capability bit reports compiled effects unavailable |
| ContentLost event delivery | current qualified backend | ABI 0.9 raises the event for real on the renderers whose API can lose a device (DirectX9, Direct2D, Skia); HEADLESS has no device to lose, so the producer never runs and the native suite asserts zero raises rather than pretending otherwise |
| GraphicsAdapter discovery, current display mode and windowed adapter capabilities | current qualified backend | HEADLESS artifact exposes no windowed adapter/display evidence |
| Physical GameWindow resize/orientation/screen-device event qualification | current qualified backend | event registrations are real and removable, but HEADLESS exposes no physical window or event stimulus |
| Texture3D and TextureCube resource execution on the qualified renderer | current qualified backend | both exact ABI-0.7 creation routes return CNA_RESULT_NOT_SUPPORTED under HEADLESS; no storage or transfer success is claimed |

## UPSTREAM_CNA_BLOCKED

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Handing a post-process pass to a chain with PostProcessChain.AddOwned | cna-ts/extensions/graphics | cna_post_process_chain_add_owned_pass consumes the handle without the RemoveOwnedGraphicsResourceFor its sibling _destroy performs, so the game's owned-graphics-resource counter never falls and every later cna_game_destroy in the process refuses with CNA_RESULT_INVALID_STATE; measured and written up in docs/upstream-cna-findings.md, characterised in its own process by test/post-process-owned-pass.probe.mjs |

## FIXTURE_PENDING

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| AudioEngine, AudioCategory, WaveBank, SoundBank and Cue authored success | qualification fixtures | native routes and invalid/missing-bank behavior verified; no legal redistributable XGS/XSB/XWB corpus |
| MediaLibrary albums/artists/genres/playlists and picture streams | qualification fixtures | strict shape exists but no deterministic populated media-library fixture |
| VideoPlayer.Play decode, duration and frame progression | qualification fixtures | native controls verified; no legal decode fixture qualified |

## HARDWARE_PENDING

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| GPU custom-effect and rendering output qualification | qualification hardware | typed bound/user/instanced draw routes now reach CNA, but the qualified HEADLESS pipeline returns result 12 and cannot prove visible output |
| Microphone enumeration/capture/buffer callbacks | qualification hardware | all routes imported; HEADLESS enumerates zero microphones |
| Physical keyboard/mouse/gamepad/touch behavior | qualification hardware | HEADLESS route execution is deterministic but not physical-device evidence |
| SoundEffect/MediaPlayer audible output | qualification hardware | NULL audio verifies state/lifetime only |

## PLATFORM_PENDING

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Android and iOS runtime | platform qualification | not attempted; no mobile artifact/toolchain evidence |
| Electron desktop runtime | platform qualification | not attempted and no windowed artifact |
| Windows and macOS Node/native runtime | platform qualification | no qualified artifact/job on either OS |

## UNIMPLEMENTED_CNA_TS

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| CNA compass, gyroscope and motion readings, haptics, joysticks, camera capture and the cursor/text input families | CNA-TS | the extended device layer and the accelerometer are projected and verified above; the compass, gyroscope and motion sensors report support but have no reading projection, and input_haptics.h, input_joystick.h, input_cursor.h, input_text.h and camera frame acquisition are measured and unprojected |
| CNB audio, media, curve and clip schemas, and the compilation front ends | CNA-TS | the container, the Texture2D schema, the SpriteFont schema and the model graph are projected and verified above; the remaining cnb.h families -- sound effects, songs, videos, curves, animation clips, the model's morph targets and per-slot texture arrays, the bounded byte cursor, the loader registry and the .cnj compile path -- are measured and unprojected |
| Direct standalone GraphicsDevice construction | CNA-TS | ABI 0.9 added cna_graphics_device_create/_destroy, so the owned-device lifetime exists upstream. The qualified HEADLESS artifact reports no graphics adapter, so GraphicsAdapter.DefaultAdapter has nothing to return and the XNA constructor has no argument to be given; implementing the route here would be unexercisable on any backend this session can build |
| GamerServices sign-in, achievements, leaderboards, avatars and the whole .Net session surface | CNA-TS | the dispatcher's lifetime and the Guide's state are projected and verified above; everything that needs a signed-in user, a friends list, a platform overlay or a peer -- sign-in, achievements, leaderboards, presence, avatars and every NetworkSession operation -- still refuses with GamerServicesNotAvailableException, because a fabricated gamer or peer would be worse than the exception XNA itself raises where the platform is absent |
| Modern CNA engine layer beyond the pipeline and its post-process chain: lighting, shadows, particles, decals, compute and clustered rendering | CNA-TS | the render pipeline and the post-process chain are projected and verified above; the rest of engine_layer.h -- clustered and cascaded lighting, shadow maps, particles, decals, LOD, compute and storage buffers, environment and atmospheric rendering -- is measured and unprojected |

## LANGUAGE_MAPPING_LIMITATION

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Arbitrary custom generic vertex value transfer | TypeScript language projection | four formally mapped XNA vertex structs have exact codecs; arbitrary JavaScript objects have no blittable CLR layout and are rejected explicitly |
| ContentReader.ReadRawObject<T>() without an explicit reader token | TypeScript language projection | JavaScript erases T, so reader identity cannot be recovered deterministically; explicit ContentTypeReader overloads are implemented and the strict verifier models the generic surface without fake CLR reflection |
| DrawUserIndexedPrimitives Int16[] versus Int32[] overload identity | TypeScript language projection | both CLR element types map to number[]; the deterministic public number[] route uses 32-bit indices rather than guessing from values |

## NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Windowed renderer behavior on Linux | selected environment | qualified artifact is HEADLESS |
