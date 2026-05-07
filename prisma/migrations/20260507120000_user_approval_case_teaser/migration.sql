-- AlterTable: add approval timestamp to User and teaser to Case
ALTER TABLE "User" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "teaser" TEXT;

-- Backfill: existing users were already trusted, mark them approved as of now
-- so the introduction of approval gating doesn't lock anyone out.
UPDATE "User" SET "approvedAt" = NOW() WHERE "approvedAt" IS NULL;

-- Index for fast pending-list lookup
CREATE INDEX "User_approvedAt_idx" ON "User"("approvedAt");
