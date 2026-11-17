// =====================================================================
//  GM Desk — everything waiting on the GM, in one place, plus a setup
//  check that tests each feature against the database and names the
//  SQL file to run when one is missing (sql/gm-tools.sql).
// =====================================================================

import {
  supa, setClockSource, requireProfile, ungate, mountCarrier, esc, toast, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');
await loadClock();
setClockSource(storyNow);
if (!me.is_admin) { location.replace('app.html'); throw new Error('not admin'); }

ungate();
mountCarrier($('#carrier'), { admin: true, label: 'GM DESK' });
$('#backApp').addEventListener('click', () => location.href = 'app.html');
$('#toAdmin').addEventListener('click', () => location.href = 'admin.html');
$('#refresh').addEventListener('click', () => { paintDesk(); paintSetup(); });

/* ------------------------------------------------------------------ */
/*  Names                                                              */
/* ------------------------------------------------------------------ */

const names = new Map();
async function loadNames() {
  const { data } = await supa.from('profiles').select('id, username');
  (data || []).forEach(p => names.set(p.id, p.username));
}
const who = id => names.get(id) || 'Someone';
const ago = iso => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());

/* ------------------------------------------------------------------ */
/*  The queues                                                         */
/*  Each returns { items: [{ text, sub, href, at }] } or { missing }.  */
/* ------------------------------------------------------------------ */

const QUEUES = [
  {
    key: 'weeks', icon: '🗓', title: 'Free time weeks to review', href: 'mytime.html#gm', file: 'mytime.sql',
    async load() {
      const { data, error } = await supa.from('ft_weeks').select('id, user_id, week, created_at').eq('status', 'submitted').order('created_at');
      if (error) return { missing: true };
      return { items: data.map(w => ({ text: who(w.user_id), sub: `Week ${w.week}`, at: w.created_at, href: `mytime.html#freetime/${w.user_id}` })) };
    }
  },
  {
    key: 'judge', icon: '🎲', title: 'Free time rolls to judge', href: 'mytime.html#gm', file: 'mytime-judge-shop.sql',
    async load() {
      const { data, error } = await supa.from('ft_entries').select('id, user_id, track, created_at').eq('status', 'judging').order('created_at');
      if (error) return { missing: true };
      return { items: data.map(e => ({ text: who(e.user_id), sub: cap(e.track), at: e.created_at, href: 'mytime.html#gm' })) };
    }
  },
  {
    key: 'verdicts', icon: '⚖️', title: 'Requested rolls to call', href: 'app.html', file: 'dice-v2.sql',
    async load() {
      const { data, error } = await supa.from('sw_rolls')
        .select('id, user_id, label, best_total, context_kind, context_id, rerolled_from, created_at')
        .is('verdict', null).not('request_id', 'is', null).eq('pending', false)
        .order('created_at', { ascending: false }).limit(80);
      if (error) return { missing: true };
      // Only the latest roll of a reroll chain needs a call.
      const replaced = new Set(data.map(r => r.rerolled_from).filter(Boolean));
      return { items: data.filter(r => !replaced.has(r.id) && r.context_kind !== 'freetime').map(r => ({
        text: who(r.user_id), sub: `${r.label} · ${r.best_total}`, at: r.created_at,
        href: r.context_kind === 'message' && r.context_id ? `app.html?c=${r.context_id}` : 'app.html' })) };
    }
  },
  {
    key: 'shop', icon: '🛍', title: 'Shop picks', href: 'mytime.html#gm', file: 'mytime-judge-shop.sql',
    async load() {
      const { data, error } = await supa.from('mt_shop_requests').select('id, user_id, item_name, choice, created_at').eq('status', 'requested').order('created_at');
      if (error) return { missing: true };
      return { items: data.map(q => ({ text: who(q.user_id), sub: q.item_name + (q.choice ? ` (${q.choice})` : ''), at: q.created_at, href: `mytime.html#transcript/${q.user_id}` })) };
    }
  },
  {
    key: 'npcmail', icon: '✉️', title: 'Emails waiting for a reply', href: 'mail.html', file: 'mail.sql',
    async load() {
      // Old one-to-one threads you own, and your own copies of newer
      // conversations where someone else wrote last.
      const [old, mine] = await Promise.all([
        supa.from('mail_threads').select('id, recipient_id, subject, sender_name, last_at, conv_id')
          .eq('owner_admin_id', me.id).eq('last_from_recipient', true).order('last_at'),
        supa.from('mail_threads').select('id, subject, last_from_name, last_at, conv_id')
          .eq('recipient_id', me.id).eq('last_from_recipient', false).not('conv_id', 'is', null).order('last_at')
      ]);
      if (old.error) return { missing: true };
      const a = (old.data || []).filter(t => !t.conv_id).map(t => ({ text: `${who(t.recipient_id)} → ${t.sender_name}`, sub: t.subject, at: t.last_at, href: `mail.html?t=${t.id}` }));
      const b = (mine.error ? [] : mine.data || []).map(t => ({ text: t.last_from_name || 'Someone', sub: t.subject, at: t.last_at, href: `mail.html?t=${t.id}` }));
      return { items: [...a, ...b].sort((x, y) => new Date(x.at) - new Date(y.at)) };
    }
  },
  {
    key: 'npcchat', icon: '🎭', title: 'Unread NPC chats', href: 'npcs.html', file: 'npc.sql',
    async load() {
      const { data, error } = await supa.rpc('npc_inbox');
      if (error) return { missing: true };
      return { items: (data || []).filter(c => c.unread > 0).map(c => ({
        text: c.title || (c.member_ids || []).filter(id => !(c.npc_ids || []).includes(id)).map(who).join(', ') || 'Chat',
        sub: `${c.unread} unread · as ${(c.npc_ids || []).map(who).join(', ')}`, at: c.last_at, href: `npcs.html?c=${c.conversation_id}` })) };
    }
  },
  {
    key: 'ig', icon: '📸', title: 'Instagrat posts to approve', href: 'instagrat.html?view=review', file: 'instagrat.sql',
    async load() {
      const { data, error } = await supa.from('ig_posts').select('id, author_id, caption, created_at').eq('status', 'pending').order('created_at');
      if (error) return { missing: true };
      return { items: data.map(p => ({ text: who(p.author_id), sub: (p.caption || 'Photo').slice(0, 60), at: p.created_at, href: 'instagrat.html?view=review' })) };
    }
  },
  {
    key: 'queree', icon: '🔎', title: 'Queree searches to answer', href: 'queree.html', file: 'queree.sql',
    async load() {
      const { data, error } = await supa.from('qr_searches').select('id, user_id, query, created_at').eq('status', 'pending').order('created_at');
      if (error) return { missing: true };
      return { items: data.map(s => ({ text: who(s.user_id), sub: `“${s.query}”`, at: s.created_at, href: 'queree.html' })) };
    }
  }
];

async function paintDesk() {
  const box = $('#desk');
  const results = await Promise.all(QUEUES.map(q => q.load().catch(() => ({ missing: true }))));
  let total = 0;
  box.innerHTML = QUEUES.map((q, i) => {
    const r = results[i];
    if (r.missing) return `
      <section class="desk-card off">
        <header><span class="desk-ic">${q.icon}</span><h3>${esc(q.title)}</h3><span class="desk-n">–</span></header>
        <p class="muted small">Not set up yet (${esc(q.file)}).</p>
      </section>`;
    const n = r.items.length; total += n;
    return `
      <section class="desk-card ${n ? 'has' : ''}">
        <header><span class="desk-ic">${q.icon}</span><h3>${esc(q.title)}</h3><span class="desk-n">${n}</span></header>
        ${n ? `<ul>${r.items.slice(0, 6).map(it => `
          <li><a href="${esc(it.href)}"><b>${esc(it.text)}</b><span>${esc(it.sub || '')}</span><time>${esc(ago(it.at))}</time></a></li>`).join('')}</ul>
          ${n > 6 ? `<a class="desk-more" href="${esc(q.href)}">+ ${n - 6} more</a>` : ''}`
        : '<p class="muted small">All clear.</p>'}
        <a class="desk-open" href="${esc(q.href)}">Open ›</a>
      </section>`;
  }).join('');
  $('#deskSummary').textContent = total ? `${total} thing${total === 1 ? '' : 's'} waiting on you.` : 'Nothing waiting on you. Nice.';
  document.title = total ? `(${total}) GM Desk` : 'Neo Message — GM Desk';
}

/* ------------------------------------------------------------------ */
/*  Setup check                                                        */
/*  Each feature names the SQL file that makes it, and how to tell it  */
/*  ran: a table, a column, a function, a trigger, text inside a       */
/*  function or a check rule, a realtime table, a storage rule, or a   */
/*  webhook on a table. sql/gm-tools.sql answers the questions.         */
/* ------------------------------------------------------------------ */

const T = (n) => ({ t: 'table', n }), C = (n) => ({ t: 'column', n }), F = (n) => ({ t: 'function', n }),
      TR = (n) => ({ t: 'trigger', n }), SRC = (n, has) => ({ t: 'source', n, has }),
      CHK = (n, has) => ({ t: 'check', n, has }), RT = (n) => ({ t: 'realtime', n }),
      POL = (n) => ({ t: 'policy', n }), HOOK = (n) => ({ t: 'webhook', n }), CAT = (n) => ({ t: 'category', n });

const SETUP = [
  ['Core', [
    ['Accounts, contacts and chats', 'schema.sql', [T('profiles'), T('conversations'), T('messages')]],
    ['Live updates for chats', 'realtime-check.sql', [RT('messages')]],
    ['Online status', 'presence.sql', [C('profiles.last_seen')]],
    ['Story clock', 'story-clock.sql', [T('app_settings'), F('set_story_clock')]],
    ['In-story timestamps', 'ic-time.sql', [C('messages.story_at'), F('set_story_at')]],
    ['Notifications', 'notifications.sql', [T('notifications')]],
    ['Notifications with pictures', 'notifications-v2.sql', [C('notifications.actor_avatar')]],
    ['Group chats, reactions, pins', 'groups.sql', [T('message_reactions'), C('messages.kind')]],
    ['Bubble colours', 'bubble-colors.sql', [C('profiles.bubble_color')]],
    ['Account categories', 'categories.sql', [T('account_categories'), C('profiles.category_id')]],
    ['Student groups', 'student-groups.sql', [CAT('group_a')]],
    ['Number-only characters', 'number-only.sql', [C('profiles.number_only')]],
    ['“Students can email” switch', 'open-email.sql', [C('profiles.email_open'), F('i_am_student')]],
    ['Uploads can’t be listed', 'storage-no-listing.sql', [POL('neo read own media')]],
  ]],
  ['GM tools', [
    ['Admin: delete / clear chats', 'admin-delete.sql', [F('admin_delete_conversation')]],
    ['Admin: rename players', 'admin-rename.sql', [F('admin_rename_user')]],
    ['NPC Studio', 'npc.sql', [T('npcs'), F('npc_inbox')]],
    ['NPCs listed as NPCs', 'npc-flag.sql', [F('is_gm_character')]],
    ['GM Desk, setup check, time editing', 'gm-tools.sql', [F('setup_probe'), F('gm_set_story_at')]],
  ]],
  ['Neomail', [
    ['Neomail', 'mail.sql', [T('mail_threads'), T('mail_messages')]],
    ['Player-to-player email', 'categories.sql', [C('mail_threads.peer_thread'), F('mail_compose')]],
    ['Email notifications', 'mail-notify.sql', [TR('trg_notif_mail'), SRC('notif_on_mail', 'peer_thread')]],
    ['@juniversity.edu addresses', 'mail-domain.sql', [SRC('mail_addr', 'juniversity.edu')]],
    ['Group email, Cc/Bcc, attachments, Sent & Bin', 'mail-v2.sql', [F('mail_send2'), C('mail_messages.attachments')]],
  ]],
  ['Flight', [
    ['Flight portal', 'flight.sql', [T('flight_courses'), T('flight_enrollments')]],
    ['B.S. in Field Heroics', 'flight-heroics.sql', [C('flight_courses.auto_enroll')]],
    ['Class summaries', 'flight-summaries.sql', [T('flight_summaries')]],
  ]],
  ['Calendar & Journal', [
    ['Calendar', 'calendar.sql', [T('calendar_events')]],
    ['GM-assigned events', 'calendar-assign.sql', [C('calendar_events.assigned_by')]],
    ['Repeating events', 'calendar-repeat.sql', [C('calendar_events.repeat')]],
    ['Journal', 'journal.sql', [T('journal_entries')]],
  ]],
  ['MyTime & dice', [
    ['MyTime', 'mytime.sql', [T('mt_profiles'), T('sw_sheets')]],
    ['Private transcript fields', 'mytime-private.sql', [C('mt_private.languages')]],
    ['Tap-to-ace dice, GM verdicts', 'dice-v2.sql', [C('sw_rolls.verdict'), F('sw_ace')]],
    ['Free time v2 (week, start date)', 'freetime-v2.sql', [C('ft_terms.start_date'), F('ft_gm_set_week')]],
    ['GM judges rolls, transcript shop', 'mytime-judge-shop.sql', [F('ft_judge'), T('mt_shop_items')]],
  ]],
  ['Instagrat', [
    ['Instagrat', 'instagrat.sql', [T('ig_posts'), T('ig_profiles')]],
    ['Tags and story dates', 'instagrat-tags-date.sql', [T('ig_post_tags'), C('ig_posts.story_at')]],
    ['Replies to comments', 'instagrat-replies.sql', [C('ig_comments.parent_id')]],
    ['Fake likes / followers', 'instagrat-admin.sql', [C('ig_posts.fake_likes')]],
    ['Change a post’s time', 'instagrat-post-time.sql', [F('ig_set_post_time')]],
  ]],
  ['Queree', [
    ['Queree', 'queree.sql', [T('qr_searches'), T('qr_pages')]],
    ['“No results” dead ends', 'queree-deadend.sql', [CHK('qr_results_kind_check', "'none'")]],
    ['AI overviews', 'queree-ai.sql', [CHK('qr_results_kind_check', "'ai'")]],
  ]],
  ['Discord', [
    ['Discord IDs', 'discord.sql', [C('profiles.discord_id')]],
    ['DMs for chat messages', 'webhook on messages', [HOOK('messages')]],
    ['DMs for emails & other events', 'webhook on notifications', [HOOK('notifications'), T('discord_notif_throttle')]],
    ['Channel for your updates', 'GM Desk → Discord channel', [{ t: 'setting', n: 'discord_channel' }]],
  ]],
];

async function paintSetup() {
  const box = $('#setup');
  const flat = SETUP.flatMap(([, rows]) => rows.flatMap(r => r[2]));
  const { data, error } = await supa.rpc('setup_probe', { p_checks: flat });
  if (error || !Array.isArray(data)) {
    box.innerHTML = `<div class="notice notice-info">Run <b>sql/gm-tools.sql</b> in the Supabase SQL Editor to switch the setup check on.</div>`;
    return;
  }
  let k = 0, missing = 0;
  box.innerHTML = SETUP.map(([group, rows]) => `
    <section class="setup-group"><h3>${esc(group)}</h3>
      ${rows.map(([name, file, probes]) => {
        const ok = probes.every(() => data[k++] === true);
        if (!ok) missing++;
        return `<div class="setup-row ${ok ? 'ok' : 'bad'}">
          <span class="setup-mark">${ok ? '✓' : '✗'}</span>
          <span class="setup-name">${esc(name)}</span>
          <code>${esc(file)}</code></div>`;
      }).join('')}
    </section>`).join('');
  box.insertAdjacentHTML('afterbegin', `<p class="setup-sum ${missing ? 'bad' : 'ok'}">${missing
    ? `${missing} feature${missing === 1 ? '' : 's'} need setting up.` : 'Everything is set up.'}</p>`);
}

/* ------------------------------------------------------------------ */
/*  Discord channel (supabase/functions/discord-post)                  */
/* ------------------------------------------------------------------ */

async function paintDiscord() {
  const box = $('#discord');
  const { data } = await supa.from('app_settings').select('value').eq('key', 'discord_channel').maybeSingle();
  const id = data?.value?.id || '';
  box.innerHTML = `
    <section class="desk-card dc-card">
      <header><span class="desk-ic">#</span><h3>Channel</h3></header>
      <div class="dc-row">
        <input id="dcChannel" class="mono" inputmode="numeric" placeholder="Channel ID, e.g. 1234567890123456789" value="${esc(id)}">
        <button class="btn btn-sm btn-primary" id="dcSave">Save</button>
        <button class="btn btn-sm btn-ghost" id="dcTest" ${id ? '' : 'disabled'}>Send a test</button>
      </div>
      <p class="muted small">In Discord: Settings → Advanced → Developer Mode on, then right-click the channel → Copy Channel ID.</p>
    </section>
    <section class="desk-card dc-card">
      <header><span class="desk-ic">🕓</span><h3>Story time</h3></header>
      <p class="small">Now: <b id="dcNow"></b></p>
      <div class="dc-row"><input id="dcClockNote" maxlength="300" placeholder="Optional note, e.g. Later that night…">
        <button class="btn btn-sm btn-primary" id="dcClock" ${id ? '' : 'disabled'}>Post</button></div>
    </section>
    <section class="desk-card dc-card dc-wide">
      <header><span class="desk-ic">📣</span><h3>Announcement</h3></header>
      <input id="dcTitle" maxlength="256" placeholder="Title">
      <textarea id="dcText" rows="3" maxlength="1800" placeholder="Message"></textarea>
      <div class="dc-row">
        <input id="dcImage" placeholder="Picture link (https://…, optional)">
        <input id="dcLink" placeholder="Link (https://…, optional)">
      </div>
      <div class="dc-row"><span class="grow"></span><button class="btn btn-sm btn-primary" id="dcAnnounce" ${id ? '' : 'disabled'}>Post announcement</button></div>
    </section>`;
  const { postToDiscord, whenLabel } = await import('./discord-post.js');
  $('#dcNow').textContent = whenLabel(storyNow());
  $('#dcSave').addEventListener('click', async () => {
    const v = $('#dcChannel').value.trim();
    if (v && !/^\d{15,22}$/.test(v)) return toast('That doesn’t look like a channel ID (it’s a long number).', 'error');
    const { error } = await supa.from('app_settings').upsert({ key: 'discord_channel', value: { id: v }, updated_at: new Date().toISOString() });
    if (error) return toast(error.message, 'error');
    toast(v ? 'Channel saved.' : 'Channel cleared.', 'ok'); paintDiscord();
  });
  const run = (btn, payload, after) => $(btn).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const ok = await postToDiscord(payload());
    e.currentTarget.disabled = false;
    if (ok) after?.();
  });
  run('#dcTest', () => ({ kind: 'test' }));
  run('#dcClock', () => ({ kind: 'clock', when: whenLabel(storyNow()), note: $('#dcClockNote').value }), () => { $('#dcClockNote').value = ''; });
  run('#dcAnnounce', () => ({ kind: 'announce', title: $('#dcTitle').value, note: $('#dcText').value,
    image: $('#dcImage').value.trim(), link: $('#dcLink').value.trim() }),
    () => ['#dcTitle', '#dcText', '#dcImage', '#dcLink'].forEach(s => { $(s).value = ''; }));
}

await loadNames();
paintDesk();
paintDiscord();
paintSetup();
// Keep it fresh while it's open.
setInterval(paintDesk, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) paintDesk(); });
