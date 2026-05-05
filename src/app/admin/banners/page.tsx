'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Megaphone, Trash2, UploadCloud } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import {
  BANNER_ASPECT_RATIO,
  BANNER_RECOMMENDED_HEIGHT,
  BANNER_RECOMMENDED_WIDTH,
  type BannerInfo,
  type BannerManifest,
  type BannerSlot,
} from '@/lib/banners';

const SLOT_KEYS: BannerSlot[] = [1, 2];

export default function AdminBannersPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.banners');

  const [manifest, setManifest] = useState<BannerManifest>({ '1': null, '2': null });
  const [loadingManifest, setLoadingManifest] = useState(true);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: t('accessDeniedTitle'),
        description: t('accessDeniedDescription'),
      });
      router.push('/');
    }
  }, [currentUser, isInitialized, router, toast, t]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners')
      .then((r) => r.json())
      .then((data: BannerManifest) => {
        if (!cancelled) setManifest(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: t('toast.fetchFailed'),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  if (!isInitialized || !currentUser || currentUser.role !== 'admin') {
    return (
      <DashboardLayout sidebarContent={null}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={null}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
              {t('title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('specs.cardTitle')}</CardTitle>
            <CardDescription>{t('specs.cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SpecCell
              label={t('specs.aspectLabel')}
              value={BANNER_ASPECT_RATIO.replace(/\s/g, '')}
              hint={t('specs.aspectHint')}
            />
            <SpecCell
              label={t('specs.sizeLabel')}
              value={`${BANNER_RECOMMENDED_WIDTH} × ${BANNER_RECOMMENDED_HEIGHT} px`}
              hint={t('specs.sizeHint')}
            />
            <SpecCell
              label={t('specs.formatsLabel')}
              value={t('specs.formatsValue')}
              hint={t('specs.formatsHint')}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {SLOT_KEYS.map((slot) => (
            <BannerSlotCard
              key={slot}
              slot={slot}
              info={manifest[String(slot) as '1' | '2']}
              loading={loadingManifest}
              onChange={(next) => setManifest(next)}
            />
          ))}
        </div>
      </main>
    </DashboardLayout>
  );
}

function SpecCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type BannerSlotCardProps = {
  slot: BannerSlot;
  info: BannerInfo | null;
  loading: boolean;
  onChange: (next: BannerManifest) => void;
};

function BannerSlotCard({ slot, info, loading, onChange }: BannerSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkDraft, setLinkDraft] = useState(info?.linkUrl ?? '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('admin.banners');
  const locale = useLocale();
  const slotKey = String(slot) as '1' | '2';

  useEffect(() => {
    setLinkDraft(info?.linkUrl ?? '');
  }, [info?.linkUrl]);

  const onFileSelected = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('slot', String(slot));
      fd.append('file', file);
      if (linkDraft.trim()) fd.append('linkUrl', linkDraft.trim());
      const res = await fetch('/api/banners', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t('toast.uploadFailedFallback'));
      onChange(data.manifest as BannerManifest);
      toast({ title: t('toast.uploadedTitle', { slot }) });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: err instanceof Error ? err.message : t('toast.uploadFailed'),
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveLink = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const res = await fetch('/api/banners', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot, linkUrl: linkDraft.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t('toast.errorFallback'));
      onChange(data.manifest as BannerManifest);
      toast({ title: t('toast.linkUpdated') });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: err instanceof Error ? err.message : t('toast.saveLinkFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const clearBanner = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/banners?slot=${slot}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t('toast.errorFallback'));
      onChange(data.manifest as BannerManifest);
      setLinkDraft('');
      toast({ title: t('toast.cleared', { slot }) });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('toast.errorTitle'),
        description: err instanceof Error ? err.message : t('toast.deleteFailed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`slots.${slotKey}.title`)}</CardTitle>
        <CardDescription>{t(`slots.${slotKey}.placement`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="overflow-hidden rounded-lg border border-border/40 bg-muted/20"
          style={{ aspectRatio: BANNER_ASPECT_RATIO }}
        >
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : info ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.url}
              alt={t('card.alt', { slot })}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Megaphone className="h-5 w-5 opacity-70" />
              <span>{t('card.previewEmptyLabel')}</span>
              <span className="text-[10px] text-muted-foreground/70">
                {t('card.previewEmptySize', {
                  width: BANNER_RECOMMENDED_WIDTH,
                  height: BANNER_RECOMMENDED_HEIGHT,
                })}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`banner-link-${slot}`}>{t('card.linkLabel')}</Label>
          <Input
            id={`banner-link-${slot}`}
            type="url"
            placeholder={t('card.linkPlaceholder')}
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">{t('card.linkHint')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileSelected(f);
            }}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            {info ? t('card.replaceButton') : t('card.uploadButton')}
          </Button>
          {info ? (
            <>
              <Button type="button" variant="outline" onClick={saveLink} disabled={busy}>
                {t('card.saveLink')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={clearBanner}
                disabled={busy}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('card.delete')}
              </Button>
            </>
          ) : null}
        </div>

        {info ? (
          <p className="text-[11px] text-muted-foreground">
            {t('card.updatedAt', {
              date: new Date(info.updatedAt).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU'),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
