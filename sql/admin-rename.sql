-- =====================================================================
--  ADMIN: rename a player
--  Run this once in the Supabase SQL Editor. Safe to re-run.
--
--  A player signs in with their username, so renaming has to change two
--  things together: the name everyone sees (profiles.username) and the
--  hidden sign-in address behind it (auth.users.email). This does both
--  in one step, so the player signs in with the NEW name and the same
--  password straight away. Messages, posts, mail, grades and journals
--  are tied to the account, not the name, so they all follow.
-- =====================================================================

create or replace function public.admin_rename_user(target uuid, new_name text)
returns text
language plpgsql security definer
set search_path = public, auth
as $$
declare
  clean   text := btrim(coalesce(new_name, ''));
  old_email text;
  domain  text;
  new_email text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can rename players';
  end if;

  -- Same rule as the sign-up form.
  if clean !~ '^[A-Za-z0-9_.-]{2,24}$' then
    raise exception 'Usernames are 2–24 characters: letters, numbers, dot, dash or underscore';
  end if;

  if exists (select 1 from public.profiles
              where lower(username) = lower(clean) and id <> target) then
    raise exception 'The username "%" is already taken', clean;
  end if;

  select email into old_email from auth.users where id = target;
  if not found then
    raise exception 'That account no longer exists';
  end if;

  update public.profiles set username = clean where id = target;

  -- Keep the sign-in address in step: same domain, new name (the app
  -- builds it the same way: lower-case, only a-z 0-9 _ . -).
  if old_email is not null and position('@' in old_email) > 0 then
    domain := substring(old_email from '@(.*)$');
    new_email := lower(clean) || '@' || domain;

    if exists (select 1 from auth.users where lower(email) = new_email and id <> target) then
      raise exception 'Another account already signs in as "%"', clean;
    end if;

    update auth.users
       set email = new_email,
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('username', clean),
           updated_at = now()
     where id = target;

    update auth.identities
       set identity_data = coalesce(identity_data, '{}'::jsonb)
                           || jsonb_build_object('email', new_email),
           -- older projects keyed email identities by the address itself
           provider_id = case when provider_id = old_email then new_email else provider_id end,
           updated_at = now()
     where user_id = target and provider = 'email';
  end if;

  return clean;
end;
$$;

revoke all on function public.admin_rename_user(uuid, text) from public, anon;
grant execute on function public.admin_rename_user(uuid, text) to authenticated;
