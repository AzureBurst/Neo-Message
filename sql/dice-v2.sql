-- =====================================================================
--  Dice v2
--   * Aces: the server rolls one face at a time. When a die shows its
--     top face the roll waits, and the player taps to roll that die
--     again (sw_ace). Nothing is posted or applied until it's finished.
--   * No Success / Failure words anywhere. For a roll the GM asked
--     for, the GM marks it Pass or Fail (sw_verdict).
--  Run after mytime.sql. Safe to run more than once.
-- =====================================================================

alter table public.sw_rolls add column if not exists pending boolean not null default false;
alter table public.sw_rolls add column if not exists verdict text check (verdict in ('pass','fail'));
alter table public.sw_rolls add column if not exists verdict_at timestamptz;

-- Totals and the internal outcome (Free Time still needs it for boxes).
create or replace function public.sw_score(r public.sw_rolls) returns public.sw_rolls
language plpgsql immutable as $$
declare tt int; wt int;
begin
  tt := public.sw_sum(r.trait_rolls) + r.bonus + r.modifier + r.wound_mod;
  wt := case when r.wild_rolls is null then tt
             else public.sw_sum(r.wild_rolls) + r.bonus + r.modifier + r.wound_mod end;
  r.total := greatest(tt, wt);
  r.outcome := case when r.trait_rolls[1] = 1 and coalesce(r.wild_rolls[1], 1) = 1 and r.wild_rolls is not null then 'crit_fail'
                    when r.total >= 8 then 'raise' when r.total >= 4 then 'success' else 'fail' end;
  r.raises := case when r.outcome = 'crit_fail' then 0 else greatest(0, (r.total - 4) / 4) end;
  r.pending := r.trait_rolls[array_length(r.trait_rolls, 1)] = r.die and array_length(r.trait_rolls, 1) < 12
            or (r.wild_rolls is not null and r.wild_rolls[array_length(r.wild_rolls, 1)] = 6 and array_length(r.wild_rolls, 1) < 12);
  return r;
end;
$$;

-- The roll itself: one face on each die. Internal.
create or replace function public.sw_do_roll(
  p_user uuid, p_trait text, p_mod int, p_kind text, p_ctx uuid, p_req uuid,
  p_die int default null, p_prev public.sw_rolls default null, p_wounds boolean default true)
returns public.sw_rolls language plpgsql security definer set search_path = public as $$
declare
  s public.sw_sheets;
  key text := lower(trim(p_trait));
  die int := 4; bonus int := 0; lbl text := initcap(trim(p_trait));
  sk jsonb; wm int := 0; r public.sw_rolls;
begin
  select * into s from public.sw_sheets where user_id = p_user;
  if p_die is not null then
    die := p_die;
  elsif key in ('agility','smarts','spirit','strength','vigor') then
    die   := coalesce((s.attributes -> key ->> 'die')::int, 4);
    bonus := coalesce((s.attributes -> key ->> 'mod')::int, 0);
  else
    select x into sk from jsonb_array_elements(coalesce(s.skills, '[]')) x
     where lower(x->>'name') = key limit 1;
    if sk is not null then
      die := coalesce((sk->>'die')::int, 4); bonus := coalesce((sk->>'mod')::int, 0); lbl := sk->>'name';
    else
      die := 4; bonus := -2; lbl := lbl || ' (unskilled)';
    end if;
  end if;
  if die not in (4,6,8,10,12) then die := 4; end if;
  if p_wounds and s.user_id is not null then
    wm := -least(greatest(s.wounds, 0), 3) - least(greatest(s.fatigue, 0), 2);
  end if;

  r.id := gen_random_uuid(); r.user_id := p_user; r.trait := key; r.label := lbl;
  r.die := die; r.bonus := bonus; r.modifier := p_mod; r.wound_mod := wm;
  r.trait_rolls := array[1 + floor(random() * die)::int];
  r.wild_rolls  := array[1 + floor(random() * 6)::int];      -- player characters are Wild Cards
  r.context_kind := p_kind; r.context_id := p_ctx; r.request_id := p_req;
  r.rerolled_from := p_prev.id; r.benny_spent := p_prev.id is not null;
  r.created_at := now();
  r := public.sw_score(r);
  r.best_total := r.total; r.best_outcome := r.outcome;
  insert into public.sw_rolls select r.* returning * into r;
  return r;
end;
$$;
revoke all on function public.sw_do_roll(uuid,text,int,text,uuid,uuid,int,public.sw_rolls,boolean) from public, anon, authenticated;

-- A finished roll: keep the best of a Benny reroll, post it, apply it.
create or replace function public.sw_finish(p_roll uuid) returns public.sw_rolls
language plpgsql security definer set search_path = public as $$
declare r public.sw_rolls; prev public.sw_rolls; q public.sw_requests;
begin
  select * into r from public.sw_rolls where id = p_roll;
  if r.rerolled_from is not null then
    select * into prev from public.sw_rolls where id = r.rerolled_from;
    if r.outcome <> 'crit_fail' and prev.best_total > r.total then
      r.best_total := prev.best_total; r.best_outcome := prev.best_outcome;
    end if;
  end if;
  update public.sw_rolls set pending = false, best_total = r.best_total, best_outcome = r.best_outcome
   where id = r.id returning * into r;

  perform public.sw_post_roll(r);
  if r.context_kind = 'freetime' then perform public.ft_apply_roll(r.context_id, r); end if;

  if r.request_id is not null then
    select * into q from public.sw_requests where id = r.request_id;
    if q.kind <> 'message' and to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
      perform public.push_notification(q.created_by, 'mytime', 'sw_rolled',
        (select username from public.profiles where id = r.user_id) || ' rolled ' || r.label,
        r.best_total::text, case q.kind when 'queree' then 'queree.html#answer:' || q.context_id
                                        when 'flight' then 'flight.html' else 'mytime.html#gm' end, q.id, null);
    end if;
  end if;
  return r;
end;
$$;
revoke all on function public.sw_finish(uuid) from public, anon, authenticated;

-- Chat line: the number only. The GM decides what it means.
create or replace function public.sw_post_roll(r public.sw_rolls) returns void
language plpgsql security definer set search_path = public as $$
begin
  if r.context_kind = 'message' and r.context_id is not null then
    insert into public.messages (conversation_id, sender_id, body, kind, meta)
    values (r.context_id, r.user_id,
      '🎲 ' || r.label || ': ' || r.best_total || case when r.benny_spent then ' · Benny reroll' else '' end,
      'roll', to_jsonb(r));
  end if;
end;
$$;

-- Player taps an aced die to roll it again.
create or replace function public.sw_ace(p_roll uuid, p_which text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.sw_rolls; n int;
begin
  select * into r from public.sw_rolls where id = p_roll and user_id = auth.uid() for update;
  if r.id is null then raise exception 'That roll isn''t yours.'; end if;
  if not r.pending then raise exception 'That roll is already finished.'; end if;
  if p_which = 'wild' then
    if r.wild_rolls[array_length(r.wild_rolls, 1)] <> 6 then raise exception 'The Wild Die didn''t ace.'; end if;
    r.wild_rolls := r.wild_rolls || (1 + floor(random() * 6)::int);
  else
    if r.trait_rolls[array_length(r.trait_rolls, 1)] <> r.die then raise exception 'That die didn''t ace.'; end if;
    r.trait_rolls := r.trait_rolls || (1 + floor(random() * r.die)::int);
  end if;
  r := public.sw_score(r);
  update public.sw_rolls set trait_rolls = r.trait_rolls, wild_rolls = r.wild_rolls, total = r.total,
         outcome = r.outcome, raises = r.raises, pending = r.pending,
         best_total = r.total, best_outcome = r.outcome
   where id = r.id returning * into r;
  if not r.pending then r := public.sw_finish(r.id); end if;
  return to_jsonb(r);
end;
$$;

-- Player (or GM): roll a trait. Picks up an unfinished roll for the same request.
create or replace function public.sw_roll(
  p_trait text, p_mod int default 0, p_kind text default 'free',
  p_ctx uuid default null, p_request uuid default null, p_die int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); q public.sw_requests; r public.sw_rolls;
  m int := greatest(-10, least(10, coalesce(p_mod, 0)));
  k text := coalesce(p_kind, 'free'); c uuid := p_ctx; t text := p_trait;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_die is not null and not public.is_admin() then raise exception 'Only the GM picks a die directly.'; end if;
  if p_request is not null then
    select * into q from public.sw_requests where id = p_request;
    if q.id is null or not (me = any(q.targets)) then raise exception 'That roll isn''t for you.'; end if;
    if q.closed then raise exception 'The GM closed that roll.'; end if;
    select * into r from public.sw_rolls where request_id = q.id and user_id = me and pending limit 1;
    if r.id is not null then return to_jsonb(r); end if;          -- carry on with the aces
    if exists (select 1 from public.sw_rolls where request_id = q.id and user_id = me and rerolled_from is null) then
      raise exception 'You already rolled for this. Spend a Benny to reroll.';
    end if;
    k := q.kind; c := q.context_id; m := q.modifier;
    if p_trait is null or not (lower(trim(p_trait)) = any(
         array(select lower(trim(x)) from regexp_split_to_table(q.trait, '\s+or\s+|/|,') x))) then
      t := trim(split_part(regexp_replace(q.trait, '\s+or\s+|/', ',', 'g'), ',', 1));
    end if;
  elsif k = 'freetime' then
    raise exception 'Roll free time from MyTime.';
  end if;
  if k = 'message' and not (public.is_member(c) or public.is_admin()) then raise exception 'You''re not in that chat.'; end if;
  if coalesce(trim(t), '') = '' then raise exception 'Pick a trait.'; end if;

  r := public.sw_do_roll(me, t, m, k, c, p_request, p_die);
  if not r.pending then r := public.sw_finish(r.id); end if;
  return to_jsonb(r);
end;
$$;

-- Free time roll for one approved 1-point entry.
create or replace function public.ft_roll(p_entry uuid, p_trait text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.ft_entries; r public.sw_rolls; opts text[]; pen int;
begin
  select * into e from public.ft_entries where id = p_entry and user_id = auth.uid() for update;
  if e.id is null then raise exception 'That entry isn''t yours.'; end if;
  if e.status = 'pending' then raise exception 'Waiting for the GM to approve this week.'; end if;
  select * into r from public.sw_rolls where context_kind = 'freetime' and context_id = e.id and pending limit 1;
  if r.id is not null then return to_jsonb(r); end if;            -- carry on with the aces
  if e.status <> 'to_roll' then raise exception 'That one has already been rolled.'; end if;
  opts := case e.track when 'academics' then array['smarts','common knowledge']
                       when 'conditioning' then array['vigor','athletics']
                       when 'bonds' then array['persuasion','spirit']
                       when 'heroism' then array['spirit'] else array['focus'] end;
  if not (lower(trim(p_trait)) = any(opts)) then
    raise exception '% rolls % only.', initcap(e.track), array_to_string(opts, ' or ');
  end if;
  pen := coalesce(public.ft_penalty(public.ft_boxes(e.user_id, e.track)), -3);
  update public.ft_entries set penalty = pen where id = e.id;
  r := public.sw_do_roll(e.user_id, p_trait, pen, 'freetime', e.id, null, null, null, false);
  if not r.pending then r := public.sw_finish(r.id); end if;
  return to_jsonb(r);
end;
$$;

-- Spend a Benny to reroll and keep the better total.
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
  update public.sw_sheets set bennies = bennies - 1 where user_id = auth.uid() and bennies > 0
    returning bennies into left_;
  if left_ is null then raise exception 'You''re out of Bennies.'; end if;
  r := public.sw_do_roll(prev.user_id, prev.trait, prev.modifier, prev.context_kind, prev.context_id,
                         prev.request_id, null, prev, prev.context_kind <> 'freetime');
  if not r.pending then r := public.sw_finish(r.id); end if;
  return to_jsonb(r) || jsonb_build_object('bennies_left', left_);
end;
$$;

-- GM: Pass or Fail on a roll they asked for (null clears it).
create or replace function public.sw_verdict(p_roll uuid, p_verdict text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.sw_rolls;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  if p_verdict is not null and p_verdict not in ('pass','fail') then raise exception 'Pass or fail.'; end if;
  update public.sw_rolls set verdict = p_verdict, verdict_at = now() where id = p_roll returning * into r;
  if r.id is null then raise exception 'That roll is gone.'; end if;
  -- Keep the chat card in step.
  update public.messages set meta = coalesce(meta, '{}') || jsonb_build_object('verdict', p_verdict)
   where kind = 'roll' and meta->>'id' = r.id::text;
  if p_verdict is not null and to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(r.user_id, case r.context_kind when 'message' then 'messages'
        when 'queree' then 'queree' when 'flight' then 'flight' else 'mytime' end, 'sw_verdict',
      r.label || ': ' || case p_verdict when 'pass' then 'Passed' else 'Failed' end,
      'The GM made the call on your ' || r.best_total || '.',
      case r.context_kind when 'message' then 'app.html?c=' || r.context_id
                          when 'queree' then 'queree.html?s=' || r.context_id
                          when 'flight' then 'flight.html' else 'mytime.html' end, r.id, null);
  end if;
end;
$$;

grant execute on function public.sw_ace(uuid, text)      to authenticated;
grant execute on function public.sw_verdict(uuid, text)  to authenticated;
grant execute on function public.sw_roll(text,int,text,uuid,uuid,int) to authenticated;
grant execute on function public.ft_roll(uuid,text)      to authenticated;
grant execute on function public.sw_reroll(uuid)         to authenticated;

-- Chat cards update live when the GM rules on them.
alter table public.messages replica identity full;
