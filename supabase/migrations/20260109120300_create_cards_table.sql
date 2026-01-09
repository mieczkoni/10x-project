-- migration: create cards table
-- description: creates cards table for storing flashcard content
-- tables affected: cards (new)
-- date: 2026-01-09

-- create cards table to store flashcard content
-- cards belong to decks and are denormalized with user_id for performance
-- content_hash ensures no duplicate cards within a deck
-- user_id references auth.users directly (no separate public.users table)
-- cascade deletes ensure cleanup when user or deck is deleted
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  front text not null,
  back text not null,
  tags text[] not null default array[]::text[],
  content_hash text not null,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  -- ensure no duplicate cards within a deck based on normalized content
  constraint uniq_deck_content_hash unique (deck_id, content_hash)
);

-- create index on user_id for fast lookup of user's cards
create index if not exists idx_cards_user_id on public.cards (user_id);

-- create index on deck_id for fast lookup of cards in a deck
create index if not exists idx_cards_deck_id on public.cards (deck_id);

-- create gin index on tags array to support efficient tag filtering
-- gin indexes are optimized for array containment queries
create index if not exists idx_cards_tags_gin on public.cards using gin (tags);

-- enable row level security on cards table
-- rls ensures users can only access their own cards
alter table public.cards enable row level security;

-- rls policy: allow authenticated users to select their own cards
-- rationale: users should see only their own flashcards
create policy "cards_select_own"
  on public.cards
  for select
  to authenticated
  using (user_id = auth.uid());

-- rls policy: allow authenticated users to insert their own cards
-- rationale: users can create new cards for themselves
create policy "cards_insert_own"
  on public.cards
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- rls policy: allow authenticated users to update their own cards
-- rationale: users should be able to edit their own card content
create policy "cards_update_own"
  on public.cards
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- rls policy: allow authenticated users to delete their own cards
-- rationale: users should be able to remove their own cards
create policy "cards_delete_own"
  on public.cards
  for delete
  to authenticated
  using (user_id = auth.uid());

-- no policies for anon role - anonymous users cannot access cards

comment on table public.cards is 'flashcard content with deduplication and tagging';
comment on column public.cards.user_id is 'denormalized owner id for simplified rls and queries';
comment on column public.cards.content_hash is 'sha256 hash of normalized front||back for deduplication';
comment on column public.cards.ai_generated is 'flag to distinguish manual vs ai-generated cards';
comment on column public.cards.tags is 'denormalized array of tags for mvp';
comment on column public.cards.deleted_at is 'soft delete timestamp for ux purposes (gdpr requires hard delete)';

