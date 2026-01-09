-- migration: create events table
-- description: creates events table for telemetry and kpi tracking
-- tables affected: events (new)
-- date: 2026-01-09

-- create events table for tracking user telemetry and kpi metrics
-- stores event-driven analytics data with flexible jsonb payload
-- user_id references auth.users directly (no separate public.users table)
-- cascade delete ensures event removal when user is deleted from auth
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- create composite index on user_id and created_at for time-series queries
-- supports efficient filtering and ordering of user events by time
create index if not exists idx_events_user_id_created_at on public.events (user_id, created_at);

-- create index on event_type for analytics queries
-- supports efficient filtering by event type across users
create index if not exists idx_events_event_type on public.events (event_type);

-- enable row level security on events table
-- rls ensures users can only access their own analytics data
alter table public.events enable row level security;

-- rls policy: allow authenticated users to select their own events
-- rationale: users should be able to see their own activity history
create policy "events_select_own"
  on public.events
  for select
  to authenticated
  using (user_id = auth.uid());

-- rls policy: allow authenticated users to insert their own events
-- rationale: application needs to track user actions
create policy "events_insert_own"
  on public.events
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- rls policy: prevent authenticated users from updating events
-- rationale: events are immutable audit records
-- note: no update policy means updates are blocked by rls
create policy "events_no_update"
  on public.events
  for update
  to authenticated
  using (false);

-- rls policy: allow authenticated users to delete their own events (gdpr)
-- rationale: enables gdpr-compliant deletion of user analytics data
create policy "events_delete_own"
  on public.events
  for delete
  to authenticated
  using (user_id = auth.uid());

-- no policies for anon role - anonymous users cannot access events

comment on table public.events is 'telemetry and kpi event tracking with flexible jsonb payload';
comment on column public.events.event_type is 'event type identifier (e.g. generated_view, accepted_without_edit)';
comment on column public.events.payload is 'flexible jsonb storage for event-specific data';

