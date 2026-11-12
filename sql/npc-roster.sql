-- =====================================================================
--  New Heroes NPC list → NPC accounts
--  Makes an NPC for everyone on the "New Heroes NPC list" doc who
--  doesn't have an account yet: 14 faculty and 35 students.
--
--  Each one gets what the NPC Studio would give them: a sign-in account
--  (so "Sign in as" works), a random 555 phone number, a profile and an
--  NPC Studio entry.
--   * Faculty go in "Justice University Faculty", students in
--     "Justice University Students" (needs categories.sql).
--   * Studio colour by group: faculty green, Group A blue, Sophomores
--     teal, Group D purple, S-STEM orange, Business gold.
--   * Bio (players see it): their title or group and pronouns.
--   * Role + notes (only you see them): hero name, power, age and the
--     description from the doc.
--  Anyone whose name is already taken (e.g. "Kaori_Hamasaki", or just
--  "Kaori") is skipped. Safe to run more than once.
--  Needs schema.sql and npc.sql.
-- =====================================================================

create temp table npc_roster (grp text, full_name text, username text, role text, bio text, notes text,
                              cat_key text, student boolean, color text);
insert into npc_roster values
  ('Faculty', 'Kaori Hamasaki', 'Kaori_Hamasaki', 'Heroics Coordinator', 'Heroics Coordinator · Pop Star (She/Her)', 'Hero name: Pop Star · Power: Melody Bubbles · Age: 24 · Pronouns: She/Her
Once Musical Performing Hero and now educator. Responsible for the general affairs regarding education for Group H students.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Olivia Lozano', 'Olivia_Lozano', 'University Doctor', 'University Doctor · Nano-Surgeon (She/Her)', 'Hero name: Nano-Surgeon · Power: Nanite · Age: 42 · Pronouns: She/Her
A pioneer of medical technology and dedicated doctor. She can be a little strict, but she seems to care a lot.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Archibald Morningstar', 'Archibald_Morningstar', 'President of Justice University', 'President of Justice University · Radiant Builder (He/Him)', 'Hero name: Radiant Builder · Power: Light Mason · Age: 57 · Pronouns: He/Him
Charismatic, pragmatic and affable president of Justice University. Veteran Hero that is very involved. Known to be charitable, seems to have high expectations for students at the university.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Faye Works', 'Faye_Works', 'Event Coordinator', 'Event Coordinator · Rock Your World (She/Her)', 'Hero name: Rock Your World · Power: Crystal Cannon · Age: 26 · Pronouns: She/Her
Energetic and fun! Faye has a lot of media experience and loves to ensure that students have fulfilling semesters at the university.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Athena Bishop', 'Athena_Bishop', 'Dean of Heroics', 'Dean of Heroics (She/Her)', 'Power: Psychokinesis · Age: 26 · Pronouns: She/Her
Once young and aspirational, now young and tired. In charge of ensuring the university maintains excellence in regards to training Heroics Students. She seems to frequent bars on occasion.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'King Volkov', 'King_Volkov', 'Student Affairs', 'Student Affairs · NightBite (He/Him)', 'Hero name: NightBite · Power: Wolf Man · Age: 37 · Pronouns: He/Him
Known to be wild and fearsome, in person he is very by the books and orderly.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Connor Split', 'Connor_Split', 'Mathematics Professor', 'Mathematics Professor · Duplicity (He/Him)', 'Hero name: Duplicity · Power: Shock Troops · Age: 34 · Pronouns: He/Him
A friendly hero that enjoys a pun or two. He’s endearing enough to make it work.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Erich Ramsey', 'Erich_Ramsey', 'History Professor', 'History Professor · Wrap-Up (He/Him)', 'Hero name: Wrap-Up · Power: Mummy · Age: 30 · Pronouns: He/Him
A ghoulish, frightening person. But he’s actually chill. Very verbose, very well mannered. Big fan of old pop culture.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Dray Howitzer', 'Dray_Howitzer', 'Faculty', 'Faculty · Ink King (He/Him)', 'Hero name: Ink King · Power: Artison · Age: 26 · Pronouns: He/Him
Uniquely artistic. Lives life by his own rules and enjoys finding new ways to express his art. Can be a headache to many, but is adored by a lot of people.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Anthony G. Draos', 'Anthony_G_Draos', 'Heroics Coach', 'Heroics Coach · Olympian (He/Him)', 'Hero name: Olympian · Power: Warm Up · Age: 44 · Pronouns: He/Him
A LOUD personality with a lot of experience when it comes to exercise. Incredibly passionate, incredibly quick to give people nicknames.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Garfield', 'Garfield', 'General Employee', 'General Employee (He/Him)', 'Power: ??? · Age: 29 · Pronouns: He/Him
A sad, unfortunate existence that is only here to suffer. A man in his late twenties that looks a dozen years older… Good luck.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Theodora Thistle', 'Theodora_Thistle', 'Doctor of Heroic Ethics', 'Doctor of Heroic Ethics (She/Her)', 'Power: Mustelidae · Age: 52 · Pronouns: She/Her
A fickle and curious lady with an odd penchant for testing students. She is surprisingly quick for her age and ever so short. She is tenured. Run.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Sorata Fukumoto', 'Sorata_Fukumoto', 'Counselor', 'Counselor · Green Nimbus (He/Him)', 'Hero name: Green Nimbus · Power: Cloud Nine · Age: 33 · Pronouns: He/Him
A hero from Japan. A calm man that is focused on saving people by helping them in other ways.', 'faculty', false, '#1E8A5A'),
  ('Faculty', 'Ashley', 'Ashley', 'Faculty', 'Faculty (He/They)', 'Power: ??? · Age: ??? · Pronouns: He/They
A skeleton person. They seem to be a little weird, but nothing wrong with being a little spooky.', 'faculty', false, '#1E8A5A'),
  ('Group A', 'Sol Panol', 'Sol_Panol', 'Group A Student', 'Group A Student (She/Her)', 'Power: Star Light · Age: 19 · Pronouns: She/Her
Bubbly, talkative, popular social media personality. Incredibly energetic, but a little scatter brained.', 'students', true, '#3C6FD9'),
  ('Group A', 'Wynn Oriano', 'Wynn_Oriano', 'Group A Student', 'Group A Student (He/Him)', 'Power: Space Warp · Age: 18 · Pronouns: He/Him
Friendly, outgoing, pretty boy. Does his best, but tends to end up in unfortunate situations.', 'students', true, '#3C6FD9'),
  ('Group A', 'Hunter Vermillion', 'Hunter_Vermillion', 'Group A Student', 'Group A Student (He/Him)', 'Power: Anger Devil · Age: 18 · Pronouns: He/Him
Anger issues wrapped in an eloquent drawl. Probably means well. Is probably just mean.', 'students', true, '#3C6FD9'),
  ('Group A', 'Min Ji Pyo', 'Min_Ji_Pyo', 'Group A Student', 'Group A Student (She/Her)', 'Power: Silk Moth · Age: 18 · Pronouns: She/Her
Gloomy, quiet and weird. Has a tendency to hang in high places. A big fan of trendy drinks and fashion. Can’t really handle social situations.', 'students', true, '#3C6FD9'),
  ('Group A', 'Chase Wilder', 'Chase_Wilder', 'Group A Student', 'Group A Student (He/Him)', 'Power: Adapt · Age: 19 · Pronouns: He/Him
Mysterious, cold and a little judgemental. A workout nut, constantly on the move to beat a PR. Kind of a flake.', 'students', true, '#3C6FD9'),
  ('Group A', 'Margot Andreeva', 'Margot_Andreeva', 'Group A Student', 'Group A Student (She/Her)', 'Power: Combo · Age: 20 · Pronouns: She/Her
Straightforward, boisterous and strong. Prefers action over words. A kickboxing champ.', 'students', true, '#3C6FD9'),
  ('Group A', 'Toby Marcus', 'Toby_Marcus', 'Group A Student', 'Group A Student (He/Him)', 'Power: Wind Step · Age: 18 · Pronouns: He/Him
Drifts in and out from place to place.Seems pretty chill. Loves nature, loves art and loves his freedom.', 'students', true, '#3C6FD9'),
  ('Group A', 'Zara Hatchett', 'Zara_Hatchett', 'Group A Student', 'Group A Student (She/Her)', 'Power: Dark Chains · Age: 18 · Pronouns: She/Her
Trickster by nature, probably not all that bad. A rebellious punk that can be a little too much for some.', 'students', true, '#3C6FD9'),
  ('Group A', 'Penelope Blythe', 'Penelope_Blythe', 'Group A Student', 'Group A Student (She/Her)', 'Power: Empower · Age: 19 · Pronouns: She/Her
Looks like the kind of girl that probably bullied you in high school. Has a captivating aura, even if she’s hard to approach. Selfie aficionado and values her space.', 'students', true, '#3C6FD9'),
  ('Group A', 'Duke Johnson', 'Duke_Johnson', 'Group A Student', 'Group A Student (Him)', 'Power: Newton Crusher · Age: 19 · Pronouns: Him
The Duke. Was the star player in his high school sportsball team. Refers to himself in the third person. Hosts a popular podcast and loves his car.', 'students', true, '#3C6FD9'),
  ('Group A', 'Robin Norwood', 'Robin_Norwood', 'Group A Student', 'Group A Student (She/Her)', 'Power: Blizzard · Age: 18 · Pronouns: She/Her
Strict Rule-follower, a little awkward, but always polite and hitting the books. Can get carried away when involved in competition. Could probably use some friends.', 'students', true, '#3C6FD9'),
  ('Group A', 'Whirly', 'Whirly', 'Group A Student', 'Group A Student (She/Her)', 'Power: Integrate · Age: 19 · Pronouns: She/Her
Cheerful person. Good with computers, doomed to be cheered on by others. Seems to chirp instead of speak for the most part.', 'students', true, '#3C6FD9'),
  ('Group A', 'Nora Angel', 'Nora_Angel', 'Group A Student', 'Group A Student (She/Her)', 'Power: Rabbit Force · Age: 18 · Pronouns: She/Her
Lover of misdirection and magic tricks. Big fan of last century''s culture. She sounds a little dead on the inside but is trying her best.', 'students', true, '#3C6FD9'),
  ('Group A', 'Priscilla Meda', 'Priscilla_Meda', 'Group A Student', 'Group A Student (She/Her)', 'Power: Giant Owl · Age: 18 · Pronouns: She/Her
Quiet, always watching, always learning. Incredibly skilled with her Power and has a large brain to match. A little monotone but she is able to hold a conversation.', 'students', true, '#3C6FD9'),
  ('Group A', 'John Miller', 'John_Miller', 'Group A Student', 'Group A Student (He/Him)', 'Power: Potential · Age: 18 · Pronouns: He/Him
A guy. Always trying his best despite the odds. Is probably near the bottom rung of his group when it comes to educational performance. Incredibly tenacious and optimistic despite that.', 'students', true, '#3C6FD9'),
  ('Group A', 'Ciaran Hyde', 'Ciaran_Hyde', 'Group A Student', 'Group A Student (He/Him)', 'Power: Devour Cannon · Age: 18 · Pronouns: He/Him', 'students', true, '#3C6FD9'),
  ('Group A', 'Ren Tsukida', 'Ren_Tsukida', 'Group A Student', 'Group A Student (He/Him)', 'Power: Dark Void · Age: 19 · Pronouns: He/Him', 'students', true, '#3C6FD9'),
  ('Group A', 'Chaytan Brooke', 'Chaytan_Brooke', 'Group A Student', 'Group A Student (He/Him)', 'Power: Copy and Paste · Age: 21 · Pronouns: He/Him', 'students', true, '#3C6FD9'),
  ('Group A', 'Atlas Iron', 'Atlas_Iron', 'Group A Student', 'Group A Student (He/Him)', 'Power: Rolling Armor · Age: 19 · Pronouns: He/Him', 'students', true, '#3C6FD9'),
  ('Group A', 'Lyra Voyager', 'Lyra_Voyager', 'Group A Student', 'Group A Student', 'Power: Energy · Age: 18', 'students', true, '#3C6FD9'),
  ('Heroics Sophomore', 'Marin Summerfield', 'Marin_Summerfield', 'Heroics Sophomore · Resident Assistant', 'Heroics Sophomore · Resident Assistant (She/Her)', 'Power: Sheep Counter · Age: 20 · Pronouns: She/Her
Marin is a little absent-minded and almost always ready for bed, but that doesn’t mean she can’t be dependable. She takes her role as the wing hall residence assistant very seriously and is always happy to tackle any problem with a smile.', 'students', true, '#14919B'),
  ('Heroics Sophomore', 'Kavi Azad', 'Kavi_Azad', 'Heroics Sophomore · Resident Assistant', 'Heroics Sophomore · Resident Assistant (He/Him)', 'Power: Foresight · Age: 20 · Pronouns: He/Him
Kavi is uptight and by the books. He is something of a perfectionist. Despite this, he enjoys taking the ignorant under his wing and illuminating them with his illustrious mind. RA for most of the Group A Students.', 'students', true, '#14919B'),
  ('Heroics Sophomore', 'Carter Core', 'Carter_Core', 'Heroics Sophomore', 'Heroics Sophomore (He/Him)', 'Age: 20 · Pronouns: He/Him
A party guy. Kinda rad, kinda weird, who knows?', 'students', true, '#14919B'),
  ('Group D', 'Ember Bay', 'Ember_Bay', 'Group D Student', 'Group D Student', 'Power: Rubber Tiger · Age: 18', 'students', true, '#7A4FD0'),
  ('S-STEM', 'Casey Ortiz', 'Casey_Ortiz', 'S-STEM Student', 'S-STEM Student (She/Her)', 'Power: Processing · Age: 18 · Pronouns: She/Her
A little shy, but very friendly. Very interested in gadgets and the like. A little insecure about some things.', 'students', true, '#D97706'),
  ('S-STEM', 'Isaac Atkins', 'Isaac_Atkins', 'S-STEM Student', 'S-STEM Student (He/Him)', 'Power: Wire Weave · Age: 19 · Pronouns: He/Him
May be thought of as “Normal”. A little on the shorter side, a little nerdy when it comes to electrical engineering.', 'students', true, '#D97706'),
  ('S-STEM', 'Robert Teck', 'Robert_Teck', 'S-STEM Student', 'S-STEM Student (He/Him)', 'Power: Snap Shield · Age: 19 · Pronouns: He/Him
A snooty, well-spoken person. Is a little odd in how he tends to affectionately condescend. Big on programming.', 'students', true, '#D97706'),
  ('S-STEM', 'Otylia Teck', 'Otylia_Teck', 'S-STEM Student', 'S-STEM Student (She/Her)', 'Power: Snap Bolt · Age: 19 · Pronouns: She/Her
A little nicer than her brother. Does her best to hold on to whatever normalcy she has. Probably from a rich family.', 'students', true, '#D97706'),
  ('S-STEM', 'Jerome Baxter', 'Jerome_Baxter', 'S-STEM Student', 'S-STEM Student (He/Him)', 'Power: Solder · Age: 20 · Pronouns: He/Him
Laid back and just a little lazy. Makes up for it with his crazy plans that just might work.', 'students', true, '#D97706'),
  ('S-STEM', 'Erin Lee', 'Erin_Lee', 'S-STEM Student', 'S-STEM Student (She/Her)', 'Power: Blend in · Age: 18 · Pronouns: She/Her
Seems to always be in a bad mood, but occasionally opens up when something interesting happens.', 'students', true, '#D97706'),
  ('Business', 'Blaine Evergale', 'Blaine_Evergale', 'Business Student', 'Business Student (He/Him)', 'Age: 19 · Pronouns: He/Him
Rich and calculating.', 'students', true, '#B8860B'),
  ('Business', 'Abidemi Adams', 'Abidemi_Adams', 'Business Student', 'Business Student (She/Her)', 'Age: 19 · Pronouns: She/Her
Done with everyone’s stuff.', 'students', true, '#B8860B'),
  ('Business', 'Daniel Whittle', 'Daniel_Whittle', 'Business Student', 'Business Student (He/Him)', 'Age: 19 · Pronouns: He/Him
A little quiet but ambitious.', 'students', true, '#B8860B'),
  ('Business', 'Sheldon Frye', 'Sheldon_Frye', 'Business Student', 'Business Student (He/Him)', 'Age: 19 · Pronouns: He/Him
Has more information than he should… Is kinda grimey.', 'students', true, '#B8860B'),
  ('Business', 'Flora Gatmaitan', 'Flora_Gatmaitan', 'Business Student', 'Business Student (She/Her)', 'Age: 19 · Pronouns: She/Her
A little clueless and ethically vacant.', 'students', true, '#B8860B');

do $$
declare
  r record; uid uuid; num text; pw text; dom text; norm text; first text; cat uuid;
  made text[] := '{}'; skipped text[] := '{}';
begin
  -- Same email domain as everyone else's sign-in.
  select split_part(email, '@', 2) into dom from auth.users where email like '%@%'
   group by 1 order by count(*) desc limit 1;
  dom := coalesce(dom, 'neo.local');

  for r in select * from npc_roster loop
    norm  := lower(regexp_replace(r.full_name, '[^A-Za-z0-9]', '', 'g'));
    first := lower(split_part(r.full_name, ' ', 1));
    if exists (select 1 from public.profiles p
                where lower(p.username) = lower(r.username)
                   or lower(regexp_replace(p.username, '[^A-Za-z0-9]', '', 'g')) in (norm, first)) then
      skipped := skipped || r.full_name;
      update npc_roster set username = '(already exists)' where full_name = r.full_name;
      continue;
    end if;

    -- A random number nobody has: (555) xxx-xxxx
    loop
      num := '(555) ' || (200 + floor(random() * 800))::int || '-' || lpad(floor(random() * 10000)::int::text, 4, '0');
      exit when not exists (select 1 from public.profiles
                             where regexp_replace(phone_number, '\D', '', 'g') = regexp_replace(num, '\D', '', 'g'));
    end loop;

    uid := gen_random_uuid();
    pw  := 'npc-' || encode(extensions.gen_random_bytes(9), 'hex');
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            lower(r.username) || '@' || dom, extensions.crypt(pw, extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('username', r.username, 'phone_number', num), now(), now(), '', '', '', '');
    insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid, uid::text, jsonb_build_object('sub', uid::text, 'email', lower(r.username) || '@' || dom,
                                               'email_verified', true), 'email', now(), now(), now());

    -- The profile row comes from the signup trigger; fill in the rest.
    update public.profiles set bio = r.bio where id = uid;
    if to_regclass('public.account_categories') is not null then
      execute 'select id from public.account_categories where key = $1' into cat using r.cat_key;
      execute 'update public.profiles set category_id = $1 where id = $2' using cat, uid;
    end if;

    insert into public.npcs (id, secret, role, notes, is_student, color)
    values (uid, pw, r.role, r.notes, r.student, r.color);
    if not r.student then          -- like the Studio: staff aren't enrolled in classes
      if to_regclass('public.flight_enrollments') is not null then
        execute 'delete from public.flight_enrollments where user_id = $1' using uid;
      end if;
      if to_regclass('public.flight_students') is not null then
        execute 'delete from public.flight_students where user_id = $1' using uid;
      end if;
    end if;

    update npc_roster set username = r.username || '  ' || num where full_name = r.full_name;
    made := made || r.full_name;
  end loop;

  raise notice 'Made % NPCs. Skipped % (already exist): %', coalesce(array_length(made, 1), 0),
    coalesce(array_length(skipped, 1), 0), coalesce(array_to_string(skipped, ', '), 'none');
end $$;

-- The roster, grouped (the SQL Editor shows this).
select grp as "group", full_name as "character", username as "account and number", role
  from npc_roster
 order by case grp when 'Faculty' then 0 when 'Group A' then 1 when 'Heroics Sophomore' then 2
                   when 'Group D' then 3 when 'S-STEM' then 4 else 5 end, full_name;

drop table npc_roster;
