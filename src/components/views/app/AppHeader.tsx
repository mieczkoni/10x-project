import * as React from "react"

import { ApiError, fetchJson } from "../../../lib/http/client"
import { Button } from "../../ui/button"

type AppHeaderProps = {
  userEmail?: string | null
  children?: React.ReactNode
}

export function AppHeader({ userEmail, children }: AppHeaderProps) {
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [logoutError, setLogoutError] = React.useState<string | null>(null)

  const handleLogout = React.useCallback(async () => {
    if (loggingOut) {
      return
    }
    setLoggingOut(true)
    setLogoutError(null)

    try {
      await fetchJson<{ ok: true }>("/api/auth/logout", { method: "POST" })
      window.location.href = "/"
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.location.href = "/"
        return
      }
      setLogoutError(
        error instanceof ApiError ? error.message : "Logout failed. Please try again."
      )
    } finally {
      setLoggingOut(false)
    }
  }, [loggingOut])

  const emailLabel = userEmail?.trim() ? userEmail : "Signed in"

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <nav className="flex min-w-0 items-center gap-4" aria-label="App">
          <a href="/dashboard" className="text-base font-semibold text-slate-900">
            10x Cards
          </a>
          {children ? <div className="flex items-center gap-3">{children}</div> : null}
        </nav>
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-slate-600" title={emailLabel}>
            {emailLabel}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Logout"}
          </Button>
        </div>
      </div>
      {logoutError ? (
        <div className="mx-auto w-full max-w-5xl px-6 pb-4" role="alert">
          <p className="text-sm text-rose-600">{logoutError}</p>
        </div>
      ) : null}
    </header>
  )
}
