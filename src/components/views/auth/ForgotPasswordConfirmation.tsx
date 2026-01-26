import * as React from "react";

import { Button } from "@/components/ui/button";

interface ForgotPasswordConfirmationProps {
  emailHint?: string;
  onReset?: () => void;
}

export function ForgotPasswordConfirmation({ emailHint, onReset }: ForgotPasswordConfirmationProps) {
  const normalizedHint = emailHint?.trim();
  const hasHint = Boolean(normalizedHint);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        {hasHint
          ? `If an account exists for ${normalizedHint}, you’ll receive a reset link shortly.`
          : "If an account exists for this email, you’ll receive a reset link shortly."}
      </p>
      <p className="text-xs text-slate-500">Check your spam folder if you don’t see the email within a few minutes.</p>
      {onReset ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onReset}>
          Try a different email
        </Button>
      ) : null}
    </div>
  );
}
