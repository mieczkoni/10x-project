import * as React from "react"

import type { CardId } from "../../../types"
import type { CardActionState, CardListItemVm } from "./deck-detail.types"

type CardRowProps = {
  card: CardListItemVm
  actionState?: CardActionState
  onEdit?: (cardId: CardId) => void
  onDelete?: (cardId: CardId) => void
}

export function CardRow({ card, actionState, onEdit, onDelete }: CardRowProps) {
  const isBusy = Boolean(actionState?.isDeleting || actionState?.isUpdating)

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{card.front}</p>
          <p className="text-sm text-slate-600">{card.back}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {card.aiGenerated ? (
            <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              AI-generated
            </span>
          ) : null}
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
        {actionState?.error ? (
          <p className="text-xs text-red-600" aria-live="polite">
            {actionState.error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={() => onEdit?.(card.id)}
          disabled={isBusy}
          aria-label={`Edit card ${card.front}`}
        >
          Edit
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
          onClick={() => onDelete?.(card.id)}
          disabled={isBusy}
          aria-label={`Delete card ${card.front}`}
        >
          Delete
        </button>
      </div>
    </li>
  )
}
