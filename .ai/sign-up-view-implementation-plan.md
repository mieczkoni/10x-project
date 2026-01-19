# View Implementation Plan — Signup

## 1. Overview
The **Signup** view allows a new user to create an account using **email + password**. On success, it should:

- Establish an authenticated session (Supabase Auth)
- Emit telemetry event **`signup`** with the created **user id**
- Redirect the user to the **generate-first onboarding flow** (default: `/dashboard/generate`, unless a safe `returnTo` is provided)

The view must provide **inline validation** (email, password, confirm password), accessible error messaging, and user-safe error copy (avoid account enumeration).

## 2. View Routing
- **Path**: `/signup`
- **Page file**: `src/pages/signup.astro`
- **Rendered view**: `src/components/views/auth/SignupView.tsx` (loaded with `client:load`)

## 3. Component Structure
### High-level component tree

```
src/pages/signup.astro
└─ <Layout title="Create account">
   └─ <SignupView client:load />
      └─ <main>
         └─ <section> (card container)
            ├─ <SignupHeader />
            ├─ <SignupErrorSummary />
            ├─ <SignupForm />
            └─ <SignupLinks />
```

### Files to add
- `src/pages/signup.astro`
- `src/components/hooks/useSignup.ts`
- `src/components/views/auth/signup.types.ts`
- `src/components/views/auth/SignupView.tsx`
- `src/components/views/auth/SignupHeader.tsx`
- `src/components/views/auth/SignupErrorSummary.tsx`
- `src/components/views/auth/SignupForm.tsx`
- `src/components/views/auth/SignupLinks.tsx`

### Conventions to mirror
Use the existing login flow as the template:

- Form + validation logic inside hook (like `src/components/hooks/useLogin.ts`)
- Thin view component (like `src/components/views/auth/LoginView.tsx`)
- Presentational subcomponents for header/form/links
- Tailwind styling consistent with Login (same container layout and input classes)

## 4. Component Details
### `SignupView`
- **Purpose**: Compose the view shell and bind UI components to `useSignup()` state/actions.
- **Main elements**:
  - `<main class="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">`
  - `<section class="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">`
  - Child components: `SignupHeader`, `SignupErrorSummary`, `SignupForm`, `SignupLinks`
- **Handled events**:
  - On mount: call `ensureAnonymousOrRedirect()`
  - On form change: `setForm(next)`
  - On form submit: `submit(values)`
- **Validation conditions**: delegated to hook + `SignupForm` UX (touched + submitAttempted).
- **Types**:
  - `SignupFormValues`, `SignupFieldErrors`, `SignupErrorVm`, `SignupViewModel` from `signup.types.ts`
- **Props**: none

### `SignupHeader`
- **Purpose**: Provide title and short guidance.
- **Main elements**:
  - `<h1>`: “Create your account”
  - `<p>`: brief helper text (e.g., “Start by generating your first cards.”)
- **Handled events**: none
- **Validation conditions**: none
- **Types**: none
- **Props**: optional (if you want configurable copy), otherwise none

### `SignupErrorSummary`
- **Purpose**: A single accessible error region for submission-level failures.
- **Main elements**:
  - `<div role="alert" aria-live="polite">` when `error` exists
  - text derived from `SignupErrorVm.message`
- **Handled events**: none
- **Validation conditions**:
  - Render only when `error != null`
  - Must not reveal whether an email exists (avoid user enumeration)
- **Types**:
  - `SignupErrorVm`
- **Props**:
  - `error: SignupErrorVm | null`

### `SignupForm`
- **Purpose**: Render controlled inputs for `email`, `password`, `confirmPassword` and execute submit.
- **Main elements**:
  - `<form noValidate onSubmit>`
  - `Email` input:
    - `type="email"`, `inputMode="email"`, `autoComplete="email"`
  - `Password` input:
    - `type="password"`, `autoComplete="new-password"`
  - `Confirm password` input:
    - `type="password"`, `autoComplete="new-password"`
  - Inline field errors as `<p id="...-error" class="text-xs text-red-600">...`
  - Submit button:
    - Shadcn button `Button` from `src/components/ui/button.tsx`
    - Label: “Create account”; loading label: “Creating account...”
- **Handled events**:
  - `onChange` for each input → calls `props.onChange(next)`
  - `onBlur` → mark field as touched
  - `onSubmit` → `props.onSubmit(value)`
  - Focus management on submit attempt:
    - If email invalid → focus email
    - Else if password invalid → focus password
    - Else if confirm invalid → focus confirm
- **Validation conditions (client-side)**:
  - **Email**
    - required (trimmed non-empty)
    - max length \(<= 254\)
    - must match a basic email regex (same as `useLogin.ts`)
  - **Password**
    - required (non-empty)
    - do **not** enforce strict complexity unless required server-side; keep UI guidance mild
    - optional UX-only hint: “At least 6 characters” (Supabase default), but treat as *soft guidance* unless you confirm a hard rule
  - **Confirm password**
    - required
    - must exactly equal `password`
- **Types**:
  - `SignupFormValues`, `SignupFieldErrors`
- **Props (component interface)**:
  - `value: SignupFormValues`
  - `errors: SignupFieldErrors`
  - `submitting: boolean`
  - `submitLabel?: string` (default “Create account”)
  - `onChange: (next: SignupFormValues) => void`
  - `onSubmit: (values: SignupFormValues) => Promise<void>`

### `SignupLinks`
- **Purpose**: Secondary navigation (login link, optional terms/privacy).
- **Main elements**:
  - Link to `/login` (optionally preserve `returnTo` if present)
  - Terms/Privacy links (implementation depends on existing routes; if none exist yet, point to public landing section or placeholder)
- **Handled events**: link navigation only
- **Validation conditions**: none
- **Types**: none
- **Props**:
  - `loginHref?: string` (default `/login`)
  - `termsHref?: string`
  - `privacyHref?: string`

## 5. Types
Create `src/components/views/auth/signup.types.ts`.

### `SignupFormValues`
- **Purpose**: Controlled form state.
- **Shape**:
  - `email: string`
  - `password: string`
  - `confirmPassword: string`

### `SignupFieldErrors`
- **Purpose**: Per-field validation results (computed from `SignupFormValues`).
- **Shape**:
  - `email: string | null`
  - `password: string | null`
  - `confirmPassword: string | null`

### `SignupFailureReason`
- **Purpose**: Normalize error cases for UI messaging and testing.
- **Recommended union**:
  - `"rate_limited"`
  - `"network_error"`
  - `"email_not_allowed"` (if Supabase is configured to reject some domains/addresses)
  - `"weak_password"` (if Supabase returns a password policy error)
  - `"unknown_error"`

### `SignupErrorVm`
- **Purpose**: Submission-level error shown in the summary region.
- **Shape**:
  - `reason: SignupFailureReason`
  - `message: string`

### `SafeReturnToVm`
Mirror the existing login approach (`src/components/views/auth/login.types.ts`).
- **Shape**:
  - `raw: string | null`
  - `resolved: string` (safe, internal path only)

### `SignupViewModel`
- **Purpose**: Document the hook’s outward state shape (useful for tests and maintenance).
- **Shape**:
  - `form: SignupFormValues`
  - `errors: SignupFieldErrors`
  - `submitting: boolean`
  - `errorSummary: SignupErrorVm | null`
  - `returnTo: SafeReturnToVm`

## 6. State Management
Use a custom hook `src/components/hooks/useSignup.ts` (patterned after `useLogin`).

### State variables inside `useSignup`
- **`form: SignupFormValues`**: current input values
- **`fieldErrors: SignupFieldErrors`**: derived validation result (computed on each `setForm`)
- **`submitting: boolean`**: prevents double submission and disables inputs
- **`errorSummary: SignupErrorVm | null`**: submission-level failures
- **`returnTo: SafeReturnToVm`**: safe redirect target derived from `window.location.search`

### Core hook functions
- **`setForm(next: SignupFormValues)`**
  - updates `form`
  - recomputes `fieldErrors`
  - clears `errorSummary`
- **`ensureAnonymousOrRedirect()`**
  - calls `supabaseClient.auth.getSession()`
  - if already authenticated → `window.location.href = returnTo.resolved` (or onboarding target)
- **`submit(values: SignupFormValues)`**
  - early return if `submitting`
  - validate; if invalid:
    - set `fieldErrors`
    - set `errorSummary` = “Please fix the highlighted fields.”
    - return
  - normalize email (trim)
  - call Supabase sign-up
  - on success:
    - emit event `signup` via `createEvent(supabaseClient, userId, "signup", payload)`
    - redirect to onboarding target
  - on failure:
    - map Supabase error to `SignupErrorVm` (see Error Handling)
    - set `submitting=false`

### Redirect target logic (onboarding)
- **Default**: `/dashboard/generate` (fulfills “generate-first onboarding flow” requirement)
- **If `returnTo` exists and is safe**: use it (preserves user intent when signup was triggered from a guarded route)
- **Safety constraints** (same as login):
  - disallow absolute URLs (`http://`, `https://`, `//`)
  - disallow `/api`
  - allow only `/dashboard...` paths

## 7. API Integration
No REST endpoint is provided for signup in the frontend spec; this project uses **Supabase Auth** directly.

### Supabase Auth call
- **Client**: `supabaseClient` from `src/db/supabase.client.ts`
- **Call**: `supabaseClient.auth.signUp({ email, password })`
- **Frontend request shape**:
  - `{ email: string; password: string }`
- **Frontend success criteria**:
  - If `data.user` exists: consider account created
  - Prefer redirecting only when a usable session exists; however PRD says email verification is not required, so session should typically be present

### Telemetry event emission
- **Service**: `createEvent` from `src/lib/services/events.service.ts`
- **Event type**: `"signup"` from `EventType` union in `src/types.ts`
- **Required payload**: (recommended minimal)
  - `method: "password"`
  - `returnTo: string` (resolved)
  - `onboardingTarget: "/dashboard/generate"`
- **User id**:
  - Supabase user id cast to `UserId` (from `src/types.ts`)

## 8. User Interactions
- **Typing into fields**
  - Updates controlled state via `onChange`
  - Inline validation errors shown after the field is touched or after first submit attempt
- **Submit form**
  - If invalid: focus first invalid field + show error summary “Please fix the highlighted fields.”
  - If valid: disable inputs, show loading label on submit button
- **Already authenticated user opens `/signup`**
  - Immediately redirect (no UI flash beyond initial render)
- **Navigate to login**
  - User can click “Log in” link (optionally preserves `returnTo`)

## 9. Conditions and Validation
### UI-verified conditions (must)
- **Email**
  - `trim(email).length > 0`
  - `trim(email).length <= 254`
  - matches basic email regex (same as login)
- **Password**
  - `password.length > 0`
- **Confirm password**
  - `confirmPassword.length > 0`
  - `confirmPassword === password`

### API/server-side conditions (verify via error mapping)
Supabase may enforce policies that are not known at compile time; handle them without hardcoding strict UI rules:

- **Weak password / password policy**: map to actionable message (see Error Handling)
- **Rate-limited**: message should instruct waiting and retrying
- **Network failures**: message should instruct checking connection and retrying

## 10. Error Handling
### Principles
- Keep messages **user-friendly** and **non-enumerating** (avoid confirming whether an email is already registered).
- Prefer a single summary region for submission failures (`SignupErrorSummary`), plus inline validation for field issues.
- Do not throw; always reset `submitting` on failures.

### Suggested error mapping (`mapAuthErrorForSignup`)
Input: `{ status?: number; message?: string } | null` from Supabase error.

- **Rate limited**
  - Condition: `status === 429` or message contains `too many` / `rate`
  - Message: “Too many attempts. Please wait a moment and try again.”
- **Network error**
  - Condition: message contains `fetch` / `network` or request throws
  - Message: “Network error. Check your connection and try again.”
- **Weak password / policy error**
  - Condition: message contains `password` + `weak` / `policy` / `length`
  - Message: “Password doesn’t meet the requirements. Please choose a stronger password.”
- **Email not allowed / invalid signup**
  - Condition: message contains `email` + `not allowed` / `invalid`
  - Message: “Unable to create account with this email. Please try a different email.”
- **Unknown**
  - Message: “Could not create account. Please try again.”

### Edge case: `data.user` exists but session is null
Even though PRD states no email verification is required, deployments can differ.

- Recommended handling:
  - Emit `signup` event if `data.user` exists (account created)
  - Redirect to `/login` with a message banner (or show inline “Check your email to finish setup”) if session is missing
  - Document this as environment-dependent behavior

## 11. Implementation Steps
1. **Add route page** `src/pages/signup.astro` using `Layout` and mount `<SignupView client:load />`.
2. **Define types** in `src/components/views/auth/signup.types.ts` (form values, field errors, error VM, returnTo VM, view model).
3. **Implement hook** `src/components/hooks/useSignup.ts` by copying the `useLogin` structure:
   - email validation (same as login)
   - password + confirm password validation
   - safe `returnTo` resolution
   - `ensureAnonymousOrRedirect`
   - `submit` calling `supabaseClient.auth.signUp`
   - telemetry emission via `createEvent(..., "signup", ...)`
4. **Create presentational components** in `src/components/views/auth/`:
   - `SignupHeader.tsx`
   - `SignupErrorSummary.tsx`
   - `SignupLinks.tsx`
5. **Implement `SignupForm.tsx`**:
   - controlled inputs + touched state + submitAttempted
   - accessibility: `aria-invalid`, `aria-describedby`, error ids, focus-first-invalid on submit
   - disable inputs while submitting; disable submit when invalid
6. **Implement `SignupView.tsx`**:
   - wire `useSignup()` to form and components
   - call `ensureAnonymousOrRedirect()` in `useEffect`
7. **Redirect behavior**:
   - default onboarding target `/dashboard/generate`
   - if safe `returnTo` provided, prefer it
8. **Manual QA checklist**
   - invalid email → inline error and focused email on submit
   - confirm mismatch → inline error and focused confirm on submit
   - successful signup → redirects to onboarding route; event `signup` inserted
   - throttle/network simulation → correct summary message; form re-enabled
   - already logged-in user on `/signup` → redirects
