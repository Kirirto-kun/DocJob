import type { Prisma, Role } from '@docjob/db';

export type SerializedSubmissionAttachment = {
  attachmentId: string;
  filename: string;
  originalName: string | null;
  url: string;
  mimeType: string;
  size: number;
};

export type SerializedSubmissionMessage = {
  id: string;
  submissionId: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  body: string;
  attachments: SerializedSubmissionAttachment[];
  createdAt: string;
};

export type SerializedCaseSubmission = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  description: string;
  authors: string[];
  subgroup: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: SerializedSubmissionMessage[];
  messageCount: number;
};

export type SubmissionWithRelations = Prisma.CaseSubmissionGetPayload<{
  include: {
    author: true;
    messages: { include: { sender: true } };
  };
}>;

/** Moved verbatim from apps/web/src/app/actions.ts (SP-1b Task 6). */
export function serializeSubmission(s: SubmissionWithRelations): SerializedCaseSubmission {
  return {
    id: s.id,
    authorUserId: s.authorUserId,
    authorName: s.author.fullName || s.author.name,
    authorEmail: s.author.email,
    title: s.title,
    description: s.description,
    authors: s.authors,
    subgroup: s.subgroup,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    messageCount: s.messages.length,
    messages: s.messages.map((m) => ({
      id: m.id,
      submissionId: m.submissionId,
      senderId: m.senderId,
      senderName: m.sender.fullName || m.sender.name,
      senderRole: m.sender.role,
      body: m.body,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as SerializedSubmissionAttachment[])
        : [],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
