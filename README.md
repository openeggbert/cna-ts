# CNA-JS

CNA-JS is the JavaScript and TypeScript binding for
[CNA](https://github.com/openeggbert/cna), the native C++ XNA-inspired game
framework. It aims to provide familiar `Game`, graphics, content, audio, and
input concepts in browsers and Node.js while CNA owns the engine and renderers.

```text
JS/TS game → @openeggbert/cna → WebAssembly/C ABI → CNA C++ → web renderer
```

## Status

**Early scaffold.** This first commit contains package metadata, checked
TypeScript declarations, local value types, tests, the `Game` lifecycle shape,
and the private adapter boundary. CNA's stable ABI and WebAssembly artifacts do
not exist yet, so `Game.run()` currently rejects with
`NativeUnavailableError`.

## Design direction

- One JavaScript runtime package with first-class TypeScript declarations.
- WebAssembly/browser first; Node initially reuses the same engine build.
- XNA-style concepts with normal JavaScript naming and async startup.
- Math stays in JS; SpriteBatch commands and large data transfers batch.
- Native objects have explicit `dispose()`; finalization is only a fallback.
- Raw handles and Emscripten/WebAssembly details stay private.
- Sharp Runtime remains entirely inside CNA's C++ implementation.

See [the architecture](docs/architecture.md) and [implementation plan](plan.md).

## Development

The scaffold has no npm dependencies and requires Node.js 20 or newer:

```bash
npm run check
npm test
npm pack --dry-run
```

## License

CNA-JS is licensed under the [Microsoft Public License](LICENSE), matching CNA.
See [NOTICE.md](NOTICE.md) for compatibility and attribution notices.
