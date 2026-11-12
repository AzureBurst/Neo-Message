// =====================================================================
//  NEO MESSAGE — admin console
//
//  Everything here also depends on the database rules in schema.sql.
//  A player who opens this page directly gets an empty table, because
//  the row level security only returns other people's messages to
//  accounts flagged is_admin.
// =====================================================================

import {
  supa, setClockSource, requireProfile, ungate, mountCarrier, formatNumber, fullStamp,
  esc, toast, lightbox, downloadBlob, toCSV, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { loadCategories, categorySelect, setCategory, openCategoryManager } from './categories.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
/* A player who finds this URL is sent quietly back to the messenger.
   No lockout screen, because a lockout screen confirms there is
   something here worth being locked out of — and the old one printed
   the promotion SQL, which is worse. The page has not revealed itself
   at this point: the gate is still down, so nothing has painted.

   If you are the GM and this bounces you, your account is not flagged
   yet. See "Make yourself admin" in the README. */
if (!me.is_admin) {
  location.replace('app.html');
  throw new Error('not admin');
}

ungate();
mountCarrier($('#carrier'), { admin: true, label: 'NEO ADMIN' });

$('#backApp').addEventListener('click', () => location.href = 'app.html');
$('#refresh').addEventListener('click', () => loadAll());
$('#backupBtn').addEventListener('click', (e) => downloadBackup(e.currentTarget));

/* ------------------------------------------------------------------ */
/*  Backup: every table, as one JSON file on your computer.            */
/*  It's a safety copy of the game's data (messages, mail, sheets,      */
/*  grades…). It doesn't hold passwords or uploaded images; those stay  */
/*  in Supabase. The nightly backup (README → Backups) has everything. */
/* ------------------------------------------------------------------ */

const BACKUP_TABLES = [
  'profiles', 'account_categories', 'account_tags', 'app_settings', 'contacts',
  'conversations', 'conversation_members', 'messages', 'message_reactions',
  'npcs', 'npc_reads', 'notifications',
  'mail_threads', 'mail_messages', 'mail_state',
  'calendar_events', 'journal_entries',
  'ig_profiles', 'ig_posts', 'ig_comments', 'ig_likes', 'ig_follows', 'ig_post_tags',
  'flight_students', 'flight_courses', 'flight_enrollments', 'flight_assignments',
  'flight_grades', 'flight_progress', 'flight_announcements', 'flight_summaries',
  'mt_profiles', 'mt_private', 'mt_comments',
  'ft_terms', 'ft_weeks', 'ft_entries', 'ft_plans', 'ft_progress', 'ft_connections', 'ft_reputation',
  'sw_sheets', 'sw_rolls', 'sw_requests',
  'qr_searches', 'qr_results', 'qr_pages'
];

async function downloadBackup(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  const out = { made_at: new Date().toISOString(), site: location.origin, tables: {} };
  const skipped = [];
  try {
    for (const [i, t] of BACKUP_TABLES.entries()) {
      btn.textContent = `Backing up… ${i + 1}/${BACKUP_TABLES.length}`;
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supa.from(t).select('*').range(from, from + 999);
        if (error) { if (!rows.length) skipped.push(t); break; }
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      if (!skipped.includes(t)) out.tables[t] = rows;
    }
    const n = Object.values(out.tables).reduce((a, r) => a + r.length, 0);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`neo-backup-${stamp}.json`, JSON.stringify(out, null, 1), 'application/json');
    toast(`Backed up ${n.toLocaleString()} rows from ${Object.keys(out.tables).length} tables.`, 'ok');
  } catch (err) {
    toast(err.message || 'Backup failed.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

let log = [];      // every message, joined with names
let people = [];   // every profile
let cats = null;   // account categories (null until categories.sql is run)

/* ------------------------------------------------------------------ */
/*  load                                                              */
/* ------------------------------------------------------------------ */

let convos = new Map();

async function loadAll() {
  $('#rows').innerHTML =
    '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--dim)">Loading…</td></tr>';

  const [profRes, convRes, memRes, msgRes] = await Promise.all([
    supa.from('profiles').select('*').order('created_at'),
    supa.from('conversations').select('*'),
    supa.from('conversation_members').select('conversation_id, user_id'),
    supa.from('messages').select('*').order('created_at')
  ]);

  if (msgRes.error) {
    $('#adminAlert').innerHTML =
      `<div class="notice notice-error">Log could not load: ${esc(msgRes.error.message)}</div>`;
    return;
  }

  people = profRes.data ?? [];
  cats = await loadCategories();
  const nameOf = new Map(people.map(p => [p.id, p]));

  const membersOf = new Map();
  (memRes.data ?? []).forEach(m => {
    if (!membersOf.has(m.conversation_id)) membersOf.set(m.conversation_id, []);
    membersOf.get(m.conversation_id).push(m.user_id);
  });

  const convoLabel = new Map();
  (convRes.data ?? []).forEach(c => {
    const names = (membersOf.get(c.id) ?? [])
      .map(id => nameOf.get(id)?.username ?? '?')
      .sort();
    convoLabel.set(c.id, {
      label: c.title || names.join(' · ') || 'Empty thread',
      isGroup: c.is_group,
      people: names.join(', ')
    });
  });

  log = (msgRes.data ?? []).map(m => {
    const sender = nameOf.get(m.sender_id);
    const conv = convoLabel.get(m.conversation_id) ?? { label: 'Unknown', people: '' };
    return {
      id: m.id,
      at: m.created_at,
      convoId: m.conversation_id,
      convo: conv.label,
      isGroup: conv.isGroup,
      participants: conv.people,
      from: sender?.username ?? '[deleted account]',
      fromNumber: sender?.phone_number ?? '',
      body: m.body ?? '',
      image: m.image_url ?? ''
    };
  });

  convos = convoLabel;
  buildFilters(convoLabel);
  paintThreads();
  paintStats();
  paintUsers();
  render();
}

function paintThreads() {
  const body = $('#threadRows');
  const rows = [...convos.entries()].map(([id, v]) => {
    const mine = log.filter(l => l.convoId === id);
    return {
      id,
      label: v.label,
      people: v.people,
      count: mine.length,
      last: mine.length ? mine[mine.length - 1].at : null
    };
  }).sort((a, b) => new Date(b.last ?? 0) - new Date(a.last ?? 0));

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-cell">No threads yet.</td></tr>';
    paintBulk();
    return;
  }

  // Forget ticks for threads that no longer exist.
  for (const id of [...picked]) if (!convos.has(id)) picked.delete(id);

  body.innerHTML = rows.map(r => `
    <tr data-conv="${esc(r.id)}" class="${picked.has(r.id) ? 'is-picked' : ''}">
      <td><input type="checkbox" class="bulk-check" data-pick="${esc(r.id)}" ${picked.has(r.id) ? 'checked' : ''}
                 aria-label="Select ${esc(r.label)}"></td>
      <td><strong>${esc(r.label)}</strong></td>
      <td class="muted">${esc(r.people || '—')}</td>
      <td class="mono">${r.count}</td>
      <td class="mono">${r.last ? esc(fullStamp(r.last)) : '—'}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" data-members title="Add or remove anyone">Members</button>
        <button class="btn btn-ghost btn-sm" data-act="clear"
                ${r.count ? '' : 'disabled'}>Clear</button>
        <button class="btn btn-sm btn-danger" data-act="delete">Delete</button>
      </td>
    </tr>`).join('');

  $$('#threadRows [data-members]', document).forEach(btn => btn.addEventListener('click', async () => {
    const { openMembers } = await import('./members.js');
    if (await openMembers(btn.closest('tr').dataset.conv)) await loadAll();
  }));

  $$('#threadRows [data-act]', document).forEach(btn => {
    btn.addEventListener('click', async () => {
      const tr    = btn.closest('tr');
      const id    = tr.dataset.conv;
      const label = tr.querySelector('strong').textContent;
      const act   = btn.dataset.act;

      const question = act === 'delete'
        ? `Delete "${label}" and every message in it?\n\nThis cannot be undone.`
        : `Delete every message in "${label}" but keep the thread?\n\nThis cannot be undone.`;
      if (!confirm(question)) return;

      btn.disabled = true;
      const { data, error } = await supa.rpc(
        act === 'delete' ? 'admin_delete_conversation' : 'admin_clear_conversation',
        { conv: id });

      if (error) {
        alert(error.message);
        btn.disabled = false;
        return;
      }
      const n = data?.messages ?? 0;
      $('#adminAlert').innerHTML =
        `<div class="notice notice-ok">${
          act === 'delete'
            ? `Deleted "${esc(label)}" and ${n} message${n === 1 ? '' : 's'}.`
            : `Cleared ${n} message${n === 1 ? '' : 's'} from "${esc(label)}".`
        }</div>`;
      await loadAll();
    });
  });
  paintBulk();
}

/* ------------------------------------------------------------------ */
/*  several threads at once                                           */
/* ------------------------------------------------------------------ */

const picked = new Set();

function paintBulk() {
  const n = picked.size;
  const total = $$('#threadRows [data-pick]').length;
  $('#bulkBar').hidden = !n;
  $('#bulkCount').textContent = `${n} thread${n === 1 ? '' : 's'} selected`;
  const all = $('#bulkAll');
  all.checked = !!total && n === total;
  all.indeterminate = n > 0 && n < total;
  $$('#threadRows tr[data-conv]').forEach(tr => tr.classList.toggle('is-picked', picked.has(tr.dataset.conv)));
}

$('#threadRows').addEventListener('change', (e) => {
  const box = e.target.closest('[data-pick]');
  if (!box) return;
  box.checked ? picked.add(box.dataset.pick) : picked.delete(box.dataset.pick);
  paintBulk();
});
$('#bulkAll').addEventListener('change', (e) => {
  $$('#threadRows [data-pick]').forEach(b => {
    b.checked = e.target.checked;
    e.target.checked ? picked.add(b.dataset.pick) : picked.delete(b.dataset.pick);
  });
  paintBulk();
});
$('#bulkNone').addEventListener('click', () => { picked.clear(); $$('#threadRows [data-pick]').forEach(b => b.checked = false); paintBulk(); });

async function bulk(act) {
  const ids = [...picked];
  if (!ids.length) return;
  const names = ids.map(id => convos.get(id)?.label || 'thread');
  const list = names.slice(0, 8).map(n => `  • ${n}`).join('\n') + (names.length > 8 ? `\n  …and ${names.length - 8} more` : '');
  const question = act === 'delete'
    ? `Delete ${ids.length} thread${ids.length === 1 ? '' : 's'} and every message in them?\n\n${list}\n\nThis cannot be undone.`
    : `Delete every message in ${ids.length} thread${ids.length === 1 ? '' : 's'} but keep the threads?\n\n${list}\n\nThis cannot be undone.`;
  if (!confirm(question)) return;

  const buttons = $$('#bulkBar button');
  buttons.forEach(b => b.disabled = true);
  let done = 0, msgs = 0;
  const failed = [];
  for (const id of ids) {
    $('#bulkCount').textContent = `${act === 'delete' ? 'Deleting' : 'Clearing'} ${done + 1} of ${ids.length}…`;
    const { data, error } = await supa.rpc(
      act === 'delete' ? 'admin_delete_conversation' : 'admin_clear_conversation', { conv: id });
    if (error) failed.push(`${convos.get(id)?.label || id}: ${error.message}`);
    else { done += 1; msgs += data?.messages ?? 0; picked.delete(id); }
  }
  buttons.forEach(b => b.disabled = false);

  $('#adminAlert').innerHTML =
    `<div class="notice ${failed.length ? 'notice-error' : 'notice-ok'}">${
      act === 'delete'
        ? `Deleted ${done} thread${done === 1 ? '' : 's'} and ${msgs} message${msgs === 1 ? '' : 's'}.`
        : `Cleared ${msgs} message${msgs === 1 ? '' : 's'} from ${done} thread${done === 1 ? '' : 's'}.`
    }${failed.length ? `<br>Couldn't finish ${failed.length}: ${failed.map(esc).join('; ')}` : ''}</div>`;
  await loadAll();
}
$('#bulkDelete').addEventListener('click', () => bulk('delete'));
$('#bulkClear').addEventListener('click', () => bulk('clear'));

function buildFilters(convoLabel) {
  const cSel = $('#fConvo');
  const uSel = $('#fUser');
  const keepC = cSel.value, keepU = uSel.value;

  cSel.innerHTML = '<option value="">All threads</option>' +
    [...convoLabel.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([id, v]) => `<option value="${id}">${esc(v.label)}</option>`).join('');

  uSel.innerHTML = '<option value="">Everyone</option>' +
    people.slice().sort((a, b) => a.username.localeCompare(b.username))
      .map(p => `<option value="${esc(p.username)}">${esc(p.username)}</option>`).join('');

  cSel.value = keepC;
  uSel.value = keepU;
}

/* ------------------------------------------------------------------ */
/*  filter + render                                                   */
/* ------------------------------------------------------------------ */

function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const c = $('#fConvo').value;
  const u = $('#fUser').value;
  const from = $('#fFrom').value ? new Date($('#fFrom').value + 'T00:00:00') : null;
  const to   = $('#fTo').value   ? new Date($('#fTo').value   + 'T23:59:59') : null;

  return log.filter(r => {
    if (q && !r.body.toLowerCase().includes(q)) return false;
    if (c && r.convoId !== c) return false;
    if (u && r.from !== u) return false;
    const t = new Date(r.at);
    if (from && t < from) return false;
    if (to && t > to) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  const tbody = $('#rows');

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--dim)">Nothing matches these filters.</td></tr>';
    $('#countNote').textContent = `0 of ${log.length} messages.`;
    return;
  }

  // Cap what gets drawn so a long campaign doesn't stall the browser.
  // Exports always use the full filtered set.
  const CAP = 600;
  const shown = rows.slice(-CAP);

  tbody.innerHTML = shown.map(r => `
    <tr>
      <td class="t-time">${esc(fullStamp(r.at))}</td>
      <td>
        <div style="font-size:12.5px">${esc(r.convo)}</div>
        ${r.isGroup ? '<span class="pill group">group</span>' : ''}
      </td>
      <td class="t-who">
        ${esc(r.from)}<br>
        <span class="t-num" style="font-weight:400">${esc(formatNumber(r.fromNumber))}</span>
      </td>
      <td class="t-body">
        ${r.body ? esc(r.body) : '<span style="color:var(--dim)">— image only —</span>'}
        ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="Attached image" loading="lazy">` : ''}
      </td>
    </tr>`).join('');

  $$('.thumb', tbody).forEach(img =>
    img.addEventListener('click', () => lightbox(img.src)));

  $('#countNote').textContent =
    rows.length > CAP
      ? `Showing the ${CAP} most recent of ${rows.length} matching messages (${log.length} total). Downloads include all ${rows.length}.`
      : `${rows.length} of ${log.length} messages.`;
}

['#q', '#fConvo', '#fUser', '#fFrom', '#fTo'].forEach(sel =>
  $(sel).addEventListener('input', render));

$('#clearF').addEventListener('click', () => {
  ['#q', '#fConvo', '#fUser', '#fFrom', '#fTo'].forEach(s => $(s).value = '');
  render();
});

/* ------------------------------------------------------------------ */
/*  stats + accounts                                                  */
/* ------------------------------------------------------------------ */

function paintStats() {
  const withImages = log.filter(r => r.image).length;
  const threads = new Set(log.map(r => r.convoId)).size;
  const today = new Date().toDateString();
  const todayCount = log.filter(r => new Date(r.at).toDateString() === today).length;

  $('#stats').innerHTML = [
    ['Messages', log.length],
    ['Threads', threads],
    ['Accounts', people.length],
    ['Images', withImages],
    ['Sent today', todayCount]
  ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
}

function paintUsers() {
  const counts = new Map();
  log.forEach(r => counts.set(r.from, (counts.get(r.from) ?? 0) + 1));

  $('#userRows').innerHTML = people.map(p => `
    <tr data-user="${esc(p.id)}">
      <td class="t-who"><span class="acct-name">${esc(p.username)}</span></td>
      <td class="t-num">${esc(formatNumber(p.phone_number))}</td>
      <td class="t-time">${new Date(p.created_at).toLocaleDateString()}</td>
      <td class="t-num">${counts.get(p.username) ?? 0}</td>
      <td>${p.is_admin
        ? '<span class="pill admin">GM</span>'
        : cats ? categorySelect(cats.filter(c => c.key !== 'gm'), p.category_id, `class="cat-select" data-cat-for="${esc(p.id)}"`)
        : '<span class="pill">player</span>'}
        ${!p.is_admin && 'number_only' in p ? `<label class="num-only" title="Players can only add them by typing their number; they never show up in searches">
          <input type="checkbox" data-numonly="${esc(p.id)}" ${p.number_only ? 'checked' : ''}> Number only</label>` : ''}</td>
      <td class="row-actions">
        ${p.is_admin ? '' : `<button class="icon-btn" data-viewas="${esc(p.id)}" title="See the site as ${esc(p.username)} sees it (read-only)">👁</button>`}
        <button class="icon-btn" data-rename="${esc(p.id)}" title="Rename ${esc(p.username)}">✎</button>
        ${p.is_admin || p.id === me.id ? '' : `<button class="icon-btn danger-icon" data-delacct="${esc(p.id)}" title="Delete ${esc(p.username)}'s account">🗑</button>`}
      </td>
    </tr>`).join('');

  $$('[data-cat-for]').forEach(sel => sel.addEventListener('change', async () => {
    if (await setCategory(sel.dataset.catFor, sel.value)) {
      const p = people.find(x => x.id === sel.dataset.catFor);
      if (p) p.category_id = sel.value;
      toast(`${p?.username || 'Account'} is now in ${cats.find(c => c.id === sel.value)?.name}.`, 'ok');
    }
  }));
  $$('[data-numonly]').forEach(cb => cb.addEventListener('change', async () => {
    const { error } = await supa.from('profiles').update({ number_only: cb.checked }).eq('id', cb.dataset.numonly);
    if (error) { cb.checked = !cb.checked; return toast(/number_only/.test(error.message) ? 'Run sql/number-only.sql in Supabase first.' : error.message, 'error'); }
    const p = people.find(x => x.id === cb.dataset.numonly);
    if (p) p.number_only = cb.checked;
    toast(`${p?.username || 'They'} ${cb.checked ? 'can now only be added by number.' : 'show up in searches again.'}`, 'ok');
  }));
  $$('[data-rename]').forEach(b => b.addEventListener('click', () => startRename(b.dataset.rename)));
  $$('[data-viewas]').forEach(b => b.addEventListener('click', () => viewAs(b.dataset.viewas)));
  $$('[data-delacct]').forEach(b => b.addEventListener('click', () => deleteAccount(b.dataset.delacct)));
}

/* Opens a new tab showing the site as this player sees it, read-only
   (supabase/functions/view-as). Your own session isn't touched. */
export async function viewAs(id) {
  const tab = window.open('about:blank', '_blank');   // open now, before the await, so it isn't blocked
  const { data, error } = await supa.functions.invoke('view-as', { body: { target: id } });
  if (error || !data?.token_hash) {
    tab?.close();
    const status = error?.context?.status;
    let why = data?.error || '';
    try { why = (await error?.context?.json())?.error || why; } catch {}
    if (!why && (status === 404 || error?.name === 'FunctionsFetchError')) why = 'Deploy the view-as function in Supabase first (see the README).';
    return toast(why || error?.message || 'Something went wrong.', 'error');
  }
  const url = `home.html#viewas=${encodeURIComponent(data.token_hash)}&u=${encodeURIComponent(data.username)}`;
  if (tab) tab.location.href = url; else location.href = url;
}

/* Delete an account for good, after typing the name to confirm. */
async function deleteAccount(id) {
  const p = people.find(x => x.id === id);
  if (!p) return;
  const typed = prompt(
    `Delete ${p.username}'s account for good?\n\n` +
    `• They can no longer sign in.\n` +
    `• Their chat messages stay, shown as "Unknown".\n` +
    `• Their Instagrat posts, mail, journal, grades and everything else they own are deleted.\n\n` +
    `This can't be undone. Type ${p.username} to confirm.`);
  if (typed === null) return;
  if (typed.trim() !== p.username) return toast('Name didn\'t match — nothing was deleted.', 'error');
  const { error } = await supa.rpc('admin_delete_account', { target: id });
  if (error) {
    return toast(/admin_delete_account/.test(error.message)
      ? 'Deleting accounts needs sql/groups.sql — run it in Supabase.' : error.message, 'error');
  }
  $('#adminAlert').innerHTML = `<div class="notice notice-ok">Deleted ${esc(p.username)}'s account.</div>`;
  loadAll();
}

/* Rename in place: the name cell becomes a text box. The server checks
   the name and moves the player's sign-in to it in the same step. */
function startRename(id) {
  const p = people.find(x => x.id === id);
  const row = $(`tr[data-user="${CSS.escape(id)}"]`);
  if (!p || !row || row.querySelector('.acct-edit')) return;
  const cell = row.querySelector('.t-who');
  cell.innerHTML = `
    <form class="acct-edit">
      <input type="text" value="${esc(p.username)}" maxlength="24" aria-label="New username" spellcheck="false" autocomplete="off">
      <button class="btn btn-sm" type="submit">Save</button>
      <button class="btn btn-ghost btn-sm" type="button" data-cancel>Cancel</button>
    </form>`;
  const form = cell.querySelector('form'), input = form.querySelector('input');
  input.focus(); input.select();
  const restore = () => { cell.innerHTML = `<span class="acct-name">${esc(p.username)}</span>`; };
  form.querySelector('[data-cancel]').addEventListener('click', restore);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') restore(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name === p.username) return restore();
    if (!/^[A-Za-z0-9_.-]{2,24}$/.test(name)) {
      return toast('Usernames are 2–24 characters: letters, numbers, dot, dash or underscore.', 'error');
    }
    const ok = id === me.id
      ? confirm(`Rename yourself to "${name}"? You'll sign in as "${name}" from now on.`)
      : confirm(`Rename "${p.username}" to "${name}"?\n\nThey'll sign in as "${name}" (same password) from now on.`);
    if (!ok) return;
    $$('button, input', form).forEach(x => x.disabled = true);
    const { data, error } = await supa.rpc('admin_rename_user', { target: id, new_name: name });
    if (error) {
      $$('button, input', form).forEach(x => x.disabled = false);
      return toast(/admin_rename_user/.test(error.message)
        ? 'Renaming isn\'t set up yet — run sql/admin-rename.sql in Supabase.' : error.message, 'error');
    }
    const old = p.username;
    p.username = data || name;
    log.forEach(r => { if (r.from === old) r.from = p.username; });
    toast(`Renamed ${old} to ${p.username}.`, 'ok');
    loadAll();
  });
}

/* ------------------------------------------------------------------ */
/*  exports                                                           */
/* ------------------------------------------------------------------ */

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

$('#dlCsv').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) return toast('Nothing to download with these filters.', 'error');

  const csv = toCSV(rows, [
    { label: 'Timestamp',    get: r => fullStamp(r.at) },
    { label: 'ISO',          get: r => r.at },
    { label: 'Thread',       get: r => r.convo },
    { label: 'Participants', get: r => r.participants },
    { label: 'From',         get: r => r.from },
    { label: 'Number',       get: r => formatNumber(r.fromNumber) },
    { label: 'Message',      get: r => r.body },
    { label: 'Image URL',    get: r => r.image }
  ]);
  downloadBlob(`neo-message-log-${stamp()}.csv`, csv, 'text/csv');
  toast(`Downloaded ${rows.length} messages.`);
});

$('#dlJson').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) return toast('Nothing to download with these filters.', 'error');

  downloadBlob(
    `neo-message-log-${stamp()}.json`,
    JSON.stringify({
      exported_at: new Date().toISOString(),
      exported_by: me.username,
      message_count: rows.length,
      messages: rows
    }, null, 2),
    'application/json'
  );
  toast(`Downloaded ${rows.length} messages.`);
});

// Readable transcript — the one to print and bring to the table.
$('#dlTxt').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) return toast('Nothing to download with these filters.', 'error');

  const byThread = new Map();
  rows.forEach(r => {
    if (!byThread.has(r.convoId)) byThread.set(r.convoId, []);
    byThread.get(r.convoId).push(r);
  });

  let out = `NEO MESSAGE — TRANSCRIPT\n`;
  out += `Exported ${fullStamp(new Date().toISOString())} by ${me.username}\n`;
  out += `${rows.length} messages across ${byThread.size} threads\n`;
  out += '='.repeat(64) + '\n\n';

  for (const [, msgs] of byThread) {
    const head = msgs[0];
    out += `THREAD: ${head.convo}\n`;
    if (head.participants) out += `Members: ${head.participants}\n`;
    out += '-'.repeat(64) + '\n';

    let lastDay = null;
    msgs.forEach(m => {
      const day = new Date(m.at).toDateString();
      if (day !== lastDay) { out += `\n[ ${day} ]\n`; lastDay = day; }

      const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      out += `  ${time}  ${m.from}: ${m.body || ''}`;
      if (m.image) out += `${m.body ? ' ' : ''}<image: ${m.image}>`;
      out += '\n';
    });
    out += '\n\n';
  }

  downloadBlob(`neo-message-transcript-${stamp()}.txt`, out, 'text/plain');
  toast(`Downloaded ${rows.length} messages.`);
});

await loadAll();

$('#catManage')?.addEventListener('click', async () => {
  await openCategoryManager();
  cats = await loadCategories();
  paintUsers();
});
