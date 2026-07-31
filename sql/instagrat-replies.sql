-- =====================================================================
--  INSTAGRAT — comment replies
--  Run this once in the Supabase SQL Editor, after instagrat.sql
--  (and instagrat-admin.sql if you are using the GM tools).
--
--  Adds one level of threading: a comment may hang off another comment.
--  Replies inherit the parent's visibility because they live on the
--  same post, so no new read rules are needed.
-- =====================================================================

alter table public.ig_comments
  add column if not exists parent_id uuid
    references public.ig_comments(id) on delete cascade;

create index if not exists ig_comments_parent
  on public.ig_comments (parent_id);


-- A reply must sit on the same post as the comment it answers, or the
-- thread could splinter across posts. Enforced rather than trusted.
create or replace function public.ig_comment_same_post()
returns trigger language plpgsql
set search_path = public as $$
declare
  parent_post uuid;
begin
  if new.parent_id is not null then
    select post_id into parent_post
    from public.ig_comments where id = new.parent_id;

    if parent_post is null then
      raise exception 'That comment no longer exists';
    end if;
    if parent_post <> new.post_id then
      raise exception 'A reply must be on the same post as its parent';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ig_comments_same_post on public.ig_comments;
create trigger ig_comments_same_post
  before insert on public.ig_comments
  for each row execute function public.ig_comment_same_post();


-- Extend the ghost-comment RPC so an admin can also reply as a ghost.
-- The `parent` argument is optional; omit it for a top-level comment.
--
-- The earlier 3-argument version from instagrat-admin.sql is dropped
-- first: leaving both would give PostgREST two candidates for a 3-arg
-- call and it would refuse as ambiguous.
drop function if exists public.ig_admin_comment(uuid, text, text);

create or replace function public.ig_admin_comment(
  post uuid, ghost text, body text, parent uuid default null)
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

  insert into public.ig_comments (post_id, author_id, body, ghost_name, parent_id)
  values (post, auth.uid(), body, trim(ghost), parent)
  returning id, created_at into new_id, made;

  return jsonb_build_object('id', new_id, 'ghost_name', trim(ghost),
                            'body', body, 'created_at', made, 'parent_id', parent);
end;
$$;
