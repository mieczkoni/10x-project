import * as React from "react";

import { Button } from "@/components/ui/button";

import type { ResetPasswordFieldErrors, ResetPasswordFormValues } from "./reset-password.types";

export interface ResetPasswordFormProps {
  value: ResetPasswordFormValues;
  errors: ResetPasswordFieldErrors;
  submitting: boolean;
  recoveryReady: boolean;
  disabledReason?: string;
  onChange: (next: ResetPasswordFormValues) => void;
  onSubmit: (values: ResetPasswordFormValues) => Promise<void>;
}

export function ResetPasswordForm({
  value,
  errors,
  submitting,
  recoveryReady,
  disabledReason,
  onChange,
  onSubmit,
}: ResetPasswordFormProps) {
  const passwordId = React.useId();
  const confirmPasswordId = React.useId();
  const passwordErrorId = `${passwordId}-error`;
  const confirmPasswordErrorId = `${confirmPasswordId}-error`;
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmPasswordRef = React.useRef<HTMLInputElement>(null);
  const [touched, setTouched] = React.useState({ password: false, confirmPassword: false });
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const showPasswordError = Boolean((touched.password || submitAttempted) && errors.password);
  const showConfirmError = Boolean((touched.confirmPassword || submitAttempted) && errors.confirmPassword);
  const isValid = !errors.password && !errors.confirmPassword;
  const isDisabled = submitting || !isValid || !recoveryReady;

  React.useEffect(() => {
    if (!submitAttempted) {
      return;
    }
    if (errors.password && passwordRef.current) {
      passwordRef.current.focus();
      return;
    }
    if (errors.confirmPassword && confirmPasswordRef.current) {
      confirmPasswordRef.current.focus();
    }
  }, [errors.confirmPassword, errors.password, submitAttempted]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) {
        return;
      }
      setSubmitAttempted(true);
      await onSubmit(value);
    },
    [onSubmit, submitting, value]
  );

  const handlePasswordChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, password: event.target.value });
    },
    [onChange, value]
  );

  const handleConfirmPasswordChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, confirmPassword: event.target.value });
    },
    [onChange, value]
  );

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600" htmlFor={passwordId}>
          New password
        </label>
        <input
          ref={passwordRef}
          id={passwordId}
          type="password"
          autoComplete="new-password"
          className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
          value={value.password}
          onChange={handlePasswordChange}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          aria-invalid={showPasswordError}
          aria-describedby={showPasswordError ? passwordErrorId : undefined}
          disabled={submitting || !recoveryReady}
          required
        />
        <p className="text-xs text-slate-500">At least 8 characters.</p>
        {showPasswordError ? (
          <p id={passwordErrorId} className="text-xs text-red-600">
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600" htmlFor={confirmPasswordId}>
          Confirm password
        </label>
        <input
          ref={confirmPasswordRef}
          id={confirmPasswordId}
          type="password"
          autoComplete="new-password"
          className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
          value={value.confirmPassword}
          onChange={handleConfirmPasswordChange}
          onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
          aria-invalid={showConfirmError}
          aria-describedby={showConfirmError ? confirmPasswordErrorId : undefined}
          disabled={submitting || !recoveryReady}
          required
        />
        {showConfirmError ? (
          <p id={confirmPasswordErrorId} className="text-xs text-red-600">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      {disabledReason && !recoveryReady ? <p className="text-xs text-slate-500">{disabledReason}</p> : null}

      <Button type="submit" disabled={isDisabled} className="w-full" size="lg">
        {submitting ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
