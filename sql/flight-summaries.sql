-- =====================================================================
--  Flight: class summaries
--  The GM posts a summary of what a class covered on a given day —
--  written text, an uploaded file (PDF, image, document), or both.
--  Students enrolled in the course can read them any time; everyone
--  enrolled gets a notification when one is posted.
--  Run after flight.sql. Safe to run more than once.
-- =====================================================================

create table if not exists public.flight_summaries (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.flight_courses(id) on delete cascade,
  class_date  date not null,                 -- the (in-story) day the class met
  title       text,
  body        text,
  file_url    text,
  file_name   text,
  file_type   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint flight_summaries_has_content check (coalesce(body, '') <> '' or file_url is not null)
);
create index if not exists flight_sum_course on public.flight_summaries (course_id, class_date desc);

alter table public.flight_summaries enable row level security;
drop policy if exists fsum_read  on public.flight_summaries;
drop policy if exists fsum_write on public.flight_summaries;
create policy fsum_read on public.flight_summaries for select to authenticated
  using (public.is_admin() or public.flight_enrolled(course_id));
create policy fsum_write on public.flight_summaries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tell everyone in the class when a new summary goes up.
create or replace function public.flight_summary_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.flight_courses; u uuid;
begin
  if to_regprocedure('public.push_notification(uuid,text,text,text,text,text,uuid,text)') is null then return new; end if;
  select * into c from public.flight_courses where id = new.course_id;
  for u in select user_id from public.flight_enrollments where course_id = new.course_id loop
    perform public.push_notification(u, 'flight', 'flight_summary',
      c.code || ' · class summary',
      coalesce(nullif(trim(new.title), ''), 'Class on ' || to_char(new.class_date, 'Mon FMDD')),
      'flight.html?summary=' || new.id, new.id, null);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_flight_summary_notify on public.flight_summaries;
create trigger trg_flight_summary_notify after insert on public.flight_summaries
  for each row execute function public.flight_summary_notify();

do $$ begin
  alter publication supabase_realtime add table public.flight_summaries;
exception when duplicate_object then null; when undefined_object then null; end $$;
