// =====================================================================
//  "Change date & time" — the GM sets the in-story moment shown on a
//  chat message, an email or a Flight announcement (sql/gm-tools.sql).
//  One small dialog, the same on every page.
// =====================================================================

import { supa, esc, toast } from './supa.js';
import { storyNow } from './clock.js';

const pad = n => String(n).padStart(2, '0');
const toInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * kind: 'message' | 'mail' | 'announcement'
 * current: the row's story_at (or created_at)
 * onDone(newIso): called after it saves
 */
export function openSetTime({ kind, id, current, title = 'Date & time', onDone }) {
  const cur = new Date(current || storyNow());
  const wrap = document.createElement('div');
  wrap.className = 'settime-root';
  wrap.innerHTML = `
    <div class="scrim">
      <div class="modal settime" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x title="Close">✕</button></div>
        <div class="modal-body">
          <p class="muted small">The in-story time shown on this. Only you can change it.</p>
          <div class="field">
            <label for="stAt">Date and time</label>
            <input type="datetime-local" id="stAt" class="mono" value="${toInput(cur)}">
          </div>
          <div class="settime-quick">
            <button type="button" class="btn btn-ghost btn-sm" data-st="now">Story clock now</button>
            <button type="button" class="btn btn-ghost btn-sm" data-st="-5m">−5 min</button>
            <button type="button" class="btn btn-ghost btn-sm" data-st="-1h">−1 hour</button>
            <button type="button" class="btn btn-ghost btn-sm" data-st="-1d">−1 day</button>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-x>Cancel</button>
          <button class="btn btn-primary" data-save>Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
  wrap.querySelector('.scrim').addEventListener('click', e => { if (e.target.classList.contains('scrim')) close(); });

  const input = wrap.querySelector('#stAt');
  wrap.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
    const base = b.dataset.st === 'now' ? storyNow() : new Date(input.value || cur);
    const ms = { now: 0, '-5m': -3e5, '-1h': -36e5, '-1d': -864e5 }[b.dataset.st];
    input.value = toInput(new Date(base.getTime() + ms));
  }));

  wrap.querySelector('[data-save]').addEventListener('click', async (e) => {
    const d = new Date(input.value);
    if (!input.value || isNaN(d) || d.getFullYear() < 1000) return toast('Pick a full date and time.', 'error');
    e.currentTarget.disabled = true;
    const { error } = await supa.rpc('gm_set_story_at', { p_kind: kind, p_id: id, p_at: d.toISOString() });
    if (error) {
      e.currentTarget.disabled = false;
      return toast(/gm_set_story_at/.test(error.message) ? 'Run sql/gm-tools.sql in Supabase first.' : error.message, 'error');
    }
    close();
    toast('Time changed.', 'ok');
    onDone?.(d.toISOString());
  });
  input.focus();
}
