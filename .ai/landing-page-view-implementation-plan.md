## View Implementation Plan: Public Landing

## 1. Overview
The **Public Landing** view is the app’s public entry point. It explains the product value proposition (AI-assisted flashcard creation + spaced repetition) and provides clear primary calls-to-action to **Log in** and **Create account**, plus a short **privacy/GDPR** note. It must render **no private user data** and should be usable without JavaScript.

## 2. View Routing
- **Route path**: `/`
- **Astro page file**: `src/pages/index.astro`
- **Expected redirects (recommended)**:
  - If a user is already authenticated, redirect from `/` to the canonical post-login route (per UI plan: prefer `/app`).

## 3. Component Structure
Implement the page as Astro-first composition (static by default), with optional React only if truly needed.

High-level hierarchy:
- `src/pages/index.astro`
  - `src/layouts/Layout.astro`
    - `PublicLandingView` (new, Astro)
      - `LandingHero`
      - `LandingPrimaryCtas`
      - `LandingPrivacyGdprNote`
      - `LandingHelpLinks` (optional)

## 4. Component Details

### `index.astro` (Page)
- **Purpose**: Route entry for `/`; sets page metadata and composes the landing view inside `Layout`.
- **Main elements**:
  - Uses `<Layout title="10x-cards" />` (or product name from PRD).
  - Renders `<PublicLandingView />`.
- **Handled events**:
  - None (page-level). Navigation events are handled by anchor elements.
  - Optional: if already authenticated, server-side redirect to `/app`.
- **Validation conditions**:
  - No user input validation.
  - If implementing auth redirect, validate that session retrieval does not throw; on failure, render landing normally (do not break public access).
- **Types (DTO + ViewModel)**:
  - No API DTOs required.
  - Optional: `PublicLandingViewModel` assembled in the page frontmatter and passed to the view component.
- **Props**:
  - N/A (top-level route).

### `Layout.astro` (Existing layout integration)
- **Purpose**: Provide document shell and global CSS.
- **Main elements**:
  - Ensure `<title>` and basic meta tags are set.
  - Keep `lang="en"` (PRD: English-only UI for MVP).
- **Handled events**: none.
- **Validation conditions**: none.
- **Types**: `Props { title?: string }` already exists.
- **Props**:
  - `title?: string`

### `PublicLandingView.astro` (New)
- **Purpose**: Present product value prop, primary auth CTAs, and privacy/GDPR note, in an accessible, responsive layout.
- **Main elements**:
  - Outer `<main>` container with responsive padding and max-width.
  - `LandingHero` section:
    - `<h1>` product headline
    - `<p>` short explanation aligned with PRD problem statement (reduce friction creating flashcards; AI generation)
  - `LandingPrimaryCtas`:
    - Two prominent `<a>` CTAs:
      - “Log in” → `/login`
      - “Create account” → `/signup`
  - `LandingPrivacyGdprNote`:
    - Small text block referencing GDPR deletion capability (PRD FR-007) in plain language.
  - `LandingHelpLinks` (optional):
    - Minimal links like “How it works”, “Privacy”, “Support” (can be placeholders until routes exist).
- **Handled events**:
  - Click navigation via anchors.
- **Validation conditions**:
  - Ensure CTA hrefs point to existing routes (`/login`, `/signup`) defined in UI plan.
  - If optional help links are included, ensure they either:
    - point to implemented routes, or
    - are omitted until implemented (avoid broken navigation in MVP).
- **Types (DTO + ViewModel)**:
  - `PublicLandingViewModel` (recommended) for content/config; no backend DTO usage.
- **Props (component interface)**:
  - `vm: PublicLandingViewModel`

### `LandingHero.astro` (New)
- **Purpose**: Communicate value proposition and set context for the CTAs.
- **Main elements**:
  - `<header>` or `<section>`
  - `<h1>` (single H1 on page)
  - `<p>` supporting text
  - Optional: a short “How it works” ordered list (Paste text → Generate → Review/Edit → Save → Review with SRS) aligned with PRD flow.
- **Handled events**: none.
- **Validation conditions**: none.
- **Types**:
  - Uses fields from `PublicLandingViewModel["hero"]`.
- **Props**:
  - `hero: PublicLandingHeroVm`

### `LandingPrimaryCtas.astro` (New)
- **Purpose**: Provide clear primary navigation to auth routes.
- **Main elements**:
  - Container `<div>` with two `<a>` elements styled like buttons (Tailwind + shared variant classes).
  - Each link includes descriptive accessible text, e.g. `aria-label="Log in to your account"`.
- **Handled events**:
  - `click` (native navigation).
- **Validation conditions**:
  - `href` must be non-empty and start with `/`.
  - Ensure distinct labels for screen readers.
- **Types**:
  - `PublicLandingCtaVm[]`.
- **Props**:
  - `primaryCtas: PublicLandingCtaVm[]`

### `LandingPrivacyGdprNote.astro` (New)
- **Purpose**: Provide a brief privacy/GDPR note without overwhelming the main CTA flow.
- **Main elements**:
  - `<aside>` or `<section>` with smaller typography.
  - Text referencing:
    - English-only MVP
    - GDPR deletion: “You can permanently delete your account and data at any time in Settings.” (PRD FR-007)
  - Optional link to a privacy page if available.
- **Handled events**: none.
- **Validation conditions**:
  - If a privacy link is displayed, ensure it points to an implemented route.
- **Types**:
  - `PublicLandingPrivacyVm`.
- **Props**:
  - `privacy: PublicLandingPrivacyVm`

### `LandingHelpLinks.astro` (Optional, New)
- **Purpose**: Offer minimal secondary navigation (FAQ/help) without adding scope.
- **Main elements**:
  - `<nav aria-label="Help">` with a list of `<a>` links.
- **Handled events**:
  - Click navigation.
- **Validation conditions**:
  - Only render links that are valid for the current MVP routing.
- **Types**:
  - `PublicLandingHelpLinkVm[]`.
- **Props**:
  - `links: PublicLandingHelpLinkVm[]`

## 5. Types
This view does not require backend DTOs. Use lightweight ViewModel types to keep content/config explicit and to avoid hardcoding strings in multiple components.

Add these types (recommended) in a frontend-friendly location (e.g. `src/types.ts` if shared, or `src/components/views/public-landing/public-landing.types.ts` if view-local).

### `PublicLandingViewModel`
- **Fields**:
  - `hero: PublicLandingHeroVm`
  - `primaryCtas: PublicLandingCtaVm[]` (exactly 2 items for MVP)
  - `privacy: PublicLandingPrivacyVm`
  - `helpLinks?: PublicLandingHelpLinkVm[]`

### `PublicLandingHeroVm`
- **Fields**:
  - `title: string` (H1)
  - `subtitle: string` (supporting paragraph)
  - `howItWorksSteps?: string[]` (optional; 3–5 short steps)

### `PublicLandingCtaVm`
- **Fields**:
  - `label: string` (visible text)
  - `href: `/${string}`` (route)
  - `variant: "primary" | "secondary"` (maps to Tailwind/button styles)
  - `ariaLabel?: string`

### `PublicLandingPrivacyVm`
- **Fields**:
  - `note: string` (GDPR/privacy copy)
  - `privacyHref?: `/${string}`` (optional if a privacy route exists)
  - `privacyLabel?: string` (e.g. “Privacy”)

### `PublicLandingHelpLinkVm`
- **Fields**:
  - `label: string`
  - `href: `/${string}``

## 6. State Management
No client-side state is required for MVP.

- **No custom hook needed**: the page is static content + navigation.
- **Optional server-side auth redirect**:
  - Use request-scoped session retrieval (via existing Supabase/auth integration) in `index.astro` frontmatter.
  - If authenticated, return a redirect response to `/app`.
  - If the session cannot be read (unexpected error), fail open and render the landing.

## 7. API Integration
No API calls are required for the Public Landing view.

If you implement the optional “redirect when already logged in”, it should use **authentication/session** utilities only (no REST endpoint calls). This keeps `/` fast and avoids leaking user state into public HTML.

## 8. User Interactions
- **Click “Log in”**:
  - Navigates to `/login`.
- **Click “Create account”**:
  - Navigates to `/signup`.
- **Keyboard navigation**:
  - Both CTAs must be reachable via Tab order and show a visible focus ring.
- **Optional help links**:
  - Navigate to their destinations; do not include broken links in MVP.

## 9. Conditions and Validation
Even without forms/API calls, validate at the UI level to prevent broken UX:

- **CTA link validity** (in `LandingPrimaryCtas`):
  - Must render exactly two CTAs for MVP.
  - Each CTA must have:
    - non-empty `label`
    - `href` starting with `/`
    - unique `label` and unique `href`
- **Accessibility conditions**:
  - Exactly one `<h1>` on the page (in `LandingHero`).
  - CTA links styled as buttons must remain semantic links (`<a>`) for navigation.
  - Provide descriptive `aria-label` on CTAs if label alone is ambiguous.
- **Security/privacy conditions**:
  - Do not render any user-specific data or tokens.
  - Do not include user-identifying telemetry on the public landing unless explicitly required by the product (none specified for MVP).

## 10. Error Handling
- **Broken/missing auth routes**:
  - Prevent by ensuring `/login` and `/signup` exist before enabling links (or implement them in parallel).
- **Auth redirect failure (optional feature)**:
  - If session retrieval errors, render the landing normally (fail open).
- **Styling regressions**:
  - Ensure global styles and Tailwind setup remain intact; keep components within `Layout`.

## 11. Implementation Steps
1. **Decide canonical post-login route**: use `/app` (as suggested by the UI plan) and document it as canonical for redirects.
2. **Create the view component**: add `src/components/views/public-landing/PublicLandingView.astro` (and optional subcomponents) to keep `index.astro` minimal.
3. **Define ViewModel types**: add `PublicLandingViewModel` and related `*Vm` types (prefer view-local types unless you intentionally want them shared).
4. **Implement layout & content**:
   - Add hero headline + supporting text aligned with PRD (English-only).
   - Add two primary CTAs linking to `/login` and `/signup`.
   - Add a concise GDPR note referencing permanent deletion availability in settings (PRD FR-007).
5. **Wire `/` to the new view**:
   - Update `src/pages/index.astro` to render `PublicLandingView` instead of the starter `Welcome`.
   - Set a meaningful `Layout` title for the landing.
6. **(Optional) Add auth-aware redirect**:
   - In `index.astro` frontmatter, check auth session.
   - If authenticated, redirect to `/app`.
   - Ensure failures do not block public rendering.
7. **Accessibility pass**:
   - Verify keyboard navigation, focus states, single H1, descriptive labels.
8. **Content sanity**:
   - Ensure no private data is referenced.
   - Ensure no broken help links are shipped.
9. **Visual QA**:
   - Check responsive layout on mobile/desktop.
   - Confirm CTAs are prominent and clearly distinguish primary vs secondary.
