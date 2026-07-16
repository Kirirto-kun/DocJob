/**
 * Minimal structured (JSON) logger (SP-5 T3). Deliberately NOT pino/winston —
 * the ops need here is "grep-able JSON lines in `docker compose logs web`",
 * not log shipping/sampling/rotation. Every line is a single JSON object on
 * stdout/stderr: `{ level, time, msg, ...fields }`, so `docker logs` +
 * `jq`/`grep` can filter by level, requestId, route, etc.
 *
 * Usage: `logger.info('message', { requestId, route })`,
 * `logger.error('message', { err })` — an `err` field that is an `Error` is
 * serialized to `{ name, message, stack }` rather than logged as `{}`
 * (the default behavior of `JSON.stringify(new Error(...))`).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/**
 * `JSON.stringify` throws on values it can't serialize — a circular
 * reference or a `BigInt` field, either of which can show up in an
 * arbitrary `unknown` value the logger is asked to serialize (this logger
 * is wired into generic catch-alls like `logger.error(msg, { err: e })`
 * where `e` is whatever a `core.*` call threw). The logger is meant to be
 * the error-safety net, so it must NEVER throw itself: fall back to a
 * minimal safe line, and if even that somehow fails, fall back to a plain
 * string literal (no interpolation that could itself throw).
 */
function safeStringify(entry: LogFields, level: LogLevel, msg: string): string {
  try {
    return JSON.stringify(entry);
  } catch {
    try {
      return JSON.stringify({ level, time: new Date().toISOString(), msg, note: 'log payload not serializable' });
    } catch {
      return '{"level":"error","msg":"log payload not serializable"}';
    }
  }
}

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  const entry: LogFields = { level, time: new Date().toISOString(), msg };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = serializeValue(value);
    }
  }
  const line = safeStringify(entry, level, msg);
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line);
  // eslint-disable-next-line no-console
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

export const logger = {
  info(msg: string, fields?: LogFields): void {
    write('info', msg, fields);
  },
  warn(msg: string, fields?: LogFields): void {
    write('warn', msg, fields);
  },
  error(msg: string, fields?: LogFields): void {
    write('error', msg, fields);
  },
};

/** A short, request-scoped id for correlating log lines across a single request. */
export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
