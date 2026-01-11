/**
 * Service layer for Cards resource.
 *
 * Handles all database operations for card management including:
 * - Listing with filtering (deck, tags, search, AI flag), pagination, and soft-delete control
 * - Creating new cards with server-side content hash computation
 * - Fetching single cards with ownership verification
 * - Updating card fields (recomputes content_hash when front/back changes)
 * - Hard-deleting cards
 *
 * Security:
 * - All operations rely on Supabase RLS policies that enforce user_id = auth.uid()
 * - user_id is always server-derived, never from client input
 * - Content hash is computed server-side to prevent client manipulation
 * - Deck ownership is verified before card creation
 */

import type { SupabaseClient } from "../../db/supabase.client";
import type {
  CardDto,
  CardListResponseDto,
  CreateCardCommand,
  UpdateCardCommand,
  CheckCardDuplicateCommand,
  CheckCardDuplicateResponseDto,
  UserId,
  CardId,
  DeckId,
} from "../../types";
import type { ListCardsQuery } from "../validation/cards.zod";
import { decodeCursor, extractCursor } from "../pagination/cursor";

/**
 * Computes the content hash for a card using the server-side PostgreSQL function.
 * This ensures consistent duplicate detection and prevents client manipulation.
 *
 * @param supabase - Typed Supabase client
 * @param front - Card front text (normalized by DB function)
 * @param back - Card back text (normalized by DB function)
 * @returns SHA256 hash of normalized content
 * @throws Error if hash computation fails
 */
async function computeContentHash(supabase: SupabaseClient, front: string, back: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_content_hash", { front, back });

  if (error || !data) {
    throw new Error(`Failed to compute content hash: ${error?.message || "Unknown error"}`);
  }

  return data;
}

/**
 * Lists cards for the authenticated user with optional filtering and pagination.
 *
 * Supports filtering by:
 * - Deck ID
 * - Tags (GIN index for performance)
 * - Search query (ILIKE on front/back)
 * - AI-generated flag
 * - Soft-deleted cards (excluded by default)
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param query - Validated query parameters
 * @returns Paginated list of cards
 * @throws Error if database query fails
 */
export async function listCards(
  supabase: SupabaseClient,
  userId: UserId,
  query: ListCardsQuery
): Promise<CardListResponseDto> {
  const {
    limit,
    cursor,
    sort = "created_at",
    order = "desc",
    deckId,
    tags,
    q,
    aiGenerated,
    includeDeleted = false,
  } = query;

  // Start building query
  let queryBuilder = supabase.from("cards").select("*").eq("user_id", userId);

  // Filter by deck
  if (deckId) {
    queryBuilder = queryBuilder.eq("deck_id", deckId);
  }

  // Filter by tags using GIN index containment operator
  if (tags && tags.length > 0) {
    queryBuilder = queryBuilder.contains("tags", tags);
  }

  // Search in front and back fields (ILIKE)
  if (q) {
    queryBuilder = queryBuilder.or(`front.ilike.%${q}%,back.ilike.%${q}%`);
  }

  // Filter by AI-generated flag
  if (aiGenerated !== undefined) {
    queryBuilder = queryBuilder.eq("ai_generated", aiGenerated);
  }

  // Filter out soft-deleted cards unless explicitly included
  if (!includeDeleted) {
    queryBuilder = queryBuilder.is("deleted_at", null);
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
      queryBuilder = queryBuilder.or(
        `${sort}.lt.${cursorPayload.sortValue},and(${sort}.eq.${cursorPayload.sortValue},id.lt.${cursorPayload.id})`
      );
    } else {
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
    throw new Error(`Failed to list cards: ${error.message}`);
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
 * Creates a new card for the authenticated user.
 *
 * Steps:
 * 1. Verify deck exists and is owned by user
 * 2. Compute content hash server-side
 * 3. Insert card with computed hash
 *
 * Database triggers enforce:
 * - user_id consistency with parent deck
 * - content_hash uniqueness per deck
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID (server-derived, not from client)
 * @param command - Validated card creation data
 * @returns Created card with all fields
 * @throws Error with specific message for deck not found or database failures
 */
export async function createCard(
  supabase: SupabaseClient,
  userId: UserId,
  command: CreateCardCommand
): Promise<CardDto> {
  // Step 1: Verify deck ownership
  const { data: deck, error: deckError } = await supabase
    .from("decks")
    .select("id")
    .eq("id", command.deck_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (deckError) {
    throw new Error(`Failed to verify deck: ${deckError.message}`);
  }

  if (!deck) {
    // Don't reveal whether deck exists to unauthorized users
    throw new Error("DECK_NOT_FOUND");
  }

  // Step 2: Compute content hash
  const contentHash = await computeContentHash(supabase, command.front, command.back);

  // Step 3: Insert card
  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      deck_id: command.deck_id,
      front: command.front,
      back: command.back,
      tags: command.tags || [],
      ai_generated: command.ai_generated,
      content_hash: contentHash,
    })
    .select()
    .single();

  if (error) {
    // Check for specific PostgreSQL error codes
    if (error.code === "23505") {
      // Unique constraint violation (duplicate content_hash)
      throw new Error("DUPLICATE_IN_DECK");
    }
    if (error.code === "23503") {
      // Foreign key violation (should not happen after deck check, but handle it)
      throw new Error("DECK_NOT_FOUND");
    }
    throw new Error(`Failed to create card: ${error.message}`);
  }

  return data;
}

/**
 * Fetches a single card by ID for the authenticated user.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param cardId - UUID of the card to fetch
 * @returns Card if found and owned by user, null otherwise
 * @throws Error if database query fails (not for 404 - returns null)
 */
export async function getCardById(supabase: SupabaseClient, userId: UserId, cardId: CardId): Promise<CardDto | null> {
  const { data, error } = await supabase.from("cards").select("*").eq("id", cardId).eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch card: ${error.message}`);
  }

  return data;
}

/**
 * Updates a card with partial field changes.
 *
 * Supports updating:
 * - front (triggers content_hash recomputation)
 * - back (triggers content_hash recomputation)
 * - tags (replaces entire array)
 * - deleted_at (for soft-delete/restore UX)
 *
 * Content hash is recomputed server-side when front or back changes,
 * which may trigger a duplicate error if the new content matches another card.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param cardId - UUID of the card to update
 * @param command - Validated partial update data
 * @returns Updated card if found and owned, null if not found/not owned
 * @throws Error if database update fails or content hash computation fails
 */
export async function updateCard(
  supabase: SupabaseClient,
  userId: UserId,
  cardId: CardId,
  command: UpdateCardCommand
): Promise<CardDto | null> {
  // Step 1: Fetch existing card
  const existing = await getCardById(supabase, userId, cardId);
  if (!existing) {
    return null;
  }

  // Step 2: Build update object
  const updateData: Record<string, unknown> = { ...command };

  // Step 3: Recompute content hash if front or back changed
  if (command.front !== undefined || command.back !== undefined) {
    const finalFront = command.front ?? existing.front;
    const finalBack = command.back ?? existing.back;
    const newContentHash = await computeContentHash(supabase, finalFront, finalBack);
    updateData.content_hash = newContentHash;
  }

  // Step 4: Perform the update
  const { data, error } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", cardId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    // Check for specific PostgreSQL error codes
    if (error.code === "23505") {
      // Unique constraint violation (duplicate content_hash after update)
      throw new Error("DUPLICATE_IN_DECK");
    }
    throw new Error(`Failed to update card: ${error.message}`);
  }

  return data;
}

/**
 * Hard-deletes a card (destructive, cannot be undone).
 *
 * For soft-delete UX, use updateCard with deleted_at instead.
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID
 * @param cardId - UUID of the card to delete
 * @returns true if deleted, false if not found/not owned
 * @throws Error if database delete fails (not for 404 - returns false)
 */
export async function deleteCard(supabase: SupabaseClient, userId: UserId, cardId: CardId): Promise<boolean> {
  const { data, error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId).select();

  if (error) {
    throw new Error(`Failed to delete card: ${error.message}`);
  }

  // If no rows were deleted, card wasn't found or not owned
  return data.length > 0;
}

/**
 * Checks if a card with the same content already exists in the specified deck.
 *
 * This is a non-blocking UX helper that allows warning users about potential
 * duplicates before they save a card.
 *
 * Steps:
 * 1. Verify deck exists and is owned by user
 * 2. Compute content hash using server-side DB function
 * 3. Query for existing card with same deck_id + content_hash
 * 4. Return hash, duplicate status, and optional card preview
 *
 * @param supabase - Typed Supabase client from context.locals
 * @param userId - Authenticated user ID (server-derived)
 * @param command - Validated duplicate check data (deck_id, front, back)
 * @returns Response with content_hash, isDuplicate flag, and optional duplicateCard
 * @throws Error with 'DECK_NOT_FOUND' message if deck doesn't exist or not owned
 * @throws Error if hash computation or database query fails
 */
export async function checkCardDuplicate(
  supabase: SupabaseClient,
  userId: UserId,
  command: CheckCardDuplicateCommand
): Promise<CheckCardDuplicateResponseDto> {
  // Step 1: Verify deck ownership
  const { data: deck, error: deckError } = await supabase
    .from("decks")
    .select("id")
    .eq("id", command.deck_id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (deckError) {
    throw new Error(`Failed to verify deck: ${deckError.message}`);
  }

  if (!deck) {
    // Don't reveal whether deck exists to unauthorized users
    throw new Error("DECK_NOT_FOUND");
  }

  // Step 2: Compute content hash using server-side function
  const contentHash = await computeContentHash(supabase, command.front, command.back);

  // Step 3: Query for duplicate card
  const { data: duplicateCard, error: queryError } = await supabase
    .from("cards")
    .select("id, front, back")
    .eq("deck_id", command.deck_id)
    .eq("content_hash", contentHash)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (queryError) {
    throw new Error(`Failed to query for duplicate: ${queryError.message}`);
  }

  // Step 4: Construct response
  return {
    content_hash: contentHash,
    isDuplicate: duplicateCard !== null,
    duplicateCard: duplicateCard
      ? {
          id: duplicateCard.id,
          front: duplicateCard.front,
          back: duplicateCard.back,
        }
      : null,
  };
}
