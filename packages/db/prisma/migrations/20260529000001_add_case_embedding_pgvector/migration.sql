-- Enable pgvector extension for semantic case search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to Case (1536 dims = text-embedding-3-small)
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for cosine-distance KNN search
CREATE INDEX IF NOT EXISTS "Case_embedding_idx" ON "Case" USING hnsw (embedding vector_cosine_ops);
