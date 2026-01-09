-- migration: gdpr deletion helper function
-- description: provides transactional hard-delete function for gdpr compliance
-- tables affected: decks, cards, events (all user data)
-- date: 2026-01-09
--
-- ⚠️ WARNING: this function performs irreversible hard deletion of all user data
-- use only for gdpr-compliant account deletion requests
--
-- note: all tables have on delete cascade to auth.users, so deleting the auth user
-- via supabase auth api will automatically cascade delete all user data.
-- this function is provided for explicit deletion control and audit purposes.

-- helper function to perform complete user data deletion
-- deletes all user data atomically in correct order to avoid fk violations
-- returns true on success, raises exception on failure
create or replace function public.delete_user_data(target_user_id uuid)
returns boolean as $$
begin
  -- validate that the requesting user is the target user (security check)
  if auth.uid() != target_user_id then
    raise exception 'users can only delete their own data';
  end if;

  -- delete all user data in transactional order
  -- note: with on delete cascade to auth.users, you could just delete the auth user
  -- but this function provides explicit control for audit purposes
  
  -- step 1: delete all events (telemetry data)
  delete from public.events where user_id = target_user_id;
  
  -- step 2: delete all cards (flashcard content)
  delete from public.cards where user_id = target_user_id;
  
  -- step 3: delete all decks (card collections)
  delete from public.decks where user_id = target_user_id;
  
  -- note: after calling this function, delete the supabase auth user via auth api
  -- alternatively, deleting auth user first will cascade delete all public data
  
  return true;
end;
$$ language plpgsql security definer;

comment on function public.delete_user_data is 'gdpr-compliant transactional hard delete of all user data';

-- important notes on gdpr deletion:
--
-- 1. all foreign keys to auth.users have on delete cascade enabled
-- 2. deleting the supabase auth user (via auth api) will automatically cascade delete all user data
-- 3. this function provides explicit deletion control for audit purposes
-- 4. ensure any external telemetry or logs are also deleted per gdpr requirements
-- 5. this operation is irreversible - all user data will be permanently lost
-- 6. the deleted_at columns are for ux purposes only; true gdpr deletion is hard delete
-- 7. application should implement a confirmation workflow before deletion
--
-- usage example (from application code):
--   -- option 1: explicit deletion then auth cleanup
--   select public.delete_user_data(auth.uid());
--   -- then call supabase auth api to delete auth user
--
--   -- option 2: just delete auth user (cascades automatically)
--   await supabase.auth.admin.deleteUser(userId);

