'use client';

import { Download, ExternalLink, File as FileIcon, FileText, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CaseBodyViewer } from '@/components/case-body-viewer';
import { subgroupLabel } from '@/lib/case-taxonomy';
import { cn } from '@/lib/utils';
import type { SerializedCase, SerializedCaseAttachment } from '@/app/actions';

const KB = 1024;
const MB = KB * 1024;

function formatFileSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} КБ`;
  return `${bytes} Б`;
}

function genderLabel(gender: string | null): string | null {
  if (!gender) return null;
  const value = gender.trim().toLowerCase();
  if (value === 'м' || value === 'male' || value === 'm') return 'Мужчина';
  if (value === 'ж' || value === 'female' || value === 'f') return 'Женщина';
  return gender;
}

type CaseInfoPanelProps = {
  caseData: SerializedCase;
};

export function CaseInfoPanel({ caseData }: CaseInfoPanelProps) {
  const headerMeta = [
    caseData.age != null ? `${caseData.age} лет` : null,
    genderLabel(caseData.gender),
  ].filter(Boolean);

  const sortedAttachments = [...caseData.attachments].sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">{caseData.name}</CardTitle>
          {headerMeta.length > 0 && (
            <p className="text-sm text-muted-foreground">{headerMeta.join(' · ')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {caseData.specialty && (
              <Badge variant="secondary">{caseData.specialty}</Badge>
            )}
            {caseData.subgroup && (
              <Badge variant="outline">{subgroupLabel(caseData.subgroup)}</Badge>
            )}
            {caseData.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <CaseBodyViewer body={caseData.body} />

          {caseData.taskQuestions.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-base font-semibold">Задание</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {caseData.taskQuestions.map((question, index) => (
                  <li key={index} className="leading-relaxed">
                    {question}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </CardContent>
      </Card>

      {sortedAttachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Файлы и материалы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {sortedAttachments.map((a) => (
              <AttachmentItem key={a.id} attachment={a} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttachmentItem({ attachment }: { attachment: SerializedCaseAttachment }) {
  const displayName = attachment.title?.trim() || attachment.originalName || attachment.filename;
  return (
    <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{displayName}</p>
          {attachment.description ? (
            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
              {attachment.description}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {(attachment.originalName ?? attachment.filename) + ' · ' + formatFileSize(attachment.size)}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={attachment.url} target="_blank" rel="noreferrer">
            <Download className="mr-1 h-4 w-4" />
            Скачать
          </a>
        </Button>
      </div>
      <AttachmentBody attachment={attachment} />
    </div>
  );
}

function AttachmentBody({ attachment }: { attachment: SerializedCaseAttachment }) {
  if (attachment.kind === 'image') {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-md border border-border/40 bg-background"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.title ?? attachment.originalName ?? attachment.filename}
          className="max-h-[600px] w-full object-contain transition group-hover:opacity-95"
        />
      </a>
    );
  }
  if (attachment.kind === 'pdf') {
    return (
      <div className="overflow-hidden rounded-md border border-border/40">
        <iframe
          src={attachment.url}
          title={attachment.title ?? attachment.originalName ?? attachment.filename}
          className="h-[700px] w-full bg-white"
        />
      </div>
    );
  }
  // document / other — Card-row with icon
  const Icon = attachment.kind === 'document' ? FileText : FileIcon;
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2 transition',
        'hover:border-primary',
      )}
    >
      <Icon className="h-6 w-6 text-muted-foreground" />
      <span className="flex-1 text-sm">Открыть файл</span>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}

// Re-exported for legacy imports
export { ImageIcon };
export default CaseInfoPanel;
