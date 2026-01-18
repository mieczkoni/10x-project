import type { GenerateOptionsVm, GeneratePreflightVm, GenerateSourceVm } from "./generate.types"
import { GenerateControls } from "./GenerateControls"
import { InputPreflightStatus } from "./InputPreflightStatus"
import { SourceTextEditor } from "./SourceTextEditor"

type SourceTextPanelProps = {
  source: GenerateSourceVm
  preflight: GeneratePreflightVm
  options: GenerateOptionsVm
  generating: boolean
  onSourceChange: (text: string) => void
  onValidate?: () => void
  onGenerate: () => void
  onOptionsChange?: (patch: Partial<GenerateOptionsVm>) => void
  disabled?: boolean
}

export function SourceTextPanel({
  source,
  preflight,
  options,
  generating,
  onSourceChange,
  onValidate,
  onGenerate,
  onOptionsChange,
  disabled = false,
}: SourceTextPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3">
        <SourceTextEditor
          value={source.text}
          maxChars={source.maxChars}
          error={source.error}
          onChange={onSourceChange}
          onBlur={onValidate}
          disabled={disabled}
        />
        <InputPreflightStatus preflight={preflight} />
        {disabled ? (
          <p className="text-xs text-slate-500">
            Decks are loading or unavailable. Create a deck on the dashboard to enable saving.
          </p>
        ) : null}
        <GenerateControls
          options={options}
          canGenerate={!source.error && source.text.trim().length > 0 && !generating}
          generating={generating}
          onGenerate={onGenerate}
          onOptionsChange={onOptionsChange}
        />
      </div>
    </section>
  )
}
