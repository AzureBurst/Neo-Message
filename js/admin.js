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

const me = await requireProfile();
if (!me) throw new Error('redirecting');
ungate();

await loadClock();
setClockSource(storyNow);
mountCarrier($('#carrier'), { admin: true, label: 'NEO ADMIN' });

if (!me.is_admin) {
  document.querySelector('.admin-wrap').innerHTML = `
    <div class="notice notice-error" style="margin-top:40px">
      This account is not an admin. Ask whoever runs the game to flag it,
      or run this in the Supabase SQL editor:
      <code class="mono" style="display:block;margin-top:8px;color:var(--signal)">
        update profiles set is_admin = true where username = '${esc(me.username)}';
      </code>
    </div>
    <p style="margin-top:16px"><a href="app.html">Back to messages</a></p>`;
  throw new Error('not admin');
}

$('#backApp').addEventListener('click', () => location.href = 'app.html');
$('#refresh').addEventListener('click', () => loadAll());

let log = [];      // every message, joined with names
let people = [];   // every profile

/* ------------------------------------------------------------------ */
/*  load                                                              */
/* ------------------------------------------------------------------ */

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

  buildFilters(convoLabel);
  paintStats();
  paintUsers();
  render();
}

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
    <tr>
      <td class="t-who">${esc(p.username)}</td>
      <td class="t-num">${esc(formatNumber(p.phone_number))}</td>
      <td class="t-time">${new Date(p.created_at).toLocaleDateString()}</td>
      <td class="t-num">${counts.get(p.username) ?? 0}</td>
      <td>${p.is_admin
        ? '<span class="pill admin">admin</span>'
        : '<span class="pill">player</span>'}</td>
    </tr>`).join('');
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
