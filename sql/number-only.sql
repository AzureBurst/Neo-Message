-- =====================================================================
--  Number-only characters
--  The GM can mark any account or NPC "number only". Players then never
--  find them in the directory (Messages contacts, Neomail, MyTime) and
--  can only add them by typing their phone number. Once a player has
--  them as a contact, they show up for that player as normal.
--  Only the GM can switch it on or off.
--  Run after categories.sql. Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists number_only boolean not null default false;

-- Players can't flip it (or their category) on their own row.
create or replace function public.guard_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the SQL Editor, where the GM can do anything.
  if auth.uid() is not null and not public.is_admin() and (
       new.category_id is distinct from old.category_id
    or new.number_only is distinct from old.number_only) then
    raise exception 'Only the GM can change that';
  end if;
  return new;
end;
$$;

create or replace function public.is_number_only(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select number_only from public.profiles where id = uid), false);
$$;

-- Adding from the directory: never for number-only characters.
create or replace function public.can_browse_add(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    uid <> auth.uid() and not public.is_hidden(uid) and not public.is_number_only(uid) and exists (
      select 1 from public.profiles p join public.account_categories c on c.id = p.category_id
       where p.id = uid and public.my_category() = any(c.add_by)));
$$;

-- Email: number-only characters only once they're in your contacts.
create or replace function public.can_email(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    uid <> auth.uid() and not public.is_hidden(uid) and (
      public.in_contacts(uid) or (not public.is_number_only(uid) and exists (
        select 1 from public.profiles p join public.account_categories c on c.id = p.category_id
         where p.id = uid and public.my_category() = any(c.email_by)))));
$$;

-- By number: always allowed for number-only characters (that's the point).
create or replace function public.add_contact_by_number(number text, nick text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare target public.profiles; ok boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into target from public.profiles
   where regexp_replace(phone_number, '\D', '', 'g') = regexp_replace(number, '\D', '', 'g');
  if target.id is null then raise exception 'No account is using that number'; end if;
  if target.id = auth.uid() then raise exception 'That is your own number'; end if;
  if not public.is_admin() then
    if public.is_hidden(target.id) then raise exception 'No account is using that number'; end if;
    select coalesce(c.phone_add, true) or p.number_only into ok
      from public.profiles p left join public.account_categories c on c.id = p.category_id where p.id = target.id;
    if not ok and not public.can_browse_add(target.id) then
      raise exception 'That number can''t be added';
    end if;
  end if;
  insert into public.contacts (owner_id, contact_id, nickname)
  values (auth.uid(), target.id, nullif(trim(nick), ''))
  on conflict (owner_id, contact_id)
    do update set nickname = coalesce(excluded.nickname, public.contacts.nickname);
  return target;
end;
$$;

-- The directory: number-only characters are left out for players
-- unless they're already in that player's contacts.
create or replace function public.directory()
returns table (id uuid, username text, avatar_url text, category_id uuid, category text, color text,
               about text, is_npc boolean, can_add boolean, can_email boolean, in_contacts boolean)
language plpgsql stable security definer set search_path = public as $$
declare mine uuid := public.my_category(); gm boolean := public.is_admin();
begin
  return query
  select p.id, p.username, p.avatar_url, c.id, c.name, c.color,
         p.bio,
         public.is_npc(p.id),
         gm or (mine = any(c.add_by) and not p.number_only),
         gm or public.in_contacts(p.id) or (mine = any(c.email_by) and not p.number_only),
         public.in_contacts(p.id)
    from public.profiles p
    left join public.account_categories c on c.id = p.category_id
   where p.id <> auth.uid()
     and (gm or public.in_contacts(p.id)
          or (not public.is_hidden(p.id) and not p.number_only and mine = any(c.seen_by)))
   order by c.sort nulls last, p.username;
end;
$$;
grant execute on function public.directory() to authenticated;
