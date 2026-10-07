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
