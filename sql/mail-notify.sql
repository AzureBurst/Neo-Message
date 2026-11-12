-- =====================================================================
--  Neomail notifications — make sure every email notifies
--  Depending on the order the earlier files were run in, the hook that
--  sends Neomail notifications could be missing or an old version. This
--  puts the current one in place, whatever ran before:
--   * GM / NPC writes to a player        → the player is notified
--   * a player writes to an NPC or the GM → the GM is notified
--   * a player writes to another player   → the other player is notified
--   * every reply, either way             → the other side is notified
--  It also makes the inbox update live without a refresh.
--  Run after notifications.sql, mail.sql and categories.sql.
--  Safe to run more than once.
-- =====================================================================

create or replace function public.notif_on_mail()
returns trigger language plpgsql security definer set search_path = public as $$
declare th public.mail_threads; av text; first boolean;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  select * into th from public.mail_threads where id = new.thread_id;
  if th.id is null then return new; end if;

  if new.from_recipient then
    -- Written by the thread's player. Between two players the other one
    -- is told through their own copy (below), so skip it here.
    if th.peer_thread is not null then return new; end if;
    select avatar_url into av from public.profiles where id = th.recipient_id;
    first := (select count(*) from public.mail_messages where thread_id = th.id) <= 1;
    perform public.push_notification(th.owner_admin_id, 'mail', 'mail_reply',
      new.from_name, case when first then 'wrote: ' else 'replied: ' end || th.subject,
      'mail.html?t=' || th.id, th.id, av);
  else
    -- Delivered to the thread's player (from the GM, an NPC or another player).
    select avatar_url into av from public.profiles where username = new.from_name limit 1;
    perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
      new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, av);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notif_mail on public.mail_messages;
create trigger trg_notif_mail after insert on public.mail_messages
  for each row execute function public.notif_on_mail();

-- Live inbox.
do $$ begin
  alter publication supabase_realtime add table public.mail_threads;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.mail_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Check: should say 1 (the hook is on).
select count(*) as mail_notify_hook from pg_trigger
 where tgname = 'trg_notif_mail' and tgrelid = 'public.mail_messages'::regclass;
