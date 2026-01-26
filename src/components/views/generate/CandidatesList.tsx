import type { CandidateEditPatchVm, GeneratedCandidateVm } from "./generate.types";
import { CandidateCard } from "./CandidateCard";

interface CandidatesListProps {
  items: GeneratedCandidateVm[];
  onToggleSelected: (tempId: string) => void;
  onEdit: (tempId: string) => void;
  onRemove: (tempId: string) => void;
  onEditSave: (tempId: string, patch: CandidateEditPatchVm) => void;
  onEditCancel: (tempId: string) => void;
  disabled?: boolean;
}

export function CandidatesList({
  items,
  onToggleSelected,
  onEdit,
  onRemove,
  onEditSave,
  onEditCancel,
  disabled = false,
}: CandidatesListProps) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((candidate) => (
        <li key={candidate.tempId}>
          <CandidateCard
            candidate={candidate}
            onToggleSelected={onToggleSelected}
            onEdit={onEdit}
            onRemove={onRemove}
            onEditSave={onEditSave}
            onEditCancel={onEditCancel}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
}
