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
