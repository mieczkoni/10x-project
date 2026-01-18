## View Implementation Plan — Deck Detail

## 1. Overview
The **Deck Detail** view allows an authenticated user to browse and manage a single deck and its cards. It supports:
- Viewing deck metadata (name, optional description)
- Browsing cards with **search**, **tag filtering**, optional **AI-generated** filtering, and **cursor-based pagination**
- Card CRUD: create (manual), edit, delete
- Deck actions: rename and delete (current deck is set automatically on entry)

This view must align with existing patterns in the app:
- Use `fetchJson` (`src/lib/http/client.ts`) for API calls and `ApiError` handling
- Redirect to `/login` on `401`
- Handle cursor pagination errors similarly to `useDecksList`

## 2. View Routing
- **Route path (user-facing)**: `/dashboard/decks/:deckId`
- **Astro page file**: `src/pages/dashboard/decks/[deckId].astro`
- **React view entry**: `src/components/views/deck/DeckDetailView.tsx` (new)
- **Navigation already exists**: `DeckRow` links to `/dashboard/decks/${deck.id}`

Astro page responsibilities:
- Read `deckId` from `Astro.params.deckId`
- Render `<Layout title="Deck" />` and mount the React view with `client:load`
- Pass `deckId` as a prop to the React view (string, validated in the view)

## 3. Component Structure
High-level hierarchy (new components marked as “new”):

```
Layout.astro
└─ DeckDetailView (React, new)
   ├─ DeckDetailHeader (new)
   │  ├─ RenameDeckDialog (reuse existing)
   │  └─ DeleteDeckConfirmDialog (reuse existing)
   ├─ CardsToolbar (new)
   │  ├─ CardsSearchInput (new)
   │  ├─ TagFilter (new)
   │  ├─ AiGeneratedFilter (new)
   │  └─ NewCardButton (new)
   ├─ NewCardDialog (new)
   ├─ CardsList (new)
   │  └─ CardRow (new, repeated)
   │     ├─ EditCardButton (new)
   │     └─ DeleteCardButton (new)
   ├─ EditCardDialog (new)
   └─ CardsPagination (new; cursor-based Prev/Next with history)
```

Optional (nice-to-have, not required for MVP):
- `HighlightedText` helper to emphasize matches for `q` (PRD US-009)

## 4. Component Details

### DeckDetailView (new)
- **Description**: Container view that orchestrates deck loading, cards query state, CRUD actions, and dialog states.
- **Main elements**:
  - `<main>` wrapper (match Dashboard layout, e.g. `max-w-5xl`, padding)
  - Conditional states: loading skeleton, error state, not-found state
  - Renders `DeckDetailHeader`, `CardsToolbar`, `CardsList`, `CardsPagination`
- **Handled events**:
  - On mount: fetch deck (`GET /api/decks/:deckId`) + fetch cards (`GET /api/cards?...`)
  - On deck load success: set `localStorage.currentDeckId = deck.id`
  - On query change (search/tags/aiGenerated): refresh cards list
  - On pagination Next/Prev: fetch next/prev page using cursor history
  - On deck rename/delete: invoke dialogs and apply optimistic UI patterns
  - On card create/edit/delete: invoke dialogs and update list optimistically
- **Validation conditions**:
  - **Route param**: if `deckId` is not a UUID, treat as invalid route and show “Not found” (do not spam API with invalid UUID).
  - **Cards query**:
    - `q` max 200 chars (trimmed), otherwise show inline validation error and skip request.
    - `limit` clamped to [1, 100] (default 25).
    - Tags normalized client-side to match API (trim + lowercase + dedupe).
- **Types**:
  - DTOs: `DeckDto`, `DeckId`, `CardDto`, `CardId`, `CardListResponseDto`, `ApiErrorResponseDto`
  - Commands: `UpdateDeckCommand`, `CreateCardCommand`, `UpdateCardCommand`, `CheckCardDuplicateCommand`
  - ViewModels (new): `DeckDetailVm`, `CardsQueryVm`, `CardsPageVm`, `CardListItemVm`, `CardActionStateById`, `CardEditorFormVm`, `DuplicateWarningVm`
- **Props**:
  - `deckId: string` (raw param from Astro; validated inside component)

### DeckDetailHeader (new)
- **Description**: Shows deck name/description and deck-level actions (rename, delete).
- **Main elements**:
  - `<header>` containing:
    - `<h1>` deck name
    - `<p>` optional description
    - Action buttons group
- **Handled events**:
  - “Rename” → open `RenameDeckDialog`
  - “Delete” → open `DeleteDeckConfirmDialog`
- **Validation conditions**:
  - Disable actions while deck is loading or while a deck action is in-flight.
  - Rename validation mirrors API:
    - name: trimmed, 1–120 chars
    - description: trimmed, max 2000 chars; empty string becomes `null`
- **Types**:
  - DTO: `DeckDto`
  - Command: `UpdateDeckCommand`
  - VM: `DeckDetailVm`, `DeckActionVm`
- **Props**:
  - `deck: DeckDetailVm`
  - `action: DeckActionVm`
  - `onRename: (patch: UpdateDeckCommand) => Promise<void>`
  - `onDelete: () => Promise<void>`

### CardsToolbar (new)
- **Description**: Controls for browsing cards (search, tag filters, aiGenerated filter) and opening “New card”.
- **Main elements**:
  - `<section>` with:
    - Search input (`type="search"`)
    - Tag filter chips / multi-select UI
    - AI-generated filter (tri-state: All / AI only / Manual only)
    - “New card” button
- **Handled events**:
  - Search input change → update query state (debounced) → refresh list
  - Tag selection change → refresh list
  - AI filter change → refresh list
  - “New card” → open `NewCardDialog`
- **Validation conditions**:
  - Search query max length 200 (client-enforced via `maxLength` + inline helper)
  - Tag normalization: `tag.trim().toLowerCase()`; empty tags ignored; dedupe selection
- **Types**:
  - DTO: `DeckId`
  - VM: `CardsQueryVm`, `TagOptionVm`
- **Props**:
  - `query: CardsQueryVm`
  - `availableTags: TagOptionVm[]` (derived from loaded cards; see State Management)
  - `disabled?: boolean`
  - `onQueryChange: (next: Partial<CardsQueryVm>) => void`
  - `onOpenNewCard: () => void`

### NewCardDialog (new)
- **Description**: Modal form to create a new card in the current deck, with non-blocking duplicate check.
- **Main elements**:
  - `<div role="dialog" aria-modal="true">`
  - `<form>` with:
    - `front` textarea/input
    - `back` textarea
    - tags input (comma-separated input or chip input)
    - duplicate warning panel (non-blocking)
    - submit + cancel buttons
- **Handled events**:
  - Form input change → update local form state
  - Debounced duplicate check trigger (when `front` and `back` are both valid non-empty) → `POST /api/cards/duplicates/check`
  - Submit → `POST /api/cards`
  - Close → reset form
- **Validation conditions (must match API / Zod)**:
  - `front`: trim, required, 1–2000 chars
  - `back`: trim, required, 1–10000 chars
  - `tags`: max 20; each max 50 chars; normalize (trim + lowercase + dedupe)
  - `deck_id`: must be UUID (from route/deck state)
  - `ai_generated`: must be `false` for manual creation
  - Do not block submission based on duplicate-check response; it’s informational only.
  - On submit, handle server `409 duplicate_in_deck` as a blocking error (identical duplicate cannot be saved).
- **Types**:
  - Command: `CreateCardCommand`, `CheckCardDuplicateCommand`
  - DTO: `CardDto`, `CheckCardDuplicateResponseDto`
  - VM: `CardEditorFormVm`, `DuplicateWarningVm`
- **Props**:
  - `open: boolean`
  - `deckId: DeckId`
  - `onOpenChange: (open: boolean) => void`
  - `onCreated: (card: CardDto) => void` (optimistic insert into list or trigger refresh)

### CardsList (new)
- **Description**: Displays current page of cards with row actions.
- **Main elements**:
  - `<section>`
  - `<ul>` list of cards
  - Empty state content when no cards match:
    - “No cards yet” (if no filters and 0 total in deck)
    - “No results” (if query filters yield empty)
    - CTA buttons: “New card” and (optional) “Generate cards”
- **Handled events**:
  - Edit click → open `EditCardDialog` with selected card
  - Delete click → open confirm then call delete
- **Validation conditions**:
  - Disable row actions while action for that `cardId` is in-flight
- **Types**:
  - DTO: `CardDto`, `CardId`
  - VM: `CardListItemVm`, `CardActionStateById`
- **Props**:
  - `cards: CardListItemVm[]`
  - `actions: CardActionStateById`
  - `loading: boolean`
  - `error: string | null`
  - `onEdit: (cardId: CardId) => void`
  - `onDelete: (cardId: CardId) => void`
  - `onOpenNewCard: () => void`

### CardRow (new)
- **Description**: Single card preview row: front/back snippet, tags, metadata badges, row actions.
- **Main elements**:
  - `<li>` container
  - front/back preview (truncate)
  - tags chips
  - optional badge: AI-generated (`card.ai_generated === true`)
  - Edit / Delete buttons
- **Handled events**:
  - Edit button click
  - Delete button click
- **Validation conditions**:
  - Ensure button labels are accessible (text labels or `aria-label`)
  - Keyboard support: buttons focusable; list navigable
- **Types**:
  - VM: `CardListItemVm`
- **Props**:
  - `card: CardListItemVm`
  - `actionState?: CardActionState`
  - `onEdit?: (cardId: CardId) => void`
  - `onDelete?: (cardId: CardId) => void`

### EditCardDialog (new)
- **Description**: Modal editor for a card. Saves via `PATCH /api/cards/:cardId`.
- **Main elements**:
  - `<div role="dialog" aria-modal="true">`
  - `<form>` with:
    - front, back, tags inputs
    - Save / Cancel
    - error panel for API errors (incl. duplicate conflict)
- **Handled events**:
  - Submit → call update endpoint
  - Close → reset state
- **Validation conditions (must match API / Zod)**:
  - Patch body must include at least one field
  - If front/back provided, enforce:
    - front: 1–2000 chars
    - back: 1–10000 chars
  - tags: max 20; each max 50; normalized
  - Handle server `409 duplicate_in_deck` (updated content matches an existing card) with clear UI guidance
- **Types**:
  - Command: `UpdateCardCommand`
  - DTO: `CardDto`
  - VM: `CardEditorFormVm`
- **Props**:
  - `open: boolean`
  - `card: CardDto | null`
  - `onOpenChange: (open: boolean) => void`
  - `onSaved: (updated: CardDto) => void`

### CardsPagination (new)
- **Description**: Cursor-based **Next/Previous** controls, with keyboard accessibility.
- **Main elements**:
  - `<nav aria-label="Cards pagination">`
  - Previous button (disabled when no previous cursor)
  - Next button (disabled when `nextCursor` is null)
  - Optional: “Refresh” button
- **Handled events**:
  - Next → load next page with `cursor = page.nextCursor` and push current cursor onto a stack
  - Previous → pop from cursor stack and load previous cursor
- **Validation conditions**:
  - Prevent double-click while loading
  - If API returns invalid cursor (400 `invalid_input` mentioning cursor), reset to first page and clear cursor history
- **Types**:
  - VM: `CardsPageVm`
- **Props**:
  - `page: CardsPageVm`
  - `loading: boolean`
  - `onNext: () => Promise<void>`
  - `onPrev: () => Promise<void>`
  - `onRefresh: () => Promise<void>`

## 5. Types
Reused DTOs/commands (existing in `src/types.ts`):
- **Deck**:
  - `DeckDto`, `DeckId`
  - `UpdateDeckCommand`
- **Cards**:
  - `CardDto`, `CardId`
  - `CardListResponseDto`
  - `CreateCardCommand`, `UpdateCardCommand`
  - `CheckCardDuplicateCommand`, `CheckCardDuplicateResponseDto`
- **Errors**:
  - `ApiErrorResponseDto`, `ApiErrorDto`

New ViewModels (create in `src/components/views/deck/deck-detail.types.ts` (new)):

- **`DeckDetailVm`**
  - `id: DeckId`
  - `name: string`
  - `description: string | null`
  - `deletedAt: string | null`
  - `updatedAt: string`
  - Purpose: lightweight view model (consistent naming and optional computed flags)

- **`DeckActionVm`**
  - `isRenaming: boolean`
  - `isDeleting: boolean`
  - `error?: string`
  - Purpose: deck-level action UI state

- **`CardListItemVm`**
  - `id: CardId`
  - `front: string`
  - `back: string`
  - `tags: string[]`
  - `aiGenerated: boolean`
  - `updatedAt: string`
  - Purpose: list rendering, with normalized field names (`aiGenerated` vs `ai_generated`)

- **`CardActionState`**
  - `isUpdating: boolean`
  - `isDeleting: boolean`
  - `error?: string`
  - Purpose: per-card optimistic operations

- **`CardActionStateById`**
  - `Record<CardId, CardActionState>`

- **`CardsQueryVm`**
  - `q: string` (raw input, max 200)
  - `tags: string[]` (normalized, selected tags)
  - `aiGenerated: "all" | "ai" | "manual"` (UI-friendly tri-state)
  - `limit: number` (default 25; clamp 1–100)
  - `sort: "created_at" | "updated_at"` (default `"created_at"`)
  - `order: "asc" | "desc"` (default `"desc"`)
  - Purpose: state driving `GET /api/cards` query string

- **`CardsPageVm`**
  - `nextCursor: string | null`
  - `limit: number`
  - `cursorStack: string[]` (history for Previous; store cursors used to reach current page)

- **`TagOptionVm`**
  - `value: string` (normalized)
  - `label: string` (display)
  - `count?: number` (optional, derived from current dataset)

- **`DuplicateWarningVm`**
  - `status: "idle" | "checking" | "ok" | "duplicate" | "error"`
  - `isDuplicate: boolean`
  - `duplicateCard?: { id: CardId; front: string; back: string } | null`
  - `message?: string`
  - Purpose: drive non-blocking duplicate UI in New/Edit forms

- **`CardEditorFormVm`**
  - `front: string`
  - `back: string`
  - `tagsText: string` (for simple comma-separated input UX) OR `tags: string[]` (chip input)
  - `errors: { front?: string; back?: string; tags?: string; form?: string }`
  - `submitting: boolean`
  - Purpose: shared between New/Edit dialogs

Mapping helpers (same file):
- `toDeckDetailVm(deck: DeckDto): DeckDetailVm`
- `toCardListItemVm(card: CardDto): CardListItemVm`
- `toCreateCardCommand(deckId: DeckId, form: CardEditorFormVm): CreateCardCommand`
- `toUpdateCardCommand(form: CardEditorFormVm, original: CardDto): UpdateCardCommand` (only include changed fields; enforce “at least one field”)

## 6. State Management
Use local component state + a dedicated hook for cards querying to keep concerns separated.

Recommended hooks (new):

### `useDeck(deckId: DeckId | null)`
- **Purpose**: Load deck data with `GET /api/decks/:deckId` and expose `deck`, `loading`, `error`, `refresh`.
- **Error policy**:
  - `401` → redirect `/login`
  - `404` → set `notFound` state for view
  - others → show generic error and allow retry

### `useCardsList(query: CardsQueryVm, deckId: DeckId | null)`
- **Purpose**: Fetch paginated cards list for a deck with filtering/search.
- **Behavior**:
  - Debounce `q` (similar to `useDecksList`, e.g. 350ms).
  - When filters change (q/tags/aiGenerated/sort/order/limit), refresh from first page and clear `cursorStack`.
  - `next()` pushes the current cursor onto stack and loads `page.nextCursor`.
  - `prev()` pops from stack and loads previous cursor (or first page when stack empties).
  - On invalid cursor error (400 `invalid_input` mentioning “cursor”), clear stack and refresh.
- **State**:
  - `cards: CardListItemVm[]`
  - `page: CardsPageVm`
  - `loadingInitial: boolean`
  - `loadingPage: boolean` (for next/prev)
  - `error: string | null`

### `useDuplicateCheck(deckId: DeckId, front: string, back: string)`
- **Purpose**: Debounced non-blocking duplicate check using `POST /api/cards/duplicates/check`.
- **Rules**:
  - Only run when `front.trim().length > 0` and `back.trim().length > 0`
  - Debounce (e.g. 350–500ms)
  - Treat errors as “warning unavailable” but never block save

Derived data:
- **`availableTags`**: derive from `cards` currently loaded (or optionally accumulate across pages). For MVP, derive from current loaded page + selected tags so selected tags remain visible even if not present in current page.

## 7. API Integration
All requests use `fetchJson` and handle `ApiError`.

### Deck endpoint (provided)
- **GET** `/api/decks/:deckId`
  - **Response**: `DeckDto`
  - **Frontend usage**: load header data and validate deck existence/ownership
- **PATCH** `/api/decks/:deckId`
  - **Request**: `UpdateDeckCommand`
  - **Response**: `DeckDto`
  - **Frontend usage**: rename/update description; optimistic UI optional
- **DELETE** `/api/decks/:deckId`
  - **Response**: `null` (HTTP 204)
  - **Frontend usage**: after success, redirect to `/dashboard` and clear current deck if it matches

### Cards endpoints (required by view)
- **GET** `/api/cards?deckId=...&q=...&tags=...&aiGenerated=...&limit=...&cursor=...`
  - **Response**: `CardListResponseDto`
  - **Notes**:
    - `q` max 200
    - `aiGenerated` must be `"true"` or `"false"` when set
    - tags can be passed as `tags=tag1,tag2` or repeatable `tag`
- **POST** `/api/cards`
  - **Request**: `CreateCardCommand` (manual creation sets `ai_generated: false`)
  - **Response**: `CardDto` (HTTP 201)
  - **Errors**:
    - `404 deck_not_found` if deck missing/not owned
    - `409 duplicate_in_deck` if identical content exists
- **PATCH** `/api/cards/:cardId`
  - **Request**: `UpdateCardCommand`
  - **Response**: `CardDto`
  - **Errors**:
    - `409 duplicate_in_deck` if updated content matches another card
- **DELETE** `/api/cards/:cardId`
  - **Response**: `null` (HTTP 204)
- **POST** `/api/cards/duplicates/check`
  - **Request**: `CheckCardDuplicateCommand`
  - **Response**: `CheckCardDuplicateResponseDto`

## 8. User Interactions
- **Open Deck Detail**:
  - Loads deck header + first page of cards
  - If unauthenticated, user is redirected to `/login`
  - If deck not found, show not-found state with link back to dashboard

- **Set current deck (automatic)**:
  - Entering the deck view sets `localStorage.currentDeckId` to this deck id
  - No explicit control is shown in the header

- **Rename deck**:
  - Opens rename modal
  - On save, sends `PATCH /api/decks/:deckId`
  - On success, header updates
  - On error, show inline error within dialog or header alert

- **Delete deck**:
  - Opens confirm modal (must warn about irreversible delete)
  - On confirm, sends `DELETE /api/decks/:deckId`
  - On success, redirect `/dashboard` (and clear current deck id if it matches)

- **Search cards**:
  - Typing updates `q` (debounced)
  - Shows helper text and character count
  - Refreshes cards list from first page

- **Filter by tags**:
  - Selecting one or more tags narrows results
  - Provide “Clear filters” action

- **Filter by AI-generated**:
  - Tri-state toggle: All / AI only / Manual only

- **Pagination**:
  - Next loads next cursor page; Previous navigates back via local cursor history stack
  - Controls are keyboard accessible (buttons) and announce loading state (e.g. `aria-live="polite"`)

- **Create new card**:
  - Opens New Card dialog
  - Duplicate check runs as user types (non-blocking warning)
  - Submit creates card; on success, insert into list (optimistic) or refresh page 1

- **Generate cards**:
  - CTA in empty state links to `/dashboard/generate?deckId=:deckId`

- **Edit card**:
  - Opens Edit dialog prefilled
  - On save, updates card in list on success

- **Delete card**:
  - Requires confirmation
  - On confirm, deletes and removes from list; on error, restore row and show error

## 9. Conditions and Validation
Client-side validation should mirror server constraints to reduce round-trips and ensure consistent UX.

### Route and identity
- **`deckId` must be a UUID**:
  - If invalid format, show “Not found” and do not call APIs.

### Deck rename (matches `updateDeckSchema`)
- **Name**: trim, required, 1–120 chars
- **Description**: trim, max 2000 chars; empty string becomes `null`
- **Patch must include at least one field**; otherwise show “No changes to save.”

### Cards list query (matches `listCardsQuerySchema`)
- **limit**: 1–100 (clamp)
- **q**: trim; max 200
- **tags**:
  - normalize: trim + lowercase
  - selection deduped; empty tags removed
- **aiGenerated**:
  - `"ai"` → `aiGenerated=true`
  - `"manual"` → `aiGenerated=false`
  - `"all"` → omit param

### Card create/edit (matches `createCardSchema`, `updateCardSchema`)
- **front**: trim; 1–2000
- **back**: trim; 1–10000
- **tags**:
  - max 20
  - each max 50
  - normalized (trim + lowercase + dedupe)
- **Update patch**: must include at least one field; if user didn’t change anything, block submit with “No changes to save.”

### Duplicate handling
- Duplicate-check is informational only.
- Exact duplicates are enforced by API:
  - `POST /api/cards` may return `409 duplicate_in_deck`
  - `PATCH /api/cards/:cardId` may return `409 duplicate_in_deck`

## 10. Error Handling
Handle API errors via `ApiError` from `fetchJson`:

- **401 unauthorized**:
  - Redirect to `/login` immediately (consistent with `useDecksList` and `DashboardView`)

- **404 not_found / deck_not_found**:
  - Deck load: show not-found page state (deck missing or not owned)
  - Card create/duplicate-check: show “Deck not found” and recommend returning to dashboard

- **400 invalid_input**:
  - For query `q` too long: prevent request client-side (max 200)
  - For cursor invalid (message includes “cursor”): clear cursor stack and refresh from first page

- **409 duplicate_in_deck**:
  - New card: show blocking form error “A card with identical content already exists in this deck.”
  - Edit card: show blocking form error “Updated content matches an existing card in this deck.”

- **429 rate_limited**:
  - Mostly impacts bulk create; for this view, show a friendly message if encountered (e.g. when calling bulk endpoints from elsewhere)

- **500 server_error / unknown_error**:
  - Show generic error banner: “Something went wrong. Please try again.”
  - Provide Retry buttons for deck load and cards load

Non-API failures:
- Network errors: treat like generic failure; keep previous content if available; provide retry.

## 11. Implementation Steps
1. **Create the route page**: add `src/pages/dashboard/decks/[deckId].astro` using `Layout` and mount `DeckDetailView client:load`, passing `Astro.params.deckId`.
2. **Add types/mappers**: create `src/components/views/deck/deck-detail.types.ts` with ViewModels and mapping helpers (`toDeckDetailVm`, `toCardListItemVm`, etc.).
3. **Build data hooks**:
   - `useDeck` (deck load + refresh)
   - `useCardsList` (filters + cursor stack + invalid cursor recovery + 401 redirect)
   - `useDuplicateCheck` (debounced `/api/cards/duplicates/check`)
4. **Implement `DeckDetailView`**: wire routing param validation, deck load state, cards list state, and dialog open/close state.
5. **Implement `DeckDetailHeader`**:
  - Render name/description
  - Reuse `RenameDeckDialog` and `DeleteDeckConfirmDialog` (adapt by providing a `DeckListItemVm` from loaded `DeckDto`).
6. **Implement `CardsToolbar`**:
   - Debounced search input (`maxLength=200`)
   - Tag filter UI + clear action
   - AI filter tri-state
7. **Implement cards list UI**:
   - `CardsList` + `CardRow` with tags, AI badge, edit/delete actions
  - Empty states with “New card” and “Generate cards” CTAs
8. **Implement card dialogs**:
   - `NewCardDialog` with local validation, duplicate warning, create call, and list update/refresh
   - `EditCardDialog` with diff-based patch creation, update call, and list update
   - `DeleteCardConfirmDialog` (new) or inline confirm pattern consistent with deck delete
9. **Implement pagination controls**:
   - `CardsPagination` with Prev/Next buttons; integrate with cursor stack behavior
10. **Polish accessibility**:
   - Ensure dialogs use `role="dialog"`, focus management, Escape to close
   - Ensure pagination is keyboard accessible and uses `aria-label`
11. **Verify error flows**:
   - 401 redirect, 404 deck not found, 409 duplicate on create/edit, invalid cursor recovery

