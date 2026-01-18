import * as React from "react"

import type { DeckDto, DeckId } from "../../types"
import { ApiError, fetchJson } from "../../lib/http/client"
import type { DeckDetailVm } from "../views/deck/deck-detail.types"
import { toDeckDetailVm } from "../views/deck/deck-detail.types"

type UseDeckState = {
  deck: DeckDetailVm | null
  loading: boolean
  error: string | null
  notFound: boolean
  refresh: () => Promise<void>
}

export function useDeck(deckId: DeckId | null): UseDeckState {
  const [deck, setDeck] = React.useState<DeckDetailVm | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const loadingRef = React.useRef(false)

  React.useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  const handleError = React.useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        window.location.href = "/login"
        return
      }
      if (err.status === 404) {
        setDeck(null)
        setNotFound(true)
        setError(null)
        return
      }
      setError(err.message)
      return
    }

    setError("Failed to load deck. Please try again.")
  }, [])

  const loadDeck = React.useCallback(async () => {
    if (!deckId) {
      setDeck(null)
      setNotFound(false)
      setError(null)
      return
    }
    if (loadingRef.current) {
      return
    }

    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const response = await fetchJson<DeckDto>(`/api/decks/${deckId}`)
      setDeck(toDeckDetailVm(response))
    } catch (err) {
      handleError(err)
    } finally {
      setLoading(false)
    }
  }, [deckId, handleError])

  React.useEffect(() => {
    void loadDeck()
  }, [loadDeck])

  return {
    deck,
    loading,
    error,
    notFound,
    refresh: loadDeck,
  }
}
