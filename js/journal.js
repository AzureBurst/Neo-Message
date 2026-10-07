// =====================================================================
//  JOURNAL — players keep a log of what their character did
//
//  Each entry is dated on the story clock. Players see only their own;
//  the GM can read every player's journal and leave a note on any
//  entry, which the player sees under it.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource, startPresence,
  esc, toast, uploadFile, shrinkImage, lightbox, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { playSound } from './sfx.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'journal'); } catch {}

if (me.is_admin) $$('.jr-admin').forEach(b => b.hidden = false);

const main = $('#jrMain');
const MOODS = ['😀', '🙂', '😐', '🤔', '😟', '😢', '😠', '😱', '😴', '🔥'];
let view = { name: 'mine' };
let names = new Map();

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

const when = e => new Date(e.story_at || e.created_at);
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayLabel = d => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const timeLabel = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const toInput = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// The real-world time an entry was saved (set by the database, not the
// browser), so the GM can tell when something was actually written.
const realFmt = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const realStamp = e => `🕓 Saved ${esc(realFmt(e.created_at))}`
  + (e.updated_at && new Date(e.updated_at) - new Date(e.created_at) > 60000 ? ` · last edited ${esc(realFmt(e.updated_at))}` : '')
  + ' <span>(real time)</span>';
const paras = t => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const sortEntries = list => list.sort((a, b) => when(b) - when(a) || new Date(b.created_at) - new Date(a.created_at));

async function loadNames() {
  const { data } = await supa.from('profiles').select('id, username, avatar_url, is_admin');
  names = new Map((data || []).map(p => [p.id, p]));
}

async function entriesFor(userId) {
  const q = supa.from('journal_entries').select('*').order('story_at', { ascending: false }).limit(500);
  const { data, error } = userId ? await q.eq('user_id', userId) : await q;
  if (error) throw new Error(/does not exist/i.test(error.message)
    ? 'The journal is not set up yet — run sql/journal.sql in Supabase.' : error.message);
  return sortEntries(data || []);
}

function setTab(name) {
  $$('.jr-tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === name));
}

/* ------------------------------------------------------------------ */
/*  router                                                            */
/* ------------------------------------------------------------------ */

async function go(name, opts = {}) {
  if (view.name === 'edit' && name !== 'edit' && $('#jeBody')?.dataset.dirty === '1'
      && !confirm('Leave without saving? Your draft is kept on this device.')) return;
  view = { name, ...opts };
  main.innerHTML = '<div class="ig-loading">Loading…</div>';
  window.scrollTo(0, 0);
  setTab(name === 'player' ? 'players' : name === 'edit' || name === 'entry' ? (opts.from || 'mine') : name);
  $('#jrNew').hidden = name === 'edit';
  try {
    if (name === 'mine') await viewList(me.id, { own: true });
    else if (name === 'player') await viewList(opts.userId, { own: false });
    else if (name === 'players') await viewPlayers();
    else if (name === 'recent') await viewRecent();
    else if (name === 'entry') await viewEntry(opts.id);
    else if (name === 'edit') await viewEdit(opts.id);
  } catch (err) {
    main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ */
/*  a journal (yours, or a player's when you're the GM)               */
/* ------------------------------------------------------------------ */

function entryCard(e, { showAuthor = false } = {}) {
  const d = when(e);
  const who = names.get(e.user_id);
  return `
    <article class="jr-entry" data-open="${esc(e.id)}" tabindex="0">
      <div class="jr-entry-meta">
        ${showAuthor ? `<b class="jr-author">${esc(who?.username || 'someone')}</b>` : ''}
        <span>${showAuthor ? esc(d.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ' · ' : ''}${esc(timeLabel(d))}</span>
        ${e.location ? `<span class="jr-loc">📍 ${esc(e.location)}</span>` : ''}
        ${e.mood ? `<span class="jr-mood">${esc(e.mood)}</span>` : ''}
      </div>
      ${e.title ? `<h3>${esc(e.title)}</h3>` : ''}
      <div class="jr-entry-body">${paras(e.body)}</div>
      ${e.image_url ? `<img class="jr-entry-img" src="${esc(e.image_url)}" alt="" loading="lazy">` : ''}
      ${e.gm_note ? `<div class="jr-gm-note"><b>GM note</b>${paras(e.gm_note)}</div>` : ''}
      ${me.is_admin ? `<p class="jr-realtime">${realStamp(e)}</p>` : ''}
    </article>`;
}

async function viewList(userId, { own }) {
  if (!own && !names.size) await loadNames();
  const all = await entriesFor(userId);
  if (!own) clearNotificationsFor(userId);
  const who = names.get(userId);

  main.innerHTML = `
    <div class="jr-list">
      ${own ? '' : `<button class="btn btn-ghost btn-sm" id="jrBack">‹ Players</button>`}
      <div class="jr-cover">
        <div>
          <small>${own ? 'The journal of' : 'Reading the journal of'}</small>
          <h2>${esc(own ? me.username : who?.username || 'a player')}</h2>
        </div>
        <span class="jr-count">${all.length} entr${all.length === 1 ? 'y' : 'ies'}</span>
      </div>
      ${all.length > 3 ? `<input type="search" class="jr-search" id="jrSearch" placeholder="Search entries">` : ''}
      <div id="jrEntries"></div>
    </div>`;

  const paint = (q = '') => {
    const t = q.trim().toLowerCase();
    const list = t ? all.filter(e => `${e.title} ${e.body} ${e.location}`.toLowerCase().includes(t)) : all;
    let html = '', last = '';
    for (const e of list) {
      const d = when(e), k = dayKey(d);
      if (k !== last) { html += `<h4 class="jr-day">${esc(dayLabel(d))}</h4>`; last = k; }
      html += entryCard(e);
    }
    $('#jrEntries').innerHTML = html || (t ? '<div class="fl-empty">No entries match.</div>'
      : own ? `<div class="jr-empty"><span>📓</span><strong>Your journal is empty.</strong>
               Write down what your character did today — who they met, what they found, what they're planning.
               <button class="btn btn-primary" id="jrFirst">Write the first entry</button></div>`
            : '<div class="fl-empty">This player hasn\'t written anything yet.</div>');
    $('#jrFirst')?.addEventListener('click', () => go('edit', { from: 'mine' }));
    $$('[data-open]', main).forEach(a => {
      const open = () => go('entry', { id: a.dataset.open, from: own ? 'mine' : 'players', back: view });
      a.addEventListener('click', (ev) => { if (!ev.target.closest('img')) open(); });
      a.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
    });
    $$('.jr-entry-img', main).forEach(im => im.addEventListener('click', () => lightbox(im.src)));
  };
  paint();
  $('#jrSearch')?.addEventListener('input', (e) => paint(e.target.value));
  $('#jrBack')?.addEventListener('click', () => go('players'));
}

/* ------------------------------------------------------------------ */
/*  GM: every player, and the latest entries across everyone          */
/* ------------------------------------------------------------------ */

async function viewPlayers() {
  await loadNames();
  const { data, error } = await supa.from('journal_entries').select('user_id, created_at, story_at');
  if (error) throw new Error(error.message);
  const stats = new Map();
  for (const r of data || []) {
    const s = stats.get(r.user_id) || { n: 0, last: null };
    s.n += 1;
    if (!s.last || new Date(r.created_at) > s.last) s.last = new Date(r.created_at);
    stats.set(r.user_id, s);
  }
  const players = [...names.values()].filter(p => !p.is_admin || stats.has(p.id))
    .sort((a, b) => (stats.get(b.id)?.last || 0) - (stats.get(a.id)?.last || 0) || a.username.localeCompare(b.username));

  main.innerHTML = `
    <div class="jr-list">
      <div class="fl-section-head"><h3>Player journals</h3></div>
      ${players.map(p => {
        const s = stats.get(p.id);
        return `<button class="jr-player" data-player="${esc(p.id)}">
          <span class="jr-avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.username || '?')[0].toUpperCase())}</span>
          <span class="jr-player-name">${esc(p.username)}
            <small>${s ? `Last wrote ${esc(s.last.toLocaleDateString([], { month: 'short', day: 'numeric' }))} · real time` : 'No entries yet'}</small></span>
          <span class="jr-count">${s?.n || 0}</span>
        </button>`;
      }).join('') || '<div class="fl-empty">No players yet.</div>'}
    </div>`;
  $$('[data-player]', main).forEach(b => b.addEventListener('click', () => go('player', { userId: b.dataset.player })));
}

async function viewRecent() {
  await loadNames();
  const all = (await entriesFor(null)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 60);
  main.innerHTML = `
    <div class="jr-list">
      <div class="fl-section-head"><h3>Latest entries</h3><span class="muted small">newest written first</span></div>
      ${all.map(e => entryCard(e, { showAuthor: true })).join('') || '<div class="fl-empty">Nobody has written anything yet.</div>'}
    </div>`;
  $$('[data-open]', main).forEach(a => a.addEventListener('click', () => go('entry', { id: a.dataset.open, from: 'recent', back: { name: 'recent' } })));
}

/* ------------------------------------------------------------------ */
/*  one entry                                                         */
/* ------------------------------------------------------------------ */

async function viewEntry(id) {
  const { data: e } = await supa.from('journal_entries').select('*').eq('id', id).maybeSingle();
  if (!e) { main.innerHTML = '<div class="ig-empty">That entry is gone.</div>'; return; }
  clearNotificationsFor(id);
  if (me.is_admin && !names.size) await loadNames();
  const own = e.user_id === me.id;
  const d = when(e);
  const back = view.back || (own ? { name: 'mine' } : { name: 'player', userId: e.user_id });

  main.innerHTML = `
    <div class="jr-list">
      <button class="btn btn-ghost btn-sm" id="jrBack">‹ Back</button>
      <article class="jr-page-entry">
        <div class="jr-entry-meta">
          ${own ? '' : `<b class="jr-author">${esc(names.get(e.user_id)?.username || 'someone')}</b>`}
          <span>${esc(dayLabel(d))} · ${esc(timeLabel(d))}</span>
          ${e.location ? `<span class="jr-loc">📍 ${esc(e.location)}</span>` : ''}
          ${e.mood ? `<span class="jr-mood">${esc(e.mood)}</span>` : ''}
        </div>
        ${e.title ? `<h2>${esc(e.title)}</h2>` : ''}
        <div class="jr-entry-body full">${paras(e.body)}</div>
        ${e.image_url ? `<img class="jr-entry-img" src="${esc(e.image_url)}" alt="">` : ''}
        <p class="jr-realtime">${realStamp(e)}</p>
        ${own ? `<div class="jr-entry-actions">
            <button class="btn btn-ghost btn-sm" id="jrDel">Delete</button>
            <button class="btn btn-primary btn-sm" id="jrEdit">Edit</button></div>` : ''}
      </article>

      ${me.is_admin ? `
        <div class="jr-gm-box">
          <label for="jrNote"><b>GM note</b> <span class="muted small">— ${own ? 'on your own entry' : 'the player sees this under their entry and gets a notification'}</span></label>
          <textarea id="jrNote" rows="3" placeholder="A reply, a clue, a consequence…">${esc(e.gm_note || '')}</textarea>
          <div class="jr-entry-actions"><button class="btn btn-primary btn-sm" id="jrNoteSave">Save note</button></div>
        </div>`
      : e.gm_note ? `<div class="jr-gm-note"><b>GM note</b>${paras(e.gm_note)}</div>` : ''}
    </div>`;

  $('.jr-entry-img', main)?.addEventListener('click', (ev) => lightbox(ev.target.src));
  $('#jrBack').addEventListener('click', () => go(back.name, back));
  $('#jrEdit')?.addEventListener('click', () => go('edit', { id, from: 'mine' }));
  $('#jrDel')?.addEventListener('click', async () => {
    if (!confirm('Delete this entry? This can\'t be undone.')) return;
    const { error } = await supa.from('journal_entries').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    toast('Entry deleted.', 'ok'); go('mine');
  });
  $('#jrNoteSave')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const { error } = await supa.rpc('journal_gm_note', { entry: id, note: $('#jrNote').value });
    btn.disabled = false;
    if (error) return toast(error.message, 'error');
    playSound('sent');
    toast($('#jrNote').value.trim() ? 'Note saved — the player has been notified.' : 'Note removed.', 'ok');
  });
}

/* ------------------------------------------------------------------ */
/*  writing                                                           */
/* ------------------------------------------------------------------ */

const draftKey = id => `jr.draft.${me.id}.${id || 'new'}`;

async function viewEdit(id) {
  let e = { title: '', body: '', story_at: storyNow().toISOString(), location: '', mood: '', image_url: '' };
  if (id) {
    const { data } = await supa.from('journal_entries').select('*').eq('id', id).maybeSingle();
    if (!data || data.user_id !== me.id) { main.innerHTML = '<div class="ig-empty">You can only edit your own entries.</div>'; return; }
    e = data;
  }
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch {}
  if (draft) e = { ...e, ...draft };

  main.innerHTML = `
    <div class="jr-list">
      <div class="jr-editor">
        <div class="jr-edit-row">
          <input type="text" id="jeTitle" class="jr-title-input" maxlength="160" placeholder="Title (optional)" value="${esc(e.title || '')}">
        </div>
        <div class="jr-edit-meta">
          <label>When <input type="datetime-local" id="jeWhen" class="mono" value="${esc(toInput(new Date(e.story_at || storyNow())))}"></label>
          <label>Where <input type="text" id="jeWhere" maxlength="120" placeholder="Optional" value="${esc(e.location || '')}"></label>
        </div>
        <div class="jr-moods" id="jeMoods">
          <span class="muted small">Mood</span>
          ${MOODS.map(m => `<button type="button" class="jr-mood-btn ${e.mood === m ? 'on' : ''}" data-mood="${m}">${m}</button>`).join('')}
        </div>
        <textarea id="jeBody" class="jr-body-input" placeholder="What happened today?">${esc(e.body || '')}</textarea>
        <div class="jr-edit-img" id="jeImgWrap">
          ${e.image_url ? `<img src="${esc(e.image_url)}" alt=""><button type="button" class="icon-btn" id="jeImgX" title="Remove picture">✕</button>` : ''}
        </div>
        <input type="file" id="jeFile" accept="image/*" hidden>
        <div class="jr-edit-foot">
          <button type="button" class="btn btn-ghost btn-sm" id="jeImg">📷 ${e.image_url ? 'Change picture' : 'Add a picture'}</button>
          <span class="muted small" id="jeStatus">${draft ? 'Restored your unsaved draft.' : ''}</span>
          <span class="jr-spacer"></span>
          <button type="button" class="btn btn-ghost" id="jeCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="jeSave">Save entry</button>
        </div>
      </div>
    </div>`;

  let mood = e.mood || '';
  let image = e.image_url || '';
  const body = $('#jeBody');
  const grow = () => { body.style.height = 'auto'; body.style.height = Math.max(260, body.scrollHeight + 4) + 'px'; };
  grow();

  const snapshot = () => ({
    title: $('#jeTitle').value, body: body.value, location: $('#jeWhere').value,
    story_at: $('#jeWhen').value ? new Date($('#jeWhen').value).toISOString() : null, mood, image_url: image
  });
  let saveTimer = null;
  const dirty = () => {
    body.dataset.dirty = '1';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(draftKey(id), JSON.stringify(snapshot())); $('#jeStatus').textContent = 'Draft saved on this device.'; } catch {}
    }, 600);
  };
  ['#jeTitle', '#jeWhen', '#jeWhere'].forEach(s => $(s).addEventListener('input', dirty));
  body.addEventListener('input', () => { grow(); dirty(); });

  $$('[data-mood]', main).forEach(b => b.addEventListener('click', () => {
    mood = mood === b.dataset.mood ? '' : b.dataset.mood;
    $$('[data-mood]', main).forEach(x => x.classList.toggle('on', x.dataset.mood === mood));
    dirty();
  }));

  const paintImg = () => {
    $('#jeImgWrap').innerHTML = image ? `<img src="${esc(image)}" alt=""><button type="button" class="icon-btn" id="jeImgX" title="Remove picture">✕</button>` : '';
    $('#jeImg').textContent = `📷 ${image ? 'Change picture' : 'Add a picture'}`;
    $('#jeImgX')?.addEventListener('click', () => { image = ''; paintImg(); dirty(); });
  };
  $('#jeImgX')?.addEventListener('click', () => { image = ''; paintImg(); dirty(); });
  $('#jeImg').addEventListener('click', () => $('#jeFile').click());
  $('#jeFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0]; if (!file) return;
    const btn = $('#jeImg'); btn.disabled = true; btn.textContent = 'Uploading…';
    try { image = await uploadFile('attachments', me.id, await shrinkImage(file, 1600, 0.85)); dirty(); }
    catch (err) { toast(err.message || 'Upload failed.', 'error'); }
    btn.disabled = false; paintImg();
  });

  const leave = () => { body.dataset.dirty = '0'; go(id ? 'entry' : 'mine', id ? { id } : {}); };
  $('#jeCancel').addEventListener('click', () => {
    if (body.dataset.dirty === '1' && !confirm('Discard your changes?')) return;
    try { localStorage.removeItem(draftKey(id)); } catch {}
    leave();
  });

  $('#jeSave').addEventListener('click', async (ev) => {
    const row = snapshot();
    if (!row.body.trim() && !row.title.trim()) return toast('Write something first.', 'error');
    row.title = row.title.trim() || null;
    row.location = row.location.trim() || null;
    row.mood = row.mood || null;
    row.image_url = row.image_url || null;
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
    const { data, error } = id
      ? await supa.from('journal_entries').update(row).eq('id', id).select().single()
      : await supa.from('journal_entries').insert(row).select().single();
    if (error) { btn.disabled = false; btn.textContent = 'Save entry'; return toast(error.message, 'error'); }
    try { localStorage.removeItem(draftKey(id)); } catch {}
    clearTimeout(saveTimer);
    body.dataset.dirty = '0';
    playSound('sent');
    toast(id ? 'Entry updated.' : 'Entry saved.', 'ok');
    go('entry', { id: data?.id || id, back: { name: 'mine' } });
  });

  if (!id) $('#jeTitle').focus();
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

$$('.jr-tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
$('#jrNew').addEventListener('click', () => go('edit', { from: 'mine' }));
window.addEventListener('beforeunload', (e) => {
  if (view.name === 'edit' && $('#jeBody')?.dataset.dirty === '1') e.preventDefault();
});

// A GM note or a new entry arriving refreshes whatever list is open.
let liveTimer = null;
supa.channel('journal-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries' }, () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (['mine', 'player', 'players', 'recent'].includes(view.name)
          && !main.contains(document.activeElement)) go(view.name, view);
    }, 400);
  })
  .subscribe();

const params = new URLSearchParams(location.search);
if (params.get('entry')) go('entry', { id: params.get('entry') });
else if (params.get('player') && me.is_admin) go('player', { userId: params.get('player') });
else go('mine');
