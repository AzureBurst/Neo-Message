-- =====================================================================
--  NEO MESSAGE — bubble colours
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Each player picks the colour their own messages appear in. It lives
--  on the profile rather than in a browser, so everyone in a group
--  thread sees the same colour for that person.
-- =====================================================================

alter table public.profiles
  add column if not exists bubble_color text not null default 'blue';

-- Keep it to the named presets the app offers. Anything else and the
-- CSS would have nothing to match it to.
do $$
begin
  alter table public.profiles
    add constraint profiles_bubble_color_ck
    check (bubble_color in
      ('blue', 'green', 'purple', 'red', 'amber', 'teal', 'pink', 'slate'));
exception when duplicate_object then null;
end $$;
