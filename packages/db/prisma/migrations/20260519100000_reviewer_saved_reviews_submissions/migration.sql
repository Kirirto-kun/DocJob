-- Add REVIEWER to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'REVIEWER';

-- Reviewer-only profile fields (also visible/optional for any user)
ALTER TABLE "User" ADD COLUMN "workplace" TEXT;
ALTER TABLE "User" ADD COLUMN "academicDegree" TEXT;

-- SavedCase: per-user favourites/bookmarks of cases
CREATE TABLE "SavedCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedCase_userId_caseId_key" ON "SavedCase"("userId", "caseId");
CREATE INDEX "SavedCase_userId_idx" ON "SavedCase"("userId");
CREATE INDEX "SavedCase_caseId_idx" ON "SavedCase"("caseId");
ALTER TABLE "SavedCase" ADD CONSTRAINT "SavedCase_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedCase" ADD CONSTRAINT "SavedCase_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Review: free-text reviewer feedback on a case (one reviewer can leave many)
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Review_caseId_idx" ON "Review"("caseId");
CREATE INDEX "Review_reviewerId_idx" ON "Review"("reviewerId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CaseSubmission: author-submitted case proposals + admin thread
CREATE TABLE "CaseSubmission" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "authors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subgroup" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CaseSubmission_authorUserId_idx" ON "CaseSubmission"("authorUserId");
CREATE INDEX "CaseSubmission_status_idx" ON "CaseSubmission"("status");
ALTER TABLE "CaseSubmission" ADD CONSTRAINT "CaseSubmission_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CaseSubmissionMessage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseSubmissionMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CaseSubmissionMessage_submissionId_idx" ON "CaseSubmissionMessage"("submissionId");
CREATE INDEX "CaseSubmissionMessage_senderId_idx" ON "CaseSubmissionMessage"("senderId");
ALTER TABLE "CaseSubmissionMessage" ADD CONSTRAINT "CaseSubmissionMessage_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "CaseSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseSubmissionMessage" ADD CONSTRAINT "CaseSubmissionMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
