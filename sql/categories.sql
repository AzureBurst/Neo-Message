-- =====================================================================
--  Account categories
--
--  Every account and NPC belongs to a category. Built in:
--    Justice University Students, Justice University Faculty,
--    Outsiders, GM. The GM can add more in NeoAdmin.
--
--  Each category has switches:
--    hidden     invisible to players (the GM category)
--    seen_by    categories that see its members in the directory
--    add_by     categories that can add its members from the directory
--    phone_add  anyone can add its members by typing their number
--    email_by   categories that can email its members from the directory
--  Anyone can always email the people in their own contacts.
--
--  Needs schema.sql, mail.sql and npc.sql first. Safe to run more than once.
-- =====================================================================

create table if not exists public.account_categories (
  id         uuid primary key default gen_random_uuid(),
  key        text unique,                     -- built-ins: students, faculty, outsiders, gm
  name       text not null unique check (char_length(name) between 1 and 60),
  color      text not null default '#6b7280',
  hidden     boolean not null default false,
  seen_by    uuid[] not null default '{}',
  add_by     uuid[] not null default '{}',
  phone_add  boolean not null default true,
  email_by   uuid[] not null default '{}',
  sort       int not null default 100,
  created_at timestamptz not null default now()
);

alter table public.account_categories enable row level security;
drop policy if exists cat_read  on public.account_categories;
drop policy if exists cat_write on public.account_categories;
create policy cat_read  on public.account_categories for select to authenticated using (true);
create policy cat_write on public.account_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The four built-ins, wired to each other.
insert into public.account_categories (key, name, color, sort, hidden, phone_add) values
  ('students',  'Justice University Students', '#3C6FD9', 10, false, true),
  ('faculty',   'Justice University Faculty',  '#1E8A5A', 20, false, true),
  ('outsiders', 'Outsiders',                   '#C76A1C', 30, false, true),
  ('gm',        'GM',                          '#7A4FD0', 40, true,  false)
on conflict (key) do nothing;

do $$
declare s uuid; f uuid;
begin
  select id into s from public.account_categories where key = 'students';
  select id into f from public.account_categories where key = 'faculty';
  -- Only set the defaults the first time (the GM may have changed them since).
  update public.account_categories set seen_by = array[s, f], add_by = array[s, f], email_by = array[f]
   where key = 'students' and seen_by = '{}' and add_by = '{}';
  update public.account_categories set seen_by = array[s, f], add_by = array[f], email_by = array[s, f]
   where key = 'faculty' and seen_by = '{}' and add_by = '{}';
end $$;

-- ---------------------------------------------------------------------
--  Who is in what
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists category_id uuid
  references public.account_categories(id) on delete set null;

create or replace function public.cat_id(p_key text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.account_categories where key = p_key;
$$;

-- Fill in anyone without a category: admins → GM; NPCs by their role;
-- everyone else is a student.
update public.profiles p set category_id = case
    when p.is_admin then public.cat_id('gm')
    when to_regclass('public.npcs') is not null and exists (select 1 from public.npcs n where n.id = p.id and not n.is_student)
      then case when exists (select 1 from public.npcs n where n.id = p.id
                              and n.role ~* '(prof|teach|dean|coach|faculty|instructor|lecturer|principal|counsel|staff|nurse|advisor)')
                then public.cat_id('faculty') else public.cat_id('outsiders') end
    else public.cat_id('students') end
 where p.category_id is null;

-- New accounts start as students (admins as GM). Players can't change their own.
create or replace function public.profiles_category_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null then
    new.category_id := case when new.is_admin then public.cat_id('gm') else public.cat_id('students') end;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_category_default on public.profiles;
create trigger profiles_category_default before insert on public.profiles
  for each row execute function public.profiles_category_default();

create or replace function public.guard_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the SQL Editor, where the GM can do anything.
  if new.category_id is distinct from old.category_id and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only the GM can change categories';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_category on public.profiles;
create trigger profiles_guard_category before update on public.profiles
  for each row execute function public.guard_category();

-- ---------------------------------------------------------------------
--  The rules
-- ---------------------------------------------------------------------

create or replace function public.my_category() returns uuid
language sql stable security definer set search_path = public as $$
  select category_id from public.profiles where id = auth.uid();
$$;

-- Hidden = the GM (any admin) or anyone in a hidden category.
create or replace function public.is_hidden(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin or coalesce(c.hidden, false)
                     from public.profiles p left join public.account_categories c on c.id = p.category_id
                    where p.id = uid), false);
$$;

create or replace function public.shares_chat(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members a
                   join public.conversation_members b on b.conversation_id = a.conversation_id
                  where a.user_id = auth.uid() and b.user_id = uid);
$$;

-- Can I see this account's profile at all?
create or replace function public.profile_visible(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or public.is_admin() or not public.is_hidden(uid) or public.shares_chat(uid);
$$;

create or replace function public.in_contacts(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contacts where owner_id = auth.uid() and contact_id = uid);
$$;

-- Can I add them by picking them from the directory?
create or replace function public.can_browse_add(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    uid <> auth.uid() and not public.is_hidden(uid) and exists (
      select 1 from public.profiles p join public.account_categories c on c.id = p.category_id
       where p.id = uid and public.my_category() = any(c.add_by)));
$$;

-- Can I email them?
create or replace function public.can_email(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    uid <> auth.uid() and not public.is_hidden(uid) and (
      public.in_contacts(uid) or exists (
        select 1 from public.profiles p join public.account_categories c on c.id = p.category_id
         where p.id = uid and public.my_category() = any(c.email_by))));
$$;

-- Players can't see the GM (or a hidden category) unless they're in a chat together.
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (public.profile_visible(id));

-- Adding a contact directly needs the category's add_by. By number goes through the RPC.
drop policy if exists "write contacts" on public.contacts;
create policy "write contacts" on public.contacts
  for insert to authenticated with check (owner_id = auth.uid() and public.can_browse_add(contact_id));

create or replace function public.add_contact_by_number(number text, nick text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare target public.profiles; ok boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into target from public.profiles
   where regexp_replace(phone_number, '\D', '', 'g') = regexp_replace(number, '\D', '', 'g');
  if target.id is null then raise exception 'No account is using that number'; end if;
  if target.id = auth.uid() then raise exception 'That is your own number'; end if;
  if not public.is_admin() then
    -- The GM stays invisible: same answer as an unused number.
    if public.is_hidden(target.id) then raise exception 'No account is using that number'; end if;
    select coalesce(c.phone_add, true) into ok
      from public.profiles p left join public.account_categories c on c.id = p.category_id where p.id = target.id;
    if not ok and not public.can_browse_add(target.id) then
      raise exception 'That number can''t be added';
    end if;
  end if;
  insert into public.contacts (owner_id, contact_id, nickname)
  values (auth.uid(), target.id, nullif(trim(nick), ''))
  on conflict (owner_id, contact_id)
    do update set nickname = coalesce(excluded.nickname, public.contacts.nickname);
  return target;
end;
$$;

-- The directory: who I can see, and what I can do with each of them.
-- "about" is the public bio (an NPC's role stays GM-only).
drop function if exists public.directory();
create or replace function public.directory()
returns table (id uuid, username text, avatar_url text, category_id uuid, category text, color text,
               about text, is_npc boolean, can_add boolean, can_email boolean, in_contacts boolean)
language plpgsql stable security definer set search_path = public as $$
declare mine uuid := public.my_category(); gm boolean := public.is_admin();
begin
  return query
  select p.id, p.username, p.avatar_url, c.id, c.name, c.color,
         p.bio,
         public.is_npc(p.id),
         gm or mine = any(c.add_by),
         gm or mine = any(c.email_by) or public.in_contacts(p.id),
         public.in_contacts(p.id)
    from public.profiles p
    left join public.account_categories c on c.id = p.category_id
   where p.id <> auth.uid()
     and (gm or (not public.is_hidden(p.id) and (mine = any(c.seen_by) or public.in_contacts(p.id))))
   order by c.sort nulls last, p.username;
end;
$$;
grant execute on function public.directory() to authenticated;

-- ---------------------------------------------------------------------
--  Neomail: players can start emails now
-- ---------------------------------------------------------------------

alter table public.mail_threads add column if not exists peer_thread uuid references public.mail_threads(id) on delete set null;
alter table public.mail_threads add column if not exists target_id uuid references auth.users(id) on delete set null;

create or replace function public.mail_addr(uname text, domain text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(uname, 'unknown'), '[^A-Za-z0-9._]', '', 'g')) || '@' || coalesce(domain, 'neo.mail');
$$;

-- A player writes to someone. To an NPC: lands with the GM, who answers
-- as that NPC. To another player: each gets their own copy, kept in sync.
create or replace function public.mail_compose(p_target uuid, p_subject text, p_body text, p_domain text default 'neo.mail')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); my_name text; t_name text; gm uuid; t1 uuid; t2 uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Add a subject.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.'; end if;
  if not public.can_email(p_target) then raise exception 'You can''t email them.'; end if;
  select username into my_name from public.profiles where id = me;
  select username into t_name from public.profiles where id = p_target;

  if public.is_npc(p_target) or exists (select 1 from public.profiles where id = p_target and is_admin) then
    select id into gm from public.profiles where is_admin order by created_at limit 1;
    insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                     last_at, last_snippet, last_from_recipient, target_id)
    values (coalesce(gm, p_target), me, trim(p_subject), t_name, public.mail_addr(t_name, p_domain),
            now(), left(p_body, 140), true, p_target)
    returning id into t1;
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (t1, true, my_name, null, p_body);
    return t1;
  end if;

  -- Player to player: my copy (them as the sender), and theirs (me as the sender).
  insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                   last_at, last_snippet, last_from_recipient, target_id)
  values (p_target, me, trim(p_subject), t_name, public.mail_addr(t_name, p_domain), now(), left(p_body, 140), true, p_target)
  returning id into t1;
  insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                   last_at, last_snippet, last_from_recipient, target_id, peer_thread)
  values (me, p_target, trim(p_subject), my_name, public.mail_addr(my_name, p_domain), now(), left(p_body, 140), false, me, t1)
  returning id into t2;
  update public.mail_threads set peer_thread = t2 where id = t1;
  insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
  values (t1, true, my_name, null, p_body);
  insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
  values (t2, false, my_name, public.mail_addr(my_name, p_domain), p_body);
  return t1;
end;
$$;
grant execute on function public.mail_compose(uuid, text, text, text) to authenticated;

-- Replies: player-to-player threads write to both copies.
create or replace function public.mail_reply(p_thread uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare th record; is_recip boolean; nm text; peer record;
begin
  select * into th from public.mail_threads where id = p_thread;
  if not found then raise exception 'No such thread'; end if;
  if th.recipient_id = auth.uid() then is_recip := true;
  elsif public.is_admin() and th.peer_thread is null then is_recip := false;
  else raise exception 'Not your thread'; end if;

  if is_recip then
    select username into nm from public.profiles where id = auth.uid();
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (p_thread, true, coalesce(nm, 'Unknown'), null, p_body);
    if th.peer_thread is not null then
      select * into peer from public.mail_threads where id = th.peer_thread;
      insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
      values (peer.id, false, coalesce(nm, 'Unknown'), peer.sender_addr, p_body);
      update public.mail_threads set last_at = now(), last_snippet = left(p_body, 140), last_from_recipient = false
       where id = peer.id;
    end if;
  else
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (p_thread, false, th.sender_name, th.sender_addr, p_body);
  end if;
  update public.mail_threads set last_at = now(), last_snippet = left(p_body, 140), last_from_recipient = is_recip
   where id = p_thread;
end;
$$;

-- Notifications: on a player-to-player pair only the delivered copy notifies.
do $$
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    create or replace function public.notif_on_mail()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare th record; av text;
    begin
      select * into th from public.mail_threads where id = new.thread_id;
      if new.from_recipient then
        if th.peer_thread is not null then return new; end if;
        select avatar_url into av from public.profiles where id = th.recipient_id;
        perform public.push_notification(th.owner_admin_id, 'mail', 'mail_reply',
          new.from_name, case when (select count(*) from public.mail_messages where thread_id = th.id) <= 1
                              then 'wrote: ' else 'replied: ' end || th.subject,
          'mail.html?t=' || th.id, th.id, av);
      else
        perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
          new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, null);
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;

-- Live updates for the category manager.
do $$ begin
  alter publication supabase_realtime add table public.account_categories;
exception when duplicate_object then null; when undefined_object then null; end $$;
