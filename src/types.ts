/**
 * Shared DTOs and Command Models for the REST API (`.ai/api-plan.md`).
 *
 * Design goals:
 * - Keep DTOs **derived from DB entities** (`Tables`, `TablesInsert`, `TablesUpdate`) to avoid drift.
 * - Commands represent **client-provided** shapes (so they intentionally omit server-derived fields like `user_id`
 *   and computed fields like `content_hash`).
 * - When the API intentionally differs from the DB type (e.g. narrowed `event_type`, `payload` must be an object),
 *   we use `Omit<...> & { ... }` and document why.
 */

import type { Json, Tables, TablesInsert, TablesUpdate } from "./db/database.types"

/** Common helper: the DB exposes `Json` as a union; API payloads typically want an object. */
export type JsonObject = Record<string, Json>

/** Convenience aliases for entity types derived from the database schema. */
export type DeckEntity = Tables<"decks">
export type CardEntity = Tables<"cards">
export type EventEntity = Tables<"events">

/** ID aliases anchored to DB entity columns. */
export type DeckId = DeckEntity["id"]
export type CardId = CardEntity["id"]
export type EventId = EventEntity["id"]
export type UserId = DeckEntity["user_id"] // all entities use the same `user_id` shape

// ------------------------------------------------------------
// Error + pagination DTOs (applies to all endpoints)
// ------------------------------------------------------------

export type ApiErrorDto = {
  code: string
  message: string
  /** Extra debug context (shape varies per error). */
  details?: JsonObject
}

export type ApiErrorResponseDto = {
  error: ApiErrorDto
}

export type PageDto = {
  limit: number
  nextCursor: string | null
}

export type ListResponseDto<T> = {
  data: T[]
  page: PageDto
}

/** Some endpoints explicitly return no body (HTTP 204). */
export type NoContentDto = null

// ------------------------------------------------------------
// Query models (list endpoints)
// ------------------------------------------------------------

export type PaginationQueryDto = {
  limit?: number
  cursor?: string
  sort?: string
  order?: "asc" | "desc"
}

export type ListDecksQueryDto = PaginationQueryDto & {
  q?: string
  includeDeleted?: boolean
}

export type ListCardsQueryDto = PaginationQueryDto & {
  deckId?: DeckId
  /** Repeatable `tag` param support (preferred) */
  tag?: string | string[]
  /** Comma-separated tags support (fallback) */
  tags?: string
  q?: string
  aiGenerated?: boolean
  includeDeleted?: boolean
}

export type ListEventsQueryDto = PaginationQueryDto & {
  type?: EventType
  /** ISO timestamps */
  from?: string
  /** ISO timestamps */
  to?: string
}

// ------------------------------------------------------------
// Decks (`public.decks`)
// ------------------------------------------------------------

/** Deck DTO matches DB row shape (API returns all columns). */
export type DeckDto = DeckEntity

export type DeckListResponseDto = ListResponseDto<DeckDto>

/** POST `/decks` */
export type CreateDeckCommand = Pick<DeckEntity, "name" | "description">

/** PATCH `/decks/{deckId}` */
export type UpdateDeckCommand = Partial<Pick<DeckEntity, "name" | "description" | "deleted_at">>

// ------------------------------------------------------------
// Cards (`public.cards`)
// ------------------------------------------------------------

/** Card DTO matches DB row shape (API returns all columns). */
export type CardDto = CardEntity

export type CardListResponseDto = ListResponseDto<CardDto>

/**
 * POST `/cards`
 *
 * Derived from the DB insert type, but omits:
 * - `user_id` (server-derived from auth)
 * - `content_hash` (computed server-side via `public.generate_content_hash(front, back)`)
 * - timestamps/ids (server/DB generated)
 */
export type CreateCardCommand = Omit<
  TablesInsert<"cards">,
  "id" | "user_id" | "content_hash" | "created_at" | "updated_at" | "deleted_at"
> & {
  /**
   * API includes `tags` but DB defaults it to `[]`.
   * Keep optional so clients can omit and rely on defaulting.
   */
  tags?: CardEntity["tags"]
  /**
   * API expects an explicit value; DB allows defaulting.
   * Keep required at the API level for clarity.
   */
  ai_generated: CardEntity["ai_generated"]
}

/**
 * PATCH `/cards/{cardId}`
 *
 * Derived from the DB update type, but omits immutable/server-managed fields.
 * (API triggers content hash recomputation when `front`/`back` change.)
 */
export type UpdateCardCommand = Omit<
  TablesUpdate<"cards">,
  "id" | "user_id" | "deck_id" | "content_hash" | "created_at" | "updated_at"
>

// ------------------------------------------------------------
// Duplicate detection (PRD FR-021)
// ------------------------------------------------------------

export type CheckCardDuplicateCommand = Pick<CreateCardCommand, "deck_id" | "front" | "back">

export type DuplicateCardPreviewDto = Pick<CardDto, "id" | "front" | "back">

export type CheckCardDuplicateResponseDto = {
  /** Computed using the same normalization as `public.generate_content_hash(front, back)` */
  content_hash: CardEntity["content_hash"]
  isDuplicate: boolean
  /**
   * When not a duplicate, servers may return `null` to keep the response shape stable.
   * The API plan shows an object only in the duplicate case.
   */
  duplicateCard: DuplicateCardPreviewDto | null
}

// ------------------------------------------------------------
// Events / Telemetry (`public.events`) (PRD FR-006)
// ------------------------------------------------------------

/**
 * Recommended event types from the API plan.
 * DB stores `event_type` as `string`; the API can safely narrow it.
 */
export type EventType =
  | "generated_view"
  | "accepted_without_edit"
  | "accepted_after_edit"
  | "edited"
  | "deleted"
  | "signup"
  | "login"
  | "generate_request"
  | "generate_error"
  | "review_session_start"
  | "review_answer"
  | "account_deleted"
  | "report_hallucination"

/**
 * Event DTO is derived from the DB row but narrows:
 * - `event_type` to the known union above
 * - `payload` to an object (API validation requirement)
 */
export type EventDto = Omit<EventEntity, "event_type" | "payload"> & {
  event_type: EventType
  payload: JsonObject
}

export type EventListResponseDto = ListResponseDto<EventDto>

/** POST `/events` */
export type CreateEventCommand = Pick<EventDto, "event_type"> & {
  /** Defaults to `{}` if omitted. */
  payload?: JsonObject
}

// ------------------------------------------------------------
// AI generation (PRD FR-001)
// ------------------------------------------------------------

export type GenerateCommand = {
  /** Optional default save target / duplicate checks. */
  deck_id?: DeckId
  source_text: string
  options?: {
    max_cards?: number
    language?: string
    model?: string
  }
}

export type GenerationMetaDto = {
  id: string
  created_at: string
  model: string
  input_chars: number
}

export type GeneratedCandidateDuplicateDto = {
  isDuplicate: boolean
  duplicateCardId: CardId | null
}

/**
 * Candidate shape is connected to the DB card entity via `front/back/tags`
 * (same primitives and future persistence target).
 */
export type GeneratedCandidateDto = Pick<CardDto, "front" | "back" | "tags"> & {
  temp_id: string
  duplicate: GeneratedCandidateDuplicateDto
}

export type GenerateResponseDto = {
  generation: GenerationMetaDto
  candidates: GeneratedCandidateDto[]
}

export type ValidateGenerateInputCommand = Pick<GenerateCommand, "source_text">

export type ValidateGenerateInputResponseDto = {
  ok: true
  input_chars: number
  max_chars: number
}

// ------------------------------------------------------------
// Accept generated candidates (PRD FR-001, FR-005)
// ------------------------------------------------------------

export type BulkCreateCardCandidateCommand = Pick<CreateCardCommand, "front" | "back" | "tags" | "ai_generated"> & {
  edited: boolean
}

/** POST `/cards:bulkCreate` */
export type BulkCreateCardsCommand = {
  deck_id: DeckId
  cards: BulkCreateCardCandidateCommand[]
}

export type BulkCreateCardsCreatedDto = Pick<CardDto, "id" | "front" | "back">

export type BulkCreateCardsSkippedDto = {
  reason: "duplicate_in_deck"
  front: CardDto["front"]
  back: CardDto["back"]
}

export type BulkCreateCardsResponseDto = {
  created: BulkCreateCardsCreatedDto[]
  skipped: BulkCreateCardsSkippedDto[]
}

// ------------------------------------------------------------
// Review sessions / spaced repetition (PRD FR-005, FR-010)
// NOTE: Current DB schema has no SRS state; these types are still connected
// to DB entities via `deck_id` and `card_id` and the card preview shape.
// ------------------------------------------------------------

export type StartReviewSessionCommand = {
  deck_id: DeckId
  limit: number
}

export type ReviewSessionDto = {
  id: string
  deck_id: DeckId
  created_at: string
}

export type ReviewCardPromptDto = Pick<CardDto, "id" | "front"> & {
  /** Card back is hidden until reveal; API returns `null` in the prompt. */
  back: null
}

export type StartReviewSessionResponseDto = {
  session: ReviewSessionDto
  card: ReviewCardPromptDto
}

export type ReviewRating = "again" | "hard" | "good" | "easy"

export type AnswerReviewCardCommand = {
  card_id: CardId
  rating: ReviewRating
}

export type AnswerReviewCardResponseDto = {
  updatedCard: Pick<CardDto, "id">
  nextCard: ReviewCardPromptDto
  done: boolean
}

// ------------------------------------------------------------
// Report hallucination / incorrect card (PRD US-012)
// ------------------------------------------------------------

export type ReportCardReason = "hallucination" | "incorrect" | "other"

export type ReportCardCommand = {
  reason: ReportCardReason
  notes?: string
}

// ------------------------------------------------------------
// GDPR account deletion (PRD FR-007, US-016)
// ------------------------------------------------------------

/** POST `/me/delete` */
export type DeleteMeCommand = {
  /** Enforced confirmation flag. */
  confirm: true
}

export type DeleteMeResponseDto = {
  status: "deleting"
}

