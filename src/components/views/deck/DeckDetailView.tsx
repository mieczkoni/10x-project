import * as React from "react";

import type { CardId, DeckDto, DeckId, UpdateDeckCommand } from "../../../types";
import { ApiError, fetchJson } from "../../../lib/http/client";
import { useCardsList } from "../../hooks/useCardsList";
import { useDeck } from "../../hooks/useDeck";
import { AppHeader } from "../app/AppHeader";
import { DeleteDeckConfirmDialog } from "../dashboard/DeleteDeckConfirmDialog";
import { RenameDeckDialog } from "../dashboard/RenameDeckDialog";
import type { DeckListItemVm } from "../dashboard/dashboard.types";
import {
  normalizeTags,
  type CardActionStateById,
  type CardsQueryVm,
  type DeckActionVm,
  type DeckDetailVm,
  type TagOptionVm,
  toDeckDetailVm,
} from "./deck-detail.types";
import { CardsToolbar } from "./CardsToolbar";
import { CardsList } from "./CardsList";
import { CardsPagination } from "./CardsPagination";
import { DeckDetailHeader } from "./DeckDetailHeader";
import { DeleteCardConfirmDialog } from "./DeleteCardConfirmDialog";
import { EditCardDialog } from "./EditCardDialog";
import { NewCardDialog } from "./NewCardDialog";

interface DeckDetailViewProps {
  deckId: string;
  userEmail?: string | null;
}

const DEFAULT_QUERY: CardsQueryVm = {
  q: "",
  tags: [],
  aiGenerated: "all",
  limit: 25,
  sort: "created_at",
  order: "desc",
};

const STORAGE_KEY = "currentDeckId";

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toDashboardDeckVm(deck: DeckDetailVm): DeckListItemVm {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    deletedAt: deck.deletedAt,
    updatedAt: deck.updatedAt,
  };
}

export function DeckDetailView({ deckId, userEmail }: DeckDetailViewProps) {
  const deckIdValue = deckId?.trim();
  const isDeckIdValid = Boolean(deckIdValue && isValidUuid(deckIdValue));
  const normalizedDeckId = isDeckIdValid ? (deckIdValue as DeckId) : null;

  const { deck, loading, error, notFound, refresh } = useDeck(normalizedDeckId);
  const [deckState, setDeckState] = React.useState<DeckDetailVm | null>(null);
  const [deckAction, setDeckAction] = React.useState<DeckActionVm>({
    isRenaming: false,
    isDeleting: false,
  });
  const [query, setQuery] = React.useState<CardsQueryVm>(DEFAULT_QUERY);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [newCardOpen, setNewCardOpen] = React.useState(false);
  const [editCardId, setEditCardId] = React.useState<CardId | null>(null);
  const [deleteCardId, setDeleteCardId] = React.useState<CardId | null>(null);
  const [cardActions, setCardActions] = React.useState<CardActionStateById>({});

  const cardsState = useCardsList(query, normalizedDeckId);

  React.useEffect(() => {
    if (!deck) {
      if (!loading) {
        setDeckState(null);
      }
      return;
    }
    setDeckState(deck);
  }, [deck, loading]);

  React.useEffect(() => {
    if (!deckState || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, deckState.id);
  }, [deckState]);

  const availableTags = React.useMemo<TagOptionVm[]>(() => {
    const tagCounts = new Map<string, number>();
    for (const card of cardsState.cards) {
      for (const tag of card.tags) {
        const value = tag.trim().toLowerCase();
        if (!value) {
          continue;
        }
        tagCounts.set(value, (tagCounts.get(value) ?? 0) + 1);
      }
    }

    for (const tag of normalizeTags(query.tags)) {
      if (!tagCounts.has(tag)) {
        tagCounts.set(tag, 0);
      }
    }

    return Array.from(tagCounts.entries()).map(([value, count]) => ({
      value,
      label: value,
      count,
    }));
  }, [cardsState.cards, query.tags]);

  const handleRenameSubmit = React.useCallback(
    async (_deckId: DeckId, patch: UpdateDeckCommand) => {
      if (!deckState) {
        return;
      }

      const original = deckState;
      const optimisticDeck = {
        ...original,
        name: patch.name ?? original.name,
        description: patch.description ?? original.description,
      };

      setDeckAction({ isRenaming: true, isDeleting: false });
      setDeckState(optimisticDeck);

      try {
        const updated = await fetchJson<DeckDto>(`/api/decks/${original.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setDeckState(toDeckDetailVm(updated));
        setDeckAction({ isRenaming: false, isDeleting: false });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setDeckState(null);
          setDeckAction({ isRenaming: false, isDeleting: false });
          return;
        }
        setDeckState(original);
        setDeckAction({
          isRenaming: false,
          isDeleting: false,
          error: err instanceof ApiError ? err.message : "Rename failed. Please try again.",
        });
      }
    },
    [deckState]
  );

  const handleDeleteConfirm = React.useCallback(async () => {
    if (!deckState) {
      setDeleteOpen(false);
      return;
    }

    setDeckAction({ isRenaming: false, isDeleting: true });
    setDeleteOpen(false);

    try {
      await fetchJson<null>(`/api/decks/${deckState.id}`, { method: "DELETE" });
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === deckState.id) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        window.location.href = "/dashboard";
        return;
      }
      setDeckAction({
        isRenaming: false,
        isDeleting: false,
        error: err instanceof ApiError ? err.message : "Delete failed. Please try again.",
      });
    }
  }, [deckState]);

  const handleQueryChange = React.useCallback((next: Partial<CardsQueryVm>) => {
    setQuery((prev) => ({
      ...prev,
      ...next,
      tags: next.tags ? normalizeTags(next.tags) : prev.tags,
    }));
  }, []);

  const handleOpenNewCard = React.useCallback(() => {
    setNewCardOpen(true);
  }, []);

  const handleEditCard = React.useCallback((cardId: CardId) => {
    setEditCardId(cardId);
  }, []);

  const handleDeleteCardRequest = React.useCallback((cardId: CardId) => {
    setDeleteCardId(cardId);
  }, []);

  const handleCardCreated = React.useCallback(async () => {
    await cardsState.refresh();
  }, [cardsState]);

  const handleCardSaved = React.useCallback(async () => {
    await cardsState.refresh();
  }, [cardsState]);

  const updateCardAction = React.useCallback((cardId: CardId, patch: Partial<CardActionStateById[CardId]>) => {
    setCardActions((prev) => ({
      ...prev,
      [cardId]: {
        isUpdating: false,
        isDeleting: false,
        ...prev[cardId],
        ...patch,
      },
    }));
  }, []);

  const clearCardAction = React.useCallback((cardId: CardId) => {
    setCardActions((prev) => {
      const { [cardId]: removed, ...rest } = prev;
      void removed;
      return rest;
    });
  }, []);

  const handleEditSavingChange = React.useCallback(
    (cardId: CardId, isSaving: boolean) => {
      updateCardAction(cardId, { isUpdating: isSaving, error: undefined });
      if (!isSaving) {
        clearCardAction(cardId);
      }
    },
    [clearCardAction, updateCardAction]
  );

  const handleDeleteCardConfirm = React.useCallback(async () => {
    if (!deleteCardId) {
      return;
    }

    updateCardAction(deleteCardId, { isDeleting: true, error: undefined });
    setDeleteCardId(null);

    try {
      await fetchJson<null>(`/api/cards/${deleteCardId}`, { method: "DELETE" });
      clearCardAction(deleteCardId);
      await cardsState.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        clearCardAction(deleteCardId);
        await cardsState.refresh();
        return;
      }
      updateCardAction(deleteCardId, {
        isDeleting: false,
        error: err instanceof ApiError ? err.message : "Delete failed. Please try again.",
      });
    }
  }, [cardsState, clearCardAction, deleteCardId, updateCardAction]);

  const deckVm = deckState;
  const hasFilters = Boolean(query.q.trim() || query.tags.length > 0 || query.aiGenerated !== "all");
  const editCard = editCardId ? (cardsState.cardsById[editCardId] ?? null) : null;
  const deleteCard = deleteCardId ? (cardsState.cardsById[deleteCardId] ?? null) : null;

  if (!isDeckIdValid) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader userEmail={userEmail} />
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-slate-900">Deck not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              The deck link is invalid. Return to your dashboard to select another deck.
            </p>
            <a
              className="mt-4 inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href="/dashboard"
            >
              Back to dashboard
            </a>
          </div>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader userEmail={userEmail} />
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-slate-900">Deck not found</h1>
            <p className="mt-2 text-sm text-slate-600">This deck no longer exists or you do not have access.</p>
            <a
              className="mt-4 inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href="/dashboard"
            >
              Back to dashboard
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader userEmail={userEmail} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              className="mt-3 inline-flex h-9 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {deckVm ? (
          <DeckDetailHeader
            deck={deckVm}
            action={deckAction}
            disabled={loading || deckAction.isDeleting || deckAction.isRenaming}
            onRename={() => setRenameOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate-100" />
          </div>
        )}

        <CardsToolbar
          query={query}
          availableTags={availableTags}
          disabled={loading || cardsState.loadingInitial}
          onQueryChange={handleQueryChange}
          onOpenNewCard={handleOpenNewCard}
        />

        <CardsList
          cards={cardsState.cards}
          actions={cardActions}
          loading={cardsState.loadingInitial}
          error={cardsState.error}
          hasFilters={hasFilters}
          deckId={normalizedDeckId}
          onEdit={handleEditCard}
          onDelete={handleDeleteCardRequest}
          onOpenNewCard={handleOpenNewCard}
        />

        <CardsPagination
          page={cardsState.page}
          loading={cardsState.loadingPage}
          onNext={cardsState.next}
          onPrev={cardsState.prev}
          onRefresh={cardsState.refresh}
        />

        <RenameDeckDialog
          open={renameOpen}
          deck={deckVm ? toDashboardDeckVm(deckVm) : null}
          onOpenChange={setRenameOpen}
          onSubmit={handleRenameSubmit}
        />

        <DeleteDeckConfirmDialog
          open={deleteOpen}
          deckName={deckVm?.name ?? "this deck"}
          onOpenChange={setDeleteOpen}
          onConfirm={handleDeleteConfirm}
        />

        {normalizedDeckId ? (
          <NewCardDialog
            open={newCardOpen}
            deckId={normalizedDeckId}
            onOpenChange={setNewCardOpen}
            onCreated={handleCardCreated}
          />
        ) : null}

        <EditCardDialog
          open={Boolean(editCardId)}
          card={editCard}
          onOpenChange={(open) => {
            if (!open) {
              setEditCardId(null);
            }
          }}
          onSaved={handleCardSaved}
          onSavingChange={handleEditSavingChange}
        />

        <DeleteCardConfirmDialog
          open={Boolean(deleteCardId)}
          frontPreview={deleteCard?.front ?? "this card"}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteCardId(null);
            }
          }}
          onConfirm={handleDeleteCardConfirm}
        />
      </main>
    </div>
  );
}
