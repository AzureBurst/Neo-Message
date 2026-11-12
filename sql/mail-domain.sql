-- =====================================================================
--  Neomail addresses: @juniversity.edu
--  New mail already uses name@juniversity.edu (the site sends the
--  domain). This moves every address saved on old mail from
--  @neo.mail or @neo.com to @juniversity.edu, and makes the school domain the
--  fallback. Addresses you typed yourself for NPCs on other domains
--  (e.g. someone@citybank.com) are left alone.
--  Safe to run more than once.
-- =====================================================================

create or replace function public.mail_addr(uname text, domain text) returns text
language sql immutable as $$
  select lower(regexp_replace(coalesce(uname, 'unknown'), '[^A-Za-z0-9._]', '', 'g')) || '@' || coalesce(domain, 'juniversity.edu');
$$;

update public.mail_threads
   set sender_addr = regexp_replace(sender_addr, '@neo\.(mail|com)$', '@juniversity.edu', 'i')
 where sender_addr ~* '@neo\.(mail|com)$';

update public.mail_messages
   set from_addr = regexp_replace(from_addr, '@neo\.(mail|com)$', '@juniversity.edu', 'i')
 where from_addr ~* '@neo\.(mail|com)$';

-- What's left on other domains (should only be ones you typed on purpose).
select split_part(sender_addr, '@', 2) as domain, count(*) as threads
  from public.mail_threads group by 1 order by 2 desc;
