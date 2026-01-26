import * as React from "react";

interface LoginHeaderProps {
  title?: string;
  subtitle?: string;
}

export function LoginHeader({
  title = "Log in",
  subtitle = "Welcome back. Enter your details to continue.",
}: LoginHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600">{subtitle}</p>
    </header>
  );
}
