import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, newRequestId } from './logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info() writes a single JSON line to console.log with level/time/msg and extra fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('hello', { requestId: 'r1', route: '/api/health' });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(parsed.requestId).toBe('r1');
    expect(parsed.route).toBe('/api/health');
    expect(typeof parsed.time).toBe('string');
    expect(Number.isNaN(Date.parse(parsed.time))).toBe(false);
  });

  it('warn() writes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('careful');

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
    expect(parsed.msg).toBe('careful');
  });

  it('error() writes to console.error and serializes an Error field to {name, message, stack}', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');

    logger.error('unexpected failure', { err });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.msg).toBe('unexpected failure');
    expect(parsed.err.name).toBe('Error');
    expect(parsed.err.message).toBe('boom');
    expect(typeof parsed.err.stack).toBe('string');
  });

  it('newRequestId() returns a non-empty string, unique across calls', () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
