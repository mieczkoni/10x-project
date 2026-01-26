import type { GenerateOptionsVm } from "./generate.types";

interface GenerateControlsProps {
  options: GenerateOptionsVm;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
  onOptionsChange?: (patch: Partial<GenerateOptionsVm>) => void;
}

export function GenerateControls({
  options,
  canGenerate,
  generating,
  onGenerate,
  onOptionsChange,
}: GenerateControlsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Max cards
          <input
            type="number"
            min={1}
            max={20}
            value={options.maxCards}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) {
                return;
              }
              onOptionsChange?.({ maxCards: value });
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Model (optional)
          <input
            type="text"
            value={options.model ?? ""}
            onChange={(event) => onOptionsChange?.({ model: event.target.value })}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            placeholder="Default model"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Language: English</p>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          onClick={onGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>
    </div>
  );
}
