# NEXT — measured session history

## 2026-08-22: canonical TypeScript consolidation

### Repository invariants

- `cna-ts` started clean at `553fe713e3de61d5a7a35296b84e2b7184328100`.
- `cna-ts-template` started clean at `6b6b533e0816dd15d8bc06088b23a0d84287ac96`.
- read-only `cna-js` started clean at `bcd6ee1effef38846af0883b6f93d3b137bb06cf`.
- read-only `cna-js-template` started clean at
  `bc88cc766929bff1743405b47cf3d9f58e46e39a`.
- `cna-cs` and `cna-java` already contained unrelated uncommitted work and were read only.

### Evidence gathered

- Legacy CNA-JS runtime source/tests matched the pre-conversion CNA-TS implementation; no unique
  binding code was found.
- Both templates carry the identical logo asset; the legacy JS template has no unique runtime.
- The actual CNA headers report C ABI 0.7.0. A declaration scan found 59 headers and 2,861 unique
  `CNA_C_API` functions.
- CNA contains Emscripten-aware platform/renderers and prior WebAssembly build evidence, but no
  packaged CNA C-ABI ESM loader/Wasm artifact was present and `emcc` was unavailable locally.
- The selected seven XNA assemblies matched the hashes recorded by the sibling verifier.
- Reflection extraction from those assemblies reported `REFERENCE_TYPES=257` and
  `REFERENCE_MEMBERS=2964`.

### Delivered and pushed

Commit `714336d` converts runtime ownership to TypeScript, pins TypeScript 5.9.2, emits ESM and
generated declarations/maps to `dist`, adds package subpaths, introduces tick-precise `TimeSpan`,
repairs initial value mutability/names, and adds runtime-independent tests/type probes.

Local verification used the official Node.js 22.14.0 Linux archive after matching its published
SHA-256:

```text
tsc -p tsconfig.json                 PASS
tsc -p tsconfig.types.json           PASS
node --test                          PASS (6 tests)
npm pack --dry-run --ignore-scripts  PASS (61 files at this checkpoint)
git diff --check                     PASS
```

### Immediate next gates

1. Land CLR extractor/profile and the TypeScript-AST verifier with a report-only baseline.
2. Land runtime-symbol and internal-leak gates.
3. Expand the coherent math/value group and differential fixtures.
4. Convert the template to a packed-package canary without claiming a working native runtime.
5. Define the smallest consumable CNA C-ABI Wasm artifact recipe with upstream CNA.
