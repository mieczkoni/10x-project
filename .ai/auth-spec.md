# Authentication & Account Access Specification (Astro + React + Supabase Auth)

This document specifies the architecture for **user registration, login, logout, and password recovery** for 10x-cards, aligned with:

- **PRD**: email/password auth, password reset required, **no email verification required for MVP**, prevent unauthenticated access to personal data, login throttling, GDPR deletion UX (future adjacent flow).
- **Stack**: Astro 5 (SSR, Node adapter), React 19 for interactive UI, TypeScript 5, Zod, Supabase (Postgres + Auth).
- **Compatibility constraint**: existing API endpoints already call `locals.supabase.auth.getUser()` and return `401` using `ApiErrors.unauthorized()`. The authentication system must make that work in production **without breaking existing dashboard behavior**.

---

## 1) High-level goals and constraints

### Goals
- Provide **sign-up**, **log-in**, **log-out**, and **password reset** flows using Supabase Auth.
- Ensure **SSR route protection** for authenticated areas (at least `/dashboard/*`) and preserve the public landing page.
- Ensure existing REST endpoints under `/api/*` continue to work with authenticated user context via `locals.supabase`.
- Provide consistent validation, error handling, and user-facing messaging.
- Emit telemetry events (`signup`, `login`) consistent with PRD FR-006.

### Non-goals (MVP)
- No email verification flow (Supabase project configuration should disable it for MVP).
- No social/OAuth providers.
- No multi-tenant org accounts, roles, or user profile management UI beyond auth basics.

---

## 2) Route map and access policy

### Public routes (unauthenticated allowed)
- `/` (public landing; remains unchanged)
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password` (reachable only from recovery link; may also be accessible directly but must handle missing/invalid token)

### Authenticated routes (require session)
- `/dashboard`
- `/dashboard/generate`
- `/dashboard/decks/:deckId`
- Any future settings / review routes under `/dashboard/*`

### Redirect behavior
- If **unauthenticated** user requests an authenticated route:
  - Redirect to `/login?next=<original_path>`
- If **authenticated** user requests `/login` or `/signup`:
  - Redirect to `/dashboard` (or `/dashboard/generate` if we enforce “generate-first” onboarding)

> Compatibility note: today, dashboard pages render React views and call `/api/*`. With proper session cookies, both SSR gating and API auth become reliable; without it, the app would appear broken in production (API returns 401).

---

## 3) USER INTERFACE ARCHITECTURE

### 3.1 Pages, layouts, and components (what changes where)

#### New Astro pages (route entrypoints)
Create these files under `src/pages/`:
- `login.astro`
- `signup.astro`
- `forgot-password.astro`
- `reset-password.astro`

Each page is responsible for:
- **SSR redirect rules** (already-authenticated redirects away; or missing reset tokens → show error)
- Providing static shell layout and SEO metadata
- Hydrating a single React view with `client:load`

#### New React “view” components
Create view components under `src/components/views/auth/`:
- `LoginView.tsx`
- `SignupView.tsx`
- `ForgotPasswordView.tsx`
- `ResetPasswordView.tsx`

Each view is responsible for:
- Rendering the form UI (Shadcn/ui-style inputs + buttons)
- Client-side form state and submission
- Mapping API errors to field-level errors and banners
- Navigating on success (using `window.location.assign(...)` or an app-level navigation helper)

#### Existing pages to extend (authenticated gating only)
Update the following Astro pages to enforce auth (SSR):
- `src/pages/dashboard/index.astro`
- `src/pages/dashboard/generate/index.astro`
- `src/pages/dashboard/decks/[deckId].astro`

They should:
- Check `Astro.locals.user` (see Middleware section) and redirect unauthenticated users to `/login?next=...`
- Keep rendering the existing React views unchanged in the authenticated case

#### Layout strategy (auth vs non-auth)
Current `src/layouts/Layout.astro` is a minimal wrapper and should remain compatible.

Add (or conceptually define) an `AuthLayout.astro` (optional) to keep auth pages visually consistent without changing dashboard UI:
- `AuthLayout.astro` can reuse `Layout.astro` but adds centered container, auth header/footer, and consistent spacing.

Add (optional) `DashboardLayout.astro` if you want top-level shell chrome (header/user menu) outside React, but **not required** for MVP since dashboard UI is already inside React views.

### 3.2 Separation of responsibilities (Astro vs React)

#### Astro pages (SSR boundary)
Astro should handle:
- **Access control redirects** before any React code runs
- Reading `next` query param and passing it to the React view (as props) for post-login redirect
- For `/reset-password`, performing initial token presence checks and passing tokens (if needed) to React view

Astro should NOT handle:
- Complex form state
- Inline field-level validation UX (React should)
- Calling Supabase SDK directly on the server from `.astro` pages (use API endpoints or middleware-injected server client patterns)

#### React views (interactive boundary)
React should handle:
- User input, field validation UX, and disabled/loading states
- Calling backend auth endpoints (`/api/auth/*`) via `fetchJson`
- Showing error banners and field errors
- Emitting client-side analytics only when required (server-side event emission is preferred for signup/login, see Backend)

### 3.3 Form validation rules and user-facing messages

Validation is performed in two layers:
- **Client-side (React)**: immediate feedback (basic rules)
- **Server-side (API)**: authoritative validation with Zod and safe error responses

#### Common fields
- **Email**
  - Required
  - Must be a valid email format
  - Error message:
    - “Email is required.”
    - “Enter a valid email address.”
- **Password**
  - Required
  - Minimum length: 8 (MVP baseline)
  - Recommended additional constraints (optional): at least 1 letter and 1 number; avoid enforcing too strict policies early if not required by PRD.
  - Error message:
    - “Password is required.”
    - “Password must be at least 8 characters.”
- **Confirm password** (signup + reset)
  - Must match `password`
  - Error message: “Passwords do not match.”

#### Login errors (security requirement)
Do not reveal which field is incorrect:
- Message: **“Invalid email or password.”**

#### Forgot password response (anti-enumeration)
Always show success-like message regardless of whether the email exists:
- “If an account exists for this email, you’ll receive a reset link shortly.”

#### Reset password token handling
If tokens are missing/invalid/expired:
- Banner: “This password reset link is invalid or has expired. Please request a new one.”
- Provide CTA to `/forgot-password`

### 3.4 Handling the most important scenarios

#### Signup (PRD US-001)
- User opens `/signup`
- Enters email/password/confirm
- On submit:
  - POST `/api/auth/signup`
  - On success: redirect to **generate-first onboarding** (`/dashboard/generate`)
  - Emit event `signup` (server-side)

Edge cases:
- Email already registered → show “Account already exists. Log in instead.”
- Supabase email confirmations accidentally enabled → show guidance: “Please check your email to confirm your account.” (but MVP expects this disabled)

#### Login (PRD US-002)
- User opens `/login` (optionally with `?next=...`)
- On submit:
  - POST `/api/auth/login`
  - On success: redirect to `next` (safe internal paths only) else `/dashboard`
  - Emit event `login` (server-side)

Edge cases:
- Invalid credentials → “Invalid email or password.”
- Too many attempts / rate-limited → “Too many attempts. Please try again in a few minutes.”

#### Logout
Available from an authenticated UI element (e.g., user menu in dashboard header).
- POST `/api/auth/logout`
- On success: redirect to `/`

#### Forgot password (PRD US-003)
- User opens `/forgot-password`
- Enters email
- POST `/api/auth/request-password-reset`
- Always show confirmation message; do not reveal account existence.

#### Reset password
- User clicks email link → lands on `/reset-password` with token information
- Set session if needed, then allow user to set new password:
  - POST `/api/auth/update-password` with new password (and any token if required)
- On success:
  - Option A (recommended): keep user logged in and redirect to `/dashboard`
  - Option B: redirect to `/login` with “Password updated. Please log in.”

---

## 4) BACKEND LOGIC

### 4.1 New API endpoints (structure and contracts)

All auth endpoints follow existing response conventions:
- Success: `jsonOk(...)`
- Errors: `ApiErrors.*` or `jsonError(status, code, message, details?)`

Create under `src/pages/api/auth/`:

#### `POST /api/auth/signup`
- **Request body**:
  - `email: string`
  - `password: string`
- **Success (200)**:
  - `{ user: { id: string, email: string | null } }`
  - Side effects:
    - Sets auth cookies (HTTPOnly) so SSR + other `/api/*` endpoints can read session
    - Emits telemetry event `signup`
- **Errors**:
  - 400 `invalid_input`: Zod validation failure
  - 409 `account_exists`: email already registered (map from Supabase error)
  - 429 `rate_limited`: too many attempts (if Supabase returns or local throttling applies)
  - 500 `server_error`

#### `POST /api/auth/login`
- **Request body**:
  - `email: string`
  - `password: string`
- **Success (200)**:
  - `{ user: { id: string, email: string | null } }`
  - Side effects:
    - Sets auth cookies (HTTPOnly)
    - Emits telemetry event `login`
- **Errors**:
  - 400 `invalid_input`
  - 401 `invalid_credentials` → message “Invalid email or password.”
  - 429 `rate_limited`
  - 500 `server_error`

#### `POST /api/auth/logout`
- **Request body**: none
- **Success (204)**:
  - No content
  - Side effects: clears auth cookies
- **Errors**:
  - 500 `server_error` (best-effort; even if Supabase sign-out fails, clear cookies locally)

#### `POST /api/auth/request-password-reset`
- **Request body**:
  - `email: string`
- **Success (200)**:
  - `{ ok: true }`
  - Side effects: triggers Supabase password recovery email with redirect back to `/reset-password`
- **Errors**:
  - 400 `invalid_input`
  - 429 `rate_limited`
  - 500 `server_error`

#### `POST /api/auth/update-password`
- **Request body**:
  - `password: string`
  - `confirmPassword?: string` (optional; server can require match if provided)
  - Token/session context: resolved from cookie session **or** from recovery token if required
- **Success (200)**:
  - `{ ok: true }`
- **Errors**:
  - 400 `invalid_input`
  - 401 `unauthorized` (no valid recovery session)
  - 400/401 `recovery_invalid` (invalid/expired token)
  - 500 `server_error`

#### Optional: `GET /api/auth/session`
Used by frontend to bootstrap user state if needed.
- **Success (200)**: `{ user: { id, email } | null }`

> Note: existing data endpoints (cards/decks/generate) remain unchanged; they already handle unauthorized via `ApiErrors.unauthorized()`. The main backend change is enabling cookie/session-aware Supabase clients so `auth.getUser()` works.

### 4.2 Input validation mechanism

Create a new Zod module:
- `src/lib/validation/auth.zod.ts`

Schemas:
- `LoginCommandSchema`
- `SignupCommandSchema`
- `RequestPasswordResetCommandSchema`
- `UpdatePasswordCommandSchema`

Validation error format:
- For `invalid_input` responses, include field-level details suitable for React forms:
  - `details: { fieldErrors: Record<string, string[]> }`
- UI uses `fieldErrors.email?.[0]` / `fieldErrors.password?.[0]` to display per-field messages and falls back to a generic banner.

### 4.3 Exception handling and error mapping

#### Principles
- **Never leak sensitive auth details** (e.g., whether an email exists).
- Prefer stable, machine-readable error codes for UI decisions.
- Log server-side errors with context but **do not log credentials**.

#### Mapping Supabase errors to API errors (examples)
- Invalid credentials → `401 invalid_credentials` with “Invalid email or password.”
- User already exists → `409 account_exists` with “Account already exists. Log in instead.”
- Rate limiting / abuse protection → `429 rate_limited`
- Invalid/expired recovery token → `400 recovery_invalid`
- Unknown Supabase failures → `500 server_error`

#### Telemetry emission (PRD FR-006)
Emit server-side events using the existing events pipeline:
- On successful signup: `createEvent(..., "signup", { source: "email_password" })`
- On successful login: `createEvent(..., "login", { source: "email_password" })`

Failures to write telemetry must be swallowed (existing `events.service` already does this) to avoid blocking auth.

### 4.4 Data models (auth-adjacent)

Supabase Auth is the source of truth for identity. The application DB continues to use `user_id` foreign keys (as it does today for decks/cards/events).

No new “users” table is required for MVP unless we need:
- Profile fields (display name, preferences)
- GDPR deletion audit trail (handled via events)

---

## 5) AUTHENTICATION SYSTEM (Supabase Auth + Astro SSR)

### 5.1 Core decision: cookie-backed sessions for SSR compatibility

**Requirement driver:** Existing API endpoints call `locals.supabase.auth.getUser()` without an access token argument. That only works reliably on the server if Supabase Auth session is available via request context (cookies).

Therefore:
- Authentication must be **cookie-backed** (HTTPOnly cookies), not localStorage-only.
- Middleware must create a **request-bound Supabase server client** that reads/writes auth cookies.

### 5.2 Server-side Supabase client (SSR)

Introduce a dedicated server helper module:
- `src/db/supabase.server.ts` (new)

Responsibilities:
- Create a Supabase client for SSR and API routes that:
  - Reads auth cookies from `Astro.request.headers` / `Astro.cookies`
  - Writes updated auth cookies to `Astro.cookies` (e.g., after sign-in, refresh, sign-out)
- Provide a typed client consistent with `Database` types

Recommended underlying approach:
- Use a Supabase SSR helper (e.g., `@supabase/ssr`) to avoid manual cookie serialization bugs.

Contract (conceptual):
- `createSupabaseServerClient(context): SupabaseClient`
- `getUserFromRequest(context): Promise<User | null>` (thin wrapper around `auth.getUser()`)

### 5.3 Middleware changes (central integration point)

Update `src/middleware/index.ts` so it:
- Creates the request-bound server Supabase client (instead of the current global `supabaseClient`)
- Sets:
  - `context.locals.supabase` (typed client)
  - `context.locals.user` (resolved user or null)

#### Dev-mode compatibility (do not break existing dev workflow)
The current middleware supports a DEV override user via `DEV_SUPABASE_USER_ID` and optional service role key.

Preserve this behavior, but apply it *after* creating the SSR client:
- If `DEV_SUPABASE_USER_ID` is set, override `auth.getUser()` to return that user (current behavior).
- If `SUPABASE_SERVICE_ROLE_KEY` is used in DEV for broader access, ensure it is only applied in `import.meta.env.DEV`.

### 5.4 Client-side Supabase usage (optional but recommended)

Auth UI can be implemented in two compatible ways:

#### Option A (recommended): Call app auth endpoints only
- React auth views call `/api/auth/*`
- Client never talks to Supabase directly
- Result: consistent cookie auth and centralized error mapping

#### Option B: Use Supabase client in browser with cookie storage
- Use a browser client configured to store sessions in cookies (not localStorage)
- Still keep `/api/auth/*` as the stable public contract for the UI

For MVP simplicity and consistency with existing `/api/*` patterns, **Option A is preferred**.

### 5.5 Password recovery flow details (Supabase specifics)

#### Request reset email
`POST /api/auth/request-password-reset` triggers Supabase:
- `resetPasswordForEmail(email, { redirectTo: <app_origin>/reset-password })`

#### Reset landing tokens
Supabase password recovery links may deliver credentials via:
- URL hash parameters (legacy implicit flow): `#access_token=...&refresh_token=...&type=recovery`
- Or code-based flows depending on project settings

The `/reset-password` page must:
- Detect token presence (hash or query)
- Establish a recovery session if needed
- Allow `update-password` endpoint to succeed (cookie session or token passed through)

**Recommendation:** Normalize in the UI layer by extracting tokens client-side and calling `/api/auth/update-password` (which either:
- Uses the cookie session if already established, or
- Accepts recovery token payload once to establish session, then updates password).

### 5.6 Logout semantics

`POST /api/auth/logout` should:
- Call Supabase sign-out on the server client (best-effort)
- Clear auth cookies regardless of Supabase outcome

### 5.7 Security and throttling

#### Password storage
- Supabase Auth stores passwords securely; application DB never stores passwords (aligns with PRD).

#### Login throttling (PRD US-019)
PRD explicitly requires **enforced throttling after N failed attempts**. Do not rely solely on Supabase defaults, because:
- Supabase project settings may vary by environment.
- We need deterministic UI/QA behavior for the acceptance criteria.

**MVP implementation requirement (app-side throttling):**
- Implement a best-effort in-memory limiter for `/api/auth/login` keyed by:
  - Primary: `(normalizedEmail, ipAddress)`
  - Fallback: `(ipAddress)` if email missing/invalid
- Track timestamps of failed attempts in a sliding window.
- After \(N\) failures (e.g., 5) within \(T\) minutes (e.g., 10), block further attempts for a cooldown \(C\) (e.g., 5 minutes).
- Return:
  - **HTTP 429** with code `rate_limited`
  - Message: “Too many attempts. Please try again in a few minutes.”
  - Optional details: `{ retryAfterSeconds: number }` (safe to expose)

**Security behavior:**
- While throttled, always respond with `rate_limited` (do not attempt auth).
- For non-throttled invalid credentials, respond with `401 invalid_credentials` and the generic message “Invalid email or password.”

**Operational note:**
- In-memory throttling resets on server restart; acceptable for MVP (similar to existing generation limiter). If we later need persistence, implement a DB-backed counter/table or use Supabase Edge rate limiting.

#### Cookie security
- Use HTTPOnly cookies for auth session
- Set `Secure` in production, `SameSite=Lax` (or `Strict` if compatible with reset links), and correct `Path=/`

---

## 6) SSR updates for selected pages (Astro SSR, Node adapter)

### 6.1 SSR model constraints (from `astro.config.mjs`)
- `output: "server"` and Node adapter in standalone mode means:
  - We can read request cookies at runtime.
  - We can set cookies on responses.
  - Middleware is the right place to hydrate auth state for all routes.

### 6.2 Route guards (Astro pages)

For each `/dashboard/*` page:
- In frontmatter, check `Astro.locals.user`:
  - If null: redirect to `/login?next=<path>`
  - Else: render existing content

For `/login` and `/signup`:
- If `Astro.locals.user` exists: redirect to `/dashboard` (or `/dashboard/generate`)

For `/reset-password`:
- If missing recovery token info and no session: render error state (do not redirect to login automatically; user expectation is password recovery)

### 6.3 Non-breaking behavior guarantee

This design maintains:
- Public landing page remains public and keeps its CTA routes `/signup` and `/login`.
- Existing API endpoints keep using `locals.supabase.auth.getUser()` unchanged.
- Dashboard React views remain the same; they just start receiving successful API responses once real auth session cookies exist.

---

## 7) Contracts for UI ↔ Backend integration

### 7.1 Auth UI uses `fetchJson` and existing API error shape

All auth React views use `src/lib/http/client.ts` (`fetchJson`) so:
- Errors are thrown as `ApiError` with `.status`, `.code`, `.details`
- UI can branch on:
  - `status === 400 && code === "invalid_input"` → show field errors
  - `status === 401 && code === "invalid_credentials"` → banner
  - `status === 429 && code === "rate_limited"` → banner with cooldown suggestion

### 7.2 Safe redirect handling (`next`)

The `next` parameter must be validated to prevent open redirects:
- Allow only same-origin, relative paths that start with `/dashboard`
- Reject (ignore) any `http(s)://...`, `//...`, or paths outside allowed prefixes

---

## 8) Future adjacency (not required for this spec, but must remain compatible)

### GDPR deletion (PRD FR-007 / US-016)
- Auth system must make it possible to implement a Settings page that:
  - Requires a valid session
  - Calls a secure deletion endpoint
  - Logs out user after deletion

This spec’s cookie-based SSR session model is a prerequisite for secure deletion flows.

---

## 9) PRD user story coverage (auth-related)

This section ensures each PRD auth story is implementable with the architecture above and clarifies authorization semantics.

### US-001 Sign up with email and password
- **UI**: `/signup` (Astro) + `SignupView.tsx` (React)
- **Backend**: `POST /api/auth/signup`
- **Redirect**: after success → **generate-first onboarding** at `/dashboard/generate` (matches PRD “onboarding (generate-first flow)”)
- **Telemetry**: emit `signup` with `user_id`

### US-002 Log in with email and password
- **UI**: `/login` + `LoginView.tsx`
- **Backend**: `POST /api/auth/login`
- **Redirect**: after success → `/dashboard` (or validated `next` if provided)
- **Error messaging**: generic “Invalid email or password.” (no field disclosure)
- **Telemetry**: emit `login` with `user_id`

### US-003 Password reset
- **UI**: `/forgot-password` + `/reset-password` (with invalid/expired token state)
- **Backend**:
  - `POST /api/auth/request-password-reset` sends reset link/token
  - `POST /api/auth/update-password` sets new password (requires valid recovery session/token)
- **Security**:
  - Token expiry/reuse handled via Supabase recovery semantics; API must map invalid/expired to `recovery_invalid`
  - Forgot-password response is non-enumerating (always success-like)

### US-018 Prevent unauthenticated access to personal data
- **UI enforcement (SSR)**: all `/dashboard/*` routes require `Astro.locals.user`; otherwise redirect to `/login`
- **API enforcement**:
  - All personal-data endpoints require `locals.supabase.auth.getUser()` and return `401 unauthorized` when absent (current pattern)
  - Ownership enforcement: for resource-by-id routes, if the resource does not exist **or is not owned by the user**, respond with `404 not_found` (avoid leaking existence)

### US-019 Password hashing and login throttling
- **Password hashing**: handled by Supabase Auth; app must never store or log plaintext credentials
- **Throttling**: required app-side limiter for `/api/auth/login` as specified in **5.7**


