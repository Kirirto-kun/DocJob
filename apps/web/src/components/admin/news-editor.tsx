'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { createNews, updateNews } from '@/app/actions';

type NewsEditorProps = {
  mode: 'create' | 'edit';
  initial?: { id: string; title: string; body: string; date: string };
};

function isoToDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function NewsEditor({ mode, initial }: NewsEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('admin.news');

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [date, setDate] = useState<string>(isoToDateInput(initial?.date));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const input: { title: string; body: string; date?: string } = {
        title: title.trim(),
        body: body.trim(),
      };
      if (date) input.date = date;

      const result =
        mode === 'edit' && initial
          ? await updateNews(initial.id, input)
          : await createNews(input);

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: t('toast.errorTitle'),
          description: result.error,
        });
        return;
      }
      toast({
        title: mode === 'create' ? t('toast.createdTitle') : t('toast.updatedTitle'),
      });
      router.push('/admin/news');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">
            {mode === 'create' ? t('createTitle') : t('editTitle')}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/news">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('backToList')}
            </Link>
          </Button>
        </header>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>{mode === 'create' ? t('createTitle') : t('editTitle')}</CardTitle>
              <CardDescription>{t('subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="news-title">{t('form.titleLabel')}</Label>
                <Input
                  id="news-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder={t('form.titlePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="news-date">{t('form.dateLabel')}</Label>
                <Input
                  id="news-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('form.dateHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="news-body">{t('form.bodyLabel')}</Label>
                <Textarea
                  id="news-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  maxLength={10000}
                  placeholder={t('form.bodyPlaceholder')}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/admin/news">{t('form.cancel')}</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting
                ? t('form.saving')
                : mode === 'create'
                ? t('form.submitCreate')
                : t('form.submitUpdate')}
            </Button>
          </div>
        </form>
      </main>
    </DashboardLayout>
  );
}

export default NewsEditor;
