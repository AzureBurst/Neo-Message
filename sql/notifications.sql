-- =====================================================================
--  NOTIFICATIONS
--  Run this once in the Supabase SQL Editor, after the other app files
--  (schema.sql, instagrat.sql, calendar.sql). Anything it references
--  that you have not installed simply never fires.
--
--  One table collects everything worth telling a player about. Triggers
--  on the various tables push rows into it; the app shows them in a
--  pull-down shade and counts the unread ones on each home icon.
--
--  Every insert happens inside SECURITY DEFINER trigger functions, so a
--  player can never fabricate a notification — they can only read, and
--  mark read, their own.
-- =====================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        text not null,                 -- 'messages' | 'instagrat' | 'calendar'
  kind       text not null,
  title      text not null,
  body       text,
  link       text,                          -- page to open when tapped
  ref_id     uuid,                          -- the thing it is about (for collapsing)
  count      int not null default 1,        -- collapsed repeats (e.g. 3 new messages)
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notif_user_unread on public.notifications (user_id, read_at);
create index if not exists notif_user_recent on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- You see, mark read, and clear only your own. No insert policy exists,
-- so nothing but the definer functions below can create them.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
--  push helper — collapses repeats so a busy thread is one row that
--  counts up, not fifty rows.
-- ---------------------------------------------------------------------

create or replace function public.push_notification(
  p_user uuid, p_app text, p_kind text,
  p_title text, p_body text, p_link text, p_ref uuid)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user is null then return; end if;

  update public.notifications
     set count = count + 1, created_at = now(),
         title = p_title, body = p_body, read_at = null
   where user_id = p_user and kind = p_kind and read_at is null
     and coalesce(ref_id::text, '') = coalesce(p_ref::text, '');

  if not found then
    insert into public.notifications (user_id, app, kind, title, body, link, ref_id)
    values (p_user, p_app, p_kind, p_title, p_body, p_link, p_ref);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
--  MESSAGES — tell the other members of a thread.
-- ---------------------------------------------------------------------

create or replace function public.notif_on_message()
returns trigger language plpgsql security definer
set search_path = public as $$
declare r record; sender_name text;
begin
  select username into sender_name from public.profiles where id = new.sender_id;
  for r in
    select user_id from public.conversation_members
     where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.push_notification(
      r.user_id, 'messages', 'message',
      coalesce(sender_name, 'Someone'), 'New message', 'app.html', new.conversation_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notif_message on public.messages;
create trigger trg_notif_message
  after insert on public.messages
  for each row execute function public.notif_on_message();


-- ---------------------------------------------------------------------
--  INSTAGRAT — follows, comments, likes, approvals, and the admin queue.
--  Each block is guarded so it does nothing if Instagrat is not
--  installed (the tables simply will not exist, so the trigger is never
--  created — the DO blocks below check first).
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.ig_follows') is not null then

    create or replace function public.notif_on_follow()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare who text;
    begin
      select screen_name into who from public.ig_profiles where id = new.follower_id;
      if new.accepted then
        perform public.push_notification(new.followee_id, 'instagrat', 'ig_follower',
          '@' || coalesce(who,'someone'), 'started following you', 'instagrat.html', new.follower_id);
      else
        perform public.push_notification(new.followee_id, 'instagrat', 'ig_follow_request',
          '@' || coalesce(who,'someone'), 'requested to follow you', 'instagrat.html', new.follower_id);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_follow on public.ig_follows;
    create trigger trg_notif_follow after insert on public.ig_follows
      for each row execute function public.notif_on_follow();

    create or replace function public.notif_on_follow_accept()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare who text;
    begin
      if new.accepted and not old.accepted then
        select screen_name into who from public.ig_profiles where id = new.followee_id;
        perform public.push_notification(new.follower_id, 'instagrat', 'ig_follow_accepted',
          '@' || coalesce(who,'someone'), 'accepted your follow', 'instagrat.html', new.followee_id);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_follow_accept on public.ig_follows;
    create trigger trg_notif_follow_accept after update on public.ig_follows
      for each row execute function public.notif_on_follow_accept();
  end if;

  if to_regclass('public.ig_comments') is not null then
    create or replace function public.notif_on_comment()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare author uuid; who text;
    begin
      select author_id into author from public.ig_posts where id = new.post_id;
      if author is not null and author <> new.author_id then
        select screen_name into who from public.ig_profiles where id = new.author_id;
        perform public.push_notification(author, 'instagrat', 'ig_comment',
          '@' || coalesce(new.ghost_name, who, 'someone'), 'commented on your post',
          'instagrat.html', new.post_id);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_comment on public.ig_comments;
    create trigger trg_notif_comment after insert on public.ig_comments
      for each row execute function public.notif_on_comment();
  end if;

  if to_regclass('public.ig_likes') is not null then
    create or replace function public.notif_on_like()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare author uuid; who text;
    begin
      select author_id into author from public.ig_posts where id = new.post_id;
      if author is not null and author <> new.liker_id then
        select screen_name into who from public.ig_profiles where id = new.liker_id;
        perform public.push_notification(author, 'instagrat', 'ig_like',
          '@' || coalesce(who,'someone'), 'liked your post', 'instagrat.html', new.post_id);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_like on public.ig_likes;
    create trigger trg_notif_like after insert on public.ig_likes
      for each row execute function public.notif_on_like();
  end if;

  if to_regclass('public.ig_posts') is not null then
    -- Author told when their post is approved; admins told when one is waiting.
    create or replace function public.notif_on_post()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare a record;
    begin
      if tg_op = 'INSERT' and new.status = 'pending' then
        for a in select id from public.profiles where is_admin loop
          perform public.push_notification(a.id, 'instagrat', 'ig_post_pending',
            'A post is waiting', 'Review it in the queue', 'instagrat.html', new.id);
        end loop;
      elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
        perform public.push_notification(new.author_id, 'instagrat', 'ig_post_approved',
          'Your post is live', 'The GM approved it', 'instagrat.html', new.id);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_post on public.ig_posts;
    create trigger trg_notif_post after insert or update on public.ig_posts
      for each row execute function public.notif_on_post();
  end if;
end $$;


-- ---------------------------------------------------------------------
--  CALENDAR — a GM event pings everyone.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.calendar_events') is not null then
    create or replace function public.notif_on_gm_event()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare a record;
    begin
      if new.is_public then
        for a in select id from public.profiles where id <> new.owner_id loop
          perform public.push_notification(a.id, 'calendar', 'calendar_gm',
            'New event: ' || new.title, to_char(new.start_date, 'Mon DD'),
            'calendar.html', new.id);
        end loop;
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_gm_event on public.calendar_events;
    create trigger trg_notif_gm_event after insert on public.calendar_events
      for each row execute function public.notif_on_gm_event();
  end if;
end $$;


-- ---------------------------------------------------------------------
--  Realtime, so the shade and badges update the moment something lands.
-- ---------------------------------------------------------------------

alter table public.notifications replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null; end;
end $$;
