-- SP-3: hybrid search — trigram + Russian FTS trigger-maintained tsvector + bodyHash
--
-- NOTE: `prisma migrate dev --create-only` auto-generated a
-- `DROP INDEX "Case_embedding_idx";` here (same known drift as documented in
-- 20260622091514_add_password_reset_token) because the pgvector HNSW index
-- lives on the `Unsupported("vector(1536)")` column, which Prisma cannot
-- represent and therefore treats as drift. It has been removed intentionally
-- — do not re-add it. (Index is created in 20260529000001_add_case_embedding_pgvector.)
--
-- FALLBACK NOTE: the original design used
-- `GENERATED ALWAYS AS (...) STORED` for "searchDoc", which Postgres rejected
-- with "generation expression is not immutable" (SQLSTATE 42P17). Root
-- cause, confirmed via `pg_proc.provolatile`: on this Postgres build,
-- `array_to_string(anyarray, text)` is STABLE ('s'), not IMMUTABLE — even
-- though `to_tsvector(regconfig, text)` and
-- `jsonb_to_tsvector(regconfig, jsonb, jsonb)` are both IMMUTABLE ('i'). A
-- STORED generated column requires every function in its expression to be
-- IMMUTABLE, so the generated-column design is not usable here. Falling
-- back to the documented alternative: a trigger-maintained tsvector column,
-- keeping the same column name ("searchDoc") and the same index names as
-- the original design so nothing downstream (Task 2+) needs to change.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Durability guard for embed-on-write (SP-3 T2): hash of the embedded text.
ALTER TABLE "Case" ADD COLUMN "bodyHash" TEXT;

-- Lexical search document: Russian FTS over the case's flat fields + every
-- string value inside the BlockNote body JSON. Trigger-maintained (see
-- FALLBACK NOTE above) rather than a STORED generated column.
ALTER TABLE "Case" ADD COLUMN "searchDoc" tsvector;

CREATE OR REPLACE FUNCTION case_search_doc_trigger() RETURNS trigger AS $$
BEGIN
  NEW."searchDoc" :=
    to_tsvector('russian',
      coalesce(NEW."name", '') || ' ' ||
      coalesce(NEW."teaser", '') || ' ' ||
      coalesce(NEW."primaryCondition", '') || ' ' ||
      coalesce(NEW."specialty", '') || ' ' ||
      coalesce(NEW."subgroup", '') || ' ' ||
      array_to_string(NEW."tags", ' ')
    ) || jsonb_to_tsvector('russian', NEW."body", '["string"]');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Case_searchDoc_trigger"
  BEFORE INSERT OR UPDATE ON "Case"
  FOR EACH ROW EXECUTE FUNCTION case_search_doc_trigger();

-- Backfill searchDoc for existing rows (the trigger only fires on future
-- INSERT/UPDATE statements, not retroactively).
UPDATE "Case" SET "searchDoc" =
  to_tsvector('russian',
    coalesce("name", '') || ' ' ||
    coalesce("teaser", '') || ' ' ||
    coalesce("primaryCondition", '') || ' ' ||
    coalesce("specialty", '') || ' ' ||
    coalesce("subgroup", '') || ' ' ||
    array_to_string("tags", ' ')
  ) || jsonb_to_tsvector('russian', "body", '["string"]');

-- GIN over the FTS document (the lexical arm's @@ match + ts_rank).
CREATE INDEX "Case_searchDoc_idx" ON "Case" USING GIN ("searchDoc");

-- Trigram GIN for typo-tolerant / language-agnostic (incl. Kazakh) matching
-- on the two most search-relevant short fields via the `%` similarity op.
CREATE INDEX "Case_name_trgm_idx" ON "Case" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Case_teaser_trgm_idx" ON "Case" USING GIN ("teaser" gin_trgm_ops);
