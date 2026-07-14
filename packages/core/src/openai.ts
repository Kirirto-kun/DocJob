import OpenAI from 'openai';

/**
 * @docjob/core's own OpenAI client accessor. Same singleton-via-globalThis
 * pattern and env vars as apps/web/src/lib/openai.ts, but core cannot
 * import from `@/...` (transport code), so it gets its own copy reading
 * straight from `process.env`.
 *
 * Deliberately LAZY, unlike the web singleton (which constructs `new
 * OpenAI(...)` eagerly at module-eval time): @docjob/core's index.ts barrel
 * is imported very broadly across apps/web — e.g. every caller of the
 * password-reset-token helpers pulls in the whole barrel — including from
 * test files that never touch OpenAI and don't load OPENAI_API_KEY into
 * process.env (apps/web's `vitest run` script does no dotenv loading).
 * The `openai` SDK throws synchronously in its constructor when no API key
 * is resolvable at all, so eager construction here would crash any such
 * unrelated import. `getOpenAI()` defers that construction (and the
 * missing-key check) to the first real call — which in practice only
 * happens after callers have already checked `process.env.OPENAI_API_KEY`
 * is set (see search.service.ts / embeddings.ts).
 *
 * Uses a distinct globalThis key (`__docjobCoreOpenAI`) so the dev-mode HMR
 * singleton cache here never collides with apps/web's own `openai` global —
 * even though both run in the same Node process (core is a workspace
 * package consumed directly by web, not a separate service).
 */
const globalForOpenAI = globalThis as unknown as {
  __docjobCoreOpenAI?: OpenAI;
};

export function getOpenAI(): OpenAI {
  if (!globalForOpenAI.__docjobCoreOpenAI) {
    globalForOpenAI.__docjobCoreOpenAI = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return globalForOpenAI.__docjobCoreOpenAI;
}

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1';
