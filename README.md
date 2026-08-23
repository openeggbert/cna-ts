# CNA-TS

`cna-ts` is the single canonical TypeScript and JavaScript binding for
[CNA](https://github.com/openeggbert/cna). TypeScript source is the only implementation source;
the package build emits the JavaScript used by both languages and the declarations used by
TypeScript.

> Status: the selected XNA 4.0 Windows runtime projection is strict-zero complete: all 271 mapped
> target types are present, with zero missing members, signature mismatches, runtime-symbol
> differences, internal leaks, or allowlist entries. The real graphics/content slice includes typed
> Texture2D transfer and encoded streams, public SpriteBatch drawing, Effect reflection and stock
> effect state, managed uncompressed/LZX XNB readers, external-reference resolution,
> SpriteFont/DrawString, and Model graphs. Audio,
> XACT, Media, Video, and Storage now have typed runtime routes where CNA exposes them. An opt-in
> Node-API bridge executes CNA ABI 0.7.0 on Linux HEADLESS/NULL audio; no native binary or CNA
> library is bundled. Without an explicitly loaded backend, native operations fail rather than
> simulating execution.

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
against a CNA ABI 0.7 header checkout and Node 20+ headers, then load an explicit compatible shared
library:

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

The adapter enforces exact ABI 0.7.0 and uses exactly 219 audited symbols: the previous 69-route
graphics/content/input slice plus 43 Audio, 46 XACT, 23 Media, 11 Video, and 27 Storage symbols.
Current native evidence
covers game lifecycle, graphics manager/device borrowing, clear/present, Texture2D Color
upload/readback/regions/mips, PNG `FromStream` and encoding, public SpriteBatch drawing,
SpriteFont XNB/DrawString, model XNB resource construction, vertex/index buffers, renderer
capabilities, keyboard/mouse/gamepad/touch polling, PCM SoundEffect and dynamic buffers,
MediaPlayer with a generated silent WAV, VideoPlayer control state, and isolated Storage CRUD.
HEADLESS reports no microphones. No redistributable XACT or video fixture was available, and CNA's
player-owned video frame texture cannot yet be projected safely, so authored-bank playback and
video decode/`GetTexture` remain explicit boundaries. This HEADLESS artifact reports custom effects
but not compiled effects; the bridge imports no effect execution or indexed-draw routes, so
`EffectPass.Apply` and model rendering fail explicitly while managed reflection/property behavior
remains usable. Linux HEADLESS evidence is not a Windows, GPU,
Electron, browser, or mobile support claim.

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
