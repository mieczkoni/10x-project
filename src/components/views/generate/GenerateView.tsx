import * as React from "react"

import { useCurrentDeck } from "../../hooks/useCurrentDeck"
import { useDecksList } from "../../hooks/useDecksList"
import { useGenerateWorkflow } from "../../hooks/useGenerateWorkflow"
import { AppHeader } from "../app/AppHeader"
import { BulkActionBar } from "./BulkActionBar"
import { CandidatesPanel } from "./CandidatesPanel"
import { GenerateErrorBanner } from "./GenerateErrorBanner"
import { GenerateHeader } from "./GenerateHeader"
import { SaveResultsPanel } from "./SaveResultsPanel"
import { SelectDeckDialog } from "./SelectDeckDialog"
import { SourceTextPanel } from "./SourceTextPanel"

type GenerateViewProps = {
  userEmail?: string | null
}

export function GenerateView({ userEmail }: GenerateViewProps) {
  const { decks, loadingInitial } = useDecksList()
  const { currentDeck, setCurrentDeck } = useCurrentDeck(decks)
  const workflow = useGenerateWorkflow(currentDeck.deckId, {
    onDeckNotFound: () => setCurrentDeck(null),
  })
  const { state } = workflow
  const [selectDeckOpen, setSelectDeckOpen] = React.useState(false)
  const [pendingDeckId, setPendingDeckId] = React.useState(currentDeck.deckId)
  const [urlDeckId, setUrlDeckId] = React.useState<string | null>(null)
  const isDeckLocked = React.useMemo(() => {
    if (!urlDeckId) {
      return false
    }
    return decks.some((deck) => deck.id === urlDeckId)
  }, [decks, urlDeckId])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const params = new URLSearchParams(window.location.search)
    const deckId = params.get("deckId")
    setUrlDeckId(deckId && deckId.trim() ? deckId.trim() : null)
  }, [])

  React.useEffect(() => {
    if (!selectDeckOpen) {
      setPendingDeckId(currentDeck.deckId)
    }
  }, [currentDeck.deckId, selectDeckOpen])

  React.useEffect(() => {
    if (decks.length === 0) {
      return
    }
    if (typeof window === "undefined") {
      return
    }
    if (currentDeck.deckId) {
      return
    }
    if (urlDeckId && decks.some((deck) => deck.id === urlDeckId)) {
      setCurrentDeck(urlDeckId as typeof decks[number]["id"])
      return
    }
    const stored = window.localStorage.getItem("currentDeckId")
    if (stored && decks.some((deck) => deck.id === stored)) {
      setCurrentDeck(stored as typeof decks[number]["id"])
      return
    }
    if (!stored) {
      setCurrentDeck(decks[0].id)
    }
  }, [currentDeck.deckId, decks, setCurrentDeck, urlDeckId])

  React.useEffect(() => {
    if (!urlDeckId || decks.length === 0) {
      return
    }
    if (!decks.some((deck) => deck.id === urlDeckId)) {
      return
    }
    if (currentDeck.deckId === urlDeckId) {
      return
    }
    setCurrentDeck(urlDeckId as typeof decks[number]["id"])
  }, [currentDeck.deckId, decks, setCurrentDeck, urlDeckId])

  const selectedCount = React.useMemo(
    () => state.candidates.filter((candidate) => candidate.selected).length,
    [state.candidates]
  )
  const canSave = selectedCount > 0 && !state.loading.saving

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader userEmail={userEmail} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <GenerateHeader
          decks={decks}
          currentDeck={currentDeck}
          onSelectDeck={setCurrentDeck}
          disabled={loadingInitial || isDeckLocked}
        />

        <GenerateErrorBanner errors={state.errors} />

        <SourceTextPanel
          source={state.source}
          preflight={state.preflight}
          options={state.options}
          generating={state.loading.generating}
          onSourceChange={workflow.setSourceText}
          onValidate={workflow.validateInput}
          onGenerate={workflow.generate}
          onOptionsChange={workflow.updateOptions}
        />

        <CandidatesPanel
          candidates={state.candidates}
          onToggleSelected={workflow.toggleCandidateSelected}
          onEdit={workflow.editCandidateStart}
          onRemove={workflow.removeCandidate}
          onEditSave={workflow.editCandidateSave}
          onEditCancel={workflow.editCandidateCancel}
          disabled={state.loading.generating || state.loading.saving}
        />

        <BulkActionBar
          selectedCount={selectedCount}
          saving={state.loading.saving}
          canSave={canSave}
          onSaveSelected={() => {
            if (!currentDeck.deckId) {
              setSelectDeckOpen(true)
              return
            }
            void workflow.saveSelected({ deckId: currentDeck.deckId })
          }}
          onClearSelection={workflow.clearSelection}
        />

        <SaveResultsPanel results={state.results} currentDeckId={currentDeck.deckId} />

        <SelectDeckDialog
          open={selectDeckOpen}
          decks={decks}
          value={pendingDeckId}
          onChange={(deckId) => setPendingDeckId(deckId)}
          onConfirm={() => {
            if (!pendingDeckId) {
              return
            }
            setCurrentDeck(pendingDeckId)
            setSelectDeckOpen(false)
            void workflow.saveSelected({ deckId: pendingDeckId })
          }}
          onOpenChange={setSelectDeckOpen}
        />
      </main>
    </div>
  )
}
