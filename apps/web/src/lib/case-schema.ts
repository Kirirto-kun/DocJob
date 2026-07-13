import { z } from "zod";

export const CASE_MODES = [
  "CLINICAL_QUEST",
  "SANEPID_INVESTIGATION",
  "BEST_PRACTICE",
  "MANAGEMENT",
] as const;

export const caseModeSchema = z.enum(CASE_MODES);
export type CaseMode = z.infer<typeof caseModeSchema>;

export const CASE_MODE_BY_SUBGROUP: Record<string, CaseMode> = {
  clinical: "CLINICAL_QUEST",
  sanepid: "SANEPID_INVESTIGATION",
  best_practices: "BEST_PRACTICE",
  management: "MANAGEMENT",
};

export const caseBodySchema = z
  .object({
    blocks: z.array(z.unknown()).default([]),
  })
  .passthrough();
export type CaseBody = z.infer<typeof caseBodySchema>;

export const structuredCaseDraftSchema = z.object({
  name: z.string(),
  age: z.number().int().nullable(),
  gender: z.string().nullable(),
  specialty: z.string().nullable(),
  tags: z.array(z.string()),
  bodyMarkdown: z.string(),
});
export type StructuredCaseDraft = z.infer<typeof structuredCaseDraftSchema>;

export const EMPTY_BODY: CaseBody = { blocks: [] };
