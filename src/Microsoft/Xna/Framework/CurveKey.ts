import type { IComparable, IEquatable } from "./Contracts.js";
import { CurveContinuity } from "./CurveContinuity.js";
import { addHashes, floatHash } from "../../../internal/value.js";
import { NullReferenceException } from "../../../internal/exceptions.js";

/** Mutable XNA curve control point; Position remains fixed after construction. */
export class CurveKey implements IComparable<CurveKey>, IEquatable<CurveKey> {
  readonly #position: number;
  #value: number;
  #tangentIn: number;
  #tangentOut: number;
  #continuity: CurveContinuity;

  public constructor(position: number, value: number);
  public constructor(position: number, value: number, tangentIn: number, tangentOut: number);
  public constructor(position: number, value: number, tangentIn: number, tangentOut: number, continuity: CurveContinuity);
  public constructor(
    position: number,
    value: number,
    tangentIn = 0,
    tangentOut = 0,
    continuity = CurveContinuity.Smooth,
  ) {
    this.#position = Math.fround(position);
    this.#value = Math.fround(value);
    this.#tangentIn = Math.fround(tangentIn);
    this.#tangentOut = Math.fround(tangentOut);
    this.#continuity = continuity;
  }

  public get Position(): number { return this.#position; }
  public get Value(): number { return this.#value; }
  public set Value(value: number) { this.#value = Math.fround(value); }
  public get TangentIn(): number { return this.#tangentIn; }
  public set TangentIn(value: number) { this.#tangentIn = Math.fround(value); }
  public get TangentOut(): number { return this.#tangentOut; }
  public set TangentOut(value: number) { this.#tangentOut = Math.fround(value); }
  public get Continuity(): CurveContinuity { return this.#continuity; }
  public set Continuity(value: CurveContinuity) { this.#continuity = value; }

  public Clone(): CurveKey {
    return new CurveKey(this.Position, this.Value, this.TangentIn, this.TangentOut, this.Continuity);
  }

  public CompareTo(other: CurveKey): number {
    if (other == null) throw new NullReferenceException();
    if (this.Position === other.Position) return 0;
    return this.Position < other.Position ? -1 : 1;
  }

  public Equals(other: CurveKey): boolean;
  public Equals(obj: unknown): boolean;
  public Equals(obj: unknown): boolean {
    return obj instanceof CurveKey && this.Position === obj.Position && this.Value === obj.Value &&
      this.TangentIn === obj.TangentIn && this.TangentOut === obj.TangentOut &&
      this.Continuity === obj.Continuity;
  }

  public GetHashCode(): number {
    return addHashes(
      floatHash(this.Position), floatHash(this.Value), floatHash(this.TangentIn),
      floatHash(this.TangentOut), this.Continuity,
    );
  }
}
