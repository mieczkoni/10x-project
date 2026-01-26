import type { APIRoute } from "astro";
import { ZodError } from "zod";

import { ApiErrors, jsonOk } from "../../../lib/http/api-response";
import { logger } from "../../../lib/logger";
import { generateSchema } from "../../../lib/validation/generate.zod";
import { DeckNotFoundError, generateCandidates, ModelValidationError } from "../../../lib/services/generate.service";
import { RateLimitError } from "../../../lib/services/rate-limit.service";
import { GenerationTimeoutError } from "../../../lib/services/openrouter.service";
import {
  OpenRouterAuthError,
  OpenRouterBadRequestError,
  OpenRouterInvalidResponseError,
  OpenRouterJsonParseError,
  OpenRouterRateLimitError,
  OpenRouterSchemaValidationError,
  OpenRouterUpstreamError,
} from "../../../lib/services/openrouter.service";

export const prerender = false;

/**
 * POST /api/generate
 *
 * Generates ephemeral flashcard candidates from pasted text.
 * Full business logic (rate limiting, provider calls, duplicate checks)
 * will be wired in subsequent steps.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const {
    data: { user },
    error: authError,
  } = await locals.supabase.auth.getUser();

  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiErrors.invalidInput("Invalid JSON in request body");
  }

  try {
    const validatedCommand = generateSchema.parse(body);
    const result = await generateCandidates(locals.supabase, user.id, validatedCommand);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof ZodError) {
      const tooLarge = error.errors.some((issue) => issue.code === "too_big");
      if (tooLarge) {
        return ApiErrors.inputTooLarge("source_text exceeds maximum allowed length");
      }

      return ApiErrors.invalidInput("Invalid request body", {
        issues: JSON.parse(JSON.stringify(error.errors)),
      });
    }

    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput("Invalid JSON in request body");
    }

    if (error instanceof RateLimitError) {
      return ApiErrors.rateLimited();
    }

    if (error instanceof DeckNotFoundError) {
      return ApiErrors.deckNotFound();
    }

    if (error instanceof GenerationTimeoutError) {
      return ApiErrors.generationTimeout(undefined, { timeout: true });
    }

    if (error instanceof OpenRouterAuthError) {
      return ApiErrors.unauthorized("AI provider authentication failed");
    }

    if (error instanceof OpenRouterRateLimitError) {
      return ApiErrors.rateLimited("AI provider rate limit exceeded");
    }

    if (error instanceof OpenRouterBadRequestError) {
      return ApiErrors.invalidInput("AI provider rejected the request");
    }

    if (error instanceof OpenRouterUpstreamError) {
      return ApiErrors.modelError("AI provider error");
    }

    if (
      error instanceof OpenRouterInvalidResponseError ||
      error instanceof OpenRouterJsonParseError ||
      error instanceof OpenRouterSchemaValidationError
    ) {
      return ApiErrors.modelError("AI provider returned invalid output");
    }

    if (error instanceof ModelValidationError) {
      return ApiErrors.modelError(error.message, error.issues ? { issues: error.issues } : undefined);
    }

    logger.error("[POST /api/generate] Unexpected error", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiErrors.serverError();
  }
};
