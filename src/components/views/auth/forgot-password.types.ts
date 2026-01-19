export type ForgotPasswordFormValues = {
  email: string
}

export type ForgotPasswordFieldErrors = {
  email: string | null
}

export type ForgotPasswordFailureReason = "rate_limited" | "network_error" | "unknown_error"

export type ForgotPasswordErrorVm = {
  reason: ForgotPasswordFailureReason
  message: string
}

export type ForgotPasswordStatusVm = "idle" | "submitting" | "confirmed"

export type ForgotPasswordViewModel = {
  form: ForgotPasswordFormValues
  errors: ForgotPasswordFieldErrors
  submitting: boolean
  status: ForgotPasswordStatusVm
  errorSummary: ForgotPasswordErrorVm | null
}
