import type { APIRoute } from "astro";
import { ZodError } from "zod";

import { bulkCreateCardsSchema } from "../../../lib/validation/cards.zod";
import { ApiErrors, jsonOk } from "../../../lib/http/api-response";
import { logger } from "../../../lib/logger";
import { bulkCreateCards } from "../../../lib/services/cards.service";
import { enforceRateLimit, RateLimitError } from "../../../lib/services/rate-limit.service";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const requestId = request.headers.get("x-request-id") ?? undefined;

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
    enforceRateLimit(user.id);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return ApiErrors.rateLimited();
    }
    logger.error("[POST /api/cards/bulk-create] Rate limit check failed", {
      userId: user.id,
      deckId: (body as Record<string, unknown> | undefined)?.deck_id,
      cardsCount: Array.isArray((body as Record<string, unknown> | undefined)?.cards)
        ? (body as Record<string, unknown> | undefined)?.cards.length
        : undefined,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const validatedCommand = bulkCreateCardsSchema.parse(body);
    const result = await bulkCreateCards(locals.supabase, user.id, validatedCommand);

    if (result.created.length === 0 && result.skipped.length === 0) {
      logger.error("[POST /api/cards/bulk-create] No cards created or skipped (unexpected)", {
        userId: user.id,
        deckId: validatedCommand.deck_id,
        cardsCount: validatedCommand.cards.length,
        requestId,
      });
    }

    if (result.created.length === 0 && result.skipped.length > 0) {
      logger.info("[POST /api/cards/bulk-create] All candidates skipped as duplicates", {
        userId: user.id,
        deckId: validatedCommand.deck_id,
        cardsCount: validatedCommand.cards.length,
        skipped: result.skipped.length,
        requestId,
      });
    }

    return jsonOk(result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput("Invalid request body", {
        issues: JSON.parse(JSON.stringify(error.errors)),
      });
    }

    if (error instanceof Error) {
      if (error.message === "DECK_NOT_FOUND") {
        return ApiErrors.deckNotFound();
      }

      if (error.message === "CONTENT_HASH_FAILED") {
        return ApiErrors.serverError("Failed to compute content hash");
      }

      if (error.message === "BULK_INSERT_FAILED") {
        return ApiErrors.serverError();
      }
    }

    logger.error("[POST /api/cards/bulk-create] Unexpected error", {
      userId: user.id,
      deckId: (body as Record<string, unknown> | undefined)?.deck_id,
      cardsCount: Array.isArray((body as Record<string, unknown> | undefined)?.cards)
        ? (body as Record<string, unknown> | undefined)?.cards.length
        : undefined,
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiErrors.serverError();
  }
};
