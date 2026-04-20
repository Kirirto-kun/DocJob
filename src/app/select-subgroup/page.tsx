'use client';

import { useRouter } from 'next/navigation';
import { Award, Briefcase, HeartPulse, Loader2, ShieldCheck, type LucideIcon } from 'lucide-react';
import DashboardLayout from '@/components/dashboard-layout';
import ScenarioControls from '@/components/scenario-controls';
import { Card, CardContent } from '@/components/ui/card';
import { SUBGROUPS, type SubgroupSlug } from '@/lib/case-taxonomy';
import { useUserStore } from '@/hooks/use-user-store';

const SUBGROUP_ICONS: Record<SubgroupSlug, LucideIcon> = {
  clinical: HeartPulse,
  sanepid: ShieldCheck,
  best_practices: Award,
  management: Briefcase,
};

export default function SelectSubgroupPage() {
  const router = useRouter();
  const { isInitialized } = useUserStore();

  if (!isInitialized) {
    return (
      <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
        <main className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarContent={<ScenarioControls onScenarioGenerated={() => {}} />}>
      <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
        <h1 className="text-3xl font-headline font-semibold mb-8 text-foreground/90">
          Выберите подгруппу кейсов
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SUBGROUPS.map((sg) => {
            const Icon = SUBGROUP_ICONS[sg.slug];
            return (
              <Card
                key={sg.slug}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/cases/${sg.slug}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/cases/${sg.slug}`);
                  }
                }}
                className="cursor-pointer transition-all hover:border-primary/60 hover:shadow-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <CardContent className="flex flex-col items-center justify-center text-center gap-4 p-10">
                  <Icon className="h-12 w-12 text-primary" />
                  <span className="text-xl font-semibold font-headline">{sg.label}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </DashboardLayout>
  );
}
