/** Forwards uncaught renderer errors to the main process, which stores them as local crash reports. */
export function installErrorReporting(): void {
  const report = (kind: string, reason: unknown) => {
    try {
      const err = reason instanceof Error ? reason : undefined;
      window.poro.reportError(kind, err?.message ?? String(reason), err?.stack);
    } catch {
      // the bridge is missing only in unit tests
    }
  };
  window.addEventListener('error', (e) => report('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason));
}
