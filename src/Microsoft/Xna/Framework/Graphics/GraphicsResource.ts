import { EventDispatcher } from "../../../../internal/events.js";
import {
  InvalidOperationException,
  ObjectDisposedException,
} from "../../../../internal/exceptions.js";
import type { IDisposable, XnaEvent } from "../Contracts.js";
import { EventArgs } from "../EventArgs.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";

interface ResourceState {
  Device: GraphicsDevice | null;
  Disposed: boolean;
  Name: string;
  Tag: unknown;
  OnDisposed: ((name: string, tag: unknown) => void) | null;
  Release: (() => void) | null;
  ActiveCheck: (() => boolean) | null;
}

const states = new WeakMap<GraphicsResource, ResourceState>();

function stateOf(resource: GraphicsResource): ResourceState {
  let state = states.get(resource);
  if (!state) {
    state = {
      Device: null,
      Disposed: false,
      Name: "",
      Tag: null,
      OnDisposed: null,
      Release: null,
      ActiveCheck: null,
    };
    states.set(resource, state);
  }
  return state;
}

/** Deterministically disposed base for managed state objects and native graphics resources. */
export class GraphicsResource implements IDisposable {
  readonly #disposing = new EventDispatcher<unknown, EventArgs>();

  public readonly Disposing: XnaEvent<unknown, EventArgs> = this.#disposing;

  public get GraphicsDevice(): GraphicsDevice {
    const device = stateOf(this).Device;
    if (!device) throw new InvalidOperationException("The graphics resource is not bound to a GraphicsDevice");
    return device;
  }

  public get IsDisposed(): boolean {
    const state = stateOf(this);
    return state.Disposed || (state.ActiveCheck != null && !state.ActiveCheck());
  }

  public get Name(): string { return stateOf(this).Name; }
  public set Name(value: string) { stateOf(this).Name = value ?? ""; }

  public get Tag(): unknown { return stateOf(this).Tag; }
  public set Tag(value: unknown) { stateOf(this).Tag = value; }

  public Dispose(): void {
    const state = stateOf(this);
    if (state.Disposed) return;
    if (state.ActiveCheck != null && !state.ActiveCheck()) {
      state.Disposed = true;
      return;
    }
    this.#disposing.Dispatch(this, EventArgs.Empty);
    state.Release?.();
    state.Disposed = true;
    state.OnDisposed?.(state.Name, state.Tag);
    state.OnDisposed = null;
  }

  public ToString(): string {
    return this.Name.length > 0 ? this.Name : this.constructor.name;
  }

}

export function attachGraphicsResourceForInternalUse(
  resource: GraphicsResource,
  device: GraphicsDevice,
  onDisposed?: (name: string, tag: unknown) => void,
): void {
  const state = stateOf(resource);
  if (state.Disposed) throw new ObjectDisposedException(resource.constructor.name);
  if (state.Device && state.Device !== device) {
    throw new InvalidOperationException("A graphics resource cannot be rebound to another GraphicsDevice");
  }
  state.Device = device;
  if (onDisposed) state.OnDisposed = onDisposed;
}

export function assertGraphicsResourceActiveForInternalUse(resource: GraphicsResource): void {
  if (resource.IsDisposed) throw new ObjectDisposedException(resource.constructor.name);
}

export function assertGraphicsResourceCompatibleForInternalUse(
  resource: GraphicsResource,
  device: GraphicsDevice,
): void {
  assertGraphicsResourceActiveForInternalUse(resource);
  const state = stateOf(resource);
  if (state.Device != null && state.Device !== device) {
    throw new InvalidOperationException("The graphics resource belongs to a different GraphicsDevice");
  }
}

export function setGraphicsResourceLifetimeForInternalUse(
  resource: GraphicsResource,
  release: () => void,
  activeCheck: () => boolean,
): void {
  const state = stateOf(resource);
  state.Release = release;
  state.ActiveCheck = activeCheck;
}

export function guardGraphicsResourceReleaseForInternalUse(
  resource: GraphicsResource,
  guard: () => void,
): void {
  const state = stateOf(resource);
  const release = state.Release;
  state.Release = () => {
    guard();
    release?.();
  };
}
