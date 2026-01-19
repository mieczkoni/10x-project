import * as React from "react"

import { useResetPassword } from "../../hooks/useResetPassword"
import { ResetPasswordErrorSummary } from "./ResetPasswordErrorSummary"
import { ResetPasswordForm } from "./ResetPasswordForm"
import { ResetPasswordHeader } from "./ResetPasswordHeader"
import { ResetPasswordLinks } from "./ResetPasswordLinks"
import { ResetPasswordSuccess } from "./ResetPasswordSuccess"
import { ResetPasswordTokenStatus } from "./ResetPasswordTokenStatus"

export function ResetPasswordView() {
  const {
    form,
    errors,
    submitting,
    step,
    recoveryStatus,
    errorSummary,
    setForm,
    submit,
    initializeRecovery,
  } = useResetPassword()

  React.useEffect(() => {
    void initializeRecovery()
  }, [initializeRecovery])

  const handleChange = React.useCallback(
    (nextForm: typeof form) => {
      setForm(nextForm)
    },
    [setForm]
  )

  const handleSubmit = React.useCallback(
    async (values: typeof form) => {
      await submit(values)
    },
    [submit]
  )

  const handleGoToDashboard = React.useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    window.location.href = "/dashboard"
  }, [])

  const handleGoToLogin = React.useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    window.location.href = "/login"
  }, [])

  const recoveryReady = recoveryStatus === "ready"
  const disabledReason =
    recoveryStatus === "checking"
      ? "Validating your reset link..."
      : recoveryReady
        ? undefined
        : "We need a valid reset link to continue."

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
        <ResetPasswordHeader />
        <ResetPasswordErrorSummary error={errorSummary} />
        <ResetPasswordTokenStatus status={recoveryStatus} />
        {step === "success" ? (
          <ResetPasswordSuccess onGoToDashboard={handleGoToDashboard} onGoToLogin={handleGoToLogin} />
        ) : (
          <ResetPasswordForm
            value={form}
            errors={errors}
            submitting={submitting}
            recoveryReady={recoveryReady}
            disabledReason={disabledReason}
            onChange={handleChange}
            onSubmit={handleSubmit}
          />
        )}
        {step === "form" ? <ResetPasswordLinks /> : null}
      </section>
    </main>
  )
}
