// =====================================================================
//  NPC STUDIO — run every NPC from one place
//
//  Inbox: every conversation that has an NPC in it, newest first, with
//         unread counts. Open one and reply as any NPC in it — no
//         signing in and out.
//  Cast:  your NPCs as cards. Create, edit (name, number, picture, role,
//         private notes), message, sign in as, archive or delete.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource, startPresence,
  esc, toast, uploadFile, shrinkImage, lightbox, initials, shortTime, dayLabel, formatNumber, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { playSound } from './sfx.js';
import {
  createNpc, signInAs, rollNumber, legacyRoster, forgetLegacy
} from './npc.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');
if (!me.is_admin) { location.replace('home.html'); throw new Error('not admin'); }

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); } catch {}

const main = $('#nsMain');
const COLORS = ['#CFF23A', '#FF8A3D', '#FF4D6D', '#B57BFF', '#4DA3FF', '#2FD4B4', '#F5D810', '#E0E0E0'];

let people = new Map();     // id -> profile
let npcs = new Map();       // id -> npc row
let inbox = [];             // rows from npc_inbox()
let view = { name: 'inbox', conv: null, filter: null };
let ready = false;

/* ------------------------------------------------------------------ */
/*  data                                                              */
/* ------------------------------------------------------------------ */

async function loadPeople() {
  const { data } = await supa.from('profiles').select('id, username, phone_number, avatar_url, bio, is_admin, created_at');
  people = new Map((data || []).map(p => [p.id, p]));
}

async function loadNpcs() {
  const { data, error } = await supa.from('npcs').select('*');
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message)
    ? 'The NPC Studio isn\'t set up yet — run sql/npc.sql in the Supabase SQL Editor.' : error.message);
  npcs = new Map((data || []).map(n => [n.id, n]));
}

async function loadInbox() {
  const { data, error } = await supa.rpc('npc_inbox');
  if (error) throw new Error(error.message);
  inbox = data || [];
  const unread = inbox.reduce((s, r) => s + (r.unread || 0), 0);
  const b = $('#nsUnread'); b.hidden = !unread; b.textContent = unread > 99 ? '99+' : unread;
}

const nameOf = id => people.get(id)?.username || '[deleted]';
const isNpc = id => npcs.has(id);
const colorOf = id => npcs.get(id)?.color || '#CFF23A';
const activeNpcs = () => [...npcs.values()].filter(n => !n.archived && people.has(n.id))
  .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));

function avatar(id, size = 36, ring = false) {
  const p = people.get(id);
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;${ring && isNpc(id) ? `box-shadow:0 0 0 2px #0B0B0B,0 0 0 4px ${colorOf(id)};` : ''}`;
  return `<span class="ns-av" style="${style}">${p?.avatar_url
    ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p?.username || '?'))}</span>`;
}

function convTitle(r) {
  if (r.title) return r.title;
  const others = (r.member_ids || []).filter(id => !isNpc(id));
  const npcNames = (r.npc_ids || []).map(nameOf);
  return `${npcNames.join(' & ')} ↔ ${others.map(nameOf).join(', ') || 'only NPCs'}`;
}

/* ------------------------------------------------------------------ */
/*  router                                                            */
/* ------------------------------------------------------------------ */

async function go(name, opts = {}) {
  view = { ...view, name, ...opts };
  $$('.ns-tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === name));
  try {
    if (name === 'inbox') await viewInbox();
    else if (name === 'cast') viewCast();
  } catch (err) {
    main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ */
/*  INBOX                                                             */
/* ------------------------------------------------------------------ */

async function viewInbox() {
  if (!main.querySelector('.ns-inbox')) {
    main.innerHTML = `
      <div class="ns-inbox ${view.conv ? 'has-thread' : ''}">
        <aside class="ns-list">
          <div class="ns-filter" id="nsFilter"></div>
          <input type="search" class="ns-search" id="nsSearch" placeholder="Search conversations">
          <div id="nsRows"></div>
        </aside>
        <section class="ns-thread" id="nsThread"></section>
      </div>`;
    $('#nsSearch').addEventListener('input', paintRows);
  }
  paintFilter();
  paintRows();
  if (view.conv) await openThread(view.conv);
  else paintEmptyThread();
}

function paintFilter() {
  const list = activeNpcs();
  $('#nsFilter').innerHTML = list.length ? `
    <button class="ns-chip ${!view.filter ? 'on' : ''}" data-filter="">All</button>
    ${list.map(n => {
      const unread = inbox.filter(r => (r.npc_ids || []).includes(n.id)).reduce((s, r) => s + r.unread, 0);
      return `<button class="ns-chip ${view.filter === n.id ? 'on' : ''}" data-filter="${esc(n.id)}" style="--c:${esc(colorOf(n.id))}">
        ${avatar(n.id, 20)} ${esc(nameOf(n.id))}${unread ? ` <b>${unread}</b>` : ''}</button>`;
    }).join('')}` : '';
  $$('[data-filter]', main).forEach(b => b.addEventListener('click', () => {
    view.filter = b.dataset.filter || null; paintFilter(); paintRows();
  }));
}

function paintRows() {
  const q = ($('#nsSearch')?.value || '').trim().toLowerCase();
  const rows = inbox.filter(r => !view.filter || (r.npc_ids || []).includes(view.filter))
    .filter(r => !q || `${convTitle(r)} ${r.last_body || ''}`.toLowerCase().includes(q));

  if (!npcs.size) {
    $('#nsRows').innerHTML = `<div class="ns-empty"><span>🎭</span><strong>No NPCs yet</strong>
      Create one and anything players text them shows up here.
      <button class="btn btn-primary" data-new-npc>Create an NPC</button></div>`;
    $('[data-new-npc]', main)?.addEventListener('click', () => openEditor());
    return;
  }
  $('#nsRows').innerHTML = rows.map(r => {
    const lead = (r.npc_ids || [])[0];
    const other = (r.member_ids || []).find(id => !isNpc(id)) || lead;
    const who = r.last_sender ? (isNpc(r.last_sender) ? `${nameOf(r.last_sender)} (you)` : nameOf(r.last_sender)) : '';
    return `
      <button class="ns-row ${r.unread ? 'unread' : ''} ${view.conv === r.conversation_id ? 'on' : ''}" data-conv="${esc(r.conversation_id)}">
        <span class="ns-row-av">${avatar(other, 42)}<span class="ns-row-npc">${avatar(lead, 22, true)}</span></span>
        <span class="ns-row-main">
          <span class="ns-row-top"><strong>${esc(convTitle(r))}</strong><time>${esc(shortTime(r.last_at))}</time></span>
          <span class="ns-row-snip">${r.last_body || r.last_image
            ? `${who ? `<b>${esc(who)}:</b> ` : ''}${esc(r.last_body || '📷 Photo')}` : '<i>No messages yet</i>'}</span>
        </span>
        ${r.unread ? `<span class="ns-pill">${r.unread}</span>` : ''}
      </button>`;
  }).join('') || `<div class="ns-empty small">${q || view.filter ? 'Nothing matches.' : 'No one has texted your NPCs yet. Start a conversation with ✎ New message.'}</div>`;

  $$('[data-conv]', main).forEach(b => b.addEventListener('click', () => {
    view.conv = b.dataset.conv;
    history.replaceState(null, '', `?c=${view.conv}`);
    $$('.ns-row', main).forEach(x => x.classList.toggle('on', x === b));
    openThread(view.conv);
  }));
}

function paintEmptyThread() {
  $('#nsThread').innerHTML = `<div class="ns-empty"><span>💬</span><strong>Pick a conversation</strong>
    Reply as any NPC in it — you stay signed in as yourself.</div>`;
  main.querySelector('.ns-inbox')?.classList.remove('has-thread');
}

let threadMsgs = [];

async function openThread(conv) {
  const r = inbox.find(x => x.conversation_id === conv);
  const box = $('#nsThread');
  main.querySelector('.ns-inbox')?.classList.add('has-thread');
  if (!r) { box.innerHTML = '<div class="ns-empty">That conversation has no NPC in it any more.</div>'; return; }

  const { data } = await supa.from('messages').select('*').eq('conversation_id', conv)
    .order('created_at', { ascending: true }).limit(500);
  threadMsgs = data || [];
  const inConv = (r.npc_ids || []).filter(id => npcs.has(id));
  const lastNpc = [...threadMsgs].reverse().find(m => inConv.includes(m.sender_id))?.sender_id;
  const speaker = view.speaker && inConv.includes(view.speaker) ? view.speaker : (lastNpc || inConv[0]);

  box.innerHTML = `
    <header class="ns-thread-head">
      <button class="icon-btn ns-back" id="nsBack" title="Back">‹</button>
      <div class="ns-thread-title">
        <strong>${esc(convTitle(r))}</strong>
        <span class="ns-members">${(r.member_ids || []).map(id => `<span class="ns-member ${isNpc(id) ? 'npc' : ''}" style="--c:${esc(colorOf(id))}">${esc(nameOf(id))}${isNpc(id) ? ' · NPC' : ''}</span>`).join('')}</span>
      </div>
      <button class="ns-btn" id="nsAddNpc" title="Bring another NPC into this conversation">＋ NPC</button>
    </header>
    <div class="ns-msgs" id="nsMsgs">${paintMessages(threadMsgs)}</div>
    <form class="ns-compose" id="nsForm">
      <label class="ns-as" title="Who you're speaking as">
        <span>As</span>
        <select id="nsAs">${inConv.map(id => `<option value="${esc(id)}" ${id === speaker ? 'selected' : ''}>${esc(nameOf(id))}</option>`).join('')}</select>
      </label>
      <div class="ns-compose-row">
        <button type="button" class="icon-btn" id="nsImg" title="Send a picture">📷</button>
        <input type="file" id="nsFile" accept="image/*" hidden>
        <textarea id="nsText" rows="1" placeholder="Message as ${esc(nameOf(speaker))}…"></textarea>
        <button class="ns-send" id="nsSend" title="Send (Enter)">➤</button>
      </div>
    </form>`;

  const msgs = $('#nsMsgs');
  msgs.scrollTop = msgs.scrollHeight;
  $$('.ns-bubble img', box).forEach(im => im.addEventListener('click', () => lightbox(im.src)));
  $('#nsBack').addEventListener('click', () => { view.conv = null; history.replaceState(null, '', 'npcs.html'); paintRows(); paintEmptyThread(); });
  $('#nsAddNpc').addEventListener('click', () => pickNpcToAdd(conv, inConv));

  const as = $('#nsAs'), text = $('#nsText');
  const paintAs = () => {
    view.speaker = as.value;
    as.parentElement.style.setProperty('--c', colorOf(as.value));
    text.placeholder = `Message as ${nameOf(as.value)}…`;
  };
  as.addEventListener('change', paintAs); paintAs();
  const grow = () => { text.style.height = 'auto'; text.style.height = Math.min(160, text.scrollHeight) + 'px'; };
  text.addEventListener('input', grow);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#nsForm').requestSubmit(); }
  });
  $('#nsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body) return;
    await send(conv, as.value, body, null);
    text.value = ''; grow(); text.focus();
  });
  $('#nsImg').addEventListener('click', () => $('#nsFile').click());
  $('#nsFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const btn = $('#nsImg'); btn.disabled = true; btn.textContent = '…';
    try {
      const url = await uploadFile('attachments', me.id, await shrinkImage(file, 1600, 0.85));
      await send(conv, as.value, text.value.trim() || null, url);
      text.value = ''; grow();
    } catch (err) { toast(err.message || 'Upload failed.', 'error'); }
    btn.disabled = false; btn.textContent = '📷'; ev.target.value = '';
  });

  if (r.unread) {
    await supa.rpc('npc_mark_read', { conv });
    r.unread = 0;
    paintRows(); paintFilter();
    const total = inbox.reduce((s, x) => s + (x.unread || 0), 0);
    $('#nsUnread').hidden = !total; $('#nsUnread').textContent = total;
  }
  clearNotificationsFor(conv);
  if (matchMedia('(min-width: 761px)').matches) text.focus();
}

function paintMessages(list) {
  if (!list.length) return '<div class="ns-empty small">No messages yet — say something.</div>';
  let html = '', lastDay = '', lastSender = null;
  for (const m of list) {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) { html += `<div class="ns-day">${esc(day)}</div>`; lastDay = day; lastSender = null; }
    const npc = isNpc(m.sender_id);
    const first = m.sender_id !== lastSender;
    html += `
      <div class="ns-msg ${npc ? 'npc' : 'them'} ${first ? 'first' : ''}" style="--c:${esc(colorOf(m.sender_id))}">
        ${!npc ? `<span class="ns-msg-av">${first ? avatar(m.sender_id, 28) : ''}</span>` : ''}
        <div class="ns-bubble-wrap">
          ${first ? `<span class="ns-msg-name">${esc(nameOf(m.sender_id))}${npc ? ' <i>NPC</i>' : ''}</span>` : ''}
          <div class="ns-bubble">${m.image_url ? `<img src="${esc(m.image_url)}" alt="" loading="lazy">` : ''}${m.body ? `<span>${esc(m.body).replace(/\n/g, '<br>')}</span>` : ''}</div>
        </div>
        <time>${esc(shortTime(m.created_at))}</time>
      </div>`;
    lastSender = m.sender_id;
  }
  return html;
}

async function send(conv, npcId, body, image) {
  const btn = $('#nsSend'); if (btn) btn.disabled = true;
  const { error } = await supa.rpc('npc_send', { npc: npcId, conv, p_body: body, p_image: image });
  if (btn) btn.disabled = false;
  if (error) return toast(error.message, 'error');
  playSound('sent');
  await refresh({ keepThread: true });
}

function pickNpcToAdd(conv, inConv) {
  const choices = activeNpcs().filter(n => !inConv.includes(n.id));
  if (!choices.length) return toast('Every NPC is already in this conversation — create another in Cast.', 'info');
  const { root, close } = sheet('Bring an NPC in', `
    <p class="muted small" style="margin-top:0">They join the conversation. Players will see them in the member list.</p>
    <div class="ns-pick">${choices.map(n => `<button class="ns-pick-row" data-pick="${esc(n.id)}">${avatar(n.id, 32, true)}
      <span><strong>${esc(nameOf(n.id))}</strong><small>${esc(n.role || '')}</small></span></button>`).join('')}</div>`);
  $$('[data-pick]', root).forEach(b => b.addEventListener('click', async () => {
    const { error } = await supa.rpc('npc_join', { npc: b.dataset.pick, conv });
    if (error) return toast(error.message, 'error');
    close(); view.speaker = b.dataset.pick;
    toast(`${nameOf(b.dataset.pick)} joined.`, 'ok');
    await refresh({ keepThread: true });
  }));
}

/* ------------------------------------------------------------------ */
/*  NEW MESSAGE (as an NPC)                                           */
/* ------------------------------------------------------------------ */

function openCompose(presetNpc = null) {
  const list = activeNpcs();
  if (!list.length) { toast('Create an NPC first.', 'info'); return openEditor(); }
  const targets = [...people.values()].filter(p => !p.is_admin)
    .sort((a, b) => (isNpc(a.id) - isNpc(b.id)) || a.username.localeCompare(b.username));
  const { root, close } = sheet('New message', `
    <div class="field"><label>From</label>
      <div class="ns-from">${list.map(n => `<button type="button" class="ns-chip ${n.id === (presetNpc || list[0].id) ? 'on' : ''}" data-from="${esc(n.id)}" style="--c:${esc(colorOf(n.id))}">${avatar(n.id, 20)} ${esc(nameOf(n.id))}</button>`).join('')}</div></div>
    <div class="field"><label for="ncFind">To — pick one person, or several for a group</label>
      <input type="search" id="ncFind" placeholder="Search players">
      <div class="ns-to" id="ncTo">${targets.map(p => `<label class="ns-to-row" data-name="${esc(p.username.toLowerCase())}">
        <input type="checkbox" value="${esc(p.id)}"> ${avatar(p.id, 26)} <span>${esc(p.username)}</span>
        ${isNpc(p.id) ? '<i class="ns-tag">NPC</i>' : ''}</label>`).join('') || '<p class="muted">No players yet.</p>'}</div></div>
    <div class="field" id="ncGroupWrap" hidden><label for="ncGroup">Group name (optional)</label>
      <input type="text" id="ncGroup" maxlength="60" placeholder="e.g. Study group"></div>
    <div class="field"><label for="ncText">First message</label>
      <textarea id="ncText" rows="3" placeholder="Optional — you can also just open the thread"></textarea></div>`,
    `<button class="btn btn-primary" id="ncGo">Open conversation</button>`);

  let from = presetNpc || list[0].id;
  $$('[data-from]', root).forEach(b => b.addEventListener('click', () => {
    from = b.dataset.from; $$('[data-from]', root).forEach(x => x.classList.toggle('on', x === b));
    $$('#ncTo input', root).forEach(i => { i.disabled = i.value === from; if (i.disabled) i.checked = false; });
  }));
  $$('#ncTo input', root).forEach(i => { i.disabled = i.value === from; });
  $('#ncFind', root).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('.ns-to-row', root).forEach(r => { r.hidden = q && !r.dataset.name.includes(q); });
  });
  root.addEventListener('change', () => {
    $('#ncGroupWrap', root).hidden = $$('#ncTo input:checked', root).length < 2;
  });
  $('#ncGo', root).addEventListener('click', async (e) => {
    const to = $$('#ncTo input:checked', root).map(i => i.value);
    if (!to.length) return toast('Pick who to message.', 'error');
    e.target.disabled = true;
    const { data: conv, error } = to.length === 1
      ? await supa.rpc('npc_start_dm', { npc: from, other_user: to[0] })
      : await supa.rpc('npc_start_group', { npc: from, member_ids: to, group_title: $('#ncGroup', root).value });
    if (error) { e.target.disabled = false; return toast(error.message, 'error'); }
    const first = $('#ncText', root).value.trim();
    if (first) await supa.rpc('npc_send', { npc: from, conv, p_body: first, p_image: null });
    close();
    view.speaker = from;
    await refresh();
    go('inbox', { conv });
    history.replaceState(null, '', `?c=${conv}`);
  });
}

/* ------------------------------------------------------------------ */
/*  CAST                                                              */
/* ------------------------------------------------------------------ */

function viewCast() {
  view.conv = null;
  const all = [...npcs.values()].filter(n => people.has(n.id))
    .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
  const live = all.filter(n => !n.archived), archived = all.filter(n => n.archived);
  const stats = id => {
    const rows = inbox.filter(r => (r.npc_ids || []).includes(id));
    return { convs: rows.length, unread: rows.reduce((s, r) => s + r.unread, 0) };
  };
  const legacy = legacyRoster().filter(l => {
    const p = [...people.values()].find(x => x.username.toLowerCase() === l.username.toLowerCase());
    return p && !npcs.has(p.id);
  });

  const card = n => {
    const p = people.get(n.id), s = stats(n.id);
    return `
      <article class="ns-card ${n.archived ? 'archived' : ''}" style="--c:${esc(n.color || '#CFF23A')}">
        <div class="ns-card-top">
          ${avatar(n.id, 56, true)}
          <div class="ns-card-id">
            <strong>${esc(p.username)}</strong>
            ${n.role ? `<span class="ns-role">${esc(n.role)}</span>` : ''}
            <span class="mono">${esc(formatNumber(p.phone_number))}</span>
          </div>
          ${s.unread ? `<span class="ns-pill" title="Unread">${s.unread}</span>` : ''}
        </div>
        ${n.notes ? `<p class="ns-notes">${esc(n.notes)}</p>` : '<p class="ns-notes muted">No notes.</p>'}
        <div class="ns-card-meta">${s.convs} conversation${s.convs === 1 ? '' : 's'}${n.is_student ? ' · Justice U student' : ''}</div>
        <div class="ns-card-actions">
          ${n.archived
            ? `<button class="btn btn-sm btn-ghost" data-unarchive="${esc(n.id)}">Restore</button>
               <button class="btn btn-sm btn-danger" data-delete="${esc(n.id)}">Delete…</button>`
            : `<button class="btn btn-sm btn-primary" data-msg="${esc(n.id)}">Message</button>
               <button class="btn btn-sm btn-ghost" data-edit="${esc(n.id)}">Edit</button>
               <button class="btn btn-sm btn-ghost" data-signin="${esc(n.id)}" title="Use the other apps (Instagrat, Neomail…) as this NPC">Sign in as</button>`}
        </div>
      </article>`;
  };

  main.innerHTML = `
    <div class="ns-cast">
      ${legacy.length ? `<div class="ns-import">
        <div><strong>${legacy.length} puppet${legacy.length === 1 ? '' : 's'} saved in this browser</strong>
          <span>${legacy.map(l => esc(l.username)).join(', ')} — move ${legacy.length === 1 ? 'it' : 'them'} into the Studio so ${legacy.length === 1 ? 'it works' : 'they work'} from any device.</span></div>
        <button class="btn btn-sm btn-primary" id="nsImport">Move into Studio</button></div>` : ''}
      <div class="ns-cast-head">
        <h2>Your cast <span>${live.length}</span></h2>
        <button class="btn btn-sm btn-ghost" id="nsAdopt" title="Turn an account that already exists (e.g. an old puppet) into an NPC">Use an existing account</button>
      </div>
      <div class="ns-grid">
        ${live.map(card).join('')}
        <button class="ns-card ns-card-new" data-new-npc><span>＋</span>New NPC</button>
      </div>
      ${archived.length ? `<details class="ns-archived"><summary>Archived (${archived.length})</summary>
        <div class="ns-grid">${archived.map(card).join('')}</div></details>` : ''}
    </div>`;

  $$('[data-new-npc]', main).forEach(b => b.addEventListener('click', () => openEditor()));
  $$('[data-edit]', main).forEach(b => b.addEventListener('click', () => openEditor(b.dataset.edit)));
  $$('[data-msg]', main).forEach(b => b.addEventListener('click', () => openCompose(b.dataset.msg)));
  $$('[data-signin]', main).forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.signin;
    if (!confirm(`Sign this browser in as ${nameOf(id)}?\n\nYou'll use every app as them. A bar at the top takes you back to your own account.`)) return;
    b.disabled = true; b.textContent = 'Signing in…';
    try { await signInAs(people.get(id), npcs.get(id)); }
    catch (err) { toast(`Couldn't sign in: ${err.message}`, 'error'); b.disabled = false; b.textContent = 'Sign in as'; }
  }));
  $$('[data-unarchive]', main).forEach(b => b.addEventListener('click', () => setArchived(b.dataset.unarchive, false)));
  $$('[data-delete]', main).forEach(b => b.addEventListener('click', () => deleteNpc(b.dataset.delete)));
  $('#nsAdopt').addEventListener('click', openAdopt);
  $('#nsImport')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    let n = 0;
    for (const l of legacy) {
      const p = [...people.values()].find(x => x.username.toLowerCase() === l.username.toLowerCase());
      const { error } = await supa.rpc('npc_register', { target: p.id, p_secret: l.password || null, p_student: false });
      if (error) toast(`${l.username}: ${error.message}`, 'error');
      else { n++; forgetLegacy(l.username); }
    }
    toast(`Moved ${n} puppet${n === 1 ? '' : 's'} into the Studio.`, 'ok');
    await refresh(); viewCast();
  });
}

async function setArchived(id, archived) {
  const { error } = await supa.from('npcs').update({ archived }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast(archived ? `${nameOf(id)} archived — hidden here, but players can still see their messages.` : `${nameOf(id)} restored.`, 'ok');
  await refresh(); viewCast();
}

async function deleteNpc(id) {
  const name = nameOf(id);
  const typed = prompt(`Delete ${name}'s account for good?\n\nTheir old messages stay but show as "[deleted]". This can't be undone.\n\nType ${name} to confirm.`);
  if (typed === null) return;
  if (typed.trim() !== name) return toast('Name didn\'t match — nothing deleted.', 'error');
  const { error } = await supa.rpc('npc_delete', { target: id });
  if (error) return toast(error.message, 'error');
  toast(`${name} deleted.`, 'ok');
  await refresh(); viewCast();
}

/* Turn an account that already exists into an NPC. */
function openAdopt() {
  const choices = [...people.values()].filter(p => !p.is_admin && !npcs.has(p.id))
    .sort((a, b) => a.username.localeCompare(b.username));
  const { root, close } = sheet('Use an existing account', `
    <p class="muted small" style="margin-top:0">For accounts made before the Studio — like old puppets. The account
      moves into your cast; you can reply as it right away, and "Sign in as" sets it a new password automatically.
      <strong>Don't pick a real player.</strong></p>
    <div class="ns-pick">${choices.map(p => `<button class="ns-pick-row" data-adopt="${esc(p.id)}">${avatar(p.id, 32)}
      <span><strong>${esc(p.username)}</strong><small>${esc(formatNumber(p.phone_number))}</small></span></button>`).join('')
      || '<p class="muted">No other accounts.</p>'}</div>`);
  $$('[data-adopt]', root).forEach(b => b.addEventListener('click', async () => {
    const name = nameOf(b.dataset.adopt);
    if (!confirm(`Make ${name} an NPC? They'll be taken out of Justice U enrolment (you can turn that back on in Edit).`)) return;
    const { error } = await supa.rpc('npc_register', { target: b.dataset.adopt, p_student: false });
    if (error) return toast(error.message, 'error');
    close(); toast(`${name} is now in your cast.`, 'ok');
    await refresh(); viewCast();
  }));
}

/* ------------------------------------------------------------------ */
/*  create / edit an NPC                                              */
/* ------------------------------------------------------------------ */

function openEditor(id = null) {
  const p = id ? people.get(id) : null;
  const n = id ? npcs.get(id) : null;
  let avatarUrl = p?.avatar_url || '';
  let color = n?.color || COLORS[npcs.size % COLORS.length];

  const { root, close } = sheet(id ? `Edit ${p.username}` : 'New NPC', `
    <div class="ns-edit-top">
      <button type="button" class="ns-edit-av" id="neAv" title="Change picture">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : '<span>📷<br>Add picture</span>'}</button>
      <input type="file" id="neFile" accept="image/*" hidden>
      <div class="ns-edit-fields">
        <div class="field"><label for="neName">Name players see</label>
          <input type="text" id="neName" maxlength="24" value="${esc(p?.username || '')}" placeholder="e.g. Dispatch, Mr_Hale" autocomplete="off"></div>
        <div class="field"><label for="neNum">Phone number</label>
          <div class="inline-row"><input type="text" id="neNum" class="mono" value="${esc(p ? formatNumber(p.phone_number) : rollNumber())}">
          <button type="button" class="btn btn-ghost btn-sm" id="neRoll">Roll</button></div></div>
      </div>
    </div>
    <div class="field"><label for="neRole">Role <span class="muted">(only you see this)</span></label>
      <input type="text" id="neRole" maxlength="60" value="${esc(n?.role || '')}" placeholder="e.g. Night dispatcher, Rival student, Informant"></div>
    <div class="field"><label>Colour <span class="muted">(how they show in your Studio)</span></label>
      <div class="ns-swatches">${COLORS.map(c => `<button type="button" class="ns-swatch ${c === color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field"><label for="neNotes">Notes <span class="muted">(only you see this — personality, secrets, what they know)</span></label>
      <textarea id="neNotes" rows="3" maxlength="4000">${esc(n?.notes || '')}</textarea></div>
    <div class="field"><label for="neBio">Bio <span class="muted">(players see this on their profile)</span></label>
      <input type="text" id="neBio" maxlength="160" value="${esc(p?.bio || '')}"></div>
    <label class="check"><input type="checkbox" id="neStudent" ${n?.is_student ? 'checked' : ''}>
      <span>A Justice U student (enrolled in classes, gets "mail everyone")</span></label>
    <div id="neMsg"></div>`,
    `${id ? `<button class="btn btn-ghost" id="neArchive">Archive</button><span class="grow"></span>` : ''}
     <button class="btn btn-primary" id="neSave">${id ? 'Save' : 'Create NPC'}</button>`);

  $('#neRoll', root).addEventListener('click', () => { $('#neNum', root).value = rollNumber(); });
  $$('[data-color]', root).forEach(b => b.addEventListener('click', () => {
    color = b.dataset.color; $$('[data-color]', root).forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#neAv', root).addEventListener('click', () => $('#neFile', root).click());
  $('#neFile', root).addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const btn = $('#neAv', root); btn.innerHTML = '<span>Uploading…</span>';
    try {
      avatarUrl = await uploadFile('avatars', me.id, await shrinkImage(file, 512, 0.9));
      btn.innerHTML = `<img src="${esc(avatarUrl)}" alt="">`;
    } catch (err) {
      try { avatarUrl = await uploadFile('attachments', me.id, await shrinkImage(file, 512, 0.9)); btn.innerHTML = `<img src="${esc(avatarUrl)}" alt="">`; }
      catch { toast(err.message || 'Upload failed.', 'error'); btn.innerHTML = '<span>📷<br>Add picture</span>'; }
    }
  });
  $('#neArchive', root)?.addEventListener('click', async () => { close(); await setArchived(id, true); });

  $('#neSave', root).addEventListener('click', async (e) => {
    const say = t => { $('#neMsg', root).innerHTML = `<div class="notice notice-error">${esc(t)}</div>`; toast(t, 'error'); };
    const name = $('#neName', root).value.trim();
    const phone = formatNumber($('#neNum', root).value.trim());
    const role = $('#neRole', root).value.trim();
    const notes = $('#neNotes', root).value.trim();
    const bio = $('#neBio', root).value.trim();
    const student = $('#neStudent', root).checked;
    if (!/^[A-Za-z0-9_.-]{2,24}$/.test(name)) return say('Names are 2–24 characters: letters, numbers, dot, dash or underscore (no spaces).');
    if (phone.replace(/\D/g, '').length < 7) return say('Give them a phone number with at least 7 digits.');

    const btn = e.currentTarget; btn.disabled = true; btn.textContent = id ? 'Saving…' : 'Creating…';
    try {
      let target = id;
      if (!id) {
        target = await createNpc(name, phone, { role, notes, color, student });
      } else if (name !== p.username) {
        const { error } = await supa.rpc('admin_rename_user', { target: id, new_name: name });
        if (error) throw new Error(/admin_rename_user/.test(error.message)
          ? 'Renaming needs sql/admin-rename.sql — run it in Supabase.' : error.message);
      }
      const prof = { avatar_url: avatarUrl || null, bio: bio || null };
      if (!id || phone !== formatNumber(p.phone_number)) prof.phone_number = phone;
      const { error: pErr } = await supa.from('profiles').update(prof).eq('id', target);
      if (pErr) throw new Error(/phone_number/.test(pErr.message) ? 'That number is already taken.' : pErr.message);
      if (id) {
        const { error: nErr } = await supa.from('npcs').update({ role: role || null, notes: notes || null, color, is_student: student }).eq('id', id);
        if (nErr) throw nErr;
        if (n?.is_student && !student) await supa.rpc('npc_register', { target: id, p_student: false });
      }
      close();
      playSound('sent');
      toast(id ? 'Saved.' : `${name} is live on ${phone}. Message them from the Inbox or the Cast.`, 'ok');
      await refresh();
      if (view.name === 'cast') viewCast();
    } catch (err) {
      btn.disabled = false; btn.textContent = id ? 'Save' : 'Create NPC';
      say(err.message || String(err));
    }
  });
  if (!id) setTimeout(() => $('#neName', root).focus(), 50);
}

/* ------------------------------------------------------------------ */
/*  a small sheet (modal) helper                                      */
/* ------------------------------------------------------------------ */

function sheet(title, body, foot = '') {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('[data-x]', root).addEventListener('click', close);
  $('.scrim', root).addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  return { root, close };
}

/* ------------------------------------------------------------------ */
/*  refresh + live updates                                            */
/* ------------------------------------------------------------------ */

async function refresh({ keepThread = false } = {}) {
  await Promise.all([loadPeople(), loadNpcs()]);
  await loadInbox();
  if (view.name !== 'inbox' || !main.querySelector('.ns-inbox')) return;
  paintFilter(); paintRows();
  if (keepThread && view.conv) {
    const typed = $('#nsText')?.value || '';
    const hadFocus = document.activeElement === $('#nsText');
    await openThread(view.conv);
    if (typed && $('#nsText')) $('#nsText').value = typed;
    if (hadFocus) $('#nsText')?.focus();
  }
}

let liveTimer = null;
const live = (keepThread) => { clearTimeout(liveTimer); liveTimer = setTimeout(() => refresh({ keepThread }).catch(() => {}), 300); };
supa.channel('npc-studio')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
    if (!ready) return;
    const mine = p.new?.conversation_id === view.conv;
    if (!isNpc(p.new?.sender_id)) playSound('received');
    live(mine);
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'npcs' }, () => { if (ready && view.name === 'cast' && !$('#modalRoot').children.length) refresh().then(viewCast); })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => ready && live(false))
  .subscribe();

$$('.ns-tab').forEach(t => t.addEventListener('click', () => {
  if (t.dataset.view === 'inbox') { main.innerHTML = ''; }
  go(t.dataset.view, t.dataset.view === 'inbox' ? {} : {});
}));
$('#nsNew').addEventListener('click', () => openEditor());
$('#nsCompose').addEventListener('click', () => openCompose());

try {
  await refresh();
} catch (err) {
  main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  throw err;
}
ready = true;
const params = new URLSearchParams(location.search);
if (params.get('tab') === 'cast') go('cast');
else go('inbox', { conv: params.get('c') || null });
