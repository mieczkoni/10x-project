import * as React from "react"

import type { DeckId } from "../../../types"
import type { DeckListItemVm } from "./dashboard.types"

type CurrentDeckSelectorProps = {
  decks: DeckListItemVm[]
  value: DeckId | null
  onChange: (deckId: DeckId) => void
  disabled?: boolean
}

export function CurrentDeckSelector({
  decks,
  value,
  onChange,
  disabled = false,
}: CurrentDeckSelectorProps) {
  const selectId = React.useId()
  const isDisabled = disabled || decks.length === 0

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs font-medium text-slate-600">
        Current deck
      </label>
      <select
        id={selectId}
        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value as DeckId)}
        disabled={isDisabled}
        aria-describedby={`${selectId}-hint`}
      >
        <option value="" disabled>
          {decks.length === 0 ? "No decks yet" : "Select a deck"}
        </option>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
      <p id={`${selectId}-hint`} className="text-xs text-slate-500">
        Choose the default deck for generation and other actions.
      </p>
    </div>
  )
}
