-- =====================================================================
--  One-time fix: Kuro's reply-all to Kaori's group email
--  Kuro's latest reply in a conversation Kaori (the NPC) started is
--  taken back out of everyone's mailbox except Kuro's own and the GM's
--  (where Kaori reads it). Their mailboxes and notifications are tidied
--  to match. Nothing else is touched.
--  Run once in the SQL Editor. The result lists who it was removed from.
-- =====================================================================

do $$
declare
  kuro uuid; kaori uuid; gm uuid := public.mail_gm_id();
  r record; c record; n int := 0;
begin
  select id into kuro from public.profiles where username ilike 'kuro%' limit 1;
  if (select count(*) from public.profiles where username ilike 'kuro%') > 1 then
    raise exception 'More than one account starts with "kuro". Tell Claude the exact username.';
  end if;
  select id into kaori from public.profiles where username ilike 'kaori%' limit 1;
  if kuro is null or kaori is null then raise exception 'Couldn''t find Kuro or Kaori.'; end if;

  -- Kuro's most recent reply in a conversation Kaori is on (from Kuro's own copy).
  select m.*, t.conv_id into r
    from public.mail_messages m join public.mail_threads t on t.id = m.thread_id
   where t.recipient_id = kuro and m.author_id = kuro and t.conv_id is not null
     and exists (select 1 from public.mail_threads g where g.conv_id = t.conv_id and kaori = any(g.npc_ids))
   order by m.created_at desc limit 1;
  if r.id is null then raise exception 'No reply from Kuro to a Kaori email was found.'; end if;

  create temp table if not exists fix_report (removed_from text, subject text);
  truncate fix_report;

  for c in select t.* from public.mail_threads t
            where t.conv_id = r.conv_id and t.recipient_id not in (kuro, gm) loop
    delete from public.mail_messages
     where thread_id = c.id and author_id = kuro
       and coalesce(body, '') = coalesce(r.body, '')
       and abs(extract(epoch from (created_at - r.created_at))) < 10;
    if found then
      n := n + 1;
      insert into fix_report select username, c.subject from public.profiles where id = c.recipient_id;
      -- Put their copy back the way it was before the reply.
      update public.mail_threads t set
        last_at = coalesce(x.created_at, t.last_at),
        last_snippet = left(coalesce(x.body, '📎 Attachment'), 140),
        last_from_recipient = coalesce(x.from_recipient, t.last_from_recipient),
        last_from_name = x.from_name,
        i_received = exists (select 1 from public.mail_messages where thread_id = t.id and not from_recipient)
      from (select * from public.mail_messages where thread_id = c.id order by created_at desc limit 1) x
      where t.id = c.id;
      -- And take back the "new email" alert it caused.
      delete from public.notifications where user_id = c.recipient_id and ref_id = c.id and app = 'mail'
         and title = r.from_name;
    end if;
  end loop;

  insert into fix_report values ('— total removed —', n::text);
end $$;

select * from fix_report;
