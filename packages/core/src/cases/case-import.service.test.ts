/**
 * Unit tests for case-import.service — no DB, no live network call. The
 * OpenAI client is mocked at the `../openai` module boundary (same seam
 * `getOpenAI()` exposes for search.service.ts), so this runs fine without
 * Postgres or an OPENAI_API_KEY, unlike most other core domain tests added
 * in this SP-1b pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, UnauthorizedError, ValidationError, DomainError } from '../shared/errors';
import type { Actor } from '../shared/actor';

const parseMock = vi.fn();

vi.mock('../openai', () => ({
  getOpenAI: () => ({
    chat: { completions: { parse: parseMock } },
  }),
  DEFAULT_OPENAI_MODEL: 'gpt-4.1-test',
}));

import { structureCaseFromMarkdown } from './case-import.service';

const adminActor: Actor = { id: 'admin-1', role: 'ADMIN', approvedAt: new Date() };
const doctorActor: Actor = { id: 'doctor-1', role: 'DOCTOR', approvedAt: new Date() };

const validInput = {
  markdown: 'Пациент 45 лет поступил с жалобами на боль в груди в течение трёх дней.',
  mode: 'CLINICAL_QUEST' as const,
};

const draft = {
  name: 'Острый коронарный синдром',
  age: 45,
  gender: 'м',
  specialty: 'Кардиология',
  tags: ['инфаркт', 'боль в груди'],
  bodyMarkdown: 'Жалобы...',
};

describe('case-import.service#structureCaseFromMarkdown', () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it('throws UnauthorizedError for no actor', async () => {
    await expect(structureCaseFromMarkdown(null, validInput)).rejects.toThrow(UnauthorizedError);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError for a non-admin actor', async () => {
    await expect(structureCaseFromMarkdown(doctorActor, validInput)).rejects.toThrow(ForbiddenError);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('throws ValidationError for markdown under 20 chars', async () => {
    await expect(
      structureCaseFromMarkdown(adminActor, { markdown: 'too short', mode: 'CLINICAL_QUEST' }),
    ).rejects.toThrow(ValidationError);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('returns the parsed draft (no solution/taskQuestions fields) for a valid admin call', async () => {
    parseMock.mockResolvedValue({
      choices: [{ message: { parsed: draft, refusal: null } }],
    });

    const result = await structureCaseFromMarkdown(adminActor, validInput);
    expect(result).toEqual(draft);
    expect(result).not.toHaveProperty('solution');
    expect(result).not.toHaveProperty('taskQuestions');
    expect(parseMock).toHaveBeenCalledTimes(1);
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe('gpt-4.1-test');
    expect(call.messages[1].content).toContain(validInput.markdown);
  });

  it('includes hinted subgroup/specialty in the user message when provided', async () => {
    parseMock.mockResolvedValue({ choices: [{ message: { parsed: draft, refusal: null } }] });

    await structureCaseFromMarkdown(adminActor, {
      ...validInput,
      hintedSubgroup: 'clinical',
      hintedSpecialty: 'Кардиология',
    });

    const call = parseMock.mock.calls[0][0];
    expect(call.messages[1].content).toContain('Подгруппа: clinical');
    expect(call.messages[1].content).toContain('Специальность (подсказка): Кардиология');
  });

  it('wraps an OpenAI refusal (no parsed payload) into a DomainError', async () => {
    parseMock.mockResolvedValue({
      choices: [{ message: { parsed: null, refusal: 'blocked' } }],
    });

    await expect(structureCaseFromMarkdown(adminActor, validInput)).rejects.toThrow(DomainError);
    await expect(structureCaseFromMarkdown(adminActor, validInput)).rejects.toThrow(
      'Не удалось разобрать markdown через OpenAI.',
    );
  });

  it('wraps a thrown OpenAI client error into a DomainError', async () => {
    parseMock.mockRejectedValue(new Error('network down'));

    await expect(structureCaseFromMarkdown(adminActor, validInput)).rejects.toThrow(DomainError);
    await expect(structureCaseFromMarkdown(adminActor, validInput)).rejects.toThrow(
      'Не удалось разобрать markdown через OpenAI.',
    );
  });
});
