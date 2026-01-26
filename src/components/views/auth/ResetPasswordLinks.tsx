import * as React from "react";

interface ResetPasswordLinksProps {
  forgotHref?: string;
  loginHref?: string;
}

export function ResetPasswordLinks({ forgotHref = "/forgot-password", loginHref = "/login" }: ResetPasswordLinksProps) {
  return (
    <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <a
        className="w-fit underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        href={forgotHref}
      >
        Request a new link
      </a>
      <a
        className="w-fit font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        href={loginHref}
      >
        Log in
      </a>
    </div>
  );
}
