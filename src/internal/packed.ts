const floatBits = new DataView(new ArrayBuffer(4));

export function roundToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function clampAndRound(value: number, minimum: number, maximum: number): number {
  value = Math.fround(value);
  if (Number.isNaN(value)) return 0;
  if (value === Number.NEGATIVE_INFINITY || value < minimum) return minimum;
  if (value === Number.POSITIVE_INFINITY || value > maximum) return maximum;
  return roundToEven(value);
}

export function packUnsigned(maximum: number, value: number): number {
  return clampAndRound(value, 0, maximum) >>> 0;
}

export function packSigned(mask: number, value: number): number {
  const maximum = mask >>> 1;
  return clampAndRound(value, -maximum - 1, maximum) & mask;
}

export function packUNorm(mask: number, value: number): number {
  return clampAndRound(Math.fround(Math.fround(value) * Math.fround(mask)), 0, mask) >>> 0;
}

export function unpackUNorm(mask: number, value: number): number {
  return Math.fround((value & mask) / mask);
}

export function packSNorm(mask: number, value: number): number {
  const maximum = mask >>> 1;
  return clampAndRound(Math.fround(Math.fround(value) * maximum), -maximum, maximum) & mask;
}

export function unpackSNorm(mask: number, value: number): number {
  const sign = (mask + 1) >>> 1;
  value >>>= 0;
  let signed: number;
  if ((value & sign) !== 0) {
    if ((value & mask) === sign) return -1;
    signed = (value | ~mask) | 0;
  } else signed = value & mask;
  return Math.fround(signed / (mask >>> 1));
}

export function signed16(value: number): number {
  const masked = value & 0xffff;
  return (masked & 0x8000) !== 0 ? masked - 0x10000 : masked;
}

export function packHalf(value: number): number {
  floatBits.setFloat32(0, Math.fround(value), true);
  const bits = floatBits.getUint32(0, true);
  const sign = (bits & 0x80000000) >>> 16;
  let magnitude = bits & 0x7fffffff;
  if (magnitude > 1207955455) return sign | 0x7fff;
  if (magnitude < 947912704) {
    const fraction = (magnitude & 0x7fffff) | 0x800000;
    const shift = 113 - (magnitude >>> 23);
    magnitude = shift <= 31 ? fraction >>> shift : 0;
    return sign | ((magnitude + 4095 + ((magnitude >>> 13) & 1)) >>> 13);
  }
  return sign | ((magnitude - 939524096 + 4095 + ((magnitude >>> 13) & 1)) >>> 13);
}

export function unpackHalf(value: number): number {
  value &= 0xffff;
  const sign = (value & 0x8000) << 16;
  const exponent = (value >>> 10) & 0x1f;
  let fraction = value & 0x3ff;
  let bits: number;
  if (exponent === 0) {
    if (fraction === 0) bits = sign >>> 0;
    else {
      let actualExponent = -14;
      while ((fraction & 0x400) === 0) { actualExponent -= 1; fraction <<= 1; }
      fraction &= 0x3ff;
      bits = (sign | ((actualExponent + 127) << 23) | (fraction << 13)) >>> 0;
    }
  } else {
    bits = (sign | ((exponent - 15 + 127) << 23) | (fraction << 13)) >>> 0;
  }
  floatBits.setUint32(0, bits, true);
  return floatBits.getFloat32(0, true);
}

export function packedHash(value: number | bigint): number {
  if (typeof value === "number") return value | 0;
  const normalized = BigInt.asUintN(64, value);
  return Number((normalized ^ (normalized >> 32n)) & 0xffffffffn) | 0;
}

export function packedHex(value: number | bigint, width: number): string {
  const normalized = typeof value === "bigint" ? BigInt.asUintN(width * 4, value) : value >>> 0;
  return normalized.toString(16).toUpperCase().padStart(width, "0");
}
