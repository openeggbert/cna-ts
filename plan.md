# CNA-JS implementation plan

**Status:** corrected namespace scaffold in place

**Date:** 2026-08-16

## Phase 0 — namespace scaffold

- [x] Establish runtime `CNA.Framework` and
      `Microsoft.Xna.Framework` namespace objects.
- [x] Mirror those trees in TypeScript declarations and source directories.
- [x] Reserve matching `Graphics`, `Input`, and `Content` namespaces.
- [x] Add initial `Game`, `GameTime`, `Vector2`, and `Color` shapes.

## Phase 1 — canonical WebAssembly ABI

- [ ] Bind only exports derived from C headers owned by `openeggbert/cna`.
- [ ] Add async loading, ABI-version checks, UTF-8, structured errors, opaque
      handles, callbacks, browser threading, ownership, and shutdown.

## Phase 2 — first playable XNA-style loop

- [ ] Add graphics device, texture, sprite batch, content, and keyboard types
      under both public namespace trees.
- [ ] Run a CNA-backed canvas game that clears, loads/draws a texture, reads
      Escape, and shuts down cleanly.

## Invariants

1. Public object/type hierarchy follows CNA and `Microsoft.Xna.Framework`.
2. CNA C++ remains the only engine implementation.
3. Only stable CNA WebAssembly/C ABI exports cross into JavaScript.
4. Sharp Runtime and C++ ABI details remain native implementation details.
