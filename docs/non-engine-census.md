# The non-engine headers, measured

Eleven headers used to carry one reason between them:

> the adapter imports nothing from this header, so the whole family is measured and deferred rather
> than partially covered

That describes **history, not architecture**, and it was doing real damage: it hid working
capabilities behind a sentence about what had not been done yet. This document replaces it. Every
row below was measured against `cnanext` at CNA C ABI **0.21.0** on 2026-09-01 — with pure-C probes
under `build-probe/cbind_*_probe.c` where a question was about the ABI, and through this package's
own public API where it was about what a consumer would see.

**Which build, exactly.** `cnanext` moved twice while this session ran, so a single revision would
be wrong for the whole document:

| Measurements | Library | Built from |
| --- | --- | --- |
| everything headless — the census tables below, the model graph, upstream findings 25 to 27 | `cmake-build-tsnext` | `e5ae0820e`, built 12:51 |
| everything windowed — effect reflection, volume and cube textures, the window resize event | `cmake-build-debug` | `c195fe8ce`, built 15:55 |

A third commit, `7712534d3`, landed at 16:11 — after both libraries were built, so nothing here was
measured against it. Both commits after `e5ae0820e` concern mutable *session* properties, a
family this session classified and deliberately did not bind, so no measurement below depends on
them. Neither library was rebuilt by this session: both belong to another agent's build directories
and are read-only here.

After it, **`INTENTIONALLY_DEFERRED` is zero**: every one of CNA's 4054 public routes has a purpose
and a reason that is about the route rather than about the calendar.

## What the census found

Three families were **not blocked at all** — CNA answers, and this package was reporting empty:

| Family | What was reported | What CNA actually does |
| --- | --- | --- |
| `MediaLibrary` | empty collections, `SavePicture` refuses | indexes the user's Music and Pictures folders; one WAV in `XDG_MUSIC_DIR` gives one song, one album, one artist |
| the clipboard | writable, not readable | reads round-trip exactly, non-ASCII included |
| attached input devices | nothing projected | one mouse and one keyboard, by the platform's own names |

A fourth was **almost** a fourth. `AvatarDescription.CreateRandom()` refused while CNA answers it
with no platform service — so it is projected now — but what CNA answers is not what the name
suggests, and getting that right took three measurements. See
[Avatar descriptions](#avatar-descriptions-the-answer-is-real-the-name-is-not).

Two families were **confirmed blocked**, with better reasons than before:

| Family | The old reason | The measured reason |
| --- | --- | --- |
| `NetworkSession` | no platform service | CNA creates Local **and** SystemLink sessions on this host. What it cannot do is produce a signed-in gamer, and the only route that makes one is CNA's hook for a *platform layer* to publish one. Calling it from the binding would be inventing the player. |
| CNA's XNB reader stack | the adapter imports nothing | a parallel decoder for a format this package already decodes; adopting it needs the native `ContentManager` that would be a second asset cache |

## Header by header

### `media_library.h` — 146 routes, adopted

Bound: the library, its five music collections, both picture collections, album art, picture pixels,
`SavePicture` and token lookup. See the `MediaLibrary` entry in `docs/runtime-capabilities.md`.

Deferred, with reasons rather than a blanket:

- `*_get_hash_code`, `*_get_type_name`, `*_equals` → **MANAGED_BY_DESIGN**. `GetHashCode` and
  `Equals` are implemented over the identity this binding assigns — a song's file path, an album's
  name — and routing them through native would make two objects that are the same media item hash
  differently depending on which side answered.
- `*_dispose`, `*_destroy`, `*_get_is_disposed` → the handles never leave the bridge. The snapshot
  walks CNA's whole graph in one call and hands JavaScript copied values, so a consumer owns
  nothing. That also settles an ownership split CNA's own headers describe two ways: a song out of
  a collection is "a new handle" to release, an album out of one is "borrowed" and must not be.

**A measured property worth knowing:** CNA generates no separate thumbnail. `GetThumbnail()`
returns the same bytes as `GetAlbumArt()`, and CNA's header calls that canonical behaviour rather
than a limitation. The test asserts it, so a CNA that starts generating one is noticed.

### `input_devices.h` — 46 routes

Bound: the clipboard's reads and its ungated write, the mouse/keyboard/touch inventory, and
`cna_power_get_info`. None of these is gated on CNA's extended device layer, which is exactly what
makes them worth having — measured on a CNA built `CNA_DEVICES=OFF`, the power route reports a real
79% battery while all three `cna_power_get_*_ext` routes answer `NOT_SUPPORTED`.

Deferred: the sensor enumeration (reached through `sensors.h` instead), the POD initialisers and
comparators (the binding hands JavaScript objects across, not C structs), and the hot-plug
subscribe/raise plumbing — whose only consumer would be the polling the inventory already provides.

### `content.h` and `content_readers.h` — 94 routes

The architecture decision is written up in `docs/native-content-survey.md`. Loading stays managed;
the survey is adopted.

### `graphics_resource.h` — 12 routes, all working, none bound

Measured on a real `Texture2D` handle: `set_name` succeeds, the name reads back, `is_disposed`
answers, and `get_graphics_device` returns the device the texture was made on. They are not bound
because this package's `GraphicsResource` state is authoritative and in TypeScript, so binding them
would give one resource two `Name`s and two `Tag`s with nothing to reconcile them — and XNA's `Tag`
is a managed object of any type where CNA's is a `uint64`, so the two cannot even hold the same
value. Deferred for that, not for want of a working route.

### `runtime_components.h` — 39 routes

CNA's header states that **a game owns exactly one component collection**. Binding these would put
a second collection on the same game and make `Game.Components.Count` and
`cna_game_components_get_count` two counts of one thing. Adopting CNA's instead is not an
alternative either: a component is a class the consumer subclasses in TypeScript and CNA's takes C
callbacks, so every `Update` and `Draw` would cross the boundary twice and the ordering semantics
would move to CNA — for no capability the managed collection lacks, which its unit suite already
covers over ordering, mutation, filtering, services and disposal.

### `input_keyboard.h` — 17 routes

`cna_keyboard_get_state_for_player` returns a **bit-identical** snapshot to the plain route —
measured, not assumed, and CNA's header says why: there is one keyboard and every slot reports it.
The only thing the overload adds is refusing an out-of-range slot, which XNA does not do. The
`KeyboardState` value routes are managed by design, for the reason the math types are. The scancode
and key-name translations are CNA extensions with no XNA counterpart.

### `net.h` — 50 routes, managed by design

`PacketReader`, `PacketWriter`, `NetworkSessionProperties` and `QualityOfService` are value types
with no network in them, and all four are implemented here exactly — the packet types extend this
package's own `BinaryReader`/`BinaryWriter`, and the property bag is XNA's eight slots where `null`
means "do not match". Nothing in this header is blocked by the absence of a network.

### `net_sessions.h` and `net_gamers.h` — 136 routes, blocked

Not by CNA. A session is created successfully on this host, both `Local` and `SystemLink`, and
reports its state and that it is the host. It is blocked by what a session needs first: at least one
signed-in gamer. This host has none, and the only route that produces one —
`cna_signed_in_gamer_create_ext` — is described by CNA's own header as the hook for a *platform
layer* to publish a gamer. A binding calling it would be inventing the player, and every session
claim built on that would be false. The strict surface keeps refusing with
`GamerServicesNotAvailableException`, which is what XNA raises where there is no service.

A synthetic-gamer *test hook*, in the style of the existing `CnaCamera.OpenForTests`, is the one
honest way this could become locally exercisable. It is recorded as a possibility, not done.

### Avatar descriptions: the answer is real, the name is not

`AvatarDescription.CreateRandom()` refused here, and `cna_avatar_description_create_random`
succeeds with no gamer, no sign-in and no service. So it is projected — along with the byte
constructor, which used to accept any length and report a body type it had invented.

What it returns is the part worth writing down: **1021 zero bytes, identical every call, with
`IsValid` false, and the `bodyType` overload validates its argument and then ignores it.** That is
not a CNA stub. CNA's own source says so:

```cpp
// Despite the name, the real XNA implementation never actually randomizes anything -
// always an all-zero (invalid) description. Preserved exactly, not "fixed."
```

So the honest projection is the one that hands back the zeros, and
`test/avatar-description.integration.mjs` asserts them — including that both body types produce the
same bytes, so a projection that quietly started honouring the argument would fail.

Getting there took three readings. The first said "two random descriptions differ" and was a
`memcmp` past the end of a 512-byte buffer holding 1021 bytes. The second read the body type and
height out of a struct in the same `printf` that filled it. Only the third, strictly sequenced, said
what is above. **Nothing was filed from the first two**, which is the only reason this section
describes CNA's behaviour rather than a defect that was never there.

### `sprite_font.h` — 9 routes, four of them an oracle

CNA can build a `SpriteFont` from a texture and a glyph table — the same data this package's XNB
reader produces — and measure a string with it. Four routes are imported for exactly that, as
**tooling**: `MeasureString` is already projected in TypeScript and this adds nothing public. What
it adds is a second implementation of one predicate, sharing no code with the first.

It earned its place on the first run. Over twenty-four strings the two agree eighteen times and
differ five, always by exactly one glyph's right side bearing and only when the widest line *ends*
in a glyph whose bearing is negative. Which is right was settled by disassembling
`Microsoft.Xna.Framework.Graphics.dll`: `SpriteFont::InternalMeasure` carries the bearing forward
and adds `Math.Max(pending, 0)` at each line break and once after the loop, so this package matches
XNA and CNA does not. That is upstream finding 27, and the divergences are asserted exactly so a
repaired CNA fails them.

The other five routes set the line spacing, spacing and default character on CNA's font, or copy
its characters and glyphs back out. Each addresses state this package's own `SpriteFont` owns and
answers from, so binding them would give one font two line spacings.

### `effects.h` — the capability that was hiding behind a false floor

`Effect.Parameters` was built **empty** for every natively reflected effect. The code said
`Parameters: []` and nothing pointed at it as a gap, because the obvious check agrees: a stock
effect's native parameter collection really is empty. `cna_basic_effect_create` followed by
`cna_effect_get_parameters` answers **count 0** — on the headless build and on the windowed one
alike. So the whole `effect_parameter` and `effect_annotation` surface looked like a container CNA
offers and never fills.

The measurement that broke that reading is one line of `effects.h`: compiled-effect support "is a
renderer property, not a property of this ABI". Asked of the running binary rather than inferred
from the renderer's name:

| Build | `CNA_GRAPHICS_CAPABILITY_COMPILED_EFFECTS` | `cna_effect_create_compiled` |
| --- | --- | --- |
| headless (`cmake-build-tsnext`) | false | result 6, refused |
| windowed OPENGLES3 (`cmake-build-debug`) | **true** | **succeeds** |

And on the windowed build the reflection is real. XNA's own `BasicEffect.fxb` gives twenty-three
parameters with their names, classes, types and dimensions — `World` as a 4×4 matrix of singles,
`Texture` as an Object of type Texture2D, `VSIndices` and `PSIndices` as 32-element arrays,
`DiffuseColor` as a float4 rather than the float3 a guess would have written. `CnaConformanceEffect.fxb`
gives its own six, which is what proves the reflection comes from the effect that was loaded.

So a consumer who loaded a compiled effect on a renderer that could run it got a shader it could
draw with and **not one uniform it could set**. That is now bound, and `SetValue` writes through:
the test sets a `Matrix`, a `Vector4` and a scalar and then reads each back through
`cna_effect_parameter_get_value`, because `GetValue*` answers from managed state and would have
passed either way. A value shape CNA's tagged API cannot carry is refused by name rather than
stored managed and silently dropped — a `SetValue` that returns normally and never reaches the
shader is the worst of the available failures.

Technique and pass annotations were the same empty projection and are reflected now too. Stock
effects keep their managed state: CNA offers no reflected state for them to be authoritative over,
which the test asserts as a control so the split is checked rather than assumed.

**What this cost to find:** the census had already classified `effects.h` under a reason that was
true of every route it named — "further overloads, accessors and finer-grained spellings of surface
the binding covers". It was true of the stock getters and wrong about forty-five routes, and the
thing that exposed it was refusing to accept a *plausible* explanation for `Parameters: []` without
measuring the renderer it depended on.

### Three more claims that generalised from one backend

`effects.h` was not an isolated mistake. The reason it was wrong — a capability measured on the
headless build and then stated about "the current qualified backend" — was a *shape*, and the
capability inventory had three more of it. All three were checked against the windowed OPENGLES3
build that `test:windowed` already qualifies, and all three were too broad:

| The claim that stood | What the windowed build does |
| --- | --- |
| "both exact creation routes return `CNA_RESULT_NOT_SUPPORTED` under HEADLESS; no storage or transfer success is claimed" | creates a 4×4×4 `Texture3D` and an 8-wide `TextureCube`, and the volume round-trips two different texels |
| "`HEADLESS` artifact exposes no windowed adapter/display evidence" | already superseded by a later entry that binds all fourteen adapter routes; the stale one was a duplicate and is removed |
| "event registrations are real and removable, but `HEADLESS` exposes no physical window or event stimulus" | `ApplyChanges` after changing the preferred back buffer resizes 320×240 → 512×384 and `ClientSizeChanged` fires once with the new bounds |

Each is now a test rather than a sentence, so a regression fails instead of quietly making the
document true again. The window case asserts the *negative* too: unsubscribing and resizing again to
400×300 delivers no second event while the resize still happens, which is what separates removal
from a resize that never occurred.

What did **not** move: `ContentLost`. CNA raises it on the renderers whose API can lose a device —
DirectX9, Direct2D, Skia — and OPENGLES3 is not one of them, so there is still no stimulus here and
the claim stands as written. Orientation and screen-device changes likewise: this host has one
display and does not rotate.

The lesson is worth stating plainly, because it cost two rounds to learn: **"the qualified backend"
is not one thing.** This repository qualifies a headless build and a windowed build, and a
capability that is a renderer property has to be asked of each. Four entries said "current qualified
backend" and meant "the headless one".

## Mutation evidence for the two new families

Eleven planted defects were run against the media-library and avatar suites. **Eight fail.** The
three that survive are recorded with what makes each one unobservable rather than left as a number:

| Planted defect | Suite | Verdict |
| --- | --- | --- |
| a picture's width is reported as its height | media-library | KILLED (the fixture PNG is 2x1, on purpose) |
| the media source name is answered as an empty string | media-library | KILLED |
| album art is fetched as the thumbnail instead | media-library | **EQUIVALENT** |
| validity is reported inverted | avatars | KILLED |
| the description bytes are never copied out | avatars | KILLED |
| the constructor keeps its invented defaults instead of reading the bytes | avatars | KILLED |
| an out-of-range body type is accepted | avatars | KILLED |
| `Description` hands back its own array rather than a copy | avatars | KILLED |
| the body type is reported as the height | avatars | **FIXTURE-LIMITED** |
| the description handle is never released on the success path | avatars | **UNOBSERVABLE** |
| the requested body type never reaches CNA | avatars | **VACUOUS** |

- **Equivalent.** CNA generates no separate thumbnail, so the two routes return the same bytes by
  design. No predicate can separate them, which is the property the suite asserts directly instead.
- **Fixture-limited.** `BodyType` and `Height` are both zero in every description obtainable here,
  because every obtainable description is all-zero. Separating them needs a *valid* description,
  which needs a signed-in gamer. Fabricating one is the thing this session refused to do.
- **Unobservable.** Dropping the success-path `cna_avatar_description_destroy` leaks one handle per
  call. CNA exposes no live-object or handle count -- checked, not assumed -- and `verify:leaks` is
  an API-surface gate, not a memory one. There is no predicate to write.
- **Vacuous.** The baseline deliberately never sends the body type to CNA, for the reason written in
  `CreateRandom`: CNA's overload checks the argument and drops it, so sending it would import a
  second route that cannot change the answer. There was no behaviour to remove.

### The harness scored a run that never executed

The first media-library run reported `MUTATIONS=3 KILLED=0`, and that result was **wrong**. The
picture mutant swaps width for height against a deliberately 2x1 PNG, and the suite asserts the pair
exactly; it cannot survive. Re-running it under a harness that parses the TAP summary and refuses a
verdict when `pass + fail == 0` killed it immediately, and killed the source-name mutant too.

The harness now also refuses an anchor that does not match exactly once -- which is how the
source-name mutation was caught patching the wrong call site, reported as `ANCHOR x2` rather than
scored. A mutation run that cannot prove the test executed against the mutated artifact is not
evidence, and the number it prints is worse than no number at all.

## The method that mattered

Three readings in this census were **wrong on the first measurement**, and both were caught before
anything was written down:

- the media library's collection getters appeared to return `SUCCESS` with the invalid handle;
- an avatar description appeared to report zero bytes while declaring 1021;
- two "random" avatar descriptions appeared to differ, when in fact all 1021 bytes of both are zero.

Three, counting the avatar reading above. All were defects in the *probe*, not in CNA, and two of
them were the same one: C leaves argument evaluation order unspecified, and reading an
out-parameter inside the same call expression that fills it measures the value from before the
call. The third was a `memcmp` reading past the end of a buffer. Sequencing the calls and sizing
the buffers turned all three into ordinary correct answers.

The rule that saved them is the one this package already follows: measure, then predict from
something independent, and never file a finding from a single reading of a program you wrote five
minutes ago.
