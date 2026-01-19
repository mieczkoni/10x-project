import * as React from "react"

type LoginLinksProps = {
  forgotHref?: string
  signupHref?: string
}

export function LoginLinks({ forgotHref = "/forgot-password", signupHref = "/signup" }: LoginLinksProps) {
  return (
    <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <a
        className="w-fit underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        href={forgotHref}
      >
        Forgot password?
      </a>
      <a
        className="w-fit font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        href={signupHref}
      >
        Create account
      </a>
    </div>
  )
}
