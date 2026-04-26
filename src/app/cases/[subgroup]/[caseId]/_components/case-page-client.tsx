'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    <main className="flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/cases/${subgroup}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Назад к списку
          </Link>
        </Button>
      </div>

      <div className="hidden lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-6">
        <ScrollArea className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
          <CaseInfoPanel caseData={caseData} />
        </ScrollArea>
        <div className="min-h-[70vh]">
          <CaseChatView
            caseId={caseData.id}
            caseName={caseData.name}
            solution={solution}
          />
        </div>
      </div>

      <Tabs defaultValue="case" className="lg:hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="case">Кейс</TabsTrigger>
          <TabsTrigger value="chat">Чат</TabsTrigger>
        </TabsList>
        <TabsContent value="case">
          <CaseInfoPanel caseData={caseData} />
        </TabsContent>
        <TabsContent value="chat" className="min-h-[70vh]">
          <CaseChatView
            caseId={caseData.id}
            caseName={caseData.name}
            solution={solution}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

export default CasePageClient;
