import type { IEquatable } from "../../Contracts.js";
import { TimeSpan } from "../../TimeSpan.js";
import { Vector2 } from "../../Vector2.js";
import type { TouchPanelCapabilitiesSnapshot } from "../../../../../internal/input.js";
import { addHashes, floatHash } from "../../../../../internal/value.js";
import { GestureType, TouchLocationState } from "./Enums.js";
import type { TouchLocationResult } from "./TouchLocationResult.js";

export class GestureSample {
  readonly #gestureType: GestureType;
  readonly #timestamp: TimeSpan;
  readonly #position: Vector2;
  readonly #position2: Vector2;
  readonly #delta: Vector2;
  readonly #delta2: Vector2;

  public constructor(
    gestureType: GestureType,
    timestamp: TimeSpan,
    position: Vector2,
    position2: Vector2,
    delta: Vector2,
    delta2: Vector2,
  ) {
    this.#gestureType = gestureType;
    this.#timestamp = timestamp;
    this.#position = new Vector2(position.X, position.Y);
    this.#position2 = new Vector2(position2.X, position2.Y);
    this.#delta = new Vector2(delta.X, delta.Y);
    this.#delta2 = new Vector2(delta2.X, delta2.Y);
  }

  public get GestureType(): GestureType { return this.#gestureType; }
  public get Timestamp(): TimeSpan { return this.#timestamp; }
  public get Position(): Vector2 { return new Vector2(this.#position.X, this.#position.Y); }
  public get Position2(): Vector2 { return new Vector2(this.#position2.X, this.#position2.Y); }
  public get Delta(): Vector2 { return new Vector2(this.#delta.X, this.#delta.Y); }
  public get Delta2(): Vector2 { return new Vector2(this.#delta2.X, this.#delta2.Y); }
}

export class TouchLocation implements IEquatable<TouchLocation> {
  readonly #id: number;
  readonly #state: TouchLocationState;
  readonly #x: number;
  readonly #y: number;
  readonly #previousState: TouchLocationState;
  readonly #previousX: number;
  readonly #previousY: number;

  public constructor(id: number, state: TouchLocationState, position: Vector2);
  public constructor(
    id: number,
    state: TouchLocationState,
    position: Vector2,
    previousState: TouchLocationState,
    previousPosition: Vector2,
  );
  public constructor(
    id: number,
    state: TouchLocationState,
    position: Vector2,
    previousState = TouchLocationState.Invalid,
    previousPosition = Vector2.Zero,
  ) {
    this.#id = Math.trunc(id) | 0;
    this.#state = state;
    this.#x = Math.fround(position.X);
    this.#y = Math.fround(position.Y);
    this.#previousState = previousState;
    this.#previousX = Math.fround(previousPosition.X);
    this.#previousY = Math.fround(previousPosition.Y);
  }

  public get Id(): number { return this.#id; }
  public get State(): TouchLocationState { return this.#state; }
  public get Position(): Vector2 { return new Vector2(this.#x, this.#y); }

  public TryGetPreviousLocation(): TouchLocationResult {
    if (this.#previousState === TouchLocationState.Invalid) {
      return {
        Success: false,
        Value: new TouchLocation(-1, TouchLocationState.Invalid, Vector2.Zero),
      };
    }
    return {
      Success: true,
      Value: new TouchLocation(
        this.Id,
        this.#previousState,
        new Vector2(this.#previousX, this.#previousY),
      ),
    };
  }

  public Equals(other: TouchLocation): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    if (!(obj instanceof TouchLocation)) return false;
    const leftPrevious = this.TryGetPreviousLocation().Value.Position;
    const rightPrevious = obj.TryGetPreviousLocation().Value.Position;
    return this.Id === obj.Id && this.#x === obj.#x && this.#y === obj.#y &&
      leftPrevious.X === rightPrevious.X && leftPrevious.Y === rightPrevious.Y;
  }

  public GetHashCode(): number {
    return addHashes(this.Id, floatHash(this.#x), floatHash(this.#y));
  }

  public ToString(): string { return `{Position:${this.Position.ToString()}}`; }
}

/** Exact XNA operator equality, which is deliberately stricter than TouchLocation.Equals. */
export function touchLocationsEqual(left: TouchLocation, right: TouchLocation): boolean {
  const leftPrevious = left.TryGetPreviousLocation();
  const rightPrevious = right.TryGetPreviousLocation();
  return left.Id === right.Id && left.State === right.State && left.Position.Equals(right.Position) &&
    leftPrevious.Success === rightPrevious.Success &&
    leftPrevious.Value.State === rightPrevious.Value.State &&
    leftPrevious.Value.Position.Equals(rightPrevious.Value.Position);
}

/** Backend-produced touch capabilities; XNA exposes no public constructor. */
export class TouchPanelCapabilities {
  readonly #snapshot: TouchPanelCapabilitiesSnapshot;

  private constructor(snapshot: TouchPanelCapabilitiesSnapshot) { this.#snapshot = snapshot; }

  public get IsConnected(): boolean { return this.#snapshot.IsConnected; }
  public get MaximumTouchCount(): number { return this.#snapshot.MaximumTouchCount; }
}

export function createTouchPanelCapabilities(
  snapshot: TouchPanelCapabilitiesSnapshot,
): TouchPanelCapabilities {
  const Constructor = TouchPanelCapabilities as unknown as {
    new (value: TouchPanelCapabilitiesSnapshot): TouchPanelCapabilities;
  };
  return new Constructor(snapshot);
}
