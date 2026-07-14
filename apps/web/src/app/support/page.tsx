'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { useUserStore } from '@/hooks/use-user-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/auth-client';
import { File as FileIcon, Loader2, Mail, Paperclip, X } from 'lucide-react';

type UploadedFile = {
  filename: string;
  originalName: string;
  size: number;
  url: string;
};

export default function SupportPage() {
  const { currentUser, isInitialized } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('user.support');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isInitialized && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, router, isInitialized]);

  const supportSchema = useMemo(
    () =>
      z.object({
        subject: z.string().min(1, t('errors.subjectRequired')),
        message: z.string().min(10, t('errors.messageMin')),
      }),
    [t],
  );
  type SupportFormValues = z.infer<typeof supportSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupportFormValues>({
    resolver: zodResolver(supportSchema),
  });

  if (!isInitialized || !currentUser) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const senderName = currentUser.fullName ?? currentUser.name;
  const senderPhone = currentUser.phoneNumber ?? t('phoneFallback');

  const handleFilePicked = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/support/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      setUploadedFiles((prev) => [
        ...prev,
        {
          filename: data.filename,
          originalName: data.originalName ?? file.name,
          size: data.size ?? file.size,
          url: data.url,
        },
      ]);
      toast({ title: t('attachmentUploaded') });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('attachmentErrorTitle'),
        description: err instanceof Error ? err.message : t('attachmentErrorDescription'),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (filename: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.filename !== filename));
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${bytes} Б`;
  };

  const onSubmit: SubmitHandler<SupportFormValues> = (data) => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const attachmentLines = uploadedFiles
      .map((f) => `${f.originalName} (${formatBytes(f.size)}): ${origin}${f.url}`)
      .join('\n');
    const attachmentBlock = uploadedFiles.length
      ? `\n\n${t('mailAttachmentsLabel')}:\n${attachmentLines}`
      : '';
    const body = `${data.message}${attachmentBlock}\n\n---\n${t('mailSenderLabel')}: ${senderName}\n${t('mailEmailLabel')}: ${currentUser.email}\n${t('mailPhoneLabel')}: ${senderPhone}`;
    const mailtoUrl = `mailto:docjob@inbox.kz?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    toast({ title: t('sentToast') });
  };

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline">{t('title')}</h1>
        </header>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="subject">{t('subjectLabel')}</Label>
                <Input id="subject" {...register('subject')} />
                {errors.subject && <p className="text-destructive text-sm mt-1">{errors.subject.message}</p>}
              </div>
              <div>
                <Label htmlFor="message">{t('messageLabel')}</Label>
                <Textarea id="message" rows={6} {...register('message')} />
                {errors.message && <p className="text-destructive text-sm mt-1">{errors.message.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>{t('attachmentsLabel')}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFilePicked(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="mr-2 h-4 w-4" />
                    )}
                    {t('attachButton')}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">{t('attachmentsHint')}</span>
                </div>
                {uploadedFiles.length > 0 ? (
                  <ul className="space-y-1.5 pt-2">
                    {uploadedFiles.map((f) => (
                      <li
                        key={f.filename}
                        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                      >
                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {f.originalName}
                        </a>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(f.size)}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeFile(f.filename)}
                          aria-label={t('attachmentRemove')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t('infoTitle')}</p>
                <p>{t('infoEmail', { email: currentUser.email })}</p>
                <p>{t('infoPhone', { phone: senderPhone })}</p>
                <p>{t('infoName', { name: senderName })}</p>
              </div>

              <Button type="submit" className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                {t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
