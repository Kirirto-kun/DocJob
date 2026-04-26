-- CreateEnum
CREATE TYPE "CaseMode" AS ENUM ('CLINICAL_QUEST', 'SANEPID_INVESTIGATION', 'BEST_PRACTICE', 'MANAGEMENT');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "body" JSONB NOT NULL DEFAULT '{"blocks":[]}',
ADD COLUMN     "mode" "CaseMode" NOT NULL DEFAULT 'CLINICAL_QUEST',
ADD COLUMN     "solution" JSONB,
ADD COLUMN     "taskQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CaseAttachment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "uploaderId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'discussing',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "finalAnswer" TEXT,
    "evaluation" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseAttachment_caseId_idx" ON "CaseAttachment"("caseId");

-- CreateIndex
CREATE INDEX "CaseAttachment_uploaderId_idx" ON "CaseAttachment"("uploaderId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatSession_caseId_idx" ON "ChatSession"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_userId_caseId_key" ON "ChatSession"("userId", "caseId");

-- CreateIndex
CREATE INDEX "Case_mode_idx" ON "Case"("mode");

-- AddForeignKey
ALTER TABLE "CaseAttachment" ADD CONSTRAINT "CaseAttachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
