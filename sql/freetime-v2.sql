-- =====================================================================
--  Free Time v2
--   * Reputation is free text the GM writes (blank for now).
--   * Terms have a start date. The current term is set to week 8,
--     starting August 21st.
--   * The GM can set a player's points for the current week.
--  Run after mytime.sql. Safe to run more than once — but note it sets
--  the current term back to week 8 each time it runs.
-- =====================================================================

-- Reputation: any text, blank to start.
alter table public.ft_reputation drop constraint if exists ft_reputation_level_check;
alter table public.ft_reputation alter column level set default '';
update public.ft_reputation set level = ''
 where level in ('Disgraced','Unknown','Promising','Rising Star','Household Name');

-- Term start date.
alter table public.ft_terms add column if not exists start_date date;
update public.ft_terms set current_week = 8, start_date = date '2026-08-21' where active;

-- GM: set (or create) a player's entries for the current week.
-- p_entries: [{track | connection_id, points (0 removes it), note}]
-- Works until the week is approved; after that, change boxes directly.
create or replace function public.ft_gm_set_week(p_user uuid, p_entries jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.ft_terms; w public.ft_weeks; e jsonb; pts int; tr text; cid uuid; old public.ft_entries;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  t := public.ft_active_term();
  if t.id is null then raise exception 'No term is running.'; end if;
  select * into w from public.ft_weeks where user_id = p_user and term_id = t.id and week = t.current_week;
  if w.id is not null and w.status in ('approved','resolved') then
    raise exception 'Week % is already approved. Change their boxes with − / + instead.', t.current_week;
  end if;
  if w.id is null then
    insert into public.ft_weeks (user_id, term_id, week) values (p_user, t.id, t.current_week) returning * into w;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]')) loop
    tr  := nullif(e->>'track', '');
    cid := nullif(e->>'connection_id', '')::uuid;
    pts := coalesce((e->>'points')::int, 0);
    if pts < 0 or pts > 3 then raise exception 'Each field is 0 to 3 points.'; end if;
    select * into old from public.ft_entries
     where week_id = w.id and ((tr is not null and track = tr) or (cid is not null and connection_id = cid));
    if pts = 0 then
      delete from public.ft_entries where id = old.id;
    elsif old.id is not null then
      update public.ft_entries set points = pts,
             note = coalesce(nullif(trim(e->>'note'), ''), old.note) where id = old.id;
    else
      insert into public.ft_entries (week_id, user_id, track, connection_id, points, note)
      values (w.id, p_user, tr, cid, pts, coalesce(nullif(trim(e->>'note'), ''), 'Set by the GM'));
    end if;
  end loop;

  if not exists (select 1 from public.ft_entries where week_id = w.id) then
    delete from public.ft_weeks where id = w.id;
    return null;
  end if;
  update public.ft_weeks set status = 'submitted' where id = w.id;
  return w.id;
end;
$$;
grant execute on function public.ft_gm_set_week(uuid, jsonb) to authenticated;
