'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  createAnnouncement,
  updateAnnouncement,
  type SerializedAnnouncement,
} from '@/app/actions';

type Props = {
  mode: 'create' | 'edit';
  initial?: SerializedAnnouncement;
};

// Convert an ISO string to the value expected by <input type="date"> (YYYY-MM-DD).
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function AnnouncementEditor({ mode, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('announcements');

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? '');
  const [linkLabel, setLinkLabel] = useState(initial?.linkLabel ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [expiresAt, setExpiresAt] = useState(isoToDateInput(initial?.expiresAt));
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/images/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      setImageUrl(data.url);
      toast({ title: t('imageUploaded') });
    } catch {
      toast({ variant: 'destructive', title: t('imageUploadFailed') });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl || undefined,
        linkUrl: linkUrl || undefined,
        linkLabel: linkLabel || undefined,
        active,
        expiresAt: expiresAt || undefined,
      };
      const result =
        mode === 'edit' && initial
          ? await updateAnnouncement({ id: initial.id, ...payload })
          : await createAnnouncement(payload);

      if (!result.success) {
        toast({ variant: 'destructive', title: result.error });
        return;
      }
      toast({ title: mode === 'create' ? t('created') : t('updated') });
      router.push('/admin/announcements');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
            {mode === 'create' ? t('createTitle') : t('editTitle')}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/announcements">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('backToList')}
            </Link>
          </Button>
        </header>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>{t('details')}</CardTitle>
              <CardDescription>{t('adminSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ann-title">{t('titleField')}</Label>
                <Input
                  id="ann-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ann-body">{t('bodyField')}</Label>
                <Textarea
                  id="ann-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t('imageField')}</Label>
                {imageUrl ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="max-h-48 rounded-md border border-border object-cover"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setImageUrl('')}
                    >
                      {t('removeImage')}
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:bg-accent">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>{t('uploadImage')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ann-linkurl">{t('linkUrlField')}</Label>
                <Input
                  id="ann-linkurl"
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ann-linklabel">{t('linkLabelField')}</Label>
                <Input
                  id="ann-linklabel"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  maxLength={100}
                  placeholder={t('linkLabelPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ann-expires">{t('expiresAtField')}</Label>
                <Input
                  id="ann-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="ann-active">{t('activeField')}</Label>
                  <p className="text-xs text-muted-foreground">{t('activeHint')}</p>
                </div>
                <Switch id="ann-active" checked={active} onCheckedChange={setActive} />
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/admin/announcements">{t('cancel')}</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting || uploading}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </div>
        </form>
      </main>
    </DashboardLayout>
  );
}

export default AnnouncementEditor;
