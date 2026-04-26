'use client';

import type { CaseBody } from '@/lib/case-schema';

export type CaseBodyViewerProps = {
  body: CaseBody;
  className?: string;
};

// STUB — заменяется в Волне 2 (Unit U1) на read-only BlockNote рендер.
export function CaseBodyViewer({ body, className }: CaseBodyViewerProps) {
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  return (
    <div className={className ?? 'prose prose-invert max-w-none text-sm'}>
      {blocks.length === 0 ? (
        <p className="text-muted-foreground">[TODO U1] Тело кейса будет отрендерено BlockNote.</p>
      ) : (
        <pre className="whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
          {JSON.stringify(blocks, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default CaseBodyViewer;
