import * as React from "react"

import type {
  CheckCardDuplicateCommand,
  CheckCardDuplicateResponseDto,
  DeckId,
} from "../../types"
import { ApiError, fetchJson } from "../../lib/http/client"
import type { DuplicateWarningVm } from "../views/deck/deck-detail.types"

const DUPLICATE_CHECK_DEBOUNCE_MS = 400

const idleState: DuplicateWarningVm = {
  status: "idle",
  isDuplicate: false,
  duplicateCard: null,
  message: undefined,
}

export function useDuplicateCheck(deckId: DeckId | null, front: string, back: string) {
  const [state, setState] = React.useState<DuplicateWarningVm>(idleState)

  React.useEffect(() => {
    if (!deckId) {
      setState(idleState)
      return
    }

    const trimmedFront = front.trim()
    const trimmedBack = back.trim()

    if (!trimmedFront || !trimmedBack) {
      setState(idleState)
      return
    }

    let cancelled = false

    const handle = window.setTimeout(async () => {
      setState((prev) => ({
        ...prev,
        status: "checking",
        message: undefined,
      }))

      const payload: CheckCardDuplicateCommand = {
        deck_id: deckId,
        front: trimmedFront,
        back: trimmedBack,
      }

      try {
        const response = await fetchJson<CheckCardDuplicateResponseDto>("/api/cards/duplicates/check", {
          method: "POST",
          body: JSON.stringify(payload),
        })

        if (cancelled) {
          return
        }

        if (response.isDuplicate) {
          setState({
            status: "duplicate",
            isDuplicate: true,
            duplicateCard: response.duplicateCard,
            message: "A similar card already exists in this deck.",
          })
          return
        }

        setState({
          status: "ok",
          isDuplicate: false,
          duplicateCard: null,
          message: undefined,
        })
      } catch (err) {
        if (cancelled) {
          return
        }
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login"
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setState({
            status: "error",
            isDuplicate: false,
            duplicateCard: null,
            message: "Deck not found. Please return to the dashboard.",
          })
          return
        }

        setState({
          status: "error",
          isDuplicate: false,
          duplicateCard: null,
          message: "Unable to check duplicates right now.",
        })
      }
    }, DUPLICATE_CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [back, deckId, front])

  return state
}
