# CNA-JS

CNA-JS exposes [CNA](https://github.com/openeggbert/cna) through JavaScript
objects and TypeScript declarations matching CNA and XNA 4.0 namespaces.

```text
JavaScript / TypeScript game
            ↓
Microsoft.Xna.Framework compatibility tree
            ↓
CNA.Framework tree
            ↓
CNA.Interop → WebAssembly/C ABI → CNA C++
```

## Status

**Early scaffold.** The corrected runtime namespace objects, source hierarchy,
TypeScript declarations, and first local values are present. Native execution
waits for CNA's canonical C ABI and WebAssembly exports.

```javascript
import { Microsoft } from "@openeggbert/cna";

const position = new Microsoft.Xna.Framework.Vector2(100, 100);
const color = Microsoft.Xna.Framework.Color.CornflowerBlue;
```

The parallel CNA-native tree is exported as `CNA.Framework`. Low-level loading
and ABI status belong to `CNA.Interop`.

See [architecture](docs/architecture.md) and [plan](plan.md).

## License

CNA-JS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
