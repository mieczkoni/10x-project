import type { DeckId } from "../../../types"
import type { SaveResultsVm } from "./generate.types"

type SaveResultsPanelProps = {
  results: SaveResultsVm | null
  currentDeckId: DeckId | null
}

export function SaveResultsPanel({ results, currentDeckId }: SaveResultsPanelProps) {
  if (!results || results.status === "idle") {
    return null
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Save results</h2>
        <div className="text-sm text-slate-700" aria-live="polite">
          {results.message ?? "Save attempt completed."}
        </div>
        {results.error ? <p className="text-sm text-red-600">{results.error}</p> : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Created</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{results.createdCount}</p>
        </div>
        <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Skipped duplicates</p>
          <p className="mt-1 text-xl font-semibold text-amber-900">{results.skippedCount}</p>
        </div>
      </div>

      {results.skipped.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Skipped details</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-slate-700">
            {results.skipped.map((item, index) => (
              <li key={`${item.front}-${index}`} className="rounded-md border border-slate-100 p-3">
                <p className="font-medium text-slate-900">{item.front}</p>
                <p className="text-slate-600">{item.back}</p>
                <p className="text-xs text-amber-700">{item.reason.replace(/_/g, " ")}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {currentDeckId ? (
        <a
          className="mt-4 inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          href={`/dashboard/decks/${currentDeckId}`}
        >
          View deck
        </a>
      ) : null}
    </section>
  )
}
