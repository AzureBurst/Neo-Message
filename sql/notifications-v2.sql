-- =====================================================================
--  NOTIFICATIONS v2 — sender avatars + deep links
--  Run this once in the Supabase SQL Editor, after notifications.sql.
--
--  Adds the avatar of whoever caused a notification, and makes each
--  notification link to the exact thing it is about (a specific thread,
--  post, profile or event) instead of just the app's front page.
--
--  Idempotent and safe to re-run.
-- =====================================================================

alter table public.notifications
  add column if not exists actor_avatar text;


-- Rebuild the push helper to carry an avatar. Drop the old signature
-- first so there is only ever one version.
drop function if exists public.push_notification(uuid, text, text, text, text, text, uuid);

create or replace function public.push_notification(
  p_user uuid, p_app text, p_kind text,
  p_title text, p_body text, p_link text, p_ref uuid, p_avatar text default null)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user is null then return; end if;

  update public.notifications
     set count = count + 1, created_at = now(),
         title = p_title, body = p_body, read_at = null,
         actor_avatar = coalesce(p_avatar, actor_avatar), link = p_link
   where user_id = p_user and kind = p_kind and read_at is null
     and coalesce(ref_id::text, '') = coalesce(p_ref::text, '');

  if not found then
    insert into public.notifications
      (user_id, app, kind, title, body, link, ref_id, actor_avatar)
    values (p_user, p_app, p_kind, p_title, p_body, p_link, p_ref, p_avatar);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  MESSAGES — sender avatar, link straight to the thread.
-- ---------------------------------------------------------------------

create or replace function public.notif_on_message()
returns trigger language plpgsql security definer
set search_path = public as $$
declare r record; sender_name text; sender_av text;
begin
  select username, avatar_url into sender_name, sender_av
    from public.profiles where id = new.sender_id;
  for r in
    select user_id from public.conversation_members
     where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.push_notification(
      r.user_id, 'messages', 'message',
      coalesce(sender_name, 'Someone'), 'New message',
      'app.html?c=' || new.conversation_id, new.conversation_id, sender_av);
  end loop;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
--  INSTAGRAT — actor avatar, link to the post or profile.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.ig_follows') is not null then
    create or replace function public.notif_on_follow()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare who text; av text;
    begin
      select screen_name, avatar_url into who, av
        from public.ig_profiles where id = new.follower_id;
      if new.accepted then
        perform public.push_notification(new.followee_id, 'instagrat', 'ig_follower',
          '@' || coalesce(who,'someone'), 'started following you',
          'instagrat.html?user=' || new.follower_id, new.follower_id, av);
      else
        perform public.push_notification(new.followee_id, 'instagrat', 'ig_follow_request',
          '@' || coalesce(who,'someone'), 'requested to follow you',
          'instagrat.html?user=' || new.follower_id, new.follower_id, av);
      end if;
      return new;
    end;
    $fn$;

    create or replace function public.notif_on_follow_accept()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare who text; av text;
    begin
      if new.accepted and not old.accepted then
        select screen_name, avatar_url into who, av
          from public.ig_profiles where id = new.followee_id;
        perform public.push_notification(new.follower_id, 'instagrat', 'ig_follow_accepted',
          '@' || coalesce(who,'someone'), 'accepted your follow',
          'instagrat.html?user=' || new.followee_id, new.followee_id, av);
      end if;
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.ig_comments') is not null then
    create or replace function public.notif_on_comment()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare author uuid; who text; av text;
    begin
      select author_id into author from public.ig_posts where id = new.post_id;
      if author is not null and author <> new.author_id then
        select screen_name, avatar_url into who, av
          from public.ig_profiles where id = new.author_id;
        perform public.push_notification(author, 'instagrat', 'ig_comment',
          '@' || coalesce(new.ghost_name, who, 'someone'), 'commented on your post',
          'instagrat.html?post=' || new.post_id, new.post_id, av);
      end if;
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.ig_likes') is not null then
    create or replace function public.notif_on_like()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare author uuid; who text; av text;
    begin
      select author_id into author from public.ig_posts where id = new.post_id;
      if author is not null and author <> new.liker_id then
        select screen_name, avatar_url into who, av
          from public.ig_profiles where id = new.liker_id;
        perform public.push_notification(author, 'instagrat', 'ig_like',
          '@' || coalesce(who,'someone'), 'liked your post',
          'instagrat.html?post=' || new.post_id, new.post_id, av);
      end if;
      return new;
    end;
    $fn$;
  end if;

  if to_regclass('public.ig_posts') is not null then
    create or replace function public.notif_on_post()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare a record;
    begin
      if tg_op = 'INSERT' and new.status = 'pending' then
        for a in select id from public.profiles where is_admin loop
          perform public.push_notification(a.id, 'instagrat', 'ig_post_pending',
            'A post is waiting', 'Review it in the queue',
            'instagrat.html?post=' || new.id, new.id, null);
        end loop;
      elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
        perform public.push_notification(new.author_id, 'instagrat', 'ig_post_approved',
          'Your post is live', 'The GM approved it',
          'instagrat.html?post=' || new.id, new.id, null);
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;


-- ---------------------------------------------------------------------
--  CALENDAR — link to the event's date.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.calendar_events') is not null then
    create or replace function public.notif_on_gm_event()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare a record; gm_av text;
    begin
      if new.is_public then
        select avatar_url into gm_av from public.profiles where id = new.owner_id;
        for a in select id from public.profiles where id <> new.owner_id loop
          perform public.push_notification(a.id, 'calendar', 'calendar_gm',
            'New event: ' || new.title, to_char(new.start_date, 'Mon DD'),
            'calendar.html?event=' || new.id, new.id, gm_av);
        end loop;
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;
