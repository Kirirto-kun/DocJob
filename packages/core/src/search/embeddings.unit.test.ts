import { describe, it, expect } from 'vitest';
import { hashEmbeddingText } from './embeddings';

describe('hashEmbeddingText', () => {
  it('is stable and deterministic for the same input', () => {
    const a = hashEmbeddingText('пневмония у пациента');
    const b = hashEmbeddingText('пневмония у пациента');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when the text differs', () => {
    expect(hashEmbeddingText('a')).not.toBe(hashEmbeddingText('b'));
  });
});
