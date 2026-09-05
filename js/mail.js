// =====================================================================
//  NEOMAIL
//
//  A dummy email client. Players read mail the GM sends and reply to it;
//  the GM composes to everyone, to a tag, or to named accounts, and reads
//  the replies. Each recipient has a private thread, so replies never
//  leak between players.
//
//  Addresses are cosmetic, built from usernames + MAIL_DOMAIN, so nothing
//  real is ever sent anywhere.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource,
  startPresence, paintAvatar, esc, toast, fullStamp, shortTime, $, $$
} from './supa.js';
import { MAIL_DOMAIN } from './config.js';
import { playSound } from './sfx.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';

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

/* An address from a username: azure@neo.mail. */
export function addrOf(username) {
  return String(username || 'unknown').toLowerCase().replace(/[^a-z0-9._]/g, '') + '@' + MAIL_DOMAIN;
}
const myAddr = addrOf(me.username);

/* ------------------------------------------------------------------ */
/*  loading a mailbox                                                  */
/* ------------------------------------------------------------------ */

async function stateFor(threadIds) {
  if (!threadIds.length) return new Map();
  const { data } = await supa.from('mail_state').select('*')
    .eq('user_id', me.id).in('thread_id', threadIds);
  const m = new Map();
  (data || []).forEach(s => m.set(s.thread_id, s));
  return m;
}

async function loadBox() {
  main.innerHTML = '<div class="ig-loading">Loading…</div>';

  // Admin "Sent" shows threads they own; everything else is the player's
  // own inbox. (An admin also has a normal inbox as a recipient.)
  let q = supa.from('mail_threads').select('*').order('last_at', { ascending: false });
  q = box === 'sent'
    ? q.eq('owner_admin_id', me.id)
    : q.eq('recipient_id', me.id);

  const { data: threads, error } = await q;
  if (error) { main.innerHTML = `<div class="ig-empty">${esc(error.message)}</div>`; return; }

  const state = await stateFor((threads || []).map(t => t.id));

  let rows = (threads || []).filter(t => {
    const s = state.get(t.id) || {};
    if (box === 'inbox')    return !s.archived && !s.deleted;
    if (box === 'starred')  return s.starred && !s.deleted;
    if (box === 'archived') return s.archived && !s.deleted;
    return true;                     // sent
  });

  renderList(rows, state);
}

function isUnread(t, s) {
  // Unread when the last message came from the other side and you have
  // not opened it since.
  const mineIsRecipient = box !== 'sent';
  const lastFromOther = mineIsRecipient ? !t.last_from_recipient : t.last_from_recipient;
  if (!lastFromOther) return false;
  return !s?.read_at || new Date(s.read_at) < new Date(t.last_at);
}

function renderList(rows, state) {
  if (!rows.length) {
    main.innerHTML = `<div class="ig-empty muted">${
      box === 'sent' ? 'You have not sent any mail.' : 'Nothing here.'}</div>`;
    return;
  }

  main.innerHTML = `<div class="mail-list">${rows.map(t => {
    const s = state.get(t.id) || {};
    const unread = isUnread(t, s);
    const who = box === 'sent' ? t.sender_name : t.sender_name;   // display sender
    return `
      <button class="mail-row ${unread ? 'unread' : ''}" data-thread="${esc(t.id)}">
        <span class="mail-star ${s.starred ? 'on' : ''}" data-star="${esc(t.id)}">${s.starred ? '★' : '☆'}</span>
        <span class="avatar avatar-sm" data-av="${esc(t.id)}">${esc((who || '?').slice(0,1).toUpperCase())}</span>
        <span class="mail-row-main">
          <span class="mail-row-top">
            <span class="mail-from">${esc(who)}</span>
            <span class="mail-time">${esc(shortTime(t.last_at))}</span>
          </span>
          <span class="mail-subject">${esc(t.subject)}</span>
          <span class="mail-snippet">${esc(t.last_snippet || '')}</span>
        </span>
      </button>`;
  }).join('')}</div>`;

  $$('.mail-row', main).forEach(r => {
    r.addEventListener('click', (e) => {
      if (e.target.closest('[data-star]')) return;
      openThread(r.dataset.thread);
    });
  });
  $$('[data-star]', main).forEach(st =>
    st.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = st.dataset.star;
      const cur = state.get(id)?.starred || false;
      await supa.from('mail_state').upsert(
        { thread_id: id, user_id: me.id, starred: !cur },
        { onConflict: 'thread_id,user_id' });
      loadBox();
    }));
}

/* ------------------------------------------------------------------ */
/*  reading a thread                                                   */
/* ------------------------------------------------------------------ */

async function openThread(id) {
  main.innerHTML = '<div class="ig-loading">Loading…</div>';

  const { data: t } = await supa.from('mail_threads').select('*').eq('id', id).maybeSingle();
  if (!t) { main.innerHTML = '<div class="ig-empty">This mail is not available.</div>'; return; }

  const { data: msgs } = await supa.from('mail_messages').select('*')
    .eq('thread_id', id).order('created_at');

  // Mark read + clear its notification.
  await supa.from('mail_state').upsert(
    { thread_id: id, user_id: me.id, read_at: new Date().toISOString() },
    { onConflict: 'thread_id,user_id' });
  clearNotificationsFor(id);

  const canModerate = me.is_admin;

  main.innerHTML = `
    <div class="mail-thread">
      <div class="mail-thread-head">
        <button class="btn btn-ghost btn-sm" id="mailBack">‹ Back</button>
        <div class="mail-thread-actions">
          <button class="icon-btn" id="mailArchive" title="Archive">🗄</button>
          <button class="icon-btn" id="mailDelete" title="Delete">🗑</button>
        </div>
      </div>
      <h2 class="mail-thread-subject">${esc(t.subject)}</h2>
      <div class="mail-msgs">
        ${(msgs || []).map(m => messageHtml(m)).join('')}
      </div>
      <div class="mail-reply">
        <textarea id="mailReplyBody" rows="3" placeholder="Write a reply…"></textarea>
        <button class="btn btn-primary" id="mailReplySend">Send reply</button>
      </div>
    </div>`;

  $('#mailBack').addEventListener('click', loadBox);

  $('#mailArchive').addEventListener('click', async () => {
    await supa.from('mail_state').upsert(
      { thread_id: id, user_id: me.id, archived: true }, { onConflict: 'thread_id,user_id' });
    toast('Archived.', 'ok'); loadBox();
  });
  $('#mailDelete').addEventListener('click', async () => {
    if (!confirm('Delete this mail from your mailbox?')) return;
    await supa.from('mail_state').upsert(
      { thread_id: id, user_id: me.id, deleted: true }, { onConflict: 'thread_id,user_id' });
    toast('Deleted.', 'ok'); loadBox();
  });

  $('#mailReplySend').addEventListener('click', async (e) => {
    const body = $('#mailReplyBody').value.trim();
    if (!body) return;
    e.target.disabled = true;
    const { error } = await supa.rpc('mail_reply', { p_thread: id, p_body: body });
    if (error) { toast(error.message, 'error'); e.target.disabled = false; return; }
    playSound('sent');
    openThread(id);
  });
}

function messageHtml(m) {
  const addr = m.from_addr || addrOf(m.from_name);
  return `
    <div class="mail-msg ${m.from_recipient ? 'from-me-side' : ''}">
      <div class="mail-msg-head">
        <strong>${esc(m.from_name)}</strong>
        <span class="mail-addr mono">${esc(addr)}</span>
        <span class="mail-msg-time mono">${esc(fullStamp(m.created_at))}</span>
      </div>
      <div class="mail-msg-body">${esc(m.body)}</div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  admin: compose                                                    */
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

async function openCompose() {
  // Gather tags and accounts for the audience picker.
  const [{ data: tagRows }, { data: people }] = await Promise.all([
    supa.from('account_tags').select('tag'),
    supa.from('profiles').select('id, username').neq('id', me.id).order('username')
  ]);
  const tags = [...new Set((tagRows || []).map(r => r.tag))].sort();

  const { root, close } = sheet({
    title: 'Compose mail', wide: true,
    body: `
      <div class="field">
        <label>From</label>
        <div class="mail-from-row">
          <input id="cFromName" placeholder="Sender name" value="${esc(me.username)}">
          <input id="cFromAddr" class="mono" placeholder="address" value="${esc(myAddr)}">
        </div>
        <div class="hint">Change these to send as an NPC — any name and address you like.</div>
      </div>

      <div class="field">
        <label>To</label>
        <div class="seg" id="cAudience">
          <button type="button" data-aud="all" class="on">Everyone</button>
          <button type="button" data-aud="tag">By tag</button>
          <button type="button" data-aud="list">Pick accounts</button>
        </div>
      </div>

      <div class="field" id="cTagWrap" hidden>
        <label for="cTag">Tag</label>
        ${tags.length
          ? `<select id="cTag">${tags.map(t => `<option>${esc(t)}</option>`).join('')}</select>`
          : '<div class="muted small">No tags yet — add some from the # button.</div>'}
      </div>

      <div class="field" id="cListWrap" hidden>
        <label>Accounts</label>
        <div class="mail-picklist">
          ${(people || []).map(p => `
            <label class="mail-pick"><input type="checkbox" value="${esc(p.id)}"> ${esc(p.username)}</label>`).join('')}
        </div>
      </div>

      <div class="field">
        <label for="cSubject">Subject</label>
        <input id="cSubject" maxlength="140">
      </div>
      <div class="field">
        <label for="cBody">Message</label>
        <textarea id="cBody" rows="6"></textarea>
      </div>
      <div id="cMsg"></div>`,
    footer: `<button class="btn btn-primary" id="cSend">Send</button>`
  });

  let audience = 'all';
  $$('#cAudience [data-aud]', root).forEach(b => b.addEventListener('click', () => {
    audience = b.dataset.aud;
    $$('#cAudience [data-aud]', root).forEach(x => x.classList.toggle('on', x === b));
    $('#cTagWrap', root).hidden = audience !== 'tag';
    $('#cListWrap', root).hidden = audience !== 'list';
  }));

  $('#cSend', root).addEventListener('click', async (e) => {
    const subject = $('#cSubject', root).value.trim();
    const bodyTxt = $('#cBody', root).value.trim();
    if (!subject) return msg('Add a subject.');
    if (!bodyTxt) return msg('Write a message.');

    const recipients = audience === 'list'
      ? $$('#cListWrap input:checked', root).map(i => i.value) : [];
    if (audience === 'list' && !recipients.length) return msg('Pick at least one account.');
    const tag = audience === 'tag' ? ($('#cTag', root)?.value || null) : null;
    if (audience === 'tag' && !tag) return msg('No tag selected.');

    e.target.disabled = true;
    const { data, error } = await supa.rpc('mail_send', {
      p_subject: subject, p_body: bodyTxt,
      p_sender_name: $('#cFromName', root).value.trim() || me.username,
      p_sender_addr: $('#cFromAddr', root).value.trim() || myAddr,
      p_audience: audience, p_tag: tag, p_recipients: recipients
    });
    if (error) { msg(error.message); e.target.disabled = false; return; }
    close();
    playSound('sent');
    toast(`Sent to ${data} recipient${data === 1 ? '' : 's'}.`, 'ok');
    if (box === 'sent') loadBox();
  });

  function msg(t) { $('#cMsg', root).innerHTML = `<div class="notice notice-error">${esc(t)}</div>`; }
}

/* ------------------------------------------------------------------ */
/*  admin: tag manager                                                */
/* ------------------------------------------------------------------ */

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

  const { root, close } = sheet({
    title: 'Account tags', wide: true,
    body: `
      <p class="muted small">Tag accounts, then mail a whole tag at once.</p>
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
  box = t.dataset.box;
  $$('.mail-tab').forEach(x => x.classList.toggle('is-on', x === t));
  loadBox();
}));

$('#mailCompose')?.addEventListener('click', openCompose);
$('#mailTags')?.addEventListener('click', openTags);

// Live: new mail or replies refresh the current box.
supa.channel('mail-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_threads' }, () => loadBox())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_messages' }, () => {})
  .subscribe();

// Deep link from a notification.
const wantThread = new URLSearchParams(location.search).get('t');
if (wantThread) openThread(wantThread);
else loadBox();
