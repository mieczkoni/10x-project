import * as React from "react"

type SignupHeaderProps = {
  title?: string
  subtitle?: string
}

export function SignupHeader({
  title = "Create your account",
  subtitle = "Start by generating your first cards.",
}: SignupHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{subtitle}</p>
    </header>
  )
}
