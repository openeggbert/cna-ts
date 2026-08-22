# CNA-TS

`cna-ts` is the single canonical TypeScript and JavaScript binding for
[CNA](https://github.com/openeggbert/cna). TypeScript source is the only implementation source;
the package build emits the JavaScript used by both languages and the declarations used by
TypeScript.

> Status: foundation work in progress. Pure timing, color, and initial vector behavior works.
> No CNA WebAssembly or Node backend is currently loaded by the package, so `Game.Run()` fails
> explicitly instead of simulating native execution.

## One package for both languages

JavaScript consumers do not need TypeScript in their application:

```js
import { Color, Game, Vector2 } from "cna-ts";

const position = new Vector2(100, 100);
const clearColor = Color.CornflowerBlue;
```

TypeScript consumers use the same imports and the same generated JavaScript:

```ts
import { Color, Game, Vector2 } from "cna-ts";
```

The strict XNA projection is also available from `cna-ts/xna`. CNA-specific functionality is
isolated under `cna-ts/extensions`, while backend status is exposed by `cna-ts/runtime`. Internal
backend modules are not package exports.

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
npm pack
```

Generated `.js`, `.d.ts`, declaration maps, and source maps are written only to `dist/`. The
legacy `cna-js` package is not a dependency and is being retired.

See the [architecture](docs/architecture.md), [measured roadmap](plan.md), and
[CNA-JS consolidation assessment](docs/cna-js-consolidation.md).

## License

CNA-TS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
