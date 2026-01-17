import { Button } from "@/components/ui/button"

type PrimaryCtasProps = {
  onCreateDeckClick: () => void
  newGenerationHref: string
  disabled?: boolean
}

export function PrimaryCtas({
  onCreateDeckClick,
  newGenerationHref,
  disabled = false,
}: PrimaryCtasProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" disabled={disabled}>
        <a href={newGenerationHref}>New generation</a>
      </Button>
      <Button onClick={onCreateDeckClick} disabled={disabled}>
        Create deck
      </Button>
    </div>
  )
}
