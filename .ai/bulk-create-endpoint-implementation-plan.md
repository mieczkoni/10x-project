## API Endpoint Implementation Plan: POST `/cards:bulkCreate` (Bulk create cards from generated candidates)

## 1. Endpoint Overview
- **Purpose**: Accept one or more (optionally edited) AI-generated card candidates and persist them as `cards`, while reporting duplicates as **skipped** (partial success).
- **Key behaviors**:
  - **Auth required** (Supabase Auth).
  - **Deck ownership enforced** (must belong to the authenticated user).
  - **Duplicate handling**: duplicates are **not an error**; they are returned in `skipped[]` with `reason: "duplicate_in_deck"`.
  - **Telemetry side-effects** (best-effort, non-blocking):
    - For each created card:
      - Emit `accepted_without_edit` when `edited=false`
      - Emit `accepted_after_edit` when `edited=true`
      - Additionally emit `edited` when `edited=true`

## 2. Request Details
- **HTTP Method**: `POST`
- **Canonical spec URL**: `/cards:bulkCreate`
- **Astro route mapping (implementation)**:
  - Because `:` cannot be used in macOS filenames, implement as `POST /api/cards/bulk-create`.
  - Treat `/cards:bulkCreate` as the **logical** route name used in planning/docs; client should call the Astro route (`/api/cards/bulk-create`) unless you add an explicit rewrite in middleware.
- **Authentication**: Supabase session via `locals.supabase.auth.getUser()` (return `401` if missing/invalid).

### Parameters
- **Required**:
  - `deck_id` (UUID): deck to create cards in
  - `cards` (array): at least 1 candidate, up to a safe max (recommend **100**)
- **Per-card required**:
  - `front` (string): trimmed, non-empty, max 2000 chars
  - `back` (string): trimmed, non-empty, max 10000 chars
  - `ai_generated` (boolean): recommended to require `true` for this endpoint (aligns with “accept generated candidates” semantics)
  - `edited` (boolean)
- **Per-card optional**:
  - `tags` (string[]): optional; normalize (lowercase/trim/deduplicate), max 20 tags, each max 50 chars

### Input validation (Zod)
Add a dedicated schema in `src/lib/validation/cards.zod.ts` (reuse the same constraints as `createCardSchema`):
- `bulkCreateCardsSchema`:
  - `deck_id`: `z.string().uuid()`
  - `cards`: `z.array(bulkCreateCandidateSchema).min(1).max(100)`
- `bulkCreateCandidateSchema`:
  - `front`: `.string().trim().min(1).max(2000)`
  - `back`: `.string().trim().min(1).max(10000)`
  - `tags`: same normalization/limits as `createCardSchema` (default to `[]`)
  - `ai_generated`: `z.literal(true)` (recommended) or `z.boolean()` (if you want to support non-AI bulk inserts)
  - `edited`: `z.boolean()`

## 3. Response Details
- **Success (201)**:
  - Body: `BulkCreateCardsResponseDto`
  - Shape:
    - `created`: array of `{ id, front, back }` for successfully inserted cards
    - `skipped`: array of `{ reason: "duplicate_in_deck", front, back }` for candidates not inserted due to duplication
- **Error responses** use `ApiErrorResponseDto` from `src/types.ts`.

### Status codes
- `201`: at least one card processed (including “all skipped” cases)
- `400`: invalid JSON or invalid input (schema violations)
- `401`: not authenticated
- `404`: deck not found (missing, soft-deleted, or not owned)
- `500`: unexpected server-side failure

## 4. Data Flow
1. **Route handler** (`src/pages/api/cards/bulk-create.ts`)
   - `export const prerender = false`
   - Auth guard: `locals.supabase.auth.getUser()`
   - Parse JSON and validate with `bulkCreateCardsSchema`
2. **Service layer** (extend `src/lib/services/cards.service.ts`)
   - Add `bulkCreateCards(supabase, userId, command)` to keep the route thin and consistent with existing endpoints.
3. **Deck verification**
   - Query `decks` with `id=deck_id`, `user_id=userId`, and recommended `deleted_at IS NULL`.
   - If missing: throw `DECK_NOT_FOUND` (route maps to `404 deck_not_found`).
4. **Compute `content_hash` per candidate**
   - Use the existing server-side DB function via RPC: `supabase.rpc("generate_content_hash", { front, back })`.
   - Compute hashes for all candidates with concurrency limiting (recommend 10–20 at a time) to avoid per-request spikes.
5. **Deduplicate within the request (recommended)**
   - If multiple candidates produce the same `content_hash`, keep the first as “insert-attempt” and mark the rest as `skipped` with `duplicate_in_deck` (the spec only defines this reason).
6. **Insert in one DB call**
   - Insert rows with server-derived `user_id`, `deck_id`, normalized `tags`, `ai_generated`, and computed `content_hash`.
   - Use an approach that **ignores duplicates** (rather than failing):
     - Recommended: `upsert(rows, { onConflict: "deck_id,content_hash", ignoreDuplicates: true })`
     - Select a superset including `content_hash` to match created rows back to input; then strip `content_hash` from the API response.
7. **Compute `skipped[]`**
   - `skipped` are:
     - Request-internal duplicates (step 5), plus
     - Anything not returned as inserted by the DB call (implies it conflicted with an existing `(deck_id, content_hash)`).
8. **Emit telemetry events (best-effort)**
   - For each created card, emit events using `createEvent()` from `src/lib/services/events.service.ts`:
     - `edited=false` → `accepted_without_edit`
     - `edited=true` → `accepted_after_edit` and `edited`
   - Use `Promise.allSettled` (or fire-and-forget) so event failures never change the endpoint result.
9. **Return 201**
   - `jsonOk({ created, skipped }, 201)`

## 5. Security Considerations
- **Authentication**: require Supabase user session; return `401` if missing/invalid.
- **Authorization / ownership**:
  - Explicitly verify `deck_id` belongs to the authenticated user before inserts.
  - RLS provides an additional safety net (`user_id = auth.uid()`), but don’t rely on it for user-friendly `404 deck_not_found`.
- **Input abuse / DoS**:
  - Enforce strict max sizes:
    - Max cards per request (recommend 100)
    - Max lengths for `front/back` and tag constraints (already established in `cards.zod.ts`)
  - Consider adding a lightweight per-user rate limit for this endpoint if abuse becomes a concern (optional; not currently required by the API plan).
- **Data leakage**:
  - On `404`, do not reveal whether the deck exists for other users; treat “not owned” as “not found”.
  - Avoid logging raw `front/back` contents on server errors; log counts and identifiers only.

## 6. Error Handling
### Error scenarios and mappings
- **Invalid JSON**:
  - Condition: `request.json()` throws `SyntaxError`
  - Response: `400 invalid_input` (“Invalid JSON in request body”)
- **Validation error**:
  - Condition: Zod parse fails
  - Response: `400 invalid_input` with `{ issues: zodErrors }`
- **Deck not found / not owned / soft-deleted**:
  - Condition: deck lookup returns null
  - Response: `404 deck_not_found`
- **RPC content hash failure**:
  - Condition: `generate_content_hash` RPC returns error/null
  - Response: `500 server_error` (“Failed to compute content hash”)
  - Logging: `console.error('[POST /api/cards/bulk-create] Content hash computation failed', { userId, deckId, count })`
- **DB insert failure (non-duplicate)**:
  - Condition: Supabase insert/upsert returns error not attributable to conflict-ignore behavior
  - Response: `500 server_error`
  - Logging: `console.error('[POST /api/cards/bulk-create] Failed to bulk insert cards', { userId, deckId, errorCode, message })`

### Notes on “duplicate” handling
- Do **not** return `409` for this endpoint. Duplicates are returned in `skipped[]` per spec (“partial success”).

## 7. Performance
- **Single insert call**: insert/upsert all candidates in one PostgREST request rather than N individual inserts.
- **Hash computation cost**:
  - `generate_content_hash` is lightweight, but calling it N times can still be the main cost.
  - Use **concurrency limiting** and consider a future DB RPC that accepts arrays for true bulk hash generation if this becomes a hotspot.
- **Avoid extra duplicate queries**:
  - Prefer “insert with ignoreDuplicates + compare returned hashes” over per-candidate “check then insert”.
- **Event writes**:
  - Use best-effort async (`Promise.allSettled`) so telemetry doesn’t add latency to the critical path.

## 8. Implementation Steps
1. **Add validation schema**
   - Update `src/lib/validation/cards.zod.ts`:
     - Add `bulkCreateCandidateSchema` and `bulkCreateCardsSchema`
     - Export inferred types (e.g., `BulkCreateCardsBody`)
2. **Add service function**
   - Update `src/lib/services/cards.service.ts`:
     - Add `bulkCreateCards(supabase, userId, command)`
     - Reuse existing `computeContentHash()` helper
     - Implement request-internal dedupe by computed `content_hash`
     - Perform a single `upsert(..., { onConflict: "deck_id,content_hash", ignoreDuplicates: true })` and select `id, front, back, content_hash`
     - Build `{ created, skipped }` and return `BulkCreateCardsResponseDto`
3. **Add API route**
   - Create `src/pages/api/cards/bulk-create.ts`:
     - `export const prerender = false`
     - Auth guard (`401`)
     - JSON parse + zod validation (`400`)
     - Call `bulkCreateCards(...)`
     - Return `jsonOk(result, 201)`
     - Map `DECK_NOT_FOUND` to `ApiErrors.deckNotFound()` (`404`)
4. **Add telemetry emission**
   - In `bulkCreateCards()`, after successful insert:
     - For each created card, look up the associated candidate (by `content_hash`) to read `edited`
     - Call `createEvent()` accordingly (`accepted_without_edit` / `accepted_after_edit` + `edited`)
5. **Edge-case checks**
   - Ensure “all duplicates” returns `201` with `created: []` and non-empty `skipped`.
   - Ensure tags normalization matches `createCardSchema` behavior.
   - Ensure soft-deleted decks are treated as not found (recommended for consistent UX).
