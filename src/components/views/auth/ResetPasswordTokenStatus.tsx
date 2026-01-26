import * as React from "react";

import type { RecoveryStatusVm } from "./reset-password.types";

interface ResetPasswordTokenStatusProps {
  status: RecoveryStatusVm;
}

export function ResetPasswordTokenStatus({ status }: ResetPasswordTokenStatusProps) {
  const copy =
    status === "checking"
      ? "Validating reset link..."
      : status === "ready"
        ? "Link verified."
        : status === "missing"
          ? "Reset link missing."
          : "Reset link invalid or expired.";

  return <p className="text-xs text-slate-500">{copy}</p>;
}
