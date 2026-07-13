-- Drop ChatSession (no data dump, per decision)
DROP TABLE IF EXISTS "ChatSession";

-- Case: drop solution/taskQuestions, add embeddingDirty
ALTER TABLE "Case" DROP COLUMN IF EXISTS "solution";
ALTER TABLE "Case" DROP COLUMN IF EXISTS "taskQuestions";
ALTER TABLE "Case" ADD COLUMN "embeddingDirty" BOOLEAN NOT NULL DEFAULT true;

-- User: drop legacy fields
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatar";
ALTER TABLE "User" DROP COLUMN IF EXISTS "solvedCaseIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "unsolvedCaseIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "patientIds";
ALTER TABLE "User" DROP COLUMN IF EXISTS "medicalRecords";

-- Role enum: reassign any PATIENT users, then drop the value via type swap
UPDATE "User" SET role='DOCTOR' WHERE role='PATIENT';
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'REVIEWER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'DOCTOR';
DROP TYPE "Role_old";

-- RefreshToken
CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rotatedToId" TEXT,
  "replacedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "deviceLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
