import * as React from "react"

import type { DeckDto, DeckId, UpdateDeckCommand } from "../../../types"
import { useCurrentDeck } from "../../hooks/useCurrentDeck"
import { useDecksList } from "../../hooks/useDecksList"
import { AppHeader } from "../app/AppHeader"
import { CreateDeckDialog } from "./CreateDeckDialog"
import { DashboardHeader } from "./DashboardHeader"
import { DecksSection } from "./DecksSection"
import { DeleteDeckConfirmDialog } from "./DeleteDeckConfirmDialog"
import type { DeckActionStateById, DeckListItemVm } from "./dashboard.types"
import { toDeckListItemVm } from "./dashboard.types"
import { RenameDeckDialog } from "./RenameDeckDialog"
import { ApiError, fetchJson } from "../../../lib/http/client"

type DashboardViewProps = {
  userEmail?: string | null
}

export function DashboardView({ userEmail }: DashboardViewProps) {
  const {
    decks,
    loadingInitial,
    error,
    page,
    loadingMore,
    refresh,
    loadMore,
    query,
    setQuery,
    setDecks,
  } = useDecksList()
  const { currentDeck, setCurrentDeck } = useCurrentDeck(decks)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [renameDeckId, setRenameDeckId] = React.useState<DeckId | null>(null)
  const [deleteDeckId, setDeleteDeckId] = React.useState<DeckId | null>(null)
  const [actionStateById, setActionStateById] = React.useState<DeckActionStateById>({})
  const [showDeckSelectionPrompt, setShowDeckSelectionPrompt] = React.useState(false)
  const newGenerationHref = React.useMemo(() => {
    if (!currentDeck.deckId) {
      return "/dashboard/generate"
    }
    return `/dashboard/generate?deckId=${encodeURIComponent(currentDeck.deckId)}`
  }, [currentDeck.deckId])

  const handleSelectDeck = React.useCallback(
    (deckId: DeckId) => {
      setCurrentDeck(deckId)
      setShowDeckSelectionPrompt(false)
    },
    [setCurrentDeck]
  )

  const handleNewGenerationClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (currentDeck.deckId) {
        return
      }
      event.preventDefault()
      setShowDeckSelectionPrompt(true)
    },
    [currentDeck.deckId]
  )

  const handleCreatedDeck = React.useCallback(
    async (deck: DeckDto) => {
      setCreateDialogOpen(false)
      setCurrentDeck(deck.id)
      setShowDeckSelectionPrompt(false)
      await refresh()
    },
    [refresh, setCurrentDeck]
  )

  const handleRenameRequest = React.useCallback((deckId: DeckId) => {
    setRenameDeckId(deckId)
  }, [])

  const handleDeleteRequest = React.useCallback((deckId: DeckId) => {
    setDeleteDeckId(deckId)
  }, [])

  const updateActionState = React.useCallback(
    (deckId: DeckId, next: DeckActionStateById[DeckId]) => {
      setActionStateById((prev) => ({ ...prev, [deckId]: next }))
    },
    []
  )

  const clearActionState = React.useCallback((deckId: DeckId) => {
    setActionStateById((prev) => {
      const next = { ...prev }
      delete next[deckId]
      return next
    })
  }, [])

  const handleRenameSubmit = React.useCallback(
    async (deckId: DeckId, patch: UpdateDeckCommand) => {
      const original = decks.find((deck) => deck.id === deckId)
      if (!original) {
        return
      }

      const optimisticDeck: DeckListItemVm = {
        ...original,
        name: patch.name ?? original.name,
        description: patch.description ?? original.description,
      }

      updateActionState(deckId, {
        isRenaming: true,
        isDeleting: false,
        optimisticName: optimisticDeck.name,
        optimisticDescription: optimisticDeck.description,
      })

      setDecks((prev) =>
        prev.map((deck) => (deck.id === deckId ? optimisticDeck : deck))
      )

      try {
        const updated = await fetchJson<DeckDto>(`/api/decks/${deckId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })
        setDecks((prev) =>
          prev.map((deck) => (deck.id === deckId ? toDeckListItemVm(updated) : deck))
        )
        clearActionState(deckId)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login"
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setDecks((prev) => prev.filter((deck) => deck.id !== deckId))
          if (currentDeck.deckId === deckId) {
            setCurrentDeck(null)
          }
          clearActionState(deckId)
          return
        }
        setDecks((prev) =>
          prev.map((deck) => (deck.id === deckId ? original : deck))
        )
        updateActionState(deckId, {
          isRenaming: false,
          isDeleting: false,
          error: err instanceof ApiError ? err.message : "Rename failed. Please try again.",
        })
      }
    },
    [clearActionState, currentDeck.deckId, decks, setCurrentDeck, setDecks, updateActionState]
  )

  const handleDeleteConfirm = React.useCallback(async () => {
    if (!deleteDeckId) {
      return
    }
    const originalIndex = decks.findIndex((deck) => deck.id === deleteDeckId)
    const original = originalIndex >= 0 ? decks[originalIndex] : null
    if (!original) {
      setDeleteDeckId(null)
      return
    }

    updateActionState(deleteDeckId, {
      isRenaming: false,
      isDeleting: true,
    })

    setDecks((prev) => prev.filter((deck) => deck.id !== deleteDeckId))
    setDeleteDeckId(null)

    try {
      await fetchJson<null>(`/api/decks/${original.id}`, { method: "DELETE" })
      if (currentDeck.deckId === original.id) {
        setCurrentDeck(null)
      }
      clearActionState(original.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      if (err instanceof ApiError && err.status === 404) {
        if (currentDeck.deckId === original.id) {
          setCurrentDeck(null)
        }
        clearActionState(original.id)
        return
      }
      setDecks((prev) => {
        const next = [...prev]
        next.splice(originalIndex, 0, original)
        return next
      })
      updateActionState(original.id, {
        isRenaming: false,
        isDeleting: false,
        error: err instanceof ApiError ? err.message : "Delete failed. Please try again.",
      })
    }
  }, [
    clearActionState,
    currentDeck.deckId,
    decks,
    deleteDeckId,
    setCurrentDeck,
    setDecks,
    updateActionState,
  ])

  const renameDeck = renameDeckId ? decks.find((deck) => deck.id === renameDeckId) ?? null : null
  const deleteDeck = deleteDeckId ? decks.find((deck) => deck.id === deleteDeckId) ?? null : null

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader userEmail={userEmail} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <DashboardHeader
          decks={decks}
          currentDeck={currentDeck}
          onSelectDeck={handleSelectDeck}
          onOpenCreateDeck={() => setCreateDialogOpen(true)}
          onNewGenerationClick={handleNewGenerationClick}
          showDeckSelectionPrompt={showDeckSelectionPrompt}
          newGenerationHref={newGenerationHref}
          disabled={loadingInitial}
        />

        <DecksSection
          query={query}
          onQueryChange={setQuery}
          decks={decks}
          page={page}
          loading={loadingInitial}
          loadingMore={loadingMore}
          error={error}
          actions={actionStateById}
          onRename={handleRenameRequest}
          onDelete={handleDeleteRequest}
          onLoadMore={loadMore}
          onRefresh={refresh}
        />

        <CreateDeckDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreated={handleCreatedDeck}
        />

        <RenameDeckDialog
          open={Boolean(renameDeckId)}
          deck={renameDeck}
          onOpenChange={(open) => {
            if (!open) {
              setRenameDeckId(null)
            }
          }}
          onSubmit={handleRenameSubmit}
        />

        <DeleteDeckConfirmDialog
          open={Boolean(deleteDeckId)}
          deckName={deleteDeck?.name ?? "this deck"}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteDeckId(null)
            }
          }}
          onConfirm={handleDeleteConfirm}
        />
      </main>
    </div>
  )
}
