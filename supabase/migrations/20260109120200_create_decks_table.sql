-- migration: create decks table
-- description: creates decks table for organizing flashcards
-- tables affected: decks (new)
-- date: 2026-01-09

-- create decks table to organize user's flashcard collections
-- each deck belongs to one user and contains multiple cards
-- user_id references auth.users directly (no separate public.users table)
-- cascade delete ensures deck removal when user is deleted from auth
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- create index on user_id for fast lookup of user's decks
create index if not exists idx_decks_user_id on public.decks (user_id);

-- enable row level security on decks table
-- rls ensures users can only access their own decks
alter table public.decks enable row level security;

-- rls policy: allow authenticated users to select their own decks
-- rationale: users should see only their own deck collections
create policy "decks_select_own"
  on public.decks
  for select
  to authenticated
  using (user_id = auth.uid());

-- rls policy: allow authenticated users to insert their own decks
-- rationale: users can create new decks for themselves
create policy "decks_insert_own"
  on public.decks
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- rls policy: allow authenticated users to update their own decks
-- rationale: users should be able to modify their own deck properties
create policy "decks_update_own"
  on public.decks
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- rls policy: allow authenticated users to delete their own decks
-- rationale: users should be able to remove their own decks
create policy "decks_delete_own"
  on public.decks
  for delete
  to authenticated
  using (user_id = auth.uid());

-- no policies for anon role - anonymous users cannot access decks

comment on table public.decks is 'user-owned flashcard deck collections';
comment on column public.decks.user_id is 'owner of the deck';
comment on column public.decks.deleted_at is 'soft delete timestamp for ux purposes (gdpr requires hard delete)';

