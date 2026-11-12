-- =====================================================================
--  Calendar: repeating entries
--  An entry can repeat every day, every week (on chosen weekdays),
--  every 2 weeks, or every month, until an optional end date. Single
--  days can be skipped without touching the rest.
--  Flight classes show up on calendars on their own (from each
--  course's schedule and the active term), so they don't need this.
--  Run after calendar.sql. Safe to run more than once.
-- =====================================================================

alter table public.calendar_events
  add column if not exists repeat       text,
  add column if not exists repeat_days  smallint[],          -- 0 = Sunday … 6 = Saturday
  add column if not exists repeat_until date,
  add column if not exists skip_dates   date[] not null default '{}';

alter table public.calendar_events drop constraint if exists cal_repeat_kind;
alter table public.calendar_events add constraint cal_repeat_kind
  check (repeat is null or repeat in ('daily', 'weekly', 'biweekly', 'monthly'));

alter table public.calendar_events drop constraint if exists cal_repeat_until;
alter table public.calendar_events add constraint cal_repeat_until
  check (repeat_until is null or repeat_until >= start_date);

create index if not exists cal_repeating on public.calendar_events (start_date) where repeat is not null;
