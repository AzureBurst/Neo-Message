-- =====================================================================
--  Queree AI overviews.
--  Lets the GM send (or index) a "Queree AI Overview" answer.
--  Also includes the dead-end kind, so it's fine to run even if you
--  skipped queree-deadend.sql. Safe to run more than once.
-- =====================================================================

alter table public.qr_results drop constraint if exists qr_results_kind_check;
alter table public.qr_results add constraint qr_results_kind_check
  check (kind in ('wiki', 'forum', 'text', 'image', 'none', 'ai'));

alter table public.qr_pages drop constraint if exists qr_pages_kind_check;
alter table public.qr_pages add constraint qr_pages_kind_check
  check (kind in ('wiki', 'forum', 'text', 'image', 'ai'));
