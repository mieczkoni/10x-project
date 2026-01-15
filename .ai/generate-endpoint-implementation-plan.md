# API Endpoint Implementation Plan: POST `/generate` (AI Candidate Generation)

## 1. Endpoint Overview
- **Purpose**: Generate **ephemeral** flashcard candidates from pasted text. Candidates are **not persisted**; the client later saves accepted cards via `POST /cards` or `POST /cards:bulkCreate`.
- **Route**: `POST /api/generate`
- **Auth**: **Required** (Supabase Auth). Derive `userId` from `locals.supabase.auth.getUser()`.
- **Side effects**: Write telemetry rows to `public.events`:
  - `generate_request` at start
  - `generated_view` on success (when candidates returned)
  - `generate_error` on failure (include reason + safe context)
- **Rate limit**: Per-user sliding window (e.g. **10 requests / 10 minutes**). MVP can be best-effort (in-memory) with optional DB fallback based on `events`.

## 2. Request Details
- **HTTP Method**: `POST`
- **URL Structure**: `/api/generate`
- **Headers**:
  - `Content-Type: application/json`
  - Auth session (cookie or `Authorization: Bearer <token>`) handled by Supabase client in middleware.
- **Request body** (`GenerateCommand` in `src/types.ts`):
  - **Required**
    - `source_text: string`
  - **Optional**
    - `deck_id?: uuid` (used for duplicate checks / default save target)
    - `options?: { ... }`
      - `max_cards?: number` (default 20; enforce an upper bound)
      - `language?: string` (default `"en"`)
      - `model?: string` (optional; if omitted, use server default)

### Companion endpoint (UX helper): POST `/generate/validate-input`
- **Purpose**: Validate size/format before spending model tokens.
- **Request body**: `{ "source_text": "string" }`
- **Response**: `{ ok: true, input_chars: number, max_chars: number }`
- **Errors**: `400 invalid_input|input_too_large`

## 3. Used Types (DTOs + Command Models)
Use existing shared types from `src/types.ts`:
- **Commands**
  - `GenerateCommand`
  - `ValidateGenerateInputCommand`
- **Responses**
  - `GenerateResponseDto`
  - `ValidateGenerateInputResponseDto`
  - `ApiErrorResponseDto` (error envelope)
- **Supporting DTOs**
  - `GeneratedCandidateDto`, `GeneratedCandidateDuplicateDto`
  - `GenerationMetaDto`
  - `DeckId`, `CardId`, `UserId`
  - `EventType` (includes `generate_request`, `generated_view`, `generate_error`)

Add/introduce new internal “command model” types for service boundaries (server-only, not exported to clients):
- `GenerateCandidatesParams` (validated + defaulted input; includes `userId`)
- `OpenRouterGenerateResult` (raw provider response + parsed candidates)
- `DuplicateCheckResult` (map of `temp_id -> {isDuplicate, duplicateCardId}`)

## 4. Response Details
### Success (200)
Return `GenerateResponseDto`:
- `generation`:
  - `id`: opaque ephemeral id (e.g. `crypto.randomUUID()`)
  - `created_at`: ISO timestamp
  - `model`: resolved model used
  - `input_chars`: `source_text.length`
- `candidates[]`:
  - `temp_id`: string (unique within the response)
  - `front`: string
  - `back`: string
  - `tags`: string[]
  - `duplicate`: `{ isDuplicate: boolean, duplicateCardId: uuid | null }`

### Error status codes
Follow the API spec for this endpoint:
- **400**:
  - `invalid_input` (bad JSON, missing fields, wrong types, invalid uuid, etc.)
  - `input_too_large` (exceeds `max_chars`)
- **401** `unauthorized`
- **408** `generation_timeout` (provider call aborted / timed out)
- **429** `rate_limited` (per-user limit exceeded)
- **502** `model_error` (provider failure, invalid model output after retries)
- **500** `server_error` (unexpected failures outside the above categories)

> Note: existing `src/lib/http/api-response.ts` currently lacks helpers for `429/408/502` and custom codes like `input_too_large`. Add small helpers (or extend `ApiErrors`) so error envelopes stay consistent across endpoints.

## 5. Data Flow
### POST `/api/generate`
1. **Authenticate**
   - Call `locals.supabase.auth.getUser()`.
   - If no user: return **401**.
2. **Parse JSON**
   - Catch JSON parse errors -> **400 invalid_input**.
3. **Validate + normalize input (Zod)**
   - Validate `deck_id` if provided (uuid).
   - Trim `source_text` (and reject empty-after-trim).
   - Enforce size limit \(e.g. `max_chars = 20000`\) -> **400 input_too_large**.
   - Default `options.max_cards` to 20; clamp to an allowed range (e.g. 1–20).
   - Default `options.language` to `"en"`.
4. **Rate limit**
   - Enforce per-user sliding window (10/10min) -> **429 rate_limited**.
5. **Emit `generate_request` event**
   - Insert into `public.events` with payload including:
     - `input_chars`, `deck_id` (if any), `max_cards`, `language`, `model` (requested), and a generated `generation_id`.
   - Avoid storing raw `source_text` in events (PII risk + cost).
6. **If `deck_id` provided: verify deck ownership**
   - Query `public.decks` where `id=deck_id`, `user_id=userId`, `deleted_at IS NULL`.
   - If not found: return **404 deck_not_found** (and emit `generate_error`).
7. **Call OpenRouter to generate candidates**
   - Use `fetch` with `Authorization: Bearer ${import.meta.env.OPENROUTER_API_KEY}`.
   - Use an `AbortController` timeout (e.g. 10–20s). Abort -> **408 generation_timeout**.
   - Prompt should request **strict JSON** output (array of cards with front/back/tags) and instruct the model to avoid verbatim copyrighted content and to keep facts grounded.
8. **Validate model output (Zod)**
   - Parse provider response into JSON.
   - Validate:
     - `candidates.length <= max_cards`
     - each `front/back` non-empty after trim; enforce reasonable max length (reuse card constraints: front ≤ 2000, back ≤ 10000)
     - `tags` array: normalize like `normalizeTags()` in `cards.zod.ts` (lowercase, trim, dedupe; max 20 tags; tag length ≤ 50)
   - If invalid:
     - Option A (recommended): retry once with a “repair” prompt that includes validation errors (still bounded by timeout).
     - If still invalid -> **502 model_error**.
9. **Duplicate checks (only if `deck_id` provided)**
   - For each candidate:
     - Compute `content_hash` using DB function `public.generate_content_hash(front, back)` via `supabase.rpc("generate_content_hash", { front, back })` (consistent with cards logic).
   - Query `public.cards` for `deck_id`, `user_id`, `deleted_at IS NULL` and `content_hash IN (...)`, selecting `id, content_hash`.
   - Build per-candidate `duplicate` object:
     - `isDuplicate=true` and set `duplicateCardId` to the found card id
     - else `isDuplicate=false` and `duplicateCardId=null`
10. **Assemble response**
    - Create `generation` meta.
    - Assign each candidate a `temp_id` (e.g. `nanoid()` or `crypto.randomUUID()`).
11. **Emit `generated_view` event**
    - Payload: `generation_id`, `input_chars`, `candidate_count`, `deck_id` (if any), `model`.
12. **Return 200**

### POST `/api/generate/validate-input`
1. Authenticate (401 if missing).
2. Parse JSON (400 invalid_input on bad JSON).
3. Validate `source_text` presence/type.
4. Compute `input_chars` and compare to `max_chars` (e.g. 20000):
   - If too large -> 400 input_too_large
   - Else -> 200 `{ ok: true, input_chars, max_chars }`

## 6. Security Considerations
- **Authentication**: Require Supabase user session; never accept `user_id` from client input.
- **Authorization**:
  - If `deck_id` is provided, verify ownership (`decks.user_id = userId`) and `deleted_at IS NULL` before any duplicate checks.
  - RLS is a backstop; still do explicit checks to return clear `404 deck_not_found`.
- **Prompt injection / data exfiltration**:
  - Treat `source_text` as untrusted. Do not allow it to influence system instructions.
  - Ensure the prompt explicitly constrains output to JSON only, no tool calls, no secrets, no URLs.
  - Never include secrets (OpenRouter key, Supabase key) in prompts or logs.
- **PII handling**:
  - Avoid storing raw `source_text` in DB (`events`) or logs. Store only derived metrics (char count, hash if needed).
- **Abuse / cost control**:
  - Enforce rate limit (429) and input max size (400 input_too_large).
  - Consider per-request token budget and `max_cards` hard cap.
- **Output safety**:
  - Validate and sanitize model outputs; reject oversized strings/tags and empty content.
  - Ensure response is always well-formed JSON and does not echo raw provider errors to clients.

## 7. Performance
- **Minimize DB round trips**:
  - Duplicate checks should do **one `cards` query** using `content_hash IN (...)`.
  - Hash computation via `rpc("generate_content_hash")` is up to `max_cards` calls; acceptable for max 20. If needed later, add a batch RPC function.
- **Timeouts**:
  - Use `AbortController` for OpenRouter calls; choose a timeout consistent with UX (e.g. 15s).
- **Rate limiting**:
  - In-memory limiter is fastest (best-effort). Optionally fall back to counting recent `generate_request` events in DB (heavier).

## 8. Implementation Steps
1. **Create route files**
   - `src/pages/api/generate/index.ts` implementing `export const prerender = false;` and `export const POST`.
   - `src/pages/api/generate/validate-input.ts` implementing `export const prerender = false;` and `export const POST`.
2. **Add Zod schemas**
   - Create `src/lib/validation/generate.zod.ts`:
     - `generateSchema` for `GenerateCommand` (trim/defaults; size limits; clamp `max_cards`)
     - `validateGenerateInputSchema` for `{ source_text }`
     - `generatedCandidateSchema` for model output normalization (front/back/tags rules aligned with `cards.zod.ts`)
3. **Add/extend API error helpers**
   - Update `src/lib/http/api-response.ts` to include:
     - `rateLimited()` -> `jsonError(429, "rate_limited", ...)`
     - `generationTimeout()` -> `jsonError(408, "generation_timeout", ...)`
     - `modelError()` -> `jsonError(502, "model_error", ...)`
     - `inputTooLarge()` -> `jsonError(400, "input_too_large", ...)`
4. **Introduce service layer**
   - `src/lib/services/generate.service.ts`:
     - `generateCandidates(supabase, userId, command)` orchestration (deck verify, provider call, parsing, duplicate checks)
   - `src/lib/services/events.service.ts` (recommended):
     - `createEvent(supabase, userId, event_type, payload)`; ensure payload is an object
   - `src/lib/services/openrouter.service.ts` (recommended):
     - `callOpenRouterGenerate({ source_text, max_cards, language, model, timeoutMs })`
5. **Implement rate limiting**
   - MVP: `src/lib/services/rate-limit.service.ts` using an in-memory map keyed by `userId` with timestamps (sliding window).
   - Optional DB fallback: count `events` of type `generate_request` in last window using `idx_events_user_id_created_at`.
6. **Wire endpoint handlers**
   - Follow existing patterns from `src/pages/api/cards/*`:
     - auth guard first
     - JSON parse try/catch
     - Zod `safeParse`/`parse` and return `ApiErrors.invalidInput(...)` with details
     - call service; map known errors to status codes
     - use `jsonOk(...)` for success
7. **Telemetry behavior**
   - Ensure `generate_request` is emitted even if provider later fails.
   - Emit `generate_error` with payload:
     - `generation_id`, `stage` (`validation|rate_limit|deck_verify|provider|parse|duplicate_check`), `code`, and safe error message
   - Emit `generated_view` only after candidates are successfully formed.
8. **Testing checklist**
   - Unauthorized -> 401
   - Invalid JSON -> 400 invalid_input
   - Empty/whitespace `source_text` -> 400 invalid_input
   - Too large input -> 400 input_too_large
   - Rate limit exceeded -> 429 rate_limited
   - Provider timeout -> 408 generation_timeout
   - Provider returns malformed JSON -> 502 model_error
   - `deck_id` not owned/nonexistent -> 404 deck_not_found
   - Duplicate detection returns correct `duplicateCardId` when matching card exists

