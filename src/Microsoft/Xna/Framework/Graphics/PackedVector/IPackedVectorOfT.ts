import type { IPackedVector } from "./IPackedVector.js";

/** XNA packed-vector contract after mapping its generic CLR interface to TypeScript. */
export interface IPackedVectorOfT<TPacked> extends IPackedVector {
  get PackedValue(): TPacked;
  set PackedValue(value: TPacked);
}
