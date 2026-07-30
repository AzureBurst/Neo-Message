-- =====================================================================
--  INSTAGRAT — a photo app that shares Neo Message's login
--
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Same account, separate identity: a player signs in exactly as before,
--  then sets up a screen name and bio that are theirs on Instagrat only.
--  Their phone number and Neo Message username never appear here.
--
--  Posts are held for a GM's approval. The poster sees their own pending
--  post marked as such; nobody else sees it until it is approved.
--
--  Accounts are public or private. A public account's approved posts go
--  to the shared feed. A private account's posts are visible only to
--  followers it has accepted.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. IDENTITY
-- ---------------------------------------------------------------------

create table if not exists public.ig_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  screen_name  text unique not null,
  display_name text,
  bio          text,
  avatar_url   text,
  is_private   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint ig_screen_name_shape
    check (screen_name ~ '^[a-z0-9._]{2,24}$')
);

-- Case-insensitive uniqueness, so "Hazel" and "hazel" cannot both exist.
create unique index if not exists ig_profiles_screen_lower
  on public.ig_profiles (lower(screen_name));


-- ---------------------------------------------------------------------
--  2. FOLLOWS
--     A row is a request. `accepted` is true immediately for a public
--     target and waits for approval for a private one.
-- ---------------------------------------------------------------------

create table if not exists public.ig_follows (
  follower_id uuid not null references public.ig_profiles(id) on delete cascade,
  followee_id uuid not null references public.ig_profiles(id) on delete cascade,
  accepted    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint ig_no_self_follow check (follower_id <> followee_id)
);

create index if not exists ig_follows_followee on public.ig_follows (followee_id);
create index if not exists ig_follows_follower on public.ig_follows (follower_id);


-- ---------------------------------------------------------------------
--  3. POSTS
--     status: pending -> approved | rejected. Images only for now.
-- ---------------------------------------------------------------------

create table if not exists public.ig_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.ig_profiles(id) on delete cascade,
  image_url   text not null,
  caption     text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.ig_profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists ig_posts_author  on public.ig_posts (author_id, created_at desc);
create index if not exists ig_posts_status  on public.ig_posts (status, created_at desc);


-- ---------------------------------------------------------------------
--  4. LIKES + COMMENTS
-- ---------------------------------------------------------------------

create table if not exists public.ig_likes (
  post_id    uuid not null references public.ig_posts(id) on delete cascade,
  liker_id   uuid not null references public.ig_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, liker_id)
);

create table if not exists public.ig_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.ig_posts(id) on delete cascade,
  author_id  uuid not null references public.ig_profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists ig_comments_post on public.ig_comments (post_id, created_at);
create index if not exists ig_likes_post     on public.ig_likes (post_id);


-- ---------------------------------------------------------------------
--  5. HELPERS
--     SECURITY DEFINER so the policies can call them without tripping
--     over their own row level security, the same pattern schema.sql
--     uses for is_admin() and is_member().
-- ---------------------------------------------------------------------

-- Do I (the caller) follow this author, with the follow accepted?
create or replace function public.ig_follows_accepted(author uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.ig_follows f
    where f.follower_id = auth.uid()
      and f.followee_id = author
      and f.accepted
  );
$$;

-- Is this author a public account?
create or replace function public.ig_is_public(author uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select not is_private from public.ig_profiles where id = author),
    false);
$$;

-- May the caller see this author's approved posts?
--   yes if it is themselves, or the author is public,
--   or the author is private and the caller is an accepted follower,
--   or the caller is a game admin.
create or replace function public.ig_can_view(author uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    auth.uid() = author
    or public.is_admin()
    or public.ig_is_public(author)
    or public.ig_follows_accepted(author);
$$;


-- ---------------------------------------------------------------------
--  6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.ig_profiles enable row level security;
alter table public.ig_follows  enable row level security;
alter table public.ig_posts    enable row level security;
alter table public.ig_likes    enable row level security;
alter table public.ig_comments enable row level security;

-- Profiles: everyone signed in can read them (you must be able to find
-- people and see that private accounts exist). You may only write your
-- own.
drop policy if exists ig_profiles_read on public.ig_profiles;
create policy ig_profiles_read on public.ig_profiles
  for select to authenticated using (true);

drop policy if exists ig_profiles_upsert on public.ig_profiles;
create policy ig_profiles_upsert on public.ig_profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists ig_profiles_update on public.ig_profiles;
create policy ig_profiles_update on public.ig_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Follows: you can see follow rows that involve you, or that an admin is
-- reviewing. You create your own follow requests. You can accept ones
-- pointed at you (update), and either side can remove one (delete).
drop policy if exists ig_follows_read on public.ig_follows;
create policy ig_follows_read on public.ig_follows
  for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid() or public.is_admin());

drop policy if exists ig_follows_create on public.ig_follows;
create policy ig_follows_create on public.ig_follows
  for insert to authenticated
  with check (follower_id = auth.uid());

drop policy if exists ig_follows_accept on public.ig_follows;
create policy ig_follows_accept on public.ig_follows
  for update to authenticated
  using (followee_id = auth.uid()) with check (followee_id = auth.uid());

drop policy if exists ig_follows_remove on public.ig_follows;
create policy ig_follows_remove on public.ig_follows
  for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- Posts: you always see your own, in any status. Others see a post only
-- when it is approved AND they are allowed to view that author. Admins
-- see everything, which is what makes the moderation queue possible.
drop policy if exists ig_posts_read on public.ig_posts;
create policy ig_posts_read on public.ig_posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or (status = 'approved' and public.ig_can_view(author_id))
  );

-- You post as yourself, and only ever as pending — approval is not
-- something the client can grant itself.
drop policy if exists ig_posts_create on public.ig_posts;
create policy ig_posts_create on public.ig_posts
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending');

-- You can delete your own post. Moderation (approve/reject) goes through
-- the RPC below, not a direct update, so status changes stay admin-only.
drop policy if exists ig_posts_delete on public.ig_posts;
create policy ig_posts_delete on public.ig_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Likes + comments: visible when you can see the post they hang off.
drop policy if exists ig_likes_read on public.ig_likes;
create policy ig_likes_read on public.ig_likes
  for select to authenticated
  using (exists (select 1 from public.ig_posts p
                 where p.id = post_id
                   and (p.author_id = auth.uid() or public.is_admin()
                        or (p.status = 'approved' and public.ig_can_view(p.author_id)))));

drop policy if exists ig_likes_write on public.ig_likes;
create policy ig_likes_write on public.ig_likes
  for insert to authenticated with check (liker_id = auth.uid());

drop policy if exists ig_likes_unlike on public.ig_likes;
create policy ig_likes_unlike on public.ig_likes
  for delete to authenticated using (liker_id = auth.uid());

drop policy if exists ig_comments_read on public.ig_comments;
create policy ig_comments_read on public.ig_comments
  for select to authenticated
  using (exists (select 1 from public.ig_posts p
                 where p.id = post_id
                   and (p.author_id = auth.uid() or public.is_admin()
                        or (p.status = 'approved' and public.ig_can_view(p.author_id)))));

drop policy if exists ig_comments_write on public.ig_comments;
create policy ig_comments_write on public.ig_comments
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists ig_comments_delete on public.ig_comments;
create policy ig_comments_delete on public.ig_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
--  7. RPCs
-- ---------------------------------------------------------------------

-- Follow someone. Auto-accepts for a public account, waits otherwise.
-- Returns the resulting state so the button can update itself.
create or replace function public.ig_follow(target uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  target_private boolean;
  ok boolean;
begin
  if target = auth.uid() then
    raise exception 'You cannot follow yourself';
  end if;

  select is_private into target_private from public.ig_profiles where id = target;
  if not found then raise exception 'No such account'; end if;

  ok := not target_private;    -- public -> accepted at once

  insert into public.ig_follows (follower_id, followee_id, accepted)
  values (auth.uid(), target, ok)
  on conflict (follower_id, followee_id)
    do update set accepted = public.ig_follows.accepted;  -- leave as-is

  -- Report the row's real state, not just what this call intended. If
  -- an accepted follow already existed, this stays 'following'.
  select accepted into ok
  from public.ig_follows
  where follower_id = auth.uid() and followee_id = target;

  return case when ok then 'following' else 'requested' end;
end;
$$;

-- Approve or reject a post. Admin only, enforced here on the server.
create or replace function public.ig_review_post(post uuid, decision text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review posts';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  update public.ig_posts
     set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
   where id = post;
end;
$$;


-- ---------------------------------------------------------------------
--  8. STORAGE
--     One public bucket for Instagrat media. Uploads must land in a
--     folder named after the uploader's id, same rule as the avatars
--     and attachments buckets in schema.sql.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('ig_media', 'ig_media', true)
on conflict (id) do nothing;

drop policy if exists ig_media_read on storage.objects;
create policy ig_media_read on storage.objects
  for select to public using (bucket_id = 'ig_media');

drop policy if exists ig_media_write on storage.objects;
create policy ig_media_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ig_media'
              and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
--  9. REALTIME
-- ---------------------------------------------------------------------

alter table public.ig_posts    replica identity full;
alter table public.ig_follows  replica identity full;

do $$
declare t text;
begin
  foreach t in array array['ig_posts', 'ig_follows', 'ig_likes', 'ig_comments'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
