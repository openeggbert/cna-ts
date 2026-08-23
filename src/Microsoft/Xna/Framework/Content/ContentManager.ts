import {
  ArgumentNullException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import type {
  IDisposable,
  IServiceProvider,
  XnaAction,
  XnaType,
} from "../Contracts.js";
import { ContentLoadException } from "./ContentLoadException.js";
import { readXnbAssetForInternalUse } from "./ContentReader.js";

function cleanPath(value: string): string {
  let path = value.replaceAll("/", "\\").replaceAll("\\.\\", "\\");
  while (path.startsWith(".\\")) path = path.slice(2);
  while (path.endsWith("\\.")) path = path.length <= 2 ? "\\" : path.slice(0, -2);

  let searchFrom = 1;
  while (searchFrom < path.length) {
    const position = path.indexOf("\\..\\", searchFrom);
    if (position < 0) break;
    const start = path.lastIndexOf("\\", position - 1) + 1;
    path = path.slice(0, start) + path.slice(position + 4);
    searchFrom = Math.max(start - 1, 1);
  }
  if (path.endsWith("\\..")) {
    const position = path.length - 3;
    if (position > 0) {
      const start = path.lastIndexOf("\\", position - 1) + 1;
      path = path.slice(0, start) + path.slice(position + 3);
    }
  }
  return path === "." ? "" : path;
}

function isInstance<T>(type: XnaType<T>, value: unknown): value is T {
  if (typeof type !== "function") return false;
  return Function.prototype[Symbol.hasInstance].call(type, value) as boolean;
}

/** Managed XNA content cache, lifetime, and XNB reader pipeline. */
export class ContentManager implements IDisposable {
  readonly #serviceProvider: IServiceProvider;
  readonly #loadedAssets = new Map<string, unknown>();
  readonly #disposableAssets: IDisposable[] = [];
  readonly #loadingAssets: string[] = [];
  #rootDirectory: string;
  #disposed = false;

  public constructor(serviceProvider: IServiceProvider);
  public constructor(serviceProvider: IServiceProvider, rootDirectory: string);
  public constructor(serviceProvider: IServiceProvider, rootDirectory = "") {
    if (serviceProvider == null) throw new ArgumentNullException("serviceProvider");
    if (rootDirectory == null) throw new ArgumentNullException("rootDirectory");
    this.#serviceProvider = serviceProvider;
    this.#rootDirectory = rootDirectory;
  }

  public get ServiceProvider(): IServiceProvider { return this.#serviceProvider; }

  public get RootDirectory(): string { return this.#rootDirectory; }
  public set RootDirectory(value: string) {
    if (value == null) throw new ArgumentNullException("value");
    if (this.#loadedAssets.size > 0) {
      throw new InvalidOperationException("RootDirectory cannot change while assets are loaded");
    }
    this.#rootDirectory = value;
  }

  public Load<T>(assetType: XnaType<T>, assetName: string): T {
    this.#ensureUsable();
    if (assetType == null) throw new ArgumentNullException("assetType");
    if (assetName == null || assetName === "") throw new ArgumentNullException("assetName");
    const cleanedName = cleanPath(assetName);
    const key = cleanedName.toLowerCase();
    if (this.#loadedAssets.has(key)) {
      const cached = this.#loadedAssets.get(key);
      if (!isInstance(assetType, cached)) {
        throw new ContentLoadException(`Asset '${cleanedName}' was previously loaded with another type`);
      }
      return cached;
    }
    const cycleIndex = this.#loadingAssets.indexOf(key);
    if (cycleIndex >= 0) {
      const cycle = [...this.#loadingAssets.slice(cycleIndex), key].join(" -> ");
      throw new ContentLoadException(`Circular external content reference: ${cycle}`);
    }

    const acquired: IDisposable[] = [];
    this.#loadingAssets.push(key);
    try {
      const value = this.ReadAsset<T>(cleanedName, (asset) => acquired.push(asset));
      if (!isInstance(assetType, value)) {
        throw new ContentLoadException(`Asset '${cleanedName}' did not produce the requested runtime type`);
      }
      this.#loadedAssets.set(key, value);
      this.#disposableAssets.push(...acquired);
      return value;
    } catch (error) {
      for (const asset of acquired.reverse()) {
        try { asset.Dispose(); } catch { /* Preserve the load failure as the primary error. */ }
      }
      throw error;
    } finally {
      this.#loadingAssets.pop();
    }
  }

  protected OpenStream(assetName: string): Uint8Array {
    void assetName;
    throw new NativeUnavailableError("ContentManager.OpenStream requires a loaded CNA content backend");
  }

  protected ReadAsset<T>(
    assetName: string,
    recordDisposableObject: XnaAction<IDisposable>,
  ): T {
    const input = this.OpenStream(assetName);
    return readXnbAssetForInternalUse<T>(this, input, assetName, recordDisposableObject);
  }

  public Unload(): void {
    this.#ensureUsable();
    try {
      for (const asset of this.#disposableAssets) asset.Dispose();
    } finally {
      this.#loadedAssets.clear();
      this.#disposableAssets.length = 0;
      this.#loadingAssets.length = 0;
    }
  }

  public Dispose(): void {
    if (this.#disposed) return;
    try {
      this.Unload();
    } finally {
      this.#disposed = true;
    }
  }

  #ensureUsable(): void {
    if (this.#disposed) throw new ObjectDisposedException("ContentManager");
  }
}
