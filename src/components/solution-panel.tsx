'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  ListOrdered,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type {
  CaseSolution,
  ChatEvaluation,
  IncidentSolution,
  ReflectionSolution,
} from '@/lib/case-schema';

export type SolutionPanelProps = {
  evaluation: ChatEvaluation | null;
  solution: CaseSolution | null;
  className?: string;
};

const PREVENTABILITY_LABEL: Record<IncidentSolution['preventability'], string> = {
  full: 'Полностью предотвратимо',
  conditional: 'Условно предотвратимо',
  none: 'Не предотвратимо',
};

const PREVENTABILITY_VARIANT: Record<
  IncidentSolution['preventability'],
  'default' | 'secondary' | 'destructive'
> = {
  full: 'default',
  conditional: 'secondary',
  none: 'destructive',
};

const markdownComponents = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
  ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ ...props }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: ({ ...props }) => <td className="border border-border px-2 py-1 align-top" {...props} />,
  code: ({ ...props }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]" {...props} />
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function ErrorBulletList({
  items,
  variant,
}: {
  items: string[];
  variant: 'matched' | 'missed' | 'extra';
}) {
  if (!items.length) return null;
  const config = {
    matched: {
      title: 'Совпало с эталоном',
      Icon: CheckCircle2,
      tone: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
    },
    missed: {
      title: 'Пропущено',
      Icon: XCircle,
      tone: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
    },
    extra: {
      title: 'Лишнее',
      Icon: AlertTriangle,
      tone: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/30',
    },
  }[variant];
  const { Icon, tone, bg, title } = config;
  return (
    <div className={cn('rounded-md border p-3', bg)}>
      <div className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', tone)}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <ul className="space-y-1 pl-5 text-sm text-foreground/90 list-disc">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function IncidentSolutionView({ solution }: { solution: IncidentSolution }) {
  const preventabilityVariant = PREVENTABILITY_VARIANT[solution.preventability];
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Диагноз / итог
        </div>
        <p className="text-sm leading-relaxed text-foreground">{solution.diagnosis}</p>
      </div>

      {solution.errors.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Ключевые ошибки
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/90">
            {solution.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ListOrdered className="h-4 w-4 text-primary" />
          Корректный алгоритм
        </div>
        <Markdown>{solution.correctAlgorithm}</Markdown>
      </div>

      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Предотвратимость:</span>
        <Badge variant={preventabilityVariant}>
          {PREVENTABILITY_LABEL[solution.preventability]}
        </Badge>
      </div>
    </div>
  );
}

function ReflectionSolutionView({ solution }: { solution: ReflectionSolution }) {
  return (
    <div className="space-y-4">
      {solution.keyInsights.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Ключевые инсайты
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
            {solution.keyInsights.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {solution.correctDecisions.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Верные решения
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
            {solution.correctDecisions.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Что вынести из кейса
        </div>
        <Markdown>{solution.lessonsLearned}</Markdown>
      </div>
    </div>
  );
}

function SolutionView({ solution }: { solution: CaseSolution }) {
  if (solution.kind === 'incident') return <IncidentSolutionView solution={solution} />;
  return <ReflectionSolutionView solution={solution} />;
}

export function SolutionPanel({ evaluation, solution, className }: SolutionPanelProps) {
  if (!evaluation && !solution) return null;

  const correct = evaluation?.correct ?? false;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="text-base">Разбор кейса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {evaluation ? (
          <section className="space-y-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold',
                correct
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200',
              )}
            >
              {correct ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {correct ? 'Правильно' : 'Есть замечания'}
            </div>

            {evaluation.feedback ? <Markdown>{evaluation.feedback}</Markdown> : null}

            <div className="grid gap-3 sm:grid-cols-1">
              <ErrorBulletList items={evaluation.matchedErrors} variant="matched" />
              <ErrorBulletList items={evaluation.missedErrors} variant="missed" />
              <ErrorBulletList items={evaluation.extraErrors} variant="extra" />
            </div>
          </section>
        ) : null}

        {solution ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" />
              Эталонное решение
            </div>
            <SolutionView solution={solution} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default SolutionPanel;
