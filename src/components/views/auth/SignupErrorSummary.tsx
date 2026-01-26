import * as React from "react";

import type { SignupErrorVm } from "./signup.types";

interface SignupErrorSummaryProps {
  error: SignupErrorVm | null;
}

export function SignupErrorSummary({ error }: SignupErrorSummaryProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert" aria-live="polite">
      <p className="text-xs text-red-700">{error.message}</p>
    </div>
  );
}
