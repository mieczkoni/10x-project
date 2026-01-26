import * as React from "react";

import type { DeckActionVm, DeckDetailVm } from "./deck-detail.types";

interface DeckDetailHeaderProps {
  deck: DeckDetailVm;
  action: DeckActionVm;
  disabled?: boolean;
  onRename: () => void;
  onDelete: () => void;
}

export function DeckDetailHeader({ deck, action, disabled, onRename, onDelete }: DeckDetailHeaderProps) {
  const isBusy = disabled || action.isRenaming || action.isDeleting;

  return (
    <header className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">{deck.name}</h1>
          {deck.description ? (
            <p className="text-sm text-slate-600">{deck.description}</p>
          ) : (
            <p className="text-sm text-slate-400">No description provided.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            onClick={onRename}
            disabled={Boolean(isBusy)}
          >
            Rename
          </button>
          <button
            type="button"
            className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            onClick={onDelete}
            disabled={Boolean(isBusy)}
          >
            Delete
          </button>
        </div>
      </div>

      {action.error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{action.error}</div>
      ) : null}
    </header>
  );
}
