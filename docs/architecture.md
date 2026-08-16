# Architecture

```text
Microsoft.Xna.Framework.{Graphics, Input, Content}
                         ↓
CNA.Framework.{Graphics, Input, Content}
                         ↓
CNA.Interop
                         ↓
CNA stable WebAssembly/C ABI
                         ↓
CNA C++ core
```

The package exports actual runtime objects named `Microsoft` and `CNA`, and the
TypeScript declarations describe the same hierarchy. The compatibility tree
may reuse constructors only where the CNA and XNA contracts are identical;
otherwise it owns facade types and conversions.

Only the interop adapter may access WebAssembly memory or native exports. Math
stays in JS, native resources use explicit `Dispose`, input crosses as
snapshots, and SpriteBatch/data traffic is batched. Sharp Runtime remains an
internal C++ detail.
