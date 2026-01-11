/**
 * POST /api/cards/duplicates/check
 *
 * Non-blocking duplicate detection for card creation UX.
 * Returns content hash and duplicate status without blocking save operations.
 *
 * Security:
 * - Requires authentication
 * - Verifies deck ownership
 * - RLS policies enforce user isolation
 *
 * @see .ai/duplicates-endpoint-implementation-plan.md
 */

import type { APIRoute } from "astro";
import { checkCardDuplicateSchema } from "../../../../lib/validation/cards.zod";
import { checkCardDuplicate } from "../../../../lib/services/cards.service";
import { jsonOk, ApiErrors } from "../../../../lib/http/api-response";

export const POST: APIRoute = async ({ request, locals }) => {
  // Step 1: Verify authentication
  const {
    data: { user },
  } = await locals.supabase.auth.getUser();

  if (!user) {
    return ApiErrors.unauthorized();
  }

  // Step 2: Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiErrors.invalidInput("Invalid JSON in request body");
  }

  const parseResult = checkCardDuplicateSchema.safeParse(body);

  if (!parseResult.success) {
    return ApiErrors.invalidInput(parseResult.error.errors[0].message, { validation: parseResult.error.format() });
  }

  // Step 3: Check for duplicate via service layer
  try {
    const result = await checkCardDuplicate(locals.supabase, user.id, parseResult.data);

    return jsonOk(result);
  } catch (error) {
    // Handle specific known errors
    if (error instanceof Error) {
      if (error.message === "DECK_NOT_FOUND") {
        return ApiErrors.deckNotFound();
      }

      // Log unexpected errors for debugging (don't expose details to client)
      console.error("Error checking card duplicate:", {
        userId: user.id,
        deckId: parseResult.data.deck_id,
        error: error.message,
      });
    }

    return ApiErrors.serverError("Failed to check for duplicates");
  }
};
