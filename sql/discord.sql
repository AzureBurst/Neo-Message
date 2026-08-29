-- =====================================================================
--  NEO MESSAGE — Discord notifications
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Stores each player's Discord user ID so a serverless function can DM
--  them when they get a message. The DMing itself happens in the
--  `notify-discord` Edge Function — see the README for the full setup.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Where to reach a player on Discord.
--     A Discord user ID is a numeric "snowflake" the player copies from
--     their own account (Discord → Settings → Advanced → Developer Mode,
--     then right-click their name → Copy User ID).
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists discord_id text;


-- ---------------------------------------------------------------------
--  2. A small record of when we last pinged someone about a thread, so a
--     fast back-and-forth does not turn into a stream of DMs. The Edge
--     Function reads and writes this with the service role.
-- ---------------------------------------------------------------------

create table if not exists public.discord_throttle (
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_notified   timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- RLS on, with no policies: only the service role (used by the Edge
-- Function) can touch it, which is exactly what we want. Players never
-- read or write this table.
alter table public.discord_throttle enable row level security;
