import {
  ArgumentNullException,
  InvalidOperationException,
} from "../../../../internal/exceptions.js";
import type { XnaType } from "../Contracts.js";
import type { ContentReader } from "./ContentReader.js";
import type { ContentTypeReaderManager } from "./ContentTypeReaderManager.js";

/** Base of one reader-table entry in a managed XNB object graph. */
export abstract class ContentTypeReader {
  readonly #targetType: XnaType<unknown>;

  protected constructor(targetType: XnaType<unknown>) {
    if (targetType == null) throw new ArgumentNullException("targetType");
    this.#targetType = targetType;
  }

  public get CanDeserializeIntoExistingObject(): boolean { return false; }
  public get TargetType(): XnaType<unknown> { return this.#targetType; }
  public get TypeVersion(): number { return 0; }

  protected Initialize(manager: ContentTypeReaderManager): void {
    if (manager == null) throw new ArgumentNullException("manager");
  }

  protected abstract Read(input: ContentReader, existingInstance: unknown): unknown;
}

const genericTargets = new WeakMap<Function, XnaType<unknown>>();

/** Strongly typed reader base; its target token is registered before XNB activation. */
export abstract class ContentTypeReaderOfT<T> extends ContentTypeReader {
  protected constructor() {
    const target = genericTargets.get(new.target);
    if (!target) {
      throw new InvalidOperationException(
        "Register the ContentTypeReaderOfT constructor and target class token before activation",
      );
    }
    super(target);
  }

  protected abstract override Read(input: ContentReader, existingInstance: unknown): unknown;
  protected abstract override Read(input: ContentReader, existingInstance: T): T;
}

export type ContentTypeReaderConstructor = new () => ContentTypeReader;

export function bindContentTypeReaderTargetForInternalUse(
  readerType: ContentTypeReaderConstructor,
  targetType: XnaType<unknown>,
): void {
  genericTargets.set(readerType, targetType);
}

export function initializeContentTypeReaderForInternalUse(
  reader: ContentTypeReader,
  manager: ContentTypeReaderManager,
): void {
  type InitializableReader = { Initialize(manager: ContentTypeReaderManager): void };
  (reader as unknown as InitializableReader).Initialize(manager);
}

export function invokeContentTypeReaderForInternalUse(
  reader: ContentTypeReader,
  input: ContentReader,
  existingInstance: unknown,
): unknown {
  type InvokableReader = { Read(input: ContentReader, existingInstance: unknown): unknown };
  return (reader as unknown as InvokableReader).Read(input, existingInstance);
}
