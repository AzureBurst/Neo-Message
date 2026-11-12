-- =====================================================================
--  Calendar: the GM puts events on players' calendars
--  The GM can open any player's calendar and add an entry straight to
--  it (or to several players at once). The entry belongs to that player
--  and only they (and the GM) can see it. It's tagged as from the GM,
--  the player gets a notification, and only the GM can change or
--  remove it.
--  Run after calendar.sql. Safe to run more than once.
-- =====================================================================

alter table public.calendar_events
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;

-- The GM can make entries on anyone's calendar; players only on their own.
drop policy if exists cal_create on public.calendar_events;
create policy cal_create on public.calendar_events
  for insert to authenticated
  with check (
    public.is_admin()
    or (owner_id = auth.uid() and is_public = false and assigned_by is null)
  );

-- Players can't edit or remove what the GM assigned them.
drop policy if exists cal_update on public.calendar_events;
create policy cal_update on public.calendar_events
  for update to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and assigned_by is null))
  with check (public.is_admin() or (owner_id = auth.uid() and is_public = false and assigned_by is null));

drop policy if exists cal_delete on public.calendar_events;
create policy cal_delete on public.calendar_events
  for delete to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and assigned_by is null));

-- Let the player know something landed on their calendar.
create or replace function public.notif_on_cal_assign() returns trigger
language plpgsql security definer set search_path = public as $$
declare gm_av text;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  if new.assigned_by is null or new.is_public or new.owner_id = new.assigned_by then return new; end if;
  select avatar_url into gm_av from public.profiles where id = new.assigned_by;
  perform public.push_notification(new.owner_id, 'calendar', 'calendar_assigned',
    'On your calendar: ' || new.title, to_char(new.start_date, 'Mon DD'),
    'calendar.html?event=' || new.id, new.id, gm_av);
  return new;
end;
$$;
drop trigger if exists trg_cal_assign_notify on public.calendar_events;
create trigger trg_cal_assign_notify after insert on public.calendar_events
  for each row execute function public.notif_on_cal_assign();
