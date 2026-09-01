// SPDX-License-Identifier: MS-PL

/**
 * Make a windowed CNA run actually use the display it was pointed at.
 *
 * `xvfb-run` starts a virtual X server and sets `DISPLAY` to it. On a Wayland session it leaves
 * `WAYLAND_DISPLAY` and `XDG_SESSION_TYPE` alone, and SDL3 prefers its Wayland video driver whenever
 * `WAYLAND_DISPLAY` is set -- so it ignores `DISPLAY` entirely and opens a **real window on the
 * user's desktop**. One per test, for the length of the run.
 *
 * Nothing fails when that happens, which is what makes it worth a module rather than a line in a
 * README. The renderer initializes, the pixels are correct and the suite is green either way; the
 * only symptom is windows appearing on a screen the person who started the run may not be watching.
 * It was found because a user asked what kept flashing up on their desktop.
 *
 * The rule is simply that `DISPLAY` should be honoured when it is set: pinning SDL to `x11` does
 * that, and costs a developer on a real desktop nothing, because an X11 window on a Wayland session
 * still appears through XWayland. Where `DISPLAY` is unset there is nothing to honour and SDL is
 * left to choose.
 *
 * Call this **before** loading the native backend -- SDL reads the variable when the library
 * initializes its video subsystem, not when a window is created.
 */
export function preferTheDisplayWeWereGiven() {
  if (!process.env.DISPLAY) return null;
  if (process.env.SDL_VIDEODRIVER) return process.env.SDL_VIDEODRIVER;
  process.env.SDL_VIDEODRIVER = "x11";
  return "x11";
}
