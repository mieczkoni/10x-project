import type { DeckId } from "../../../types"
import type { DeckActionStateById, DeckListItemVm } from "./dashboard.types"
import { DeckRow } from "./DeckRow"

type DecksListProps = {
  decks: DeckListItemVm[]
  actions?: DeckActionStateById
  onRename?: (deckId: DeckId) => void
  onDelete?: (deckId: DeckId) => void
  query?: string
  loading?: boolean
}

export function DecksList({
  decks,
  actions = {},
  onRename,
  onDelete,
  query = "",
  loading = false,
}: DecksListProps) {
  if (loading) {
    return <p className="text-sm text-slate-600">Loading decks...</p>
  }

  if (decks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          {query ? `No decks match “${query.trim()}”` : "Create your first deck"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {query ? "Try a different search term." : "Your decks will show up here."}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {decks.map((deck) => (
        <DeckRow
          key={deck.id}
          deck={deck}
          actionState={actions[deck.id]}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}
