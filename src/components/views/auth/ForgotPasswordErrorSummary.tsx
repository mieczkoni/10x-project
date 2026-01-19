import * as React from "react"

import type { ForgotPasswordErrorVm } from "./forgot-password.types"

type ForgotPasswordErrorSummaryProps = {
  error: ForgotPasswordErrorVm | null
}

export function ForgotPasswordErrorSummary({ error }: ForgotPasswordErrorSummaryProps) {
  if (!error) {
    return null
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert" aria-live="assertive">
      <p className="text-xs text-red-700">{error.message}</p>
    </div>
  )
}
