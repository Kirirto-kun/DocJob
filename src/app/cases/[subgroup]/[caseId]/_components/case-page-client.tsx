'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CaseChatView } from '@/components/case-chat-view';
import type { CaseSolution } from '@/lib/case-schema';
import type { SerializedCase } from '@/app/actions';
import { CaseInfoPanel } from './case-info-panel';

type CasePageClientProps = {
  subgroup: string;
  caseData: SerializedCase;
  solution: CaseSolution | null;
};

export function CasePageClient({ subgroup, caseData, solution }: CasePageClientProps) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/40 px-4 py-2 backdrop-blur md:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/cases/${subgroup}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Назад к списку
          </Link>
        </Button>
        <span className="truncate text-sm text-muted-foreground">{caseData.name}</span>
      </div>

      <div className="hidden h-full min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6 lg:p-6">
        <div className="overflow-y-auto pr-2">
          <CaseInfoPanel caseData={caseData} />
        </div>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <CaseChatView
            caseId={caseData.id}
            caseName={caseData.name}
            solution={solution}
            className="flex h-full min-h-0 flex-col gap-3"
          />
        </div>
      </div>

      <Tabs
        defaultValue="case"
        className="flex h-full min-h-0 flex-1 flex-col p-4 lg:hidden"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="case">Кейс</TabsTrigger>
          <TabsTrigger value="chat">Чат</TabsTrigger>
        </TabsList>
        <TabsContent
          value="case"
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 data-[state=inactive]:hidden"
        >
          <CaseInfoPanel caseData={caseData} />
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
