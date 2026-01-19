export type ResetPasswordFormValues = {
  password: string
  confirmPassword: string
}

export type ResetPasswordFieldErrors = {
  password: string | null
  confirmPassword: string | null
}

export type RecoveryContextVm = {
  hasHashAccessToken: boolean
  hasHashRefreshToken: boolean
  hasQueryCode: boolean
  type: string | null
}

export type RecoveryStatusVm = "checking" | "ready" | "missing" | "invalid"

export type ResetPasswordFailureReason =
  | "recovery_missing"
  | "recovery_invalid"
  | "weak_password"
  | "network_error"
  | "unknown_error"

export type ResetPasswordErrorVm = {
  reason: ResetPasswordFailureReason
  message: string
}

export type ResetPasswordStepVm = "form" | "success"

export type ResetPasswordViewModel = {
  form: ResetPasswordFormValues
  errors: ResetPasswordFieldErrors
  submitting: boolean
  step: ResetPasswordStepVm
  recoveryStatus: RecoveryStatusVm
  recoveryContext: RecoveryContextVm
  errorSummary: ResetPasswordErrorVm | null
}
