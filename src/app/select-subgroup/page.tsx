'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Award, Briefcase, HeartPulse, Loader2, ShieldCheck, type LucideIcon } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Card, CardContent } from '@/components/ui/card';
import { SUBGROUPS, type SubgroupSlug } from '@/lib/case-taxonomy';
import { useUserStore } from '@/hooks/use-user-store';
import { cn } from '@/lib/utils';

const SUBGROUP_ICONS: Record<SubgroupSlug, LucideIcon> = {
  clinical: HeartPulse,
  sanepid: ShieldCheck,
  best_practices: Award,
  management: Briefcase,
};

export default function SelectSubgroupPage() {
  const router = useRouter();
  const t = useTranslations('cases.subgroupPicker');
  const { isInitialized } = useUserStore();
  const [pendingSlug, setPendingSlug] = useState<SubgroupSlug | null>(null);
  const [, startTransition] = useTransition();

  const handleOpen = (slug: SubgroupSlug) => {
    if (pendingSlug) return;
    setPendingSlug(slug);
    startTransition(() => router.push(`/cases/${slug}`));
  };

  if (!isInitialized) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <main className="flex h-full items-center justify-center p-4 md:p-6 lg:p-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="h-full overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
        <h1 className="mb-2 font-headline text-2xl md:text-3xl font-semibold text-foreground/90">
          {t('title')}
        </h1>
        <p className="mb-8 max-w-prose text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
        <div className="grid grid-cols-1 gap-6 pb-6 md:grid-cols-2">
          {SUBGROUPS.map((sg) => {
            const Icon = SUBGROUP_ICONS[sg.slug];
            const isPending = pendingSlug === sg.slug;
            const hasOtherPending = pendingSlug !== null && !isPending;
            return (
              <Card
                key={sg.slug}
                role="button"
                tabIndex={0}
                aria-busy={isPending}
                onClick={() => handleOpen(sg.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpen(sg.slug);
                  }
                }}
                className={cn(
                  'group relative overflow-hidden cursor-pointer transition-all',
                  'hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  hasOtherPending && 'pointer-events-none opacity-60',
                  isPending && 'border-primary',
                )}
              >
                <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
                  <Icon className="h-12 w-12 text-primary" />
                  <span className="font-headline text-xl font-semibold">{sg.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('specialtiesCount', { count: sg.specialties.length })}
                  </span>
                </CardContent>
                {isPending ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </main>
    </DashboardLayout>
  );
}
