# CNA-TS XNA API verifier

This tool extracts public/protected metadata from the seven XNA 4.0 Windows runtime reference
assemblies, applies the normative TypeScript mapping, and compares it with generated declarations
through the TypeScript compiler API. It never treats CNA, CNA-C#, CNA-Java, or source-name counts as
the XNA authority.

```bash
npm run build
XNA_REFERENCE_PATH=/path/to/xna/windows npm run api:report
XNA_REFERENCE_PATH=/path/to/xna/windows npm run api:verify
```

`api:report` returns success while recording all differences. `api:verify` returns nonzero until no
unexplained differences remain. Both support `--format text` and `--format json`; direct use also
supports `--output FILE`. Reference assembly hashes must match the selected profile.

The reference-independent gates are:

```bash
npm run verify:runtime
npm run verify:leaks
```

The runtime verifier ensures constructors, prototype methods/accessors, static members, enum values,
and the `Microsoft.Xna.Framework` namespace object exist where declarations say they do. The leak
guard parses strict declarations and rejects internal/backend/native implementation names or raw
handle/pointer-shaped members.

The mapping allowlist is intentionally empty. Language adaptations belong in
`mapping-rules.json`, and an unmapped transformation is reported as `LANGUAGE_MAPPING_MISMATCH`.

Generic verification includes arity, parameter identity/order, type and method constraints,
interface/base constraints expressible in TypeScript, nested generic substitution, and inherited
mapped-interface members. CLR reference/value/new() and named constraints are counted separately;
the latter two CLR flags are measured even where the normative TypeScript mapping must erase them.
`test/api-compat-verifier.test.mjs` contains deliberately broken generic contracts.

The selected profile also freezes `TARGET_TYPES=271`, `TOTAL_DIFFERENCES=0`, and
`ALLOWLIST_SIZE=0`. Strict verification fails if any of those values moves, so expected-contract
regeneration cannot silently normalize an incomplete target. The current generated evidence is in
`docs/api-compat-report.json`, `docs/runtime-symbol-report.json`,
`docs/internal-leak-report.json`, and `docs/missing-type-inventory.*`.
