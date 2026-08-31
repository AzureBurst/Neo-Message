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

/* Does an event cover this day (inclusive of multi-day spans)? */
function covers(ev, dayStr) {
  const s = ev.start_date;
  const e = ev.end_date || ev.start_date;
  return dayStr >= s && dayStr <= e;
}

/* ------------------------------------------------------------------ */
/*  loading                                                           */
/* ------------------------------------------------------------------ */

async function loadMonth() {
  // Pull entries overlapping the visible month (with a little padding
  // for multi-day spans that start earlier).
  const from = ymd(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const to   = ymd(new Date(view.getFullYear(), view.getMonth() + 2, 0));

  const { data, error } = await supa.from('calendar_events')
    .select('*')
    .or(`and(start_date.lte.${to},start_date.gte.${from}),and(end_date.gte.${from},end_date.lte.${to})`)
    .order('start_time', { nullsFirst: true });

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
    const dayEvents = events.filter(ev => covers(ev, dstr));
    const chips = dayEvents.slice(0, 3).map(ev => `
      <span class="cal-chip ${ev.is_public ? 'gm' : ''} ${ev.kind === 'reminder' ? 'rem' : ''}">
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
  const dayEvents = events
    .filter(ev => covers(ev, selected))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  box.innerHTML = `
    <div class="cal-day-head">
      <h3>${prettyDate(selected)}</h3>
      <button class="btn btn-sm btn-primary" id="calDayAdd">Add</button>
    </div>
    ${dayEvents.length ? dayEvents.map(eventRow).join('')
      : '<div class="ig-empty muted">Nothing on this day.</div>'}`;

  $('#calDayAdd').addEventListener('click', () => openEditor(null, selected));

  $$('.cal-event', box).forEach(row => {
    const ev = events.find(e => e.id === row.dataset.ev);
    row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(ev));
  });
}

function eventRow(ev) {
  const mine = ev.owner_id === me.id;
  const canEdit = mine || me.is_admin;
  const span = ev.end_date && ev.end_date !== ev.start_date;
  const when = ev.start_time
    ? prettyTime(ev.start_time) + (ev.end_time ? ` – ${prettyTime(ev.end_time)}` : '')
    : 'All day';

  return `
    <div class="cal-event ${ev.is_public ? 'gm' : ''}" data-ev="${esc(ev.id)}">
      <div class="cal-event-main">
        <div class="cal-event-title">
          ${ev.kind === 'reminder' ? '🔔 ' : ''}${esc(ev.title)}
          ${ev.is_public ? '<span class="cal-tag">GM</span>' : ''}
        </div>
        <div class="cal-event-meta">
          ${when}${span ? ` · ${prettyDate(ev.start_date)} → ${prettyDate(ev.end_date)}` : ''}
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

function openEditor(ev, defaultDay) {
  const editing = !!ev;
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
        <label for="cNotes">Notes</label>
        <textarea id="cNotes" rows="2" maxlength="1000">${esc(e.notes || '')}</textarea>
      </div>

      ${me.is_admin ? `
      <label class="check">
        <input type="checkbox" id="cPublic" ${e.is_public ? 'checked' : ''}>
        <span>GM event — everyone can see this</span>
      </label>` : ''}

      <div id="cMsg"></div>`,
    footer: `
      ${editing ? '<button class="btn btn-danger" id="cDelete">Delete</button>' : ''}
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

  $('#cSave', root).addEventListener('click', async (ev2) => {
    const title = $('#cTitle', root).value.trim();
    const start = $('#cStart', root).value;
    if (!title)  return msg('Give it a title.');
    if (!start)  return msg('Pick a date.');

    const multiOn = $('#cMulti', root).checked;
    const timed   = $('#cTimed', root).checked;
    const end     = multiOn ? $('#cEnd', root).value || null : null;
    if (end && end < start) return msg('The end date is before the start date.');

    const row = {
      owner_id: me.id,
      kind,
      title,
      notes: $('#cNotes', root).value.trim() || null,
      start_date: start,
      end_date: end,
      start_time: timed ? ($('#cStartT', root).value || null) : null,
      end_time:   timed ? ($('#cEndT', root).value || null) : null,
      is_public: me.is_admin ? $('#cPublic', root)?.checked || false : false
    };

    ev2.target.disabled = true;
    const q = editing
      ? supa.from('calendar_events').update(row).eq('id', e.id)
      : supa.from('calendar_events').insert(row);
    const { error } = await q;
    if (error) { msg(error.message); ev2.target.disabled = false; return; }

    close();
    toast(editing ? 'Entry saved.' : 'Entry added.', 'ok');
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
