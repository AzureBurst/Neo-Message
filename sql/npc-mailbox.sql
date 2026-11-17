-- =====================================================================
--  NPC mailboxes
--  Mail to and from an NPC is kept in your GM mailbox. With this, when
--  you sign in as the NPC (NPC Studio → Sign in as), their Neomail shows
--  the same mail as their own inbox and Sent, and replies go out as
--  them. Your GM Neomail keeps showing everything as before.
--  An NPC counts as "on" an email when you wrote it as them (picked
--  from the NPC list or typed their name in From), or it was sent to
--  them. Players can't see any of this.
--  Run after mail-v2.sql. Safe to run more than once.
-- =====================================================================

-- "Kaori Hamasaki", "Kaori_Hamasaki" and "kaori.hamasaki" all match.
create or replace function public.name_key(t text) returns text
language sql immutable as $$ select lower(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')); $$;

-- Is this NPC on this thread?
create or replace function public.mail_npc_on(t public.mail_threads, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_gm_character(uid) and (
       uid = any(t.npc_ids)
    or (t.conv_id is not null and t.gm_name is not null
        and public.name_key(t.gm_name) = (select public.name_key(username) from public.profiles where id = uid))
    or (t.conv_id is null and t.target_id = uid
        and exists (select 1 from public.profiles where id = t.owner_admin_id and is_admin)));
$$;

create or replace function public.mail_npc_can_read(p_thread uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.mail_npc_on(t, auth.uid()) from public.mail_threads t where t.id = p_thread), false);
$$;

-- The NPC's sign-in can read those threads and their emails.
drop policy if exists mail_thread_npc_read on public.mail_threads;
create policy mail_thread_npc_read on public.mail_threads
  for select to authenticated using (public.mail_npc_on(mail_threads, auth.uid()));

drop policy if exists mail_msg_npc_read on public.mail_messages;
create policy mail_msg_npc_read on public.mail_messages
  for select to authenticated using (public.mail_npc_can_read(thread_id));

-- Replying from the NPC's sign-in.
create or replace function public.mail_reply_npc(p_thread uuid, p_body text,
  p_attachments jsonb default '[]'::jsonb, p_all boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare th public.mail_threads; nm text; att jsonb := public.mail_clean_attachments(p_attachments);
begin
  select * into th from public.mail_threads where id = p_thread;
  if th.id is null then raise exception 'That email is gone.'; end if;
  if not public.mail_npc_on(th, auth.uid()) then raise exception 'Not your mailbox.'; end if;
  if coalesce(trim(p_body), '') = '' and jsonb_array_length(att) = 0 then raise exception 'Write something first.'; end if;
  select username into nm from public.profiles where id = auth.uid();

  if th.conv_id is null then
    -- An old one-to-one thread: write on the NPC's side of it.
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body, attachments, author_id)
    values (th.id, false, nm, public.mail_addr(nm, 'juniversity.edu'), nullif(p_body, ''), att, auth.uid());
    update public.mail_threads set last_at = now(), last_snippet = left(coalesce(p_body, '📎 Attachment'), 140),
           last_from_recipient = false where id = th.id;
    return;
  end if;

  -- A group conversation: reply from the GM's copy, as this NPC, under
  -- the same name and address the email went out with.
  if public.name_key(th.gm_name) = public.name_key(nm) then
    perform public.mail_reply2_as(th.id, p_body, att, auth.uid(), p_all, th.gm_name, th.gm_addr);
  else
    perform public.mail_reply2_as(th.id, p_body, att, auth.uid(), p_all, null, null);
  end if;
end;
$$;
grant execute on function public.mail_reply_npc(uuid, text, jsonb, boolean) to authenticated;

-- The body of mail_reply2, callable for a given copy and author (internal).
drop function if exists public.mail_reply2_as(uuid, text, jsonb, uuid, boolean);
create or replace function public.mail_reply2_as(p_thread uuid, p_body text, att jsonb, p_author uuid, p_all boolean,
  p_name text default null, p_addr text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  gm uuid := public.mail_gm_id(); th public.mail_threads; c public.mail_threads;
  a_name text; a_addr text; to_all boolean; last_author uuid; target uuid;
begin
  select * into th from public.mail_threads where id = p_thread;
  a_name := coalesce(p_name, (select username from public.profiles where id = p_author));
  a_addr := coalesce(p_addr, public.mail_addr(a_name, 'juniversity.edu'));
  select author_id into last_author from public.mail_messages
   where thread_id = th.id and not from_recipient order by created_at desc limit 1;
  if last_author is not null then
    select id into target from public.mail_threads
     where conv_id = th.conv_id and id <> th.id
       and recipient_id = case when exists (select 1 from public.profiles where id = last_author and is_admin)
                               then gm else last_author end
     limit 1;
  end if;
  to_all := p_all or target is null;
  for c in select * from public.mail_threads
            where conv_id = th.conv_id
              and (id = th.id or (to_all and not is_bcc) or (not to_all and id = target)) loop
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body, attachments, author_id)
    values (c.id, c.id = th.id, a_name, a_addr, nullif(p_body, ''), att, p_author);
    update public.mail_threads set last_at = now(), last_snippet = left(coalesce(p_body, '📎 Attachment'), 140),
           last_from_recipient = (c.id = th.id) where id = c.id;
    if c.id <> th.id then
      update public.mail_state set archived = false, deleted = false
       where thread_id = c.id and user_id = c.recipient_id and not purged;
    end if;
  end loop;
end;
$$;
revoke all on function public.mail_reply2_as(uuid, text, jsonb, uuid, boolean, text, text) from public, anon, authenticated;
