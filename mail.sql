-- =====================================================================
--  NEOMAIL — a dummy email system
--  Run this once in the Supabase SQL Editor, after schema.sql. If you
--  use notifications, run this AFTER notifications.sql so the mail
--  notification trigger can find push_notification().
--
--  Model: the GM sends mail to players — to everyone, to a tag, or to
--  named accounts. Each recipient gets their own private thread, so one
--  player's reply is never visible to another. Players read and reply;
--  they do not compose new mail in this version.
--
--  Addresses are presentational and built in the app from usernames, so
--  nothing here stores an email address except the sender identity the
--  GM chooses (which may be a made-up NPC address).
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. ACCOUNT TAGS — the GM labels accounts, then mails a whole tag.
-- ---------------------------------------------------------------------

create table if not exists public.account_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag     text not null check (char_length(tag) between 1 and 40),
  primary key (user_id, tag)
);

alter table public.account_tags enable row level security;

-- Only admins deal with tags.
drop policy if exists tags_read on public.account_tags;
create policy tags_read on public.account_tags
  for select to authenticated using (public.is_admin());

drop policy if exists tags_write on public.account_tags;
create policy tags_write on public.account_tags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
--  2. THREADS + MESSAGES + PER-USER STATE
-- ---------------------------------------------------------------------

create table if not exists public.mail_threads (
  id             uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references auth.users(id) on delete cascade,
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  subject        text not null,
  sender_name    text not null,      -- the GM/NPC display name
  sender_addr    text not null,      -- the GM/NPC address
  last_at        timestamptz not null default now(),
  last_snippet   text,
  last_from_recipient boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists mail_thread_recip on public.mail_threads (recipient_id, last_at desc);
create index if not exists mail_thread_owner on public.mail_threads (owner_admin_id, last_at desc);

create table if not exists public.mail_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.mail_threads(id) on delete cascade,
  from_recipient boolean not null,   -- true = the player wrote it
  from_name      text not null,
  from_addr      text,               -- null for a player (derived in-app)
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists mail_msg_thread on public.mail_messages (thread_id, created_at);

create table if not exists public.mail_state (
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  read_at   timestamptz,
  starred   boolean not null default false,
  archived  boolean not null default false,
  deleted   boolean not null default false,
  primary key (thread_id, user_id)
);


-- ---------------------------------------------------------------------
--  3. RLS
-- ---------------------------------------------------------------------

alter table public.mail_threads  enable row level security;
alter table public.mail_messages enable row level security;
alter table public.mail_state    enable row level security;

-- A player sees threads addressed to them; an admin sees all.
drop policy if exists mail_thread_read on public.mail_threads;
create policy mail_thread_read on public.mail_threads
  for select to authenticated
  using (recipient_id = auth.uid() or public.is_admin());
-- Threads are created only through the send RPC (SECURITY DEFINER), so
-- no insert/update policy is granted here.

-- Messages are visible when their thread is.
drop policy if exists mail_msg_read on public.mail_messages;
create policy mail_msg_read on public.mail_messages
  for select to authenticated
  using (exists (select 1 from public.mail_threads t
                 where t.id = thread_id
                   and (t.recipient_id = auth.uid() or public.is_admin())));

-- Each person owns their own read/star/archive/delete state.
drop policy if exists mail_state_all on public.mail_state;
create policy mail_state_all on public.mail_state
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  4. SEND (admin) — creates one private thread per recipient.
-- ---------------------------------------------------------------------

create or replace function public.mail_send(
  p_subject text, p_body text,
  p_sender_name text, p_sender_addr text,
  p_audience text,             -- 'all' | 'tag' | 'list'
  p_tag text,
  p_recipients uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare
  r record;
  new_thread uuid;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can send mail';
  end if;
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'A subject is required';
  end if;

  for r in
    select id from public.profiles
     where case
       when p_audience = 'all'  then id <> auth.uid()
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

    insert into public.mail_messages
      (thread_id, from_recipient, from_name, from_addr, body)
    values (new_thread, false, p_sender_name, p_sender_addr, p_body);

    n := n + 1;
  end loop;

  return n;
end;
$$;


-- ---------------------------------------------------------------------
--  5. REPLY — a player answers, or the GM answers a reply.
-- ---------------------------------------------------------------------

create or replace function public.mail_reply(p_thread uuid, p_body text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  th record; is_recip boolean; nm text;
begin
  select * into th from public.mail_threads where id = p_thread;
  if not found then raise exception 'No such thread'; end if;

  if th.recipient_id = auth.uid() then
    is_recip := true;
  elsif public.is_admin() then
    is_recip := false;
  else
    raise exception 'Not your thread';
  end if;

  if is_recip then
    select username into nm from public.profiles where id = auth.uid();
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (p_thread, true, coalesce(nm, 'Unknown'), null, p_body);
  else
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (p_thread, false, th.sender_name, th.sender_addr, p_body);
  end if;

  update public.mail_threads
     set last_at = now(), last_snippet = left(p_body, 140),
         last_from_recipient = is_recip
   where id = p_thread;
end;
$$;


-- ---------------------------------------------------------------------
--  6. NOTIFICATIONS — tell the other side a mail arrived.
--     Wrapped in a guard so it is skipped if notifications are not set up.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regproc('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then

    create or replace function public.notif_on_mail()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare th record; av text;
    begin
      select * into th from public.mail_threads where id = new.thread_id;
      if new.from_recipient then
        -- player replied → tell the GM who owns the thread
        select avatar_url into av from public.profiles where id = th.recipient_id;
        perform public.push_notification(th.owner_admin_id, 'mail', 'mail_reply',
          new.from_name, 'replied: ' || th.subject,
          'mail.html?t=' || th.id, th.id, av);
      else
        -- GM/NPC sent → tell the recipient
        perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
          new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, null);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_mail on public.mail_messages;
    create trigger trg_notif_mail after insert on public.mail_messages
      for each row execute function public.notif_on_mail();
  end if;
end $$;


-- ---------------------------------------------------------------------
--  7. REALTIME
-- ---------------------------------------------------------------------

alter table public.mail_threads  replica identity full;
alter table public.mail_messages replica identity full;

do $$
declare t text;
begin
  foreach t in array array['mail_threads', 'mail_messages'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
