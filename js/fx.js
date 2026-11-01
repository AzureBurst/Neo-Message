// =====================================================================
//  OVERDRIVE — the bits of motion CSS can't do alone
//  • a light burst where you press a button
//  • home-screen icons tilt toward the pointer
//  Loaded only when the Overdrive theme is on (see css/edge.css).
// =====================================================================

const on = () => document.documentElement.dataset.theme === 'overdrive';
const calm = { get matches() { return document.documentElement.classList.contains('calm'); } };
let wired = false;

export function startFx() {
  if (wired) return;
  wired = true;

  document.addEventListener('pointerdown', (e) => {
    if (!on() || calm.matches) return;
    const btn = e.target.closest('.btn, .ns-btn, .jr-new, .ns-send, .send-btn, .home-maint-btn, .ig-post-btn, .qr-newtab');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'od-burst';
    dot.style.left = `${e.clientX - r.left}px`;
    dot.style.top = `${e.clientY - r.top}px`;
    btn.appendChild(dot);
    setTimeout(() => dot.remove(), 520);
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!on() || calm.matches || e.pointerType !== 'mouse') return;
    const icon = e.target.closest?.('.app-icon');
    const glyph = icon?.querySelector('.app-glyph');
    if (!glyph) return;
    const r = glyph.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    glyph.style.setProperty('--ry', `${(x * 22).toFixed(1)}deg`);
    glyph.style.setProperty('--rx', `${(-y * 22).toFixed(1)}deg`);
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const glyph = e.target.closest?.('.app-icon')?.querySelector('.app-glyph');
    if (glyph && !e.relatedTarget?.closest?.('.app-icon')) { glyph.style.removeProperty('--rx'); glyph.style.removeProperty('--ry'); }
  }, { passive: true });
}

/** Switch the theme on this device. */
export function setTheme(name) {
  try {
    if (name === 'overdrive') localStorage.setItem('neo.theme', 'overdrive');
    else localStorage.removeItem('neo.theme');
  } catch {}
  if (name === 'overdrive') {
    document.documentElement.dataset.theme = 'overdrive';
    startFx();
  } else {
    delete document.documentElement.dataset.theme;
  }
}

if (on()) startFx();
