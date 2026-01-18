import { DEFAULT_MODEL, OpenRouterService, OpenRouterTimeoutError, createOpenRouterServiceFromEnv } from "../openrouter.service";
import type { OpenRouterResponseFormatJsonSchema } from "../openrouter.service";

export {
  OpenRouterAuthError,
  OpenRouterBadRequestError,
  OpenRouterInvalidResponseError,
  OpenRouterJsonParseError,
  OpenRouterRateLimitError,
  OpenRouterSchemaValidationError,
  OpenRouterUpstreamError,
} from "../openrouter.service";

const SYSTEM_PROMPT = [
  "You generate concise flashcard candidates.",
  'Respond ONLY with JSON. Format: {"candidates":[{front, back, tags}]}',
  "No markdown, no prose, no code fences. Do not wrap in code blocks.",
  "Keep facts grounded and avoid copyrighted verbatim text.",
  "Front length <= 2000 chars; Back length <= 10000 chars.",
  "Tags: array of short strings, max 20 tags, each <= 50 chars. Use lowercase, trimmed.",
  "If unsure about a fact, omit it.",
].join(" ");

function buildUserPrompt(sourceText: string, language: string, maxCards: number, repairMessage?: string) {
  return [
    `Language: ${language}`,
    `Max cards: ${maxCards}`,
    "Return JSON only. Envelope key: candidates.",
    "Each candidate: {front, back, tags:string[]}. Tags should be short topical phrases (lowercase).",
    repairMessage ? `Fix previous issues: ${repairMessage}` : null,
    "Source:",
    sourceText,
  ]
    .filter(Boolean)
    .join("\n");
}

type OpenRouterParams = {
  sourceText: string;
  maxCards: number;
  language: string;
  model?: string;
  timeoutMs?: number;
  repairMessage?: string;
};

export type OpenRouterResult = {
  modelUsed: string;
  rawContent: string;
};

export class GenerationTimeoutError extends Error {
  constructor(message = "Generation request timed out") {
    super(message);
    this.name = "GenerationTimeoutError";
  }
}

const generateCandidatesResponseFormat = (maxCards: number): OpenRouterResponseFormatJsonSchema => ({
  type: "json_schema",
  json_schema: {
    name: "generate_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          maxItems: maxCards,
          items: {
            type: "object",
            properties: {
              front: { type: "string", minLength: 1, maxLength: 2000 },
              back: { type: "string", minLength: 1, maxLength: 10000 },
              tags: {
                type: "array",
                items: { type: "string", minLength: 1, maxLength: 50 },
                maxItems: 20,
                default: [],
              },
            },
            required: ["front", "back", "tags"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
});

/**
 * Calls OpenRouter to generate flashcard candidates.
 * Returns the raw assistant message content for downstream parsing/validation.
 */
export async function callOpenRouterGenerate(params: OpenRouterParams): Promise<OpenRouterResult> {
  const { sourceText, maxCards, language, model, timeoutMs = 15000, repairMessage } = params;
  const service = createOpenRouterServiceFromEnv();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(sourceText, language, maxCards, repairMessage) },
  ];

  try {
    const result = await service.chatCompletion({
      model: model ?? DEFAULT_MODEL,
      messages,
      timeoutMs,
      modelParams: { temperature: 0.3 },
      responseFormat: generateCandidatesResponseFormat(maxCards),
    });
    return { modelUsed: result.modelUsed, rawContent: result.rawContent };
  } catch (error) {
    if (error instanceof OpenRouterTimeoutError) {
      throw new GenerationTimeoutError("OpenRouter request timed out");
    }
    throw error;
  }
}
