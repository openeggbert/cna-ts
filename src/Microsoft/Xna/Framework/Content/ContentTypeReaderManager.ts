import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import type { XnaType } from "../Contracts.js";
import { ContentLoadException } from "./ContentLoadException.js";
import type { ContentReader } from "./ContentReader.js";
import {
  bindContentTypeReaderTargetForInternalUse,
  type ContentTypeReader,
  type ContentTypeReaderConstructor,
  initializeContentTypeReaderForInternalUse,
} from "./ContentTypeReader.js";

type ReaderRegistration = {
  readonly Constructor: ContentTypeReaderConstructor;
  readonly TargetType: XnaType<unknown>;
};
const registrations = new Map<string, ReaderRegistration>();
const managerReaders = new WeakMap<ContentTypeReaderManager, Map<XnaType<unknown>, ContentTypeReader>>();

export class ContentTypeReaderManager {
  public GetTypeReader(targetType: XnaType<unknown>): ContentTypeReader {
    if (targetType == null) throw new ArgumentNullException("targetType");
    return managerState(this).get(targetType) as ContentTypeReader;
  }
}

function managerState(manager: ContentTypeReaderManager): Map<XnaType<unknown>, ContentTypeReader> {
  let state = managerReaders.get(manager);
  if (!state) {
    state = new Map();
    managerReaders.set(manager, state);
  }
  return state;
}

export function registerContentTypeReaderForInternalUse(
  serializedName: string,
  readerType: ContentTypeReaderConstructor,
  targetType: XnaType<unknown>,
): () => void {
  if (!serializedName?.trim()) throw new ArgumentNullException("serializedName");
  if (readerType == null) throw new ArgumentNullException("readerType");
  if (targetType == null) throw new ArgumentNullException("targetType");
  const key = stripAssemblyQualification(serializedName);
  const registration = { Constructor: readerType, TargetType: targetType };
  registrations.set(key, registration);
  bindContentTypeReaderTargetForInternalUse(readerType, targetType);
  return () => {
    if (registrations.get(key) === registration) registrations.delete(key);
  };
}

export function createContentTypeReaderManagerForInternalUse(): ContentTypeReaderManager {
  const manager = new ContentTypeReaderManager();
  managerReaders.set(manager, new Map());
  return manager;
}

export function loadContentTypeReadersForInternalUse(
  manager: ContentTypeReaderManager,
  input: ContentReader,
): { readonly Readers: readonly ContentTypeReader[]; readonly Versions: readonly number[] } {
  const count = input.Read7BitEncodedInt32();
  if (!Number.isInteger(count) || count < 0 || count > 4096) {
    throw new ContentLoadException(`Content asset '${input.AssetName}' has invalid type reader count ${count}`);
  }
  const readers: ContentTypeReader[] = [];
  const versions: number[] = [];
  const byTarget = managerState(manager);
  for (let index = 0; index < count; index += 1) {
    const serializedName = input.ReadString();
    const registration = registrations.get(stripAssemblyQualification(serializedName));
    if (!registration) {
      throw new ContentLoadException(
        `Could not find ContentTypeReader '${serializedName}' while loading '${input.AssetName}'`,
      );
    }
    let reader: ContentTypeReader;
    try {
      reader = new registration.Constructor();
    } catch (error) {
      throw new ContentLoadException(
        `Failed to construct content type reader '${serializedName}'`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    const version = input.ReadInt32();
    if (version !== reader.TypeVersion) {
      throw new ContentLoadException(
        `Content asset '${input.AssetName}' has an incompatible reader version ${version}`,
      );
    }
    readers.push(reader);
    versions.push(version);
    if (!byTarget.has(reader.TargetType)) byTarget.set(reader.TargetType, reader);
  }
  for (const reader of readers) initializeContentTypeReaderForInternalUse(reader, manager);
  return { Readers: readers, Versions: versions };
}

export function contentTypeReaderVersionForInternalUse(
  readers: readonly ContentTypeReader[],
  versions: readonly number[],
  reader: ContentTypeReader,
): number {
  const index = readers.indexOf(reader);
  if (index < 0) throw new ArgumentOutOfRangeException("reader");
  return versions[index];
}

function stripAssemblyQualification(value: string): string {
  let result = "";
  let depth = 0;
  let skipping = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "[") {
      depth += 1;
      skipping = false;
      result += character;
    } else if (character === "]") {
      depth -= 1;
      skipping = false;
      result += character;
    } else if (character === ",") {
      if (depth === 0) break;
      skipping = true;
    } else if (!skipping) {
      result += character;
    }
  }
  return result.trim();
}
