## UI Architecture for 10x-cards

### 1. UI Structure Overview

10x-cards is organized as a **public marketing/auth area** and an **authenticated app area**. MVP UX is **Dashboard-first** (post-login default) with a dedicated **Generate** workflow and a **Deck detail** surface for card management. Generated candidates are **ephemeral client-side state** (optionally protected from refresh via `sessionStorage`), and “acceptance” is **bulk-only** via `POST /cards:bulkCreate`.

- **Route groups**
  - **Public**: landing + auth (no user data)
  - **App (auth-required)**: dashboard, generate, deck detail, settings
- **Global app shell (auth-required)**
  - **HeaderNav** (app routes only; excluded from `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`):
    - **Application name (brand)**: clickable link to `/dashboard` (this is the primary “go to dashboard” navigation; no separate Dashboard button)
    - **Current user**: show email + **Logout** button (calls `POST /api/auth/logout`, then redirect to `/`)
    - **Optional app controls (MVP+/later)**: **Current deck selector**, quick actions (Generate / Create deck), account menu (Settings)
  - **Content**: route outlet + shared feedback surfaces (toasts/alerts)
- **State model**
  - **Server state (cached queries)**: decks, deck detail, cards list (by deckId + filters), card mutations, deck mutations
  - **Client state (ephemeral workflow)**: generation source text, generation metadata, candidates, edits, selected set, save results summary
- **Auth & security boundary**
  - **Central auth boundary** for all app routes; unauthenticated users are redirected to Login with a return URL.
  - **Central API client wrapper** attaches `Authorization: Bearer <token>` and handles `401` (clear sensitive local state + redirect to Login).
- **Accessibility principles**
  - Dialogs are focus-trapped; keyboard-first flows for selection lists; visible focus rings; error messages are programmatically associated with inputs.
  - Primary actions remain reachable on mobile (sticky footer action bars where appropriate).
- **Scope alignment with session decisions**
  - **Dashboard MVP**: action hub only (Generate + Create deck + Decks overview). No analytics/recent activity widgets in MVP.
  - **Review/SRS UI**: deferred (even though PRD includes it; API plan notes missing SRS storage).
  - **Telemetry UI-side instrumentation**: deferred (even though endpoints exist).

#### Key requirements extracted from PRD (UI-relevant)

- **FR-001**: Generate from pasted text; show source text + candidates + generation metadata; allow edit/delete prior to saving.
- **FR-002**: Manual card creation with required fields and optional tags/deck.
- **FR-003**: Deck CRUD; browse/search/filter cards; edit/delete cards.
- **FR-004**: Email/password auth + password reset; safe error messaging.
- **FR-005**: SRS review scheduling UI (deferred in MVP due to schema).
- **FR-006**: Event instrumentation/analytics surfaces (deferred in MVP; endpoints exist).
- **FR-007**: GDPR account deletion UX (strong confirmation; irreversible; redirect to public landing).
- **FR-008**: Clear error handling for generation failures/timeouts/input limits; retry affordances.
- **FR-009**: Rate limit UX for generation; informative messaging.
- **FR-021**: Duplicate warnings (non-blocking in UI; robust handling of server duplicates/partial success).

#### Main API endpoints and their purposes (from API plan)

- **Decks**
  - `GET /decks`: list decks (search + pagination)
  - `POST /decks`: create deck
  - `GET /decks/{deckId}`: deck detail header context
  - `PATCH /decks/{deckId}`: rename/update (and optional soft-delete field)
  - `DELETE /decks/{deckId}`: hard-delete deck (cascades cards)
- **Cards**
  - `GET /cards`: list cards (deckId/tags/q/aiGenerated + pagination)
  - `POST /cards`: create a single card (manual or AI-origin)
  - `GET /cards/{cardId}`: read a card (optional for deep link)
  - `PATCH /cards/{cardId}`: edit card (may trigger duplicate conflict)
  - `DELETE /cards/{cardId}`: delete card
  - `POST /cards:bulkCreate`: bulk accept/save generated cards (partial success via created/skipped)
  - `POST /cards/duplicates:check`: warning-only duplicate check
  - `POST /cards/{cardId}/report`: report hallucination/incorrect (telemetry)
- **Generation**
  - `POST /generate/validate-input`: optional preflight input size validation
  - `POST /generate`: generate candidates (errors: input_too_large, timeout, rate_limited, model_error)
- **Account**
  - `POST /me/delete`: GDPR delete account + all data
- **Events / telemetry**
  - `GET /events`, `POST /events`, `DELETE /events/{eventId}` (not used by MVP UI)
- **Review sessions (vNext / deferred)**
  - `POST /review-sessions`, `POST /review-sessions/{sessionId}/answer` (blocked by missing SRS schema)

#### PRD user stories → UI coverage (MVP vs deferred)

- **Auth**
  - US-001 signup: **covered** (Signup view) → redirect to Dashboard (generate-first is initiated from Dashboard CTAs per session)
  - US-002 login: **covered** (Login view) → redirect to Dashboard
  - US-003 password reset: **covered** (Forgot + Reset views)
- **Generation + acceptance**
  - US-004 generate request: **covered** (Generate view)
  - US-005 review generated cards: **covered** (Generate view candidate list + edit/delete/select)
  - US-006 inline edit then save: **covered** (candidate editor + bulk save)
  - US-011 generation metadata view: **covered (session-level)** on Generate view; **card-level persistence deferred** (API plan recommends vNext `generation_meta`)
  - US-013 generation timeouts/errors: **covered** (error states + retry)
  - US-014 rate limits: **covered** (429 UX)
  - US-020 large input: **covered** (validate + inline limits messaging)
  - US-021 duplicates: **covered** (warning + robust bulkCreate results)
- **Decks + cards**
  - US-007 manual card creation: **covered** (Deck detail “New card”)
  - US-008 create/manage decks: **covered** (Dashboard deck list actions)
  - US-009 browse/search/filter: **covered** (Deck detail cards list filters)
  - US-015 delete card: **covered** (Deck detail confirm delete)
- **Review / SRS**
  - US-010 start a review session: **deferred** (view placeholder noted; blocked by SRS storage)
- **Telemetry / hallucination reporting**
  - US-012 report hallucination: **deferred** (endpoint exists; UI can be added later)
- **GDPR**
  - US-016 account deletion: **covered** (Settings deletion flow)
  - US-017 export before deletion: **out of scope** (optional; no API in plan)
- **Security**
  - US-018 prevent unauth access: **covered** via auth boundary + route guard patterns
  - US-019 login throttling: **partially covered** (UI error messaging; actual throttling is server-side)

### 2. View List

Below, “Auth-required” implies: guarded route + token-attached API calls + centralized 401 handling.

#### Public landing

- **View name**: Public Landing
- **View path**: `/`
- **Main purpose**: Provide entry to Login/Signup and explain the product briefly.
- **Key information to display**: Value proposition, primary CTAs (“Log in”, “Create account”), privacy/GDPR note.
- **Key view components**
  - CTA buttons to auth routes
  - Minimal FAQ/help links (optional)
- **UX, accessibility, and security considerations**
  - Clear CTAs; no private data rendered.
  - Ensure links are keyboard accessible and have descriptive labels.

#### Authentication

- **View name**: Login
- **View path**: `/login`
- **Main purpose**: Authenticate existing users.
- **Key information to display**: Email/password form, “Forgot password”, errors without field disclosure.
- **Key view components**
  - Login form (email, password)
  - Inline validation + error summary region (`aria-live`)
  - “Forgot password” link; “Create account” link
- **UX, accessibility, and security considerations**
  - Generic auth failure message (avoid revealing which field is wrong).
  - Rate-limit/throttle messaging should be calm and actionable.

- **View name**: Signup
- **View path**: `/signup`
- **Main purpose**: Create an account.
- **Key information to display**: Email/password requirements, terms/privacy links.
- **Key view components**
  - Signup form (email, password, confirm password)
  - Inline validation
- **UX, accessibility, and security considerations**
  - Avoid overly strict password rules in UI unless enforced server-side; clearly message failures.

- **View name**: Forgot Password
- **View path**: `/forgot-password`
- **Main purpose**: Request password reset.
- **Key information to display**: Email input, neutral confirmation state.
- **Key view components**
  - Email field + submit
  - “If an account exists…” confirmation (privacy)
- **UX, accessibility, and security considerations**
  - Do not reveal whether the email exists.

- **View name**: Reset Password
- **View path**: `/reset-password`
- **Main purpose**: Set new password using reset token/link.
- **Key information to display**: New password fields; success state leading to login/dashboard.
- **Key view components**
  - New password + confirm
  - Token invalid/expired error state
- **UX, accessibility, and security considerations**
  - Strong messaging for expired/used tokens; provide link back to Forgot Password.

#### Dashboard (MVP action hub)

- **View name**: Dashboard
- **View path**: `/dashboard` (canonical post-login path)
- **Main purpose**: Action hub for “Generate” + “Create deck” + Decks overview (MVP).
- **Key information to display**
  - Current deck context (selected deck name; or “No deck selected”)
  - Primary CTAs: “New generation”, “Create deck”
  - Decks list (searchable), with per-deck actions (rename/delete)
- **Key view components**
  - Current deck selector (shared header control; mirrored summary in page if desired)
  - Create deck dialog (name + optional description)
  - Decks overview list with:
    - Search input (`q` for `GET /decks`)
    - Deck row actions: rename, delete (confirm)
    - Link to deck detail (View deck)
  - Post-create deck success state: “Start generation in <deck>”
- **UX, accessibility, and security considerations**
  - Deck delete confirmation must be explicit; provide rollback messaging if delete fails.
  - Optimistic UI for rename/delete with error rollback.
  - Ensure actions are reachable by keyboard (menu buttons, dialogs).

#### Generate (dedicated workflow route)

- **View name**: Generate
- **View path**: `/dashboard/generate`
- **Main purpose**: Paste text → generate candidates → edit/select → bulk save to a deck.
- **Key information to display**
  - Source text input (with character count + max hint)
  - Generation metadata (timestamp, model label if available, input length)
  - Candidate list with selection state and duplicate warnings
  - Bulk save results summary (created vs skipped)
- **Key view components**
  - Current deck selector (must be visible; saving requires a selected deck)
  - Source text editor area
  - Optional preflight validation (calls `POST /generate/validate-input`)
  - Generate action with loading/progress + retry
  - Candidate cards list:
    - View: front/back preview, tags
    - Edit: inline editor (front/back/tags) with Save/Cancel
    - Delete candidate (client-side removal)
    - Select checkbox
    - Duplicate warning badge (from `POST /generate` duplicate field; optionally reinforced via `POST /cards/duplicates:check`)
  - Bulk action bar (sticky on mobile):
    - “Save selected” (calls `POST /cards:bulkCreate`)
    - Clear selection
    - Selected count
  - Post-save summary panel:
    - Created count + quick link “View deck”
    - Skipped duplicates list with reason and affordances to “Edit and retry”
- **UX, accessibility, and security considerations**
  - **Deck requirement**: if no current deck, “Save selected” triggers a deck selection prompt (modal) instead of failing silently.
  - Use `aria-live` for generation progress and save results.
  - Preserve work on accidental refresh/navigation (optional `sessionStorage`).
  - Do not expose tokens in rendered HTML; all calls go through the centralized client wrapper.

#### Deck detail (primary cards management surface)

- **View name**: Deck Detail
- **View path**: `/dashboard/decks/:deckId`
- **Main purpose**: Browse, search/filter, create/edit/delete cards in a deck; manage deck context.
- **Key information to display**
  - Deck header (name, optional description)
  - Card list with search, tag filters, pagination
  - Card CRUD actions
- **Key view components**
  - Deck header with actions:
    - Rename deck (optional here if not only on Dashboard)
    - Delete deck (confirm)
  - Cards toolbar:
    - Search input (`q` for `GET /cards`)
    - Tag filter chips / multi-select (maps to `tag`/`tags`)
    - Optional AI-generated filter (maps to `aiGenerated`)
  - Cards list:
    - Card row preview (front/back snippet, tags)
    - Edit (inline or modal) -> `PATCH /cards/{cardId}` (handle 409 duplicate_in_deck)
    - Delete (confirm) -> `DELETE /cards/{cardId}`
  - Manual card creation:
    - “New card” panel/modal with front/back/tags
    - Non-blocking duplicate check -> `POST /cards/duplicates:check`
    - Create -> `POST /cards` (handle 409 duplicate_in_deck)
  - Pagination controls (cursor-based)
- **UX, accessibility, and security considerations**
  - Cursor pagination must remain keyboard accessible (Next/Previous).
  - Provide empty states: “No cards yet” with CTAs to Generate or Create a card.
  - For destructive actions, require confirmation and clear success/failure messaging.

#### Settings (account + privacy)

- **View name**: Settings
- **View path**: `/dashboard/settings`
- **Main purpose**: Logout and GDPR account deletion (MVP).
- **Key information to display**
  - Account identity (email)
  - Logout action
  - “Delete account” section describing irreversibility and data loss
- **Key view components**
  - Logout button
  - GDPR deletion confirmation flow:
    - Step 1: “Delete account” opens modal
    - Step 2: explicit confirmation (typed phrase or checkbox + confirm)
    - Step 3: call `POST /me/delete { confirm: true }`
    - Step 4: show “Deleting…” state; then redirect to public landing
- **UX, accessibility, and security considerations**
  - Strong, unambiguous copy; avoid accidental activation.
  - Confirmation dialog must be fully keyboard accessible and announce risk clearly.

#### Deferred / future views (placeholders for architecture completeness)

- **View name**: Review Session (deferred)
- **View path**: `/dashboard/decks/:deckId/review`
- **Main purpose**: Conduct SRS reviews (blocked by missing SRS storage per API plan).
- **Key information to display**: Current card front/back reveal, grading buttons, session progress.
- **Key view components**: Review card, reveal interaction, rating controls, session end summary.
- **UX, accessibility, and security considerations**: Keyboard shortcuts; predictable focus; avoid accidental grading; handle session resume.

- **View name**: Report card issue (deferred)
- **View path**: (embedded action) in Deck detail or Generate
- **Main purpose**: Call `POST /cards/{cardId}/report`.

- **View name**: Events/telemetry viewer (deferred)
- **View path**: `/dashboard/debug/events` (admin/debug only)
- **Main purpose**: Inspect events via `GET /events`.

### 3. User Journey Map

#### Primary MVP journey: Generate → Bulk save → Manage deck

1. **Landing** (`/`) → user chooses **Signup** or **Login**.
2. **Signup/Login** → on success redirect to **Dashboard** (`/dashboard`).
3. **Dashboard**
   - If no deck exists, user clicks **Create deck** → `POST /decks` → deck becomes **current deck**.
   - User clicks **New generation** → navigates to **Generate** (`/dashboard/generate`).
4. **Generate**
   - User pastes text; optional preflight validate → `POST /generate/validate-input`.
   - User clicks **Generate** → `POST /generate` → candidates appear with duplicate warnings (if any).
   - User edits/removes some candidates; selects desired ones.
   - User clicks **Save selected**:
     - If no current deck: prompt to select a deck (then proceed).
     - Call `POST /cards:bulkCreate` with selected cards.
   - UI shows **results summary**:
     - Created cards are marked as saved and deselected.
     - Skipped duplicates remain selected with reason + “Edit and retry” path.
   - User optionally clicks **View deck** → navigates to `/dashboard/decks/:deckId`.
5. **Deck detail**
   - User searches/filters, edits or deletes cards as needed.

#### Secondary MVP journey: Manual card creation

1. Dashboard → select or create a deck → go to Deck detail.
2. Deck detail → “New card” → optional duplicate check → `POST /cards`.
3. If `409 duplicate_in_deck`, show inline error with options: edit content or cancel.

#### GDPR deletion journey

1. App shell → Settings.
2. Settings → Delete account → strong confirmation → `POST /me/delete`.
3. On success: clear local app state, redirect to `/` (logged out).

### 4. Layout and Navigation Structure

- **Top-level navigation model**
  - **Public routes**: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
  - **App routes (guarded)**: `/dashboard`, `/dashboard/generate`, `/dashboard/decks/:deckId`, `/dashboard/settings`
  - **Header visibility**: `HeaderNav` renders on all **App routes** and is intentionally not rendered on **Public routes**
- **Primary navigation entry points**
  - Dashboard CTAs: Generate, Create deck
  - Header deck selector: sets/changes current deck context everywhere
  - “View deck” links from Decks list and post-save summary
  - Account menu: Settings, Logout
- **Current deck context**
  - Visible in header on all app routes.
  - Used as default target for generation and saving; when absent, the UI blocks save actions with an explicit selection prompt.
- **Navigation resilience**
  - Generate route keeps workflow isolated; leaving the route may lose ephemeral state unless persisted (optional `sessionStorage`).
  - Centralized handling for `401` (redirect to Login with return URL); avoid partially-rendered private data.

### 5. Key Components

- **AuthBoundary (route guard)**: protects app routes; manages redirect-back and `401` handling behavior.
- **ApiClient / fetch wrapper**: attaches bearer token; normalizes errors; provides consistent “loading/error/empty” patterns.
- **AppShell**
  - **HeaderNav**: application name (brand) links to `/dashboard`; current user email + Logout (`POST /api/auth/logout`); optional deck selector; quick actions; account menu (Settings).
  - **GlobalFeedback**: toast/alert region for success/error summaries.
- **CurrentDeckSelector**: shared deck context control (dropdown/search); supports “no selection” state.
- **DecksOverview**
  - **DeckSearch** + **DeckList** + per-deck actions (rename/delete) with confirmation and optimistic updates.
- **GenerateWorkflow**
  - **SourceTextEditor** with char counter and validation messaging.
  - **GenerationMetaSummary** (timestamp/model/input length).
  - **CandidateList** + **CandidateCard** (select/edit/delete).
  - **BulkActionBar** (sticky) + **BulkSaveResultsSummary** (created vs skipped).
  - **DuplicateWarning** patterns (non-blocking) and retry/edit loop for skipped duplicates.
- **DeckDetailSurface**
  - **DeckHeader** + actions.
  - **CardFilters** (search + tags + aiGenerated).
  - **CardsTable/List** with cursor pagination controls.
  - **CardEditor** (create/edit) + **ConfirmDeleteDialog**.
- **SettingsSurface**
  - **LogoutAction**
  - **DangerZoneAccountDeletion** with typed confirmation and “deleting” progress state.

#### Explicit requirement → UI element mapping (high-signal)

- **FR-001 (Generate + candidate review)**: `GenerateWorkflow` (SourceTextEditor + CandidateList + BulkActionBar + ResultsSummary).
- **FR-002 (Manual creation)**: `DeckDetailSurface` → `CardEditor (create)`.
- **FR-003 (Deck/card management)**: `Dashboard` → `DecksOverview`; `DeckDetailSurface` → CardsTable/List + edit/delete + filters.
- **FR-004 (Auth + reset)**: `Login/Signup/Forgot/Reset` views + AuthBoundary redirect-back.
- **FR-007 (GDPR deletion UX)**: `SettingsSurface` → `DangerZoneAccountDeletion`.
- **FR-008 (Errors/timeouts/input limits)**: Generate view error states + retry; form validation; global feedback.
- **FR-009 (Rate limits)**: Generate view `429` messaging + disable/retry guidance.
- **FR-021 (Duplicate detection)**: DuplicateWarning in candidates + `cards/duplicates:check` in manual create + robust `409`/skipped handling.

