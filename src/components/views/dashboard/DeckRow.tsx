import type { DeckId } from "../../../types"
import type { DeckActionState, DeckListItemVm } from "./dashboard.types"

type DeckRowProps = {
  deck: DeckListItemVm
  actionState?: DeckActionState
  onRename?: (deckId: DeckId) => void
  onDelete?: (deckId: DeckId) => void
}

export function DeckRow({ deck, actionState, onRename, onDelete }: DeckRowProps) {
  const isRenaming = actionState?.isRenaming ?? false
  const isDeleting = actionState?.isDeleting ?? false

  return (
    <li className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <a
            className="text-base font-semibold text-slate-900 hover:text-slate-700"
            href={`/dashboard/decks/${deck.id}`}
          >
            {actionState?.optimisticName ?? deck.name}
          </a>
          {actionState?.optimisticDescription ?? deck.description ? (
            <p className="text-sm text-slate-600">
              {actionState?.optimisticDescription ?? deck.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={() => onRename?.(deck.id)}
            disabled={!onRename || isRenaming || isDeleting}
          >
            {isRenaming ? "Renaming..." : "Rename"}
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-red-200 px-3 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            onClick={() => onDelete?.(deck.id)}
            disabled={!onDelete || isRenaming || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {actionState?.error ? (
        <p className="mt-2 text-xs text-red-600" aria-live="polite">
          {actionState.error}
        </p>
      ) : null}
    </li>
  )
}
