export type LoginFormValues = {
  email: string
  password: string
}

export type LoginFieldErrors = {
  email: string | null
  password: string | null
}

export type AuthFailureReason =
  | "invalid_credentials"
  | "rate_limited"
  | "network_error"
  | "unknown_error"

export type LoginErrorVm = {
  reason: AuthFailureReason
  message: string
}

export type SafeReturnToVm = {
  raw: string | null
  resolved: string
}

export type LoginViewModel = {
  form: LoginFormValues
  errors: LoginFieldErrors
  submitting: boolean
  errorSummary: LoginErrorVm | null
  returnTo: SafeReturnToVm
}
