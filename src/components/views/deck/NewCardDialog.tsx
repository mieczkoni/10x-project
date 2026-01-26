import * as React from "react";

import type { CardDto, CreateCardCommand, DeckId } from "../../../types";
import { ApiError, fetchJson } from "../../../lib/http/client";
import { useDuplicateCheck } from "../../hooks/useDuplicateCheck";
import { normalizeTags, toCreateCardCommand, type CardEditorFormVm } from "./deck-detail.types";

interface NewCardDialogProps {
  open: boolean;
  deckId: DeckId;
  onOpenChange: (open: boolean) => void;
  onCreated: (card: CardDto) => void;
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

export function NewCardDialog({ open, deckId, onOpenChange, onCreated }: NewCardDialogProps) {
  const [form, setForm] = React.useState<CardEditorFormVm>(defaultForm);
  const frontInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const lastActiveRef = React.useRef<HTMLElement | null>(null);
  const duplicateState = useDuplicateCheck(deckId, form.front, form.back);

  React.useEffect(() => {
    if (!open) {
      setForm(defaultForm);
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

    window.setTimeout(() => {
      frontInputRef.current?.focus();
    }, 0);
  }, [open]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const errors = validateForm(form);
      if (Object.keys(errors).length > 0) {
        setForm((prev) => ({ ...prev, errors }));
        return;
      }

      setForm((prev) => ({ ...prev, submitting: true, errors: {} }));

      const payload: CreateCardCommand = toCreateCardCommand(deckId, form);

      try {
        const created = await fetchJson<CardDto>("/api/cards", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onCreated(created);
        setForm(defaultForm);
        onOpenChange(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (err instanceof ApiError && err.status === 400 && err.code === "invalid_input") {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: { ...prev.errors, form: err.message },
          }));
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: { ...prev.errors, form: "Deck not found. Return to the dashboard." },
          }));
          return;
        }
        if (err instanceof ApiError && err.status === 409 && err.code === "duplicate_in_deck") {
          setForm((prev) => ({
            ...prev,
            submitting: false,
            errors: {
              ...prev.errors,
              form: "A card with identical content already exists in this deck.",
            },
          }));
          return;
        }
        setForm((prev) => ({
          ...prev,
          submitting: false,
          errors: {
            ...prev.errors,
            form: err instanceof ApiError ? err.message : "Unable to create card. Please try again.",
          },
        }));
      }
    },
    [deckId, form, onCreated, onOpenChange]
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

  if (!open) {
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
        aria-labelledby="new-card-title"
        tabIndex={-1}
      >
        <div className="flex flex-col gap-1">
          <h2 id="new-card-title" className="text-lg font-semibold text-slate-900">
            New card
          </h2>
          <p className="text-sm text-slate-600">Add a manual card to this deck.</p>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="new-card-front">
              Front
            </label>
            <textarea
              id="new-card-front"
              ref={frontInputRef}
              className="min-h-[96px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.front}
              onChange={(event) => setForm((prev) => ({ ...prev, front: event.target.value }))}
              aria-invalid={Boolean(form.errors.front)}
              aria-describedby={form.errors.front ? "new-card-front-error" : undefined}
            />
            {form.errors.front ? (
              <p id="new-card-front-error" className="text-xs text-red-600">
                {form.errors.front}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="new-card-back">
              Back
            </label>
            <textarea
              id="new-card-back"
              className="min-h-[140px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.back}
              onChange={(event) => setForm((prev) => ({ ...prev, back: event.target.value }))}
              aria-invalid={Boolean(form.errors.back)}
              aria-describedby={form.errors.back ? "new-card-back-error" : undefined}
            />
            {form.errors.back ? (
              <p id="new-card-back-error" className="text-xs text-red-600">
                {form.errors.back}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="new-card-tags">
              Tags (comma separated)
            </label>
            <input
              id="new-card-tags"
              className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              value={form.tagsText}
              onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))}
              aria-invalid={Boolean(form.errors.tags)}
              aria-describedby={form.errors.tags ? "new-card-tags-error" : undefined}
            />
            {form.errors.tags ? (
              <p id="new-card-tags-error" className="text-xs text-red-600">
                {form.errors.tags}
              </p>
            ) : null}
          </div>

          {duplicateState.status !== "idle" ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                duplicateState.isDuplicate
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
              aria-live="polite"
            >
              {duplicateState.message ||
                (duplicateState.status === "checking" ? "Checking for duplicates…" : "No duplicate found.")}
            </div>
          ) : null}

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
              {form.submitting ? "Saving..." : "Create card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
