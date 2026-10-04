-- =====================================================================
--  QUEREE — the in-fiction search engine
--  Run this once in the Supabase SQL Editor, after schema.sql (and after
--  notifications.sql / notifications-v2.sql if you use notifications).
--  Safe to re-run.
--
--  A player's search lands in the GM's queue. The GM answers with one or
--  more results — a wiki article, a forum thread, a plain answer or an
--  image. The GM can also write "indexed pages" ahead of time; those
--  answer matching searches instantly, for every player.
-- =====================================================================


create table if not exists public.qr_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query       text not null check (char_length(query) between 1 and 300),
  status      text not null default 'pending' check (status in ('pending', 'answered')),
  closed      boolean not null default false,   -- tab closed by the player
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);

-- kind: wiki | forum | text | image. body holds the kind's fields.
create table if not exists public.qr_results (
  id         uuid primary key default gen_random_uuid(),
  search_id  uuid not null references public.qr_searches(id) on delete cascade,
  kind       text not null check (kind in ('wiki', 'forum', 'text', 'image')),
  title      text,
  source     text,                               -- the display address
  body       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.qr_pages (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('wiki', 'forum', 'text', 'image')),
  title      text not null,
  keywords   text,                               -- words that should find it
  source     text,
  body       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qr_search_user on public.qr_searches (user_id, created_at desc);
create index if not exists qr_search_open on public.qr_searches (status, created_at);
create index if not exists qr_result_search on public.qr_results (search_id, created_at);


-- ---------------------------------------------------------------------
--  RLS — a player sees only their own searches and the answers to them.
--  Indexed pages are public to every signed-in player.
-- ---------------------------------------------------------------------

alter table public.qr_searches enable row level security;
alter table public.qr_results  enable row level security;
alter table public.qr_pages    enable row level security;

drop policy if exists qs_read on public.qr_searches;
create policy qs_read on public.qr_searches for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists qs_create on public.qr_searches;
create policy qs_create on public.qr_searches for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
-- Players may only open/close their own tabs; status is the GM's.
drop policy if exists qs_update on public.qr_searches;
create policy qs_update on public.qr_searches for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists qs_delete on public.qr_searches;
create policy qs_delete on public.qr_searches for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.qr_guard_status()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.status is distinct from old.status or new.query is distinct from old.query)
     and not public.is_admin() then
    raise exception 'Only the GM can answer a search';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_qr_guard on public.qr_searches;
create trigger trg_qr_guard before update on public.qr_searches
  for each row execute function public.qr_guard_status();

drop policy if exists qr_read on public.qr_results;
create policy qr_read on public.qr_results for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.qr_searches s where s.id = search_id and s.user_id = auth.uid()));
drop policy if exists qr_write on public.qr_results;
create policy qr_write on public.qr_results for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists qp_read on public.qr_pages;
create policy qp_read on public.qr_pages for select to authenticated using (true);
drop policy if exists qp_write on public.qr_pages;
create policy qp_write on public.qr_pages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
--  Posting a result marks the search answered and tells the player.
--  A new search tells the GM.
-- ---------------------------------------------------------------------

create or replace function public.qr_on_result()
returns trigger language plpgsql security definer
set search_path = public as $$
declare s record;
begin
  update public.qr_searches set status = 'answered', answered_at = now()
   where id = new.search_id and status <> 'answered';
  select * into s from public.qr_searches where id = new.search_id;
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(s.user_id, 'queree', 'queree_answer',
      'Queree', 'Results for "' || left(s.query, 60) || '"',
      'queree.html?s=' || s.id, s.id, null);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_qr_result on public.qr_results;
create trigger trg_qr_result after insert on public.qr_results
  for each row execute function public.qr_on_result();

create or replace function public.qr_on_search()
returns trigger language plpgsql security definer
set search_path = public as $$
declare a record; who text;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then
    return new;
  end if;
  select username into who from public.profiles where id = new.user_id;
  for a in select id from public.profiles where is_admin and id <> new.user_id loop
    perform public.push_notification(a.id, 'queree', 'queree_search',
      coalesce(who, 'Someone') || ' searched', left(new.query, 80),
      'queree.html?admin=1', new.id, null);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_qr_search on public.qr_searches;
create trigger trg_qr_search after insert on public.qr_searches
  for each row execute function public.qr_on_search();


-- ---------------------------------------------------------------------
--  Realtime, so answers appear on the player's screen as you post them.
-- ---------------------------------------------------------------------

alter table public.qr_searches replica identity full;
do $$
declare t text;
begin
  foreach t in array array['qr_searches', 'qr_results', 'qr_pages'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
