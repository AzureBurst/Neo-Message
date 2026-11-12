// =====================================================================
//  NEO MESSAGE — shared client + helpers
// =====================================================================

// Must be first: makes every date on the page use the story time zone.
import './tz.js';
// Overdrive theme motion (only loads when the theme is switched on).
if (document.documentElement.dataset.theme === 'overdrive') import('./fx.js').catch(() => {});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_DOMAIN,
  CARRIER_NAME, MAX_UPLOAD_MB
} from './config.js';

if (SUPABASE_URL.startsWith('PASTE_')) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML =
      '<div style="max-width:520px;margin:16vh auto;padding:26px;font-family:system-ui;' +
      'color:#E6EAF2;background:#141A24;border:1px solid #2A3444;border-radius:20px;line-height:1.6">' +
      '<h2 style="margin:0 0 10px">Add your Supabase keys</h2>' +
      '<p style="color:#8695AC;margin:0">Open <code style="color:#FF7A3D">js/config.js</code> and ' +
      'replace the two placeholder values with your project URL and anon key. ' +
      'Setup walkthrough is in the README.</p></div>';
  });
  throw new Error('Neo Message: config.js has not been filled in yet.');
}

/* ------------------------------------------------------------------ */
/*  "View as" — the GM looking at the site as a player sees it         */
/*  (supabase/functions/view-as). A tab opened with #viewas=<token>    */
/*  signs in as that player with its own session kept in this tab      */
/*  only, so the GM stays signed in everywhere else. Every change is   */
/*  blocked: nothing can be sent, saved, read-marked or cleared.       */
/* ------------------------------------------------------------------ */

const VIEW_KEY = 'neo.viewas';
const PREVIEW = { message: 'Preview only, so nothing was changed.', code: 'preview' };
const READ_RPCS = new Set(['directory', 'npc_inbox']);
{
  const m = location.hash.match(/viewas=([^&]+)(?:&u=([^&]*))?/);
  if (m) {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ token: m[1], username: decodeURIComponent(m[2] || '') })); } catch {}
    history.replaceState(null, '', location.pathname + location.search);
  }
}
/** { username } while this tab is a GM preview, otherwise null. */
export const viewingAs = (() => { try { return JSON.parse(sessionStorage.getItem(VIEW_KEY)); } catch { return null; } })();

const raw = viewingAs
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: sessionStorage, storageKey: 'neo-viewas', detectSessionInUrl: false }
    })
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* Something that can be chained and awaited like a query, and always
   answers "preview only". */
function blocked() {
  const p = new Proxy(function () {}, {
    get: (_, k) => k === 'then' ? (res) => res({ data: null, error: PREVIEW }) : () => p,
    apply: () => p
  });
  return p;
}
function readOnly(client) {
  const pass = (obj, k) => { const v = obj[k]; return typeof v === 'function' ? v.bind(obj) : v; };
  const storage = {
    from: (bucket) => new Proxy(client.storage.from(bucket), {
      get: (b, k) => ['upload', 'update', 'remove', 'move', 'copy'].includes(k)
        ? async () => ({ data: null, error: PREVIEW }) : pass(b, k)
    })
  };
  return new Proxy(client, {
    get(c, k) {
      if (k === 'from') return (t) => new Proxy(c.from(t), {
        get: (q, m) => ['insert', 'update', 'upsert', 'delete'].includes(m) ? () => blocked() : pass(q, m)
      });
      if (k === 'rpc') return (name, ...a) => READ_RPCS.has(name) ? c.rpc(name, ...a) : blocked();
      if (k === 'storage') return storage;
      if (k === 'functions') return { invoke: async () => ({ data: null, error: PREVIEW }) };
      return pass(c, k);
    }
  });
}

export const supa = viewingAs ? readOnly(raw) : raw;

/** Leaves a preview tab: forgets the player's session and goes back to the GM's. */
export async function exitViewAs(goTo = 'admin.html') {
  try { await raw.auth.signOut({ scope: 'local' }); } catch {}
  try { sessionStorage.removeItem(VIEW_KEY); sessionStorage.removeItem('neo-viewas'); } catch {}
  location.href = goTo;
}

function mountViewBar(username) {
  if (document.querySelector('.viewas-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'puppet-bar viewas-bar';
  bar.innerHTML = `
    <span class="puppet-dot"></span>
    <span>Viewing as <strong>${esc(username)}</strong> · read-only</span>
    <button class="puppet-back" type="button">Exit</button>`;
  document.body.prepend(bar);
  document.body.classList.add('puppeting');
  bar.querySelector('.puppet-back').addEventListener('click', () => exitViewAs());
}


/* ------------------------------------------------------------------ */
/*  auth                                                              */
/* ------------------------------------------------------------------ */

export const usernameToEmail = (u) =>
  `${u.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@${AUTH_DOMAIN}`;

/** Returns the signed-in user's profile row, or sends them to sign-in. */
/** Drops the curtain that app.html and admin.html start behind. */
export function ungate() {
  document.body.classList.remove('gated');
  document.getElementById('gateNote')?.remove();
}

/** Leaves the curtain down, explains itself, and sends them to sign in. */
function bounce(why) {
  const note = document.getElementById('gateNote');
  if (note) note.textContent = why;
  location.replace('index.html');
}

export async function requireProfile() {
  if (viewingAs?.token) {
    // First page of a preview tab: trade the one-time token for a session.
    const { error } = await raw.auth.verifyOtp({ token_hash: viewingAs.token, type: 'magiclink' });
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ username: viewingAs.username })); } catch {}
    delete viewingAs.token;
    if (error) {
      try { sessionStorage.removeItem(VIEW_KEY); } catch {}
      document.body.innerHTML = `<div class="notice notice-error" style="max-width:480px;margin:20vh auto">
        That preview link has expired or was already used. Close this tab and press "View as" again.</div>`;
      document.body.classList.remove('gated');
      return null;
    }
  }
  const { data: { session } } = await supa.auth.getSession();
  if (!session) {
    bounce('You are not signed in. Taking you to the sign-in page…');
    return null;
  }
  const { data, error } = await supa
    .from('profiles').select('*').eq('id', session.user.id).single();

  if (error || !data) {
    await supa.auth.signOut();
    bounce('That session is no longer valid. Taking you to the sign-in page…');
    return null;
  }
  // Maintenance mode: shows the sign (and keeps watching) on every page.
  import('./maintenance.js').then(m => m.watchMaintenance(data))
    .catch(err => console.warn('[maintenance]', err));
  if (viewingAs) { mountViewBar(viewingAs.username || data.username); return data; }
  // Signed in as an NPC? Show the "Back to me" bar on every page.
  try {
    if (localStorage.getItem('neo.npc.acting')) {
      import('./npc.js').then(m => m.mountPuppetBar()).catch(err => console.warn('[npc]', err));
    }
  } catch {}
  return data;
}

export async function signOut() {
  if (viewingAs) return exitViewAs();
  try { sessionStorage.removeItem('neo.deep'); } catch {}
  await supa.auth.signOut();
  location.replace('index.html');
}

/* ------------------------------------------------------------------ */
/*  presence                                                          */
/*                                                                    */
/*  Marks the player active while a tab is open and visible, so the    */
/*  Discord notifier can skip anyone already looking at the app. Best  */
/*  effort by design: a locked phone or a backgrounded tab stops       */
/*  reporting within a couple of minutes, at which point the person    */
/*  counts as away and can be pinged again — which is what we want.    */
/* ------------------------------------------------------------------ */

export function startPresence() {
  let timer = null;

  const beat = () => {
    if (document.visibilityState === 'visible') {
      supa.rpc('touch_last_seen').then(() => {}, () => {});   // fire and forget
    }
  };

  const run = () => {
    beat();
    clearInterval(timer);
    timer = setInterval(beat, 60_000);   // once a minute while visible
  };

  run();
  // Beat immediately when the tab comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}


/* ------------------------------------------------------------------ */
/*  formatting                                                        */
/* ------------------------------------------------------------------ */

/** 5551234567 -> (555) 123-4567. Leaves anything unusual alone. */
export function formatNumber(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 7)  return `${d.slice(0,3)}-${d.slice(3)}`;
  return raw;
}

/* The carrier bar asks this for the time. js/clock.js swaps it out for
   the shared story clock once that has loaded. */
let clockSource = () => new Date();
export function setClockSource(fn) { clockSource = fn; }
export const carrierNow = () => clockSource();

export function clockTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function shortTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = clockSource();                   // story clock when one is set
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest))  return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fullStamp(iso) {
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

/* ------------------------------------------------------------------ */
/*  In-character vs real timestamps                                    */
/*  Rows carry story_at (in-character, stamped by the server from the  */
/*  GM's story clock) and created_at (real). We show the IC time and   */
/*  reveal the real one on hover, or on tap on phones.                 */
/* ------------------------------------------------------------------ */
const STAMP_FMT = {
  time:  { hour: 'numeric', minute: '2-digit' },
  short: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date:  { month: 'short', day: 'numeric', year: 'numeric' },
  full:  { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }
};
const REAL_FMT = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };

/** The in-character moment of a row (falls back to real time). */
export const icAt = (row, icKey = 'story_at', realKey = 'created_at') => row?.[icKey] || row?.[realKey];

/** <time> showing IC time; hover/tap shows the real timestamp. */
export function icStamp(row, { fmt = 'time', icKey = 'story_at', realKey = 'created_at', cls = '' } = {}) {
  const real = row?.[realKey];
  const ic = row?.[icKey] || real;
  if (!ic) return '';
  const icTxt = new Date(ic).toLocaleString([], STAMP_FMT[fmt] || STAMP_FMT.time);
  const realTxt = real ? new Date(real).toLocaleString([], REAL_FMT) : '';
  const differs = real && row?.[icKey] && Math.abs(new Date(real) - new Date(ic)) > 60000;
  return `<time class="ic-stamp${differs ? ' ic-diff' : ''} ${cls}" datetime="${esc(ic)}"`
    + (realTxt ? ` data-real="${esc('Real time · ' + realTxt)}" aria-label="${esc(icTxt + ' in character. Real time ' + realTxt)}"` : '')
    + `>${esc(icTxt)}</time>`;
}

// Hover a stamp for the real time — a floating label kept on screen,
// so it isn't clipped by scrolling panels.
if (typeof document !== 'undefined' && !window.__icTipWired) {
  window.__icTipWired = true;
  let tip = null;
  const hide = () => { tip?.remove(); tip = null; };
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest?.('.ic-stamp[data-real]');
    if (!t || !matchMedia('(hover: hover)').matches) return;
    hide();
    tip = document.createElement('div');
    tip.className = 'ic-tip'; tip.textContent = t.dataset.real;
    document.body.appendChild(tip);
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const top = r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    t.addEventListener('mouseleave', hide, { once: true });
  });
  document.addEventListener('scroll', hide, true);
}

// Tap a stamp to flip between IC and real time (phones have no hover).
if (typeof document !== 'undefined' && !window.__icStampWired) {
  window.__icStampWired = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('.ic-stamp[data-real]');
    if (!t || matchMedia('(hover: hover)').matches || t.closest('button, a')) return;
    e.stopPropagation();
    t.classList.toggle('show-real');
    clearTimeout(t._icT);
    if (t.classList.contains('show-real')) t._icT = setTimeout(() => t.classList.remove('show-real'), 3500);
  }, true);
}

export const initials = (name) => {
  const words = String(name || '').trim().split(/[\s_.-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

/** Escapes text before it goes anywhere near innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** True when a message is nothing but a few emoji — those get drawn big. */
export function isJumboEmoji(text) {
  if (!text) return false;
  const stripped = text.replace(/\s/g, '');
  if (!stripped || stripped.length > 12) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component})+$/u.test(stripped);
}


/* ------------------------------------------------------------------ */
/*  dom                                                               */
/* ------------------------------------------------------------------ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Draws the carrier status bar. Pass admin:true for the red variant. */
export function mountCarrier(el, { admin = false, label = null } = {}) {
  if (!el) return;
  el.className = 'carrier' + (admin ? ' is-admin' : '');
  const dateOf = d => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  el.innerHTML = `
    <div class="bars"><i></i><i></i><i></i><i></i></div>
    <span class="carrier-name">${esc(label || CARRIER_NAME)}</span>
    <span class="carrier-spacer"></span>
    <span class="carrier-when">
      <span class="carrier-date">${dateOf(carrierNow())}</span>
      <span class="carrier-clock">${clockTime(carrierNow())}</span>
    </span>
    <span class="carrier-spacer"></span>
    <span>LTE</span>
    <span class="battery"><i></i></span>`;

  const clock = el.querySelector('.carrier-clock');
  const date  = el.querySelector('.carrier-date');
  const paint = () => {
    const now = carrierNow();
    clock.textContent = clockTime(now);
    date.textContent  = dateOf(now);
  };
  el.repaint = paint;
  setInterval(paint, 20_000);
}

/** Fills an .avatar element with an image, or initials when there is none. */
export function paintAvatar(el, url, name) {
  if (url) {
    el.innerHTML = `<img src="${esc(url)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    el.textContent = initials(name);
  }
}

export function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = `neo-toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  // Let it settle in, then fade out and remove.
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 260); }, 3000);
}

/** Click-to-zoom for any image. */
export function lightbox(src) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${esc(src)}" alt="">`;
  box.addEventListener('click', () => box.remove());
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc2); }
  });
  document.body.appendChild(box);
}


/* ------------------------------------------------------------------ */
/*  uploads                                                           */
/* ------------------------------------------------------------------ */

/**
 * Sends a file to storage. Files live in a folder named after the
 * uploader's id, which is what the storage security rules check.
 */
export async function uploadFile(bucket, userId, file) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`That file is over the ${MAX_UPLOAD_MB} MB limit.`);
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be attached.');
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supa.storage.from(bucket)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  return supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Shrinks a picture in the browser so uploads stay small and fast. */
export function shrinkImage(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/gif') return resolve(file);  // keep animation
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w <= maxDim && h <= maxDim && file.size < 900_000) return resolve(file);

      const scale = Math.min(maxDim / w, maxDim / h, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        b => resolve(b ? new File([b], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}


/* ------------------------------------------------------------------ */
/*  file downloads (admin exports)                                    */
/* ------------------------------------------------------------------ */

export function downloadBlob(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows, columns) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(c => cell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => cell(c.get(r))).join(',')).join('\r\n');
  return `${head}\r\n${body}`;
}
