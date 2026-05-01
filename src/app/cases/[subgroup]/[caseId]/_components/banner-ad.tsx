'use client';

import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BANNER_ASPECT_RATIO,
  BANNER_RECOMMENDED_HEIGHT,
  BANNER_RECOMMENDED_WIDTH,
  type BannerInfo,
  type BannerSlot,
} from '@/lib/banners';

type BannerAdProps = {
  slot: BannerSlot;
  info?: BannerInfo | null;
  className?: string;
};

export function BannerAd({ slot, info, className }: BannerAdProps) {
  if (info) {
    const content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={info.url}
        alt={`Реклама №${slot}`}
        className="h-full w-full object-cover"
        style={{ aspectRatio: BANNER_ASPECT_RATIO }}
      />
    );

    const wrapperClass = cn(
      'block w-full overflow-hidden rounded-lg border border-border/40 bg-muted/10',
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

  return (
    <div
      data-ad-slot={slot}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-xs uppercase tracking-wide text-muted-foreground',
        className,
      )}
      style={{ aspectRatio: BANNER_ASPECT_RATIO }}
    >
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 opacity-70" aria-hidden />
        <span>Место для баннерной рекламы №{slot}</span>
      </div>
      <span className="text-[10px] normal-case tracking-normal text-muted-foreground/70">
        Рекомендуемый размер: {BANNER_RECOMMENDED_WIDTH}×{BANNER_RECOMMENDED_HEIGHT} px
        ({BANNER_ASPECT_RATIO.replace(/\s/g, '')})
      </span>
    </div>
  );
}

export default BannerAd;
