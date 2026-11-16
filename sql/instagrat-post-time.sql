-- =====================================================================
--  Instagrat: the GM can change a post's date and time
--  Sets the in-story time shown on a post (story_at). Only the GM can
--  do it; players' posts still get the story clock's time when made.
--  Run after instagrat-tags-date.sql. Safe to run more than once.
-- =====================================================================

create or replace function public.ig_set_post_time(p_post uuid, p_at timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only the GM can change a post''s time.'; end if;
  if p_at is null then raise exception 'Pick a date and time.'; end if;
  update public.ig_posts set story_at = p_at where id = p_post;
  if not found then raise exception 'That post is gone.'; end if;
  return p_at;
end;
$$;
grant execute on function public.ig_set_post_time(uuid, timestamptz) to authenticated;
