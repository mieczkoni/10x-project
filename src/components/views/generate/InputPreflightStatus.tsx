import type { GeneratePreflightVm } from "./generate.types"

type InputPreflightStatusProps = {
  preflight: GeneratePreflightVm
}

export function InputPreflightStatus({ preflight }: InputPreflightStatusProps) {
  if (preflight.status === "idle") {
    return null
  }

  const message =
    preflight.message ??
    (preflight.status === "validating"
      ? "Checking input length..."
      : preflight.status === "ok"
        ? "Input looks good."
        : "Unable to validate input.")

  const tone =
    preflight.status === "ok"
      ? "text-emerald-700"
      : preflight.status === "error"
        ? "text-red-600"
        : "text-slate-600"

  return (
    <div className={`text-xs ${tone}`} aria-live="polite">
      {message}
    </div>
  )
}
