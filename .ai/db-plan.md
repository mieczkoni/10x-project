## PostgreSQL Database Plan for 10x-cards (MVP)

This document contains the recommended PostgreSQL schema, indexes, and RLS policies for the 10x-cards MVP. It is designed to be used with Supabase Auth (application `users.id` maps to `auth.uid`) and follows the decisions made in planning sessions (denormalized `tags` as `TEXT[]`, transactional hard-deletes for GDPR, no persistent storage of generated candidates).

---

```sql
-- Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid() and digest()
```

1. List of tables with columns, types, and constraints

```sql
-- 1) users
-- Note: User authentication and profiles are fully managed by Supabase Auth (auth.users table).
-- No separate public.users table is needed. All application tables reference auth.users(id) directly.

-- 2) decks
CREATE TABLE IF NOT EXISTS public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- 3) cards
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  content_hash TEXT NOT NULL, -- normalized SHA256 of front||back (application or DB helper should compute)
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT uniq_deck_content_hash UNIQUE (deck_id, content_hash)
);

-- 4) events / telemetry (KPI events)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g. generated_view, accepted_without_edit, ...
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

2. Relationships between tables

- `auth.users` (Supabase Auth) 1 --> N `decks` (decks.user_id → auth.users.id)
- `decks` 1 --> N `cards` (cards.deck_id → decks.id)
- `auth.users` 1 --> N `cards` (cards.user_id → auth.users.id) — denormalized to simplify RLS and queries
- `auth.users` 1 --> N `events` (events.user_id → auth.users.id)

Notes:
- User authentication and profiles are fully managed by Supabase Auth in the `auth` schema. All application tables reference `auth.users` directly.
- `cards.user_id` is stored in addition to `deck_id` to make RLS and query patterns simpler and faster. Application or DB trigger must ensure `cards.user_id` matches `decks.user_id`.
- The schema avoids storing generated candidate cards or generation sessions per decision.
- CASCADE deletes are enabled on all foreign keys to `auth.users`, so when a user is deleted from Supabase Auth, all their data is automatically removed.

3. Indexes

```sql
-- Basic B-tree indexes
CREATE INDEX IF NOT EXISTS idx_decks_user_id ON public.decks (user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON public.cards (user_id);
CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON public.cards (deck_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id_created_at ON public.events (user_id, created_at);

-- GIN index for tags array to support tag filtering
CREATE INDEX IF NOT EXISTS idx_cards_tags_gin ON public.cards USING GIN (tags);

-- Unique index already enforced via constraint:
-- CONSTRAINT uniq_deck_content_hash UNIQUE (deck_id, content_hash)

-- Notes on text search:
-- MVP uses application-level ILIKE searches on front/back. If search performance becomes an issue, add:
--   1) pg_trgm extension + GIN/GIN_trgm indexes on front/back
--   2) or a tsvector materialized index for full-text search.
```

4. PostgreSQL row-level security (RLS) policies

Policy design principles:
- Enable RLS on user-scoped tables (`decks`, `cards`, `events`) so that rows are visible/modifyable only to their owner (`auth.uid()`).
- Use `USING` clauses for row visibility and `WITH CHECK` for insert/update enforcement.
- For inserts, require that the row's `user_id` equals `auth.uid()` (or set `user_id` server-side with a trigger/DB function).

Example policies (Supabase/Postgres):

```sql
-- Enable RLS
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Decks: owner-only access
CREATE POLICY decks_is_owner ON public.decks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Cards: owner-only access
CREATE POLICY cards_is_owner ON public.cards
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Events: owner-only access (app writes events; users should only see their events)
CREATE POLICY events_is_owner ON public.events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Notes:
- `auth.uid()` is a Supabase/Postgres helper function that returns the authenticated user's ID from the Supabase Auth JWT token. It's used in RLS policies to match against `user_id` columns.
- These policies restrict reads/writes to the owning user. No admin/service bypass policies are added for MVP; service-side tasks should be performed via server functions with elevated privileges or a dedicated admin role.
- All user data in `public` schema references `auth.users.id` directly via foreign keys with CASCADE delete.

5. Triggers and helper functions

a) Ensure `cards.user_id` matches `decks.user_id`

```sql
-- Trigger function to prevent mismatched user_id between cards and deck
CREATE OR REPLACE FUNCTION public.ensure_card_user_matches_deck()
RETURNS TRIGGER AS $$
DECLARE
  deck_owner UUID;
BEGIN
  SELECT user_id INTO deck_owner FROM public.decks WHERE id = NEW.deck_id;
  IF deck_owner IS NULL THEN
    RAISE EXCEPTION 'deck % not found', NEW.deck_id;
  END IF;
  IF NEW.user_id IS DISTINCT FROM deck_owner THEN
    RAISE EXCEPTION 'card.user_id (%) must match deck.user_id (%)', NEW.user_id, deck_owner;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cards_user_matches_deck
  BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.ensure_card_user_matches_deck();
```

b) Optional: content-hash helper (example normalization + SHA256)

```sql
CREATE OR REPLACE FUNCTION public.generate_content_hash(front TEXT, back TEXT)
RETURNS TEXT AS $$
DECLARE
  normalized TEXT;
BEGIN
  -- Basic normalization: concat, lower, collapse whitespace. Extend as needed.
  normalized := lower(regexp_replace(coalesce(front,''), '\s+', ' ', 'g') || '||' || regexp_replace(coalesce(back,''), '\s+', ' ', 'g'));
  RETURN encode(digest(normalized, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

Usage:
- Application should call `generate_content_hash(front, back)` to compute `content_hash` before inserting a card, or compute equivalent on client side and send it.

6. GDPR / account deletion flow (CASCADE delete)

- The system performs an immediate, irreversible deletion of all user data when the Supabase Auth user is deleted.
- All foreign keys to `auth.users` have `ON DELETE CASCADE`, so deleting the auth user automatically removes all related data.
- Deletion is performed via Supabase Auth API or Admin dashboard:

```javascript
// Using Supabase Admin API
await supabase.auth.admin.deleteUser(userId);
// This automatically cascades to delete all rows in: cards, decks, events
```

- Alternative: Manual deletion transaction (if needed for audit purposes):

```sql
BEGIN;
  DELETE FROM public.cards WHERE user_id = '<USER_UUID>';
  DELETE FROM public.decks WHERE user_id = '<USER_UUID>';
  DELETE FROM public.events WHERE user_id = '<USER_UUID>';
  -- Then delete the Supabase Auth user via Auth API
COMMIT;
```

Notes:
- `ON DELETE CASCADE` is enabled on all foreign keys to `auth.users` for automatic cleanup.
- Deleting the Supabase Auth user (via API or dashboard) will automatically cascade delete all user data in public schema.
- Ensure any external telemetry or logs are also deleted per GDPR requirements (application infra responsibility).

7. Constraints, validations, and notes

- `content_hash` MUST be computed from normalized `front||back` to avoid duplicates caused by trivial differences (app should normalize same way as DB `generate_content_hash` if used).
- Keep `tags` denormalized as `TEXT[]` for MVP; add a `tags` table + junction (`card_tags`) later if tag analytics/search become complex.
- `ai_generated` boolean lets the app distinguish manual vs AI-origin cards.
- `deleted_at` columns are included for transient UX purposes (optional). Actual GDPR deletion should physically remove rows as described above.
- Consider pg_trgm and tsvector indexes for better search later.

8. Migration / deployment notes

- Ensure `pgcrypto` extension is created before tables if using `gen_random_uuid()` or `digest()`.
- **User Setup**: Supabase Auth fully manages user authentication and profiles in the `auth.users` table. No additional public.users table is needed.
- All application tables reference `auth.users(id)` directly with `ON DELETE CASCADE` for automatic cleanup.
- Test RLS policies early using Supabase policy tester or by simulating JWT claims to validate `auth.uid()` behavior.
- The application uses `auth.uid()` in RLS policies which returns the authenticated user's ID from Supabase Auth JWT token.

---

End of DB plan.
```

