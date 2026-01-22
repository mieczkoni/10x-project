import * as React from "react"

import { Button } from "@/components/ui/button"

import type { LoginFieldErrors, LoginFormValues } from "./login.types"

export type LoginFormProps = {
  value: LoginFormValues
  errors: LoginFieldErrors
  submitting: boolean
  submitLabel?: string
  onChange: (next: LoginFormValues) => void
  onSubmit: (values: LoginFormValues) => Promise<void>
}

export function LoginForm({
  value,
  errors,
  submitting,
  submitLabel = "Log in",
  onChange,
  onSubmit,
}: LoginFormProps) {
  const emailId = React.useId()
  const passwordId = React.useId()
  const emailErrorId = `${emailId}-error`
  const passwordErrorId = `${passwordId}-error`
  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)
  const [touched, setTouched] = React.useState({ email: false, password: false })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  const showEmailError = Boolean((touched.email || submitAttempted) && errors.email)
  const showPasswordError = Boolean((touched.password || submitAttempted) && errors.password)
  const isValid = !errors.email && !errors.password

  React.useEffect(() => {
    if (!submitAttempted) {
      return
    }
    if (errors.email && emailRef.current) {
      emailRef.current.focus()
      return
    }
    if (errors.password && passwordRef.current) {
      passwordRef.current.focus()
    }
  }, [errors.email, errors.password, submitAttempted])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (submitting) {
        return
      }
      setSubmitAttempted(true)
      await onSubmit(value)
    },
    [onSubmit, submitting, value]
  )

  const handleEmailChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, email: event.target.value })
    },
    [onChange, value]
  )

  const handlePasswordChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, password: event.target.value })
    },
    [onChange, value]
  )

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
      data-test-id="login-form"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600" htmlFor={emailId}>
          Email
        </label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
          value={value.email}
          onChange={handleEmailChange}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          aria-invalid={showEmailError}
          aria-describedby={showEmailError ? emailErrorId : undefined}
          disabled={submitting}
          required
          data-test-id="login-email-input"
        />
        {showEmailError ? (
          <p id={emailErrorId} className="text-xs text-red-600">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600" htmlFor={passwordId}>
          Password
        </label>
        <input
          ref={passwordRef}
          id={passwordId}
          type="password"
          autoComplete="current-password"
          className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
          value={value.password}
          onChange={handlePasswordChange}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          aria-invalid={showPasswordError}
          aria-describedby={showPasswordError ? passwordErrorId : undefined}
          disabled={submitting}
          required
          data-test-id="login-password-input"
        />
        {showPasswordError ? (
          <p id={passwordErrorId} className="text-xs text-red-600">
            {errors.password}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={submitting || !isValid}
        className="w-full"
        size="lg"
        data-test-id="login-submit-button"
      >
        {submitting ? "Logging in..." : submitLabel}
      </Button>
    </form>
  )
}
