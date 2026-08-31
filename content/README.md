# cna-ts-content

Build-time content tooling for CNA. It turns ordinary source files into `.cnb`, CNA's own compiled
content format, which `cna-ts` then loads at runtime.

```ts
import { LoadContentToolchain, ImportTexture2D, ImportSoundEffect } from "cna-ts-content";
import { writeFileSync } from "node:fs";

await LoadContentToolchain({
  CnaLibrary: "./libcna_c_api.so",
  BridgeModule: "./node_modules/cna-ts/build/cna_node_bridge.node",
});

const hero = ImportTexture2D("art/hero.png", "Sprites/Hero");
writeFileSync("Content/Sprites/Hero.cnb", hero.Image);

const beep = ImportSoundEffect("audio/beep.wav", "Audio/Beep");
writeFileSync("Content/Audio/Beep.cnb", beep.Image);
```

A game then loads those files through `cna-ts`'s ordinary public API, on Node or in a browser:

```ts
import { CnbDocument, CreateTexture2DFromCnb } from "cna-ts/extensions/content";

using document = CnbDocument.Parse(bytes, "Sprites/Hero.cnb");
const hero = CreateTexture2DFromCnb(GraphicsDevice, document);
```

## Why this is a separate package

`docs/content-pipeline-boundary.md` in the runtime repository measured XNA's Content Pipeline — 128
types across seven assemblies — and decided not to project it. Four of its load-bearing mechanisms
have no JavaScript or CNA counterpart: attribute-driven importer discovery, a reflection-based
`IntermediateSerializer`, MSBuild task classes, and XNB output. A projection would have been a
familiar shape with nothing behind it, and a game's existing `.contentproj` still would not build.

What CNA has instead is a content *compiler*. This package is its API, and it is a separate package
so that the boundary is enforced rather than described:

- **`cna-ts` runs in a browser.** Nothing in it takes a filesystem path or names a compiler. The
  three routes in the whole binding that read a file by path live here.
- **Bytes cross; handles do not.** Every operation imports, describes, encodes and releases inside
  one native call and returns a finished `.cnb` image. This package owns no native lifetime, so
  there is nothing here to `Dispose` and nothing a caller can leak.

## What it does not do

It does not write `.xnb`. CNA has no XNB writer, and calling this an XNA Content Pipeline would be
false in both directions: it compiles to a different format, and it is driven by function calls
rather than by `.contentproj` and MSBuild. `cna-ts`'s `ContentManager` still *reads* XNB, which is a
separate and true claim.

## What is here today

| Operation | CNA route | XNA's equivalent assembly |
| --- | --- | --- |
| `ImportTexture2D` | `cna_cnb_import_image_as_texture2d` | `TextureImporter` (PNG/JPEG/BMP) |
| `ImportTextureCube` | `cna_cnb_import_dds_as_texture_cube` | `TextureImporter` (DDS) |
| `ImportSoundEffect` | `cna_cnb_import_wav_as_sound_effect` | `AudioImporters` |

`cnb.h`'s remaining build-time surface — the primitive byte writer, the loader registry and the
`.cnj` compile front ends — is measured and unprojected. It is the natural next content of this
package.

Authoring a container from data a build script already holds needs no importer at all:
`cna-ts/extensions/content` publishes CNA's encoders for every asset schema, and they are
backend-neutral, so the same code runs in a build script and in a page.

## Testing

`npm test` compiles a PNG and a RIFF/WAVE file written from their own specifications — not produced
by CNA, because an importer test in which CNA reads back something CNA wrote proves nothing about
importing — and then loads the results through the real runtime. The texture assertion is the four
exact texels the PNG carried, read out of a native `Texture2D`.

It needs a CNA library and the runtime's Node bridge:

```sh
CNA_NATIVE_LIBRARY=/path/to/libcna_c_api.so npm test
```
