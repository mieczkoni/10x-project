/**
 * Zod validation schemas for Decks API endpoints.
 *
 * These schemas validate and normalize inputs from:
 * - Query parameters (GET /decks)
 * - Path parameters (GET/PATCH/DELETE /decks/{deckId})
 * - Request bodies (POST/PATCH /decks)
 */

import { z } from "zod";

/**
 * UUID validation schema for deck IDs.
 * Used in path parameters like /decks/{deckId}.
 */
export const deckIdParamSchema = z.object({
  deckId: z.string().uuid({ message: "Invalid deck ID format" }),
});

/**
 * Query parameters for GET /decks.
 * Includes pagination, search, and soft-delete filtering.
 */
export const listDecksQuerySchema = z.object({
  // Pagination
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 25))
    .pipe(z.number().int().min(1).max(100)),
  cursor: z.string().optional(),
  sort: z.enum(["created_at", "updated_at"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),

  // Search
  q: z
    .string()
    .optional()
    .transform((val) => val?.trim() || undefined)
    .pipe(z.string().max(200).optional()),

  // Soft-delete filtering
  includeDeleted: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .pipe(z.boolean()),
});

/**
 * Request body for POST /decks.
 * Creates a new deck with name and optional description.
 */
export const createDeckSchema = z.object({
  name: z
    .string({ required_error: "Deck name is required" })
    .trim()
    .min(1, "Deck name cannot be empty")
    .max(120, "Deck name must be 120 characters or less"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or less")
    .nullable()
    .optional()
    .transform((val) => val ?? null),
});

/**
 * Request body for PATCH /decks/{deckId}.
 * Updates one or more fields on an existing deck.
 */
export const updateDeckSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Deck name cannot be empty")
      .max(120, "Deck name must be 120 characters or less")
      .optional(),
    description: z.string().trim().max(2000, "Description must be 2000 characters or less").nullable().optional(),
    deleted_at: z.string().datetime({ message: "deleted_at must be a valid ISO timestamp" }).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/**
 * Type exports for use in route handlers and service layer.
 */
export type DeckIdParam = z.infer<typeof deckIdParamSchema>;
export type ListDecksQuery = z.infer<typeof listDecksQuerySchema>;
export type CreateDeckBody = z.infer<typeof createDeckSchema>;
export type UpdateDeckBody = z.infer<typeof updateDeckSchema>;
