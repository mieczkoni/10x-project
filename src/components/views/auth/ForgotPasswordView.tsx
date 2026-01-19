import * as React from "react"

import { useForgotPassword } from "../../hooks/useForgotPassword"
import { ForgotPasswordConfirmation } from "./ForgotPasswordConfirmation"
import { ForgotPasswordErrorSummary } from "./ForgotPasswordErrorSummary"
import { ForgotPasswordForm } from "./ForgotPasswordForm"
import { ForgotPasswordHeader } from "./ForgotPasswordHeader"
import { ForgotPasswordLinks } from "./ForgotPasswordLinks"

export function ForgotPasswordView() {
  const { form, errors, submitting, status, errorSummary, setForm, submit, reset, ensureAnonymousOrRedirect } =
    useForgotPassword()

  React.useEffect(() => {
    void ensureAnonymousOrRedirect()
  }, [ensureAnonymousOrRedirect])

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

  const handleReset = React.useCallback(() => {
    reset()
  }, [reset])

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
        <ForgotPasswordHeader />
        <ForgotPasswordErrorSummary error={errorSummary} />
        {status === "confirmed" ? (
          <ForgotPasswordConfirmation emailHint={form.email} onReset={handleReset} />
        ) : (
          <ForgotPasswordForm
            value={form}
            errors={errors}
            submitting={submitting}
            onChange={handleChange}
            onSubmit={handleSubmit}
          />
        )}
        <ForgotPasswordLinks />
      </section>
    </main>
  )
}
