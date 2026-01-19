import * as React from "react"

import { Button } from "@/components/ui/button"

type ResetPasswordSuccessProps = {
  onGoToDashboard: () => void
  onGoToLogin?: () => void
}

export function ResetPasswordSuccess({ onGoToDashboard, onGoToLogin }: ResetPasswordSuccessProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm text-emerald-800">Your password has been updated successfully.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="sm" onClick={onGoToDashboard}>
          Go to dashboard
        </Button>
        {onGoToLogin ? (
          <Button type="button" variant="outline" size="sm" onClick={onGoToLogin}>
            Log in
          </Button>
        ) : null}
      </div>
    </div>
  )
}
