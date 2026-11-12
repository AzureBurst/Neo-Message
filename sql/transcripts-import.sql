-- =====================================================================
--  Character transcripts → MyTime
--  Filled from the 14 Google Doc transcripts on Nov 11, 2026.
--
--  Each character is matched to an account by the usernames listed in
--  their row (case doesn't matter), the character name on their MyTime
--  profile, or a username starting with their first name. Anyone not
--  matched (or matching more than one account) is skipped and listed at
--  the end — add their real username to the array in their row
--  (array['mimi', ...]) and run this again.
--
--  Sheets: attributes, skills, power, Edges, Hindrances, gear and the
--          like are replaced with what's in the transcript. Bennies,
--          wounds, fatigue and your GM notes are kept.
--  Profiles + personal record: only empty fields are filled, so
--          nothing a player already wrote is overwritten.
--  Needs mytime.sql and mytime-private.sql. Safe to run more than once.
-- =====================================================================

create temp table tx_import (
  label text, names text[], profile jsonb, private jsonb,
  attributes jsonb, skills jsonb, power jsonb, edges jsonb, hindrances jsonb,
  gear jsonb, suits jsonb, attr_points int, skill_points int, derived jsonb
);

-- Lana
insert into tx_import values ('Lana', array['lana'],
  '{"height_weight": "5’2", "status": "Normal", "birthplace": "Tokyo, Japan", "likes": "Night-life, Pranks, Sour candy, Gaming, Music, Cats, Exploring abandoned buildings, Melon soda", "dislikes": "Coffee, Studying, Silence, Routines, Sitting still", "about_me": "Skills: Improvisation, Gaming, Parkour", "relationships": "Father - Kenji Hoshino (Biggest supporter and the person she is closest to)\nMother - Marie Calloway", "char_name": "Lana"}'::jsonb,
  '{"secret": "Small spaces, Hurting people\nSecret - N/A!", "social_class": "Lower-middle class", "languages": "Japanese, English"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 4, "mod": 0}, "spirit": {"die": 8, "mod": 0}, "strength": {"die": 6, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 6, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 6, "mod": 0, "custom": true}]'::jsonb,
  '{"name": "Glitch", "level": 1, "abilities": [{"name": "Glitch Blink", "level": 1, "desc": "User can make a focus roll to attempt to blink over to somewhere within a 10 block radius."}, {"name": "Clip", "level": 1, "desc": "User can make a focus roll to attempt to partially phase through a solid object."}, {"name": "Destabilize", "level": 1, "desc": "User can make a focus roll to attempt to stun someone after making a successful attack/touch attack roll.\nTarget needs to make a successful Vigor roll to avoid being stunned."}], "trigger": "", "tells": "", "weaknesses": ""}'::jsonb,
  '[{"name": "Runner", "desc": "Move at full pace even through difficult ground."}]'::jsonb, '[{"name": "Impulsive", "severity": "Major", "desc": ""}, {"name": "Curious", "severity": "Minor", "desc": ""}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Mana Jameson
insert into tx_import values ('Mana Jameson', array['jameson', 'mana', 'mana.jameson', 'mana_jameson', 'manajameson'],
  '{"height_weight": "5’1 | 160", "status": "Normal", "birthday": "11.14", "birthplace": "Wisconsin, USA", "likes": "Ballet, Sleeping In, Her Parents, Frolicking in wild fields like a pretty pink princess", "dislikes": "Jessica. High-stakes scenarios, Her Parents, People who have no decorum. Who raised you…", "relationships": "Leon Silver (unfortunate friend)", "char_name": "Mana Jameson"}'::jsonb,
  '{"social_class": "Upper Class", "languages": "English, Sign-Language"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 6, "mod": 0}, "spirit": {"die": 8, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Healing", "attr": "smarts", "die": 6, "mod": 0}]'::jsonb,
  '{"name": "Heal Bubble", "level": 1, "abilities": [{"name": "Heal Bubble", "level": 1, "desc": "With a successful focus roll, a healing bubble can be created to heal a target’s wound within a 6 block radius. A raise on this roll may trigger a helpful secondary effect."}], "trigger": "Mana can emit bubbles from her skin.", "tells": "Umm. It’s a bubble, it is pretty easy to see.", "weaknesses": "Not much room for any combat oriented use."}'::jsonb,
  '[]'::jsonb, '[{"name": "People Pleasing", "severity": "Minor", "desc": "This character feels a need to earn the approval of others"}, {"name": "Dependency", "severity": "Major", "desc": "Needs to regularly stay hydrated, or they may begin to gain levels of fatigue."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Mimi Hama
insert into tx_import values ('Mimi Hama', array['hama', 'mimi', 'mimi.hama', 'mimi_hama', 'mimihama'],
  '{"height_weight": "5’4 | 130", "status": "Normal", "birthday": "June 20", "birthplace": "Hilo, Hawai’i (Island), Hawai’i, United States", "favorite_hero": "Cephanto", "likes": "Singing! Swimming! Gym!", "dislikes": "Overly negative people, Deserts, that sushi chef guy (he makes fun of my tail and it makes me sad :( )", "char_name": "Mimi Hama"}'::jsonb,
  '{"secret": "Losing her friends :(", "social_class": "Disgustingly Wealthy", "languages": "English, Japanese"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 8, "mod": 0}, "spirit": {"die": 4, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 8, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Performance", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Boating", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 4, "mod": 0, "custom": true}]'::jsonb,
  '{"name": "", "level": 1, "abilities": [], "trigger": "", "tells": "", "weaknesses": ""}'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Hazel Stein
insert into tx_import values ('Hazel Stein', array['hazel', 'hazel.stein', 'hazel_stein', 'hazelstein', 'stein'],
  '{"height_weight": "4’9 | 85 lbs", "status": "Normal", "birthplace": "New Jersey", "favorite_hero": "Duplicity", "likes": "Tinkering, Finding new things, Being [mildly] active, Engineering, Video Games", "dislikes": "Sitting still, others in pain, a lack of drive", "char_name": "Hazel Stein"}'::jsonb,
  '{"secret": "Being a nobody/ Father had no powers and is dead!", "social_class": "Lower Middle Class", "languages": "English, German"}'::jsonb,
  '{"agility": {"die": 8, "mod": 0}, "smarts": {"die": 10, "mod": 0}, "spirit": {"die": 4, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 4, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 8, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 6, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 10, "mod": 0}, {"name": "Repair", "attr": "smarts", "die": 4, "mod": 0}]'::jsonb,
  '{"name": "Flying Squirrel", "level": 1, "abilities": [{"name": "Glide", "level": 1, "desc": ""}, {"name": "Wall Climb", "level": 1, "desc": "Climbs at normal pace, but ceilings at half pace"}, {"name": "Leaping", "level": 1, "desc": "Can leap 4 blocks up and 8 blocks across"}, {"name": "Super Skill(Athletics)", "level": 2, "desc": "Increased athletics relating to balance, jumping and climbing by two dice steps."}], "trigger": "Hazel can instinctually transform parts of her body into parts similar to that of a flying squirrel", "tells": "Squirrel.. parts", "weaknesses": "Fragile"}'::jsonb,
  '[{"name": "Danger Sense", "desc": "Occasional bonus notice roll to sense danger."}]'::jsonb, '[{"name": "Curious", "severity": "Major", "desc": "Wants to know about everything, often to their own detriment."}, {"name": "Small", "severity": "Minor", "desc": "Smaller than average, with reduced Size and Toughness."}, {"name": "Thin Skinned", "severity": "", "desc": "Especially vulnerable to Taunt attacks."}, {"name": "Secret", "severity": "", "desc": "Hazel has a dark secret that might lead to terrible consequences should it ever be revealed."}]'::jsonb,
  '[{"name": "Laser Welder", "notes": "A hand-held welder that can assist in certain repairs. Might need a tune-up."}]'::jsonb, '[]'::jsonb, 0, 0, '{"toughness": 3}'::jsonb);

-- Rayleigh Kaijin
insert into tx_import values ('Rayleigh Kaijin', array['kaijin', 'rayleigh', 'rayleigh.kaijin', 'rayleigh_kaijin', 'rayleighkaijin'],
  '{"height_weight": "6’2 | 170 lbs", "status": "Okay", "birthplace": "Place, Japan", "favorite_hero": "No one specific", "likes": "Anything cold, ice cream, popsicles, really likes ice baths, working out, snow", "dislikes": "Hot areas or weather, isn’t a fan of the beach", "char_name": "Rayleigh Kaijin"}'::jsonb,
  '{"secret": "He fears losing total control and hurting his friends and others around him, his biggest fear is himself. He doesn''t really keep secrets, however he keeps a massive scar that glows with energy on his arm wrapped up which is something that shames him.", "social_class": "Well off", "languages": "English, Japanese"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 6, "mod": 0}, "spirit": {"die": 4, "mod": 0}, "strength": {"die": 8, "mod": 4}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 8, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": -2}, {"name": "Focus", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Fighting", "attr": "agility", "die": 8, "mod": 0}]'::jsonb,
  '{"name": "Super Reactor", "level": 1, "abilities": [{"name": "Strength", "level": 4, "desc": "+4 to strength"}, {"name": "Explode", "level": 2, "desc": "Upon Achieving Heat level 3, Rayleigh can make a focus role to explode. This will do 3d10 damage in a radius. May also break him"}, {"name": "Leaping", "level": 1, "desc": "Rayleigh can leap 4 blocks up and 8 blocks across."}], "trigger": "Rayleigh’s Heart", "tells": "", "weaknesses": "High temperatures, difficult to control"}'::jsonb,
  '[{"name": "Lift", "desc": "The user’s weight limit is doubled (under 1000lbs)"}]'::jsonb, '[{"name": "Overheat", "severity": "Major", "desc": "The user has to make a vigor roll when using their power consecutively..\nHeat level 1: The user suffers a -1 to strength tests. \nHeat level 2: The user suffers a -2 to strength tests. The user is distracted until they cool down. The user is noticeably steaming.\nHeat level 3: The user will take 1d6 damage at the end of each of their turns. User is incredibly hot to the touch.\nThe user can make a vigor roll to cool down. A success will clear a level of heat, and a raise will clear 2 levels. Hot conditions will make it harder to cool down, and cool conditions will make it easier\nThe user will cool down after ten minutes out of combat."}, {"name": "Secret", "severity": "Minor", "desc": "Hides a secret that would cause problems if revealed"}, {"name": "Shamed", "severity": "Minor", "desc": "Haunted by a tragic event from their past"}, {"name": "Out of touch", "severity": "Minor", "desc": "Struggles to understand certain social cues."}]'::jsonb,
  '[{"name": "Rayleigh’s Mask", "notes": "Custom made medical device. will cool the user’s body by one stage upon overheating. Only once per session. Will only work on overheat level one."}, {"name": "Ky0", "notes": "High-tech AI assistant."}, {"name": "Cooling Mask (V2)", "notes": "Custom made medical device. will cool the user’s body by one stage upon overheating. Only once per session Will only work on overheat level two and below.."}]'::jsonb, '[]'::jsonb, 0, 2, '{"encumbrance": 120, "carry": 480}'::jsonb);

-- Shi Lu Song
insert into tx_import values ('Shi Lu Song', array['shi', 'shi lu', 'shi lu song', 'shi.lu.song', 'shi_lu', 'shi_lu_song', 'shilu', 'shilusong', 'song'],
  '{"height_weight": "6’6 | 200 lbs", "status": "Normal", "birthplace": "Shanghai", "favorite_hero": "None", "likes": "Prayer, Meat, Martial Arts", "dislikes": "Things that are clearly not righteous. Bad Kharmic things.", "char_name": "Shi Lu Song"}'::jsonb,
  '{"secret": "He did not/does not need to shave his head", "social_class": "Orphan", "languages": "English, Mandarin, Chinese"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 4, "mod": 0}, "spirit": {"die": 8, "mod": 0}, "strength": {"die": 8, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Fighting", "attr": "agility", "die": 8, "mod": 0}]'::jsonb,
  '{"name": "Burden of Sin", "level": 1, "abilities": [{"name": "Burden of Sin", "level": 1, "desc": "Once per turn the user can make a touch attack to inflict a stack of burden of sin. One stack inflicts slow on the target, halving their pace for one turn and -2 to athletics rolls until the end of combat or after 30 minutes. Targets may attempt an athletics roll once per turn to adapt to the sudden change in weight."}], "trigger": "Contact with his hands.", "tells": "Anything affected by the power has a chain tattooed on to its surface", "weaknesses": "Requires close contact"}'::jsonb,
  '[{"name": "Martial artist", "desc": "+1 Bonus to fighting unarmed, fists and feet count as natural weapons and add 1d4 of damage."}]'::jsonb, '[{"name": "All Thumbs", "severity": "Minor", "desc": "-2 penalty when using mechanical or electronic devices."}, {"name": "Code of Honor", "severity": "Major", "desc": "Song will not stand by and watch something unjust."}, {"name": "Vow", "severity": "Minor", "desc": "Song vows to attain enlightenment"}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Marigold Rosette
insert into tx_import values ('Marigold Rosette', array['marigold', 'marigold.rosette', 'marigold_rosette', 'marigoldrosette', 'rosette'],
  '{"height_weight": "5’8 | 155lbs", "status": "Normal", "birthday": "June 6th", "birthplace": "Provence, France", "favorite_hero": "N/A", "likes": "Iced tea, Gardening,Being respected,Baking", "dislikes": "Pressure,Being doubted,Ignorant people", "char_name": "Marigold Rosette"}'::jsonb,
  '{"secret": "Family basically did a eugenics trial", "social_class": "Wealthy", "languages": "French, English"}'::jsonb,
  '{"agility": {"die": 4, "mod": 0}, "smarts": {"die": 8, "mod": 0}, "spirit": {"die": 8, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 4, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 4, "mod": 0, "custom": true}, {"name": "Healing", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Botany", "attr": "smarts", "die": 4, "mod": 0, "custom": true}]'::jsonb,
  '{"name": "Radiant Garden", "level": 1, "abilities": [{"name": "Plant a garden", "level": 1, "desc": "Marigold can plant a garden in the presence of light. This garden has an area of 3 blocks and will energize whoever is inside it."}], "trigger": "", "tells": "", "weaknesses": ""}'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Kuro Kobayashi
insert into tx_import values ('Kuro Kobayashi', array['kobayashi', 'kuro', 'kuro.kobayashi', 'kuro_kobayashi', 'kurokobayashi'],
  '{"height_weight": "6’2 | 160lbs", "status": "Normal", "birthplace": "Tokyo, Japan", "favorite_hero": "Nano-Surgeon", "likes": "The winter, rain weather, drinking tea, cloth making, nature, and going to the gym", "dislikes": "Mosquitos, loud noises, sudden bright lights, Leon", "char_name": "Kuro Kobayashi"}'::jsonb,
  '{"secret": "Fear of losing her sense of self via physically or via power", "social_class": "Uber Rich", "languages": "Japanese, Mandarin, English, and Korean"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 6, "mod": 0}, "spirit": {"die": 8, "mod": 0}, "strength": {"die": 6, "mod": 0}, "vigor": {"die": 4, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 8, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 8, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 6, "mod": 0, "custom": true}, {"name": "Performance", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Fighting", "attr": "agility", "die": 4, "mod": 0}]'::jsonb,
  '{"name": "Kitsune (3 Tails)", "level": 1, "abilities": [{"name": "Illusion", "level": 1, "desc": "Kuro’s foxfire burns an illusion into reality. By making a focus roll and succeeding, Kuro will create an intangible illusion in a range of half her smarts die. (3 blocks all around) This lasts for 5 turns and does not produce sound.\nKuro can spend more time crafting more realistic illusions."}, {"name": "Foxbolt", "level": 1, "desc": "The user can make a focus roll to launch a blast of fire from their tail to attack foes in range. This deals 2d6 damage. Oddly enough, this will not light things on fire unless Kuro really wants to."}, {"name": "Super Skill (Notice)", "level": 1, "desc": "Kuro’s enhanced senses improve their notice by one step."}], "trigger": "Kuro’s powers all stem from the foxfire that builds in her tails.", "tells": "A blue-white flame initiates every use of her power.", "weaknesses": "Requires an intense amount of focus."}'::jsonb,
  '[{"name": "Aristocrat", "desc": "+2 to Common Knowledge and networking with upper class"}]'::jsonb, '[{"name": "Reckless", "severity": "Major", "desc": "Kuro’s powers have a risk of unintended consequence should they ever critically fail to use their powers."}, {"name": "Vow", "severity": "Minor", "desc": "Kuro feels bound to protect their family’s reputation."}, {"name": "Insecure", "severity": "Minor", "desc": "Kuro is insecure about her powers."}]'::jsonb,
  '[{"name": "Prototype Phone", "notes": "Kuro’s father hooked her up with a sick phone that’s not on the market. It has a 360 degree camera."}]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Sofia A
insert into tx_import values ('Sofia A', array['sofia', 'sofia.a', 'sofia_a', 'sofiaa'],
  '{"birthplace": "Topeka, KS", "favorite_hero": "Maelstrom, Power Surge", "char_name": "Sofia A"}'::jsonb,
  '{"secret": "Monophobia/Her family hates her deeply", "social_class": "Middle Class", "languages": "English, Italian"}'::jsonb,
  '{"agility": {"die": 4, "mod": 0}, "smarts": {"die": 8, "mod": 0}, "spirit": {"die": 6, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 6, "mod": 0, "custom": true}]'::jsonb,
  '{"name": "Barrier", "level": 1, "abilities": [{"name": "Barrier", "level": 1, "desc": "Once per turn. Sofia can place a barrier anywhere within her light of sight and within 12 blocks of her. A single barrier has a hardness of 10, but each barrier placed reduces the hardness by 2. 2 barriers placed both have 8 hardness. Each time a barrier is broken, Sofia needs to make a vigor roll. Failure results in a stack of fatigue."}], "trigger": "Sofia’s Eyes", "tells": "Shimmering light", "weaknesses": "Requires line of sight."}'::jsonb,
  '[{"name": "Discerning", "desc": "+2 to Notice rolls that are specifically geared at reading body language."}]'::jsonb, '[{"name": "Thin Skinned", "severity": "Minor", "desc": ""}, {"name": "Guarded", "severity": "Minor", "desc": "This character is slow to trust and may doubt even the plainest of intentions."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Leon Silver
insert into tx_import values ('Leon Silver', array['leon', 'leon.silver', 'leon_silver', 'leonsilver', 'silver'],
  '{"height_weight": "5’9 | 175lbs", "status": "Normal", "birthday": "February 7th, 2142", "birthplace": "Madison Wisconsin, United States", "favorite_hero": "Dray Howitzer (Ink King)", "likes": "Playing Piano, Art, Engineering feats, sweet food, imperfections, Training.", "dislikes": "Global Companies, His Quirk, Wealthy Families, Perfection", "char_name": "Leon Silver"}'::jsonb,
  '{"secret": "Failing when it matters most, Leon fears that in the moment he really needs to help or save someone he will mess up. He doesn’t want to let other people down with his failure. Maybe he misses his quirks range by an inch, maybe he will mess up in a hostage situation, or maybe he won’t be there to support his friends again when they actually need him. He won’t have a repeat of Akoya.", "social_class": "Upper Class", "languages": "English, Basic French & Russian (Insults, Accent, basic understanding)"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 6, "mod": 0}, "spirit": {"die": 6, "mod": 0}, "strength": {"die": 6, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 4, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Repair", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Performance", "attr": "smarts", "die": 6, "mod": 0}]'::jsonb,
  '{"name": "Ferromagnetic Pulse", "level": 1, "abilities": [{"name": "Metal Shot", "level": 1, "desc": "On a successful focus roll, Leon can gather metal into a ball and launch it as a projectile attack. This will do 2d4 damage."}, {"name": "Metal Forge", "level": 1, "desc": "On a successful focus roll, Leon can forge a simple object out of metal."}], "trigger": "Leon’s hands and fingers.", "tells": "Moving metal.", "weaknesses": "Short range, requires Leon’s focus and free use of his hands."}'::jsonb,
  '[]'::jsonb, '[{"name": "Driven", "severity": "Minor", "desc": ""}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Daigo
insert into tx_import values ('Daigo', array['daigo'],
  '{"height_weight": "5’6, 130 lbs", "status": "Normal", "birthday": "12/3", "birthplace": "Tokyo, Japan", "likes": "Ice cream, history, reading, studying, quiet peaceful environments, gaming", "dislikes": "Loud environments, high pressure situations, classy events, the summer.", "about_me": "Skills: Driving, time management, parkour, stealth, planning", "relationships": "Kanade", "char_name": "Daigo"}'::jsonb,
  '{"secret": "Talking to new people\u000bSecret: Wants to have his own team made up of friends", "social_class": "Upper-Class", "languages": "Japan and English"}'::jsonb,
  '{"agility": {"die": 6, "mod": 0}, "smarts": {"die": 8, "mod": 0}, "spirit": {"die": 6, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 6, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Driving", "attr": "agility", "die": 4, "mod": 0}]'::jsonb,
  '{"name": "Ghost", "level": 1, "abilities": [{"name": "Puppet", "level": 1, "desc": "The spirit can possess humanoid objects. With a focus roll, the spirit can attempt to corrupt the object to make it more dangerous and creepier."}, {"name": "Levitate", "level": 1, "desc": "Daigo can levitate short distances when working in tandem with the spirit."}, {"name": "Self-possession", "level": 1, "desc": "The spirit can possess Daigo and heavily improve his physical attributes. This does come at the cost of ceding control and inflicting him with a heavy amount of fatigue afterward."}], "trigger": "Heavy concentration.", "tells": "Ghostly happenings.", "weaknesses": "Cooperating with his spirit, proximity of possessed objects to Daigo, mental, spiritual, and physical energy gets drained quickly."}'::jsonb,
  '[]'::jsonb, '[{"name": "Fearful", "severity": "Major", "desc": "-2 to fear and intimidation"}, {"name": "Heroic", "severity": "Minor", "desc": "May stumble into a mess when trying to help others."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Milo Belmont
insert into tx_import values ('Milo Belmont', array['belmont', 'milo', 'milo.belmont', 'milo_belmont', 'milobelmont'],
  '{"height_weight": "5’9 / 57kg", "status": "Normal", "birthday": "03/15", "birthplace": "London, England", "likes": "Art, Music, The Night, Quiet spaces", "dislikes": "Loud noises, Crowded rooms, sunlight", "about_me": "Skills: Teamwork, listening, problem solving", "relationships": "Father- Lucien Belmont\nMother- Andromeda Belmont", "char_name": "Milo Belmont"}'::jsonb,
  '{"secret": "Being powerless to help others, tight spaces, needles", "social_class": "Middle Class", "languages": "English"}'::jsonb,
  '{"agility": {"die": 8, "mod": 0}, "smarts": {"die": 8, "mod": 0}, "spirit": {"die": 4, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 6, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 8, "mod": 0}, {"name": "Performance", "attr": "spirit", "die": 6, "mod": 0}]'::jsonb,
  '{"name": "Sanguine Spirit", "level": 1, "abilities": [{"name": "Blood Rush", "level": 1, "desc": "The user can drink blood to power up. Duration of the power up varies based on how much blood is consumed. Associated trait changes can be seen in red.\nWhile powered up: Strength d8, Vigor d8, Athletics d8, Notice d8, Persuasion d6, Stealth d6."}, {"name": "Vampire Bite", "level": 1, "desc": "User can deal an additional 1d4 of damage with a bite."}, {"name": "Vampire Relay", "level": 1, "desc": "Milo can pass on his powers, by allowing someone to drink his blood. This is temporary and immediately deals 2 levels of fatigue to Milo."}], "trigger": "Blood Consumption", "tells": "General Vampirisms", "weaknesses": "Sunlight\nDrawback: The user becomes lethargic in the sun. Requires a lot of blood for upkeep. In direct sunlight, Milo is Distracted (-2 to all Trait rolls). Heavy cover, cloud, or darkness removes it"}'::jsonb,
  '[]'::jsonb, '[{"name": "Dependency", "severity": "Major", "desc": "Milo has a dependency and will occasionally need to re-up on blood."}, {"name": "Mild Mannered", "severity": "Minor", "desc": ""}, {"name": "Quirk", "severity": "Minor", "desc": ""}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 1, '{}'::jsonb);

-- Aspen Blaise
insert into tx_import values ('Aspen Blaise', array['aspen', 'aspen.blaise', 'aspen_blaise', 'aspenblaise', 'blaise'],
  '{"height_weight": "5’4", "status": "Healthy", "birthday": "07/24", "birthplace": "New Jersey, USA", "likes": "Plants, Fungi, Reading, Friends, Autumn, Gardening, Animals", "dislikes": "Summer, Winter, Swimming", "about_me": "Skills: Gardening, Botany, Creative Writing", "relationships": "Heather Leif (Mother), Clover Blaise (Mother)", "char_name": "Aspen Blaise"}'::jsonb,
  '{"secret": "Being Alone, The Ocean, Fire", "social_class": "Middle Class", "languages": "English"}'::jsonb,
  '{"agility": {"die": 4, "mod": 0}, "smarts": {"die": 10, "mod": 0}, "spirit": {"die": 6, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 4, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 6, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 4, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 8, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 10, "mod": 0}, {"name": "Mycology", "attr": "smarts", "die": 4, "mod": 0, "custom": true}]'::jsonb,
  '{"name": "Mycokinesis", "level": 1, "abilities": [{"name": "Mushroom Entanglement", "level": 1, "desc": ""}], "trigger": "", "tells": "", "weaknesses": "Drawback: When in the presence of extremely bright lights or incredible heat, the user takes -2 to focus."}'::jsonb,
  '[]'::jsonb, '[{"name": "Mild Mannered", "severity": "", "desc": "-2 to intimidation checks."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

-- Callan Kelp
insert into tx_import values ('Callan Kelp', array['callan', 'callan.kelp', 'callan_kelp', 'callankelp', 'kelp'],
  '{"status": "Normal", "birthplace": "USA", "likes": "Money, Skateboarding, Gambling", "dislikes": "Hospitals, Losing at gambling, Dogs", "about_me": "Skills: Lockpicking, Skateboarding", "relationships": "Father Thomas, Brother Luka", "char_name": "Callan Kelp"}'::jsonb,
  '{"social_class": "Poor", "languages": "English"}'::jsonb,
  '{"agility": {"die": 8, "mod": 0}, "smarts": {"die": 4, "mod": 0}, "spirit": {"die": 6, "mod": 0}, "strength": {"die": 4, "mod": 0}, "vigor": {"die": 6, "mod": 0}}'::jsonb,
  '[{"name": "Athletics", "attr": "agility", "die": 8, "mod": 0}, {"name": "Common Knowledge", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Notice", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Persuasion", "attr": "spirit", "die": 4, "mod": 0}, {"name": "Stealth", "attr": "agility", "die": 6, "mod": 0}, {"name": "Focus", "attr": "spirit", "die": 6, "mod": 0}, {"name": "Academics", "attr": "smarts", "die": 4, "mod": 0}, {"name": "Fighting", "attr": "agility", "die": 8, "mod": 0}, {"name": "Cooking", "attr": "smarts", "die": 4, "mod": 0, "custom": true}, {"name": "Thievery", "attr": "agility", "die": 4, "mod": 0}]'::jsonb,
  '{"name": "Extend Zone", "level": 1, "abilities": [{"name": "Reach", "level": 3, "desc": "Extends his reach up to 3 blocks around Callan"}, {"name": "Awareness", "level": 3, "desc": "Ignores up to 3 points of attack penalties"}, {"name": "Super Skill (Notice)", "level": 2, "desc": "Raises Callan’s notice up by two dice steps."}], "trigger": "Standing Still", "tells": "Mostly invisible, people with heightened senses can see it", "weaknesses": "Roots user in place"}'::jsonb,
  '[{"name": "Trusted weapon", "desc": "Wooden Kendo Sword: +1 to fighting"}]'::jsonb, '[{"name": "Big Mouth", "severity": "", "desc": "Struggles to keep a secret and tends to overshare"}, {"name": "Overconfident", "severity": "", "desc": "Believes that they can always succeed against any odds"}]'::jsonb,
  '[{"name": "Callan’s kendo sword", "notes": "Damage: Str + d6+1"}]'::jsonb, '[]'::jsonb, 0, 0, '{}'::jsonb);

do $$
declare t record; uid uuid; n int; done text[] := '{}'; missed text[] := '{}';
begin
  for t in select * from tx_import loop
    select count(*), min(p.id::text)::uuid into n, uid
      from public.profiles p left join public.mt_profiles m on m.user_id = p.id
     where not p.is_admin
       and (lower(p.username) = any(t.names)
            or lower(trim(m.char_name)) = lower(t.profile->>'char_name'));
    if n = 0 then   -- fallback: a username that starts with their first name, e.g. "mimi_h"
      select count(*), min(p.id::text)::uuid into n, uid from public.profiles p
       where not p.is_admin and lower(p.username) like split_part(lower(t.label), ' ', 1) || '%';
    end if;
    if n <> 1 then
      missed := missed || (t.label || case when n = 0 then ' (no account found)' else ' (' || n || ' accounts match)' end);
      continue;
    end if;

    insert into public.sw_sheets (user_id, attributes, skills, power, edges, hindrances, gear, suits,
                                  attr_points, skill_points, derived, updated_at)
    values (uid, t.attributes, t.skills, t.power, t.edges, t.hindrances, t.gear, t.suits,
            t.attr_points, t.skill_points, t.derived, now())
    on conflict (user_id) do update set
      attributes = excluded.attributes, skills = excluded.skills, power = excluded.power,
      edges = excluded.edges, hindrances = excluded.hindrances, gear = excluded.gear, suits = excluded.suits,
      attr_points = excluded.attr_points, skill_points = excluded.skill_points,
      derived = excluded.derived, updated_at = now();

    insert into public.mt_profiles (user_id) values (uid) on conflict (user_id) do nothing;
    update public.mt_profiles m set
      char_name     = coalesce(nullif(trim(m.char_name), ''),     t.profile->>'char_name'),
      height_weight = coalesce(nullif(trim(m.height_weight), ''), t.profile->>'height_weight'),
      status        = coalesce(nullif(trim(m.status), ''),        t.profile->>'status'),
      birthday      = coalesce(nullif(trim(m.birthday), ''),      t.profile->>'birthday'),
      birthplace    = coalesce(nullif(trim(m.birthplace), ''),    t.profile->>'birthplace'),
      favorite_hero = coalesce(nullif(trim(m.favorite_hero), ''), t.profile->>'favorite_hero'),
      likes         = coalesce(nullif(trim(m.likes), ''),         t.profile->>'likes'),
      dislikes      = coalesce(nullif(trim(m.dislikes), ''),      t.profile->>'dislikes'),
      about_me      = coalesce(nullif(trim(m.about_me), ''),      t.profile->>'about_me'),
      relationships = coalesce(nullif(trim(m.relationships), ''), t.profile->>'relationships'),
      updated_at = now()
     where m.user_id = uid;

    insert into public.mt_private (user_id) values (uid) on conflict (user_id) do nothing;
    update public.mt_private v set
      secret       = coalesce(nullif(trim(v.secret), ''),       t.private->>'secret'),
      social_class = coalesce(nullif(trim(v.social_class), ''), t.private->>'social_class'),
      languages    = coalesce(nullif(trim(v.languages), ''),    t.private->>'languages'),
      updated_at = now()
     where v.user_id = uid;

    done := done || (t.label || ' → ' || (select username from public.profiles where id = uid));
  end loop;
  raise notice 'Filled in: %', coalesce(array_to_string(done, ', '), 'nobody');
  if array_length(missed, 1) > 0 then
    raise notice 'Skipped (fix the usernames at the top and run again): %', array_to_string(missed, ', ');
  end if;
end $$;

-- What happened, as a table (the SQL Editor shows this).
select t.label as character,
       coalesce((select p.username from public.mt_profiles m join public.profiles p on p.id = m.user_id
                  where not p.is_admin and m.char_name = t.profile->>'char_name' limit 1),
                '— not matched: add their username to the list at the top —') as account
  from tx_import t;

drop table tx_import;
