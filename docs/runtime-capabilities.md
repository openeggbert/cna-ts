# Runtime capability and blocker inventory

Profile: **XNA 4.0 Windows runtime**

Selected evidence environment: **Linux x86-64 Node, CNA ABI 0.7.0, HEADLESS renderer, NULL audio**

Each row is a reviewed operation family; overloads with the same implementation and evidence share a row.
This inventory is independent of the strict API verifier: API shape completeness does not imply runtime capability.

## Explicit failure-site audit

All selected-profile framework files containing explicit NativeUnavailableError or NotSupportedException construction were reviewed into the operation families below. Internal construction guards share their public operation family.

- NativeUnavailableError construction sites: 74
- NotSupportedException construction sites: 2
- Framework files containing those sites: 28

## Counts

| Category | Operation families |
| --- | ---: |
| VERIFIED_MANAGED | 18 |
| VERIFIED_NATIVE | 14 |
| EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND | 2 |
| UPSTREAM_CNA_BLOCKED | 5 |
| FIXTURE_PENDING | 3 |
| HARDWARE_PENDING | 4 |
| PLATFORM_PENDING | 3 |
| UNIMPLEMENTED_CNA_TS | 12 |
| NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT | 1 |

## VERIFIED_MANAGED

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Audio enums, listener/emitter values and SoundEffect duration/size arithmetic | CNA-TS | 47 deterministic XNA differential observations |
| BlendState, DepthStencilState, RasterizerState and SamplerState managed values/presets | CNA-TS | graphics-foundation unit suite verifies snapshots, defaults and disposal |
| Content cache, failure cleanup, Unload and Dispose | CNA-TS | content and content-xnb lifecycle tests including failed nested construction |
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

## VERIFIED_NATIVE

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| CNA renderer identity and capability query extension | CNA-TS + CNA | qualified artifact reports HEADLESS/custom-effects/compiled-effects capability bits |
| DynamicSoundEffectInstance submit, pending buffers and managed refill pump | CNA-TS + CNA | qualified native integration with reentrant/self-removing/throwing callback tests |
| FrameworkDispatcher.Update canonical native pump | CNA-TS + CNA | native lifecycle and dynamic/media pump integration |
| Game create, callbacks, one-frame/run/exit/destroy lifecycle | CNA-TS + CNA | qualified ABI-0.7 integration covers seven real game lifetimes and 60/600 frames |
| GraphicsDevice.Clear and Present | CNA-TS + CNA | 60/600-frame qualified native integration |
| GraphicsDeviceManager create/configure/apply and callback-scoped device borrowing | CNA-TS + CNA | qualified native integration and ownership tests |
| Keyboard, Mouse, GamePad and Touch polling routes | CNA-TS + CNA | qualified HEADLESS native integration; physical device behavior is separate |
| MediaPlayer source/song creation, queue controls, position and visualization | CNA-TS + CNA | generated legal silent WAV under qualified NULL-audio integration |
| SoundEffect PCM creation, instances, controls, Apply3D and disposal | CNA-TS + CNA | qualified NULL-audio integration; no audibility claim |
| SpriteBatch create, Begin, Draw/DrawString submission, End and destroy | CNA-TS + CNA | qualified native integration and template 60/600 frames |
| StorageDevice selector, StorageContainer and stream CRUD | CNA-TS + CNA | qualified native integration in isolated XDG storage |
| Texture2D create, Color transfer, regions/mips, FromStream and PNG encoding | CNA-TS + CNA | qualified native integration with deterministic pixel checks |
| VertexDeclaration, VertexBuffer and IndexBuffer resource construction/readback used by Model XNB | CNA-TS + CNA | qualified native Model reader integration |
| VideoPlayer construction and control/cached-property state without decoded frames | CNA-TS + CNA | qualified native control-state integration |

## EXPLICITLY_UNAVAILABLE_WITH_CURRENT_BACKEND

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Compiled-effect execution on the qualified renderer | current qualified backend | CNA capability bit reports compiled effects unavailable |
| GraphicsAdapter discovery, current display mode and windowed adapter capabilities | current qualified backend | HEADLESS artifact exposes no windowed adapter/display evidence |

## UPSTREAM_CNA_BLOCKED

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Browser/Wasm CNA runtime | CNA artifact packaging | no provenance-verifiable C-ABI ESM/Wasm artifact exists |
| ContentManager default XNB stream acquisition | CNA C ABI | managed XNB parsing is verified through protected OpenStream providers, but the audited C ABI exposes no general asset-byte stream route; host filesystem behavior is not substituted |
| EffectPass.Apply and XNA compiled/stock-effect execution | CNA C ABI | no audited C ABI route with XNA compiled-effect semantics and ownership |
| Model.Draw faithful effect/pass/indexed rendering pipeline | CNA C ABI | required XNA-compatible effect application and draw orchestration are not representable by the qualified slice |
| VideoPlayer.GetTexture transient frame projection | CNA C ABI | CNA returns a player-owned transient texture; no borrowed-frame lifetime contract can be projected safely |

## FIXTURE_PENDING

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| AudioEngine, AudioCategory, WaveBank, SoundBank and Cue authored success | qualification fixtures | native routes and invalid/missing-bank behavior verified; no legal redistributable XGS/XSB/XWB corpus |
| MediaLibrary albums/artists/genres/playlists and picture streams | qualification fixtures | strict shape exists but no deterministic populated media-library fixture |
| VideoPlayer.Play decode, duration and frame progression | qualification fixtures | native controls verified; no legal decode fixture qualified |

## HARDWARE_PENDING

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| GPU custom-effect and rendering output qualification | qualification hardware | qualified artifact is HEADLESS |
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
| ContentReader.ReadRawObject without an explicit reader token | TypeScript language projection | erased JavaScript generics cannot select a reader at runtime; explicit-reader ReadRawObject overloads remain available and fake CLR reflection is rejected |
| Direct GraphicsDevice construction and device status | CNA-TS | manager-owned callback-scoped device creation is verified; standalone-device and status routes are not imported |
| DynamicVertexBuffer and DynamicIndexBuffer create/SetData/content-lost behavior | CNA-TS | strict members fail explicitly pending typed dynamic-buffer routes |
| GameWindow.Handle, resize/orientation/screen-device events | CNA-TS | native window/event routes are not imported |
| GraphicsDevice DrawPrimitives/DrawIndexedPrimitives/DrawUser/instancing | CNA-TS | no typed CNA-TS bridge routes are imported |
| GraphicsDevice state binding routes and render-target binding | CNA-TS | strict setters fail explicitly; corresponding broader CNA C API routes require an audited import slice |
| OcclusionQuery Begin/End/result | CNA-TS | strict operations fail explicitly pending query routes |
| RenderTarget2D and RenderTargetCube construction/properties | CNA-TS | strict constructors fail explicitly pending audited render-target routes |
| SpriteBatch explicit render states, Effect and transform Begin overloads | CNA-TS | default Begin and strict validation are verified; state/effect descriptors are not in the imported bridge slice |
| Texture3D and TextureCube construction/data transfer | CNA-TS | strict constructors fail explicitly pending typed transfer routes |
| TitleContainer.OpenStream title-storage route | CNA-TS | strict operation fails explicitly; host filesystem access is not exposed as a substitute |
| VertexBuffer/IndexBuffer arbitrary public generic value transfer | CNA-TS | built-in Model raw transfer is verified; arbitrary value codecs remain explicit |

## NOT_APPLICABLE_TO_SELECTED_ENVIRONMENT

| Operation family | Owner/boundary | Evidence |
| --- | --- | --- |
| Windowed renderer behavior on Linux | selected environment | qualified artifact is HEADLESS |
