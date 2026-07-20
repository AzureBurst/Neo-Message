-- =====================================================================
--  NEO MESSAGE — story clock
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Holds settings every player shares. Right now that is the in-fiction
--  date and time. Anyone signed in can read it; only an admin can
--  change it.
-- =====================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seeded as "not set", which means the app shows real time.
insert into public.app_settings (key, value)
values ('story_clock', '{"frozen": false, "at": null}'::jsonb)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
--  Setter the admin console calls. Keeps the admin check on the server
--  so it cannot be talked around from the browser.
-- ---------------------------------------------------------------------

create or replace function public.set_story_clock(at timestamptz, frozen boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can set the clock';
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('story_clock',
          jsonb_build_object('frozen', frozen,
                             'at', case when at is null then null
                                        else to_jsonb(at) end),
          now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
end;
$$;


-- ---------------------------------------------------------------------
--  Push changes to everyone's screen without a reload.
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.app_settings;
  exception when duplicate_object then null;
  end;
end $$;
