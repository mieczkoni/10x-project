import type * as React from "react"

import { Button } from "@/components/ui/button"

type PrimaryCtasProps = {
  onCreateDeckClick: () => void
  newGenerationHref: string
  onNewGenerationClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void
  disabled?: boolean
}

export function PrimaryCtas({
  onCreateDeckClick,
  newGenerationHref,
  onNewGenerationClick,
  disabled = false,
}: PrimaryCtasProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" disabled={disabled}>
        <a
          href={newGenerationHref}
          onClick={onNewGenerationClick}
          data-test-id="dashboard-new-generation-link"
        >
          New generation
        </a>
      </Button>
      <Button
        onClick={onCreateDeckClick}
        disabled={disabled}
        data-test-id="dashboard-create-deck-button"
      >
        Create deck
      </Button>
    </div>
  )
}
