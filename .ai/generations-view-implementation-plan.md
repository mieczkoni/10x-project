## View Implementation Plan Generate

## 1. Overview
The **Generate** view lets an authenticated user paste source text, request AI-generated flashcard candidates, review/edit/select them, and **bulk-save selected candidates** into a chosen deck. The view surfaces generation metadata, duplicate warnings, and a post-save summary (created vs skipped duplicates).

## 2. View Routing
- **Route path**: `/dashboard/generate`
- **Astro page**: `src/pages/dashboard/generate/index.astro`
  - Renders React view with `client:load`:
    - `<GenerateView client:load />`

## 3. Component Structure
### High-level hierarchy
- `GenerateView` (route-level container)
  - `GenerateHeader` (title + deck selector + navigation shortcuts)
    - `CurrentDeckSelector` (existing)
    - (optional) “Back to dashboard” / “View current deck” links
  - `GenerateErrorBanner` (global errors for validation/generate/save)
  - `SourceTextPanel`
    - `SourceTextEditor`
    - `InputPreflightStatus` (optional; validate-input response)
    - `GenerateControls` (Generate button + advanced options)
  - `GenerationMetaPanel` (only when generation exists)
  - `CandidatesPanel`
    - `CandidatesToolbar` (select-all, clear, filter: duplicates-only, etc. optional)
    - `CandidatesList`
      - `CandidateCard` (repeat)
        - `CandidatePreview`
        - `CandidateDuplicateBadge`
        - `CandidateActions` (Edit / Remove / Select)
        - `CandidateInlineEditor` (inline when editing)
  - `BulkActionBar` (sticky on mobile)
    - “Save selected”
    - “Clear selection”
    - Selected count
  - `SaveResultsPanel` (created + skipped duplicates; “View deck” link)
  - `SelectDeckDialog` (opens when user attempts save without a selected deck)

### Suggested file/folder layout (match current conventions)
- `src/pages/dashboard/generate/index.astro`
- `src/components/views/generate/GenerateView.tsx`
- `src/components/views/generate/generate.types.ts` (new ViewModel + UI state types)
- `src/components/views/generate/*` for subcomponents listed above
- `src/components/hooks/useGenerateWorkflow.ts` (new; manages workflow state + API calls)

## 4. Component Details

### GenerateView
- **Purpose**: Route-level orchestrator: loads decks/current deck, owns workflow hook, composes the view, and coordinates navigation/redirect on `401`.
- **Main elements**
  - `<main className="mx-auto ...">` container (match `DashboardView` / `DeckDetailView` layout)
  - Renders sections in this order:
    - header (deck selector)
    - source input + generate controls
    - candidates list + bulk actions
    - results summary
- **Handled events**
  - `onSourceTextChange(text)`
  - `onPreflightValidate()` (optional, debounced or explicit)
  - `onGenerate()`
  - `onCandidateToggleSelected(tempId)`
  - `onCandidateEditStart(tempId)`
  - `onCandidateEditCancel(tempId)`
  - `onCandidateEditSave(tempId, patch)`
  - `onCandidateRemove(tempId)`
  - `onClearSelection()`
  - `onSaveSelected()` (opens deck dialog if no deck selected)
  - `onDeckSelected(deckId)` (updates current deck + may affect duplicate badges)
- **Validation conditions (UI-side)**
  - **Generate button enabled** only when:
    - `source_text.trim().length > 0`
    - `source_text.length <= maxChars` (max from validate-input response, fallback 20000)
    - not currently generating
  - If `source_text.length > maxChars`: show inline error and prevent generate call.
  - If candidates exist: show “Generate again” confirmation (optional) before overwriting candidates.
- **Types**
  - Uses DTOs from `src/types.ts`:
    - `DeckId`, `DeckDto`
    - `GenerateCommand`, `GenerateResponseDto`
    - `ValidateGenerateInputCommand`, `ValidateGenerateInputResponseDto`
    - `BulkCreateCardsCommand`, `BulkCreateCardsResponseDto`
    - `ApiErrorResponseDto` (via `ApiError` in client)
  - Uses new VMs from `generate.types.ts`:
    - `GenerateWorkflowStateVm`, `GeneratedCandidateVm`, `SaveResultsVm`, `GenerateUiErrorVm`
- **Props**
  - None (matches existing route views like `DashboardView`)

### GenerateHeader
- **Purpose**: Display view title/description and ensure **current deck selector is visible** (per UI plan). Provide quick links.
- **Main elements**
  - `<header>` with:
    - `<h1>` “Generate”
    - short helper text
    - `CurrentDeckSelector` (existing component)
    - optional action links:
      - “Back to dashboard” (`/dashboard`)
      - “View deck” (`/dashboard/decks/:deckId`) when `currentDeckId` exists
- **Handled events**
  - `onSelectDeck(deckId)` → updates `currentDeckId` (via `useCurrentDeck`)
- **Validation conditions**
  - Deck selector disabled when decks are still loading or decks list is empty.
- **Types**
  - `DeckListItemVm`, `CurrentDeckVm` (existing from `dashboard.types.ts`)
  - Props types (see below)
- **Props**
  - `decks: DeckListItemVm[]`
  - `currentDeck: CurrentDeckVm`
  - `disabled?: boolean`
  - `onSelectDeck: (deckId: DeckId) => void`

### SourceTextPanel
- **Purpose**: Collect source text and optionally preflight validate size to provide immediate UX feedback.
- **Main elements**
  - `<section>` containing:
    - `SourceTextEditor`
    - char counter + max hint
    - optional `InputPreflightStatus` (e.g., “OK: 1,234 / 20,000” or error)
    - `GenerateControls`
- **Handled events**
  - `onChange(text)`
  - (optional) `onBlur` triggers preflight validate if not already validated
  - `onGenerate()`
- **Validation conditions**
  - Source text must be non-empty after trim.
  - Source text must be ≤ `MAX_SOURCE_TEXT_CHARS` (server enforces 20000).
- **Types**
  - `GenerateSourceVm`, `GeneratePreflightVm`
- **Props**
  - `source: GenerateSourceVm`
  - `preflight: GeneratePreflightVm`
  - `onSourceChange: (text: string) => void`
  - `onValidate: () => Promise<void>` (optional)
  - `onGenerate: () => Promise<void>`
  - `disabled?: boolean`

### SourceTextEditor
- **Purpose**: Textarea with character count and inline validation messaging.
- **Main elements**
  - `<textarea>` for `source_text`
  - counter: `currentChars / maxChars`
  - inline error region with `aria-live="polite"` for validation messages
- **Handled events**
  - `onChange`
  - (optional) `onPaste` (no special logic required)
- **Validation conditions**
  - `trim().length >= 1`
  - `length <= maxChars`
- **Types**
  - `GenerateSourceVm`
- **Props**
  - `value: string`
  - `maxChars: number`
  - `error?: string | null`
  - `onChange: (value: string) => void`
  - `disabled?: boolean`

### GenerateControls
- **Purpose**: Initiate generation and show generation progress/retry.
- **Main elements**
  - Primary button “Generate” / “Generating…”
  - optional advanced fields:
    - max cards (1–20)
    - model (string, optional)
    - language (default “en”; optionally hidden but still sent as “en”)
- **Handled events**
  - `onGenerateClick`
  - optional `onOptionsChange`
- **Validation conditions (match server `generate.zod.ts`)**
  - `options.max_cards` must be integer in \([1,20]\)
  - `options.model` max length 100, non-empty trimmed string if provided
  - `options.language` 2–10 chars if provided (UI can keep fixed “en”)
- **Types**
  - `GenerateOptionsVm`
- **Props**
  - `options: GenerateOptionsVm`
  - `canGenerate: boolean`
  - `generating: boolean`
  - `onGenerate: () => Promise<void>`
  - `onOptionsChange?: (patch: Partial<GenerateOptionsVm>) => void`

### GenerationMetaPanel
- **Purpose**: Display generation metadata returned by API.
- **Main elements**
  - `<section>` with:
    - timestamp (from `generation.created_at`)
    - model label (from `generation.model`)
    - input chars (from `generation.input_chars`)
- **Handled events**
  - None (display-only)
- **Validation conditions**
  - Only render when `generation` exists.
- **Types**
  - `GenerationMetaDto` (DTO) or `GenerationMetaVm` (VM)
- **Props**
  - `generation: GenerationMetaVm`

### CandidatesPanel
- **Purpose**: Show candidate list, selection controls, and empty states.
- **Main elements**
  - Empty state when no candidates:
    - guidance: “Paste text and click Generate”
  - Otherwise:
    - `CandidatesToolbar` (optional)
    - `CandidatesList`
- **Handled events**
  - `onSelectAll`, `onClearSelection` (if toolbar is implemented)
  - per-candidate actions delegated to `CandidateCard`
- **Validation conditions**
  - “Save selected” should be disabled when `selectedCount === 0` or `saving === true`.
- **Types**
  - `GeneratedCandidateVm[]`
- **Props**
  - `candidates: GeneratedCandidateVm[]`
  - `onCandidateAction: GenerateCandidateActionHandler`
  - `disabled?: boolean`

### CandidatesList
- **Purpose**: Render candidate cards with stable keys and accessible list semantics.
- **Main elements**
  - `<ul>` and `<li>` per candidate
- **Handled events**
  - None directly (passes handlers down)
- **Validation conditions**
  - None
- **Types**
  - `GeneratedCandidateVm`
- **Props**
  - `items: GeneratedCandidateVm[]`
  - `onToggleSelected: (tempId: string) => void`
  - `onEdit: (tempId: string) => void`
  - `onRemove: (tempId: string) => void`
  - `onEditSave: (tempId: string, patch: CandidateEditPatchVm) => void`
  - `onEditCancel: (tempId: string) => void`
  - `disabled?: boolean`

### CandidateCard
- **Purpose**: Provide preview + selection checkbox + duplicate badge + inline edit/remove.
- **Main elements**
  - Selection checkbox (`<input type="checkbox">`)
  - Preview:
    - front (headline)
    - back (body)
    - tags chips
  - Duplicate badge:
    - from `candidate.duplicate` (if present)
    - and/or from last duplicate check after edits (optional)
  - Actions: Edit, Remove
  - Inline editor when `isEditing === true`
- **Handled events**
  - `onToggleSelected`
  - `onEditStart`
  - `onEditCancel`
  - `onEditSave`
  - `onRemove`
- **Validation conditions**
  - Editing constraints (mirror `generatedCandidateSchema`):
    - `front.trim().length >= 1` and `<= 2000`
    - `back.trim().length >= 1` and `<= 10000`
    - `tags.length <= 20`, each `tag.length <= 50`, normalize to trimmed lowercase, remove empties, unique
  - Disable actions when candidate is in `saving` state.
- **Types**
  - `GeneratedCandidateVm`
  - `CandidateEditFormVm`
  - `CandidateDuplicateVm`
- **Props**
  - `candidate: GeneratedCandidateVm`
  - `onToggleSelected: (tempId: string) => void`
  - `onEdit: (tempId: string) => void`
  - `onRemove: (tempId: string) => void`
  - `onEditSave: (tempId: string, patch: CandidateEditPatchVm) => void`
  - `onEditCancel: (tempId: string) => void`
  - `disabled?: boolean`

### BulkActionBar
- **Purpose**: Sticky (mobile-friendly) bulk actions for selection.
- **Main elements**
  - container fixed to bottom on small screens; inline on desktop
  - “Save selected” primary button
  - “Clear selection” secondary button
  - selected count label
  - `aria-live="polite"` region for “Saving…” or result messages (optional)
- **Handled events**
  - `onSaveSelected`
  - `onClearSelection`
- **Validation conditions**
  - “Save selected” disabled when:
    - `selectedCount === 0`
    - `saving === true`
  - On click “Save selected”:
    - If `currentDeckId` is null → open `SelectDeckDialog` and do not call API yet.
- **Types**
  - `BulkActionBarVm`
- **Props**
  - `selectedCount: number`
  - `saving: boolean`
  - `canSave: boolean`
  - `onSaveSelected: () => void`
  - `onClearSelection: () => void`

### SaveResultsPanel
- **Purpose**: Show created/skipped summary and offer “View deck” + “Edit and retry” guidance.
- **Main elements**
  - created count + list preview (optional)
  - skipped duplicates list (front/back snippet + reason)
  - “View deck” link when `currentDeckId` exists
  - optional “Select skipped” / “Create new candidate from skipped” actions
- **Handled events**
  - `onViewDeck` (navigation only)
  - optional: `onRetrySkipped` (re-select candidates still marked skipped)
- **Validation conditions**
  - Render only after a save attempt finished (success or partial success).
- **Types**
  - `SaveResultsVm`
- **Props**
  - `results: SaveResultsVm | null`
  - `currentDeckId: DeckId | null`

### SelectDeckDialog
- **Purpose**: Enforce “deck required for saving” UX. When no deck is selected and user clicks “Save selected”, prompt them to select a deck (instead of failing silently).
- **Main elements**
  - Overlay + dialog (match existing dialog implementation style)
  - `<select>` with decks
  - actions: Cancel, Continue
  - optional: “Create deck” shortcut (opens `CreateDeckDialog` or links to dashboard)
- **Handled events**
  - `onSelectDeck(deckId)`
  - `onConfirm` → proceed to save
  - `onCancel` → close
- **Validation conditions**
  - Confirm disabled until a deck is selected.
- **Types**
  - `DeckListItemVm`, `DeckId`
- **Props**
  - `open: boolean`
  - `decks: DeckListItemVm[]`
  - `value: DeckId | null`
  - `onChange: (deckId: DeckId) => void`
  - `onConfirm: () => void`
  - `onOpenChange: (open: boolean) => void`

## 5. Types

### Existing DTOs (from `src/types.ts`) used directly
- **Generation**
  - `GenerateCommand`
  - `GenerateResponseDto`
  - `GenerationMetaDto`
  - `GeneratedCandidateDto`
- **Preflight**
  - `ValidateGenerateInputCommand`
  - `ValidateGenerateInputResponseDto`
- **Bulk save**
  - `BulkCreateCardsCommand`
  - `BulkCreateCardCandidateCommand`
  - `BulkCreateCardsResponseDto`
  - `BulkCreateCardsSkippedDto`
- **Deck context**
  - `DeckId`, `DeckDto`

### New ViewModel / UI-state types (create in `src/components/views/generate/generate.types.ts`)

#### GenerateOptionsVm
Represents user-configurable generation options (mapped to `GenerateCommand.options`).
- `maxCards: number` (default 20; maps to `options.max_cards`)
- `language: "en"` (fixed; maps to `options.language`)
- `model: string | null` (maps to `options.model`)

#### GenerateSourceVm
Source text editor state.
- `text: string`
- `inputChars: number` (derived: `text.length`)
- `maxChars: number` (default 20000; update from validate response)
- `error: string | null` (client-side validation message; not API error)

#### GeneratePreflightVm
Tracks the optional validate-input call.
- `status: "idle" | "validating" | "ok" | "error"`
- `lastValidatedChars: number | null`
- `maxChars: number` (from API or default 20000)
- `message: string | null` (human-readable for UI)

#### CandidateDuplicateVm
Normalized duplicate status used by candidate cards.
- `isDuplicate: boolean`
- `duplicateCardId: string | null` (maps from `GeneratedCandidateDto.duplicate.duplicateCardId`)
- `source: "from_generate" | "from_duplicate_check" | "unknown"` (optional; for UI debugging)

#### CandidateSaveStatus
Local save status for a candidate.
- `"idle"`: untouched since last save attempt
- `"saving"`: currently included in a bulk save request
- `"saved"`: confirmed created (based on bulk-create response)
- `"skipped_duplicate"`: skipped by server as duplicate in deck (based on bulk-create response)

#### GeneratedCandidateVm
Client representation of a candidate (camelCase + UI state).
- `tempId: string` (maps from `GeneratedCandidateDto.temp_id`)
- `front: string`
- `back: string`
- `tags: string[]`
- `duplicate: CandidateDuplicateVm`
- `selected: boolean`
- `editing: boolean`
- `edited: boolean` (true if user changed front/back/tags from original)
- `saveStatus: CandidateSaveStatus`
- `errors: { front?: string; back?: string; tags?: string; form?: string }` (inline edit validation)
- `original: { front: string; back: string; tags: string[] }` (set on generation fetch; used to compute `edited`)

#### GenerationMetaVm
Display-ready generation metadata.
- `id: string`
- `createdAt: string` (ISO)
- `model: string`
- `inputChars: number`

#### SaveResultsVm
Represents last bulk save attempt results.
- `status: "idle" | "saving" | "success" | "error"`
- `createdCount: number`
- `skippedCount: number`
- `skipped: { reason: string; front: string; back: string }[]`
- `message: string | null` (e.g. “Saved 12 cards, skipped 3 duplicates.”)
- `error: string | null` (if request failed)

#### GenerateUiErrorVm
Global, user-facing errors (API failures, not per-field).
- `scope: "preflight" | "generate" | "save"`
- `message: string`
- `details?: unknown` (for optional debug rendering in dev only)

#### GenerateWorkflowStateVm
Single source of truth for the view state returned by the hook.
- `source: GenerateSourceVm`
- `options: GenerateOptionsVm`
- `preflight: GeneratePreflightVm`
- `generation: GenerationMetaVm | null`
- `candidates: GeneratedCandidateVm[]`
- `loading: { generating: boolean; saving: boolean }`
- `errors: GenerateUiErrorVm[]` (or a single `error` if preferred)
- `results: SaveResultsVm | null`

## 6. State Management
Implement a dedicated hook: `src/components/hooks/useGenerateWorkflow.ts`.

### Hook responsibilities
- **Own and update**: `GenerateWorkflowStateVm`
- **Expose actions**:
  - `setSourceText(text)`
  - `validateInput()` (optional)
  - `generate()` (calls `/api/generate`)
  - `toggleCandidateSelected(tempId)`
  - `editCandidateStart(tempId)`
  - `editCandidateCancel(tempId)`
  - `editCandidateSave(tempId, patch)`
  - `removeCandidate(tempId)`
  - `clearSelection()`
  - `saveSelected({ deckId })` (calls `/api/cards/bulk-create`)
  - `resetResults()` (optional)
- **Persistence (optional per UI plan)**:
  - Save draft to `sessionStorage` under a key like `generateWorkflowDraftV1`
  - Restore on mount:
    - source text
    - options
    - candidates + selection + edits
    - generation meta (if present)
  - Clear draft after successful save of all selected candidates (optional), or keep until user clears.

### Candidate edit and validation strategy
- Keep candidate edits purely client-side until bulk save.
- When “Save” in inline editor:
  - Validate front/back/tags against `generate.zod.ts` limits (see section 9).
  - If valid:
    - Apply patch to candidate
    - Set `edited = true` if patch differs from `original`
    - Optionally run a non-blocking duplicate check for updated front/back when a deck is selected:
      - `POST /api/cards/duplicates/check`
      - Update `candidate.duplicate` when response returns

### Save results mapping strategy (client-only)
Because bulk-create response returns `created: {id, front, back}` and `skipped: {front, back, reason}`, map outcomes to candidates by **trimmed front/back pairs**:
- Mark candidates as `saved` when their `(front, back)` match an item in `created`.
- Mark remaining submitted candidates as `skipped_duplicate` when their `(front, back)` match an item in `skipped`.
- Deselect `saved` candidates; keep `skipped_duplicate` candidates selected to support “Edit and retry”.

## 7. API Integration

### API client conventions (match existing code)
- Use `fetchJson<T>(url, init)` from `src/lib/http/client.ts`.
- Handle `ApiError` similarly to `useDecksList` / `DashboardView`:
  - If `err instanceof ApiError && err.status === 401` → `window.location.href = "/login"`.

### 7.1 Preflight validation (optional UX helper)
- **Endpoint**: `POST /api/generate/validate-input`
- **Request type**: `ValidateGenerateInputCommand`

```ts
type ValidateGenerateInputCommand = { source_text: string }
```

- **Response type**: `ValidateGenerateInputResponseDto`
- **Frontend action**
  - Call when:
    - user clicks “Validate” (explicit), or
    - user pauses typing for N ms (debounced), or
    - user clicks Generate (always do a cheap local validation first; preflight call is optional).
  - Update `preflight.maxChars` and status messaging.

### 7.2 Generate candidates
- **Endpoint**: `POST /api/generate`
- **Request type**: `GenerateCommand`

```ts
type GenerateCommand = {
  deck_id?: DeckId
  source_text: string
  options?: { max_cards?: number; language?: string; model?: string }
}
```

- **Response type**: `GenerateResponseDto`
- **Frontend action**
  - Build request:
    - `deck_id`: use current deck if selected (enables server duplicate checks)
    - `source_text`: from editor
    - `options`: from `GenerateOptionsVm` (send `language: "en"` and `max_cards`)
  - On success:
    - Map `GenerateResponseDto.generation` → `GenerationMetaVm`
    - Map `GenerateResponseDto.candidates` → `GeneratedCandidateVm[]` (initialize `selected=false`, `editing=false`, `edited=false`, `saveStatus="idle"`, store `original`)
  - Note: server already emits `generate_request` and `generated_view` telemetry events.

### 7.3 Bulk save selected candidates
- **Endpoint**: `POST /api/cards/bulk-create`
- **Request type**: `BulkCreateCardsCommand`

```ts
type BulkCreateCardsCommand = {
  deck_id: DeckId
  cards: Array<{
    front: string
    back: string
    tags?: string[]
    ai_generated: boolean
    edited: boolean
  }>
}
```

- **Response type**: `BulkCreateCardsResponseDto` (201)
- **Frontend action**
  - Precondition: `currentDeckId` is required; otherwise open `SelectDeckDialog`.
  - Build `cards` from **selected** candidates:
    - `ai_generated: true`
    - `edited: candidate.edited`
  - On success:
    - Update `SaveResultsVm`
    - Update candidates `saveStatus` (see mapping strategy above)
  - Note: server emits `accepted_without_edit` / `accepted_after_edit` / `edited` telemetry for created cards.

### 7.4 Optional duplicate re-check after edits (non-blocking)
- **Endpoint**: `POST /api/cards/duplicates/check`
- **Request type**: `CheckCardDuplicateCommand` (subset of `CreateCardCommand`)
- **Frontend action**
  - Only call when:
    - a deck is selected AND
    - a candidate’s front/back changes AND
    - you want to refresh duplicate badge before save.
  - Do not block “Save selected” on this; bulk-create already handles duplicates.

## 8. User Interactions

### Paste/edit source text
- **Action**: User types/pastes into textarea.
- **Outcome**:
  - Char counter updates.
  - If empty after trim: show inline error and disable Generate.
  - If exceeds max: show inline error and disable Generate.
  - Optional: preflight validation updates status.

### Generate candidates
- **Action**: Click “Generate”.
- **Outcome (success)**:
  - Show loading state (button label + spinner).
  - Render generation metadata.
  - Render candidate list with checkboxes, edit/remove actions.
  - Duplicate badges show if a deck was included in the request.
- **Outcome (failure)**:
  - Show a clear error banner with retry guidance.
  - Keep source text intact.

### Select/deselect candidates
- **Action**: Toggle checkbox on a candidate.
- **Outcome**:
  - Selected count updates.
  - Bulk action bar enables/disables accordingly.

### Edit candidate inline
- **Action**: Click “Edit” on a candidate.
- **Outcome**:
  - Inline editor replaces preview for that item.
  - User can Save or Cancel.
  - Save validates fields; if valid, updates candidate and sets `edited=true` if changed.

### Remove candidate
- **Action**: Click “Remove”.
- **Outcome**:
  - Candidate removed from list immediately (client-side only).
  - If it was selected, selected count decreases.

### Save selected
- **Action**: Click “Save selected”.
- **Outcome (no deck selected)**:
  - Open `SelectDeckDialog`; after selection, proceed with save.
- **Outcome (success / partial success)**:
  - Show results summary:
    - created count
    - skipped duplicates list with reason
  - Mark created candidates as `saved` and deselect them.
  - Keep skipped candidates selected and mark them as `skipped_duplicate` so the user can “Edit and retry”.
- **Outcome (failure)**:
  - Show error banner and keep selection intact so user can retry.

## 9. Conditions and Validation

### Source text validation (mirrors `src/lib/validation/generate.zod.ts`)
- **Required**: `source_text` must be present.
- **Trimmed non-empty**: `source_text.trim().length >= 1`
- **Max length**: `source_text.length <= 20000`
- **UI impact**
  - Disable Generate when invalid.
  - Show inline error message near textarea.

### Generation options validation
- **max_cards**
  - integer
  - min 1, max 20
  - default 20
- **language**
  - 2–10 chars (UI can keep fixed `"en"`)
- **model**
  - trimmed non-empty
  - max 100 chars

### Candidate field validation (mirrors `generatedCandidateSchema`)
- **front**
  - `trim().length >= 1`
  - `length <= 2000`
- **back**
  - `trim().length >= 1`
  - `length <= 10000`
- **tags**
  - normalize: trim + lowercase + unique + remove empty
  - max tags: 20
  - max tag length: 50
- **UI impact**
  - Inline editor shows field-level errors.
  - Prevent closing “Save” action when invalid.

### API-required conditions verified at component level
- `/api/generate` requires auth:
  - If `401`, redirect to `/login` (central pattern used elsewhere).
- `/api/cards/bulk-create` requires:
  - `deck_id` must be present and a valid deck for the user:
    - enforce in UI by requiring deck selection before request
  - `cards.length >= 1`:
    - enforce by disabling “Save selected” when selected count is 0

## 10. Error Handling

### Common API errors to handle (based on `src/pages/api/generate/index.ts` and `ApiErrors`)
- **401 unauthorized**
  - Behavior: redirect to `/login`
- **400 invalid_input**
  - Behavior: show validation-friendly message; keep user input; do not clear candidates unless user regenerates
  - Also surface field issues if present in `error.details.issues`
- **400 input_too_large**
  - Behavior: show inline source-text error using returned `details.input_chars` / `details.max_chars` when available
- **404 deck_not_found**
  - When generating with a selected deck: show message that the deck is missing; clear current deck selection (`useCurrentDeck` will also clear if deck list refreshes without it)
  - When saving: show message and prompt re-select deck
- **408 generation_timeout**
  - Behavior: show timeout message + prominent Retry
- **429 rate_limited**
  - Behavior: show “Too many requests” with guidance (wait and retry); keep state intact
- **502 model_error**
  - Behavior: show message + Retry; optionally show a collapsible “Details” section if `details.issues` exists
- **500 server_error**
  - Behavior: generic error message + Retry

### UI/edge-case errors
- **Invalid/empty deck list**: disable deck selector, show “Create a deck first” hint and link to `/dashboard`.
- **Overwriting existing candidates on new generate**: prompt confirmation or keep both generations (MVP can overwrite with confirmation).
- **SessionStorage restore fails (corrupt JSON)**: ignore and start fresh; don’t block UI.

## 11. Implementation Steps
1. **Add route page**
   - Create `src/pages/dashboard/generate/index.astro` that renders `<GenerateView client:load />`.
2. **Create view folder and baseline layout**
   - Add `src/components/views/generate/GenerateView.tsx` with the same container sizing classes used in `DashboardView`.
3. **Add view models**
   - Create `src/components/views/generate/generate.types.ts` with the VMs described in section 5.
4. **Implement `useGenerateWorkflow`**
   - Create `src/components/hooks/useGenerateWorkflow.ts`:
     - local validation for source/options/candidate edits
     - API calls (validate-input, generate, bulk-create)
     - mapping DTO ↔ VM
     - save results mapping back onto candidates
     - optional sessionStorage persistence
5. **Wire deck context**
   - Reuse `useDecksList()` + `useCurrentDeck(decks)` inside `GenerateView`.
   - Ensure current deck changes affect subsequent generate calls and saving.
6. **Build header**
   - Implement `GenerateHeader` reusing existing `CurrentDeckSelector`.
7. **Build source panel**
   - Implement `SourceTextEditor` (textarea + counter + validation).
   - Implement `GenerateControls` (Generate button + loading + optional advanced options).
   - Implement optional preflight validate (either explicit or debounced).
8. **Build candidates rendering**
   - Implement `CandidatesList` and `CandidateCard` with:
     - selection checkbox
     - duplicate badge
     - inline editor (front/back/tags) + Save/Cancel
     - remove action
9. **Build bulk actions**
   - Implement `BulkActionBar` with sticky behavior on mobile and correct enable/disable rules.
   - Implement `SelectDeckDialog` that opens when saving without a deck selected.
10. **Build results panel**
   - Implement `SaveResultsPanel` to display created vs skipped duplicates and a “View deck” link.
11. **Polish UX + accessibility**
   - Add `aria-live` for generate/save progress and results.
   - Ensure dialogs are keyboard accessible (Escape closes, focus managed) consistent with existing dialogs.
12. **Manual QA checklist**
   - Generate with empty input → blocked with message.
   - Generate with >20000 chars → blocked / preflight error shown.
   - Generate success → candidates render + duplicate badges when deck selected.
   - Save selected without deck → deck selection dialog opens.
   - Save selected with deck → results summary shows; created deselected; skipped remain selected and labeled.
   - Any `401` from endpoints → redirects to `/login`.

