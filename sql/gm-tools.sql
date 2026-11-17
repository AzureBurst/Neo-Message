-- =====================================================================
--  GM tools
--   1. The setup check on the GM Desk: answers "is this feature set
--      up?" by looking at the database's own catalog. Changes nothing.
--   2. Change the in-story date & time on a chat message, an email or a
--      Flight announcement.
--   3. The bookkeeping table for Discord DMs about notifications
--      (emails, judged rolls, shop answers, class summaries…).
--  GM only. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Setup check
-- ---------------------------------------------------------------------
create or replace function public.setup_probe(p_checks jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb; out jsonb := '[]'::jsonb; ok boolean; n text; has text;
begin
  if not public.is_admin() then raise exception 'GM only.'; end if;
  for c in select * from jsonb_array_elements(p_checks) loop
    n := c->>'n'; has := c->>'has'; ok := false;
    begin
      ok := case c->>'t'
        when 'table'    then to_regclass('public.' || n) is not null
        when 'column'   then exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = split_part(n, '.', 1)
                                        and column_name = split_part(n, '.', 2))
        when 'function' then exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                                      where s.nspname = 'public' and p.proname = n)
        when 'trigger'  then exists (select 1 from pg_trigger where tgname = n and not tgisinternal)
        when 'source'   then exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                                      where s.nspname = 'public' and p.proname = n and p.prosrc ilike '%' || has || '%')
        when 'check'    then exists (select 1 from pg_constraint where conname = n
                                      and pg_get_constraintdef(oid) ilike '%' || has || '%')
        when 'realtime' then exists (select 1 from pg_publication_tables
                                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = n)
        when 'policy'   then exists (select 1 from pg_policies where policyname = n)
        -- A Supabase database webhook is a trigger that calls http_request.
        when 'webhook'  then exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                                      where t.tgrelid = to_regclass('public.' || n) and not t.tgisinternal
                                        and (p.proname = 'http_request' or p.proname ilike 'notify_discord%'))
        when 'setting'  then to_regclass('public.app_settings') is not null
                             and exists (select 1 from public.app_settings where key = n and coalesce(value->>'id', '') <> '')
        when 'category' then to_regclass('public.account_categories') is not null
                             and exists (select 1 from public.account_categories where key = n)
        else false end;
    exception when others then ok := false;
    end;
    out := out || to_jsonb(coalesce(ok, false));
  end loop;
  return out;
end;
$$;
grant execute on function public.setup_probe(jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  2. Change the in-story time on something already sent
-- ---------------------------------------------------------------------
create or replace function public.gm_set_story_at(p_kind text, p_id uuid, p_at timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare m public.mail_messages; peer uuid;
begin
  if not public.is_admin() then raise exception 'Only the GM can change that time.'; end if;
  if p_at is null then raise exception 'Pick a date and time.'; end if;

  if p_kind = 'message' then
    update public.messages set story_at = p_at where id = p_id;
    if not found then raise exception 'That message is gone.'; end if;

  elsif p_kind = 'announcement' then
    update public.flight_announcements set story_at = p_at where id = p_id;
    if not found then raise exception 'That announcement is gone.'; end if;

  elsif p_kind = 'mail' then
    select * into m from public.mail_messages where id = p_id;
    if m.id is null then raise exception 'That email is gone.'; end if;
    update public.mail_messages set story_at = p_at where id = m.id;
    -- Between two players each has a copy; move the other copy too.
    select peer_thread into peer from public.mail_threads where id = m.thread_id;
    if peer is not null then
      update public.mail_messages set story_at = p_at
       where thread_id = peer and body = m.body
         and abs(extract(epoch from (created_at - m.created_at))) < 5;
    end if;
    -- Threads list the time of their latest email.
    update public.mail_threads t
       set last_story_at = (select max(story_at) from public.mail_messages where thread_id = t.id)
     where t.id in (m.thread_id, peer);

  else
    raise exception 'Can''t change the time on that.';
  end if;
  return p_at;
end;
$$;
grant execute on function public.gm_set_story_at(text, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
--  3. Discord: one DM per thing per two minutes (used by notify-discord)
-- ---------------------------------------------------------------------
create table if not exists public.discord_notif_throttle (
  user_id       uuid not null references auth.users(id) on delete cascade,
  ref           text not null,
  last_notified timestamptz not null default now(),
  primary key (user_id, ref)
);
-- Only the Edge Function (service role) touches it.
alter table public.discord_notif_throttle enable row level security;
