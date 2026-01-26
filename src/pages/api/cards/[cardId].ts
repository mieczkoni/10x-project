/**
 * Individual card endpoint: GET /api/cards/{cardId}, PATCH /api/cards/{cardId}, DELETE /api/cards/{cardId}
 *
 * GET - Fetch a single card by ID
 * PATCH - Update card fields (recomputes content_hash if front/back changes)
 * DELETE - Hard-delete card (irreversible)
 */

import type { APIRoute } from "astro";
import { ZodError } from "zod";

import { cardIdParamSchema, updateCardSchema } from "../../../lib/validation/cards.zod";
import { jsonOk, noContent, ApiErrors } from "../../../lib/http/api-response";
import { logger } from "../../../lib/logger";
import { getCardById, updateCard, deleteCard } from "../../../lib/services/cards.service";

export const prerender = false;

/**
 * GET /api/cards/{cardId}
 *
 * Fetches a single card by ID for the authenticated user.
 *
 * Path parameters:
 * - cardId: UUID (required)
 *
 * Returns:
 * - 200: CardDto
 * - 400: Invalid UUID format
 * - 401: Not authenticated
 * - 404: Card not found or not owned by user
 * - 500: Server error
 */
export const GET: APIRoute = async ({ locals, params }) => {
  // 1. Authentication guard
  const {
    data: { user },
    error: authError,
  } = await locals.supabase.auth.getUser();

  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { cardId } = cardIdParamSchema.parse(params);

    // 3. Call service layer
    const card = await getCardById(locals.supabase, user.id, cardId);

    // 4. Handle not found
    if (!card) {
      return ApiErrors.notFound("Card not found");
    }

    // 5. Return success response
    return jsonOk(card);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput("Invalid card ID format", { issues: JSON.parse(JSON.stringify(error.errors)) });
    }

    // Handle unexpected errors
    logger.error("[GET /api/cards/:cardId] Unexpected error", error);
    return ApiErrors.serverError();
  }
};

/**
 * PATCH /api/cards/{cardId}
 *
 * Updates one or more fields on an existing card.
 * Recomputes content_hash server-side if front or back changes.
 *
 * Path parameters:
 * - cardId: UUID (required)
 *
 * Request body (at least one field required):
 * - front?: string (1-2000 chars)
 * - back?: string (1-10000 chars)
 * - tags?: string[] (max 50 chars each, max 20 tags)
 * - deleted_at?: string | null (ISO timestamp for soft-delete/restore)
 *
 * Returns:
 * - 200: Updated CardDto
 * - 400: Invalid UUID or request body
 * - 401: Not authenticated
 * - 404: Card not found or not owned by user
 * - 409: Updated content matches an existing card in this deck
 * - 500: Server error
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  // 1. Authentication guard
  const {
    data: { user },
    error: authError,
  } = await locals.supabase.auth.getUser();

  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { cardId } = cardIdParamSchema.parse(params);

    // 3. Parse and validate request body
    const body = await request.json();
    const validatedCommand = updateCardSchema.parse(body);

    // 4. Call service layer
    const updatedCard = await updateCard(locals.supabase, user.id, cardId, validatedCommand);

    // 5. Handle not found
    if (!updatedCard) {
      return ApiErrors.notFound("Card not found");
    }

    // 6. Return success response
    return jsonOk(updatedCard);
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput("Invalid JSON in request body");
    }

    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput("Invalid request", { issues: JSON.parse(JSON.stringify(error.errors)) });
    }

    // Handle specific service errors
    if (error instanceof Error) {
      // Duplicate content hash after update
      if (error.message === "DUPLICATE_IN_DECK") {
        return ApiErrors.duplicate("Updated content matches an existing card in this deck");
      }

      // Content hash computation failure
      if (error.message.includes("Failed to compute content hash")) {
        logger.error("[PATCH /api/cards/:cardId] Content hash computation failed", error);
        return ApiErrors.serverError("Failed to compute content hash");
      }
    }

    // Handle unexpected errors
    logger.error("[PATCH /api/cards/:cardId] Unexpected error", {
      cardId: params.cardId,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiErrors.serverError();
  }
};

/**
 * DELETE /api/cards/{cardId}
 *
 * Hard-deletes a card (destructive operation that cannot be undone).
 * For soft-delete UX, use PATCH with deleted_at instead.
 *
 * Path parameters:
 * - cardId: UUID (required)
 *
 * Returns:
 * - 204: No Content (successful deletion)
 * - 400: Invalid UUID format
 * - 401: Not authenticated
 * - 404: Card not found or not owned by user
 * - 500: Server error
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  // 1. Authentication guard
  const {
    data: { user },
    error: authError,
  } = await locals.supabase.auth.getUser();

  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { cardId } = cardIdParamSchema.parse(params);

    // 3. Call service layer
    const deleted = await deleteCard(locals.supabase, user.id, cardId);

    // 4. Handle not found
    if (!deleted) {
      return ApiErrors.notFound("Card not found");
    }

    // 5. Return 204 No Content
    return noContent();
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput("Invalid card ID format", { issues: JSON.parse(JSON.stringify(error.errors)) });
    }

    // Handle unexpected errors
    logger.error("[DELETE /api/cards/:cardId] Unexpected error", error);
    return ApiErrors.serverError();
  }
};
