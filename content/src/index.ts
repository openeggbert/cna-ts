/**
 * `cna-ts-content` — build-time content tooling for CNA.
 *
 * This is deliberately **not** part of `cna-ts`. `docs/content-pipeline-boundary.md` measured XNA's
 * Content Pipeline and decided against projecting it: four of its load-bearing mechanisms —
 * attribute-driven discovery, a reflection-based `IntermediateSerializer`, MSBuild tasks and XNB
 * output — have no JavaScript or CNA counterpart, so a projection would be a shape with nothing
 * behind it. What CNA *does* have is a content compiler, and this package is the API for it.
 *
 * ```ts
 * import { LoadContentToolchain, ImportTexture2D } from "cna-ts-content";
 * import { writeFileSync } from "node:fs";
 *
 * await LoadContentToolchain({ CnaLibrary: "./libcna_c_api.so", BridgeModule: "./bridge.node" });
 * const hero = ImportTexture2D("art/hero.png", "Sprites/Hero");
 * writeFileSync("Content/Sprites/Hero.cnb", hero.Image);
 * ```
 *
 * ## What crosses the boundary, and what does not
 *
 * **Bytes cross. Handles do not.** Every operation here imports, describes, encodes and releases
 * inside one native call, and hands back a finished `.cnb` image. That is CNB's own contract — a
 * build tool produces bytes and a runtime reads them — and it means this package owns no native
 * lifetime at all: there is nothing here to `Dispose`, and nothing a caller can leak.
 *
 * It also keeps the two packages honestly apart. `cna-ts` is the runtime and runs in a browser;
 * nothing in it takes a filesystem path or names a compiler. These three routes are the only ones
 * in the whole binding that read a file by path, and they live here.
 *
 * ## What this is not
 *
 * It does not write `.xnb`. CNA has no XNB writer, and calling this an XNA Content Pipeline would
 * be false in both directions: it compiles to a different format and it is driven by function calls
 * rather than by `.contentproj` and MSBuild. `cna-ts`'s `ContentManager` still *reads* XNB, which
 * is a separate and true claim.
 */

import { createRequire } from "node:module";
import path from "node:path";

/** The description CNA reports for an imported texture, beside its compiled bytes. */
export interface ImportedTexture {
  /** The complete `.cnb` container image, ready to write to disk. */
  readonly Image: Uint8Array;
  readonly Width: number;
  readonly Height: number;
  readonly Depth: number;
  /** Six for a cube map, one otherwise. */
  readonly FaceCount: number;
  readonly MipCount: number;
  /** How many alternative encodings of the same image the container carries. */
  readonly RepresentationCount: number;
}

/** The description CNA reports for an imported sound effect, beside its compiled bytes. */
export interface ImportedSoundEffect {
  /** The complete `.cnb` container image, ready to write to disk. */
  readonly Image: Uint8Array;
  /** A `CnbAudioFormat` value, as `cna-ts/extensions/content` names them. */
  readonly Format: number;
  readonly SampleRate: number;
  readonly Channels: number;
  readonly FrameCount: number;
  readonly LoopStart: number;
  readonly LoopLength: number;
}

/**
 * What compiling one `.cnj` produced.
 *
 * The two lists are why this is worth more than the bytes alone: `AbsorbedFiles` is every sidecar
 * the compiler read and folded into the image, which is a build system's dependency set, and
 * `ExternalReferences` is every asset the image names but does not carry, which is what a build
 * system must compile next.
 */
export interface CompiledCnj {
  /** CNA's numeric identity for the asset type the document declared. */
  readonly AssetTypeId: number;
  /** Its name, as CNA reports it. */
  readonly AssetTypeName: string;
  /** The compiled `.cnb` image. */
  readonly Bytes: Uint8Array;
  /** Every file the compiler read and absorbed, as paths. */
  readonly AbsorbedFiles: readonly string[];
  /** Every asset the image refers to but does not carry, as logical names. */
  readonly ExternalReferences: readonly string[];
}

/** A colour to treat as transparent while importing, as three 0-255 components. */
export interface ColorKey {
  readonly R: number;
  readonly G: number;
  readonly B: number;
}

/** Where the toolchain's CNA library and its Node-API bridge live. */
export interface ContentToolchainOptions {
  /** Path to a `libcna_c_api` shared library whose ABI this generation accepts. */
  readonly CnaLibrary: string;
  /** Path to the built `cna_node_bridge` addon. */
  readonly BridgeModule: string;
}

/** What `LoadContentToolchain` reports about the library it opened. */
export interface ContentToolchainStatus {
  readonly AbiVersion: string;
  /** True when this call opened the library, false when one was already open in this process. */
  readonly Opened: boolean;
}

interface ContentBridge {
  loadLibrary(path: string): void;
  isLibraryLoaded(): boolean;
  abiVersion(): number;
  cnbImportImageAsTexture2D(
    imagePath: string, colorKey: readonly number[] | null, contentName: string,
  ): ImportedTexture;
  cnbImportDdsAsTextureCube(ddsPath: string, contentName: string): ImportedTexture;
  cnbImportWavAsSoundEffect(wavPath: string, contentName: string): ImportedSoundEffect;
  cnbCompileCnj(cnjPath: string, contentRoot: string, contentName: string): CompiledCnj;
}

let bridge: ContentBridge | null = null;

function toolchain(operation: string): ContentBridge {
  if (bridge == null) {
    throw new Error(
      `${operation} needs a CNA content toolchain; call LoadContentToolchain first`,
    );
  }
  return bridge;
}

/** Decodes the packed `uint32_t` CNA reports for its ABI version. */
function decodeAbi(encoded: number): string {
  const value = encoded >>> 0;
  return `${(value >>> 16) & 0xffff}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

/**
 * Opens a CNA library through the Node-API bridge and makes the importers usable.
 *
 * The bridge refuses a second library in one process, and Node's module cache means a build script
 * that also runs a game shares this one. So an already-open library is **not** an error here: the
 * toolchain adopts it and says so through {@link ContentToolchainStatus.Opened}.
 */
export async function LoadContentToolchain(
  options: ContentToolchainOptions,
): Promise<ContentToolchainStatus> {
  if (options == null || typeof options.CnaLibrary !== "string" || options.CnaLibrary.length === 0) {
    throw new TypeError("CnaLibrary must be a non-empty path");
  }
  if (typeof options.BridgeModule !== "string" || options.BridgeModule.length === 0) {
    throw new TypeError("BridgeModule must be a non-empty path");
  }
  const require = createRequire(import.meta.url);
  const loaded = require(path.resolve(options.BridgeModule)) as ContentBridge;
  const already = loaded.isLibraryLoaded();
  if (!already) loaded.loadLibrary(path.resolve(options.CnaLibrary));
  bridge = loaded;
  return Object.freeze({ AbiVersion: decodeAbi(loaded.abiVersion()), Opened: !already });
}

/** Whether a toolchain has been loaded in this process. */
export function IsContentToolchainLoaded(): boolean {
  return bridge != null;
}

/**
 * Compiles a PNG, JPEG or BMP file into a `.cnb` Texture2D container.
 *
 * This is what XNA's `TextureImporter` assembly did, through CNA's own importer. `contentName` is
 * the logical asset name written into the container's metadata — the name a game will load it by,
 * not the file path.
 *
 * @param colorKey A colour to make transparent, or `null` for none. XNA's processors defaulted to
 *   keying magenta; CNA does not, so a caller that wants that behaviour asks for it.
 */
export function ImportTexture2D(
  imagePath: string, contentName: string, colorKey: ColorKey | null = null,
): ImportedTexture {
  if (typeof imagePath !== "string" || imagePath.length === 0) {
    throw new TypeError("imagePath must be a non-empty path");
  }
  if (typeof contentName !== "string") throw new TypeError("contentName must be a string");
  const key = colorKey == null ? null : [colorKey.R, colorKey.G, colorKey.B];
  const imported = toolchain("ImportTexture2D")
    .cnbImportImageAsTexture2D(path.resolve(imagePath), key, contentName);
  return Object.freeze({ ...imported, Image: new Uint8Array(imported.Image) });
}

/** Compiles a DDS cube map into a `.cnb` texture container. */
export function ImportTextureCube(ddsPath: string, contentName: string): ImportedTexture {
  if (typeof ddsPath !== "string" || ddsPath.length === 0) {
    throw new TypeError("ddsPath must be a non-empty path");
  }
  if (typeof contentName !== "string") throw new TypeError("contentName must be a string");
  const imported = toolchain("ImportTextureCube")
    .cnbImportDdsAsTextureCube(path.resolve(ddsPath), contentName);
  return Object.freeze({ ...imported, Image: new Uint8Array(imported.Image) });
}

/**
 * Compiles a RIFF/WAVE file into a `.cnb` SoundEffect container.
 *
 * This is what XNA's `AudioImporters` assembly did. The description that comes back is CNA's, read
 * from the imported effect before it was encoded, so a build script can report what it produced
 * without parsing the container it just wrote.
 */
export function ImportSoundEffect(wavPath: string, contentName: string): ImportedSoundEffect {
  if (typeof wavPath !== "string" || wavPath.length === 0) {
    throw new TypeError("wavPath must be a non-empty path");
  }
  if (typeof contentName !== "string") throw new TypeError("contentName must be a string");
  const imported = toolchain("ImportSoundEffect")
    .cnbImportWavAsSoundEffect(path.resolve(wavPath), contentName);
  return Object.freeze({ ...imported, Image: new Uint8Array(imported.Image) });
}

/**
 * Compiles one `.cnj` document, and the binary sidecars it names, into a `.cnb` image.
 *
 * `.cnj` is CNA's own source format for content: a small JSON document declaring an asset type and
 * either carrying its values inline or pointing at files beside it. It is the closest thing CNA has
 * to XNA's `.contentproj` item — with the difference that the document *is* the asset description,
 * rather than a build file naming a processor to run.
 *
 * Every one of CNA's eight asset types compiles: `Curve`, `AnimationClip`, `Model`, `Texture2D`,
 * `Texture3D`, `TextureCube`, `SpriteFont` and `SoundEffect`. Anything else is refused by name
 * rather than producing an empty file.
 *
 * The two lists on the result are what make this useful to a build system rather than only to a
 * loader: {@link CompiledCnj.AbsorbedFiles} is the dependency set to watch, and
 * {@link CompiledCnj.ExternalReferences} is what still has to be compiled.
 *
 * @param cnjPath The document to compile.
 * @param contentRoot Where sidecar references resolve against; empty for the document's own
 *        directory, which is where CNA's content tools write them.
 * @param contentName The logical name recorded in the image; empty for the document's stem.
 */
export function CompileCnj(
  cnjPath: string, contentRoot = "", contentName = "",
): CompiledCnj {
  if (typeof cnjPath !== "string" || cnjPath.length === 0) {
    throw new TypeError("cnjPath must be a non-empty path");
  }
  if (typeof contentRoot !== "string") throw new TypeError("contentRoot must be a string");
  if (typeof contentName !== "string") throw new TypeError("contentName must be a string");
  const compiled = toolchain("CompileCnj").cnbCompileCnj(
    path.resolve(cnjPath),
    // An empty root stays empty: that is how CNA is told to use the document's own directory, and
    // resolving it here would substitute the build script's working directory for that.
    contentRoot === "" ? "" : path.resolve(contentRoot),
    contentName,
  );
  return Object.freeze({
    ...compiled,
    Bytes: new Uint8Array(compiled.Bytes),
    AbsorbedFiles: Object.freeze([...compiled.AbsorbedFiles]),
    ExternalReferences: Object.freeze([...compiled.ExternalReferences]),
  });
}
