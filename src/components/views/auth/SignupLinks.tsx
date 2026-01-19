import * as React from "react"

type SignupLinksProps = {
  loginHref?: string
  termsHref?: string
  privacyHref?: string
}

export function SignupLinks({ loginHref = "/login", termsHref, privacyHref }: SignupLinksProps) {
  const showPolicies = Boolean(termsHref || privacyHref)

  return (
    <div className="flex flex-col gap-2 text-sm text-slate-600">
      <a
        className="w-fit font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        href={loginHref}
      >
        Log in
      </a>
      {showPolicies ? (
        <p className="text-xs text-slate-500">
          By creating an account, you agree to our{" "}
          {termsHref ? (
            <a
              className="font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              href={termsHref}
            >
              Terms
            </a>
          ) : (
            "Terms"
          )}
          {privacyHref ? (
            <>
              {" "}
              and{" "}
              <a
                className="font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                href={privacyHref}
              >
                Privacy Policy
              </a>
            </>
          ) : (
            " and Privacy Policy"
          )}
          .
        </p>
      ) : null}
    </div>
  )
}
