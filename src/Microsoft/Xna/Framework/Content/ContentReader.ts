import * as IO from "../../../../IO/index.js";
import {
  ArgumentException,
  ArgumentNullException,
  InvalidOperationException,
  NotSupportedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { Color } from "../Color.js";
import type { IDisposable, XnaAction } from "../Contracts.js";
import { Matrix } from "../Matrix.js";
import { Quaternion } from "../Quaternion.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import { Vector4 } from "../Vector4.js";
import type { ContentManager } from "./ContentManager.js";
import { ContentLoadException } from "./ContentLoadException.js";
import type { ContentTypeReader } from "./ContentTypeReader.js";
import { invokeContentTypeReaderForInternalUse } from "./ContentTypeReader.js";
import {
  contentTypeReaderVersionForInternalUse,
  createContentTypeReaderManagerForInternalUse,
  loadContentTypeReadersForInternalUse,
  type ContentTypeReaderManager,
} from "./ContentTypeReaderManager.js";

type ReaderState = {
  readonly ContentManager: ContentManager;
  readonly AssetName: string;
  readonly RecordDisposable: XnaAction<IDisposable> | null;
  Readers: readonly ContentTypeReader[];
  Versions: readonly number[];
  Manager: ContentTypeReaderManager;
  SharedResourceCount: number;
  readonly SharedFixups: Array<{ readonly Index: number; readonly Fixup: XnaAction<unknown> }>;
};
const states = new WeakMap<ContentReader, ReaderState>();

function stateOf(reader: ContentReader): ReaderState {
  const state = states.get(reader);
  if (!state) throw new TypeError("ContentReader construction did not complete");
  return state;
}

export class ContentReader extends IO.BinaryReader {
  private constructor(
    contentManager: ContentManager,
    input: Uint8Array,
    assetName: string,
    recordDisposableObject: XnaAction<IDisposable> | null,
  ) {
    super(input);
    states.set(this, {
      ContentManager: contentManager,
      AssetName: assetName,
      RecordDisposable: recordDisposableObject,
      Readers: [],
      Versions: [],
      Manager: createContentTypeReaderManagerForInternalUse(),
      SharedResourceCount: 0,
      SharedFixups: [],
    });
  }

  public get AssetName(): string { return stateOf(this).AssetName; }
  public get ContentManager(): ContentManager { return stateOf(this).ContentManager; }

  public ReadColor(): Color { return new Color(this.ReadByte(), this.ReadByte(), this.ReadByte(), this.ReadByte()); }
  public override ReadDouble(): number { return super.ReadDouble(); }
  public ReadExternalReference<T>(): T {
    const reference = this.ReadString();
    if (reference.length === 0) return undefined as T;
    throw new NativeUnavailableError(
      "ReadExternalReference<T> requires a runtime class token that the CLR generic signature does not carry",
    );
  }
  public ReadMatrix(): Matrix {
    return new Matrix(
      this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle(),
      this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle(),
      this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle(),
      this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle(),
    );
  }
  public ReadObject<T>(): T;
  public ReadObject<T>(existingInstance: T): T;
  public ReadObject<T>(typeReader: ContentTypeReader): T;
  public ReadObject<T>(typeReader: ContentTypeReader, existingInstance: T): T;
  public ReadObject<T>(readerOrExisting?: ContentTypeReader | T, existingInstance?: T): T {
    if (isTypeReader(readerOrExisting)) {
      return readAndRecord(this, readerOrExisting, existingInstance as T, arguments.length > 1);
    }
    return innerReadObject(this, readerOrExisting as T, arguments.length > 0);
  }
  public ReadQuaternion(): Quaternion {
    return new Quaternion(this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle());
  }
  public ReadRawObject<T>(): T;
  public ReadRawObject<T>(existingInstance: T): T;
  public ReadRawObject<T>(typeReader: ContentTypeReader): T;
  public ReadRawObject<T>(typeReader: ContentTypeReader, existingInstance: T): T;
  public ReadRawObject<T>(readerOrExisting?: ContentTypeReader | T, existingInstance?: T): T {
    if (isTypeReader(readerOrExisting)) {
      return readAndRecord(this, readerOrExisting, existingInstance as T, arguments.length > 1);
    }
    throw new NotSupportedException(
      "ReadRawObject<T> without an explicit ContentTypeReader cannot recover the erased TypeScript type token",
    );
  }
  public ReadSharedResource<T>(fixup: XnaAction<T>): void {
    if (fixup == null) throw new ArgumentNullException("fixup");
    const state = stateOf(this);
    const index = this.Read7BitEncodedInt32();
    if (index === 0) return;
    if (index < 1 || index > state.SharedResourceCount) {
      throw new ContentLoadException(
        `Content asset '${this.AssetName}' references shared resource ${index}, but only ${state.SharedResourceCount} exist`,
      );
    }
    state.SharedFixups.push({ Index: index - 1, Fixup: fixup as XnaAction<unknown> });
  }
  public override ReadSingle(): number { return super.ReadSingle(); }
  public ReadVector2(): Vector2 { return new Vector2(this.ReadSingle(), this.ReadSingle()); }
  public ReadVector3(): Vector3 { return new Vector3(this.ReadSingle(), this.ReadSingle(), this.ReadSingle()); }
  public ReadVector4(): Vector4 {
    return new Vector4(this.ReadSingle(), this.ReadSingle(), this.ReadSingle(), this.ReadSingle());
  }
}

function isTypeReader(value: unknown): value is ContentTypeReader {
  return value != null && typeof value === "object" &&
    "TargetType" in value && "TypeVersion" in value;
}

function innerReadObject<T>(reader: ContentReader, existing: T, hasExisting: boolean): T {
  const state = stateOf(reader);
  const index = reader.Read7BitEncodedInt32();
  if (index === 0) return undefined as T;
  if (index < 1 || index > state.Readers.length) {
    throw new ContentLoadException(
      `Content asset '${reader.AssetName}' contains invalid type reader index ${index}`,
    );
  }
  return readAndRecord(reader, state.Readers[index - 1], existing, hasExisting);
}

function readAndRecord<T>(
  input: ContentReader,
  reader: ContentTypeReader,
  existing: T,
  hasExisting: boolean,
): T {
  const state = stateOf(input);
  const value = invokeContentTypeReaderForInternalUse(reader, input, existing) as T;
  if (hasExisting && value !== existing) {
    throw new InvalidOperationException(
      "The content type reader constructed a new value instead of populating the supplied instance",
    );
  }
  if (!hasExisting && isDisposable(value)) state.RecordDisposable?.(value);
  return value;
}

function isDisposable(value: unknown): value is IDisposable {
  return value != null && typeof value === "object" &&
    "Dispose" in value && typeof value.Dispose === "function";
}

export function readXnbAssetForInternalUse<T>(
  contentManager: ContentManager,
  bytes: Uint8Array,
  assetName: string,
  recordDisposableObject: XnaAction<IDisposable>,
): T {
  try {
    if (!(bytes instanceof Uint8Array)) throw new ArgumentException("XNB input must be Uint8Array");
    const container = new IO.BinaryReader(bytes);
    if (container.ReadByte() !== 0x58 || container.ReadByte() !== 0x4e || container.ReadByte() !== 0x42) {
      throw new ContentLoadException(`Error loading '${assetName}'. Invalid XNB magic bytes`);
    }
    if (container.ReadByte() !== 0x77) {
      throw new ContentLoadException(`Error loading '${assetName}'. Invalid XNB platform`);
    }
    const versionAndProfile = container.ReadUInt16();
    const format = versionAndProfile & 0x80ff;
    if (format === 0x8005) {
      throw new NativeUnavailableError("LZX-compressed XNB payloads are not supported by this managed slice");
    }
    if (format !== 5) throw new ContentLoadException(`Error loading '${assetName}'. Invalid XNB version or flags`);
    const totalLength = container.ReadInt32();
    if (totalLength < 10 || totalLength > bytes.byteLength) {
      throw new ContentLoadException(`Error loading '${assetName}'. The XNB file is truncated`);
    }
    const payload = container.ReadBytes(container.Remaining);
    const reader = createContentReader(contentManager, payload, assetName, recordDisposableObject);
    const state = stateOf(reader);
    const table = loadContentTypeReadersForInternalUse(state.Manager, reader);
    state.Readers = table.Readers;
    state.Versions = table.Versions;
    state.SharedResourceCount = reader.Read7BitEncodedInt32();
    if (state.SharedResourceCount < 0) {
      throw new ContentLoadException(`Content asset '${assetName}' has a negative shared resource count`);
    }
    const root = innerReadObject<T>(reader, undefined as T, false);
    readSharedResources(reader);
    return finalizeDeferredRoot(root);
  } catch (error) {
    if (error instanceof ContentLoadException || error instanceof NativeUnavailableError) throw error;
    throw new ContentLoadException(
      `Error loading '${assetName}'. The XNB file is invalid`,
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

type DeferredContentRoot<T> = { FinalizeContentForInternalUse(): T };
function finalizeDeferredRoot<T>(value: T): T {
  if (value != null && typeof value === "object" &&
      "FinalizeContentForInternalUse" in value &&
      typeof (value as DeferredContentRoot<T>).FinalizeContentForInternalUse === "function") {
    return (value as DeferredContentRoot<T>).FinalizeContentForInternalUse();
  }
  return value;
}

function createContentReader(
  manager: ContentManager,
  input: Uint8Array,
  assetName: string,
  record: XnaAction<IDisposable>,
): ContentReader {
  type InternalConstructor = new (
    contentManager: ContentManager,
    bytes: Uint8Array,
    name: string,
    callback: XnaAction<IDisposable> | null,
  ) => ContentReader;
  return new (ContentReader as unknown as InternalConstructor)(manager, input, assetName, record);
}

function readSharedResources(reader: ContentReader): void {
  const state = stateOf(reader);
  const resources = Array.from(
    { length: state.SharedResourceCount },
    () => innerReadObject<unknown>(reader, undefined, false),
  );
  for (const fixup of state.SharedFixups) {
    const value = resources[fixup.Index];
    if (value == null) {
      throw new ContentLoadException(
        `Content asset '${reader.AssetName}' shared resource ${fixup.Index + 1} is null`,
      );
    }
    fixup.Fixup(value);
  }
}

export function contentTypeReaderVersionForReaderInternalUse(
  input: ContentReader,
  reader: ContentTypeReader,
): number {
  const state = stateOf(input);
  return contentTypeReaderVersionForInternalUse(state.Readers, state.Versions, reader);
}
