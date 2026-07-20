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
