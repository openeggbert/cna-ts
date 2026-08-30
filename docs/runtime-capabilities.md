# Runtime capability and blocker inventory

Profile: **XNA 4.0 Windows runtime**

Selected evidence environment: **Linux x86-64 Node with CNA ABI 0.20.0 HEADLESS renderer and NULL audio, plus headless Chromium with the CNA ABI 0.20.0 WEBGL2 WebAssembly artifact**

Each row is a reviewed operation family; overloads with the same implementation and evidence share a row.
This inventory is independent of the strict API verifier: API shape completeness does not imply runtime capability.

## Explicit failure-site audit

All selected-profile framework files containing explicit NativeUnavailableError or NotSupportedException construction were reviewed into the operation families below. Internal construction guards share their public operation family.

- NativeUnavailableError construction sites: 62
- NotSupportedException construction sites: 6
- Framework files containing those sites: 23

## Counts

| Category | Operation families |
| --- | ---: |
| VERIFIED_MANAGED | 19 |
| VERIFIED_NATIVE | 33 |
| VERIFIED_WEBASSEMBLY | 3 |
| EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND | 4 |
| UPSTREAM_CNA_BLOCKED | 0 |
| FIXTURE_PENDING | 3 |
| HARDWARE_PENDING | 4 |
| PLATFORM_PENDING | 3 |
| UNIMPLEMENTED_CNA_TS | 8 |
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
| Compiled Effect creation binding route | CNA-TS + CNA | exact byte payload reaches cna_effect_create_compiled with compiler-verified ABI; three legal conformance-FXB attempts deterministically return the qualified HEADLESS result 6 with invalid output and no shader-execution claim |
| DynamicSoundEffectInstance submit, pending buffers and managed refill pump | CNA-TS + CNA | qualified native integration with reentrant/self-removing/throwing callback tests |
| DynamicVertexBuffer and DynamicIndexBuffer creation, typed transfer, readback and IsContentLost query | CNA-TS + CNA | qualified integration covers Discard/NoOverwrite, built-in vertex and 16-bit index round trips, double disposal and parent shutdown |
| Effect and EffectPass ABI-0.7 apply dispatch with native technique/pass reflection identity | CNA-TS + CNA | qualified integration executes cna_effect_apply and cna_effect_pass_apply on effect-owned stock passes; managed/native ownership tests retain the parent, destroy owned views, reject disposed parents and expose no raw handles |
| Extended graphics layer availability probe | cna-ts/extensions/runtime | cna_graphics_ext_is_available answers true on a CNA_CNAEXT=ON build and false on the WEBGL2 artifact, so structural presence is never reported as availability |
| FrameworkDispatcher.Update canonical native pump | CNA-TS + CNA | native lifecycle and dynamic/media pump integration |
| Game create, callbacks, one-frame/run/exit/destroy lifecycle | CNA-TS + CNA | qualified ABI-0.7 integration covers seven real game lifetimes and 60/600 frames |
| GameWindow stable facade, borrowed handle/state and removable event registrations | CNA-TS + CNA | qualified integration verifies stable Game.Window identity, zero HEADLESS handle, title/state queries, callback registration cleanup and repeated game lifetimes |
| GraphicsDevice bound, indexed, instanced and four-codec user draw dispatch | CNA-TS + CNA | 360-symbol bridge dispatch and argument layouts are signature-audited; qualified HEADLESS calls reach CNA; no visible-output claim |
| GraphicsDevice copied state, scalar state, sampler/texture, buffer and render-target binding routes | CNA-TS + CNA | qualified ABI-0.7 integration verifies successful assignment, null/unbind, stable read-after-write facade identity and render-target state; managed suite covers bounds, disposed, duplicate, wrong-device and rollback validation |
| GraphicsDevice status query | CNA-TS + CNA | qualified HEADLESS device reports the canonical Normal status through cna_graphics_device_get_status |
| GraphicsDevice.Clear and Present | CNA-TS + CNA | 60/600-frame qualified native integration |
| GraphicsDeviceManager create/configure/apply and callback-scoped device borrowing | CNA-TS + CNA | qualified native integration and ownership tests |
| Keyboard, Mouse, GamePad and Touch polling routes | CNA-TS + CNA | qualified HEADLESS native integration; physical device behavior is separate |
| MediaPlayer source/song creation, queue controls, position and visualization | CNA-TS + CNA | generated legal silent WAV under qualified NULL-audio integration |
| Model.Draw effect/pass/indexed-draw pipeline | CNA-TS + CNA | qualified HEADLESS Model XNB executes buffer/index binding, BasicEffect matrices, real EffectPass.Apply and DrawIndexedPrimitives without a special native model renderer |
| Modern CNA platform identity, renderer selection and runtime log | cna-ts/extensions/runtime | nine native integration assertions over 37 handle-free routes, including the pre-latch and non-desktop refusals CNA reports as state |
| OcclusionQuery construction, ordering, reuse, completion/result dispatch and disposal | CNA-TS + CNA | qualified integration executes the real query state machine without fabricating PixelCount; managed suite covers completion and exact result identity |
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

## VERIFIED_WEBASSEMBLY

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Browser/Wasm CNA runtime | CNA-TS | 60 and 600 real frames of the public XNA Game/GraphicsDeviceManager/Texture2D/SpriteBatch path in headless Chromium on a WebGL2 context, ABI 0.20.0, no uncaught page error |
| Modern CNA runtime services over WebAssembly | cna-ts/extensions/runtime | the browser harness reads platform, renderer selection and available renderers, and round-trips two by-value CNA_StringView routes |
| WebAssembly game lifecycle, device creation, Clear, Texture2D transfer, SpriteBatch and input snapshots | CNA-TS | test/wasm-browser.mjs drives the first vertical slice through the same public XNA classes the Node backend serves |

## EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Compiled-effect execution on the qualified renderer | current qualified backend | CNA capability bit reports compiled effects unavailable |
| GraphicsAdapter discovery, current display mode and windowed adapter capabilities | current qualified backend | HEADLESS artifact exposes no windowed adapter/display evidence |
| Physical GameWindow resize/orientation/screen-device event qualification | current qualified backend | event registrations are real and removable, but HEADLESS exposes no physical window or event stimulus |
| Texture3D and TextureCube resource execution on the qualified renderer | current qualified backend | both exact ABI-0.7 creation routes return CNA_RESULT_NOT_SUPPORTED under HEADLESS; no storage or transfer success is claimed |

## UPSTREAM_CNA_BLOCKED

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |

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
| Direct standalone GraphicsDevice construction | CNA-TS | ABI 0.9 added cna_graphics_device_create/_destroy, so the owned-device lifetime the projection needs now exists upstream; CNA-TS still projects only the game-owned borrowed device |
| Dynamic buffer ContentLost event signaling | CNA-TS | cna_vertex_buffer_subscribe_content_lost and cna_index_buffer_subscribe_content_lost exist and ABI 0.9 states the event is raised for real on renderers whose API can lose a device; CNA-TS imports neither |
| Microsoft.Xna.Framework.GamerServices and .Net profiles | CNA-TS | docs/xna-profile-inventory.md measures the complete remaining XNA 4.0 runtime gap as 74 types; 436 backing C routes exist and none is imported |
| Modern CNA binary content: .cnb container, schemas and compilation front ends | CNA-TS | 272 cnb.h routes are classified as extension backing and none is projected yet |
| Modern CNA device and sensor extensions | CNA-TS | devices.h, sensors.h and the haptics/joystick/cursor/text input families are classified as extension backing and none is projected yet |
| Modern CNA engine layer: PBR materials, render pipeline, post-process, lighting and shadows | CNA-TS | 857 engine_layer.h routes are classified as extension backing in docs/cna-api-coverage.md and none is projected yet |
| RenderTarget ContentLost event signaling | CNA-TS | ABI 0.9 added cna_render_target_subscribe_content_lost and its registration handle, and made the flag clear again on binding; CNA-TS imports neither route |
| VideoPlayer.GetTexture transient frame projection | CNA-TS | ABI 0.9 added cna_video_player_get_frame_ext with CNA_VideoFrameEXT and a monotonic frame generation, which is the borrowed-frame identity the projection was missing; CNA-TS has not adopted it |

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
