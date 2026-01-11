/**
 * Cursor-based pagination helpers for stable, efficient pagination.
 * 
 * Cursors are opaque base64url-encoded JSON strings containing:
 * - Sort field value (e.g., created_at)
 * - Primary key (id) as a tiebreaker
 * 
 * This approach avoids deep offset issues and provides stable pagination
 * even when data changes between requests.
 */

/**
 * Internal cursor payload structure.
 * Must match the sort field used in the query.
 */
export interface CursorPayload {
  /** ISO timestamp for sort fields like created_at or updated_at */
  sortValue: string;
  /** UUID of the last item on the page (tiebreaker) */
  id: string;
}

/**
 * Encodes a cursor payload into an opaque base64url string.
 * 
 * @param payload - Cursor data containing sortValue and id
 * @returns Base64url-encoded cursor string
 * 
 * @example
 * ```ts
 * const cursor = encodeCursor({
 *   sortValue: '2026-01-11T10:30:00Z',
 *   id: '123e4567-e89b-12d3-a456-426614174000'
 * });
 * // Returns: "eyJzb3J0VmFsdWUiOi..."
 * ```
 */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  // Convert to base64url (URL-safe base64)
  return Buffer.from(json, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decodes an opaque cursor string back into a cursor payload.
 * 
 * @param cursor - Base64url-encoded cursor string
 * @returns Decoded cursor payload, or null if invalid
 * 
 * @example
 * ```ts
 * const payload = decodeCursor('eyJzb3J0VmFsdWUiOi...');
 * if (!payload) {
 *   // Invalid cursor - return 400 error
 * }
 * ```
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    // Convert from base64url back to standard base64
    const base64 = cursor
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      // Add padding if needed
      .padEnd(cursor.length + ((4 - (cursor.length % 4)) % 4), '=');
    
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(json) as CursorPayload;
    
    // Validate structure
    if (
      typeof payload.sortValue !== 'string' ||
      typeof payload.id !== 'string' ||
      !payload.sortValue ||
      !payload.id
    ) {
      return null;
    }
    
    return payload;
  } catch {
    // Any parsing/decoding error means invalid cursor
    return null;
  }
}

/**
 * Extracts a cursor from the last item in a result set.
 * 
 * @param lastItem - The last row from the query results
 * @param sortField - The field used for sorting (e.g., 'created_at')
 * @returns Encoded cursor string
 * 
 * @example
 * ```ts
 * const results = await query.select('*').limit(26);
 * if (results.length > 25) {
 *   const nextCursor = extractCursor(results[24], 'created_at');
 *   results.pop(); // Remove the +1 item
 * }
 * ```
 */
export function extractCursor(
  lastItem: { id: string; [key: string]: unknown },
  sortField: string
): string {
  const sortValue = lastItem[sortField];
  
  if (typeof sortValue !== 'string') {
    throw new Error(`Sort field "${sortField}" must be a string (ISO timestamp expected)`);
  }
  
  return encodeCursor({
    sortValue,
    id: lastItem.id,
  });
}
