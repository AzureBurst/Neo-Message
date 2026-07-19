// =====================================================================
//  NEO MESSAGE — shared client + helpers
// =====================================================================

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

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* ------------------------------------------------------------------ */
/*  auth                                                              */
/* ------------------------------------------------------------------ */

export const usernameToEmail = (u) =>
  `${u.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@${AUTH_DOMAIN}`;

/** Returns the signed-in user's profile row, or sends them to sign-in. */
export async function requireProfile() {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) {
    location.replace('index.html');
    return null;
  }
  const { data, error } = await supa
    .from('profiles').select('*').eq('id', session.user.id).single();

  if (error || !data) {
    await supa.auth.signOut();
    location.replace('index.html');
    return null;
  }
  return data;
}

export async function signOut() {
  await supa.auth.signOut();
  location.replace('index.html');
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

export function clockTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function shortTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
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
  el.innerHTML = `
    <div class="bars"><i></i><i></i><i></i><i></i></div>
    <span class="carrier-name">${esc(label || CARRIER_NAME)}</span>
    <span class="carrier-spacer"></span>
    <span class="carrier-clock">${clockTime()}</span>
    <span class="carrier-spacer"></span>
    <span>LTE</span>
    <span class="battery"><i></i></span>`;

  const clock = el.querySelector('.carrier-clock');
  setInterval(() => { clock.textContent = clockTime(); }, 20_000);
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
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:500;' +
    'padding:11px 18px;border-radius:10px;font:500 13.5px Inter,system-ui;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:88vw;text-align:center;' +
    (kind === 'error'
      ? 'background:#3A1A1F;color:#FFB3BB;border:1px solid #7A2B36'
      : 'background:#1D2532;color:#E6EAF2;border:1px solid #2A3444');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
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
