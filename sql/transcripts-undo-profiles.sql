-- =====================================================================
--  Undo the profile part of transcripts-import.sql.
--  Clears the MyTime profile fields (wall) that the import filled in from
--  the transcripts, back to blank. A field is only cleared if it still
--  holds exactly the transcript's text, so anything a player wrote or
--  edited themselves is kept. Sheets (Transcript tab) and the private
--  personal record are not touched.
-- =====================================================================

with tx(label, p) as (values
  ('Lana', '{"height_weight": "5’2", "status": "Normal", "birthplace": "Tokyo, Japan", "likes": "Night-life, Pranks, Sour candy, Gaming, Music, Cats, Exploring abandoned buildings, Melon soda", "dislikes": "Coffee, Studying, Silence, Routines, Sitting still", "about_me": "Skills: Improvisation, Gaming, Parkour", "relationships": "Father - Kenji Hoshino (Biggest supporter and the person she is closest to)\nMother - Marie Calloway", "char_name": "Lana"}'::jsonb),
  ('Mana Jameson', '{"height_weight": "5’1 | 160", "status": "Normal", "birthday": "11.14", "birthplace": "Wisconsin, USA", "likes": "Ballet, Sleeping In, Her Parents, Frolicking in wild fields like a pretty pink princess", "dislikes": "Jessica. High-stakes scenarios, Her Parents, People who have no decorum. Who raised you…", "relationships": "Leon Silver (unfortunate friend)", "char_name": "Mana Jameson"}'::jsonb),
  ('Mimi Hama', '{"height_weight": "5’4 | 130", "status": "Normal", "birthday": "June 20", "birthplace": "Hilo, Hawai’i (Island), Hawai’i, United States", "favorite_hero": "Cephanto", "likes": "Singing! Swimming! Gym!", "dislikes": "Overly negative people, Deserts, that sushi chef guy (he makes fun of my tail and it makes me sad :( )", "char_name": "Mimi Hama"}'::jsonb),
  ('Hazel Stein', '{"height_weight": "4’9 | 85 lbs", "status": "Normal", "birthplace": "New Jersey", "favorite_hero": "Duplicity", "likes": "Tinkering, Finding new things, Being [mildly] active, Engineering, Video Games", "dislikes": "Sitting still, others in pain, a lack of drive", "char_name": "Hazel Stein"}'::jsonb),
  ('Rayleigh Kaijin', '{"height_weight": "6’2 | 170 lbs", "status": "Okay", "birthplace": "Place, Japan", "favorite_hero": "No one specific", "likes": "Anything cold, ice cream, popsicles, really likes ice baths, working out, snow", "dislikes": "Hot areas or weather, isn’t a fan of the beach", "char_name": "Rayleigh Kaijin"}'::jsonb),
  ('Shi Lu Song', '{"height_weight": "6’6 | 200 lbs", "status": "Normal", "birthplace": "Shanghai", "favorite_hero": "None", "likes": "Prayer, Meat, Martial Arts", "dislikes": "Things that are clearly not righteous. Bad Kharmic things.", "char_name": "Shi Lu Song"}'::jsonb),
  ('Marigold Rosette', '{"height_weight": "5’8 | 155lbs", "status": "Normal", "birthday": "June 6th", "birthplace": "Provence, France", "favorite_hero": "N/A", "likes": "Iced tea, Gardening,Being respected,Baking", "dislikes": "Pressure,Being doubted,Ignorant people", "char_name": "Marigold Rosette"}'::jsonb),
  ('Kuro Kobayashi', '{"height_weight": "6’2 | 160lbs", "status": "Normal", "birthplace": "Tokyo, Japan", "favorite_hero": "Nano-Surgeon", "likes": "The winter, rain weather, drinking tea, cloth making, nature, and going to the gym", "dislikes": "Mosquitos, loud noises, sudden bright lights, Leon", "char_name": "Kuro Kobayashi"}'::jsonb),
  ('Sofia A', '{"birthplace": "Topeka, KS", "favorite_hero": "Maelstrom, Power Surge", "char_name": "Sofia A"}'::jsonb),
  ('Leon Silver', '{"height_weight": "5’9 | 175lbs", "status": "Normal", "birthday": "February 7th, 2142", "birthplace": "Madison Wisconsin, United States", "favorite_hero": "Dray Howitzer (Ink King)", "likes": "Playing Piano, Art, Engineering feats, sweet food, imperfections, Training.", "dislikes": "Global Companies, His Quirk, Wealthy Families, Perfection", "char_name": "Leon Silver"}'::jsonb),
  ('Daigo', '{"height_weight": "5’6, 130 lbs", "status": "Normal", "birthday": "12/3", "birthplace": "Tokyo, Japan", "likes": "Ice cream, history, reading, studying, quiet peaceful environments, gaming", "dislikes": "Loud environments, high pressure situations, classy events, the summer.", "about_me": "Skills: Driving, time management, parkour, stealth, planning", "relationships": "Kanade", "char_name": "Daigo"}'::jsonb),
  ('Milo Belmont', '{"height_weight": "5’9 / 57kg", "status": "Normal", "birthday": "03/15", "birthplace": "London, England", "likes": "Art, Music, The Night, Quiet spaces", "dislikes": "Loud noises, Crowded rooms, sunlight", "about_me": "Skills: Teamwork, listening, problem solving", "relationships": "Father- Lucien Belmont\nMother- Andromeda Belmont", "char_name": "Milo Belmont"}'::jsonb),
  ('Aspen Blaise', '{"height_weight": "5’4", "status": "Healthy", "birthday": "07/24", "birthplace": "New Jersey, USA", "likes": "Plants, Fungi, Reading, Friends, Autumn, Gardening, Animals", "dislikes": "Summer, Winter, Swimming", "about_me": "Skills: Gardening, Botany, Creative Writing", "relationships": "Heather Leif (Mother), Clover Blaise (Mother)", "char_name": "Aspen Blaise"}'::jsonb),
  ('Callan Kelp', '{"status": "Normal", "birthplace": "USA", "likes": "Money, Skateboarding, Gambling", "dislikes": "Hospitals, Losing at gambling, Dogs", "about_me": "Skills: Lockpicking, Skateboarding", "relationships": "Father Thomas, Brother Luka", "char_name": "Callan Kelp"}'::jsonb)
)
update public.mt_profiles m set
  height_weight = case when m.height_weight = tx.p->>'height_weight' then null else m.height_weight end,
  status        = case when m.status        = tx.p->>'status'        then null else m.status end,
  birthday      = case when m.birthday      = tx.p->>'birthday'      then null else m.birthday end,
  birthplace    = case when m.birthplace    = tx.p->>'birthplace'    then null else m.birthplace end,
  favorite_hero = case when m.favorite_hero = tx.p->>'favorite_hero' then null else m.favorite_hero end,
  likes         = case when m.likes         = tx.p->>'likes'         then null else m.likes end,
  dislikes      = case when m.dislikes      = tx.p->>'dislikes'      then null else m.dislikes end,
  about_me      = case when m.about_me      = tx.p->>'about_me'      then null else m.about_me end,
  relationships = case when m.relationships = tx.p->>'relationships' then null else m.relationships end,
  char_name     = null,
  updated_at    = now()
from tx
where m.char_name = tx.p->>'char_name'
returning m.user_id, tx.label as cleared;
