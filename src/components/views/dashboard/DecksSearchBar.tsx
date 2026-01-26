import * as React from "react";

interface DecksSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const MAX_QUERY_LENGTH = 200;

export function DecksSearchBar({ value, onChange, disabled = false }: DecksSearchBarProps) {
  const inputId = React.useId();
  const helperId = `${inputId}-helper`;
  const trimmedValue = value.trim();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-xs font-medium text-slate-600">
        Search decks
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search by name or description"
          maxLength={MAX_QUERY_LENGTH}
          className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          disabled={disabled}
          aria-describedby={helperId}
        />
        {value ? (
          <button
            type="button"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={() => onChange("")}
            disabled={disabled}
          >
            Clear
          </button>
        ) : null}
      </div>
      <p id={helperId} className="text-xs text-slate-500">
        {trimmedValue ? `Searching for “${trimmedValue}”` : "Showing all decks"} · {value.length}/{MAX_QUERY_LENGTH}
      </p>
    </div>
  );
}
