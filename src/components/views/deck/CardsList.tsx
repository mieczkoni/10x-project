import * as React from "react"

import type { CardId } from "../../../types"
import type { CardActionStateById, CardListItemVm } from "./deck-detail.types"
import { CardRow } from "./CardRow"

type CardsListProps = {
  cards: CardListItemVm[]
  actions: CardActionStateById
  loading: boolean
  error: string | null
  hasFilters: boolean
  deckId: string | null
  onEdit: (cardId: CardId) => void
  onDelete: (cardId: CardId) => void
  onOpenNewCard: () => void
}

export function CardsList({
  cards,
  actions,
  loading,
  error,
  hasFilters,
  deckId,
  onEdit,
  onDelete,
  onOpenNewCard,
}: CardsListProps) {
  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading cards...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">{error}</p>
      </section>
    )
  }

  if (cards.length === 0) {
    const generateHref = deckId ? `/dashboard/generate?deckId=${deckId}` : "/dashboard/generate"
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-sm font-semibold text-slate-900">
          {hasFilters ? "No results" : "No cards yet"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {hasFilters
            ? "Try adjusting your filters or search terms."
            : "Create your first card to start studying."}
        </p>
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            onClick={onOpenNewCard}
          >
            New card
          </button>
          <a
            className="inline-flex h-9 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={generateHref}
          >
            Generate cards
          </a>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <ul className="space-y-3">
        {cards.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actionState={actions[card.id]}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </section>
  )
}
