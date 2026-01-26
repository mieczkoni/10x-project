import * as React from "react";

import { Button } from "@/components/ui/button";

import type { ForgotPasswordFieldErrors, ForgotPasswordFormValues } from "./forgot-password.types";

export interface ForgotPasswordFormProps {
  value: ForgotPasswordFormValues;
  errors: ForgotPasswordFieldErrors;
  submitting: boolean;
  submitLabel?: string;
  onChange: (next: ForgotPasswordFormValues) => void;
  onSubmit: (values: ForgotPasswordFormValues) => Promise<void>;
}

export function ForgotPasswordForm({
  value,
  errors,
  submitting,
  submitLabel = "Send reset link",
  onChange,
  onSubmit,
}: ForgotPasswordFormProps) {
  const emailId = React.useId();
  const emailErrorId = `${emailId}-error`;
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [touched, setTouched] = React.useState({ email: false });
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const showEmailError = Boolean((touched.email || submitAttempted) && errors.email);
  const isValid = !errors.email;

  React.useEffect(() => {
    if (!submitAttempted) {
      return;
    }
    if (errors.email && emailRef.current) {
      emailRef.current.focus();
    }
  }, [errors.email, submitAttempted]);

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

      <Button type="submit" disabled={submitting || !isValid} className="w-full" size="lg">
        {submitting ? "Sending..." : submitLabel}
      </Button>
    </form>
  );
}
