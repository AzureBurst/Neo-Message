// =====================================================================
//  NEO MESSAGE — maintenance mode
//
//  The GM flips a switch and every player who opens the site (or is on
//  it right now) gets the "Under maintenance" sign over the whole
//  screen until it is switched off. The GM still gets in — they see
//  the sign once per visit, can close it, and keep a small reminder
//  pill in the corner.
//
//  Stored in app_settings under the key "maintenance" (the same table
//  as the story clock), so it needs no extra SQL.
// =====================================================================

import { supa, esc, toast, signOut } from './supa.js';

const KEY = 'maintenance';
const SEEN = 'neo.maint.seen';
let state = { on: false, note: '' };
let me = null;
let started = false;

export async function watchMaintenance(profile) {
  if (started) return;
  started = true;
  me = profile;

  const { data } = await supa.from('app_settings').select('value').eq('key', KEY).maybeSingle();
  apply(data?.value, true);

  supa.channel('maintenance')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${KEY}` },
        (p) => apply(p.new?.value, false))
    .subscribe();
}

function apply(value, first) {
  const was = state.on;
  state = { on: !!value?.on, note: value?.note || '' };

  if (!state.on) {
    document.getElementById('maintLock')?.remove();
    document.getElementById('maintPill')?.remove();
    document.body.classList.remove('maint-locked');
    try { sessionStorage.removeItem(SEEN); } catch {}
    if (was && !first && !me?.is_admin) toast('The site is back up.', 'ok');
    return;
  }

  if (me?.is_admin) {
    showPill();
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; } catch {}
    if (!seen) showSign({ closable: true });
  } else {
    showSign({ closable: false });
  }
}

/* The sign itself. Players can't close it — only sign out. */
function showSign({ closable }) {
  document.getElementById('maintLock')?.remove();
  const el = document.createElement('div');
  el.id = 'maintLock';
  el.className = 'maint-lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Under maintenance');
  el.innerHTML = `
    <div class="maint-card">
      <img src="assets/maintenance.png" alt="Caution: under maintenance">
      ${state.note ? `<p class="maint-note">${esc(state.note)}</p>` : ''}
      <div class="maint-actions">
        ${closable
          ? `<span class="maint-gm">You're the GM, so you can still get in.</span>
             <button class="btn btn-ghost" id="maintOff">Turn maintenance off</button>
             <button class="btn btn-primary" id="maintClose">Continue</button>`
          : `<button class="btn btn-ghost" id="maintOut">Sign out</button>`}
      </div>
    </div>`;
  document.body.appendChild(el);
  if (!closable) document.body.classList.add('maint-locked');

  el.querySelector('#maintOut')?.addEventListener('click', signOut);
  el.querySelector('#maintClose')?.addEventListener('click', () => {
    try { sessionStorage.setItem(SEEN, '1'); } catch {}
    el.remove();
  });
  el.querySelector('#maintOff')?.addEventListener('click', () => setMaintenance(false, state.note));
}

function showPill() {
  if (document.getElementById('maintPill')) return;
  const b = document.createElement('button');
  b.id = 'maintPill';
  b.className = 'maint-pill';
  b.innerHTML = '🚧 <span>Maintenance on</span>';
  b.title = 'Players are locked out — click to manage';
  b.addEventListener('click', openMaintenanceModal);
  document.body.appendChild(b);
}

export async function setMaintenance(on, note = '') {
  const { error } = await supa.from('app_settings').upsert(
    { key: KEY, value: { on, note: note || null }, updated_at: new Date().toISOString() });
  if (error) { toast(error.message, 'error'); return false; }
  toast(on ? 'Maintenance mode on — players are locked out.' : 'Maintenance mode off.', 'ok');
  apply({ on, note }, false);
  if (on) { try { sessionStorage.setItem(SEEN, '1'); } catch {} document.getElementById('maintLock')?.remove(); }
  return true;
}

/* GM control: on/off plus an optional message under the sign. */
export function openMaintenanceModal() {
  document.getElementById('maintModal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'maintModal';
  wrap.innerHTML = `
    <div class="scrim scrim-top"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Maintenance mode</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <img class="maint-thumb" src="assets/maintenance.png" alt="">
        <p class="muted small" style="margin-top:0">While it's on, every player sees this sign over the whole
          site and can't use anything until you turn it off. You can still get in.</p>
        <div class="field"><label for="maintNote">Message under the sign (optional)</label>
          <input type="text" id="maintNote" maxlength="200" value="${esc(state.note)}" placeholder="Back after tonight's session!"></div>
        <label class="check"><input type="checkbox" id="maintOn" ${state.on ? 'checked' : ''}>
          <span>Site is under maintenance</span></label>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="maintPreview">Preview</button>
        <button class="btn btn-primary" id="maintSave">Apply</button>
      </div>
    </div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('[data-x]').addEventListener('click', close);
  wrap.querySelector('.scrim').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  wrap.querySelector('#maintPreview').addEventListener('click', () => {
    const keep = state.note; state.note = wrap.querySelector('#maintNote').value.trim();
    showSign({ closable: true });
    const s = document.getElementById('maintLock');
    s.querySelector('#maintOff')?.remove();
    s.querySelector('.maint-gm').textContent = 'Preview — this is what players will see.';
    s.querySelector('#maintClose').textContent = 'Close preview';
    s.querySelector('#maintClose').onclick = () => s.remove();
    state.note = keep;
  });
  wrap.querySelector('#maintSave').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const ok = await setMaintenance(wrap.querySelector('#maintOn').checked, wrap.querySelector('#maintNote').value.trim());
    if (ok) close(); else e.currentTarget.disabled = false;
  });
}
