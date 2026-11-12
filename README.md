# Your graphics go here

The two files in this folder are placeholders. Replace them with your own
and the app picks them up — no code changes needed, as long as you keep
the filenames.

| File | Where it shows | Recommended size |
|---|---|---|
| `favicon.svg` | Browser tab, phone home screen | Square, 64×64 or any square SVG |
| `logo.svg` | Top of the sign-in screen | About 260×48, transparent background |

PNG works too. If you swap to PNG, update the two references:

- `index.html` — the `<link rel="icon">` line and the `#brandLogo` image
- `app.html` and `admin.html` — the `<link rel="icon">` line

The logo on the sign-in screen only appears once the file loads, so a
missing file leaves the text wordmark in place rather than a broken icon.

## Changing the colors

Every color lives at the top of `css/neo.css` under `:root`. The two that
matter most:

```css
--signal: #FF7A3D;   /* the network: status bar, admin chrome, accents */
--sent:   #2F6BFF;   /* you: your own message bubbles, primary buttons */
```

Change those two and the whole app shifts with them.

## Changing the carrier name

`js/config.js`, the `CARRIER_NAME` value. It's the text next to the signal
bars at the top of every screen. Anything short works — a corp name, a
faction, whatever fits the setting.

## Adding a carrier logo to the status bar

If you want a small graphic next to the signal bars instead of text, drop
your file here as `carrier.svg` and edit `mountCarrier()` in `js/supa.js` —
swap the `<span class="carrier-name">` line for:

```js
`<img src="assets/carrier.svg" alt="" class="carrier-logo">`
```

## Look: the Knot theme

The whole phone now uses a street-forum look: chunky rounded cards with
a thick black outline, heavy rounded Rubik type, lime accents on black,
pill-shaped tabs and buttons, and a halftone texture behind everything.
Instagrat's feed is a card wall: each post a tile with its picture, a
like count, the poster's avatar on the seam, and the caption in bold.
Put a headline on the first line of a caption and the rest underneath to
get the "[Notice] Title / snippet" look.

It all lives in one block at the bottom of `css/neo.css` (search for
KNOT THEME) plus the colour variables at the top. Change `--sent` to
re-colour every accent at once.

## B.S. in Field Heroics

Run `sql/flight-heroics.sql` once, after `flight.sql`. It adds the six
core courses, enrols every student in them, and records everyone as a
B.S. in Field Heroics major:

| Code | Course | Credits | Meets |
|---|---|---|---|
| HERO 101 | Hero History | 3 | Mon/Wed/Fri 9:00–10:00 AM |
| MATH 101 | Intro to Math | 3 | Mon/Wed/Fri 10:15–11:15 AM |
| ETHL 110 | Intro to Heroic Ethics and Laws | 3 | Mon/Wed/Fri 11:30 AM–12:30 PM |
| COMM 101 | Communications 101 | 1 | Fri 1:30–2:30 PM |
| RESC 101 | Rescue Training 101 | 3 | Tue/Thu 9:30–11:00 AM |
| SPE 120 | Specialized Physical Education | 2 | Tue/Thu 1:00–2:30 PM |

Term: Fall 2160. 15 credit hours. Lectures are 60 minutes, the two
practical courses 90. Every student's Heroics coordinator is Kaori
Hamasaki.

These are **required** courses: anyone who signs up later is enrolled in
all of them, and gets a student record with the major filled in, the
moment their account is created. Admin accounts are left out so the GM
isn't on the rosters.

Professors start as "Staff" and meeting times and rooms are blank — fill
them in from Admin → the course → Edit course. Tick **Required course**
on any other course to make it mandatory the same way.

Re-running the file never duplicates a course or an enrolment, and never
overwrites a course you've edited.

### Schedule tab

Students get a Mon–Fri timetable built from each course's **Meets**
field, and the portal home shows *Today's classes* for the story date,
marking the one in session. Write meeting times like
`Mon/Wed/Fri 9:00–10:00 AM` or `Tue/Thu 1:00–2:30 PM`; separate
different patterns with a semicolon (`Mon 9:00–10:00 AM; Fri 1:00–3:00 PM`).
Change a course's meeting time and the timetable follows.

### Heroics coordinator

Shown on each student's ID card and record. Set it for everyone at once
from Admin → Student records → *Set for all*, or per student in their
record.

## Queree (search engine)

Run `sql/queree.sql` once in the Supabase SQL Editor.

Players type anything into Queree. Each search opens as a tab (close
them with ✕; History keeps everything) and lands in your **inbox** (✉ in
the Queree header, admin only) with a notification. Answer with any mix of:

- **Wiki article** — Heropedia look. `## Heading` makes sections (and a
  contents box), `- ` makes bullets, `**bold**`, `*italic*`, and
  `[[Some Topic]]` makes a link that runs a new search when tapped. The
  infobox takes one `Label: Value` per line plus an optional image.
- **Forum thread** — imageboard look. Separate posts with a line of
  `---`; start a post with `Name: someone` to sign it; `>` lines go green.
- **Plain answer** — just you, in a Queree answer card.
- **Image** — upload or paste an image with a caption.

The player's tab updates live and they get a notification.

**Indexed pages** (☷) are articles you write ahead of time with keywords.
They show up instantly in any matching search for every player, are
offered as one-tap answers in your inbox, and feed the search
suggestions.

## Time zone

Every player sees the same times — the story clock, message times, the
calendar, due dates — no matter where they live. The app runs on US
Eastern time by default. To use a different zone, add this line to
`js/config.js` (any IANA zone name, e.g. `America/Chicago` or `UTC`):

```js
export const STORY_TZ = 'America/Los_Angeles';
```

## Maintenance mode

As the GM, tap **🚧 Maintenance mode** on the home screen (or the 🚧
button in Messages). Turn it on and every player — whoever signs in, and
anyone already on the site — gets the "Under maintenance" sign over the
whole site, with an optional message underneath, until you turn it off.
You still get in: you see the sign once, press Continue, and a yellow
"Maintenance on" pill stays in the corner as a reminder. No SQL needed.
To change the sign, replace `assets/maintenance.png`.

## Journal

Run `sql/journal.sql` once in the Supabase SQL Editor.

Players keep a private log of what their character did: a title, the
story date and time (defaults to the story clock), where it happened, an
optional picture and as much text as they like. Drafts save on
their device as they type. Players only ever see their own journal.

As the GM you get two extra tabs: **Players** (every player's journal,
with entry counts) and **Recent** (newest entries from everyone). You get
a notification when someone writes. Open any entry to leave a **GM note**
— it appears under the entry in yellow and notifies the player. Players
can't edit your notes, and you can't edit their writing.

Every entry carries the real-world date and time it was **first saved**
(`created_at`) and **last saved** (`updated_at`). The database sets
these itself, so they can't be faked or changed from the browser. You
see them at the bottom of each entry, and in Supabase you can open the
**journal_log** view for a readable list (player, title, times in US
Eastern, story time, preview).

## Queree preview

In the Queree answer form, **Preview** shows exactly what the player will
get — the result card and the opened page — before you send it.

## Renaming players

Run `sql/admin-rename.sql` once. Then in NeoAdmin → **Accounts**, press ✎
next to a player, type the new name and Save. Because players sign in with
their username, this also moves their sign-in to the new name — they keep
their password, and everything they've made stays with them. Tell them
their new name before their next sign-in.

## Student handbook

Flight Portal → **Handbook** shows the Justice University Student
Handbook with a contents list and search. The text lives in
`js/flight-handbook.js` — edit it there to add or change policies.
Link straight to a chapter with `flight.html?handbook=honor` (ids:
housing, hero, honor, conduct, harassment, academic, health, emergency,
tech, orgs).

## NPC Studio

Run `sql/npc.sql` once in the Supabase SQL Editor (after `admin-rename.sql`
if you want to rename NPCs). Then open **🎭 NPC Studio** from your home
screen (or the 🎭 button in Messages).

- **Inbox** — every conversation that has an NPC in it, newest first, with
  unread counts. Open one and reply **as** any NPC in it; pick who's talking
  from the "As" switch above the message box. You stay signed in as yourself.
  Players texting an NPC send you a notification. "＋ NPC" brings another NPC
  into a conversation.
- **✎ New message** — text any player (or several, for a group) as an NPC.
- **Cast** — your NPCs as cards: name, number, picture, a role and private
  notes only you see, and a colour so you can tell them apart. Create, edit,
  archive (hide) or delete them here.
- **Sign in as** — for using the other apps (Instagrat, Neomail…) as an NPC.
  A bar at the top of every page takes you back to your own account. No
  passwords to keep: the Studio stores and resets them for you.

NPCs live in the database now, so they work from any device. Old puppets
saved in a browser show up in Cast with a **Move into Studio** button, and
**Use an existing account** turns any other account into an NPC. NPCs are
left out of Justice U enrolment, "mail everyone" and the journal's player
list unless you tick "A Justice U student" for them. Players can't see which
accounts are NPCs.

## Overdrive theme

**Hidden for now.** To bring it back, set `OVERDRIVE_AVAILABLE = true` in
`js/theme-boot.js` and remove `hidden` from the ◐ button (`#themeBtn`) in
`home.html`. Devices that had chosen it will pick it up again.

An optional look with more colour and smooth motion: neon haze and a grid
floor, a flowing colour line under each app's header, cards with corner
brackets that lift on hover, views that rise and fade in, lists that
cascade, pop-ups that ease in, light bursts on button presses and icons
that tilt toward the pointer.

Pages stay hidden until they've finished loading (signed in, data fetched,
fonts and visible pictures ready — never more than 3.5 s), then fade in as
one piece, so nothing flashes while a page assembles. Opening an app from
the home screen dims through dark into the app.

Switch it with **◐** on the home screen — it's per device. It lives in
`css/edge.css`, `js/theme-boot.js` and `js/fx.js`.

Animations play on every device by default, even when the computer's own
"reduce motion" setting is on. Anyone who prefers less movement can tap
**Motion: On** on the home screen to switch it to **Calm** (per device).

## Look & feel notes

- **Background:** every theme (Classic and Overdrive) uses the neon haze,
  grid floor and faint scanlines from `css/edge.css`.
- **Neo Message** keeps its own look in every theme, styled after an in-game
  messenger: charcoal gradient backdrop, a rounded dark window, pill-shaped
  thread rows that turn yellow when open, white incoming bubbles and
  colour-filled outgoing ones, plain bold type with no outlines.
- **New messages grow in** from the sender's side (Messages and NPC Studio).
  Opening a thread doesn't replay old ones.

## Group chats

Run `sql/groups.sql` once (it replaces the older `group-admin.sql`).

- **Group info** — tap the chat name at the top of a group: members with
  their numbers and when they joined, the group name and photo, **＋ Add
  people** (from your contacts) and **Leave group**.
- **System lines** — "robin added vale", "kestrel left", "robin renamed the
  group to …" appear as small centred notes. Changes you make as GM are
  worded without your name ("vale was added").
- **Reply / react / pin** — hover a message (or press and hold on a phone)
  for ↩ reply, ☺ react (👍 ❤️ 😂 😮 😢 ❗) and 📌 pin. The pinned message sits
  at the top of the chat; tap it to jump there, ✕ to unpin.
- **@mentions** — type @ in a group to pick a member; they get a
  "mentioned you" notification and see their name highlighted.
- **GM** — in Group info you can stop members adding people or changing the
  name/photo, and "Add or remove anyone" (also 👥 in the header, NeoAdmin →
  Members, and NPC Studio) adds or removes anyone, even in chats you're not in.
- **Deleting accounts** — NeoAdmin → Accounts → 🗑. Type the name to confirm.
  Their chat messages stay (as "Unknown"); everything else they owned goes.
  Admin accounts and your own can't be deleted.

## View as a player

See any page exactly as one player sees it — their contacts, mail,
calendar, grades, what they can and can't find — without signing out.

**One-time setup** (like the Discord function): in Supabase open
**Edge Functions → Deploy a new function → Via editor**, name it
`view-as`, paste in `supabase/functions/view-as/index.ts`, and deploy.
It needs no secrets. Leave "Verify JWT" on.

Then in **Admin → Accounts** press 👁 next to anyone. A new tab opens
signed in as them, with a "Viewing as … · read-only" bar on every page.

- It's a look only: nothing can be sent, saved, ticked, cleared or marked
  read, and they don't show as online. Things you try show "Preview only".
- Your own tabs stay signed in as you. **Exit** (or closing the tab) ends it.
- Only the GM account can open a preview, and never of another GM account.
  Their password and their own sign-ins aren't touched.

## Calendar: repeats and classes

Run `sql/calendar-repeat.sql`. Any entry can then repeat every day, every
week (pick the weekdays, e.g. Mon/Wed/Fri), every 2 weeks or every month,
until an optional end date. Opening one on a day gives **Skip** (just that
day) and **Delete all**.

Flight classes show up on each student's calendar by themselves: every
course they're enrolled in, on the days and times in its **Schedule**
field (e.g. `Mon/Wed 10:00–11:15`), from the active term's start date
(MyTime → GM → term) for the term's number of weeks. Fix a course's
schedule in Flight and every calendar follows. You see a player's classes
when you open their calendar.

## Backups

**Quick copy, any time:** Admin → **Download backup** saves every table
(messages, mail, sheets, grades, posts…) as one `.json` file on your
computer. It doesn't include passwords or the uploaded images themselves.

**Nightly full backup (recommended):** a GitHub Action copies the whole
database every night, locks it with a password, and keeps each night's copy
for 30 days. Set up once:

1. In Supabase, press **Connect** (top of the dashboard) and copy the
   **Session pooler** connection string. Put your database password in
   place of `[YOUR-PASSWORD]`. (Forgot it? Project Settings → Database →
   Reset database password. If the password has symbols like `@` `#` `/`,
   reset it to letters and numbers only.)
2. In GitHub: this repo → **Settings → Secrets and variables → Actions →
   New repository secret**. Add two:
   - `SUPABASE_DB_URL` — the connection string from step 1
   - `BACKUP_PASSPHRASE` — a long password you make up. **Write it down
     somewhere safe**; without it the backups can't be opened.
3. Repo → **Actions → Nightly backup → Run workflow** to make the first
   one now and check it goes green.

To get one: Actions → Nightly backup → pick a night → download the file at
the bottom. It's a `.7z`; open it with 7-Zip (Windows) or Keka / The
Unarchiver (Mac) and type the passphrase. The repo is public, so the
password is what keeps the copy private.

**Restoring** (into the same project after a mistake, or a brand-new one):
in the SQL Editor run the files from the backup in order —
`1-accounts.sql`, `2-public.sql`, `3-account-hooks.sql`,
`4-live-updates.sql`. A brand-new project takes them as they are. To
restore over the same project, the existing tables have to be emptied
first, so get help with that step rather than running the files over live
data.
`5-uploaded-files.txt` lists the uploaded files; the files themselves live
in Supabase Storage and aren't part of the backup.

## MyTime: judging free time rolls, and the shop

Run `sql/mytime-judge-shop.sql`.

- **Free time rolls wait for you.** A 1-point roll no longer fills boxes by
  itself. It shows up in **MyTime → GM → Rolls to judge** (and you get a
  notification) with buttons for +2 boxes, +1 box or no boxes and a
  Complication tick. The buttons start on what the dice suggest; the call is
  yours. You can change a decision later from the player's Free Time page.
  Players can spend a Benny to reroll until you've decided.
- **The shop** is a new tab on the transcript. Offer upgrades (a trait or
  skill increase, an edge, anything) to everyone or to one character, with an
  optional cost. Players pick one (saying which trait, if it's an increase);
  you're notified, update their sheet with ✎ Edit sheet, then press ✓ Done
  (or Decline), and they're told.
