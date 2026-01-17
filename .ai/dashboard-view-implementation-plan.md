# View Implementation Plan: Dashboard

## 1. Overview
The **Dashboard** is the authenticated user’s MVP action hub. It provides:
- A **current deck context** (selected deck, used as the default target for generation and other flows)
- Primary CTAs: **New generation** and **Create deck**
- A **searchable decks overview** with per-deck actions (**rename**, **delete**) and navigation to deck details.

This view must align with the PRD constraints: **fast deck CRUD**, clear destructive-action confirmation, and protection of personal data via **authentication gating**.

## 2. View Routing
- **Canonical path**: `/dashboard`
- **Route file** (Astro): `src/pages/dashboard/index.astro`
- **Post-login redirect target**: `/dashboard` (use this as the “home” after successful login/signup)

### Auth gating (required)
The view must be **inaccessible** to unauthenticated users:
- If the server can reliably detect auth: redirect to `/login` before rendering any private UI.
- Otherwise (client-only auth): render a minimal shell, then on mount determine auth and redirect.

> Note: The current backend API handlers require auth (`401 unauthorized`), and the Dashboard must treat `401` as a **hard redirect to `/login`**.

## 3. Component Structure
High-level tree (Astro page + React islands where interactivity is needed):

```
/dashboard (src/pages/dashboard/index.astro)
└─ <Layout>
   └─ <DashboardView client:load />
      ├─ <DashboardHeader>
      │  ├─ <CurrentDeckSelector />
      │  └─ <PrimaryCtas>
      │     ├─ <NewGenerationLinkButton />
      │     └─ <CreateDeckButton /> -> opens <CreateDeckDialog />
      ├─ <CreateDeckDialog />
      ├─ <DecksSection>
      │  ├─ <DecksSearchBar />
      │  ├─ <DecksList>
      │  │  └─ <DeckRow /> (repeated)
     │  │     ├─ <DeckRowLink /> (/dashboard/decks/:deckId)
      │  │     └─ <DeckRowActions>
      │  │        ├─ Rename (inline or dialog)
      │  │        └─ Delete (confirm dialog)
      │  └─ <PaginationFooter> (Load more / next page)
      └─ <InlineErrorBanner aria-live="polite" />
```

## 4. Component Details

### DashboardView
- **Purpose**: Top-level interactive container; orchestrates fetching decks, current deck selection, and deck CRUD flows.
- **Main elements**:
  - `<main>` container with page title (visually and/or for screen readers)
  - Header region with current deck selector + CTAs
  - Decks section with search + list + pagination
  - Error banner (non-blocking) + per-action inline statuses
- **Handled events**:
  - `onMount`: load decks (initial list) and resolve current deck
  - `onSelectDeck(deckId)`
  - `onCreateDeckSubmit(command)`
  - `onRenameDeckSubmit(deckId, command)`
  - `onDeleteDeckConfirm(deckId)`
  - `onSearchChange(q)`
  - `onLoadMore()`
- **Validation conditions**:
  - Must enforce client-side constraints matching API Zod schemas (details below in each form component).
  - Must guard actions if a request is already in-flight (disable buttons, prevent double submits).
- **Types**:
  - DTO: `DeckListResponseDto`, `DeckDto`, `ApiErrorResponseDto`
  - ViewModel: `DashboardState`, `DeckListItemVm`, `DeckActionState`
- **Props**:
  - None (top-level view). Optional later: `initialSelectedDeckId?: string` (if driven by query params).

### DashboardHeader
- **Purpose**: Presents current deck context and primary CTAs.
- **Main elements**:
  - `<header>` with `CurrentDeckSelector`
  - CTA button row
- **Handled events**: delegates to children.
- **Validation conditions**: none (except disabled states passed from parent).
- **Types**: `DeckListItemVm[]`, `CurrentDeckVm`
- **Props**:
  - `decks: DeckListItemVm[]`
  - `currentDeck: CurrentDeckVm`
  - `onSelectDeck: (deckId: DeckId) => void`
  - `onOpenCreateDeck: () => void`
  - `newGenerationHref: string` (default `/dashboard/generate`)

### CurrentDeckSelector
- **Purpose**: Allows choosing the “current deck” used by downstream flows (Generate, etc.).
- **Main elements**:
  - A button-triggered popover/listbox or `<select>`-like control (Radix/shadcn style preferred)
  - List of deck options (name + optional description snippet)
  - Empty state: “No decks yet” with “Create deck”
- **Handled events**:
  - `onChange`: select deck
  - Optional: keyboard navigation (Arrow keys/Enter/Escape) if using custom listbox
- **Validation conditions**:
  - Selected deck must exist in the fetched deck list; if it doesn’t (e.g., deleted), fall back to “No deck selected”.
- **Types**:
  - `DeckListItemVm`
  - `CurrentDeckVm`
- **Props**:
  - `decks: DeckListItemVm[]`
  - `value: DeckId | null`
  - `onChange: (deckId: DeckId) => void`
  - `disabled?: boolean`

### PrimaryCtas
- **Purpose**: Primary actions: start generation or create a deck.
- **Main elements**:
  - “New generation” link/button → `/dashboard/generate`
  - “Create deck” button → opens `CreateDeckDialog`
- **Handled events**:
  - click “Create deck”
- **Validation conditions**:
  - None, but reflect loading states (e.g., disable while creating deck).
- **Types**: none beyond props.
- **Props**:
  - `onCreateDeckClick: () => void`
  - `newGenerationHref: string`
  - `disabled?: boolean`

### CreateDeckDialog
- **Purpose**: Create a new deck (name required, description optional).
- **Main elements**:
  - Dialog container with:
    - `<form>`
    - Name input (required)
    - Description textarea (optional)
    - Submit + Cancel buttons
    - Inline validation messages + top-level error banner
  - Post-create success micro-state (optional): “Start generation in <deck>”
- **Handled events**:
  - `onOpenChange`
  - `onSubmit` (POST `/api/decks`)
- **Validation conditions (must match API)**:
  - **name**: trim, required, length **1..120**
  - **description**: optional; if present trim; length **<= 2000**; allow `null`
  - Prevent submit if invalid; show field-level errors; keep an `aria-live` region for submit errors.
- **Types**:
  - DTO: `CreateDeckCommand`, `DeckDto`, `ApiErrorResponseDto`
  - VM: `CreateDeckFormVm`
- **Props**:
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
  - `onCreated: (deck: DeckDto) => void` (parent updates list + selects current deck)

### DecksSection
- **Purpose**: Wraps search + list + pagination.
- **Main elements**:
  - `<section>` with heading “Decks”
  - Search input
  - Deck list and paging controls
- **Handled events**: delegates to children.
- **Validation conditions**: none beyond children.
- **Types**: `DecksQueryVm`, `DeckListItemVm[]`
- **Props**:
  - `query: DecksQueryVm`
  - `onQueryChange: (query: DecksQueryVm) => void`
  - `decks: DeckListItemVm[]`
  - `page: DecksPageVm`
  - `onLoadMore: () => void`

### DecksSearchBar
- **Purpose**: Search decks by name/description via `q` query param.
- **Main elements**:
  - `<input type="search">` with clear button
  - Optional helper text showing result count
- **Handled events**:
  - `onChange`: update local value
  - debounced `onCommit`: triggers list refresh (GET `/api/decks?q=...`)
- **Validation conditions (must match API)**:
  - `q` must be trimmed; max length **<= 200**; if empty after trim → omit from query.
- **Types**: `DecksQueryVm`
- **Props**:
  - `value: string`
  - `onChange: (value: string) => void`
  - `disabled?: boolean`

### DecksList
- **Purpose**: Render list of decks and row actions.
- **Main elements**:
  - `<ul>` or `<table>` (prefer `<ul>` + cards for mobile friendliness)
  - Empty states:
    - No decks (initial): “Create your first deck”
    - No search results: “No decks match ‘{q}’”
- **Handled events**: delegates per row.
- **Validation conditions**: none.
- **Types**: `DeckListItemVm[]`, `DeckActionStateById`
- **Props**:
  - `decks: DeckListItemVm[]`
  - `actions: DeckActionStateById`
  - `onRename: (deckId: DeckId, patch: UpdateDeckCommand) => void`
  - `onDelete: (deckId: DeckId) => void`
  - `onSelect: (deckId: DeckId) => void` (optional convenience)

### DeckRow
- **Purpose**: Deck preview + actions + navigation.
- **Main elements**:
  - Deck title (name)
  - Optional description excerpt
  - “View deck” link to `/dashboard/decks/{deckId}`
  - Actions menu/buttons: Rename, Delete
- **Handled events**:
  - click “View deck”
  - rename (inline edit submit or dialog submit)
  - delete (open confirm → confirm)
- **Validation conditions (rename must match API)**:
  - **PATCH `/api/decks/:deckId`**:
    - Must send at least one field
    - `name` if provided: trim; length **1..120**
    - `description` if provided: trim; length **<= 2000**; may be `null`
  - **deckId must be a UUID** (front-end should treat ids as opaque; do not allow empty/invalid ids in actions)
- **Types**:
  - DTO: `DeckDto`, `UpdateDeckCommand`
  - VM: `DeckListItemVm`, `DeckActionState`
- **Props**:
  - `deck: DeckListItemVm`
  - `actionState: DeckActionState`
  - `onRename: (deckId: DeckId, patch: UpdateDeckCommand) => void`
  - `onDelete: (deckId: DeckId) => void`

### DeleteDeckConfirmDialog
- **Purpose**: Explicit confirmation for irreversible delete (hard delete).
- **Main elements**:
  - Dialog with strong copy (irreversible, cascades to cards)
  - Confirm button requiring explicit intent (optionally require typing deck name)
- **Handled events**:
  - confirm → DELETE `/api/decks/:deckId`
- **Validation conditions**:
  - Ensure deck still exists in local state when confirming; otherwise close dialog.
- **Types**: `DeckId`
- **Props**:
  - `open: boolean`
  - `deckName: string`
  - `onConfirm: () => void`
  - `onOpenChange: (open: boolean) => void`

### PaginationFooter
- **Purpose**: Cursor pagination for decks list.
- **Main elements**:
  - “Load more” button (uses `nextCursor`)
  - Optional “Refresh” button
- **Handled events**:
  - load more
- **Validation conditions (must match API)**:
  - `limit` must be integer **1..100**; default **25**
  - `cursor` is opaque; treat as string; if API returns `400 invalid_input` with “Invalid pagination cursor”, clear cursor and refetch first page.
- **Types**: `DecksPageVm`
- **Props**:
  - `hasMore: boolean`
  - `loading: boolean`
  - `onLoadMore: () => void`

## 5. Types
Use existing shared types from `src/types.ts` wherever possible.

### Existing DTOs (use as-is)
- **`DeckDto`**: `Tables<"decks">`
- **`DeckListResponseDto`**: `ListResponseDto<DeckDto>`
- **`CreateDeckCommand`**: `Pick<DeckEntity, "name" | "description">`
- **`UpdateDeckCommand`**: `Partial<Pick<DeckEntity, "name" | "description" | "deleted_at">>`
- **`ApiErrorResponseDto`**: `{ error: { code, message, details? } }`
- **`DeckId`**: `DeckDto["id"]` (UUID string)

### New ViewModel / UI types (recommended)

#### `DeckListItemVm`
Purpose: deck row rendering without leaking DB naming concerns into JSX.
- `id: DeckId`
- `name: string`
- `description: string | null`
- `deletedAt: string | null` (from `deleted_at`)
- `updatedAt: string` (from `updated_at`)

#### `CurrentDeckVm`
Purpose: consistent “current deck context” state.
- `deckId: DeckId | null`
- `deckName: string | null`

#### `DeckActionState`
Purpose: track per-deck optimistic updates and in-flight operations.
- `isRenaming: boolean`
- `isDeleting: boolean`
- `optimisticName?: string`
- `optimisticDescription?: string | null`
- `error?: string` (row-scoped error message)

#### `DeckActionStateById`
- `Record<DeckId, DeckActionState>`

#### `DecksQueryVm`
Purpose: query state for list endpoint.
- `q: string` (raw input value; trimmed before request)
- `limit: number` (default 25)
- `cursor: string | null`
- `sort: "created_at" | "updated_at"` (default `"created_at"`)
- `order: "asc" | "desc"` (default `"desc"`)
- `includeDeleted: boolean` (default false; likely not exposed in MVP UI)

#### `DecksPageVm`
Purpose: normalized paging info for UI.
- `nextCursor: string | null`
- `limit: number`

#### `CreateDeckFormVm`
Purpose: local form state + validation messages.
- `name: string`
- `description: string` (UI uses empty string; convert to `null` when sending if empty)
- `errors: { name?: string; description?: string; form?: string }`
- `submitting: boolean`

## 6. State Management
Implement state in a **single React island** (`DashboardView`) using a dedicated hook to keep concerns separated.

### Suggested hooks

#### `useDecksList()`
Responsibilities:
- Maintain list query (`DecksQueryVm`) and results (`DeckListItemVm[]`, `DecksPageVm`)
- Fetch initial list and subsequent pages (cursor-based)
- Apply search debounce (e.g., 250–400ms)
- Provide `refresh()` and `loadMore()` helpers

State (minimum):
- `query: DecksQueryVm`
- `decks: DeckListItemVm[]`
- `page: DecksPageVm`
- `loadingInitial: boolean`
- `loadingMore: boolean`
- `error: string | null`

#### `useCurrentDeck()`
Responsibilities:
- Track and persist selected deck (e.g., `localStorage` key `currentDeckId`)
- Ensure selection remains valid if deck list changes (e.g., deleted)
- Expose `currentDeck: CurrentDeckVm` and `setCurrentDeck(deckId)`

### Optimistic updates strategy
- **Rename**: update `DeckActionState.optimisticName` immediately; call PATCH; on success, replace deck in list with returned `DeckDto`; on error, rollback optimistic value and show row error.
- **Delete**: remove deck from list immediately; call DELETE; on error, restore deck in list and show row error.

## 7. API Integration
All calls use JSON and must handle `ApiErrorResponseDto` when non-2xx.

### Endpoints used by Dashboard

#### List decks
- **Request**: `GET /api/decks?limit=&cursor=&sort=&order=&q=&includeDeleted=`
- **Response (200)**: `DeckListResponseDto`
- **Errors**:
  - `401 unauthorized` → redirect to `/login`
  - `400 invalid_input` (e.g., invalid cursor) → clear cursor and retry from first page; show banner if repeated

#### Create deck
- **Request**: `POST /api/decks`
  - Body: `CreateDeckCommand`
- **Response (201)**: `DeckDto`
- **Errors**:
  - `400 invalid_input` → show field errors if derivable; otherwise show form error
  - `401 unauthorized` → redirect to `/login`

#### Rename / update deck
- **Request**: `PATCH /api/decks/:deckId`
  - Body: `UpdateDeckCommand` (send only changed fields)
- **Response (200)**: `DeckDto`
- **Errors**:
  - `400 invalid_input` → show row-scoped error; rollback
  - `404 not_found` → treat as removed; remove from list and clear current deck if it was selected
  - `401 unauthorized` → redirect to `/login`

#### Delete deck
- **Request**: `DELETE /api/decks/:deckId`
- **Response (204)**: no body
- **Errors**:
  - `404 not_found` → treat as already deleted; keep removed from list
  - `401 unauthorized` → redirect to `/login`

### Recommended client wrapper (to keep UI simple)
Create a small typed helper (e.g., `src/lib/http/client.ts`) that:
- Calls `fetch()`
- If `!res.ok`, parses `ApiErrorResponseDto` and throws a typed error containing `status`, `code`, `message`, `details`
- Returns typed JSON for success responses (or `null` for 204)

## 8. User Interactions
- **Load Dashboard**:
  - Decks list loads (shows skeleton/spinner)
  - Current deck is resolved from persisted selection (or “No deck selected”)
- **Search decks**:
  - User types in search input
  - After debounce, list refreshes with `q` applied and cursor reset
  - Empty state shown if no matches
- **Select current deck**:
  - User chooses deck from selector
  - Selection persists (local storage) and updates header context immediately
- **Create deck**:
  - User opens dialog → fills form → submit
  - On success:
    - New deck appears at top (or refresh list)
    - Current deck becomes the newly created deck
    - Show success affordance: “Start generation in <deck>” (link to `/dashboard/generate`)
- **Rename deck**:
  - User triggers rename → edits name (and optional description if supported)
  - On submit:
    - Optimistic update applies
    - On success: commit returned `DeckDto`
    - On failure: rollback + show row error
- **Delete deck**:
  - User triggers delete → confirm dialog
  - On confirm:
    - Remove from list optimistically
    - If deleted deck was current deck: clear current deck selection
    - On failure: restore + show error
- **Navigate to deck detail**:
  - Clicking “View deck” goes to `/dashboard/decks/:deckId`

## 9. Conditions and Validation
All conditions below must be verified in the UI to prevent avoidable API errors.

### Query validation (GET `/api/decks`)
- **`q`**:
  - Trim whitespace
  - If empty after trim → omit
  - Must be `<= 200` chars
- **`limit`**:
  - Integer `1..100` (default 25)
- **`cursor`**:
  - Opaque string; only use values returned as `page.nextCursor`
- **`includeDeleted`**:
  - Default false; do not expose unless required by UX

### Create deck validation (POST `/api/decks`)
- **Name**:
  - Required, trimmed, length `1..120`
- **Description**:
  - Optional, trimmed, `<= 2000`
  - Treat empty string as `null` when sending

### Rename deck validation (PATCH `/api/decks/:deckId`)
- Must send at least one field (avoid empty PATCH)
- Reuse the same name/description constraints as create

### Authorization conditions
- All endpoints require authentication.
- Frontend must handle:
  - `401` by redirecting to `/login` and optionally storing a “returnTo=/dashboard” hint.

## 10. Error Handling
Handle errors at the right granularity and keep the UI recoverable:

- **Global list load failure**:
  - Show an inline banner with “Retry”
  - Keep last known list if available
- **Create deck failure**:
  - Show field-level errors where possible
  - Show a form-level error message from `ApiErrorResponseDto.error.message`
- **Rename/delete failure (row-scoped)**:
  - Roll back optimistic UI
  - Show row-scoped message near the action controls
- **401 unauthorized**:
  - Immediately navigate to `/login`
- **400 invalid cursor**:
  - Clear cursor and refetch first page once; if repeated, show banner and stop auto-retrying
- **404 not_found on update/delete**:
  - Treat as already gone; remove from UI; clear current deck if it matches

Accessibility requirements:
- Errors should be announced via `aria-live="polite"` (global) and `aria-live="assertive"` for form submit failures.
- Dialog focus must:
  - Move to the dialog on open
  - Return to the triggering button on close

## 11. Implementation Steps
1. **Create the route** `src/pages/dashboard/index.astro` and mount a React island `DashboardView` under `Layout`.
2. **Add a typed API client helper** (recommended) that handles `ApiErrorResponseDto` and 204 responses consistently.
3. **Implement `useDecksList()`**:
   - Build query serialization for `/api/decks`
   - Implement `refresh()` and `loadMore()` using cursor pagination
   - Add debounced search behavior (reset cursor on new `q`)
4. **Implement `useCurrentDeck()`**:
   - Persist deck id to `localStorage`
   - Validate selection against fetched decks and clear if missing
5. **Build `DashboardHeader` + `CurrentDeckSelector` + `PrimaryCtas`** with accessible keyboard interactions.
6. **Build `CreateDeckDialog`**:
   - Client-side validation matching API constraints
   - POST `/api/decks` integration
   - On success: close dialog, update decks list, set current deck, show success CTA
7. **Build `DecksSearchBar` + `DecksList` + `DeckRow`**:
   - Empty/loading states
  - “View deck” link routing (`/dashboard/decks/:deckId`)
8. **Add rename flow** (inline or dialog) with optimistic update:
   - PATCH `/api/decks/:deckId`
   - Rollback and row error on failure
9. **Add delete flow** with explicit confirmation:
   - DELETE `/api/decks/:deckId`
   - Optimistic removal + rollback
10. **Polish UX + a11y**:
   - `aria-live` regions, focus management, disabled states during requests
11. **Verify edge cases**:
   - Delete current deck
   - Search with whitespace / >200 chars
   - Rapid rename/delete clicks (double-submit protection)
   - Invalid cursor recovery

