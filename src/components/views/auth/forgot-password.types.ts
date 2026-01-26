export interface ForgotPasswordFormValues {
  email: string;
}

export interface ForgotPasswordFieldErrors {
  email: string | null;
}

export type ForgotPasswordFailureReason = "rate_limited" | "network_error" | "unknown_error";

export interface ForgotPasswordErrorVm {
  reason: ForgotPasswordFailureReason;
  message: string;
}

export type ForgotPasswordStatusVm = "idle" | "submitting" | "confirmed";

export interface ForgotPasswordViewModel {
  form: ForgotPasswordFormValues;
  errors: ForgotPasswordFieldErrors;
  submitting: boolean;
  status: ForgotPasswordStatusVm;
  errorSummary: ForgotPasswordErrorVm | null;
}
