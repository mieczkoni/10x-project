import * as React from "react"

import { supabaseClient } from "../../db/supabase.client"
import type {
  RecoveryContextVm,
  RecoveryStatusVm,
  ResetPasswordErrorVm,
  ResetPasswordFieldErrors,
  ResetPasswordFormValues,
  ResetPasswordViewModel,
} from "../views/auth/reset-password.types"

const DEFAULT_FORM: ResetPasswordFormValues = {
  password: "",
  confirmPassword: "",
}

const DEFAULT_CONTEXT: RecoveryContextVm = {
  hasHashAccessToken: false,
  hasHashRefreshToken: false,
  hasQueryCode: false,
  type: null,
}

const INVALID_RECOVERY_MESSAGE =
  "This password reset link is invalid or has expired. Please request a new one."

const PASSWORD_MIN_LENGTH = 8

function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required."
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
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

function validateForm(values: ResetPasswordFormValues): ResetPasswordFieldErrors {
  return {
    password: validatePassword(values.password),
    confirmPassword: validateConfirmPassword(values.password, values.confirmPassword),
  }
}

function mapResetPasswordError(error: { status?: number; message?: string } | null): ResetPasswordErrorVm {
  const status = typeof error?.status === "number" ? error.status : null
  const message = error?.message?.toLowerCase() ?? ""

  if (status === 429 || message.includes("too many") || message.includes("rate")) {
    return {
      reason: "network_error",
      message: "Too many requests. Please wait a moment and try again.",
    }
  }

  if (message.includes("fetch") || message.includes("network")) {
    return {
      reason: "network_error",
      message: "Network error. Check your connection and try again.",
    }
  }

  if (message.includes("password") && (message.includes("weak") || message.includes("policy"))) {
    return {
      reason: "weak_password",
      message: "Password doesn't meet the requirements. Please choose a stronger password.",
    }
  }

  if (message.includes("length") && message.includes("password")) {
    return {
      reason: "weak_password",
      message: "Password doesn't meet the requirements. Please choose a stronger password.",
    }
  }

  return {
    reason: "unknown_error",
    message: "Could not update password. Please try again.",
  }
}

function getRecoveryParams() {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      refreshToken: null,
      code: null,
      type: null,
      context: DEFAULT_CONTEXT,
    }
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const queryParams = new URLSearchParams(window.location.search)
  const accessToken = hashParams.get("access_token")
  const refreshToken = hashParams.get("refresh_token")
  const code = queryParams.get("code")
  const type = hashParams.get("type") || queryParams.get("type")

  return {
    accessToken,
    refreshToken,
    code,
    type,
    context: {
      hasHashAccessToken: Boolean(accessToken),
      hasHashRefreshToken: Boolean(refreshToken),
      hasQueryCode: Boolean(code),
      type,
    },
  }
}

export function useResetPassword() {
  const [form, setFormState] = React.useState<ResetPasswordFormValues>(DEFAULT_FORM)
  const [fieldErrors, setFieldErrors] = React.useState<ResetPasswordFieldErrors>(() =>
    validateForm(DEFAULT_FORM)
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [step, setStep] = React.useState<ResetPasswordViewModel["step"]>("form")
  const [recoveryStatus, setRecoveryStatus] = React.useState<RecoveryStatusVm>("checking")
  const [recoveryContext, setRecoveryContext] = React.useState<RecoveryContextVm>(DEFAULT_CONTEXT)
  const [errorSummary, setErrorSummary] = React.useState<ResetPasswordViewModel["errorSummary"]>(null)

  const setForm = React.useCallback((next: ResetPasswordFormValues) => {
    setFormState(next)
    setFieldErrors(validateForm(next))
    setErrorSummary(null)
  }, [])

  const initializeRecovery = React.useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }

    setRecoveryStatus("checking")
    setErrorSummary(null)

    const { data: sessionData } = await supabaseClient.auth.getSession()
    if (sessionData.session?.user) {
      const { context } = getRecoveryParams()
      setRecoveryContext(context)
      setRecoveryStatus("ready")
      return
    }

    const { accessToken, refreshToken, code, context } = getRecoveryParams()
    setRecoveryContext(context)

    const auth = supabaseClient.auth as typeof supabaseClient.auth & {
      getSessionFromUrl?: (options: { storeSession: boolean }) => Promise<{
        data: { session: unknown | null }
        error: { message?: string } | null
      }>
      exchangeCodeForSession?: (codeValue: string) => Promise<{
        data: { session: unknown | null }
        error: { message?: string } | null
      }>
    }

    if (typeof auth.getSessionFromUrl === "function" && (accessToken || refreshToken || code)) {
      const { data, error } = await auth.getSessionFromUrl({ storeSession: true })
      if (data?.session && !error) {
        setRecoveryStatus("ready")
        return
      }
      setRecoveryStatus("invalid")
      setErrorSummary({
        reason: "recovery_invalid",
        message: INVALID_RECOVERY_MESSAGE,
      })
      return
    }

    if (code && typeof auth.exchangeCodeForSession === "function") {
      const { data, error } = await auth.exchangeCodeForSession(code)
      if (data?.session && !error) {
        setRecoveryStatus("ready")
        return
      }
      setRecoveryStatus("invalid")
      setErrorSummary({
        reason: "recovery_invalid",
        message: INVALID_RECOVERY_MESSAGE,
      })
      return
    }

    if (accessToken || refreshToken) {
      if (!accessToken || !refreshToken) {
        setRecoveryStatus("invalid")
        setErrorSummary({
          reason: "recovery_invalid",
          message: INVALID_RECOVERY_MESSAGE,
        })
        return
      }

      const { data, error } = await supabaseClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (data?.session && !error) {
        setRecoveryStatus("ready")
        return
      }

      setRecoveryStatus("invalid")
      setErrorSummary({
        reason: "recovery_invalid",
        message: INVALID_RECOVERY_MESSAGE,
      })
      return
    }

    setRecoveryStatus("missing")
    setErrorSummary({
      reason: "recovery_missing",
      message: INVALID_RECOVERY_MESSAGE,
    })
  }, [])

  const submit = React.useCallback(
    async (values: ResetPasswordFormValues) => {
      if (submitting) {
        return
      }

      if (recoveryStatus !== "ready") {
        setErrorSummary({
          reason: recoveryStatus === "missing" ? "recovery_missing" : "recovery_invalid",
          message: INVALID_RECOVERY_MESSAGE,
        })
        return
      }

      const nextErrors = validateForm(values)
      setFieldErrors(nextErrors)
      if (nextErrors.password || nextErrors.confirmPassword) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        })
        return
      }

      setSubmitting(true)
      setErrorSummary(null)

      try {
        const { error } = await supabaseClient.auth.updateUser({ password: values.password })
        if (error) {
          setErrorSummary(mapResetPasswordError(error))
          setSubmitting(false)
          return
        }

        setSubmitting(false)
        setStep("success")
      } catch {
        setErrorSummary({
          reason: "network_error",
          message: "Network error. Check your connection and try again.",
        })
        setSubmitting(false)
      }
    },
    [recoveryStatus, submitting]
  )

  return {
    form,
    errors: fieldErrors,
    submitting,
    step,
    recoveryStatus,
    recoveryContext,
    errorSummary,
    setForm,
    submit,
    initializeRecovery,
  }
}
