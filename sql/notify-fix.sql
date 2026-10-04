-- =====================================================================
--  NOTIFICATION FIX — run once in the Supabase SQL Editor. Safe to re-run.
--
--  Neomail, Flight Portal and Queree checked for the
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

-- Flight Portal: new assignments, grades and announcements
do $$
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is not null then

    create or replace function public.notif_flight_assignment()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare r record; code text;
    begin
      select c.code into code from public.flight_courses c where c.id = new.course_id;
      for r in select user_id from public.flight_enrollments where course_id = new.course_id loop
        perform public.push_notification(r.user_id, 'flight', 'flight_assignment',
          coalesce(code, 'Course') || ': new assignment',
          new.title || coalesce(' — due ' || to_char(new.due_at at time zone 'America/New_York', 'Mon DD'), ''),
          'flight.html?course=' || new.course_id, new.course_id, null);
      end loop;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_flight_asg on public.flight_assignments;
    create trigger trg_notif_flight_asg after insert on public.flight_assignments
      for each row execute function public.notif_flight_assignment();

    create or replace function public.notif_flight_grade()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare a record; code text;
    begin
      if new.score is null then return new; end if;
      if tg_op = 'UPDATE' and old.score is not distinct from new.score then return new; end if;
      select * into a from public.flight_assignments where id = new.assignment_id;
      select c.code into code from public.flight_courses c where c.id = a.course_id;
      perform public.push_notification(new.user_id, 'flight', 'flight_grade',
        coalesce(code, 'Course') || ': grade posted', a.title,
        'flight.html?course=' || a.course_id, a.course_id, null);
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_flight_grade on public.flight_grades;
    create trigger trg_notif_flight_grade after insert or update on public.flight_grades
      for each row execute function public.notif_flight_grade();

    create or replace function public.notif_flight_announce()
    returns trigger language plpgsql security definer
    set search_path = public as $fn$
    declare r record; code text;
    begin
      if new.course_id is null then
        for r in select id as user_id from public.profiles where not is_admin loop
          perform public.push_notification(r.user_id, 'flight', 'flight_announce',
            'Flight Portal', new.title, 'flight.html', new.id, null);
        end loop;
      else
        select c.code into code from public.flight_courses c where c.id = new.course_id;
        for r in select user_id from public.flight_enrollments where course_id = new.course_id loop
          perform public.push_notification(r.user_id, 'flight', 'flight_announce',
            coalesce(code, 'Course') || ': announcement', new.title,
            'flight.html?course=' || new.course_id, new.course_id, null);
        end loop;
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_notif_flight_ann on public.flight_announcements;
    create trigger trg_notif_flight_ann after insert on public.flight_announcements
      for each row execute function public.notif_flight_announce();
  end if;
end $$;

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
