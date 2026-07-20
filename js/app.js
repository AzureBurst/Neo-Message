// =====================================================================
//  NEO MESSAGE — messenger
// =====================================================================

import {
  supa, requireProfile, ungate, signOut, mountCarrier, paintAvatar, setClockSource,
  formatNumber, shortTime, dayLabel, isJumboEmoji, esc, toast,
  lightbox, uploadFile, shrinkImage, $, $$
} from './supa.js';
import { mountPuppetBar, openNpcModal, hasHome } from './npc.js';
import { loadClock, storyNow, onClockChange, openClockModal } from './clock.js';
import { playSent, playReceived, isMuted, toggleMute } from './sfx.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');
ungate();

await loadClock();
setClockSource(storyNow);
mountCarrier($('#carrier'));
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
  search: ''
};

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
}
// Puppets stay reachable while you are wearing one, so you can get back.
if (me.is_admin || hasHome()) {
  addGmButton('npcBtn', '◑', 'NPC puppets', () => openNpcModal(modal));
}
mountPuppetBar();

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
        .select('conversation_id, body, image_url, created_at, sender_id')
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
      ? (t.last.body ? esc(t.last.body.slice(0, 60))
                     : '<span style="opacity:.75">📷 Photo</span>')
      : '<span style="opacity:.6">No messages yet</span>';

    return `
      <div class="thread ${t.id === state.openId ? 'active' : ''}" data-id="${t.id}">
        <span class="avatar" data-av="${other?.id ?? ''}">${
          other?.avatar_url
            ? `<img src="${esc(other.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : esc((t.name || '?').slice(0, 2).toUpperCase())
        }</span>
        <div class="thread-main">
          <div class="thread-top">
            <span class="thread-name">${esc(t.name)}</span>
            <span class="thread-time">${t.last ? shortTime(t.last.created_at) : ''}</span>
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

  $('#panes').classList.add('reading');
  $('#convoName').textContent = t.name;

  const other = !t.is_group && t.others.length ? state.people.get(t.others[0]) : null;
  $('#convoSub').textContent = t.is_group
    ? `${t.memberIds.length} people`
    : formatNumber(other?.phone_number);
  paintAvatar($('#convoAvatar'), other?.avatar_url, t.name);

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
  renderStream();
}

function renderStream() {
  const stream = $('#stream');
  const t = state.threads.find(x => x.id === state.openId);

  if (!state.messages.length) {
    stream.innerHTML = '<div class="empty-state">No messages yet. Say something.</div>';
    return;
  }

  let html = '';
  let lastDay = null;
  let lastSender = null;

  state.messages.forEach((m, i) => {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      html += `<div class="daystamp">${esc(day)}</div>`;
      lastDay = day;
      lastSender = null;
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

    const jumbo = !m.image_url && isJumboEmoji(m.body);
    const parts = [];
    if (m.image_url) parts.push(`<img src="${esc(m.image_url)}" alt="Attached image" loading="lazy">`);
    if (m.body) parts.push(`<span class="msg-text">${esc(m.body)}</span>`);

    html += `
      <div class="row ${out ? 'out' : 'in'} ${gap ? 'gap' : ''}" data-tint="${esc(tint)}">
        <div class="bubble ${jumbo ? 'jumbo' : ''}">${parts.join('')}</div>
        <span class="stamp">${shortTime(m.created_at)}</span>
      </div>`;

    lastSender = m.sender_id;
  });

  stream.innerHTML = html;

  $$('[data-avatar]', stream).forEach(el => {
    const id = el.dataset.avatar;
    const p  = id === me.id ? me : state.people.get(id);
    paintAvatar(el, p?.avatar_url, p?.username || '?');
  });

  $$('.bubble img', stream).forEach(img =>
    img.addEventListener('click', () => lightbox(img.src)));

  stream.scrollTop = stream.scrollHeight;
}


/* ------------------------------------------------------------------ */
/*  composing                                                         */
/* ------------------------------------------------------------------ */

const input = $('#input');

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 130) + 'px';
  refreshSendState();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

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

  const { data, error } = await supa.from('messages').insert({
    conversation_id: state.openId,
    sender_id: me.id,
    body: body || null,
    image_url: imageUrl
  }).select().single();

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

const EMOJI = {
  '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
         '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
         '😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','🥱','😴','🤤','😪','😵','🤯',
         '🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮‍💨','😢','😭','😤','😠','😡','🤬','😱',
         '😨','😰','😥','🥶','🥵','😳','🤢','🤮','🤧','😷','🤒','🤕','💀','☠️','👻','👽'],
  '👋': ['👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇',
         '☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','✍️',
         '💅','👀','👁️','👄','🧠','🫀','🦴','👤','🚶','🏃','💃','🕺','🧍','🧎','🤷','🤦'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
         '💘','💝','💟','☮️','✝️','🔥','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗯️',
         '♠️','♥️','♦️','♣️','🃏','🎴','🀄','⭐','🌟','✨','⚡','☄️','💡','🔮','🎯','🧿'],
  '📱': ['📱','💻','⌨️','🖥️','🖨️','🕹️','💾','💿','📷','📸','🎥','📞','☎️','📟','📠','📺',
         '📻','🎙️','⏱️','⏰','🔋','🔌','💡','🔦','🧭','⚙️','🔧','🔨','🗝️','🔒','🔓','🛡️',
         '🔫','🗡️','💊','💉','🧪','🧬','🔬','🔭','📡','💰','💳','💎','📦','📄','📁','🗂️'],
  '🚗': ['🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🏍️','🛵','🚲','✈️','🚀',
         '🛸','🚁','⛵','🚤','🛳️','🚂','🚇','🗺️','🧳','⛰️','🌋','🏕️','🏖️','🏙️','🌃','🌉',
         '🏠','🏢','🏥','🏦','🏨','🏪','🏫','⛪','🕌','🏰','🗿','🗽','🎡','🎢','🎪','⛲'],
  '🍕': ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍣','🍤','🍱','🥟','🍚',
         '🍞','🥐','🥨','🧀','🥓','🍳','🥞','🧇','🍗','🍖','🥩','🥙','🍿','🧂','🍩','🍪',
         '🎂','🍰','🧁','🍫','🍬','🍭','☕','🍵','🥤','🧃','🍺','🍻','🍷','🥃','🍸','🥂']
};

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
          <input id="addFind" placeholder="Username or number" maxlength="24" autocomplete="off">
          <button class="btn btn-sm" id="addGo" style="flex-shrink:0">Add</button>
        </div>
        <div class="hint">Type a username to search, or paste the number they signed up with.</div>
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
          : esc(error.message)}</div>`;
      return;
    }
    msgBox.innerHTML = `<div class="notice notice-ok">${esc(name)} added.</div>`;
    setTimeout(() => { close(); openContactsModal(); }, 700);
  }

  /* Live username search. Profiles are readable by anyone signed in —
     that is what makes looking each other up possible at all — so this
     needs no extra database work. */
  let findTimer = null;
  findBox.addEventListener('input', () => {
    clearTimeout(findTimer);
    const q = findBox.value.trim();

    if (q.length < 2 || /^[\d ()\-+.]+$/.test(q)) { results.innerHTML = ''; return; }

    findTimer = setTimeout(async () => {
      const { data } = await supa
        .from('profiles')
        .select('id, username, phone_number, avatar_url')
        .ilike('username', `%${q}%`)
        .neq('id', me.id)
        .limit(8);

      if (!data?.length) {
        results.innerHTML = '<div class="find-none">Nobody by that name.</div>';
        return;
      }

      results.innerHTML = data.map(p => `
        <button type="button" class="find-row" data-id="${esc(p.id)}"
                data-name="${esc(p.username)}">
          <span class="avatar avatar-sm" data-find-avatar="${esc(p.id)}"></span>
          <span class="find-id">
            <strong>${esc(p.username)}</strong>
            <span class="mono">${esc(formatNumber(p.phone_number))}</span>
          </span>
          <span class="find-add">Add</span>
        </button>`).join('');

      data.forEach(p => paintAvatar(
        results.querySelector(`[data-find-avatar="${p.id}"]`), p.avatar_url, p.username));

      $$('.find-row', results).forEach(r => r.addEventListener('click',
        () => addById(r.dataset.id, r.dataset.name)));
    }, 220);
  });

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

    const { data } = await supa.from('profiles')
      .select('id, username').ilike('username', q).neq('id', me.id).maybeSingle();

    if (!data) {
      msgBox.innerHTML = '<div class="notice notice-error">No account with that username.</div>';
      return;
    }
    await addById(data.id, data.username);
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

    const next = formatNumber(digits);
    const { error } = await supa.from('profiles')
      .update({ phone_number: next }).eq('id', me.id);

    if (error) {
      box.innerHTML = `<div class="notice notice-error">${
        /duplicate|unique/i.test(error.message)
          ? 'Someone else already has that number.'
          : esc(error.message)}</div>`;
      return;
    }
    me.phone_number = next;
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
      { event: 'INSERT', schema: 'public', table: 'conversation_members',
        filter: `user_id=eq.${me.id}` },
      () => loadThreads())
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
