# API Endpoint Implementation Plan: Cards Resource

## 1. Endpoint Overview

The Cards resource provides CRUD operations and advanced filtering for flashcards. Cards belong to decks and are owned by users. Each card has a server-computed `content_hash` (SHA256 of normalized `front||back`) that enforces per-deck uniqueness and enables duplicate detection.

**Endpoints:**
- `GET /api/cards` - List cards with optional filtering by deck, tags, search query, and AI-generated flag
- `POST /api/cards` - Create a new card (manual or AI-generated) with server-side content hash computation
- `GET /api/cards/{cardId}` - Retrieve a single card by ID
- `PATCH /api/cards/{cardId}` - Update card content or tags (recomputes content_hash if front/back changes)
- `DELETE /api/cards/{cardId}` - Hard-delete a card (irreversible)

**Key Features:**
- Cursor-based pagination for stable list results
- Tag filtering using PostgreSQL GIN indexes for performance
- Full-text search (ILIKE) on front/back fields
- Server-side content hash computation prevents client manipulation
- Database-enforced uniqueness per deck via `(deck_id, content_hash)` constraint
- Soft-delete support via `deleted_at` field (optional UX feature)

---

## 2. Request Details

### GET `/api/cards`

**Purpose:** List cards for the authenticated user with optional filtering and pagination.

**HTTP Method:** GET

**URL Structure:** `/api/cards?[queryParams]`

**Query Parameters (all optional):**
- `deckId` (string, UUID) - Filter by specific deck
- `tag` (string, repeatable) - Filter by one or more tags (e.g., `?tag=biology&tag=cell`)
- `tags` (string, comma-separated) - Alternative tag filter syntax (e.g., `?tags=biology,cell`)
- `q` (string) - Search query for ILIKE matching on `front` and `back` fields
- `aiGenerated` (boolean string: "true" or "false") - Filter by AI-generated flag
- `includeDeleted` (boolean string: "true" or "false", default "false") - Include soft-deleted cards
- `limit` (integer, 1-100, default 25) - Page size
- `cursor` (string, opaque) - Pagination cursor for next page
- `sort` (enum: "created_at" | "updated_at", default "created_at") - Sort field
- `order` (enum: "asc" | "desc", default "desc") - Sort order

**Request Body:** None

**Authentication:** Required (Supabase Auth JWT)

---

### POST `/api/cards`

**Purpose:** Create a new card in a deck with server-computed content hash.

**HTTP Method:** POST

**URL Structure:** `/api/cards`

**Request Body (JSON):**
```json
{
  "deck_id": "uuid (required)",
  "front": "string (required, 1-2000 chars after trim)",
  "back": "string (required, 1-10000 chars after trim)",
  "tags": ["string (optional, max 50 chars each)"],
  "ai_generated": "boolean (required)"
}
```

**Field Details:**
- `deck_id`: Must exist and be owned by the authenticated user
- `front`: Question/prompt side of the flashcard (trimmed, non-empty)
- `back`: Answer side of the flashcard (trimmed, non-empty)
- `tags`: Array of normalized tags (lowercase, trimmed, deduplicated); defaults to `[]` if omitted
- `ai_generated`: Flag indicating whether the card was created by AI (affects telemetry/analytics)

**Authentication:** Required (Supabase Auth JWT)

---

### GET `/api/cards/{cardId}`

**Purpose:** Retrieve a single card by ID (must be owned by authenticated user).

**HTTP Method:** GET

**URL Structure:** `/api/cards/{cardId}`

**Path Parameters:**
- `cardId` (string, UUID) - Card identifier

**Request Body:** None

**Authentication:** Required (Supabase Auth JWT)

---

### PATCH `/api/cards/{cardId}`

**Purpose:** Update card fields. Recomputes `content_hash` if `front` or `back` changes.

**HTTP Method:** PATCH

**URL Structure:** `/api/cards/{cardId}`

**Path Parameters:**
- `cardId` (string, UUID) - Card identifier

**Request Body (JSON, at least one field required):**
```json
{
  "front": "string (optional, 1-2000 chars after trim)",
  "back": "string (optional, 1-10000 chars after trim)",
  "tags": ["string (optional, max 50 chars each)"],
  "deleted_at": "string | null (optional, ISO 8601 timestamp)"
}
```

**Field Details:**
- All fields are optional, but at least one must be provided
- `front`/`back`: If either changes, triggers content_hash recomputation (may cause 409 duplicate error)
- `tags`: Replaces the entire tags array (not a merge operation)
- `deleted_at`: Set to ISO timestamp for soft-delete, or `null` to restore

**Authentication:** Required (Supabase Auth JWT)

---

### DELETE `/api/cards/{cardId}`

**Purpose:** Permanently delete a card (hard delete, cannot be undone).

**HTTP Method:** DELETE

**URL Structure:** `/api/cards/{cardId}`

**Path Parameters:**
- `cardId` (string, UUID) - Card identifier

**Request Body:** None

**Authentication:** Required (Supabase Auth JWT)

---

## 3. Used Types

### From `src/types.ts`

**DTOs:**
- `CardDto` - Full card entity returned by all read operations
- `CardListResponseDto` - Paginated list response wrapper
- `CreateCardCommand` - Client-provided card creation data (omits server-managed fields)
- `UpdateCardCommand` - Partial card update data
- `ListCardsQueryDto` - Query parameters for list endpoint
- `CardId`, `DeckId`, `UserId` - Type-safe ID aliases

**Standard Types:**
- `ApiErrorResponseDto` - Error response structure
- `ApiErrorDto` - Error detail object
- `PageDto` - Pagination metadata
- `ListResponseDto<T>` - Generic paginated response

### Validation Types (to be created in `src/lib/validation/cards.zod.ts`)

**Schemas:**
- `cardIdParamSchema` - Path parameter validation for `{cardId}`
- `listCardsQuerySchema` - Query parameter validation for GET `/cards`
- `createCardSchema` - Request body validation for POST `/cards`
- `updateCardSchema` - Request body validation for PATCH `/cards/{cardId}`

**Exported Types:**
- `CardIdParam` - Inferred type from `cardIdParamSchema`
- `ListCardsQuery` - Inferred type from `listCardsQuerySchema`
- `CreateCardBody` - Inferred type from `createCardSchema`
- `UpdateCardBody` - Inferred type from `updateCardSchema`

### Service Layer Types (to be created in `src/lib/services/cards.service.ts`)

**Functions:**
- `listCards(supabase, userId, query)` → `Promise<CardListResponseDto>`
- `createCard(supabase, userId, command)` → `Promise<CardDto>`
- `getCardById(supabase, userId, cardId)` → `Promise<CardDto | null>`
- `updateCard(supabase, userId, cardId, command)` → `Promise<CardDto | null>`
- `deleteCard(supabase, userId, cardId)` → `Promise<boolean>`

---

## 4. Response Details

### GET `/api/cards` Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid",
      "deck_id": "uuid",
      "user_id": "uuid",
      "front": "What is mitochondria?",
      "back": "The powerhouse of the cell",
      "tags": ["biology", "cell"],
      "content_hash": "a3f8b9c2...",
      "ai_generated": false,
      "created_at": "2026-01-11T10:00:00Z",
      "updated_at": "2026-01-11T10:00:00Z",
      "deleted_at": null
    }
  ],
  "page": {
    "limit": 25,
    "nextCursor": "eyJzb3J0VmFsdWU..." // or null
  }
}
```

**Errors:**
- `401 unauthorized` - Missing or invalid authentication
- `400 invalid_input` - Invalid query parameters (malformed UUID, invalid enum values, out-of-range limit)

---

### POST `/api/cards` Response

**Success (201 Created):**
Returns the created card object (same structure as GET single card).

**Errors:**
- `400 invalid_input` - Validation errors (empty fields, exceeds max length, invalid UUID format)
- `401 unauthorized` - Missing or invalid authentication
- `404 deck_not_found` - Referenced deck doesn't exist or not owned by user
- `409 duplicate_in_deck` - A card with the same normalized content already exists in this deck
- `500 server_error` - Database failure or content_hash computation failure

---

### GET `/api/cards/{cardId}` Response

**Success (200 OK):**
Returns a single card object.

**Errors:**
- `400 invalid_input` - Invalid UUID format for cardId
- `401 unauthorized` - Missing or invalid authentication
- `404 not_found` - Card doesn't exist or not owned by user

---

### PATCH `/api/cards/{cardId}` Response

**Success (200 OK):**
Returns the updated card object.

**Errors:**
- `400 invalid_input` - Validation errors, no fields provided, invalid UUID format
- `401 unauthorized` - Missing or invalid authentication
- `404 not_found` - Card doesn't exist or not owned by user
- `409 duplicate_in_deck` - Updated content matches an existing card in the same deck
- `500 server_error` - Database failure or content_hash recomputation failure

---

### DELETE `/api/cards/{cardId}` Response

**Success (204 No Content):**
Empty response body.

**Errors:**
- `400 invalid_input` - Invalid UUID format for cardId
- `401 unauthorized` - Missing or invalid authentication
- `404 not_found` - Card doesn't exist or not owned by user
- `500 server_error` - Database deletion failure

---

## 5. Data Flow

### GET `/api/cards` Flow

1. **Authentication Check**
   - Extract user from `locals.supabase.auth.getUser()`
   - Return 401 if not authenticated

2. **Input Validation**
   - Parse query parameters from URL
   - Validate with `listCardsQuerySchema`
   - Normalize `tag`/`tags` into array format
   - Convert string booleans to actual booleans
   - Return 400 if validation fails

3. **Service Layer Call**
   - Pass validated query to `listCards(supabase, userId, query)`

4. **Database Query Construction**
   - Start with base query: `SELECT * FROM cards WHERE user_id = $1`
   - Apply filters:
     - `deckId`: Add `AND deck_id = $2`
     - `tags`: Use GIN index with `tags @> ARRAY[$3, $4, ...]`
     - `q`: Add `AND (front ILIKE %$5% OR back ILIKE %$5%)`
     - `aiGenerated`: Add `AND ai_generated = $6`
     - `includeDeleted=false`: Add `AND deleted_at IS NULL`
   - Apply cursor pagination (see decks pattern)
   - Apply ordering with `ORDER BY {sort} {order}, id {order}`
   - Fetch `LIMIT + 1` rows

5. **Pagination Processing**
   - Determine `hasMore` by checking if result length > limit
   - Slice results to limit
   - Extract cursor from last item if `hasMore`

6. **Response**
   - Return 200 with `{ data, page: { limit, nextCursor } }`

7. **Error Handling**
   - Catch `ZodError` → 400 with validation details
   - Catch cursor decode errors → 400 with "Invalid pagination cursor"
   - Catch database errors → 500 with generic message

---

### POST `/api/cards` Flow

1. **Authentication Check**
   - Extract user from `locals.supabase.auth.getUser()`
   - Return 401 if not authenticated

2. **Input Validation**
   - Parse JSON body
   - Validate with `createCardSchema`
   - Trim and normalize front/back
   - Normalize tags (lowercase, trim, deduplicate)
   - Return 400 if validation fails

3. **Deck Ownership Verification**
   - Query `SELECT id FROM decks WHERE id = $1 AND user_id = $2`
   - Return 404 "Deck not found" if no match (security: don't reveal existence)

4. **Content Hash Computation**
   - Call PostgreSQL function: `SELECT public.generate_content_hash($front, $back)`
   - Return 500 if function call fails

5. **Card Insertion**
   - Insert into `cards` table with:
     - `user_id = userId` (server-derived)
     - `deck_id`, `front`, `back`, `tags`, `ai_generated` (from validated command)
     - `content_hash` (from step 4)
   - Database trigger `ensure_card_user_matches_deck()` validates user_id consistency
   - Unique constraint `uniq_deck_content_hash` enforces no duplicates

6. **Error Handling**
   - PostgreSQL error code `23505` (unique_violation) → 409 "A card with identical content already exists in this deck"
   - PostgreSQL error code `23503` (foreign_key_violation) → 404 "Deck not found"
   - Other database errors → 500

7. **Response**
   - Return 201 with created card object

---

### GET `/api/cards/{cardId}` Flow

1. **Authentication Check**
   - Extract user from `locals.supabase.auth.getUser()`
   - Return 401 if not authenticated

2. **Path Parameter Validation**
   - Validate `cardId` with `cardIdParamSchema`
   - Return 400 if not a valid UUID

3. **Service Layer Call**
   - Call `getCardById(supabase, userId, cardId)`

4. **Database Query**
   - `SELECT * FROM cards WHERE id = $1 AND user_id = $2`
   - Use `.maybeSingle()` to return null if not found
   - RLS policy enforces user ownership

5. **Response**
   - If card found: Return 200 with card object
   - If card is null: Return 404 "Card not found"

6. **Error Handling**
   - Catch database errors → 500

---

### PATCH `/api/cards/{cardId}` Flow

1. **Authentication Check**
   - Extract user from `locals.supabase.auth.getUser()`
   - Return 401 if not authenticated

2. **Path Parameter Validation**
   - Validate `cardId` with `cardIdParamSchema`
   - Return 400 if not a valid UUID

3. **Input Validation**
   - Parse JSON body
   - Validate with `updateCardSchema` (requires at least one field)
   - Trim and normalize any provided text fields
   - Normalize tags if provided
   - Return 400 if validation fails

4. **Fetch Existing Card**
   - Call `getCardById(supabase, userId, cardId)`
   - Return 404 if card not found

5. **Content Hash Recomputation (conditional)**
   - If `front` OR `back` is in the update command:
     - Determine final front: `command.front ?? existingCard.front`
     - Determine final back: `command.back ?? existingCard.back`
     - Call `SELECT public.generate_content_hash($finalFront, $finalBack)`
     - Add `content_hash` to the update object

6. **Database Update**
   - Build update object from command + computed content_hash (if applicable)
   - Execute: `UPDATE cards SET [...fields] WHERE id = $1 AND user_id = $2`
   - Database trigger `update_updated_at_column()` auto-sets `updated_at`
   - Unique constraint may reject if new content_hash duplicates another card

7. **Error Handling**
   - PostgreSQL error code `23505` → 409 "Updated content matches an existing card in this deck"
   - Other database errors → 500

8. **Response**
   - Return 200 with updated card object

---

### DELETE `/api/cards/{cardId}` Flow

1. **Authentication Check**
   - Extract user from `locals.supabase.auth.getUser()`
   - Return 401 if not authenticated

2. **Path Parameter Validation**
   - Validate `cardId` with `cardIdParamSchema`
   - Return 400 if not a valid UUID

3. **Service Layer Call**
   - Call `deleteCard(supabase, userId, cardId)`

4. **Database Deletion**
   - Execute: `DELETE FROM cards WHERE id = $1 AND user_id = $2 RETURNING id`
   - Returns true if rows affected > 0, false otherwise
   - RLS policy enforces user ownership

5. **Response**
   - If deleted: Return 204 No Content
   - If not deleted (card not found): Return 404 "Card not found"

6. **Error Handling**
   - Catch database errors → 500

---

## 6. Security Considerations

### Authentication & Authorization

**Mechanism:**
- Supabase Auth JWT-based sessions (httpOnly cookies preferred)
- All endpoints require valid authentication

**Authorization Enforcement:**
- **PostgreSQL RLS policies**: Primary defense layer
  - Policy `cards_is_owner` on `public.cards` table
  - `USING (user_id = auth.uid())` for reads
  - `WITH CHECK (user_id = auth.uid())` for writes
- **Application-level checks**: Secondary defense
  - All service functions explicitly filter by `user_id = userId`
  - Prevents any bypass even if RLS is misconfigured

**User ID Handling:**
- `user_id` is **always** server-derived from `auth.getUser()`
- **Never** accept `user_id` from client request bodies or query params
- Protects against horizontal privilege escalation

---

### Input Validation & Sanitization

**Field Validation:**
- Max lengths enforced by Zod schemas:
  - `front`: 2000 characters
  - `back`: 10000 characters
  - `tag`: 50 characters per tag
- Trim all text inputs to prevent leading/trailing whitespace attacks
- Reject empty strings after trimming

**Tag Normalization:**
- Convert to lowercase to prevent case-sensitivity exploits
- Deduplicate to prevent array bloat
- Limit total tag count (recommendation: max 20 tags per card)

**SQL Injection Protection:**
- Supabase client uses parameterized queries exclusively
- Never concatenate user input into SQL strings
- Content hash function is DB-side with parameterized inputs

---

### Content Hash Integrity

**Server-Side Computation:**
- `content_hash` is **always** computed server-side via `public.generate_content_hash(front, back)`
- Client cannot manipulate hash to bypass duplicate detection
- Hash computation must be deterministic and match DB normalization exactly

**Duplicate Detection:**
- Database unique constraint `uniq_deck_content_hash (deck_id, content_hash)` is final authority
- Prevents duplicates even if client bypasses API validation
- Error handling distinguishes between duplicate errors (409) and other constraint violations

---

### Cross-Entity Consistency

**Deck-Card User Consistency:**
- Database trigger `public.ensure_card_user_matches_deck()` enforces:
  - `cards.user_id` must match `decks.user_id` for the parent deck
  - Prevents cards being created in someone else's deck
  - Fires on INSERT and UPDATE

**Deck Ownership Verification:**
- Before creating a card, verify deck exists and is owned by user
- Use explicit query: `SELECT id FROM decks WHERE id = $1 AND user_id = $2`
- Return 404 (not 403) to avoid leaking deck existence to unauthorized users

---

### Rate Limiting

**Not implemented in MVP:**
- Card creation is not rate-limited (unlike AI generation)
- Consider adding rate limiting if abuse is detected
- Potential limit: 1000 cards created per user per day

---

### Data Exposure

**Query Result Filtering:**
- All database queries include `WHERE user_id = $userId`
- Pagination cursors are opaque (base64url-encoded) to prevent enumeration
- Error messages don't reveal existence of resources owned by other users

**Error Message Safety:**
- Generic 404 "Card not found" for both non-existent cards and unauthorized access
- Validation errors don't expose internal field names (use friendly names)
- Database error messages are sanitized (never expose raw SQL errors to client)

---

## 7. Error Handling

### Error Response Structure

All errors follow the standard API error format:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {} // optional
  }
}
```

---

### Error Scenarios by Endpoint

#### GET `/api/cards`

| Status | Code | Message | Cause | Mitigation |
|--------|------|---------|-------|------------|
| 400 | `invalid_input` | Invalid query parameters | Malformed UUID, invalid enum, out-of-range limit | Zod validation with detailed issues |
| 400 | `invalid_input` | Invalid pagination cursor | Corrupted or tampered cursor string | Cursor decode validation |
| 401 | `unauthorized` | Authentication required | Missing/expired JWT token | Auth guard at start of handler |
| 500 | `server_error` | An unexpected error occurred | Database connection failure, unhandled exception | Try-catch with console.error logging |

---

#### POST `/api/cards`

| Status | Code | Message | Cause | Mitigation |
|--------|------|---------|-------|------------|
| 400 | `invalid_input` | Invalid JSON in request body | Malformed JSON | Try-catch on `request.json()` |
| 400 | `invalid_input` | Invalid request body | Empty required fields, exceeds max length, invalid data types | Zod validation with detailed issues |
| 401 | `unauthorized` | Authentication required | Missing/expired JWT token | Auth guard at start of handler |
| 404 | `deck_not_found` | Deck not found | Deck doesn't exist or not owned by user | Pre-flight deck ownership check |
| 409 | `duplicate_in_deck` | A card with identical content already exists in this deck | Unique constraint violation on (deck_id, content_hash) | Catch PostgreSQL error code 23505 |
| 500 | `server_error` | Failed to compute content hash | DB function error, connection failure | Catch errors from DB function call |
| 500 | `server_error` | An unexpected error occurred | Database insert failure, unhandled exception | Generic catch-all with console.error |

---

#### GET `/api/cards/{cardId}`

| Status | Code | Message | Cause | Mitigation |
|--------|------|---------|-------|------------|
| 400 | `invalid_input` | Invalid card ID format | Non-UUID string in path | Zod UUID validation |
| 401 | `unauthorized` | Authentication required | Missing/expired JWT token | Auth guard at start of handler |
| 404 | `not_found` | Card not found | Card doesn't exist or not owned by user | Check for null from `getCardById()` |
| 500 | `server_error` | An unexpected error occurred | Database query failure | Generic catch-all |

---

#### PATCH `/api/cards/{cardId}`

| Status | Code | Message | Cause | Mitigation |
|--------|------|---------|-------|------------|
| 400 | `invalid_input` | Invalid card ID format | Non-UUID string in path | Zod UUID validation |
| 400 | `invalid_input` | Invalid JSON in request body | Malformed JSON | Try-catch on `request.json()` |
| 400 | `invalid_input` | At least one field must be provided for update | Empty request body | Zod refinement check |
| 400 | `invalid_input` | Invalid request body | Validation errors on provided fields | Zod validation with detailed issues |
| 401 | `unauthorized` | Authentication required | Missing/expired JWT token | Auth guard at start of handler |
| 404 | `not_found` | Card not found | Card doesn't exist or not owned by user | Check for null from `getCardById()` |
| 409 | `duplicate_in_deck` | Updated content matches an existing card in this deck | Unique constraint violation after content_hash recomputation | Catch PostgreSQL error code 23505 |
| 500 | `server_error` | An unexpected error occurred | Database update failure, content_hash computation failure | Generic catch-all |

---

#### DELETE `/api/cards/{cardId}`

| Status | Code | Message | Cause | Mitigation |
|--------|------|---------|-------|------------|
| 400 | `invalid_input` | Invalid card ID format | Non-UUID string in path | Zod UUID validation |
| 401 | `unauthorized` | Authentication required | Missing/expired JWT token | Auth guard at start of handler |
| 404 | `not_found` | Card not found | Card doesn't exist or not owned by user | Check for false from `deleteCard()` |
| 500 | `server_error` | An unexpected error occurred | Database deletion failure | Generic catch-all |

---

### Error Handling Best Practices

1. **Catch Order**
   - Handle `SyntaxError` (JSON parsing) before validation errors
   - Handle `ZodError` with detailed issues in response
   - Handle specific database errors (23505, 23503) before generic errors
   - Log unexpected errors with `console.error()` including context

2. **Error Context Logging**
   ```typescript
   console.error('[POST /api/cards] Unexpected error:', {
     userId: user.id,
     deckId: command.deck_id,
     error: error instanceof Error ? error.message : String(error),
   });
   ```

3. **Security-Conscious Messages**
   - Use generic "Card not found" (don't reveal "exists but unauthorized")
   - Don't expose SQL errors or stack traces to client
   - Include validation details in `details` field for 400 errors only

---

## 8. Performance Considerations

### Database Indexes

**Existing Indexes (per db-plan.md):**
- `idx_cards_user_id` (B-tree) - Critical for all user-scoped queries
- `idx_cards_deck_id` (B-tree) - Used for `deckId` filter
- `idx_cards_tags_gin` (GIN) - Used for tag array containment queries
- `uniq_deck_content_hash` (unique B-tree) - Enforces duplicates, used in lookups

**Query Performance:**
- `user_id` filter: Uses `idx_cards_user_id` (primary filter on all queries)
- `deck_id` filter: Uses `idx_cards_deck_id` (combined with user_id)
- Tag filter: Uses `idx_cards_tags_gin` with `tags @> ARRAY[...]` containment operator
- Search (`q`): Uses ILIKE (sequential scan) - **potential bottleneck for large datasets**

**Optimization Notes:**
- ILIKE search on `front`/`back` is not indexed in MVP
- For better search performance in the future:
  - Option 1: Add `pg_trgm` extension + GIN trigram indexes on `front` and `back`
  - Option 2: Add full-text search with `tsvector` column + GIN index
- Current approach is acceptable for MVP (< 10k cards per user)

---

### Pagination Strategy

**Cursor-Based Pagination:**
- Avoids deep offset performance issues (no `OFFSET N` scans)
- Stable results even when data changes between requests
- Cursor encodes `(sortValue, id)` for deterministic ordering

**Query Pattern:**
```sql
SELECT * FROM cards 
WHERE user_id = $1 
  AND (created_at < $cursor_created_at 
       OR (created_at = $cursor_created_at AND id < $cursor_id))
ORDER BY created_at DESC, id DESC
LIMIT 26; -- fetch limit + 1
```

**Performance Characteristics:**
- First page: Index-only scan on `idx_cards_user_id`
- Subsequent pages: Index scan with cursor filter (still efficient)
- Limit + 1 fetch minimizes round trips (hasMore detection)

---

### N+1 Query Prevention

**Current Design:**
- All operations fetch complete card objects in single queries
- No separate queries for related data (tags are denormalized in array)
- Deck ownership check on create is a single SELECT

**Future Considerations:**
- If adding card statistics (review count, success rate), use JOIN or CTE
- Avoid per-card loops for batch operations

---

### Tag Filtering Performance

**Array Containment Query:**
```sql
SELECT * FROM cards 
WHERE user_id = $1 
  AND tags @> ARRAY['biology', 'cell'];
```

**GIN Index Usage:**
- PostgreSQL GIN index on `tags` column supports `@>` (contains) operator
- Highly efficient for tag filtering (no sequential scan)
- Supports multi-tag AND filtering (card must have all specified tags)

**Tag Normalization:**
- Client-provided tags are normalized (lowercase, trimmed) before querying
- Ensures consistent matching with stored tags

---

### Content Hash Performance

**Server-Side Computation:**
- `SELECT public.generate_content_hash($front, $back)` is a lightweight function
- Uses PostgreSQL `digest()` function (built-in, optimized)
- Normalization step (regex, lowercase) is deterministic and fast
- Typical execution time: < 1ms

**Cache Considerations:**
- No caching layer in MVP (stateless API)
- Content hash is computed on every create/update with front/back changes
- For high-throughput scenarios, consider application-level caching of recently computed hashes

---

### Batch Operations (Future)

**Not in MVP:**
- Current API creates cards one-at-a-time
- `POST /cards:bulkCreate` endpoint exists in API plan (for accepting AI candidates)
- Bulk endpoint should use single transaction with `INSERT INTO ... VALUES (...), (...)` for efficiency

---

### Connection Pooling

**Supabase Client:**
- Uses built-in connection pooling via PostgREST
- No manual pool management required in Astro middleware
- Ensure `locals.supabase` is reused within request lifecycle (not recreated per service call)

---

### Monitoring & Bottleneck Detection

**Key Metrics to Track:**
- `GET /cards` response time (especially with `q` search parameter)
- `POST /cards` duplicate error rate (high rate may indicate poor UX or attack)
- `PATCH /cards` duplicate error rate (indicates frequent edit collisions)
- Database query execution time (via Supabase logs or `pg_stat_statements`)

**Potential Bottlenecks:**
- ILIKE search on large card sets (mitigate with trigram indexes if needed)
- Cursor decode failures (indicates client-side cursor tampering or bugs)
- High duplicate error rate on create (may need better client-side duplicate checking)

---

## 9. Implementation Steps

### Step 1: Create Validation Schemas (`src/lib/validation/cards.zod.ts`)

**Purpose:** Define Zod schemas for all card endpoint inputs.

**Tasks:**
1. Create `cardIdParamSchema` for UUID validation in path parameters
2. Create `listCardsQuerySchema` with:
   - Pagination params (limit, cursor, sort, order)
   - `deckId` (optional UUID)
   - `tag` and `tags` handling (normalize to array)
   - `q` (trim and validate max length)
   - `aiGenerated` (string to boolean conversion)
   - `includeDeleted` (string to boolean conversion)
3. Create `createCardSchema` with:
   - `deck_id` (required UUID)
   - `front` (required, trim, 1-2000 chars)
   - `back` (required, trim, 1-10000 chars)
   - `tags` (optional array, normalize each tag: lowercase, trim, max 50 chars, deduplicate)
   - `ai_generated` (required boolean)
4. Create `updateCardSchema` with:
   - All fields optional but at least one required (use `.refine()`)
   - `front`, `back`, `tags` with same validation as create
   - `deleted_at` (nullable ISO timestamp)
5. Export inferred types: `CardIdParam`, `ListCardsQuery`, `CreateCardBody`, `UpdateCardBody`

**Acceptance Criteria:**
- All schemas compile without TypeScript errors
- Schemas follow the pattern from `decks.zod.ts`
- Tag normalization deduplicates and lowercases
- Update schema rejects empty request bodies

---

### Step 2: Create Service Layer (`src/lib/services/cards.service.ts`)

**Purpose:** Encapsulate all database operations for cards.

**Tasks:**
1. Create `listCards(supabase, userId, query)`:
   - Build query with user_id filter
   - Apply optional filters: deckId, tags (GIN containment), q (ILIKE), aiGenerated, includeDeleted
   - Implement cursor pagination using `decodeCursor` and `extractCursor`
   - Apply ordering with tiebreaker
   - Fetch limit + 1 rows
   - Return `CardListResponseDto`

2. Create `createCard(supabase, userId, command)`:
   - Verify deck ownership: `SELECT id FROM decks WHERE id = $1 AND user_id = $2`
   - Throw error if deck not found
   - Call `SELECT public.generate_content_hash($front, $back)`
   - Insert card with computed content_hash and server-derived user_id
   - Return created `CardDto`

3. Create `getCardById(supabase, userId, cardId)`:
   - Query `SELECT * FROM cards WHERE id = $1 AND user_id = $2`
   - Use `.maybeSingle()`
   - Return `CardDto | null`

4. Create `updateCard(supabase, userId, cardId, command)`:
   - Fetch existing card via `getCardById()`
   - Return null if not found
   - If `front` or `back` in command:
     - Determine final front/back (merge with existing)
     - Call `generate_content_hash()`
     - Add computed hash to update object
   - Execute `UPDATE cards SET ... WHERE id = $1 AND user_id = $2`
   - Return updated `CardDto | null`

5. Create `deleteCard(supabase, userId, cardId)`:
   - Execute `DELETE FROM cards WHERE id = $1 AND user_id = $2 RETURNING id`
   - Return `boolean` (true if deleted, false if not found)

**Acceptance Criteria:**
- All functions use `SupabaseClient` type from `src/db/supabase.client.ts`
- All functions include explicit `user_id` filtering for security
- Content hash computation errors are thrown (not silently ignored)
- Service functions don't catch errors (let caller handle)
- Code follows patterns from `decks.service.ts`

---

### Step 3: Create GET `/api/cards` Endpoint

**File:** `src/pages/api/cards/index.ts`

**Tasks:**
1. Implement `GET` handler:
   - Auth guard: `locals.supabase.auth.getUser()`
   - Parse query params: `Object.fromEntries(url.searchParams.entries())`
   - Validate with `listCardsQuerySchema`
   - Call `listCards(supabase, userId, validatedQuery)`
   - Return 200 with result using `jsonOk()`
2. Error handling:
   - Catch `ZodError` → 400 with details
   - Catch cursor errors → 400 "Invalid pagination cursor"
   - Catch other errors → 500 with console.error

**Acceptance Criteria:**
- Handler follows pattern from `decks/index.ts`
- Includes JSDoc comments explaining query params and responses
- All error paths return appropriate status codes
- No error leaks sensitive information

---

### Step 4: Create POST `/api/cards` Endpoint

**File:** `src/pages/api/cards/index.ts` (same file, add `POST` export)

**Tasks:**
1. Implement `POST` handler:
   - Auth guard
   - Parse JSON body with try-catch for `SyntaxError`
   - Validate with `createCardSchema`
   - Call `createCard(supabase, userId, validatedCommand)`
   - Return 201 with created card using `jsonOk(card, 201)`
2. Error handling:
   - Catch `SyntaxError` → 400 "Invalid JSON in request body"
   - Catch `ZodError` → 400 with details
   - Catch PostgreSQL 23505 (unique_violation) → 409 "A card with identical content already exists in this deck"
   - Catch PostgreSQL 23503 (foreign_key_violation) → 404 "Deck not found"
   - Catch deck ownership check errors → 404 "Deck not found"
   - Catch other errors → 500 with console.error

**Acceptance Criteria:**
- Handler distinguishes between duplicate errors and other constraint violations
- Deck ownership is verified before attempting insert
- User ID is server-derived, never from request body
- Error messages are user-friendly

---

### Step 5: Create Single Card Endpoints

**File:** `src/pages/api/cards/[cardId].ts`

**Tasks:**
1. Implement `GET` handler:
   - Auth guard
   - Validate `cardId` path parameter with `cardIdParamSchema`
   - Call `getCardById(supabase, userId, cardId)`
   - Return 200 with card or 404 if null

2. Implement `PATCH` handler:
   - Auth guard
   - Validate `cardId` path parameter
   - Parse and validate JSON body with `updateCardSchema`
   - Call `updateCard(supabase, userId, cardId, validatedCommand)`
   - Return 200 with updated card or 404 if null
   - Error handling:
     - Catch PostgreSQL 23505 → 409 "Updated content matches an existing card in this deck"
     - Catch other errors → 500

3. Implement `DELETE` handler:
   - Auth guard
   - Validate `cardId` path parameter
   - Call `deleteCard(supabase, userId, cardId)`
   - Return 204 No Content if deleted, 404 if not found

**Acceptance Criteria:**
- All handlers validate UUID format before querying
- Follows pattern from `decks/[deckId].ts`
- Includes JSDoc comments for each handler
- Update handler correctly recomputes content_hash when needed

---

### Step 6: Error Response Helpers (if needed)

**File:** `src/lib/http/api-response.ts` (extend existing)

**Tasks:**
1. Add `ApiErrors.deckNotFound()` helper:
   ```typescript
   deckNotFound: (message = 'Deck not found') =>
     jsonError(404, 'deck_not_found', message),
   ```

2. Add `ApiErrors.duplicate()` helper:
   ```typescript
   duplicate: (message: string) =>
     jsonError(409, 'duplicate_in_deck', message),
   ```

**Acceptance Criteria:**
- New helpers follow existing pattern
- Error codes match API plan

---

### Step 7: Testing Checklist

**Manual Testing:**
1. **GET `/api/cards`:**
   - [ ] Returns empty list for new user
   - [ ] Pagination works (returns correct nextCursor)
   - [ ] Filter by deckId works
   - [ ] Filter by single tag works
   - [ ] Filter by multiple tags works (AND logic)
   - [ ] Search with `q` parameter works
   - [ ] Filter by aiGenerated works
   - [ ] includeDeleted=false excludes soft-deleted cards
   - [ ] Invalid cursor returns 400
   - [ ] Unauthenticated request returns 401

2. **POST `/api/cards`:**
   - [ ] Creates card with all fields
   - [ ] Creates card with minimal fields (omit tags)
   - [ ] Returns 400 for missing required fields
   - [ ] Returns 400 for empty front/back after trim
   - [ ] Returns 400 for exceeding max lengths
   - [ ] Returns 404 for non-existent deck
   - [ ] Returns 409 for duplicate content in same deck
   - [ ] Allows duplicate content in different decks
   - [ ] Tags are normalized (lowercase, deduplicated)

3. **GET `/api/cards/{cardId}`:**
   - [ ] Returns card for valid ID
   - [ ] Returns 404 for non-existent card
   - [ ] Returns 404 for card owned by different user
   - [ ] Returns 400 for invalid UUID format

4. **PATCH `/api/cards/{cardId}`:**
   - [ ] Updates single field (name only)
   - [ ] Updates multiple fields
   - [ ] Updates front/back and recomputes content_hash
   - [ ] Returns 409 if updated content duplicates another card
   - [ ] Soft-deletes card with deleted_at timestamp
   - [ ] Restores soft-deleted card with deleted_at=null
   - [ ] Returns 400 for empty request body

5. **DELETE `/api/cards/{cardId}`:**
   - [ ] Deletes card and returns 204
   - [ ] Returns 404 for already-deleted card
   - [ ] Returns 404 for card owned by different user

**Database Verification:**
- [ ] Check that `content_hash` matches `public.generate_content_hash(front, back)`
- [ ] Verify unique constraint prevents duplicate (deck_id, content_hash)
- [ ] Verify trigger `ensure_card_user_matches_deck()` prevents mismatched user_id
- [ ] Verify `updated_at` is auto-updated on PATCH

**Performance Testing:**
- [ ] GET `/api/cards` with 1000+ cards completes in < 200ms
- [ ] Tag filter query uses `idx_cards_tags_gin` (check with EXPLAIN ANALYZE)
- [ ] Search with `q` completes in < 500ms for 1000+ cards (acceptable for MVP)

---

### Step 8: Documentation Updates

**Tasks:**
1. Update project README if needed (mention cards endpoint)
2. Add inline code comments explaining complex logic:
   - Tag normalization in validation
   - Content hash recomputation logic in update service
   - Cursor pagination filter construction
3. Document any deviations from API plan (if applicable)

**Acceptance Criteria:**
- Code is self-documenting with JSDoc and inline comments
- Complex queries have explanatory comments
- Future optimization notes are documented (e.g., "TODO: Add pg_trgm for search")

---

### Step 9: Linting & Type Checking

**Tasks:**
1. Run `npm run lint` and fix all errors
2. Run TypeScript compiler to verify no type errors
3. Ensure all imports use correct types:
   - `SupabaseClient` from `src/db/supabase.client.ts`
   - DTOs from `src/types.ts`
   - Validation types from `src/lib/validation/cards.zod.ts`

**Acceptance Criteria:**
- No linting errors
- No TypeScript compilation errors
- All files follow project coding standards

---

### Step 10: Final Review

**Checklist:**
- [ ] All endpoints implemented per API plan
- [ ] All validation schemas enforce correct constraints
- [ ] Service layer follows established patterns
- [ ] Error handling is comprehensive and secure
- [ ] Security best practices followed (user_id server-derived, RLS enforced)
- [ ] Performance considerations addressed (indexes used correctly)
- [ ] Code is maintainable and well-commented
- [ ] Manual testing completed successfully

---

## Appendix: PostgreSQL Error Codes Reference

| Code | Name | Description | API Response |
|------|------|-------------|--------------|
| 23505 | unique_violation | Unique constraint violated (duplicate content_hash) | 409 duplicate_in_deck |
| 23503 | foreign_key_violation | Foreign key constraint violated (invalid deck_id) | 404 deck_not_found |
| 23514 | check_violation | Check constraint violated | 400 invalid_input |

**Usage in error handling:**
```typescript
if (error.code === '23505') {
  return ApiErrors.duplicate('A card with identical content already exists in this deck');
}
if (error.code === '23503') {
  return ApiErrors.deckNotFound();
}
```

---

## Appendix: Tag Normalization Algorithm

**Implementation:**
```typescript
function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
    )
  );
}
```

**Example:**
```typescript
normalizeTags(['Biology', ' CELL ', 'biology', 'Cell'])
// Returns: ['biology', 'cell']
```

**Rationale:**
- **Lowercase:** Ensures case-insensitive tag matching and GIN index efficiency
- **Trim:** Removes leading/trailing whitespace that could break matching
- **Deduplicate:** Prevents redundant tags and array bloat
- **Filter empty:** Rejects tags that are only whitespace

---

## Appendix: Content Hash Normalization

**Database Function (already implemented per db-plan.md):**
```sql
CREATE OR REPLACE FUNCTION public.generate_content_hash(front TEXT, back TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := lower(
    regexp_replace(coalesce(front,''), '\s+', ' ', 'g') 
    || '||' || 
    regexp_replace(coalesce(back,''), '\s+', ' ', 'g')
  );
  RETURN encode(digest(normalized, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Normalization Steps:**
1. Coalesce null to empty string
2. Collapse multiple whitespace to single space (regex `\s+` → ` `)
3. Convert to lowercase
4. Concatenate with `||` delimiter
5. SHA256 hash
6. Hex encode

**Example:**
```sql
SELECT public.generate_content_hash('What is   DNA?', 'Deoxyribonucleic Acid');
-- Returns: 'a3f8b9c2e1d4f7a0b3c6e9f2a5b8c1d4e7f0a3b6c9e2f5a8b1c4d7e0f3a6b9'
```

**Consistency Requirements:**
- Application-side preview hashing (if implemented) must match this normalization exactly
- Do not trim front/back before hashing (only collapse internal whitespace)
- Do not change delimiter (`||`) without migrating existing hashes

---

End of implementation plan.
