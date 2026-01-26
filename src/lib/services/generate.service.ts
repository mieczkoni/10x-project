import { z } from "zod";

import type { SupabaseClient } from "../../db/supabase.client";
import type {
  GenerateCommand,
  GenerateResponseDto,
  GeneratedCandidateDto,
  GenerationMetaDto,
  JsonObject,
  UserId,
} from "../../types";
import { generatedCandidateSchema, generateValidationLimits } from "../validation/generate.zod";
import { callOpenRouterGenerate, GenerationTimeoutError } from "./openrouter.service";
import { createEvent } from "./events.service";
import { enforceRateLimit, enforceRateLimitDb, RateLimitError } from "./rate-limit.service";
import { normalizeTags } from "../validation/generate.zod";

export class DeckNotFoundError extends Error {
  constructor(message = "Deck not found") {
    super(message);
    this.name = "DeckNotFoundError";
  }
}

export class ModelValidationError extends Error {
  issues?: string[];

  constructor(message = "Model returned invalid output", issues?: string[]) {
    super(message);
    this.name = "ModelValidationError";
    this.issues = issues;
  }
}

function ensureArrayPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && "candidates" in raw) {
    const container = (raw as Record<string, unknown>).candidates;
    if (Array.isArray(container)) return container;
  }
  throw new ModelValidationError("Model response must be an array of candidates");
}

async function verifyDeckOwnership(supabase: SupabaseClient, userId: UserId, deckId: string): Promise<void> {
  const { data, error } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify deck: ${error.message}`);
  }

  if (!data) {
    throw new DeckNotFoundError();
  }
}

async function computeContentHash(supabase: SupabaseClient, front: string, back: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_content_hash", { front, back });

  if (error || !data) {
    throw new Error(`Failed to compute content hash: ${error?.message || "unknown error"}`);
  }

  return data;
}

async function buildDuplicateMap(
  supabase: SupabaseClient,
  userId: UserId,
  deckId: string,
  candidates: GeneratedCandidateDto[]
): Promise<{ hashByTempId: Map<string, string>; existingByHash: Map<string, string> }> {
  const hashes: { tempId: string; hash: string }[] = [];

  for (const candidate of candidates) {
    const hash = await computeContentHash(supabase, candidate.front, candidate.back);
    hashes.push({ tempId: candidate.temp_id, hash });
  }

  if (hashes.length === 0) {
    return { hashByTempId: new Map(), existingByHash: new Map() };
  }

  const { data, error } = await supabase
    .from("cards")
    .select("id, content_hash")
    .eq("deck_id", deckId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in(
      "content_hash",
      hashes.map((h) => h.hash)
    );

  if (error) {
    throw new Error(`Failed to query duplicates: ${error.message}`);
  }

  const hashByTempId = new Map<string, string>();
  hashes.forEach(({ tempId, hash }) => hashByTempId.set(tempId, hash));

  const existingByHash = new Map<string, string>();
  data.forEach((row) => {
    if (row.content_hash) {
      existingByHash.set(row.content_hash, row.id);
    }
  });

  return { hashByTempId, existingByHash };
}

function normalizeCandidates(rawCandidates: unknown, maxCards: number): GeneratedCandidateDto[] {
  const arrayPayload = ensureArrayPayload(rawCandidates);
  const parsed = z.array(generatedCandidateSchema).safeParse(arrayPayload);

  if (!parsed.success) {
    const issues = parsed.error.errors.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);
    throw new ModelValidationError("Model output validation failed", issues);
  }

  if (parsed.data.length > maxCards) {
    throw new ModelValidationError("Model returned too many candidates");
  }

  return parsed.data.map((candidate) => ({
    ...candidate,
    tags: normalizeTags(candidate.tags ?? []),
    temp_id: crypto.randomUUID(),
    duplicate: {
      isDuplicate: false,
      duplicateCardId: null,
    },
  }));
}

function buildGenerationMeta(id: string, model: string, inputChars: number): GenerationMetaDto {
  return {
    id,
    created_at: new Date().toISOString(),
    model,
    input_chars: inputChars,
  };
}

type Stage =
  | "validation"
  | "rate_limit"
  | "deck_verify"
  | "provider"
  | "provider_repair"
  | "parse"
  | "duplicate_check"
  | "success";

export async function generateCandidates(
  supabase: SupabaseClient,
  userId: UserId,
  command: GenerateCommand
): Promise<GenerateResponseDto> {
  const stage: { current: Stage } = { current: "validation" };
  const inputChars = command.source_text.length;
  const maxCards = command.options?.max_cards ?? generateValidationLimits.DEFAULT_MAX_CARDS;
  const language = command.options?.language ?? "en";
  const modelRequested = command.options?.model;
  const generationId = crypto.randomUUID();
  let repairAttempted = false;
  let providerDurationMs: number | undefined;
  let retryCount = 0;
  const flowStartedAt = Date.now();

  try {
    // Rate limit
    stage.current = "rate_limit";
    enforceRateLimit(userId);
    await enforceRateLimitDb(supabase, userId);

    // Emit generate_request
    await createEvent(supabase, userId, "generate_request", {
      generation_id: generationId,
      input_chars: inputChars,
      deck_id: command.deck_id ?? null,
      max_cards: maxCards,
      language,
      model_requested: modelRequested ?? null,
    });

    // Deck verification when provided
    if (command.deck_id) {
      stage.current = "deck_verify";
      await verifyDeckOwnership(supabase, userId, command.deck_id);
    }

    // Provider call
    stage.current = "provider";
    const callProvider = async (repairMessage?: string) => {
      return callOpenRouterGenerate({
        sourceText: command.source_text,
        maxCards,
        language,
        model: modelRequested,
        repairMessage,
      });
    };

    const parseAndNormalize = (raw: string) => {
      let parsedContent: unknown;
      try {
        parsedContent = raw ? JSON.parse(raw) : null;
      } catch {
        throw new ModelValidationError("Model returned non-JSON output");
      }
      return normalizeCandidates(parsedContent, maxCards);
    };

    const providerStart = Date.now();
    const initial = await callProvider();
    providerDurationMs = Date.now() - providerStart;
    let modelUsed = initial.modelUsed;
    let normalizedCandidates: GeneratedCandidateDto[];

    stage.current = "parse";
    try {
      normalizedCandidates = parseAndNormalize(initial.rawContent);
    } catch (error) {
      if (error instanceof ModelValidationError) {
        stage.current = "provider_repair";
        repairAttempted = true;
        retryCount = 1;
        const repairMessage = error.issues?.join("; ").slice(0, 400);
        const retryStart = Date.now();
        const retry = await callProvider(repairMessage);
        providerDurationMs = Date.now() - retryStart;
        modelUsed = retry.modelUsed;
        stage.current = "parse";
        normalizedCandidates = parseAndNormalize(retry.rawContent);
      } else {
        throw error;
      }
    }

    // Duplicate checks (if deck_id present)
    if (command.deck_id && normalizedCandidates.length > 0) {
      stage.current = "duplicate_check";
      const { hashByTempId, existingByHash } = await buildDuplicateMap(
        supabase,
        userId,
        command.deck_id,
        normalizedCandidates
      );

      normalizedCandidates.forEach((candidate) => {
        const hash = hashByTempId.get(candidate.temp_id);
        if (!hash) return;
        const duplicateCardId = existingByHash.get(hash) ?? null;
        candidate.duplicate = {
          isDuplicate: duplicateCardId !== null,
          duplicateCardId,
        };
      });
    }

    // Assemble response
    stage.current = "success";
    const generation = buildGenerationMeta(generationId, modelUsed, inputChars);
    const candidatesWithDuplicates: GeneratedCandidateDto[] = normalizedCandidates;

    // Emit generated_view
    await createEvent(supabase, userId, "generated_view", {
      generation_id: generation.id,
      input_chars: inputChars,
      candidate_count: candidatesWithDuplicates.length,
      deck_id: command.deck_id ?? null,
      model: modelUsed,
      model_used: modelUsed,
      model_requested: modelRequested ?? null,
      repair_attempted: repairAttempted,
      provider_duration_ms: providerDurationMs ?? null,
      retry_count: retryCount,
      total_duration_ms: Date.now() - flowStartedAt,
    });

    return {
      generation,
      candidates: candidatesWithDuplicates,
    };
  } catch (error) {
    const payload: JsonObject = {
      generation_id: generationId,
      stage: stage.current,
      code: "server_error",
      repair_attempted: repairAttempted,
      provider_duration_ms: providerDurationMs ?? null,
      retry_count: retryCount,
      timeout: error instanceof GenerationTimeoutError,
      total_duration_ms: Date.now() - flowStartedAt,
      deck_id: command.deck_id ?? null,
      input_chars: inputChars,
      model_requested: modelRequested ?? null,
    };

    if (error instanceof RateLimitError) {
      payload.code = "rate_limited";
    } else if (error instanceof DeckNotFoundError) {
      payload.code = "deck_not_found";
    } else if (error instanceof GenerationTimeoutError) {
      payload.code = "generation_timeout";
    } else if (error instanceof ModelValidationError) {
      payload.code = "model_error";
      if (error.issues) {
        payload.validation_issues = error.issues.slice(0, 10);
      }
    }

    payload.message = error instanceof Error ? error.message : String(error);

    await createEvent(supabase, userId, "generate_error", payload);
    throw error;
  }
}
