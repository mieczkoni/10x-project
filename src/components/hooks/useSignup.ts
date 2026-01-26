import * as React from "react";

import { ApiError, fetchJson } from "../../lib/http/client";
import type { JsonObject } from "../../types";
import type {
  SafeReturnToVm,
  SignupErrorVm,
  SignupFieldErrors,
  SignupFormValues,
  SignupViewModel,
} from "../views/auth/signup.types";

const DEFAULT_FORM: SignupFormValues = {
  email: "",
  password: "",
  confirmPassword: "",
};

const DEFAULT_RETURN_TO: SafeReturnToVm = {
  raw: null,
  resolved: "/dashboard/generate",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return "Email is required.";
  }
  if (trimmed.length > 254) {
    return "Email must be 254 characters or less.";
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return "Enter a valid email address.";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return "Confirm password is required.";
  }
  if (confirmPassword !== password) {
    return "Passwords do not match.";
  }
  return null;
}

function validateForm(values: SignupFormValues): SignupFieldErrors {
  return {
    email: validateEmail(values.email),
    password: validatePassword(values.password),
    confirmPassword: validateConfirmPassword(values.password, values.confirmPassword),
  };
}

function resolveReturnTo(raw: string | null): SafeReturnToVm {
  if (!raw) {
    return { ...DEFAULT_RETURN_TO };
  }
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("//")) {
    return { raw, resolved: DEFAULT_RETURN_TO.resolved };
  }
  if (!raw.startsWith("/dashboard") || raw.startsWith("/api")) {
    return { raw, resolved: DEFAULT_RETURN_TO.resolved };
  }
  return { raw, resolved: raw };
}

function getFieldErrors(details?: JsonObject): SignupFieldErrors | null {
  if (!details || typeof details !== "object") {
    return null;
  }
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) {
    return null;
  }
  return {
    email: fieldErrors.email?.[0] ?? null,
    password: fieldErrors.password?.[0] ?? null,
    confirmPassword: fieldErrors.confirmPassword?.[0] ?? null,
  };
}

function mapApiError(error: ApiError): SignupErrorVm {
  if (error.status === 429 || error.code === "rate_limited") {
    return {
      reason: "rate_limited",
      message: "Too many attempts. Please try again in a few minutes.",
    };
  }

  if (error.status === 409 || error.code === "account_exists") {
    return {
      reason: "account_exists",
      message: "Account already exists. Log in instead.",
    };
  }

  if (error.status === 400 && error.code === "weak_password") {
    return {
      reason: "weak_password",
      message: "Password doesn't meet the requirements. Please choose a stronger password.",
    };
  }

  if (error.status === 400 && error.code === "email_not_allowed") {
    return {
      reason: "email_not_allowed",
      message: "Unable to create account with this email. Please try a different email.",
    };
  }

  return {
    reason: "unknown_error",
    message: "Could not create account. Please try again.",
  };
}

export function useSignup(initialNext?: string | null) {
  const [form, setFormState] = React.useState<SignupFormValues>(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = React.useState<SignupFieldErrors>(() => validateForm(DEFAULT_FORM));
  const [submitting, setSubmitting] = React.useState(false);
  const [errorSummary, setErrorSummary] = React.useState<SignupViewModel["errorSummary"]>(null);
  const [returnTo, setReturnTo] = React.useState<SafeReturnToVm>(() => resolveReturnTo(initialNext ?? null));

  React.useEffect(() => {
    if (typeof window === "undefined" || initialNext != null) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setReturnTo(resolveReturnTo(params.get("next")));
  }, [initialNext]);

  const setForm = React.useCallback((next: SignupFormValues) => {
    setFormState(next);
    setFieldErrors(validateForm(next));
    setErrorSummary(null);
  }, []);

  const submit = React.useCallback(
    async (values: SignupFormValues) => {
      if (submitting) {
        return;
      }

      const nextErrors = validateForm(values);
      setFieldErrors(nextErrors);
      if (nextErrors.email || nextErrors.password || nextErrors.confirmPassword) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        });
        return;
      }

      setSubmitting(true);
      setErrorSummary(null);

      const normalizedEmail = values.email.trim();
      setFormState((prev) => ({ ...prev, email: normalizedEmail }));

      try {
        await fetchJson<{ user: { id: string; email: string | null } }>("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            email: normalizedEmail,
            password: values.password,
            confirmPassword: values.confirmPassword,
          }),
        });

        window.location.href = returnTo.resolved;
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 400 && error.code === "invalid_input") {
            const apiFieldErrors = getFieldErrors(error.details);
            if (apiFieldErrors) {
              setFieldErrors(apiFieldErrors);
            }
            setErrorSummary({
              reason: "unknown_error",
              message: "Please fix the highlighted fields.",
            });
            return;
          }

          setErrorSummary(mapApiError(error));
          return;
        }

        setErrorSummary({
          reason: "network_error",
          message: "Network error. Check your connection and try again.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [returnTo.resolved, submitting]
  );

  return {
    form,
    errors: fieldErrors,
    submitting,
    errorSummary,
    returnTo,
    setForm,
    submit,
  };
}
