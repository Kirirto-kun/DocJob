'use client';

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  BANNER_SLOT_SPECS,
  type BannerInfo,
  type BannerManifest,
  type BannerSlot,
} from '@/lib/banners';

// Module-level cache so multiple <BannerAd> instances on the same page
// (header + sidebar) share a single fetch.
let manifestCache: BannerManifest | null = null;
let manifestPromise: Promise<BannerManifest> | null = null;

function loadManifest(): Promise<BannerManifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/api/banners')
    .then((r) => r.json() as Promise<BannerManifest>)
    .then((m) => {
      manifestCache = m;
      return m;
    })
    .catch(() => ({ '1': null, '2': null }) as BannerManifest);
  return manifestPromise;
}

type BannerAdProps = {
  slot: BannerSlot;
  className?: string;
  /** Show the placeholder hint (size + slot label) when no creative uploaded. */
  showPlaceholder?: boolean;
};

export function BannerAd({ slot, className, showPlaceholder = true }: BannerAdProps) {
  const t = useTranslations('case.banner');
  const spec = BANNER_SLOT_SPECS[slot];
  const [info, setInfo] = useState<BannerInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadManifest().then((m) => {
      if (cancelled) return;
      setInfo(m[String(slot) as '1'] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [slot]);

  // Loading — render an empty box of the correct aspect to avoid layout shift.
  if (info === undefined) {
    return (
      <div
        className={cn('w-full overflow-hidden rounded-md bg-muted/10', className)}
        style={{ aspectRatio: spec.aspect }}
        aria-hidden
      />
    );
  }

  if (info) {
    const content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={info.url}
        alt={t('alt', { slot })}
        className="h-full w-full object-cover"
        style={{ aspectRatio: spec.aspect }}
      />
    );

    const wrapperClass = cn(
      'block w-full overflow-hidden rounded-md border border-border/40 bg-muted/10',
      className,
    );

    if (info.linkUrl) {
      return (
        <a
          href={info.linkUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          data-ad-slot={slot}
          className={wrapperClass}
        >
          {content}
        </a>
      );
    }

    return (
      <div data-ad-slot={slot} className={wrapperClass}>
        {content}
      </div>
    );
  }

  if (!showPlaceholder) return null;

  return (
    <div
      data-ad-slot={slot}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground',
        className,
      )}
      style={{ aspectRatio: spec.aspect }}
    >
      <div className="flex items-center gap-1.5">
        <Megaphone className="h-3 w-3 opacity-70" aria-hidden />
        <span>{t('placeholderTitle', { slot })}</span>
      </div>
      <span className="text-[9px] normal-case tracking-normal text-muted-foreground/70">
        {spec.width}×{spec.height} px
      </span>
    </div>
  );
}

export default BannerAd;
