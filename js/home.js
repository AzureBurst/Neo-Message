// =====================================================================
//  NEO MESSAGE — home screen
//
//  The phone's home screen. Two apps for now; the grid grows if you add
//  more. Badges hint at what is waiting inside each one.
// =====================================================================

import {
  supa, requireProfile, signOut, ungate, mountCarrier, setClockSource, $
} from './supa.js';
import { loadClock, storyNow } from './clock.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));

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
