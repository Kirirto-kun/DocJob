'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CaseSolution, ChatEvaluation } from '@/lib/case-schema';

export type SolutionPanelProps = {
  evaluation: ChatEvaluation | null;
  solution: CaseSolution | null;
};

// STUB — заменяется в Волне 2 (Unit U2) на красивый разбор с диффом и ссылками на протокол.
export function SolutionPanel({ evaluation, solution }: SolutionPanelProps) {
  if (!evaluation && !solution) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Разбор кейса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {evaluation ? (
          <div>
            <p>
              <strong>Оценка:</strong>{' '}
              {evaluation.correct ? 'Правильно' : 'Есть замечания'}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{evaluation.feedback}</p>
          </div>
        ) : null}
        {solution ? (
          <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-xs">
            {JSON.stringify(solution, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default SolutionPanel;
