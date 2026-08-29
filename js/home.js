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
  if (!n) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = n > 99 ? '99+' : String(n);
}

// Instagrat: an accepted-follower count of pending things worth a look.
// For a player that is incoming follow requests; for an admin it also
// includes posts waiting in the moderation queue.
async function paintGratBadge() {
  let n = 0;

  const { count: reqs } = await supa
    .from('ig_follows')
    .select('*', { count: 'exact', head: true })
    .eq('followee_id', me.id)
    .eq('accepted', false);
  n += reqs ?? 0;

  if (me.is_admin) {
    const { count: pending } = await supa
      .from('ig_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    n += pending ?? 0;
  }

  badge($('#gratBadge'), n);
}

// The message badge would need per-user read tracking, which the app
// does not have yet, so it stays hidden for now rather than lie.
paintGratBadge().catch(() => {});

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
  let startY = null, startT = 0, moved = 0, dragging = false;

  const done = () => {
    clearInterval(tick);
    lock.classList.add('unlocking');
    if (reduce) lock.remove();
    else lock.addEventListener('transitionend', () => lock.remove(), { once: true });
  };

  lock.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; startT = performance.now(); moved = 0;
    lock.style.transition = 'none';
    lock.setPointerCapture?.(e.pointerId);
  });

  lock.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    moved = dy;
    lock.style.transform = `translateY(${dy < 0 ? dy : dy * 0.2}px)`;
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    lock.style.transition = '';
    const dt = performance.now() - startT;
    const velocity = moved / Math.max(dt, 1);        // px per ms, negative = up
    // Easy to unlock: a short drag up, OR a quick flick in any upward amount.
    if (moved < -48 || (moved < -10 && velocity < -0.45)) done();
    else lock.style.transform = '';
  };
  lock.addEventListener('pointerup', release);
  lock.addEventListener('pointercancel', release);

  // Tap without a drag, or keyboard, also unlocks.
  lock.addEventListener('click', () => { if (Math.abs(moved) < 6) done(); });
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
sessionStorage.removeItem('neo.deep');           // consume it

const shouldLock = navType === 'reload' ? true : !cameFromApp;

if (shouldLock) setupLock();
else lock.remove();

/* ------------------------------------------------------------------ */
/*  opening an app                                                    */
/*                                                                    */
/*  Instead of a hard jump, the tapped icon grows out to fill the      */
/*  screen the way a phone opens an app. The overlay starts as a copy  */
/*  of the icon sitting exactly over it, then scales up; navigation    */
/*  happens as it finishes. Anyone who prefers reduced motion, or a    */
/*  browser that cannot animate, just gets the plain jump.            */
/* ------------------------------------------------------------------ */

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function openApp(tile, href) {
  const glyph = tile.querySelector('.app-glyph');
  const rect  = glyph.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.className = 'app-open';
  // Start life exactly where the icon is.
  overlay.style.left   = rect.left + 'px';
  overlay.style.top    = rect.top + 'px';
  overlay.style.width  = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  // Carry the icon's look into the zoom so it feels like the same object.
  const art = getComputedStyle(glyph).backgroundImage;
  if (art && art !== 'none') {
    overlay.style.backgroundImage = art;
    overlay.style.backgroundSize = 'cover';
    overlay.style.backgroundPosition = 'center';
  } else {
    overlay.textContent = glyph.textContent;
  }
  document.body.appendChild(overlay);

  // Compute the scale needed to cover the viewport from the icon's size.
  const scale = Math.ceil(Math.max(
    window.innerWidth  / rect.width,
    window.innerHeight / rect.height) * 1.4);
  const cx = window.innerWidth / 2  - (rect.left + rect.width / 2);
  const cy = window.innerHeight / 2 - (rect.top + rect.height / 2);

  requestAnimationFrame(() => {
    overlay.style.transform = `translate(${cx}px, ${cy}px) scale(${scale})`;
    overlay.style.opacity = '1';
  });

  // Navigate as the growth finishes; the fallback timer covers browsers
  // that never fire transitionend.
  let went = false;
  const go = () => { if (!went) { went = true; location.href = href; } };
  overlay.addEventListener('transitionend', go, { once: true });
  setTimeout(go, 520);
}

document.querySelectorAll('.app-icon').forEach(tile => {
  tile.addEventListener('click', (e) => {
    const href = tile.getAttribute('href');
    if (reduceMotion || e.metaKey || e.ctrlKey) return;  // let normal nav happen
    e.preventDefault();
    openApp(tile, href);
  });
});
