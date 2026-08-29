-- =====================================================================
--  CALENDAR — shared story calendar
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Two kinds of entry:
--   * personal — visible only to the player who made it
--   * GM event  — made by an admin, visible to everyone
--
--  Dates are whatever the table's story is using; the app defaults its
--  view to the story-clock date but entries are plain dates you pick.
-- =====================================================================

create table if not exists public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  is_public  boolean not null default false,   -- true = GM event, everyone sees
  kind       text not null default 'event'
             check (kind in ('event', 'reminder')),
  title      text not null check (char_length(title) between 1 and 120),
  notes      text,
  start_date date not null,
  end_date   date,                              -- null = single day
  start_time time,                              -- null = all day
  end_time   time,
  color      text,                              -- optional override for GM events
  created_at timestamptz not null default now(),
  constraint cal_dates_ordered
    check (end_date is null or end_date >= start_date)
);

create index if not exists cal_owner  on public.calendar_events (owner_id, start_date);
create index if not exists cal_public on public.calendar_events (is_public, start_date);


-- ---------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------

alter table public.calendar_events enable row level security;

-- See your own entries, every GM event, and (as admin) everything.
drop policy if exists cal_read on public.calendar_events;
create policy cal_read on public.calendar_events
  for select to authenticated
  using (owner_id = auth.uid() or is_public or public.is_admin());

-- Make your own entries. Only an admin may mark one public (a GM event).
drop policy if exists cal_create on public.calendar_events;
create policy cal_create on public.calendar_events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (is_public = false or public.is_admin())
  );

-- Edit your own; admins may edit any. The public flag stays admin-only.
drop policy if exists cal_update on public.calendar_events;
create policy cal_update on public.calendar_events
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (
    (owner_id = auth.uid() or public.is_admin())
    and (is_public = false or public.is_admin())
  );

-- Delete your own; admins may delete any.
drop policy if exists cal_delete on public.calendar_events;
create policy cal_delete on public.calendar_events
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
--  Realtime, so a GM event appears on everyone's calendar without a
--  reload.
-- ---------------------------------------------------------------------

alter table public.calendar_events replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.calendar_events;
  exception when duplicate_object then null;
  end;
end $$;
