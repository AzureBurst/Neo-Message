-- =====================================================================
--  Discord DMs for emails & other events: the webhook, made for you
--  Copies your existing Discord webhook on public.messages (same Edge
--  Function URL, same secret header) onto public.notifications, for
--  inserts and updates. Nothing secret needs typing in.
--  Run after gm-tools.sql, once the new notify-discord code is deployed.
--  Safe to run more than once.
-- =====================================================================

do $$
declare d text;
begin
  select pg_get_triggerdef(t.oid) into d
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.messages'::regclass and not t.tgisinternal
     and p.proname = 'http_request'
   limit 1;
  if d is null then
    raise exception 'Couldn''t find your Discord webhook on messages to copy. Set it up from Integrations → Database Webhooks instead.';
  end if;
  -- "CREATE TRIGGER <name> AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(...)"
  d := regexp_replace(d, '^CREATE TRIGGER .+? (AFTER|BEFORE) .+? ON public\.messages ',
                         'CREATE TRIGGER "discord-notifications" AFTER INSERT OR UPDATE ON public.notifications ');
  if d !~ 'ON public\.notifications' then raise exception 'Couldn''t read the messages webhook: %', d; end if;
  execute 'drop trigger if exists "discord-notifications" on public.notifications';
  execute d;
end $$;

-- Check: should list the new hook.
select tgname as webhook from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'discord-notifications';
