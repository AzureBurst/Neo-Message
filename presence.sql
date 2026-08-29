-- =====================================================================
--  NEO MESSAGE — presence
--  Run this once in the Supabase SQL Editor, after discord.sql.
--
--  Records roughly when each player was last active on the site, so the
--  Discord notifier can skip anyone who is already looking at the app.
-- =====================================================================

alter table public.profiles
  add column if not exists last_seen timestamptz;

-- A tiny setter the app calls on a timer. SECURITY DEFINER so it only
-- ever touches the caller's own row and needs no broad update rights.
create or replace function public.touch_last_seen()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.profiles set last_seen = now() where id = auth.uid();
end;
$$;
