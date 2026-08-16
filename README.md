# CNA-JS

> **Status: In progress - NOT YET FUNCTIONAL**


CNA-JS exposes [CNA](https://github.com/openeggbert/cna) through JavaScript
objects and TypeScript declarations matching XNA 4.0 namespaces.

```text
JavaScript / TypeScript game
            ↓
Microsoft.Xna.Framework.{Graphics, Input, Content}
            ↓
src/internal
            ↓
CNA stable WebAssembly/C ABI
            ↓
CNA C++ Microsoft::Xna::Framework implementation
```

## Status

**Early scaffold.** The compatibility runtime object, type declarations, and
first local values exist. Native execution waits for canonical CNA exports.

```javascript
import { Microsoft } from "@openeggbert/cna";

const position = new Microsoft.Xna.Framework.Vector2(100, 100);
const color = Microsoft.Xna.Framework.Color.CornflowerBlue;
```

Interop status and errors are package-root binding utilities backed by
`src/internal`; there is deliberately no public `CNA.Framework` object. Future
`CNA` objects must mirror real native `CNA::...` extensions.

See [architecture](docs/architecture.md) and [plan](plan.md).

## License

CNA-JS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
