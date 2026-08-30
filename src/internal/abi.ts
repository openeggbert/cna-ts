/**
 * The CNA native C ABI generation this package targets, and the acceptance policy applied to a
 * loaded runtime artifact.
 *
 * `CNA_ABI_MAJOR`/`CNA_ABI_MINOR` are not free-floating literals: `npm run audit:cna-abi` reads
 * `CNA_ABI_VERSION_MAJOR`/`CNA_ABI_VERSION_MINOR` out of the canonical `CNA/C/abi.h` and fails when
 * they disagree with the values below, so the headers remain the authority and this module remains
 * the single place the binding states which generation it was written against.
 */

/** Major component of the CNA C ABI generation this package's native routes were written for. */
export const CNA_ABI_MAJOR = 0;

/** Minor component of the CNA C ABI generation this package's native routes were written for. */
export const CNA_ABI_MINOR = 20;

/** A decoded CNA C ABI version. */
export interface CnaAbiVersion {
  readonly Major: number;
  readonly Minor: number;
  readonly Patch: number;
  readonly Encoded: number;
  readonly Text: string;
}

/** Decodes the packed `uint32_t` returned by `cna_get_abi_version`. */
export function decodeAbiVersion(encoded: number): CnaAbiVersion {
  const value = encoded >>> 0;
  const major = (value >>> 16) & 0xffff;
  const minor = (value >>> 8) & 0xff;
  const patch = value & 0xff;
  return Object.freeze({
    Major: major,
    Minor: minor,
    Patch: patch,
    Encoded: value,
    Text: `${major}.${minor}.${patch}`,
  });
}

/**
 * Applies the acceptance policy `docs/c-api/ABI_VERSIONING.md` states: a consumer must reject a
 * different major and may require a minimum minor. Under an experimental `0.x` an incompatible
 * change is a minor increment, so the minor must match exactly there; from `1.x` a newer minor is
 * additive and is accepted. The patch component is always accepted.
 */
export function isSupportedAbiVersion(version: CnaAbiVersion): boolean {
  if (version.Major !== CNA_ABI_MAJOR) return false;
  return CNA_ABI_MAJOR === 0 ? version.Minor === CNA_ABI_MINOR : version.Minor >= CNA_ABI_MINOR;
}

/** Human-readable description of the accepted ABI window, for diagnostics. */
export function describeAbiWindow(): string {
  return CNA_ABI_MAJOR === 0
    ? `${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x`
    : `${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x or a newer ${CNA_ABI_MAJOR}.x minor`;
}
