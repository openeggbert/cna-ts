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
