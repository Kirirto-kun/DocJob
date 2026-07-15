import type { SerializedCase } from '../cases/case.mapper';

export type MatchSignal = 'semantic' | 'lexical';

export interface SearchHit {
  case: SerializedCase;
  score: number;
  matchedVia: MatchSignal[];
  snippet: string | null;
}

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1/(k + rank_i(d)) across every ranked
 * list d appears in (rank is 0-based here, so +1). k dampens the weight of
 * lower ranks; 60 is the canonical default. Rank-based (not score-based) so
 * the vector arm's cosine distances and the lexical arm's ts_rank never need a
 * shared scale.
 */
export function reciprocalRankFusion(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}
