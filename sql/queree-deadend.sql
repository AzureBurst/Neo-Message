-- =====================================================================
--  Queree: "no results" dead ends.
--  Lets the GM answer a search with a "did not match any documents"
--  page. Safe to run more than once.
-- =====================================================================

alter table public.qr_results drop constraint if exists qr_results_kind_check;
alter table public.qr_results add constraint qr_results_kind_check
  check (kind in ('wiki', 'forum', 'text', 'image', 'none'));

-- Same as before, but a dead end says "No results for …".
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
      'Queree',
      case when new.kind = 'none' then 'No results for "' else 'Results for "' end
        || left(s.query, 60) || '"',
      'queree.html?s=' || s.id, s.id, null);
  end if;
  return new;
end;
$$;
