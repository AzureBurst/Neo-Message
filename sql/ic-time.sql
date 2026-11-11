-- =====================================================================
--  In-character timestamps.
--
--  Every message, email, Flight announcement and Queree search/result
--  gets a story_at: the in-character moment it happened. While the GM's
--  story clock is frozen that is exactly the frozen moment; otherwise it
--  is real time. created_at keeps the real timestamp, which the app shows
--  when you hover (or tap) a time.
--
--  Only the GM can set story_at by hand; anything a player sends is
--  stamped by the server. Safe to run more than once.
-- =====================================================================

create or replace function public.set_story_at()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v jsonb;
begin
  -- The GM may backdate something on purpose; nobody else can.
  if new.story_at is not null and public.is_admin() then
    return new;
  end if;

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

-- Add the column + trigger to every table that shows a time.
do $$
declare t text;
begin
  foreach t in array array['messages', 'mail_messages', 'flight_announcements',
                           'qr_searches', 'qr_results', 'sw_rolls'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists story_at timestamptz', t);
      execute format('update public.%I set story_at = created_at where story_at is null', t);
      execute format('drop trigger if exists %I on public.%I', t || '_story_at', t);
      execute format('create trigger %I before insert on public.%I
                        for each row execute function public.set_story_at()', t || '_story_at', t);
    end if;
  end loop;
end $$;

-- Mail threads list the time of their latest email.
do $$
begin
  if to_regclass('public.mail_threads') is not null then
    alter table public.mail_threads add column if not exists last_story_at timestamptz;
    update public.mail_threads t
       set last_story_at = coalesce(
             (select max(m.story_at) from public.mail_messages m where m.thread_id = t.id), t.last_at)
     where last_story_at is null;
  end if;
end $$;

create or replace function public.mail_bump_story_at()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  update public.mail_threads set last_story_at = new.story_at where id = new.thread_id;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.mail_messages') is not null then
    drop trigger if exists mail_messages_bump_story on public.mail_messages;
    create trigger mail_messages_bump_story
      after insert on public.mail_messages
      for each row execute function public.mail_bump_story_at();
  end if;
end $$;
