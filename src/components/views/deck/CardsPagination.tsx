import * as React from "react"

import type { CardsPageVm } from "./deck-detail.types"

type CardsPaginationProps = {
  page: CardsPageVm
  loading: boolean
  onNext: () => Promise<void>
  onPrev: () => Promise<void>
  onRefresh: () => Promise<void>
}

export function CardsPagination({ page, loading, onNext, onPrev, onRefresh }: CardsPaginationProps) {
  const hasPrev = page.cursorStack.length > 0
  const hasNext = Boolean(page.nextCursor)

  return (
    <nav
      aria-label="Cards pagination"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="text-xs text-slate-500" aria-live="polite">
        {loading ? "Loading cards…" : "Browse cards"}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={() => void onPrev()}
          disabled={loading || !hasPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          Refresh
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={() => void onNext()}
          disabled={loading || !hasNext}
        >
          Next
        </button>
      </div>
    </nav>
  )
}
