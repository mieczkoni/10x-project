import type { CardDto, CardId, CreateCardCommand, DeckDto, DeckId, UpdateCardCommand } from "../../../types";

export interface DeckDetailVm {
  id: DeckId;
  name: string;
  description: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface DeckActionVm {
  isRenaming: boolean;
  isDeleting: boolean;
  error?: string;
}

export interface CardListItemVm {
  id: CardId;
  front: string;
  back: string;
  tags: string[];
  aiGenerated: boolean;
  updatedAt: string;
}

export interface CardActionState {
  isUpdating: boolean;
  isDeleting: boolean;
  error?: string;
}

export type CardActionStateById = Record<CardId, CardActionState>;

export interface CardsQueryVm {
  q: string;
  tags: string[];
  aiGenerated: "all" | "ai" | "manual";
  limit: number;
  sort: "created_at" | "updated_at";
  order: "asc" | "desc";
}

export interface CardsPageVm {
  nextCursor: string | null;
  limit: number;
  cursorStack: string[];
}

export interface TagOptionVm {
  value: string;
  label: string;
  count?: number;
}

export interface DuplicateWarningVm {
  status: "idle" | "checking" | "ok" | "duplicate" | "error";
  isDuplicate: boolean;
  duplicateCard?: { id: CardId; front: string; back: string } | null;
  message?: string;
}

export interface CardEditorFormVm {
  front: string;
  back: string;
  tagsText: string;
  errors: {
    front?: string;
    back?: string;
    tags?: string;
    form?: string;
  };
  submitting: boolean;
}

export function toDeckDetailVm(deck: DeckDto): DeckDetailVm {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    deletedAt: deck.deleted_at,
    updatedAt: deck.updated_at,
  };
}

export function toCardListItemVm(card: CardDto): CardListItemVm {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    tags: card.tags ?? [],
    aiGenerated: card.ai_generated,
    updatedAt: card.updated_at,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = tag.trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function parseTagsText(tagsText: string): string[] {
  return normalizeTags(tagsText.split(","));
}

function areTagsEqual(first: string[], second: string[]): boolean {
  const normalizedFirst = normalizeTags(first).slice().sort();
  const normalizedSecond = normalizeTags(second).slice().sort();

  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((value, index) => value === normalizedSecond[index]);
}

export function toCreateCardCommand(deckId: DeckId, form: CardEditorFormVm): CreateCardCommand {
  const front = form.front.trim();
  const back = form.back.trim();
  const tags = parseTagsText(form.tagsText);

  const command: CreateCardCommand = {
    deck_id: deckId,
    front,
    back,
    ai_generated: false,
  };

  if (tags.length > 0) {
    command.tags = tags;
  }

  return command;
}

export function toUpdateCardCommand(form: CardEditorFormVm, original: CardDto): UpdateCardCommand {
  const patch: UpdateCardCommand = {};
  const front = form.front.trim();
  const back = form.back.trim();
  const tags = parseTagsText(form.tagsText);

  if (front !== original.front.trim()) {
    patch.front = front;
  }

  if (back !== original.back.trim()) {
    patch.back = back;
  }

  if (!areTagsEqual(tags, original.tags ?? [])) {
    patch.tags = tags;
  }

  return patch;
}
