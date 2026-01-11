### API Endpoint Implementation Plan: Decks (`/decks`, `/decks/{deckId}`)

This plan covers implementing the **Decks** resource endpoints described in `.ai/api-plan.md` (GET/POST `/decks`, GET/PATCH/DELETE `/decks/{deckId}`) using **Astro 5 server endpoints**, **Supabase**, **TypeScript**, and **Zod**.

---

## 1. Endpoint Overview

Deck endpoints allow an authenticated user to **list**, **create**, **read**, **update**, and **hard-delete** their decks.

- **Ownership model**: Deck rows are owned by `user_id = auth.uid()` (enforced by Postgres RLS).
- **Soft-delete flag**: `deleted_at` exists for UX filtering only; **DELETE** is a **hard delete** (DB cascade deletes related cards).
- **Search**: optional `q` searches deck `name` and `description` using case-insensitive matching (ILIKE).
- **Pagination**: cursor-based pagination is recommended (implementation details below).

Endpoints:
- **GET** `/decks` → list current user’s decks
- **POST** `/decks` → create a deck for current user
- **GET** `/decks/{deckId}` → fetch a single deck (must belong to user)
- **PATCH** `/decks/{deckId}` → update fields (including `deleted_at` for UX)
- **DELETE** `/decks/{deckId}` → hard-delete deck (cascades cards)

---

## 2. Request Details

### 2.1 Authentication

All endpoints require an authenticated Supabase user session.

- **If not authenticated**: return **401** with `ApiErrorResponseDto`.
- Implementation rule: use **`context.locals.supabase`** in Astro endpoints (do not import a global client).

### 2.2 GET `/decks`

- **Method**: GET
- **URL**: `/api/decks` (Astro file path will map this; see Implementation Steps)
- **Query params** (from `ListDecksQueryDto`):
  - **Optional**
    - `q?: string` — search in `name`/`description` (ILIKE)
    - `includeDeleted?: boolean` — default `false`; if `false`, filter `deleted_at IS NULL`
    - Pagination params (`PaginationQueryDto`):
      - `limit?: number`
      - `cursor?: string`
      - `sort?: string`
      - `order?: "asc" | "desc"`

**Validation rules (recommended)**:
- `limit`: integer, min 1, max 100 (pick a safe cap; 25 default from plan)
- `cursor`: string (opaque), optional
- `sort`: allowlist only (recommended: `"created_at"` or `"updated_at"`; default `"created_at"`)
- `order`: `"asc" | "desc"` (default `"desc"`)
- `q`: trim, 0–200 chars; treat empty string as undefined
- `includeDeleted`: parse from query string to boolean

### 2.3 POST `/decks`

- **Method**: POST
- **URL**: `/api/decks`
- **Body**: `CreateDeckCommand` (`{ name: string, description: string | null }`)

**Validation rules (recommended)**:
- `name`: required, trimmed, min 1, max 120
- `description`: nullable; if string, trimmed, max 2000
- Do **not** accept `user_id` from client (server derives it from auth).

### 2.4 GET `/decks/{deckId}`

- **Method**: GET
- **URL**: `/api/decks/{deckId}`
- **Path params**:
  - **Required**: `deckId` must be a UUID string

### 2.5 PATCH `/decks/{deckId}`

- **Method**: PATCH
- **URL**: `/api/decks/{deckId}`
- **Path params**:
  - **Required**: `deckId` UUID
- **Body**: `UpdateDeckCommand` (`Partial<{ name, description, deleted_at }>` per `src/types.ts`)

**Validation rules (recommended)**:
- Require at least one updatable field present (`name` or `description` or `deleted_at`)
- `name`: if provided, trimmed, min 1, max 120
- `description`: if provided, `string | null`, trimmed, max 2000
- `deleted_at`: if provided, `string | null`
  - If string: must be a valid ISO timestamp
  - If null: “restore” behavior (UX)

Note: DB plan indicates `updated_at` is maintained via DB trigger `public.update_updated_at_column()`.

### 2.6 DELETE `/decks/{deckId}`

- **Method**: DELETE
- **URL**: `/api/decks/{deckId}`
- **Path params**:
  - **Required**: `deckId` UUID
- **Body**: none

Hard-delete deck and rely on DB FK `cards.deck_id ON DELETE CASCADE`.

---

## 3. Used Types

From `src/types.ts`:
- **Queries**
  - `ListDecksQueryDto`
  - `PaginationQueryDto`
- **DTOs**
  - `DeckDto` (DB row shape)
  - `DeckListResponseDto` (`ListResponseDto<DeckDto>`)
  - `NoContentDto` (for 204)
  - `ApiErrorResponseDto` (error envelope)
- **Commands**
  - `CreateDeckCommand`
  - `UpdateDeckCommand`

From DB schema (`.ai/db-plan.md`):
- Table `public.decks` with fields: `id`, `user_id`, `name`, `description`, `created_at`, `updated_at`, `deleted_at`
- RLS policy: `user_id = auth.uid()` for all operations

---

## 4. Response Details

### 4.1 Success responses

#### GET `/decks` → 200

- Body: `DeckListResponseDto`
  - `data`: array of `DeckDto`
  - `page`: `{ limit, nextCursor }`

`nextCursor` should be `null` when there is no next page.

#### POST `/decks` → 201

- Body: `DeckDto` of the created deck

#### GET `/decks/{deckId}` → 200

- Body: `DeckDto`

#### PATCH `/decks/{deckId}` → 200

- Body: updated `DeckDto`

#### DELETE `/decks/{deckId}` → 204

- No body (`NoContentDto` / empty response)

### 4.2 Error responses

All errors should return `ApiErrorResponseDto` except 204.

- **400**: invalid_input (invalid query/body/path param)
- **401**: unauthorized (no valid session)
- **404**: not_found (deck not found for user)
- **500**: server_error (unexpected failure / DB error not attributable to user input)

---

## 5. Data Flow

### 5.1 High-level flow (all endpoints)

1. **Astro endpoint handler** receives request.
2. Parse/validate inputs with **Zod**:
   - query params (GET list)
   - path params (`deckId`)
   - JSON body (POST/PATCH)
3. **Authenticate** using `context.locals.supabase`:
   - call `supabase.auth.getUser()` (or equivalent) to ensure user exists
4. Call a **service layer** in `src/lib/services/decks.service.ts`:
   - service receives `supabase` client + validated inputs + `userId`
   - service performs DB operations and returns typed results
5. Handler maps result to correct HTTP status + JSON.

### 5.2 Querying decks (GET `/decks`)

Recommended query behavior:
- Base filter: `user_id = current user` is enforced by RLS; still okay to add explicit `.eq("user_id", userId)` for clarity (optional; RLS is the security boundary).
- Deleted filtering:
  - if `includeDeleted !== true`: `.is("deleted_at", null)`
- Search:
  - if `q` present: match `name` or `description` (ILIKE)
  - Supabase PostgREST supports `.ilike("name", `%${q}%`)` but OR conditions need `.or(...)`.
- Pagination (cursor-based recommended):
  - Determine stable sort columns (recommended: `created_at` then `id` as tiebreaker).
  - Fetch `limit + 1` rows to determine `nextCursor`.
  - Encode cursor as an **opaque** string (e.g., base64url JSON of `{ created_at, id }`).
  - Apply cursor filter:
    - For `order=desc`: `(created_at, id) < (cursor.created_at, cursor.id)`
    - For `order=asc`: `(created_at, id) > (cursor.created_at, cursor.id)`
  - If PostgREST tuple comparisons are awkward, use a conservative approach:
    - Use a composite OR filter like:
      - `created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)` for desc
    - Implement with `.or(...)` string expression.

If pagination is not yet required for MVP, implement defaults now and keep cursor opaque so it can evolve without breaking clients.

### 5.3 Creating a deck (POST `/decks`)

- Server derives `user_id` from auth session.
- Insert into `public.decks` with `name`, `description`, `user_id`.
- Return inserted row with `select().single()`.

### 5.4 Updating a deck (PATCH `/decks/{deckId}`)

Two valid approaches:
- **Update then select**:
  - `update(payload).eq("id", deckId).select().single()`
- **Select then update** for better 404 control:
  - Try to fetch deck (by id); if null → 404
  - Then update and re-fetch

Preferred for correctness: ensure a clean **404** when deck does not exist for the user.

### 5.5 Deleting a deck (DELETE `/decks/{deckId}`)

Hard-delete row:
- `delete().eq("id", deckId)`

Return 204 if deleted; return 404 if not found. Cards will be cascade-deleted by FK.

---

## 6. Security Considerations

### 6.1 Authentication & authorization

- Require a valid Supabase session for all requests.
- Rely on **RLS** as the primary authorization enforcement:
  - ensures users only access rows where `user_id = auth.uid()`
- Do not accept `user_id` in POST/PATCH (prevent horizontal privilege escalation).

### 6.2 Input validation & injection resistance

- Use Zod to validate/normalize all input surfaces (query/path/body).
- Avoid dynamic SQL. Supabase query builder reduces injection risk, but:
  - **Search (`q`)**: escape/limit length; do not build raw SQL strings.
  - **Sort (`sort`)**: enforce allowlist to prevent query manipulation or errors.

### 6.3 Resource enumeration

- Deck IDs are UUIDs, which reduces guessability.
- Still enforce 404 when deck does not exist **for the user** (do not leak existence across users).

### 6.4 Abuse / DoS controls

- Cap `limit` and constrain `q` length.
- Consider future rate limiting at middleware / edge (not required for initial implementation, but design should not block it).

---

## 7. Error Handling

### 7.1 Error envelope

Return errors as `ApiErrorResponseDto`:
- `error.code`: stable machine-readable string
- `error.message`: user-friendly message
- `error.details` (optional): safe debug context (avoid secrets)

Suggested error codes:
- `invalid_input` → 400
- `unauthorized` → 401
- `not_found` → 404
- `server_error` → 500

### 7.2 Mapping Supabase errors

Common patterns:
- Auth failure / no user: 401
- PostgREST errors:
  - If request violates validation, respond 400 (prefer catching before DB)
  - If update/delete affects 0 rows: respond 404
  - Unexpected DB error (network, internal): 500

### 7.3 Logging & telemetry

DB plan defines an `events` table for telemetry, not an error table.

Recommended logging:
- Server-side `console.error()` with a request correlation id (generate one per request).
- Optionally emit an `events` row for operational visibility (only if product wants it):
  - e.g. `event_type: "generate_error"` is not appropriate here; do not overload event types.
  - If deck error telemetry is desired, first extend `EventType` union and align API plan.

---

## 8. Performance

### 8.1 Query performance

- Ensure DB indexes exist:
  - `idx_decks_user_id` already planned in `.ai/db-plan.md`
- Filtering by `deleted_at` should be cheap; if it becomes hot, consider adding a partial index later (not required now).

### 8.2 Search performance

- MVP uses ILIKE on `name`/`description`. For large datasets, consider `pg_trgm` extension + GIN indexes, but defer until needed.

### 8.3 Pagination stability

- Cursor pagination avoids deep offsets and is stable under inserts.
- Use deterministic ordering with a tie-breaker (`id`) to avoid duplicates/missing rows between pages.

---

## 9. Implementation Steps

### 9.1 Add service layer

Create `src/lib/services/decks.service.ts` with functions (names are suggestions):
- `listDecks(supabase, userId, query): Promise<DeckListResponseDto>`
- `createDeck(supabase, userId, command): Promise<DeckDto>`
- `getDeckById(supabase, userId, deckId): Promise<DeckDto | null>`
- `updateDeck(supabase, userId, deckId, command): Promise<DeckDto | null>`
- `deleteDeck(supabase, userId, deckId): Promise<boolean>` (true if deleted)

Notes:
- Service should accept a Supabase client typed as `SupabaseClient` from `src/db/supabase.client.ts` (per rules).
- Keep request parsing/HTTP concerns in the route handler; keep DB logic in the service.

### 9.2 Add Zod schemas

Create `src/lib/validation/decks.zod.ts` (or similar) containing:
- `listDecksQuerySchema` (for GET query params)
- `createDeckSchema` (for POST body)
- `updateDeckSchema` (for PATCH body)
- `deckIdParamSchema` (UUID)

Include normalization:
- trim strings
- coerce booleans from `"true"/"false"`
- coerce `limit` to number (with safe handling)

### 9.3 Implement Astro API routes

Create files:
- `src/pages/api/decks/index.ts`
  - `export const prerender = false`
  - `export async function GET(context)`
  - `export async function POST(context)`
- `src/pages/api/decks/[deckId].ts`
  - `export const prerender = false`
  - `export async function GET(context)`
  - `export async function PATCH(context)`
  - `export async function DELETE(context)`

Rules:
- Use uppercase handler names (`GET`, `POST`, etc.).
- Use `context.locals.supabase` for DB/auth.
- Use guard clauses and early returns for invalid state.

### 9.4 Implement consistent JSON responses

Add helpers (optional but recommended) in `src/lib/http/api-response.ts`:
- `jsonOk(data, status=200)`
- `jsonError(status, code, message, details?)`

Ensure:
- 201 for POST success
- 204 with empty body for DELETE success

### 9.5 Implement pagination cursor encoding

Add helper in `src/lib/pagination/cursor.ts` (or similar):
- `encodeCursor(obj): string` (base64url JSON)
- `decodeCursor(cursor): { created_at: string; id: string } | null` with try/catch returning null → 400 invalid_input

### 9.6 Verify with RLS and local Supabase

- Ensure requests with valid auth can access only their decks.
- Ensure cross-user access returns 404 (not 403) to avoid leaking existence.

### 9.7 Add minimal tests (if project has a test setup)

If/when a test runner exists:
- Unit test Zod schemas (valid/invalid cases).
- Integration test service methods against a local Supabase instance (optional).

---

## 10. Error Scenarios Matrix (quick reference)

- **GET `/decks`**
  - 200: returns page
  - 401: no session
  - 400: invalid query (limit/order/sort/cursor)
  - 500: unexpected DB error

- **POST `/decks`**
  - 201: created
  - 401: no session
  - 400: invalid body
  - 500: DB/trigger failure

- **GET `/decks/{deckId}`**
  - 200: found
  - 401: no session
  - 400: invalid UUID
  - 404: not found (or not owned)
  - 500: unexpected DB error

- **PATCH `/decks/{deckId}`**
  - 200: updated
  - 401: no session
  - 400: invalid UUID/body (or empty patch)
  - 404: not found (or not owned)
  - 500: unexpected DB error

- **DELETE `/decks/{deckId}`**
  - 204: deleted
  - 401: no session
  - 400: invalid UUID
  - 404: not found (or not owned)
  - 500: unexpected DB error

