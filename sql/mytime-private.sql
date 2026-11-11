-- =====================================================================
--  MyTime: make social class and languages private.
--  They move from the public profile (mt_profiles) to mt_private,
--  next to Fears / Biggest Secret. Only the player and the GM can read
--  them, and they show on the Transcript instead of the wall.
--  Run after mytime.sql. Safe to run more than once.
-- =====================================================================

alter table public.mt_private add column if not exists social_class text;
alter table public.mt_private add column if not exists languages    text;

-- Copy anything already written on profiles across...
insert into public.mt_private (user_id, social_class, languages)
select user_id, social_class, languages
  from public.mt_profiles
 where social_class is not null or languages is not null
on conflict (user_id) do update
  set social_class = coalesce(public.mt_private.social_class, excluded.social_class),
      languages    = coalesce(public.mt_private.languages,    excluded.languages);

-- ...then clear the public copies so other players can't read them.
update public.mt_profiles set social_class = null, languages = null
 where social_class is not null or languages is not null;
