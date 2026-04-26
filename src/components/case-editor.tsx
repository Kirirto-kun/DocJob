'use client';

import dynamic from 'next/dynamic';
import type { CaseBody } from '@/lib/case-schema';

export type CaseEditorProps = {
  initialBody?: CaseBody;
  onChange: (body: CaseBody) => void;
  className?: string;
};

const CaseEditorInner = dynamic(
  () => import('./case-editor-inner').then((m) => m.CaseEditorInner),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-sm text-muted-foreground">
        Загрузка редактора…
      </div>
    ),
  },
);

export function CaseEditor(props: CaseEditorProps) {
  return <CaseEditorInner {...props} />;
}

export default CaseEditor;
