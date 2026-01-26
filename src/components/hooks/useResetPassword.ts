import * as React from "react";

import { ApiError, fetchJson } from "../../lib/http/client";
import type { JsonObject } from "../../types";
import type {
  RecoveryContextVm,
  RecoveryStatusVm,
  ResetPasswordErrorVm,
  ResetPasswordFieldErrors,
  ResetPasswordFormValues,
  ResetPasswordViewModel,
} from "../views/auth/reset-password.types";

const DEFAULT_FORM: ResetPasswordFormValues = {
  password: "",
  confirmPassword: "",
};

const DEFAULT_CONTEXT: RecoveryContextVm = {
  hasHashAccessToken: false,
  hasHashRefreshToken: false,
  hasQueryCode: false,
  type: null,
};

const INVALID_RECOVERY_MESSAGE = "This password reset link is invalid or has expired. Please request a new one.";

const PASSWORD_MIN_LENGTH = 8;

function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required.";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
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

function validateForm(values: ResetPasswordFormValues): ResetPasswordFieldErrors {
  return {
    password: validatePassword(values.password),
    confirmPassword: validateConfirmPassword(values.password, values.confirmPassword),
  };
}

function getFieldErrors(details?: JsonObject): ResetPasswordFieldErrors | null {
  if (!details || typeof details !== "object") {
    return null;
  }
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) {
    return null;
  }
  return {
    password: fieldErrors.password?.[0] ?? null,
    confirmPassword: fieldErrors.confirmPassword?.[0] ?? null,
  };
}

function mapApiError(error: ApiError): ResetPasswordErrorVm {
  if (error.status === 429 || error.code === "rate_limited") {
    return {
      reason: "network_error",
      message: "Too many requests. Please wait a moment and try again.",
    };
  }

  if (error.status === 400 && error.code === "weak_password") {
    return {
      reason: "weak_password",
      message: "Password doesn't meet the requirements. Please choose a stronger password.",
    };
  }

  if (error.status === 401 && error.code === "unauthorized") {
    return {
      reason: "recovery_invalid",
      message: INVALID_RECOVERY_MESSAGE,
    };
  }

  if (error.status === 400 && error.code === "recovery_invalid") {
    return {
      reason: "recovery_invalid",
      message: INVALID_RECOVERY_MESSAGE,
    };
  }

  return {
    reason: "unknown_error",
    message: "Could not update password. Please try again.",
  };
}

function getRecoveryParams() {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      refreshToken: null,
      code: null,
      type: null,
      context: DEFAULT_CONTEXT,
    };
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = queryParams.get("code");
  const type = hashParams.get("type") || queryParams.get("type");

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
  };
}

export function useResetPassword() {
  const [form, setFormState] = React.useState<ResetPasswordFormValues>(DEFAULT_FORM);
  const [fieldErrors, setFieldErrors] = React.useState<ResetPasswordFieldErrors>(() => validateForm(DEFAULT_FORM));
  const [submitting, setSubmitting] = React.useState(false);
  const [step, setStep] = React.useState<ResetPasswordViewModel["step"]>("form");
  const [recoveryStatus, setRecoveryStatus] = React.useState<RecoveryStatusVm>("checking");
  const [recoveryContext, setRecoveryContext] = React.useState<RecoveryContextVm>(DEFAULT_CONTEXT);
  const [errorSummary, setErrorSummary] = React.useState<ResetPasswordViewModel["errorSummary"]>(null);

  const setForm = React.useCallback((next: ResetPasswordFormValues) => {
    setFormState(next);
    setFieldErrors(validateForm(next));
    setErrorSummary(null);
  }, []);

  const initializeRecovery = React.useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    setRecoveryStatus("checking");
    setErrorSummary(null);

    const { accessToken, refreshToken, code, type, context } = getRecoveryParams();
    setRecoveryContext(context);

    if (type && type !== "recovery") {
      setRecoveryStatus("invalid");
      setErrorSummary({
        reason: "recovery_invalid",
        message: INVALID_RECOVERY_MESSAGE,
      });
      return;
    }

    if (code || (accessToken && refreshToken)) {
      setRecoveryStatus("ready");
      return;
    }

    setRecoveryStatus("missing");
    setErrorSummary({
      reason: "recovery_missing",
      message: INVALID_RECOVERY_MESSAGE,
    });
  }, []);

  const submit = React.useCallback(
    async (values: ResetPasswordFormValues) => {
      if (submitting) {
        return;
      }

      if (recoveryStatus !== "ready") {
        setErrorSummary({
          reason: recoveryStatus === "missing" ? "recovery_missing" : "recovery_invalid",
          message: INVALID_RECOVERY_MESSAGE,
        });
        return;
      }

      const nextErrors = validateForm(values);
      setFieldErrors(nextErrors);
      if (nextErrors.password || nextErrors.confirmPassword) {
        setErrorSummary({
          reason: "unknown_error",
          message: "Please fix the highlighted fields.",
        });
        return;
      }

      setSubmitting(true);
      setErrorSummary(null);

      try {
        const { accessToken, refreshToken, code } = getRecoveryParams();
        await fetchJson<{ ok: true }>("/api/auth/update-password", {
          method: "POST",
          body: JSON.stringify({
            password: values.password,
            confirmPassword: values.confirmPassword,
            accessToken,
            refreshToken,
            code,
          }),
        });
        setStep("success");
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

          const mapped = mapApiError(error);
          setErrorSummary(mapped);
          if (mapped.reason === "recovery_invalid") {
            setRecoveryStatus("invalid");
          }
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
    [recoveryStatus, submitting]
  );

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
  };
}
