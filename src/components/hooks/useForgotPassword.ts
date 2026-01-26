import * as React from "react";

import { ApiError, fetchJson } from "../../lib/http/client";
import type { JsonObject } from "../../types";
import type {
  ForgotPasswordErrorVm,
  ForgotPasswordFieldErrors,
  ForgotPasswordFormValues,
  ForgotPasswordStatusVm,
  ForgotPasswordViewModel,
} from "../views/auth/forgot-password.types";

const DEFAULT_FORM: ForgotPasswordFormValues = {
  email: "",
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

function validateForm(values: ForgotPasswordFormValues): ForgotPasswordFieldErrors {
  return {
    email: validateEmail(values.email),
  };
}

function getFieldErrors(details?: JsonObject): ForgotPasswordFieldErrors | null {
  if (!details || typeof details !== "object") {
    return null;
  }
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) {
    return null;
  }
  return {
    email: fieldErrors.email?.[0] ?? null,
  };
}

function mapApiError(error: ApiError): ForgotPasswordErrorVm {
  if (error.status === 429 || error.code === "rate_limited") {
    return {
      reason: "rate_limited",
      message: "Too many requests. Please wait a moment and try again.",
    };
  }

  return {
    reason: "unknown_error",
    message: "Something went wrong. Please try again.",
  };
}

export function useForgotPassword() {
  const [form, setFormState] = React.useState<ForgotPasswordFormValues>(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = React.useState<ForgotPasswordFieldErrors>(() => validateForm(DEFAULT_FORM));
  const [submitting, setSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<ForgotPasswordStatusVm>("idle");
  const [errorSummary, setErrorSummary] = React.useState<ForgotPasswordViewModel["errorSummary"]>(null);

  const setForm = React.useCallback((next: ForgotPasswordFormValues) => {
    setFormState(next);
    setFieldErrors(validateForm(next));
    setErrorSummary(null);
  }, []);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setSubmitting(false);
    setErrorSummary(null);
    setFormState(DEFAULT_FORM);
    setFieldErrors(validateForm(DEFAULT_FORM));
  }, []);

  const submit = React.useCallback(
    async (values: ForgotPasswordFormValues) => {
      if (submitting) {
        return;
      }

      const nextErrors = validateForm(values);
      setFieldErrors(nextErrors);
      if (nextErrors.email) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        });
        return;
      }

      setSubmitting(true);
      setStatus("submitting");
      setErrorSummary(null);

      const normalizedEmail = values.email.trim();
      setFormState((prev) => ({ ...prev, email: normalizedEmail }));

      try {
        await fetchJson<{ ok: true }>("/api/auth/request-password-reset", {
          method: "POST",
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        });
        setStatus("confirmed");
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
        setStatus("confirmed");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting]
  );

  return {
    form,
    errors: fieldErrors,
    submitting,
    status,
    errorSummary,
    setForm,
    submit,
    reset,
  };
}
