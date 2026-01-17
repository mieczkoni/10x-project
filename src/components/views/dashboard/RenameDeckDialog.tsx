import * as React from "react"

import type { DeckId, UpdateDeckCommand } from "../../../types"
import type { DeckListItemVm } from "./dashboard.types"

type RenameDeckDialogProps = {
  open: boolean
  deck: DeckListItemVm | null
  onOpenChange: (open: boolean) => void
  onSubmit: (deckId: DeckId, patch: UpdateDeckCommand) => void
}

const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 2000

type FormState = {
  name: string
  description: string
  errors: {
    name?: string
    description?: string
    form?: string
  }
}

function validateForm(form: FormState) {
  const errors: FormState["errors"] = {}
  const name = form.name.trim()
  const description = form.description.trim()

  if (!name) {
    errors.name = "Deck name is required."
  } else if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters.`
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`
  }

  return errors
}

export function RenameDeckDialog({
  open,
  deck,
  onOpenChange,
  onSubmit,
}: RenameDeckDialogProps) {
  const [form, setForm] = React.useState<FormState>({
    name: deck?.name ?? "",
    description: deck?.description ?? "",
    errors: {},
  })
  const nameInputRef = React.useRef<HTMLInputElement | null>(null)
  const lastActiveRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) {
      setForm({ name: deck?.name ?? "", description: deck?.description ?? "", errors: {} })
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

    setForm({ name: deck?.name ?? "", description: deck?.description ?? "", errors: {} })
    window.setTimeout(() => {
      nameInputRef.current?.focus()
    }, 0)
  }, [open, deck])

  const handleClose = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  if (!open || !deck) {
    return null
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors = validateForm(form)
    if (Object.keys(errors).length > 0) {
      setForm((prev) => ({ ...prev, errors }))
      return
    }

    const patch: UpdateDeckCommand = {}
    const name = form.name.trim()
    const description = form.description.trim()

    if (name !== deck.name) {
      patch.name = name
    }
    if ((deck.description ?? "") !== description) {
      patch.description = description ? description : null
    }

    if (Object.keys(patch).length === 0) {
      setForm((prev) => ({
        ...prev,
        errors: { form: "No changes to save." },
      }))
      return
    }

    onSubmit(deck.id, patch)
    onOpenChange(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-deck-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            handleClose()
          }
        }}
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id="rename-deck-title" className="text-lg font-semibold text-slate-900">
            Rename deck
          </h2>
          <p className="text-sm text-slate-600">Update the name or description.</p>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="rename-deck-name">
              Name
            </label>
            <input
              id="rename-deck-name"
              ref={nameInputRef}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              aria-invalid={Boolean(form.errors.name)}
              aria-describedby={form.errors.name ? "rename-deck-name-error" : undefined}
              required
            />
            {form.errors.name ? (
              <p id="rename-deck-name-error" className="text-xs text-red-600">
                {form.errors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="rename-deck-description">
              Description
            </label>
            <textarea
              id="rename-deck-description"
              className="min-h-[96px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              aria-invalid={Boolean(form.errors.description)}
              aria-describedby={
                form.errors.description ? "rename-deck-description-error" : undefined
              }
            />
            {form.errors.description ? (
              <p id="rename-deck-description-error" className="text-xs text-red-600">
                {form.errors.description}
              </p>
            ) : null}
          </div>

          {form.errors.form ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3" aria-live="assertive">
              <p className="text-xs text-red-700">{form.errors.form}</p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
