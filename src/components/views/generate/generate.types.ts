import type { CardId } from "../../../types"

export type GenerateOptionsVm = {
  maxCards: number
  language: "en"
  model: string | null
}

export type GenerateSourceVm = {
  text: string
  inputChars: number
  maxChars: number
  error: string | null
}

export type GeneratePreflightVm = {
  status: "idle" | "validating" | "ok" | "error"
  lastValidatedChars: number | null
  maxChars: number
  message: string | null
}

export type CandidateDuplicateVm = {
  isDuplicate: boolean
  duplicateCardId: CardId | null
  source?: "from_generate" | "from_duplicate_check" | "unknown"
}

export type CandidateSaveStatus = "idle" | "saving" | "saved" | "skipped_duplicate"

export type CandidateEditPatchVm = {
  front?: string
  back?: string
  tags?: string[]
}

export type CandidateEditFormVm = {
  front: string
  back: string
  tags: string[]
}

export type GeneratedCandidateVm = {
  tempId: string
  front: string
  back: string
  tags: string[]
  duplicate: CandidateDuplicateVm
  selected: boolean
  editing: boolean
  edited: boolean
  saveStatus: CandidateSaveStatus
  errors: {
    front?: string
    back?: string
    tags?: string
    form?: string
  }
  original: {
    front: string
    back: string
    tags: string[]
  }
}

export type GenerationMetaVm = {
  id: string
  createdAt: string
  model: string
  inputChars: number
}

export type SaveResultsVm = {
  status: "idle" | "saving" | "success" | "error"
  createdCount: number
  skippedCount: number
  skipped: { reason: string; front: string; back: string }[]
  message: string | null
  error: string | null
}

export type GenerateUiErrorVm = {
  scope: "preflight" | "generate" | "save"
  message: string
  details?: unknown
}

export type GenerateWorkflowStateVm = {
  source: GenerateSourceVm
  options: GenerateOptionsVm
  preflight: GeneratePreflightVm
  generation: GenerationMetaVm | null
  candidates: GeneratedCandidateVm[]
  loading: { generating: boolean; saving: boolean }
  errors: GenerateUiErrorVm[]
  results: SaveResultsVm | null
}
