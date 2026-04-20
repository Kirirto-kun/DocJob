'use client';

import type { ClipboardEvent, MouseEvent, ReactNode } from 'react';

const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"]';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

type NoCopyRootProps = {
  children: ReactNode;
};

export function NoCopyRoot({ children }: NoCopyRootProps) {
  const blockIfNotEditable = (
    e: ClipboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>
  ) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  };

  return (
    <div
      className="contents"
      onCopy={blockIfNotEditable}
      onCut={blockIfNotEditable}
      onContextMenu={blockIfNotEditable}
    >
      {children}
    </div>
  );
}
