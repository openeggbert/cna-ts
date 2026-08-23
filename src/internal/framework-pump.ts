const callbacks = new Set<() => void>();

export function registerFrameworkPumpCallback(callback: () => void): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/** Delivers managed work after the one canonical native FrameworkDispatcher pump has completed. */
export function pumpFrameworkServicesForInternalUse(): void {
  for (const callback of [...callbacks]) callback();
}
