import { notFound } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { serverCaller } from '@/lib/trpc/server';
import { CasePageClient } from './_components/case-page-client';

type CasePageParams = {
  params: Promise<{ subgroup: string; caseId: string }>;
};

/**
 * Server Component — case detail load moved from a hand-rolled
 * `prisma.case.findUnique` + manual `SerializedCase` construction (which
 * duplicated `@docjob/core`'s `serializeCase`) to the in-process tRPC server
 * caller (`api.cases.byId`, SP-2 Task 3). `core.cases.getCase` asserts an
 * *approved* actor (`assertApproved`), one notch stricter than the previous
 * "any logged-in user" check this page did inline — now consistent with the
 * case-list page (`getCases`/`trpc.cases.list`, which always required
 * approval). Missing/unauthorized/unapproved all fall through to the same
 * `notFound()` the old `!user` branch used.
 */
export default async function CasePage({ params }: CasePageParams) {
  const { subgroup, caseId } = await params;

  const api = await serverCaller();

  let caseData;
  try {
    caseData = await api.cases.byId(caseId);
  } catch (e) {
    if (e instanceof TRPCError && (e.code === 'NOT_FOUND' || e.code === 'UNAUTHORIZED' || e.code === 'FORBIDDEN')) {
      notFound();
    }
    throw e;
  }

  if (caseData.subgroup && caseData.subgroup !== subgroup) notFound();

  return <CasePageClient subgroup={subgroup} caseData={caseData} />;
}
