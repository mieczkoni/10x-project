/**
 * Zod validation schemas for Cards API endpoints.
 * 
 * These schemas validate and normalize inputs from:
 * - Query parameters (GET /cards)
 * - Path parameters (GET/PATCH/DELETE /cards/{cardId})
 * - Request bodies (POST/PATCH /cards)
 * 
 * Key features:
 * - Tag normalization (lowercase, trim, deduplicate)
 * - Content validation with appropriate length limits
 * - Support for both `tag` (repeatable) and `tags` (comma-separated) query params
 */

import { z } from 'zod';

/**
 * Helper to normalize tags: lowercase, trim, deduplicate, filter empty.
 */
function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
    )
  );
}

/**
 * UUID validation schema for card IDs.
 * Used in path parameters like /cards/{cardId}.
 */
export const cardIdParamSchema = z.object({
  cardId: z.string().uuid({ message: 'Invalid card ID format' }),
});

/**
 * Query parameters for GET /cards.
 * Includes pagination, filtering by deck/tags/search/AI flag, and soft-delete control.
 */
export const listCardsQuerySchema = z.object({
  // Pagination
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 25))
    .pipe(z.number().int().min(1).max(100)),
  cursor: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  
  // Filters
  deckId: z
    .string()
    .uuid({ message: 'Invalid deck ID format' })
    .optional(),
  
  // Tag filtering - supports both repeatable `tag` param and comma-separated `tags`
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const tags = Array.isArray(val) ? val : [val];
      return normalizeTags(tags);
    }),
  
  tags: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const tags = val.split(',').map(t => t.trim());
      return normalizeTags(tags);
    }),
  
  // Search query (ILIKE on front/back)
  q: z
    .string()
    .optional()
    .transform((val) => (val?.trim() || undefined))
    .pipe(z.string().max(200).optional()),
  
  // AI-generated filter
  aiGenerated: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .pipe(z.boolean().optional()),
  
  // Soft-delete filtering
  includeDeleted: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean()),
})
  .transform((data) => {
    // Merge `tag` and `tags` into a single normalized array
    const tagArray = data.tag || [];
    const tagsArray = data.tags || [];
    const mergedTags = normalizeTags([...tagArray, ...tagsArray]);
    
    return {
      ...data,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      tag: undefined, // Remove individual params after merging
    };
  });

/**
 * Request body for POST /cards.
 * Creates a new card with server-computed content_hash.
 */
export const createCardSchema = z.object({
  deck_id: z
    .string({ required_error: 'deck_id is required' })
    .uuid({ message: 'Invalid deck ID format' }),
  
  front: z
    .string({ required_error: 'front is required' })
    .trim()
    .min(1, 'Front cannot be empty')
    .max(2000, 'Front must be 2000 characters or less'),
  
  back: z
    .string({ required_error: 'back is required' })
    .trim()
    .min(1, 'Back cannot be empty')
    .max(10000, 'Back must be 10000 characters or less'),
  
  tags: z
    .array(
      z.string().max(50, 'Each tag must be 50 characters or less')
    )
    .optional()
    .transform((val) => {
      if (!val || val.length === 0) return [];
      return normalizeTags(val);
    })
    .pipe(z.array(z.string()).max(20, 'Maximum 20 tags allowed')),
  
  ai_generated: z
    .boolean({ required_error: 'ai_generated is required' }),
});

/**
 * Request body for PATCH /cards/{cardId}.
 * Updates one or more fields on an existing card.
 * Content hash is recomputed server-side if front/back changes.
 */
export const updateCardSchema = z
  .object({
    front: z
      .string()
      .trim()
      .min(1, 'Front cannot be empty')
      .max(2000, 'Front must be 2000 characters or less')
      .optional(),
    
    back: z
      .string()
      .trim()
      .min(1, 'Back cannot be empty')
      .max(10000, 'Back must be 10000 characters or less')
      .optional(),
    
    tags: z
      .array(
        z.string().max(50, 'Each tag must be 50 characters or less')
      )
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined;
        if (!val || val.length === 0) return [];
        return normalizeTags(val);
      })
      .pipe(z.array(z.string()).max(20, 'Maximum 20 tags allowed').optional()),
    
    deleted_at: z
      .string()
      .datetime({ message: 'deleted_at must be a valid ISO timestamp' })
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

/**
 * Request body for POST /cards/duplicates:check.
 * Validates duplicate check input - matches create constraints for consistency.
 */
export const checkCardDuplicateSchema = z.object({
  deck_id: z
    .string({ required_error: 'deck_id is required' })
    .uuid({ message: 'Invalid deck ID format' }),
  
  front: z
    .string({ required_error: 'front is required' })
    .trim()
    .min(1, 'Front cannot be empty')
    .max(2000, 'Front must be 2000 characters or less'),
  
  back: z
    .string({ required_error: 'back is required' })
    .trim()
    .min(1, 'Back cannot be empty')
    .max(10000, 'Back must be 10000 characters or less'),
});

/**
 * Type exports for use in route handlers and service layer.
 */
export type CardIdParam = z.infer<typeof cardIdParamSchema>;
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;
export type CreateCardBody = z.infer<typeof createCardSchema>;
export type UpdateCardBody = z.infer<typeof updateCardSchema>;
export type CheckCardDuplicateBody = z.infer<typeof checkCardDuplicateSchema>;