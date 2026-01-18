import * as React from "react"

import type {
  BulkCreateCardsCommand,
  BulkCreateCardsResponseDto,
  DeckId,
  GenerateCommand,
  GenerateResponseDto,
  GeneratedCandidateDto,
  ValidateGenerateInputCommand,
  ValidateGenerateInputResponseDto,
} from "../../types"
import { ApiError, fetchJson } from "../../lib/http/client"
import type {
  CandidateEditPatchVm,
  CandidateSaveStatus,
  GenerateOptionsVm,
  GeneratePreflightVm,
  GenerateSourceVm,
  GenerateUiErrorVm,
  GenerateWorkflowStateVm,
  GeneratedCandidateVm,
  GenerationMetaVm,
  SaveResultsVm,
} from "../views/generate/generate.types"

const DEFAULT_MAX_SOURCE_CHARS = 20000
const DEFAULT_MAX_CARDS = 20
const STORAGE_KEY = "generateWorkflowDraftV1"

const DEFAULT_OPTIONS: GenerateOptionsVm = {
  maxCards: DEFAULT_MAX_CARDS,
  language: "en",
  model: null,
}

const DEFAULT_SOURCE: GenerateSourceVm = {
  text: "",
  inputChars: 0,
  maxChars: DEFAULT_MAX_SOURCE_CHARS,
  error: null,
}

const DEFAULT_PREFLIGHT: GeneratePreflightVm = {
  status: "idle",
  lastValidatedChars: null,
  maxChars: DEFAULT_MAX_SOURCE_CHARS,
  message: null,
}

const DEFAULT_RESULTS: SaveResultsVm = {
  status: "idle",
  createdCount: 0,
  skippedCount: 0,
  skipped: [],
  message: null,
  error: null,
}

function normalizeTags(tags: string[]): string[] {
  const unique = new Set<string>()
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) {
      continue
    }
    if (normalized.length > 50) {
      unique.add(normalized.slice(0, 50))
      continue
    }
    unique.add(normalized)
  }
  return Array.from(unique).slice(0, 20)
}

function validateSource(source: GenerateSourceVm): string | null {
  const trimmed = source.text.trim()
  if (trimmed.length < 1) {
    return "Add some source text to generate cards."
  }
  if (source.text.length > source.maxChars) {
    return `Source text must be ${source.maxChars.toLocaleString()} characters or less.`
  }
  return null
}

function mapCandidate(dto: GeneratedCandidateDto): GeneratedCandidateVm {
  const tags = dto.tags ?? []
  return {
    tempId: dto.temp_id,
    front: dto.front,
    back: dto.back,
    tags,
    duplicate: {
      isDuplicate: dto.duplicate?.isDuplicate ?? false,
      duplicateCardId: dto.duplicate?.duplicateCardId ?? null,
      source: "from_generate",
    },
    selected: false,
    editing: false,
    edited: false,
    saveStatus: "idle",
    errors: {},
    original: {
      front: dto.front,
      back: dto.back,
      tags,
    },
  }
}

function toGenerationMetaVm(dto: GenerateResponseDto["generation"]): GenerationMetaVm {
  return {
    id: dto.id,
    createdAt: dto.created_at,
    model: dto.model,
    inputChars: dto.input_chars,
  }
}

function sanitizeOptions(options: GenerateOptionsVm): GenerateOptionsVm {
  const maxCards = Number.isFinite(options.maxCards)
    ? Math.min(Math.max(Math.floor(options.maxCards), 1), 20)
    : DEFAULT_MAX_CARDS
  const model = options.model?.trim() ? options.model.trim() : null
  return {
    maxCards,
    language: options.language,
    model,
  }
}

function mapSaveResults(response: BulkCreateCardsResponseDto): SaveResultsVm {
  const createdCount = response.created.length
  const skippedCount = response.skipped.length
  const message =
    createdCount || skippedCount
      ? `Saved ${createdCount} card${createdCount === 1 ? "" : "s"}, skipped ${skippedCount} duplicate${
          skippedCount === 1 ? "" : "s"
        }.`
      : "No cards were saved."

  return {
    status: "success",
    createdCount,
    skippedCount,
    skipped: response.skipped.map((item) => ({
      reason: item.reason,
      front: item.front,
      back: item.back,
    })),
    message,
    error: null,
  }
}

function sameCardKey(front: string, back: string): string {
  return `${front.trim()}|||${back.trim()}`
}

function applyCandidateSaveStatus(
  candidates: GeneratedCandidateVm[],
  response: BulkCreateCardsResponseDto
): GeneratedCandidateVm[] {
  const createdKeys = new Set(response.created.map((item) => sameCardKey(item.front, item.back)))
  const skippedKeys = new Set(response.skipped.map((item) => sameCardKey(item.front, item.back)))

  return candidates.map((candidate) => {
    const key = sameCardKey(candidate.front, candidate.back)
    let saveStatus: CandidateSaveStatus = candidate.saveStatus
    let selected = candidate.selected
    if (createdKeys.has(key)) {
      saveStatus = "saved"
      selected = false
    } else if (skippedKeys.has(key)) {
      saveStatus = "skipped_duplicate"
      selected = true
    } else if (candidate.saveStatus === "saving") {
      saveStatus = "idle"
    }

    return {
      ...candidate,
      saveStatus,
      selected,
    }
  })
}

function normalizeSaveError(error: unknown, scope: GenerateUiErrorVm["scope"]): GenerateUiErrorVm {
  if (error instanceof ApiError) {
    return { scope, message: error.message, details: error.details }
  }
  return { scope, message: "Something went wrong. Please try again." }
}

function validateCandidatePatch(candidate: GeneratedCandidateVm, patch: CandidateEditPatchVm) {
  const nextFront = patch.front ?? candidate.front
  const nextBack = patch.back ?? candidate.back
  const nextTags = patch.tags ?? candidate.tags

  const errors: GeneratedCandidateVm["errors"] = {}

  if (nextFront.trim().length < 1) {
    errors.front = "Front is required."
  } else if (nextFront.length > 2000) {
    errors.front = "Front must be 2,000 characters or less."
  }

  if (nextBack.trim().length < 1) {
    errors.back = "Back is required."
  } else if (nextBack.length > 10000) {
    errors.back = "Back must be 10,000 characters or less."
  }

  const normalizedTags = normalizeTags(nextTags)
  if (normalizedTags.length > 20) {
    errors.tags = "Tags must be 20 or fewer."
  }

  return {
    errors,
    normalizedTags,
    nextFront,
    nextBack,
  }
}

type GenerateWorkflowOptions = {
  onDeckNotFound?: () => void
}

export function useGenerateWorkflow(currentDeckId: DeckId | null, options?: GenerateWorkflowOptions) {
  const [state, setState] = React.useState<GenerateWorkflowStateVm>({
    source: DEFAULT_SOURCE,
    options: DEFAULT_OPTIONS,
    preflight: DEFAULT_PREFLIGHT,
    generation: null,
    candidates: [],
    loading: { generating: false, saving: false },
    errors: [],
    results: null,
  })

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as Partial<GenerateWorkflowStateVm>
      setState((prev) => ({
        ...prev,
        source: parsed.source ?? prev.source,
        options: parsed.options ?? prev.options,
        preflight: {
          ...prev.preflight,
          maxChars: parsed.source?.maxChars ?? prev.preflight.maxChars,
        },
        generation: parsed.generation ?? prev.generation,
        candidates: parsed.candidates ?? prev.candidates,
      }))
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const draft = {
      source: state.source,
      options: state.options,
      generation: state.generation,
      candidates: state.candidates,
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  }, [state.candidates, state.generation, state.options, state.source])

  const setErrors = React.useCallback((next: GenerateUiErrorVm | null) => {
    setState((prev) => {
      if (!next) {
        return { ...prev, errors: [] }
      }
      const filtered = prev.errors.filter((error) => error.scope !== next.scope)
      return { ...prev, errors: [...filtered, next] }
    })
  }, [])

  const setSourceText = React.useCallback((text: string) => {
    setState((prev) => {
      const nextSource: GenerateSourceVm = {
        ...prev.source,
        text,
        inputChars: text.length,
      }
      const error = validateSource(nextSource)
      return {
        ...prev,
        source: { ...nextSource, error },
      }
    })
  }, [])

  const validateInput = React.useCallback(async () => {
    setState((prev) => ({
      ...prev,
      preflight: {
        ...prev.preflight,
        status: "validating",
        message: null,
      },
    }))
    setErrors(null)

    const command: ValidateGenerateInputCommand = {
      source_text: state.source.text,
    }

    try {
      const response = await fetchJson<ValidateGenerateInputResponseDto>("/api/generate/validate-input", {
        method: "POST",
        body: JSON.stringify(command),
      })

      setState((prev) => ({
        ...prev,
        source: {
          ...prev.source,
          maxChars: response.max_chars,
          error: prev.source.text.length > response.max_chars ? prev.source.error : null,
        },
        preflight: {
          status: "ok",
          lastValidatedChars: response.input_chars,
          maxChars: response.max_chars,
          message: `OK: ${response.input_chars.toLocaleString()} / ${response.max_chars.toLocaleString()}`,
        },
      }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      setState((prev) => ({
        ...prev,
        preflight: {
          ...prev.preflight,
          status: "error",
          message: err instanceof ApiError ? err.message : "Validation failed. Please try again.",
        },
      }))
      setErrors(normalizeSaveError(err, "preflight"))
    }
  }, [setErrors, state.source.text])

  const generate = React.useCallback(async () => {
    setErrors(null)
    const sourceError = validateSource(state.source)
    if (sourceError) {
      setState((prev) => ({
        ...prev,
        source: {
          ...prev.source,
          error: sourceError,
        },
      }))
      return
    }

    const options = sanitizeOptions(state.options)
    setState((prev) => ({
      ...prev,
      loading: { ...prev.loading, generating: true },
      options,
      results: null,
    }))

    const command: GenerateCommand = {
      deck_id: currentDeckId ?? undefined,
      source_text: state.source.text,
      options: {
        max_cards: options.maxCards,
        language: options.language,
        ...(options.model ? { model: options.model } : {}),
      },
    }

    try {
      const response = await fetchJson<GenerateResponseDto>("/api/generate", {
        method: "POST",
        body: JSON.stringify(command),
      })

      setState((prev) => ({
        ...prev,
        generation: toGenerationMetaVm(response.generation),
        candidates: response.candidates.map(mapCandidate),
        loading: { ...prev.loading, generating: false },
      }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      if (err instanceof ApiError && err.status === 404 && err.code === "deck_not_found") {
        options?.onDeckNotFound?.()
        setErrors({ scope: "generate", message: "Selected deck was not found. Please reselect." })
        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, generating: false },
        }))
        return
      }
      if (err instanceof ApiError && err.code === "input_too_large") {
        const maxChars = Number(err.details?.max_chars ?? DEFAULT_MAX_SOURCE_CHARS)
        const inputChars = Number(err.details?.input_chars ?? state.source.inputChars)
        setState((prev) => ({
          ...prev,
          source: {
            ...prev.source,
            maxChars,
            inputChars,
            error: `Source text must be ${maxChars.toLocaleString()} characters or less.`,
          },
          loading: { ...prev.loading, generating: false },
        }))
        setErrors({ scope: "generate", message: err.message, details: err.details })
        return
      }

      setState((prev) => ({
        ...prev,
        loading: { ...prev.loading, generating: false },
      }))
      setErrors(normalizeSaveError(err, "generate"))
    }
  }, [currentDeckId, options, setErrors, state.options, state.source])

  const toggleCandidateSelected = React.useCallback((tempId: string) => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((candidate) =>
        candidate.tempId === tempId
          ? { ...candidate, selected: !candidate.selected }
          : candidate
      ),
    }))
  }, [])

  const editCandidateStart = React.useCallback((tempId: string) => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((candidate) =>
        candidate.tempId === tempId ? { ...candidate, editing: true, errors: {} } : candidate
      ),
    }))
  }, [])

  const editCandidateCancel = React.useCallback((tempId: string) => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((candidate) =>
        candidate.tempId === tempId ? { ...candidate, editing: false, errors: {} } : candidate
      ),
    }))
  }, [])

  const editCandidateSave = React.useCallback(
    (tempId: string, patch: CandidateEditPatchVm) => {
      let updatedFront = ""
      let updatedBack = ""

      setState((prev) => ({
        ...prev,
        candidates: prev.candidates.map((candidate) => {
          if (candidate.tempId !== tempId) {
            return candidate
          }

          const { errors, normalizedTags, nextFront, nextBack } = validateCandidatePatch(
            candidate,
            patch
          )
          if (Object.keys(errors).length > 0) {
            return { ...candidate, errors }
          }

          updatedFront = nextFront
          updatedBack = nextBack

          const edited =
            nextFront.trim() !== candidate.original.front.trim() ||
            nextBack.trim() !== candidate.original.back.trim() ||
            normalizedTags.join("|") !== normalizeTags(candidate.original.tags).join("|")

          return {
            ...candidate,
            front: nextFront,
            back: nextBack,
            tags: normalizedTags,
            edited,
            editing: false,
            errors: {},
          }
        }),
      }))

      if (!currentDeckId) {
        return
      }
      if (!updatedFront.trim() || !updatedBack.trim()) {
        return
      }

      void (async () => {
        try {
          const response = await fetchJson<{
            isDuplicate: boolean
            duplicateCard: { id: string } | null
          }>("/api/cards/duplicates/check", {
            method: "POST",
            body: JSON.stringify({
              deck_id: currentDeckId,
              front: updatedFront.trim(),
              back: updatedBack.trim(),
            }),
          })

          setState((prev) => ({
            ...prev,
            candidates: prev.candidates.map((candidate) => {
              if (candidate.tempId !== tempId) {
                return candidate
              }
              if (
                candidate.front.trim() !== updatedFront.trim() ||
                candidate.back.trim() !== updatedBack.trim()
              ) {
                return candidate
              }
              return {
                ...candidate,
                duplicate: {
                  isDuplicate: response.isDuplicate,
                  duplicateCardId: response.duplicateCard?.id ?? null,
                  source: "from_duplicate_check",
                },
              }
            }),
          }))
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            window.location.href = "/login"
            return
          }
          if (err instanceof ApiError && err.status === 404 && err.code === "deck_not_found") {
            options?.onDeckNotFound?.()
          }
        }
      })()
    },
    [currentDeckId, options]
  )

  const removeCandidate = React.useCallback((tempId: string) => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((candidate) => candidate.tempId !== tempId),
    }))
  }, [])

  const clearSelection = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((candidate) => ({ ...candidate, selected: false })),
    }))
  }, [])

  const saveSelected = React.useCallback(
    async ({ deckId }: { deckId: DeckId | null }) => {
      if (!deckId) {
        setErrors({ scope: "save", message: "Select a deck before saving." })
        return
      }

      const selected = state.candidates.filter((candidate) => candidate.selected)
      if (selected.length === 0) {
        return
      }

      setErrors(null)
      setState((prev) => ({
        ...prev,
        loading: { ...prev.loading, saving: true },
        results: { ...DEFAULT_RESULTS, status: "saving" },
        candidates: prev.candidates.map((candidate) =>
          candidate.selected ? { ...candidate, saveStatus: "saving" } : candidate
        ),
      }))

      const command: BulkCreateCardsCommand = {
        deck_id: deckId,
        cards: selected.map((candidate) => ({
          front: candidate.front,
          back: candidate.back,
          tags: candidate.tags,
          ai_generated: true,
          edited: candidate.edited,
        })),
      }

      try {
        const response = await fetchJson<BulkCreateCardsResponseDto>("/api/cards/bulk-create", {
          method: "POST",
          body: JSON.stringify(command),
        })

        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, saving: false },
          results: mapSaveResults(response),
          candidates: applyCandidateSaveStatus(prev.candidates, response),
        }))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login"
          return
        }
        if (err instanceof ApiError && err.status === 404 && err.code === "deck_not_found") {
          options?.onDeckNotFound?.()
          setErrors({ scope: "save", message: "Selected deck was not found. Please reselect." })
          setState((prev) => ({
            ...prev,
            loading: { ...prev.loading, saving: false },
            results: {
              ...DEFAULT_RESULTS,
              status: "error",
              error: "Deck not found.",
              message: null,
            },
            candidates: prev.candidates.map((candidate) =>
              candidate.saveStatus === "saving" ? { ...candidate, saveStatus: "idle" } : candidate
            ),
          }))
          return
        }
        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, saving: false },
          results: {
            ...DEFAULT_RESULTS,
            status: "error",
            error: err instanceof ApiError ? err.message : "Save failed. Please try again.",
            message: null,
          },
          candidates: prev.candidates.map((candidate) =>
            candidate.saveStatus === "saving" ? { ...candidate, saveStatus: "idle" } : candidate
          ),
        }))
        setErrors(normalizeSaveError(err, "save"))
      }
    },
    [options, setErrors, state.candidates]
  )

  return {
    state,
    setSourceText,
    updateOptions: (patch: Partial<GenerateOptionsVm>) =>
      setState((prev) => ({ ...prev, options: { ...prev.options, ...patch } })),
    validateInput,
    generate,
    toggleCandidateSelected,
    editCandidateStart,
    editCandidateCancel,
    editCandidateSave,
    removeCandidate,
    clearSelection,
    saveSelected,
  }
}
