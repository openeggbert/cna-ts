export type NativeHandle = bigint;

export type NativeOwnership = "owned" | "borrowed" | "parent-owned" | "adopted";

export type NativeResourceState =
  | "active"
  | "disposing"
  | "release-failed"
  | "disposed"
  | "transferred";

export type NativeRelease = (handle: NativeHandle) => void;

export interface NativeResourceOptions {
  readonly Handle: NativeHandle;
  readonly Ownership: NativeOwnership;
  readonly Release?: NativeRelease;
  readonly Parent?: NativeResourceLifetime;
  readonly Label?: string;
}

interface CallbackTeardown {
  Active: boolean;
  readonly Unsubscribe: () => void;
}

const MAX_NATIVE_HANDLE = (1n << 64n) - 1n;

/** Internal deterministic ownership for opaque generation-checked CNA handles. */
export class NativeResourceLifetime {
  #handle: NativeHandle;
  readonly #ownership: NativeOwnership;
  readonly #release: NativeRelease | undefined;
  readonly #parent: NativeResourceLifetime | undefined;
  readonly #label: string;
  readonly #children = new Set<NativeResourceLifetime>();
  readonly #callbacks: CallbackTeardown[] = [];
  #state: NativeResourceState = "active";

  public constructor(options: NativeResourceOptions) {
    if (options.Handle <= 0n || options.Handle > MAX_NATIVE_HANDLE) {
      throw new RangeError("native handle must be an unsigned nonzero 64-bit value");
    }
    if ((options.Ownership === "owned" || options.Ownership === "adopted") && !options.Release) {
      throw new TypeError(`${options.Ownership} native resources require a release function`);
    }
    if (
      (options.Ownership === "borrowed" || options.Ownership === "parent-owned") &&
      options.Release
    ) {
      throw new TypeError(`${options.Ownership} native resources cannot release their handle`);
    }
    if (options.Ownership === "parent-owned" && !options.Parent) {
      throw new TypeError("parent-owned native resources require a parent");
    }

    this.#handle = options.Handle;
    this.#ownership = options.Ownership;
    this.#release = options.Release;
    this.#parent = options.Parent;
    this.#label = options.Label ?? "native resource";
    if (this.#parent) this.#parent.#attachChild(this);
  }

  public get Handle(): NativeHandle {
    this.AssertActive();
    return this.#handle;
  }

  public get Ownership(): NativeOwnership {
    return this.#ownership;
  }

  public get State(): NativeResourceState {
    return this.#state;
  }

  public AssertActive(): void {
    if (this.#state !== "active") {
      throw new Error(`${this.#label} is ${this.#state}`);
    }
  }

  /** Tracks an owned callback registration and returns an idempotent early-unsubscribe function. */
  public TrackCallback(unsubscribe: () => void): () => void {
    this.AssertActive();
    const teardown: CallbackTeardown = { Active: true, Unsubscribe: unsubscribe };
    this.#callbacks.push(teardown);
    return () => this.#runCallback(teardown);
  }

  /**
   * Transfers an owned handle out of this wrapper without releasing it.
   * The recipient must immediately adopt it into another deterministic owner.
   */
  public Transfer(): NativeHandle {
    this.AssertActive();
    if (this.#ownership !== "owned" && this.#ownership !== "adopted") {
      throw new Error(`${this.#label} is ${this.#ownership} and cannot transfer ownership`);
    }
    if (this.#children.size > 0 || this.#callbacks.some((entry) => entry.Active)) {
      throw new Error(`${this.#label} cannot transfer with live children or callbacks`);
    }
    const handle = this.#handle;
    this.#handle = 0n;
    this.#state = "transferred";
    if (this.#parent) this.#parent.#children.delete(this);
    return handle;
  }

  /** Callbacks, children, then the owned handle are torn down deterministically. */
  public Dispose(): void {
    if (this.#state === "disposed" || this.#state === "transferred" || this.#state === "disposing") {
      return;
    }
    this.#state = "disposing";
    const errors: unknown[] = [];

    for (const callback of [...this.#callbacks].reverse()) {
      try {
        this.#runCallback(callback);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const child of [...this.#children].reverse()) {
      try {
        child.Dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    let released = !this.#release;
    if (this.#children.size === 0 && this.#release) {
      try {
        this.#release(this.#handle);
        released = true;
      } catch (error) {
        errors.push(error);
      }
    }

    if (this.#children.size === 0 && released) {
      this.#handle = 0n;
      this.#state = "disposed";
      if (this.#parent) this.#parent.#children.delete(this);
    } else {
      this.#state = "release-failed";
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `failed to dispose ${this.#label}`);
    }
    if (this.#state === "release-failed") {
      throw new Error(`${this.#label} still has a child whose release failed`);
    }
  }

  #attachChild(child: NativeResourceLifetime): void {
    this.AssertActive();
    this.#children.add(child);
  }

  #runCallback(teardown: CallbackTeardown): void {
    if (!teardown.Active) return;
    teardown.Active = false;
    teardown.Unsubscribe();
  }
}

/** Rolls back resources acquired during a multi-step native construction in reverse order. */
export class NativeConstructionScope {
  readonly #resources: NativeResourceLifetime[] = [];
  #state: "open" | "committed" | "rollback-failed" | "rolled-back" = "open";

  public Add<T extends NativeResourceLifetime>(resource: T): T {
    if (this.#state !== "open") throw new Error("native construction scope is already settled");
    resource.AssertActive();
    this.#resources.push(resource);
    return resource;
  }

  public Commit(): void {
    if (this.#state !== "open") throw new Error("native construction scope is already settled");
    this.#state = "committed";
    this.#resources.length = 0;
  }

  public Rollback(): void {
    if (this.#state === "committed" || this.#state === "rolled-back") return;
    const errors: unknown[] = [];
    for (const resource of [...this.#resources].reverse()) {
      try {
        resource.Dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    const remaining = this.#resources.filter(
      (resource) => resource.State !== "disposed" && resource.State !== "transferred",
    );
    this.#resources.splice(0, this.#resources.length, ...remaining);
    if (errors.length > 0) {
      this.#state = "rollback-failed";
      throw new AggregateError(errors, "failed to roll back native construction");
    }
    this.#state = "rolled-back";
  }
}
