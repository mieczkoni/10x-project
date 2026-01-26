export interface LoginFormValues {
  email: string;
  password: string;
}

export interface LoginFieldErrors {
  email: string | null;
  password: string | null;
}

export type AuthFailureReason = "invalid_credentials" | "rate_limited" | "network_error" | "unknown_error";

export interface LoginErrorVm {
  reason: AuthFailureReason;
  message: string;
}

export interface SafeReturnToVm {
  raw: string | null;
  resolved: string;
}

export interface LoginViewModel {
  form: LoginFormValues;
  errors: LoginFieldErrors;
  submitting: boolean;
  errorSummary: LoginErrorVm | null;
  returnTo: SafeReturnToVm;
}
