-- =====================================================================
--  Student groups
--  Splits "Justice University Students" into the school's groups so
--  every list can be filtered by them:
--    Group H Students (the players — the old Students category, renamed,
--    so new sign-ups land here), Group A Students, Heroics Sophomores,
--    Group D Students, S-STEM Students, Business Students.
--  Every group gets the same rules students had: students see, add and
--  get emailed by each other like before. Faculty and Outsiders stay.
--  NPCs from npc-roster.sql move into their group by their Studio role.
--  Run after categories.sql (and npc-roster.sql if you used it).
--  Safe to run more than once.
-- =====================================================================

-- The players' group: the built-in Students category, renamed.
update public.account_categories set name = 'Group H Students', sort = 10
 where key = 'students' and name = 'Justice University Students';

insert into public.account_categories (key, name, color, sort, hidden, phone_add) values
  ('group_a',    'Group A Students',   '#D9466F', 11, false, true),
  ('sophomores', 'Heroics Sophomores', '#14919B', 12, false, true),
  ('group_d',    'Group D Students',   '#7A4FD0', 13, false, true),
  ('sstem',      'S-STEM Students',    '#D97706', 14, false, true),
  ('business',   'Business Students',  '#B8860B', 15, false, true)
on conflict (key) do nothing;
update public.account_categories set sort = 20 where key = 'faculty' and sort < 20;
update public.account_categories set sort = 30 where key = 'outsiders' and sort < 30;
update public.account_categories set sort = 40 where key = 'gm' and sort < 40;

-- Same rules as students, everywhere students appear.
do $$
declare s uuid; grp uuid[]; c record; src public.account_categories;
begin
  select * into src from public.account_categories where key = 'students';
  s := src.id;
  select array_agg(id) into grp from public.account_categories
   where key in ('group_a','sophomores','group_d','sstem','business');

  -- New groups start with the students' own rules (only the first time).
  update public.account_categories set
    seen_by  = src.seen_by  || grp || s,
    add_by   = src.add_by   || grp || s,
    email_by = src.email_by
   where key in ('group_a','sophomores','group_d','sstem','business')
     and seen_by = '{}' and add_by = '{}';

  -- Wherever "students" is ticked, tick every student group too.
  for c in select * from public.account_categories loop
    update public.account_categories set
      seen_by  = case when s = any(c.seen_by)  then array(select distinct unnest(c.seen_by  || grp)) else c.seen_by end,
      add_by   = case when s = any(c.add_by)   then array(select distinct unnest(c.add_by   || grp)) else c.add_by end,
      email_by = case when s = any(c.email_by) then array(select distinct unnest(c.email_by || grp)) else c.email_by end
     where id = c.id;
  end loop;
end $$;

-- NPC students into their groups (by the role npc-roster.sql gave them).
update public.profiles p set category_id = public.cat_id(case
    when n.role ilike 'Group A%'           then 'group_a'
    when n.role ilike 'Heroics Sophomore%' then 'sophomores'
    when n.role ilike 'Group D%'           then 'group_d'
    when n.role ilike 'S-STEM%'            then 'sstem'
    when n.role ilike 'Business%'          then 'business' end)
  from public.npcs n
 where n.id = p.id
   and p.category_id = public.cat_id('students')
   and n.role ~* '^(Group A|Heroics Sophomore|Group D|S-STEM|Business)';

-- Where everyone ended up.
select c.name as category, count(p.id) as people
  from public.account_categories c left join public.profiles p on p.category_id = c.id
 group by c.name, c.sort order by c.sort;
