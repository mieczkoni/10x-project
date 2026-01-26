import type * as React from "react";

import type { DeckId } from "../../../types";
import type { CurrentDeckVm, DeckListItemVm } from "./dashboard.types";
import { CurrentDeckSelector } from "./CurrentDeckSelector";
import { PrimaryCtas } from "./PrimaryCtas";

interface DashboardHeaderProps {
  decks: DeckListItemVm[];
  currentDeck: CurrentDeckVm;
  onSelectDeck: (deckId: DeckId) => void;
  onOpenCreateDeck: () => void;
  onNewGenerationClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  showDeckSelectionPrompt?: boolean;
  newGenerationHref?: string;
  disabled?: boolean;
}

export function DashboardHeader({
  decks,
  currentDeck,
  onSelectDeck,
  onOpenCreateDeck,
  onNewGenerationClick,
  showDeckSelectionPrompt,
  newGenerationHref = "/dashboard/generate",
  disabled = false,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Manage your decks and start generating new cards.</p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <CurrentDeckSelector
          decks={decks}
          value={currentDeck.deckId}
          onChange={onSelectDeck}
          disabled={disabled}
          showSelectionPrompt={showDeckSelectionPrompt}
        />
        <PrimaryCtas
          onCreateDeckClick={onOpenCreateDeck}
          newGenerationHref={newGenerationHref}
          onNewGenerationClick={onNewGenerationClick}
          disabled={disabled}
        />
      </div>
    </header>
  );
}
