# The native content path: what was adopted, what was not, and why

CNA has a content manager of its own — thirty-two routes in `content.h`, sixty-two more in
`content_readers.h` — and this package has a mature managed XNB reader stack. Both read the same
format. Earlier coverage recorded the whole of both headers as deferred for one reason: *the
adapter imports nothing from this header*. That describes history, not architecture, and this
document replaces it with a decision.

Measured against `cnanext` at CNA C ABI **0.21.0** (revision `e5ae0820e`) on 2026-09-01, with
`build-probe/cbind_census_probe.c`.

## The decision, in one line

**Loading stays managed; the survey is adopted.**

`Microsoft.Xna.Framework.Content.ContentManager` keeps reading XNB in TypeScript, against its own
cache, with its own asset identity — unchanged. What CNA gains this package is the one thing the
managed stack cannot do without loading everything: **read a content directory and say what is in
it**. That is projected, as `ContentSurvey` under `cna-ts/extensions/content`.

## Why loading was not adopted

XNA guarantees that `ContentManager.Load<T>(name)` returns *the same reference* for the same key
until `Unload`, and this package's tests pin exactly that:

```js
assert.equal(this.fontContent.Load(Graphics.Model, "Models\\SyntheticModel"), this.model);
```

CNA's content manager has its own cache and mints its own asset objects. Routing loads through it
would give one logical asset two owners, two identities and two lifetimes, and the guarantee above
could then be stated about neither cache — a `Load` that answered from one and a `Load` that
answered from the other would return different references for the same name.

That is the whole reason, and it is not about capability: the native loaders work. It is about
there being exactly one authority for what an asset *is*.

This also settles the **CNB loader registry** (`cna_content_manager_register_cnj_loader_ext`),
which earlier notes left open. A loader registration is only worth anything if assets are then
retrieved through the manager it was registered with — which is the second cache. It is deferred
*with* the load routes, for their reason, rather than projected as a registration nothing can act
on. `.cnb` content is already reachable, through `CnbDocument` in the same extension module, and
that path produces ordinary owned XNA objects with no second cache anywhere.

## Why the survey was adopted

A survey creates no asset, no cache and no owner. It reads directory entries and `.xnb` headers,
and answers questions:

```text
Q3_CONTENT_MANIFEST create=0
      set_root=0 refresh=0 count=0 entries=8 reader_usage=0 readers=8
      entry[0] xnb=1 cnj=0 readers=1 path="Flag.en-GB"
        reader[0]="Microsoft.Xna.Framework.Content.Texture2DReader"
      entry[3] xnb=1 cnj=0 readers=8 path="Font"
        reader[0]="Microsoft.Xna.Framework.Content.SpriteFontReader"
        reader[1]="Microsoft.Xna.Framework.Content.Texture2DReader"
      usage[1] name="Microsoft.Xna.Framework.Content.ListReader`1[[Microsoft.Xna.Framework.Rectangle]]"
Q4_READER_REGISTRY is_registered_route=0 SpriteFontReader=1
```

The question it makes askable is a real one. A content pipeline can emit an `.xnb` whose reader
nobody has registered, and today that is discovered when a `Load` throws at runtime, one asset at a
time. With the survey it is a question that can be asked up front, over a whole directory, before
anything is loaded:

```ts
using found = new ContentSurvey(GraphicsDevice, "Content");
for (const usage of found.ReaderUsage) {
  if (!usage.IsRegisteredWithCna && !IsContentTypeReaderRegistered(usage.ReaderName)) {
    console.warn(`${usage.FileCount} asset(s) need ${usage.ReaderName}, and nothing reads it`);
  }
}
```

Two registries answer that, deliberately: CNA's, through
`cna_content_type_reader_manager_get_is_registered`, and this package's own, through the reader
registration the extensions already expose. Neither alone is the answer.

## What the survey cannot see

**A compressed `.xnb` reports no reader names.** The reader table lives inside the compressed
payload and the survey reads headers without decompressing. Measured, on the same model written
twice into one root:

| asset | `HasXnb` | `XnbReaderNames` |
| --- | --- | --- |
| `Models/Triangle` (raw) | true | five names |
| `Models/TriangleLzx` (LZX) | true | *empty* |

So an empty list means "not known from here", never "needs no readers". `ContentSurveyEntry`
documents that on itself and `test/content-survey.integration.mjs` asserts both rows, so the
distinction cannot quietly stop being true.

## What each family became

| Family | Category | Bound |
| --- | --- | --- |
| manifest, reader usage, root directory, create/destroy | `CNA_EXTENSION_BACKING` | **yes**, 14 routes |
| `cna_content_type_reader_manager_get_is_registered` | `CNA_EXTENSION_BACKING` | **yes** |
| `cna_content_manager_load_*`, `create_resource`, `unload` | `XNA_BACKING` | no — the second cache |
| `.cnj` loader registry, foreign load, game's manager slot | `CNA_EXTENSION_BACKING` | no — needs the above |
| asset-path and normalized-key arithmetic, service provider, device | `XNA_BACKING` | no — managed, against the managed cache |
| CNA's `ContentReader` / `ContentTypeReaderManager` / reflective readers | `XNA_BACKING` | no — a parallel decoder for a format this package already decodes |

## Ownership

| Object | Label |
| --- | --- |
| the `CNA_Handle` behind a `ContentSurvey` | **OWNED**; `Dispose` destroys it, and it must go before its game |
| the entries and reader-usage rows | **copied immutable snapshots** — frozen JavaScript objects, no native memory behind them |
| the graphics device it is created against | **BORROWED** |

Nothing the survey returns is a view into native memory, so nothing it returns can be invalidated
by a later `Refresh` or by `Dispose`.
