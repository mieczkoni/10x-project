import * as React from "react";

import type { DeckId } from "../../../types";
import type { DeckListItemVm } from "./dashboard.types";

interface CurrentDeckSelectorProps {
  decks: DeckListItemVm[];
  value: DeckId | null;
  onChange: (deckId: DeckId) => void;
  disabled?: boolean;
  showSelectionPrompt?: boolean;
  selectionPromptText?: string;
}

export function CurrentDeckSelector({
  decks,
  value,
  onChange,
  disabled = false,
  showSelectionPrompt = false,
  selectionPromptText = "Select a deck to start a new generation.",
}: CurrentDeckSelectorProps) {
  const selectId = React.useId();
  const promptId = `${selectId}-prompt`;
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const isDisabled = disabled || decks.length === 0;
  const showHint = !isDisabled;
  const ariaDescribedBy = showSelectionPrompt ? `${selectId}-hint ${promptId}` : `${selectId}-hint`;

  React.useEffect(() => {
    if (showSelectionPrompt && !isDisabled) {
      selectRef.current?.focus();
    }
  }, [showSelectionPrompt, isDisabled]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs font-medium text-slate-600">
        Current deck
      </label>
      <select
        id={selectId}
        ref={selectRef}
        className={`h-10 rounded-md border bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-900 ${
          showSelectionPrompt
            ? "border-red-300 focus-visible:ring-red-200"
            : "border-slate-200 focus-visible:ring-slate-300"
        }`}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value as DeckId)}
        disabled={isDisabled}
        aria-describedby={ariaDescribedBy}
      >
        <option value="" disabled>
          {decks.length === 0 ? "No decks yet" : "Select a deck"}
        </option>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
      {showSelectionPrompt ? (
        <p id={promptId} className="text-xs text-red-600" aria-live="polite">
          {selectionPromptText}
        </p>
      ) : null}
      {showHint ? (
        <p id={`${selectId}-hint`} className="text-xs text-slate-500">
          Choose the default deck for generation and other actions.
        </p>
      ) : null}
    </div>
  );
}
