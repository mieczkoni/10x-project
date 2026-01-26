import type { DeckDto, DeckId } from "../../../types";

export interface DeckListItemVm {
  id: DeckId;
  name: string;
  description: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface CurrentDeckVm {
  deckId: DeckId | null;
  deckName: string | null;
}

export interface DeckActionState {
  isRenaming: boolean;
  isDeleting: boolean;
  optimisticName?: string;
  optimisticDescription?: string | null;
  error?: string;
}

export type DeckActionStateById = Record<DeckId, DeckActionState>;

export interface DecksQueryVm {
  q: string;
  limit: number;
  cursor: string | null;
  sort: "created_at" | "updated_at";
  order: "asc" | "desc";
  includeDeleted: boolean;
}

export interface DecksPageVm {
  nextCursor: string | null;
  limit: number;
}

export interface CreateDeckFormVm {
  name: string;
  description: string;
  errors: {
    name?: string;
    description?: string;
    form?: string;
  };
  submitting: boolean;
}

export function toDeckListItemVm(deck: DeckDto): DeckListItemVm {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    deletedAt: deck.deleted_at,
    updatedAt: deck.updated_at,
  };
}
