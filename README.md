# CNA-TS

`cna-ts` is the single canonical TypeScript and JavaScript binding for
[CNA](https://github.com/openeggbert/cna). TypeScript source is the only implementation source;
the package build emits the JavaScript used by both languages and the declarations used by
TypeScript.

> Status: XNA projection work in progress. The managed foundation and the selected-profile
> Framework/core, graphics-device, graphics-resource, state, texture, vertex, and buffer
> declarations are structurally complete. A small opt-in Node-API bridge has executed CNA ABI
> 0.7.0 on Linux HEADLESS; no native binary or CNA library is bundled. Without an explicitly loaded
> backend, `Game.Run()` still fails rather than simulating native execution.

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

The adapter enforces exact ABI 0.7.0 and uses the C ABI only. Current native evidence covers game
lifecycle, graphics manager/device borrowing, clear/present, Texture2D and SpriteBatch ownership,
renderer information, and keyboard/mouse/gamepad/touch polling. SpriteBatch’s strict public draw
surface is not implemented yet. Linux HEADLESS evidence is not a Windows, GPU, Electron, browser,
or mobile support claim.

## Compatibility scope

The target is an **XNA 4.0 TypeScript/JavaScript API projection**, initially for the seven-assembly
Windows runtime profile. It is not a claim that C# source compiles unchanged as TypeScript. The
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
npm run verify:runtime
npm run verify:leaks
npm run verify:package
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

See the [architecture](docs/architecture.md), [C ABI audit](docs/cna-abi-audit.md),
[measured roadmap](plan.md), and
[CNA-JS consolidation assessment](docs/cna-js-consolidation.md).

## License

CNA-TS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
