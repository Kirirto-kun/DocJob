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

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  const entry: LogFields = { level, time: new Date().toISOString(), msg };
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = serializeValue(value);
    }
  }
  const line = JSON.stringify(entry);
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
