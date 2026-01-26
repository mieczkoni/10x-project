import type { CardId } from "../../../types";

export interface GenerateOptionsVm {
  maxCards: number;
  language: "en";
  model: string | null;
}

export interface GenerateSourceVm {
  text: string;
  inputChars: number;
  maxChars: number;
  error: string | null;
}

export interface GeneratePreflightVm {
  status: "idle" | "validating" | "ok" | "error";
  lastValidatedChars: number | null;
  maxChars: number;
  message: string | null;
}

export interface CandidateDuplicateVm {
  isDuplicate: boolean;
  duplicateCardId: CardId | null;
  source?: "from_generate" | "from_duplicate_check" | "unknown";
}

export type CandidateSaveStatus = "idle" | "saving" | "saved" | "skipped_duplicate";

export interface CandidateEditPatchVm {
  front?: string;
  back?: string;
  tags?: string[];
}

export interface CandidateEditFormVm {
  front: string;
  back: string;
  tags: string[];
}

export interface GeneratedCandidateVm {
  tempId: string;
  front: string;
  back: string;
  tags: string[];
  duplicate: CandidateDuplicateVm;
  selected: boolean;
  editing: boolean;
  edited: boolean;
  saveStatus: CandidateSaveStatus;
  errors: {
    front?: string;
    back?: string;
    tags?: string;
    form?: string;
  };
  original: {
    front: string;
    back: string;
    tags: string[];
  };
}

export interface GenerationMetaVm {
  id: string;
  createdAt: string;
  model: string;
  inputChars: number;
}

export interface SaveResultsVm {
  status: "idle" | "saving" | "success" | "error";
  createdCount: number;
  skippedCount: number;
  skipped: { reason: string; front: string; back: string }[];
  message: string | null;
  error: string | null;
}

export interface GenerateUiErrorVm {
  scope: "preflight" | "generate" | "save";
  message: string;
  details?: unknown;
}

export interface GenerateWorkflowStateVm {
  source: GenerateSourceVm;
  options: GenerateOptionsVm;
  preflight: GeneratePreflightVm;
  generation: GenerationMetaVm | null;
  candidates: GeneratedCandidateVm[];
  loading: { generating: boolean; saving: boolean };
  errors: GenerateUiErrorVm[];
  results: SaveResultsVm | null;
}
