-- =====================================================================
--  MyTime: the GM judges free time rolls, and the transcript shop
--
--  1. Free time rolls no longer fill boxes on their own. The roll waits
--     for the GM, who looks at it and decides: 2 boxes, 1 box or none,
--     and whether it brings a complication (normally only a critical
--     failure, 1 on both dice). The player is told when it's decided.
--
--  2. The shop: the GM offers upgrades (a trait or skill increase, an
--     edge, anything) to everyone or to one character. Players pick one
--     from their transcript; the GM is told, updates the transcript by
--     hand, and marks the request done (or turns it down).
--
--  Run after mytime.sql and dice-v2.sql. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Judging free time rolls
-- ---------------------------------------------------------------------

-- A new step between "rolled" and "done": judging (waiting on the GM).
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.ft_entries'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.ft_entries drop constraint %I', c);
  end loop;
end $$;
alter table public.ft_entries add constraint ft_entries_status_check
  check (status in ('pending', 'to_roll', 'judging', 'rolled', 'filled'));

-- When a free time roll finishes: hand it to the GM instead of filling boxes.
create or replace function public.ft_apply_roll(p_entry uuid, r public.sw_rolls) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ft_entries;
begin
  select * into e from public.ft_entries where id = p_entry;
  if e.id is null or e.status = 'rolled' then return; end if;     -- already decided
  update public.ft_entries set status = 'judging', roll_id = r.id where id = e.id;
  perform public.ft_notify_admins('ft_judge', 'Free time roll to judge',
    (select username from public.profiles where id = e.user_id) || ' · ' || initcap(e.track)
      || ' (' || r.label || ' ' || r.best_total || ')', e.id);
end;
$$;
revoke all on function public.ft_apply_roll(uuid, public.sw_rolls) from public, anon, authenticated;

-- GM: decide a free time roll (or change the decision later).
create or replace function public.ft_judge(p_entry uuid, p_boxes int, p_complication boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare e public.ft_entries; got int; total int;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  if p_boxes is null or p_boxes not between 0 and 2 then raise exception 'Pick 0, 1 or 2 boxes.'; end if;
  select * into e from public.ft_entries where id = p_entry for update;
  if e.id is null then raise exception 'That entry is gone.'; end if;
  if e.status not in ('judging', 'rolled') then raise exception 'That one hasn''t been rolled yet.'; end if;

  got := public.ft_add_boxes(e.user_id, e.track, p_boxes - coalesce(e.boxes_gained, 0));
  total := coalesce(e.boxes_gained, 0) + got;
  update public.ft_entries
     set status = 'rolled', boxes_gained = total, complication = coalesce(p_complication, false)
   where id = e.id;

  if not exists (select 1 from public.ft_entries where week_id = e.week_id and status in ('to_roll', 'judging')) then
    update public.ft_weeks set status = 'resolved' where id = e.week_id and status = 'approved';
  end if;

  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(e.user_id, 'mytime', 'ft_judged',
      'Free time: ' || initcap(e.track),
      case when total = 0 then 'No boxes' when total = 1 then '+1 box' else '+' || total || ' boxes' end
        || case when p_complication then ' · complication' else '' end,
      'mytime.html#freetime', e.id, null);
  end if;
end;
$$;
grant execute on function public.ft_judge(uuid, int, boolean) to authenticated;

-- A Benny reroll is fine while the GM hasn't decided; not after.
create or replace function public.sw_reroll(p_roll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev public.sw_rolls; r public.sw_rolls; left_ int;
begin
  select * into prev from public.sw_rolls where id = p_roll and user_id = auth.uid();
  if prev.id is null then raise exception 'That roll isn''t yours.'; end if;
  if prev.pending then raise exception 'Finish rolling first.'; end if;
  if prev.outcome = 'crit_fail' then raise exception 'Snake eyes can''t be rerolled.'; end if;
  if exists (select 1 from public.sw_rolls where rerolled_from = prev.id) then
    raise exception 'Reroll the latest result instead.';
  end if;
  if prev.context_kind = 'freetime' and exists (
       select 1 from public.ft_entries where id = prev.context_id and status = 'rolled') then
    raise exception 'The GM has already made the call on that roll.';
  end if;
  update public.sw_sheets set bennies = bennies - 1 where user_id = auth.uid() and bennies > 0
    returning bennies into left_;
  if left_ is null then raise exception 'You''re out of Bennies.'; end if;
  r := public.sw_do_roll(prev.user_id, prev.trait, prev.modifier, prev.context_kind, prev.context_id,
                         prev.request_id, null, prev, prev.context_kind <> 'freetime');
  if not r.pending then r := public.sw_finish(r.id); end if;
  return to_jsonb(r) || jsonb_build_object('bennies_left', left_);
end;
$$;
grant execute on function public.sw_reroll(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  2. The transcript shop
-- ---------------------------------------------------------------------

create table if not exists public.mt_shop_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'other' check (kind in ('trait', 'edge', 'other')),
  name        text not null check (length(trim(name)) between 1 and 120),
  description text,
  cost        text,                                   -- free text, e.g. "1 advance"
  for_user    uuid references public.profiles(id) on delete cascade,   -- null = everyone
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.mt_shop_requests (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid references public.mt_shop_items(id) on delete set null,
  item_name   text not null,                          -- kept if the offer is removed
  kind        text not null default 'other',
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  choice      text,                                   -- e.g. which skill to raise
  note        text,
  status      text not null default 'requested' check (status in ('requested', 'done', 'declined')),
  gm_note     text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists mt_shop_req_user on public.mt_shop_requests (user_id, created_at desc);

alter table public.mt_shop_items    enable row level security;
alter table public.mt_shop_requests enable row level security;

drop policy if exists shop_items_read  on public.mt_shop_items;
drop policy if exists shop_items_write on public.mt_shop_items;
create policy shop_items_read on public.mt_shop_items for select to authenticated
  using (public.is_admin() or (active and (for_user is null or for_user = auth.uid())));
create policy shop_items_write on public.mt_shop_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists shop_req_read   on public.mt_shop_requests;
drop policy if exists shop_req_insert on public.mt_shop_requests;
drop policy if exists shop_req_update on public.mt_shop_requests;
drop policy if exists shop_req_delete on public.mt_shop_requests;
create policy shop_req_read on public.mt_shop_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy shop_req_insert on public.mt_shop_requests for insert to authenticated
  with check (public.is_admin() or (user_id = auth.uid() and status = 'requested' and gm_note is null));
create policy shop_req_update on public.mt_shop_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Players can take back a pick the GM hasn't dealt with yet.
create policy shop_req_delete on public.mt_shop_requests for delete to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'requested'));

grant all on public.mt_shop_items, public.mt_shop_requests to authenticated;

-- Players can only pick what's actually offered to them.
create or replace function public.shop_check_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare it public.mt_shop_items;
begin
  if public.is_admin() then return new; end if;
  select * into it from public.mt_shop_items where id = new.item_id;
  if it.id is null or not it.active or (it.for_user is not null and it.for_user <> new.user_id) then
    raise exception 'That isn''t on offer.';
  end if;
  new.item_name := it.name; new.kind := it.kind;
  if exists (select 1 from public.mt_shop_requests where user_id = new.user_id and item_id = it.id and status = 'requested') then
    raise exception 'You''ve already picked that one. The GM will get to it.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_shop_check on public.mt_shop_requests;
create trigger trg_shop_check before insert on public.mt_shop_requests
  for each row execute function public.shop_check_request();

-- Tell the GM about a pick, and the player about the answer.
create or replace function public.shop_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  if tg_op = 'INSERT' and not public.is_admin() then
    perform public.ft_notify_admins('shop_request', 'Shop pick',
      (select username from public.profiles where id = new.user_id) || ' · ' || new.item_name
        || coalesce(' (' || nullif(trim(new.choice), '') || ')', ''), new.id);
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.status in ('done', 'declined') then
    perform public.push_notification(new.user_id, 'mytime', 'shop_answer',
      new.item_name || case new.status when 'done' then ': added to your transcript' else ': not this time' end,
      coalesce(new.gm_note, ''), 'mytime.html#transcript', new.id, null);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_shop_notify on public.mt_shop_requests;
create trigger trg_shop_notify after insert or update on public.mt_shop_requests
  for each row execute function public.shop_notify();

do $$ begin
  alter publication supabase_realtime add table public.mt_shop_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
