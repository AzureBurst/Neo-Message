// =====================================================================
//  NEO MESSAGE — NPC accounts
//
//  NPCs are real accounts (so players can text them like anyone else)
//  that the GM runs from the NPC Studio (npcs.html). Since sql/npc.sql
//  they are listed in the database, so they follow the GM to any
//  device, and the GM can reply AS an NPC without signing in as them.
//
//  "Sign in as" still exists for the rare times you want to use another
//  app (Instagrat, Neomail…) as the NPC. Your own session is parked
//  first and handed back when you press "Back to me".
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { supa, usernameToEmail, formatNumber, esc } from './supa.js';

const LEGACY = 'neo.npc.roster';   // old browser-only roster: [{ username, phone, password }]
const HOME   = 'neo.npc.home';     // the GM's own session, parked
const ACTING = 'neo.npc.acting';   // username currently being puppeted

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const legacyRoster = () => read(LEGACY, []);
export const forgetLegacy = (username) => write(LEGACY, legacyRoster().filter(n => n.username !== username));
export const actingAs = () => { try { return localStorage.getItem(ACTING) || null; } catch { return null; } };
export const hasHome  = () => !!read(HOME, null);

export function makePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'npc-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function rollNumber() {
  const mid  = String(Math.floor(Math.random() * 900) + 100);
  const line = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return formatNumber(`555${mid}${line}`);
}

/** The ids of every NPC (admins only; empty for players or before npc.sql). */
export async function npcIds({ includeStudents = false } = {}) {
  const { data, error } = await supa.from('npcs').select('id, is_student');
  if (error || !data) return new Set();
  return new Set(data.filter(n => includeStudents || !n.is_student).map(n => n.id));
}

/* ------------------------------------------------------------------ */
/*  creating                                                          */
/* ------------------------------------------------------------------ */

/* A throwaway client that never saves its session, so creating an NPC
   account doesn't sign the GM out of their own. */
function tempClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'neo-npc-temp' }
  });
}

/**
 * Makes a new NPC account and registers it.
 * opts: { role, notes, color, student }
 */
export async function createNpc(username, phone, opts = {}) {
  const { data: clash } = await supa.from('profiles').select('username, phone_number')
    .or(`username.ilike.${username},phone_number.eq.${phone}`);
  const hit = (clash || []).find(p => p.username?.toLowerCase() === username.toLowerCase() || p.phone_number === phone);
  if (hit) throw new Error(hit.phone_number === phone ? 'That number is already taken.' : 'That name is already taken.');

  const password = makePassword();
  const temp = tempClient();
  const { data, error } = await temp.auth.signUp({
    email: usernameToEmail(username), password,
    options: { data: { username, phone_number: phone } }
  });
  try { await temp.auth.signOut({ scope: 'local' }); } catch {}
  if (error) throw new Error(/registered|exists/i.test(error.message) ? 'That name is already taken.' : error.message);
  const id = data?.user?.id;
  if (!id || (data.user.identities && !data.user.identities.length)) throw new Error('That name is already taken.');

  // The profile row is created by a trigger; give it a moment if needed.
  for (let i = 0; i < 6; i++) {
    const { data: p } = await supa.from('profiles').select('id').eq('id', id).maybeSingle();
    if (p) break;
    await new Promise(r => setTimeout(r, 300));
  }

  const { error: regErr } = await supa.rpc('npc_register', {
    target: id, p_secret: password, p_role: opts.role || null, p_notes: opts.notes || null,
    p_student: !!opts.student, p_color: opts.color || null
  });
  if (regErr) throw new Error(/npc_register/.test(regErr.message)
    ? 'Run sql/npc.sql in Supabase first.' : regErr.message);
  return id;
}

/* ------------------------------------------------------------------ */
/*  signing in as an NPC (and back)                                   */
/* ------------------------------------------------------------------ */

async function parkHome() {
  if (read(HOME, null)) return;            // already parked, don't overwrite
  const { data: { session } } = await supa.auth.getSession();
  if (session) write(HOME, { access_token: session.access_token, refresh_token: session.refresh_token });
}

/** Signs this browser in as the NPC and opens Messages. */
export async function signInAs(profile, npcRow, goTo = 'app.html') {
  let secret = npcRow?.secret;
  if (!secret) {
    const { data, error } = await supa.rpc('npc_reset_password', { target: profile.id });
    if (error) throw error;
    secret = data;
  }
  await parkHome();
  let { error } = await supa.auth.signInWithPassword({ email: usernameToEmail(profile.username), password: secret });
  if (error && /invalid/i.test(error.message)) {
    // Stored password is stale (e.g. changed elsewhere) — reset and retry once.
    await returnHome({ reload: false });
    const { data, error: e2 } = await supa.rpc('npc_reset_password', { target: profile.id });
    if (e2) throw e2;
    await parkHome();
    ({ error } = await supa.auth.signInWithPassword({ email: usernameToEmail(profile.username), password: data }));
  }
  if (error) { await returnHome({ reload: false }); throw error; }
  try { localStorage.setItem(ACTING, profile.username); } catch {}
  location.href = goTo;
}

export async function returnHome({ reload = true, goTo = null } = {}) {
  const home = read(HOME, null);
  try { localStorage.removeItem(ACTING); } catch {}
  if (!home) { if (goTo) location.href = goTo; else if (reload) location.reload(); return; }

  const { error } = await supa.auth.setSession(home);
  try { localStorage.removeItem(HOME); } catch {}
  if (error) {
    // Session expired while we were away — nothing to do but sign in again.
    await supa.auth.signOut();
    location.replace('index.html');
    return;
  }
  if (goTo) location.href = goTo;
  else if (reload) location.reload();
}

/* ------------------------------------------------------------------ */
/*  the banner you see while signed in as an NPC — on every page       */
/* ------------------------------------------------------------------ */

export function mountPuppetBar() {
  const who = actingAs();
  if (!who || document.querySelector('.puppet-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'puppet-bar';
  bar.innerHTML = `
    <span class="puppet-dot"></span>
    <span>Signed in as <strong>${esc(who)}</strong> (NPC)</span>
    <button class="puppet-back" type="button">Back to me</button>`;
  document.body.prepend(bar);
  document.body.classList.add('puppeting');
  bar.querySelector('.puppet-back').addEventListener('click', () => returnHome({ goTo: 'npcs.html' }));
}
