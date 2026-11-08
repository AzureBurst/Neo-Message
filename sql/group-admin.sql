-- =====================================================================
--  GM: manage who is in any conversation
--  Run this once in the Supabase SQL Editor. Safe to re-run.
--
--  Lets an admin add anyone to (or remove anyone from) any conversation,
--  and rename group chats — whether or not the admin is in it. Adding a
--  third person to a one-on-one chat turns it into a group. People who
--  are added get a notification; removed people lose access straight
--  away (their old messages stay in the chat).
-- =====================================================================

create or replace function public.admin_add_members(conv uuid, user_ids uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare added int := 0; uid uuid; c record; n int;
begin
  if not public.is_admin() then raise exception 'Only the GM can manage members'; end if;
  select * into c from public.conversations where id = conv;
  if not found then raise exception 'That conversation no longer exists'; end if;

  foreach uid in array coalesce(user_ids, '{}') loop
    if not exists (select 1 from public.profiles where id = uid) then continue; end if;
    insert into public.conversation_members (conversation_id, user_id) values (conv, uid)
    on conflict do nothing;
    if found then
      added := added + 1;
      if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null
         and uid <> auth.uid() then
        perform public.push_notification(uid, 'messages', 'group_added',
          'You were added to a chat', coalesce(c.title, 'A group conversation'),
          'app.html?c=' || conv, conv, null);
      end if;
    end if;
  end loop;

  -- A one-on-one chat with a third person becomes a group.
  select count(*) into n from public.conversation_members where conversation_id = conv;
  if n > 2 and not c.is_group then
    update public.conversations set is_group = true where id = conv;
  end if;
  return added;
end;
$$;

create or replace function public.admin_remove_members(conv uuid, user_ids uuid[])
returns integer language plpgsql security definer
set search_path = public as $$
declare removed int;
begin
  if not public.is_admin() then raise exception 'Only the GM can manage members'; end if;
  delete from public.conversation_members
   where conversation_id = conv and user_id = any (coalesce(user_ids, '{}'));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.admin_set_group_title(conv uuid, new_title text)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can rename chats'; end if;
  update public.conversations set title = nullif(btrim(new_title), '') where id = conv;
end;
$$;

grant execute on function public.admin_add_members(uuid, uuid[]),
  public.admin_remove_members(uuid, uuid[]),
  public.admin_set_group_title(uuid, text) to authenticated;

-- Removed members need to hear about it live, so their chat closes.
alter table public.conversation_members replica identity full;
