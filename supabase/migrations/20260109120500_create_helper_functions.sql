-- migration: create helper functions
-- description: creates utility functions for content hashing and data validation
-- tables affected: cards (indirectly via triggers)
-- date: 2026-01-09

-- helper function to generate normalized content hash for deduplication
-- normalizes text by converting to lowercase and collapsing whitespace
-- returns sha256 hex digest of normalized front||back content
create or replace function public.generate_content_hash(front text, back text)
returns text as $$
declare
  normalized text;
begin
  -- basic normalization: concat, lower, collapse whitespace
  -- extend this logic if more sophisticated normalization is needed
  normalized := lower(
    regexp_replace(coalesce(front, ''), '\s+', ' ', 'g') || 
    '||' || 
    regexp_replace(coalesce(back, ''), '\s+', ' ', 'g')
  );
  return encode(digest(normalized, 'sha256'), 'hex');
end;
$$ language plpgsql immutable;

comment on function public.generate_content_hash is 'generates sha256 hash of normalized card content for deduplication';

-- trigger function to ensure cards.user_id matches decks.user_id
-- prevents data integrity issues where a card is assigned to wrong user
-- raises exception if mismatch is detected
create or replace function public.ensure_card_user_matches_deck()
returns trigger as $$
declare
  deck_owner uuid;
begin
  -- lookup the deck's owner
  select user_id into deck_owner from public.decks where id = new.deck_id;
  
  -- validate deck exists
  if deck_owner is null then
    raise exception 'deck % not found', new.deck_id;
  end if;
  
  -- validate user_id matches deck owner
  if new.user_id is distinct from deck_owner then
    raise exception 'card.user_id (%) must match deck.user_id (%)', new.user_id, deck_owner;
  end if;
  
  return new;
end;
$$ language plpgsql;

comment on function public.ensure_card_user_matches_deck is 'validates that card.user_id matches parent deck.user_id';

-- trigger to enforce user_id consistency between cards and decks
-- runs before insert or update on cards table
-- prevents orphaned or mismatched cards
create trigger trg_cards_user_matches_deck
  before insert or update on public.cards
  for each row execute function public.ensure_card_user_matches_deck();

comment on trigger trg_cards_user_matches_deck on public.cards is 'enforces user_id consistency between cards and parent deck';

-- helper function to update updated_at timestamp automatically
-- generic function that can be used on any table with updated_at column
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

comment on function public.update_updated_at_column is 'automatically updates updated_at timestamp on row modification';

-- apply updated_at trigger to decks table
create trigger trg_decks_updated_at
  before update on public.decks
  for each row execute function public.update_updated_at_column();

-- apply updated_at trigger to cards table
create trigger trg_cards_updated_at
  before update on public.cards
  for each row execute function public.update_updated_at_column();

