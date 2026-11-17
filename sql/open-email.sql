-- =====================================================================
--  "Students can email": a per-person switch
--  Tick it on a faculty member (or anyone) and every student can find
--  them in the Neomail directory and email them, without needing their
--  number or having them in contacts. It only opens email: it doesn't
--  let anyone add them as a chat contact. Only the GM can switch it.
--  "Students" means anyone in a student category (Group H, Group A,
--  Sophomores, Group D, S-STEM, Business, or any category with
--  "student" in its name).
--  Run after number-only.sql and npc-flag.sql. Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists email_open boolean not null default false;

-- Only the GM can flip it (same guard as category / number-only).
create or replace function public.guard_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.category_id is distinct from old.category_id
    or new.number_only is distinct from old.number_only
    or new.email_open  is distinct from old.email_open) then
    raise exception 'Only the GM can change that';
  end if;
  return new;
end;
$$;

-- Is the signed-in person a student?
create or replace function public.i_am_student() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select c.key in ('students', 'group_a', 'sophomores', 'group_d', 'sstem', 'business')
                          or c.name ilike '%student%'
                     from public.account_categories c where c.id = public.my_category()), false);
$$;

create or replace function public.is_email_open(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select email_open from public.profiles where id = uid), false);
$$;

-- Email: also allowed when they're open to students and I'm a student.
create or replace function public.can_email(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    uid <> auth.uid() and not public.is_hidden(uid) and (
      public.in_contacts(uid)
      or (public.is_email_open(uid) and public.i_am_student())
      or (not public.is_number_only(uid) and exists (
        select 1 from public.profiles p join public.account_categories c on c.id = p.category_id
         where p.id = uid and public.my_category() = any(c.email_by)))));
$$;

-- The directory: open-to-students people show up for students (to email).
create or replace function public.directory()
returns table (id uuid, username text, avatar_url text, category_id uuid, category text, color text,
               about text, is_npc boolean, can_add boolean, can_email boolean, in_contacts boolean)
language plpgsql stable security definer set search_path = public as $$
declare mine uuid := public.my_category(); gm boolean := public.is_admin(); stu boolean := public.i_am_student();
begin
  return query
  select p.id, p.username, p.avatar_url, c.id, c.name, c.color,
         p.bio,
         public.is_gm_character(p.id),
         gm or (mine = any(c.add_by) and not p.number_only),
         gm or public.in_contacts(p.id) or (stu and p.email_open and not public.is_hidden(p.id))
            or (mine = any(c.email_by) and not p.number_only),
         public.in_contacts(p.id)
    from public.profiles p
    left join public.account_categories c on c.id = p.category_id
   where p.id <> auth.uid()
     and (gm or public.in_contacts(p.id)
          or (stu and p.email_open and not public.is_hidden(p.id))
          or (not public.is_hidden(p.id) and not p.number_only and mine = any(c.seen_by)))
   order by c.sort nulls last, p.username;
end;
$$;
grant execute on function public.directory() to authenticated;
