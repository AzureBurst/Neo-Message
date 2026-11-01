-- =====================================================================
--  NPCs — stored in the database, run from the NPC Studio
--  Run this once in the Supabase SQL Editor, after schema.sql (and the
--  notification SQL if you use notifications). Safe to re-run.
--
--  An NPC is still a real account (so players can text it, see its
--  avatar and number like anyone else), but now:
--    • the list of NPCs lives here instead of in one browser,
--    • the GM replies AS any NPC without signing in as them,
--    • messages to any NPC land in one shared inbox and notify the GM,
--    • NPCs are left out of student enrolment and "mail everyone".
--
--  The npcs table is visible to admins only — players can't tell from
--  the database which accounts are NPCs.
-- =====================================================================


create table if not exists public.npcs (
  id          uuid primary key references public.profiles(id) on delete cascade,
  role        text check (char_length(role) <= 60),      -- "Dispatch", "Professor"…
  notes       text check (char_length(notes) <= 4000),   -- GM-only notes
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  secret      text,                                      -- sign-in password, for "Sign in as"
  is_student  boolean not null default false,            -- enrolled at Justice U like a player
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- When the GM last read each NPC conversation (for unread counts).
create table if not exists public.npc_reads (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  read_at         timestamptz not null default now()
);

alter table public.npcs      enable row level security;
alter table public.npc_reads enable row level security;

drop policy if exists npcs_admin on public.npcs;
create policy npcs_admin on public.npcs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists npc_reads_admin on public.npc_reads;
create policy npc_reads_admin on public.npc_reads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
--  Is this account an NPC that should be left out of player-only
--  things (enrolment, "mail everyone")? Written so other SQL files can
--  call it even before this file has been run.
-- ---------------------------------------------------------------------

create or replace function public.is_npc(uid uuid)
returns boolean language plpgsql stable security definer
set search_path = public as $$
declare r boolean := false;
begin
  if to_regclass('public.npcs') is null then return false; end if;
  execute 'select exists (select 1 from public.npcs where id = $1 and not is_student)' into r using uid;
  return r;
end;
$$;


-- ---------------------------------------------------------------------
--  Register an account as an NPC (a brand-new one from the Studio, or
--  an existing account — e.g. an old puppet). Also confirms its email so
--  "Sign in as" always works, and takes it out of student enrolment.
-- ---------------------------------------------------------------------

create or replace function public.npc_register(
  target uuid, p_secret text default null, p_role text default null,
  p_notes text default null, p_student boolean default false, p_color text default null)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can manage NPCs'; end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'That account does not exist';
  end if;
  if exists (select 1 from public.profiles where id = target and is_admin) then
    raise exception 'An admin account cannot be an NPC';
  end if;

  insert into public.npcs (id, secret, role, notes, is_student, color)
  values (target, nullif(p_secret, ''), nullif(btrim(p_role), ''), nullif(btrim(p_notes), ''),
          coalesce(p_student, false), nullif(p_color, ''))
  on conflict (id) do update
    set secret     = coalesce(excluded.secret, npcs.secret),
        role       = coalesce(excluded.role, npcs.role),
        notes      = coalesce(excluded.notes, npcs.notes),
        is_student = excluded.is_student,
        color      = coalesce(excluded.color, npcs.color),
        archived   = false;

  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = target;

  if not coalesce(p_student, false) then
    if to_regclass('public.flight_enrollments') is not null then
      execute 'delete from public.flight_enrollments where user_id = $1' using target;
    end if;
    if to_regclass('public.flight_students') is not null then
      execute 'delete from public.flight_students where user_id = $1' using target;
    end if;
  end if;
end;
$$;

-- A fresh sign-in password for an NPC (used by "Sign in as" when none is
-- stored, e.g. for an old puppet whose password was lost).
create or replace function public.npc_reset_password(target uuid)
returns text language plpgsql security definer
set search_path = public, extensions, auth as $$
declare pw text;
begin
  if not public.is_admin() then raise exception 'Only the GM can manage NPCs'; end if;
  if not exists (select 1 from public.npcs where id = target) then raise exception 'Not an NPC'; end if;
  pw := 'npc-' || encode(gen_random_bytes(9), 'hex');
  update auth.users
     set encrypted_password = crypt(pw, gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = target;
  update public.npcs set secret = pw where id = target;
  return pw;
end;
$$;

-- Delete an NPC's account for good. Their old messages stay, shown as
-- "[deleted]". Only works on NPCs, never on players.
create or replace function public.npc_delete(target uuid)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can manage NPCs'; end if;
  if not exists (select 1 from public.npcs where id = target) then raise exception 'Not an NPC'; end if;
  delete from auth.users where id = target;
end;
$$;


-- ---------------------------------------------------------------------
--  Speaking as an NPC — no sign-in needed.
-- ---------------------------------------------------------------------

create or replace function public.npc_check(npc uuid)
returns void language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can speak as an NPC'; end if;
  if not exists (select 1 from public.npcs where id = npc) then raise exception 'That account is not an NPC'; end if;
end;
$$;

create or replace function public.npc_send(npc uuid, conv uuid, p_body text, p_image text default null)
returns uuid language plpgsql security definer
set search_path = public as $$
declare mid uuid;
begin
  perform public.npc_check(npc);
  if not exists (select 1 from public.conversation_members where conversation_id = conv and user_id = npc) then
    raise exception 'That NPC is not in this conversation';
  end if;
  if coalesce(btrim(p_body), '') = '' and coalesce(p_image, '') = '' then
    raise exception 'Write something first';
  end if;
  insert into public.messages (conversation_id, sender_id, body, image_url)
  values (conv, npc, nullif(p_body, ''), nullif(p_image, ''))
  returning id into mid;
  -- Replying counts as reading.
  insert into public.npc_reads (conversation_id, read_at) values (conv, now())
  on conflict (conversation_id) do update set read_at = now();
  return mid;
end;
$$;

-- A one-to-one thread between an NPC and someone (reuses an existing one).
create or replace function public.npc_start_dm(npc uuid, other_user uuid)
returns uuid language plpgsql security definer
set search_path = public as $$
declare conv uuid;
begin
  perform public.npc_check(npc);
  if other_user = npc then raise exception 'An NPC cannot text itself'; end if;
  select c.id into conv
    from public.conversations c
    join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = npc
    join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = other_user
   where c.is_group = false
   limit 1;
  if conv is not null then return conv; end if;

  insert into public.conversations (is_group, created_by) values (false, npc) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, npc), (conv, other_user);
  return conv;
end;
$$;

create or replace function public.npc_start_group(npc uuid, member_ids uuid[], group_title text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare conv uuid; m uuid;
begin
  perform public.npc_check(npc);
  insert into public.conversations (is_group, title, created_by)
  values (true, nullif(btrim(group_title), ''), npc) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, npc);
  foreach m in array coalesce(member_ids, '{}') loop
    insert into public.conversation_members (conversation_id, user_id) values (conv, m)
    on conflict do nothing;
  end loop;
  return conv;
end;
$$;

-- Put an NPC into an existing conversation (e.g. a second NPC joins).
create or replace function public.npc_join(npc uuid, conv uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  perform public.npc_check(npc);
  insert into public.conversation_members (conversation_id, user_id) values (conv, npc)
  on conflict do nothing;
end;
$$;


-- ---------------------------------------------------------------------
--  The shared inbox: every conversation with at least one NPC in it.
-- ---------------------------------------------------------------------

create or replace function public.npc_inbox()
returns table (
  conversation_id uuid, title text, is_group boolean,
  npc_ids uuid[], member_ids uuid[],
  last_body text, last_image text, last_sender uuid, last_at timestamptz,
  unread integer)
language plpgsql stable security definer
set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can open the NPC inbox'; end if;
  return query
  with mem as (
    select m.conversation_id as cid,
           array_agg(m.user_id) filter (where n.id is not null) as npcs,
           array_agg(m.user_id) as members
      from public.conversation_members m
      left join public.npcs n on n.id = m.user_id
     group by m.conversation_id
  )
  select c.id, c.title, c.is_group, mem.npcs, mem.members,
         lm.body, lm.image_url, lm.sender_id, coalesce(lm.created_at, c.created_at),
         (select count(*)::int from public.messages x
           where x.conversation_id = c.id
             and x.sender_id is not null
             and not (x.sender_id = any (mem.npcs))
             and x.created_at > coalesce(r.read_at, '-infinity'::timestamptz))
    from mem
    join public.conversations c on c.id = mem.cid
    left join lateral (
      select mm.body, mm.image_url, mm.sender_id, mm.created_at
        from public.messages mm where mm.conversation_id = c.id
       order by mm.created_at desc limit 1) lm on true
    left join public.npc_reads r on r.conversation_id = c.id
   where mem.npcs is not null
   order by coalesce(lm.created_at, c.created_at) desc;
end;
$$;

create or replace function public.npc_mark_read(conv uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM'; end if;
  insert into public.npc_reads (conversation_id, read_at) values (conv, now())
  on conflict (conversation_id) do update set read_at = now();
end;
$$;

grant execute on function public.is_npc(uuid), public.npc_register(uuid, text, text, text, boolean, text),
  public.npc_reset_password(uuid), public.npc_delete(uuid), public.npc_send(uuid, uuid, text, text),
  public.npc_start_dm(uuid, uuid), public.npc_start_group(uuid, uuid[], text), public.npc_join(uuid, uuid),
  public.npc_inbox(), public.npc_mark_read(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  A player texting an NPC notifies the GM ("autopilot").
-- ---------------------------------------------------------------------

create or replace function public.notif_npc_message()
returns trigger language plpgsql security definer
set search_path = public as $$
declare who record; npc_name text; a record;
begin
  if new.sender_id is null or exists (select 1 from public.npcs where id = new.sender_id) then
    return new;
  end if;
  select string_agg(p.username, ', ' order by p.username) into npc_name
    from public.conversation_members m
    join public.npcs n on n.id = m.user_id
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = new.conversation_id;
  if npc_name is null then return new; end if;
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then
    return new;
  end if;

  select username, avatar_url into who from public.profiles where id = new.sender_id;
  for a in select id from public.profiles where is_admin and id <> new.sender_id loop
    perform public.push_notification(a.id, 'npc', 'npc_message',
      coalesce(who.username, 'Someone') || ' → ' || npc_name,
      coalesce(left(new.body, 120), '📷 Photo'),
      'npcs.html?c=' || new.conversation_id, new.conversation_id, who.avatar_url);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_notif_npc_message on public.messages;
create trigger trg_notif_npc_message after insert on public.messages
  for each row execute function public.notif_npc_message();


-- ---------------------------------------------------------------------
--  Leave NPCs out of player-only things.
-- ---------------------------------------------------------------------

-- Marking a course "required" enrols every player — not NPCs.
do $$
begin
  if to_regclass('public.flight_courses') is not null then
    create or replace function public.flight_required_course()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    begin
      if new.auto_enroll and (tg_op = 'INSERT' or not old.auto_enroll) then
        insert into public.flight_enrollments (course_id, user_id)
        select new.id, p.id from public.profiles p where not p.is_admin and not public.is_npc(p.id)
        on conflict do nothing;
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;

-- "Mail everyone" in Neomail skips NPCs.
do $$
begin
  if to_regclass('public.mail_threads') is not null then
    create or replace function public.mail_send(
      p_subject text, p_body text,
      p_sender_name text, p_sender_addr text,
      p_audience text, p_tag text, p_recipients uuid[])
    returns integer language plpgsql security definer
    set search_path = public as $fn$
    declare r record; new_thread uuid; n int := 0;
    begin
      if not public.is_admin() then raise exception 'Only an admin can send mail'; end if;
      if coalesce(trim(p_subject), '') = '' then raise exception 'A subject is required'; end if;
      for r in
        select id from public.profiles
         where case
           when p_audience = 'all'  then id <> auth.uid() and not public.is_npc(id)
           when p_audience = 'tag'  then id in (select user_id from public.account_tags where tag = p_tag)
           when p_audience = 'list' then id = any(p_recipients)
           else false
         end
      loop
        insert into public.mail_threads
          (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
           last_at, last_snippet, last_from_recipient)
        values (auth.uid(), r.id, p_subject, p_sender_name, p_sender_addr,
           now(), left(p_body, 140), false)
        returning id into new_thread;
        insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
        values (new_thread, false, p_sender_name, p_sender_addr, p_body);
        n := n + 1;
      end loop;
      return n;
    end;
    $fn$;
  end if;
end $$;


-- ---------------------------------------------------------------------
--  Realtime for the Studio.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['npcs', 'npc_reads'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
