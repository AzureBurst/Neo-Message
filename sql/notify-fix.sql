-- =====================================================================
--  NOTIFICATION FIX — run once in the Supabase SQL Editor. Safe to re-run.
--
--  Neomail, Flight Portal (email a professor) and Queree checked for the
--  notification function in a way that always came back "not found", so
--  those notifications were silently skipped. This re-creates just the
--  affected functions with the corrected check.
-- =====================================================================

-- Neomail: new mail / replies
do $$
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then

    create or replace function public.notif_on_mail()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare th record; av text;
    begin
      select * into th from public.mail_threads where id = new.thread_id;
      if new.from_recipient then
        -- player replied → tell the GM who owns the thread
        select avatar_url into av from public.profiles where id = th.recipient_id;
        perform public.push_notification(th.owner_admin_id, 'mail', 'mail_reply',
          new.from_name, 'replied: ' || th.subject,
          'mail.html?t=' || th.id, th.id, av);
      else
        -- GM/NPC sent → tell the recipient
        perform public.push_notification(th.recipient_id, 'mail', 'mail_new',
          new.from_name, th.subject, 'mail.html?t=' || th.id, th.id, null);
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_mail on public.mail_messages;
    create trigger trg_notif_mail after insert on public.mail_messages
      for each row execute function public.notif_on_mail();
  end if;
end $$;

-- Flight Portal: emailing a professor
create or replace function public.flight_email_professor(
  p_course uuid, p_subject text, p_body text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  c record; nm text; t uuid; owner uuid;
begin
  if to_regclass('public.mail_threads') is null then
    raise exception 'Neomail is not set up yet (run sql/mail.sql)';
  end if;
  if not public.flight_enrolled(p_course) and not public.is_admin() then
    raise exception 'You are not enrolled in that course';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write a message first';
  end if;

  select * into c from public.flight_courses where id = p_course;
  if not found then raise exception 'No such course'; end if;

  -- The GM who made the course receives it; fall back to any admin.
  owner := c.created_by;
  if owner is null or not exists (select 1 from public.profiles where id = owner and is_admin) then
    select id into owner from public.profiles where is_admin order by created_at limit 1;
  end if;
  if owner is null then raise exception 'No admin account exists to receive it'; end if;

  select username into nm from public.profiles where id = auth.uid();

  insert into public.mail_threads
    (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
     last_at, last_snippet, last_from_recipient)
  values (owner, auth.uid(),
          coalesce(nullif(trim(p_subject), ''), c.code || ' question'),
          c.professor_name,
          coalesce(c.professor_addr, 'professor@juniversity.edu'),
          now(), left(p_body, 140), true)
  returning id into t;

  insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
  values (t, true, coalesce(nm, 'Student'), null, p_body);

  return t;
end;
$$;

-- Queree: answers and new searches
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
