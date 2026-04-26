import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { DEFAULT_OPENAI_MODEL, openai } from "@/lib/openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RunChatOptions = {
  model?: string;
  temperature?: number;
  schemaName?: string;
};

export async function runChat<T>(
  schema: ZodType<T>,
  messages: ChatMessage[],
  options: RunChatOptions = {},
): Promise<T> {
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  const schemaName = options.schemaName ?? "result";

  const completion = await openai.chat.completions.parse({
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    response_format: zodResponseFormat(schema, schemaName),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(
      refusal
        ? `OpenAI refused to comply: ${refusal}`
        : "OpenAI returned no parsed content",
    );
  }
  return parsed as T;
}
