/**
 * Individual deck endpoint: GET /api/decks/{deckId}, PATCH /api/decks/{deckId}, DELETE /api/decks/{deckId}
 * 
 * GET - Fetch a single deck by ID
 * PATCH - Update deck fields (including soft-delete via deleted_at)
 * DELETE - Hard-delete deck and cascade to cards
 */

import type { APIRoute } from 'astro';
import { ZodError } from 'zod';

import { deckIdParamSchema, updateDeckSchema } from '../../../lib/validation/decks.zod';
import { jsonOk, jsonError, noContent, ApiErrors } from '../../../lib/http/api-response';
import { getDeckById, updateDeck, deleteDeck } from '../../../lib/services/decks.service';

export const prerender = false;

/**
 * GET /api/decks/{deckId}
 * 
 * Fetches a single deck by ID for the authenticated user.
 * 
 * Path parameters:
 * - deckId: UUID (required)
 * 
 * Returns:
 * - 200: DeckDto
 * - 400: Invalid UUID format
 * - 401: Not authenticated
 * - 404: Deck not found or not owned by user
 * - 500: Server error
 */
export const GET: APIRoute = async ({ locals, params }) => {
  // 1. Authentication guard
  const { data: { user }, error: authError } = await locals.supabase.auth.getUser();
  
  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { deckId } = deckIdParamSchema.parse(params);

    // 3. Call service layer
    const deck = await getDeckById(locals.supabase, user.id, deckId);

    // 4. Handle not found
    if (!deck) {
      return ApiErrors.notFound('Deck not found');
    }

    // 5. Return success response
    return jsonOk(deck);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput(
        'Invalid deck ID format',
        { issues: JSON.parse(JSON.stringify(error.errors)) }
      );
    }

    // Handle unexpected errors
    console.error('[GET /api/decks/:deckId] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};

/**
 * PATCH /api/decks/{deckId}
 * 
 * Updates one or more fields on an existing deck.
 * 
 * Path parameters:
 * - deckId: UUID (required)
 * 
 * Request body (at least one field required):
 * - name?: string (1-120 chars)
 * - description?: string | null (max 2000 chars)
 * - deleted_at?: string | null (ISO timestamp for soft-delete/restore)
 * 
 * Returns:
 * - 200: Updated DeckDto
 * - 400: Invalid UUID or request body
 * - 401: Not authenticated
 * - 404: Deck not found or not owned by user
 * - 500: Server error
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  // 1. Authentication guard
  const { data: { user }, error: authError } = await locals.supabase.auth.getUser();
  
  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { deckId } = deckIdParamSchema.parse(params);

    // 3. Parse and validate request body
    const body = await request.json();
    const validatedCommand = updateDeckSchema.parse(body);

    // 4. Call service layer
    const updatedDeck = await updateDeck(locals.supabase, user.id, deckId, validatedCommand);

    // 5. Handle not found
    if (!updatedDeck) {
      return ApiErrors.notFound('Deck not found');
    }

    // 6. Return success response
    return jsonOk(updatedDeck);
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput('Invalid JSON in request body');
    }

    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput(
        'Invalid request',
        { issues: JSON.parse(JSON.stringify(error.errors)) }
      );
    }

    // Handle unexpected errors
    console.error('[PATCH /api/decks/:deckId] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};

/**
 * DELETE /api/decks/{deckId}
 * 
 * Hard-deletes a deck and all associated cards (via FK cascade).
 * This is a destructive operation that cannot be undone.
 * 
 * For soft-delete UX, use PATCH with deleted_at instead.
 * 
 * Path parameters:
 * - deckId: UUID (required)
 * 
 * Returns:
 * - 204: No Content (successful deletion)
 * - 400: Invalid UUID format
 * - 401: Not authenticated
 * - 404: Deck not found or not owned by user
 * - 500: Server error
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  // 1. Authentication guard
  const { data: { user }, error: authError } = await locals.supabase.auth.getUser();
  
  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Validate path parameter
    const { deckId } = deckIdParamSchema.parse(params);

    // 3. Call service layer
    const deleted = await deleteDeck(locals.supabase, user.id, deckId);

    // 4. Handle not found
    if (!deleted) {
      return ApiErrors.notFound('Deck not found');
    }

    // 5. Return 204 No Content
    return noContent();
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput(
        'Invalid deck ID format',
        { issues: JSON.parse(JSON.stringify(error.errors)) }
      );
    }

    // Handle unexpected errors
    console.error('[DELETE /api/decks/:deckId] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};
