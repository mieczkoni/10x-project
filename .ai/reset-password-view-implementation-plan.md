# View Implementation Plan: Password Reset (Forgot Password + Reset Password)

## 1. Overview
This plan covers the full **password reset flow** required by PRD **US-003**:

- **Forgot Password** (`/forgot-password`): user requests a reset email without revealing whether the email exists.
- **Reset Password** (`/reset-password`): user lands from the email link, establishes a recovery session (token/code) and sets a new password. Expired/used/invalid tokens are handled with a safe error state.

Implementation should match existing auth patterns in this repo:
- React views + hooks under `src/components/views/auth/` and `src/components/hooks/`
- Client-side Supabase usage via `src/db/supabase.client.ts` (`supabaseClient`)
- Tailwind styling conventions used by `LoginView`/`SignupView` and forms (plain inputs + shadcn `Button`)
- Accessibility: field-level errors, focus management, `role="alert"` for banners, neutral messaging for account enumeration prevention.

## 2. View Routing
- **Forgot Password**
  - **Path**: `/forgot-password`
  - **Page entrypoint**: `src/pages/forgot-password.astro`
  - **React view**: `src/components/views/auth/ForgotPasswordView.tsx`
- **Reset Password**
  - **Path**: `/reset-password`
  - **Page entrypoint**: `src/pages/reset-password.astro`
  - **React view**: `src/components/views/auth/ResetPasswordView.tsx`

Notes:
- `LoginLinks.tsx` already links to `/forgot-password`. Implementing the pages above will activate this navigation.
- Do not add authenticated redirects on these pages; users may arrive while unauthenticated, and `/reset-password` must show an explicit “invalid/expired link” state rather than silently redirecting.

## 3. Component Structure
High-level tree (mirrors existing Login/Signup view structure):

```
forgot-password.astro
└─ <Layout title="Forgot password">
   └─ <ForgotPasswordView client:load />
      └─ <main>
         └─ <section>
            ├─ <ForgotPasswordHeader />
            ├─ <ForgotPasswordErrorSummary />
            ├─ (state: idle/submitting) <ForgotPasswordForm />
            ├─ (state: confirmed) <ForgotPasswordConfirmation />
            └─ <ForgotPasswordLinks />

reset-password.astro
└─ <Layout title="Reset password">
   └─ <ResetPasswordView client:load />
      └─ <main>
         └─ <section>
            ├─ <ResetPasswordHeader />
            ├─ <ResetPasswordErrorSummary />
            ├─ <ResetPasswordTokenStatus /> (optional small component)
            ├─ (state: ready/submitting) <ResetPasswordForm />
            ├─ (state: success) <ResetPasswordSuccess />
            └─ <ResetPasswordLinks />
```

## 4. Component Details

### `src/pages/forgot-password.astro`
- **Purpose**: Route shell for `/forgot-password`, mounts the React view in the standard `Layout`.
- **Main elements**: `<Layout>`, `<ForgotPasswordView client:load />`
- **Handled events**: none (delegated to React)
- **Validation**: none (delegated to React)
- **Types**: none
- **Props**: none

### `src/pages/reset-password.astro`
- **Purpose**: Route shell for `/reset-password`, mounts the React view in the standard `Layout`.
- **Main elements**: `<Layout>`, `<ResetPasswordView client:load />`
- **Handled events**: none (delegated to React)
- **Validation**: none (delegated to React)
- **Types**: none
- **Props**: none

---

### `ForgotPasswordView`
- **File**: `src/components/views/auth/ForgotPasswordView.tsx`
- **Purpose**: Full page view for requesting password reset email, with privacy-preserving confirmation state.
- **Main elements**:
  - `<main className="mx-auto ... max-w-md ...">`
  - `<section className="... border ... bg-white p-6">`
  - Children: header, error summary, either form or confirmation, links
- **Handled events**:
  - On mount: `ensureAnonymousOrRedirect()` (optional; recommended to align with Login/Signup behavior—if user already has a session, send them to `/dashboard`)
  - Form change: `setForm(next)`
  - Form submit: `submit(values)`
  - “Try again” (if implemented): `reset()` to return from confirmation → idle
- **Validation conditions** (client-side):
  - Email required
  - Email trimmed
  - Email length \(\le 254\)
  - Basic email format regex (same as `useLogin` / `useSignup`)
  - **Privacy rule**: after submission, confirmation UI must not reveal whether the email exists
- **Types**:
  - `ForgotPasswordFormValues`, `ForgotPasswordFieldErrors`, `ForgotPasswordErrorVm`, `ForgotPasswordViewModel`
- **Props**: none

### `ForgotPasswordHeader`
- **File**: `src/components/views/auth/ForgotPasswordHeader.tsx`
- **Purpose**: Displays title and short instructions.
- **Main elements**: `<h1>`, optional `<p>` copy
- **Handled events**: none
- **Validation**: none
- **Types**: none
- **Props**: none

### `ForgotPasswordErrorSummary`
- **File**: `src/components/views/auth/ForgotPasswordErrorSummary.tsx`
- **Purpose**: Banner for non-field errors (network/rate-limit/unknown). Must not reveal account existence.
- **Main elements**:
  - `<div role="alert" aria-live="assertive">` with message text
- **Handled events**: none
- **Validation**: none
- **Types**: `ForgotPasswordErrorVm`
- **Props**:
  - `error: ForgotPasswordErrorVm | null`

### `ForgotPasswordForm`
- **File**: `src/components/views/auth/ForgotPasswordForm.tsx`
- **Purpose**: Email input + submit button; focus management like `LoginForm`/`SignupForm`.
- **Main elements**:
  - `<form noValidate>`
  - `<label>Email</label>`, `<input type="email" autoComplete="email">`
  - `<Button type="submit" size="lg" className="w-full">`
- **Handled events**:
  - `onChange` for email
  - `onBlur` to mark touched
  - `onSubmit` prevent default → call parent handler
- **Validation conditions**:
  - Disable submit when `submitting` OR `!isValid`
  - Show field errors when touched or submit attempted
  - If submit attempted and invalid, focus the first invalid field (email)
- **Types**:
  - `ForgotPasswordFormValues`, `ForgotPasswordFieldErrors`
- **Props**:
  - `value: ForgotPasswordFormValues`
  - `errors: ForgotPasswordFieldErrors`
  - `submitting: boolean`
  - `submitLabel?: string` (default: `"Send reset link"`)
  - `onChange(next: ForgotPasswordFormValues): void`
  - `onSubmit(values: ForgotPasswordFormValues): Promise<void>`

### `ForgotPasswordConfirmation`
- **File**: `src/components/views/auth/ForgotPasswordConfirmation.tsx`
- **Purpose**: Neutral confirmation state shown after submit, regardless of email existence (anti-enumeration).
- **Main elements**:
  - Text block: “If an account exists for this email, you’ll receive a reset link shortly.”
  - Optional secondary action: “Resend” or “Try a different email”
- **Handled events**:
  - Optional: “Try different email” → `onReset()` (parent sets state back to idle and clears form errors)
- **Validation conditions**:
  - Must never display server errors that imply “email not found”
- **Types**: optional `ForgotPasswordConfirmationVm`
- **Props**:
  - Optional: `emailHint?: string` (safe: echo the submitted email only if desired; still doesn’t reveal existence)
  - Optional: `onReset?: () => void`

### `ForgotPasswordLinks`
- **File**: `src/components/views/auth/ForgotPasswordLinks.tsx`
- **Purpose**: Navigation back to login / signup.
- **Main elements**: `<a href="/login">Log in</a>`, `<a href="/signup">Create account</a>`
- **Handled events**: none
- **Validation**: none
- **Types**: none
- **Props**: optional href overrides

---

### `ResetPasswordView`
- **File**: `src/components/views/auth/ResetPasswordView.tsx`
- **Purpose**: Handles recovery token/session initialization and renders the new password form. Shows explicit invalid/expired token UI.
- **Main elements**: same `<main>` + `<section>` wrapper as Login/Signup for consistency.
- **Handled events**:
  - On mount: `initializeRecovery()` (establish session from URL hash/query or existing session)
  - Form change: `setForm(next)`
  - Form submit: `submit(values)` (update password)
  - Success action: `goToDashboard()` / `goToLogin()` (depending on desired UX)
- **Validation conditions**:
  - Password required
  - Password minimum length (recommend: 8; align with auth spec and security intent)
  - Confirm password required and must match
  - Must not allow submit until recovery session is established OR a valid token has been successfully exchanged/set
- **Types**:
  - `ResetPasswordFormValues`, `ResetPasswordFieldErrors`, `ResetPasswordErrorVm`, `ResetPasswordViewModel`
  - `RecoveryContextVm` and `RecoveryStatusVm` (see Types section)
- **Props**: none

### `ResetPasswordHeader`
- **File**: `src/components/views/auth/ResetPasswordHeader.tsx`
- **Purpose**: Title and short copy.
- **Main elements**: `<h1>Reset password</h1>`, optional `<p>`
- **Handled events**: none
- **Validation**: none
- **Types**: none
- **Props**: none

### `ResetPasswordErrorSummary`
- **File**: `src/components/views/auth/ResetPasswordErrorSummary.tsx`
- **Purpose**: Error banner for invalid/expired tokens, weak password, network errors.
- **Main elements**: `role="alert"` banner (same style as `LoginErrorSummary`)
- **Handled events**: none
- **Validation**: none
- **Types**: `ResetPasswordErrorVm`
- **Props**:
  - `error: ResetPasswordErrorVm | null`

### `ResetPasswordTokenStatus` (optional but recommended)
- **File**: `src/components/views/auth/ResetPasswordTokenStatus.tsx`
- **Purpose**: Small status row that helps the user understand what’s happening during init (e.g., “Validating link…”, “Link valid”, “Link expired”).
- **Main elements**: `<p className="text-xs ...">`
- **Handled events**: none
- **Validation**: none
- **Types**: `RecoveryStatusVm`
- **Props**:
  - `status: RecoveryStatusVm`

### `ResetPasswordForm`
- **File**: `src/components/views/auth/ResetPasswordForm.tsx`
- **Purpose**: New password + confirm password form; focus management like `SignupForm`.
- **Main elements**:
  - `<form noValidate>`
  - Password input (`autoComplete="new-password"`)
  - Confirm password input
  - Submit `<Button>`
- **Handled events**:
  - Input change/blur
  - Submit
- **Validation conditions**:
  - Disable submit when:
    - `submitting` is true
    - any field error exists
    - recovery is not ready (`recoveryStatus !== "ready"`)
  - Focus first invalid field after submit attempt
- **Types**:
  - `ResetPasswordFormValues`, `ResetPasswordFieldErrors`
- **Props**:
  - `value: ResetPasswordFormValues`
  - `errors: ResetPasswordFieldErrors`
  - `submitting: boolean`
  - `disabledReason?: string` (optional helper text when not ready)
  - `recoveryReady: boolean` (or `recoveryStatus: RecoveryStatusVm`)
  - `onChange(next: ResetPasswordFormValues): void`
  - `onSubmit(values: ResetPasswordFormValues): Promise<void>`

### `ResetPasswordSuccess`
- **File**: `src/components/views/auth/ResetPasswordSuccess.tsx`
- **Purpose**: Success state after password update.
- **Main elements**:
  - Confirmation copy
  - Primary CTA button: “Go to dashboard”
  - Secondary link: “Log in” (optional)
- **Handled events**:
  - `onGoToDashboard`, optional `onGoToLogin`
- **Validation**: none
- **Types**: none
- **Props**:
  - `onGoToDashboard(): void`
  - Optional: `onGoToLogin(): void`

### `ResetPasswordLinks`
- **File**: `src/components/views/auth/ResetPasswordLinks.tsx`
- **Purpose**: Link back to `/forgot-password` for invalid/expired token cases; optional link to `/login`.
- **Main elements**: anchors
- **Handled events**: none
- **Validation**: none
- **Types**: none
- **Props**: optional href overrides

## 5. Types
Create types next to existing auth types:
- `src/components/views/auth/forgot-password.types.ts`
- `src/components/views/auth/reset-password.types.ts`

### Forgot Password types (`forgot-password.types.ts`)

```ts
export type ForgotPasswordFormValues = {
  email: string
}

export type ForgotPasswordFieldErrors = {
  email: string | null
}

export type ForgotPasswordFailureReason =
  | "rate_limited"
  | "network_error"
  | "unknown_error"

export type ForgotPasswordErrorVm = {
  reason: ForgotPasswordFailureReason
  message: string
}

export type ForgotPasswordStatusVm = "idle" | "submitting" | "confirmed"

export type ForgotPasswordViewModel = {
  form: ForgotPasswordFormValues
  errors: ForgotPasswordFieldErrors
  submitting: boolean
  status: ForgotPasswordStatusVm
  errorSummary: ForgotPasswordErrorVm | null
}
```

Notes:
- No “email_not_found” or similar reason; the UI must not model (or render) account existence.

### Reset Password types (`reset-password.types.ts`)

```ts
export type ResetPasswordFormValues = {
  password: string
  confirmPassword: string
}

export type ResetPasswordFieldErrors = {
  password: string | null
  confirmPassword: string | null
}

export type RecoveryContextVm = {
  // Presence-only flags + safe metadata. Avoid logging tokens.
  hasHashAccessToken: boolean
  hasHashRefreshToken: boolean
  hasQueryCode: boolean
  type: string | null // e.g. "recovery"
}

export type RecoveryStatusVm =
  | "checking" // initial load; detecting tokens/session
  | "ready" // session established; allow password change
  | "missing" // no token/code and no session
  | "invalid" // token/code rejected or expired/used

export type ResetPasswordFailureReason =
  | "recovery_missing"
  | "recovery_invalid"
  | "weak_password"
  | "network_error"
  | "unknown_error"

export type ResetPasswordErrorVm = {
  reason: ResetPasswordFailureReason
  message: string
}

export type ResetPasswordStepVm = "form" | "success"

export type ResetPasswordViewModel = {
  form: ResetPasswordFormValues
  errors: ResetPasswordFieldErrors
  submitting: boolean
  step: ResetPasswordStepVm
  recoveryStatus: RecoveryStatusVm
  recoveryContext: RecoveryContextVm
  errorSummary: ResetPasswordErrorVm | null
}
```

## 6. State Management
Implement two hooks aligned with existing patterns (see `useLogin`, `useSignup`):

### `useForgotPassword`
- **File**: `src/components/hooks/useForgotPassword.ts`
- **State**:
  - `form: ForgotPasswordFormValues`
  - `errors: ForgotPasswordFieldErrors`
  - `submitting: boolean`
  - `status: "idle" | "confirmed"`
  - `errorSummary: ForgotPasswordErrorVm | null`
- **Key functions**:
  - `setForm(next)` updates form and re-validates (clears summary)
  - `ensureAnonymousOrRedirect()` optional: if session exists → redirect `/dashboard`
  - `submit(values)`:
    - validate email; if invalid → set summary “Please fix the highlighted fields.”
    - call Supabase reset request
    - always transition to `confirmed` on completion (success or non-critical error), except for clear infra errors where you still may show a banner (network/rate limit), but confirmation message remains privacy-safe
  - optional `reset()` to return to idle state

### `useResetPassword`
- **File**: `src/components/hooks/useResetPassword.ts`
- **State**:
  - `form`, `errors`, `submitting`, `errorSummary`, `step`
  - `recoveryStatus` and `recoveryContext`
- **Key functions**:
  - `initializeRecovery()`:
    - `recoveryStatus="checking"`
    - Try to detect an existing session: `supabaseClient.auth.getSession()`
    - If no session, attempt to establish from URL:
      - Preferred: `supabaseClient.auth.getSessionFromUrl({ storeSession: true })` if available in the installed Supabase SDK
      - If not available or fails, parse:
        - URL hash for `access_token`, `refresh_token`, `type`
        - URL query for `code`
      - If `code` exists and SDK supports it: `supabaseClient.auth.exchangeCodeForSession(code)`
      - If hash tokens exist: `supabaseClient.auth.setSession({ access_token, refresh_token })`
    - If established → `recoveryStatus="ready"`
    - If missing → `recoveryStatus="missing"` and set banner message instructing to request a new link
    - If rejected → `recoveryStatus="invalid"` and set banner message + link to `/forgot-password`
  - `setForm(next)` updates form + validates
  - `submit(values)`:
    - guard: if `recoveryStatus !== "ready"` return early and show error summary
    - validate password + confirm
    - call `supabaseClient.auth.updateUser({ password })`
    - map weak password errors to `weak_password`
    - on success: `step="success"` and optionally redirect to `/dashboard` (immediate) or provide button

## 7. API Integration
No REST endpoint is provided for this view in the prompt; integrate directly with Supabase Auth using the existing `supabaseClient`.

### Forgot Password (request reset email)
- **Call**: `supabaseClient.auth.resetPasswordForEmail(email, { redirectTo })`
- **Redirect URL**:
  - `redirectTo = \`\${window.location.origin}/reset-password\``
  - Ensure this origin/redirect is allowed in Supabase Auth settings.
- **Request “type”**:
  - Email string (trimmed)
- **Response handling**:
  - Supabase returns `{ data, error }`
  - UI should transition to neutral confirmation even if `error` occurs (to avoid enumeration). For infra-type errors (network/rate limit), you may still display a generic banner like “Something went wrong. Try again in a moment.” without implying existence.

### Reset Password (establish recovery + update password)
- **Establish recovery session** (one of these depending on SDK/flow):
  - `supabaseClient.auth.getSessionFromUrl({ storeSession: true })` (preferred when available)
  - `supabaseClient.auth.exchangeCodeForSession(code)` (code-based)
  - `supabaseClient.auth.setSession({ access_token, refresh_token })` (hash token-based)
- **Update password**:
  - `supabaseClient.auth.updateUser({ password: newPassword })`
- **Success behavior**:
  - The user should be able to reach authenticated pages after success (PRD: “set new password and login”).
  - Preferred UX: keep session and redirect to `/dashboard` (or `/dashboard/generate` if desired).

## 8. User Interactions

### Forgot Password
- **Enter email**
  - Inline validate on change/blur; show message below field when invalid
- **Submit**
  - Button shows loading text (e.g., “Sending…”)
  - After completion: show neutral confirmation state:
    - “If an account exists for this email, you’ll receive a reset link shortly.”
- **Navigate**
  - Links to `/login` and `/signup`

### Reset Password
- **Land on page from email**
  - Show “Validating link…” state while `initializeRecovery()` runs
- **If link valid**
  - Display password + confirm fields and allow submit
- **If link missing tokens**
  - Show banner: “This password reset link is invalid or has expired. Please request a new one.”
  - Provide link to `/forgot-password`
- **Submit new password**
  - On success: show success state and CTA to dashboard (or redirect automatically)

## 9. Conditions and Validation

### Client-side validation (all must be enforced at component level)
- **Email**
  - Required, trimmed
  - \(\le 254\) chars
  - Basic email regex
- **New password**
  - Required
  - Recommend minimum length: 8 (match security intent; show copy beneath field)
- **Confirm password**
  - Required
  - Must match password exactly

### Interface state constraints (based on auth requirements)
- **Forgot Password privacy**
  - UI must not branch on “user exists” outcomes.
  - Never show “email not found” or similar messaging.
- **Reset Password token/session**
  - Only allow update password when recovery session is established (`recoveryStatus === "ready"`).
  - If token invalid/expired/used → disable form and render error + link back to `/forgot-password`.

## 10. Error Handling

### Forgot Password error scenarios
- **Network error**: show banner “Network error. Check your connection and try again.”; still show neutral confirmation state after submit to preserve privacy.
- **Rate limited**: show banner “Too many requests. Please wait a moment and try again.”; still keep neutral confirmation copy.
- **Unknown**: show banner “Something went wrong. Please try again.”

### Reset Password error scenarios
- **Missing token/code and no session**:
  - `recoveryStatus="missing"`
  - Banner: “This password reset link is invalid or has expired. Please request a new one.”
- **Expired/used/invalid token**:
  - `recoveryStatus="invalid"`
  - Same banner + CTA to `/forgot-password`
- **Weak password**:
  - Map Supabase error message containing `weak`, `policy`, `length` to `weak_password`
  - Banner: “Password doesn't meet the requirements. Please choose a stronger password.”
- **Network**:
  - Banner: “Network error. Check your connection and try again.”
- **Unknown**:
  - Banner: “Could not update password. Please try again.”

Security notes:
- Do not log or store recovery tokens in state beyond presence flags.
- Do not display raw Supabase error messages to users.

## 11. Implementation Steps
1. **Add Astro route shells**
   - Create `src/pages/forgot-password.astro` (mount `ForgotPasswordView` in `Layout`)
   - Create `src/pages/reset-password.astro` (mount `ResetPasswordView` in `Layout`)
2. **Add type files**
   - `src/components/views/auth/forgot-password.types.ts`
   - `src/components/views/auth/reset-password.types.ts`
3. **Implement hooks**
   - `src/components/hooks/useForgotPassword.ts`
     - email validation (copy from `useLogin`/`useSignup`)
     - submit calls `supabaseClient.auth.resetPasswordForEmail(...)`
     - neutral confirmation state
   - `src/components/hooks/useResetPassword.ts`
     - `initializeRecovery()` handling session-from-URL (hash/code) + explicit missing/invalid states
     - submit calls `supabaseClient.auth.updateUser({ password })`
4. **Implement Forgot Password view components**
   - `ForgotPasswordView.tsx`, `ForgotPasswordHeader.tsx`, `ForgotPasswordErrorSummary.tsx`, `ForgotPasswordForm.tsx`, `ForgotPasswordConfirmation.tsx`, `ForgotPasswordLinks.tsx`
   - Reuse the same layout classes and accessibility patterns from `LoginView`/`LoginForm`
5. **Implement Reset Password view components**
   - `ResetPasswordView.tsx`, `ResetPasswordHeader.tsx`, `ResetPasswordErrorSummary.tsx`, `ResetPasswordForm.tsx`, `ResetPasswordSuccess.tsx`, `ResetPasswordLinks.tsx`
   - Optional: `ResetPasswordTokenStatus.tsx` to show init progress and improve UX
6. **Wire redirects after success**
   - On password update success, either:
     - Redirect immediately: `window.location.href = "/dashboard"`
     - Or show success panel with CTA button that navigates to `/dashboard`
7. **Manual verification checklist**
   - From `/login`, click “Forgot password?” → `/forgot-password` loads
   - Submit invalid email → field error shown
   - Submit valid email → confirmation shown (same regardless of account existence)
   - Click reset link from email → `/reset-password` initializes recovery
   - With valid link: password can be updated and user can access `/dashboard`
   - With expired/used link: explicit error and link back to `/forgot-password`
