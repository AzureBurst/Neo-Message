-- =====================================================================
--  FLIGHT PORTAL — B.S. in Field Heroics core curriculum
--  Run this once in the Supabase SQL Editor, after flight.sql.
--  Safe to re-run: it never duplicates a course or an enrolment, and it
--  never overwrites a course you have since edited.
--
--  Adds the five required courses, marks them "required", enrols every
--  student in them, and records everyone as a Field Heroics major.
--  Accounts created later are enrolled and recorded automatically.
--  Admin accounts are left out so the GM does not clutter the rosters.
-- =====================================================================


-- 1. A "required" flag. Required courses enrol every student.
alter table public.flight_courses
  add column if not exists auto_enroll boolean not null default false;


-- 2. The five core courses. Each is only inserted if no course with that
--    code exists yet, so your later edits survive a re-run.
insert into public.flight_courses (code, title, professor_name, term, credits, color, description, auto_enroll)
select v.code, v.title, 'Staff', 'Fall 2026', v.credits, v.color, v.description, true
from (values
  ('HERO 101', 'Hero History', 3, '#E8774C',
   'The course that led to modern heroics. Covers the major illegal events of the era and the laws created to deal with a society filled with super-powered people.'),
  ('COMM 101', 'Communications 101', 3, '#16B8C4',
   'Proper communication channels, handling controversial events, using the right language with the press — and, of course, how to properly call out villains to dissuade them.'),
  ('ETHL 110', 'Intro to Heroic Ethics and Laws', 3, '#8B5CF6',
   'The rights people have and how much jurisdiction each law enforcement position holds. A great deal on not abusing your abilities in exploitative ways.'),
  ('RESC 101', 'Rescue Training 101', 3, '#F0484F',
   'A practical course on rescuing civilians from dangerous situations: proper carrying form, expected procedure and more. Usually run with high-tech dummies in place of volunteer civilians.'),
  ('SPE 120',  'Specialized Physical Education', 2, '#2FBF6B',
   'A conditioning course built to enhance your best traits and improve your weakest. The workiest-out class on the schedule.')
) as v(code, title, credits, color, description)
where not exists (select 1 from public.flight_courses c where c.code = v.code);

update public.flight_courses set auto_enroll = true
 where code in ('HERO 101', 'COMM 101', 'ETHL 110', 'RESC 101', 'SPE 120');


-- 3. Enrol every existing student in every required course.
insert into public.flight_enrollments (course_id, user_id)
select c.id, p.id
from public.flight_courses c
cross join public.profiles p
where c.auto_enroll and not p.is_admin
on conflict do nothing;


-- 4. Everyone is a Field Heroics major. A major you already set by hand
--    is kept.
insert into public.flight_students (user_id, major)
select p.id, 'B.S. in Field Heroics'
from public.profiles p
where not p.is_admin
on conflict (user_id) do update
  set major = coalesce(public.flight_students.major, excluded.major);


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

  insert into public.flight_students (user_id, major)
  values (new.id, 'B.S. in Field Heroics')
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
select c.code, c.title, count(e.user_id) as enrolled
from public.flight_courses c
left join public.flight_enrollments e on e.course_id = c.id
where c.auto_enroll
group by c.code, c.title
order by c.code;
