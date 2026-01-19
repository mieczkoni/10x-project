import * as React from "react"

type ResetPasswordHeaderProps = {
  title?: string
  subtitle?: string
}

export function ResetPasswordHeader({
  title = "Reset password",
  subtitle = "Choose a new password to secure your account.",
}: ResetPasswordHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{subtitle}</p>
    </header>
  )
}
