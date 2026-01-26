interface BulkActionBarProps {
  selectedCount: number;
  saving: boolean;
  canSave: boolean;
  onSaveSelected: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  saving,
  canSave,
  onSaveSelected,
  onClearSelection,
}: BulkActionBarProps) {
  return (
    <div className="sm:rounded-lg sm:border sm:border-slate-200 sm:bg-white sm:p-4">
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-4 shadow-lg sm:static sm:border-none sm:p-0 sm:shadow-none">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {selectedCount} selected
            {saving ? " • Saving..." : ""}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              onClick={onClearSelection}
              disabled={selectedCount === 0 || saving}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={onSaveSelected}
              disabled={!canSave || saving}
            >
              {saving ? "Saving..." : "Save selected"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
