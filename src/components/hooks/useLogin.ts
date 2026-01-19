import * as React from "react"

import { supabaseClient } from "../../db/supabase.client"
import { createEvent } from "../../lib/services/events.service"
import type { UserId } from "../../types"
import type {
  LoginErrorVm,
  LoginFieldErrors,
  LoginFormValues,
  LoginViewModel,
  SafeReturnToVm,
} from "../views/auth/login.types"

const DEFAULT_FORM: LoginFormValues = {
  email: "",
  password: "",
}

const DEFAULT_RETURN_TO: SafeReturnToVm = {
  raw: null,
  resolved: "/dashboard",
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

function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required."
  }
  return null
}

function validateForm(values: LoginFormValues): LoginFieldErrors {
  return {
    email: validateEmail(values.email),
    password: validatePassword(values.password),
  }
}

function resolveReturnTo(raw: string | null): SafeReturnToVm {
  if (!raw) {
    return { ...DEFAULT_RETURN_TO }
  }
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("//")) {
    return { raw, resolved: DEFAULT_RETURN_TO.resolved }
  }
  if (!raw.startsWith("/dashboard") || raw.startsWith("/api")) {
    return { raw, resolved: DEFAULT_RETURN_TO.resolved }
  }
  return { raw, resolved: raw }
}

function mapAuthError(error: { status?: number; message?: string } | null): LoginErrorVm {
  const status = typeof error?.status === "number" ? error.status : null
  const message = error?.message?.toLowerCase() ?? ""

  if (status === 429 || message.includes("too many") || message.includes("rate")) {
    return {
      reason: "rate_limited",
      message: "Too many attempts. Please wait a moment and try again.",
    }
  }

  if (message.includes("fetch") || message.includes("network")) {
    return {
      reason: "network_error",
      message: "Network error. Check your connection and try again.",
    }
  }

  if (status === 400 || status === 401 || message.includes("invalid login credentials")) {
    return {
      reason: "invalid_credentials",
      message: "Invalid email or password.",
    }
  }

  return {
    reason: "unknown_error",
    message: "Login failed. Please try again.",
  }
}

export function useLogin() {
  const [form, setFormState] = React.useState<LoginFormValues>(DEFAULT_FORM)
  const [fieldErrors, setFieldErrors] = React.useState<LoginFieldErrors>(() =>
    validateForm(DEFAULT_FORM)
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [errorSummary, setErrorSummary] = React.useState<LoginViewModel["errorSummary"]>(null)
  const [returnTo, setReturnTo] = React.useState<SafeReturnToVm>(DEFAULT_RETURN_TO)

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const params = new URLSearchParams(window.location.search)
    setReturnTo(resolveReturnTo(params.get("returnTo")))
  }, [])

  const setForm = React.useCallback((next: LoginFormValues) => {
    setFormState(next)
    setFieldErrors(validateForm(next))
    setErrorSummary(null)
  }, [])

  const ensureAnonymousOrRedirect = React.useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }
    const { data } = await supabaseClient.auth.getSession()
    if (data.session?.user) {
      window.location.href = returnTo.resolved
    }
  }, [returnTo.resolved])

  const submit = React.useCallback(
    async (values: LoginFormValues) => {
      if (submitting) {
        return
      }

      const nextErrors = validateForm(values)
      setFieldErrors(nextErrors)
      if (nextErrors.email || nextErrors.password) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        })
        return
      }

      setSubmitting(true)
      setErrorSummary(null)

      const normalizedEmail = values.email.trim()
      setFormState((prev) => ({ ...prev, email: normalizedEmail }))

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: normalizedEmail,
          password: values.password,
        })

        if (error || !data.user) {
          setErrorSummary(mapAuthError(error))
          setSubmitting(false)
          return
        }

        void createEvent(supabaseClient, data.user.id as UserId, "login", {
          method: "password",
          returnTo: returnTo.resolved,
        })

        setSubmitting(false)
        window.location.href = returnTo.resolved
      } catch {
        setErrorSummary({
          reason: "network_error",
          message: "Network error. Check your connection and try again.",
        })
        setSubmitting(false)
      }
    },
    [returnTo.resolved, submitting]
  )

  return {
    form,
    errors: fieldErrors,
    submitting,
    errorSummary,
    returnTo,
    setForm,
    submit,
    ensureAnonymousOrRedirect,
  }
}
