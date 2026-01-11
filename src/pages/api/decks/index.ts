/**
 * Decks collection endpoint: GET /api/decks, POST /api/decks
 * 
 * GET - List decks with optional search, pagination, and soft-delete filtering
 * POST - Create a new deck
 */

import type { APIRoute } from 'astro';
import { ZodError } from 'zod';

import { listDecksQuerySchema, createDeckSchema } from '../../../lib/validation/decks.zod';
import { jsonOk, jsonError, ApiErrors } from '../../../lib/http/api-response';
import { listDecks, createDeck } from '../../../lib/services/decks.service';

export const prerender = false;

/**
 * GET /api/decks
 * 
 * Lists decks for the authenticated user with optional filtering and pagination.
 * 
 * Query parameters:
 * - limit?: number (1-100, default 25)
 * - cursor?: string (opaque pagination cursor)
 * - sort?: "created_at" | "updated_at" (default "created_at")
 * - order?: "asc" | "desc" (default "desc")
 * - q?: string (search in name/description)
 * - includeDeleted?: boolean (default false)
 * 
 * Returns:
 * - 200: { data: DeckDto[], page: { limit, nextCursor } }
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
    const validatedQuery = listDecksQuerySchema.parse(queryParams);

    // 3. Call service layer
    const result = await listDecks(locals.supabase, user.id, validatedQuery);

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
    console.error('[GET /api/decks] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};

/**
 * POST /api/decks
 * 
 * Creates a new deck for the authenticated user.
 * 
 * Request body:
 * - name: string (required, 1-120 chars)
 * - description?: string | null (optional, max 2000 chars)
 * 
 * Returns:
 * - 201: Created DeckDto
 * - 400: Invalid request body
 * - 401: Not authenticated
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
    const validatedCommand = createDeckSchema.parse(body);

    // 3. Call service layer
    const deck = await createDeck(locals.supabase, user.id, validatedCommand);

    // 4. Return 201 Created response
    return jsonOk(deck, 201);
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

    // Handle unexpected errors
    console.error('[POST /api/decks] Unexpected error:', error);
    return ApiErrors.serverError();
  }
};
