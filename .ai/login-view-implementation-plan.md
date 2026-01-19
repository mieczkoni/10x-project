## View Implementation Plan: Login

## 1. Overview
The **Login** view authenticates an existing user via **email + password**. On success it redirects to the **Dashboard** and emits the `login` event. On failure it shows a **generic** error message (no field disclosure) and provides links to **Forgot password** and **Create account**.

## 2. View Routing
- **Route path**: `/login`
- **Expected redirects**
  - **Already authenticated user** → redirect to `/dashboard` (or `returnTo` if valid).
  - **Successful login** → redirect to `/dashboard` (or `returnTo` if valid).
  - **Protected routes** (outside this view) should redirect unauthenticated users to `/login?returnTo=<encoded path>` (pattern already used in the app via `401` handling in hooks).

## 3. Component Structure
High-level hierarchy (Astro page mounts a React view):

- `src/pages/login.astro`
  - `Layout` (existing)
    - `LoginView` (React, `client:load`)
      - `LoginHeader`
      - `LoginForm`
        - `EmailField`
        - `PasswordField`
        - `SubmitButton`
      - `LoginErrorSummary` (`aria-live`)
      - `LoginLinks` (Forgot password, Create account)

## 4. Component Details

### `src/pages/login.astro`
- **Description**: Route entry for `/login`; provides consistent document shell via `Layout`.
- **Main elements**
  - `<Layout title="Log in">`
  - `<LoginView client:load />`
- **Handled events**: none (delegated to React).
- **Validation conditions**: none.
- **Types**: none.
- **Props**
  - None (page reads query string in client via `window.location` in the React layer).

### `LoginView` (`src/components/views/auth/LoginView.tsx`)
- **Description**: Page-level container for the login screen. Owns the async submission state and decides redirect targets.
- **Main elements**
  - `<main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">`
  - Card-like wrapper `<section className="rounded-lg border border-slate-200 bg-white p-6">`
  - `LoginHeader`
  - `LoginForm`
  - `LoginErrorSummary` (placed above the form submit button or below header; must be near the top for screen readers)
  - `LoginLinks`
- **Handled events**
  - **On mount**: check current session; if authenticated, redirect to dashboard/return target.
  - **On submit**: call login action; manage loading and errors; redirect on success.
- **Validation conditions**
  - Enforces UI validation before attempting auth (see `LoginForm`).
  - Enforces safe redirect rules (see “Conditions and Validation”).
- **Types**
  - `LoginViewModel`
  - `LoginFormValues`, `LoginFieldErrors`
  - `AuthFailureReason`, `LoginErrorVm`
  - `SafeReturnToVm`
- **Props**
  - `initialEmail?: string` (optional future enhancement; not required for MVP)

### `LoginHeader` (`src/components/views/auth/LoginHeader.tsx`)
- **Description**: Title + supporting copy.
- **Main elements**
  - `<h1 className="text-2xl font-semibold text-slate-900">Log in</h1>`
  - `<p className="text-sm text-slate-600">Welcome back. Enter your details to continue.</p>`
- **Handled events**: none.
- **Validation conditions**: none.
- **Types**: none.
- **Props**
  - `title?: string`
  - `subtitle?: string`

### `LoginForm` (`src/components/views/auth/LoginForm.tsx`)
- **Description**: Controlled form UI for email/password, inline field errors, and submit.
- **Main elements**
  - `<form noValidate onSubmit={...}>`
  - Email `<input type="email" autoComplete="email" inputMode="email" />`
  - Password `<input type="password" autoComplete="current-password" />`
  - Submit `<Button type="submit" disabled={submitting || !isValid}>Log in</Button>`
  - Optional “show password” toggle (nice-to-have; not required)
- **Handled events**
  - `onChange` email/password → update local state + recompute validation
  - `onBlur` fields → show field-level validation (don’t spam errors while typing unless desired)
  - `onSubmit` → calls parent `onSubmit(values)`; prevents double submit while `submitting`
- **Validation conditions (client-side)**
  - **Email**
    - Required (non-empty after trim)
    - Must be syntactically valid email (basic RFC-ish check; rely on `<input type="email">` + fallback regex)
    - Max length: 254 (defensive; optional)
  - **Password**
    - Required (non-empty)
    - Min length not enforced unless backend does; keep permissive for MVP
  - **Form**
    - Disable submit if invalid or submitting
    - Generic server error must not specify whether email or password is wrong
- **Types**
  - `LoginFormValues`
  - `LoginFieldErrors`
  - `LoginFormProps`
- **Props (component interface)**
  - `value: LoginFormValues`
  - `errors: LoginFieldErrors`
  - `submitting: boolean`
  - `submitLabel?: string`
  - `onChange: (next: LoginFormValues) => void`
  - `onSubmit: (values: LoginFormValues) => Promise<void>`

### `LoginErrorSummary` (`src/components/views/auth/LoginErrorSummary.tsx`)
- **Description**: An accessible, non-field-specific error region for auth failures and rate-limit messaging.
- **Main elements**
  - `<div role="status" aria-live="polite">` for neutral updates
  - `<div role="alert" aria-live="assertive">` for errors (choose one; don’t nest alerts)
  - Message text with optional “Try again” guidance
- **Handled events**: none (pure UI).
- **Validation conditions**
  - Render only if `error != null`
  - Must never show “email not found” / “wrong password” distinctions
- **Types**
  - `LoginErrorVm`
- **Props**
  - `error: LoginErrorVm | null`

### `LoginLinks` (`src/components/views/auth/LoginLinks.tsx`)
- **Description**: Navigation aids.
- **Main elements**
  - `<a href="/forgot-password">Forgot password?</a>`
  - `<a href="/signup">Create account</a>`
  - Keep link text descriptive; ensure focus styles are visible
- **Handled events**: none.
- **Validation conditions**: none.
- **Types**: none.
- **Props**
  - `forgotHref?: string`
  - `signupHref?: string`

## 5. Types

### Existing types to use
- **`UserId`** (`src/types.ts`): alias used for event emission.
- **`EventType`** (`src/types.ts`): includes `"login"`.

### New DTOs / ViewModel types (to add near the Login view folder, e.g. `src/components/views/auth/login.types.ts`)

#### `LoginFormValues`
- **Purpose**: Controlled form values.
- **Fields**
  - `email: string`
  - `password: string`

#### `LoginFieldErrors`
- **Purpose**: Field-level validation errors (pre-submit).
- **Fields**
  - `email: string | null`
  - `password: string | null`

#### `AuthFailureReason`
- **Purpose**: Categorize errors for UX copy without leaking sensitive details.
- **Union values**
  - `"invalid_credentials"` (generic)
  - `"rate_limited"` (too many attempts / throttle)
  - `"network_error"`
  - `"unknown_error"`

#### `LoginErrorVm`
- **Purpose**: Renderable error state for `LoginErrorSummary`.
- **Fields**
  - `reason: AuthFailureReason`
  - `message: string` (already safe/generic, ready to display)

#### `SafeReturnToVm`
- **Purpose**: Prevent open-redirect vulnerabilities.
- **Fields**
  - `raw: string | null` (from `URLSearchParams.get("returnTo")`)
  - `resolved: string` (validated in-app path, default `/dashboard`)

#### `LoginViewModel`
- **Purpose**: Single state bundle for the view (optional; keeps `LoginView` tidy).
- **Fields**
  - `form: LoginFormValues`
  - `errors: LoginFieldErrors`
  - `submitting: boolean`
  - `errorSummary: LoginErrorVm | null`
  - `returnTo: SafeReturnToVm`

## 6. State Management
Implement with a dedicated hook to keep the view predictable and testable:

### `useLogin` (`src/components/hooks/useLogin.ts` or `src/components/views/auth/useLogin.ts`)
- **Responsibilities**
  - Own `LoginViewModel` state.
  - Provide `setField`, `validate`, and `submit` functions.
  - Normalize/categorize auth errors into `LoginErrorVm`.
  - Resolve `returnTo` safely.
  - Provide an `ensureAnonymousOrRedirect()` effect for “already logged in” behavior.
- **Suggested state variables**
  - `form: LoginFormValues`
  - `fieldErrors: LoginFieldErrors`
  - `submitting: boolean`
  - `errorSummary: LoginErrorVm | null`
  - `returnToResolved: string`

## 7. API Integration
No custom REST endpoint was provided for login. Use **Supabase Auth** directly from the browser and emit the login event via the existing `events` table helper.

### Auth call (Supabase)
- **Call**
  - `supabaseClient.auth.signInWithPassword({ email, password })`
- **Request type**
  - Supabase SDK type (inline object with `email: string`, `password: string`)
- **Response**
  - Supabase SDK `{ data: { user, session }, error }`
- **Frontend actions**
  - On success:
    - Emit event `login` (see below)
    - Redirect to `returnToResolved`
  - On error:
    - Map to `LoginErrorVm` and render `LoginErrorSummary`

### Event emission (DB insert through Supabase)
- **Call**
  - `createEvent(supabaseClient, user.id as UserId, "login", payload)`
- **Payload**
  - Minimal: `{ method: "password" }`
  - Optional: `{ method: "password", returnTo: returnToResolved }`
- **Failure policy**
  - Must **not** block login success redirect; `createEvent` already swallows errors and logs.

## 8. User Interactions
- **Enter email/password**
  - Updates controlled inputs.
  - Inline validation appears after blur (or immediately if the field is already “touched”).
- **Submit (click “Log in” or press Enter)**
  - If invalid: focus the first invalid field and show error summary region with generic “Please fix the highlighted fields.”
  - If valid: show loading state (disable inputs + button, optionally show spinner text “Logging in…”).
  - If success: redirect to dashboard/return target.
  - If failure: show generic error message (never “email not found”).
- **Forgot password**
  - Navigates to `/forgot-password`.
- **Create account**
  - Navigates to `/signup`.

## 9. Conditions and Validation

### UI-level conditions (form)
- **Email**
  - `trim(email).length > 0`
  - must satisfy basic email format check (use native input validity + fallback)
- **Password**
  - `password.length > 0`
- **Submit enabled**
  - Only when both fields valid and not submitting

### Redirect safety (`returnTo`)
Prevent open redirects by validating `returnTo` before using it:
- **Allowed**
  - Relative paths that start with `/dashboard` (recommended)
  - Optionally allow `/dashboard/...` and `/dashboard?x=y` variants
- **Rejected**
  - Absolute URLs (`http://`, `https://`)
  - Protocol-relative (`//evil.com`)
  - Any path not under the authenticated app area (e.g. `/api/*`)
- **Fallback**
  - Default to `/dashboard`

### Privacy/security constraints
- **Auth failure messaging**
  - Always use a single generic string, e.g. “Invalid email or password.”
- **Rate limit/throttling messaging**
  - Calm, actionable, non-technical: “Too many attempts. Please wait a moment and try again.”

## 10. Error Handling
- **Invalid credentials**
  - Show `LoginErrorVm { reason: "invalid_credentials", message: "Invalid email or password." }`
- **Rate limited / throttled**
  - Map Supabase error status/code (if available) to `reason: "rate_limited"`
  - Render message with guidance (wait + retry)
- **Network errors**
  - `reason: "network_error"` → “Network error. Check your connection and try again.”
- **Unexpected errors**
  - `reason: "unknown_error"` → “Login failed. Please try again.”
- **Double submit**
  - Prevent by guarding submit while `submitting === true`
- **Already authenticated**
  - Redirect away immediately to avoid showing the form unnecessarily

## 11. Implementation Steps
1. **Add the route page**: create `src/pages/login.astro` following existing page patterns (`Layout` + `<LoginView client:load />`).
2. **Create the view folder**: add `src/components/views/auth/` with `LoginView.tsx` and small child components (`LoginHeader`, `LoginForm`, `LoginErrorSummary`, `LoginLinks`) plus `login.types.ts`.
3. **Build the hook**: implement `useLogin` with:
   - controlled values, touched flags (optional), field validation
   - safe `returnTo` resolution
   - submit handler that calls `supabaseClient.auth.signInWithPassword`
4. **Emit login event**: after successful sign-in, call `createEvent(..., "login", ...)` and ignore failures.
5. **Implement redirects**:
   - on mount: if session exists, redirect to resolved return path
   - on success: redirect to resolved return path
6. **Accessibility pass**:
   - ensure labels, `aria-invalid`, and error text association (`aria-describedby`)
   - implement a single `aria-live` region for summary errors
   - keyboard navigation: Enter submits; focus first invalid input on validation failure
7. **Styling**:
   - match existing Tailwind patterns (`border-slate-200 bg-white rounded-lg`)
   - reuse `Button` from `src/components/ui/button.tsx`
   - style inputs consistently (either simple Tailwind classes or introduce `src/components/ui/input.tsx` if desired)
8. **Integrate with existing unauthorized behavior**:
   - ensure errors in existing hooks already redirect to `/login` on `401`
   - (optional enhancement) standardize protected-page redirects to include `returnTo`
