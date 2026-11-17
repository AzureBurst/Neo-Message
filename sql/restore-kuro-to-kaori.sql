-- =====================================================================
--  One-time fix: put Kuro's reply back in Kaori's inbox
--  The earlier clean-up took Kuro's reply out of every copy except
--  Kuro's and the GM's, but Kaori's mass email was sent from Kaori's
--  own account, so it also took it out of Kaori's. This copies it back
--  from Kuro's Sent into Kaori's copy, unread, at its original time.
--  Nobody else is touched. Safe to run more than once.
-- =====================================================================

do $$
declare
  kuro uuid := (select id from public.profiles where username ilike 'kuro%' order by created_at limit 1);
  kaori uuid := (select id from public.profiles where username ilike 'kaori%' order by created_at limit 1);
  kt public.mail_threads; km public.mail_messages; new_id uuid;
begin
  if kuro is null or kaori is null then raise exception 'Couldn''t find Kuro or Kaori.'; end if;

  -- Kuro's latest reply in a conversation Kaori has a copy of.
  select m.* into km
    from public.mail_messages m join public.mail_threads t on t.id = m.thread_id
   where t.recipient_id = kuro and m.from_recipient and t.conv_id is not null
     and exists (select 1 from public.mail_threads k where k.conv_id = t.conv_id and k.recipient_id = kaori)
   order by m.created_at desc limit 1;
  if km.id is null then raise exception 'Couldn''t find Kuro''s reply to a Kaori email.'; end if;

  select k.* into kt from public.mail_threads k
   where k.recipient_id = kaori and k.conv_id = (select conv_id from public.mail_threads where id = km.thread_id);

  if not exists (select 1 from public.mail_messages
                  where thread_id = kt.id and coalesce(body, '') = coalesce(km.body, '')
                    and abs(extract(epoch from (created_at - km.created_at))) < 10) then
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body, attachments, author_id)
    values (kt.id, false, km.from_name, km.from_addr, km.body, km.attachments, km.author_id)
    returning id into new_id;
    -- Back to its original real and in-story time.
    update public.mail_messages set created_at = km.created_at,
           story_at = coalesce(km.story_at, km.created_at)
     where id = new_id;
  end if;

  update public.mail_threads set
    last_at = greatest(last_at, km.created_at), last_snippet = left(coalesce(km.body, '📎 Attachment'), 140),
    last_from_recipient = false, last_from_name = km.from_name, i_received = true,
    last_story_at = coalesce(km.story_at, km.created_at)
   where id = kt.id;
  -- Out of Archive / Bin and unread again, so it's in her Inbox.
  update public.mail_state set archived = false, deleted = false, purged = false, read_at = null
   where thread_id = kt.id and user_id = kaori;
end $$;

-- Kaori's copy now (the last line should be Kuro's reply):
select m.from_name, left(m.body, 80) as starts_with, m.created_at
  from public.mail_messages m
 where m.thread_id = (select k.id from public.mail_threads k
                       where k.recipient_id = (select id from public.profiles where username ilike 'kaori%' order by created_at limit 1)
                         and k.conv_id is not null order by k.last_at desc limit 1)
 order by m.created_at;
