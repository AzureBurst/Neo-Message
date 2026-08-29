-- =====================================================================
--  INSTAGRAT — re-date existing posts to the story clock (optional)
--
--  Posts made before the story-date feature carry their real creation
--  date. Run this to move them ALL to the date the app is currently set
--  to, so an existing feed reads as happening on your story's date.
--
--  Requires story-clock.sql and instagrat-tags-date.sql to have run.
--  Safe to run more than once. It only touches the displayed story date,
--  never the real created_at.
-- =====================================================================

update public.ig_posts p
set story_at = coalesce(
  (select (value->>'at')::timestamptz
     from public.app_settings
     where key = 'story_clock'
       and coalesce((value->>'frozen')::boolean, false)
       and (value->>'at') is not null),
  p.story_at,          -- clock not frozen? leave each post as it is
  p.created_at
);
