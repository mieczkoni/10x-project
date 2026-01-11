/**
 * Cards collection endpoint: GET /api/cards, POST /api/cards
 * 
 * GET - List cards with filtering by deck, tags, search, AI-generated flag, and soft-delete control
 * POST - Create a new card with server-computed content hash
 */

import type { APIRoute } from 'astro';
import { ZodError } from 'zod';

import { listCardsQuerySchema, createCardSchema } from '../../../lib/validation/cards.zod';
import { jsonOk, ApiErrors } from '../../../lib/http/api-response';
import { listCards, createCard } from '../../../lib/services/cards.service';

export const prerender = false;

/**
 * GET /api/cards
 * 
 * Lists cards for the authenticated user with optional filtering and pagination.
 * 
 * Query parameters:
 * - limit?: number (1-100, default 25)
 * - cursor?: string (opaque pagination cursor)
 * - sort?: "created_at" | "updated_at" (default "created_at")
 * - order?: "asc" | "desc" (default "desc")
 * - deckId?: UUID (filter by specific deck)
 * - tag?: string | string[] (repeatable tag filter)
 * - tags?: string (comma-separated tags)
 * - q?: string (search in front/back, ILIKE)
 * - aiGenerated?: "true" | "false" (filter by AI-generated flag)
 * - includeDeleted?: "true" | "false" (default false)
 * 
 * Returns:
 * - 200: { data: CardDto[], page: { limit, nextCursor } }
 * - 400: Invalid query parameters
 * - 401: Not authenticated
 * - 500: Server error
 */
export const GET: APIRoute = async ({ locals, url }) => {
  // 1. Authentication guard
  const { data: { user }, error: authError } = await locals.supabase.auth.getUser();
  
  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Parse and validate query parameters
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedQuery = listCardsQuerySchema.parse(queryParams);

    // 3. Call service layer
    const result = await listCards(locals.supabase, user.id, validatedQuery);

    // 4. Return success response
    return jsonOk(result);
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput(
        'Invalid query parameters',
        { issues: JSON.parse(JSON.stringify(error.errors)) }
      );
    }

    // Handle invalid cursor specifically (thrown by service)
    if (error instanceof Error && error.message.includes('Invalid cursor')) {
      return ApiErrors.invalidInput('Invalid pagination cursor');
    }

    // Handle unexpected errors
    console.error('[GET /api/cards] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};

/**
 * POST /api/cards
 * 
 * Creates a new card for the authenticated user with server-computed content hash.
 * 
 * Request body:
 * - deck_id: UUID (required)
 * - front: string (required, 1-2000 chars)
 * - back: string (required, 1-10000 chars)
 * - tags?: string[] (optional, max 50 chars each, max 20 tags)
 * - ai_generated: boolean (required)
 * 
 * Returns:
 * - 201: Created CardDto
 * - 400: Invalid request body
 * - 401: Not authenticated
 * - 404: Deck not found or not owned by user
 * - 409: Duplicate content in deck (based on content_hash)
 * - 500: Server error
 */
export const POST: APIRoute = async ({ locals, request }) => {
  // 1. Authentication guard
  const { data: { user }, error: authError } = await locals.supabase.auth.getUser();
  
  if (authError || !user) {
    return ApiErrors.unauthorized();
  }

  try {
    // 2. Parse and validate request body
    const body = await request.json();
    const validatedCommand = createCardSchema.parse(body);

    // 3. Call service layer
    const card = await createCard(locals.supabase, user.id, validatedCommand);

    // 4. Return 201 Created response
    return jsonOk(card, 201);
  } catch (error) {
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return ApiErrors.invalidInput('Invalid JSON in request body');
    }

    // Handle validation errors
    if (error instanceof ZodError) {
      return ApiErrors.invalidInput(
        'Invalid request body',
        { issues: JSON.parse(JSON.stringify(error.errors)) }
      );
    }

    // Handle specific service errors
    if (error instanceof Error) {
      // Deck not found error
      if (error.message === 'DECK_NOT_FOUND') {
        return ApiErrors.deckNotFound();
      }

      // Duplicate content hash in deck
      if (error.message === 'DUPLICATE_IN_DECK') {
        return ApiErrors.duplicate('A card with identical content already exists in this deck');
      }

      // Content hash computation failure
      if (error.message.includes('Failed to compute content hash')) {
        console.error('[POST /api/cards] Content hash computation failed:', error);
        return ApiErrors.serverError('Failed to compute content hash');
      }
    }

    // Handle unexpected errors
    console.error('[POST /api/cards] Unexpected error:', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiErrors.serverError();
  }
};
