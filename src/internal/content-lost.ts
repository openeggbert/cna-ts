/**
 * Wires a CNA ContentLost producer to the public XNA event a resource already declares.
 *
 * Through ABI 0.8 the dynamic-buffer and render-target headers said CNA never raised the event and
 * that registration existed only to preserve the shape of the public contract. ABI 0.9 changed
 * that: the event is raised for real on the renderers whose API can lose a device. A declared
 * event with no producer is not behaviour-complete, which is what this closes.
 */

import type { CnaGraphicsBackend, ContentLostResourceKind } from "./backend.js";
import type { NativeHandle } from "./ownership.js";

/**
 * Subscribes for the life of a resource. The caller supplies how a teardown is registered, because
 * the two resource families keep their lifetime in different places; either way the registration
 * is released before the resource is, rather than left dangling on a handle CNA has destroyed.
 *
 * A backend with no ContentLost routes simply leaves the event unproduced; the event still exists
 * and a game may still subscribe to it, which is what XNA does on a renderer that cannot lose a
 * device.
 */
export function bindContentLostForInternalUse(
  graphics: CnaGraphicsBackend | undefined,
  kind: ContentLostResourceKind,
  resource: NativeHandle,
  registerTeardown: (teardown: () => void) => void,
  raise: () => void,
): void {
  if (!graphics || typeof graphics.subscribeContentLost !== "function") return;
  let registration: NativeHandle;
  try {
    registration = graphics.subscribeContentLost(kind, resource, raise);
  } catch {
    // A renderer that cannot lose a device refuses the subscription. The event stays declared and
    // silent, which is exactly what it would be on that renderer in XNA.
    return;
  }
  registerTeardown(() => graphics.unsubscribeContentLost(registration));
}
