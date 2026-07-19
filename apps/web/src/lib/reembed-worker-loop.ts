/**
 * Wait between re-embedding sweeps while keeping the worker process alive.
 *
 * The timeout deliberately remains referenced. An unreferenced timer does not
 * keep Node's event loop alive, so a Docker worker can otherwise exit cleanly
 * immediately after its first sweep and enter a restart loop.
 */
export function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };

    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
