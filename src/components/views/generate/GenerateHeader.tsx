import type { DeckId } from "../../../types"
import type { CurrentDeckVm, DeckListItemVm } from "../dashboard/dashboard.types"
import { CurrentDeckSelector } from "../dashboard/CurrentDeckSelector"

type GenerateHeaderProps = {
  decks: DeckListItemVm[]
  currentDeck: CurrentDeckVm
  onSelectDeck: (deckId: DeckId) => void
  disabled?: boolean
}

export function GenerateHeader({
  decks,
  currentDeck,
  onSelectDeck,
  disabled = false,
}: GenerateHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Generate</h1>
        <p className="text-sm text-slate-600">
          Paste source text to generate flashcard candidates and save them to a deck.
        </p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <CurrentDeckSelector
          decks={decks}
          value={currentDeck.deckId}
          onChange={onSelectDeck}
          disabled={disabled}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
          <a
            className="rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
            href="/dashboard"
          >
            Back to dashboard
          </a>
          {currentDeck.deckId ? (
            <a
              className="rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
              href={`/dashboard/decks/${currentDeck.deckId}`}
            >
              View deck
            </a>
          ) : null}
        </div>
      </div>
    </header>
  )
}
