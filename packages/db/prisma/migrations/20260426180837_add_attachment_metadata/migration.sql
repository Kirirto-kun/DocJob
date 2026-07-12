-- AlterTable
ALTER TABLE "CaseAttachment" ADD COLUMN     "description" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT;
