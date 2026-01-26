import * as React from "react";

import type { CandidateEditPatchVm, GeneratedCandidateVm } from "./generate.types";

interface CandidateCardProps {
  candidate: GeneratedCandidateVm;
  onToggleSelected: (tempId: string) => void;
  onEdit: (tempId: string) => void;
  onRemove: (tempId: string) => void;
  onEditSave: (tempId: string, patch: CandidateEditPatchVm) => void;
  onEditCancel: (tempId: string) => void;
  disabled?: boolean;
}

interface InlineFormState {
  front: string;
  back: string;
  tagsText: string;
}

const defaultFormState: InlineFormState = {
  front: "",
  back: "",
  tagsText: "",
};

function toInlineForm(candidate: GeneratedCandidateVm): InlineFormState {
  return {
    front: candidate.front,
    back: candidate.back,
    tagsText: candidate.tags.join(", "),
  };
}

export function CandidateCard({
  candidate,
  onToggleSelected,
  onEdit,
  onRemove,
  onEditSave,
  onEditCancel,
  disabled = false,
}: CandidateCardProps) {
  const [form, setForm] = React.useState<InlineFormState>(defaultFormState);

  React.useEffect(() => {
    if (candidate.editing) {
      setForm(toInlineForm(candidate));
    }
  }, [candidate]);

  const isSaving = candidate.saveStatus === "saving";
  const actionDisabled = disabled || isSaving;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={candidate.selected}
              onChange={() => onToggleSelected(candidate.tempId)}
              disabled={actionDisabled}
              aria-label="Select candidate"
            />
            Select
          </label>
          {candidate.duplicate.isDuplicate ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
              Duplicate in deck
            </span>
          ) : null}
        </div>

        {candidate.editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600" htmlFor={`${candidate.tempId}-front`}>
                Front
              </label>
              <textarea
                id={`${candidate.tempId}-front`}
                className="min-h-[80px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                value={form.front}
                onChange={(event) => setForm((prev) => ({ ...prev, front: event.target.value }))}
                disabled={actionDisabled}
                aria-invalid={Boolean(candidate.errors.front)}
              />
              {candidate.errors.front ? <p className="text-xs text-red-600">{candidate.errors.front}</p> : null}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600" htmlFor={`${candidate.tempId}-back`}>
                Back
              </label>
              <textarea
                id={`${candidate.tempId}-back`}
                className="min-h-[120px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                value={form.back}
                onChange={(event) => setForm((prev) => ({ ...prev, back: event.target.value }))}
                disabled={actionDisabled}
                aria-invalid={Boolean(candidate.errors.back)}
              />
              {candidate.errors.back ? <p className="text-xs text-red-600">{candidate.errors.back}</p> : null}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600" htmlFor={`${candidate.tempId}-tags`}>
                Tags (comma separated)
              </label>
              <input
                id={`${candidate.tempId}-tags`}
                className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                value={form.tagsText}
                onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))}
                disabled={actionDisabled}
                aria-invalid={Boolean(candidate.errors.tags)}
              />
              {candidate.errors.tags ? <p className="text-xs text-red-600">{candidate.errors.tags}</p> : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                onClick={() => onEditCancel(candidate.tempId)}
                disabled={actionDisabled}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={() =>
                  onEditSave(candidate.tempId, {
                    front: form.front,
                    back: form.back,
                    tags: form.tagsText.split(",").map((tag) => tag.trim()),
                  })
                }
                disabled={actionDisabled}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Front</p>
              <p className="mt-1 text-sm text-slate-900">{candidate.front}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Back</p>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{candidate.back}</p>
            </div>
            {candidate.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {candidate.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                onClick={() => onEdit(candidate.tempId)}
                disabled={actionDisabled}
              >
                Edit
              </button>
              <button
                type="button"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                onClick={() => onRemove(candidate.tempId)}
                disabled={actionDisabled}
              >
                Remove
              </button>
              {candidate.saveStatus === "saved" ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  Saved
                </span>
              ) : null}
              {candidate.saveStatus === "skipped_duplicate" ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  Skipped duplicate
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
