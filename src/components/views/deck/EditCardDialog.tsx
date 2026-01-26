import * as React from "react";

import type { CardDto, CardId } from "../../../types";
import { ApiError, fetchJson } from "../../../lib/http/client";
import { normalizeTags, toUpdateCardCommand, type CardEditorFormVm } from "./deck-detail.types";

interface EditCardDialogProps {
  open: boolean;
  card: CardDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (card: CardDto) => void;
  onSavingChange?: (cardId: CardId, isSaving: boolean) => void;
}

const FRONT_MAX = 2000;
const BACK_MAX = 10000;
const TAG_MAX_COUNT = 20;
const TAG_MAX_LENGTH = 50;

const defaultForm: CardEditorFormVm = {
  front: "",
  back: "",
  tagsText: "",
  errors: {},
  submitting: false,
};

function toFormState(card: CardDto | null): CardEditorFormVm {
  if (!card) {
    return defaultForm;
  }
  return {
    front: card.front,
    back: card.back,
    tagsText: (card.tags ?? []).join(", "),
    errors: {},
    submitting: false,
  };
}

function validateForm(form: CardEditorFormVm) {
  const errors: CardEditorFormVm["errors"] = {};
  const front = form.front.trim();
  const back = form.back.trim();
  const tags = normalizeTags(form.tagsText.split(","));

  if (!front) {
    errors.front = "Front is required.";
  } else if (front.length > FRONT_MAX) {
    errors.front = `Front must be ${FRONT_MAX} characters or less.`;
  }

  if (!back) {
    errors.back = "Back is required.";
  } else if (back.length > BACK_MAX) {
    errors.back = `Back must be ${BACK_MAX} characters or less.`;
  }

  if (tags.length > TAG_MAX_COUNT) {
    errors.tags = `Tags must be ${TAG_MAX_COUNT} or fewer.`;
  } else if (tags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
    errors.tags = `Each tag must be ${TAG_MAX_LENGTH} characters or less.`;
  }

  return errors;
}

export function EditCardDialog({ open, card, onOpenChange, onSaved, onSavingChange }: EditCardDialogProps) {
  const [form, setForm] = React.useState<CardEditorFormVm>(defaultForm);
  const frontInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const lastActiveRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setForm(toFormState(card));
      if (lastActiveRef.current) {
        lastActiveRef.current.focus();
      }
      return;
    }

    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        lastActiveRef.current = active;
      }
    }

    setForm(toFormState(card));

    window.setTimeout(() => {
      frontInputRef.current?.focus();
    }, 0);
  }, [card, open]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!card) {
        return;
      }
      const errors = validateForm(form);
      if (Object.keys(errors).length > 0) {
        setForm((prev) => ({ ...prev, errors }));
        return;
      }

      const patch = toUpdateCardCommand(form, card);

      if (Object.keys(patch).length === 0) {
        setForm((prev) => ({
          ...prev,
          errors: { ...prev.errors, form: "No changes to save." },
        }));
        return;
      }

      setForm((prev) => ({ ...prev, submitting: true, errors: {} }));
      onSavingChange?.(card.id, true);

      try {
        const updated = await fetchJson<CardDto>(`/api/cards/${card.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        onSaved(updated);
        setForm(defaultForm);
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: {
              ...prev.errors,
              form: "This card no longer exists. Refresh the list to continue.",
            },
          }));
          return;
        }
        if (err instanceof ApiError && err.status === 400 && err.code === "invalid_input") {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: {
              ...prev.errors,
              form: err.message,
            },
          }));
          return;
        }
        if (err instanceof ApiError && err.status === 409 && err.code === "duplicate_in_deck") {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: {
              ...prev.errors,
              form: "Updated content matches an existing card in this deck.",
            },
          }));
          return;
        }
        setForm((prev) => ({
          ...prev,
          submitting: false,
          errors: {
            ...prev.errors,
            form: err instanceof ApiError ? err.message : "Unable to update card. Please try again.",
          },
        }));
      } finally {
        onSavingChange?.(card.id, false);
      }
    },
    [card, form, onOpenChange, onSaved, onSavingChange]
  );

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, open]);

  if (!open || !card) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-pointer"
        onClick={handleClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        className="relative z-10 w-full max-w-xl rounded-lg bg-white p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-card-title"
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id="edit-card-title" className="text-lg font-semibold text-slate-900">
            Edit card
          </h2>
          <p className="text-sm text-slate-600">Update front, back, or tags.</p>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="edit-card-front">
              Front
            </label>
            <textarea
              id="edit-card-front"
              ref={frontInputRef}
              className="min-h-[96px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.front}
              onChange={(event) => setForm((prev) => ({ ...prev, front: event.target.value }))}
              aria-invalid={Boolean(form.errors.front)}
              aria-describedby={form.errors.front ? "edit-card-front-error" : undefined}
            />
            {form.errors.front ? (
              <p id="edit-card-front-error" className="text-xs text-red-600">
                {form.errors.front}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="edit-card-back">
              Back
            </label>
            <textarea
              id="edit-card-back"
              className="min-h-[140px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.back}
              onChange={(event) => setForm((prev) => ({ ...prev, back: event.target.value }))}
              aria-invalid={Boolean(form.errors.back)}
              aria-describedby={form.errors.back ? "edit-card-back-error" : undefined}
            />
            {form.errors.back ? (
              <p id="edit-card-back-error" className="text-xs text-red-600">
                {form.errors.back}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="edit-card-tags">
              Tags (comma separated)
            </label>
            <input
              id="edit-card-tags"
              className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.tagsText}
              onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))}
              aria-invalid={Boolean(form.errors.tags)}
              aria-describedby={form.errors.tags ? "edit-card-tags-error" : undefined}
            />
            {form.errors.tags ? (
              <p id="edit-card-tags-error" className="text-xs text-red-600">
                {form.errors.tags}
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
              {form.submitting ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
