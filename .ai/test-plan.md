## Test Plan — 10x Project (Astro + React + Supabase + OpenRouter)

### 1. Introduction & testing objectives
This test plan defines the QA strategy for a flashcard web app built with **Astro 5** (server output via Node adapter), **React 19** for interactive views, **Supabase** (Postgres + Auth + RLS) for backend, and **OpenRouter** for AI-driven card generation.

**Primary objectives**
- Validate core user journeys end-to-end: **auth → dashboard (decks) → deck (cards) → generate → bulk-save**.
- Ensure **data isolation** and access control: authenticated-only API, ownership checks, and Supabase **RLS policies**.
- Verify correctness of **pagination**, filtering, duplicate detection (via `public.generate_content_hash`), and soft/hard delete behaviors.
- Ensure resilience against failures: invalid input, rate limits, upstream AI provider errors/timeouts, and transient network issues.
- Maintain non-regression across UI/API as features evolve.

### 2. Scope of testing
#### In scope
- **Web UI** (Astro pages + React views):
  - Public landing (`/`)
  - Auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
  - App pages under `/dashboard` (decks list, deck details, generate flow)
- **API endpoints** (Astro API routes under `src/pages/api`):
  - Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
    `POST /api/auth/request-password-reset`, `POST /api/auth/update-password`
  - Decks: `GET/POST /api/decks`, `GET/PATCH/DELETE /api/decks/{deckId}`
  - Cards: `GET/POST /api/cards`, `GET/PATCH/DELETE /api/cards/{cardId}`
  - Cards helpers: `POST /api/cards/duplicates/check`, `POST /api/cards/bulk-create`
  - Generate: `POST /api/generate/validate-input`, `POST /api/generate`
- **Service layer** (`src/lib/services/*`):
  - DB operations (decks/cards), duplicate/content hash RPC usage, bulk upsert behavior
  - Rate limiting (in-memory + DB fallback)
  - AI provider integration + error mapping
  - Telemetry events writes (`events` table)
- **Database behaviors** (Supabase migrations under `supabase/migrations`):
  - RLS policies on `decks`, `cards`, `events`
  - `public.generate_content_hash(front, back)` normalization correctness
  - Triggers: `ensure_card_user_matches_deck`, `update_updated_at_column`
  - Uniqueness constraint `uniq_deck_content_hash (deck_id, content_hash)`

#### Out of scope (for this phase unless explicitly requested)
- Load/scale testing of production infrastructure (no Docker/CI pipeline defined in repo yet).
- Cross-browser matrix beyond modern Chromium/WebKit/Firefox baselines.
- Full GDPR account deletion workflow in UI (DB helper exists; no UI/API endpoint currently present in `src/pages/api`).

### 3. Test priorities (risk-based)
#### P0 (must pass for release)
- **Authentication & session handling** (cookies via Supabase SSR, unauthorized responses).
- **Authorization / multi-tenant isolation** (RLS + ownership checks for decks/cards).
- **Decks & Cards CRUD** including soft delete behavior (`deleted_at`) and hard delete endpoints.
- **Duplicate handling**:
  - pre-check endpoint (`/api/cards/duplicates/check`)
  - server-enforced uniqueness on create/update and bulk upsert
- **Generate workflow** including:
  - input validation endpoint
  - provider errors/timeouts
  - per-user rate limiting
  - duplicate annotation when `deck_id` is provided

#### P1 (should pass)
- Search, filtering, tags normalization and correctness.
- Cursor pagination correctness and resilience to invalid cursors.
- UI states: loading, error banners, empty states, retry flows.
- Telemetry events (best-effort; should not break user flows).

#### P2 (nice to have)
- Visual regression, advanced accessibility audits, extended performance profiling.

### 4. Types of tests to be performed
#### 4.1 Unit tests (fast)
- Validation schemas (`src/lib/validation/*.zod.ts`): boundary checks, normalization (tags, trimming), refined constraints.
- Pure helpers (pagination cursor encode/decode, tag normalization helpers in hooks).
- Rate limit logic: in-memory sliding window behavior and cooldowns.

#### 4.2 Integration tests (API + DB)
- API routes + service layer against a test Supabase instance:
  - verifies status codes, error codes, response shapes from `ApiErrors`
  - verifies RLS/ownership restrictions by using different test users
  - verifies DB constraints/triggers and the `generate_content_hash` RPC

#### 4.3 Contract tests (API error/response consistency)
- Enforce API conventions:
  - Success: `jsonOk(data, status)` returns correct `Content-Type` and body
  - Errors: `{ error: { code, message, details? } }` with correct HTTP status
- Verify front-end `fetchJson` raises `ApiError` with `status/code/details` mapping.

#### 4.4 End-to-end (E2E) tests (browser)
- Critical user journeys through the UI with real navigation and cookies:
  - Signup/Login/Logout
  - Create deck → create card → duplicate warning → save
  - Generate candidates → edit/select → bulk save → verify created + skipped duplicates messaging
- Validate redirects to `/login` on 401 from hooks.

#### 4.5 Security tests (focused)
- Authorization tests:
  - Access another user’s deck/card via ID guessing → must return 404/unauthorized and never leak data.
  - Ensure soft-deleted decks/cards are excluded when required.
- Input handling:
  - invalid JSON bodies, overlong fields, invalid UUIDs, unexpected types.
- Abuse controls:
  - login brute-force mitigation (per email+IP limiter)
  - generate/bulk-create rate limiting behaviors

#### 4.6 Performance tests (targeted, non-soak)
- Generate endpoint: verify timeouts are mapped to `408 generation_timeout`.
- Pagination endpoints: verify reasonable response time with typical dataset sizes.
- Bulk create: validate concurrency behavior for hash computation doesn’t cause server timeouts under typical sizes (e.g., 50–100 candidates).

#### 4.7 Accessibility & UX quality checks
- Basic a11y checks for forms, dialogs, and error messages (keyboard navigation, focus management, labels).
- Visual/UX checks of loading/empty/error states for dashboard/deck/generate views.

### 5. Test scenarios for key functionalities
#### 5.1 Authentication (Supabase Auth via SSR cookies)
- **Signup**
  - Valid email + password + confirmPassword → 200 with `user` object
  - Existing account → 409 `account_exists`
  - Weak password → 400 `weak_password`
  - Email not allowed/invalid by provider rules → 400 `email_not_allowed`
  - Too many attempts/provider 429 → 429 `rate_limited`
  - Invalid JSON → 400 `invalid_input`
  - Field validation errors → 400 `invalid_input` with `details.fieldErrors`
- **Login**
  - Valid credentials → 200 `user` and session cookie present
  - Invalid credentials → 401 `invalid_credentials`
  - Local rate limiter blocks after repeated failures → 429 `rate_limited` (+ retryAfterSeconds when provided)
  - Provider 429 mapped properly → 429 `rate_limited`
  - Verify events: `login` telemetry is best-effort (failures do not break login)
- **Logout**
  - Authenticated logout success → 200 `{ ok: true }`
  - Error path returns 500 `server_error`
- **Password reset request**
  - Valid email returns 200 `{ ok: true }` regardless of account existence (no enumeration leakage)
  - Provider 429 → 429 `rate_limited`
  - Verify `redirectTo` uses request origin headers correctly (`x-forwarded-*`)
- **Update password**
  - With `code` flow: valid exchange → password updated
  - With `accessToken/refreshToken` flow: sets session then updates password
  - Missing one of access/refresh token → 400 `recovery_invalid`
  - Invalid/expired recovery credentials → 400 `recovery_invalid`
  - Weak password → 400 `weak_password`
  - Not authenticated (no valid recovery/session) → 401 `unauthorized`

#### 5.2 Decks (CRUD + pagination + soft delete)
- **List decks (GET /api/decks)**
  - Default list returns only `deleted_at is null`
  - `includeDeleted=true` returns both deleted and active
  - `q` search matches name/description (ILIKE)
  - Pagination:
    - valid `cursor` returns next page; stable ordering with tie-breaker `id`
    - invalid cursor returns 400 `invalid_input` mentioning cursor
  - Unauthorized → 401 `unauthorized`
- **Create deck (POST /api/decks)**
  - Valid payload returns 201 and created deck fields
  - Empty/overlong name, overlong description → 400 `invalid_input`
- **Get deck (GET /api/decks/{deckId})**
  - Existing owned deck returns 200
  - Non-existent or not-owned returns 404 `not_found` (message “Deck not found”)
  - Invalid UUID returns 400 `invalid_input`
- **Update deck (PATCH /api/decks/{deckId})**
  - Update name/description success
  - Soft delete: set `deleted_at` ISO timestamp and verify it disappears from default list
  - Restore: set `deleted_at=null` and verify reappears
  - Empty body → 400 `invalid_input`
- **Delete deck (DELETE /api/decks/{deckId})**
  - Returns 204; verify cascade delete to cards (DB FK `on delete cascade`)
  - Not found/not owned → 404

#### 5.3 Cards (CRUD + filtering + pagination + soft delete + hashing)
- **List cards (GET /api/cards)**
  - Filters:
    - `deckId` filters to deck
    - `tags` (comma-separated) and `tag` (repeatable) normalize + merge; verify duplicates removed + lowercase
    - `q` search across front/back
    - `aiGenerated=true/false` filters correctly
    - `includeDeleted=true` includes soft deleted
  - Pagination: stable ordering + invalid cursor handling
  - Unauthorized → 401 with UI redirect behavior in hooks
- **Create card (POST /api/cards)**
  - Valid create with `ai_generated` false/true returns 201
  - Deck not found/not owned → 404 `deck_not_found`
  - Duplicate content in same deck:
    - Same semantic content but different whitespace/casing should collide due to `generate_content_hash` normalization
    - Returns 409 `duplicate_in_deck`
  - Validate server-side hash computation errors handled as 500 `server_error` (forced failure tests via mocking RPC response)
- **Get card (GET /api/cards/{cardId})**
  - Owned card returns 200
  - Non-existent/not owned returns 404
- **Update card (PATCH /api/cards/{cardId})**
  - Update tags replaces array and normalizes; empty array allowed
  - Update front/back recomputes hash; if conflicts with existing card in same deck → 409 `duplicate_in_deck`
  - Soft delete/restore via `deleted_at`
  - Empty body → 400 `invalid_input`
- **Delete card (DELETE /api/cards/{cardId})**
  - 204 on success; 404 if not owned/not found

#### 5.4 Duplicate checking endpoint (non-blocking UX)
- **POST /api/cards/duplicates/check**
  - Requires auth → 401 otherwise
  - Deck not found/not owned/soft-deleted → 404 `deck_not_found`
  - Returns:
    - `isDuplicate=false`, `duplicateCard=null` when none exists
    - `isDuplicate=true`, `duplicateCard={id,front,back}` when exists
  - Verify content hash normalization matches DB function behavior (case/whitespace)
  - Validate invalid JSON and schema errors → 400 `invalid_input`

#### 5.5 Bulk create cards (save generated results)
- **POST /api/cards/bulk-create**
  - Auth required; returns 201 on success
  - Valid payload:
    - Inserts unique candidates
    - Skips duplicates both:
      - within request (same content repeated)
      - already existing in deck (based on `deck_id,content_hash` with `ignoreDuplicates`)
  - Returns `created[]` with `id,front,back`; `skipped[]` with reason `duplicate_in_deck`
  - All skipped still returns 201 (spec behavior)
  - Rate limit:
    - when `enforceRateLimit` triggers → 429 `rate_limited`
  - Deck not found/not owned/soft-deleted → 404 `deck_not_found`
  - Validate schema limits: max 100 cards; tags max 20; tag length max 50

#### 5.6 Generate input validation (cheap guardrail)
- **POST /api/generate/validate-input**
  - Auth required
  - `source_text` empty → 400 `invalid_input`
  - `source_text` > 20000 chars → 400 `input_too_large` with `details.input_chars/max_chars`
  - Valid returns `{ ok:true, input_chars, max_chars }`

#### 5.7 Generate candidates (AI provider + rate limit + duplicate annotations)
- **POST /api/generate**
  - Auth required
  - Rate limit:
    - in-memory limiter triggers → 429 `rate_limited`
    - DB fallback limiter triggers when many `generate_request` events exist → 429 `rate_limited`
  - With `deck_id`:
    - not found/not owned/soft-deleted → 404 `deck_not_found`
    - duplicates annotated in candidates (`duplicate.isDuplicate`, `duplicateCardId`)
  - Provider behavior:
    - missing `OPENROUTER_API_KEY` in env should surface as server error in non-prod; verify deployment configs prevent this
    - timeout → 408 `generation_timeout`
    - provider auth error (401/403) → mapped to 401 with message “AI provider authentication failed”
    - provider 429 → 429 `rate_limited` with message “AI provider rate limit exceeded”
    - provider bad request/invalid output/schema errors → 502 `model_error`
    - provider non-JSON output → 502 `model_error` / validation error path
  - Output validation:
    - candidates must satisfy max items, field lengths, tags normalization and constraints
    - repair attempt path: initial invalid output triggers one retry with repair message
  - Telemetry:
    - `generate_request`, `generated_view`, `generate_error` events are written; failures must not break user response paths

#### 5.8 Data integrity & DB-level checks (Supabase)
- RLS:
  - User A cannot read/insert/update/delete User B’s decks/cards/events.
  - `events` are immutable (update blocked).
- Triggers:
  - `ensure_card_user_matches_deck`: cannot insert a card where `user_id` differs from deck owner (attempt via direct DB calls).
  - `updated_at` triggers update timestamps on deck/card update.
- Hashing:
  - `generate_content_hash` collapses whitespace and lowercases; verify collision expectations and any false-positive risk for near-identical content.

### 6. Test environment
#### 6.1 Local development test environment
- **Node.js**: v22.14.0 (per `.nvmrc`)
- **App server**: `npm run dev` (Astro dev server, port 3000)
- **Supabase**:
  - Preferred: a dedicated **test** Supabase project or local Supabase via CLI
  - Apply migrations in `supabase/migrations` to the test database
- **Required environment variables**
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (anon key for client usage; server uses SSR client)
  - `OPENROUTER_API_KEY` (for generate endpoint)
- **Test accounts**
  - At least two users (User A / User B) to validate isolation and ownership checks.

#### 6.2 CI environment (recommended target state)
- Run lint + unit + integration tests on PRs.
- Run E2E tests nightly or on release branches.
- Use ephemeral DB schema (reset per run) or isolated per-branch schemas when possible.

### 7. Testing tools
#### Must-have (recommended additions where missing)
- **Unit / integration**: `vitest` + TypeScript support
- **React component tests**: `@testing-library/react` + `@testing-library/user-event`
- **API mocking** (UI tests): `msw`
- **E2E**: `playwright` (Chromium/Firefox/WebKit)
- **API manual testing**: Postman/Insomnia (collections for `/api/*`)
- **Performance smoke**: `k6` or `artillery` (focus on `/api/generate`, `/api/cards`, `/api/decks`)
- **Security checks**: OWASP ZAP baseline scan against deployed staging; dependency audit via `npm audit`

#### Existing project tooling leveraged
- **ESLint** and **Prettier** (already configured)

### 8. Test schedule (initial + ongoing)
#### Initial test cycle (suggested: 2 weeks)
- **Days 1–2**: Finalize requirements coverage, create test cases, set up test Supabase env and seed data strategy.
- **Days 3–6**: Automate P0 unit + API integration tests (auth guards, decks/cards CRUD, duplicates, bulk create).
- **Days 7–9**: Automate P0 E2E flows (auth + deck + cards + generate + save).
- **Days 10–12**: Add negative/security tests (cross-user access, invalid cursors, rate limits, provider errors via mocks).
- **Days 13–14**: Regression pass, stabilize flaky tests, produce QA report and release recommendation.

#### Ongoing
- Per PR: unit + integration (fast suite)
- Per release: full regression (including E2E), plus targeted exploratory testing
- Nightly: long-running E2E + minimal performance checks

### 9. Test acceptance criteria
Release candidate is acceptable when:
- **All P0 tests pass** (unit + integration + E2E) with no known critical defects.
- No open **Critical/High** bugs in auth, authorization, decks/cards CRUD, duplicates, bulk save, or generate workflows.
- API consistently returns the documented error envelope and expected status codes for P0 endpoints.
- No evidence of cross-user data leakage (verified by automated ownership/RLS tests).
- E2E suite stability meets threshold (e.g., ≥ 95% pass rate across 3 consecutive runs).

### 10. Roles & responsibilities
- **QA Engineer**
  - Owns test plan, test case design, automation strategy, and release sign-off recommendations.
  - Maintains test environments/test data and monitors test flakiness.
- **Developers**
  - Provide unit tests for new logic, fix defects, support adding test hooks/mocks.
  - Ensure APIs preserve contracts and error codes.
- **Tech Lead**
  - Prioritizes defect fixes, approves test coverage scope, enforces CI gating rules.
- **Product/Design**
  - Validate UX flows and acceptance criteria; confirm copy/messaging for errors and empty states.
- **DevOps/Platform (as applicable)**
  - Staging/prod environment parity, secrets management, deploy pipelines, observability.

### 11. Bug reporting procedures
#### Reporting workflow
- File bugs as **GitHub Issues** (or the team’s tracker of choice) with labels:
  - `severity: critical/high/medium/low`
  - `area: auth/decks/cards/generate/ui/api/db`
  - `type: bug/regression/flaky-test/security`

#### Required bug fields
- **Title**: concise, action-oriented.
- **Environment**: local/staging/prod, browser + version, OS, build commit hash.
- **Preconditions**: account state, existing decks/cards, selected deck, etc.
- **Steps to reproduce**: numbered, minimal, deterministic.
- **Expected vs actual behavior**.
- **Evidence**:
  - screenshots/video (UI)
  - request/response payloads (API), include status + `error.code`
  - server logs excerpt (sanitize secrets)
  - correlation IDs if available (e.g., `x-request-id`)
- **Impact assessment**: user impact, data loss risk, security risk.

#### Triage + SLA (suggested)
- Critical (auth bypass/data leak/data loss): acknowledge ≤ 4h, fix ≤ 24–48h
- High: acknowledge ≤ 1 day, fix in current sprint
- Medium/Low: schedule per backlog priority

