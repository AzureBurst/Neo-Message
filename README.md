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

Run `sql/flight-heroics.sql` once, after `flight.sql`. It adds the five
core courses, enrols every student in them, and records everyone as a
B.S. in Field Heroics major:

| Code | Course | Credits |
|---|---|---|
| HERO 101 | Hero History | 3 |
| COMM 101 | Communications 101 | 3 |
| ETHL 110 | Intro to Heroic Ethics and Laws | 3 |
| RESC 101 | Rescue Training 101 | 3 |
| SPE 120 | Specialized Physical Education | 2 |

These are **required** courses: anyone who signs up later is enrolled in
all of them, and gets a student record with the major filled in, the
moment their account is created. Admin accounts are left out so the GM
isn't on the rosters.

Professors start as "Staff" and meeting times and rooms are blank — fill
them in from Admin → the course → Edit course. Tick **Required course**
on any other course to make it mandatory the same way.

Re-running the file never duplicates a course or an enrolment, and never
overwrites a course you've edited.
