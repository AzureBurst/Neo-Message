// =====================================================================
//  NEOMAIL
//
//  A pretend email client. Everyone can write to anyone they're allowed
//  to (sql/categories.sql), to several people at once with To / Cc /
//  Bcc, or to a whole group (Group H Students, Faculty…). The GM writes
//  as themself, any NPC, or any name and address. Each reader has their
//  own copy of a conversation (sql/mail-v2.sql), so nobody can read
//  anyone else's mailbox.
//
//  Addresses are cosmetic: username@juniversity.edu. Nothing real is
//  ever sent anywhere.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource,
  startPresence, paintAvatar, esc, toast, $, $$, icStamp
} from './supa.js';
import { openSetTime } from './settime.js';
import { playSound } from './sfx.js';
import { loadDirectory, categoryChip, byCategory, loadCategoryList, sortPeople, filterBar, wireFilter, chipLabel } from './directory.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { renderRich, plainText, toolbarHtml, wireToolbar } from './richtext.js';

// Everyone's address is name@juniversity.edu. Set here, not in config.js.
const MAIL_DOMAIN = 'juniversity.edu';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'mail'); } catch {}

if (me.is_admin) $$('.mail-admin-tab').forEach(el => el.hidden = false);

const main = $('#mailMain');
let box = 'inbox';
let query = '';

/* An address from a username: azure@juniversity.edu. */
export function addrOf(username) {
  return String(username || 'unknown').toLowerCase().replace(/[^a-z0-9._]/g, '') + '@' + MAIL_DOMAIN;
}
const myAddr = addrOf(me.username);
const nameOnly = label => String(label || '').replace(/\s*<[^>]*>\s*$/, '');

/* ------------------------------------------------------------------ */
/*  loading a mailbox                                                  */
/* ------------------------------------------------------------------ */

async function stateFor(threadIds) {
  if (!threadIds.length) return new Map();
  const { data } = await supa.from('mail_state').select('*')
    .eq('user_id', me.id).in('thread_id', threadIds);
  return new Map((data || []).map(s => [s.thread_id, s]));
}

/* Is this my copy (I'm its reader) or an old thread I own as the GM? */
const isMine = t => t.recipient_id === me.id;
const received = t => isMine(t) ? (t.i_received ?? true) : (t.i_sent ?? t.last_from_recipient);
const sentByMe = t => isMine(t) ? (t.i_sent ?? false) : true;

async function loadBox() {
  main.innerHTML = '<div class="ig-loading">Loading…</div>';
  if (box === 'directory') return renderDirectory();

  const mine = supa.from('mail_threads').select('*').eq('recipient_id', me.id).order('last_at', { ascending: false });
  // The GM also owns the old one-to-one threads they sent as NPCs.
  const owned = me.is_admin
    ? supa.from('mail_threads').select('*').eq('owner_admin_id', me.id).neq('recipient_id', me.id).order('last_at', { ascending: false })
    : null;
  const [a, b] = await Promise.all([mine, owned]);
  if (a.error) { main.innerHTML = `<div class="ig-empty">${esc(a.error.message)}</div>`; return; }
  // New-style copies belong to their readers; only old threads count as "owned".
  const threads = [...(a.data || []), ...((b?.data || []).filter(t => !t.conv_id))]
    .sort((x, y) => new Date(y.last_at) - new Date(x.last_at));
  const state = await stateFor(threads.map(t => t.id));

  let rows;
  if (query) {
    const q = query.toLowerCase();
    // Search everything but the bin, including what's written inside.
    const { data: hits } = await supa.from('mail_messages').select('thread_id').ilike('body', `%${query.replace(/[%_]/g, '')}%`).limit(300);
    const hitIds = new Set((hits || []).map(h => h.thread_id));
    rows = threads.filter(t => {
      const s = state.get(t.id) || {};
      if (s.deleted || s.purged) return false;
      return hitIds.has(t.id) || [t.subject, t.sender_name, t.last_from_name, t.last_snippet, ...(t.to_names || []), ...(t.cc_names || [])]
        .some(x => String(x || '').toLowerCase().includes(q));
    });
  } else {
    rows = threads.filter(t => {
      const s = state.get(t.id) || {};
      if (s.purged) return false;
      if (box === 'trash') return s.deleted;
      if (s.deleted) return false;
      if (box === 'inbox') return received(t) && !s.archived;
      if (box === 'starred') return s.starred;
      if (box === 'archived') return s.archived;
      if (box === 'sent') return sentByMe(t);
      return true;
    });
  }
  renderList(rows, state);
}

function isUnread(t, s) {
  const lastFromOther = isMine(t) ? !t.last_from_recipient : t.last_from_recipient;
  if (!lastFromOther) return false;
  return !s?.read_at || new Date(s.read_at) < new Date(t.last_at);
}

function whoLine(t) {
  if (box === 'sent' && isMine(t)) {
    const to = [...(t.to_names || []), ...(t.cc_names || [])].map(nameOnly);
    return to.length ? `To: ${to.slice(0, 3).join(', ')}${to.length > 3 ? ` +${to.length - 3}` : ''}` : `To: ${t.sender_name}`;
  }
  return (isMine(t) ? (t.last_from_recipient ? 'me' : t.last_from_name) : t.last_from_name) || t.sender_name;
}

function renderList(rows, state) {
  const head = query ? `<div class="mail-search-head">Results for “${esc(query)}” <button class="btn btn-ghost btn-sm" id="mailClearSearch">Clear</button></div>` : '';
  if (!rows.length) {
    main.innerHTML = head + `<div class="ig-empty muted">${
      query ? 'No mail matches.' : box === 'sent' ? 'You haven’t sent any mail.' : box === 'trash' ? 'The bin is empty.' : 'Nothing here.'}</div>`;
    $('#mailClearSearch')?.addEventListener('click', clearSearch);
    return;
  }
  main.innerHTML = head + `
    ${box === 'trash' && !query ? '<div class="mail-trash-note muted small">Mail in the bin stays until you delete it forever.</div>' : ''}
    <div class="mail-list">${rows.map(t => {
      const s = state.get(t.id) || {};
      const unread = isUnread(t, s);
      const who = whoLine(t);
      const n = (t.to_names?.length || 0) + (t.cc_names?.length || 0);
      return `
      <button class="mail-row ${unread ? 'unread' : ''}" data-thread="${esc(t.id)}">
        <span class="mail-star ${s.starred ? 'on' : ''}" data-star="${esc(t.id)}" title="Star">${s.starred ? '★' : '☆'}</span>
        <span class="avatar avatar-sm">${esc((nameOnly(who).replace(/^To: /, '') || '?').slice(0, 1).toUpperCase())}</span>
        <span class="mail-row-main">
          <span class="mail-row-top">
            <span class="mail-from">${esc(who)}${n > 1 ? ` <i class="mail-n">${n}</i>` : ''}</span>
            <span class="mail-time">${icStamp(t, { icKey: 'last_story_at', realKey: 'last_at' })}</span>
          </span>
          <span class="mail-subject">${esc(t.subject)}</span>
          <span class="mail-snippet">${esc(plainText(t.last_snippet || ''))}</span>
        </span>
      </button>`;
    }).join('')}</div>`;
  $('#mailClearSearch')?.addEventListener('click', clearSearch);
  $$('.mail-row', main).forEach(r => r.addEventListener('click', (e) => {
    if (e.target.closest('[data-star]')) return;
    openThread(r.dataset.thread);
  }));
  $$('[data-star]', main).forEach(st => st.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = st.dataset.star;
    await setState(id, { starred: !(state.get(id)?.starred) });
    loadBox();
  }));
}

const setState = (id, patch) => supa.from('mail_state').upsert(
  { thread_id: id, user_id: me.id, ...patch }, { onConflict: 'thread_id,user_id' });

function clearSearch() { query = ''; $('#mailSearch').value = ''; loadBox(); }

/* ------------------------------------------------------------------ */
/*  reading a thread                                                   */
/* ------------------------------------------------------------------ */

async function openThread(id) {
  main.innerHTML = '<div class="ig-loading">Loading…</div>';
  const { data: t } = await supa.from('mail_threads').select('*').eq('id', id).maybeSingle();
  if (!t) { main.innerHTML = '<div class="ig-empty">This mail is not available.</div>'; return; }
  const [{ data: msgs }, { data: st }] = await Promise.all([
    supa.from('mail_messages').select('*').eq('thread_id', id).order('created_at'),
    supa.from('mail_state').select('*').eq('thread_id', id).eq('user_id', me.id).maybeSingle()
  ]);
  const s = st || {};
  await setState(id, { read_at: new Date().toISOString() });
  clearNotificationsFor(id);

  const v2 = !!t.conv_id;
  if (me.is_admin && t.npc_ids?.length && !dirCache) await loadPeople();
  const people = [...(t.to_names || []), ...(t.cc_names || [])];
  const recipLine = v2 ? `
    <div class="mail-people">
      ${t.to_names?.length ? `<span><b>To</b> ${t.to_names.map(n => `<span class="mail-person" title="${esc(n)}">${esc(nameOnly(n))}</span>`).join('')}</span>` : ''}
      ${t.cc_names?.length ? `<span><b>Cc</b> ${t.cc_names.map(n => `<span class="mail-person" title="${esc(n)}">${esc(nameOnly(n))}</span>`).join('')}</span>` : ''}
      ${t.is_bcc ? '<span class="muted">You were Bcc’d. Replying lets everyone see you’re on it.</span>' : ''}
    </div>` : '';

  // The GM replies as whoever they wrote as, or any NPC on the email.
  const asChoices = me.is_admin && v2 && isMine(t)
    ? [{ id: '', name: t.gm_name || me.username }, ...(t.npc_ids || []).map(id => ({ id, name: dirName(id) }))]
        .filter((x, i, a) => a.findIndex(y => y.name === x.name) === i)
    : [];

  main.innerHTML = `
    <div class="mail-thread">
      <div class="mail-thread-head">
        <button class="btn btn-ghost btn-sm" id="mailBack">‹ Back</button>
        <div class="mail-thread-actions">
          ${s.deleted ? `
            <button class="btn btn-ghost btn-sm" id="mailRestore">Restore</button>
            <button class="btn btn-ghost btn-sm mail-danger" id="mailPurge">Delete forever</button>` : `
            <button class="icon-btn" id="mailStar" title="${s.starred ? 'Unstar' : 'Star'}">${s.starred ? '★' : '☆'}</button>
            ${s.archived
              ? '<button class="icon-btn" id="mailUnarchive" title="Move to Inbox">📥</button>'
              : '<button class="icon-btn" id="mailArchive" title="Archive">🗄</button>'}
            <button class="icon-btn" id="mailUnread" title="Mark as unread">✉</button>
            <button class="icon-btn" id="mailDelete" title="Move to bin">🗑</button>`}
        </div>
      </div>
      <h2 class="mail-thread-subject">${esc(t.subject)}</h2>
      ${recipLine}
      <div class="mail-msgs">${(msgs || []).map(m => messageHtml(m, t)).join('')}</div>
      ${s.deleted ? '' : `
      <div class="mail-actions-row" id="mailActRow">
        <button class="btn btn-ghost" id="mailReplyBtn">↩ Reply${v2 && people.length > 1 ? ' all' : ''}</button>
        <button class="btn btn-ghost" id="mailFwdBtn">↪ Forward</button>
      </div>
      <div class="mail-reply" id="mailReplyBox" hidden>
        ${asChoices.length > 1 ? `<label class="mail-reply-as">Reply as
          <select id="mailReplyAs">${asChoices.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <div class="rt-wrap" hidden>${toolbarHtml()}</div>
        <textarea id="mailReplyBody" rows="5" placeholder="Write your reply…"></textarea>
        <div class="mail-att-list" id="mailReplyAtt"></div>
        <div class="mail-reply-bar">
          <button class="btn btn-primary mail-send" id="mailReplySend">Send</button>
          <button class="icon-btn" data-aa title="Formatting options">Aa</button>
          <label class="icon-btn" title="Attach files">📎<input type="file" id="mailReplyFile" multiple hidden></label>
          <span class="grow"></span>
          <button class="icon-btn" id="mailReplyCancel" title="Discard">🗑</button>
        </div>
      </div>`}
    </div>`;

  $('#mailBack').addEventListener('click', loadBox);
  $$('[data-mtime]', main).forEach(b => b.addEventListener('click', () => {
    const m = (msgs || []).find(x => x.id === b.dataset.mtime);
    openSetTime({ kind: 'mail', id: m.id, current: m.story_at || m.created_at, title: 'Email time', onDone: () => openThread(id) });
  }));
  $$('[data-fwd]', main).forEach(b => b.addEventListener('click', () => forward(t, (msgs || []).find(x => x.id === b.dataset.fwd))));

  const act = (sel, patch, msg) => $(sel)?.addEventListener('click', async () => {
    await setState(id, patch); if (msg) toast(msg, 'ok'); loadBox();
  });
  act('#mailArchive', { archived: true }, 'Archived.');
  act('#mailUnarchive', { archived: false }, 'Moved to Inbox.');
  act('#mailUnread', { read_at: null }, 'Marked as unread.');
  act('#mailDelete', { deleted: true }, 'Moved to the bin.');
  act('#mailRestore', { deleted: false }, 'Restored.');
  $('#mailStar')?.addEventListener('click', async () => { await setState(id, { starred: !s.starred }); openThread(id); });
  $('#mailPurge')?.addEventListener('click', async () => {
    if (!confirm('Delete this mail forever? You won’t be able to get it back.')) return;
    await setState(id, { deleted: true, purged: true }); toast('Deleted forever.', 'ok'); loadBox();
  });

  if (s.deleted) return;
  $('#mailFwdBtn').addEventListener('click', () => forward(t, (msgs || [])[msgs.length - 1]));
  const replyBox = $('#mailReplyBox');
  $('#mailReplyBtn').addEventListener('click', () => {
    replyBox.hidden = false; $('#mailActRow').hidden = true; $('#mailReplyBody').focus();
  });
  $('#mailReplyCancel').addEventListener('click', () => {
    if ($('#mailReplyBody').value.trim() && !confirm('Discard this reply?')) return;
    $('#mailReplyBody').value = ''; replyAtt.length = 0; paintAtt($('#mailReplyAtt'), replyAtt);
    replyBox.hidden = true; $('#mailActRow').hidden = false;
  });
  wireToolbar($('.rt-bar', replyBox), $('#mailReplyBody'));
  $('[data-aa]', replyBox).addEventListener('click', () => { const w = $('.rt-wrap', replyBox); w.hidden = !w.hidden; });
  const replyAtt = [];
  $('#mailReplyFile').addEventListener('change', (e) => addFiles(e.target, replyAtt, $('#mailReplyAtt')));

  $('#mailReplySend').addEventListener('click', async (e) => {
    const body = $('#mailReplyBody').value.trim();
    if (!body && !replyAtt.length) return;
    if (replyAtt.some(a => a.uploading)) return toast('Wait for the attachments to finish uploading.', 'info');
    e.currentTarget.disabled = true;
    const files = replyAtt.map(({ url, name, type, size }) => ({ url, name, type, size }));
    const { error } = v2
      ? await supa.rpc('mail_reply2', { p_thread: id, p_body: body, p_attachments: files, p_as: $('#mailReplyAs')?.value || null })
      : files.length
        ? await supa.rpc('mail_reply_att', { p_thread: id, p_body: body, p_attachments: files })
        : await supa.rpc('mail_reply', { p_thread: id, p_body: body });
    if (error) {
      e.currentTarget.disabled = false;
      return toast(/mail_reply_att|mail_reply2/.test(error.message) ? 'Run sql/mail-v2.sql in Supabase first.' : error.message, 'error');
    }
    playSound('sent');
    openThread(id);
  });
}

function messageHtml(m, t) {
  const addr = m.from_addr || addrOf(m.from_name);
  const att = Array.isArray(m.attachments) ? m.attachments : [];
  return `
    <div class="mail-msg ${m.from_recipient === isMine(t) ? 'from-me-side' : ''}">
      <div class="mail-msg-head">
        <span class="avatar avatar-sm">${esc((m.from_name || '?').slice(0, 1).toUpperCase())}</span>
        <span class="mail-msg-who"><strong>${esc(m.from_name)}</strong> <span class="mail-addr mono">&lt;${esc(addr)}&gt;</span></span>
        <span class="mail-msg-time mono">${icStamp(m, { fmt: 'full' })}</span>
        <button class="icon-btn mail-mini" data-fwd="${esc(m.id)}" title="Forward this email">↪</button>
        ${me.is_admin ? `<button class="icon-btn mail-mini mail-time-btn" data-mtime="${esc(m.id)}" title="Change date &amp; time">🕓</button>` : ''}
      </div>
      ${m.body ? `<div class="mail-msg-body rt">${renderRich(m.body)}</div>` : ''}
      ${att.length ? `<div class="mail-msg-att">${att.map(attHtml).join('')}</div>` : ''}
    </div>`;
}

const isImg = a => /^image\//.test(a.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || '');
const kb = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
function attHtml(a) {
  if (isImg(a)) return `<a class="mail-att-img" href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"><span>${esc(a.name)}</span></a>`;
  const ext = (a.name.split('.').pop() || '').toUpperCase().slice(0, 4);
  return `<a class="mail-att-file" href="${esc(a.url)}" target="_blank" rel="noopener" download="${esc(a.name)}">
    <span class="mail-att-ext">${esc(ext || 'FILE')}</span><span class="mail-att-name">${esc(a.name)}<small>${a.size ? kb(a.size) : ''}</small></span></a>`;
}

/* ------------------------------------------------------------------ */
/*  attachments                                                        */
/* ------------------------------------------------------------------ */

const MAX_MB = 15;
async function addFiles(input, list, box) {
  const files = [...input.files]; input.value = '';
  for (const f of files) {
    if (list.length >= 8) { toast('Up to 8 attachments.', 'info'); break; }
    if (f.size > MAX_MB * 1048576) { toast(`${f.name} is over ${MAX_MB} MB.`, 'error'); continue; }
    const item = { name: f.name, type: f.type, size: f.size, uploading: true };
    list.push(item); paintAtt(box, list);
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const path = `${me.id}/mail/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supa.storage.from('attachments').upload(path, f, { cacheControl: '3600', upsert: false, contentType: f.type || undefined });
    if (error) { list.splice(list.indexOf(item), 1); toast(error.message, 'error'); }
    else { item.url = supa.storage.from('attachments').getPublicUrl(path).data.publicUrl; item.uploading = false; }
    paintAtt(box, list);
  }
}
function paintAtt(box, list) {
  if (!box) return;
  box.innerHTML = list.map((a, i) => `
    <span class="mail-att-chip ${a.uploading ? 'up' : ''}">${isImg(a) ? '🖼' : '📄'} ${esc(a.name)} <small>${a.uploading ? 'uploading…' : kb(a.size || 0)}</small>
      <button type="button" data-rm-att="${i}" title="Remove">✕</button></span>`).join('');
  $$('[data-rm-att]', box).forEach(b => b.addEventListener('click', () => { list.splice(+b.dataset.rmAtt, 1); paintAtt(box, list); }));
}

/* ------------------------------------------------------------------ */
/*  people + groups for the To / Cc / Bcc fields                       */
/* ------------------------------------------------------------------ */

let dirCache = null, catsCache = null;
async function loadPeople() {
  const [dir, cats] = await Promise.all([loadDirectory({ fresh: true }), loadCategoryList()]);
  catsCache = cats;
  dirCache = sortPeople(dir.filter(p => p.can_email), { catOf: p => p.category_id, isNpc: p => p.is_npc, nameOf: p => p.username }, cats);
  return dirCache;
}
const dirName = id => dirCache?.find(p => p.id === id)?.username || 'NPC';

async function groupsFor(people) {
  const groups = [];
  if (me.is_admin) {
    const players = people.filter(p => !p.is_npc);
    if (players.length) groups.push({ key: 'g:players', label: 'All players', ids: players.map(p => p.id) });
  }
  for (const c of catsCache || []) {
    const ids = people.filter(p => p.category_id === c.id).map(p => p.id);
    if (ids.length > 1) groups.push({ key: `g:${c.id}`, label: c.name, color: c.color, ids });
  }
  if (me.is_admin) {
    const { data } = await supa.from('account_tags').select('tag, user_id');
    const byTag = new Map();
    (data || []).forEach(r => { if (people.some(p => p.id === r.user_id)) byTag.set(r.tag, [...(byTag.get(r.tag) || []), r.user_id]); });
    [...byTag].sort().forEach(([tag, ids]) => groups.push({ key: `t:${tag}`, label: `#${tag}`, ids }));
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/*  the compose window (looks and behaves like a mail app's)          */
/* ------------------------------------------------------------------ */

let composer = null;

async function openComposer({ to = [], subject = '', body = '', attachments = [], title = 'New Message' } = {}) {
  if (composer) {
    if (composer.dirty() && !confirm('Discard the email you’re writing?')) { composer.focus(); return; }
    composer.close();
  }
  const people = await loadPeople();
  if (!people.length) return toast('There’s nobody you can email yet. Add people to your contacts first.', 'info');
  const groups = await groupsFor(people);
  const npcs = me.is_admin ? people.filter(p => p.is_npc) : [];

  const fields = { to: [], cc: [], bcc: [] };
  to.forEach(id => { const p = people.find(x => x.id === id); if (p) fields.to.push({ key: p.id, label: p.username, ids: [p.id] }); });
  const att = attachments.map(a => ({ ...a }));

  const win = document.createElement('div');
  win.className = 'mc-win';
  win.innerHTML = `
    <div class="mc-head">
      <span class="mc-title">${esc(title)}</span>
      <button type="button" data-mc="min" title="Minimise">_</button>
      <button type="button" data-mc="max" title="Full screen">⤢</button>
      <button type="button" data-mc="close" title="Save &amp; close">✕</button>
    </div>
    <div class="mc-body">
      ${me.is_admin ? `
      <div class="mc-row">
        <label class="mc-lab" for="mcFrom">From</label>
        <select id="mcFrom" class="mc-from">
          <option value="">${esc(me.username)} &lt;${esc(myAddr)}&gt;</option>
          ${npcs.length ? `<optgroup label="As an NPC">${npcs.map(n => `<option value="${esc(n.id)}">${esc(n.username)} &lt;${esc(addrOf(n.username))}&gt;</option>`).join('')}</optgroup>` : ''}
          <option value="__custom">Any name and address…</option>
        </select>
      </div>
      <div class="mc-row mc-custom" id="mcCustom" hidden>
        <input id="mcFromName" placeholder="Sender name (e.g. JU Registrar)">
        <input id="mcFromAddr" class="mono" placeholder="registrar@juniversity.edu">
      </div>` : ''}
      ${['to', 'cc', 'bcc'].map(f => `
      <div class="mc-row mc-rcpt" data-field="${f}" ${f === 'to' ? '' : 'hidden'}>
        <label class="mc-lab">${f === 'to' ? 'To' : f === 'cc' ? 'Cc' : 'Bcc'}</label>
        <div class="mc-chips"><input class="mc-input" data-for="${f}" autocomplete="off" spellcheck="false"></div>
        ${f === 'to' ? '<span class="mc-ccbcc"><button type="button" data-show="cc">Cc</button><button type="button" data-show="bcc">Bcc</button></span>' : ''}
      </div>`).join('')}
      <div class="mc-row"><input id="mcSubject" class="mc-subject" placeholder="Subject" maxlength="140" value="${esc(subject)}"></div>
      <textarea id="mcText" class="mc-text">${esc(body)}</textarea>
      <div class="mail-att-list" id="mcAtt"></div>
    </div>
    <div class="rt-wrap mc-rt" hidden>${toolbarHtml()}</div>
    <div class="mc-foot">
      <button type="button" class="mc-send" id="mcSend">Send</button>
      <button type="button" class="mc-tool" data-aa title="Formatting options">Aa</button>
      <label class="mc-tool" title="Attach files">📎<input type="file" id="mcFile" multiple hidden></label>
      <label class="mc-tool" title="Insert photo">🖼<input type="file" id="mcPhoto" accept="image/*" multiple hidden></label>
      <span class="grow"></span>
      <button type="button" class="mc-tool" data-mc="discard" title="Discard draft">🗑</button>
    </div>
    <div class="mc-suggest" hidden></div>`;
  document.body.appendChild(win);

  const text = $('#mcText', win), sugg = $('.mc-suggest', win), attBox = $('#mcAtt', win);
  paintAtt(attBox, att);
  wireToolbar($('.rt-bar', win), text);
  $('[data-aa]', win).addEventListener('click', () => { const w = $('.mc-rt', win); w.hidden = !w.hidden; });
  $('#mcFile', win).addEventListener('change', e => addFiles(e.target, att, attBox));
  $('#mcPhoto', win).addEventListener('change', e => addFiles(e.target, att, attBox));
  $('#mcFrom', win)?.addEventListener('change', e => { $('#mcCustom', win).hidden = e.target.value !== '__custom'; });
  $$('[data-show]', win).forEach(b => b.addEventListener('click', () => {
    $(`.mc-rcpt[data-field="${b.dataset.show}"]`, win).hidden = false; b.hidden = true;
    $(`.mc-input[data-for="${b.dataset.show}"]`, win).focus();
  }));

  /* chips */
  const paintChips = (f) => {
    const row = $(`.mc-rcpt[data-field="${f}"] .mc-chips`, win), input = $('.mc-input', row);
    $$('.mc-chip', row).forEach(c => c.remove());
    fields[f].forEach((c, i) => {
      const el = document.createElement('span');
      el.className = `mc-chip ${c.ids.length > 1 ? 'group' : ''}`;
      el.title = c.ids.length > 1 ? c.ids.map(id => people.find(p => p.id === id)?.username).join(', ') : addrOf(c.label);
      el.innerHTML = `${c.ids.length > 1 ? '👥 ' : ''}${esc(c.label)}${c.ids.length > 1 ? ` <i>${c.ids.length}</i>` : ''}<button type="button" title="Remove">✕</button>`;
      el.querySelector('button').addEventListener('click', () => { fields[f].splice(i, 1); paintChips(f); input.focus(); });
      row.insertBefore(el, input);
    });
  };
  ['to', 'cc', 'bcc'].forEach(paintChips);

  let active = null, cursor = 0, options = [];
  const showSuggest = (input) => {
    const f = input.dataset.for, q = input.value.trim().toLowerCase();
    const taken = new Set(fields[f].map(c => c.key));
    const gs = groups.filter(g => !taken.has(g.key) && (!q || g.label.toLowerCase().includes(q) || chipLabel(g.label).toLowerCase().includes(q)));
    const ps = people.filter(p => !taken.has(p.id) && (!q || p.username.toLowerCase().includes(q) || addrOf(p.username).includes(q) || (p.category || '').toLowerCase().includes(q)));
    options = [...gs.slice(0, q ? 6 : 8).map(g => ({ type: 'g', g })), ...ps.slice(0, 40).map(p => ({ type: 'p', p }))];
    if (!options.length) { sugg.hidden = true; return; }
    cursor = Math.min(cursor, options.length - 1);
    sugg.innerHTML = options.map((o, i) => o.type === 'g' ? `
      <button type="button" class="mc-opt ${i === cursor ? 'on' : ''}" data-i="${i}">
        <span class="mc-opt-ic" style="--cc:${esc(o.g.color || '#6EA0FF')}">👥</span>
        <span><b>${esc(o.g.label)}</b><small>${o.g.ids.length} people · adds everyone</small></span></button>` : `
      <button type="button" class="mc-opt ${i === cursor ? 'on' : ''}" data-i="${i}">
        <span class="avatar avatar-sm" data-mcav="${esc(o.p.id)}"></span>
        <span><b>${esc(o.p.username)}${o.p.is_npc ? '' : '<span class="player-tag">Player</span>'}</b><small>${esc(addrOf(o.p.username))}</small></span>
        ${categoryChip(o.p)}</button>`).join('');
    options.forEach((o, i) => { if (o.type === 'p') { const el = sugg.querySelector(`[data-mcav="${o.p.id}"]`); if (el) paintAvatar(el, o.p.avatar_url, o.p.username); } });
    const r = input.getBoundingClientRect(), w = win.getBoundingClientRect();
    sugg.style.top = `${r.bottom - w.top + 4}px`; sugg.style.left = `${Math.max(8, r.left - w.left - 40)}px`;
    sugg.hidden = false;
    $$('.mc-opt', sugg).forEach(b => b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(input, +b.dataset.i); }));
  };
  const pick = (input, i) => {
    const o = options[i]; if (!o) return;
    const f = input.dataset.for;
    fields[f].push(o.type === 'g' ? { key: o.g.key, label: o.g.label, ids: o.g.ids } : { key: o.p.id, label: o.p.username, ids: [o.p.id] });
    input.value = ''; cursor = 0; paintChips(f); showSuggest(input); input.focus();
  };
  $$('.mc-input', win).forEach(input => {
    input.addEventListener('focus', () => { active = input; cursor = 0; showSuggest(input); });
    input.addEventListener('input', () => { cursor = 0; showSuggest(input); });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) sugg.hidden = true; }, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(options.length - 1, cursor + 1); showSuggest(input); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); showSuggest(input); }
      else if ((e.key === 'Enter' || e.key === 'Tab' || e.key === ',') && input.value.trim() && options.length) { e.preventDefault(); pick(input, cursor); }
      else if (e.key === 'Backspace' && !input.value && fields[input.dataset.for].length) { fields[input.dataset.for].pop(); paintChips(input.dataset.for); }
      else if (e.key === 'Escape') sugg.hidden = true;
    });
  });
  $$('.mc-chips', win).forEach(c => c.addEventListener('click', (e) => { if (e.target === c) $('.mc-input', c).focus(); }));

  /* window controls */
  const dirty = () => !!text.value.trim() || !!$('#mcSubject', win).value.trim() || att.length > 0;
  const close = () => { win.remove(); composer = null; };
  $$('[data-mc]', win).forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.mc;
    if (a === 'min') win.classList.toggle('min');
    if (a === 'max') win.classList.toggle('max');
    if (a === 'close' || a === 'discard') {
      if (dirty() && !confirm(a === 'discard' ? 'Discard this draft?' : 'Close and lose this email?')) return;
      close();
    }
  }));
  $('.mc-head', win).addEventListener('dblclick', () => win.classList.toggle('min'));

  /* send */
  $('#mcSend', win).addEventListener('click', async (e) => {
    const ids = f => [...new Set(fields[f].flatMap(c => c.ids))];
    // Anything typed but not picked: try to match it to someone.
    for (const input of $$('.mc-input', win)) {
      const q = input.value.trim().toLowerCase(); if (!q) continue;
      const p = people.find(x => x.username.toLowerCase() === q || addrOf(x.username) === q);
      if (!p) return toast(`Pick “${input.value.trim()}” from the list.`, 'error');
      fields[input.dataset.for].push({ key: p.id, label: p.username, ids: [p.id] }); input.value = '';
    }
    const to = ids('to'), cc = ids('cc').filter(x => !to.includes(x)), bcc = ids('bcc').filter(x => !to.includes(x) && !cc.includes(x));
    const subject = $('#mcSubject', win).value.trim(), bodyTxt = text.value.trim();
    if (!to.length && !cc.length && !bcc.length) return toast('Add someone to send it to.', 'error');
    if (!subject) return toast('Add a subject.', 'error');
    if (!bodyTxt && !att.length) return toast('Write something first.', 'error');
    if (att.some(a => a.uploading)) return toast('Wait for the attachments to finish uploading.', 'info');
    const from = $('#mcFrom', win)?.value || '';
    if (from === '__custom' && !$('#mcFromName', win).value.trim()) return toast('Give the sender a name.', 'error');
    e.currentTarget.disabled = true; e.currentTarget.textContent = 'Sending…';
    const { data, error } = await supa.rpc('mail_send2', {
      p_to: to, p_cc: cc, p_bcc: bcc, p_subject: subject, p_body: bodyTxt,
      p_attachments: att.map(({ url, name, type, size }) => ({ url, name, type, size })),
      p_from: from && from !== '__custom' ? from : null,
      p_from_name: from === '__custom' ? $('#mcFromName', win).value.trim() : null,
      p_from_addr: from === '__custom' ? $('#mcFromAddr', win).value.trim() : null
    });
    if (error) {
      e.currentTarget.disabled = false; e.currentTarget.textContent = 'Send';
      return toast(/mail_send2/.test(error.message) ? 'Run sql/mail-v2.sql in Supabase first.' : error.message, 'error');
    }
    close();
    playSound('sent');
    const n = new Set([...to, ...cc, ...bcc]).size;
    toast(`Sent to ${n} ${n === 1 ? 'person' : 'people'}.`, 'ok');
    if (box === 'sent' || box === 'inbox') loadBox();
  });

  composer = { close, dirty, focus: () => win.classList.remove('min') };
  if (!to.length) $('.mc-input[data-for="to"]', win).focus(); else if (!subject) $('#mcSubject', win).focus(); else text.focus();
}

/* Forward one email: the original goes below, attachments come along. */
function forward(t, m) {
  if (!m) return;
  const to = [...(t.to_names || [])].join(', ');
  const when = new Date(m.story_at || m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const quoted = [
    '', '', '---------- Forwarded message ---------',
    `From: ${m.from_name} <${m.from_addr || addrOf(m.from_name)}>`,
    `Date: ${when}`, `Subject: ${t.subject}`, to ? `To: ${to}` : '', '',
    ...String(m.body || '').split('\n').map(l => `> ${l}`)
  ].filter((l, i) => l !== '' || i < 2 || i === 7).join('\n');
  openComposer({
    title: 'Forward',
    subject: /^fwd?:/i.test(t.subject) ? t.subject : `Fwd: ${t.subject}`,
    body: quoted,
    attachments: Array.isArray(m.attachments) ? m.attachments : []
  });
}

/* ------------------------------------------------------------------ */
/*  directory                                                          */
/* ------------------------------------------------------------------ */

async function renderDirectory() {
  const [raw, cats] = await Promise.all([loadDirectory({ fresh: true }), loadCategoryList()]);
  const dir = sortPeople(raw, { catOf: p => p.category_id, isNpc: p => p.is_npc, nameOf: p => p.username }, cats);
  const groups = rows => {
    const players = rows.filter(p => !p.is_npc);
    return (players.length ? `<h4 class="dir-group" data-grp="players">Players</h4>${players.map(card).join('')}` : '') +
      byCategory(rows.filter(p => p.is_npc)).map(g => `<h4 class="dir-group" data-grp="${esc(g.rows[0].category_id || 'none')}">${esc(g.name)}</h4>${g.rows.map(card).join('')}`).join('');
  };
  const card = p => `
    <div class="dir-card" data-cat="${esc(p.category_id || 'none')}">
      <span class="avatar" data-dav="${esc(p.id)}"></span>
      <div class="dir-main">
        <strong>${esc(p.username)}${p.is_npc ? '' : '<span class="player-tag">Player</span>'}</strong>
        <span class="dir-meta">${categoryChip(p)}${p.about ? `<span class="muted">${esc(p.about)}</span>` : ''}</span>
        <span class="mono dir-addr">${esc(addrOf(p.username))}</span>
      </div>
      ${p.can_email ? `<button class="btn btn-sm btn-primary" data-mailto="${esc(p.id)}">Email</button>` : ''}
    </div>`;
  main.innerHTML = dir.length ? `
    <div class="dir-wrap">
      <input type="search" id="dirFind" class="dir-find" placeholder="Search the directory">
      ${filterBar(dir, p => p.category_id, 'maildir', cats)}
      <div id="dirList">${groups(dir)}</div>
    </div>` : '<div class="ig-empty muted">Nobody in your directory yet.</div>';
  const tidy = () => $$('#dirList .dir-group', main).forEach(h => {
    let n = h.nextElementSibling, any = false;
    while (n && !n.classList.contains('dir-group')) { if (!n.classList.contains('cat-out')) any = true; n = n.nextElementSibling; }
    h.classList.toggle('cat-out', !any);
  });
  const applyFilter = wireFilter(main, 'maildir', { items: '#dirList [data-cat]', onChange: tidy });
  const paint = () => {
    applyFilter();
    dir.forEach(p => { const el = main.querySelector(`[data-dav="${p.id}"]`); if (el) paintAvatar(el, p.avatar_url, p.username); });
    $$('[data-mailto]', main).forEach(b => b.addEventListener('click', () => openComposer({ to: [b.dataset.mailto] })));
  };
  paint();
  $('#dirFind')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const rows = dir.filter(p => !q || p.username.toLowerCase().includes(q) || (p.about || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    $('#dirList').innerHTML = groups(rows) || '<div class="muted">No matches.</div>';
    paint();
  });
}

/* ------------------------------------------------------------------ */
/*  admin: tag manager                                                */
/* ------------------------------------------------------------------ */

function sheet({ title, body, footer, wide }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => { if (e.target.classList.contains('scrim')) close(); });
  return { root, close };
}

async function openTags() {
  const [{ data: people }, { data: tagRows }] = await Promise.all([
    supa.from('profiles').select('id, username').order('username'),
    supa.from('account_tags').select('*')
  ]);
  const byUser = new Map();
  (tagRows || []).forEach(r => {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r.tag);
  });

  const { root } = sheet({
    title: 'Account tags', wide: true,
    body: `
      <p class="muted small">Tag accounts, then type the tag (e.g. #club) in To to mail them all at once.</p>
      <div class="tag-manage">
        ${(people || []).map(p => `
          <div class="tag-user" data-user="${esc(p.id)}">
            <strong>${esc(p.username)}</strong>
            <div class="tag-chips">${(byUser.get(p.id) || []).map(chip).join('')}</div>
            <div class="tag-add">
              <input placeholder="add tag" maxlength="40">
              <button class="btn btn-sm" data-addtag>Add</button>
            </div>
          </div>`).join('')}
      </div>`
  });

  function chip(tag) {
    return `<span class="tag-chip">${esc(tag)}<button data-rm="${esc(tag)}">✕</button></span>`;
  }

  $$('.tag-user', root).forEach(row => {
    const uid = row.dataset.user;
    row.querySelector('[data-addtag]').addEventListener('click', async () => {
      const input = row.querySelector('input');
      const tag = input.value.trim().toLowerCase();
      if (!tag) return;
      const { error } = await supa.from('account_tags').insert({ user_id: uid, tag });
      if (error && !/duplicate/i.test(error.message)) return toast(error.message, 'error');
      row.querySelector('.tag-chips').insertAdjacentHTML('beforeend', chip(tag));
      input.value = '';
    });
    row.querySelector('.tag-chips').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      await supa.from('account_tags').delete().eq('user_id', uid).eq('tag', b.dataset.rm);
      b.closest('.tag-chip').remove();
    });
  });
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

$$('.mail-tab').forEach(t => t.addEventListener('click', () => {
  box = t.dataset.box; query = ''; $('#mailSearch').value = '';
  $$('.mail-tab').forEach(x => x.classList.toggle('is-on', x === t));
  loadBox();
}));

$('#mailCompose').addEventListener('click', () => openComposer());
$('#mailTags')?.addEventListener('click', openTags);

let searchTimer = null;
$('#mailSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = e.target.value.trim(); loadBox(); }, 300);
});

// Live: new mail or replies refresh the list (not an open email or draft).
let liveTimer = null;
supa.channel('mail-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_threads' }, () => {
    if (main.querySelector('.mail-thread')) return;
    clearTimeout(liveTimer); liveTimer = setTimeout(loadBox, 400);
  })
  .subscribe();

// Deep link from a notification, or ?compose=<user id> from elsewhere.
const params = new URLSearchParams(location.search);
if (params.get('t')) openThread(params.get('t'));
else loadBox();
if (params.get('compose')) openComposer({ to: [params.get('compose')] });
