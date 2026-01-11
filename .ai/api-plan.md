# REST API Plan

## 1. Resources
- **Decks**: `public.decks`
- **Cards**: `public.cards`
- **Events (telemetry/KPIs)**: `public.events`
- **Auth / User account**: Supabase Auth (`auth.users`) (not in `public` schema)
- **AI generation jobs / candidates**: **No persistent table by design** (ephemeral results only)
- **Review sessions / SRS state**: **Not present in current DB schema** (see “Assumptions / vNext”)

## 2. Endpoints

### Conventions (applies to all endpoints)
- **Base path**: `/api/v1`
- **Auth**: required unless explicitly marked “public”
- **Content type**: `application/json`
- **Pagination** (list endpoints):
  - Query params: `limit` (default 25, max 100), `cursor` (opaque), `sort` (field), `order` (`asc|desc`)
  - Response: `data`, `page: { limit, nextCursor }`
- **Standard error body**:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

---

### 2.1 Decks (`public.decks`)

##### GET `/decks`
- **Description**: List decks for current user.
- **Query params**:
  - `q` (optional): search in `name`/`description` (ILIKE)
  - `includeDeleted` (optional, default false): if true include `deleted_at` rows (UX only)
  - Pagination params
- **Response (200)**:

```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "name": "Biology",
      "description": "Optional",
      "created_at": "timestamptz",
      "updated_at": "timestamptz",
      "deleted_at": null
    }
  ],
  "page": { "limit": 25, "nextCursor": null }
}
```

- **Errors**: `401 unauthorized`

##### POST `/decks`
- **Description**: Create a deck for current user.
- **Request**:

```json
{ "name": "string", "description": "string|null" }
```

- **Response (201)**: deck object (same shape as above)
- **Errors**: `400 invalid_input`, `401 unauthorized`
- **Notes**:
  - API sets `user_id = auth.uid()` server-side (do not trust client).

##### GET `/decks/{deckId}`
- **Description**: Get a deck by id (must belong to user).
- **Response (200)**: deck object
- **Errors**: `401 unauthorized`, `404 not_found`

##### PATCH `/decks/{deckId}`
- **Description**: Update deck fields.
- **Request**:

```json
{ "name": "string (optional)", "description": "string|null (optional)", "deleted_at": "timestamptz|null (optional)" }
```

- **Response (200)**: updated deck object
- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 not_found`
- **Notes**:
  - `updated_at` is set by DB trigger `public.update_updated_at_column()`.

##### DELETE `/decks/{deckId}`
- **Description**: Hard-delete a deck (and cascade delete its cards).
- **Response (204)**: no body
- **Errors**: `401 unauthorized`, `404 not_found`
- **Notes**:
  - DB FK `cards.deck_id` has `ON DELETE CASCADE`.

---

### 2.2 Cards (`public.cards`)

##### GET `/cards`
- **Description**: List cards for current user (optionally filtered by deck, tags, text search).
- **Query params**:
  - `deckId` (optional)
  - `tag` (optional, repeatable) or `tags` (optional comma-separated): filter by tag(s)
  - `q` (optional): ILIKE search over `front`/`back`
  - `aiGenerated` (optional `true|false`)
  - `includeDeleted` (optional, default false)
  - Pagination params
- **Response (200)**:

```json
{
  "data": [
    {
      "id": "uuid",
      "deck_id": "uuid",
      "user_id": "uuid",
      "front": "string",
      "back": "string",
      "tags": ["tag1", "tag2"],
      "content_hash": "hex_sha256",
      "ai_generated": false,
      "created_at": "timestamptz",
      "updated_at": "timestamptz",
      "deleted_at": null
    }
  ],
  "page": { "limit": 25, "nextCursor": null }
}
```

- **Errors**: `401 unauthorized`
- **Performance notes**:
  - Tag filtering should use `idx_cards_tags_gin` with array containment queries.
  - Deck/user filters should use `idx_cards_deck_id` / `idx_cards_user_id`.

##### POST `/cards`
- **Description**: Create a card (manual or AI-origin).
- **Request**:

```json
{
  "deck_id": "uuid",
  "front": "string",
  "back": "string",
  "tags": ["string"],
  "ai_generated": false
}
```

- **Response (201)**: created card object
- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 deck_not_found`, `409 duplicate_in_deck`
- **Validation / DB constraints**:
  - `front`, `back`, `deck_id` required
  - `tags` defaults to `[]`
  - `content_hash` is required and must match `public.generate_content_hash(front, back)` normalization
  - Uniqueness: `constraint uniq_deck_content_hash unique (deck_id, content_hash)`
  - Integrity: trigger `public.ensure_card_user_matches_deck()` enforces `cards.user_id == decks.user_id`
- **Notes**:
  - API sets `user_id = auth.uid()`
  - API computes `content_hash` server-side using DB function:
    - `select public.generate_content_hash($front, $back)`

##### GET `/cards/{cardId}`
- **Description**: Get a card by id (must belong to user).
- **Response (200)**: card object
- **Errors**: `401 unauthorized`, `404 not_found`

##### PATCH `/cards/{cardId}`
- **Description**: Update card content/tags (recomputes `content_hash` if `front`/`back` change).
- **Request**:

```json
{
  "front": "string (optional)",
  "back": "string (optional)",
  "tags": ["string"] ,
  "deleted_at": "timestamptz|null (optional)"
}
```

- **Response (200)**: updated card object
- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 not_found`, `409 duplicate_in_deck`
- **Notes**:
  - If `front` or `back` changes, API recomputes `content_hash` and may hit the unique constraint.
  - `updated_at` is set by DB trigger `public.update_updated_at_column()`.

##### DELETE `/cards/{cardId}`
- **Description**: Hard-delete a card.
- **Response (204)**: no body
- **Errors**: `401 unauthorized`, `404 not_found`

---

### 2.3 Duplicate detection (PRD FR-021)

##### POST `/cards/duplicates:check`
- **Description**: Check if a card would duplicate an existing card in a deck (non-blocking UX warning).
- **Request**:

```json
{ "deck_id": "uuid", "front": "string", "back": "string" }
```

- **Response (200)**:

```json
{
  "content_hash": "hex_sha256",
  "isDuplicate": true,
  "duplicateCard": { "id": "uuid", "front": "string", "back": "string" }
}
```

- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 deck_not_found`
- **Notes**:
  - Uses the same normalization as `public.generate_content_hash`.
  - This is a “warning” endpoint; saving may still be blocked by DB uniqueness.

---

### 2.4 Events / Telemetry (`public.events`) (PRD FR-006)

##### GET `/events`
- **Description**: List user events (primarily for debugging/admin UI in MVP).
- **Query params**:
  - `type` (optional): filter by `event_type`
  - `from` / `to` (optional ISO timestamps): filter by `created_at`
  - Pagination params
- **Response (200)**:

```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "event_type": "generated_view",
      "payload": {},
      "created_at": "timestamptz"
    }
  ],
  "page": { "limit": 25, "nextCursor": null }
}
```

##### POST `/events`
- **Description**: Create a telemetry event for the current user.
- **Request**:

```json
{ "event_type": "string", "payload": {} }
```

- **Response (201)**: created event object
- **Errors**: `400 invalid_input`, `401 unauthorized`
- **Validation**:
  - `event_type` required (recommended: restrict to known enum in API layer)
  - `payload` defaults to `{}` if omitted
- **Notes**:
  - DB policies make events immutable (no update policy; update blocked).

##### DELETE `/events/{eventId}`
- **Description**: Delete an event (GDPR-supporting).
- **Response (204)**: no body
- **Errors**: `401 unauthorized`, `404 not_found`

---

---

### 2.5 AI generation (PRD FR-001, generation-first flow)

##### POST `/generate`
- **Description**: Generate candidate flashcards from pasted text (ephemeral; not stored).
- **Request**:

```json
{
  "deck_id": "uuid (optional; used for duplicate checks / default save target)",
  "source_text": "string",
  "options": {
    "max_cards": 20,
    "language": "en",
    "model": "string (optional)"
  }
}
```

- **Response (200)**:

```json
{
  "generation": {
    "id": "string (opaque, ephemeral)",
    "created_at": "iso8601",
    "model": "string",
    "input_chars": 1234
  },
  "candidates": [
    {
      "temp_id": "string",
      "front": "string",
      "back": "string",
      "tags": ["string"],
      "duplicate": { "isDuplicate": false, "duplicateCardId": null }
    }
  ]
}
```

- **Success codes**: `200 ok`
- **Errors**: `400 invalid_input|input_too_large`, `401 unauthorized`, `408 generation_timeout`, `429 rate_limited`, `502 model_error`
- **Side effects**:
  - Creates `events`:
    - `generate_request` on start
    - `generated_view` on success (when candidates returned)
    - `generate_error` on failure (include reason in payload)
- **Rate limiting**:
  - Per-user sliding window (e.g. 10 requests / 10 minutes) enforced in API (see §3).

##### POST `/generate/validate-input`
- **Description**: Lightweight endpoint to validate input size/format before generation (optional UX helper).
- **Request**:

```json
{ "source_text": "string" }
```

- **Response (200)**:

```json
{ "ok": true, "input_chars": 1234, "max_chars": 20000 }
```

- **Errors**: `400 invalid_input|input_too_large`

---

### 2.6 Accept / edit / delete generated candidates (PRD FR-001, FR-005)

> Because candidates are not stored, “accept/edit/delete” refers to client-side candidate state plus creating cards/events.

##### POST `/cards:bulkCreate`
- **Description**: Accept one or more candidates (as-is or edited) and persist as cards.
- **Request**:

```json
{
  "deck_id": "uuid",
  "cards": [
    { "front": "string", "back": "string", "tags": ["string"], "ai_generated": true, "edited": false },
    { "front": "string", "back": "string", "tags": ["string"], "ai_generated": true, "edited": true }
  ]
}
```

- **Response (201)**:

```json
{
  "created": [ { "id": "uuid", "front": "string", "back": "string" } ],
  "skipped": [ { "reason": "duplicate_in_deck", "front": "string", "back": "string" } ]
}
```

- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 deck_not_found`
- **Side effects (events)**:
  - For each accepted card:
    - `accepted_without_edit` if `edited=false`
    - `accepted_after_edit` if `edited=true`
    - Additionally emit `edited` if `edited=true`
  - For discarded candidate actions, client should emit `deleted` (see `/events`) if desired.
- **Notes**:
  - API should aim for partial success (create what it can, report duplicates).

---

### 2.7 Review sessions / spaced repetition (PRD FR-005, FR-010)

> Current DB schema does not include SRS fields; endpoints below assume SRS state is stored either:
> - **vNext schema**: add SRS columns to `public.cards`, or
> - **interim**: store SRS state in `events.payload` only (not recommended for scheduling queries).

##### POST `/review-sessions`
- **Description**: Start a review session for a deck; returns the first due card.
- **Request**:

```json
{ "deck_id": "uuid", "limit": 20 }
```

- **Response (201)**:

```json
{
  "session": { "id": "uuid (or opaque)", "deck_id": "uuid", "created_at": "iso8601" },
  "card": { "id": "uuid", "front": "string", "back": null }
}
```

- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 deck_not_found`
- **Side effects (events)**: `review_session_start`

##### POST `/review-sessions/{sessionId}/answer`
- **Description**: Submit recall rating; updates SRS state; returns next due card.
- **Request**:

```json
{ "card_id": "uuid", "rating": "again|hard|good|easy" }
```

- **Response (200)**:

```json
{
  "updatedCard": { "id": "uuid" },
  "nextCard": { "id": "uuid", "front": "string", "back": null },
  "done": false
}
```

- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 not_found`
- **Side effects (events)**: `review_answer` (include `rating`, `card_id`, `deck_id` in payload)

---

### 2.8 Report hallucination / incorrect card (PRD US-012)

##### POST `/cards/{cardId}/report`
- **Description**: Report a saved card as hallucinated/incorrect (telemetry only in MVP).
- **Request**:

```json
{ "reason": "hallucination|incorrect|other", "notes": "string (optional)" }
```

- **Response (204)**: no body
- **Errors**: `400 invalid_input`, `401 unauthorized`, `404 not_found`
- **Side effects (events)**: `report_hallucination` (payload includes `card_id`, `reason`, `notes`)

---

### 2.9 GDPR account deletion (PRD FR-007, US-016)

##### POST `/me/delete`
- **Description**: Immediate, irreversible deletion of all user data + deletion of Supabase Auth user.
- **Request**:

```json
{ "confirm": true }
```

- **Response (202)**:

```json
{ "status": "deleting" }
```

- **Errors**: `400 invalid_input`, `401 unauthorized`, `409 confirmation_required`, `500 deletion_failed`
- **Implementation notes**:
  - Step A: call `select public.delete_user_data(auth.uid())` (RPC) to hard-delete `events`, `cards`, `decks`
  - Step B: delete user from Supabase Auth via Admin API (requires **service role** on server)
  - Emit `account_deleted` event **before** Step B (or log server-side) because after deletion DB writes may fail

---

## 3. Authentication and Authorization
- **Mechanism**: Supabase Auth (email/password) with JWT-based sessions.
- **Client auth**:
  - Browser obtains a session via Supabase Auth; API endpoints validate session and derive `userId = auth.uid()`.
  - Prefer httpOnly cookie session where possible; otherwise `Authorization: Bearer <access_token>`.
- **Authorization model**:
  - **Primary enforcement**: PostgreSQL RLS policies already present on `decks`, `cards`, `events` (owner-only).
  - **API enforcement**: all writes set `user_id` server-side to `auth.uid()`; never accept `user_id` from client.
- **Service-role operations** (server-only):
  - `/me/delete` needs Supabase Admin privileges to delete the auth user.
- **Rate limiting**:
  - Apply per-user limits on:
    - `/generate` (cost protection)
    - `/auth/login` (throttling to mitigate brute force)
  - Suggested approach (MVP):
    - Use `events` as an audit trail plus a fast in-memory limiter (recommended).
    - If no external store is used, implement a DB-based limiter using `events` with `idx_events_user_id_created_at` (best-effort; heavier).

---

## 4. Validation and Business Logic

#### 4.1 Deck validation (DB + API)
- **DB requirements**:
  - `user_id` NOT NULL, FK to `auth.users(id)` with `ON DELETE CASCADE`
  - `name` NOT NULL
  - RLS owner-only (`user_id = auth.uid()`)
- **API validation**:
  - `name`: non-empty string, max length (assumption: 200)
  - `description`: optional, max length (assumption: 2000)

#### 4.2 Card validation (DB + API)
- **DB requirements**:
  - `deck_id` NOT NULL, FK to `public.decks(id)` with `ON DELETE CASCADE`
  - `user_id` NOT NULL, FK to `auth.users(id)` with `ON DELETE CASCADE`
  - `front` / `back` NOT NULL
  - `tags` NOT NULL default `[]`
  - `content_hash` NOT NULL
  - Unique constraint `uniq_deck_content_hash (deck_id, content_hash)`
  - Trigger `public.ensure_card_user_matches_deck()` enforces `cards.user_id` matches `decks.user_id`
  - RLS owner-only (`user_id = auth.uid()`)
- **API validation**:
  - Trim inputs; reject empty after trim
  - Max lengths (assumptions): `front` 2000 chars, `back` 10000 chars, tag 50 chars
  - Tags normalized (lowercase, trimmed, unique) (assumption; aligns with GIN use)
  - **Content hash**:
    - Always computed server-side via `public.generate_content_hash(front, back)`
    - On update, recompute if either side changed
  - Duplicate handling:
    - `POST /cards` returns `409 duplicate_in_deck` on unique violation
    - `POST /cards:bulkCreate` reports duplicates in `skipped[]` (partial success)

#### 4.3 Events validation (DB + API)
- **DB requirements**:
  - `event_type` NOT NULL
  - `payload` JSONB NOT NULL default `{}`
  - RLS owner-only; events immutable (no update policy)
- **API validation**:
  - Restrict `event_type` to the PRD set (recommended):
    - `generated_view`, `accepted_without_edit`, `accepted_after_edit`, `edited`, `deleted`,
      `signup`, `login`, `generate_request`, `generate_error`,
      `review_session_start`, `review_answer`, `account_deleted`, `report_hallucination`
  - Ensure payload is an object (not array/string)

#### 4.4 Business logic mapping (PRD → endpoints)
- **AI generation from pasted text (FR-001 / US-004)**:
  - `POST /generate` (+ emits `generate_request`, `generated_view` / `generate_error`)
- **Review generated cards; accept/edit/delete (FR-001 / US-005 / US-006)**:
  - Accept/save: `POST /cards` or `POST /cards:bulkCreate`
  - Edit before save: client edits candidate then uses the same create endpoints; emit `edited` + `accepted_after_edit`
  - Delete candidate: client emits `deleted` via `POST /events` (optional)
- **Manual card creation (FR-002 / US-007)**:
  - `POST /cards` with `ai_generated=false`
- **Deck management (FR-003 / US-008)**:
  - `GET/POST /decks`, `GET/PATCH/DELETE /decks/{deckId}`
- **Browse/search/filter cards (FR-003 / US-009)**:
  - `GET /cards` with `q`, `deckId`, `tag(s)` (uses DB indexes)
- **Spaced repetition review (FR-005 / US-010)**:
  - `POST /review-sessions`, `POST /review-sessions/{sessionId}/answer` (requires SRS storage; see assumptions)
- **Instrumentation (FR-006)**:
  - Primary: API emits events automatically for key actions
  - Secondary: `POST /events` for client-driven instrumentation
- **GDPR deletion (FR-007 / US-016)**:
  - `POST /me/delete` (calls `public.delete_user_data()` + deletes Supabase Auth user)
- **Rate limits / quotas (FR-009 / US-014)**:
  - Enforced on `POST /generate` and `POST /auth/login`
- **Large input handling (FR-008 / US-020)**:
  - `POST /generate/validate-input` and validation in `POST /generate`
- **Duplicate detection (FR-021 / US-021)**:
  - `POST /cards/duplicates:check` (non-blocking warning) + DB unique constraint as final gate

---

### Assumptions / vNext (explicit)
- **SRS fields missing**: PRD requires “Cards must store or be associated with minimal review metadata” but current schema has no such columns.
  - **Recommended vNext schema**: add fields on `public.cards` (e.g. `due_at`, `interval_days`, `repetitions`, `efactor`, `last_reviewed_at`) or `srs jsonb`.
  - Until then, review endpoints can exist but cannot schedule “due” cards efficiently.
- **Generation metadata persistence**: PRD mentions persisting generation metadata with saved cards; current schema only has `ai_generated`.
  - **Recommended vNext**: add `generation_meta jsonb` to `public.cards` (model, timestamp, source snippet hash).
- **Soft delete**: `deleted_at` exists “for UX purposes”; GDPR requires hard delete. API supports both patterns but defaults to hard delete on `DELETE` endpoints.

