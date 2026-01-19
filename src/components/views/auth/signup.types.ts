export type SignupFormValues = {
  email: string
  password: string
  confirmPassword: string
}

export type SignupFieldErrors = {
  email: string | null
  password: string | null
  confirmPassword: string | null
}

export type SignupFailureReason =
  | "rate_limited"
  | "network_error"
  | "email_not_allowed"
  | "weak_password"
  | "unknown_error"

export type SignupErrorVm = {
  reason: SignupFailureReason
  message: string
}

export type SafeReturnToVm = {
  raw: string | null
  resolved: string
}

export type SignupViewModel = {
  form: SignupFormValues
  errors: SignupFieldErrors
  submitting: boolean
  errorSummary: SignupErrorVm | null
  returnTo: SafeReturnToVm
}
