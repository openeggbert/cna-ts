# Should CNA-TS project the XNA Content Pipeline?

Measured, then decided. The question is a product boundary rather than an engineering one — every
type here *could* be projected, and the strict verifier would hold at zero differences if it were —
so what follows is the measurement first and the decision after it.

**The decision: no direct projection.** Ship a separate build-time package around CNA's own content
tooling instead, and keep the XNA name for the part a game actually consumes at runtime. The rest of
this page is why.

## What the surface actually is

`npm run api:profiles` measures it from the reference assemblies themselves, admitted by exact
SHA-256:

```text
xna40-windows-content-pipeline  INVENTORY  7 assemblies  128 types  743 members  0 projected
```

```text
 47  Microsoft.Xna.Framework.Content.Pipeline.Graphics
 32  Microsoft.Xna.Framework.Content.Pipeline
 28  Microsoft.Xna.Framework.Content.Pipeline.Processors
  7  Microsoft.Xna.Framework.Content.Pipeline.Serialization.Intermediate
  5  Microsoft.Xna.Framework.Content.Pipeline.Audio
  5  Microsoft.Xna.Framework.Content.Pipeline.Serialization.Compiler
  4  Microsoft.Xna.Framework.Content.Pipeline.Tasks
```

Six of the seven assemblies are importer shims of one to three types each; 120 of the 128 types are
in `Microsoft.Xna.Framework.Content.Pipeline` itself.

## Four things in it that JavaScript does not have

This is the part that decides the question, and none of it is a matter of effort.

**1. Attribute-driven discovery.** `ContentImporterAttribute`, `ContentProcessorAttribute`,
`ContentTypeWriterAttribute` and `ContentTypeSerializerAttribute` are how the pipeline *finds* an
importer: the build scans assemblies for attributed types and instantiates them by CLR type
identity. JavaScript has no attributes and no assembly scanning. A projection would have to invent a
registration call, at which point the API is no longer XNA's — a game's existing content project
would not work against it, which was the only reason to keep the shape.

**2. `IntermediateSerializer`.** Seven types implement XNA's intermediate XML format, whose contract
*is* CLR reflection: it round-trips arbitrary object graphs by walking public fields and properties,
honouring `ContentSerializerAttribute` per member, resolving generic type arguments by name, and
writing CLR assembly-qualified type names into the XML. `docs/xna-typescript-mapping.md` already
records that this package does not invent runtime reflection JavaScript does not have. A
`IntermediateSerializer` without reflection is not that type; a plausible-looking one would be worse
than none, because content that round-tripped would round-trip differently.

**3. The four MSBuild tasks.** `BuildContent`, `BuildXact`, `CleanContent` and `GetLastOutputs` are
MSBuild task classes. They are not an API a program calls; they are how `.contentproj` is executed.
Projecting them into TypeScript produces four classes nobody can invoke, in a build system nobody
using this package runs.

**4. The processors are XNA's, not CNA's.** All 28 `Processors` types and most of the 47 `Graphics`
types describe the intermediate object model XNA's own processors consume —
`NodeContent`, `MeshContent`, `MaterialContent`, `TextureContent` and the geometry helpers that
transform them. They are the input side of a compiler whose output is XNB, which CNA reads but does
not produce. A TypeScript `ModelProcessor` with nothing behind it is a shape, not a tool.

## What CNA already has instead

CNA does not have a Content Pipeline; it has a content *compiler*, and this package already reaches
it. `docs/cna-api-coverage.md` classifies `cnb.h`, and 54 of its routes are build-time by shape:

```text
byte_writer      17   the primitive writer
writer           13   the container writer
encode_*         10   one per asset schema
loader_registry   9   teaching CNA a new asset type
import_*          3   PNG/JPEG/BMP, DDS cube, WAV
compile_cnj       1   the .cnj document front end
build_model_cnj   1   the model front end
```

`cna-ts/extensions/content` already publishes the parts of that a consumer can use today —
`CnbTextureData.Encode`, `CnbSpriteFontData.Encode`, and the document reader on the other side — and
the template's extensions smoke compiles a texture and reads it back with no graphics device
involved, because a content build is a build machine's job.

The importers are the piece worth noticing: `cna_cnb_import_image_as_texture2d` accepts PNG, JPEG
and BMP, which is what XNA's `TextureImporter` assembly is for; `cna_cnb_import_wav_as_sound_effect`
is `AudioImporters`; `cna_cnb_build_model_from_cnj` is `FBXImporter`/`XImporter`'s job through a
different source format. The *capability* is there. What is not there is XNA's discovery mechanism,
and that is the part that cannot cross.

## The three options, and why the third wins

**A. Project all 128 types.** Costs 743 members and buys a surface where the four load-bearing
mechanisms — attributes, reflection, MSBuild, XNB output — are all absent or faked. A game's
existing `.contentproj` still would not build. Rejected: it would be the first place in this package
where a shape was projected without the behaviour behind it, and the strict verifier holding at zero
would make that *look* fine.

**B. A selected compatibility facade.** Project the object model (`TextureContent`, `MeshContent`,
`NodeContent`) without the discovery, serialization or task machinery, so a consumer writing a Node
build script has familiar types. Tempting, and still rejected: the object model's only purpose is to
be consumed by processors that are not being projected, so it would be a vocabulary with no verbs.
Worth revisiting only if CNA grows a compiler that takes that object model as input.

**C. A separate build-time package over CNA's tooling.** Not `Microsoft.Xna.Framework.Content.
Pipeline` at all. A Node package — `cna-ts-content` or a `cna-ts/build` subpath — whose API is the
one CNA actually implements: import a source file, build a `.cnb`, declare dependencies, register a
custom asset type. It compiles to `.cnb` rather than `.xnb`, which is the truthful thing for a tool
built on CNA's compiler, and `cna-ts/extensions/content` already reads the result on both backends.

**Chosen: C**, with the boundary stated rather than implied.

## What that means for this package

- The 128 content-pipeline types stay inventoried and unprojected. They are correctly excluded from
  the runtime superset — 331 of 331 runtime types are projected without them — and
  `xna40-windows-content-pipeline` stays an `INVENTORY` profile so a future session cannot mistake
  the exclusion for an oversight.
- `cna-ts/extensions/content` is the seam. Its encoders are already the write half of option C, and
  they are backend-neutral: the browser reaches them too, so a `.cnb` built in a build script and
  one built in a page are the same bytes.
- Nothing in this package will claim XNB *authoring*. `ContentManager` reads XNB and will keep
  reading it; producing one needs XNA's compiler, and CNA does not have it.
- The remaining CNB tooling — the `.cnj` compile front ends, the three importers, the loader
  registry — is measured and unprojected. It is the natural first content of package C, and it is
  the reason the decision is "not here" rather than "not at all".

## What would change this

Two things, and both are upstream facts rather than opinions:

1. **CNA growing an XNB writer.** Then option B has a purpose: the object model would have a
   compiler to feed, and XNA-compatible content authoring would be real rather than shaped.
2. **A measured consumer need for `.contentproj` compatibility.** A game with an existing XNA
   content project and no way to re-author it is the case option A exists for. None has been
   measured; if one is, the cost above is the cost, and it should be paid deliberately.

Until then, the honest boundary is the one drawn here: XNA's runtime is projected exactly, XNA's
build is not projected at all, and CNA's own compiler is the thing a CNA-TS consumer builds content
with.
