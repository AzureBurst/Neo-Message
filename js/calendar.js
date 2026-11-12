// =====================================================================
//  CALENDAR
//
//  A month view keyed to the table's story date. "Today" is whatever the
//  GM's story clock says, not the real date. Players keep personal
//  entries only they can see; admins post GM events everyone sees, shown
//  in the network's amber so they stand apart from personal blue.
//
//  Visibility is the database's job: the read policy returns your own
//  entries plus public GM events, so the app can query plainly and trust
//  what comes back.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource,
  startPresence, esc, toast, $, $$
} from './supa.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { loadClock, storyNow, onClockChange } from './clock.js';
import { loadDirectory, loadCategoryList, sortPeople } from './directory.js';
import { parseMeetings } from './flight-grades.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();

/* Mark that we went into an app, so returning to the home screen does
   not re-trigger the lock. Cleared by the home screen when consumed. */
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'calendar'); } catch {}

const main = $('#calMain');

/* The month currently shown, and the day currently selected. Both start
   on the story date. */
let view = startOfMonth(storyNow());
let selected = ymd(storyNow());
let events = [];

/* GM only: whose calendar is open. me.id = the GM's own, 'all' = every
   calendar at once, or a player's / NPC's id (sql/calendar-assign.sql). */
let whose = me.id;
let people = [];          // [{ id, username, is_npc, category_id }]
const nameOf = id => id === me.id ? 'You' : (people.find(p => p.id === id)?.username || 'Someone');
let classes = [];         // the open calendar's Flight classes, as weekly entries
const shown = () => (!me.is_admin || whose === 'all' ? events
  : events.filter(ev => ev.is_public || ev.owner_id === whose)).concat(classes);

/* ------------------------------------------------------------------ */
/*  date helpers — all work in local date parts, no timezone drift     */
/* ------------------------------------------------------------------ */

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function prettyDate(s) {
  const d = parseYmd(s);
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function prettyTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/* Does an event cover this day (inclusive of multi-day spans and repeats)? */
function covers(ev, dayStr) {
  if (ev.repeat) return occursOn(ev, dayStr);
  const s = ev.start_date;
  const e = ev.end_date || ev.start_date;
  return dayStr >= s && dayStr <= e;
}

const utcDay = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/* Repeats (sql/calendar-repeat.sql): every day / week / 2 weeks / month,
   from the start date until repeat_until, minus any skipped days. */
function occursOn(ev, d) {
  if (d < ev.start_date || (ev.repeat_until && d > ev.repeat_until)) return false;
  if ((ev.skip_dates || []).includes(d)) return false;
  const day = parseYmd(d), start = parseYmd(ev.start_date);
  if (ev.repeat === 'daily') return true;
  if (ev.repeat === 'monthly') return day.getDate() === start.getDate();
  const days = ev.repeat_days?.length ? ev.repeat_days : [start.getDay()];
  if (!days.includes(day.getDay())) return false;
  if (ev.repeat !== 'biweekly') return true;
  // Count whole weeks between the two Sundays.
  const weeks = Math.round(((utcDay(d) - day.getDay() * 864e5) - (utcDay(ev.start_date) - start.getDay() * 864e5)) / (7 * 864e5));
  return weeks % 2 === 0;
}

const REPEAT_LABEL = { daily: 'Every day', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' };
function repeatText(ev) {
  if (!ev.repeat) return '';
  let t = REPEAT_LABEL[ev.repeat] || 'Repeats';
  if ((ev.repeat === 'weekly' || ev.repeat === 'biweekly') && ev.repeat_days?.length > 1)
    t += ' on ' + [...ev.repeat_days].sort().map(i => DOW[i]).join(', ');
  if (ev.repeat_until) t += ` until ${prettyDate(ev.repeat_until).replace(/^\w+, /, '')}`;
  return t;
}

/* ------------------------------------------------------------------ */
/*  Flight classes: every course the person is enrolled in shows up    */
/*  on its meeting days for the length of the active term.            */
/* ------------------------------------------------------------------ */

const classCache = new Map();
async function classesFor(uid) {
  if (!uid || uid === 'all') return [];
  if (classCache.has(uid)) return classCache.get(uid);
  let list = [];
  try {
    const [enr, term] = await Promise.all([
      supa.from('flight_enrollments').select('course_id').eq('user_id', uid),
      supa.from('ft_terms').select('start_date, weeks').eq('active', true).order('created_at', { ascending: false }).limit(1)
    ]);
    const t = term.data?.[0];
    const ids = (enr.data || []).map(e => e.course_id);
    if (!enr.error && ids.length && t?.start_date) {
      const { data: crs } = await supa.from('flight_courses')
        .select('id, code, title, schedule, room, professor_name, color').in('id', ids);
      const s = parseYmd(t.start_date);
      const until = ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + (t.weeks || 16) * 7 - 1));
      const hm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      list = (crs || []).flatMap(c => parseMeetings(c.schedule).map(m => ({
        id: `class-${c.id}-${m.day}-${m.start}`, virtual: true, kind: 'class',
        title: c.code, course: c, repeat: 'weekly', repeat_days: [m.day % 7],
        start_date: t.start_date, repeat_until: until, start_time: hm(m.start), end_time: hm(m.end)
      })));
    }
  } catch { list = []; }
  classCache.set(uid, list);
  return list;
}

/* ------------------------------------------------------------------ */
/*  loading                                                           */
/* ------------------------------------------------------------------ */

async function loadMonth() {
  // Pull entries overlapping the visible month (with a little padding
  // for multi-day spans that start earlier).
  const from = ymd(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const to   = ymd(new Date(view.getFullYear(), view.getMonth() + 2, 0));

  const query = (withRepeats) => supa.from('calendar_events')
    .select('*')
    .or(`and(start_date.lte.${to},start_date.gte.${from}),and(start_date.lte.${to},end_date.gte.${from})` +
        (withRepeats ? `,and(repeat.not.is.null,start_date.lte.${to})` : ''))
    .order('start_time', { nullsFirst: true });
  let { data, error } = await query(true);
  // Before sql/calendar-repeat.sql is run there's no repeat column.
  if (error && /repeat/i.test(error.message)) ({ data, error } = await query(false));

  if (error) { toast(error.message, 'error'); events = []; }
  else events = data || [];
  render();
}

/* ------------------------------------------------------------------ */
/*  rendering                                                         */
/* ------------------------------------------------------------------ */

function render() {
  $('#calMonth').textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;

  const first = startOfMonth(view);
  const lead = first.getDay();                  // blank cells before day 1
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const todayStr = ymd(storyNow());

  const cells = [];
  // Six rows of seven keeps the grid height steady month to month.
  for (let i = 0; i < 42; i++) {
    const dayNum = i - lead + 1;
    if (dayNum < 1 || dayNum > daysInMonth) { cells.push('<div class="cal-cell empty"></div>'); continue; }

    const dstr = ymd(new Date(view.getFullYear(), view.getMonth(), dayNum));
    const dayEvents = shown().filter(ev => covers(ev, dstr));
    const chips = dayEvents.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).slice(0, 3).map(ev => `
      <span class="cal-chip ${ev.is_public ? 'gm' : ''} ${ev.assigned_by ? 'asg' : ''} ${ev.kind === 'reminder' ? 'rem' : ''} ${ev.virtual ? 'cls' : ''}"
            ${ev.virtual ? `style="--cc:${esc(ev.course.color || '#2F6BFF')}"` : ''}>
        ${ev.kind === 'reminder' ? '🔔 ' : ''}${esc(ev.title)}
      </span>`).join('');
    const more = dayEvents.length > 3 ? `<span class="cal-more">+${dayEvents.length - 3}</span>` : '';

    cells.push(`
      <button class="cal-cell ${dstr === todayStr ? 'today' : ''} ${dstr === selected ? 'sel' : ''}"
              data-day="${dstr}">
        <span class="cal-num">${dayNum}</span>
        <span class="cal-chips">${chips}${more}</span>
      </button>`);
  }

  main.innerHTML = `
    <div class="cal-grid-head">${DOW.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="cal-day" id="calDay"></div>`;

  $$('.cal-cell[data-day]', main).forEach(c =>
    c.addEventListener('click', () => { selected = c.dataset.day; render(); }));

  renderDay();
}

function renderDay() {
  const box = $('#calDay');
  const dayEvents = shown()
    .filter(ev => covers(ev, selected))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  box.innerHTML = `
    <div class="cal-day-head">
      <h3>${prettyDate(selected)}</h3>
      <button class="btn btn-sm btn-primary" id="calDayAdd">${me.is_admin && whose !== me.id && whose !== 'all'
        ? `Add to ${esc(nameOf(whose))}` : 'Add'}</button>
    </div>
    ${dayEvents.length ? dayEvents.map(eventRow).join('')
      : '<div class="ig-empty muted">Nothing on this day.</div>'}`;

  $('#calDayAdd').addEventListener('click', () => openEditor(null, selected));

  $$('.cal-event', box).forEach(row => {
    const ev = events.find(e => e.id === row.dataset.ev);
    row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(ev));
  });
}

function classRow(ev) {
  const c = ev.course;
  return `
    <div class="cal-event cls" style="--cc:${esc(c.color || '#2F6BFF')}">
      <div class="cal-event-main">
        <div class="cal-event-title">${esc(c.code)} · ${esc(c.title)} <span class="cal-tag cal-tag-cls">Class</span></div>
        <div class="cal-event-meta">${prettyTime(ev.start_time)} – ${prettyTime(ev.end_time)}${c.room ? ` · ${esc(c.room)}` : ''}${c.professor_name ? ` · ${esc(c.professor_name)}` : ''}</div>
      </div>
      <a class="icon-btn" href="flight.html?course=${esc(c.id)}" title="Open in Flight">↗</a>
    </div>`;
}

function eventRow(ev) {
  if (ev.virtual) return classRow(ev);
  const mine = ev.owner_id === me.id;
  const canEdit = me.is_admin || (mine && !ev.assigned_by);
  const owner = me.is_admin && !ev.is_public && !mine && (whose === 'all' || ev.owner_id !== whose)
    ? `<span class="cal-tag cal-tag-who">${esc(nameOf(ev.owner_id))}</span>` : '';
  const span = ev.end_date && ev.end_date !== ev.start_date;
  const when = ev.start_time
    ? prettyTime(ev.start_time) + (ev.end_time ? ` – ${prettyTime(ev.end_time)}` : '')
    : 'All day';

  return `
    <div class="cal-event ${ev.is_public ? 'gm' : ''} ${ev.assigned_by ? 'asg' : ''}" data-ev="${esc(ev.id)}">
      <div class="cal-event-main">
        <div class="cal-event-title">
          ${ev.kind === 'reminder' ? '🔔 ' : ''}${esc(ev.title)}
          ${ev.is_public ? '<span class="cal-tag">GM</span>' : ''}
          ${ev.assigned_by && !ev.is_public ? `<span class="cal-tag cal-tag-asg">${me.is_admin ? 'Assigned' : 'From GM'}</span>` : ''}
          ${owner}
        </div>
        <div class="cal-event-meta">
          ${when}${span ? ` · ${prettyDate(ev.start_date)} → ${prettyDate(ev.end_date)}` : ''}${ev.repeat ? ` · <span class="cal-rep">↻ ${esc(repeatText(ev))}</span>` : ''}
        </div>
        ${ev.notes ? `<div class="cal-event-notes">${esc(ev.notes)}</div>` : ''}
      </div>
      ${canEdit ? '<button class="icon-btn" data-edit title="Edit">✎</button>' : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  add / edit                                                        */
/* ------------------------------------------------------------------ */

function sheet({ title, body, footer }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => {
    if (e.target.classList.contains('scrim')) close();
  });
  return { root, close };
}

function pickGroup(label, rows, preset) {
  if (!rows.length) return '';
  return `<div class="cal-pick-head">${label}</div>` + rows.map(p => `
    <label class="cal-pick-row" data-name="${esc(p.username.toLowerCase())}" ${p.is_npc ? '' : 'data-player'}>
      <input type="checkbox" value="${esc(p.id)}" ${preset.has(p.id) ? 'checked' : ''}><span>${esc(p.username)}</span>
    </label>`).join('');
}

function openEditor(ev, defaultDay) {
  const editing = !!ev;
  // The GM adding while a player's calendar is open: it goes on theirs.
  const preset = new Set([whose === 'all' ? me.id : whose]);
  const e = ev || {
    kind: 'event', title: '', notes: '',
    start_date: defaultDay || selected, end_date: '',
    start_time: '', end_time: '', is_public: false
  };
  const multi = !!(e.end_date && e.end_date !== e.start_date);

  const { root, close } = sheet({
    title: editing ? 'Edit entry' : 'New entry',
    body: `
      <div class="field">
        <label for="cTitle">Title</label>
        <input id="cTitle" maxlength="120" value="${esc(e.title)}" placeholder="What is it?">
      </div>

      <div class="seg" id="cKind">
        <button type="button" data-kind="event"    class="${e.kind !== 'reminder' ? 'on' : ''}">Event</button>
        <button type="button" data-kind="reminder" class="${e.kind === 'reminder' ? 'on' : ''}">🔔 Reminder</button>
      </div>

      <div class="field">
        <label for="cStart">Date</label>
        <input type="date" id="cStart" class="mono" value="${esc(e.start_date)}">
      </div>

      <label class="check">
        <input type="checkbox" id="cMulti" ${multi ? 'checked' : ''}>
        <span>Spans more than one day</span>
      </label>
      <div class="field" id="cEndWrap" ${multi ? '' : 'hidden'}>
        <label for="cEnd">End date</label>
        <input type="date" id="cEnd" class="mono" value="${esc(e.end_date || '')}">
      </div>

      <label class="check">
        <input type="checkbox" id="cTimed" ${e.start_time ? 'checked' : ''}>
        <span>Set a time</span>
      </label>
      <div class="cal-times" id="cTimeWrap" ${e.start_time ? '' : 'hidden'}>
        <div class="field"><label for="cStartT">From</label>
          <input type="time" id="cStartT" class="mono" value="${esc(e.start_time || '')}"></div>
        <div class="field"><label for="cEndT">To</label>
          <input type="time" id="cEndT" class="mono" value="${esc(e.end_time || '')}"></div>
      </div>

      <div class="field">
        <label for="cRepeat">Repeats</label>
        <select id="cRepeat">
          <option value="">Doesn't repeat</option>
          ${Object.entries(REPEAT_LABEL).map(([k, l]) => `<option value="${k}" ${e.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div id="cRepWrap" ${e.repeat ? '' : 'hidden'}>
        <div class="cal-dows" id="cDows" ${e.repeat === 'weekly' || e.repeat === 'biweekly' ? '' : 'hidden'}>
          ${DOW.map((d, i) => `<button type="button" data-dow="${i}" class="${(e.repeat_days?.length ? e.repeat_days : [parseYmd(e.start_date).getDay()]).includes(i) ? 'on' : ''}">${d.slice(0, 2)}</button>`).join('')}
        </div>
        <div class="field"><label for="cUntil">Until <span class="muted">(leave empty to keep going)</span></label>
          <input type="date" id="cUntil" class="mono" value="${esc(e.repeat_until || '')}"></div>
      </div>

      <div class="field">
        <label for="cNotes">Notes</label>
        <textarea id="cNotes" rows="2" maxlength="1000">${esc(e.notes || '')}</textarea>
      </div>

      ${me.is_admin ? `
      <label class="check">
        <input type="checkbox" id="cPublic" ${e.is_public ? 'checked' : ''}>
        <span>GM event — everyone can see this</span>
      </label>
      ${editing ? (e.is_public ? '' : `<div class="muted small cal-on">On ${esc(nameOf(e.owner_id))}'s calendar</div>`) : `
      <div class="field cal-pick" id="cPickWrap" ${e.is_public ? 'hidden' : ''}>
        <label>Put it on <span class="muted" id="cPickCount"></span></label>
        <div class="cal-pick-tools">
          <input type="search" id="cPickFind" placeholder="Find someone…">
          <button type="button" class="btn btn-ghost btn-sm" data-pick="players">All players</button>
          <button type="button" class="btn btn-ghost btn-sm" data-pick="none">Clear</button>
        </div>
        <div class="cal-pick-list" id="cPickList">
          <label class="cal-pick-row"><input type="checkbox" value="${esc(me.id)}" ${preset.has(me.id) ? 'checked' : ''}><span>My own calendar</span></label>
          ${pickGroup('Players', people.filter(p => !p.is_npc), preset)}
          ${pickGroup('NPCs', people.filter(p => p.is_npc), preset)}
        </div>
      </div>`}` : ''}

      <div id="cMsg"></div>`,
    footer: `
      ${editing ? `<button class="btn btn-danger" id="cDelete">${e.repeat ? 'Delete all' : 'Delete'}</button>` : ''}
      ${editing && e.repeat && covers(e, selected) ? `<button class="btn btn-ghost" id="cSkip">Skip ${esc(prettyDate(selected).replace(/, \d+$/, ''))}</button>` : ''}
      <button class="btn btn-primary" id="cSave">${editing ? 'Save' : 'Add'}</button>`
  });

  let kind = e.kind || 'event';
  $$('#cKind [data-kind]', root).forEach(b => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    $$('#cKind [data-kind]', root).forEach(x => x.classList.toggle('on', x === b));
  }));

  $('#cMulti', root).addEventListener('change', e2 =>
    $('#cEndWrap', root).hidden = !e2.target.checked);
  $('#cTimed', root).addEventListener('change', e2 =>
    $('#cTimeWrap', root).hidden = !e2.target.checked);

  // Repeats.
  const syncRepeat = () => {
    const r = $('#cRepeat', root).value;
    $('#cRepWrap', root).hidden = !r;
    $('#cDows', root).hidden = !(r === 'weekly' || r === 'biweekly');
    // A repeating entry is one day long each time.
    $('#cMulti', root).closest('.check').hidden = !!r;
    if (r) { $('#cMulti', root).checked = false; $('#cEndWrap', root).hidden = true; }
  };
  $('#cRepeat', root).addEventListener('change', syncRepeat);
  $$('#cDows [data-dow]', root).forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
  syncRepeat();

  $('#cSkip', root)?.addEventListener('click', async () => {
    const { error } = await supa.from('calendar_events')
      .update({ skip_dates: [...new Set([...(e.skip_dates || []), selected])] }).eq('id', e.id);
    if (error) return msg(error.message);
    close(); toast(`Skipped ${prettyDate(selected)}.`, 'ok'); await loadMonth();
  });

  // GM: who it goes on.
  const picked = () => $$('#cPickList input:checked', root).map(i => i.value);
  const count = () => { const n = picked().length; if ($('#cPickCount', root)) $('#cPickCount', root).textContent = n > 1 ? `(${n} calendars)` : ''; };
  $('#cPublic', root)?.addEventListener('change', e2 => { if ($('#cPickWrap', root)) $('#cPickWrap', root).hidden = e2.target.checked; });
  $('#cPickList', root)?.addEventListener('change', count);
  $('#cPickFind', root)?.addEventListener('input', e2 => {
    const q = e2.target.value.trim().toLowerCase();
    $$('#cPickList [data-name]', root).forEach(r => r.hidden = !!q && !r.dataset.name.includes(q));
  });
  $$('[data-pick]', root).forEach(b => b.addEventListener('click', () => {
    $$('#cPickList input', root).forEach(i => {
      const row = i.closest('.cal-pick-row');
      i.checked = b.dataset.pick === 'players' ? row.hasAttribute('data-player') : false;
    });
    count();
  }));
  count();

  $('#cSave', root).addEventListener('click', async (ev2) => {
    const title = $('#cTitle', root).value.trim();
    const start = $('#cStart', root).value;
    if (!title)  return msg('Give it a title.');
    if (!start)  return msg('Pick a date.');

    const multiOn = $('#cMulti', root).checked;
    const timed   = $('#cTimed', root).checked;
    const end     = multiOn ? $('#cEnd', root).value || null : null;
    if (end && end < start) return msg('The end date is before the start date.');
    const repeat = $('#cRepeat', root).value || null;
    const until = repeat ? ($('#cUntil', root).value || null) : null;
    if (until && until < start) return msg('"Until" is before the start date.');
    const dows = $$('#cDows [data-dow].on', root).map(b => Number(b.dataset.dow));
    if ((repeat === 'weekly' || repeat === 'biweekly') && !dows.length) return msg('Pick at least one day of the week.');

    const isPublic = me.is_admin ? $('#cPublic', root)?.checked || false : false;
    const targets = editing ? [e.owner_id]
      : (me.is_admin && !isPublic ? picked() : [me.id]);
    if (!targets.length) return msg('Pick whose calendar it goes on.');

    const row = {
      owner_id: editing ? e.owner_id : me.id,
      kind,
      title,
      notes: $('#cNotes', root).value.trim() || null,
      start_date: start,
      end_date: end,
      start_time: timed ? ($('#cStartT', root).value || null) : null,
      end_time:   timed ? ($('#cEndT', root).value || null) : null,
      is_public: isPublic
    };
    // Only send the repeat columns when they're used, so the calendar keeps
    // working before sql/calendar-repeat.sql is run.
    if (repeat || e.repeat) Object.assign(row, {
      repeat, repeat_until: until,
      repeat_days: repeat === 'weekly' || repeat === 'biweekly' ? dows : null,
      end_date: null
    });
    // Entries the GM puts on someone else's calendar are marked as from the GM.
    const rows = isPublic || editing ? [row]
      : targets.map(id => id === me.id ? row
        : { ...row, owner_id: id, assigned_by: me.id });

    ev2.target.disabled = true;
    const q = editing
      ? supa.from('calendar_events').update(row).eq('id', e.id)
      : supa.from('calendar_events').insert(rows);
    const { error } = await q;
    if (error) {
      ev2.target.disabled = false;
      return msg(/assigned_by/.test(error.message) ? 'Run sql/calendar-assign.sql in Supabase first.'
        : /repeat/.test(error.message) ? 'Run sql/calendar-repeat.sql in Supabase first.' : error.message);
    }

    close();
    toast(editing ? 'Entry saved.'
      : rows.length > 1 ? `Added to ${rows.length} calendars.`
      : rows[0].owner_id !== me.id ? `Added to ${nameOf(rows[0].owner_id)}'s calendar.` : 'Entry added.', 'ok');
    selected = start;
    await loadMonth();
  });

  $('#cDelete', root)?.addEventListener('click', async () => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supa.from('calendar_events').delete().eq('id', e.id);
    if (error) return toast(error.message, 'error');
    close();
    toast('Entry deleted.', 'ok');
    await loadMonth();
  });

  function msg(t) { $('#cMsg', root).innerHTML = `<div class="notice notice-error">${esc(t)}</div>`; }
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

/* GM: pick whose calendar to look at. */
async function mountWhose() {
  if (!me.is_admin) return;
  const [dir] = await Promise.all([loadDirectory(), loadCategoryList()]);
  people = sortPeople(dir,
    { catOf: p => p.category_id, isNpc: p => !!p.is_npc, nameOf: p => p.username });
  const bar = document.createElement('div');
  bar.className = 'cal-whose';
  bar.innerHTML = `
    <label for="calWhose">Calendar</label>
    <select id="calWhose">
      <option value="${esc(me.id)}">Mine</option>
      <option value="all">Everyone's</option>
      ${people.some(p => !p.is_npc) ? `<optgroup label="Players">${people.filter(p => !p.is_npc).map(p => `<option value="${esc(p.id)}">${esc(p.username)}</option>`).join('')}</optgroup>` : ''}
      ${people.some(p => p.is_npc) ? `<optgroup label="NPCs">${people.filter(p => p.is_npc).map(p => `<option value="${esc(p.id)}">${esc(p.username)}</option>`).join('')}</optgroup>` : ''}
    </select>`;
  main.before(bar);
  const sel = $('#calWhose');
  const want = new URLSearchParams(location.search).get('who');
  if (want && [...sel.options].some(o => o.value === want)) { sel.value = want; whose = want; }
  sel.addEventListener('change', async () => { whose = sel.value; classes = await classesFor(whose); render(); });
}
await mountWhose();
classes = await classesFor(me.is_admin ? whose : me.id);

$('#calPrev').addEventListener('click', () => { view = addMonths(view, -1); loadMonth(); });
$('#calNext').addEventListener('click', () => { view = addMonths(view,  1); loadMonth(); });
$('#calToday').addEventListener('click', () => {
  view = startOfMonth(storyNow());
  selected = ymd(storyNow());
  loadMonth();
});
$('#calAdd').addEventListener('click', () => openEditor(null, selected));

// A GM event lands live; the story clock moving also shifts "today".
supa.channel('cal-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' },
      () => loadMonth())
  .subscribe();

onClockChange(() => render());

// A notification deep link opens the calendar on that event's date.
const wantEvent = new URLSearchParams(location.search).get('event');
if (wantEvent) {
  supa.from('calendar_events').select('start_date').eq('id', wantEvent).maybeSingle()
    .then(({ data }) => {
      if (data?.start_date) {
        view = startOfMonth(parseYmd(data.start_date));
        selected = data.start_date;
      }
      clearNotificationsFor(wantEvent);
      loadMonth();
    });
} else {
  loadMonth();
}
