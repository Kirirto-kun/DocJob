'use client';

import dynamic from 'next/dynamic';
import type { CaseBody } from '@/lib/case-schema';

export type CaseBodyViewerProps = {
  body: CaseBody;
  className?: string;
};

const CaseBodyViewerInner = dynamic(
  () => import('./case-body-viewer-inner').then((m) => m.CaseBodyViewerInner),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-sm text-muted-foreground">
        Загрузка тела кейса…
      </div>
    ),
  },
);

export function CaseBodyViewer(props: CaseBodyViewerProps) {
  return <CaseBodyViewerInner {...props} />;
}

export default CaseBodyViewer;
