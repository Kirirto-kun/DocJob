import { afterEach, describe, expect, it, vi } from 'vitest';
import { sleepUnlessAborted } from './reembed-worker-loop';

describe('sleepUnlessAborted', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the timeout referenced so Node does not exit between sweeps', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const controller = new AbortController();

    const pending = sleepUnlessAborted(5, controller.signal);
    const timer = timeoutSpy.mock.results[0]?.value as NodeJS.Timeout;

    expect(timer.hasRef()).toBe(true);
    await pending;
  });

  it('resolves and clears the pending timeout when shutdown is requested', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleepUnlessAborted(60_000, controller.signal);

    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await pending;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves normally after the configured interval without leaking a timer', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleepUnlessAborted(60_000, controller.signal);

    await vi.advanceTimersByTimeAsync(60_000);
    await pending;

    expect(vi.getTimerCount()).toBe(0);
  });
});
