const floatBits = new DataView(new ArrayBuffer(4));

/** .NET Framework Single.GetHashCode-compatible result for XNA value types. */
export function floatHash(value: number): number {
  const rounded = Math.fround(value);
  if (rounded === 0) return 0;
  floatBits.setFloat32(0, rounded, true);
  return floatBits.getInt32(0, true);
}

/** CLR unchecked Int32 addition used by XNA's simple value-type hash combiners. */
export function addHashes(...values: number[]): number {
  let result = 0;
  for (const value of values) result = (result + value) | 0;
  return result;
}

/** Invariant numeric rendering used by deterministic Node-side XNA value strings. */
export function valueString(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  return String(value);
}

/** XNA's quaternion-vector path groups binary32 products differently from Matrix conversion. */
export function transformQuaternionComponents(
  x: number,
  y: number,
  z: number,
  quaternionX: number,
  quaternionY: number,
  quaternionZ: number,
  quaternionW: number,
): [number, number, number] {
  const f32 = Math.fround;
  const x2 = f32(quaternionX + quaternionX);
  const y2 = f32(quaternionY + quaternionY);
  const z2 = f32(quaternionZ + quaternionZ);
  const wx = f32(quaternionW * x2);
  const wy = f32(quaternionW * y2);
  const wz = f32(quaternionW * z2);
  const xx = f32(quaternionX * x2);
  const xy = f32(quaternionX * y2);
  const xz = f32(quaternionX * z2);
  const yy = f32(quaternionY * y2);
  const yz = f32(quaternionY * z2);
  const zz = f32(quaternionZ * z2);
  const sum = (a: number, b: number, c: number): number => f32(f32(a + b) + c);
  return [
    sum(
      f32(x * f32(f32(1 - yy) - zz)),
      f32(y * f32(xy - wz)),
      f32(z * f32(xz + wy)),
    ),
    sum(
      f32(x * f32(xy + wz)),
      f32(y * f32(f32(1 - xx) - zz)),
      f32(z * f32(yz - wx)),
    ),
    sum(
      f32(x * f32(xz - wy)),
      f32(y * f32(yz + wx)),
      f32(z * f32(f32(1 - xx) - yy)),
    ),
  ];
}
