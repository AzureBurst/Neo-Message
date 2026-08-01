-- =====================================================================
--  INSTAGRAT — photo tags + story date
--  Run this once in the Supabase SQL Editor, after instagrat.sql.
--
--  Two additions:
--   * tag people onto a photo, at a spot on the image, like the real app
--   * stamp each post with the in-fiction date from the GM's story clock,
--     so posts read as happening on whatever day the scene is set
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. TAGS
--     x and y are fractions 0..1 giving where on the photo the tag sits.
-- ---------------------------------------------------------------------

create table if not exists public.ig_post_tags (
  post_id   uuid not null references public.ig_posts(id)    on delete cascade,
  tagged_id uuid not null references public.ig_profiles(id) on delete cascade,
  x         numeric not null default 0.5,
  y         numeric not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (post_id, tagged_id)
);

create index if not exists ig_tags_post   on public.ig_post_tags (post_id);
create index if not exists ig_tags_person on public.ig_post_tags (tagged_id);

alter table public.ig_post_tags enable row level security;

-- Read a tag when you can read the post it is on.
drop policy if exists ig_tags_read on public.ig_post_tags;
create policy ig_tags_read on public.ig_post_tags
  for select to authenticated
  using (exists (
    select 1 from public.ig_posts p
    where p.id = post_id
      and (p.author_id = auth.uid() or public.is_admin()
           or (p.status = 'approved' and public.ig_can_view(p.author_id)))));

-- Only the post's author or an admin may tag or untag on it.
drop policy if exists ig_tags_write on public.ig_post_tags;
create policy ig_tags_write on public.ig_post_tags
  for insert to authenticated
  with check (exists (
    select 1 from public.ig_posts p
    where p.id = post_id and (p.author_id = auth.uid() or public.is_admin())));

drop policy if exists ig_tags_delete on public.ig_post_tags;
create policy ig_tags_delete on public.ig_post_tags
  for delete to authenticated
  using (exists (
    select 1 from public.ig_posts p
    where p.id = post_id and (p.author_id = auth.uid() or public.is_admin())));


-- ---------------------------------------------------------------------
--  2. STORY DATE
--     The date a post "happened", taken from the story clock at the
--     moment it is created. Computed on the server so it is right no
--     matter what the client sends.
-- ---------------------------------------------------------------------

alter table public.ig_posts
  add column if not exists story_at timestamptz;

create or replace function public.ig_set_story_at()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v jsonb;
begin
  if new.story_at is not null then
    return new;                       -- respect an explicit value
  end if;

  -- Read the shared story clock if it exists. If story-clock.sql was
  -- never run, fall through to real time.
  begin
    select value into v from public.app_settings where key = 'story_clock';
  exception when undefined_table then
    v := null;
  end;

  if v is not null
     and coalesce((v->>'frozen')::boolean, false)
     and (v->>'at') is not null then
    new.story_at := (v->>'at')::timestamptz;
  else
    new.story_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists ig_posts_story_at on public.ig_posts;
create trigger ig_posts_story_at
  before insert on public.ig_posts
  for each row execute function public.ig_set_story_at();

-- Existing posts: date them by when they were really made.
update public.ig_posts set story_at = created_at where story_at is null;


-- ---------------------------------------------------------------------
--  3. REALTIME (optional; keeps tags live if you want them to be)
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.ig_post_tags;
  exception when duplicate_object then null;
  end;
end $$;
