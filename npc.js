// =====================================================================
//  NEO MESSAGE — NPC puppets
//
//  Lets the GM spin up throwaway accounts and jump between them without
//  signing out and back in by hand.
//
//  How it works: switching really does sign you in as that account, so
//  messages come from them for real and the database rules apply to
//  them normally. Your own session is stashed first and handed back
//  when you return, so you never retype your own password.
//
//  NPC passwords are random and live in this browser's localStorage,
//  on your machine only. They never touch the database beyond the
//  hash every account has. Clear your browser data and the roster
//  goes with it — the accounts survive, you just reset them from the
//  SQL Editor. See the README.
// =====================================================================

import { supa, usernameToEmail, formatNumber, esc, toast, $, $$ } from './supa.js';

const ROSTER = 'neo.npc.roster';   // [{ username, phone, password }]
const HOME   = 'neo.npc.home';     // the GM's own session, parked
const ACTING = 'neo.npc.acting';   // username currently being puppeted

const read  = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const roster    = () => read(ROSTER, []);
export const actingAs  = () => localStorage.getItem(ACTING) || null;
export const hasHome   = () => !!read(HOME, null);

/** A readable password, since you may have to retype it from the roster. */
function makePassword() {
  const words = ['amber', 'relay', 'static', 'signal', 'tower', 'ghost',
                 'dial', 'echo', 'drift', 'north', 'copper', 'quiet'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${w()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function rollNumber() {
  const mid  = String(Math.floor(Math.random() * 900) + 100);
  const line = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return formatNumber(`555${mid}${line}`);
}

/** Parks the current session so we can come back to it later. */
async function parkHome() {
  if (read(HOME, null)) return;            // already parked, don't overwrite
  const { data: { session } } = await supa.auth.getSession();
  if (session) {
    write(HOME, {
      access_token:  session.access_token,
      refresh_token: session.refresh_token
    });
  }
}

/* ------------------------------------------------------------------ */
/*  actions                                                            */
/* ------------------------------------------------------------------ */

export async function createNpc(username, phone) {
  const password = makePassword();
  await parkHome();

  const { error } = await supa.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username, phone_number: phone } }
  });
  if (error) {
    await returnHome({ reload: false });
    throw error;
  }

  write(ROSTER, [...roster(), { username, phone, password }]);

  // signUp left us signed in as the NPC. Step back into our own shoes.
  await returnHome({ reload: false });
  return { username, phone, password };
}

export async function switchTo(npc) {
  await parkHome();
  const { error } = await supa.auth.signInWithPassword({
    email: usernameToEmail(npc.username),
    password: npc.password
  });
  if (error) throw error;
  localStorage.setItem(ACTING, npc.username);
  location.reload();
}

export async function returnHome({ reload = true } = {}) {
  const home = read(HOME, null);
  localStorage.removeItem(ACTING);
  if (!home) { if (reload) location.reload(); return; }

  const { error } = await supa.auth.setSession(home);
  localStorage.removeItem(HOME);
  if (error) {
    // Session expired while we were away — nothing to do but sign in again.
    await supa.auth.signOut();
    location.replace('index.html');
    return;
  }
  if (reload) location.reload();
}

/** Forgets an NPC locally. The account itself stays in the database. */
export function forget(username) {
  write(ROSTER, roster().filter(n => n.username !== username));
}

/* ------------------------------------------------------------------ */
/*  the banner you see while puppeting                                 */
/* ------------------------------------------------------------------ */

export function mountPuppetBar() {
  const who = actingAs();
  if (!who) return;

  const bar = document.createElement('div');
  bar.className = 'puppet-bar';
  bar.innerHTML = `
    <span class="puppet-dot"></span>
    <span>Acting as <strong>${esc(who)}</strong></span>
    <button class="puppet-back" type="button">Back to me</button>`;
  document.body.prepend(bar);
  document.body.classList.add('puppeting');
  bar.querySelector('.puppet-back')
     .addEventListener('click', () => returnHome());
}

/* ------------------------------------------------------------------ */
/*  the roster modal                                                   */
/* ------------------------------------------------------------------ */

export function openNpcModal(modal) {
  const draw = () => {
    const list = roster();
    const rows = list.length ? list.map(n => `
      <div class="npc-row" data-user="${esc(n.username)}">
        <div class="npc-id">
          <strong>${esc(n.username)}</strong>
          <span class="mono">${esc(n.phone)}</span>
        </div>
        <code class="npc-pass mono">${esc(n.password)}</code>
        <button class="btn btn-sm" data-act="use">Become</button>
        <button class="icon-btn" data-act="forget" title="Remove from this list">✕</button>
      </div>`).join('')
      : `<p class="muted">No puppets yet. Make one below and it becomes a
         real account you can text like anyone else at the table.</p>`;

    return `
      <div class="npc-list">${rows}</div>
      <div class="field">
        <label for="npcName">New puppet</label>
        <input id="npcName" placeholder="e.g. Dispatch, Unknown, Mr Hale"
               maxlength="24" autocomplete="off">
      </div>
      <div class="field">
        <label for="npcNum">Their number</label>
        <div class="inline-row">
          <input id="npcNum" class="mono" value="${rollNumber()}">
          <button class="btn btn-ghost" id="npcRoll" type="button">Roll</button>
        </div>
      </div>
      <p class="muted small">
        Passwords are generated and kept in this browser only. Write down
        any you care about — clearing site data forgets them.
      </p>`;
  };

  const { root, close } = modal({
    title: 'NPC puppets',
    body: draw(),
    footer: `<button class="btn btn-primary" id="npcCreate">Create puppet</button>`
  });

  const rebind = () => {
    $('#npcRoll', root).addEventListener('click', () => {
      $('#npcNum', root).value = rollNumber();
    });

    $$('.npc-row', root).forEach(row => {
      const name = row.dataset.user;
      const npc  = roster().find(n => n.username === name);

      row.querySelector('[data-act="use"]').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Switching…';
        try { await switchTo(npc); }
        catch (err) {
          toast(`Could not switch: ${err.message}`, 'error');
          e.target.disabled = false;
          e.target.textContent = 'Become';
        }
      });

      row.querySelector('[data-act="forget"]').addEventListener('click', () => {
        forget(name);
        $('.modal-body', root).innerHTML = draw();
        rebind();
      });
    });
  };
  rebind();

  $('#npcCreate', root).addEventListener('click', async (e) => {
    const username = $('#npcName', root).value.trim();
    const phone    = $('#npcNum', root).value.trim();

    if (!/^[A-Za-z0-9_.-]{2,24}$/.test(username)) {
      return toast('Names can use letters, numbers, dots, dashes and underscores.', 'error');
    }
    if (phone.replace(/\D/g, '').length < 7) {
      return toast('Give them at least 7 digits.', 'error');
    }

    e.target.disabled = true;
    e.target.textContent = 'Creating…';
    try {
      const npc = await createNpc(username, phone);
      toast(`${npc.username} is live on ${npc.phone}.`, 'ok');
      $('.modal-body', root).innerHTML = draw();
      rebind();
    } catch (err) {
      toast(/registered|taken/i.test(err.message)
        ? 'That name is already in use.'
        : err.message, 'error');
    }
    e.target.disabled = false;
    e.target.textContent = 'Create puppet';
  });

  return close;
}
