# CNA-JS consolidation assessment

Audit date: 2026-08-22

## Repositories inspected

- `../cna-js` at `bcd6ee1effef38846af0883b6f93d3b137bb06cf`
- `../cna-js-template` at `bc88cc766929bff1743405b47cf3d9f58e46e39a`
- pre-conversion `cna-ts` at `553fe713e3de61d5a7a35296b84e2b7184328100`
- `../cna-ts-template` at `6b6b533e0816dd15d8bc06088b23a0d84287ac96`

Both legacy worktrees were clean at the start of the audit and were treated as read-only.

## Binding findings

The JavaScript implementation and tests in `cna-js` were identical to the corresponding
pre-conversion `cna-ts` files. CNA-TS had one extra handwritten `src/index.d.ts`; that duplication
was the only implementation-model distinction. The remaining unique legacy files were package
identity and shorter documentation, not functionality.

Migrated into canonical CNA-TS:

- the useful initial runtime namespace shape;
- the explicit unavailable-backend behavior;
- the initial `Game`, `GameTime`, `Vector2`, and `Color` ideas, corrected against XNA behavior;
- JavaScript consumption, now supplied by generated `dist/*.js` from TypeScript source.

Intentionally discarded:

- the `cna-js` package identity and repository-specific metadata;
- hand-maintained JavaScript implementation ownership;
- the stale claim that CNA lacks a stable C ABI.

## Template findings

The legacy JavaScript template contains the same aspirational demo and asset as the TypeScript
template, expressed without types. The two `logo.png` files have identical SHA-256
`66643910d4ca53075ebd096a41671118df7f1ff15016d8bbbc9f8f38d055f989`. No unique runtime path,
test, graphics implementation, configuration, or documentation was found.

The visual/game idea may be reintroduced only after the corresponding real CNA APIs work. The old
parallel JavaScript source, preview `cna-js` dependency, decorative Electron/Capacitor setup, and
three-frame pseudo-smoke are intentionally not migration requirements. JavaScript projects will
instead be derived from the canonical TypeScript template source.

## Deletion assessment

No unique useful implementation remains in either legacy repository. Once external repository
retention and npm-name policy are handled by the owner, both appear safe to archive or delete.
Canonical JavaScript consumption comes from `cna-ts`; no compatibility shim or dependency on a
legacy repository is required.
