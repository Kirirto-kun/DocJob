'use client';

import type { CaseBody } from '@/lib/case-schema';

export type CaseEditorProps = {
  initialBody?: CaseBody;
  onChange: (body: CaseBody) => void;
  className?: string;
};

// STUB — заменяется в Волне 2 (Unit U1) на полноценную обёртку BlockNote.
// Сейчас возвращает плейсхолдер, чтобы typecheck проходил, а импортирующие
// /new-case и страница кейса собирались независимо.
export function CaseEditor(_props: CaseEditorProps) {
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-sm text-muted-foreground">
      [TODO U1] BlockNote редактор появится в Wave 2.
    </div>
  );
}

export default CaseEditor;
