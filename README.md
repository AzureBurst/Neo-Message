# Neo Message

A mock texting app for tabletop play. Players sign up with a username and a
made-up phone number, add each other by that number, and text in something
that looks and behaves like a phone. The GM can read every thread and export
the whole campaign's transcript.

- Accounts with username, password, and a fake number
- Profile icons
- Add contacts by number
- One-to-one and group threads
- Image attachments and emoji
- Messages arrive live, no refreshing
- Admin console: every message, filterable, exportable as CSV / JSON / a
  readable transcript

---

## The one thing to know before you start

GitHub Pages serves files. It can't run a database, so it can't by itself
store accounts or pass messages between people. It hosts the *frontend*.

**Supabase** handles the rest — accounts, messages, image storage, live
delivery. Its free tier covers a gaming group with room to spare, and no
card is required.

So: your code lives on GitHub, the site is served by GitHub Pages, and the
data lives in Supabase. Total cost is zero.

---

## Setup

Budget about twenty minutes. Steps 1–3 are the real work; the rest is quick.

### 1. Make a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Pick any database password and save it somewhere — you won't need it for
   this app, but you'll want it if you ever connect directly.
3. Wait for the project to finish provisioning, usually a minute or two.

### 2. Build the database

1. In your project, open **SQL Editor** in the left sidebar.
2. Open `sql/schema.sql` from this repo, copy the whole file.
3. Paste it into the editor and click **Run**.

You should see a success message. This creates the tables, the security
rules, the storage buckets, and the functions the app calls. Re-running it
later is safe.

Then run the feature files the same way — each is a separate paste-and-run,
and order among them does not matter as long as `schema.sql` went first:

- `sql/story-clock.sql` — the GM's story clock
- `sql/bubble-colors.sql` — per-player bubble colours
- `sql/admin-delete.sql` — deleting and clearing threads
- `sql/instagrat.sql` — the Instagrat photo app

If messages ever only appear after a refresh, run `sql/realtime-check.sql`
too; it diagnoses and repairs realtime delivery.

### 3. Turn off email confirmation

Players sign in with usernames, not real email addresses, so there's no
inbox for a confirmation link to land in.

Go to **Authentication → Sign In / Providers → Email** and switch
**Confirm email** off.

> Under the hood, a username becomes `username@neo.local` so Supabase's
> auth system has something in the shape it expects. Players never see it.

### 4. Add your keys

Go to **Project Settings → API** and copy two values into `js/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Use the **anon / public** key. It's meant to be public and it's fine in a
GitHub repo — what protects your data is the row level security from step 2.

**Never put the `service_role` key in this file.** That key ignores all
security rules. It belongs on a server, never in a browser.

### 5. Put it on GitHub Pages

```bash
git init
git add .
git commit -m "Neo Message"
git branch -M main
git remote add origin https://github.com/YOURNAME/neo-message.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch**,
pick `main` and `/ (root)`, and save.

A minute later you're live at
`https://YOURNAME.github.io/neo-message/`.

### 6. Make yourself the admin

Sign up in the app first so your account exists. Then back in the Supabase
SQL Editor:

```sql
update public.profiles set is_admin = true where username = 'yourname';
```

Refresh the app. A ◉ button appears in the header — that's the admin console.

---

## Running it locally

ES modules need a real server; opening `index.html` from your file system
won't work. From the project folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

---

## Using it at the table

**Adding contacts.** Everyone signs up and picks a number. Read them out, or
put them on an index card. Players tap ☰, type a number, and that person is
in their contacts.

**Starting threads.** ✎ opens the picker. One person and no group name gives
a normal thread. Two or more, or any group name, makes a group chat.

**In-fiction numbers.** The "Roll one" button on signup generates a random
555 number, but anything works. Give NPCs memorable ones — a fixer at
`(555) 000-0001` is easier to remember than a random string.

**NPCs.** Make an account per NPC and sign in on a second browser profile or
a phone. Keeping one browser signed in as the NPC and another as your own
character makes switching fast.

---

## The admin console

Everything, in one table, ordered by time.

- Filter by text, thread, sender, or date range
- Click any image to view it full size
- An accounts table with per-player message counts

Three export formats:

| Format | Good for |
|---|---|
| **CSV** | Spreadsheets, sorting, session notes |
| **JSON** | Archiving, feeding into other tools |
| **Transcript** | Reading. Grouped by thread, dated, printable |

Exports respect whatever filters are active, so you can pull just one
thread, or just one session's date range.

The table itself draws the 600 most recent matches to stay responsive.
Downloads always contain the full filtered set.

---

## About privacy at your table

Players can see that the GM reads everything — there's a note on the sign-in
screen saying so. That's deliberate. A prop that quietly logged private
conversations would be a different and worse thing, and someone would
eventually find out and feel bad about it.

Two things worth saying out loud at session zero:

- **Passwords.** Tell everyone to use something they don't use anywhere
  else. This is a hobby project, not a bank.
- **Keep it in character.** The transparency note covers you, but saying it
  in person lands better.

---

## Repo layout

```
neo-message/
├── index.html          sign in / sign up
├── app.html            the messenger
├── admin.html          admin console
├── css/neo.css         all styling, colors at the top
├── js/
│   ├── config.js       your keys — the only file you must edit
│   ├── supa.js         shared client and helpers
│   ├── auth.js         sign in / sign up
│   ├── app.js          messenger
│   └── admin.js        admin console
├── sql/schema.sql      run once in Supabase
└── assets/             your graphics (see assets/README.md)
```

No build step and no dependencies to install. Supabase's client library
loads from a CDN. Edit a file, push, and Pages updates.

---

## When something goes wrong

**"Add your Supabase keys"** — `js/config.js` still has the placeholders.

**Signup fails with a database error** — `sql/schema.sql` hasn't been run, or
only partly ran. Run the whole file again.

**Signup succeeds but sign-in fails** — email confirmation is still on. See
step 3.

**Messages don't arrive live** — check **Database → Replication** in Supabase
and confirm `messages` is in the `supabase_realtime` publication. The schema
adds it, but it's worth verifying. Messages still save and appear on reload
either way.

**Images won't upload** — confirm the `avatars` and `attachments` buckets
exist under **Storage** and are marked public.

**Admin console is empty** — the account isn't flagged. Run the `update`
from step 6, then refresh.

**Blank page** — open the browser console. A red error naming a file usually
points straight at the problem.

---

## Ideas if you want to extend it

- Read receipts — add a `read_at` column to `messages`
- Typing indicators — Supabase broadcast channels handle this
- Voicemail — attach audio the same way images work now
- Message deletion — the delete policy already exists, it just needs a button
- Scheduled messages — a `send_at` column plus a scheduled function

---

## NPC puppets

The GM can run side characters without juggling browser profiles. Sign in
as yourself, then click the **◑** button in the sidebar.

**Create** a puppet by giving it a name and a number. That makes a real
account — it can be added as a contact, texted, and added to group threads
exactly like a player.

**Become** signs you in as that puppet and reloads. An amber bar appears
across the top of the screen so you never forget who you are typing as.
**Back to me** returns you to your own account without retyping your
password.

Messages sent while puppeting genuinely come from that account, so they
look right on every player's screen and they land in the admin log
attributed correctly.

### Where the passwords live

Puppet passwords are generated at random and stored in your browser's
localStorage, on your machine only. The roster shows them so you can write
down any you want to keep.

If you clear site data, the roster disappears but the accounts remain. Reset
one from the Supabase SQL Editor:

```sql
update auth.users
set encrypted_password = crypt('newpassword', gen_salt('bf'))
where email = 'dispatch@neo.local';
```

Match the domain to your `AUTH_DOMAIN` in `js/config.js`.

### Notes

- Supabase rate-limits signups on the free tier, so make puppets ahead of
  the session rather than a dozen in a row mid-scene.
- Puppets have no admin rights and cannot reach the admin console.
- The **✕** next to a puppet removes it from your local list only. To delete
  the account itself, use **Authentication → Users** in Supabase.

---

## Story clock

The GM can pin the app to a date and time inside your story. Click the
**◔** button in the sidebar, pick a moment, tick **Freeze**, and apply.

Every player's status bar switches to that date and time and stops
advancing. Untick Freeze and everything returns to real time.

The setting lives in the database rather than in one browser, so it
reaches everyone at the table, and changes arrive live — nobody has to
reload.

**Setup:** run `sql/story-clock.sql` once in the Supabase SQL Editor.
It creates the `app_settings` table, the `set_story_clock` function, and
the security rules that let players read the clock but only admins set
it. The admin check runs on the server, so it cannot be bypassed from a
browser console.

Note that this changes the clock in the status bar. Timestamps on
individual messages still record when they were really sent, because
those come from the database and are what your admin log exports.

## Look and feel

- **Chat typeface** is Inpin HongMengTi. Drop the font file into
  `assets/fonts/` — see the README in that folder for the exact filename.
  Without it the app falls back to HarmonyOS Sans SC and friends.
- **Backdrop** is `assets/backdrop.png` at 20% opacity behind everything.
  Swap that file for any other artwork; adjust `opacity` in the
  `body::before` rule in `css/neo.css`.
- **Palette** is monochrome, black through gray. All of it comes from the
  variables at the top of `css/neo.css`. If you want colour back, change
  `--sent` and set `--on-sent` to `#fff`.

---

## Who is talking, and in what colour

Each block of messages is headed by the sender's icon and name. A run of
six texts from one person gets one heading rather than six — the heading
reappears whenever the speaker changes or after a five-minute gap.

**Your own messages** appear in your chosen colour with white text.
**Everyone else's** appear in a white bubble with grey text, and their
name above it is tinted in their colour. Colour in a thread therefore
only ever means one thing: who is speaking. It never has to compete with
the message for attention, which is what keeps a busy group thread
readable.

### Picking a colour

Click your name at the top of the sidebar and choose one of eight
swatches. It saves immediately.

The choice lives on your profile in the database, not in your browser,
so everyone in a group thread sees you in the same colour — and it
follows you to any device you sign in on.

**Setup:** run `sql/bubble-colors.sql` once in the Supabase SQL Editor.
It adds the `bubble_color` column and a constraint limiting it to the
eight presets.

### Adding your own colours

Three files have to agree:

1. `css/neo.css` — add a `[data-tint="name"]` rule with `--tint` and a
   darker `--tint-d`
2. `js/app.js` — add the pair to the `TINTS` array
3. `sql/bubble-colors.sql` — add the name to the check constraint, then
   re-run that statement

---

## Sounds

A short two-note tone plays when your message goes out. It is generated
in the browser, so there is no audio file to host and nothing extra to
upload.

To use your own instead, drop `sent.mp3` into `assets/sfx/` and it takes
over. See that folder's README.

The 🔊 button in the sidebar mutes it. That is a per-browser setting, so
muting yours does not mute anyone else at the table.

Browsers block audio until the page has been interacted with, which
never bites here — you cannot send a message without typing or clicking
first.

## Finding people by username

The contacts panel now searches. Type two or more letters of a username
and matching accounts appear with their icon and number; click one to
add them. Paste a number instead and it still works exactly as before —
the field decides which you meant by whether you typed digits.

This needs no database changes. Profiles have always been readable by
anyone signed in, which is what made adding by number possible in the
first place.

Usernames are searched loosely, so `haz` finds `Hazel`.

## Tapping images

Images in the stream open full size on a tap or click, dimming the app
behind them. Click anywhere or press Escape to close.

This was in from the start but a backdrop layering rule I added later
was covering it up. Fixed.

---

## Receive sound

A message arriving now plays a tone too. Sending rises in pitch,
receiving falls — opposite shapes are much easier to tell apart mid
scene than two tones at different pitches, so you know without looking
whether that was you or them. Incoming is also slightly quieter, since
it arrives unbidden.

Your own messages do not double up: realtime echoes your insert straight
back to you, and that echo is filtered out.

Both tones are synthesised. Drop `sent.mp3` or `received.mp3` into
`assets/sfx/` to override either one. The 🔊 button mutes both.

## Deleting threads

The admin console has a **Threads** table listing every conversation
with its participants, message count, and last activity.

- **Clear** empties a thread but leaves it in place, so the same group
  can keep talking. Useful when a scene ends.
- **Delete** removes the thread, its messages, and its membership
  entirely.

Both ask for confirmation first, and both are permanent. Download a
transcript before you delete anything you might want later — that is
what the export buttons are for.

If a player has the thread open when you delete it, it disappears from
their screen and they get a short notice. No reload needed.

**Setup:** run `sql/admin-delete.sql` once in the Supabase SQL Editor.
The admin check lives inside the database functions, so a player cannot
call them even by hand.

---

## When messages are slow to arrive

Symptom: messages only show up after a refresh.

That means realtime is not connected, and it is almost always one
missing line of SQL. Run `sql/realtime-check.sql` in the Supabase SQL
Editor. The first query lists which tables publish changes — if
`messages` is not in it, that is your answer, and the rest of the file
fixes it.

### The dot in the header

Next to the 🔊 button:

- **Green, steady** — realtime is connected, messages arrive instantly
- **Amber, pulsing** — the app has fallen back to polling every four
  seconds and everything still works, just a beat slower

Hover it for the same information in words.

### Why it still works either way

Two safety nets sit under realtime:

**Your own messages appear immediately.** They are drawn from the
insert's own response rather than waiting for the echo to come back
around, so sending never feels laggy regardless of connection quality.

**Everything else is polled.** Every four seconds while realtime is
down, every twenty-five as a backstop while it is up, and once
immediately whenever you switch back to the tab. The query only asks
for rows newer than the last one on your screen, so it stays cheap.

A session will run fine on polling alone. Fixing realtime just makes it
feel instant.

### About that received.mp3 404

Harmless, and expected. The app looks for an optional override file,
does not find one, and falls back to the tone it generates itself. You
can ignore it, or silence it by dropping a `received.mp3` into
`assets/sfx/`.

---

## Keeping the GM controls out of sight

The ◉ admin, ◔ clock and ◑ puppet buttons are built by JavaScript at
runtime and only when your account is flagged as an admin. They are not
in `app.html` at all, so a player who opens View Source finds an empty
`<span>` where they would be.

A player who types the admin URL directly is redirected back to the
messenger without seeing anything. There is no lockout screen — a
lockout screen announces that something worth being locked out of
exists, and the old one helpfully printed the SQL for granting
yourself admin, which was worse.

**If this bounces you**, your own account is not flagged yet. See "Make
yourself admin" above.

### What this is, and what it is not

This is concealment, not security, and the difference matters.

Anyone determined enough can read `js/app.js`, since a static site has
to hand the browser its own source. The real protection has never been
in the interface:

- Messages are readable only by members of that conversation, enforced
  by row level security in the database
- `admin_delete_conversation`, `admin_clear_conversation` and
  `set_story_clock` check admin status **inside** the database
- `guard_admin_flag` stops any account promoting itself through the app

Those hold regardless of what anyone types into a browser console. What
changed here is that the table is no longer tempted by a button they can
see but cannot press.

---

# Instagrat

A second app on the same phone: a photo feed that shares the Neo Message
login but gives everyone a separate identity, plus a GM approval queue
for every post.

## Setup

Run `sql/instagrat.sql` once in the Supabase SQL Editor, after
`schema.sql`. It creates the Instagrat tables, the moderation and follow
functions, the `ig_media` storage bucket, and all the row-level-security
policies. Idempotent, so it is safe to re-run.

That is the only setup. The app shares the keys already in
`js/config.js`.

## How it fits together

Signing in now lands on **home.html**, a phone home screen with two app
tiles. From either app the ⌂ button returns here. Drop square PNGs at
`assets/apps/message.png` and `assets/apps/instagrat.png` to replace the
placeholder glyphs — see `assets/apps/README.md`.

## Identity

First visit to Instagrat asks for a **screen name** (lowercase, unique)
and optional display name and bio. This is separate from the Neo Message
account: a player's phone number and messaging username never appear on
Instagrat. One login, two identities.

## Public and private

An account is public or private, set at sign-up and changeable under Edit
profile.

- **Public** — approved posts show in anyone's feed, and anyone can
  follow without asking.
- **Private** — posts are visible only to followers the account has
  accepted. A follow becomes a request the owner approves under the ♡
  activity tab.

This is enforced in the database, not just the interface. A private
account's posts are unreadable to a non-follower even if they go poking
at the API — the row-level-security policy checks the follow relationship
on every read.

## Posting and approval

Every post is held as **pending** until a GM reviews it. The author sees
their own pending post marked "Pending review"; nobody else sees it at
all. Approve or reject from the ⚑ tab, which is visible only to admins
and carries a badge with the queue count.

An approved post goes live for everyone allowed to see its author. A
rejected post stays visible only to its author, marked "Not approved",
so they know what happened.

The admin check for approving lives inside the database function, so it
holds regardless of the interface.

## Feed, likes, comments

The feed is approved posts from accounts you can see, newest first. Tap a
photo to open it full size. Like with the heart; comment in the box under
each post. Likes are optimistic — they respond instantly and settle with
the server.

## What is deliberately not here yet

- **Videos.** Images only for now, to stay inside the free storage tier.
  The composer and schema can take video later without restructuring.
- **A message unread badge.** The home screen shows Instagrat's pending
  count but not unread messages, because the messenger has no per-user
  read tracking yet. Adding it later is straightforward.

## Instagrat — GM tools

Run `sql/instagrat-admin.sql` once in the SQL Editor, after
`instagrat.sql`, to switch these on.

**Delete posts.** The ⋯ button on any post opens a manage sheet. An
admin can delete any post; a player sees the same button on their own
posts and can delete those. Deleting takes its likes and comments with
it.

**Fake follower counts.** On someone's profile the GM gets a "Set fake
followers" button. The number you set is padding shown on top of their
real followers. Crucially, tapping the follower count still lists only
the real accounts — the padding is a stored number, never a fake
account, so it can never masquerade as one. The sheet shows you the
resulting total as you type.

**Fake likes.** The ⋯ manage sheet lets an admin pad a post's like
count. Real likes still count and still move under the padding, so a
player liking a padded post sees the number tick up as expected.

**Ghost comments.** From ⋯ → "Add a comment as someone", an admin types
any name and drops a comment under it. The sheet stays open so you can
populate a thread quickly. The comment belongs to your account behind
the scenes for accountability, but shows under the made-up name.

### These are locked to the GM in the database

The padding columns sit on tables players can already write to — their
own profile, their own comments — so a policy alone would not stop
someone padding their own numbers. Triggers do: changing follower
padding, or posting a comment under a ghost name, is rejected for anyone
who is not an admin, no matter how the request is made. The like and
follower setters are admin-checked functions. None of it can be reached
from a player's browser.

## Instagrat — replies and emoji

Run `sql/instagrat-replies.sql` once in the SQL Editor (after
`instagrat.sql`) to enable threaded replies.

**Replies.** Every comment has a small Reply link. Tapping it aims the
comment box at that comment — the placeholder shows who you are
answering — and the reply appears indented beneath it. One level deep,
which keeps threads readable on a phone. Press Escape to cancel a reply
and go back to a plain comment. A reply is held to the same post as its
parent, enforced in the database.

**Emoji.** The ☺ button sits in every comment box and in the post
caption. It opens the same picker the messenger uses — the emoji list is
now shared between both apps, so anything you add in one shows in the
other. Emoji drop in at the cursor.

Admins posting ghost comments can reply as a ghost too; the reply lands
under the comment being answered.

## Home screen — app open animation

Tapping an app no longer jumps straight there. The icon grows outward to
fill the screen the way a phone opens an app, then the app loads as the
zoom finishes. It carries the icon's own artwork into the zoom, so a
custom PNG animates as itself.

Anyone whose device is set to reduce motion gets the plain instant jump
instead, and holding Cmd/Ctrl to open in a new tab still works normally.

## Instagrat — GM replies as dummy accounts

Each comment shows a GM-only "Reply as…" link beside the normal Reply.
It opens a sheet where you type any name and drop a reply under it,
nested beneath the comment you answered.

Names you use are remembered in this browser and appear as one-tap chips
at the top of the sheet, so the same made-up account — "hazel_irl",
"blocked_number", whoever — can answer consistently across different
posts and threads without retyping. The list holds your twelve most
recent and lives only on your machine.

Every one of these still belongs to your admin account behind the scenes
for accountability; the made-up name is only what other players see.

## Fix — emoji popup on desktop

The emoji picker now floats in a layer of its own anchored to the ☺
button, rather than living inside the post card. The card's rounded
corners clip anything overflowing it, which is why the popup showed on
tall phone cards but was cut off on shorter desktop ones. It now opens
the same way on both, flipping above or below the button depending on
room.

## Instagrat — comment deletion, photo tags, post dates

Run `sql/instagrat-tags-date.sql` once in the SQL Editor, after
`instagrat.sql`, for the tags and dates. Comment deletion needs no new
SQL — the policy from `instagrat.sql` already covers it.

**Deleting comments.** Every comment shows a Delete link to the person
who wrote it, and to any admin. Deleting a comment takes its replies with
it. A player can only remove their own; the database enforces that, so
it holds even if someone goes around the interface. Ghost comments belong
to the GM, so only the GM can remove those.

**Tagging people on a photo.** When composing a post, after choosing a
photo a "Tag people" button appears. Tap a spot on the image, search a
screen name, and a marker drops there. On a posted photo the markers are
hidden until someone taps the image — the same reveal the real app uses —
and tapping a marker opens that person's profile. A small ⛶ badge hints
when a photo carries tags.

The post's author and admins can also add or change tags later, from the
⋯ manage menu. Only they can — the tag write rules are enforced in the
database.

**Post dates.** Each post shows the date it was made, taken from the GM's
story clock at the moment it was posted. So if you have frozen the app to
a date in your story, posts read as happening then, and they keep that
date afterwards even if you move the clock on. The date is stamped on the
server, so it is correct regardless of the poster's device. Posts made
before you installed this update are dated by when they were really
created.

### If posts show the real date instead of the app's date

Two things make a post use the story-clock date:

1. `sql/instagrat-tags-date.sql` has been run (it adds the date column).
2. The post is made while the story clock is frozen to a date.

The app now also sends the story date directly when you post — the same
date shown in the status bar — so a new post matches what you see up top
without relying on anything server-side.

Posts made **before** this update keep their real date. To move all
existing posts onto the currently set story date, run
`sql/instagrat-redate-existing.sql` once. It changes only the displayed
date, never the true timestamp.

## A code to join the table

The Create account page asks for a **Table code**. Only people who enter
it can make an account; signing in is unaffected, so existing players are
not bothered by it.

Set the code in `js/config.js`:

```js
export const SIGNUP_CODE = 'Pheonix7';
```

Change it there any time, or set it to an empty string to turn the gate
off and let anyone with the link sign up.

Because this is a static site, the browser has to be handed the code to
check it, so a determined person could read it in the page source. It
stops casual passers-by, not a motivated snoop — right for a private
table, but don't use a code you rely on elsewhere. For a harder lock you
would move the check to a server, which this project deliberately does
not run.

---

# Discord notifications

Players can be DM'd on Discord when they get a message in Neo Message.
Because a bot has to run somewhere and hold a secret token — which a
static site cannot do — the actual DMing happens in a small serverless
function on Supabase. Nothing needs to run on your own machine.

This is more setup than the rest of the app: about half an hour, most of
it clicking through the Discord and Supabase dashboards once. If nobody
fills in a Discord ID, none of it does anything, so it is entirely
optional.

## What the pieces are

1. A **Discord bot** you create, that can send DMs.
2. An **Edge Function** (`notify-discord`) that receives new messages and
   tells the bot who to DM.
3. A **database webhook** that calls the function whenever a message is
   sent.
4. A **Discord ID** each player pastes into their profile.

## Step 1 — make the bot

1. Go to https://discord.com/developers/applications → **New
   Application**. Name it whatever you like.
2. Open the **Bot** tab → **Add Bot**. Under **Token**, click **Reset
   Token** and copy it somewhere safe. This is the secret that lets the
   function send DMs — treat it like a password, never put it in the
   repo.
3. Invite the bot to a Discord server you share with your players.
   Under **OAuth2 → URL Generator**, tick **bot**, then open the
   generated URL and add it to your server. The bot needs no special
   permissions to DM.

**Important Discord quirk:** a bot can only DM someone who shares a
server with it *and* allows DMs from server members. Have your players
join that server, and make sure their **Server Settings → Privacy →
Direct Messages** is on for it.

## Step 2 — run the SQL

Run `sql/discord.sql` in the SQL Editor. It adds the `discord_id` field
and the throttle table.

## Step 3 — deploy the function

Easiest is the dashboard: **Edge Functions** → **Create a function** →
name it exactly `notify-discord`, paste the contents of
`supabase/functions/notify-discord/index.ts`, and deploy. Then turn
**off** "Verify JWT" for this function — the webhook authenticates with
our own shared secret instead.

(If you use the Supabase CLI, `supabase functions deploy notify-discord
--no-verify-jwt` does the same.)

Then add the function's **secrets** (Edge Functions → Manage secrets):

- `DISCORD_BOT_TOKEN` — the token from step 1
- `NEO_WEBHOOK_SECRET` — any long random string you invent
- `NEO_APP_URL` — your site's address, e.g.
  `https://yourname.github.io/neo-message/` (optional; it becomes a link
  in the DM)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there — you do
not add those.

## Step 4 — fire it on new messages

**Database** → **Webhooks** → **Create a new hook**:

- Table: `messages`, event: **Insert**
- Type: **HTTP Request**, method **POST**
- URL: your function's URL (shown on its page, ends in
  `/functions/v1/notify-discord`)
- Add an HTTP header **`x-neo-secret`** set to the exact same string you
  used for `NEO_WEBHOOK_SECRET`.

That header is what stops anyone else from poking the function.

## Step 5 — players link themselves

Each player opens their profile (their name in the sidebar) and pastes
their **Discord user ID** into the Discord field. To find it: Discord →
**Settings → Advanced → Developer Mode** on, then right-click their own
name → **Copy User ID**. Blank turns notifications back off.

## What a notification says

"📱 New message from **Jax** in Neo Message" plus your site link — never
the message text, since threads can be private. If you would rather
include a preview, there is one clearly marked line in the function to
change.

To keep a lively back-and-forth from becoming a stream of pings, each
person gets at most one DM per thread every couple of minutes. That
interval is one constant at the top of the function.

## Limits worth knowing

- The bot can only reach players who share its server and allow DMs.
  Someone who never gets notified almost always has DMs closed for that
  server.
- This covers Neo Message texts. Instagrat could be wired the same way
  later — a webhook on `ig_posts` or `ig_comments` into a similar
  function — but that is not built yet.

## A note on privacy of the Discord ID

Profiles are readable by anyone signed in — that is what lets players
look each other up by name and number — so in principle another player
could read your stored Discord ID through the API. A Discord user ID is
not especially sensitive (it does not let anyone DM you unless they share
a server and you allow it), and for a private table this is usually fine.

If you would rather it never be visible to other players, the tidy fix is
to move `discord_id` into its own table that only each owner and the
service role can read. Say the word and I will write that migration; I
kept it on the profile here to keep the setup to a single simple column.

## Not pinging people who are already on the site

Run `sql/presence.sql` once in the SQL Editor (after `discord.sql`), and
redeploy the `notify-discord` function with the updated code.

While a player has the app open and in the foreground, it quietly checks
in about once a minute. The notifier then skips anyone seen in the last
two minutes — no point buzzing a phone about a message on the screen in
front of them.

It is best-effort on purpose. A locked phone or a tab pushed to the
background stops checking in, so within a couple of minutes that person
counts as away and can be pinged again — which is the behaviour you want.

This sits on top of the existing per-thread throttle: active players are
skipped by presence, and even away players never get more than one DM per
thread every couple of minutes. Both windows are single constants at the
top of the function (`ACTIVE_MS`, `THROTTLE_MS`) if you want to tune them.

---

# Calendar

A third app, keyed to your story. "Today" is whatever the GM's story
clock says — freeze the clock to Oct 20 and the calendar opens on
October with the 20th marked. The home-screen icon shows that same story
date, like a real phone's calendar.

## Setup

Run `sql/calendar.sql` once in the SQL Editor, after `schema.sql`. It
creates the events table and its rules. The app shares the existing keys.

## What players can do

- Add **events** and **reminders** to their own calendar. These are
  private — only the person who made one can see it.
- Each entry has a title, a date, optional time (or all-day), optional
  notes, and can span several days.
- Reminders show with a 🔔 and are otherwise the same as events.

## What the GM can do

- Everything a player can, plus a **GM event** — tick "everyone can see
  this" when adding one. GM events appear on every player's calendar in
  the network's amber, tagged **GM**, so they stand apart from personal
  entries (which are blue).
- Edit or delete anyone's entry.

Only an admin can make an event public; the database enforces it, so a
player cannot post a table-wide event even by going around the app.

## Using it

The month view keys to the story date. Move between months with the
arrows, jump back with **Today**, tap a day to see and add its entries,
tap ＋ or **Add** for a new one. GM events appear the moment they are
posted, no reload needed, and if you move the story clock the calendar
follows.

Dates are ordinary dates you pick — the story framing is just that
"today" points at your story's date rather than the real one.

## Lock screen

The home screen opens behind a phone-style lock: the story-clock time and
date over the wallpaper, with "swipe up to unlock." Swipe up to get in —
or tap it, or press Enter / ↑ if you're on a keyboard.

It shows once per browser session, so hopping between an app and the home
screen doesn't make you unlock every time. Opening the site fresh, or in
a new tab, locks again — like waking a phone. The clock on it is the
story clock, so it reads whatever date your table is set to.

## Polish — motion and a friendlier lock

**Motion.** Menus, modals and sheets now rise into place, app views slide
up as you switch between them, opening a conversation on a phone slides
the thread in from the side, and buttons and list rows dip slightly when
pressed. The like heart pops when you tap it. All of it is subtle and all
of it switches off automatically for anyone whose device is set to reduce
motion.

**Lock screen.** A tap (or Enter / ↑) unlocks — no dragging. The lock
still slides up off the top when it opens, so the swipe animation plays;
it just triggers on a tap.

**App close animation.** Coming back to the home screen from an app, that
app shrinks back down into its icon — the open animation in reverse — so
the home button closes the loop instead of cutting straight to the grid.

**Lock screen, smarter about when it shows.** It appears when you sign in
and when you refresh the home screen — the moments that feel like waking
the phone — but not when you come back to the home screen from inside an
app. Wandering between Messages, Instagrat and the calendar no longer
makes you unlock each time.
