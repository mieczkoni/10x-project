import * as React from "react"

import { useSignup } from "../../hooks/useSignup"
import { SignupErrorSummary } from "./SignupErrorSummary"
import { SignupForm } from "./SignupForm"
import { SignupHeader } from "./SignupHeader"
import { SignupLinks } from "./SignupLinks"

export function SignupView() {
  const { form, errors, submitting, errorSummary, setForm, submit, ensureAnonymousOrRedirect, returnTo } =
    useSignup()

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

  const loginHref = React.useMemo(() => {
    if (!returnTo.raw) {
      return "/login"
    }
    return `/login?returnTo=${encodeURIComponent(returnTo.raw)}`
  }, [returnTo.raw])

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
        <SignupHeader />
        <SignupErrorSummary error={errorSummary} />
        <SignupForm
          value={form}
          errors={errors}
          submitting={submitting}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
        <SignupLinks loginHref={loginHref} />
      </section>
    </main>
  )
}
