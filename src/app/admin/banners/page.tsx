'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const SLOTS: { slot: BannerSlot; title: string; placement: string }[] = [
  {
    slot: 1,
    title: 'Слот №1 — над телом кейса',
    placement: 'Показывается в верхней части страницы кейса, перед заголовком и описанием.',
  },
  {
    slot: 2,
    title: 'Слот №2 — под телом кейса',
    placement: 'Показывается под телом кейса, после задания и материалов.',
  },
];

export default function AdminBannersPage() {
  const { currentUser, isInitialized } = useUserStore();
  const router = useRouter();
  const { toast } = useToast();

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
        title: 'Нет доступа',
        description: 'Управлять рекламой может только администратор.',
      });
      router.push('/');
    }
  }, [currentUser, isInitialized, router, toast]);

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
            title: 'Не удалось загрузить баннеры',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

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
              Баннерная реклама
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Загружайте креативы для двух рекламных мест на странице кейса. Креативы сохраняются на
            сервере и сразу появляются на всех страницах кейсов для всех пользователей.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Требования к креативам</CardTitle>
            <CardDescription>
              Используйте одинаковые размеры для обоих слотов, чтобы баннеры выглядели единообразно.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SpecCell label="Соотношение сторон" value={BANNER_ASPECT_RATIO.replace(/\s/g, '')} hint="ширина : высота" />
            <SpecCell
              label="Рекомендуемый размер"
              value={`${BANNER_RECOMMENDED_WIDTH} × ${BANNER_RECOMMENDED_HEIGHT} px`}
              hint="оптимально для Retina"
            />
            <SpecCell
              label="Форматы / размер"
              value="PNG, JPG, WEBP, SVG"
              hint="до 25 МБ на файл"
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {SLOTS.map((s) => (
            <BannerSlotCard
              key={s.slot}
              slot={s.slot}
              title={s.title}
              placement={s.placement}
              info={manifest[String(s.slot) as '1' | '2']}
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
  title: string;
  placement: string;
  info: BannerInfo | null;
  loading: boolean;
  onChange: (next: BannerManifest) => void;
};

function BannerSlotCard({ slot, title, placement, info, loading, onChange }: BannerSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkDraft, setLinkDraft] = useState(info?.linkUrl ?? '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

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
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка загрузки');
      onChange(data.manifest as BannerManifest);
      toast({ title: `Баннер №${slot} обновлён` });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: err instanceof Error ? err.message : 'Не удалось загрузить баннер',
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
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      onChange(data.manifest as BannerManifest);
      toast({ title: 'Ссылка обновлена' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: err instanceof Error ? err.message : 'Не удалось сохранить ссылку',
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
      if (!res.ok) throw new Error(data?.error ?? 'Ошибка');
      onChange(data.manifest as BannerManifest);
      setLinkDraft('');
      toast({ title: `Слот №${slot} очищен` });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: err instanceof Error ? err.message : 'Не удалось удалить баннер',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{placement}</CardDescription>
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
            <img src={info.url} alt={`Баннер №${slot}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Megaphone className="h-5 w-5 opacity-70" />
              <span>Креатив не загружен</span>
              <span className="text-[10px] text-muted-foreground/70">
                {BANNER_RECOMMENDED_WIDTH}×{BANNER_RECOMMENDED_HEIGHT} px
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`banner-link-${slot}`}>Ссылка перехода (по клику)</Label>
          <Input
            id={`banner-link-${slot}`}
            type="url"
            placeholder="https://example.com"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">
            Оставьте пустым, чтобы баннер не был кликабелен.
          </p>
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
            {info ? 'Заменить креатив' : 'Загрузить креатив'}
          </Button>
          {info ? (
            <>
              <Button type="button" variant="outline" onClick={saveLink} disabled={busy}>
                Сохранить ссылку
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={clearBanner}
                disabled={busy}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </Button>
            </>
          ) : null}
        </div>

        {info ? (
          <p className="text-[11px] text-muted-foreground">
            Обновлено: {new Date(info.updatedAt).toLocaleString('ru-RU')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
