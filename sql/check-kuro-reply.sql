-- Read-only: where Kuro's emails ended up. Changes nothing.
-- "kind" says whether the email used the new group model (v2) or the
-- older one-to-one threads.
select p.username                       as mailbox,
       t.subject,
       case when t.conv_id is null then 'old one-to-one' else 'v2 group' end as kind,
       t.gm_name                        as gm_wrote_as,
       (select count(*) from public.mail_messages m
         where m.thread_id = t.id and m.from_name ilike 'kuro%') as kuro_emails_here,
       (select count(*) from public.mail_messages m where m.thread_id = t.id) as emails_in_thread
  from public.mail_threads t
  join public.profiles p on p.id = t.recipient_id
 where exists (select 1 from public.mail_messages m where m.thread_id = t.id and m.from_name ilike 'kuro%')
    or t.conv_id in (select conv_id from public.mail_threads t2
                      join public.mail_messages m on m.thread_id = t2.id
                     where m.from_name ilike 'kuro%' and t2.conv_id is not null)
 order by t.subject, p.username;
