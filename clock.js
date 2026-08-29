// =====================================================================
//  NEO MESSAGE — story clock
//
//  The GM can pin the app to a date and time of their choosing. Every
//  player sees it, and it stops moving, so the carrier bar reads as
//  whatever night the scene is set on rather than whatever night it
//  actually is.
//
//  Leave it unfrozen and everything falls back to real time.
// =====================================================================

import { supa, esc, toast, $ } from './supa.js';

let setting = { frozen: false, at: null };
const watchers = new Set();

/** The moment the app should believe it is. */
export function storyNow() {
  return setting.frozen && setting.at ? new Date(setting.at) : new Date();
}

export const isFrozen = () => !!(setting.frozen && setting.at);
export const frozenAt = () => (setting.at ? new Date(setting.at) : null);

export function onClockChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function announce() {
  watchers.forEach(fn => { try { fn(); } catch { /* keep going */ } });
}

/** Reads the shared setting, then listens for the GM changing it. */
export async function loadClock() {
  const { data } = await supa
    .from('app_settings').select('value').eq('key', 'story_clock').maybeSingle();

  if (data?.value) setting = data.value;

  supa.channel('story-clock')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings',
          filter: 'key=eq.story_clock' },
        (payload) => {
          setting = payload.new?.value ?? setting;
          announce();
        })
    .subscribe();

  return setting;
}

/* ------------------------------------------------------------------ */
/*  formatting                                                         */
/* ------------------------------------------------------------------ */

export function storyTime() {
  return storyNow().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function storyDate() {
  return storyNow().toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

/* ------------------------------------------------------------------ */
/*  the admin control                                                  */
/* ------------------------------------------------------------------ */

/** Turns a Date into the value an <input type="datetime-local"> wants. */
function toLocalInput(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openClockModal(modal) {
  const current = frozenAt() ?? new Date();

  const { root, close } = modal({
    title: 'Story clock',
    body: `
      <p class="muted small" style="margin-top:0">
        Pin the app to a moment in your story. Every player's status bar
        shows it, and it stops advancing until you change it.
      </p>

      <div class="field">
        <label for="clockAt">Date and time</label>
        <input type="datetime-local" id="clockAt" class="mono"
               value="${toLocalInput(current)}">
      </div>

      <label class="check">
        <input type="checkbox" id="clockFreeze" ${isFrozen() ? 'checked' : ''}>
        <span>Freeze the app to this moment</span>
      </label>

      <p class="muted small">
        Unticked, the app follows real time and the field above is ignored.
      </p>`,
    footer: `
      <button class="btn btn-ghost" id="clockNow">Use right now</button>
      <button class="btn btn-primary" id="clockSave">Apply</button>`
  });

  $('#clockNow', root).addEventListener('click', () => {
    $('#clockAt', root).value = toLocalInput(new Date());
  });

  $('#clockSave', root).addEventListener('click', async (e) => {
    const frozen = $('#clockFreeze', root).checked;
    const raw    = $('#clockAt', root).value;

    if (frozen && !raw) return toast('Pick a date and time first.', 'error');

    e.target.disabled = true;
    e.target.textContent = 'Applying…';

    const { error } = await supa.rpc('set_story_clock', {
      at: frozen ? new Date(raw).toISOString() : null,
      frozen
    });

    if (error) {
      toast(error.message, 'error');
      e.target.disabled = false;
      e.target.textContent = 'Apply';
      return;
    }

    setting = { frozen, at: frozen ? new Date(raw).toISOString() : null };
    announce();
    toast(frozen ? `Clock pinned to ${storyDate()}, ${storyTime()}.`
                 : 'Clock following real time again.', 'ok');
    close();
  });

  return close;
}
