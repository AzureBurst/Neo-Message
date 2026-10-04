-- =====================================================================
--  FLIGHT PORTAL — B.S. in Field Heroics core curriculum
--  Run this once in the Supabase SQL Editor, after flight.sql.
--  Safe to re-run: it never duplicates a course or an enrolment, and it
--  never overwrites a course you have since edited.
--
--  Adds the six required courses with a Mon–Fri timetable, enrols every
--  student in them, records everyone as a Field Heroics major with
--  Kaori Hamasaki as their Heroics coordinator. Accounts created later
--  are enrolled and recorded automatically. Admin accounts are left out
--  so the GM does not clutter the rosters.
--
--  Already ran an earlier version? Just run this one again — it moves the
--  term to Fall 2160, drops Communications to 1 credit, adds Intro to
--  Math, fills in meeting times and sets the coordinator, without
--  touching anything you have changed by hand since.
-- =====================================================================


-- 1. A "required" flag. Required courses enrol every student.
alter table public.flight_courses
  add column if not exists auto_enroll boolean not null default false;


-- 2. The six core courses and their timetable. Lectures run 60 minutes,
--    the two practical courses 90. Each course is only inserted if no
--    course with that code exists yet, so your later edits survive.
--
--          Mon/Wed/Fri                     Tue/Thu
--     9:00 HERO 101 Hero History       9:30 RESC 101 Rescue Training (90)
--    10:15 MATH 101 Intro to Math      1:00 SPE 120  Specialized PE  (90)
--    11:30 ETHL 110 Heroic Ethics
--     1:30 COMM 101 Communications  (Fridays only)
insert into public.flight_courses
  (code, title, professor_name, term, credits, schedule, color, description, auto_enroll)
select v.code, v.title, 'Staff', 'Fall 2160', v.credits, v.schedule, v.color, v.description, true
from (values
  ('HERO 101', 'Hero History', 3, 'Mon/Wed/Fri 9:00–10:00 AM', '#E8774C',
   'The course that led to modern heroics. Covers the major illegal events of the era and the laws created to deal with a society filled with super-powered people.'),
  ('MATH 101', 'Intro to Math', 3, 'Mon/Wed/Fri 10:15–11:15 AM', '#E8B04C',
   'The math every hero actually uses: estimating distances, loads and trajectories, and the statistics behind risk and response times.'),
  ('ETHL 110', 'Intro to Heroic Ethics and Laws', 3, 'Mon/Wed/Fri 11:30 AM–12:30 PM', '#8B5CF6',
   'The rights people have and how much jurisdiction each law enforcement position holds. A great deal on not abusing your abilities in exploitative ways.'),
  ('COMM 101', 'Communications 101', 1, 'Fri 1:30–2:30 PM', '#16B8C4',
   'Proper communication channels, handling controversial events, using the right language with the press — and, of course, how to properly call out villains to dissuade them.'),
  ('RESC 101', 'Rescue Training 101', 3, 'Tue/Thu 9:30–11:00 AM', '#F0484F',
   'A practical course on rescuing civilians from dangerous situations: proper carrying form, expected procedure and more. Usually run with high-tech dummies in place of volunteer civilians.'),
  ('SPE 120',  'Specialized Physical Education', 2, 'Tue/Thu 1:00–2:30 PM', '#2FBF6B',
   'A conditioning course built to enhance your best traits and improve your weakest. The workiest-out class on the schedule.')
) as v(code, title, credits, schedule, color, description)
where not exists (select 1 from public.flight_courses c where c.code = v.code);

update public.flight_courses set auto_enroll = true
 where code in ('HERO 101', 'MATH 101', 'ETHL 110', 'COMM 101', 'RESC 101', 'SPE 120');

-- Bring courses from an earlier run up to date. Each line only changes a
-- value still at the old default, so anything you edited is left alone.
update public.flight_courses set term = 'Fall 2160'
 where code in ('HERO 101', 'MATH 101', 'ETHL 110', 'COMM 101', 'RESC 101', 'SPE 120')
   and (term is null or term = 'Fall 2026');
update public.flight_courses set credits = 1 where code = 'COMM 101' and credits = 3;
update public.flight_courses c set schedule = v.schedule
from (values ('HERO 101', 'Mon/Wed/Fri 9:00–10:00 AM'),
             ('MATH 101', 'Mon/Wed/Fri 10:15–11:15 AM'),
             ('ETHL 110', 'Mon/Wed/Fri 11:30 AM–12:30 PM'),
             ('COMM 101', 'Fri 1:30–2:30 PM'),
             ('RESC 101', 'Tue/Thu 9:30–11:00 AM'),
             ('SPE 120',  'Tue/Thu 1:00–2:30 PM')) as v(code, schedule)
where c.code = v.code and coalesce(trim(c.schedule), '') = '';


-- 3. Enrol every existing student in every required course.
insert into public.flight_enrollments (course_id, user_id)
select c.id, p.id
from public.flight_courses c
cross join public.profiles p
where c.auto_enroll and not p.is_admin
on conflict do nothing;


-- 4a. The Heroics coordinator — an advisory role shown on each student's
--     portal. Everyone without one gets Kaori Hamasaki.
alter table public.flight_students
  add column if not exists coordinator text;

-- 4. Everyone is a Field Heroics major. A major you already set by hand
--    is kept.
insert into public.flight_students (user_id, major, coordinator)
select p.id, 'B.S. in Field Heroics', 'Kaori Hamasaki'
from public.profiles p
where not p.is_admin
on conflict (user_id) do update
  set major       = coalesce(public.flight_students.major, excluded.major),
      coordinator = coalesce(public.flight_students.coordinator, excluded.coordinator);


-- 5. New accounts: enrol in the required courses and start a student
--    record the moment the profile is created.
create or replace function public.flight_onboard_student()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.is_admin then return new; end if;

  insert into public.flight_enrollments (course_id, user_id)
  select id, new.id from public.flight_courses where auto_enroll
  on conflict do nothing;

  insert into public.flight_students (user_id, major, coordinator)
  values (new.id, 'B.S. in Field Heroics', 'Kaori Hamasaki')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_flight_onboard on public.profiles;
create trigger trg_flight_onboard
  after insert on public.profiles
  for each row execute function public.flight_onboard_student();


-- 6. Marking a course required later (from the course editor) enrols
--    everyone in it straight away.
create or replace function public.flight_required_course()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.auto_enroll and (tg_op = 'INSERT' or not old.auto_enroll) then
    insert into public.flight_enrollments (course_id, user_id)
    select new.id, p.id from public.profiles p where not p.is_admin
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flight_required on public.flight_courses;
create trigger trg_flight_required
  after insert or update of auto_enroll on public.flight_courses
  for each row execute function public.flight_required_course();


-- 7. See the result.
select c.code, c.title, c.credits, c.schedule, count(e.user_id) as enrolled
from public.flight_courses c
left join public.flight_enrollments e on e.course_id = c.id
where c.auto_enroll
group by c.code, c.title, c.credits, c.schedule
order by c.code;
