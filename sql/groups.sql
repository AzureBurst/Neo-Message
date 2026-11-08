-- =====================================================================
--  GROUP CHATS — info, leave, add people, rename + photo, system lines,
--  replies, @mentions, reactions, pinned messages; GM member management
--  and account deletion.
--
--  Run this once in the Supabase SQL Editor, after schema.sql and the
--  notification SQL. Safe to re-run. (It includes everything that was in
--  group-admin.sql, so you don't need that one.)
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. New columns
-- ---------------------------------------------------------------------

alter table public.conversations
  add column if not exists avatar_url        text,
  add column if not exists pinned_message_id uuid references public.messages(id) on delete set null,
  add column if not exists members_can_add   boolean not null default true,
  add column if not exists members_can_edit  boolean not null default true;

alter table public.messages
  add column if not exists kind     text not null default 'text',
  add column if not exists reply_to uuid references public.messages(id) on delete set null,
  add column if not exists mentions uuid[] not null default '{}';

do $$
begin
  alter table public.messages add constraint messages_kind_check check (kind in ('text', 'system'));
exception when duplicate_object then null; end $$;

-- Players can only send ordinary messages; "system" lines come from the
-- functions below.
drop policy if exists "send messages" on public.messages;
create policy "send messages" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id) and kind = 'text');


-- ---------------------------------------------------------------------
--  2. System lines ("robin added vale")
-- ---------------------------------------------------------------------

create or replace function public.chat_system_line(conv uuid, actor uuid, line text)
returns void language sql security definer
set search_path = public as $$
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (conv, actor, line, 'system');
$$;
revoke all on function public.chat_system_line(uuid, uuid, text) from public, anon, authenticated;

-- System lines don't ping anyone.
drop trigger if exists trg_notif_message on public.messages;
create trigger trg_notif_message after insert on public.messages
  for each row when (new.kind = 'text') execute function public.notif_on_message();
do $$
begin
  if to_regprocedure('public.notif_npc_message()') is not null then
    drop trigger if exists trg_notif_npc_message on public.messages;
    create trigger trg_notif_npc_message after insert on public.messages
      for each row when (new.kind = 'text') execute function public.notif_npc_message();
  end if;
end $$;

-- Names, joined for a sentence: "vale", "vale and kestrel", "vale, kestrel and robin".
create or replace function public.chat_names(ids uuid[])
returns text language sql stable security definer
set search_path = public as $$
  with n as (
    select username, row_number() over (order by username) i, count(*) over () c
      from public.profiles where id = any (ids))
  select case
    when max(c) is null then 'someone'
    when max(c) = 1 then max(username)
    else string_agg(username, ', ' order by i) filter (where i < c) || ' and ' || max(username) filter (where i = c)
  end from n;
$$;

create or replace function public.chat_notify_added(conv uuid, uid uuid, ttl text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if uid <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(uid, 'messages', 'group_added',
      'You were added to a chat', coalesce(ttl, 'A group conversation'),
      'app.html?c=' || conv, conv, null);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  3. Players: leave, add people, rename / photo, pin
-- ---------------------------------------------------------------------

create or replace function public.group_leave(conv uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare who text;
begin
  if not public.is_member(conv) then raise exception 'You are not in this chat'; end if;
  if not exists (select 1 from public.conversations where id = conv and is_group) then
    raise exception 'You can only leave group chats';
  end if;
  select username into who from public.profiles where id = auth.uid();
  perform public.chat_system_line(conv, auth.uid(), coalesce(who, 'Someone') || ' left');
  delete from public.conversation_members where conversation_id = conv and user_id = auth.uid();
end;
$$;

create or replace function public.group_add(conv uuid, user_ids uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare c record; uid uuid; added uuid[] := '{}'; who text;
begin
  select * into c from public.conversations where id = conv;
  if not found then raise exception 'That chat no longer exists'; end if;
  if not public.is_member(conv) then raise exception 'You are not in this chat'; end if;
  if not c.is_group then raise exception 'You can only add people to group chats'; end if;
  if not c.members_can_add and not public.is_admin() then
    raise exception 'Only the GM can add people to this chat';
  end if;

  foreach uid in array coalesce(user_ids, '{}') loop
    if not exists (select 1 from public.profiles where id = uid) then continue; end if;
    insert into public.conversation_members (conversation_id, user_id) values (conv, uid)
    on conflict do nothing;
    if found then added := added || uid; perform public.chat_notify_added(conv, uid, c.title); end if;
  end loop;

  if array_length(added, 1) > 0 then
    select username into who from public.profiles where id = auth.uid();
    perform public.chat_system_line(conv, auth.uid(), coalesce(who, 'Someone') || ' added ' || public.chat_names(added));
  end if;
  return coalesce(array_length(added, 1), 0);
end;
$$;

create or replace function public.group_update(conv uuid, p_title text, p_avatar text)
returns void language plpgsql security definer
set search_path = public as $$
declare c record; who text; t text := nullif(btrim(p_title), ''); a text := nullif(btrim(p_avatar), '');
begin
  select * into c from public.conversations where id = conv;
  if not found then raise exception 'That chat no longer exists'; end if;
  if not public.is_member(conv) and not public.is_admin() then raise exception 'You are not in this chat'; end if;
  if not c.is_group then raise exception 'Only group chats have a name and photo'; end if;
  if not c.members_can_edit and not public.is_admin() then
    raise exception 'Only the GM can change this chat';
  end if;
  select username into who from public.profiles where id = auth.uid();
  who := coalesce(who, 'Someone');

  if t is distinct from c.title then
    update public.conversations set title = t where id = conv;
    perform public.chat_system_line(conv, auth.uid(),
      case when t is null then who || ' removed the group name'
           else who || ' renamed the group to “' || t || '”' end);
  end if;
  if a is distinct from c.avatar_url then
    update public.conversations set avatar_url = a where id = conv;
    perform public.chat_system_line(conv, auth.uid(),
      case when a is null then who || ' removed the group photo' else who || ' changed the group photo' end);
  end if;
end;
$$;

create or replace function public.group_pin(conv uuid, msg uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare who text;
begin
  if not public.is_member(conv) and not public.is_admin() then raise exception 'You are not in this chat'; end if;
  if msg is not null and not exists (
      select 1 from public.messages where id = msg and conversation_id = conv and kind = 'text') then
    raise exception 'That message is not in this chat';
  end if;
  update public.conversations set pinned_message_id = msg where id = conv;
  select username into who from public.profiles where id = auth.uid();
  perform public.chat_system_line(conv, auth.uid(),
    coalesce(who, 'Someone') || case when msg is null then ' unpinned the message' else ' pinned a message' end);
end;
$$;


-- ---------------------------------------------------------------------
--  4. GM: anyone in or out of any chat, rename, settings, delete accounts
--     (GM actions are worded without the GM's name: "vale was added")
-- ---------------------------------------------------------------------

create or replace function public.admin_add_members(conv uuid, user_ids uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare c record; uid uuid; added uuid[] := '{}'; n int;
begin
  if not public.is_admin() then raise exception 'Only the GM can manage members'; end if;
  select * into c from public.conversations where id = conv;
  if not found then raise exception 'That conversation no longer exists'; end if;

  foreach uid in array coalesce(user_ids, '{}') loop
    if not exists (select 1 from public.profiles where id = uid) then continue; end if;
    insert into public.conversation_members (conversation_id, user_id) values (conv, uid)
    on conflict do nothing;
    if found then added := added || uid; perform public.chat_notify_added(conv, uid, c.title); end if;
  end loop;

  select count(*) into n from public.conversation_members where conversation_id = conv;
  if n > 2 and not c.is_group then
    update public.conversations set is_group = true where id = conv;
  end if;
  if array_length(added, 1) > 0 then
    perform public.chat_system_line(conv, null,
      public.chat_names(added) || case when array_length(added, 1) = 1 then ' was added' else ' were added' end);
  end if;
  return coalesce(array_length(added, 1), 0);
end;
$$;

create or replace function public.admin_remove_members(conv uuid, user_ids uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare gone uuid[];
begin
  if not public.is_admin() then raise exception 'Only the GM can manage members'; end if;
  with d as (
    delete from public.conversation_members
     where conversation_id = conv and user_id = any (coalesce(user_ids, '{}'))
    returning user_id)
  select array_agg(user_id) into gone from d;
  if gone is not null then
    perform public.chat_system_line(conv, null,
      public.chat_names(gone) || case when array_length(gone, 1) = 1 then ' was removed' else ' were removed' end);
  end if;
  return coalesce(array_length(gone, 1), 0);
end;
$$;

create or replace function public.admin_set_group_title(conv uuid, new_title text)
returns void language plpgsql security definer
set search_path = public as $$
declare t text := nullif(btrim(new_title), ''); old text;
begin
  if not public.is_admin() then raise exception 'Only the GM can rename chats'; end if;
  select title into old from public.conversations where id = conv;
  if t is distinct from old then
    update public.conversations set title = t where id = conv;
    perform public.chat_system_line(conv, null,
      case when t is null then 'The group name was removed' else 'The group was renamed to “' || t || '”' end);
  end if;
end;
$$;

create or replace function public.admin_group_settings(conv uuid, can_add boolean, can_edit boolean)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can change chat settings'; end if;
  update public.conversations set members_can_add = can_add, members_can_edit = can_edit where id = conv;
end;
$$;

-- Delete a player's account for good. Their chat messages stay (shown as
-- "Unknown"); everything else they owned (posts, mail, journal, grades…)
-- goes with the account. Never deletes an admin or yourself.
create or replace function public.admin_delete_account(target uuid)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can delete accounts'; end if;
  if target = auth.uid() then raise exception 'You can''t delete your own account'; end if;
  if exists (select 1 from public.profiles where id = target and is_admin) then
    raise exception 'Admin accounts can''t be deleted here';
  end if;
  delete from auth.users where id = target;
  if not found then raise exception 'That account no longer exists'; end if;
end;
$$;


-- ---------------------------------------------------------------------
--  5. Reactions
-- ---------------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_msg on public.message_reactions (message_id);
alter table public.message_reactions enable row level security;

drop policy if exists react_read on public.message_reactions;
create policy react_read on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id
                 and (public.is_member(m.conversation_id) or public.is_admin())));
drop policy if exists react_add on public.message_reactions;
create policy react_add on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
drop policy if exists react_remove on public.message_reactions;
create policy react_remove on public.message_reactions for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
--  6. @mentions notify the person mentioned
-- ---------------------------------------------------------------------

create or replace function public.notif_on_mention()
returns trigger language plpgsql security definer
set search_path = public as $$
declare uid uuid; who record;
begin
  if new.kind <> 'text' or coalesce(array_length(new.mentions, 1), 0) = 0 then return new; end if;
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  select username, avatar_url into who from public.profiles where id = new.sender_id;
  foreach uid in array new.mentions loop
    if uid = new.sender_id then continue; end if;
    if not exists (select 1 from public.conversation_members
                    where conversation_id = new.conversation_id and user_id = uid) then continue; end if;
    perform public.push_notification(uid, 'messages', 'mention',
      coalesce(who.username, 'Someone') || ' mentioned you', left(coalesce(new.body, ''), 120),
      'app.html?c=' || new.conversation_id, new.conversation_id, who.avatar_url);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_notif_mention on public.messages;
create trigger trg_notif_mention after insert on public.messages
  for each row execute function public.notif_on_mention();


-- ---------------------------------------------------------------------
--  7. Permissions + realtime
-- ---------------------------------------------------------------------

grant execute on function
  public.group_leave(uuid), public.group_add(uuid, uuid[]), public.group_update(uuid, text, text),
  public.group_pin(uuid, uuid), public.admin_add_members(uuid, uuid[]),
  public.admin_remove_members(uuid, uuid[]), public.admin_set_group_title(uuid, text),
  public.admin_group_settings(uuid, boolean, boolean), public.admin_delete_account(uuid)
  to authenticated;

alter table public.conversation_members replica identity full;
alter table public.message_reactions replica identity full;
do $$
declare t text;
begin
  foreach t in array array['conversations', 'message_reactions', 'conversation_members'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
