-- =====================================================================
--  INSTAGRAT — admin extras
--  Run this once in the Supabase SQL Editor, after instagrat.sql.
--
--  Adds the GM's stagecraft tools: padded follower and like counts,
--  fabricated ("ghost") comments, and post deletion. The numbers are
--  cosmetic — clicking a follower count still lists only real accounts,
--  because the padding is a separate column, never a fake row.
--
--  Every one of these is gated to admins inside the database, so a
--  player cannot pad their own numbers or forge a ghost comment even by
--  calling the API directly.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. COLUMNS
--     Padding is added on top of the real count for display. It is never
--     a fake follow row, so the followers list stays truthful.
-- ---------------------------------------------------------------------

alter table public.ig_profiles
  add column if not exists fake_followers int not null default 0;

alter table public.ig_posts
  add column if not exists fake_likes int not null default 0;

-- A ghost comment shows under a made-up name instead of a real profile.
alter table public.ig_comments
  add column if not exists ghost_name text;


-- ---------------------------------------------------------------------
--  2. GUARDS
--     The padding columns live on tables a player can already write to
--     (their own profile; their own comments), so a plain policy is not
--     enough — these triggers stop a non-admin from touching them.
-- ---------------------------------------------------------------------

create or replace function public.ig_guard_profile_padding()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.fake_followers is distinct from old.fake_followers
     and not public.is_admin() then
    raise exception 'Only an admin can change follower padding';
  end if;
  return new;
end;
$$;

drop trigger if exists ig_profiles_guard on public.ig_profiles;
create trigger ig_profiles_guard
  before update on public.ig_profiles
  for each row execute function public.ig_guard_profile_padding();


create or replace function public.ig_guard_ghost()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.ghost_name is not null and not public.is_admin() then
    raise exception 'Only an admin can post a ghost comment';
  end if;
  return new;
end;
$$;

drop trigger if exists ig_comments_guard on public.ig_comments;
create trigger ig_comments_guard
  before insert on public.ig_comments
  for each row execute function public.ig_guard_ghost();


-- ---------------------------------------------------------------------
--  3. FOLLOWER LISTS FOR EVERYONE
--     So that clicking a follower count shows the real accounts, an
--     accepted follow is now readable by any signed-in user — the same
--     "who follows whom is public" idea a real photo app uses. Pending
--     requests stay private to the two people involved and admins.
-- ---------------------------------------------------------------------

drop policy if exists ig_follows_read on public.ig_follows;
create policy ig_follows_read on public.ig_follows
  for select to authenticated
  using (
    accepted
    or follower_id = auth.uid()
    or followee_id = auth.uid()
    or public.is_admin()
  );


-- ---------------------------------------------------------------------
--  4. RPCs — all admin-only, checked here on the server
-- ---------------------------------------------------------------------

-- Set the fake follower padding on an account. Pass the extra count to
-- add on top of the real followers, not the total.
create or replace function public.ig_admin_set_followers(target uuid, extra int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can pad followers';
  end if;
  update public.ig_profiles
     set fake_followers = greatest(coalesce(extra, 0), 0)
   where id = target;
end;
$$;

-- Set the fake like padding on a post, again as an amount to add.
create or replace function public.ig_admin_set_likes(post uuid, extra int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can pad likes';
  end if;
  update public.ig_posts
     set fake_likes = greatest(coalesce(extra, 0), 0)
   where id = post;
end;
$$;

-- Drop a fabricated comment under a made-up name. The row still belongs
-- to the admin's account for accountability; ghost_name is what shows.
create or replace function public.ig_admin_comment(post uuid, ghost text, body text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  new_id uuid;
  made   timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can post a ghost comment';
  end if;
  if coalesce(trim(ghost), '') = '' then
    raise exception 'Give the ghost a name';
  end if;

  insert into public.ig_comments (post_id, author_id, body, ghost_name)
  values (post, auth.uid(), body, trim(ghost))
  returning id, created_at into new_id, made;

  return jsonb_build_object('id', new_id, 'ghost_name', trim(ghost),
                            'body', body, 'created_at', made);
end;
$$;

-- Post deletion needs no new function: the delete policy in
-- instagrat.sql already allows an author to remove their own post and an
-- admin to remove anyone's, and likes/comments cascade away with it.
