/**
 * Service layer for Decks resource.
 *
 * Handles all database operations for deck management including:
 * - Listing with search, pagination, and soft-delete filtering
 * - Creating new decks
 * - Fetching single decks with ownership verification
 * - Updating deck fields (including soft-delete via deleted_at)
 * - Hard-deleting decks (cascades to cards)
 *
 * Security: All operations rely on Supabase RLS policies that enforce
 * user_id = auth.uid() access control.
 */

import type { SupabaseClient } from "../../db/supabase.client";
import type { DeckDto, DeckListResponseDto, CreateDeckCommand, UpdateDeckCommand, UserId, DeckId } from "../../types";
import type { ListDecksQuery } from "../validation/decks.zod";
import { decodeCursor, extractCursor } from "../pagination/cursor";

/**
 * Lists decks for the authenticated user with optional filtering and pagination.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param query - Validated query parameters (limit, cursor, sort, order, q, includeDeleted)
 * @returns Paginated list of decks
 *
 * @throws Error if database query fails (caller should catch and return 500)
 */
export async function listDecks(
  supabase: SupabaseClient,
  userId: UserId,
  query: ListDecksQuery
): Promise<DeckListResponseDto> {
  const { limit, cursor, sort = "created_at", order = "desc", q, includeDeleted = false } = query;

  // Start building query
  let queryBuilder = supabase.from("decks").select("*").eq("user_id", userId);

  // Filter out soft-deleted decks unless explicitly included
  if (!includeDeleted) {
    queryBuilder = queryBuilder.is("deleted_at", null);
  }

  // Search in name and description (case-insensitive)
  if (q) {
    // PostgREST .or() syntax for searching across multiple fields
    queryBuilder = queryBuilder.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  // Apply cursor pagination if provided
  if (cursor) {
    const cursorPayload = decodeCursor(cursor);
    if (!cursorPayload) {
      throw new Error("Invalid cursor format");
    }

    // Apply cursor filter based on sort order
    // For stable pagination, we use (sortField, id) composite comparison
    if (order === "desc") {
      // Get rows where (sortField < cursor.sortValue) OR (sortField = cursor.sortValue AND id < cursor.id)
      queryBuilder = queryBuilder.or(
        `${sort}.lt.${cursorPayload.sortValue},and(${sort}.eq.${cursorPayload.sortValue},id.lt.${cursorPayload.id})`
      );
    } else {
      // Get rows where (sortField > cursor.sortValue) OR (sortField = cursor.sortValue AND id > cursor.id)
      queryBuilder = queryBuilder.or(
        `${sort}.gt.${cursorPayload.sortValue},and(${sort}.eq.${cursorPayload.sortValue},id.gt.${cursorPayload.id})`
      );
    }
  }

  // Apply ordering (use id as tiebreaker for stability)
  queryBuilder = queryBuilder.order(sort, { ascending: order === "asc" });
  queryBuilder = queryBuilder.order("id", { ascending: order === "asc" });

  // Fetch limit + 1 to determine if there's a next page
  queryBuilder = queryBuilder.limit(limit + 1);

  // Execute query
  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to list decks: ${error.message}`);
  }

  // Determine if there's a next page
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? extractCursor(items[items.length - 1], sort) : null;

  return {
    data: items,
    page: {
      limit,
      nextCursor,
    },
  };
}

/**
 * Creates a new deck for the authenticated user.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID (server-derived, not from client)
 * @param command - Validated deck creation data
 * @returns Created deck with all fields
 *
 * @throws Error if database insert fails
 */
export async function createDeck(
  supabase: SupabaseClient,
  userId: UserId,
  command: CreateDeckCommand
): Promise<DeckDto> {
  const { data, error } = await supabase
    .from("decks")
    .insert({
      user_id: userId,
      name: command.name,
      description: command.description,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create deck: ${error.message}`);
  }

  return data;
}

/**
 * Fetches a single deck by ID for the authenticated user.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param deckId - UUID of the deck to fetch
 * @returns Deck if found and owned by user, null otherwise
 *
 * @throws Error if database query fails (not for 404 - returns null)
 */
export async function getDeckById(supabase: SupabaseClient, userId: UserId, deckId: DeckId): Promise<DeckDto | null> {
  const { data, error } = await supabase.from("decks").select("*").eq("id", deckId).eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch deck: ${error.message}`);
  }

  return data;
}

/**
 * Updates a deck with partial field changes.
 *
 * Supports updating:
 * - name
 * - description
 * - deleted_at (for soft-delete/restore UX)
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param deckId - UUID of the deck to update
 * @param command - Validated partial update data
 * @returns Updated deck if found and owned, null if not found/not owned
 *
 * @throws Error if database update fails (not for 404 - returns null)
 */
export async function updateDeck(
  supabase: SupabaseClient,
  userId: UserId,
  deckId: DeckId,
  command: UpdateDeckCommand
): Promise<DeckDto | null> {
  // First verify the deck exists and is owned by the user
  const existing = await getDeckById(supabase, userId, deckId);
  if (!existing) {
    return null;
  }

  // Perform the update
  const { data, error } = await supabase
    .from("decks")
    .update(command)
    .eq("id", deckId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update deck: ${error.message}`);
  }

  return data;
}

/**
 * Hard-deletes a deck and all associated cards (via FK cascade).
 *
 * This is a destructive operation that cannot be undone.
 * For soft-delete UX, use updateDeck with deleted_at instead.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param deckId - UUID of the deck to delete
 * @returns true if deleted, false if not found/not owned
 *
 * @throws Error if database delete fails (not for 404 - returns false)
 */
export async function deleteDeck(supabase: SupabaseClient, userId: UserId, deckId: DeckId): Promise<boolean> {
  const { data, error } = await supabase.from("decks").delete().eq("id", deckId).eq("user_id", userId).select();

  if (error) {
    throw new Error(`Failed to delete deck: ${error.message}`);
  }

  // If no rows were deleted, deck wasn't found or not owned
  return data.length > 0;
}
