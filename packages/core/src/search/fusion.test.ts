import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from './fusion';

describe('reciprocalRankFusion', () => {
  it('rewards items ranked high across multiple lists', () => {
    const vector = ['a', 'b', 'c'];
    const lexical = ['b', 'a', 'd'];
    const fused = reciprocalRankFusion([vector, lexical], 60);
    // 'a' (ranks 1 & 2) and 'b' (ranks 2 & 1) beat 'c'/'d' (one list each).
    const order = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(order.slice(0, 2).sort()).toEqual(['a', 'b']);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
  });

  it('handles empty and single lists', () => {
    expect(reciprocalRankFusion([]).size).toBe(0);
    expect(reciprocalRankFusion([['x']]).get('x')).toBeCloseTo(1 / 61);
  });
});
