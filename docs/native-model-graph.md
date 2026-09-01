# The native model graph, and where this package's managed one meets it

Measured against `cnanext` at CNA C ABI **0.21.0** (revision `e5ae0820e`) on 2026-09-01, with the
pure-C probe `build-probe/cbind_modelpart_bridge_probe.c` under the HEADLESS renderer. Every claim
below names the stage that produced it. Nothing here is inferred from a header comment alone.

## Why this document exists

Fifteen engine-layer routes — the instanced renderer's fourteen and `cna_lod_group_ext_select` —
were left unbound by earlier sessions because they take a `CNA_ModelMeshPartHandle` and this
package's `ModelMeshPart` is a managed XNB projection. Binding them would have meant passing zero.
The question this document answers is whether a *truthful* native handle can be produced for a
managed part — without duplicating geometry, without a second owner, and without changing one byte
of strict XNA behaviour.

The answer is yes, with one constraint that shapes the whole design, recorded under
[The retention constraint](#the-retention-constraint).

## What the probe measured

```text
STAGE1_BUFFERS        vertex=4294967300 index=4294967301
STAGE2_PART           part=4294967302 has_vb=1 vb_same=1 has_ib=1 ib_same=1
                      num=4 prim=2 start=0 offset=0
STAGE3_SECOND_PART    result=0 distinct=1
STAGE4_EFFECT         has=1 same=1
STAGE5_INSTANCED      create=0
STAGE5_STATE          stride=64 supported=0 count=0 capacity=0
STAGE6_LOD            create=0
STAGE6_NEAR           index=0 is_fine=1 is_coarse=0
STAGE6_FAR            index=1 is_fine=0 is_coarse=1
STAGE6_AFTER_DESTROY  coarse_primitive_count=1
STAGE9_COLLECTION     count=1 first_is_original=0 second_is_first=0
                      first=8589934601 second=4294967306
STAGE8_LIFETIME       vb_destroy=3 read=0 has_vb=1 same=1 scalar=0 prim=2
STAGE7_TEARDOWN       ok
```

### 1. A native part is built *over* existing buffers, not from copied geometry

`cna_model_mesh_part_create(vertex_buffer, index_buffer, num, prim, start, offset)` takes buffer
handles. `cna_model_mesh_part_get_vertex_buffer` and `..._get_index_buffer` hand back **the same
handle values that went in** (`vb_same=1`, `ib_same=1`, stage 2). The C++ side is a
`PartRetainedSlot`, not a copy: `PartResource` in `modules/c-api/src/CnaCApiModels.cpp` holds
`PartRetainedSlot vertexBuffer` and `PartRetainedSlot indexBuffer`.

**No vertex or index data is uploaded twice.** This is the single most important measurement here,
because uploading a model's geometry a second time merely to obtain a handle would have made the
whole bridge a regression rather than a feature.

### 2. The scalar state is preserved verbatim

`num_vertices`, `primitive_count`, `start_index` and `vertex_offset` read back exactly as supplied
(stage 2). They are the four numbers XNA's `ModelMeshPart` exposes, and all four are `readonly` on
this package's managed part — so once a side-car is built from them it cannot drift.

### 3. Two parts may share one pair of buffers

A second part over the same buffers is created successfully and is a distinct handle (stage 3,
`result=0 distinct=1`). Sharing is legitimate, which is what makes a per-managed-part side-car
sound: several parts of one XNB mesh routinely share a single buffer pair.

### 4. The retention constraint

**`cna_vertex_buffer_destroy` on a buffer a native part still holds returns
`CNA_RESULT_INVALID_STATE` (3).** Stage 8: `vb_destroy=3`, and the part remains fully readable
afterwards (`same=1`, `prim=2`).

CNA enforces its own retention, which is good ABI hygiene and a hard constraint here:

> If a native side-car part outlived the managed `VertexBuffer`, then `VertexBuffer.Dispose()`
> would begin to fail. XNA's `IDisposable` must always succeed. Therefore **a side-car's lifetime
> must be strictly contained inside its buffers' lifetimes**, and the binding — not the consumer —
> has to guarantee it.

`guardGraphicsResourceReleaseForInternalUse` in
`src/Microsoft/Xna/Framework/Graphics/GraphicsResource.ts` is the hook that makes this possible: it
chains a callback onto a resource's `Release`, which `Dispose()` runs *before* the native
`cna_vertex_buffer_destroy`. The side-car is released there.

### 5. Renderers and LOD groups *borrow* parts

`cna_instanced_renderer_ext_create` documents the part as borrowed and succeeds on HEADLESS
(stage 5, `create=0`). `cna_lod_group_ext_destroy` documents its parts as borrowed, and stage 6
proves it: after the group is destroyed, a part it held still answers
`cna_model_mesh_part_get_primitive_count` correctly (`coarse_primitive_count=1`).

### 6. `lod_group_ext_select` returns the *identical* handle

Stage 6 puts two parts into a group and selects at two distances. The near selection returns the
handle of the fine part and the far selection the handle of the coarse part, each compared by
value (`is_fine=1`, then `is_coarse=1`), with `select_index` agreeing (0, then 1).

This is what makes a reverse map sound. A native handle coming back out of `select` can be looked
up in a table the bridge itself populated, so `Select` can return **the very same public
`ModelMeshPart` object** the consumer put in — not a new wrapper around an equal value.

### 7. But CNA's *collection* getters mint fresh handles

Stage 9 is the counter-example that stops the reverse map being generalised. A part put into a
`CNA_ModelMeshPartCollection` and read back twice yields **two different handles, neither equal to
the original** (`first_is_original=0`, `second_is_first=0`, `first=8589934601`,
`second=4294967306`). Each is a separately owned registration the caller has to destroy.

So handle equality is a valid identity test **only** on routes documented to hand back a borrow —
`lod_group_ext_select` is one, collection `get_at` is not. The design below relies on the former
and never on the latter.

### 8. HEADLESS cannot instance

`cna_instanced_renderer_ext_is_instancing_supported` answers false on HEADLESS (stage 5,
`supported=0`) while `create` still succeeds and the instance stride is the documented 64 bytes.
Instancing behaviour therefore has to be qualified on a real GPU renderer; HEADLESS can only
qualify construction, state and the refusal path.

## The wider graph, from the headers

Read but not yet exercised, recorded here because Phase 5's census depends on it:

| Route | Ownership of the result |
| --- | --- |
| `cna_model_create` | retains the supplied bones and meshes |
| `cna_model_get_bones` / `..._get_meshes` | an **owned** collection view; the caller destroys it |
| `cna_model_get_root` | an **owned** bone view |
| `cna_model_mesh_get_mesh_parts` / `..._get_effects` | owned views |
| `cna_model_set_owned_resources` | a C-owned bundle released by a required callback |

The pattern is uniform: *creates* retain their inputs, *gets* mint owned views. Combined with
stage 9, the rule for any future work on this header is that *no* CNA getter's handle may be used
as an identity token.

## The decision

**Architecture B — an optional native side-car, built lazily, cached by public object, released
before its buffers.** Architecture A (mint native objects inside the XNB reader) was rejected: it
would pay for a native part on every model every consumer ever loads, including the overwhelming
majority that never touch an engine extension. Architecture C (native content loader) is a separate
question and is not needed for model-part identity at all.

### Ownership labels

| Object | Label | Enforced by |
| --- | --- | --- |
| the native `CNA_ModelMeshPartHandle` | **OWNED** by the bridge cache | created and destroyed only here |
| the managed `VertexBuffer` / `IndexBuffer` | **RETAINED_DEPENDENCY** of the side-car | CNA, which refuses the destroy (stage 8) |
| the managed `Effect` on the part | **BORROWED**, re-synced on each borrow | it is the one mutable field XNA exposes |
| the part inside an `InstancedRenderer` | **BORROWED** | the header, and the renderer is disposed first |
| the part inside a `LodGroup` level | **BORROWED** | stage 6 |

### Identity

One public `ModelMeshPart` maps to exactly one native handle for as long as its buffers live. A
`WeakMap` keyed on the public object gives stable identity without keeping it alive; a plain `Map`
from handle value back to the public object serves `Select`, and is cleared by the same release
guard that destroys the handle, so a recycled handle value can never resolve to a stale object.

### What stays out of strict XNA

`Microsoft.Xna.Framework.Graphics.ModelMeshPart` gains **no** member, no property and no visible
behaviour. The side-car is reached only from the CNA extension surface, and the handle itself is
never public.
