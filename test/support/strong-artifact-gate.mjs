// SPDX-License-Identifier: MS-PL

/**
 * Why a strong-artifact browser run cannot make its claim, decided from what the artifact answered.
 *
 * Separated from the suite so it can be proved without a browser. The suite around it needs a
 * served package, a headless Chromium and a compiled CNA artifact before it can reach this
 * decision even once, which makes "does the gate refuse a default artifact?" an expensive question
 * asked rarely -- and a gate whose refusals nobody has watched is a gate nobody knows the shape of.
 * Here it is a pure function over the page's own result and every arm is cheap to exercise.
 *
 * The order matters and the messages are deliberately different from each other: "the artifact has
 * no CNAEXT" and "the fixture is missing" are not the same problem, and one message covering both
 * would send somebody to rebuild CNA when what they need is a `cnanext` checkout.
 */

/**
 * @param {object} input
 * @param {string|false} input.browserBlocked  why the harness itself cannot run, or false.
 * @param {object|null} input.result           the page's `__cnaHarness` object, or null.
 * @param {string} input.wasmDir               the artifact directory, named in the messages.
 * @returns {string|null} the reason, or null when the run may make its claim.
 */
export function strongArtifactBlocked({ browserBlocked, result, wasmDir }) {
  if (browserBlocked) return browserBlocked;
  if (result == null) return "the harness page produced no result at all";
  if (result.status !== "ok") {
    return `the harness page failed before it could report capabilities: ${result.error}`;
  }
  const cnaext = result.extensions?.graphicsExtensionLayer ?? null;
  if (cnaext !== true) {
    return `the artifact at ${wasmDir} reports cna_graphics_ext_is_available false; ` +
      "build CNA with -DCNA_CNAEXT=ON";
  }
  const compiled = result.compiledEffect ?? null;
  if (compiled == null) return "the harness page produced no compiled-effect evidence";
  if (compiled.fixture !== "present") {
    return "CnaConformanceEffect.fxb was not served; set CNA_SOURCE_PATH to a cnanext checkout";
  }
  if (compiled.outcome !== "created") {
    return `the artifact at ${wasmDir} refused a compiled effect (${compiled.error}); ` +
      "build CNA with -DCNA_EASYGL_COMPILED_EFFECTS=ON";
  }
  return null;
}
