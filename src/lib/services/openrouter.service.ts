export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "openrouter/auto";

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

/**
 * Calls OpenRouter to generate flashcard candidates.
 * Returns the raw assistant message content for downstream parsing/validation.
 */
export async function callOpenRouterGenerate(params: OpenRouterParams): Promise<OpenRouterResult> {
  const { sourceText, maxCards, language, model, timeoutMs = 15000, repairMessage } = params;
  const apiKey = import.meta.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://10x-devs.app",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: model ?? DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: buildUserPrompt(sourceText, language, maxCards, repairMessage),
          },
        ],
        temperature: 0.3,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "generate_candidates",
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
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenRouter error: ${response.status} ${response.statusText} ${text}`.trim());
    }

    const json = await response.json();
    const modelUsed: string = json?.model ?? model ?? DEFAULT_MODEL;
    const rawContent: string | undefined = json?.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("OpenRouter returned empty content");
    }

    return { modelUsed, rawContent };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GenerationTimeoutError("OpenRouter request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
