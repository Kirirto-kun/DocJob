-- Legacy per-case "Задание" (taskQuestions) and "Правильный ответ" (solution)
-- are no longer authored in the UI. Clear the values from all existing cases.
-- The columns are intentionally kept: the chat flow already falls back cleanly
-- when taskQuestions is empty and solution is null.
UPDATE "Case" SET "taskQuestions" = ARRAY[]::text[], "solution" = NULL;
