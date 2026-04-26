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

export const PREVENTABILITY = ["full", "conditional", "none"] as const;
export const preventabilitySchema = z.enum(PREVENTABILITY);

export const incidentSolutionSchema = z.object({
  kind: z.literal("incident"),
  diagnosis: z.string(),
  errors: z.array(z.string()),
  correctAlgorithm: z.string(),
  preventability: preventabilitySchema,
});
export type IncidentSolution = z.infer<typeof incidentSolutionSchema>;

export const reflectionSolutionSchema = z.object({
  kind: z.literal("reflection"),
  keyInsights: z.array(z.string()),
  correctDecisions: z.array(z.string()),
  lessonsLearned: z.string(),
});
export type ReflectionSolution = z.infer<typeof reflectionSolutionSchema>;

export const caseSolutionSchema = z.discriminatedUnion("kind", [
  incidentSolutionSchema,
  reflectionSolutionSchema,
]);
export type CaseSolution = z.infer<typeof caseSolutionSchema>;

export function expectedSolutionKind(mode: CaseMode): "incident" | "reflection" {
  return mode === "CLINICAL_QUEST" || mode === "SANEPID_INVESTIGATION"
    ? "incident"
    : "reflection";
}

export const suggestedActionSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

export const chatPhaseSchema = z.enum([
  "discussing",
  "diagnosis_submitted",
  "done",
]);
export type ChatPhase = z.infer<typeof chatPhaseSchema>;

export const chatEvaluationSchema = z.object({
  correct: z.boolean(),
  matchedErrors: z.array(z.string()),
  missedErrors: z.array(z.string()),
  extraErrors: z.array(z.string()),
  feedback: z.string(),
});
export type ChatEvaluation = z.infer<typeof chatEvaluationSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
  suggestedActions: z.array(suggestedActionSchema),
  phase: chatPhaseSchema,
  evaluation: chatEvaluationSchema.nullable(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  suggestedActions: z.array(suggestedActionSchema).optional(),
  evaluation: chatEvaluationSchema.optional(),
  isFinalAnswer: z.boolean().optional(),
});
export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export const chatHistorySchema = z.array(chatHistoryMessageSchema);
export type ChatHistory = z.infer<typeof chatHistorySchema>;

export const structuredCaseDraftSchema = z.object({
  name: z.string(),
  age: z.number().int().nullable(),
  gender: z.string().nullable(),
  specialty: z.string().nullable(),
  tags: z.array(z.string()),
  bodyMarkdown: z.string(),
  taskQuestions: z.array(z.string()),
  solution: caseSolutionSchema,
});
export type StructuredCaseDraft = z.infer<typeof structuredCaseDraftSchema>;

export const EMPTY_BODY: CaseBody = { blocks: [] };
