import * as React from "react"

import { supabaseClient } from "../../db/supabase.client"
import { createEvent } from "../../lib/services/events.service"
import type { UserId } from "../../types"
import type {
  SafeReturnToVm,
  SignupErrorVm,
  SignupFieldErrors,
  SignupFormValues,
  SignupViewModel,
} from "../views/auth/signup.types"

const DEFAULT_FORM: SignupFormValues = {
  email: "",
  password: "",
  confirmPassword: "",
}

const DEFAULT_RETURN_TO: SafeReturnToVm = {
  raw: null,
  resolved: "/dashboard/generate",
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

function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return "Confirm password is required."
  }
  if (confirmPassword !== password) {
    return "Passwords do not match."
  }
  return null
}

function validateForm(values: SignupFormValues): SignupFieldErrors {
  return {
    email: validateEmail(values.email),
    password: validatePassword(values.password),
    confirmPassword: validateConfirmPassword(values.password, values.confirmPassword),
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

function mapAuthErrorForSignup(error: { status?: number; message?: string } | null): SignupErrorVm {
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

  if (
    message.includes("password") &&
    (message.includes("weak") || message.includes("policy") || message.includes("length"))
  ) {
    return {
      reason: "weak_password",
      message: "Password doesn't meet the requirements. Please choose a stronger password.",
    }
  }

  if (message.includes("email") && (message.includes("not allowed") || message.includes("invalid"))) {
    return {
      reason: "email_not_allowed",
      message: "Unable to create account with this email. Please try a different email.",
    }
  }

  return {
    reason: "unknown_error",
    message: "Could not create account. Please try again.",
  }
}

export function useSignup() {
  const [form, setFormState] = React.useState<SignupFormValues>(DEFAULT_FORM)
  const [fieldErrors, setFieldErrors] = React.useState<SignupFieldErrors>(() =>
    validateForm(DEFAULT_FORM)
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [errorSummary, setErrorSummary] = React.useState<SignupViewModel["errorSummary"]>(null)
  const [returnTo, setReturnTo] = React.useState<SafeReturnToVm>(DEFAULT_RETURN_TO)

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const params = new URLSearchParams(window.location.search)
    setReturnTo(resolveReturnTo(params.get("returnTo")))
  }, [])

  const setForm = React.useCallback((next: SignupFormValues) => {
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
    async (values: SignupFormValues) => {
      if (submitting) {
        return
      }

      const nextErrors = validateForm(values)
      setFieldErrors(nextErrors)
      if (nextErrors.email || nextErrors.password || nextErrors.confirmPassword) {
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
        const { data, error } = await supabaseClient.auth.signUp({
          email: normalizedEmail,
          password: values.password,
        })

        if (error || !data.user) {
          setErrorSummary(mapAuthErrorForSignup(error))
          setSubmitting(false)
          return
        }

        const onboardingTarget = DEFAULT_RETURN_TO.resolved

        void createEvent(supabaseClient, data.user.id as UserId, "signup", {
          method: "password",
          returnTo: returnTo.resolved,
          onboardingTarget,
        })

        if (!data.session?.user) {
          setErrorSummary({
            reason: "unknown_error",
            message: "Account created. Please log in to continue.",
          })
          setSubmitting(false)
          return
        }

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
