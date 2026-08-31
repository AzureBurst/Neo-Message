// =====================================================================
//  NEO MESSAGE — home screen
//
//  The phone's home screen. Two apps for now; the grid grows if you add
//  more. Badges hint at what is waiting inside each one.
// =====================================================================

import {
  supa, requireProfile, signOut, ungate, mountCarrier, setClockSource, startPresence, $
} from './supa.js';
import { loadClock, storyNow, onClockChange } from './clock.js';
import { mountShade, onNotifications, unreadCounts } from './shade.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();

$('#homeHi').textContent = `Hi, ${me.username}`;
$('#signOutBtn').addEventListener('click', signOut);

/* Swap in custom icons if the files are there. A missing file just
   leaves the glyph fallback in place, so nothing breaks before your
   art lands. */
function tryIcon(glyphEl, file) {
  const img = new Image();
  img.onload = () => {
    glyphEl.innerHTML = '';
    glyphEl.style.backgroundImage = `url('${file}')`;
    glyphEl.classList.add('has-art');
  };
  img.src = file;
}
tryIcon(document.querySelector('[data-icon="message"]'), 'assets/apps/message.png');
tryIcon(document.querySelector('[data-icon="instagrat"]'), 'assets/apps/instagrat.png');

/* The calendar tile shows the current story date, like a real phone's
   calendar icon. Painted from storyNow() so it reflects the GM's clock,
   and repainted if the clock changes while the home screen is open. */
const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
function paintCalIcon() {
  const g = document.getElementById('calGlyph');
  if (!g) return;
  const d = storyNow();
  g.innerHTML = `
    <span class="cal-glyph-top">${DOW[d.getDay()]}</span>
    <span class="cal-glyph-day">${d.getDate()}</span>`;
}
paintCalIcon();
// If the GM changes the clock elsewhere, keep the icon honest.
onClockChange?.(paintCalIcon);
setInterval(paintCalIcon, 60_000);

/* ------------------------------------------------------------------ */
/*  badges                                                            */
/* ------------------------------------------------------------------ */

function badge(el, n) {
  if (!el) return;
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = n > 99 ? '99+' : String(n);
}

/* Badges now come straight from unread notifications, grouped by app, so
   every icon shows a real count that clears as you read things. */
function paintBadges(counts) {
  badge($('#msgBadge'),  counts.messages);
  badge($('#gratBadge'), counts.instagrat);
  badge($('#calBadge'),  counts.calendar);
}

mountShade();
onNotifications(() => paintBadges(unreadCounts()));

if (me.is_admin) {
  const hint = $('#adminHint');
  hint.hidden = false;
  hint.textContent = 'You are the GM. Both apps have extra controls for you inside.';
}

/* ------------------------------------------------------------------ */
/*  lock screen                                                        */
/*                                                                    */
/*  A phone-style lock over the home screen. Swipe up (or click, or    */
/*  press a key) to unlock. Shown once per browser session so bouncing */
/*  between an app and home does not re-lock every time; a fresh visit  */
/*  or a new tab locks again, like waking a phone.                    */
/* ------------------------------------------------------------------ */

const lock = $('#lockScreen');

function paintLock() {
  const d = storyNow();
  $('#lockTime').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#lockDate').textContent = d.toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric'
  });
}

function setupLock() {
  paintLock();
  const tick = setInterval(paintLock, 15_000);
  onClockChange?.(paintLock);

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let unlocked = false;

  const done = () => {
    if (unlocked) return;
    unlocked = true;
    clearInterval(tick);
    // The swipe-up animation still plays — the lock slides off the top —
    // it just triggers on a tap now instead of a drag.
    lock.classList.add('unlocking');
    if (reduce) lock.remove();
    else lock.addEventListener('transitionend', () => lock.remove(), { once: true });
  };

  lock.addEventListener('click', done);
  lock.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); done(); }
  });
}

/* When to lock:
   - on a refresh of the home screen, and
   - on arriving fresh (a login).
   NOT when coming back from one of the apps — that is normal in-phone
   navigation and re-locking each time would be maddening. Each app page
   sets 'neo.deep' on load; if it is set, we came from inside and skip. */
const navType = (performance.getEntriesByType?.('navigation')[0] || {}).type;
const cameFromApp = sessionStorage.getItem('neo.deep') === '1';
const lastApp = sessionStorage.getItem('neo.lastApp');
sessionStorage.removeItem('neo.deep');           // consume it
sessionStorage.removeItem('neo.lastApp');

const shouldLock = navType === 'reload' ? true : !cameFromApp;

if (shouldLock) setupLock();
else lock.remove();

/* ------------------------------------------------------------------ */
/*  app open / close animations                                       */
/*                                                                    */
/*  Opening: the tapped icon grows out to fill the screen, then the    */
/*  app loads. Closing: coming back from an app, that app shrinks back  */
/*  down into its icon — the same motion in reverse, which closes the   */
/*  loop and makes the home button feel like a real one. Reduced       */
/*  motion, or a modifier-click, skips both.                          */
/* ------------------------------------------------------------------ */

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TILE_FOR = { app: '#tileMessage', instagrat: '#tileGrat', calendar: '#tileCal' };

/** Builds an overlay sitting exactly over an app's icon, styled like it. */
function makeOverlay(glyph, rect) {
  const overlay = document.createElement('div');
  overlay.className = 'app-open ' + glyph.className.replace('app-glyph', '').trim();
  overlay.style.left   = rect.left + 'px';
  overlay.style.top    = rect.top + 'px';
  overlay.style.width  = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  const cs = getComputedStyle(glyph);
  if (cs.backgroundImage && cs.backgroundImage !== 'none') {
    overlay.style.backgroundImage = cs.backgroundImage;
    overlay.style.backgroundSize = 'cover';
    overlay.style.backgroundPosition = 'center';
  }
  overlay.style.backgroundColor = cs.backgroundColor;
  // Carry the icon's contents (glyph char, or the calendar date markup).
  overlay.innerHTML = glyph.innerHTML || '';
  if (!overlay.innerHTML) overlay.textContent = glyph.textContent;
  return overlay;
}

function coverTransform(rect) {
  const scale = Math.ceil(Math.max(
    window.innerWidth  / rect.width,
    window.innerHeight / rect.height) * 1.4);
  const cx = window.innerWidth / 2  - (rect.left + rect.width / 2);
  const cy = window.innerHeight / 2 - (rect.top + rect.height / 2);
  return `translate(${cx}px, ${cy}px) scale(${scale})`;
}

function openApp(tile, href) {
  const glyph = tile.querySelector('.app-glyph');
  const rect  = glyph.getBoundingClientRect();
  const overlay = makeOverlay(glyph, rect);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.transform = coverTransform(rect);
    overlay.style.opacity = '1';
  });

  let went = false;
  const go = () => { if (!went) { went = true; location.href = href; } };
  overlay.addEventListener('transitionend', go, { once: true });
  setTimeout(go, 520);
}

/** The reverse: a full-screen overlay collapses into an app's icon. */
function shrinkInto(appName) {
  const sel = TILE_FOR[appName];
  const tile = sel && document.querySelector(sel);
  const glyph = tile && tile.querySelector('.app-glyph');
  if (!glyph) return;

  const rect = glyph.getBoundingClientRect();
  const overlay = makeOverlay(glyph, rect);
  overlay.style.transition = 'none';
  overlay.style.transform = coverTransform(rect);   // start covering the screen
  overlay.style.opacity = '1';
  document.body.appendChild(overlay);

  // Two frames: let the "covering" state paint, then enable the
  // transition and fall back to the icon's own spot, fading out.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.style.transition = '';
    overlay.style.transform = 'translate(0,0) scale(1)';
    overlay.style.opacity = '0';
  }));

  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => overlay.remove(), 700);
}

// Play the shrink if we just came back from an app.
if (cameFromApp && lastApp && !reduceMotion) shrinkInto(lastApp);

document.querySelectorAll('.app-icon').forEach(tile => {
  tile.addEventListener('click', (e) => {
    const href = tile.getAttribute('href');
    if (reduceMotion || e.metaKey || e.ctrlKey) return;  // let normal nav happen
    e.preventDefault();
    openApp(tile, href);
  });
});
