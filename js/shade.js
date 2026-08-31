// =====================================================================
//  NEO — notification shade
//
//  A phone-style shade that pulls down from the top of any page. Lists
//  the signed-in player's notifications newest first, lets them open one
//  (which marks it read and navigates) or clear them all. Also exposes
//  per-app unread counts for the home-screen badges.
//
//  Everything it shows is the player's own — the row level security on
//  the notifications table guarantees a query only ever returns theirs.
// =====================================================================

import { supa, esc, $, $$ } from './supa.js';

let items = [];
const listeners = new Set();

export function onNotifications(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function announce() { listeners.forEach(fn => { try { fn(items); } catch {} }); }

export function unreadCounts() {
  const by = { messages: 0, instagrat: 0, calendar: 0, total: 0 };
  for (const n of items) {
    if (n.read_at) continue;
    by[n.app] = (by[n.app] || 0) + 1;
    by.total += 1;
  }
  return by;
}

/* Mark read every unread notification about a particular thing — a
   conversation, a post, a profile. Called when you open that thing, so
   its badge clears the way a phone's does. Safe to call even before the
   shade has mounted. */
export async function clearNotificationsFor(refId) {
  if (!refId) return;
  await supa.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('ref_id', refId).is('read_at', null);
  // The realtime subscription will refresh; if it is not mounted yet,
  // update our local copy so counts are right immediately.
  items = items.map(n => n.ref_id === refId && !n.read_at
    ? { ...n, read_at: new Date().toISOString() } : n);
  announce();
}

async function load() {
  const { data, error } = await supa.from('notifications')
    .select('*').order('created_at', { ascending: false }).limit(60);
  if (error) {
    console.warn('[shade] could not load notifications:', error.message,
      '\nMost likely sql/notifications.sql has not been run yet.');
    items = [];
  } else {
    items = data || [];
  }
  announce();
  paintShade();
}

/* A console helper to check the shade pipeline from the browser:
   window.neoTestNotify() reports whether the notifications table is
   reachable and how many rows you have. It does NOT try to insert —
   only the database triggers may create notifications, so a client
   insert is correctly refused and would be a misleading test. To create
   a real one, use the SQL snippet in the README, or trigger an event
   (send yourself a message from another account). */
if (typeof window !== 'undefined') {
  window.neoTestNotify = async () => {
    const { data, error } = await supa.from('notifications')
      .select('id', { count: 'exact', head: false }).limit(1);
    if (error) {
      console.warn('[shade] table not reachable:', error.message,
        '\n→ Run sql/notifications.sql in the Supabase SQL Editor.');
    } else {
      console.log(`[shade] table OK. You have ${data?.length ? 'at least one' : 'no'} notification(s). ` +
        'Open the shade with the tab at the top, tapping the carrier bar, or:',
        "document.getElementById('shade').classList.add('open')");
    }
  };
}

/* ------------------------------------------------------------------ */
/*  rendering                                                          */
/* ------------------------------------------------------------------ */

const ICON = {
  messages: '✉', instagrat: '◎', calendar: '📅'
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function rowHtml(n) {
  const label = n.count > 1 && n.kind === 'message'
    ? `${n.count} new messages`
    : (n.body || '');
  const av = n.actor_avatar
    ? `<span class="notif-ic has-av" style="background-image:url('${esc(n.actor_avatar)}')"></span>`
    : `<span class="notif-ic">${ICON[n.app] || '•'}</span>`;
  return `
    <button class="notif ${n.read_at ? 'read' : ''}" data-id="${esc(n.id)}" data-link="${esc(n.link || '')}">
      ${av}
      <span class="notif-main">
        <span class="notif-title">${esc(n.title)}${n.count > 1 && n.kind !== 'message' ? ` <span class="notif-x">×${n.count}</span>` : ''}</span>
        <span class="notif-body">${esc(label)}</span>
      </span>
      <span class="notif-app-ic">${ICON[n.app] || ''}</span>
      <span class="notif-time">${timeAgo(n.created_at)}</span>
    </button>`;
}

function paintShade() {
  const body = $('#shadeBody');
  if (!body) return;
  const unread = unreadCounts().total;
  $('#shadeCount').textContent = unread ? `${unread} new` : 'All caught up';
  $('#shadeClear').style.visibility = items.some(n => !n.read_at) ? 'visible' : 'hidden';

  body.innerHTML = items.length
    ? items.map(rowHtml).join('')
    : '<div class="shade-empty">Nothing here yet.</div>';

  $$('.notif', body).forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.id, link = el.dataset.link;
    await supa.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('id', id).is('read_at', null);
    if (link) location.href = link;
    else { load(); }
  }));
}

/* ------------------------------------------------------------------ */
/*  the shade element + pull-down gesture                              */
/* ------------------------------------------------------------------ */

export function mountShade() {
  if ($('#shade')) return;

  const el = document.createElement('div');
  el.id = 'shade';
  el.className = 'shade';
  el.innerHTML = `
    <div class="shade-scrim"></div>
    <div class="shade-panel">
      <div class="shade-head">
        <span id="shadeCount">—</span>
        <button id="shadeClear" class="shade-clear">Clear all</button>
      </div>
      <div class="shade-body" id="shadeBody"></div>
      <div class="shade-grip"></div>
    </div>`;
  document.body.appendChild(el);

  // A slim pull tab at the very top, plus tapping the carrier bar.
  const tab = document.createElement('button');
  tab.className = 'shade-tab';
  tab.setAttribute('aria-label', 'Notifications');
  tab.innerHTML = '<span class="shade-tab-pill"></span><span class="shade-tab-dot" id="shadeTabDot" hidden></span>';
  document.body.appendChild(tab);

  const lockUp = () => !!document.getElementById('lockScreen');

  const open  = () => { if (lockUp()) return; el.classList.add('open'); paintShade(); };
  const close = () => el.classList.remove('open');
  const toggle = () => el.classList.contains('open') ? close() : open();

  tab.addEventListener('click', toggle);
  el.querySelector('.shade-scrim').addEventListener('click', close);
  $('#shadeClear').addEventListener('click', async () => {
    await supa.from('notifications').update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    load();
  });

  // Tapping the carrier bar also opens it, like a status bar.
  const carrier = $('#carrier');
  if (carrier) { carrier.style.cursor = 'pointer'; carrier.addEventListener('click', toggle); }

  // Pull-down gesture from the top edge.
  let startY = null, dragging = false;
  window.addEventListener('pointerdown', (e) => {
    if (el.classList.contains('open')) return;
    if (e.clientY > 40) return;          // only from the very top
    dragging = true; startY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (e.clientY - startY > 60) { dragging = false; open(); }
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  // Close on Escape.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Keep the little dot on the tab in sync with unread state.
  onNotifications(() => {
    const dot = $('#shadeTabDot');
    if (dot) dot.hidden = unreadCounts().total === 0;
  });

  load();

  // Live updates.
  supa.channel('notif-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => load())
    .subscribe();
}
