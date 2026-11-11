// =====================================================================
//  Savage Worlds dice
//
//  Every roll is made by the server (sw_roll / ft_roll / sw_reroll in
//  sql/mytime.sql) so nobody can fake one. This module draws the
//  roller, the little dice animation, the result cards that show up in
//  chats and pages, and the GM's "ask for a roll" form.
//
//  Rules: trait die + Wild Die (d6), take the higher; a die that rolls
//  its top face aces (rolls again and adds). 4 is a success, every 4
//  over is a raise. Both dice showing 1 is a Critical Failure.
//  Unskilled is d4−2. Wounds (max −3) and Fatigue (max −2) apply.
// =====================================================================

import { supa, esc, toast, $, $$ } from './supa.js';
import { playSound } from './sfx.js';

export const ATTRS = ['agility', 'smarts', 'spirit', 'strength', 'vigor'];
export const DIES = [4, 6, 8, 10, 12];

/* Every core SWADE skill and its linked attribute. */
export const SKILLS = {
  'Academics': 'smarts', 'Athletics': 'agility', 'Battle': 'smarts', 'Boating': 'agility',
  'Common Knowledge': 'smarts', 'Driving': 'agility', 'Electronics': 'smarts', 'Faith': 'spirit',
  'Fighting': 'agility', 'Focus': 'spirit', 'Gambling': 'smarts', 'Hacking': 'smarts',
  'Healing': 'smarts', 'Intimidation': 'spirit', 'Language': 'smarts', 'Notice': 'smarts',
  'Occult': 'smarts', 'Performance': 'spirit', 'Persuasion': 'spirit', 'Piloting': 'agility',
  'Psionics': 'smarts', 'Repair': 'smarts', 'Research': 'smarts', 'Riding': 'agility',
  'Science': 'smarts', 'Shooting': 'agility', 'Spellcasting': 'smarts', 'Stealth': 'agility',
  'Survival': 'smarts', 'Taunt': 'smarts', 'Thievery': 'agility', 'Weird Science': 'smarts'
};
export const CORE_SKILLS = ['Athletics', 'Common Knowledge', 'Notice', 'Persuasion', 'Stealth', 'Focus', 'Academics'];

export const OUTCOME = {
  crit_fail: { word: 'Critical Failure', cls: 'crit' },
  fail:      { word: 'Failure',          cls: 'fail' },
  success:   { word: 'Success',          cls: 'ok' },
  raise:     { word: 'Raise',            cls: 'raise' }
};

export const dieLabel = (die, mod = 0) => `d${die}${mod > 0 ? '+' + mod : mod < 0 ? '−' + Math.abs(mod) : ''}`;
export const signed = n => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0');
const cap = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

/* ------------------------------------------------------------------ */
/*  sheet → traits                                                    */
/* ------------------------------------------------------------------ */

export function blankSheet(userId) {
  return {
    user_id: userId,
    attributes: Object.fromEntries(ATTRS.map(a => [a, { die: 4, mod: 0 }])),
    skills: CORE_SKILLS.map(n => ({ name: n, attr: SKILLS[n], die: 4, mod: 0 })),
    attr_points: 0, skill_points: 0, derived: {}, power: {}, edges: [], hindrances: [],
    gear: [], suits: [], bennies: 3, wounds: 0, fatigue: 0, gm_notes: ''
  };
}

let sheetCache = null;
export async function mySheet(userId, { fresh = false } = {}) {
  if (sheetCache && !fresh && sheetCache.user_id === userId) return sheetCache;
  const { data } = await supa.from('sw_sheets').select('*').eq('user_id', userId).maybeSingle();
  sheetCache = data || { ...blankSheet(userId), missing: true };
  return sheetCache;
}

export function traitsOf(sheet) {
  const attrs = ATTRS.map(a => ({ key: a, label: cap(a), die: sheet.attributes?.[a]?.die || 4, mod: sheet.attributes?.[a]?.mod || 0, kind: 'attr' }));
  const skills = (sheet.skills || []).map(s => ({ key: s.name.toLowerCase(), label: s.name, die: s.die || 4, mod: s.mod || 0, kind: 'skill', attr: s.attr }));
  return { attrs, skills };
}

/** "Smarts or Common Knowledge" → ['Smarts', 'Common Knowledge'] */
export const traitChoices = t => String(t || '').split(/\s+or\s+|\/|,/i).map(x => x.trim()).filter(Boolean);

/* ------------------------------------------------------------------ */
/*  result card — chats, Queree, Flight, MyTime                       */
/* ------------------------------------------------------------------ */

const chain = (arr, sides) => (arr || []).map((v, i) =>
  `<b class="${v === sides ? 'ace' : ''}${i === 0 && v === 1 ? ' one' : ''}">${v}</b>`).join('<i>+</i>');

export function rollCard(r, { who = null, compact = false } = {}) {
  if (!r) return '';
  const o = OUTCOME[r.best_outcome || r.outcome] || OUTCOME.fail;
  const tSum = (r.trait_rolls || []).reduce((a, b) => a + b, 0);
  const wSum = (r.wild_rolls || []).reduce((a, b) => a + b, 0);
  const mods = (r.bonus || 0) + (r.modifier || 0) + (r.wound_mod || 0);
  const used = r.wild_rolls && wSum > tSum ? 'wild' : 'trait';
  const raises = (r.best_outcome || r.outcome) === 'raise' ? Math.max(1, Math.floor(((r.best_total ?? r.total) - 4) / 4)) : 0;
  const aced = (r.trait_rolls || []).length > 1 || (r.wild_rolls || []).length > 1;
  return `
    <div class="sw-card ${o.cls}${compact ? ' compact' : ''}">
      <div class="sw-card-top">
        <span class="sw-card-die">🎲</span>
        <span class="sw-card-what"><strong>${esc(r.label)}</strong>
          <small>${esc(who ? who + ' · ' : '')}${dieLabel(r.die, r.bonus)}${r.modifier ? ' ' + signed(r.modifier) : ''}${r.wound_mod ? ` · wounds ${signed(r.wound_mod)}` : ''}</small></span>
        <span class="sw-card-total">${r.best_total ?? r.total}</span>
      </div>
      <div class="sw-card-bottom">
        <span class="sw-badge">${o.word}${raises > 1 ? ' ×' + raises : ''}</span>
        ${aced ? '<span class="sw-ace-tag">Ace!</span>' : ''}
        ${r.benny_spent ? `<span class="sw-benny-tag">Benny reroll${(r.best_total ?? r.total) !== r.total ? ` · kept ${r.best_total}` : ''}</span>` : ''}
        <span class="sw-chain">
          <span class="${used === 'trait' ? 'used' : ''}">d${r.die} ${chain(r.trait_rolls, r.die)}</span>
          ${r.wild_rolls ? `<span class="${used === 'wild' ? 'used' : ''}">wild ${chain(r.wild_rolls, 6)}</span>` : ''}
          ${mods ? `<span>${signed(mods)}</span>` : ''}
        </span>
      </div>
    </div>`;
}

/* A GM's request, as the player sees it. */
export function requestCard(q, { mine = [], canRoll = true, names = null, gm = false } = {}) {
  const latest = mine.at(-1);
  const who = names && q.targets?.length ? q.targets.map(id => names.get(id) || '…').join(', ') : '';
  return `
    <div class="sw-req ${latest ? 'done' : ''} ${q.closed ? 'closed' : ''}" data-req="${esc(q.id)}">
      <div class="sw-req-head">
        <span class="sw-req-ico">🎲</span>
        <span class="sw-req-what"><small>${gm ? `Roll requested${who ? ' · ' + esc(who) : ''}` : 'The GM asks you to roll'}</small>
          <strong>${esc(q.trait)}${q.modifier ? ` <em>${signed(q.modifier)}</em>` : ''}</strong></span>
        ${!gm && !latest && canRoll && !q.closed ? `<button type="button" class="btn btn-primary btn-sm sw-req-go" data-rollreq="${esc(q.id)}">Roll</button>` : ''}
        ${q.closed ? '<span class="sw-req-closed">Closed</span>' : ''}
      </div>
      ${q.note ? `<p class="sw-req-note">${esc(q.note)}</p>` : ''}
      ${latest ? rollCard(latest, { compact: true }) : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  the roller                                                        */
/* ------------------------------------------------------------------ */

let host = null;
function overlay(html) {
  host?.remove();
  host = document.createElement('div');
  host.className = 'sw-host';
  host.innerHTML = `<div class="scrim scrim-top sw-scrim"><div class="modal sw-modal" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.appendChild(host);
  const close = () => { host?.remove(); host = null; };
  $('.scrim', host).addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
  $$('[data-x]', host).forEach(b => b.addEventListener('click', close));
  return { root: host, close };
}

/**
 * Opens the roller.
 *   kind      'free' | 'message' | 'queree' | 'flight' | 'mytime' | 'freetime'
 *   ctx       conversation / search id
 *   request   a sw_requests row (locks trait choices + modifier)
 *   options   trait keys to choose from (free time)
 *   penalty   fixed modifier shown (free time)
 *   rollFn    async (traitKey, mod) => roll row — defaults to sw_roll
 *   title     heading
 *   onDone    called with the final roll
 *   me        the profile (for GM die picker)
 */
export async function openRoller(opts = {}) {
  const { kind = 'free', ctx = null, request = null, me = null } = opts;
  const gm = !!me?.is_admin;
  const sheet = me ? await mySheet(me.id, { fresh: true }) : blankSheet(null);
  const { attrs, skills } = traitsOf(sheet);
  const all = [...attrs, ...skills];
  const choices = request ? traitChoices(request.trait) : (opts.options || null);
  const lockedMod = request ? request.modifier : (opts.penalty ?? null);
  let pick = null, mod = 0, gmDie = null;

  const find = name => all.find(t => t.key === String(name).toLowerCase());
  const chip = t => `<button type="button" class="sw-trait" data-trait="${esc(t.key)}"><span>${esc(t.label)}</span><b>${dieLabel(t.die, t.mod)}</b></button>`;
  const choiceChips = (choices || []).map(c => find(c) || { key: c.toLowerCase(), label: cap(c) + ' (unskilled)', die: 4, mod: -2 });

  const { root, close } = overlay(`
    <div class="modal-head"><h3>${esc(opts.title || (request ? 'Roll requested' : 'Roll a trait'))}</h3>
      <button class="icon-btn" data-x title="Close">✕</button></div>
    <div class="modal-body sw-body">
      <div class="sw-pick">
        ${request?.note ? `<p class="sw-req-note">${esc(request.note)}</p>` : ''}
        ${choices ? `
          <div class="sw-group"><h5>${choices.length > 1 ? 'Pick one' : 'Trait'}</h5><div class="sw-traits">${choiceChips.map(chip).join('')}</div></div>` : `
          <div class="sw-group"><h5>Attributes</h5><div class="sw-traits">${attrs.map(chip).join('')}</div></div>
          <div class="sw-group"><h5>Skills</h5><div class="sw-traits">${skills.map(chip).join('')}</div>
            <div class="sw-other"><input type="text" id="swOther" list="swSkillList" placeholder="Another skill (unskilled d4−2)…">
              <datalist id="swSkillList">${Object.keys(SKILLS).map(s => `<option value="${esc(s)}">`).join('')}</datalist></div></div>`}
        ${gm && !request && !opts.rollFn ? `
          <div class="sw-group"><h5>GM: roll a plain die instead</h5><div class="sw-traits">${DIES.map(d =>
            `<button type="button" class="sw-trait sw-gmdie" data-gmdie="${d}"><b>d${d}</b></button>`).join('')}</div></div>` : ''}
        <div class="sw-modrow">
          <span>Modifier</span>
          ${lockedMod !== null ? `<strong class="sw-modval">${signed(lockedMod)}</strong><small class="muted">${opts.penalty != null ? 'stage penalty' : 'set by the GM'}</small>` : `
          <button type="button" class="sw-step" data-step="-1">−</button><strong class="sw-modval" id="swMod">±0</strong><button type="button" class="sw-step" data-step="1">+</button>`}
          ${sheet.wounds || sheet.fatigue ? `<small class="sw-wounds">${opts.kind === 'freetime' ? '' : `Wounds/Fatigue ${signed(-Math.min(sheet.wounds, 3) - Math.min(sheet.fatigue, 2))} applied`}</small>` : ''}
        </div>
      </div>
      <div class="sw-tray" id="swTray" hidden></div>
    </div>
    <div class="modal-foot">
      <span class="sw-bennies" title="Bennies">${sheet.missing ? '' : `● ${sheet.bennies} Benn${sheet.bennies === 1 ? 'y' : 'ies'}`}</span>
      <span class="grow"></span>
      <button class="btn btn-ghost" data-x>Cancel</button>
      <button class="btn btn-primary" id="swGo" disabled>Roll</button>
    </div>`);

  const go = $('#swGo', root);
  const select = (key) => {
    pick = key; gmDie = null;
    $$('.sw-trait', root).forEach(b => b.classList.toggle('on', b.dataset.trait === key));
    go.disabled = !pick;
  };
  $$('[data-trait]', root).forEach(b => b.addEventListener('click', () => { $('#swOther', root) && ($('#swOther', root).value = ''); select(b.dataset.trait); }));
  $$('[data-gmdie]', root).forEach(b => b.addEventListener('click', () => {
    pick = null; gmDie = +b.dataset.gmdie;
    $$('.sw-trait', root).forEach(x => x.classList.toggle('on', x === b));
    go.disabled = false;
  }));
  $('#swOther', root)?.addEventListener('input', e => { const v = e.target.value.trim(); $$('.sw-trait', root).forEach(x => x.classList.remove('on')); pick = v ? v.toLowerCase() : null; gmDie = null; go.disabled = !pick; });
  $$('[data-step]', root).forEach(b => b.addEventListener('click', () => {
    mod = Math.max(-10, Math.min(10, mod + +b.dataset.step));
    $('#swMod', root).textContent = signed(mod);
  }));
  if (choiceChips.length === 1) select(choiceChips[0].key);

  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = 'Rolling…';
    const tray = $('#swTray', root);
    $('.sw-pick', root).hidden = true; tray.hidden = false;
    const t = pick ? (find(pick) || { label: cap(pick), die: 4 }) : { label: `d${gmDie}`, die: gmDie };
    tray.innerHTML = tumble(t.die);
    playSound('open');
    const started = performance.now();
    let r, error;
    try {
      if (opts.rollFn) r = await opts.rollFn(pick, mod);
      else ({ data: r, error } = await supa.rpc('sw_roll', {
        p_trait: pick || `d${gmDie}`, p_mod: mod, p_kind: request ? request.kind : kind, p_ctx: ctx,
        p_request: request?.id || null, p_die: gmDie }));
    } catch (e) { error = e; }
    if (error || !r) {
      toast(/sw_roll|does not exist/.test(error?.message || '') ? 'Run sql/mytime.sql in Supabase first.' : (error?.message || 'Roll failed.'), 'error');
      close(); return;
    }
    await new Promise(res => setTimeout(res, Math.max(0, 750 - (performance.now() - started))));
    showResult(r);
  });

  function showResult(r) {
    const tray = $('#swTray', root);
    tray.innerHTML = landed(r) + rollCard(r);
    playSound(r.outcome === 'raise' ? 'unlock' : r.outcome === 'success' ? 'sent' : 'received');
    const benny = r.outcome !== 'crit_fail';
    const left = r.bennies_left ?? sheet.bennies;
    $('.modal-foot', root).innerHTML = `
      <span class="sw-bennies">${sheet.missing ? '' : `● ${left} Benn${left === 1 ? 'y' : 'ies'}`}</span><span class="grow"></span>
      ${benny && !sheet.missing && left > 0 && !gm ? `<button class="btn btn-ghost" id="swBenny" title="Reroll and keep the best">Spend a Benny · reroll</button>` : ''}
      <button class="btn btn-primary" id="swDone">Done</button>`;
    if (r.outcome === 'crit_fail') tray.insertAdjacentHTML('beforeend', '<p class="sw-note">Critical Failures can\'t be rerolled.</p>');
    $('#swDone', root).addEventListener('click', () => { close(); opts.onDone?.(r); });
    $('#swBenny', root)?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      tray.innerHTML = tumble(r.die);
      const { data, error } = await supa.rpc('sw_reroll', { p_roll: r.id });
      if (error) { toast(error.message, 'error'); showResult(r); return; }
      sheet.bennies = data.bennies_left;
      await new Promise(res => setTimeout(res, 700));
      showResult(data);
    });
    opts.onRoll?.(r);
  }
}

/* The dice tumbling while the server rolls. */
function tumble(die) {
  return `<div class="sw-dice rolling">
      <span class="sw-die d${die}" data-sides="${die}"><i></i><em>d${die}</em></span>
      <span class="sw-die wild" data-sides="6"><i></i><em>wild</em></span>
    </div>${flicker()}`;
}
function flicker() {
  // Random faces on the tumbling dice until the result lands.
  queueMicrotask(() => {
    const dice = $$('.sw-dice.rolling .sw-die i');
    const tick = () => {
      if (!document.querySelector('.sw-dice.rolling')) return;
      dice.forEach(i => { const n = +i.parentElement.dataset.sides; i.textContent = 1 + Math.floor(Math.random() * n); });
      setTimeout(tick, 70);
    };
    tick();
  });
  return '';
}
function landed(r) {
  const tSum = r.trait_rolls.reduce((a, b) => a + b, 0), wSum = (r.wild_rolls || []).reduce((a, b) => a + b, 0);
  return `<div class="sw-dice landed">
      <span class="sw-die d${r.die} ${tSum >= wSum ? 'kept' : 'dropped'} ${r.trait_rolls.length > 1 ? 'aced' : ''}"><i>${tSum}</i><em>d${r.die}</em></span>
      ${r.wild_rolls ? `<span class="sw-die wild ${wSum > tSum ? 'kept' : 'dropped'} ${r.wild_rolls.length > 1 ? 'aced' : ''}"><i>${wSum}</i><em>wild</em></span>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  GM: ask for a roll                                                */
/* ------------------------------------------------------------------ */

const QUICK = ['Notice', 'Smarts or Common Knowledge', 'Athletics', 'Stealth', 'Persuasion', 'Focus', 'Spirit', 'Vigor', 'Agility', 'Research', 'Hacking', 'Fighting', 'Shooting'];

/**
 * people: [{ id, username }]   preselect: ids ticked by default
 * Resolves the new request id, or null.
 */
export function openRequest({ kind, ctx = null, people = [], preselect = null, title = 'Ask for a roll' }) {
  return new Promise(resolve => {
    const pre = new Set(preselect || people.map(p => p.id));
    let mod = 0;
    const { root, close } = overlay(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x title="Close">✕</button></div>
      <div class="modal-body sw-body">
        <div class="field"><label for="srTrait">Trait</label>
          <input type="text" id="srTrait" list="srList" placeholder="Notice · or “Smarts or Common Knowledge”">
          <datalist id="srList">${[...ATTRS.map(cap), ...Object.keys(SKILLS)].map(s => `<option value="${esc(s)}">`).join('')}</datalist>
          <div class="sw-quick">${QUICK.map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          <small class="muted">Use “or” to give a choice, like “Vigor or Athletics”.</small></div>
        <div class="sw-modrow"><span>Modifier</span>
          <button type="button" class="sw-step" data-step="-1">−</button><strong class="sw-modval" id="srMod">±0</strong><button type="button" class="sw-step" data-step="1">+</button></div>
        <div class="field"><label for="srNote">Note for them (optional)</label>
          <input type="text" id="srNote" maxlength="200" placeholder="Optional"></div>
        ${people.length ? `<div class="field"><label>Who rolls</label>
          <div class="sw-who">${people.map(p => `<label><input type="checkbox" value="${esc(p.id)}" ${pre.has(p.id) ? 'checked' : ''}> ${esc(p.username)}</label>`).join('')}</div></div>` : ''}
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="srGo">Send request</button></div>`);
    $$('[data-q]', root).forEach(b => b.addEventListener('click', () => { $('#srTrait', root).value = b.dataset.q; }));
    $$('[data-step]', root).forEach(b => b.addEventListener('click', () => {
      mod = Math.max(-10, Math.min(10, mod + +b.dataset.step)); $('#srMod', root).textContent = signed(mod);
    }));
    $$('[data-x]', root).forEach(b => b.addEventListener('click', () => resolve(null)));
    $('#srGo', root).addEventListener('click', async (e) => {
      const trait = $('#srTrait', root).value.trim();
      const targets = people.length ? $$('.sw-who input:checked', root).map(i => i.value) : (preselect || []);
      if (!trait) return toast('Pick a trait.', 'error');
      if (!targets.length) return toast('Pick who rolls.', 'error');
      e.currentTarget.disabled = true;
      const { data, error } = await supa.rpc('sw_request', {
        p_kind: kind, p_ctx: ctx, p_targets: targets, p_trait: trait, p_mod: mod, p_note: $('#srNote', root).value.trim() || null });
      if (error) {
        e.currentTarget.disabled = false;
        return toast(/sw_request|does not exist/.test(error.message) ? 'Run sql/mytime.sql in Supabase first.' : error.message, 'error');
      }
      toast('Roll requested.', 'ok'); close(); resolve(data);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  requests + rolls for a page (Queree search, Flight)               */
/* ------------------------------------------------------------------ */

export async function loadRequests(kind, ctx = null) {
  let q = supa.from('sw_requests').select('*').eq('kind', kind).order('created_at');
  if (ctx) q = q.eq('context_id', ctx);
  const { data: reqs, error } = await q;
  if (error || !reqs?.length) return { reqs: [], rolls: new Map() };
  const { data: rolls } = await supa.from('sw_rolls').select('*').in('request_id', reqs.map(r => r.id)).order('created_at');
  const by = new Map();
  (rolls || []).forEach(r => { if (!by.has(r.request_id)) by.set(r.request_id, []); by.get(r.request_id).push(r); });
  return { reqs, rolls: by };
}

/** GM view of one request: everyone's latest result. */
export function requestResultsHtml(q, rolls = [], names = new Map()) {
  const latest = new Map();
  rolls.forEach(r => latest.set(r.user_id, r));
  return `
    <div class="sw-req gm" data-req="${esc(q.id)}">
      <div class="sw-req-head"><span class="sw-req-ico">🎲</span>
        <span class="sw-req-what"><small>You asked for</small><strong>${esc(q.trait)}${q.modifier ? ` <em>${signed(q.modifier)}</em>` : ''}</strong></span>
        ${q.closed ? '<span class="sw-req-closed">Closed</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-closereq="${esc(q.id)}">Close</button>`}</div>
      ${q.note ? `<p class="sw-req-note">${esc(q.note)}</p>` : ''}
      ${q.targets.map(id => latest.get(id)
        ? rollCard(latest.get(id), { who: names.get(id) || 'player', compact: true })
        : `<div class="sw-waiting">${esc(names.get(id) || 'player')} hasn't rolled yet…</div>`).join('')}
    </div>`;
}

export function wireRequestButtons(scope, { me, reqs, onDone }) {
  $$('[data-rollreq]', scope).forEach(b => b.addEventListener('click', () => {
    const q = reqs.find(x => x.id === b.dataset.rollreq);
    openRoller({ me, request: q, onDone });
  }));
  $$('[data-closereq]', scope).forEach(b => b.addEventListener('click', async () => {
    const { error } = await supa.from('sw_requests').update({ closed: true }).eq('id', b.dataset.closereq);
    if (error) return toast(error.message, 'error');
    onDone?.();
  }));
}
