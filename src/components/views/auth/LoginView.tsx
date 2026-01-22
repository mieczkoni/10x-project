import * as React from "react"

import { useLogin } from "../../hooks/useLogin"
import { LoginErrorSummary } from "./LoginErrorSummary"
import { LoginForm } from "./LoginForm"
import { LoginHeader } from "./LoginHeader"
import { LoginLinks } from "./LoginLinks"

type LoginViewProps = {
  initialNext?: string | null
}

export function LoginView({ initialNext }: LoginViewProps) {
  const { form, errors, submitting, errorSummary, setForm, submit } = useLogin(initialNext)

  const handleChange = React.useCallback((nextForm: typeof form) => {
    setForm(nextForm)
  }, [setForm])

  const handleSubmit = React.useCallback(
    async (values: typeof form) => {
      await submit(values)
    },
    [submit]
  )

  return (
    <main
      className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10"
      data-test-id="login-page"
    >
      <section
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
        data-test-id="login-panel"
      >
        <LoginHeader />
        <LoginErrorSummary error={errorSummary} />
        <LoginForm
          value={form}
          errors={errors}
          submitting={submitting}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
        <LoginLinks />
      </section>
    </main>
  )
}
