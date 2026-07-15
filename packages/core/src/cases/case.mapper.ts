import type { Prisma } from '@docjob/db';
import { caseBodySchema, EMPTY_BODY, type CaseBody, type CaseMode } from '@docjob/types';
import { caseBodyToHtml } from './case-body-html';

export type SerializedCaseImage = {
  id: string;
  filename: string;
  mimeType: string;
  order: number;
  url: string;
};

export type SerializedCaseAttachment = {
  id: string;
  filename: string;
  originalName: string | null;
  title: string | null;
  description: string | null;
  mimeType: string;
  size: number;
  kind: string;
  order: number;
  url: string;
  createdAt: string;
};

export type SerializedCase = {
  id: string;
  authorId: string;
  name: string;
  age: number | null;
  gender: string | null;
  primaryCondition: string | null;
  history: string | null;
  scenarioDescription: string | null;
  learningObjectives: string[];
  comorbidities: string | null;
  subgroup: string | null;
  specialty: string | null;
  tags: string[];
  teaser: string | null;
  mode: CaseMode;
  body: CaseBody;
  /**
   * Server-rendered HTML of `body` (via `caseBodyToHtml`) — lets the mobile
   * client (react-native-webview, no BlockNote React renderer available)
   * display the case body without shipping a BlockNote-JSON parser. Only on
   * the full case shape (`serializeCase`, used by `cases.byId`); the lighter
   * `SerializedCaseListItem` used by list/listPaged intentionally omits it —
   * list views never render the body.
   */
  bodyHtml: string;
  images: SerializedCaseImage[];
  attachments: SerializedCaseAttachment[];
  createdAt: string;
  updatedAt: string;
};

/** Narrower shape used by the paginated admin catalog / search listing. */
export type SerializedCaseListItem = {
  id: string;
  authorId: string;
  name: string;
  primaryCondition: string | null;
  subgroup: string | null;
  specialty: string | null;
  tags: string[];
  teaser: string | null;
  mode: CaseMode;
  createdAt: string;
  updatedAt: string;
};

export type CasesPage = {
  items: SerializedCaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CaseWithRelations = Prisma.CaseGetPayload<{
  include: { images: true; attachments: true };
}>;

/**
 * Moved verbatim from apps/web/src/app/actions.ts (SP-1b Task 2). Already
 * drops `solution`/`taskQuestions`/`hasSolution` — those fields were removed
 * from the Case model entirely in SP-1a, so there is nothing left to leak.
 */
export function serializeCase(c: CaseWithRelations): SerializedCase {
  const bodyParse = caseBodySchema.safeParse(c.body);
  const body: CaseBody = bodyParse.success ? bodyParse.data : EMPTY_BODY;

  return {
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
    bodyHtml: caseBodyToHtml(body),
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
}
