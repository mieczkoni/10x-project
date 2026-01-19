import * as React from "react"

import { supabaseClient } from "../../db/supabase.client"
import type {
  ForgotPasswordErrorVm,
  ForgotPasswordFieldErrors,
  ForgotPasswordFormValues,
  ForgotPasswordStatusVm,
  ForgotPasswordViewModel,
} from "../views/auth/forgot-password.types"

const DEFAULT_FORM: ForgotPasswordFormValues = {
  email: "",
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) {
    return "Email is required."
  }
  if (trimmed.length > 254) {
    return "Email must be 254 characters or less."
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return "Enter a valid email address."
  }
  return null
}

function validateForm(values: ForgotPasswordFormValues): ForgotPasswordFieldErrors {
  return {
    email: validateEmail(values.email),
  }
}

function mapResetEmailError(error: { status?: number; message?: string } | null): ForgotPasswordErrorVm {
  const status = typeof error?.status === "number" ? error.status : null
  const message = error?.message?.toLowerCase() ?? ""

  if (status === 429 || message.includes("too many") || message.includes("rate")) {
    return {
      reason: "rate_limited",
      message: "Too many requests. Please wait a moment and try again.",
    }
  }

  if (message.includes("fetch") || message.includes("network")) {
    return {
      reason: "network_error",
      message: "Network error. Check your connection and try again.",
    }
  }

  return {
    reason: "unknown_error",
    message: "Something went wrong. Please try again.",
  }
}

export function useForgotPassword() {
  const [form, setFormState] = React.useState<ForgotPasswordFormValues>(DEFAULT_FORM)
  const [fieldErrors, setFieldErrors] = React.useState<ForgotPasswordFieldErrors>(() =>
    validateForm(DEFAULT_FORM)
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [status, setStatus] = React.useState<ForgotPasswordStatusVm>("idle")
  const [errorSummary, setErrorSummary] = React.useState<ForgotPasswordViewModel["errorSummary"]>(null)

  const setForm = React.useCallback((next: ForgotPasswordFormValues) => {
    setFormState(next)
    setFieldErrors(validateForm(next))
    setErrorSummary(null)
  }, [])

  const reset = React.useCallback(() => {
    setStatus("idle")
    setSubmitting(false)
    setErrorSummary(null)
    setFormState(DEFAULT_FORM)
    setFieldErrors(validateForm(DEFAULT_FORM))
  }, [])

  const ensureAnonymousOrRedirect = React.useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }
    const { data } = await supabaseClient.auth.getSession()
    if (data.session?.user) {
      window.location.href = "/dashboard"
    }
  }, [])

  const submit = React.useCallback(
    async (values: ForgotPasswordFormValues) => {
      if (submitting) {
        return
      }

      const nextErrors = validateForm(values)
      setFieldErrors(nextErrors)
      if (nextErrors.email) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        })
        return
      }

      setSubmitting(true)
      setStatus("submitting")
      setErrorSummary(null)

      const normalizedEmail = values.email.trim()
      setFormState((prev) => ({ ...prev, email: normalizedEmail }))

      try {
        const redirectTo =
          typeof window === "undefined" ? undefined : `${window.location.origin}/reset-password`
        const { error } = await supabaseClient.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo,
        })

        if (error) {
          setErrorSummary(mapResetEmailError(error))
        }

        setStatus("confirmed")
        setSubmitting(false)
      } catch {
        setErrorSummary({
          reason: "network_error",
          message: "Network error. Check your connection and try again.",
        })
        setStatus("confirmed")
        setSubmitting(false)
      }
    },
    [submitting]
  )

  return {
    form,
    errors: fieldErrors,
    submitting,
    status,
    errorSummary,
    setForm,
    submit,
    reset,
    ensureAnonymousOrRedirect,
  }
}
