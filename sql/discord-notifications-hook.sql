-- =====================================================================
--  Discord DMs for emails & other events: the hook, made for you
--  Your chat messages reach Discord through notify_discord_on_message(),
--  a trigger on public.messages that calls the notify-discord Edge
--  Function. This makes a twin of it for public.notifications (inserts
--  and updates): same address, same secret, copied inside the database,
--  so nothing secret has to be typed in or shown.
--  Run after gm-tools.sql, once the new notify-discord code is deployed.
--  Safe to run more than once.
-- =====================================================================

do $$
declare def text; src text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into def, src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_discord_on_message'
   limit 1;
  if def is null then
    raise exception 'Couldn''t find notify_discord_on_message() to copy.';
  end if;
  -- It must pass the whole row along (not just a few chat fields), or the
  -- Edge Function can't tell what the notification is about.
  if src ~* 'new\.(conversation_id|sender_id|body)' and src !~* '(to_jsonb|row_to_json)\s*\(\s*new\s*\)' then
    raise exception 'notify_discord_on_message() only sends chat fields, so it can''t be copied as is. Ask for a version that sends the whole row.';
  end if;
  def := regexp_replace(def, 'FUNCTION public\.notify_discord_on_message\(', 'FUNCTION public.notify_discord_on_notification(');
  execute def;
  execute 'drop trigger if exists trg_notify_discord_notification on public.notifications';
  execute 'create trigger trg_notify_discord_notification after insert or update on public.notifications
             for each row execute function public.notify_discord_on_notification()';
end $$;

-- Check: should list the new hook.
select tgname as discord_hook from pg_trigger
 where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notify_discord_notification';
