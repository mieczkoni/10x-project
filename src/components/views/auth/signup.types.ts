export interface SignupFormValues {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface SignupFieldErrors {
  email: string | null;
  password: string | null;
  confirmPassword: string | null;
}

export type SignupFailureReason =
  | "rate_limited"
  | "network_error"
  | "account_exists"
  | "email_not_allowed"
  | "weak_password"
  | "unknown_error";

export interface SignupErrorVm {
  reason: SignupFailureReason;
  message: string;
}

export interface SafeReturnToVm {
  raw: string | null;
  resolved: string;
}

export interface SignupViewModel {
  form: SignupFormValues;
  errors: SignupFieldErrors;
  submitting: boolean;
  errorSummary: SignupErrorVm | null;
  returnTo: SafeReturnToVm;
}
