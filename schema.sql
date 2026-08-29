-- =====================================================================
--  NEO MESSAGE — database schema
--  Paste this whole file into the Supabase SQL Editor and hit Run.
--  Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  phone_number text unique not null,
  avatar_url   text,
  bio          text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  nickname   text,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  is_group   boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null,
  body            text,
  image_url       text,
  created_at      timestamptz not null default now(),
  check (body is not null or image_url is not null)
);

create index if not exists messages_conv_time_idx
  on public.messages (conversation_id, created_at);
create index if not exists members_user_idx
  on public.conversation_members (user_id);
create index if not exists contacts_owner_idx
  on public.contacts (owner_id);


-- ---------------------------------------------------------------------
--  2. HELPER FUNCTIONS
--  These are SECURITY DEFINER so they can read tables without
--  re-triggering the RLS policies that call them (avoids recursion).
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_member(conv uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------
--  3. SIGNUP TRIGGER
--  Creates the profile row automatically whenever an auth user appears,
--  reading username / phone_number out of the signup metadata.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, phone_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username',
             'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'phone_number',
             '555-0' || lpad((floor(random() * 1000))::text, 3, '0'))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
--  4. ADMIN FLAG GUARD
--  Stops a player from promoting themselves by PATCHing their own row.
-- ---------------------------------------------------------------------

create or replace function public.guard_admin_flag()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'Only an admin can change admin status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin
  before update on public.profiles
  for each row execute function public.guard_admin_flag();


-- ---------------------------------------------------------------------
--  5. RPCs the app calls
-- ---------------------------------------------------------------------

-- Look someone up by their in-game number and save them to your contacts.
create or replace function public.add_contact_by_number(number text, nick text default null)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare target public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into target from public.profiles
   where regexp_replace(phone_number, '\D', '', 'g') = regexp_replace(number, '\D', '', 'g');

  if target.id is null then
    raise exception 'No account is using that number';
  end if;
  if target.id = auth.uid() then
    raise exception 'That is your own number';
  end if;

  insert into public.contacts (owner_id, contact_id, nickname)
  values (auth.uid(), target.id, nullif(trim(nick), ''))
  on conflict (owner_id, contact_id)
    do update set nickname = coalesce(excluded.nickname, public.contacts.nickname);

  return target;
end;
$$;

-- Open (or reuse) a one-to-one thread with someone.
create or replace function public.start_direct_conversation(other_user uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare conv uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if other_user = auth.uid() then
    raise exception 'You cannot start a thread with yourself';
  end if;

  select c.id into conv
    from public.conversations c
    join public.conversation_members m1
      on m1.conversation_id = c.id and m1.user_id = auth.uid()
    join public.conversation_members m2
      on m2.conversation_id = c.id and m2.user_id = other_user
   where c.is_group = false
   limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (is_group, created_by)
  values (false, auth.uid())
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, auth.uid()), (conv, other_user);

  return conv;
end;
$$;

-- Create a group thread from a list of profile ids.
create or replace function public.start_group_conversation(member_ids uuid[], group_title text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare conv uuid; m uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.conversations (is_group, title, created_by)
  values (true, nullif(trim(group_title), ''), auth.uid())
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, auth.uid());

  foreach m in array member_ids loop
    if m <> auth.uid() then
      insert into public.conversation_members (conversation_id, user_id)
      values (conv, m)
      on conflict do nothing;
    end if;
  end loop;

  return conv;
end;
$$;

-- Full transcript export. Admin only — the function checks, so a player
-- calling it directly from the browser console gets nothing.
create or replace function public.export_all_messages()
returns table (
  message_id      uuid,
  sent_at         timestamptz,
  conversation_id uuid,
  conversation    text,
  participants    text,
  sender_username text,
  sender_number   text,
  body            text,
  image_url       text
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    msg.id,
    msg.created_at,
    c.id,
    coalesce(c.title, case when c.is_group then 'Group' else 'Direct' end),
    (select string_agg(p2.username, ', ' order by p2.username)
       from public.conversation_members cm
       join public.profiles p2 on p2.id = cm.user_id
      where cm.conversation_id = c.id),
    coalesce(p.username, '[deleted]'),
    coalesce(p.phone_number, ''),
    msg.body,
    msg.image_url
  from public.messages msg
  join public.conversations c on c.id = msg.conversation_id
  left join public.profiles p on p.id = msg.sender_id
  order by msg.created_at;
end;
$$;


-- ---------------------------------------------------------------------
--  6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.contacts             enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- profiles ------------------------------------------------------------
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- contacts ------------------------------------------------------------
drop policy if exists "read contacts" on public.contacts;
create policy "read contacts" on public.contacts
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "write contacts" on public.contacts;
create policy "write contacts" on public.contacts
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "edit contacts" on public.contacts;
create policy "edit contacts" on public.contacts
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "remove contacts" on public.contacts;
create policy "remove contacts" on public.contacts
  for delete to authenticated using (owner_id = auth.uid());

-- conversations -------------------------------------------------------
drop policy if exists "read conversations" on public.conversations;
create policy "read conversations" on public.conversations
  for select to authenticated using (public.is_member(id) or public.is_admin());

drop policy if exists "create conversations" on public.conversations;
create policy "create conversations" on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

-- members -------------------------------------------------------------
drop policy if exists "read members" on public.conversation_members;
create policy "read members" on public.conversation_members
  for select to authenticated
  using (public.is_member(conversation_id) or public.is_admin());

drop policy if exists "add members" on public.conversation_members;
create policy "add members" on public.conversation_members
  for insert to authenticated
  with check (public.is_member(conversation_id) or user_id = auth.uid());

-- messages ------------------------------------------------------------
drop policy if exists "read messages" on public.messages;
create policy "read messages" on public.messages
  for select to authenticated
  using (public.is_member(conversation_id) or public.is_admin());

drop policy if exists "send messages" on public.messages;
create policy "send messages" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));

drop policy if exists "delete messages" on public.messages;
create policy "delete messages" on public.messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
--  7. STORAGE (profile icons + image attachments)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "neo read media" on storage.objects;
create policy "neo read media" on storage.objects
  for select using (bucket_id in ('avatars', 'attachments'));

-- Files are stored under a folder named after the uploader's user id,
-- so this check keeps people out of each other's folders.
drop policy if exists "neo upload media" on storage.objects;
create policy "neo upload media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "neo replace media" on storage.objects;
create policy "neo replace media" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "neo delete media" on storage.objects;
create policy "neo delete media" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'attachments')
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ---------------------------------------------------------------------
--  8. REALTIME
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;


-- =====================================================================
--  DONE.
--
--  Last step — make yourself the admin. Sign up in the app first,
--  then run this with your username:
--
--     update public.profiles set is_admin = true where username = 'yourname';
-- =====================================================================
