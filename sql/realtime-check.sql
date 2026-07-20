-- =====================================================================
--  NEO MESSAGE — realtime check
--
--  Run the first query. If `messages` is not in the list, realtime was
--  never switched on for it and that is why messages only appear after
--  a refresh. The rest of this file fixes it.
-- =====================================================================

-- 1. What is currently published?
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- Expected: app_settings, conversation_members, conversations, messages


-- ---------------------------------------------------------------------
-- 2. If anything is missing, add it. Safe to run when already present.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['messages', 'conversation_members',
                           'conversations', 'app_settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_table  then null;   -- app_settings only exists if you ran story-clock.sql
    end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Deletes need the old row to be identifiable, or a deleted thread
--    will not disappear from anyone's screen.
-- ---------------------------------------------------------------------

alter table public.messages      replica identity full;
alter table public.conversations replica identity full;


-- ---------------------------------------------------------------------
-- 4. Confirm it took.
-- ---------------------------------------------------------------------

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
