import type { CnaGraphicsBackend } from "../../../../internal/backend.js";
import {
  ArgumentNullException,
  InvalidOperationException,
} from "../../../../internal/exceptions.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";
import { NativeResourceLifetime } from "../../../../internal/ownership.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import {
  graphicsDeviceBackendForInternalUse,
  graphicsDeviceParentLifetimeForInternalUse,
  notifyGraphicsResourceCreatedForInternalUse,
  notifyGraphicsResourceDestroyedForInternalUse,
  resolveGraphicsDeviceHandleForInternalUse,
} from "./GraphicsDevice.js";
import {
  attachGraphicsResourceForInternalUse,
  assertGraphicsResourceActiveForInternalUse,
  GraphicsResource,
  setGraphicsResourceLifetimeForInternalUse,
} from "./GraphicsResource.js";

type QueryState = {
  readonly Backend: CnaGraphicsBackend;
  readonly Lifetime: NativeResourceLifetime;
  Phase: "idle" | "active" | "ended";
};

const states = new WeakMap<OcclusionQuery, QueryState>();

function stateOf(query: OcclusionQuery): QueryState {
  assertGraphicsResourceActiveForInternalUse(query);
  const state = states.get(query);
  if (!state) throw new NativeUnavailableError("OcclusionQuery construction did not complete");
  return state;
}

export class OcclusionQuery extends GraphicsResource {
  public constructor(graphicsDevice: GraphicsDevice) {
    super();
    if (graphicsDevice == null) throw new ArgumentNullException("graphicsDevice");
    const backend = graphicsDeviceBackendForInternalUse(graphicsDevice).Graphics;
    if (!backend) throw new NativeUnavailableError("OcclusionQuery requires CNA query routes");
    const handle = backend.createOcclusionQuery(
      resolveGraphicsDeviceHandleForInternalUse(graphicsDevice),
    );
    let lifetime: NativeResourceLifetime | null = null;
    try {
      lifetime = new NativeResourceLifetime({
        Handle: handle,
        Ownership: "owned",
        Parent: graphicsDeviceParentLifetimeForInternalUse(graphicsDevice),
        Release: (value) => backend.destroyOcclusionQuery(value),
        Label: "OcclusionQuery",
      });
      states.set(this, { Backend: backend, Lifetime: lifetime, Phase: "idle" });
      attachGraphicsResourceForInternalUse(
        this, graphicsDevice,
        (name, tag) => notifyGraphicsResourceDestroyedForInternalUse(graphicsDevice, name, tag),
      );
      setGraphicsResourceLifetimeForInternalUse(
        this, () => lifetime!.Dispose(), () => lifetime!.State === "active",
      );
      notifyGraphicsResourceCreatedForInternalUse(graphicsDevice, this);
    } catch (error) {
      if (lifetime) lifetime.Dispose();
      else backend.destroyOcclusionQuery(handle);
      throw error;
    }
  }

  public get IsComplete(): boolean {
    const state = stateOf(this);
    if (state.Phase !== "ended") return false;
    return state.Backend.getOcclusionQueryIsComplete(state.Lifetime.Handle);
  }

  public get PixelCount(): number {
    const state = stateOf(this);
    if (state.Phase !== "ended" ||
        !state.Backend.getOcclusionQueryIsComplete(state.Lifetime.Handle)) {
      throw new InvalidOperationException("The occlusion-query result is not complete");
    }
    return state.Backend.getOcclusionQueryPixelCount(state.Lifetime.Handle);
  }

  public Begin(): void {
    const state = stateOf(this);
    if (state.Phase === "active") {
      throw new InvalidOperationException("The occlusion query is already active");
    }
    state.Backend.beginOcclusionQuery(state.Lifetime.Handle);
    state.Phase = "active";
  }

  public End(): void {
    const state = stateOf(this);
    if (state.Phase !== "active") {
      throw new InvalidOperationException("The occlusion query has not begun");
    }
    state.Backend.endOcclusionQuery(state.Lifetime.Handle);
    state.Phase = "ended";
  }
}
