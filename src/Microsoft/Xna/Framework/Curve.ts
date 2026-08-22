import { CurveContinuity } from "./CurveContinuity.js";
import { CurveKey } from "./CurveKey.js";
import { CurveKeyCollection } from "./CurveKeyCollection.js";
import { CurveLoopType } from "./CurveLoopType.js";
import { CurveTangent } from "./CurveTangent.js";

const f32 = Math.fround;

/** Runtime-independent XNA piecewise Hermite curve. */
export class Curve {
  #keys = new CurveKeyCollection();
  #preLoop = CurveLoopType.Constant;
  #postLoop = CurveLoopType.Constant;

  public constructor() {}

  public get Keys(): CurveKeyCollection { return this.#keys; }
  public get IsConstant(): boolean { return this.#keys.Count <= 1; }
  public get PreLoop(): CurveLoopType { return this.#preLoop; }
  public set PreLoop(value: CurveLoopType) { this.#preLoop = value; }
  public get PostLoop(): CurveLoopType { return this.#postLoop; }
  public set PostLoop(value: CurveLoopType) { this.#postLoop = value; }

  public Clone(): Curve {
    const result = new Curve();
    result.#preLoop = this.#preLoop;
    result.#postLoop = this.#postLoop;
    result.#keys = this.#keys.Clone();
    return result;
  }

  public ComputeTangent(keyIndex: number, tangentType: CurveTangent): void;
  public ComputeTangent(keyIndex: number, tangentInType: CurveTangent, tangentOutType: CurveTangent): void;
  public ComputeTangent(keyIndex: number, tangentInType: CurveTangent, tangentOutType = tangentInType): void {
    if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= this.Keys.Count) throw new RangeError("keyIndex");
    const key = this.Keys.Get(keyIndex);
    let previousPosition = key.Position;
    let currentPosition = key.Position;
    let nextPosition = key.Position;
    let previousValue = key.Value;
    let currentValue = key.Value;
    let nextValue = key.Value;
    if (keyIndex > 0) {
      previousPosition = this.Keys.Get(keyIndex - 1).Position;
      previousValue = this.Keys.Get(keyIndex - 1).Value;
    }
    if (keyIndex + 1 < this.Keys.Count) {
      nextPosition = this.Keys.Get(keyIndex + 1).Position;
      nextValue = this.Keys.Get(keyIndex + 1).Value;
    }
    const totalPosition = f32(nextPosition - previousPosition);
    const totalValue = f32(nextValue - previousValue);
    if (tangentInType === CurveTangent.Smooth) {
      key.TangentIn = Math.abs(totalValue) < 1.1920929e-7
        ? 0
        : f32(f32(totalValue * Math.abs(f32(previousPosition - currentPosition))) / totalPosition);
    } else if (tangentInType === CurveTangent.Linear) {
      key.TangentIn = f32(currentValue - previousValue);
    } else key.TangentIn = 0;

    if (tangentOutType === CurveTangent.Smooth) {
      key.TangentOut = Math.abs(totalValue) < 1.1920929e-7
        ? 0
        : f32(f32(totalValue * Math.abs(f32(nextPosition - currentPosition))) / totalPosition);
    } else if (tangentOutType === CurveTangent.Linear) {
      key.TangentOut = f32(nextValue - currentValue);
    } else key.TangentOut = 0;
  }

  public ComputeTangents(tangentType: CurveTangent): void;
  public ComputeTangents(tangentInType: CurveTangent, tangentOutType: CurveTangent): void;
  public ComputeTangents(tangentInType: CurveTangent, tangentOutType = tangentInType): void {
    for (let index = 0; index < this.Keys.Count; index += 1) {
      this.ComputeTangent(index, tangentInType, tangentOutType);
    }
  }

  public Evaluate(position: number): number {
    position = f32(position);
    if (this.Keys.Count === 0) return 0;
    if (this.Keys.Count === 1) return this.Keys.Get(0).Value;
    const first = this.Keys.Get(0);
    const last = this.Keys.Get(this.Keys.Count - 1);
    let sample = position;
    let offset = 0;
    if (sample < first.Position) {
      if (this.PreLoop === CurveLoopType.Constant) return first.Value;
      if (this.PreLoop === CurveLoopType.Linear) {
        return f32(first.Value - f32(first.TangentIn * f32(first.Position - sample)));
      }
      const cycle = this.#calculateCycle(sample, first, last);
      const timeRange = f32(last.Position - first.Position);
      const remainder = f32(sample - f32(first.Position + f32(cycle * timeRange)));
      if (this.PreLoop === CurveLoopType.Cycle) sample = f32(first.Position + remainder);
      else if (this.PreLoop === CurveLoopType.CycleOffset) {
        sample = f32(first.Position + remainder);
        offset = f32(f32(last.Value - first.Value) * cycle);
      } else {
        sample = (cycle & 1) !== 0 ? f32(last.Position - remainder) : f32(first.Position + remainder);
      }
    } else if (last.Position < sample) {
      if (this.PostLoop === CurveLoopType.Constant) return last.Value;
      if (this.PostLoop === CurveLoopType.Linear) {
        return f32(last.Value - f32(last.TangentOut * f32(last.Position - sample)));
      }
      const cycle = this.#calculateCycle(sample, first, last);
      const timeRange = f32(last.Position - first.Position);
      const remainder = f32(sample - f32(first.Position + f32(cycle * timeRange)));
      if (this.PostLoop === CurveLoopType.Cycle) sample = f32(first.Position + remainder);
      else if (this.PostLoop === CurveLoopType.CycleOffset) {
        sample = f32(first.Position + remainder);
        offset = f32(f32(last.Value - first.Value) * cycle);
      } else {
        sample = (cycle & 1) !== 0 ? f32(last.Position - remainder) : f32(first.Position + remainder);
      }
    }

    let left = first;
    let right = first;
    let amount = sample;
    for (let index = 1; index < this.Keys.Count; index += 1) {
      right = this.Keys.Get(index);
      if (right.Position >= sample) {
        const range = right.Position - left.Position;
        amount = range > 1e-10 ? f32((sample - left.Position) / range) : 0;
        break;
      }
      left = right;
    }
    return f32(offset + Curve.interpolate(left, right, amount));
  }

  #calculateCycle(position: number, first: CurveKey, last: CurveKey): number {
    const range = f32(last.Position - first.Position);
    const inverseRange = range > Number.MIN_VALUE ? f32(1 / range) : 0;
    let cycle = f32(f32(position - first.Position) * inverseRange);
    if (cycle < 0) cycle = f32(cycle - 1);
    return Math.trunc(cycle);
  }

  private static interpolate(left: CurveKey, right: CurveKey, amount: number): number {
    if (left.Continuity === CurveContinuity.Step) return amount < 1 ? left.Value : right.Value;
    const squared = f32(amount * amount);
    const cubed = f32(squared * amount);
    const leftWeight = f32(f32(f32(2 * cubed) - f32(3 * squared)) + 1);
    const rightWeight = f32(f32(-2 * cubed) + f32(3 * squared));
    const leftTangentWeight = f32(f32(f32(cubed - f32(2 * squared)) + amount));
    const rightTangentWeight = f32(cubed - squared);
    return f32(
      f32(f32(left.Value * leftWeight) + f32(right.Value * rightWeight)) +
      f32(f32(left.TangentOut * leftTangentWeight) + f32(right.TangentIn * rightTangentWeight)),
    );
  }
}
