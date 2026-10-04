-- =====================================================================
--  FLIGHT PORTAL — a faux student portal
--  Run this once in the Supabase SQL Editor, after schema.sql.
--  For the extras, run it AFTER these if you use them:
--    notifications.sql + notifications-v2.sql  (portal notifications)
--    mail.sql                                  (email a professor)
--    calendar.sql                              (add due dates to calendar)
--  Anything missing is simply skipped. Safe to re-run.
--
--  The GM sets everything: courses, rosters, assignments, scores,
--  announcements and each student's record. Students see only the
--  courses they are enrolled in and only their own scores.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.flight_courses (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,                 -- e.g. CRIM 210
  title          text not null,
  professor_name text not null default 'Staff',
  professor_addr text,                          -- in-fiction email address
  room           text,
  schedule       text,                          -- e.g. Mon/Wed 10:00–11:15
  office_hours   text,
  term           text,
  credits        numeric not null default 3,
  description    text,
  color          text,                          -- accent for the course card
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);

create table if not exists public.flight_enrollments (
  course_id   uuid not null references public.flight_courses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  final_grade text,                             -- optional letter override
  created_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.flight_assignments (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.flight_courses(id) on delete cascade,
  title       text not null,
  category    text,                             -- Homework, Exam, Paper…
  description text,
  points      numeric not null default 100,
  due_at      timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.flight_grades (
  assignment_id uuid not null references public.flight_assignments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  score         numeric,
  feedback      text,
  updated_at    timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

-- A student's own to-do tick. Separate from grades so a student can
-- never touch a score.
create table if not exists public.flight_progress (
  assignment_id uuid not null references public.flight_assignments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  done          boolean not null default true,
  primary key (assignment_id, user_id)
);

create table if not exists public.flight_announcements (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references public.flight_courses(id) on delete cascade,  -- null = portal-wide
  title      text not null,
  body       text,
  created_at timestamptz not null default now()
);

create table if not exists public.flight_students (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  student_id   text,
  major        text,
  minor        text,
  year         text,                            -- Freshman, Junior, 2L…
  advisor      text,
  standing     text default 'Good standing',
  holds        text,                            -- non-empty = registration hold
  balance      numeric not null default 0,      -- bursar balance owed
  gpa_override numeric                          -- shown instead of computed GPA
);

create index if not exists flight_enr_user   on public.flight_enrollments (user_id);
create index if not exists flight_asg_course on public.flight_assignments (course_id, due_at);
create index if not exists flight_grd_user   on public.flight_grades (user_id);
create index if not exists flight_ann_course on public.flight_announcements (course_id, created_at desc);


-- ---------------------------------------------------------------------
--  2. HELPER — am I in this course? SECURITY DEFINER so policies can
--     call it without recursing into enrollments' own policy.
-- ---------------------------------------------------------------------

create or replace function public.flight_enrolled(c uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.flight_enrollments
                 where course_id = c and user_id = auth.uid());
$$;


-- ---------------------------------------------------------------------
--  3. ROW LEVEL SECURITY
--     Students read what concerns them; only admins write (except the
--     student's own to-do ticks).
-- ---------------------------------------------------------------------

alter table public.flight_courses       enable row level security;
alter table public.flight_enrollments   enable row level security;
alter table public.flight_assignments   enable row level security;
alter table public.flight_grades        enable row level security;
alter table public.flight_progress      enable row level security;
alter table public.flight_announcements enable row level security;
alter table public.flight_students      enable row level security;

drop policy if exists fc_read  on public.flight_courses;
create policy fc_read on public.flight_courses for select to authenticated
  using (public.is_admin() or public.flight_enrolled(id));
drop policy if exists fc_write on public.flight_courses;
create policy fc_write on public.flight_courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fe_read  on public.flight_enrollments;
create policy fe_read on public.flight_enrollments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists fe_write on public.flight_enrollments;
create policy fe_write on public.flight_enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fa_read  on public.flight_assignments;
create policy fa_read on public.flight_assignments for select to authenticated
  using (public.is_admin() or public.flight_enrolled(course_id));
drop policy if exists fa_write on public.flight_assignments;
create policy fa_write on public.flight_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fg_read  on public.flight_grades;
create policy fg_read on public.flight_grades for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists fg_write on public.flight_grades;
create policy fg_write on public.flight_grades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fp_own on public.flight_progress;
create policy fp_own on public.flight_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists fn_read  on public.flight_announcements;
create policy fn_read on public.flight_announcements for select to authenticated
  using (course_id is null or public.is_admin() or public.flight_enrolled(course_id));
drop policy if exists fn_write on public.flight_announcements;
create policy fn_write on public.flight_announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fs_read  on public.flight_students;
create policy fs_read on public.flight_students for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists fs_write on public.flight_students;
create policy fs_write on public.flight_students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------
--  4. EMAIL A PROFESSOR
--     Creates a Neomail thread in the student's mailbox, addressed from
--     the course's professor, with the student's message as its first
--     entry. It lands in the course creator's Sent tab as an unread
--     reply, and the GM answers in character from there.
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
--  5. NOTIFICATIONS — new assignments, posted grades, announcements.
--     Only installed if the notification system is there. Notifications
--     about one course collapse together, and opening that course in
--     the portal clears them.
-- ---------------------------------------------------------------------

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
          new.title || coalesce(' — due ' || to_char(new.due_at, 'Mon DD'), ''),
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


-- ---------------------------------------------------------------------
--  6. REALTIME
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['flight_assignments', 'flight_grades', 'flight_announcements',
                           'flight_enrollments', 'flight_courses'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
