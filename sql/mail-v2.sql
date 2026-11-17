-- =====================================================================
--  Neomail v2
--   * One email to several people: To, Cc and Bcc, picked one by one or
--     a whole group at once. Everyone on it sees the replies (Bcc
--     people get the email but not the replies, unless they reply).
--   * Attachments (images, PDFs, documents) on any email.
--   * A Sent box for everyone, a Trash box, and "delete forever".
--   * The GM writes as themself, as any NPC, or as any name and address.
--  How it's stored: every reader gets their own copy of the
--  conversation (so nobody can read anyone else's mailbox), and all the
--  copies share a conv_id. Emails to NPCs land in the GM's copy.
--  Old threads keep working as before.
--  Run after mail.sql, categories.sql, npc-flag.sql and mail-notify.sql.
--  Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Columns
-- ---------------------------------------------------------------------
alter table public.mail_threads
  add column if not exists conv_id        uuid,
  add column if not exists to_names       text[] not null default '{}',
  add column if not exists cc_names       text[] not null default '{}',
  add column if not exists npc_ids        uuid[] not null default '{}',   -- GM copy: NPCs on this email
  add column if not exists gm_name        text,                            -- GM copy: who the GM wrote as
  add column if not exists gm_addr        text,
  add column if not exists is_bcc         boolean not null default false,
  add column if not exists i_sent         boolean not null default false,  -- this reader wrote in it
  add column if not exists i_received     boolean not null default false,  -- someone else wrote in it
  add column if not exists last_from_name text;
create index if not exists mail_thread_conv on public.mail_threads (conv_id);

alter table public.mail_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists author_id   uuid;
alter table public.mail_messages alter column body drop not null;

alter table public.mail_state
  add column if not exists purged boolean not null default false;      -- deleted forever

-- Keep the Sent / Inbox flags up to date as emails land.
create or replace function public.mail_msg_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.mail_threads
     set i_sent = i_sent or new.from_recipient,
         i_received = i_received or not new.from_recipient,
         last_from_name = new.from_name
   where id = new.thread_id;
  return new;
end;
$$;
drop trigger if exists trg_mail_msg_flags on public.mail_messages;
create trigger trg_mail_msg_flags after insert on public.mail_messages
  for each row execute function public.mail_msg_flags();

-- Fill the flags in for mail sent before this file.
update public.mail_threads t set
  i_sent = exists (select 1 from public.mail_messages m where m.thread_id = t.id and m.from_recipient),
  i_received = exists (select 1 from public.mail_messages m where m.thread_id = t.id and not m.from_recipient),
  last_from_name = (select from_name from public.mail_messages m where m.thread_id = t.id order by created_at desc limit 1)
 where t.conv_id is null and t.last_from_name is null;

-- ---------------------------------------------------------------------
--  Helpers
-- ---------------------------------------------------------------------
create or replace function public.mail_gm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where is_admin order by created_at limit 1;
$$;

create or replace function public.mail_label(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select username || ' <' || public.mail_addr(username, 'juniversity.edu') || '>' from public.profiles where id = uid;
$$;

create or replace function public.mail_clean_attachments(a jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'url', x->>'url', 'name', left(coalesce(x->>'name', 'file'), 160),
           'type', left(coalesce(x->>'type', ''), 80), 'size', coalesce((x->>'size')::bigint, 0))), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) x
   where coalesce(x->>'url', '') ~ '^https?://';
$$;

-- ---------------------------------------------------------------------
--  Send
-- ---------------------------------------------------------------------
create or replace function public.mail_send2(
  p_to uuid[], p_cc uuid[], p_bcc uuid[], p_subject text, p_body text,
  p_attachments jsonb default '[]'::jsonb,
  p_from uuid default null,              -- GM: write as this NPC
  p_from_name text default null,         -- GM: or as any name…
  p_from_addr text default null)         -- …and address
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); gm boolean := public.is_admin(); gm_id uuid := public.mail_gm_id();
  conv uuid := gen_random_uuid();
  all_ids uuid[]; readers uuid[]; npc_list uuid[] := '{}';
  a_name text; a_addr text; a_reader uuid; uid uuid; t uuid; my_copy uuid;
  att jsonb := public.mail_clean_attachments(p_attachments);
  tos text[]; ccs text[]; needs_gm boolean;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Add a subject.'; end if;
  if coalesce(trim(p_body), '') = '' and jsonb_array_length(att) = 0 then raise exception 'Write something first.'; end if;
  if coalesce(array_length(p_to, 1), 0) + coalesce(array_length(p_cc, 1), 0) + coalesce(array_length(p_bcc, 1), 0) = 0 then
    raise exception 'Add someone to send it to.';
  end if;

  select array_agg(distinct x) into all_ids
    from unnest(coalesce(p_to, '{}') || coalesce(p_cc, '{}') || coalesce(p_bcc, '{}')) x
   where x is not null and x <> me and exists (select 1 from public.profiles where id = x);
  if all_ids is null then raise exception 'Add someone to send it to.'; end if;
  if array_length(all_ids, 1) > 80 then raise exception 'That''s a lot of people. Keep it to 80 or fewer.'; end if;

  -- Who is writing.
  if gm then
    if p_from is not null then
      if not public.is_gm_character(p_from) then raise exception 'Pick one of your NPCs.'; end if;
      select username into a_name from public.profiles where id = p_from;
      a_addr := public.mail_addr(a_name, 'juniversity.edu');
      npc_list := array[p_from];
    elsif coalesce(trim(p_from_name), '') <> '' then
      a_name := trim(p_from_name);
      a_addr := coalesce(nullif(trim(p_from_addr), ''), public.mail_addr(a_name, 'juniversity.edu'));
    else
      select username into a_name from public.profiles where id = me;
      a_addr := public.mail_addr(a_name, 'juniversity.edu');
    end if;
    a_reader := me;
  else
    foreach uid in array all_ids loop
      if not public.can_email(uid) then
        raise exception 'You can''t email %.', (select username from public.profiles where id = uid);
      end if;
    end loop;
    select username into a_name from public.profiles where id = me;
    a_addr := public.mail_addr(a_name, 'juniversity.edu');
    a_reader := me;
  end if;

  -- NPCs and the GM read the email in the GM's copy.
  npc_list := npc_list || array(select x from unnest(all_ids) x where public.is_gm_character(x));
  needs_gm := gm or array_length(npc_list, 1) > 0
              or exists (select 1 from public.profiles where id = any(all_ids) and is_admin);
  readers := array(select x from unnest(all_ids) x
                    where not public.is_gm_character(x)
                      and not exists (select 1 from public.profiles where id = x and is_admin));
  if not gm then readers := readers || me; end if;
  if needs_gm and gm_id is not null then readers := readers || gm_id; end if;
  select array_agg(distinct x) into readers from unnest(readers) x;

  tos := array(select public.mail_label(x) from unnest(coalesce(p_to, '{}')) x where x <> me order by 1);
  ccs := array(select public.mail_label(x) from unnest(coalesce(p_cc, '{}')) x where x <> me order by 1);

  foreach uid in array readers loop
    insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
        last_at, last_snippet, last_from_recipient, conv_id, to_names, cc_names, npc_ids,
        gm_name, gm_addr, is_bcc, target_id)
    values (me, uid, trim(p_subject), a_name, a_addr,
        now(), left(coalesce(p_body, '📎 Attachment'), 140), uid = a_reader, conv, tos, ccs,
        case when uid = gm_id then npc_list else '{}' end,
        case when uid = gm_id then a_name end, case when uid = gm_id then a_addr end,
        uid = any(coalesce(p_bcc, '{}')) and not uid = any(coalesce(p_to, '{}')) and not uid = any(coalesce(p_cc, '{}')),
        coalesce(p_to[1], all_ids[1]))
    returning id into t;
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body, attachments, author_id)
    values (t, uid = a_reader, a_name, a_addr, nullif(p_body, ''), att, me);
    if uid = a_reader then my_copy := t; end if;
  end loop;
  return my_copy;
end;
$$;
grant execute on function public.mail_send2(uuid[], uuid[], uuid[], text, text, jsonb, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  Reply (to everyone on the email)
-- ---------------------------------------------------------------------
create or replace function public.mail_reply2(p_thread uuid, p_body text,
  p_attachments jsonb default '[]'::jsonb, p_as uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); th public.mail_threads; c public.mail_threads;
  a_name text; a_addr text; att jsonb := public.mail_clean_attachments(p_attachments);
begin
  select * into th from public.mail_threads where id = p_thread;
  if th.id is null then raise exception 'That email is gone.'; end if;
  if th.conv_id is null then raise exception 'Use mail_reply for this email.'; end if;
  if th.recipient_id <> me then raise exception 'Not your mailbox.'; end if;
  if coalesce(trim(p_body), '') = '' and jsonb_array_length(att) = 0 then raise exception 'Write something first.'; end if;

  if public.is_admin() then
    if p_as is not null then
      if not p_as = any(th.npc_ids) then raise exception 'That NPC isn''t on this email.'; end if;
      select username into a_name from public.profiles where id = p_as;
      a_addr := public.mail_addr(a_name, 'juniversity.edu');
    else
      a_name := coalesce(th.gm_name, (select username from public.profiles where id = me));
      a_addr := coalesce(th.gm_addr, public.mail_addr(a_name, 'juniversity.edu'));
    end if;
  else
    select username into a_name from public.profiles where id = me;
    a_addr := public.mail_addr(a_name, 'juniversity.edu');
  end if;

  -- A Bcc reader who replies is out in the open now.
  if th.is_bcc then update public.mail_threads set is_bcc = false where id = th.id; end if;

  for c in select * from public.mail_threads where conv_id = th.conv_id and (not is_bcc or id = th.id) loop
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body, attachments, author_id)
    values (c.id, c.id = th.id, a_name, a_addr, nullif(p_body, ''), att, me);
    update public.mail_threads
       set last_at = now(), last_snippet = left(coalesce(p_body, '📎 Attachment'), 140),
           last_from_recipient = (c.id = th.id)
     where id = c.id;
    -- A new reply brings the conversation back to the others' inboxes.
    if c.id <> th.id then
      update public.mail_state set archived = false, deleted = false
       where thread_id = c.id and user_id = c.recipient_id and not purged;
    end if;
  end loop;
end;
$$;
grant execute on function public.mail_reply2(uuid, text, jsonb, uuid) to authenticated;

-- Old-style threads: replies can carry attachments too.
create or replace function public.mail_reply_att(p_thread uuid, p_body text, p_attachments jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare mid uuid; peer uuid;
begin
  perform public.mail_reply(p_thread, coalesce(nullif(trim(p_body), ''), '📎'));
  if jsonb_array_length(public.mail_clean_attachments(p_attachments)) = 0 then return; end if;
  select id into mid from public.mail_messages where thread_id = p_thread order by created_at desc limit 1;
  update public.mail_messages set attachments = public.mail_clean_attachments(p_attachments) where id = mid;
  select peer_thread into peer from public.mail_threads where id = p_thread;
  if peer is not null then
    update public.mail_messages set attachments = public.mail_clean_attachments(p_attachments)
     where id = (select id from public.mail_messages where thread_id = peer order by created_at desc limit 1);
  end if;
end;
$$;
grant execute on function public.mail_reply_att(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  Notifications: in a v2 conversation, whoever's copy gets an email
--  someone else wrote is told. (Old threads work as before.)
-- ---------------------------------------------------------------------
create or replace function public.notif_on_mail()
returns trigger language plpgsql security definer set search_path = public as $$
declare th public.mail_threads; av text; first boolean;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  select * into th from public.mail_threads where id = new.thread_id;
  if th.id is null then return new; end if;

  if th.conv_id is not null then
    if new.from_recipient then return new; end if;            -- your own email
    select avatar_url into av from public.profiles where id = new.author_id;
    perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
      new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, av);
    return new;
  end if;

  if new.from_recipient then
    if th.peer_thread is not null then return new; end if;
    select avatar_url into av from public.profiles where id = th.recipient_id;
    first := (select count(*) from public.mail_messages where thread_id = th.id) <= 1;
    perform public.push_notification(th.owner_admin_id, 'mail', 'mail_reply',
      new.from_name, case when first then 'wrote: ' else 'replied: ' end || th.subject,
      'mail.html?t=' || th.id, th.id, av);
  else
    select avatar_url into av from public.profiles where username = new.from_name limit 1;
    perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
      new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, av);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notif_mail on public.mail_messages;
create trigger trg_notif_mail after insert on public.mail_messages
  for each row execute function public.notif_on_mail();
