// =====================================================================
//  NEO MESSAGE — messenger
// =====================================================================

import {
  supa, requireProfile, ungate, signOut, mountCarrier, paintAvatar, setClockSource, startPresence,
  formatNumber, shortTime, dayLabel, isJumboEmoji, esc, toast,
  lightbox, uploadFile, shrinkImage, $, $$, icStamp, icAt
} from './supa.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { loadClock, storyNow, onClockChange, openClockModal } from './clock.js';
import { openRoller, openRequest, rollCard, requestCard } from './dice.js';
import { loadDirectory, categoryChip, byCategory } from './directory.js';
import { playSent, playReceived, isMuted, toggleMute } from './sfx.js';
import { EMOJI } from './emoji.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');
ungate();

await loadClock();
setClockSource(storyNow);
mountCarrier($('#carrier'));
startPresence();
mountShade();

/* Mark that we went into an app, so returning to the home screen does
   not re-trigger the lock. Cleared by the home screen when consumed. */
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'app'); } catch {}
onClockChange(() => $('#carrier').repaint?.());

/* ------------------------------------------------------------------ */
/*  state                                                             */
/* ------------------------------------------------------------------ */

const state = {
  threads: [],        // conversations I belong to, newest activity first
  people: new Map(),  // profile id -> profile row
  openId: null,       // conversation currently on screen
  messages: [],
  pendingImage: null, // File waiting to be sent
  search: '',
  reactions: new Map(), // message id -> [{ user_id, emoji }]
  replyTo: null         // message being replied to
};

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '❗'];

/* ------------------------------------------------------------------ */
/*  header                                                            */
/* ------------------------------------------------------------------ */

paintAvatar($('#meAvatar'), me.avatar_url, me.username);
$('#meName').textContent = me.username;
$('#meNum').textContent  = formatNumber(me.phone_number);
/* The GM's controls are created here rather than sitting in app.html
   with a `hidden` attribute. A player who opens View Source finds an
   empty <span> where they used to be.

   To be clear about what this is and is not: it hides the doors, it
   does not lock them. The locks are the row level security policies and
   the admin checks inside the database functions, and those hold no
   matter what anyone types into a console. This just keeps the table
   from being tempted. */
function addGmButton(id, glyph, label, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.id = id;
  b.textContent = glyph;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  $('#gmSlot').appendChild(b);
  return b;
}

if (me.is_admin) {
  addGmButton('adminBtn', '◉', 'Admin console', () => location.href = 'admin.html');
  addGmButton('clockBtn', '◔', 'Story clock',   () => openClockModal(modal));
  addGmButton('maintBtn', '🚧', 'Maintenance mode',
    async () => (await import('./maintenance.js')).openMaintenanceModal());
}
if (me.is_admin) {
  addGmButton('npcBtn', '🎭', 'NPC Studio', () => location.href = 'npcs.html');
}

$('#signOutBtn').addEventListener('click', signOut);
$('#meBtn').addEventListener('click', openProfileModal);
$('#contactsBtn').addEventListener('click', openContactsModal);

const muteBtn = $('#muteBtn');
const paintMute = () => {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.title = isMuted() ? 'Sounds off' : 'Sounds on';
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
};
paintMute();
muteBtn.addEventListener('click', () => { toggleMute(); paintMute(); });
$('#newBtn').addEventListener('click', openNewThreadModal);
$('#backBtn').addEventListener('click', () => $('#panes').classList.remove('reading'));

$('#threadSearch').addEventListener('input', (e) => {
  state.search = e.target.value.toLowerCase();
  renderThreads();
});


/* ------------------------------------------------------------------ */
/*  people cache                                                      */
/* ------------------------------------------------------------------ */

async function cachePeople(ids) {
  const missing = [...new Set(ids)].filter(id => id && !state.people.has(id));
  if (!missing.length) return;
  const { data } = await supa.from('profiles').select('*').in('id', missing);
  data?.forEach(p => state.people.set(p.id, p));
}

const personName = (id) => state.people.get(id)?.username ?? 'Unknown';


/* ------------------------------------------------------------------ */
/*  threads                                                           */
/* ------------------------------------------------------------------ */

async function loadThreads() {
  // Which conversations am I in?
  const { data: mine, error } = await supa
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', me.id);

  if (error) { toast('Threads could not load.', 'error'); return; }

  const ids = (mine ?? []).map(r => r.conversation_id);
  if (!ids.length) { state.threads = []; renderThreads(); return; }

  const [{ data: convos }, { data: members }, { data: recent }] = await Promise.all([
    supa.from('conversations').select('*').in('id', ids),
    supa.from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids),
    supa.from('messages')
        .select('conversation_id, body, image_url, created_at, story_at, sender_id, kind')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(400)
  ]);

  await cachePeople((members ?? []).map(m => m.user_id));

  const byConvo = new Map();
  (members ?? []).forEach(m => {
    if (!byConvo.has(m.conversation_id)) byConvo.set(m.conversation_id, []);
    byConvo.get(m.conversation_id).push(m.user_id);
  });

  const lastOf = new Map();
  (recent ?? []).forEach(m => {
    if (!lastOf.has(m.conversation_id)) lastOf.set(m.conversation_id, m);
  });

  state.threads = (convos ?? []).map(c => {
    const memberIds = byConvo.get(c.id) ?? [];
    const others = memberIds.filter(id => id !== me.id);
    const last = lastOf.get(c.id) ?? null;

    return {
      ...c,
      memberIds,
      others,
      last,
      name: c.is_group
        ? (c.title || others.map(personName).join(', ') || 'Group')
        : (others.length ? personName(others[0]) : 'Saved messages'),
      sortAt: last?.created_at ?? c.created_at
    };
  }).sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));

  renderThreads();
}

function renderThreads() {
  const list = $('#threadList');
  const visible = state.threads.filter(t =>
    !state.search || t.name.toLowerCase().includes(state.search));

  if (!visible.length) {
    list.innerHTML = `<div class="empty-state">${
      state.search
        ? 'No thread matches that.'
        : 'No threads yet.<br>Add a contact with ☰, then start one with ✎.'
    }</div>`;
    return;
  }

  list.innerHTML = visible.map(t => {
    const other = !t.is_group && t.others.length ? state.people.get(t.others[0]) : null;
    const preview = t.last
      ? (t.last.kind === 'system' ? `<span style="opacity:.7;font-style:italic">${esc(t.last.body.slice(0, 60))}</span>`
        : t.last.body ? esc(t.last.body.slice(0, 60))
        : '<span style="opacity:.75">📷 Photo</span>')
      : '<span style="opacity:.6">No messages yet</span>';
    const pic = t.is_group ? t.avatar_url : other?.avatar_url;

    return `
      <div class="thread ${t.id === state.openId ? 'active' : ''}" data-id="${t.id}">
        <span class="avatar" data-av="${other?.id ?? ''}">${
          pic
            ? `<img src="${esc(pic)}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : esc((t.name || '?').slice(0, 2).toUpperCase())
        }</span>
        <div class="thread-main">
          <div class="thread-top">
            <span class="thread-name">${esc(t.name)}</span>
            <span class="thread-time">${t.last ? icStamp(t.last) : ''}</span>
          </div>
          <div class="thread-preview">${preview}</div>
        </div>
      </div>`;
  }).join('');

  $$('.thread', list).forEach(el =>
    el.addEventListener('click', () => openThread(el.dataset.id)));
}


/* ------------------------------------------------------------------ */
/*  reading a thread                                                  */
/* ------------------------------------------------------------------ */

async function openThread(id) {
  state.openId = id;
  const t = state.threads.find(x => x.id === id);
  if (!t) return;

  // Opening a thread clears its message notification, like a phone.
  clearNotificationsFor(id);

  $('#panes').classList.add('reading');
  $('#convoName').textContent = t.name;

  const other = !t.is_group && t.others.length ? state.people.get(t.others[0]) : null;
  $('#convoSub').textContent = t.is_group
    ? `${t.memberIds.length} people`
    : formatNumber(other?.phone_number);
  paintAvatar($('#convoAvatar'), t.is_group ? t.avatar_url : other?.avatar_url, t.name);
  $('#membersBtn').hidden = !me.is_admin;
  $('#convoTitle').classList.toggle('is-group', !!t.is_group);
  if (state.replyTo?.conversation_id !== id) setReply(null);

  $('#input').disabled = false;
  $('#input').placeholder = `Message ${t.is_group ? t.name : (other?.username ?? '')}`;
  refreshSendState();
  renderThreads();

  const { data, error } = await supa
    .from('messages').select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (error) { toast('Messages could not load.', 'error'); return; }

  state.messages = data ?? [];
  await cachePeople(state.messages.map(m => m.sender_id));
  await loadReactions(id);
  renderStream();
}

/** Reactions for every message in a conversation (one query). */
async function loadReactions(convId) {
  state.reactions = new Map();
  const { data, error } = await supa.from('message_reactions')
    .select('message_id, user_id, emoji, messages!inner(conversation_id)')
    .eq('messages.conversation_id', convId);
  if (error) return;                       // groups.sql not run yet: no reactions, no fuss
  for (const r of data || []) {
    if (!state.reactions.has(r.message_id)) state.reactions.set(r.message_id, []);
    state.reactions.get(r.message_id).push(r);
  }
}

/** The pinned message bar at the top of a chat. */
function paintPin() {
  const bar = $('#pinBar');
  const t = state.threads.find(x => x.id === state.openId);
  const m = t?.pinned_message_id && state.messages.find(x => x.id === t.pinned_message_id);
  if (!m) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="pin-ico">📌</span>
    <span class="pin-main"><b>${esc(m.sender_id === me.id ? 'You' : personName(m.sender_id))}</b>
      <span>${esc(m.body || '📷 Photo')}</span></span>
    <span class="pin-x" data-unpin title="Unpin">✕</span>`;
  bar.onclick = async (e) => {
    if (e.target.closest('[data-unpin]')) {
      const { error } = await supa.rpc('group_pin', { conv: state.openId, msg: null });
      if (error) toast(error.message, 'error');
      return;
    }
    jumpTo(m.id);
  };
}

function jumpTo(id) {
  const row = $(`#stream [data-mid="${CSS.escape(id)}"]`);
  if (!row) return toast('That message isn\'t loaded.', 'info');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}

/** Message text with @mentions of chat members highlighted. */
function bodyHtml(text, t) {
  let h = esc(text);
  if (!t?.is_group) return h;
  const names = t.memberIds.map(id => (id === me.id ? me : state.people.get(id))?.username).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const n of names) {
    const re = new RegExp(`(^|[^\\w@])@(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w])`, 'gi');
    h = h.replace(re, (_, pre, nm) => `${pre}<span class="mention ${nm.toLowerCase() === me.username.toLowerCase() ? 'me' : ''}">@${nm}</span>`);
  }
  return h;
}

/* Messages already on screen, per thread — anything new since the last
   render gets .fresh and grows in (css/edge.css). Opening a thread marks
   everything as seen, so history never animates. */
let seenThread = null;
const seenIds = new Set();

function renderStream({ keepScroll = false } = {}) {
  const stream = $('#stream');
  const prevScroll = stream.scrollTop;
  const t = state.threads.find(x => x.id === state.openId);
  const firstPaint = seenThread !== state.openId;
  if (firstPaint) { seenThread = state.openId; seenIds.clear(); }

  paintPin();
  if (!state.messages.length) {
    stream.innerHTML = '<div class="empty-state">No messages yet. Say something.</div>';
    return;
  }

  let html = '';
  let lastDay = null;
  let lastSender = null;

  state.messages.forEach((m, i) => {
    const day = dayLabel(icAt(m));
    if (day !== lastDay) {
      html += `<div class="daystamp">${esc(day)}</div>`;
      lastDay = day;
      lastSender = null;
    }

    // Dice: a roll result, or the GM asking for one.
    if (m.kind === 'roll' || m.kind === 'roll_request') {
      const fresh = !firstPaint && !seenIds.has(m.id) ? 'fresh' : '';
      if (m.kind === 'roll') {
        html += `<div class="roll-line ${fresh}" data-mid="${esc(m.id)}">${m.meta
          ? rollCard(m.meta, { who: m.sender_id === me.id ? 'You' : personName(m.sender_id), judge: me.is_admin && !!m.meta.request_id })
          : `<div class="sysline">${esc(m.body)}</div>`}${icStamp(m)}</div>`;
      } else {
        const q = m.meta || {};
        const mine = state.messages.filter(x => x.kind === 'roll' && x.sender_id === me.id && x.meta?.request_id === q.id).map(x => x.meta);
        const names = new Map((q.targets || []).map(id => [id, id === me.id ? 'you' : personName(id)]));
        html += `<div class="roll-line ${fresh}" data-mid="${esc(m.id)}">${requestCard(q, {
          mine, canRoll: (q.targets || []).includes(me.id), gm: me.is_admin, names })}${icStamp(m)}</div>`;
      }
      lastSender = null;
      return;
    }

    // "robin added vale" — a small centred line, nobody's bubble.
    if (m.kind === 'system') {
      html += `<div class="sysline ${!firstPaint && !seenIds.has(m.id) ? 'fresh' : ''}" data-mid="${esc(m.id)}">${esc(m.body)}</div>`;
      lastSender = null;
      return;
    }

    const out = m.sender_id === me.id;
    const prev = state.messages[i - 1];
    const gap = prev && (new Date(m.created_at) - new Date(prev.created_at)) > 5 * 60 * 1000;
    const newSpeaker = m.sender_id !== lastSender;

    const who   = out ? me : (state.people.get(m.sender_id) ?? null);
    const tint  = who?.bubble_color || 'blue';
    // Head the block with an icon and a name whenever the speaker
    // changes, so a glance tells you who is talking without repeating
    // it on every line of a monologue.
    const heads = newSpeaker || gap;

    if (heads) {
      html += `
        <div class="speaker ${out ? 'out' : 'in'}" data-tint="${esc(tint)}">
          <span class="avatar avatar-xs" data-avatar="${esc(m.sender_id)}"></span>
          <span class="speaker-name">${esc(out ? me.username : personName(m.sender_id))}</span>
        </div>`;
    }

    const jumbo = !m.image_url && !m.reply_to && isJumboEmoji(m.body);
    const parts = [];
    if (m.reply_to) {
      const q = state.messages.find(x => x.id === m.reply_to);
      parts.push(`<button type="button" class="quote" data-jump="${esc(m.reply_to)}">
        <b>${esc(q ? (q.sender_id === me.id ? 'You' : personName(q.sender_id)) : 'Earlier message')}</b>
        <span>${esc(q ? (q.body || '📷 Photo') : 'Not loaded')}</span></button>`);
    }
    if (m.image_url) parts.push(`<img src="${esc(m.image_url)}" alt="Attached image" loading="lazy">`);
    if (m.body) parts.push(`<span class="msg-text">${bodyHtml(m.body, t)}</span>`);

    const reacts = state.reactions.get(m.id) || [];
    const counts = new Map();
    reacts.forEach(r => counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1));
    const chips = [...counts].map(([e, n]) => {
      const mine = reacts.some(r => r.emoji === e && r.user_id === me.id);
      const who = reacts.filter(r => r.emoji === e).map(r => r.user_id === me.id ? 'You' : personName(r.user_id)).join(', ');
      return `<button type="button" class="react-chip ${mine ? 'mine' : ''}" data-react="${esc(e)}" title="${esc(who)}">${e}<b>${n}</b></button>`;
    }).join('');

    html += `
      <div class="row ${out ? 'out' : 'in'} ${gap ? 'gap' : ''} ${!firstPaint && !seenIds.has(m.id) ? 'fresh' : ''} ${t?.pinned_message_id === m.id ? 'pinned' : ''}" data-tint="${esc(tint)}" data-mid="${esc(m.id)}">
        <div class="bubble-col">
          <div class="bubble ${jumbo ? 'jumbo' : ''}">${parts.join('')}</div>
          ${chips ? `<div class="reacts">${chips}</div>` : ''}
        </div>
        <span class="stamp">${icStamp(m)}</span>
        <div class="msg-actions" role="toolbar" aria-label="Message actions">
          <button type="button" data-act="reply" title="Reply">↩</button>
          <button type="button" data-act="react" title="React">☺</button>
          <button type="button" data-act="pin" title="${t?.pinned_message_id === m.id ? 'Unpin' : 'Pin'}">📌</button>
        </div>
      </div>`;

    lastSender = m.sender_id;
  });
  state.messages.forEach(m => seenIds.add(m.id));

  stream.innerHTML = html;

  $$('[data-avatar]', stream).forEach(el => {
    const id = el.dataset.avatar;
    const p  = id === me.id ? me : state.people.get(id);
    paintAvatar(el, p?.avatar_url, p?.username || '?');
  });

  $$('.bubble img', stream).forEach(img =>
    img.addEventListener('click', () => lightbox(img.src)));

  stream.scrollTop = keepScroll ? prevScroll : stream.scrollHeight;
}

/* ------------------------------------------------------------------ */
/*  reply · react · pin                                               */
/* ------------------------------------------------------------------ */

const streamEl = $('#stream');

streamEl.addEventListener('click', async (e) => {
  const quote = e.target.closest('[data-jump]');
  if (quote) return jumpTo(quote.dataset.jump);

  const chip = e.target.closest('.react-chip');
  if (chip) return toggleReaction(chip.closest('[data-mid]').dataset.mid, chip.dataset.react);

  const act = e.target.closest('.msg-actions [data-act]');
  if (!act) return;
  const id = act.closest('[data-mid]').dataset.mid;
  const m = state.messages.find(x => x.id === id);
  if (!m) return;
  if (act.dataset.act === 'reply') { setReply(m); input.focus(); }
  if (act.dataset.act === 'react') openReactPicker(act, id);
  if (act.dataset.act === 'pin') {
    const t = state.threads.find(x => x.id === state.openId);
    const { error } = await supa.rpc('group_pin', { conv: state.openId, msg: t?.pinned_message_id === id ? null : id });
    if (error) toast(/group_pin/.test(error.message) ? 'Pinning needs sql/groups.sql.' : error.message, 'error');
  }
  closeActions();
});

/* Phones: press and hold a message to show its actions. */
let holdTimer = null;
streamEl.addEventListener('touchstart', (e) => {
  const row = e.target.closest('.row[data-mid]');
  if (!row || e.target.closest('.msg-actions, .react-chip, .quote, img')) return;
  holdTimer = setTimeout(() => { closeActions(); row.classList.add('show-actions'); navigator.vibrate?.(12); }, 450);
}, { passive: true });
['touchend', 'touchmove', 'touchcancel'].forEach(ev =>
  streamEl.addEventListener(ev, () => clearTimeout(holdTimer), { passive: true }));
const closeActions = () => $$('.row.show-actions').forEach(r => r.classList.remove('show-actions'));
document.addEventListener('click', (e) => {
  if (e.target.closest('.react-pop, .msg-actions [data-act="react"]')) return;   // the picker's own clicks
  closeReactPicker();
  if (!e.target.closest('.row.show-actions')) closeActions();
});

let reactPop = null;
function openReactPicker(anchor, id) {
  closeReactPicker();
  reactPop = document.createElement('div');
  reactPop.className = 'react-pop';
  reactPop.innerHTML = REACTIONS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('');
  document.body.appendChild(reactPop);
  const r = anchor.getBoundingClientRect();
  const w = reactPop.offsetWidth;
  reactPop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  reactPop.style.top = Math.max(8, r.top - reactPop.offsetHeight - 8) + 'px';
  reactPop.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-e]');
    if (b) { toggleReaction(id, b.dataset.e); closeReactPicker(); }
  });
}
function closeReactPicker() { reactPop?.remove(); reactPop = null; }

async function toggleReaction(id, emoji) {
  const list = state.reactions.get(id) || [];
  const mine = list.find(r => r.emoji === emoji && r.user_id === me.id);
  // Show it straight away; realtime confirms.
  if (mine) state.reactions.set(id, list.filter(r => r !== mine));
  else state.reactions.set(id, [...list, { message_id: id, user_id: me.id, emoji }]);
  renderStream({ keepScroll: true });
  const { error } = mine
    ? await supa.from('message_reactions').delete().match({ message_id: id, user_id: me.id, emoji })
    : await supa.from('message_reactions').insert({ message_id: id, user_id: me.id, emoji });
  if (error) {
    toast(/message_reactions/.test(error.message) ? 'Reactions need sql/groups.sql.' : error.message, 'error');
    await loadReactions(state.openId); renderStream({ keepScroll: true });
  }
}

function setReply(m) {
  state.replyTo = m;
  const box = $('#replyBox');
  if (!m) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="reply-bar">
      <span class="reply-main"><b>Replying to ${esc(m.sender_id === me.id ? 'yourself' : personName(m.sender_id))}</b>
      <span>${esc(m.body || '📷 Photo')}</span></span>
      <button class="icon-btn" id="dropReply" title="Cancel reply">✕</button></div>`;
  $('#dropReply').addEventListener('click', () => setReply(null));
}


/* ------------------------------------------------------------------ */
/*  composing                                                         */
/* ------------------------------------------------------------------ */

const input = $('#input');

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 130) + 'px';
  refreshSendState();
  paintMentions();
});

input.addEventListener('keydown', (e) => {
  if (!$('#mentionPop').hidden) {
    const opts = $$('#mentionPop [data-name]');
    const cur = opts.findIndex(o => o.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('on', i === next));
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && opts.length) {
      e.preventDefault(); pickMention((opts[cur] || opts[0]).dataset.name); return;
    }
    if (e.key === 'Escape') { $('#mentionPop').hidden = true; return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

/* @mentions: typing @ in a group suggests its members. */
function mentionQuery() {
  const t = state.threads.find(x => x.id === state.openId);
  if (!t?.is_group) return null;
  const upto = input.value.slice(0, input.selectionStart ?? input.value.length);
  const m = upto.match(/(^|\s)@([\w.-]*)$/);
  return m ? { q: m[2].toLowerCase(), start: upto.length - m[2].length - 1, t } : null;
}
function paintMentions() {
  const pop = $('#mentionPop');
  const mq = mentionQuery();
  if (!mq) { pop.hidden = true; return; }
  const names = mq.t.memberIds.filter(id => id !== me.id)
    .map(id => state.people.get(id)).filter(p => p && p.username.toLowerCase().startsWith(mq.q)).slice(0, 6);
  if (!names.length) { pop.hidden = true; return; }
  pop.hidden = false;
  pop.innerHTML = names.map((p, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-name="${esc(p.username)}">
    <span class="avatar avatar-xs" data-mav="${esc(p.id)}"></span>${esc(p.username)}</button>`).join('');
  names.forEach(p => paintAvatar(pop.querySelector(`[data-mav="${p.id}"]`), p.avatar_url, p.username));
  $$('[data-name]', pop).forEach(b => b.addEventListener('mousedown', (e) => { e.preventDefault(); pickMention(b.dataset.name); }));
}
function pickMention(name) {
  const mq = mentionQuery(); if (!mq) return;
  const end = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, mq.start) + '@' + name + ' ' + input.value.slice(end);
  const pos = mq.start + name.length + 2;
  input.setSelectionRange(pos, pos);
  $('#mentionPop').hidden = true;
  input.focus(); refreshSendState();
}
input.addEventListener('blur', () => setTimeout(() => { $('#mentionPop').hidden = true; }, 150));

/** Which chat members a message @mentions. */
function mentionsIn(body) {
  const t = state.threads.find(x => x.id === state.openId);
  if (!t?.is_group || !body) return [];
  return t.memberIds.filter(id => {
    const n = (id === me.id ? me : state.people.get(id))?.username;
    return n && id !== me.id && new RegExp(`(^|[^\\w@])@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').test(body);
  });
}

$('#sendBtn').addEventListener('click', send);

function refreshSendState() {
  $('#sendBtn').disabled =
    !state.openId || (!input.value.trim() && !state.pendingImage);
}

async function send() {
  const body = input.value.trim();
  if (!state.openId || (!body && !state.pendingImage)) return;

  const btn = $('#sendBtn');
  btn.disabled = true;

  let imageUrl = null;
  try {
    if (state.pendingImage) {
      const small = await shrinkImage(state.pendingImage);
      imageUrl = await uploadFile('attachments', me.id, small);
    }
  } catch (err) {
    toast(err.message || 'That image would not upload.', 'error');
    btn.disabled = false;
    return;
  }

  const row = {
    conversation_id: state.openId,
    sender_id: me.id,
    body: body || null,
    image_url: imageUrl
  };
  // Replies and @mentions need sql/groups.sql; plain messages don't.
  const mentions = mentionsIn(body);
  if (state.replyTo) row.reply_to = state.replyTo.id;
  if (mentions.length) row.mentions = mentions;
  let { data, error } = await supa.from('messages').insert(row).select().single();
  if (error && (row.reply_to || row.mentions) && /reply_to|mentions|column/i.test(error.message)) {
    delete row.reply_to; delete row.mentions;
    ({ data, error } = await supa.from('messages').insert(row).select().single());
  }

  if (error) {
    toast('Message did not send. Try again.', 'error');
    btn.disabled = false;
    return;
  }

  playSent();

  /* Show it straight away. Waiting for the realtime echo makes sending
     feel broken on a slow connection, and if realtime is misconfigured
     it never arrives at all. The row is replaced by the real one when
     the echo lands, or by the next poll. */
  if (data) {
    state.messages.push(data);
    renderStream();
    const t = state.threads.find(x => x.id === state.openId);
    if (t) {
      t.last = data;
      t.sortAt = data.created_at;
      state.threads.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
      renderThreads();
    }
  }

  input.value = '';
  input.style.height = 'auto';
  setReply(null);
  clearAttachment();
  refreshSendState();
  input.focus();
}


/* ---------- image attachment ---------- */

$('#imageBtn').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Only images can be attached.', 'error');

  state.pendingImage = file;
  const url = URL.createObjectURL(file);
  $('#attachBox').innerHTML = `
    <div class="attach-preview">
      <img src="${url}" alt="">
      <span class="name">${esc(file.name)}</span>
      <button class="icon-btn" id="dropAttach" title="Remove">✕</button>
    </div>`;
  $('#dropAttach').addEventListener('click', clearAttachment);
  refreshSendState();
});

function clearAttachment() {
  state.pendingImage = null;
  $('#attachBox').innerHTML = '';
  refreshSendState();
}


/* ---------- emoji picker ---------- */

/* Emoji list now lives in js/emoji.js and is imported above. */

const emojiBtn = $('#emojiBtn');
let emojiPop = null;

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (emojiPop) return closeEmoji();

  emojiPop = document.createElement('div');
  emojiPop.className = 'emoji-pop';
  const cats = Object.keys(EMOJI);
  emojiPop.innerHTML = `
    <div class="emoji-cats">
      ${cats.map((c, i) =>
        `<button data-cat="${c}" class="${i === 0 ? 'active' : ''}">${c}</button>`).join('')}
    </div>
    <div class="emoji-grid"></div>`;

  emojiBtn.closest('.composer').appendChild(emojiPop);
  paintEmoji(cats[0]);

  $$('.emoji-cats button', emojiPop).forEach(b =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      $$('.emoji-cats button', emojiPop).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      paintEmoji(b.dataset.cat);
    }));

  emojiPop.addEventListener('click', ev => ev.stopPropagation());
});

function paintEmoji(cat) {
  $('.emoji-grid', emojiPop).innerHTML =
    EMOJI[cat].map(e => `<button type="button">${e}</button>`).join('');

  $$('.emoji-grid button', emojiPop).forEach(b =>
    b.addEventListener('click', () => {
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + b.textContent + input.value.slice(pos);
      input.focus();
      input.selectionStart = input.selectionEnd = pos + b.textContent.length;
      refreshSendState();
    }));
}

function closeEmoji() { emojiPop?.remove(); emojiPop = null; }
document.addEventListener('click', closeEmoji);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEmoji(); });


/* ------------------------------------------------------------------ */
/*  modals                                                            */
/* ------------------------------------------------------------------ */

/* The bubble colours a player can pick from. Keep these in step with
   the [data-tint] rules in css/neo.css and the check constraint in
   sql/bubble-colors.sql. */
const TINTS = [
  ['blue',   'Blue'],   ['green',  'Green'],
  ['purple', 'Purple'], ['red',    'Red'],
  ['amber',  'Amber'],  ['teal',   'Teal'],
  ['pink',   'Pink'],   ['slate',  'Slate']
];

function modal({ title, body, footer }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" data-close title="Close">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => {
    if (e.target.classList.contains('scrim')) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  return { root, close };
}


/* ---------- contacts ---------- */

async function openContactsModal() {
  const { data: rows } = await supa
    .from('contacts')
    .select('id, nickname, contact_id')
    .eq('owner_id', me.id);

  await cachePeople((rows ?? []).map(r => r.contact_id));

  const list = (rows ?? []).map(r => {
    const p = state.people.get(r.contact_id);
    return { ...r, profile: p, label: r.nickname || p?.username || 'Unknown' };
  }).sort((a, b) => a.label.localeCompare(b.label));

  const { root, close } = modal({
    title: 'Contacts',
    body: `
      <div class="field">
        <label for="addFind">Add someone</label>
        <div class="inline-row">
          <input id="addFind" placeholder="Name or phone number" maxlength="24" autocomplete="off">
          <button class="btn btn-sm" id="addGo" style="flex-shrink:0">Add</button>
        </div>
        <div class="hint">Search the directory by name, or type a phone number. Some people can only be added by number.</div>
      </div>
      <div id="addResults" class="find-results"></div>
      <div id="addMsg"></div>
      <div style="margin-top:16px" id="contactList">
        ${list.length ? list.map(c => `
          <div class="contact-row" data-pid="${c.contact_id}">
            <span class="avatar avatar-sm">${
              c.profile?.avatar_url
                ? `<img src="${esc(c.profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
                : esc(c.label.slice(0, 2).toUpperCase())
            }</span>
            <div class="info">
              <div class="nm">${esc(c.label)}</div>
              <div class="nu">${esc(formatNumber(c.profile?.phone_number))}</div>
            </div>
            <span class="pill">Message</span>
          </div>`).join('')
        : '<div class="empty-state">No contacts yet. Add one with a number above.</div>'}
      </div>`
  });

  const findBox = $('#addFind', root);
  const results = $('#addResults', root);
  const msgBox  = $('#addMsg', root);

  /** Adds someone we already have the id for. */
  async function addById(id, name) {
    const { error } = await supa.from('contacts')
      .insert({ owner_id: me.id, contact_id: id });

    if (error) {
      msgBox.innerHTML = `<div class="notice notice-${/duplicate|unique/i.test(error.message) ? 'info' : 'error'}">${
        /duplicate|unique/i.test(error.message)
          ? esc(name) + ' is already in your contacts.'
          : /row-level security/i.test(error.message) ? esc(name) + ' can only be added by phone number.'
          : esc(error.message)}</div>`;
      return;
    }
    msgBox.innerHTML = `<div class="notice notice-ok">${esc(name)} added.</div>`;
    setTimeout(() => { close(); openContactsModal(); }, 700);
  }

  /* Directory search: only people you're allowed to see (sql/categories.sql). */
  const dir = await loadDirectory({ fresh: true });
  const already = new Set(list.map(c => c.contact_id));
  const findRow = (p) => `
    <${p.can_add && !already.has(p.id) ? 'button type="button"' : 'div'} class="find-row ${p.can_add ? '' : 'no-add'}" data-id="${esc(p.id)}" data-name="${esc(p.username)}">
      <span class="avatar avatar-sm" data-find-avatar="${esc(p.id)}"></span>
      <span class="find-id">
        <strong>${esc(p.username)}</strong>
        <span>${categoryChip(p)}${p.about ? ` <small class="muted">${esc(p.about)}</small>` : ''}</span>
      </span>
      <span class="find-add">${already.has(p.id) ? 'In contacts' : p.can_add ? 'Add' : 'By number only'}</span>
    </${p.can_add && !already.has(p.id) ? 'button' : 'div'}>`;
  const paintFind = (rows) => {
    results.innerHTML = rows.length ? byCategory(rows).map(g =>
      `<div class="find-group">${esc(g.name)}</div>${g.rows.map(findRow).join('')}`).join('')
      : '<div class="find-none">Nobody by that name.</div>';
    rows.forEach(p => paintAvatar(results.querySelector(`[data-find-avatar="${p.id}"]`), p.avatar_url, p.username));
    $$('button.find-row', results).forEach(r => r.addEventListener('click', () => addById(r.dataset.id, r.dataset.name)));
  };
  findBox.addEventListener('input', () => {
    const q = findBox.value.trim().toLowerCase();
    if (/^[\d ()\-+.]+$/.test(q)) { results.innerHTML = ''; return; }
    paintFind(q ? dir.filter(p => p.username.toLowerCase().includes(q) || (p.about || '').toLowerCase().includes(q)) : dir);
  });
  if (dir.length) paintFind(dir);

  $('#addGo', root).addEventListener('click', async () => {
    const q = findBox.value.trim();
    if (!q) return;

    // Digits mean a number. Anything else is a username.
    if (/^[\d ()\-+.]+$/.test(q)) {
      const { data, error } = await supa.rpc('add_contact_by_number', {
        number: q, nick: null
      });
      if (error) {
        msgBox.innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`;
        return;
      }
      msgBox.innerHTML = `<div class="notice notice-ok">${esc(data.username)} added.</div>`;
      findBox.value = '';
      setTimeout(() => { close(); openContactsModal(); }, 700);
      return;
    }

    const hit = dir.find(p => p.username.toLowerCase() === q.toLowerCase());
    if (!hit) {
      msgBox.innerHTML = '<div class="notice notice-error">Nobody by that name in your directory. Try their number.</div>';
      return;
    }
    if (!hit.can_add) {
      msgBox.innerHTML = `<div class="notice notice-info">${esc(hit.username)} can only be added by phone number.</div>`;
      return;
    }
    await addById(hit.id, hit.username);
  });

  findBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#addGo', root).click();
  });

  $$('.contact-row', root).forEach(row =>
    row.addEventListener('click', async () => {
      close();
      const { data: convId, error } = await supa.rpc('start_direct_conversation', {
        other_user: row.dataset.pid
      });
      if (error) return toast(error.message, 'error');
      await loadThreads();
      openThread(convId);
    }));
}


/* ---------- new thread ---------- */

async function openNewThreadModal() {
  const { data: rows } = await supa
    .from('contacts').select('contact_id, nickname').eq('owner_id', me.id);

  await cachePeople((rows ?? []).map(r => r.contact_id));

  const people = (rows ?? []).map(r => ({
    id: r.contact_id,
    label: r.nickname || state.people.get(r.contact_id)?.username || 'Unknown',
    profile: state.people.get(r.contact_id)
  })).sort((a, b) => a.label.localeCompare(b.label));

  if (!people.length) {
    return modal({
      title: 'Start a thread',
      body: '<div class="empty-state">Add a contact first — open ☰ and enter their number.</div>'
    });
  }

  const { root, close } = modal({
    title: 'Start a thread',
    body: `
      <div class="field">
        <label for="grpTitle">Group name <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="grpTitle" placeholder="The Heist Crew" maxlength="40">
        <div class="hint">Leave this empty and pick one person for a normal thread.</div>
      </div>
      <div style="margin-top:14px">
        ${people.map(p => `
          <label class="checkline">
            <input type="checkbox" value="${p.id}">
            <span class="avatar avatar-sm">${
              p.profile?.avatar_url
                ? `<img src="${esc(p.profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
                : esc(p.label.slice(0, 2).toUpperCase())
            }</span>
            <span>
              <span style="font-family:var(--font-ui);font-weight:600">${esc(p.label)}</span><br>
              <span class="mono" style="font-size:11.5px;color:var(--muted)">${esc(formatNumber(p.profile?.phone_number))}</span>
            </span>
          </label>`).join('')}
      </div>`,
    footer: `
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn" id="startGo">Start thread</button>`
  });

  $('#startGo', root).addEventListener('click', async () => {
    const picked = $$('.checkline input:checked', root).map(i => i.value);
    if (!picked.length) return toast('Pick at least one person.', 'error');

    const title = $('#grpTitle', root).value.trim();
    let convId, error;

    if (picked.length === 1 && !title) {
      ({ data: convId, error } = await supa.rpc('start_direct_conversation', {
        other_user: picked[0]
      }));
    } else {
      ({ data: convId, error } = await supa.rpc('start_group_conversation', {
        member_ids: picked, group_title: title
      }));
    }

    if (error) return toast(error.message, 'error');
    close();
    await loadThreads();
    openThread(convId);
  });
}


/* ---------- profile ---------- */

function openProfileModal() {
  const { root, close } = modal({
    title: 'Your profile',
    body: `
      <div class="avatar-picker">
        <span class="avatar avatar-lg" id="pAvatar">${
          me.avatar_url
            ? `<img src="${esc(me.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : esc(me.username.slice(0, 2).toUpperCase())
        }</span>
        <button class="btn btn-ghost btn-sm" id="pPick">Choose an icon</button>
        <input type="file" id="pFile" accept="image/*" class="hidden">
      </div>
      <div class="field">
        <label>Username</label>
        <input value="${esc(me.username)}" disabled>
        <div class="hint">Usernames are fixed once the account exists.</div>
      </div>
      <div class="field">
        <label for="pNum">Your number</label>
        <input id="pNum" class="mono" value="${esc(formatNumber(me.phone_number))}" maxlength="18">
        <div class="hint">Changing this does not break existing threads.</div>
      </div>
      <div class="field">
        <label>Your bubble colour</label>
        <div class="tints" id="pTints">
          ${TINTS.map(([id, name]) => `
            <button type="button" class="tint" data-tint="${id}"
                    data-pick="${id}" title="${name}"
                    aria-label="${name}"
                    aria-pressed="${(me.bubble_color || 'blue') === id}"></button>`).join('')}
        </div>
        <div class="hint">Everyone in a group thread sees your messages in this colour.</div>
      </div>
      <div class="field">
        <label for="pDiscord">Discord notifications <span class="muted">(optional)</span></label>
        <input id="pDiscord" class="mono" value="${esc(me.discord_id || '')}"
               placeholder="Your Discord user ID" maxlength="32">
        <div class="hint">Paste your Discord user ID to be DM'd about new messages.
          In Discord: Settings → Advanced → Developer Mode, then right-click your
          name → Copy User ID.</div>
      </div>
      <div id="pMsg"></div>`,
    footer: `
      <button class="btn btn-ghost" data-close>Close</button>
      <button class="btn" id="pSave">Save changes</button>`
  });

  $('#pPick', root).addEventListener('click', () => $('#pFile', root).click());

  $$('[data-pick]', root).forEach(sw => {
    sw.addEventListener('click', async () => {
      const pick = sw.dataset.pick;
      const box  = $('#pMsg', root);
      const { error } = await supa.from('profiles')
        .update({ bubble_color: pick }).eq('id', me.id);

      if (error) {
        box.innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`;
        return;
      }
      me.bubble_color = pick;
      state.people.set(me.id, { ...(state.people.get(me.id) ?? {}), ...me });
      $$('[data-pick]', root).forEach(o =>
        o.setAttribute('aria-pressed', String(o.dataset.pick === pick)));
      renderStream();
      box.innerHTML = '<div class="notice notice-ok">Bubble colour updated.</div>';
    });
  });

  $('#pFile', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const box = $('#pMsg', root);
    box.innerHTML = '<div class="notice notice-info">Uploading…</div>';
    try {
      const small = await shrinkImage(file, 480, 0.9);
      const url = await uploadFile('avatars', me.id, small);
      const { error } = await supa.from('profiles').update({ avatar_url: url }).eq('id', me.id);
      if (error) throw error;

      me.avatar_url = url;
      paintAvatar($('#meAvatar'), url, me.username);
      paintAvatar($('#pAvatar', root), url, me.username);
      box.innerHTML = '<div class="notice notice-ok">Icon updated.</div>';
    } catch (err) {
      box.innerHTML = `<div class="notice notice-error">${esc(err.message || 'Upload failed.')}</div>`;
    }
  });

  $('#pSave', root).addEventListener('click', async () => {
    const digits = $('#pNum', root).value.replace(/\D/g, '');
    const box = $('#pMsg', root);
    if (digits.length < 7) {
      box.innerHTML = '<div class="notice notice-error">Give your number at least 7 digits.</div>';
      return;
    }

    // Discord IDs are numeric snowflakes; accept digits only, or blank to unlink.
    const discordRaw = $('#pDiscord', root).value.trim();
    if (discordRaw && !/^\d{5,32}$/.test(discordRaw)) {
      box.innerHTML = '<div class="notice notice-error">A Discord user ID is all digits. Leave it blank to turn notifications off.</div>';
      return;
    }

    const next = formatNumber(digits);
    const { error } = await supa.from('profiles')
      .update({ phone_number: next, discord_id: discordRaw || null }).eq('id', me.id);

    if (error) {
      box.innerHTML = `<div class="notice notice-error">${
        /duplicate|unique/i.test(error.message)
          ? 'Someone else already has that number.'
          : esc(error.message)}</div>`;
      return;
    }
    me.phone_number = next;
    me.discord_id = discordRaw || null;
    $('#meNum').textContent = next;
    box.innerHTML = '<div class="notice notice-ok">Saved.</div>';
    setTimeout(close, 800);
  });
}


/* ------------------------------------------------------------------ */
/*  realtime                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  keeping the screen current                                        */
/*                                                                    */
/*  Realtime is the fast path. Polling is the safety net: if the       */
/*  websocket never connects — a misconfigured publication, a captive  */
/*  wifi portal, a corporate proxy — messages still arrive, just a few */
/*  seconds later instead of instantly. The indicator in the header    */
/*  says which one you are on.                                        */
/* ------------------------------------------------------------------ */

let live = false;

function setLive(on) {
  live = on;
  const dot = $('#liveDot');
  if (!dot) return;
  dot.classList.toggle('is-live', on);
  dot.title = on
    ? 'Live — messages arrive instantly'
    : 'Catching up every few seconds. Realtime is not connected.';
}

/** Pulls anything we have not seen in the open thread, plus the list. */
async function pollNow() {
  if (state.openId) {
    const newest = state.messages.length
      ? state.messages[state.messages.length - 1].created_at
      : null;

    let q = supa.from('messages').select('*')
      .eq('conversation_id', state.openId)
      .order('created_at');
    if (newest) q = q.gt('created_at', newest);

    const { data } = await q;
    const fresh = (data ?? []).filter(m => !state.messages.some(x => x.id === m.id));

    if (fresh.length) {
      if (fresh.some(m => m.sender_id !== me.id)) playReceived();
      state.messages.push(...fresh);
      await cachePeople(fresh.map(m => m.sender_id));
      renderStream();
    }
  }
  await loadThreads();
}

/* Poll fast while realtime is down, slowly as a backstop when it is up.
   Four seconds is well inside what feels responsive at a table, and the
   query is tiny — only rows newer than the last one on screen. */
setInterval(() => { if (!live) pollNow(); }, 4000);
setInterval(() => { if (live)  pollNow(); }, 25000);

/* If the tab was in the background, catch up the moment it returns. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pollNow();
});

supa.channel('neo-messages')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        const m = payload.new;

        // Your own message already played its tone on send. Realtime
        // echoes it straight back, so without this you would hear both.
        if (m.sender_id !== me.id) playReceived();

        // Only react to threads I'm actually in.
        if (!state.threads.some(t => t.id === m.conversation_id)) {
          await loadThreads();
          return;
        }

        if (m.conversation_id === state.openId) {
          if (state.messages.some(x => x.id === m.id)) return;
          state.messages.push(m);
          await cachePeople([m.sender_id]);
          renderStream();
        }

        const t = state.threads.find(x => x.id === m.conversation_id);
        if (t) {
          t.last = m;
          t.sortAt = m.created_at;
          state.threads.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
          renderThreads();
        }
      })
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        // The GM marking a roll Pass/Fail updates its card.
        const m = payload.new;
        const i = state.messages.findIndex(x => x.id === m.id);
        if (i < 0) return;
        state.messages[i] = { ...state.messages[i], ...m };
        renderStream({ keepScroll: true });
      })
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_members' },
      () => refreshOpenChat())
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversations' },
      () => refreshOpenChat())
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions' },
      async (p) => {
        const id = (p.new && p.new.message_id) || (p.old && p.old.message_id);
        if (!state.openId || !state.messages.some(m => m.id === id)) return;
        await loadReactions(state.openId);
        renderStream({ keepScroll: true });
      })
  .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'conversation_members' },
      async (payload) => {
        // The GM took someone out of a chat. If it was us, close it.
        if (payload.old?.user_id !== me.id) return refreshOpenChat();
        if (payload.old.conversation_id === state.openId) {
          state.openId = null;
          state.messages = [];
          $('#panes').classList.remove('reading');
          toast('You were removed from that chat.', 'info');
        }
        await loadThreads();
      })
  .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'conversations' },
      async (payload) => {
        const gone = payload.old?.id;
        if (!gone) return;
        if (gone === state.openId) {
          state.openId = null;
          state.messages = [];
          toast('That thread was removed by the GM.', 'info');
        }
        await loadThreads();
      })
  .subscribe((status) => {
    // SUBSCRIBED means the websocket is up and the table is published.
    setLive(status === 'SUBSCRIBED');
    if (status !== 'SUBSCRIBED') pollNow();
  });


/* ------------------------------------------------------------------ */
/*  go                                                                */
/* ------------------------------------------------------------------ */

await loadThreads();

// Deep link from a notification: open the specified conversation.
const wantConvo = new URLSearchParams(location.search).get('c');
if (wantConvo && state.threads.some(t => t.id === wantConvo)) {
  openThread(wantConvo);
}

/* Dice: players roll into the chat; the GM asks for rolls (js/dice.js). */
$('#stream').addEventListener('click', async (e) => {
  const v = e.target.closest('[data-verdict]');
  if (v) {
    const [id, verdict] = v.dataset.verdict.split(':');
    const { error } = await supa.rpc('sw_verdict', { p_roll: id, p_verdict: v.classList.contains('on') ? null : verdict });
    if (error) toast(/sw_verdict|does not exist/.test(error.message) ? 'Run sql/dice-v2.sql in Supabase first.' : error.message, 'error');
    return;
  }
  const b = e.target.closest('[data-rollreq]');
  if (!b) return;
  const m = state.messages.find(x => x.kind === 'roll_request' && x.meta?.id === b.dataset.rollreq);
  if (m) openRoller({ me, request: m.meta });
});
$('#diceBtn').addEventListener('click', (e) => {
  const id = state.openId;
  if (!id) return;
  if (!me.is_admin) return openRoller({ me, kind: 'message', ctx: id, title: 'Roll into this chat' });
  // GM: ask the players, or roll yourself.
  document.querySelector('.dice-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'dice-pop';
  pop.innerHTML = '<button type="button" data-a="ask">🎯 Ask for a roll</button><button type="button" data-a="me">🎲 Roll it myself</button>';
  e.currentTarget.closest('.composer').appendChild(pop);
  const off = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', off, true); } };
  setTimeout(() => document.addEventListener('click', off, true));
  pop.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    pop.remove();
    const t = state.threads.find(x => x.id === id);
    if (a === 'me') return openRoller({ me, kind: 'message', ctx: id, title: 'Roll into this chat' });
    const people = (t?.others || []).map(pid => state.people.get(pid)).filter(p => p && !p.is_admin)
      .map(p => ({ id: p.id, username: p.username }));
    if (!people.length) return toast('Nobody in this chat can roll yet.', 'info');
    openRequest({ kind: 'message', ctx: id, people });
  });
});

/* GM: add or remove anyone in the open chat (js/members.js). */
$('#membersBtn').addEventListener('click', async () => {
  const id = state.openId;
  if (!id || !me.is_admin) return;
  const { openMembers } = await import('./members.js');
  if (!(await openMembers(id))) return;
  await loadThreads();
  if (state.threads.some(t => t.id === id)) openThread(id);
  else {
    state.openId = null; state.messages = [];
    $('#panes').classList.remove('reading');
    renderStream?.();
  }
});

/* Threads changed (members, name, photo, pin): refresh the list and the
   open chat's header without losing the reader's place. */
let refreshTimer = null;
function refreshOpenChat() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await loadThreads();
    const t = state.threads.find(x => x.id === state.openId);
    if (!t) return;
    $('#convoName').textContent = t.name;
    if (t.is_group) {
      $('#convoSub').textContent = `${t.memberIds.length} people`;
      paintAvatar($('#convoAvatar'), t.avatar_url, t.name);
    }
    renderStream({ keepScroll: true });
  }, 250);
}


/* ------------------------------------------------------------------ */
/*  group info: members, name, photo, add people, leave               */
/* ------------------------------------------------------------------ */

$('#convoTitle').addEventListener('click', () => {
  const t = state.threads.find(x => x.id === state.openId);
  if (t?.is_group) openGroupInfo(t.id);
});

async function openGroupInfo(convId) {
  const t = state.threads.find(x => x.id === convId);
  if (!t) return;
  const { data: rows } = await supa.from('conversation_members')
    .select('user_id, joined_at').eq('conversation_id', convId);
  await cachePeople((rows || []).map(r => r.user_id));
  const members = (rows || []).map(r => ({ ...r, p: r.user_id === me.id ? me : state.people.get(r.user_id) }))
    .sort((a, b) => (a.user_id === me.id) - (b.user_id === me.id) || (a.p?.username || '').localeCompare(b.p?.username || ''));
  const canEdit = me.is_admin || t.members_can_edit !== false;
  const canAdd = me.is_admin || t.members_can_add !== false;
  const joined = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

  const { root, close } = modal({
    title: 'Group info',
    body: `
      <div class="gi-top">
        <button type="button" class="gi-photo ${canEdit ? 'can' : ''}" id="giPhoto" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Change group photo' : ''}">
          <span class="avatar avatar-lg" id="giAvatar"></span>${canEdit ? '<span class="gi-photo-tip">Change</span>' : ''}
        </button>
        <input type="file" id="giFile" accept="image/*" class="hidden">
        <div class="gi-name">
          ${canEdit
            ? `<input type="text" id="giTitle" maxlength="40" value="${esc(t.title || '')}" placeholder="Group name">
               <button class="btn btn-sm" id="giSaveName">Save</button>`
            : `<h3>${esc(t.name)}</h3>`}
          ${t.avatar_url && canEdit ? '<button type="button" class="linkish" id="giNoPhoto">Remove photo</button>' : ''}
        </div>
      </div>
      <div class="gi-head"><b>${members.length} ${members.length === 1 ? 'member' : 'members'}</b>
        ${canAdd ? '<button class="btn btn-ghost btn-sm" id="giAdd">＋ Add people</button>' : ''}</div>
      <div class="gi-list">${members.map(m => `
        <div class="gi-row">
          <span class="avatar avatar-sm" data-gav="${esc(m.user_id)}"></span>
          <span class="gi-who"><b>${esc(m.p?.username || 'Unknown')}${m.user_id === me.id ? ' <i>(you)</i>' : ''}</b>
            <span class="mono">${esc(formatNumber(m.p?.phone_number))}</span></span>
          <span class="gi-joined">joined ${esc(joined(m.joined_at))}</span>
        </div>`).join('')}</div>
      ${me.is_admin ? `
        <div class="gi-gm">
          <b>GM settings</b>
          <label class="check"><input type="checkbox" id="giCanAdd" ${t.members_can_add !== false ? 'checked' : ''}><span>Members can add people</span></label>
          <label class="check"><input type="checkbox" id="giCanEdit" ${t.members_can_edit !== false ? 'checked' : ''}><span>Members can change the name and photo</span></label>
          <button class="btn btn-ghost btn-sm" id="giManage">👥 Add or remove anyone…</button>
        </div>` : ''}
      <div id="giMsg"></div>`,
    footer: `
      <button class="btn btn-danger" id="giLeave">Leave group</button>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" data-close>Close</button>`
  });

  paintAvatar($('#giAvatar', root), t.avatar_url, t.name);
  members.forEach(m => paintAvatar(root.querySelector(`[data-gav="${m.user_id}"]`), m.p?.avatar_url, m.p?.username || '?'));
  const say = (msg, kind = 'error') => { $('#giMsg', root).innerHTML = `<div class="notice notice-${kind}">${esc(msg)}</div>`; };
  const needSql = (err) => /group_(update|add|leave)|admin_group_settings|function/i.test(err.message)
    ? 'This needs sql/groups.sql — ask the GM to run it in Supabase.' : err.message;
  const after = async () => { await loadThreads(); refreshOpenChat(); };

  $('#giSaveName', root)?.addEventListener('click', async () => {
    const { error } = await supa.rpc('group_update', { conv: convId, p_title: $('#giTitle', root).value, p_avatar: t.avatar_url || null });
    if (error) return say(needSql(error));
    say('Name saved.', 'ok'); await after();
  });
  $('#giPhoto', root).addEventListener('click', () => canEdit && $('#giFile', root).click());
  $('#giFile', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    say('Uploading…', 'info');
    try {
      const url = await uploadFile('avatars', me.id, await shrinkImage(file, 480, 0.9));
      const { error } = await supa.rpc('group_update', { conv: convId, p_title: t.title || null, p_avatar: url });
      if (error) return say(needSql(error));
      t.avatar_url = url; paintAvatar($('#giAvatar', root), url, t.name);
      say('Group photo updated.', 'ok'); await after();
    } catch (err) { say(err.message || 'Upload failed.'); }
  });
  $('#giNoPhoto', root)?.addEventListener('click', async () => {
    const { error } = await supa.rpc('group_update', { conv: convId, p_title: t.title || null, p_avatar: null });
    if (error) return say(needSql(error));
    close(); await after();
  });
  $('#giLeave', root).addEventListener('click', async () => {
    if (!confirm(`Leave "${t.name}"? You'll stop getting its messages. Someone in the group can add you back.`)) return;
    const { error } = await supa.rpc('group_leave', { conv: convId });
    if (error) return say(needSql(error));
    close();
    state.openId = null; state.messages = [];
    $('#panes').classList.remove('reading');
    toast(`You left ${t.name}.`, 'ok');
    await loadThreads();
  });
  $('#giAdd', root)?.addEventListener('click', () => { close(); openAddPeople(t); });
  for (const id of ['#giCanAdd', '#giCanEdit']) {
    $(id, root)?.addEventListener('change', async () => {
      const { error } = await supa.rpc('admin_group_settings', {
        conv: convId, can_add: $('#giCanAdd', root).checked, can_edit: $('#giCanEdit', root).checked });
      if (error) return say(needSql(error));
      say('Settings saved.', 'ok'); await after();
    });
  }
  $('#giManage', root)?.addEventListener('click', async () => {
    close();
    const { openMembers } = await import('./members.js');
    if (await openMembers(convId)) refreshOpenChat();
  });
}

/* Members add from their contacts; the GM can add anyone. */
async function openAddPeople(t) {
  let people;
  if (me.is_admin) {
    const { data } = await supa.from('profiles').select('*');
    (data || []).forEach(p => state.people.set(p.id, p));
    people = (data || []).map(p => ({ id: p.id, label: p.username, profile: p }));
  } else {
    const { data: rows } = await supa.from('contacts').select('contact_id, nickname').eq('owner_id', me.id);
    await cachePeople((rows || []).map(r => r.contact_id));
    people = (rows || []).map(r => ({ id: r.contact_id, label: r.nickname || personName(r.contact_id), profile: state.people.get(r.contact_id) }));
  }
  people = people.filter(p => !t.memberIds.includes(p.id) && p.id !== me.id).sort((a, b) => a.label.localeCompare(b.label));

  const { root, close } = modal({
    title: `Add people to ${t.name}`,
    body: people.length ? people.map(p => `
      <label class="checkline">
        <input type="checkbox" value="${esc(p.id)}">
        <span class="avatar avatar-sm" data-aav="${esc(p.id)}"></span>
        <span><span style="font-family:var(--font-ui);font-weight:600">${esc(p.label)}</span><br>
        <span class="mono" style="font-size:11.5px;color:var(--muted)">${esc(formatNumber(p.profile?.phone_number))}</span></span>
      </label>`).join('')
      : `<div class="empty-state">${me.is_admin ? 'Everyone is already here.' : 'All your contacts are already here. Add more contacts with ☰.'}</div>`,
    footer: people.length ? `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn" id="apGo">Add</button>` : ''
  });
  people.forEach(p => paintAvatar(root.querySelector(`[data-aav="${p.id}"]`), p.profile?.avatar_url, p.label));
  $('#apGo', root)?.addEventListener('click', async () => {
    const ids = $$('.checkline input:checked', root).map(i => i.value);
    if (!ids.length) return toast('Pick someone to add.', 'error');
    const { error } = await supa.rpc('group_add', { conv: t.id, user_ids: ids });
    if (error) return toast(/group_add|function/i.test(error.message) ? 'This needs sql/groups.sql.' : error.message, 'error');
    close();
    toast(`Added ${ids.length} ${ids.length === 1 ? 'person' : 'people'}.`, 'ok');
    refreshOpenChat();
  });
}
