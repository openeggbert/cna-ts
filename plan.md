# CNA-JS implementation plan

**Status:** XNA namespace scaffold in place

**Date:** 2026-08-16

## Phase 0 — repository scaffold

- [x] Establish runtime and TypeScript `Microsoft.Xna.Framework` plus
      `Graphics`, `Input`, and `Content` compatibility trees.
- [x] Keep ABI implementation under `src/internal`.
- [x] Add initial `Game`, `GameTime`, `Vector2`, and `Color` shapes.
- [x] Remove the invalid invented public `CNA.Framework` object tree.

## Phase 1 — canonical WebAssembly ABI

- [ ] Bind only exports derived from headers owned by `openeggbert/cna`.
- [ ] Add async loading, version checks, UTF-8, errors, handles, callbacks,
      browser threading, ownership, batching, and shutdown.

## Phase 2 — playable compatibility slice

- [ ] Add graphics device, texture, sprite batch, content, and keyboard types.
- [ ] Run a CNA-backed XNA-style browser game loop.

## Invariants

1. XNA types follow the `Microsoft.Xna.Framework` hierarchy.
2. No public object/namespace is invented without a native counterpart.
3. CNA C++ remains canonical and only its stable ABI crosses the boundary.
