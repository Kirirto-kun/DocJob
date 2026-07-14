'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  ChevronLeft,
  Inbox,
  Paperclip,
  Send,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserStore } from '@/hooks/use-user-store';
import {
  getAllCaseSubmissions,
  sendCaseSubmissionMessage,
  updateCaseSubmissionStatus,
  type SerializedCaseSubmission,
  type SerializedSubmissionAttachment,
} from '@/app/actions';
import { authFetch } from '@/lib/auth-client';
import { subgroupLabel } from '@/lib/case-taxonomy';
import { cn } from '@/lib/utils';

const STATUS_VALUES = ['new', 'in_review', 'accepted', 'rejected', 'done'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

export default function AdminCaseSubmissionsPage() {
  const router = useRouter();
  const { currentUser, isInitialized } = useUserStore();
  const t = useTranslations('adminSubmissions');
  const tSuggest = useTranslations('suggestCase');
  const { toast } = useToast();
  const [items, setItems] = useState<SerializedCaseSubmission[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.push('/');
      return;
    }
    void load();
  }, [isInitialized, currentUser, router]);

  const load = async () => {
    setLoading(true);
    const res = await getAllCaseSubmissions();
    if (res.success) setItems(res.data);
    setLoading(false);
  };

  const active = items.find((s) => s.id === activeId) ?? null;

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6 pb-12">
          <div>
            <h1 className="font-headline text-3xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('description')}</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : active ? (
            <ThreadPanel
              submission={active}
              onBack={() => setActiveId(null)}
              onChanged={load}
              onError={(e) => toast({ variant: 'destructive', title: e })}
              statusLabel={(s) =>
                tSuggest(`list.status.${s as 'new' | 'in_review' | 'accepted' | 'rejected' | 'done'}`)
              }
            />
          ) : items.length === 0 ? (
            <Card className="p-12 text-center">
              <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t('empty')}</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveId(s.id)}
                        className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.authorName} · {new Date(s.updatedAt).toLocaleString()}
                          </p>
                          <p className="line-clamp-2 mt-1 text-sm text-muted-foreground">
                            {s.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {s.subgroup ? (
                            <Badge variant="secondary">{subgroupLabel(s.subgroup)}</Badge>
                          ) : null}
                          <Badge variant="outline">
                            {tSuggest(`list.status.${(s.status as StatusValue) ?? 'new'}`)}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}

function ThreadPanel({
  submission,
  onBack,
  onChanged,
  onError,
  statusLabel,
}: {
  submission: SerializedCaseSubmission;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
  statusLabel: (s: string) => string;
}) {
  const t = useTranslations('adminSubmissions');
  const tSuggest = useTranslations('suggestCase');
  const { currentUser } = useUserStore();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<SerializedSubmissionAttachment[]>([]);
  const [status, setStatus] = useState<StatusValue>((submission.status as StatusValue) ?? 'new');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [submission.messages.length]);

  const onSend = async () => {
    if (sending) return;
    if (draft.trim().length === 0 && attachments.length === 0) return;
    setSending(true);
    try {
      const res = await sendCaseSubmissionMessage({
        submissionId: submission.id,
        body: draft.trim() || '[вложение]',
        attachmentIds: attachments.map((a) => a.attachmentId),
      });
      if (!res.success) {
        onError(res.error);
        return;
      }
      setDraft('');
      setAttachments([]);
      await onChanged();
    } finally {
      setSending(false);
    }
  };

  const onStatusChange = async (next: string) => {
    const nextStatus = next as StatusValue;
    setStatus(nextStatus);
    const res = await updateCaseSubmissionStatus(submission.id, nextStatus);
    if (!res.success) {
      onError(res.error);
      return;
    }
    await onChanged();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/attachments/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        onError(`${file.name}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      setAttachments((prev) => [
        ...prev,
        {
          attachmentId: data.id,
          filename: data.filename,
          originalName: file.name,
          url: data.url,
          mimeType: data.mimeType,
          size: data.size,
        },
      ]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="flex h-[80vh] flex-col overflow-hidden">
      <CardHeader className="border-b">
        <Button size="sm" variant="ghost" onClick={onBack} className="mb-2 w-fit">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('back')}
        </Button>
        <CardTitle>{submission.title}</CardTitle>
        <CardDescription className="space-y-1 pt-1 text-xs">
          <div>
            <span className="font-medium">{submission.authorName}</span> · {submission.authorEmail}
          </div>
          {submission.authors.length > 0 ? (
            <div>
              <span className="text-muted-foreground">{t('authorsLabel')}:</span>{' '}
              {submission.authors.join(', ')}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {submission.subgroup ? (
              <Badge variant="secondary">{subgroupLabel(submission.subgroup)}</Badge>
            ) : null}
            <span className="text-muted-foreground">{t('statusLabel')}:</span>
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardDescription>
      </CardHeader>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
        {submission.messages.map((m) => {
          const isMe = currentUser?.id === m.senderId;
          return (
            <div
              key={m.id}
              className={cn('flex gap-2', isMe ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  isMe ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
                )}
              >
                <p className="text-[10px] font-medium uppercase opacity-70">
                  {isMe ? tSuggest('thread.you') : m.senderName}
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                {m.attachments.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {m.attachments.map((a) => (
                      <li key={a.attachmentId} className="text-xs">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {a.originalName ?? a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-1 text-[10px] opacity-60">
                  {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <CardContent className="border-t bg-card/60 p-3">
        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2 text-xs">
            {attachments.map((a) => (
              <li
                key={a.attachmentId}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1"
              >
                <Paperclip className="h-3 w-3" />
                {a.originalName ?? a.filename}
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex items-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            aria-label={tSuggest('thread.attach')}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tSuggest('thread.placeholder')}
            rows={2}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <Button onClick={onSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">{tSuggest('thread.send')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
