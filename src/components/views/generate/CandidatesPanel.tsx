import type { CandidateEditPatchVm, GeneratedCandidateVm } from "./generate.types"
import { CandidatesList } from "./CandidatesList"

type CandidatesPanelProps = {
  candidates: GeneratedCandidateVm[]
  onToggleSelected: (tempId: string) => void
  onEdit: (tempId: string) => void
  onRemove: (tempId: string) => void
  onEditSave: (tempId: string, patch: CandidateEditPatchVm) => void
  onEditCancel: (tempId: string) => void
  disabled?: boolean
}

export function CandidatesPanel({
  candidates,
  onToggleSelected,
  onEdit,
  onRemove,
  onEditSave,
  onEditCancel,
  disabled = false,
}: CandidatesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Candidates</h2>
        <span className="text-xs text-slate-500">{candidates.length} total</span>
      </div>
      <div className="mt-4">
        {candidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Paste text above and click Generate to see candidate cards here.
          </div>
        ) : (
          <CandidatesList
            items={candidates}
            onToggleSelected={onToggleSelected}
            onEdit={onEdit}
            onRemove={onRemove}
            onEditSave={onEditSave}
            onEditCancel={onEditCancel}
            disabled={disabled}
          />
        )}
      </div>
    </section>
  )
}
