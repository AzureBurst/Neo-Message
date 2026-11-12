// =====================================================================
//  MYTIME — a place for heroes
//
//  A MySpace-style profile for each character (the player writes it),
//  their Savage Worlds sheet laid out like a school transcript (the GM
//  writes it), and the Free Time tracker: 3 points a week, the GM
//  approves, then the player rolls.
//
//  Rules live in sql/mytime.sql — this file only draws them.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource, startPresence,
  esc, toast, uploadFile, shrinkImage, lightbox, initials, icStamp, $, $$
} from './supa.js';
import { loadClock, storyNow } from './clock.js';
import { mountShade } from './shade.js';
import { playSound } from './sfx.js';
import {
  openRoller, openRequest, rollCard, requestCard, loadRequests, wireRequestButtons, wireVerdicts,
  ATTRS, SKILLS, CORE_SKILLS, DIES, dieLabel, signed, blankSheet
} from './dice.js';
import { loadDirectory, loadCategoryList, sortPeople, filterBar, wireFilter } from './directory.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'mytime'); } catch {}

if (me.is_admin) $$('.mt-gm-link').forEach(a => a.hidden = false);

const main = $('#mtMain');
const NEEDS_SQL = 'Run sql/mytime.sql in Supabase first.';
const sqlMsg = e => (/does not exist|schema cache|Could not find/i.test(e?.message || '') ? NEEDS_SQL : (e?.message || 'Something went wrong.'));
const cap = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

/* ------------------------------------------------------------------ */
/*  the rules, as drawn                                               */
/* ------------------------------------------------------------------ */

const TRACKS = [
  { key: 'academics', name: 'Academics', traits: ['Smarts', 'Common Knowledge'], color: '#3C6FD9', perks: [
    ['Second Draft', 'Reroll one Smarts-linked skill roll each session.'],
    ['Honor Roll', 'Gain a permanent skill point for any Smarts-linked skill.'],
    ['Office Hours', 'Once a session, take +2 on a Smarts roll when a roleplay scene calls for it.'],
    ['Valedictorian', 'Take a free Edge with a Smarts requirement.']] },
  { key: 'conditioning', name: 'Conditioning', traits: ['Vigor', 'Athletics'], color: '#1E8A5A', perks: [
    ['Marathon Runner', 'Add 1 to your Pace.'],
    ['Second Wind', 'Free reroll on Vigor rolls made to resist Fatigue.'],
    ['Iron Body', 'Add 1 to your Toughness, permanently.'],
    ['Varsity Captain', 'Take a free Combat or Background Edge you qualify for.']] },
  { key: 'bonds', name: 'Bonds', traits: ['Persuasion', 'Spirit'], color: '#C23A78', perks: [
    ['Wingman', 'Once a session, Support an ally at +2 without rolling.'],
    ['Good Standing', 'Start every session with one extra Benny.'],
    ['Pay It Forward', 'Once a session, hand one of your Bennies to another player.'],
    ['Student Council', 'Take a free Social or Leadership Edge.']] },
  { key: 'heroism', name: 'Heroism', traits: ['Spirit'], color: '#7A4FD0', perks: [
    ['Hero Instinct', 'Once a session, reroll anything you roll to protect or rescue someone else.'],
    ['What Goes Around', 'Once a session, someone you helped before returns the favor. A ride, a warning, an open door.'],
    ['Hero Moment', 'Once a session, risk yourself for someone who can\'t fight back and the GM hands you a Benny.'],
    ['Hall of Fame', 'Take a free Edge: Brave, Command, Inspire, or Healer.']] },
  { key: 'control', name: 'Control', traits: ['Focus'], color: '#C76A1C', perks: [
    ['Steady Hands', 'Reroll one Focus roll each session.'],
    ['Growth Spurt', 'Gain 5 more Super Power Points.'],
    ['Fine Tuning', 'Permanently ease one drawback your power carries.'],
    ['Full Potential', 'Gain 5 more Power Points, or drop a negative modifier without repaying it.']] }
];
const TRACK = Object.fromEntries(TRACKS.map(t => [t.key, t]));
const STAGES = [{ size: 3, pen: 0, rank: 2 }, { size: 4, pen: -1, rank: 3 }, { size: 5, pen: -2, rank: 4 }, { size: 6, pen: -3, rank: 5 }];
const rankOf = b => 1 + (b >= 3) + (b >= 7) + (b >= 12) + (b >= 18);
const penaltyOf = b => (b < 3 ? 0 : b < 7 ? -1 : b < 12 ? -2 : b < 18 ? -3 : null);
const capOf = (prog, key) => {
  if (key !== 'control') return 18;
  if (rankOf(prog.conditioning || 0) < 3) return 7;
  if (rankOf(prog.heroism || 0) < 3) return 12;
  return 18;
};
const REPUTATION = [
  ['Disgraced', 'supervised missions only'], ['Unknown', 'nobody\'s heard of you'],
  ['Promising', 'better assignments'], ['Rising Star', 'internships, gear budget'],
  ['Household Name', 'villains come looking']
];
const DEFAULT_HEADLINE = 'Together we are Neo Heroes';
const repSlug = l => String(l || 'Unknown').toLowerCase().replace(/\s+/g, '-');
/* Reputation is free text the GM writes; nothing shows until there is some. */
const repPill = (t, cls = 'mt-rep') => (t && t.trim() ? `<span class="${cls} rep-text">★ ${esc(t.trim())}</span>` : '');

/* ------------------------------------------------------------------ */
/*  people                                                            */
/* ------------------------------------------------------------------ */

let people = new Map();          // id -> profile
let mtRows = new Map();          // id -> mt_profiles row
async function loadPeople() {
  const [{ data: ppl }, { data: mts }] = await Promise.all([
    supa.from('profiles').select('*').order('username'),
    supa.from('mt_profiles').select('user_id, char_name, photo_url, mood, headline')
  ]);
  people = new Map((ppl || []).map(p => [p.id, p]));
  mtRows = new Map((mts || []).map(m => [m.user_id, m]));
  // Players only see who their category lets them see (sql/categories.sql);
  // the directory also says who's an NPC, so real players can go first.
  const [dir, c] = await Promise.all([loadDirectory({ fresh: true }), loadCategoryList()]);
  cats = c;
  npcIds = new Set(dir.filter(r => r.is_npc).map(r => r.id));
  dir.forEach(r => { const p = people.get(r.id); if (p && !p.category_id) p.category_id = r.category_id; });
  if (!me.is_admin) visible = new Set(dir.map(r => r.id).concat(me.id));
}
let visible = null, npcIds = new Set(), cats = [];
const catOf = p => p.category_id;
/** Everyone shown in MyTime lists: players first, then by group, then by name. */
const players = () => sortPeople([...people.values()].filter(p => !p.is_admin && (!visible || visible.has(p.id))),
  { catOf, isNpc: p => npcIds.has(p.id), nameOf: p => nameOf(p.id) }, cats);
const playerTag = id => npcIds.has(id) ? '' : '<span class="player-tag">Player</span>';
const nameOf = id => mtRows.get(id)?.char_name || people.get(id)?.username || 'someone';
const userOf = id => people.get(id)?.username || '';
const photoOf = id => mtRows.get(id)?.photo_url || people.get(id)?.avatar_url || null;
const pic = (id, cls = '') => {
  const url = photoOf(id);
  return `<span class="mt-pic ${cls}">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<b>${esc(initials(nameOf(id)))}</b>`}</span>`;
};
const canSeePrivate = id => id === me.id || me.is_admin;

/* ------------------------------------------------------------------ */
/*  routing                                                           */
/* ------------------------------------------------------------------ */

function parseHash() {
  const [view, arg] = (location.hash.slice(1) || 'profile').split('/');
  return { view: view || 'profile', arg: arg || null };
}

async function route() {
  const { view, arg } = parseHash();
  $$('#mtNav [data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === view));
  const who = arg && people.has(arg) ? arg : me.id;
  main.classList.remove('mt-wide');
  window.scrollTo(0, 0);
  try {
    if (view === 'browse') await viewBrowse();
    else if (view === 'transcript') await viewTranscript(canSeePrivate(who) ? who : me.id);
    else if (view === 'freetime') await viewFreeTime(canSeePrivate(who) ? who : me.id);
    else if (view === 'gm' && me.is_admin) await viewGM();
    else await viewProfile(who);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="mt-empty">${esc(sqlMsg(e))}</div>`;
  }
}
const goto = (view, id = null) => {
  const h = '#' + view + (id && id !== me.id ? '/' + id : '');
  if (location.hash === h) route(); else location.hash = h;
};
window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ */
/*  profile                                                           */
/* ------------------------------------------------------------------ */

async function viewProfile(uid) {
  const own = uid === me.id;
  const [{ data: p, error }, { data: rep }, { data: comments }] = await Promise.all([
    supa.from('mt_profiles').select('*').eq('user_id', uid).maybeSingle(),
    supa.from('ft_reputation').select('level').eq('user_id', uid).maybeSingle(),
    supa.from('mt_comments').select('*').eq('profile_id', uid).order('created_at', { ascending: false }).limit(40)
  ]);
  if (error) throw error;
  const v = p || {};
  const name = v.char_name || userOf(uid);
  const first = esc(name.split(' ')[0]);
  const top8 = (v.top8 || []).filter(id => people.has(id)).slice(0, 8);
  const level = rep?.level || '';
  const row = (k, val) => val ? `<tr><th>${k}</th><td>${esc(val)}</td></tr>` : '';
  const interests = [row('Likes', v.likes), row('Dislikes', v.dislikes), row('Favorite Hero', v.favorite_hero)].join('');
  const details = [row('Status', v.status), row('Height / Weight', v.height_weight), row('Birthday', v.birthday),
    row('Birthplace', v.birthplace)].join('');
  const myTop = mtRows.get(me.id)?.top8 || [];

  main.innerHTML = `
    <div class="mt-profile">
      <aside class="mt-col mt-left">
        <h1 class="mt-name">${esc(name)}</h1>
        <div class="mt-idcard">
          <button class="mt-photo" type="button" ${photoOf(uid) ? 'data-zoom' : ''}>${pic(uid, 'xl')}</button>
          <div class="mt-idinfo">
            <q>${esc(v.headline || DEFAULT_HEADLINE)}</q>
            ${v.status ? `<span>${esc(v.status)}</span>` : ''}
            ${v.birthplace ? `<span>${esc(v.birthplace)}</span>` : ''}
            ${repPill(level)}
            ${own ? '<span class="mt-online"><i></i>Online now!</span>' : ''}
          </div>
        </div>
        ${v.mood ? `<div class="mt-mood"><b>Mood:</b> ${esc(v.mood)}</div>` : ''}
        ${canSeePrivate(uid) ? `<div class="mt-viewmy"><b>View my:</b>
          <a href="#transcript${own ? '' : '/' + uid}">Transcript</a> · <a href="#freetime${own ? '' : '/' + uid}">Free Time</a></div>` : ''}
        ${own || me.is_admin ? `<button class="mt-edit-btn" id="mtEdit" type="button">✎ Edit ${own ? 'my' : 'this'} profile</button>` : ''}

        <section class="mt-box">
          <h3>Contacting ${esc(name)}</h3>
          <div class="mt-contact">
            <a href="app.html"><span>✉</span>Send Message</a>
            ${!own ? `<button type="button" id="mtAddFriend"><span>${myTop.includes(uid) ? '✓' : '＋'}</span>${myTop.includes(uid) ? 'In your Top 8' : 'Add to Top 8'}</button>` : '<a href="#browse"><span>👥</span>Browse people</a>'}
            <button type="button" id="mtToComment"><span>💬</span>Leave a Comment</button>
            <a href="#freetime${own ? '' : '/' + uid}" ${canSeePrivate(uid) ? '' : 'hidden'}><span>⏳</span>Free Time</a>
          </div>
        </section>

        ${v.song ? `<div class="mt-player"><span class="mt-play">▶</span><span class="mt-song"><b>${esc(v.song)}</b><i><em style="width:${20 + (v.song.length * 7) % 60}%"></em></i></span><small>${1 + v.song.length % 3}:${String(10 + (v.song.length * 13) % 49).padStart(2, '0')}</small></div>` : ''}

        <section class="mt-box">
          <h3>${esc(name)}'s Interests</h3>
          ${interests ? `<table class="mt-table">${interests}</table>` : '<p class="mt-none">Nothing here yet.</p>'}
        </section>
        <section class="mt-box">
          <h3>${esc(name)}'s Details</h3>
          ${details ? `<table class="mt-table">${details}</table>` : '<p class="mt-none">Nothing here yet.</p>'}
        </section>
      </aside>

      <section class="mt-col mt-right">
        <div class="mt-network"><b>${esc(name)}</b> ${own ? 'is you.' : 'is in your extended network'}</div>

        <section class="mt-box">
          <h3>${esc(name)}'s Blurbs</h3>
          <h4>About me:</h4>
          <div class="mt-prose">${v.about_me ? paras(v.about_me) : '<p class="mt-none">…</p>'}</div>
          <h4>Who I'd like to meet:</h4>
          <div class="mt-prose">${v.want_to_meet ? paras(v.want_to_meet) : '<p class="mt-none">…</p>'}</div>
        </section>

        ${v.relationships ? `<section class="mt-box"><h3>${esc(name)}'s Relationships</h3><div class="mt-prose">${paras(v.relationships)}</div></section>` : ''}

        <section class="mt-box">
          <h3>${esc(name)}'s Friend Space</h3>
          <p class="mt-friendcount"><b>${esc(name)}</b> has <b class="hot">${top8.length}</b> friend${top8.length === 1 ? '' : 's'} in their Top 8.</p>
          <div class="mt-top8">${top8.map(id => `
            <a class="mt-friend" href="#profile/${esc(id)}">${pic(id, 'lg')}<span>${esc(nameOf(id))}</span></a>`).join('')
            || `<p class="mt-none">${own ? 'Pick your Top 8 in Edit profile.' : 'No Top 8 yet.'}</p>`}</div>
        </section>

        <section class="mt-box" id="mtComments">
          <h3>${esc(name)}'s Friends Comments</h3>
          <p class="mt-friendcount">Displaying <b class="hot">${comments?.length || 0}</b> comment${comments?.length === 1 ? '' : 's'}.</p>
          <form class="mt-comment-form" id="mtCommentForm">
            <textarea id="mtCommentText" rows="2" maxlength="1000" placeholder="Leave ${esc(first)} a comment…"></textarea>
            <button class="mt-btn" type="submit">Post</button>
          </form>
          <div class="mt-comments">${(comments || []).map(c => `
            <div class="mt-comment">
              <a class="mt-comment-who" href="#profile/${esc(c.author_id)}">${pic(c.author_id)}<span>${esc(nameOf(c.author_id))}</span></a>
              <div class="mt-comment-body">
                <div class="mt-comment-when">${icStamp(c, { fmt: 'short' })}
                  ${c.author_id === me.id || own || me.is_admin ? `<button type="button" data-delc="${esc(c.id)}" title="Delete">✕</button>` : ''}</div>
                <p>${esc(c.body).replace(/\n/g, '<br>')}</p>
              </div>
            </div>`).join('')}</div>
        </section>
      </section>
    </div>`;

  $('[data-zoom]', main)?.addEventListener('click', () => lightbox(photoOf(uid)));
  $('#mtEdit')?.addEventListener('click', () => openProfileEditor(uid, v));
  $('#mtToComment').addEventListener('click', () => { $('#mtCommentText').focus(); $('#mtComments').scrollIntoView({ behavior: 'smooth' }); });
  $('#mtAddFriend')?.addEventListener('click', async () => {
    const cur = mtRows.get(me.id)?.top8 || [];
    const next = cur.includes(uid) ? cur.filter(x => x !== uid) : [...cur, uid];
    if (next.length > 8) return toast('Your Top 8 is full. Edit your profile to swap someone out.', 'info');
    const { error } = await supa.from('mt_profiles').upsert({ user_id: me.id, top8: next, updated_at: new Date().toISOString() });
    if (error) return toast(sqlMsg(error), 'error');
    mtRows.set(me.id, { ...(mtRows.get(me.id) || {}), top8: next });
    toast(cur.includes(uid) ? 'Removed from your Top 8.' : 'Added to your Top 8!', 'ok');
    route();
  });
  $('#mtCommentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('#mtCommentText').value.trim();
    if (!body) return;
    const { error } = await supa.from('mt_comments').insert({ profile_id: uid, author_id: me.id, body });
    if (error) return toast(sqlMsg(error), 'error');
    playSound('sent'); route();
  });
  $$('[data-delc]', main).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this comment?')) return;
    const { error } = await supa.from('mt_comments').delete().eq('id', b.dataset.delc);
    if (error) return toast(error.message, 'error');
    route();
  }));
}

const paras = t => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

function openProfileEditor(uid, v) {
  const root = $('#modalRoot');
  const f = (id, label, val, ph = '', type = 'input') => `
    <div class="field"><label for="${id}">${label}</label>
      ${type === 'area' ? `<textarea id="${id}" rows="3" placeholder="${esc(ph)}">${esc(val || '')}</textarea>`
        : `<input type="text" id="${id}" value="${esc(val || '')}" placeholder="${esc(ph)}" maxlength="200">`}</div>`;
  const top = new Set(v.top8 || []);
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide mt-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Edit profile</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <div class="mt-edit-grid">
          <div>
            <h5 class="mt-edit-h">The basics</h5>
            ${f('eName', 'Character name', v.char_name, userOf(uid))}
            <div class="field"><label>Picture <span class="muted">(character skin)</span></label>
              <div class="mt-photo-edit">${pic(uid, 'lg')}<input type="file" id="ePhoto" accept="image/*">
              <input type="text" id="ePhotoUrl" value="${esc(v.photo_url || '')}" placeholder="…or paste an image link"></div></div>
            ${f('eHead', 'Headline', v.headline, DEFAULT_HEADLINE)}
            ${f('eMood', 'Mood', v.mood, 'caffeinated')}
            ${f('eSong', 'Profile song', v.song, 'Artist – Song')}
            <h5 class="mt-edit-h">Details</h5>
            ${f('eStatus', 'Status', v.status, 'Single · Sophomore · On probation…')}
            ${f('eHW', 'Height / Weight', v.height_weight, '5\'9" / 150 lbs')}
            ${f('eBday', 'Birthday', v.birthday)}
            ${f('eBplace', 'Birthplace', v.birthplace)}
            <p class="muted small">Social class, languages and your biggest secret are on your Transcript, where only you and the GM can see them.</p>
          </div>
          <div>
            <h5 class="mt-edit-h">Interests</h5>
            ${f('eHero', 'Favorite hero', v.favorite_hero)}
            ${f('eLikes', 'Likes', v.likes, '', 'area')}
            ${f('eDislikes', 'Dislikes', v.dislikes, '', 'area')}
            <h5 class="mt-edit-h">Blurbs</h5>
            ${f('eAbout', 'About me', v.about_me, '', 'area')}
            ${f('eMeet', 'Who I\'d like to meet', v.want_to_meet, '', 'area')}
            ${f('eRel', 'Relationships', v.relationships, 'Who matters to your character, and how.', 'area')}
          </div>
        </div>
        <h5 class="mt-edit-h">Top 8 <small class="muted" id="eTopN"></small></h5>
        <div class="mt-top-pick">${players().filter(p => p.id !== uid).map(p => `
          <label><input type="checkbox" value="${esc(p.id)}" ${top.has(p.id) ? 'checked' : ''}>${pic(p.id)}<span>${esc(nameOf(p.id))}</span></label>`).join('')}</div>
        <div id="eMsg"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="eSave">Save profile</button></div>
    </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach(b => b.addEventListener('click', close));
  const paintN = () => {
    const n = $$('.mt-top-pick input:checked', root).length;
    $('#eTopN', root).textContent = `${n} / 8`;
    $$('.mt-top-pick input:not(:checked)', root).forEach(i => { i.disabled = n >= 8; });
  };
  root.addEventListener('change', paintN); paintN();

  $('#eSave', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
    const val = id => $(id, root).value.trim() || null;
    let photo = val('#ePhotoUrl');
    const file = $('#ePhoto', root).files[0];
    try {
      if (file) photo = await uploadFile('avatars', me.id, await shrinkImage(file, 900));
    } catch (err) { btn.disabled = false; btn.textContent = 'Save profile'; return toast(err.message, 'error'); }
    const row = {
      user_id: uid, char_name: val('#eName'), photo_url: photo, headline: val('#eHead'), mood: val('#eMood'),
      song: val('#eSong'), status: val('#eStatus'), height_weight: val('#eHW'), birthday: val('#eBday'),
      birthplace: val('#eBplace'),
      favorite_hero: val('#eHero'), likes: val('#eLikes'), dislikes: val('#eDislikes'), about_me: val('#eAbout'),
      want_to_meet: val('#eMeet'), relationships: val('#eRel'),
      top8: $$('.mt-top-pick input:checked', root).map(i => i.value), updated_at: new Date().toISOString()
    };
    const { error } = await supa.from('mt_profiles').upsert(row);
    if (error) {
      btn.disabled = false; btn.textContent = 'Save profile';
      $('#eMsg', root).innerHTML = `<div class="notice notice-error">${esc(sqlMsg(error))}</div>`;
      return;
    }
    mtRows.set(uid, row);
    toast('Profile saved.', 'ok'); close(); route();
  });
}

/* ------------------------------------------------------------------ */
/*  browse                                                            */
/* ------------------------------------------------------------------ */

async function viewBrowse() {
  const { data: reps } = await supa.from('ft_reputation').select('user_id, level');
  const rep = new Map((reps || []).map(r => [r.user_id, r.level]));
  const list = players();
  main.innerHTML = `
    <section class="mt-box mt-browse">
      <h3>Browse people</h3>
      <div class="mt-browse-bar"><input type="search" id="mtFind" placeholder="Search by name…"></div>
      ${filterBar(list, catOf, 'mytime-browse', cats)}
      <div class="mt-browse-grid">${list.map(p => `
        <a class="mt-card" href="#profile/${esc(p.id)}" data-cat="${esc(p.category_id || 'none')}" data-name="${esc((nameOf(p.id) + ' ' + p.username).toLowerCase())}">
          ${pic(p.id, 'lg')}
          <strong>${esc(nameOf(p.id))}</strong>
          <small>@${esc(p.username)}${playerTag(p.id)}</small>
          <q class="mt-card-head">${esc(mtRows.get(p.id)?.headline || DEFAULT_HEADLINE)}</q>
          ${mtRows.get(p.id)?.mood ? `<em>Mood: ${esc(mtRows.get(p.id).mood)}</em>` : ''}
          ${repPill(rep.get(p.id))}
        </a>`).join('') || '<p class="mt-none">Nobody here yet.</p>'}</div>
    </section>`;
  wireFilter(main, 'mytime-browse', { items: '.mt-card' });
  $('#mtFind').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $$('.mt-card', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
  });
}

/* ------------------------------------------------------------------ */
/*  transcript — the character sheet, laid out like the school's       */
/* ------------------------------------------------------------------ */

let transcriptTab = 'education';

async function getSheet(uid) {
  const { data, error } = await supa.from('sw_sheets').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

function derivedOf(s) {
  const skill = n => (s.skills || []).find(x => x.name.toLowerCase() === n);
  const fighting = skill('fighting');
  const vigor = s.attributes?.vigor?.die || 4;
  const str = s.attributes?.strength?.die || 4;
  const d = s.derived || {};
  const armor = +d.armor || 0;
  return {
    parry: d.parry ?? (2 + (fighting ? fighting.die / 2 : 0)),
    toughness: d.toughness ?? (2 + vigor / 2 + armor),
    armor,
    pace: d.pace ?? 6,
    dash: d.dash ?? 'd6',
    // Savage Worlds load limit: d4 20, d6 40, d8 60, d10 80, d12 100. Max carry is 4× that.
    encumbrance: d.encumbrance ?? (str / 2 - 1) * 20,
    carry: d.carry ?? (d.encumbrance ?? (str / 2 - 1) * 20) * 4
  };
}

async function viewTranscript(uid) {
  if (!canSeePrivate(uid)) uid = me.id;          // transcripts are private
  const sheet = await getSheet(uid);
  const { data: priv } = await supa.from('mt_private').select('*').eq('user_id', uid).maybeSingle();
  const pv = priv || {};
  const s = sheet || blankSheet(uid);
  const { data: rep } = await supa.from('ft_reputation').select('level').eq('user_id', uid).maybeSingle();
  const d = derivedOf(s);
  const own = uid === me.id;
  const pw = s.power || {};
  const canRoll = own && !!sheet;
  const dieRow = (label, t, key) => `
    <tr class="tr-die">
      <td class="tr-d">D</td><td class="tr-n">${t.die || 4}</td><td class="tr-d">+</td><td class="tr-m">${t.mod ? t.mod : ''}</td>
      <td class="tr-label">${esc(label)}</td>
      ${canRoll ? `<td class="tr-roll"><button type="button" data-rolltrait="${esc(key)}" title="Roll ${esc(label)}">🎲</button></td>` : ''}
    </tr>`;
  const list = (rows, cls = '', empty = 5) => {
    const filled = rows.map(r => `<tr><th>${esc(r.name || '')}${r.severity ? ` <small>(${esc(r.severity)})</small>` : ''}</th><td>${esc(r.desc || r.notes || '')}</td></tr>`);
    while (filled.length < empty) filled.push('<tr><th></th><td></td></tr>');
    return `<table class="tr-table tr-list ${cls}">${filled.join('')}</table>`;
  };

  const tabs = {
    education: `
      <div class="tr-personal-head"><h4 class="tr-h">Personal record</h4>
        <button type="button" class="tr-editlink" id="trPersonal">✎ Edit</button></div>
      <table class="tr-table tr-kv tr-personal">
        <tr><th>Familial Social Class</th><td>${esc(pv.social_class || '')}</td></tr>
        <tr><th>Languages</th><td>${esc(pv.languages || '')}</td></tr>
        <tr><th>Fears / Biggest Secret</th><td>${esc(pv.secret || '')}</td></tr>
      </table>
      <table class="tr-table tr-derived">
        <tr><th>Parry <small>(2 + Fighting/2)</small></th><td>${d.parry}</td><th>Toughness <small>(2 + Vigor/2)</small></th><td>${d.toughness}${d.armor ? ` (${d.armor})` : ''}</td></tr>
        <tr><th>Pace</th><td>${esc(d.pace)} Blocks</td><th>Dash</th><td>${esc(d.dash)}</td></tr>
        <tr><th>Encumbrance level <small>(lbs)</small></th><td>${esc(d.encumbrance)}</td><th>Maximum carry <small>(lbs)</small></th><td>${esc(d.carry)}</td></tr>
      </table>
      <div class="tr-status">
        <span class="tr-pill"><b>${s.bennies}</b> Benn${s.bennies === 1 ? 'y' : 'ies'}</span>
        <span class="tr-pill ${s.wounds ? 'bad' : ''}"><b>${s.wounds}</b> Wound${s.wounds === 1 ? '' : 's'}</span>
        <span class="tr-pill ${s.fatigue ? 'bad' : ''}"><b>${s.fatigue}</b> Fatigue</span>
        ${repPill(rep?.level, 'tr-pill')}
      </div>
      <h4 class="tr-h">Attributes</h4>
      <table class="tr-table tr-points"><tr><th>Attribute points</th><td>${s.attr_points || 0}</td></tr></table>
      <table class="tr-table tr-dice">${ATTRS.map(a => dieRow(cap(a), s.attributes?.[a] || {}, a)).join('')}</table>
      <h4 class="tr-h">Skills</h4>
      <table class="tr-table tr-points"><tr><th>Skill points</th><td>${s.skill_points || 0}</td></tr></table>
      <table class="tr-table tr-dice tr-skills">${(s.skills || []).map(k =>
        dieRow(`${k.name} (${cap(k.attr || SKILLS[k.name] || 'smarts')})`, k, k.name.toLowerCase())).join('')}</table>`,
    activities: `
      <table class="tr-table tr-kv">
        <tr><th>Power</th><td>${esc(pw.name || '')}</td></tr>
        <tr><th>Level:</th><td>${esc(pw.level ?? 1)}</td></tr>
      </table>
      <table class="tr-table tr-abil">
        <tr class="tr-headrow"><th>Ability</th><th>Level</th><th>Description</th></tr>
        ${[...(pw.abilities || []), ...Array(Math.max(0, 3 - (pw.abilities || []).length)).fill({})].map(a =>
          `<tr><th>${esc(a.name || '')}</th><td class="tr-c">${esc(a.level ?? '')}</td><td>${esc(a.desc || '')}</td></tr>`).join('')}
      </table>
      <table class="tr-table tr-kv">
        <tr><th>Trigger <small>(what causes the power to activate)</small></th><td>${esc(pw.trigger || '')}</td></tr>
        <tr><th>Tells</th><td>${esc(pw.tells || '')}</td></tr>
        <tr><th>Weaknesses</th><td>${esc(pw.weaknesses || '')}</td></tr>
      </table>
      <h4 class="tr-h">Boosts / Edges</h4>
      ${list(s.edges || [])}
      <h4 class="tr-h">Hindrances</h4>
      ${list(s.hindrances || [], 'tr-pink', 4)}`,
    finaid: `
      <h4 class="tr-h">Gear</h4>
      ${list(s.gear || [], '', 6)}
      <h4 class="tr-h">Suits</h4>
      ${list(s.suits || [], '', 3)}
      ${me.is_admin && s.gm_notes ? `<h4 class="tr-h">GM notes <small>(only you see these)</small></h4><div class="tr-note">${paras(s.gm_notes)}</div>` : ''}`
  };

  main.classList.add('mt-wide');
  main.innerHTML = `
    ${me.is_admin ? `
      <div class="mt-gmbar">
        <strong>GM</strong> · ${esc(nameOf(uid))}'s sheet ${sheet ? '' : '<em>— not filled in yet</em>'}
        <span class="mt-spacer"></span>
        <button class="mt-btn" id="trQuick">⚡ Quick entry</button>
        <button class="mt-btn ghost" id="trEdit">✎ Edit sheet</button>
        ${sheet ? `<span class="mt-stepper" title="Bennies"><button data-adj="bennies:-1">−</button>● ${s.bennies}<button data-adj="bennies:1">+</button></span>
        <span class="mt-stepper" title="Wounds"><button data-adj="wounds:-1">−</button>🩸 ${s.wounds}<button data-adj="wounds:1">+</button></span>
        <span class="mt-stepper" title="Fatigue"><button data-adj="fatigue:-1">−</button>💤 ${s.fatigue}<button data-adj="fatigue:1">+</button></span>` : ''}
      </div>` : ''}
    <div class="tr-folder">
      <div class="tr-paper">
        <header class="tr-head">
          ${pic(uid, 'lg')}
          <div><small>Student Transcript</small><h2>${esc(nameOf(uid))}</h2>
            <span>@${esc(userOf(uid))}</span></div>
          <span class="tr-seal">OFFICIAL<br>RECORD</span>
        </header>
        ${!sheet && !me.is_admin ? '<p class="tr-empty">GM is yet to fill in your record.</p>' : ''}
        <div class="tr-body">${tabs[transcriptTab]}</div>
      </div>
      <nav class="tr-tabs" aria-label="Sections">
        <button type="button" data-ttab="education" class="${transcriptTab === 'education' ? 'on' : ''}">Education</button>
        <button type="button" data-ttab="activities" class="${transcriptTab === 'activities' ? 'on' : ''}">Activities</button>
        <button type="button" data-ttab="finaid" class="${transcriptTab === 'finaid' ? 'on' : ''}">Fin-Aid</button>
      </nav>
      <span class="tr-rings"><i></i><i></i></span>
    </div>`;

  $$('[data-ttab]', main).forEach(b => b.addEventListener('click', () => { transcriptTab = b.dataset.ttab; viewTranscript(uid); }));
  $$('[data-rolltrait]', main).forEach(b => b.addEventListener('click', () =>
    openRoller({ me, kind: 'mytime', title: 'Roll ' + b.closest('tr').querySelector('.tr-label').textContent,
      rollFn: async (_t, mod) => {
        const { data, error } = await supa.rpc('sw_roll', { p_trait: b.dataset.rolltrait, p_mod: mod, p_kind: 'mytime' });
        if (error) throw error; return data;
      }, options: [b.dataset.rolltrait] })));
  $('#trPersonal')?.addEventListener('click', () => openPersonalEditor(uid, pv));
  $('#trQuick')?.addEventListener('click', () => openQuickEntry(uid, s, !sheet));
  $('#trEdit')?.addEventListener('click', () => openSheetEditor(uid, s, !sheet));
  $$('[data-adj]', main).forEach(b => b.addEventListener('click', async () => {
    const [k, n] = b.dataset.adj.split(':');
    const val = Math.max(0, Math.min(k === 'bennies' ? 20 : k === 'wounds' ? 6 : 5, (s[k] || 0) + +n));
    const { error } = await supa.from('sw_sheets').update({ [k]: val, updated_at: new Date().toISOString() }).eq('user_id', uid);
    if (error) return toast(sqlMsg(error), 'error');
    viewTranscript(uid);
  }));
}

/** Social class, languages, secret — only the player and the GM see these. */
function openPersonalEditor(uid, pv) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim"><div class="modal mt-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>Personal record</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <p class="muted small">Only ${uid === me.id ? 'you' : esc(nameOf(uid))} and the GM can see these.</p>
        <div class="field"><label for="pClass">Familial social class</label><input type="text" id="pClass" maxlength="200" value="${esc(pv.social_class || '')}"></div>
        <div class="field"><label for="pLang">Languages</label><input type="text" id="pLang" maxlength="200" value="${esc(pv.languages || '')}"></div>
        <div class="field"><label for="pSecret">Fears / biggest secret</label><textarea id="pSecret" rows="4">${esc(pv.secret || '')}</textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="pSave">Save</button></div>
    </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach(b => b.addEventListener('click', close));
  $('#pSave', root).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const v = id => $(id, root).value.trim() || null;
    const { error } = await supa.from('mt_private').upsert({
      user_id: uid, social_class: v('#pClass'), languages: v('#pLang'), secret: v('#pSecret'), updated_at: new Date().toISOString() });
    if (error) {
      e.currentTarget.disabled = false;
      return toast(/social_class|languages|column/i.test(error.message) ? 'Run sql/mytime-private.sql in Supabase first.' : sqlMsg(error), 'error');
    }
    toast('Saved.', 'ok'); close(); viewTranscript(uid);
  });
}

/* ------------------------------------------------------------------ */
/*  GM: quick entry — paste a stat block, or click dice               */
/* ------------------------------------------------------------------ */

/** Pulls traits, edges, hindrances etc. out of free text. */
function parseStatBlock(text, base) {
  const out = structuredClone(base);
  const found = { attrs: [], skills: [], other: [] };
  const lines = String(text || '').split(/\n/);
  const listLine = /^\s*(edges?|boosts?(?:\s*\/\s*edges)?|hindrances?|gear|suits?)\s*[:\-]\s*(.+)$/i;
  const numLine = /\b(bennies|benny|wounds?|fatigue|pace|parry|toughness|armor|attribute points|skill points|power level|level)\s*[:=]?\s*(-?\d+)/gi;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lm = line.match(listLine);
    if (lm) {
      const key = lm[1].toLowerCase();
      const items = lm[2].split(/[;,](?![^(]*\))/).map(x => x.trim()).filter(Boolean).map(x => {
        const m = x.match(/^(.*?)\s*\((major|minor)\)\s*(.*)$/i);
        if (m) return { name: m[1].trim(), severity: cap(m[2].toLowerCase()), desc: m[3].replace(/^[-–:]\s*/, '') };
        const [n, ...rest] = x.split(/\s+[-–:]\s+/);
        return { name: n.trim(), desc: rest.join(' — ') };
      });
      const field = key.startsWith('hind') ? 'hindrances' : key.startsWith('gear') ? 'gear' : key.startsWith('suit') ? 'suits' : 'edges';
      out[field] = field === 'gear' || field === 'suits' ? items.map(i => ({ name: i.name, notes: i.desc })) : items;
      found.other.push(`${cap(field)}: ${items.length}`);
      continue;
    }
    const pm = line.match(/^\s*power\s*[:\-]\s*(.+)$/i);
    if (pm) { out.power = { ...(out.power || {}), name: pm[1].trim() }; found.other.push('Power'); continue; }

    // Traits: "Agility d6", "Fighting: d8+1", "Common Knowledge (Smarts) d6"
    const traitRe = /([A-Za-z][A-Za-z' ]*?)\s*(?:\(([A-Za-z]+)\))?\s*[:\-]?\s*d(4|6|8|10|12)(?:\s*\+\s*(\d+))?/gi;
    let m, any = false;
    while ((m = traitRe.exec(line))) {
      any = true;
      const name = m[1].replace(/^(attributes?|skills?)\s*[:\-]?\s*/i, '').trim();
      const die = +m[3], mod = +(m[4] || 0);
      const low = name.toLowerCase();
      if (ATTRS.includes(low)) {
        out.attributes[low] = { die, mod }; found.attrs.push(`${cap(low)} ${dieLabel(die, mod)}`);
      } else if (name) {
        const proper = Object.keys(SKILLS).find(k => k.toLowerCase() === low) || cap(name);
        const attr = (m[2] && ATTRS.includes(m[2].toLowerCase()) ? m[2].toLowerCase() : null) || SKILLS[proper] || 'smarts';
        const i = out.skills.findIndex(k => k.name.toLowerCase() === proper.toLowerCase());
        const row = { name: proper, attr, die, mod };
        if (i >= 0) out.skills[i] = row; else out.skills.push(row);
        found.skills.push(`${proper} ${dieLabel(die, mod)}`);
      }
    }
    if (any) continue;
    let n;
    while ((n = numLine.exec(line))) {
      const k = n[1].toLowerCase(), v = +n[2];
      if (k.startsWith('benn')) out.bennies = v;
      else if (k.startsWith('wound')) out.wounds = v;
      else if (k === 'fatigue') out.fatigue = v;
      else if (k === 'attribute points') out.attr_points = v;
      else if (k === 'skill points') out.skill_points = v;
      else if (k === 'power level' || k === 'level') out.power = { ...(out.power || {}), level: v };
      else out.derived = { ...(out.derived || {}), [k]: v };
      found.other.push(`${cap(k)} ${v}`);
    }
  }
  return { sheet: out, found };
}

/** A SWADE skill from the list, or a custom trait the GM names. */
function pickTrait(value) {
  if (!value) return null;
  if (value !== '__custom') return { name: value, attr: SKILLS[value] };
  const name = (prompt('Trait name (e.g. Flight, Hero Lore, Driving: Hoverbike):') || '').trim();
  if (!name) return null;
  let attr = (prompt('Linked attribute: Agility, Smarts, Spirit, Strength or Vigor', 'Smarts') || 'smarts').trim().toLowerCase();
  if (!ATTRS.includes(attr)) attr = 'smarts';
  return { name, attr, custom: true };
}

function openQuickEntry(uid, current, isNew) {
  const root = $('#modalRoot');
  let draft = structuredClone({ ...blankSheet(uid), ...current });
  delete draft.missing;
  const chips = (key, val, sel) => DIES.map(d => `<button type="button" class="qe-die ${val === d ? 'on' : ''}" data-${sel}="${esc(key)}" data-die="${d}">d${d}</button>`).join('');
  const paint = () => {
    $('#qeAttrs', root).innerHTML = ATTRS.map(a => `
      <div class="qe-row"><span>${cap(a)}</span><div class="qe-dice">${chips(a, draft.attributes[a]?.die, 'qa')}</div></div>`).join('');
    $('#qeSkills', root).innerHTML = draft.skills.map((k, i) => `
      <div class="qe-row"><span>${esc(k.name)} <small>${esc(cap(k.attr || ''))}</small></span>
        <div class="qe-dice">${chips(i, k.die, 'qs')}<input type="number" class="qe-mod" data-qmod="${i}" value="${k.mod || 0}" min="0" max="5" title="d12+ bonus">
        <button type="button" class="qe-x" data-qdel="${i}" title="Remove">✕</button></div></div>`).join('');
    $('#qeBennies', root).textContent = draft.bennies;
  };
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide mt-modal qe" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>⚡ Quick entry · ${esc(nameOf(uid))}</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <div class="qe-grid">
          <div>
            <h5 class="mt-edit-h">Paste a stat block</h5>
            <textarea id="qePaste" rows="9" placeholder="Agility d6, Smarts d8, Spirit d6, Strength d4, Vigor d6&#10;Skills: Athletics d6, Fighting d6, Notice d8, Shooting d8, Focus d10&#10;Edges: Alertness, Quick&#10;Hindrances: Curious (Major), Loyal (Minor)&#10;Power: Kinetic Pulse&#10;Bennies 3, Pace 6"></textarea>
            <div class="qe-found" id="qeFound"><small class="muted">Anything recognised shows up here and on the right.</small></div>
          </div>
          <div>
            <h5 class="mt-edit-h">Attributes</h5>
            <div id="qeAttrs"></div>
            <h5 class="mt-edit-h">Skills</h5>
            <div id="qeSkills"></div>
            <div class="qe-add"><select id="qeAddSkill"><option value="">＋ Add a skill…</option>
              <option value="__custom">✦ Custom trait…</option>
              ${Object.keys(SKILLS).map(k => `<option>${esc(k)}</option>`).join('')}</select>
              <span class="mt-stepper">Bennies <button data-b="-1">−</button><b id="qeBennies"></b><button data-b="1">+</button></span></div>
          </div>
        </div>
        <div id="qeMsg"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="qeFull">Open full editor</button><span class="grow"></span>
        <button class="btn btn-ghost" data-x>Cancel</button>
        <button class="btn btn-primary" id="qeSave">${isNew ? 'Create sheet' : 'Save sheet'}</button>
      </div>
    </div></div>`;
  paint();
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach(b => b.addEventListener('click', close));
  let base = structuredClone(draft);
  $('#qePaste', root).addEventListener('input', (e) => {
    const { sheet, found } = parseStatBlock(e.target.value, base);
    draft = sheet; paint();
    const bits = [...found.attrs, ...found.skills, ...found.other];
    $('#qeFound', root).innerHTML = bits.length ? bits.map(b => `<span class="qe-tag">${esc(b)}</span>`).join('') : '<small class="muted">Nothing recognised yet. Try “Agility d6”.</small>';
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.qa) { draft.attributes[b.dataset.qa] = { ...(draft.attributes[b.dataset.qa] || {}), die: +b.dataset.die }; paint(); }
    else if (b.dataset.qs != null) { draft.skills[+b.dataset.qs].die = +b.dataset.die; paint(); }
    else if (b.dataset.qdel != null) { draft.skills.splice(+b.dataset.qdel, 1); paint(); }
    else if (b.dataset.b) { draft.bennies = Math.max(0, draft.bennies + +b.dataset.b); paint(); }
    else return;
    base = structuredClone(draft);
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.qmod != null) { draft.skills[+e.target.dataset.qmod].mod = +e.target.value || 0; base = structuredClone(draft); }
    if (e.target.id === 'qeAddSkill' && e.target.value) {
      const t = pickTrait(e.target.value);
      if (t && !draft.skills.some(k => k.name.toLowerCase() === t.name.toLowerCase())) draft.skills.push({ ...t, die: 4, mod: 0 });
      e.target.value = ''; base = structuredClone(draft); paint();
    }
  });
  $('#qeFull', root).addEventListener('click', () => openSheetEditor(uid, draft, isNew));
  $('#qeSave', root).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const ok = await saveSheet(uid, draft);
    if (!ok) { e.currentTarget.disabled = false; return; }
    close(); route();
  });
}

async function saveSheet(uid, s) {
  const row = {
    user_id: uid, attributes: s.attributes, skills: s.skills, attr_points: +s.attr_points || 0,
    skill_points: +s.skill_points || 0, derived: s.derived || {}, power: s.power || {}, edges: s.edges || [],
    hindrances: s.hindrances || [], gear: s.gear || [], suits: s.suits || [], bennies: +s.bennies || 0,
    wounds: +s.wounds || 0, fatigue: +s.fatigue || 0, gm_notes: s.gm_notes || null, updated_at: new Date().toISOString()
  };
  const { error } = await supa.from('sw_sheets').upsert(row);
  if (error) { toast(sqlMsg(error), 'error'); return false; }
  toast('Sheet saved.', 'ok');
  return true;
}

/* ------------------------------------------------------------------ */
/*  GM: the full sheet editor                                         */
/* ------------------------------------------------------------------ */

function openSheetEditor(uid, current, isNew) {
  const root = $('#modalRoot');
  const s = structuredClone({ ...blankSheet(uid), ...current });
  s.power = { abilities: [], ...(s.power || {}) };
  const dsel = (val, attrs) => `<select ${attrs}>${DIES.map(d => `<option value="${d}" ${+val === d ? 'selected' : ''}>d${d}</option>`).join('')}</select>`;
  const rowsEd = (field, cols) => `
    <div class="se-rows" data-rows="${field}">
      ${(field === 'abilities' ? s.power.abilities : s[field]).map((r, i) => `
        <div class="se-row" data-i="${i}">${cols.map(([k, ph, w]) => k === 'severity'
          ? `<select data-k="severity"><option ${r.severity === 'Minor' ? 'selected' : ''}>Minor</option><option ${r.severity === 'Major' ? 'selected' : ''}>Major</option></select>`
          : `<input type="text" data-k="${k}" value="${esc(r[k] ?? '')}" placeholder="${esc(ph)}" style="flex:${w}">`).join('')}
          <button type="button" class="qe-x" data-rmrow>✕</button></div>`).join('')}
      <button type="button" class="se-add" data-addrow="${field}">＋ Add</button>
    </div>`;
  const COLS = {
    edges: [['name', 'Edge', 1], ['desc', 'What it does', 2]],
    hindrances: [['name', 'Hindrance', 1], ['severity'], ['desc', 'Notes', 2]],
    gear: [['name', 'Item', 1], ['notes', 'Notes', 2]],
    suits: [['name', 'Suit', 1], ['notes', 'Notes', 2]],
    abilities: [['name', 'Ability', 2], ['level', 'Lv', .4], ['desc', 'Description', 3]]
  };
  const d = s.derived || {};
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide mt-modal se" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>✎ ${esc(nameOf(uid))}'s sheet</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <div class="se-grid">
          <section>
            <h5 class="mt-edit-h">Attributes <label class="se-inline">points <input type="number" id="seAP" value="${s.attr_points}"></label></h5>
            ${ATTRS.map(a => `<div class="se-trait"><span>${cap(a)}</span>${dsel(s.attributes[a]?.die, `data-attr="${a}"`)}
              <input type="number" min="0" max="5" data-attrmod="${a}" value="${s.attributes[a]?.mod || 0}" title="d12+ bonus"></div>`).join('')}
            <h5 class="mt-edit-h">Skills <label class="se-inline">points <input type="number" id="seSP" value="${s.skill_points}"></label></h5>
            <div id="seSkills">${s.skills.map((k, i) => `<div class="se-trait" data-si="${i}"><span>${esc(k.name)}</span>
              ${dsel(k.die, `data-sdie="${i}"`)}<input type="number" min="0" max="5" data-smod="${i}" value="${k.mod || 0}">
              <button type="button" class="qe-x" data-sdel="${i}">✕</button></div>`).join('')}</div>
            <select id="seAddSkill"><option value="">＋ Add a skill…</option><option value="__custom">✦ Custom trait…</option>${Object.keys(SKILLS).map(k => `<option>${esc(k)}</option>`).join('')}</select>
            <h5 class="mt-edit-h">Status</h5>
            <div class="se-nums">
              <label>Bennies <input type="number" id="seBen" min="0" value="${s.bennies}"></label>
              <label>Wounds <input type="number" id="seWou" min="0" max="6" value="${s.wounds}"></label>
              <label>Fatigue <input type="number" id="seFat" min="0" max="5" value="${s.fatigue}"></label>
            </div>
            <h5 class="mt-edit-h">Derived <small class="muted">(leave blank to calculate)</small></h5>
            <div class="se-nums">
              ${[['parry', 'Parry'], ['toughness', 'Toughness'], ['armor', 'Armor'], ['pace', 'Pace'], ['dash', 'Dash'], ['encumbrance', 'Encumbrance'], ['carry', 'Max carry']]
                .map(([k, l]) => `<label>${l} <input type="text" data-der="${k}" value="${esc(d[k] ?? '')}" placeholder="${esc(derivedOf({ ...s, derived: {} })[k] ?? '')}"></label>`).join('')}
            </div>
          </section>
          <section>
            <h5 class="mt-edit-h">Power</h5>
            <div class="se-nums">
              <label style="flex:3">Name <input type="text" id="sePow" value="${esc(s.power.name || '')}"></label>
              <label>Level <input type="number" id="sePowL" value="${esc(s.power.level ?? 1)}"></label>
            </div>
            ${rowsEd('abilities', COLS.abilities)}
            <div class="field"><label>Trigger</label><input type="text" id="seTrig" value="${esc(s.power.trigger || '')}"></div>
            <div class="field"><label>Tells</label><input type="text" id="seTells" value="${esc(s.power.tells || '')}"></div>
            <div class="field"><label>Weaknesses</label><input type="text" id="seWeak" value="${esc(s.power.weaknesses || '')}"></div>
            <h5 class="mt-edit-h">Boosts / Edges</h5>${rowsEd('edges', COLS.edges)}
            <h5 class="mt-edit-h">Hindrances</h5>${rowsEd('hindrances', COLS.hindrances)}
            <h5 class="mt-edit-h">Gear</h5>${rowsEd('gear', COLS.gear)}
            <h5 class="mt-edit-h">Suits</h5>${rowsEd('suits', COLS.suits)}
            <div class="field"><label>GM notes <span class="muted">(only you)</span></label><textarea id="seNotes" rows="3">${esc(s.gm_notes || '')}</textarea></div>
          </section>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="seSave">${isNew ? 'Create sheet' : 'Save sheet'}</button></div>
    </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach(b => b.addEventListener('click', close));

  const collect = () => {
    ATTRS.forEach(a => { s.attributes[a] = { die: +$(`[data-attr="${a}"]`, root).value, mod: +$(`[data-attrmod="${a}"]`, root).value || 0 }; });
    s.skills = $$('#seSkills [data-si]', root).map(r => {
      const i = +r.dataset.si, k = s.skills[i];
      return { ...k, die: +$(`[data-sdie="${i}"]`, r).value, mod: +$(`[data-smod="${i}"]`, r).value || 0 };
    });
    s.attr_points = +$('#seAP', root).value || 0; s.skill_points = +$('#seSP', root).value || 0;
    s.bennies = +$('#seBen', root).value || 0; s.wounds = +$('#seWou', root).value || 0; s.fatigue = +$('#seFat', root).value || 0;
    s.derived = {};
    $$('[data-der]', root).forEach(i => { const v = i.value.trim(); if (v !== '') s.derived[i.dataset.der] = isNaN(+v) ? v : +v; });
    const rows = field => $$(`[data-rows="${field}"] .se-row`, root).map(r => Object.fromEntries($$('[data-k]', r).map(i => [i.dataset.k, i.value.trim()])))
      .filter(r => r.name);
    s.power = { name: $('#sePow', root).value.trim(), level: +$('#sePowL', root).value || 1, abilities: rows('abilities'),
      trigger: $('#seTrig', root).value.trim(), tells: $('#seTells', root).value.trim(), weaknesses: $('#seWeak', root).value.trim() };
    ['edges', 'hindrances', 'gear', 'suits'].forEach(f => { s[f] = rows(f); });
    s.gm_notes = $('#seNotes', root).value.trim();
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sdel != null) { collect(); s.skills.splice(+b.dataset.sdel, 1); openSheetEditor(uid, s, isNew); }
    else if (b.dataset.addrow) { collect(); (b.dataset.addrow === 'abilities' ? s.power.abilities : s[b.dataset.addrow]).push({ name: ' ' }); openSheetEditor(uid, s, isNew); }
    else if (b.hasAttribute('data-rmrow')) b.closest('.se-row').remove();
  });
  $('#seAddSkill', root).addEventListener('change', (e) => {
    const t = pickTrait(e.target.value); if (!t) { e.target.value = ''; return; }
    collect();
    if (!s.skills.some(k => k.name.toLowerCase() === t.name.toLowerCase())) s.skills.push({ ...t, die: 4, mod: 0 });
    openSheetEditor(uid, s, isNew);
  });
  $('#seSave', root).addEventListener('click', async (e) => {
    collect();
    e.currentTarget.disabled = true;
    if (await saveSheet(uid, s)) { close(); route(); } else e.currentTarget.disabled = false;
  });
}

/* ------------------------------------------------------------------ */
/*  free time                                                         */
/* ------------------------------------------------------------------ */

async function freeTimeData(uid) {
  const { data: terms, error } = await supa.from('ft_terms').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  const term = terms?.[0] || null;
  const [{ data: prog }, { data: conns }, { data: rep }, { data: plan }, { data: weeks }, { data: sheet }] = await Promise.all([
    supa.from('ft_progress').select('*').eq('user_id', uid),
    supa.from('ft_connections').select('*').eq('user_id', uid).order('created_at'),
    supa.from('ft_reputation').select('level').eq('user_id', uid).maybeSingle(),
    term ? supa.from('ft_plans').select('*').eq('user_id', uid).eq('term_id', term.id).maybeSingle() : Promise.resolve({ data: null }),
    term ? supa.from('ft_weeks').select('*').eq('user_id', uid).eq('term_id', term.id).order('week') : Promise.resolve({ data: [] }),
    supa.from('sw_sheets').select('attributes, skills, bennies').eq('user_id', uid).maybeSingle()
  ]);
  const weekIds = (weeks || []).map(w => w.id);
  const { data: entries } = weekIds.length
    ? await supa.from('ft_entries').select('*').in('week_id', weekIds).order('created_at')
    : { data: [] };
  const rollIds = (entries || []).map(e => e.id);
  const { data: rolls } = rollIds.length
    ? await supa.from('sw_rolls').select('*').eq('context_kind', 'freetime').in('context_id', rollIds).order('created_at')
    : { data: [] };
  const progress = Object.fromEntries(TRACKS.map(t => [t.key, 0]));
  (prog || []).forEach(p => { progress[p.track] = p.boxes; });
  const latestRoll = new Map();
  (rolls || []).filter(r => !r.pending).forEach(r => latestRoll.set(r.context_id, r));
  const byWeek = new Map();
  (entries || []).forEach(e => { if (!byWeek.has(e.week_id)) byWeek.set(e.week_id, []); byWeek.get(e.week_id).push(e); });
  return { term, progress, conns: conns || [], rep: rep?.level || '', plan: plan || {}, weeks: weeks || [],
           byWeek, latestRoll, sheet };
}

const traitDie = (sheet, name) => {
  if (!sheet) return 'd4';
  const k = name.toLowerCase();
  if (ATTRS.includes(k)) return dieLabel(sheet.attributes?.[k]?.die || 4, sheet.attributes?.[k]?.mod || 0);
  const s = (sheet.skills || []).find(x => x.name.toLowerCase() === k);
  return s ? dieLabel(s.die, s.mod) : 'd4−2';
};

function trackBoard(D, { gm = false } = {}) {
  return `<div class="ft-board">${TRACKS.map(t => {
    const b = D.progress[t.key] || 0;
    const capB = capOf(D.progress, t.key);
    let start = 0;
    const stages = STAGES.map((st, i) => {
      const filled = Math.max(0, Math.min(st.size, b - start));
      const done = filled === st.size;
      const current = !done && b >= start && (i === 0 || b >= start);
      const locked = start >= capB;
      const html = `
        <div class="ft-stage ${done ? 'done' : ''} ${current && !locked ? 'current' : ''} ${locked ? 'locked' : ''}">
          <div class="ft-stage-top">
            <span class="ft-boxes">${Array.from({ length: st.size }, (_, j) => `<i class="${j < filled ? 'on' : ''}"></i>`).join('')}</span>
            <span class="ft-pen">${st.pen === 0 ? '−0' : '−' + Math.abs(st.pen)}</span>
          </div>
          ${done || gm ? `
          <strong>${done ? '✓ ' : ''}${esc(t.perks[i][0])}</strong>
          <small>${esc(t.perks[i][1])}${!done ? ' <em class="ft-gmonly">(hidden from player)</em>' : ''}</small>` : `
          <strong class="ft-hidden">${locked ? '🔒 ' : ''}Rank ${st.rank} reward</strong>
          <small>${locked ? 'Locked' : `${filled} / ${st.size} boxes`}</small>`}
        </div>`;
      start += st.size;
      return html;
    }).join('');
    return `
      <div class="ft-track" style="--tc:${t.color}">
        <div class="ft-track-name">
          <strong>${t.name}</strong>
          <small>${t.traits.map(x => `${x} <b>${traitDie(D.sheet, x)}</b>`).join(' or ')}</small>
          <span class="ft-rank">Rank ${rankOf(b)} · ${b}/18</span>
          ${gm ? `<span class="ft-adj"><button data-boxadj="${t.key}:-1" title="Remove a box">−</button><button data-boxadj="${t.key}:1" title="Add a box">+</button></span>` : ''}
        </div>
        <div class="ft-stages">${stages}</div>
      </div>`;
  }).join('')}
  <p class="ft-gate">Control Rank 4 needs Conditioning Rank 3. Control Rank 5 needs Heroism Rank 3.</p>
  </div>`;
}

const entryLabel = (e, D) => e.track ? TRACK[e.track].name : (D.conns.find(c => c.id === e.connection_id)?.name || 'Connection');
const ptsWord = n => `${n} pt${n === 1 ? '' : 's'}`;

function entryLine(e, D, { roll = true } = {}) {
  const r = D.latestRoll.get(e.id);
  const t = e.track ? TRACK[e.track] : null;
  const result = e.status === 'to_roll' ? `<span class="ft-await">Waiting for a roll</span>`
    : e.status === 'pending' ? '' :
    `<span class="ft-gain ${e.complication ? 'bad' : ''}">${e.boxes_gained ? `+${e.boxes_gained} box${e.boxes_gained === 1 ? '' : 'es'}` : 'no boxes'}${e.complication ? ' · complication' : ''}</span>`;
  return `
    <div class="ft-entry" style="--tc:${t?.color || '#6b7280'}">
      <div class="ft-entry-top"><strong>${esc(entryLabel(e, D))}</strong><span class="ft-pts">${ptsWord(e.points)}${e.points === 1 && e.track ? ' · roll' : ''}</span>${result}</div>
      <p>${esc(e.note)}</p>
      ${roll && r ? rollCard(r, { compact: true }) : ''}
      ${e.status === 'to_roll' && e.user_id === me.id ? `<button class="mt-btn ft-roll-btn" data-ftroll="${esc(e.id)}">🎲 Roll ${esc(t.traits.join(' or '))}</button>` : ''}
    </div>`;
}

let draftWeek = null;   // the planner's state survives redraws

/** "Aug 21" — the first day of week n of a term. */
function weekStart(term, n) {
  if (!term?.start_date) return '';
  const d = new Date(term.start_date + 'T12:00:00');
  d.setDate(d.getDate() + (n - 1) * 7);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** GM: set a player's points for the current week, field by field. */
function openGmPoints(uid, D, after) {
  const term = D.term;
  const week = term ? D.weeks.find(w => w.week === term.current_week) : null;
  if (week && ['approved', 'resolved'].includes(week.status)) {
    return toast(`Week ${term.current_week} is already approved. Change their boxes with − / + instead.`, 'info');
  }
  const cur = new Map((week ? D.byWeek.get(week.id) || [] : []).map(e => [e.track || e.connection_id, e]));
  const fields = [...TRACKS.map(t => ({ key: t.key, name: t.name, color: t.color, track: true })),
                  ...D.conns.map(c => ({ key: c.id, name: c.name, color: '#6b7280', track: false }))];
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim"><div class="modal modal-wide mt-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(nameOf(uid))} · week ${term?.current_week ?? '—'} points</h3><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body">
        <p class="muted small">Set any field from 0 to 3. As the GM you can go over 3 in total. It goes into your review queue as usual.</p>
        ${fields.map(f => {
          const e = cur.get(f.key);
          return `
          <div class="ft-plan-row ${e ? 'on' : ''}" style="--tc:${f.color}" data-gkey="${esc(f.key)}" data-track="${f.track ? 1 : 0}">
            <div class="ft-plan-name"><strong>${esc(f.name)}</strong><small>${f.track ? 'Track' : 'Connection'}</small></div>
            <div class="ft-pts-pick">${[0, 1, 2, 3].map(n => `<button type="button" data-gpts="${n}" class="${(e?.points || 0) === n ? 'on' : ''}">${n || '–'}</button>`).join('')}</div>
            <textarea class="ft-note" rows="2" placeholder="Note (optional)">${esc(e?.note || '')}</textarea>
          </div>`;
        }).join('')}
        <p class="muted small" id="gpTotal"></p>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="gpSave">Save points</button></div>
    </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-x]', root).forEach(b => b.addEventListener('click', close));
  const total = () => $$('[data-gkey]', root).reduce((a, r) => a + +($('[data-gpts].on', r)?.dataset.gpts || 0), 0);
  const paintTotal = () => { $('#gpTotal', root).textContent = `${total()} point${total() === 1 ? '' : 's'} this week.`; };
  $$('[data-gkey]', root).forEach(r => $$('[data-gpts]', r).forEach(b => b.addEventListener('click', () => {
    $$('[data-gpts]', r).forEach(x => x.classList.toggle('on', x === b));
    r.classList.toggle('on', b.dataset.gpts !== '0'); paintTotal();
  })));
  paintTotal();
  $('#gpSave', root).addEventListener('click', async (ev) => {
    const entries = $$('[data-gkey]', root).map(r => {
      const pts = +($('[data-gpts].on', r)?.dataset.gpts || 0), note = $('.ft-note', r).value.trim();
      const had = cur.has(r.dataset.gkey);
      if (!pts && !had) return null;
      return r.dataset.track === '1' ? { track: r.dataset.gkey, points: pts, note } : { connection_id: r.dataset.gkey, points: pts, note };
    }).filter(Boolean);
    ev.currentTarget.disabled = true;
    const { error } = await supa.rpc('ft_gm_set_week', { p_user: uid, p_entries: entries });
    if (error) {
      ev.currentTarget.disabled = false;
      return toast(/ft_gm_set_week|does not exist/.test(error.message) ? 'Run sql/freetime-v2.sql in Supabase first.' : error.message, 'error');
    }
    toast('Points saved.', 'ok'); close(); after?.();
  });
}

async function viewFreeTime(uid) {
  const D = await freeTimeData(uid);
  const own = uid === me.id;
  const term = D.term;
  const thisWeek = term ? D.weeks.find(w => w.week === term.current_week) : null;
  const spentByWeek = new Map(D.weeks.map(w => [w.week, (D.byWeek.get(w.id) || []).reduce((a, e) => a + e.points, 0)]));
  main.classList.add('mt-wide');

  let weekCard = '';
  if (!term) weekCard = `<div class="ft-card"><p>No term is running yet. ${me.is_admin ? 'Start one from the GM page.' : 'The GM starts one.'}</p></div>`;
  else if (!thisWeek || thisWeek.status === 'returned') weekCard = own ? plannerHtml(D, thisWeek) : `<div class="ft-card"><h3>Week ${term.current_week}</h3><p class="muted">${esc(nameOf(uid))} hasn't submitted this week yet.</p></div>`;
  else {
    const es = D.byWeek.get(thisWeek.id) || [];
    const head = {
      submitted: ['Submitted', 'The GM will review it. You\'ll get a notification.'],
      approved: ['Approved', 'Roll each 1-point track below.'],
      resolved: ['Done', 'All points for this week are spent.']
    }[thisWeek.status];
    weekCard = `
      <div class="ft-card ft-week ${thisWeek.status}">
        <div class="ft-card-head"><h3>Week ${term.current_week} · ${head[0]}</h3>
          ${own && thisWeek.status === 'submitted' ? '<button class="mt-btn ghost" id="ftEditWeek">✎ Change it</button>' : ''}
          ${me.is_admin && thisWeek.status === 'submitted' ? `<span class="ft-gm-actions"><button class="mt-btn" data-approve="${esc(thisWeek.id)}">✓ Approve</button><button class="mt-btn ghost" data-return="${esc(thisWeek.id)}">Send back</button></span>` : ''}</div>
        <p class="muted">${head[1]}</p>
        ${thisWeek.gm_note ? `<p class="ft-gmnote"><b>GM:</b> ${esc(thisWeek.gm_note)}</p>` : ''}
        ${es.map(e => entryLine(e, D)).join('')}
      </div>`;
  }

  const past = D.weeks.filter(w => !term || w.week !== term.current_week).reverse();
  main.innerHTML = `
    ${me.is_admin && !own ? `<div class="mt-gmbar"><strong>GM</strong> · ${esc(nameOf(uid))}'s free time<span class="mt-spacer"></span>
      <button class="mt-btn" id="ftGmPoints">✎ Set points this week</button></div>` : ''}
    <div class="ft-wrap">
      <header class="ft-head">
        <div><h2>Student Progress</h2><p>Spend free time to fill boxes. Fill a whole stage to rank up and unlock its reward.</p></div>
        <div class="ft-meta"><span><small>Student</small><b>${esc(nameOf(uid))}</b></span>
          <span><small>Term</small><b>${esc(term?.name || '—')}</b></span>
          <span><small>Week</small><b>${term ? `${term.current_week} / ${term.weeks}` : '—'}</b>${term?.start_date ? `<small class="ft-began">from ${weekStart(term, term.current_week)}</small>` : ''}</span></div>
      </header>

      <div class="ft-rules">
        <div><b>1 point</b><span>Roll the track's trait with the stage penalty. A raise fills 2 boxes and a success fills 1. A failure fills nothing and gives you a complication.</span></div>
        <div><b>2 points</b><span>No roll, fill 1 box. Only at −0 or −1.</span></div>
        <div><b>3 points</b><span>No roll, fill 1 box. For −2 and −3.</span></div>
      </div>

      ${weekCard}

      ${trackBoard(D, { gm: me.is_admin })}

      <div class="ft-two">
        <section class="ft-card">
          <div class="ft-card-head"><h3>Connections</h3>${own ? '<button class="mt-btn ghost" id="ftAddConn">＋ Add</button>' : ''}</div>
          <p class="muted small">NPCs you've built a connection with.</p>
          ${D.conns.map(c => `
            <div class="ft-conn ${c.gate_cleared ? '' : 'gated'}">
              <div class="ft-conn-top"><strong>${esc(c.name)}</strong>
                <span class="ft-boxes">${Array.from({ length: 5 }, (_, j) => `<i class="${j < c.boxes ? 'on' : ''}"></i>`).join('')}</span>
                ${me.is_admin ? `<span class="ft-adj"><button data-connadj="${esc(c.id)}:-1" title="Remove a box">−</button><button data-connadj="${esc(c.id)}:1" title="Add a box">+</button></span>` : ''}</div>
              ${c.about ? `<small>${esc(c.about)}</small>` : ''}
              <div class="ft-gate-line">${c.gate_cleared ? '✓ Gate cleared' : `🔒 Gate: ${esc(c.gate || 'the GM will set one')}`}
                ${me.is_admin ? `<button type="button" class="mt-link" data-gate="${esc(c.id)}">edit</button>` : ''}</div>
            </div>`).join('') || '<p class="mt-none">No connections yet.</p>'}
        </section>
        <section class="ft-card">
          <h3>Reputation</h3>
          <p class="muted small">How you're seen.</p>
          ${me.is_admin
            ? `<textarea id="ftRep" class="ft-rep-text" rows="3" placeholder="Written by the GM">${esc(D.rep)}</textarea>`
            : `<p class="ft-rep-text">${D.rep ? esc(D.rep) : '<span class="mt-none">Nothing yet.</span>'}</p>`}
        </section>
      </div>

      <section class="ft-card">
        <h3>This term</h3>
        <div class="ft-plan">
          <label>What I'm working toward<textarea data-plan="toward" rows="2" ${own ? '' : 'readonly'}>${esc(D.plan.toward || '')}</textarea></label>
          <label>Where I'm spending time this week<textarea data-plan="sliding" rows="2" ${own ? '' : 'readonly'}>${esc(D.plan.sliding || '')}</textarea></label>
          <label class="wide">Deadlines<textarea data-plan="deadlines" rows="2" ${own ? '' : 'readonly'}>${esc(D.plan.deadlines || '')}</textarea></label>
        </div>
      </section>

      <section class="ft-card">
        <div class="ft-card-head"><h3>Semester</h3><small class="muted">${term ? `${term.weeks} weeks, ${term.weeks * 3} points${term.start_date ? ` · began ${weekStart(term, 1)}` : ''}` : ''}</small></div>
        <div class="ft-semester">${term ? Array.from({ length: term.weeks }, (_, i) => {
          const w = i + 1, n = spentByWeek.get(w) || 0;
          return `<div class="ft-wk ${w === term.current_week ? 'now' : ''} ${w < term.current_week ? 'past' : ''}" ${term.start_date ? `title="Week ${w} · from ${weekStart(term, w)}"` : ''}><b>${w}</b>
            <span>${[0, 1, 2].map(j => `<i class="${j < n ? 'on' : ''}"></i>`).join('')}</span></div>`;
        }).join('') : ''}</div>
      </section>

      ${past.length ? `<section class="ft-card"><h3>Earlier weeks</h3>${past.map(w => `
        <details class="ft-past"><summary>Week ${w.week} · ${esc(w.status)}</summary>
          ${(D.byWeek.get(w.id) || []).map(e => entryLine(e, D)).join('')}</details>`).join('')}</section>` : ''}

      <p class="ft-foot">Every entry needs a note on what your character did. Everyone starts each track at Rank 1.</p>
    </div>`;

  wirePlanner(D, uid);
  $('#ftEditWeek')?.addEventListener('click', async () => {
    draftWeek = Object.fromEntries((D.byWeek.get(thisWeek.id) || []).map(e => [e.track || e.connection_id, { points: e.points, note: e.note }]));
    const { error } = await supa.rpc('ft_withdraw', { p_week: thisWeek.id });
    if (error) return toast(sqlMsg(error), 'error');
    viewFreeTime(uid);
  });
  $$('[data-ftroll]', main).forEach(b => b.addEventListener('click', () => {
    const e = [...D.byWeek.values()].flat().find(x => x.id === b.dataset.ftroll);
    const t = TRACK[e.track];
    openRoller({
      me, kind: 'freetime', title: `${t.name} · free time roll`, options: t.traits,
      penalty: penaltyOf(D.progress[e.track]) ?? -3,
      rollFn: async (trait) => {
        const { data, error } = await supa.rpc('ft_roll', { p_entry: e.id, p_trait: trait });
        if (error) throw error; return data;
      },
      onDone: () => viewFreeTime(uid)
    });
  }));
  $$('[data-approve]', main).forEach(b => b.addEventListener('click', () => reviewWeek(b.dataset.approve, true, () => viewFreeTime(uid))));
  $$('[data-return]', main).forEach(b => b.addEventListener('click', () => reviewWeek(b.dataset.return, false, () => viewFreeTime(uid))));
  $$('[data-boxadj]', main).forEach(b => b.addEventListener('click', async () => {
    const [track, n] = b.dataset.boxadj.split(':');
    const val = Math.max(0, Math.min(18, (D.progress[track] || 0) + +n));
    const { error } = await supa.from('ft_progress').upsert({ user_id: uid, track, boxes: val });
    if (error) return toast(sqlMsg(error), 'error');
    viewFreeTime(uid);
  }));
  $$('[data-gate]', main).forEach(b => b.addEventListener('click', () => editGate(D.conns.find(c => c.id === b.dataset.gate), () => viewFreeTime(uid))));
  $('#ftRep')?.addEventListener('change', async (e) => {
    const { error } = await supa.from('ft_reputation').upsert({ user_id: uid, level: e.target.value.trim(), updated_at: new Date().toISOString() });
    if (error) return toast(/check constraint/i.test(error.message) ? 'Run sql/freetime-v2.sql in Supabase first.' : sqlMsg(error), 'error');
    toast('Reputation saved.', 'ok');
  });
  $('#ftGmPoints')?.addEventListener('click', () => openGmPoints(uid, D, () => viewFreeTime(uid)));
  $$('[data-connadj]', main).forEach(b => b.addEventListener('click', async () => {
    const [id, n] = b.dataset.connadj.split(':');
    const c = D.conns.find(x => x.id === id);
    const { error } = await supa.from('ft_connections').update({ boxes: Math.max(0, Math.min(5, c.boxes + +n)) }).eq('id', id);
    if (error) return toast(sqlMsg(error), 'error');
    viewFreeTime(uid);
  }));
  $('#ftAddConn')?.addEventListener('click', async () => {
    const name = prompt('Connection name (an NPC):');
    if (!name?.trim()) return;
    const about = prompt('How do you know them? (optional)') || '';
    const { error } = await supa.rpc('ft_add_connection', { p_name: name, p_about: about });
    if (error) return toast(sqlMsg(error), 'error');
    toast('Added. The GM will set the gate.', 'ok'); viewFreeTime(uid);
  });
  let planT;
  $$('[data-plan]', main).forEach(t => t.addEventListener('input', () => {
    if (!own || !term) return;
    clearTimeout(planT);
    planT = setTimeout(async () => {
      const row = { user_id: uid, term_id: term.id };
      $$('[data-plan]', main).forEach(x => { row[x.dataset.plan] = x.value.trim() || null; });
      const { error } = await supa.from('ft_plans').upsert(row);
      if (error) toast(sqlMsg(error), 'error');
    }, 600);
  }));
}

function plannerHtml(D, returned) {
  const draft = draftWeek || {};
  const row = (key, label, sub, color, opts) => {
    const cur = draft[key] || { points: 0, note: '' };
    return `
      <div class="ft-plan-row ${cur.points ? 'on' : ''}" style="--tc:${color}" data-key="${esc(key)}">
        <div class="ft-plan-name"><strong>${esc(label)}</strong><small>${sub}</small></div>
        <div class="ft-pts-pick">${[0, 1, 2, 3].map(n => {
          const why = opts.block?.(n);
          return `<button type="button" data-pts="${n}" class="${cur.points === n ? 'on' : ''}" ${why ? `disabled title="${esc(why)}"` : ''}>${n || '–'}</button>`;
        }).join('')}</div>
        <textarea class="ft-note" rows="2" placeholder="What did your character do?" ${cur.points ? '' : 'hidden'}>${esc(cur.note || '')}</textarea>
      </div>`;
  };
  const trackRows = TRACKS.map(t => {
    const b = D.progress[t.key] || 0, pen = penaltyOf(b), full = b >= capOf(D.progress, t.key);
    return row(t.key, t.name, full ? (b >= 18 ? 'Complete' : '🔒 Locked') : `Rank ${rankOf(b)} · stage ${pen === 0 ? '−0' : '−' + Math.abs(pen)} · ${t.traits.map(x => traitDie(D.sheet, x)).join('/')}`,
      t.color, { block: n => (n && full ? 'This track can\'t move right now.' : n === 2 && pen < -1 ? '2 points only works at −0 or −1.' : n === 3 && pen > -2 ? '3 points is for −2 and −3. Use 2 here.' : null) });
  }).join('');
  const connRows = D.conns.filter(c => c.gate_cleared && c.boxes < 5).map(c =>
    row(c.id, c.name, `Connection · ${c.boxes}/5 · 1 box per point`, '#6b7280', { block: n => (n > 5 - c.boxes ? 'Not enough boxes left.' : null) })).join('');
  return `
    <div class="ft-card ft-planner">
      <div class="ft-card-head"><h3>Week ${D.term.current_week} · plan your free time</h3>
        <span class="ft-left" id="ftLeft"></span></div>
      ${returned?.gm_note ? `<p class="ft-gmnote"><b>GM sent it back:</b> ${esc(returned.gm_note)}</p>` : ''}
      <p class="muted small">Up to 3 points, one entry per track. Unspent points don't carry over.</p>
      ${trackRows}
      ${connRows ? `<h4 class="ft-sub">Connections</h4>${connRows}` : ''}
      <div class="ft-plan-foot"><span class="muted small" id="ftWhy"></span><button class="mt-btn" id="ftSubmit" disabled>Submit to the GM</button></div>
    </div>`;
}

function wirePlanner(D, uid) {
  const card = $('.ft-planner', main);
  if (!card) return;
  draftWeek = draftWeek || {};
  const total = () => Object.values(draftWeek).reduce((a, x) => a + (x.points || 0), 0);
  const check = () => {
    const t = total();
    $('#ftLeft').innerHTML = `${[0, 1, 2].map(i => `<i class="${i < t ? 'on' : ''} ${t > 3 && i === 2 ? 'over' : ''}"></i>`).join('')} <b>${Math.max(0, 3 - t)}</b> left`;
    const missing = Object.entries(draftWeek).filter(([, x]) => x.points && (x.note || '').trim().length < 3);
    const why = !t ? 'Spend at least one point.' : t > 3 ? 'That\'s more than 3 points.' : missing.length ? 'Add a note to every entry.' : '';
    $('#ftWhy').textContent = why;
    $('#ftSubmit').disabled = !!why;
  };
  $$('.ft-plan-row', card).forEach(r => {
    const key = r.dataset.key;
    $$('[data-pts]', r).forEach(b => b.addEventListener('click', () => {
      const n = +b.dataset.pts;
      draftWeek[key] = { ...(draftWeek[key] || {}), points: n };
      $$('[data-pts]', r).forEach(x => x.classList.toggle('on', x === b));
      r.classList.toggle('on', !!n);
      const note = $('.ft-note', r); note.hidden = !n; if (n) note.focus();
      check();
    }));
    $('.ft-note', r).addEventListener('input', e => { draftWeek[key] = { ...(draftWeek[key] || { points: 0 }), note: e.target.value }; check(); });
  });
  check();
  $('#ftSubmit').addEventListener('click', async (e) => {
    const entries = Object.entries(draftWeek).filter(([, x]) => x.points).map(([k, x]) =>
      TRACK[k] ? { track: k, points: x.points, note: x.note.trim() } : { connection_id: k, points: x.points, note: x.note.trim() });
    e.currentTarget.disabled = true;
    const { error } = await supa.rpc('ft_submit', { p_entries: entries });
    if (error) { e.currentTarget.disabled = false; return toast(sqlMsg(error), 'error'); }
    draftWeek = null; playSound('sent'); toast('Sent to the GM.', 'ok');
    viewFreeTime(uid);
  });
}

async function reviewWeek(weekId, approve, after) {
  let note = null;
  if (!approve) {
    note = prompt('What should they change? (they\'ll see this)');
    if (note === null) return;
  }
  const { error } = await supa.rpc('ft_review', { p_week: weekId, p_approve: approve, p_note: note });
  if (error) return toast(sqlMsg(error), 'error');
  toast(approve ? 'Approved.' : 'Sent back.', 'ok');
  after?.();
}

async function editGate(c, after) {
  const gate = prompt(`Gate for ${c.name}: what do they need to do first?`, c.gate || '');
  if (gate === null) return;
  const cleared = confirm(`Has ${nameOf(c.user_id)} cleared it?\n\nOK = cleared (they can spend points)\nCancel = still locked`);
  const { error } = await supa.from('ft_connections').update({ gate: gate.trim() || null, gate_cleared: cleared }).eq('id', c.id);
  if (error) return toast(sqlMsg(error), 'error');
  after?.();
}

/* ------------------------------------------------------------------ */
/*  GM hub                                                            */
/* ------------------------------------------------------------------ */

async function viewGM() {
  main.classList.add('mt-wide');
  const { data: terms, error } = await supa.from('ft_terms').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const term = (terms || []).find(t => t.active);
  const [{ data: weeks }, { data: sheets }, { data: reps }, { data: conns }, { data: rolls }] = await Promise.all([
    term ? supa.from('ft_weeks').select('*').eq('term_id', term.id).in('status', ['submitted', 'approved']).order('created_at') : Promise.resolve({ data: [] }),
    supa.from('sw_sheets').select('user_id, bennies, wounds, updated_at'),
    supa.from('ft_reputation').select('*'),
    supa.from('ft_connections').select('*').eq('gate_cleared', false),
    supa.from('sw_rolls').select('*').order('created_at', { ascending: false }).limit(30)
  ]);
  const wIds = (weeks || []).map(w => w.id);
  const { data: entries } = wIds.length ? await supa.from('ft_entries').select('*').in('week_id', wIds) : { data: [] };
  const { data: comps } = await supa.from('ft_entries').select('*').eq('complication', true).order('created_at', { ascending: false }).limit(12);
  const { data: progRows } = await supa.from('ft_progress').select('*');
  const prog = new Map();
  (progRows || []).forEach(p => { if (!prog.has(p.user_id)) prog.set(p.user_id, {}); prog.get(p.user_id)[p.track] = p.boxes; });
  const sheetOf = new Map((sheets || []).map(s => [s.user_id, s]));
  const repOf = new Map((reps || []).map(r => [r.user_id, r.level]));
  const byWeek = new Map();
  (entries || []).forEach(e => { if (!byWeek.has(e.week_id)) byWeek.set(e.week_id, []); byWeek.get(e.week_id).push(e); });
  const submitted = (weeks || []).filter(w => w.status === 'submitted');
  const rolling = (weeks || []).filter(w => w.status === 'approved');
  const D0 = { conns: conns || [], latestRoll: new Map() };

  function gmRow(p) {
            const s = sheetOf.get(p.id);
            return `<tr data-cat="${esc(p.category_id || 'none')}">
              <td><a href="#profile/${esc(p.id)}" class="gm-who">${pic(p.id)}<span>${esc(nameOf(p.id))}${npcIds.has(p.id) ? '<span class="npc-tag">NPC</span>' : playerTag(p.id)}<small>@${esc(p.username)}</small></span></a></td>
              <td>${s ? `<span class="gm-ok">✓</span> ● ${s.bennies}${s.wounds ? ` · 🩸${s.wounds}` : ''}` : '<span class="muted">—</span>'}</td>
              <td><input type="text" class="gm-rep" data-rep="${esc(p.id)}" value="${esc(repOf.get(p.id) || '')}" placeholder="How they're seen" maxlength="200"></td>
              <td class="gm-acts"><button class="mt-btn" data-quick="${esc(p.id)}">⚡ Stats</button>
                <a class="mt-btn ghost" href="#transcript/${esc(p.id)}">Sheet</a><a class="mt-btn ghost" href="#freetime/${esc(p.id)}">Free time</a></td>
            </tr>`;
  }
  const gmBody = (() => {
            const all = players(), pl = all.filter(p => !npcIds.has(p.id)), np = all.filter(p => npcIds.has(p.id));
            const sect = (label, n) => n ? `<tr class="gm-sect"><th colspan="4">${label} <span>${n}</span></th></tr>` : '';
            return sect('Players', pl.length) + pl.map(gmRow).join('') + sect('NPCs', np.length) + np.map(gmRow).join('');
          });
  main.innerHTML = `
    <div class="gm-grid">
      <section class="ft-card gm-term">
        <div class="ft-card-head"><h3>Term</h3><button class="mt-btn ghost" id="gmNewTerm">Start a new term</button></div>
        ${term ? `
          <div class="gm-week"><button class="mt-btn ghost" id="gmPrev" ${term.current_week <= 1 ? 'disabled' : ''}>‹</button>
            <div><small>${esc(term.name)}</small><b>Week ${term.current_week}</b><small>of ${term.weeks}${term.start_date ? ` · from ${weekStart(term, term.current_week)}` : ''}</small></div>
            <button class="mt-btn" id="gmNext" ${term.current_week >= term.weeks ? 'disabled' : ''}>Next week ›</button></div>
          <label class="gm-start">Term began <input type="date" id="gmStart" min="1000-01-01" max="9999-12-31" value="${esc(term.start_date || '')}"></label>
          <p class="muted small">Next week gives everyone 3 new points. Unspent points are lost.</p>` : '<p>No term running.</p>'}
      </section>

      <section class="ft-card gm-queue">
        <h3>To review · ${submitted.length}</h3>
        ${submitted.map(w => {
          const p = prog.get(w.user_id) || {};
          return `
          <div class="gm-sub">
            <div class="gm-sub-head">${pic(w.user_id)}<strong>${esc(nameOf(w.user_id))}</strong><small>week ${w.week} · ${icStamp(w, { fmt: 'short' })}</small>
              <span class="mt-spacer"></span>
              <button class="mt-btn" data-approve="${esc(w.id)}">✓ Approve</button><button class="mt-btn ghost" data-return="${esc(w.id)}">Send back</button></div>
            ${(byWeek.get(w.id) || []).map(e => {
              const b = e.track ? (p[e.track] || 0) : null;
              return entryLine(e, { ...D0, conns: conns || [] }, { roll: false }).replace('</strong>',
                `</strong>${e.track ? `<small class="gm-stage">Rank ${rankOf(b)} · ${penaltyOf(b) === 0 ? '−0' : '−' + Math.abs(penaltyOf(b) ?? 3)}</small>` : ''}`);
            }).join('')}
          </div>`;
        }).join('') || '<p class="mt-none">Nothing to review.</p>'}
        ${rolling.length ? `<h4 class="ft-sub">Approved, waiting on rolls</h4>${rolling.map(w =>
          `<div class="gm-mini">${pic(w.user_id)} ${esc(nameOf(w.user_id))} · week ${w.week} · ${(byWeek.get(w.id) || []).filter(e => e.status === 'to_roll').map(e => TRACK[e.track]?.name).join(', ')}</div>`).join('')}` : ''}
      </section>

      <section class="ft-card">
        <h3>Complications</h3>
        ${(comps || []).map(e => `<div class="gm-mini bad">${pic(e.user_id)} <b>${esc(nameOf(e.user_id))}</b> · ${esc(TRACK[e.track]?.name || '')} — <span>${esc(e.note)}</span></div>`).join('')
          || '<p class="mt-none">None yet.</p>'}
      </section>

      <section class="ft-card">
        <h3>Connection gates</h3>
        ${(conns || []).map(c => `<div class="gm-mini">${pic(c.user_id)} <b>${esc(nameOf(c.user_id))}</b> → ${esc(c.name)}
          <small>${esc(c.gate || 'no gate set')}</small><button class="mt-link" data-gate="${esc(c.id)}">set</button></div>`).join('')
          || '<p class="mt-none">No locked connections.</p>'}
      </section>

      <section class="ft-card gm-players">
        <div class="ft-card-head"><h3>Characters</h3><button class="mt-btn ghost" id="gmAsk">🎲 Ask for a roll</button></div>
        ${filterBar(players(), catOf, 'mytime-gm', cats)}
        <table class="gm-table">
          <thead><tr><th>Character</th><th>Sheet</th><th>Reputation</th><th></th></tr></thead>
          <tbody>${gmBody()}</tbody>
        </table>
      </section>

      <section class="ft-card gm-log">
        <h3>Roll log</h3>
        ${(rolls || []).filter(r => !r.pending).map(r => `<div class="gm-roll">${rollCard(r, { who: nameOf(r.user_id) + ' · ' + ({ freetime: 'free time', message: 'chat', queree: 'Queree', flight: 'Flight', mytime: 'MyTime' }[r.context_kind] || 'roll'), compact: true, judge: !!r.request_id })}${icStamp(r, { fmt: 'short' })}</div>`).join('')
          || '<p class="mt-none">No rolls yet.</p>'}
      </section>
    </div>`;

  wireVerdicts(main, viewGM);
  wireFilter(main, 'mytime-gm', { items: '.gm-table tbody tr[data-cat]', onChange: () => {
    $$('.gm-table tbody tr.gm-sect', main).forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('gm-sect')) { if (!n.classList.contains('cat-out')) any = true; n = n.nextElementSibling; }
      h.classList.toggle('cat-out', !any);
    });
  } });
  $$('[data-approve]', main).forEach(b => b.addEventListener('click', () => reviewWeek(b.dataset.approve, true, viewGM)));
  $$('[data-return]', main).forEach(b => b.addEventListener('click', () => reviewWeek(b.dataset.return, false, viewGM)));
  $$('[data-gate]', main).forEach(b => b.addEventListener('click', () => editGate((conns || []).find(c => c.id === b.dataset.gate), viewGM)));
  $$('[data-rep]', main).forEach(s => s.addEventListener('change', async () => {
    const { error } = await supa.from('ft_reputation').upsert({ user_id: s.dataset.rep, level: s.value.trim(), updated_at: new Date().toISOString() });
    if (error) return toast(/check constraint/i.test(error.message) ? 'Run sql/freetime-v2.sql in Supabase first.' : sqlMsg(error), 'error');
    toast(`Saved ${nameOf(s.dataset.rep)}'s reputation.`, 'ok');
  }));
  $$('[data-quick]', main).forEach(b => b.addEventListener('click', async () => {
    const s = await getSheet(b.dataset.quick);
    openQuickEntry(b.dataset.quick, s || blankSheet(b.dataset.quick), !s);
  }));
  $('#gmAsk').addEventListener('click', () => openRequest({ kind: 'mytime', people: players().map(p => ({ id: p.id, username: nameOf(p.id) })), preselect: [] }));
  const setWeek = async (n) => {
    const { error } = await supa.from('ft_terms').update({ current_week: n }).eq('id', term.id);
    if (error) return toast(sqlMsg(error), 'error');
    viewGM();
  };
  $('#gmPrev')?.addEventListener('click', () => setWeek(term.current_week - 1));
  // Save when the GM leaves the box or presses Enter — not on every keystroke,
  // or typing the year "2160" saves 0002 after the first digit.
  const startBox = $('#gmStart');
  const saveStart = async () => {
    const v = startBox.value;
    if (v === (term.start_date || '')) return;
    if (v && +v.slice(0, 4) < 1000) return toast('Finish typing the year.', 'info');
    const { error } = await supa.from('ft_terms').update({ start_date: v || null }).eq('id', term.id);
    if (error) return toast(/start_date/.test(error.message) ? 'Run sql/freetime-v2.sql in Supabase first.' : sqlMsg(error), 'error');
    term.start_date = v || null;
    toast(v ? `Term start set to ${new Date(v + 'T12:00:00').toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}.` : 'Term start cleared.', 'ok');
    viewGM();
  };
  startBox?.addEventListener('blur', saveStart);
  startBox?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); startBox.blur(); } });
  $('#gmNext')?.addEventListener('click', () => {
    if (submitted.length && !confirm(`${submitted.length} plan${submitted.length === 1 ? ' is' : 's are'} still waiting for review. Move on anyway?`)) return;
    setWeek(term.current_week + 1);
  });
  $('#gmNewTerm').addEventListener('click', async () => {
    const name = prompt('Name the new term:', `Term ${(terms || []).length + 1}`);
    if (!name?.trim()) return;
    const weeksN = +(prompt('How many weeks?', '16') || 16);
    if (!confirm(`Start “${name}”? Track progress carries over and the week resets to 1.`)) return;
    if (term) await supa.from('ft_terms').update({ active: false }).eq('id', term.id);
    const { error } = await supa.from('ft_terms').insert({ name: name.trim(), weeks: Math.max(1, Math.min(52, weeksN || 16)) });
    if (error) return toast(sqlMsg(error), 'error');
    viewGM();
  });
}

/* ------------------------------------------------------------------ */
/*  checks the GM asked for (top strip), the 🎲 button, live updates  */
/* ------------------------------------------------------------------ */

async function paintChecks() {
  const box = $('#mtChecks');
  if (me.is_admin) { box.innerHTML = ''; return; }
  const { reqs, rolls } = await loadRequests('mytime');
  const open = reqs.filter(q => q.targets.includes(me.id) && !q.closed && !(rolls.get(q.id) || []).some(r => r.user_id === me.id));
  box.innerHTML = open.map(q => requestCard(q, { mine: [], canRoll: true })).join('');
  wireRequestButtons(box, { me, reqs, onDone: paintChecks });
}

$('#mtDice').addEventListener('click', () => openRoller({ me, kind: 'mytime' }));

let liveT;
supa.channel('mytime-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ft_weeks' }, () => { clearTimeout(liveT); liveT = setTimeout(maybeRefresh, 400); })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ft_entries' }, () => { clearTimeout(liveT); liveT = setTimeout(maybeRefresh, 400); })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'sw_requests' }, () => paintChecks())
  .subscribe();
function maybeRefresh() {
  // Don't yank the page out from under someone mid-typing or mid-roll.
  if (document.querySelector('.sw-host, #modalRoot .scrim')) return;
  if (document.activeElement?.matches('textarea, input')) return;
  const { view } = parseHash();
  if (view === 'freetime' || view === 'gm') route();
}

await loadPeople();
supa.from('notifications').update({ read_at: new Date().toISOString() })
  .eq('user_id', me.id).eq('app', 'mytime').is('read_at', null).then(() => {}, () => {});
paintChecks();
route();
