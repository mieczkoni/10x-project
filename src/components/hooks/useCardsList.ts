import * as React from "react"

import type { CardDto, CardId, CardListResponseDto, DeckId } from "../../types"
import { ApiError, fetchJson } from "../../lib/http/client"
import type { CardListItemVm, CardsPageVm, CardsQueryVm } from "../views/deck/deck-detail.types"
import { normalizeTags, toCardListItemVm } from "../views/deck/deck-detail.types"

const DEFAULT_LIMIT = 25
const MAX_QUERY_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 350

type LoadMode = "refresh" | "page"

type LoadRequest = {
  mode: LoadMode
  cursor: string | null
  cursorStack: string[]
}

type UseCardsListState = {
  cards: CardListItemVm[]
  cardsById: Record<CardId, CardDto>
  page: CardsPageVm
  loadingInitial: boolean
  loadingPage: boolean
  error: string | null
  refresh: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }
  if (limit < 1) {
    return 1
  }
  if (limit > 100) {
    return 100
  }
  return Math.floor(limit)
}

function isInvalidCursorError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false
  }
  if (error.status !== 400 || error.code !== "invalid_input") {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes("cursor")
}

function buildListParams(query: CardsQueryVm, deckId: DeckId, cursor: string | null) {
  const params = new URLSearchParams()
  const trimmedQuery = query.q.trim()
  const tags = normalizeTags(query.tags)
  const limit = clampLimit(query.limit)

  params.set("deckId", deckId)
  params.set("limit", String(limit))

  if (trimmedQuery) {
    params.set("q", trimmedQuery)
  }

  if (tags.length > 0) {
    params.set("tags", tags.join(","))
  }

  if (query.aiGenerated === "ai") {
    params.set("aiGenerated", "true")
  }
  if (query.aiGenerated === "manual") {
    params.set("aiGenerated", "false")
  }

  if (query.sort) {
    params.set("sort", query.sort)
  }
  if (query.order) {
    params.set("order", query.order)
  }
  if (cursor) {
    params.set("cursor", cursor)
  }

  return { params, trimmedQuery, limit }
}

function normalizeCursor(cursor: string): string | null {
  if (!cursor) {
    return null
  }
  return cursor
}

export function useCardsList(query: CardsQueryVm, deckId: DeckId | null): UseCardsListState {
  const [cards, setCards] = React.useState<CardListItemVm[]>([])
  const [cardsById, setCardsById] = React.useState<Record<CardId, CardDto>>({})
  const [page, setPage] = React.useState<CardsPageVm>({
    nextCursor: null,
    limit: DEFAULT_LIMIT,
    cursorStack: [],
  })
  const [currentCursor, setCurrentCursor] = React.useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = React.useState(false)
  const [loadingPage, setLoadingPage] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [debouncedQuery, setDebouncedQuery] = React.useState(query.q)
  const loadingInitialRef = React.useRef(false)

  React.useEffect(() => {
    loadingInitialRef.current = loadingInitial
  }, [loadingInitial])

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.q)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(handle)
  }, [query.q])

  const normalizedQuery = React.useMemo(() => {
    return {
      ...query,
      q: debouncedQuery,
    }
  }, [query, debouncedQuery])

  const handleRequestError = React.useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        window.location.href = "/login"
        return
      }
      setError(err.message)
      return
    }

    setError("Failed to load cards. Please try again.")
  }, [])

  const loadCards = React.useCallback(
    async ({ mode, cursor, cursorStack }: LoadRequest) => {
      if (!deckId) {
        setCards([])
        setCardsById({})
        setPage({ nextCursor: null, limit: DEFAULT_LIMIT, cursorStack: [] })
        setCurrentCursor(null)
        setError(null)
        return
      }

      if (mode === "refresh") {
        setLoadingInitial(true)
      } else {
        setLoadingPage(true)
      }

      setError(null)

      const { params, trimmedQuery, limit } = buildListParams(normalizedQuery, deckId, cursor)

      if (trimmedQuery.length > MAX_QUERY_LENGTH) {
        setError(`Search query must be ${MAX_QUERY_LENGTH} characters or less.`)
        setLoadingInitial(false)
        setLoadingPage(false)
        return
      }

      try {
        const response = await fetchJson<CardListResponseDto>(`/api/cards?${params}`)
        const nextCards = response.data.map(toCardListItemVm)
        const nextById = response.data.reduce<Record<CardId, CardDto>>((acc, card) => {
          acc[card.id] = card
          return acc
        }, {})
        const nextPage: CardsPageVm = {
          nextCursor: response.page.nextCursor,
          limit: response.page.limit ?? limit,
          cursorStack,
        }

        setCards(nextCards)
        setCardsById(nextById)
        setPage(nextPage)
        setCurrentCursor(cursor)
      } catch (err) {
        if (isInvalidCursorError(err)) {
          throw err
        }
        handleRequestError(err)
      } finally {
        setLoadingInitial(false)
        setLoadingPage(false)
      }
    },
    [deckId, handleRequestError, normalizedQuery]
  )

  const refresh = React.useCallback(async () => {
    if (loadingInitialRef.current) {
      return
    }
    await loadCards({ mode: "refresh", cursor: null, cursorStack: [] })
  }, [loadCards])

  const next = React.useCallback(async () => {
    if (loadingInitial || loadingPage) {
      return
    }
    if (!page.nextCursor) {
      return
    }

    const nextStack = [...page.cursorStack, currentCursor ?? ""]

    try {
      await loadCards({ mode: "page", cursor: page.nextCursor, cursorStack: nextStack })
    } catch (err) {
      if (isInvalidCursorError(err)) {
        await loadCards({ mode: "refresh", cursor: null, cursorStack: [] })
        return
      }
      handleRequestError(err)
    }
  }, [currentCursor, handleRequestError, loadCards, loadingInitial, loadingPage, page.cursorStack, page.nextCursor])

  const prev = React.useCallback(async () => {
    if (loadingInitial || loadingPage) {
      return
    }
    if (page.cursorStack.length === 0) {
      return
    }

    const nextStack = page.cursorStack.slice(0, -1)
    const previousCursor = normalizeCursor(page.cursorStack[page.cursorStack.length - 1] ?? "")

    try {
      await loadCards({ mode: "page", cursor: previousCursor, cursorStack: nextStack })
    } catch (err) {
      if (isInvalidCursorError(err)) {
        await loadCards({ mode: "refresh", cursor: null, cursorStack: [] })
        return
      }
      handleRequestError(err)
    }
  }, [handleRequestError, loadCards, loadingInitial, loadingPage, page.cursorStack])

  React.useEffect(() => {
    if (!deckId) {
      setCards([])
      setCardsById({})
      setPage({ nextCursor: null, limit: DEFAULT_LIMIT, cursorStack: [] })
      setCurrentCursor(null)
      setError(null)
      return
    }

    void refresh()
  }, [
    deckId,
    refresh,
    normalizedQuery.aiGenerated,
    normalizedQuery.limit,
    normalizedQuery.order,
    normalizedQuery.q,
    normalizedQuery.sort,
    normalizedQuery.tags,
  ])

  return {
    cards,
    cardsById,
    page,
    loadingInitial,
    loadingPage,
    error,
    refresh,
    next,
    prev,
  }
}
