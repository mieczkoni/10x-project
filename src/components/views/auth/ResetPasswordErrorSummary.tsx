import * as React from "react"

import type { ResetPasswordErrorVm } from "./reset-password.types"

type ResetPasswordErrorSummaryProps = {
  error: ResetPasswordErrorVm | null
}

export function ResetPasswordErrorSummary({ error }: ResetPasswordErrorSummaryProps) {
  if (!error) {
    return null
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert" aria-live="assertive">
      <p className="text-xs text-red-700">{error.message}</p>
    </div>
  )
}
