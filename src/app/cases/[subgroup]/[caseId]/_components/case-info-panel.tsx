'use client';

import { Download, FileText } from 'lucide-react';
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
  const images: SerializedCaseAttachment[] = [];
  const documents: SerializedCaseAttachment[] = [];
  for (const attachment of caseData.attachments) {
    if (attachment.kind === 'image') images.push(attachment);
    else documents.push(attachment);
  }

  const headerMeta = [
    caseData.age != null ? `${caseData.age} лет` : null,
    genderLabel(caseData.gender),
  ].filter(Boolean);

  return (
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

        {(images.length > 0 || documents.length > 0) && (
          <section className="space-y-3">
            <h3 className="text-base font-semibold">Прикреплённые материалы</h3>

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((image) => (
                  <ImageThumbnail key={image.id} attachment={image} />
                ))}
              </div>
            )}

            {documents.length > 0 && (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <DocumentRow key={doc.id} attachment={doc} />
                ))}
              </ul>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function ImageThumbnail({ attachment }: { attachment: SerializedCaseAttachment }) {
  const alt = attachment.originalName ?? attachment.filename;
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="block aspect-square overflow-hidden rounded-md border border-border/40 bg-background/50 transition hover:border-primary"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.url}
        alt={alt}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

function DocumentRow({ attachment }: { attachment: SerializedCaseAttachment }) {
  const name = attachment.originalName ?? attachment.filename;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(attachment.size)}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={attachment.url} target="_blank" rel="noreferrer">
          <Download className="mr-1 h-4 w-4" />
          Скачать
        </a>
      </Button>
    </li>
  );
}

export default CaseInfoPanel;
