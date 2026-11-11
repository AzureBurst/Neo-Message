-- =====================================================================
--  MyTime + Free Time + Savage Worlds dice
--
--  1. MyTime profiles (players write these; everyone can read them)
--  2. Character sheets (the GM writes these; a player reads their own)
--  3. Free Time: terms, tracks, connections, reputation, weekly entries
--  4. Dice: every roll happens on the server so nobody can fake one
--  5. Roll requests from the GM (Messages, Queree, Flight, MyTime)
--
--  Needs schema.sql, groups.sql and notifications-v2.sql first.
--  Safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. MyTime profiles
-- ---------------------------------------------------------------------

create table if not exists public.mt_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  char_name      text,
  headline       text,             -- the quote under your name
  mood           text,
  photo_url      text,             -- character skin / picture
  height_weight  text,
  status         text,
  birthday       text,
  birthplace     text,
  favorite_hero  text,
  likes          text,
  dislikes       text,
  social_class   text,
  languages      text,
  about_me       text,
  want_to_meet   text,
  relationships  text,
  song           text,             -- "now playing" on your page
  theme          text default 'classic',
  top8           uuid[] not null default '{}',
  updated_at     timestamptz not null default now()
);

-- Fears / biggest secret: only the player and the GM can see it.
create table if not exists public.mt_private (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  secret   text,
  social_class text,
  languages    text,
  updated_at timestamptz not null default now()
);

create table if not exists public.mt_comments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists mt_comments_profile on public.mt_comments (profile_id, created_at desc);

alter table public.mt_profiles enable row level security;
alter table public.mt_private  enable row level security;
alter table public.mt_comments enable row level security;

drop policy if exists mtp_read  on public.mt_profiles;
drop policy if exists mtp_write on public.mt_profiles;
create policy mtp_read  on public.mt_profiles for select to authenticated using (true);
create policy mtp_write on public.mt_profiles for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists mtx_all on public.mt_private;
create policy mtx_all on public.mt_private for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists mtc_read on public.mt_comments;
drop policy if exists mtc_add  on public.mt_comments;
drop policy if exists mtc_del  on public.mt_comments;
create policy mtc_read on public.mt_comments for select to authenticated using (true);
create policy mtc_add  on public.mt_comments for insert to authenticated with check (author_id = auth.uid());
create policy mtc_del  on public.mt_comments for delete to authenticated
  using (author_id = auth.uid() or profile_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
--  2. Character sheets (GM-written)
-- ---------------------------------------------------------------------

create table if not exists public.sw_sheets (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  attributes   jsonb not null default
    '{"agility":{"die":4,"mod":0},"smarts":{"die":4,"mod":0},"spirit":{"die":4,"mod":0},"strength":{"die":4,"mod":0},"vigor":{"die":4,"mod":0}}',
  skills       jsonb not null default
    '[{"name":"Athletics","attr":"agility","die":4,"mod":0},{"name":"Common Knowledge","attr":"smarts","die":4,"mod":0},{"name":"Notice","attr":"smarts","die":4,"mod":0},{"name":"Persuasion","attr":"spirit","die":4,"mod":0},{"name":"Stealth","attr":"agility","die":4,"mod":0},{"name":"Focus","attr":"spirit","die":4,"mod":0},{"name":"Academics","attr":"smarts","die":4,"mod":0}]',
  attr_points  int not null default 0,
  skill_points int not null default 0,
  derived      jsonb not null default '{}',   -- overrides: parry, toughness, pace, dash, encumbrance, carry, armor
  power        jsonb not null default '{}',   -- {name, level, abilities:[{name,level,desc}], trigger, tells, weaknesses}
  edges        jsonb not null default '[]',   -- [{name, desc}]
  hindrances   jsonb not null default '[]',   -- [{name, severity, desc}]
  gear         jsonb not null default '[]',   -- [{name, notes}]
  suits        jsonb not null default '[]',   -- [{name, notes}]
  bennies      int not null default 3,
  wounds       int not null default 0,
  fatigue      int not null default 0,
  gm_notes     text,
  updated_at   timestamptz not null default now()
);

alter table public.sw_sheets enable row level security;
drop policy if exists sws_read  on public.sw_sheets;
drop policy if exists sws_write on public.sw_sheets;
create policy sws_read  on public.sw_sheets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sws_write on public.sw_sheets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
--  3. Free Time
-- ---------------------------------------------------------------------

create table if not exists public.ft_terms (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Term 1',
  weeks        int  not null default 16,
  current_week int  not null default 1,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Track progress carries across terms. Boxes 0–18.
create table if not exists public.ft_progress (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  track    text not null check (track in ('academics','conditioning','bonds','heroism','control')),
  boxes    int  not null default 0 check (boxes between 0 and 18),
  primary key (user_id, track)
);

create table if not exists public.ft_connections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  about        text,
  gate         text,                     -- what it takes before you can start
  gate_cleared boolean not null default false,
  boxes        int not null default 0 check (boxes between 0 and 5),
  created_at   timestamptz not null default now()
);

create table if not exists public.ft_reputation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level   text not null default 'Unknown'
          check (level in ('Disgraced','Unknown','Promising','Rising Star','Household Name')),
  updated_at timestamptz not null default now()
);

create table if not exists public.ft_plans (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  term_id   uuid not null references public.ft_terms(id) on delete cascade,
  toward    text, sliding text, deadlines text,
  primary key (user_id, term_id)
);

create table if not exists public.ft_weeks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  term_id     uuid not null references public.ft_terms(id) on delete cascade,
  week        int  not null,
  status      text not null default 'submitted'
              check (status in ('submitted','returned','approved','resolved')),
  gm_note     text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, term_id, week)
);

create table if not exists public.ft_entries (
  id            uuid primary key default gen_random_uuid(),
  week_id       uuid not null references public.ft_weeks(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  track         text check (track in ('academics','conditioning','bonds','heroism','control')),
  connection_id uuid references public.ft_connections(id) on delete set null,
  points        int  not null check (points between 1 and 3),
  note          text not null check (length(trim(note)) >= 3),
  status        text not null default 'pending'
                check (status in ('pending','to_roll','rolled','filled')),
  penalty       int,
  roll_id       uuid,
  boxes_gained  int,
  complication  boolean not null default false,
  created_at    timestamptz not null default now(),
  check ((track is null) <> (connection_id is null))
);

alter table public.ft_terms       enable row level security;
alter table public.ft_progress    enable row level security;
alter table public.ft_connections enable row level security;
alter table public.ft_reputation  enable row level security;
alter table public.ft_plans       enable row level security;
alter table public.ft_weeks       enable row level security;
alter table public.ft_entries     enable row level security;

drop policy if exists ftt_read on public.ft_terms;
drop policy if exists ftt_gm   on public.ft_terms;
create policy ftt_read on public.ft_terms for select to authenticated using (true);
create policy ftt_gm   on public.ft_terms for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['ft_progress','ft_connections','ft_weeks','ft_entries'] loop
    execute format('drop policy if exists own_read on public.%I', t);
    execute format('drop policy if exists gm_write on public.%I', t);
    execute format('create policy own_read on public.%I for select to authenticated
                      using (user_id = auth.uid() or public.is_admin())', t);
    execute format('create policy gm_write on public.%I for all to authenticated
                      using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists ftr_read on public.ft_reputation;
drop policy if exists ftr_gm   on public.ft_reputation;
create policy ftr_read on public.ft_reputation for select to authenticated using (true);
create policy ftr_gm   on public.ft_reputation for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists ftp_all on public.ft_plans;
create policy ftp_all on public.ft_plans for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Box maths. Stages: Rank 2 = boxes 1–3, Rank 3 = 4–7, Rank 4 = 8–12, Rank 5 = 13–18.
create or replace function public.ft_rank(b int) returns int language sql immutable as $$
  select 1 + (b >= 3)::int + (b >= 7)::int + (b >= 12)::int + (b >= 18)::int;
$$;
create or replace function public.ft_penalty(b int) returns int language sql immutable as $$
  select case when b < 3 then 0 when b < 7 then -1 when b < 12 then -2 when b < 18 then -3 else null end;
$$;

create or replace function public.ft_boxes(p_user uuid, p_track text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select boxes from public.ft_progress where user_id = p_user and track = p_track), 0);
$$;

-- The most boxes a track may hold right now (Control's gate).
create or replace function public.ft_cap(p_user uuid, p_track text) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if p_track <> 'control' then return 18; end if;
  if public.ft_rank(public.ft_boxes(p_user, 'conditioning')) < 3 then return 7; end if;
  if public.ft_rank(public.ft_boxes(p_user, 'heroism')) < 3 then return 12; end if;
  return 18;
end;
$$;

create or replace function public.ft_add_boxes(p_user uuid, p_track text, p_n int) returns int
language plpgsql security definer set search_path = public as $$
declare before int; after int;
begin
  before := public.ft_boxes(p_user, p_track);
  after  := greatest(0, least(public.ft_cap(p_user, p_track), before + p_n));
  if p_n < 0 then after := greatest(0, before + p_n); end if;
  insert into public.ft_progress (user_id, track, boxes) values (p_user, p_track, after)
    on conflict (user_id, track) do update set boxes = excluded.boxes;
  return after - before;
end;
$$;

create or replace function public.ft_active_term() returns public.ft_terms
language sql stable security definer set search_path = public as $$
  select * from public.ft_terms where active order by created_at desc limit 1;
$$;

create or replace function public.ft_notify_admins(p_kind text, p_title text, p_body text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return; end if;
  for a in select id from public.profiles where is_admin loop
    perform public.push_notification(a, 'mytime', p_kind, p_title, p_body, 'mytime.html#gm', p_ref, null);
  end loop;
end;
$$;

-- Player: submit (or resubmit) this week's free time.
-- p_entries: [{track | connection_id, points, note}]
create or replace function public.ft_submit(p_entries jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.ft_terms;
  w public.ft_weeks;
  e jsonb;
  total int := 0;
  seen text[] := '{}';
  key text; tr text; cid uuid; pts int; nt text; b int; pen int; c public.ft_connections;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  t := public.ft_active_term();
  if t.id is null then raise exception 'There is no active term yet — ask the GM.'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Spend at least one point.';
  end if;

  select * into w from public.ft_weeks where user_id = me and term_id = t.id and week = t.current_week;
  if w.id is not null and w.status in ('approved','resolved') then
    raise exception 'Week % is already approved.', t.current_week;
  end if;

  for e in select * from jsonb_array_elements(p_entries) loop
    tr  := nullif(e->>'track', '');
    cid := nullif(e->>'connection_id', '')::uuid;
    pts := (e->>'points')::int;
    nt  := trim(coalesce(e->>'note', ''));
    if pts is null or pts < 1 or pts > 3 then raise exception 'Each entry is 1, 2 or 3 points.'; end if;
    if length(nt) < 3 then raise exception 'Say what your character actually did for every entry.'; end if;
    total := total + pts;
    key := coalesce(tr, cid::text);
    if key = any(seen) then raise exception 'Only one entry per track per week.'; end if;
    seen := seen || key;

    if tr is not null then
      if tr not in ('academics','conditioning','bonds','heroism','control') then raise exception 'Unknown track %.', tr; end if;
      b := public.ft_boxes(me, tr);
      if b >= public.ft_cap(me, tr) then
        raise exception '% can''t take more boxes right now.', initcap(tr);
      end if;
      pen := public.ft_penalty(b);
      if pts = 2 and pen < -1 then
        raise exception 'Putting 2 in % only works at −0 or −1. Use 1 (roll) or 3.', initcap(tr);
      end if;
    else
      select * into c from public.ft_connections where id = cid and user_id = me;
      if c.id is null then raise exception 'That connection isn''t yours.'; end if;
      if not c.gate_cleared then raise exception 'Clear the gate with % first.', c.name; end if;
      if c.boxes + pts > 5 then raise exception '% only has % box(es) left.', c.name, 5 - c.boxes; end if;
    end if;
  end loop;

  if total > 3 then raise exception 'You only get 3 points a week.'; end if;

  if w.id is null then
    insert into public.ft_weeks (user_id, term_id, week) values (me, t.id, t.current_week) returning * into w;
  else
    update public.ft_weeks set status = 'submitted', gm_note = null, created_at = now() where id = w.id;
    delete from public.ft_entries where week_id = w.id;
  end if;

  insert into public.ft_entries (week_id, user_id, track, connection_id, points, note)
  select w.id, me, nullif(x->>'track',''), nullif(x->>'connection_id','')::uuid,
         (x->>'points')::int, trim(x->>'note')
    from jsonb_array_elements(p_entries) x;

  perform public.ft_notify_admins('ft_submitted', 'Free time to review',
    (select username from public.profiles where id = me) || ' · week ' || t.current_week, w.id);
  return w.id;
end;
$$;

-- Player: withdraw an unreviewed week.
create or replace function public.ft_withdraw(p_week uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ft_weeks where id = p_week and user_id = auth.uid() and status in ('submitted','returned');
end;
$$;

-- Player: start a connection (the GM sets its gate).
create or replace function public.ft_add_connection(p_name text, p_about text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Give them a name.'; end if;
  insert into public.ft_connections (user_id, name, about)
    values (auth.uid(), trim(p_name), nullif(trim(p_about),'')) returning ft_connections.id into new_id;
  perform public.ft_notify_admins('ft_connection', 'New connection',
    (select username from public.profiles p where p.id = auth.uid()) || ' → ' || trim(p_name), new_id);
  return new_id;
end;
$$;

-- GM: approve or send back a week.
create or replace function public.ft_review(p_week uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  w public.ft_weeks;
  e public.ft_entries;
  got int;
  rolls int := 0;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  select * into w from public.ft_weeks where id = p_week for update;
  if w.id is null then raise exception 'That week no longer exists.'; end if;
  if w.status <> 'submitted' then raise exception 'That week was already reviewed.'; end if;

  if not p_approve then
    update public.ft_weeks set status = 'returned', gm_note = nullif(trim(p_note),''), reviewed_at = now() where id = w.id;
    if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
      perform public.push_notification(w.user_id, 'mytime', 'ft_returned', 'Free time sent back',
        coalesce(nullif(trim(p_note),''), 'The GM wants a change before approving.'), 'mytime.html#freetime', w.id, null);
    end if;
    return;
  end if;

  for e in select * from public.ft_entries where week_id = w.id loop
    if e.connection_id is not null then
      update public.ft_connections set boxes = least(5, boxes + e.points) where id = e.connection_id;
      update public.ft_entries set status = 'filled', boxes_gained = e.points where id = e.id;
    elsif e.points >= 2 then
      got := public.ft_add_boxes(w.user_id, e.track, 1);
      update public.ft_entries set status = 'filled', boxes_gained = got,
             penalty = public.ft_penalty(public.ft_boxes(w.user_id, e.track) - got) where id = e.id;
    else
      update public.ft_entries set status = 'to_roll' where id = e.id;
      rolls := rolls + 1;
    end if;
  end loop;

  update public.ft_weeks set status = case when rolls > 0 then 'approved' else 'resolved' end,
         gm_note = nullif(trim(p_note),''), reviewed_at = now() where id = w.id;

  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(w.user_id, 'mytime', 'ft_approved', 'Free time approved',
      case when rolls > 0 then 'Time to roll — ' || rolls || ' track' || case when rolls > 1 then 's' else '' end || ' waiting.'
           else 'Your boxes are filled.' end, 'mytime.html#freetime', w.id, null);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  4. Dice
-- ---------------------------------------------------------------------

create table if not exists public.sw_requests (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('message','queree','flight','mytime')),
  context_id  uuid,
  targets     uuid[] not null,
  trait       text not null,
  modifier    int  not null default 0,
  note        text,
  closed      boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.sw_rolls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  trait         text not null,
  label         text not null,
  die           int  not null,
  bonus         int  not null default 0,     -- d12+1 style bonus, or −2 unskilled
  modifier      int  not null default 0,     -- situational, from the request or the player
  wound_mod     int  not null default 0,
  trait_rolls   int[] not null,
  wild_rolls    int[],
  total         int  not null,
  outcome       text not null check (outcome in ('crit_fail','fail','success','raise')),
  raises        int  not null default 0,
  best_total    int  not null,
  best_outcome  text not null,
  context_kind  text not null default 'free',
  context_id    uuid,
  request_id    uuid references public.sw_requests(id) on delete set null,
  rerolled_from uuid references public.sw_rolls(id) on delete set null,
  benny_spent   boolean not null default false,
  created_at    timestamptz not null default now(),
  story_at      timestamptz
);
create index if not exists sw_rolls_user on public.sw_rolls (user_id, created_at desc);
create index if not exists sw_rolls_req  on public.sw_rolls (request_id);
create index if not exists sw_rolls_prev on public.sw_rolls (rerolled_from);

alter table public.sw_requests enable row level security;
alter table public.sw_rolls    enable row level security;
drop policy if exists swq_read on public.sw_requests;
drop policy if exists swq_gm   on public.sw_requests;
create policy swq_read on public.sw_requests for select to authenticated
  using (public.is_admin() or auth.uid() = any(targets));
create policy swq_gm on public.sw_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists swr_read on public.sw_rolls;
create policy swr_read on public.sw_rolls for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Messages can now carry rolls and roll requests.
alter table public.messages add column if not exists meta jsonb;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'system', 'roll', 'roll_request'));

-- One die, acing (exploding) on its top face.
create or replace function public.sw_explode(sides int) returns int[]
language plpgsql volatile as $$
declare out int[] := '{}'; r int;
begin
  loop
    r := 1 + floor(random() * sides)::int;
    out := out || r;
    exit when r < sides or array_length(out, 1) >= 12;
  end loop;
  return out;
end;
$$;

create or replace function public.sw_sum(a int[]) returns int language sql immutable as $$
  select coalesce(sum(x), 0)::int from unnest(a) x;
$$;

create or replace function public.sw_rank_outcome(o text) returns int language sql immutable as $$
  select case o when 'crit_fail' then 0 when 'fail' then 1 when 'success' then 2 else 3 end;
$$;

-- The roll itself. Internal: not callable from the app.
create or replace function public.sw_do_roll(
  p_user uuid, p_trait text, p_mod int, p_kind text, p_ctx uuid, p_req uuid,
  p_die int default null, p_prev public.sw_rolls default null, p_wounds boolean default true)
returns public.sw_rolls language plpgsql security definer set search_path = public as $$
declare
  s public.sw_sheets;
  key text := lower(trim(p_trait));
  die int := 4; bonus int := 0; lbl text := initcap(trim(p_trait));
  sk jsonb; wm int := 0;
  tr int[]; wr int[]; tt int; wt int; tot int; oc text; r public.sw_rolls;
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

  tr := public.sw_explode(die);
  wr := public.sw_explode(6);                 -- player characters are Wild Cards
  tt := public.sw_sum(tr) + bonus + p_mod + wm;
  wt := public.sw_sum(wr) + bonus + p_mod + wm;
  tot := greatest(tt, wt);
  oc := case when tr[1] = 1 and wr[1] = 1 then 'crit_fail'
             when tot >= 8 then 'raise' when tot >= 4 then 'success' else 'fail' end;

  insert into public.sw_rolls (user_id, trait, label, die, bonus, modifier, wound_mod, trait_rolls, wild_rolls,
      total, outcome, raises, best_total, best_outcome, context_kind, context_id, request_id,
      rerolled_from, benny_spent)
  values (p_user, key, lbl, die, bonus, p_mod, wm, tr, wr, tot, oc,
      case when oc = 'crit_fail' then 0 else greatest(0, (tot - 4) / 4) end,
      case when p_prev.id is not null and (oc = 'crit_fail' or p_prev.best_total > tot) then p_prev.best_total else tot end,
      case when p_prev.id is not null and public.sw_rank_outcome(p_prev.best_outcome) > public.sw_rank_outcome(oc)
           then p_prev.best_outcome else oc end,
      p_kind, p_ctx, p_req, p_prev.id, p_prev.id is not null)
  returning * into r;
  return r;
end;
$$;
revoke all on function public.sw_do_roll(uuid,text,int,text,uuid,uuid,int,public.sw_rolls,boolean) from public, anon, authenticated;

create or replace function public.sw_word(o text) returns text language sql immutable as $$
  select case o when 'crit_fail' then 'Critical Failure' when 'fail' then 'Failure'
                when 'success' then 'Success' else 'Raise' end;
$$;

-- Posts a roll into its chat, if it was made in one.
create or replace function public.sw_post_roll(r public.sw_rolls) returns void
language plpgsql security definer set search_path = public as $$
begin
  if r.context_kind = 'message' and r.context_id is not null then
    insert into public.messages (conversation_id, sender_id, body, kind, meta)
    values (r.context_id, r.user_id,
      '🎲 ' || r.label || ': ' || r.best_total || ' (' || public.sw_word(r.best_outcome) || ')'
        || case when r.benny_spent then ' · Benny reroll' else '' end,
      'roll', to_jsonb(r));
  end if;
end;
$$;

-- Freetime: work out boxes from the (best) result.
create or replace function public.ft_apply_roll(p_entry uuid, r public.sw_rolls) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ft_entries; want int; got int;
begin
  select * into e from public.ft_entries where id = p_entry;
  want := case r.best_outcome when 'raise' then 2 when 'success' then 1 else 0 end;
  -- On a Benny reroll only the improvement is added.
  got := public.ft_add_boxes(e.user_id, e.track, want - coalesce(e.boxes_gained, 0));
  update public.ft_entries
     set status = 'rolled', roll_id = r.id,
         boxes_gained = coalesce(e.boxes_gained, 0) + got,
         complication = (r.best_outcome in ('fail','crit_fail'))
   where id = e.id;
  if not exists (select 1 from public.ft_entries where week_id = e.week_id and status = 'to_roll') then
    update public.ft_weeks set status = 'resolved' where id = e.week_id;
  end if;
  if r.best_outcome in ('fail','crit_fail') and not r.benny_spent then
    perform public.ft_notify_admins('ft_complication', 'Complication earned',
      (select username from public.profiles where id = e.user_id) || ' · ' || initcap(e.track) || ' (' || r.label || ' ' || r.total || ')', e.id);
  end if;
end;
$$;

-- Player (or GM): roll a trait.
create or replace function public.sw_roll(
  p_trait text, p_mod int default 0, p_kind text default 'free',
  p_ctx uuid default null, p_request uuid default null, p_die int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q public.sw_requests;
  r public.sw_rolls;
  m int := greatest(-10, least(10, coalesce(p_mod, 0)));
  k text := coalesce(p_kind, 'free');
  c uuid := p_ctx;
  t text := p_trait;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if p_die is not null and not public.is_admin() then raise exception 'Only the GM picks a die directly.'; end if;

  if p_request is not null then
    select * into q from public.sw_requests where id = p_request;
    if q.id is null or not (me = any(q.targets)) then raise exception 'That roll isn''t for you.'; end if;
    if q.closed then raise exception 'The GM closed that roll.'; end if;
    if exists (select 1 from public.sw_rolls where request_id = q.id and user_id = me and rerolled_from is null) then
      raise exception 'You already rolled for this — spend a Benny to reroll.';
    end if;
    k := q.kind; c := q.context_id; m := q.modifier;
    -- A request may offer a choice ("Smarts or Common Knowledge").
    if p_trait is null or not (lower(trim(p_trait)) = any(
         array(select lower(trim(x)) from regexp_split_to_table(q.trait, '\s+or\s+|/|,') x))) then
      t := trim(split_part(regexp_replace(q.trait, '\s+or\s+|/', ',', 'g'), ',', 1));
    end if;
  elsif k = 'freetime' then
    raise exception 'Roll free time from MyTime.';
  end if;

  if k = 'message' and not (public.is_member(c) or public.is_admin()) then
    raise exception 'You''re not in that chat.';
  end if;
  if coalesce(trim(t), '') = '' then raise exception 'Pick a trait.'; end if;

  r := public.sw_do_roll(me, t, m, k, c, p_request, p_die);
  perform public.sw_post_roll(r);

  if q.id is not null and q.kind <> 'message'
     and to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(q.created_by, 'mytime', 'sw_rolled',
      (select username from public.profiles where id = me) || ' rolled ' || r.label,
      r.total || ' — ' || public.sw_word(r.outcome),
      case q.kind when 'queree' then 'queree.html#answer:' || q.context_id
                  when 'flight' then 'flight.html' else 'mytime.html#gm' end, q.id, null);
  end if;
  return to_jsonb(r);
end;
$$;

-- Player: free time roll for one approved 1-point entry.
create or replace function public.ft_roll(p_entry uuid, p_trait text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.ft_entries; r public.sw_rolls; opts text[]; pen int;
begin
  select * into e from public.ft_entries where id = p_entry and user_id = auth.uid() for update;
  if e.id is null then raise exception 'That entry isn''t yours.'; end if;
  if e.status = 'pending' then raise exception 'Waiting for the GM to approve this week.'; end if;
  if e.status <> 'to_roll' then raise exception 'That one has already been resolved.'; end if;
  opts := case e.track when 'academics' then array['smarts','common knowledge']
                       when 'conditioning' then array['vigor','athletics']
                       when 'bonds' then array['persuasion','spirit']
                       when 'heroism' then array['spirit'] else array['focus'] end;
  if not (lower(trim(p_trait)) = any(opts)) then
    raise exception '% rolls % only.', initcap(e.track), array_to_string(opts, ' or ');
  end if;
  -- The penalty of the stage you're in when you roll (a raise may spill over).
  pen := coalesce(public.ft_penalty(public.ft_boxes(e.user_id, e.track)), -3);
  update public.ft_entries set penalty = pen where id = e.id;
  r := public.sw_do_roll(e.user_id, p_trait, pen, 'freetime', e.id, null, null, null, false);
  perform public.ft_apply_roll(e.id, r);
  return to_jsonb(r);
end;
$$;

-- Spend a Benny to reroll. You keep the best result.
create or replace function public.sw_reroll(p_roll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prev public.sw_rolls; r public.sw_rolls; left_ int;
begin
  select * into prev from public.sw_rolls where id = p_roll and user_id = auth.uid();
  if prev.id is null then raise exception 'That roll isn''t yours.'; end if;
  if prev.outcome = 'crit_fail' then
    raise exception 'A Critical Failure can''t be rerolled.';
  end if;
  if exists (select 1 from public.sw_rolls where rerolled_from = prev.id) then
    raise exception 'Reroll the latest result instead.';
  end if;
  update public.sw_sheets set bennies = bennies - 1 where user_id = auth.uid() and bennies > 0
    returning bennies into left_;
  if left_ is null then raise exception 'You''re out of Bennies.'; end if;

  r := public.sw_do_roll(prev.user_id, prev.trait, prev.modifier, prev.context_kind, prev.context_id,
                         prev.request_id, null, prev, prev.context_kind <> 'freetime');
  if r.context_kind = 'freetime' then perform public.ft_apply_roll(r.context_id, r); end if;
  perform public.sw_post_roll(r);
  return to_jsonb(r) || jsonb_build_object('bennies_left', left_);
end;
$$;

-- GM: ask for a roll.
create or replace function public.sw_request(
  p_kind text, p_ctx uuid, p_targets uuid[], p_trait text, p_mod int default 0, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.sw_requests; u uuid; link text; app text;
  txt text;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  if coalesce(array_length(p_targets, 1), 0) = 0 then raise exception 'Pick who rolls.'; end if;
  if coalesce(trim(p_trait), '') = '' then raise exception 'Pick a trait.'; end if;
  insert into public.sw_requests (kind, context_id, targets, trait, modifier, note, created_by)
  values (p_kind, p_ctx, p_targets, trim(p_trait), greatest(-10, least(10, coalesce(p_mod,0))),
          nullif(trim(p_note), ''), auth.uid())
  returning * into q;

  txt := '🎲 Roll ' || q.trait || case when q.modifier > 0 then ' +' || q.modifier
                                      when q.modifier < 0 then ' −' || abs(q.modifier) else '' end;
  if p_kind = 'message' then
    insert into public.messages (conversation_id, sender_id, body, kind, meta)
    values (p_ctx, auth.uid(), txt, 'roll_request', to_jsonb(q));
  end if;

  link := case p_kind when 'message' then 'app.html?c=' || p_ctx
                      when 'queree'  then 'queree.html?s=' || p_ctx
                      when 'flight'  then 'flight.html' else 'mytime.html' end;
  app  := case p_kind when 'message' then 'messages' when 'queree' then 'queree'
                      when 'flight' then 'flight' else 'mytime' end;
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    foreach u in array p_targets loop
      perform public.push_notification(u, app, 'sw_request', 'Roll requested',
        txt || coalesce(' — ' || q.note, ''), link, q.id, null);
    end loop;
  end if;
  return q.id;
end;
$$;

grant execute on function public.sw_roll(text,int,text,uuid,uuid,int)   to authenticated;
grant execute on function public.sw_reroll(uuid)                        to authenticated;
grant execute on function public.sw_request(text,uuid,uuid[],text,int,text) to authenticated;
grant execute on function public.ft_submit(jsonb)                       to authenticated;
grant execute on function public.ft_withdraw(uuid)                      to authenticated;
grant execute on function public.ft_add_connection(text,text)           to authenticated;
grant execute on function public.ft_review(uuid,boolean,text)           to authenticated;
grant execute on function public.ft_roll(uuid,text)                     to authenticated;
revoke all on function public.ft_add_boxes(uuid,text,int)               from public, anon, authenticated;
revoke all on function public.ft_apply_roll(uuid,public.sw_rolls)       from public, anon, authenticated;
revoke all on function public.sw_post_roll(public.sw_rolls)             from public, anon, authenticated;
revoke all on function public.ft_notify_admins(text,text,text,uuid)     from public, anon, authenticated;

-- IC time on rolls (see ic-time.sql for the function).
do $$
begin
  if to_regprocedure('public.set_story_at()') is not null then
    drop trigger if exists sw_rolls_story_at on public.sw_rolls;
    create trigger sw_rolls_story_at before insert on public.sw_rolls
      for each row execute function public.set_story_at();
  end if;
end $$;

-- A first term, so Free Time works straight away.
insert into public.ft_terms (name) select 'Term 1' where not exists (select 1 from public.ft_terms);

-- Live updates.
do $$
declare t text;
begin
  foreach t in array array['sw_rolls','sw_requests','ft_weeks','ft_entries','ft_progress','ft_terms','mt_comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
    end;
  end loop;
end $$;
