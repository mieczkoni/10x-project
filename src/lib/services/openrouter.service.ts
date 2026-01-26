export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_REFERER = "https://10x-devs.app";

export type OpenRouterChatRole = "system" | "user" | "assistant" | "tool";

export interface OpenRouterChatMessage {
  role: OpenRouterChatRole;
  content: string;
}

export interface ModelParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
}

export interface OpenRouterResponseFormatJsonSchema {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

export interface OpenRouterChatRequest {
  messages: OpenRouterChatMessage[];
  model?: string;
  responseFormat?: OpenRouterResponseFormatJsonSchema;
  modelParams?: ModelParams;
  timeoutMs?: number;
  traceId?: string;
}

export interface OpenRouterChatResult {
  modelUsed: string;
  rawContent: string;
  usage?: unknown;
}

export interface OpenRouterLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface OpenRouterServiceConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
  referer?: string;
  appTitle?: string;
  fetchImpl?: typeof fetch;
  logger?: OpenRouterLogger;
  defaultModelParams?: ModelParams;
}

export interface OpenRouterJsonValidator<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { errors: unknown[] } };
}

class OpenRouterError extends Error {
  status?: number;
  providerMessage?: string;
  requestId?: string;

  constructor(message: string, options?: { status?: number; providerMessage?: string; requestId?: string }) {
    super(message);
    this.name = "OpenRouterError";
    this.status = options?.status;
    this.providerMessage = options?.providerMessage;
    this.requestId = options?.requestId;
  }
}

export class OpenRouterConfigError extends OpenRouterError {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterConfigError";
  }
}

export class OpenRouterTimeoutError extends OpenRouterError {
  constructor(message = "OpenRouter request timed out") {
    super(message);
    this.name = "OpenRouterTimeoutError";
  }
}

export class OpenRouterNetworkError extends OpenRouterError {
  constructor(message = "OpenRouter network error") {
    super(message);
    this.name = "OpenRouterNetworkError";
  }
}

export class OpenRouterAuthError extends OpenRouterError {
  constructor(message = "OpenRouter authentication error", options?: { status?: number; providerMessage?: string }) {
    super(message, options);
    this.name = "OpenRouterAuthError";
  }
}

export class OpenRouterRateLimitError extends OpenRouterError {
  constructor(message = "OpenRouter rate limit exceeded", options?: { status?: number; providerMessage?: string }) {
    super(message, options);
    this.name = "OpenRouterRateLimitError";
  }
}

export class OpenRouterBadRequestError extends OpenRouterError {
  constructor(message = "OpenRouter bad request", options?: { status?: number; providerMessage?: string }) {
    super(message, options);
    this.name = "OpenRouterBadRequestError";
  }
}

export class OpenRouterUpstreamError extends OpenRouterError {
  constructor(message = "OpenRouter upstream error", options?: { status?: number; providerMessage?: string }) {
    super(message, options);
    this.name = "OpenRouterUpstreamError";
  }
}

export class OpenRouterInvalidResponseError extends OpenRouterError {
  constructor(
    message = "OpenRouter returned an invalid response",
    options?: { status?: number; providerMessage?: string }
  ) {
    super(message, options);
    this.name = "OpenRouterInvalidResponseError";
  }
}

export class OpenRouterJsonParseError extends OpenRouterError {
  constructor(message = "OpenRouter returned invalid JSON", options?: { status?: number; providerMessage?: string }) {
    super(message, options);
    this.name = "OpenRouterJsonParseError";
  }
}

export class OpenRouterSchemaValidationError extends OpenRouterError {
  issues?: unknown[];

  constructor(message = "OpenRouter response failed schema validation", issues?: unknown[]) {
    super(message);
    this.name = "OpenRouterSchemaValidationError";
    this.issues = issues;
  }
}

type OpenRouterChatJsonRequest = OpenRouterChatRequest & {
  responseFormat: OpenRouterResponseFormatJsonSchema;
  repairAttempt?: boolean;
};

export class OpenRouterService {
  public baseUrl: string;
  public defaultModel: string;
  public defaultTimeoutMs: number;

  private apiKey: string;
  private fetchImpl: typeof fetch;
  private logger?: OpenRouterLogger;
  private referer?: string;
  private appTitle?: string;
  private defaultModelParams: ModelParams;

  constructor(config: OpenRouterServiceConfig) {
    if (!config.apiKey) {
      throw new OpenRouterConfigError("OPENROUTER_API_KEY is missing");
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? OPENROUTER_URL;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.referer = config.referer;
    this.appTitle = config.appTitle;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.logger = config.logger;
    this.defaultModelParams = config.defaultModelParams ?? {};
  }

  public async chatCompletion(request: OpenRouterChatRequest): Promise<OpenRouterChatResult> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const modelRequested = request.model ?? this.defaultModel;
    const body = this.buildRequestBody({
      ...request,
      model: modelRequested,
    });
    const requestStartedAt = Date.now();

    try {
      const response = await this.withTimeout(timeoutMs, (signal) =>
        this.fetchImpl(this.baseUrl, {
          method: "POST",
          headers: this.buildHeaders(),
          signal,
          body: JSON.stringify(body),
        })
      );

      const requestId = this.readRequestId(response.headers);

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw this.mapHttpError(response.status, bodyText, requestId);
      }

      const responseJson = await response.json().catch(() => {
        throw new OpenRouterJsonParseError("OpenRouter returned non-JSON response");
      });

      const parsed = this.parseOpenRouterResponse(responseJson);
      const durationMs = Date.now() - requestStartedAt;

      this.logger?.info("OpenRouter request succeeded", {
        traceId: request.traceId,
        modelRequested,
        modelUsed: parsed.modelUsed,
        durationMs,
      });

      return {
        modelUsed: parsed.modelUsed,
        rawContent: parsed.rawContent,
        usage: responseJson?.usage,
      };
    } catch (error) {
      const durationMs = Date.now() - requestStartedAt;

      if (error instanceof OpenRouterError) {
        this.logger?.warn("OpenRouter request failed", {
          traceId: request.traceId,
          modelRequested,
          durationMs,
          errorName: error.name,
          status: error.status,
        });
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OpenRouterTimeoutError();
      }

      this.logger?.error("OpenRouter network failure", {
        traceId: request.traceId,
        modelRequested,
        durationMs,
      });
      throw new OpenRouterNetworkError();
    }
  }

  public async chatCompletionJson<T>(
    request: OpenRouterChatJsonRequest,
    validator: OpenRouterJsonValidator<T>
  ): Promise<{ data: T; modelUsed: string; rawContent: string }> {
    const { repairAttempt } = request;
    const initial = await this.chatCompletion(request);

    try {
      const parsedJson = this.parseJson(initial.rawContent);
      const validated = this.validateJson(parsedJson, validator);
      return { data: validated, modelUsed: initial.modelUsed, rawContent: initial.rawContent };
    } catch (error) {
      if (!repairAttempt) {
        throw error;
      }

      const repairMessage = this.buildRepairMessage(error);
      const retry = await this.chatCompletion({
        ...request,
        messages: [...request.messages, { role: "user", content: repairMessage }],
      });
      const parsedJson = this.parseJson(retry.rawContent);
      const validated = this.validateJson(parsedJson, validator);
      return { data: validated, modelUsed: retry.modelUsed, rawContent: retry.rawContent };
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this.referer) {
      headers["HTTP-Referer"] = this.referer;
    }

    if (this.appTitle) {
      headers["X-Title"] = this.appTitle;
    }

    return headers;
  }

  private async withTimeout(timeoutMs: number, fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fn(controller.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new OpenRouterTimeoutError();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequestBody(request: OpenRouterChatRequest & { model: string }) {
    const modelParams = {
      ...this.defaultModelParams,
      ...(request.modelParams ?? {}),
    };

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      ...modelParams,
    };

    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }

    return body;
  }

  private parseOpenRouterResponse(json: unknown): { modelUsed: string; rawContent: string } {
    const record = json as Record<string, unknown>;
    const modelUsed = typeof record?.model === "string" ? record.model : this.defaultModel;
    const choices = Array.isArray(record?.choices) ? record.choices : [];
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const rawContent = typeof message?.content === "string" ? message.content : "";

    if (!rawContent) {
      throw new OpenRouterInvalidResponseError("OpenRouter returned empty content");
    }

    return { modelUsed, rawContent };
  }

  private mapHttpError(status: number, bodyText: string, requestId?: string): OpenRouterError {
    const providerMessage = this.truncateText(bodyText, 500);
    const options = { status, providerMessage, requestId };

    if (status === 401 || status === 403) {
      return new OpenRouterAuthError("OpenRouter authentication failed", options);
    }

    if (status === 429) {
      return new OpenRouterRateLimitError("OpenRouter rate limit exceeded", options);
    }

    if (status === 400) {
      return new OpenRouterBadRequestError("OpenRouter rejected the request", options);
    }

    if (status >= 500) {
      return new OpenRouterUpstreamError("OpenRouter upstream error", options);
    }

    return new OpenRouterUpstreamError("OpenRouter request failed", options);
  }

  private readRequestId(headers: Headers): string | undefined {
    return (
      headers.get("x-request-id") ??
      headers.get("x-openrouter-request-id") ??
      headers.get("x-correlation-id") ??
      undefined
    );
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}…`;
  }

  private parseJson(raw: string): unknown {
    if (!raw) {
      throw new OpenRouterJsonParseError("OpenRouter returned empty JSON content");
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new OpenRouterJsonParseError("OpenRouter returned invalid JSON");
    }
  }

  private validateJson<T>(value: unknown, validator: OpenRouterJsonValidator<T>): T {
    const result = validator.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const issues = result.error.errors.slice(0, 10);
    throw new OpenRouterSchemaValidationError("OpenRouter schema validation failed", issues);
  }

  private buildRepairMessage(error: unknown): string {
    if (error instanceof OpenRouterSchemaValidationError && error.issues?.length) {
      const summary = error.issues
        .map((issue) => String(issue))
        .join("; ")
        .slice(0, 400);
      return `Fix previous issues: ${summary}`;
    }

    if (error instanceof OpenRouterJsonParseError) {
      return "Return only valid JSON that matches the schema.";
    }

    return "Fix the previous response to match the JSON schema exactly.";
  }
}

let cachedService: OpenRouterService | null = null;

export function createOpenRouterServiceFromEnv(): OpenRouterService {
  const apiKey = import.meta.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new OpenRouterConfigError("OPENROUTER_API_KEY is missing");
  }

  if (!cachedService) {
    cachedService = new OpenRouterService({
      apiKey,
      referer: DEFAULT_REFERER,
    });
  }

  return cachedService;
}

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

interface OpenRouterParams {
  sourceText: string;
  maxCards: number;
  language: string;
  model?: string;
  timeoutMs?: number;
  repairMessage?: string;
}

export interface OpenRouterResult {
  modelUsed: string;
  rawContent: string;
}

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
      modelParams: { temperature: 0.7 },
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
