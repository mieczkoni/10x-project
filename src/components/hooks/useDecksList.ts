import * as React from "react"

import type { DeckListResponseDto } from "../../types"
import { ApiError, fetchJson } from "../../lib/http/client"
import type { DeckListItemVm, DecksPageVm, DecksQueryVm } from "../views/dashboard/dashboard.types"
import { toDeckListItemVm } from "../views/dashboard/dashboard.types"

const DEFAULT_LIMIT = 25
const MAX_QUERY_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 350

type LoadMode = "refresh" | "append"

type LoadRequest = {
  mode: LoadMode
  cursor: string | null
}

type UseDecksListState = {
  query: DecksQueryVm
  decks: DeckListItemVm[]
  page: DecksPageVm
  loadingInitial: boolean
  loadingMore: boolean
  error: string | null
  setDecks: React.Dispatch<React.SetStateAction<DeckListItemVm[]>>
  setQuery: React.Dispatch<React.SetStateAction<DecksQueryVm>>
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
}

const defaultQuery: DecksQueryVm = {
  q: "",
  limit: DEFAULT_LIMIT,
  cursor: null,
  sort: "created_at",
  order: "desc",
  includeDeleted: false,
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

function buildListParams(query: DecksQueryVm, cursor: string | null) {
  const params = new URLSearchParams()
  const trimmedQuery = query.q.trim()

  if (trimmedQuery) {
    params.set("q", trimmedQuery)
  }

  const limit = clampLimit(query.limit)
  params.set("limit", String(limit))

  if (cursor) {
    params.set("cursor", cursor)
  }
  if (query.sort) {
    params.set("sort", query.sort)
  }
  if (query.order) {
    params.set("order", query.order)
  }
  if (query.includeDeleted) {
    params.set("includeDeleted", "true")
  }

  return { params, trimmedQuery, limit }
}

export function useDecksList(): UseDecksListState {
  const [query, setQuery] = React.useState<DecksQueryVm>(defaultQuery)
  const [decks, setDecks] = React.useState<DeckListItemVm[]>([])
  const [page, setPage] = React.useState<DecksPageVm>({
    nextCursor: null,
    limit: DEFAULT_LIMIT,
  })
  const [loadingInitial, setLoadingInitial] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [debouncedQuery, setDebouncedQuery] = React.useState(query.q)
  const [invalidCursorRetried, setInvalidCursorRetried] = React.useState(false)
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

    setError("Failed to load decks. Please try again.")
  }, [])

  const loadDecks = React.useCallback(
    async ({ mode, cursor }: LoadRequest) => {
      if (mode === "refresh") {
        setLoadingInitial(true)
      } else {
        setLoadingMore(true)
      }
      setError(null)

      const { params, trimmedQuery, limit } = buildListParams(normalizedQuery, cursor)

      if (trimmedQuery.length > MAX_QUERY_LENGTH) {
        setError(`Search query must be ${MAX_QUERY_LENGTH} characters or less.`)
        setLoadingInitial(false)
        setLoadingMore(false)
        return
      }

      try {
        const response = await fetchJson<DeckListResponseDto>(`/api/decks?${params}`)
        const nextDecks = response.data.map(toDeckListItemVm)
        const nextPage: DecksPageVm = {
          nextCursor: response.page.nextCursor,
          limit: response.page.limit ?? limit,
        }

        setPage(nextPage)
        setInvalidCursorRetried(false)

        if (mode === "append") {
          setDecks((prev) => [...prev, ...nextDecks])
        } else {
          setDecks(nextDecks)
        }
      } catch (err) {
        if (isInvalidCursorError(err)) {
          throw err
        }
        handleRequestError(err)
      } finally {
        setLoadingInitial(false)
        setLoadingMore(false)
      }
    },
    [handleRequestError, normalizedQuery]
  )

  const refresh = React.useCallback(async () => {
    if (loadingInitialRef.current) {
      return
    }
    await loadDecks({ mode: "refresh", cursor: null })
  }, [loadDecks])

  const loadMore = React.useCallback(async () => {
    if (loadingMore || loadingInitial) {
      return
    }
    if (!page.nextCursor) {
      return
    }

    try {
      await loadDecks({ mode: "append", cursor: page.nextCursor })
    } catch (err) {
      if (!invalidCursorRetried && isInvalidCursorError(err)) {
        setInvalidCursorRetried(true)
        await loadDecks({ mode: "refresh", cursor: null })
        return
      }
      handleRequestError(err)
    }
  }, [
    handleRequestError,
    invalidCursorRetried,
    loadDecks,
    loadingInitial,
    loadingMore,
    page.nextCursor,
  ])

  React.useEffect(() => {
    void refresh()
  }, [
    refresh,
    normalizedQuery.limit,
    normalizedQuery.order,
    normalizedQuery.sort,
    normalizedQuery.includeDeleted,
    normalizedQuery.q,
  ])

  return {
    query: normalizedQuery,
    decks,
    page,
    loadingInitial,
    loadingMore,
    error,
    setDecks,
    setQuery,
    refresh,
    loadMore,
  }
}
