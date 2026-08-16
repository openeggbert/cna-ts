# Architecture

```text
Microsoft.Xna.Framework compatibility object/type tree
                         ↓
src/internal WebAssembly/native adapter
                         ↓
CNA stable WebAssembly/C ABI
                         ↓
CNA C++: Microsoft::Xna::Framework
```

The package exports the runtime object `Microsoft` and matching TypeScript
namespace declarations. Internal code owns WebAssembly memory, UTF-8, native
errors, handles, callbacks, threading, ownership, batching, and shutdown.

There is no public `CNA.Framework` object because no `CNA::Framework` namespace
exists in CNA C++. Future public `CNA` objects must mirror concrete native
extensions rather than duplicate XNA types.
