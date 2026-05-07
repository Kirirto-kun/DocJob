'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type CyclingWordProps = {
  words: string[];
  intervalMs?: number;
  fadeMs?: number;
  className?: string;
};

export function CyclingWord({
  words,
  intervalMs = 2600,
  fadeMs = 160,
  className,
}: CyclingWordProps) {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (words.length <= 1) return;
    const id = setInterval(() => {
      setFading(true);
      const t = window.setTimeout(() => {
        setIdx((i) => (i + 1) % words.length);
        setFading(false);
      }, fadeMs);
      return () => window.clearTimeout(t);
    }, intervalMs);
    return () => clearInterval(id);
  }, [words.length, intervalMs, fadeMs]);

  return (
    <span
      className={cn('inline-block text-primary', className)}
      style={{
        opacity: fading ? 0 : 1,
        transform: fading ? 'translateY(4px)' : 'translateY(0)',
        transition: `opacity ${fadeMs}ms ease-out, transform ${fadeMs}ms ease-out`,
      }}
    >
      {words[idx]}
    </span>
  );
}

export default CyclingWord;
