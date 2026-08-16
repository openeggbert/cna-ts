# Architecture

```text
JavaScript / TypeScript game
            ↓
@openeggbert/cna (public JS API + TypeScript declarations)
            ↓
private WebAssembly adapter and command buffers
            ↓
CNA stable C ABI exports
            ↓
CNA C++ core → Sharp Runtime, subsystems, web renderer
```

One runtime implementation serves both JavaScript and TypeScript consumers;
checked declarations provide the TypeScript surface. The first supported engine
path is WebAssembly for browsers, with Node.js initially reusing that build. A
native N-API path is deferred until a measured capability or performance need
justifies its packaging cost.

Math/value types stay in JavaScript. Native resources store private numeric
handles and expose explicit, idempotent `dispose()`. Finalization is only a
fallback. SpriteBatch calls accumulate into command buffers, input crosses as
snapshots, and large data moves through typed-array/bulk ABI operations.

The adapter must validate ABI versions, marshal UTF-8 explicitly, translate
native results into errors or rejected promises, root callbacks, respect the
browser main thread, and make shutdown deterministic.

Sharp Runtime remains a private C++ dependency below the ABI and is never part
of the JS object model or package requirements.
