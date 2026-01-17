import type { DeckId } from "../../../types"
import type { DeckActionStateById, DeckListItemVm, DecksPageVm, DecksQueryVm } from "./dashboard.types"
import { DecksList } from "./DecksList"
import { DecksSearchBar } from "./DecksSearchBar"
import { PaginationFooter } from "./PaginationFooter"

type DecksSectionProps = {
  query: DecksQueryVm
  onQueryChange: (query: DecksQueryVm) => void
  decks: DeckListItemVm[]
  page: DecksPageVm
  loading: boolean
  loadingMore: boolean
  error?: string | null
  actions?: DeckActionStateById
  onRename?: (deckId: DeckId) => void
  onDelete?: (deckId: DeckId) => void
  onLoadMore: () => void
  onRefresh?: () => void
}

export function DecksSection({
  query,
  onQueryChange,
  decks,
  page,
  loading,
  loadingMore,
  error,
  actions,
  onRename,
  onDelete,
  onLoadMore,
  onRefresh,
}: DecksSectionProps) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Decks</h2>
        <p className="text-xs text-slate-500">
          Search and manage your decks. Results update automatically.
        </p>
      </div>

      <DecksSearchBar
        value={query.q}
        onChange={(value) => onQueryChange({ ...query, q: value, cursor: null })}
        disabled={loading}
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3" aria-live="polite">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-700">{error}</p>
            {onRefresh ? (
              <button
                type="button"
                className="h-8 rounded-md border border-red-200 px-3 text-xs text-red-700 hover:bg-red-100"
                onClick={onRefresh}
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <DecksList
        decks={decks}
        actions={actions}
        onRename={onRename}
        onDelete={onDelete}
        query={query.q}
        loading={loading}
      />

      <PaginationFooter
        hasMore={Boolean(page.nextCursor)}
        loading={loadingMore}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
      />
    </section>
  )
}
