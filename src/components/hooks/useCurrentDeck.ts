import * as React from "react";

import type { DeckId } from "../../types";
import type { CurrentDeckVm, DeckListItemVm } from "../views/dashboard/dashboard.types";

const STORAGE_KEY = "currentDeckId";

export function useCurrentDeck(decks: DeckListItemVm[]) {
  const [currentDeckId, setCurrentDeckId] = React.useState<DeckId | null>(null);
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCurrentDeckId(stored as DeckId);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (currentDeckId) {
      window.localStorage.setItem(STORAGE_KEY, currentDeckId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentDeckId]);

  React.useEffect(() => {
    if (!currentDeckId) {
      return;
    }
    const exists = decks.some((deck) => deck.id === currentDeckId);
    if (!exists) {
      setCurrentDeckId(null);
    }
  }, [currentDeckId, decks]);

  const currentDeck = React.useMemo<CurrentDeckVm>(() => {
    const selected = currentDeckId ? decks.find((deck) => deck.id === currentDeckId) : null;

    return {
      deckId: selected?.id ?? null,
      deckName: selected?.name ?? null,
    };
  }, [currentDeckId, decks]);

  const setCurrentDeck = React.useCallback((deckId: DeckId | null) => {
    setCurrentDeckId(deckId);
  }, []);

  return {
    currentDeck,
    setCurrentDeck,
  };
}
