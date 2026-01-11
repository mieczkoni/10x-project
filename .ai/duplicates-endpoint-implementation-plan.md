# API Endpoint Implementation Plan: POST `/cards/duplicates:check`

## 1. Endpoint Overview

This endpoint provides a non-blocking duplicate detection mechanism for card creation UX. Before a user saves a new card, the frontend can check if an identical card (based on normalized content) already exists in the target deck. This allows displaying a warning to the user without blocking the save operation.

The endpoint:
- Computes a content hash using the same normalization as card creation (`public.generate_content_hash`)
- Queries for existing cards with matching content in the specified deck
- Returns the hash, duplicate status, and preview of the duplicate card (if found)
- Enforces deck ownership verification for security
- Always returns HTTP 200 on success, even when duplicates are found (duplicate status is in the response body)

## 2. Request Details

### HTTP Method
POST

### URL Structure
`/api/cards/duplicates:check`

### Authentication
- **Required**: Yes
- **Method**: Supabase Auth via JWT (extracted from `context.locals.supabase`)
- **User ID Source**: Server-derived from `auth.uid()` via RLS policies

### Parameters

**Required (all in request body)**:
- `deck_id` (string, UUID) - The target deck to check for duplicates
- `front` (string, 1-2000 chars) - The front content of the potential card
- `back` (string, 1-10000 chars) - The back content of the potential card

**Optional**: None

### Request Body Example

```json
{
  "deck_id": "550e8400-e29b-41d4-a716-446655440000",
  "front": "What is TypeScript?",
  "back": "TypeScript is a strongly typed programming language that builds on JavaScript."
}
```

### Content-Type
`application/json`

## 3. Used Types

### From `src/types.ts` (already defined)

**Command Model**:
```typescript
export type CheckCardDuplicateCommand = Pick<CreateCardCommand, "deck_id" | "front" | "back">
```

**Response DTO**:
```typescript
export type CheckCardDuplicateResponseDto = {
  content_hash: CardEntity["content_hash"]
  isDuplicate: boolean
  duplicateCard: DuplicateCardPreviewDto | null
}

export type DuplicateCardPreviewDto = Pick<CardDto, "id" | "front" | "back">
```

### New Validation Schema (to be created in `src/lib/validation/cards.zod.ts`)

```typescript
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

export type CheckCardDuplicateBody = z.infer<typeof checkCardDuplicateSchema>;
```

## 4. Response Details

### Success Response (200 OK)

#### When NO duplicate exists:
```json
{
  "content_hash": "a3f2c8b1e4d9f7c2a1b3e5d8c9f1a2b4c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
  "isDuplicate": false,
  "duplicateCard": null
}
```

#### When duplicate exists:
```json
{
  "content_hash": "a3f2c8b1e4d9f7c2a1b3e5d8c9f1a2b4c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
  "isDuplicate": true,
  "duplicateCard": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "front": "What is TypeScript?",
    "back": "TypeScript is a strongly typed programming language that builds on JavaScript."
  }
}
```

### Error Responses

| Status | Error Code | Description | Example Message |
|--------|------------|-------------|-----------------|
| 400 | `invalid_input` | Request body validation failed | "Invalid deck ID format" |
| 401 | `unauthorized` | Missing or invalid authentication | "Authentication required" |
| 404 | `deck_not_found` | Deck doesn't exist or not owned by user | "Deck not found" |
| 500 | `server_error` | Database or hash computation failure | "Failed to check for duplicates" |

### Error Response Structure
```json
{
  "error": {
    "code": "deck_not_found",
    "message": "Deck not found",
    "details": {}
  }
}
```

## 5. Data Flow

### High-Level Flow
```
1. Client sends POST request with deck_id, front, back
2. Astro middleware authenticates request
3. Route handler validates request body with Zod
4. Service layer verifies deck ownership
5. Service computes content hash via DB function
6. Service queries for existing card with same deck_id + content_hash
7. Service constructs response with hash, duplicate status, and optional card preview
8. Route handler returns 200 with response DTO
```

### Detailed Service Layer Logic

```typescript
async function checkCardDuplicate(
  supabase: SupabaseClient,
  userId: UserId,
  command: CheckCardDuplicateCommand
): Promise<CheckCardDuplicateResponseDto>
```

**Steps**:

1. **Verify Deck Ownership**
   ```sql
   SELECT id FROM public.decks 
   WHERE id = $deck_id AND user_id = $userId AND deleted_at IS NULL
   ```
   - If not found, throw `DECK_NOT_FOUND` error (converts to 404)
   - Security: Don't reveal whether deck exists vs. not owned

2. **Compute Content Hash**
   - Call existing `computeContentHash(supabase, front, back)` helper
   - This invokes `public.generate_content_hash` RPC
   - Returns normalized SHA256 hash

3. **Query for Duplicate**
   ```sql
   SELECT id, front, back FROM public.cards
   WHERE deck_id = $deck_id 
     AND content_hash = $computed_hash
     AND user_id = $userId
     AND deleted_at IS NULL
   LIMIT 1
   ```
   - RLS policies automatically filter by `user_id = auth.uid()`
   - Only returns cards owned by authenticated user
   - Uses unique index `uniq_deck_content_hash` for fast lookup
   - Excludes soft-deleted cards

4. **Construct Response**
   ```typescript
   return {
     content_hash: computedHash,
     isDuplicate: duplicateCard !== null,
     duplicateCard: duplicateCard 
       ? { id: duplicateCard.id, front: duplicateCard.front, back: duplicateCard.back }
       : null
   }
   ```

### Database Interactions

- **Tables Accessed**: `public.decks`, `public.cards`
- **Indexes Used**:
  - `idx_decks_user_id` (deck ownership check)
  - `uniq_deck_content_hash` (duplicate lookup)
- **RLS Policies Applied**: `cards_is_owner`, `decks_is_owner`
- **Functions Called**: `public.generate_content_hash(front, back)`

## 6. Security Considerations

### Authentication & Authorization
1. **Authentication Requirement**
   - Middleware enforces valid Supabase Auth JWT
   - Returns 401 if `context.locals.supabase` is not authenticated

2. **Deck Ownership Verification**
   - Service explicitly checks deck belongs to authenticated user
   - Returns 404 for both "deck not found" and "deck not owned" to prevent existence probing

3. **RLS Policy Enforcement**
   - Database-level RLS ensures duplicate query only accesses user's own cards
   - Even if application logic fails, database prevents cross-user data access

### Input Validation & Sanitization
1. **Schema Validation**
   - Zod schema enforces UUID format for `deck_id`
   - Trim and validate length for `front` (1-2000) and `back` (1-10000)
   - Prevents injection attacks via Supabase's parameterized queries

2. **Content Hash Computation**
   - Always computed server-side (never trusted from client)
   - Uses database function for consistency with card creation

### Data Exposure
1. **Duplicate Card Preview**
   - Only returns preview if card belongs to user (enforced by RLS)
   - No risk of exposing other users' content

2. **Error Messages**
   - Generic "Deck not found" for both non-existent and unauthorized decks
   - No PII or sensitive details in error responses

### Rate Limiting
- **Recommendation**: Implement rate limiting at middleware/reverse proxy level
- **Rationale**: Prevents abuse of hash computation (CPU-intensive operation)
- **Suggested Limit**: 100 requests per user per minute

### Potential Threats & Mitigations

| Threat | Mitigation |
|--------|------------|
| Unauthorized deck probing | Return 404 for both "not found" and "not owned" |
| SQL injection | Supabase parameterized queries |
| Content hash manipulation | Server-side computation only |
| Cross-user data access | RLS policies + ownership checks |
| DoS via large inputs | Max length validation (2000/10000 chars) |

## 7. Error Handling

### Error Flow Pattern
```typescript
// 1. Early return for authentication
if (!userId) {
  return ApiErrors.unauthorized();
}

// 2. Validate input with Zod
const parseResult = checkCardDuplicateSchema.safeParse(body);
if (!parseResult.success) {
  return ApiErrors.invalidInput(
    parseResult.error.errors[0].message,
    { validation: parseResult.error.format() }
  );
}

// 3. Call service with try-catch
try {
  const result = await checkCardDuplicate(supabase, userId, parseResult.data);
  return jsonOk(result);
} catch (error) {
  // Handle specific error types
  if (error.message === 'DECK_NOT_FOUND') {
    return ApiErrors.deckNotFound();
  }
  // Generic server error for unexpected failures
  return ApiErrors.serverError('Failed to check for duplicates');
}
```

### Specific Error Scenarios

1. **401 Unauthorized**
   - **Trigger**: `context.locals.supabase` is not authenticated
   - **Handler**: Return early from route handler before service call
   - **Response**: `ApiErrors.unauthorized()`

2. **400 Invalid Input**
   - **Trigger**: Zod validation fails (invalid UUID, empty strings, too long)
   - **Handler**: Catch `safeParse` failure, extract first error message
   - **Response**: `ApiErrors.invalidInput(message, { validation: details })`

3. **404 Deck Not Found**
   - **Trigger**: Service throws `DECK_NOT_FOUND` error
   - **Handler**: Catch error in route handler
   - **Response**: `ApiErrors.deckNotFound()`
   - **Note**: Same response for "deck doesn't exist" and "deck not owned by user"

4. **500 Server Error - Hash Computation Failure**
   - **Trigger**: `computeContentHash` throws error (DB function failure)
   - **Handler**: Catch generic error in service, re-throw with context
   - **Response**: `ApiErrors.serverError('Failed to check for duplicates')`
   - **Logging**: Log full error details server-side (not exposed to client)

5. **500 Server Error - Database Query Failure**
   - **Trigger**: Supabase query throws unexpected error
   - **Handler**: Catch generic error in route handler
   - **Response**: `ApiErrors.serverError('Failed to check for duplicates')`
   - **Logging**: Log full error details server-side

### Error Logging Strategy
- **Application Errors**: Log to console with context (user ID, deck ID, error message)
- **Database Errors**: Log full Supabase error object for debugging
- **Sensitive Data**: Never log card content (front/back) - only IDs
- **Event Logging**: No telemetry events for this endpoint (it's a read-only check)

## 8. Performance Considerations

### Database Query Optimization
1. **Deck Ownership Check**
   - Uses `idx_decks_user_id` B-tree index
   - Fast lookup by compound (user_id, deck_id)

2. **Duplicate Lookup**
   - Uses `uniq_deck_content_hash` unique constraint index
   - Extremely fast lookup by (deck_id, content_hash)
   - Query is essentially an indexed equality check

3. **RLS Policy Impact**
   - Adds `user_id = auth.uid()` filter to queries
   - Index already covers this filter
   - Minimal performance overhead

### Content Hash Computation
- **Operation**: SHA256 hash via `pgcrypto` extension
- **Cost**: O(n) where n = length of (front + back)
- **Max Input**: 2000 + 10000 = 12,000 characters
- **Mitigation**: Input length validation prevents abuse

### Expected Response Times
- **Typical Case**: < 50ms (2 indexed queries + 1 RPC call)
- **Worst Case**: < 200ms (with network latency)

### Caching Strategy
- **Not Recommended**: Content hash changes with every front/back combination
- **Client-Side**: Frontend can cache result for same input during user session
- **Server-Side**: No benefit due to unique inputs per request

### Bottlenecks & Monitoring
1. **Hash Computation**
   - Monitor average RPC call duration
   - Alert if > 100ms (indicates DB overload)

2. **Database Connection Pool**
   - Monitor connection usage
   - Ensure Supabase connection pooling is configured

3. **Rate of Requests**
   - Monitor endpoint usage per user
   - Implement rate limiting if abuse detected

## 9. Implementation Steps

### Step 1: Add Zod Validation Schema
**File**: `src/lib/validation/cards.zod.ts`

1. Add the `checkCardDuplicateSchema` after `updateCardSchema`:

```typescript
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
```

2. Export the inferred type:

```typescript
export type CheckCardDuplicateBody = z.infer<typeof checkCardDuplicateSchema>;
```

### Step 2: Add Service Layer Function
**File**: `src/lib/services/cards.service.ts`

1. Import additional types at the top:

```typescript
import type {
  CheckCardDuplicateCommand,
  CheckCardDuplicateResponseDto,
  DuplicateCardPreviewDto,
} from '../../types';
```

2. Add the service function after `createCard`:

```typescript
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
    .from('decks')
    .select('id')
    .eq('id', command.deck_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (deckError) {
    throw new Error(`Failed to verify deck: ${deckError.message}`);
  }

  if (!deck) {
    // Don't reveal whether deck exists to unauthorized users
    throw new Error('DECK_NOT_FOUND');
  }

  // Step 2: Compute content hash using server-side function
  const contentHash = await computeContentHash(supabase, command.front, command.back);

  // Step 3: Query for duplicate card
  const { data: duplicateCard, error: queryError } = await supabase
    .from('cards')
    .select('id, front, back')
    .eq('deck_id', command.deck_id)
    .eq('content_hash', contentHash)
    .eq('user_id', userId)
    .is('deleted_at', null)
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
```

### Step 3: Create API Route Handler
**File**: `src/pages/api/cards/duplicates/check.ts`

Create the new route file with the following content:

```typescript
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

import type { APIRoute } from 'astro';
import { checkCardDuplicateSchema } from '../../../../lib/validation/cards.zod';
import { checkCardDuplicate } from '../../../../lib/services/cards.service';
import { jsonOk, ApiErrors } from '../../../../lib/http/api-response';

export const POST: APIRoute = async ({ request, locals }) => {
  // Step 1: Verify authentication
  const { data: { user } } = await locals.supabase.auth.getUser();
  
  if (!user) {
    return ApiErrors.unauthorized();
  }

  // Step 2: Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiErrors.invalidInput('Invalid JSON in request body');
  }

  const parseResult = checkCardDuplicateSchema.safeParse(body);
  
  if (!parseResult.success) {
    return ApiErrors.invalidInput(
      parseResult.error.errors[0].message,
      { validation: parseResult.error.format() }
    );
  }

  // Step 3: Check for duplicate via service layer
  try {
    const result = await checkCardDuplicate(
      locals.supabase,
      user.id,
      parseResult.data
    );

    return jsonOk(result);
  } catch (error) {
    // Handle specific known errors
    if (error instanceof Error) {
      if (error.message === 'DECK_NOT_FOUND') {
        return ApiErrors.deckNotFound();
      }
      
      // Log unexpected errors for debugging (don't expose details to client)
      console.error('Error checking card duplicate:', {
        userId: user.id,
        deckId: parseResult.data.deck_id,
        error: error.message,
      });
    }

    return ApiErrors.serverError('Failed to check for duplicates');
  }
};
```

### Step 4: Test the Endpoint

**Manual Testing with curl**:

1. **Test successful duplicate check (no duplicate)**:
```bash
curl -X POST http://localhost:4321/api/cards/duplicates/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "deck_id": "550e8400-e29b-41d4-a716-446655440000",
    "front": "What is TypeScript?",
    "back": "A strongly typed programming language."
  }'
```

Expected: 200 with `isDuplicate: false`

2. **Test duplicate found**:
- First create a card, then check with same content
- Expected: 200 with `isDuplicate: true` and card preview

3. **Test validation errors**:
```bash
# Invalid deck_id format
curl -X POST http://localhost:4321/api/cards/duplicates/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"deck_id": "invalid", "front": "test", "back": "test"}'
```

Expected: 400 with validation error

4. **Test deck not found**:
```bash
# Non-existent deck_id
curl -X POST http://localhost:4321/api/cards/duplicates/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "deck_id": "00000000-0000-0000-0000-000000000000",
    "front": "test",
    "back": "test"
  }'
```

Expected: 404 with `deck_not_found` error

5. **Test unauthorized**:
```bash
curl -X POST http://localhost:4321/api/cards/duplicates/check \
  -H "Content-Type: application/json" \
  -d '{"deck_id": "550e8400-e29b-41d4-a716-446655440000", "front": "test", "back": "test"}'
```

Expected: 401 unauthorized

### Step 5: Integration Testing

**Test Cases**:
1. ✅ Returns 401 when not authenticated
2. ✅ Returns 400 when deck_id is not a valid UUID
3. ✅ Returns 400 when front is empty or too long
4. ✅ Returns 400 when back is empty or too long
5. ✅ Returns 404 when deck doesn't exist
6. ✅ Returns 404 when deck belongs to another user
7. ✅ Returns 200 with isDuplicate: false when no duplicate exists
8. ✅ Returns 200 with isDuplicate: true when duplicate exists
9. ✅ Returns correct duplicate card preview with id, front, back
10. ✅ Excludes soft-deleted cards from duplicate detection
11. ✅ Computes same content_hash as card creation endpoint

### Step 6: Update API Documentation

**File**: `.ai/api-plan.md`

Ensure the existing documentation at lines 202-224 matches implementation. No changes needed if already accurate.

### Step 7: Type Safety Verification

Run TypeScript compiler to verify:
```bash
npm run build
```

Ensure no type errors related to:
- `CheckCardDuplicateCommand`
- `CheckCardDuplicateResponseDto`
- `checkCardDuplicateSchema`
- Service function signature

### Step 8: Linter Checks

Run ESLint to verify code quality:
```bash
npm run lint
```

Fix any issues related to:
- Unused imports
- Inconsistent formatting
- Missing error handling

---

## Implementation Checklist

- [ ] Add `checkCardDuplicateSchema` to `cards.zod.ts`
- [ ] Export `CheckCardDuplicateBody` type
- [ ] Add `checkCardDuplicate` function to `cards.service.ts`
- [ ] Import required types in service file
- [ ] Create route file `src/pages/api/cards/duplicates/check.ts`
- [ ] Test authentication (401)
- [ ] Test validation (400)
- [ ] Test deck not found (404)
- [ ] Test no duplicate (200, isDuplicate: false)
- [ ] Test duplicate found (200, isDuplicate: true)
- [ ] Test soft-deleted cards excluded
- [ ] Run TypeScript compiler
- [ ] Run linter
- [ ] Verify RLS policies work correctly
- [ ] Document any deviations from plan

---

## Notes

1. **Astro Route Path**: The endpoint POST `/cards/duplicates:check` uses a colon in the URL, which is a common REST API convention for collection actions. In Astro's file-based routing, this maps to `src/pages/api/cards/duplicates/check.ts` (the `:check` is represented as `check.ts` file in a `duplicates` directory).

2. **Content Hash Consistency**: The `computeContentHash` helper in `cards.service.ts` already exists and uses `public.generate_content_hash`. This ensures 100% consistency with card creation duplicate detection.

3. **RLS Security Layer**: Even if the service layer has a bug, Supabase RLS policies prevent cross-user data access. The duplicate query will only ever return cards owned by the authenticated user.

4. **Soft-Delete Handling**: The endpoint explicitly filters `deleted_at IS NULL` to avoid false positives from cards the user has soft-deleted.

5. **Error Message Consistency**: Using the same "Deck not found" message for both non-existent and unauthorized decks prevents attackers from probing which decks exist in the system.

6. **No Event Logging**: This endpoint doesn't create `events` table entries since it's a read-only UX helper, not a user action. If analytics are needed later, consider logging `duplicate_check` events.
