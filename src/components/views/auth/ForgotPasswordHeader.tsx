import * as React from "react";

interface ForgotPasswordHeaderProps {
  title?: string;
  subtitle?: string;
}

export function ForgotPasswordHeader({
  title = "Forgot password",
  subtitle = "Enter your email and we’ll send a reset link if an account exists.",
}: ForgotPasswordHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{subtitle}</p>
    </header>
  );
}
