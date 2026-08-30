# CNA-TS

`cna-ts` is the single canonical TypeScript and JavaScript binding for
[CNA](https://github.com/openeggbert/cna). TypeScript source is the only implementation source;
the package build emits the JavaScript used by both languages and the declarations used by
TypeScript.

> Status: the complete XNA 4.0 **runtime** surface is projected and verified. Two strict profiles
> hold at zero differences — the seven-assembly Windows runtime (257 reference types, 2,964 members)
> and the GamerServices/Net/Avatar set (74 types, 676 members) — which together with the Xbox 360
> contract is 331 of 331 runtime types, with zero missing members, signature mismatches,
> runtime-symbol differences, internal leaks or allowlist entries. What is deliberately not
> projected is the 128-type content pipeline, which runs in the content build rather than in a game.
>
> Two real backends run the same public API. An opt-in Node-API bridge executes CNA C ABI 0.20.0 on
> Linux HEADLESS with NULL audio through 581 imported routes, and against a windowed OPENGLES3
> library under Xvfb it draws real pixels — a render target cleared through the public API reads
> back exactly; a WebAssembly backend runs the same
> `Game`, `GraphicsDeviceManager`, `Texture2D` and `SpriteBatch` for 60 and 600 real frames in a
> browser on a WebGL2 context. No native binary and no CNA library is bundled, and without an
> explicitly loaded backend native operations fail rather than simulating execution.
>
> Gamer services and networking are declaration-complete and refuse at runtime with
> `GamerServicesNotAvailableException`, the exception XNA itself raises where the platform is
> absent. Modern CNA surface outside XNA lives under `cna-ts/extensions`: `extensions/runtime`
> carries platform identity, renderer selection and the runtime log, verified on both backends;
> `extensions/graphics` carries the PBR material, the render pipeline and its frame statistics, and
> the post-process chain — bloom, tonemapping, FXAA, SSAO and screen-space reflections — verified
> against a build with CNA's extended graphics layer compiled in and reporting the truthful
> not-supported branch where it is not; and `extensions/content` reads `.cnb`, CNA's own compiled
> content format, ending in an ordinary `Texture2D` or `SpriteFont`; and `extensions/devices`
> reports the host itself — cores, memory, power, display safe area, locales, clipboard and
> cameras — which XNA had no way to ask about at all, with `extensions/sensors` beside it for the
> accelerometer and what the platform says about the rest.

## One package for both languages

JavaScript consumers do not need TypeScript in their application:

```js
import { Color, Game, Input, Vector2 } from "cna-ts";

const position = new Vector2(100, 100);
const clearColor = Color.CornflowerBlue;
const keys = new Input.KeyboardState([Input.Keys.Space]);
```

TypeScript consumers use the same imports and the same generated JavaScript:

```ts
import { Color, Game, Vector2 } from "cna-ts";
```

The strict XNA projection is also available from `cna-ts/xna`. CNA-specific functionality is
isolated under `cna-ts/extensions`, while backend status is exposed by `cna-ts/runtime`. Internal
backend modules are not package exports.

## Opt-in Node CNA runtime

The source distribution includes `native/cna_node_bridge.c` and a build helper. Build the adapter
against a CNA ABI 0.20 header checkout and Node 20+ headers, then load an explicit compatible
shared library:

```bash
CNA_SOURCE_PATH=/path/to/cna npm run build:native-bridge
```

```ts
import { LoadNodeNativeBackend } from "cna-ts/runtime";

await LoadNodeNativeBackend({
  CnaLibrary: "/absolute/path/to/libcna_c_api.so",
  BridgeModule: "/absolute/path/to/cna_node_bridge.node",
});
```

The adapter enforces the ABI 0.20 window and uses exactly 581 audited symbols. Every one of them
has its declared function-pointer type checked against the canonical headers under
`-Wall -Wextra -Werror`, so a route whose signature moves is a build failure rather than a runtime
surprise. Current native evidence
covers game lifecycle, graphics manager/device borrowing, clear/present, Texture2D Color
upload/readback/regions/mips, PNG `FromStream` and encoding, public SpriteBatch drawing,
SpriteFont XNB/DrawString, model XNB resource construction, static/dynamic vertex/index buffers,
state/texture/buffer/render-target binding, RenderTarget2D/RenderTargetCube, advanced and
Effect-bearing SpriteBatch Begin,
OcclusionQuery lifecycle, title-storage reads, stable GameWindow state and event registrations, renderer
capabilities, keyboard/mouse/gamepad/touch polling, PCM SoundEffect and dynamic buffers,
MediaPlayer with a generated silent WAV, VideoPlayer control state, and isolated Storage CRUD.
HEADLESS reports no microphones. No redistributable XACT or video fixture was available, and CNA's
player-owned video frame texture cannot yet be projected safely, so authored-bank playback and
video decode/`GetTexture` remain explicit boundaries. This HEADLESS artifact constructs and applies
all five stock effects, executes effect-owned `EffectPass.Apply`, `Model.Draw`, and Effect-bearing
SpriteBatch Begin. The compiled-Effect creation route is bound, but legal FXB input returns the
backend's documented result 6 because this renderer reports no compiled-effects capability; no
compiled shader or visible-output claim is made. Texture3D/Cube creation is also explicitly unsupported by this artifact even
though its exact ABI binding and Color codecs are implemented. Linux HEADLESS evidence is not a Windows, visible-GPU,
Electron, browser, or mobile support claim.

## CNB, beside XNB

`.cnb` is CNA's own compiled content format. It is not `.xnb` and this package does not pretend
otherwise: XNB is Microsoft's, `ContentManager.Load` reads it, and CNB lives on its own subpath
because it carries asset types XNA never had and containers that are checksummed, versioned and
self-describing in ways XNB is not.

```ts
import { CnbDocument, CreateTexture2DFromCnb } from "cna-ts/extensions/content";

const document = CnbDocument.Parse(bytes, "Textures/Atlas.cnb");
try {
  const atlas = CreateTexture2DFromCnb(GraphicsDevice, document);
} finally {
  document.Dispose();
}
```

A parsed document is a container that is already structurally sound — magic, versions, both
structural checksums, every chunk checksum, alignment, table-of-contents ordering and exact
non-overlapping coverage are all applied before an accessor hands out a byte. What it exposes is a
copied immutable view: the table of contents, the `CMET` metadata, the `XREF` external references
and any chunk's logical bytes. `CreateTexture2DFromCnb` and `CreateSpriteFontFromCnb` turn a
document into ordinary owned XNA resources; `CnbTextureData` and `CnbSpriteFontData` also encode,
so a Node build script can compile content as well as read it.

The three objects that own native memory — the document and the two decoded descriptions — are
explicit `Dispose()`. Everything else is copied, because a small payload is safer as a JavaScript
copy than as a view into memory a `Dispose()` can take away.

XNB framing, reader tables/versions, shared resources, disposal tracking, and custom reader
dispatch are implemented in TypeScript. Windows XNB v5 supports uncompressed streams and the XNA
LZX frame/block wrapper, including persistent multi-frame decoding and exact decompressed-length
validation. External references resolve relative to the referring asset, reuse the normalized
ContentManager cache, detect cycles, and retain ordinary unload ownership; referenced assets may
themselves be compressed or contain shared resources. Consumers register TypeScript custom readers
through `RegisterContentTypeReader` from `cna-ts/extensions`. Raw PNG/JPEG bytes go through
`Texture2D.FromStream`, never `Content.Load`.

## Compatibility scope

The completed strict target is an **XNA 4.0 TypeScript/JavaScript API projection** for the
seven-assembly Windows runtime profile. It is not a claim that C# source compiles unchanged as TypeScript. The
language transformations are normative in
[`docs/xna-typescript-mapping.md`](docs/xna-typescript-mapping.md) and will be measured from the
actual XNA reference assemblies.

## Development

The package is pre-1.0 at version `0.1.0`, uses ESM, requires Node.js 20 or newer for development,
and pins TypeScript 5.9.2.

```bash
npm ci
npm run check
npm test
npm run test:differential
npm run api:report
npm run api:verify
npm run api:inventory
npm run verify:runtime
npm run verify:leaks
npm run runtime:inventory
npm run verify:build-reproducibility
npm run verify:package
npm run verify:package-reproducibility
```

When a CNA source checkout is available, its native contract can be audited without becoming a
package dependency:

```bash
npm run audit:cna-abi -- --cna-root /path/to/cna
```

Native integration is deliberately separate from pure managed tests:

```bash
CNA_SOURCE_PATH=/path/to/cna \
CNA_NATIVE_LIBRARY=/path/to/libcna_c_api.so \
npm run test:native
```

Generated `.js`, `.d.ts`, declaration maps, and source maps are written only to `dist/`. The
legacy `cna-js` package is not a dependency and is being retired.

The sibling `cna-ts-template` is the single maintained project template. Its canonical TypeScript
source generates both strict TypeScript and ordinary JavaScript projects; both are verified against
the exact packed `cna-ts` artifact.

See the [architecture](docs/architecture.md), [runtime capability inventory](docs/runtime-capabilities.md),
[C ABI audit](docs/cna-abi-audit.md), [measured roadmap](plan.md), and
[CNA-JS consolidation assessment](docs/cna-js-consolidation.md).

## License

CNA-TS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
