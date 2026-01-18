import * as React from "react"

type SourceTextEditorProps = {
  value: string
  maxChars: number
  error?: string | null
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}

export function SourceTextEditor({
  value,
  maxChars,
  error,
  onChange,
  onBlur,
  disabled = false,
}: SourceTextEditorProps) {
  const textareaId = React.useId()
  const helperId = `${textareaId}-helper`

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700" htmlFor={textareaId}>
        Source text
      </label>
      <textarea
        id={textareaId}
        className="min-h-[160px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={helperId}
      />
      <div className="flex items-start justify-between text-xs text-slate-500">
        <p id={helperId} aria-live="polite">
          {error ? <span className="text-red-600">{error}</span> : "Paste or type your source text."}
        </p>
        <span>
          {value.length.toLocaleString()} / {maxChars.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
