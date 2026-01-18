import * as React from "react"

import type { DeckId } from "../../../types"
import type { DeckListItemVm } from "../dashboard/dashboard.types"

type SelectDeckDialogProps = {
  open: boolean
  decks: DeckListItemVm[]
  value: DeckId | null
  onChange: (deckId: DeckId) => void
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function SelectDeckDialog({
  open,
  decks,
  value,
  onChange,
  onConfirm,
  onOpenChange,
}: SelectDeckDialogProps) {
  const selectRef = React.useRef<HTMLSelectElement | null>(null)
  const lastActiveRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) {
      if (lastActiveRef.current) {
        lastActiveRef.current.focus()
      }
      return
    }

    if (typeof document !== "undefined") {
      const active = document.activeElement
      if (active instanceof HTMLElement) {
        lastActiveRef.current = active
      }
    }

    window.setTimeout(() => {
      selectRef.current?.focus()
    }, 0)
  }, [open])

  if (!open) {
    return null
  }

  const disableConfirm = !value

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-deck-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onOpenChange(false)
          }
        }}
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id="select-deck-title" className="text-lg font-semibold text-slate-900">
            Choose a deck
          </h2>
          <p className="text-sm text-slate-600">Select where you want to save these cards.</p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="select-deck-input">
            Deck
          </label>
          <select
            id="select-deck-input"
            ref={selectRef}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value as DeckId)}
          >
            <option value="" disabled>
              {decks.length === 0 ? "No decks available" : "Select a deck"}
            </option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          {decks.length === 0 ? (
            <p className="text-xs text-slate-500">Create a deck first on the dashboard.</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={onConfirm}
            disabled={disableConfirm}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
