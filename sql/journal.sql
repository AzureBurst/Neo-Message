-- =====================================================================
--  JOURNAL — each player's private log of what their character did
--  Run this once in the Supabase SQL Editor, after schema.sql (and the
--  notification SQL if you use notifications). Safe to re-run.
--
--  A player sees and edits only their own journal. Admins can read
--  every journal and leave a GM note on any entry (the player sees it).
-- =====================================================================

create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text check (char_length(title) <= 160),
  body       text not null default '' check (char_length(body) <= 40000),
  story_at   timestamptz,                 -- the in-fiction day it happened
  location   text check (char_length(location) <= 120),
  mood       text check (char_length(mood) <= 16),
  image_url  text,
  gm_note    text check (char_length(gm_note) <= 4000),
  gm_note_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_user on public.journal_entries (user_id, story_at desc, created_at desc);

alter table public.journal_entries enable row level security;

drop policy if exists jr_read on public.journal_entries;
create policy jr_read on public.journal_entries for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists jr_create on public.journal_entries;
create policy jr_create on public.journal_entries for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists jr_update on public.journal_entries;
create policy jr_update on public.journal_entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists jr_delete on public.journal_entries;
create policy jr_delete on public.journal_entries for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Players can't write the GM note themselves; edits bump updated_at.
create or replace function public.journal_guard()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.gm_note := null; new.gm_note_at := null;
  elsif (new.gm_note is distinct from old.gm_note or new.gm_note_at is distinct from old.gm_note_at)
        and coalesce(current_setting('journal.gm', true), '') <> 'on' then
    new.gm_note := old.gm_note; new.gm_note_at := old.gm_note_at;
  end if;
  if tg_op = 'UPDATE' and (new.title, new.body, new.story_at, new.location, new.mood, new.image_url)
       is distinct from (old.title, old.body, old.story_at, old.location, old.mood, old.image_url) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_journal_guard on public.journal_entries;
create trigger trg_journal_guard before insert or update on public.journal_entries
  for each row execute function public.journal_guard();

-- The GM's note on an entry. Notifies the player.
create or replace function public.journal_gm_note(entry uuid, note text)
returns void language plpgsql security definer
set search_path = public as $$
declare e record;
begin
  if not public.is_admin() then raise exception 'Only the GM can leave a note'; end if;
  perform set_config('journal.gm', 'on', true);
  update public.journal_entries
     set gm_note = nullif(btrim(note), ''),
         gm_note_at = case when nullif(btrim(note), '') is null then null else now() end
   where id = entry
  returning * into e;
  perform set_config('journal.gm', 'off', true);
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.gm_note is not null
     and to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then
    perform public.push_notification(e.user_id, 'journal', 'journal_note',
      'The GM left a note', coalesce(nullif(e.title, ''), 'On your journal entry'),
      'journal.html?entry=' || e.id, e.id, null);
  end if;
end;
$$;
grant execute on function public.journal_gm_note(uuid, text) to authenticated;

-- New entries tell the GM (one notification per player, counting up).
create or replace function public.journal_on_entry()
returns trigger language plpgsql security definer
set search_path = public as $$
declare a record; who text;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then
    return new;
  end if;
  select username into who from public.profiles where id = new.user_id;
  for a in select id from public.profiles where is_admin and id <> new.user_id loop
    perform public.push_notification(a.id, 'journal', 'journal_entry',
      coalesce(who, 'Someone') || ' wrote in their journal',
      coalesce(nullif(new.title, ''), left(new.body, 80)),
      'journal.html?player=' || new.user_id, new.user_id, null);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_journal_entry on public.journal_entries;
create trigger trg_journal_entry after insert on public.journal_entries
  for each row execute function public.journal_on_entry();

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.journal_entries';
  exception when duplicate_object then null; end;
end $$;
