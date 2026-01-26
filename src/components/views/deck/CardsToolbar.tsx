import * as React from "react";

import type { CardsQueryVm, TagOptionVm } from "./deck-detail.types";

interface CardsToolbarProps {
  query: CardsQueryVm;
  availableTags: TagOptionVm[];
  disabled?: boolean;
  onQueryChange: (next: Partial<CardsQueryVm>) => void;
  onOpenNewCard: () => void;
}

const MAX_QUERY_LENGTH = 200;

export function CardsToolbar({ query, availableTags, disabled, onQueryChange, onOpenNewCard }: CardsToolbarProps) {
  const searchId = React.useId();
  const helperId = React.useId();
  const selectedTags = React.useMemo(() => new Set(query.tags), [query.tags]);

  const handleSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onQueryChange({ q: event.target.value });
    },
    [onQueryChange]
  );

  const handleToggleTag = React.useCallback(
    (tag: string) => {
      const nextTags = selectedTags.has(tag) ? query.tags.filter((value) => value !== tag) : [...query.tags, tag];
      onQueryChange({ tags: nextTags });
    },
    [onQueryChange, query.tags, selectedTags]
  );

  const handleClearFilters = React.useCallback(() => {
    onQueryChange({ tags: [], aiGenerated: "all" });
  }, [onQueryChange]);

  const handleAiFilter = React.useCallback(
    (value: CardsQueryVm["aiGenerated"]) => {
      onQueryChange({ aiGenerated: value });
    },
    [onQueryChange]
  );

  const trimmedSearch = query.q.trim();
  const showTagFilters = availableTags.length > 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-medium text-slate-600" htmlFor={searchId}>
            Search cards
          </label>
          <input
            id={searchId}
            type="search"
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            value={query.q}
            onChange={handleSearchChange}
            maxLength={MAX_QUERY_LENGTH}
            aria-describedby={helperId}
            disabled={Boolean(disabled)}
            placeholder="Search by front or back text"
          />
          <div className="flex items-center justify-between text-xs text-slate-500" id={helperId}>
            <span>{trimmedSearch ? `Searching for “${trimmedSearch}”` : "Search within this deck."}</span>
            <span>
              {query.q.length}/{MAX_QUERY_LENGTH}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-200 text-xs font-medium text-slate-600">
            {(["all", "ai", "manual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`h-9 px-3 ${
                  query.aiGenerated === value ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => handleAiFilter(value)}
                disabled={Boolean(disabled)}
                aria-pressed={query.aiGenerated === value}
              >
                {value === "all" ? "All" : value === "ai" ? "AI only" : "Manual only"}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={onOpenNewCard}
            disabled={Boolean(disabled)}
          >
            New card
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">Filter by tags</p>
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:text-slate-300"
            onClick={handleClearFilters}
            disabled={Boolean(disabled || (query.tags.length === 0 && query.aiGenerated === "all"))}
          >
            Clear filters
          </button>
        </div>

        {showTagFilters ? (
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isSelected = selectedTags.has(tag.value);
              return (
                <button
                  key={tag.value}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => handleToggleTag(tag.value)}
                  disabled={Boolean(disabled)}
                  aria-pressed={isSelected}
                >
                  {tag.label}
                  {typeof tag.count === "number" ? ` · ${tag.count}` : ""}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Tags will appear after cards load.</p>
        )}
      </div>
    </section>
  );
}
