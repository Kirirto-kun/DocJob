import { notFound } from 'next/navigation';
import { prisma } from '@docjob/db';
import { getCurrentUser } from '@/lib/session';
import {
  EMPTY_BODY,
  caseBodySchema,
  type CaseBody,
  type CaseMode,
} from '@/lib/case-schema';
import type { SerializedCase } from '@/app/actions';
import { CasePageClient } from './_components/case-page-client';

type CasePageParams = {
  params: Promise<{ subgroup: string; caseId: string }>;
};

export default async function CasePage({ params }: CasePageParams) {
  const { subgroup, caseId } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      images: { orderBy: { order: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!c) notFound();
  if (c.subgroup && c.subgroup !== subgroup) notFound();

  const bodyParse = caseBodySchema.safeParse(c.body);
  const body: CaseBody = bodyParse.success ? bodyParse.data : EMPTY_BODY;

  const caseData: SerializedCase = {
    id: c.id,
    authorId: c.authorId,
    name: c.name,
    age: c.age,
    gender: c.gender,
    primaryCondition: c.primaryCondition,
    history: c.history,
    scenarioDescription: c.scenarioDescription,
    learningObjectives: c.learningObjectives,
    comorbidities: c.comorbidities,
    subgroup: c.subgroup,
    specialty: c.specialty,
    tags: c.tags,
    teaser: c.teaser,
    mode: c.mode as CaseMode,
    body,
    images: c.images.map((i) => ({
      id: i.id,
      filename: i.filename,
      mimeType: i.mimeType,
      order: i.order,
      url: `/api/images/${i.filename}`,
    })),
    attachments: c.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      originalName: a.originalName,
      title: a.title,
      description: a.description,
      mimeType: a.mimeType,
      size: a.size,
      kind: a.kind,
      order: a.order,
      url: `/api/attachments/${a.filename}`,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };

  return <CasePageClient subgroup={subgroup} caseData={caseData} />;
}
