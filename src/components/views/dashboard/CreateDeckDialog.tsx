import * as React from "react"

import type { CreateDeckCommand, DeckDto } from "../../../types"
import { ApiError, fetchJson } from "../../../lib/http/client"
import type { CreateDeckFormVm } from "./dashboard.types"

type CreateDeckDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (deck: DeckDto) => void
}

const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 2000

function validateForm(form: CreateDeckFormVm): CreateDeckFormVm["errors"] {
  const errors: CreateDeckFormVm["errors"] = {}
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

export function CreateDeckDialog({ open, onOpenChange, onCreated }: CreateDeckDialogProps) {
  const [form, setForm] = React.useState<CreateDeckFormVm>({
    name: "",
    description: "",
    errors: {},
    submitting: false,
  })
  const nameInputRef = React.useRef<HTMLInputElement | null>(null)
  const lastActiveRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) {
      setForm((prev) => ({
        ...prev,
        errors: {},
        submitting: false,
      }))
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
      nameInputRef.current?.focus()
    }, 0)
  }, [open])

  const handleClose = React.useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const errors = validateForm(form)
      if (Object.keys(errors).length > 0) {
        setForm((prev) => ({ ...prev, errors }))
        return
      }

      setForm((prev) => ({ ...prev, submitting: true, errors: {} }))

      const payload: CreateDeckCommand = {
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
      }

      try {
        const created = await fetchJson<DeckDto>("/api/decks", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        onCreated(created)
        setForm({ name: "", description: "", errors: {}, submitting: false })
        onOpenChange(false)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login"
          return
        }
        const message =
          err instanceof ApiError ? err.message : "Unable to create the deck. Please try again."
        setForm((prev) => ({
          ...prev,
          submitting: false,
          errors: { ...prev.errors, form: message },
        }))
      }
    },
    [form, onCreated, onOpenChange]
  )

  if (!open) {
    return null
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
        aria-labelledby="create-deck-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            handleClose()
          }
        }}
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id="create-deck-title" className="text-lg font-semibold text-slate-900">
            Create deck
          </h2>
          <p className="text-sm text-slate-600">Give your deck a name and optional description.</p>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="deck-name">
              Name
            </label>
            <input
              id="deck-name"
              ref={nameInputRef}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              aria-invalid={Boolean(form.errors.name)}
              aria-describedby={form.errors.name ? "deck-name-error" : undefined}
              required
            />
            {form.errors.name ? (
              <p id="deck-name-error" className="text-xs text-red-600">
                {form.errors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="deck-description">
              Description
            </label>
            <textarea
              id="deck-description"
              className="min-h-[96px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              aria-invalid={Boolean(form.errors.description)}
              aria-describedby={form.errors.description ? "deck-description-error" : undefined}
            />
            {form.errors.description ? (
              <p id="deck-description-error" className="text-xs text-red-600">
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
              className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              onClick={handleClose}
              disabled={form.submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={form.submitting}
            >
              {form.submitting ? "Creating..." : "Create deck"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
