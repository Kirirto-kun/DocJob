'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CaseChatView } from '@/components/case-chat-view';
import type { CaseSolution } from '@/lib/case-schema';
import type { SerializedCase } from '@/app/actions';
import type { BannerManifest } from '@/lib/banners';
import { CaseInfoPanel } from './case-info-panel';
import { BannerAd } from './banner-ad';

type CasePageClientProps = {
  subgroup: string;
  caseData: SerializedCase;
  solution: CaseSolution | null;
  banners: BannerManifest;
};

export function CasePageClient({ subgroup, caseData, solution, banners }: CasePageClientProps) {
  const t = useTranslations('case.page');
  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/40 px-4 py-2 backdrop-blur md:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/cases/${subgroup}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('back')}
          </Link>
        </Button>
        <span className="truncate text-sm text-muted-foreground">{caseData.name}</span>
      </div>

      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(420px,1fr)] lg:gap-6 lg:p-6">
        <div className="min-w-0 overflow-y-auto pr-2">
          <div className="space-y-6 pb-6">
            <BannerAd slot={1} info={banners['1']} />
            <CaseInfoPanel caseData={caseData} />
            <BannerAd slot={2} info={banners['2']} />
          </div>
        </div>
        <aside className="flex min-h-0 flex-col overflow-hidden">
          <CaseChatView
            caseId={caseData.id}
            caseName={caseData.name}
            solution={solution}
            className="flex h-full min-h-0 flex-col gap-3"
          />
        </aside>
      </div>

      <Tabs
        defaultValue="case"
        className="flex min-h-0 flex-1 flex-col p-4 lg:hidden"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="case">{t('tabCase')}</TabsTrigger>
          <TabsTrigger value="chat">{t('tabChat')}</TabsTrigger>
        </TabsList>
        <TabsContent
          value="case"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 data-[state=inactive]:hidden"
        >
          <div className="space-y-6 pb-6">
            <BannerAd slot={1} info={banners['1']} />
            <CaseInfoPanel caseData={caseData} />
            <BannerAd slot={2} info={banners['2']} />
          </div>
        </TabsContent>
        <TabsContent
          value="chat"
          className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <CaseChatView
            caseId={caseData.id}
            caseName={caseData.name}
            solution={solution}
            className="flex h-full min-h-0 flex-col gap-3"
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

export default CasePageClient;
