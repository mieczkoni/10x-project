import * as React from "react";

import { Button } from "@/components/ui/button";

import type { SignupFieldErrors, SignupFormValues } from "./signup.types";

export interface SignupFormProps {
  value: SignupFormValues;
  errors: SignupFieldErrors;
  submitting: boolean;
  submitLabel?: string;
  onChange: (next: SignupFormValues) => void;
  onSubmit: (values: SignupFormValues) => Promise<void>;
}

export function SignupForm({
  value,
  errors,
  submitting,
  submitLabel = "Create account",
  onChange,
  onSubmit,
}: SignupFormProps) {
  const emailId = React.useId();
  const passwordId = React.useId();
  const confirmPasswordId = React.useId();
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;
  const confirmPasswordErrorId = `${confirmPasswordId}-error`;
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmPasswordRef = React.useRef<HTMLInputElement>(null);
  const [touched, setTouched] = React.useState({
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const showEmailError = Boolean((touched.email || submitAttempted) && errors.email);
  const showPasswordError = Boolean((touched.password || submitAttempted) && errors.password);
  const showConfirmError = Boolean((touched.confirmPassword || submitAttempted) && errors.confirmPassword);
  const isValid = !errors.email && !errors.password && !errors.confirmPassword;

  React.useEffect(() => {
    if (!submitAttempted) {
      return;
    }
    if (errors.email && emailRef.current) {
      emailRef.current.focus();
      return;
    }
    if (errors.password && passwordRef.current) {
      passwordRef.current.focus();
      return;
    }
    if (errors.confirmPassword && confirmPasswordRef.current) {
      confirmPasswordRef.current.focus();
    }
  }, [errors.confirmPassword, errors.email, errors.password, submitAttempted]);

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

  const handleEmailChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, email: event.target.value });
    },
    [onChange, value]
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
        <label className="text-xs font-medium text-slate-600" htmlFor={emailId}>
          Email
        </label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          className="h-10 rounded-md border border-slate-200 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-50"
          value={value.email}
          onChange={handleEmailChange}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          aria-invalid={showEmailError}
          aria-describedby={showEmailError ? emailErrorId : undefined}
          disabled={submitting}
          required
        />
        {showEmailError ? (
          <p id={emailErrorId} className="text-xs text-red-600">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600" htmlFor={passwordId}>
          Password
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
          disabled={submitting}
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
          disabled={submitting}
          required
        />
        {showConfirmError ? (
          <p id={confirmPasswordErrorId} className="text-xs text-red-600">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={submitting || !isValid} className="w-full" size="lg">
        {submitting ? "Creating account..." : submitLabel}
      </Button>
    </form>
  );
}
