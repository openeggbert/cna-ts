import * as IO from "../../../../IO/index.js";
import type { CnaStorageBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { EventDispatcher } from "../../../../internal/events.js";
import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import type { AsyncCallback, IAsyncResult } from "../../../../internal/system-compat.js";
import type { IDisposable, XnaEvent } from "../Contracts.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import { EventArgs } from "../EventArgs.js";
import { PlayerIndex } from "../PlayerIndex.js";

type FsModule = typeof import("node:fs");
type OsModule = typeof import("node:os");
type PathModule = typeof import("node:path");

type NodeStorage = { readonly Fs: FsModule; readonly Path: PathModule; readonly Root: string };

class StorageAsyncResult<T> implements IAsyncResult {
  // The operation always yields to the microtask queue before it completes, so it never finishes
  // inside the Begin call that started it.
  public readonly CompletedSynchronously = false;
  public IsCompleted = false;
  public Value: T | null = null;
  public Error: unknown = null;
  public constructor(public readonly AsyncState: unknown) {}
}

function start<T>(state: unknown, callback: AsyncCallback, operation: () => Promise<T>): StorageAsyncResult<T> {
  const result = new StorageAsyncResult<T>(state);
  void operation().then(
    (value) => { result.Value = value; result.IsCompleted = true; callback?.(result); },
    (error) => { result.Error = error; result.IsCompleted = true; callback?.(result); },
  );
  return result;
}

function finish<T>(value: IAsyncResult, label: string): T {
  if (!(value instanceof StorageAsyncResult)) throw new ArgumentException(`${label} received an unrelated async result`);
  if (!value.IsCompleted) throw new InvalidOperationException(`${label} must be called after the selector callback`);
  if (value.Error) throw value.Error;
  return value.Value as T;
}

async function createDevice(
  player: PlayerIndex | null,
  sizeInBytes: number | null,
  directoryCount: number | null,
): Promise<StorageDevice> {
  const native = getBackend().Storage;
  if (native) {
    const handle = native.selectStorageDevice(player, sizeInBytes, directoryCount);
    const lifetime = new NativeResourceLifetime({
      Handle: handle,
      Ownership: "owned",
      Parent: native.ParentLifetime,
      Release: (value) => native.destroyStorageDevice(value),
      Label: "StorageDevice",
    });
    return createNativeStorageDeviceForInternalUse(native, lifetime);
  }
  const [fs, os, path] = await Promise.all([import("node:fs"), import("node:os"), import("node:path")]);
  const root = fs.mkdtempSync(path.join((os as OsModule).tmpdir(), "cna-ts-storage-"));
  return createStorageDeviceForInternalUse({ Fs: fs, Path: path, Root: root });
}

type DeviceState = {
  readonly Kind: "managed";
  readonly Storage: NodeStorage;
  readonly Containers: Map<string, StorageContainer>;
} | {
  readonly Kind: "native";
  readonly Backend: CnaStorageBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly Containers: Map<string, StorageContainer>;
};
const deviceStates = new WeakMap<StorageDevice, DeviceState>();
const deviceChanged = new EventDispatcher<unknown, EventArgs>();

function deviceState(device: StorageDevice): DeviceState {
  const state = deviceStates.get(device);
  if (!state) throw new StorageDeviceNotConnectedException("The storage device is not connected");
  return state;
}

function validateContainerName(value: string, name: string): string {
  if (value == null || value.length === 0) throw new ArgumentNullException(name);
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new ArgumentException(`${name} must be a single storage-container name`);
  }
  return value;
}

export class StorageDevice {
  public static readonly DeviceChanged: XnaEvent<unknown, EventArgs> = deviceChanged;

  private constructor() {}

  public static BeginShowSelector(callback: AsyncCallback, state: unknown): IAsyncResult;
  public static BeginShowSelector(player: PlayerIndex, callback: AsyncCallback, state: unknown): IAsyncResult;
  public static BeginShowSelector(sizeInBytes: number, directoryCount: number, callback: AsyncCallback, state: unknown): IAsyncResult;
  public static BeginShowSelector(player: PlayerIndex, sizeInBytes: number, directoryCount: number, callback: AsyncCallback, state: unknown): IAsyncResult;
  public static BeginShowSelector(
    playerOrSizeOrCallback: PlayerIndex | number | AsyncCallback,
    sizeOrDirectoryOrState: number | AsyncCallback | unknown,
    directoryOrCallback?: number | AsyncCallback,
    callbackOrState?: AsyncCallback | unknown,
    stateValue?: unknown,
  ): IAsyncResult {
    let callback: AsyncCallback;
    let state: unknown;
    let player: PlayerIndex | null = null;
    let size: number | undefined;
    let directories: number | undefined;
    if (typeof playerOrSizeOrCallback === "function") {
      callback = playerOrSizeOrCallback as AsyncCallback;
      state = sizeOrDirectoryOrState;
    } else if (typeof sizeOrDirectoryOrState === "function") {
      player = playerOrSizeOrCallback as PlayerIndex;
      callback = sizeOrDirectoryOrState as AsyncCallback;
      state = directoryOrCallback;
    } else if (typeof directoryOrCallback === "function") {
      size = playerOrSizeOrCallback as number;
      directories = sizeOrDirectoryOrState as number;
      callback = directoryOrCallback as AsyncCallback;
      state = callbackOrState;
    } else {
      player = playerOrSizeOrCallback as PlayerIndex;
      size = sizeOrDirectoryOrState as number;
      directories = directoryOrCallback as number;
      callback = callbackOrState as AsyncCallback;
      state = stateValue;
    }
    if (size !== undefined && (!Number.isInteger(size) || size < 0 || size > 0x7fff_ffff)) {
      throw new ArgumentOutOfRangeException("sizeInBytes");
    }
    if (directories !== undefined && (!Number.isInteger(directories) || directories < 0 || directories > 0x7fff_ffff)) {
      throw new ArgumentOutOfRangeException("directoryCount");
    }
    return start(state, callback, () => createDevice(player, size ?? null, directories ?? null));
  }

  public static EndShowSelector(result: IAsyncResult): StorageDevice {
    return finish<StorageDevice>(result, "EndShowSelector");
  }

  public get IsConnected(): boolean {
    const state = deviceStates.get(this);
    if (!state) return false;
    if (state.Kind === "native") {
      return state.Lifetime.State === "active" &&
        state.Backend.getStorageDeviceInfo(state.Lifetime.Handle).IsConnected;
    }
    return true;
  }
  public get FreeSpace(): bigint {
    const state = deviceState(this);
    if (state.Kind === "native") {
      return state.Backend.getStorageDeviceInfo(state.Lifetime.Handle).FreeSpace;
    }
    const { Storage } = state;
    const stats = Storage.Fs.statfsSync(Storage.Root, { bigint: true });
    return stats.bavail * stats.bsize;
  }
  public get TotalSpace(): bigint {
    const state = deviceState(this);
    if (state.Kind === "native") {
      return state.Backend.getStorageDeviceInfo(state.Lifetime.Handle).TotalSpace;
    }
    const { Storage } = state;
    const stats = Storage.Fs.statfsSync(Storage.Root, { bigint: true });
    return stats.blocks * stats.bsize;
  }

  public BeginOpenContainer(displayName: string, callback: AsyncCallback, state: unknown): IAsyncResult {
    displayName = validateContainerName(displayName, "displayName");
    return start(state, callback, async () => {
      const current = deviceState(this);
      const existing = current.Containers.get(displayName);
      if (existing && !existing.IsDisposed) return existing;
      if (current.Kind === "native") {
        const handle = current.Backend.openStorageContainer(current.Lifetime.Handle, displayName);
        const result = createNativeStorageContainerForInternalUse(
          this, current.Backend, current.Lifetime, handle,
        );
        current.Containers.set(displayName, result);
        return result;
      }
      const root = current.Storage.Path.join(current.Storage.Root, displayName);
      current.Storage.Fs.mkdirSync(root, { recursive: true });
      const result = createStorageContainerForInternalUse(this, displayName, root, current.Storage);
      current.Containers.set(displayName, result);
      return result;
    });
  }

  public EndOpenContainer(result: IAsyncResult): StorageContainer {
    return finish<StorageContainer>(result, "EndOpenContainer");
  }

  public DeleteContainer(titleName: string): void {
    titleName = validateContainerName(titleName, "titleName");
    const state = deviceState(this);
    state.Containers.get(titleName)?.Dispose();
    state.Containers.delete(titleName);
    if (state.Kind === "native") {
      state.Backend.deleteStorageContainer(state.Lifetime.Handle, titleName);
      return;
    }
    state.Storage.Fs.rmSync(state.Storage.Path.join(state.Storage.Root, titleName), {
      recursive: true,
      force: true,
    });
  }
}

function createStorageDeviceForInternalUse(storage: NodeStorage): StorageDevice {
  const result = Object.create(StorageDevice.prototype) as StorageDevice;
  deviceStates.set(result, { Kind: "managed", Storage: storage, Containers: new Map() });
  return result;
}

function createNativeStorageDeviceForInternalUse(
  backend: CnaStorageBackend,
  lifetime: NativeResourceLifetime,
): StorageDevice {
  const result = Object.create(StorageDevice.prototype) as StorageDevice;
  deviceStates.set(result, { Kind: "native", Backend: backend, Lifetime: lifetime, Containers: new Map() });
  return result;
}

type ManagedContainerState = {
  readonly Kind: "managed";
  readonly Device: StorageDevice;
  readonly Storage: NodeStorage;
  readonly Root: string;
  readonly DisplayName: string;
  readonly Events: EventDispatcher<unknown, EventArgs>;
  Disposed: boolean;
};
type NativeContainerState = {
  readonly Kind: "native";
  readonly Device: StorageDevice;
  readonly Backend: CnaStorageBackend;
  readonly Lifetime: NativeResourceLifetime;
  readonly DisplayName: string;
  readonly Events: EventDispatcher<unknown, EventArgs>;
  Disposed: boolean;
};
type ContainerState = ManagedContainerState | NativeContainerState;
const containerStates = new WeakMap<StorageContainer, ContainerState>();

function containerState(container: StorageContainer): ContainerState {
  const state = containerStates.get(container);
  if (!state || state.Disposed || (state.Kind === "native" && state.Lifetime.State !== "active")) {
    throw new ObjectDisposedException("StorageContainer");
  }
  return state;
}

function storagePath(state: ManagedContainerState, value: string, name: string): string {
  if (value == null || value.length === 0) throw new ArgumentNullException(name);
  if (state.Storage.Path.isAbsolute(value)) throw new ArgumentException(`${name} must be relative`);
  const resolved = state.Storage.Path.resolve(state.Root, value);
  const prefix = `${state.Storage.Path.resolve(state.Root)}${state.Storage.Path.sep}`;
  if (resolved !== state.Storage.Path.resolve(state.Root) && !resolved.startsWith(prefix)) {
    throw new ArgumentException(`${name} escapes the storage container`);
  }
  return resolved;
}

function patternRegex(pattern: string): RegExp {
  if (pattern == null || pattern.length === 0) throw new ArgumentNullException("searchPattern");
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i");
}

export class StorageContainer implements IDisposable {
  public readonly Disposing: XnaEvent<unknown, EventArgs>;
  private constructor(events: EventDispatcher<unknown, EventArgs>) { this.Disposing = events; }
  public get DisplayName(): string { return containerState(this).DisplayName; }
  public get IsDisposed(): boolean {
    const state = containerStates.get(this);
    return !state || state.Disposed || (state.Kind === "native" && state.Lifetime.State !== "active");
  }
  public get StorageDevice(): StorageDevice { return containerState(this).Device; }

  public CreateDirectory(directory: string): void {
    const state = containerState(this);
    if (state.Kind === "native") {
      state.Backend.createStorageDirectory(state.Lifetime.Handle, directory);
      return;
    }
    state.Storage.Fs.mkdirSync(storagePath(state, directory, "directory"), { recursive: true });
  }
  public DirectoryExists(directory: string): boolean {
    const state = containerState(this);
    if (state.Kind === "native") {
      return state.Backend.storageDirectoryExists(state.Lifetime.Handle, directory);
    }
    const target = storagePath(state, directory, "directory");
    return state.Storage.Fs.existsSync(target) && state.Storage.Fs.readdirSync(
      state.Storage.Path.resolve(target, ".."), { withFileTypes: true },
    ).some((entry) => entry.name === target.slice(target.lastIndexOf(state.Storage.Path.sep) + 1) && entry.isDirectory());
  }
  public DeleteDirectory(directory: string): void {
    const state = containerState(this);
    if (state.Kind === "native") {
      state.Backend.deleteStorageDirectory(state.Lifetime.Handle, directory);
      return;
    }
    state.Storage.Fs.rmSync(storagePath(state, directory, "directory"), { recursive: true, force: false });
  }
  public GetDirectoryNames(): string[];
  public GetDirectoryNames(searchPattern: string): string[];
  public GetDirectoryNames(searchPattern = "*"): string[] {
    const state = containerState(this);
    if (state.Kind === "native") {
      return [...state.Backend.getStorageDirectoryNames(state.Lifetime.Handle, searchPattern)].sort();
    }
    const regex = patternRegex(searchPattern);
    return state.Storage.Fs.readdirSync(state.Root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && regex.test(entry.name)).map((entry) => entry.name).sort();
  }

  public CreateFile(file: string): Uint8Array {
    const state = containerState(this);
    if (state.Kind === "native") {
      state.Backend.createStorageFile(state.Lifetime.Handle, file);
      return new Uint8Array();
    }
    const target = storagePath(state, file, "file");
    state.Storage.Fs.mkdirSync(state.Storage.Path.resolve(target, ".."), { recursive: true });
    const bytes = new Uint8Array();
    state.Storage.Fs.writeFileSync(target, bytes);
    return bytes;
  }
  public FileExists(file: string): boolean {
    const state = containerState(this);
    if (state.Kind === "native") {
      return state.Backend.storageFileExists(state.Lifetime.Handle, file);
    }
    const target = storagePath(state, file, "file");
    return state.Storage.Fs.existsSync(target) && state.Storage.Fs.readdirSync(
      state.Storage.Path.resolve(target, ".."), { withFileTypes: true },
    ).some((entry) => entry.name === target.slice(target.lastIndexOf(state.Storage.Path.sep) + 1) && entry.isFile());
  }
  public DeleteFile(file: string): void {
    const state = containerState(this);
    if (state.Kind === "native") {
      state.Backend.deleteStorageFile(state.Lifetime.Handle, file);
      return;
    }
    state.Storage.Fs.rmSync(storagePath(state, file, "file"), { force: false });
  }
  public GetFileNames(): string[];
  public GetFileNames(searchPattern: string): string[];
  public GetFileNames(searchPattern = "*"): string[] {
    const state = containerState(this);
    if (state.Kind === "native") {
      return [...state.Backend.getStorageFileNames(state.Lifetime.Handle, searchPattern)].sort();
    }
    const regex = patternRegex(searchPattern);
    return state.Storage.Fs.readdirSync(state.Root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && regex.test(entry.name)).map((entry) => entry.name).sort();
  }

  public OpenFile(file: string, fileMode: IO.FileMode): Uint8Array;
  public OpenFile(file: string, fileMode: IO.FileMode, fileAccess: IO.FileAccess): Uint8Array;
  public OpenFile(file: string, fileMode: IO.FileMode, fileAccess: IO.FileAccess, fileShare: IO.FileShare): Uint8Array;
  public OpenFile(
    file: string,
    fileMode: IO.FileMode,
    _fileAccess = IO.FileAccess.ReadWrite,
    _fileShare = IO.FileShare.None,
  ): Uint8Array {
    const state = containerState(this);
    if (state.Kind === "native") {
      return state.Backend.openStorageFile(
        state.Lifetime.Handle, file, fileMode, _fileAccess, _fileShare,
      );
    }
    const target = storagePath(state, file, "file");
    const exists = state.Storage.Fs.existsSync(target);
    if (fileMode === IO.FileMode.CreateNew && exists) throw new ArgumentException("The file already exists");
    if ((fileMode === IO.FileMode.Open || fileMode === IO.FileMode.Truncate) && !exists) {
      throw new ArgumentException("The file does not exist");
    }
    if (fileMode === IO.FileMode.Create || fileMode === IO.FileMode.CreateNew || fileMode === IO.FileMode.Truncate) {
      state.Storage.Fs.mkdirSync(state.Storage.Path.resolve(target, ".."), { recursive: true });
      state.Storage.Fs.writeFileSync(target, new Uint8Array());
    } else if ((fileMode === IO.FileMode.OpenOrCreate || fileMode === IO.FileMode.Append) && !exists) {
      state.Storage.Fs.mkdirSync(state.Storage.Path.resolve(target, ".."), { recursive: true });
      state.Storage.Fs.writeFileSync(target, new Uint8Array());
    }
    return new Uint8Array(state.Storage.Fs.readFileSync(target));
  }

  public Dispose(): void {
    const state = containerStates.get(this);
    if (!state || state.Disposed) return;
    state.Disposed = true;
    if (state.Kind === "native") state.Lifetime.Dispose();
    state.Events.Dispatch(this, EventArgs.Empty);
  }
}

function createStorageContainerForInternalUse(
  device: StorageDevice,
  displayName: string,
  root: string,
  storage: NodeStorage,
): StorageContainer {
  const events = new EventDispatcher<unknown, EventArgs>();
  const result = Object.create(StorageContainer.prototype) as StorageContainer;
  Object.defineProperty(result, "Disposing", { value: events, enumerable: true, writable: false });
  containerStates.set(result, { Kind: "managed", Device: device, Storage: storage, Root: root, DisplayName: displayName, Events: events, Disposed: false });
  return result;
}

function createNativeStorageContainerForInternalUse(
  device: StorageDevice,
  backend: CnaStorageBackend,
  parent: NativeResourceLifetime,
  handle: bigint,
): StorageContainer {
  const events = new EventDispatcher<unknown, EventArgs>();
  const result = Object.create(StorageContainer.prototype) as StorageContainer;
  Object.defineProperty(result, "Disposing", { value: events, enumerable: true, writable: false });
  const lifetime = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "owned",
    Parent: parent,
    Release: (value) => backend.destroyStorageContainer(value),
    Label: "StorageContainer",
  });
  containerStates.set(result, {
    Kind: "native",
    Device: device,
    Backend: backend,
    Lifetime: lifetime,
    DisplayName: backend.getStorageContainerDisplayName(handle),
    Events: events,
    Disposed: false,
  });
  return result;
}

export class StorageDeviceNotConnectedException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, innerException: Error);
  public constructor(message = "", innerException?: Error) {
    super(message, innerException === undefined ? undefined : { cause: innerException });
    this.name = "StorageDeviceNotConnectedException";
  }
}
