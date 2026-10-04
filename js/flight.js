// =====================================================================
//  FLIGHT PORTAL
//
//  A faux student portal. Students see their courses, grades, what is
//  due (measured against the story clock), announcements and their own
//  record, and can email a professor through Neomail. The GM builds all
//  of it from the Admin tab: courses, rosters, assignments, a gradebook,
//  announcements and student records.
//
//  The database decides visibility — a student's queries only ever
//  return courses they are enrolled in and their own scores.
// =====================================================================

import {
  supa, requireProfile, ungate, mountCarrier, setClockSource,
  startPresence, esc, toast, fullStamp, $, $$
} from './supa.js';
import { loadClock, storyNow, onClockChange } from './clock.js';
import { mountShade, clearNotificationsFor } from './shade.js';
import { playSound } from './sfx.js';
import { courseGrade, letterFor, gpa, dueLabel } from './flight-grades.js';

const me = await requireProfile();
if (!me) throw new Error('redirecting');

await loadClock();
setClockSource(storyNow);
ungate();
mountCarrier($('#carrier'));
startPresence();
mountShade();
try { sessionStorage.setItem('neo.deep', '1'); sessionStorage.setItem('neo.lastApp', 'flight'); } catch {}

if (me.is_admin) $('.fl-admin-tab').hidden = false;

const main = $('#flMain');
let current = { name: 'dash', arg: null };

const COLORS = ['#E8774C', '#16B8C4', '#8B5CF6', '#2F6BFF', '#2FBF6B', '#F0484F', '#E8B04C', '#7C8794'];
const colorOf = (c) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : COLORS[0];
const money = (n) => (Number(n) || 0).toLocaleString([], { style: 'currency', currency: 'USD' });
const pctText = (p) => p == null ? '—' : `${Math.round(p * 10) / 10}%`;

/* A stable fake student ID when the GM has not set one. */
function defaultStudentId(id) {
  return String(parseInt(id.replace(/-/g, '').slice(0, 8), 16) % 10000000).padStart(7, '0');
}

/* ------------------------------------------------------------------ */
/*  data                                                              */
/* ------------------------------------------------------------------ */

let D = null;   // the signed-in student's data

async function loadStudent() {
  const [rec, enr, grd, prog] = await Promise.all([
    supa.from('flight_students').select('*').eq('user_id', me.id).maybeSingle(),
    supa.from('flight_enrollments').select('*').eq('user_id', me.id),
    supa.from('flight_grades').select('*').eq('user_id', me.id),
    supa.from('flight_progress').select('*').eq('user_id', me.id)
  ]);
  if (enr.error) throw new Error(/does not exist/i.test(enr.error.message)
    ? 'The portal is not set up yet — run sql/flight.sql in Supabase.' : enr.error.message);

  const ids = (enr.data || []).map(e => e.course_id);
  const [crs, asg, ann] = await Promise.all([
    ids.length ? supa.from('flight_courses').select('*').in('id', ids).order('code')
               : Promise.resolve({ data: [] }),
    ids.length ? supa.from('flight_assignments').select('*').in('course_id', ids).order('due_at')
               : Promise.resolve({ data: [] }),
    supa.from('flight_announcements').select('*')
      .order('created_at', { ascending: false }).limit(40)
  ]);

  const grades = new Map((grd.data || []).map(g => [g.assignment_id, g]));
  const done = new Set((prog.data || []).filter(p => p.done).map(p => p.assignment_id));
  const enrollments = new Map((enr.data || []).map(e => [e.course_id, e]));
  const courses = crs.data || [];
  const assignments = asg.data || [];

  // Per-course grade, computed once.
  for (const c of courses) {
    const list = assignments.filter(a => a.course_id === c.id);
    c._grade = courseGrade(enrollments.get(c.id), list, grades);
  }

  const record = rec.data || {};
  const computedGpa = gpa(courses.map(c => ({ credits: c.credits, letter: c._grade.letter })));

  D = {
    record, courses, assignments, grades, done, enrollments,
    announcements: ann.data || [],
    gpa: record.gpa_override != null ? Number(record.gpa_override) : computedGpa,
    courseById: new Map(courses.map(c => [c.id, c]))
  };
}

/* An assignment counts as finished once it is ticked off or scored. */
const isFinished = (a) => D.done.has(a.id) || D.grades.get(a.id)?.score != null;

/* ------------------------------------------------------------------ */
/*  router                                                            */
/* ------------------------------------------------------------------ */

async function go(name, arg = null) {
  current = { name, arg };
  const tab = name.startsWith('admin') ? 'admin' : name === 'course' ? 'courses' : name;
  $$('.fl-tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === tab));
  main.innerHTML = '<div class="ig-loading">Loading…</div>';
  window.scrollTo(0, 0);
  try {
    if (name.startsWith('admin')) {
      if (!me.is_admin) return go('dash');
      if (name === 'admin') await viewAdmin();
      else if (name === 'adminCourse') await viewAdminCourse(arg.id, arg.tab);
    } else {
      await loadStudent();
      if (name === 'dash') viewDash();
      else if (name === 'courses') viewCourses();
      else if (name === 'course') viewCourse(arg);
      else if (name === 'tasks') viewTasks(arg || 'upcoming');
      else if (name === 'account') viewAccount();
    }
  } catch (err) {
    main.innerHTML = `<div class="ig-empty">${esc(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ */
/*  student views                                                     */
/* ------------------------------------------------------------------ */

function idCard() {
  const r = D.record;
  return `
    <div class="fl-idcard">
      <img src="assets/apps/flight.png" alt="" class="fl-idcard-mark">
      <div class="fl-idcard-photo">${me.avatar_url
        ? `<img src="${esc(me.avatar_url)}" alt="">` : esc(me.username.slice(0, 2).toUpperCase())}</div>
      <div class="fl-idcard-text">
        <span class="fl-idcard-school">Justice University</span>
        <strong>${esc(me.username)}</strong>
        <span>${esc([r.major, r.year].filter(Boolean).join(' · ') || 'Undeclared')}</span>
        <span class="mono">ID ${esc(r.student_id || defaultStudentId(me.id))}</span>
      </div>
    </div>`;
}

function holdsBanner() {
  const h = D.record.holds?.trim();
  return h ? `<div class="fl-hold">⚠ <strong>Hold on your account.</strong> ${esc(h)}</div>` : '';
}

function taskRow(a, { showCourse = true } = {}) {
  const c = D.courseById.get(a.course_id);
  const g = D.grades.get(a.id);
  const lab = dueLabel(a.due_at, storyNow(), isFinished(a));
  return `
    <div class="fl-task tone-${lab.tone}">
      <label class="fl-check" title="Mark done">
        <input type="checkbox" data-done="${esc(a.id)}"
          ${isFinished(a) ? 'checked' : ''} ${g?.score != null ? 'disabled title="Graded"' : ''}>
      </label>
      <div class="fl-task-main">
        <div class="fl-task-title">
          ${showCourse && c ? `<span class="fl-chip" style="--c:${colorOf(c.color)}">${esc(c.code)}</span>` : ''}
          ${esc(a.title)}
        </div>
        <div class="fl-task-meta">
          <span class="fl-due">${esc(lab.text)}</span>
          ${a.category ? `<span>· ${esc(a.category)}</span>` : ''}
          ${g?.score != null ? `<span>· <strong>${esc(String(g.score))}/${esc(String(a.points))}</strong></span>` : `<span>· ${esc(String(a.points))} pts</span>`}
        </div>
        ${g?.feedback ? `<div class="fl-feedback">“${esc(g.feedback)}”</div>` : ''}
      </div>
      ${a.due_at ? `<button class="icon-btn fl-cal" data-cal="${esc(a.id)}" title="Add to calendar">📅</button>` : ''}
    </div>`;
}

function wireTasks(root) {
  $$('[data-done]', root).forEach(cb => cb.addEventListener('change', async () => {
    const id = cb.dataset.done;
    const { error } = cb.checked
      ? await supa.from('flight_progress').upsert(
          { assignment_id: id, user_id: me.id, done: true },
          { onConflict: 'assignment_id,user_id' })
      : await supa.from('flight_progress').delete().eq('assignment_id', id).eq('user_id', me.id);
    if (error) { toast(error.message, 'error'); cb.checked = !cb.checked; return; }
    if (cb.checked) { D.done.add(id); playSound('sent'); } else D.done.delete(id);
    go(current.name, current.arg);
  }));
  $$('[data-cal]', root).forEach(b => b.addEventListener('click', () =>
    addToCalendar(D.assignments.filter(a => a.id === b.dataset.cal))));
}

function announcementHtml(n) {
  const c = n.course_id ? D.courseById.get(n.course_id) : null;
  return `
    <div class="fl-ann">
      <div class="fl-ann-head">
        ${c ? `<span class="fl-chip" style="--c:${colorOf(c.color)}">${esc(c.code)}</span>`
            : '<span class="fl-chip fl-chip-portal">Portal</span>'}
        <strong>${esc(n.title)}</strong>
        <span class="fl-ann-time mono">${esc(fullStamp(n.created_at))}</span>
      </div>
      ${n.body ? `<div class="fl-ann-body">${esc(n.body)}</div>` : ''}
    </div>`;
}

function viewDash() {
  const now = storyNow();
  const open = D.assignments.filter(a => !isFinished(a) && a.due_at);
  const soon = open.filter(a => (new Date(a.due_at) - now) < 14 * 86400000).slice(0, 6);
  const week = open.filter(a => {
    const ms = new Date(a.due_at) - now;
    return ms >= 0 && ms < 7 * 86400000;
  }).length;
  const overdue = open.filter(a => new Date(a.due_at) < now).length;

  main.innerHTML = `
    <div class="fl-dash">
      ${idCard()}
      ${holdsBanner()}
      <div class="fl-stats">
        <div class="fl-stat"><span>GPA</span><strong>${D.gpa == null ? '—' : D.gpa.toFixed(2)}</strong></div>
        <div class="fl-stat"><span>Courses</span><strong>${D.courses.length}</strong></div>
        <div class="fl-stat"><span>Due this week</span><strong>${week}</strong></div>
        <div class="fl-stat ${overdue ? 'warn' : ''}"><span>Overdue</span><strong>${overdue}</strong></div>
      </div>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Due soon</h3>
          <button class="btn btn-ghost btn-sm" data-goto="tasks">All assignments</button></div>
        ${soon.length ? soon.map(a => taskRow(a)).join('')
          : '<div class="fl-empty">Nothing due in the next two weeks.</div>'}
      </section>

      <section class="fl-section">
        <div class="fl-section-head"><h3>My courses</h3></div>
        <div class="fl-mini-courses">
          ${D.courses.map(c => `
            <button class="fl-mini" data-course="${esc(c.id)}" style="--c:${colorOf(c.color)}">
              <span class="fl-mini-code">${esc(c.code)}</span>
              <span class="fl-mini-grade">${esc(c._grade.letter || '—')}</span>
            </button>`).join('') || '<div class="fl-empty">You are not enrolled in any courses yet.</div>'}
        </div>
      </section>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Announcements</h3></div>
        ${D.announcements.slice(0, 5).map(announcementHtml).join('')
          || '<div class="fl-empty">No announcements.</div>'}
      </section>
    </div>`;

  wireTasks(main);
  $$('[data-goto]', main).forEach(b => b.addEventListener('click', () => go(b.dataset.goto)));
  $$('[data-course]', main).forEach(b => b.addEventListener('click', () => go('course', b.dataset.course)));

  // Seeing the portal-wide announcements clears their notifications.
  supa.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('kind', 'flight_announce').eq('link', 'flight.html').is('read_at', null)
    .then(() => {}, () => {});
}

function viewCourses() {
  main.innerHTML = D.courses.length ? `
    <div class="fl-courses">
      ${D.courses.map(c => {
        const pending = D.assignments.filter(a => a.course_id === c.id && !isFinished(a)).length;
        return `
        <button class="fl-course" data-course="${esc(c.id)}" style="--c:${colorOf(c.color)}">
          <div class="fl-course-top">
            <div>
              <span class="fl-course-code">${esc(c.code)}</span>
              <h3>${esc(c.title)}</h3>
              <span class="fl-course-prof">${esc(c.professor_name)}</span>
            </div>
            <div class="fl-course-grade">
              <strong>${esc(c._grade.letter || '—')}</strong>
              <span>${pctText(c._grade.pct)}</span>
            </div>
          </div>
          <div class="fl-course-meta">
            ${c.schedule ? `<span>🕘 ${esc(c.schedule)}</span>` : ''}
            ${c.room ? `<span>📍 ${esc(c.room)}</span>` : ''}
            <span>${pending} open assignment${pending === 1 ? '' : 's'}</span>
          </div>
        </button>`;
      }).join('')}
    </div>` : '<div class="ig-empty">You are not enrolled in any courses yet.</div>';

  $$('[data-course]', main).forEach(b => b.addEventListener('click', () => go('course', b.dataset.course)));
}

function viewCourse(id) {
  const c = D.courseById.get(id);
  if (!c) { main.innerHTML = '<div class="ig-empty">That course is not on your schedule.</div>'; return; }
  clearNotificationsFor(id);

  const list = D.assignments.filter(a => a.course_id === id);
  const anns = D.announcements.filter(n => n.course_id === id);
  const graded = list.filter(a => D.grades.get(a.id)?.score != null).length;

  main.innerHTML = `
    <div class="fl-course-page" style="--c:${colorOf(c.color)}">
      <button class="btn btn-ghost btn-sm" data-back>‹ Courses</button>
      <div class="fl-course-hero">
        <div>
          <span class="fl-course-code">${esc(c.code)}${c.term ? ` · ${esc(c.term)}` : ''}</span>
          <h2>${esc(c.title)}</h2>
          <span class="fl-course-prof">${esc(c.professor_name)}
            ${c.professor_addr ? `<span class="mono muted">${esc(c.professor_addr)}</span>` : ''}</span>
        </div>
        <div class="fl-course-grade big">
          <strong>${esc(c._grade.letter || '—')}</strong>
          <span>${pctText(c._grade.pct)}</span>
          <small>${graded}/${list.length} graded${c._grade.overridden ? ' · final' : ''}</small>
        </div>
      </div>

      <div class="fl-facts">
        ${c.schedule ? `<div><span>Meets</span>${esc(c.schedule)}</div>` : ''}
        ${c.room ? `<div><span>Room</span>${esc(c.room)}</div>` : ''}
        ${c.office_hours ? `<div><span>Office hours</span>${esc(c.office_hours)}</div>` : ''}
        <div><span>Credits</span>${esc(String(c.credits))}</div>
      </div>
      ${c.description ? `<p class="fl-desc">${esc(c.description)}</p>` : ''}

      <div class="fl-actions">
        <button class="btn btn-primary" data-email>✉ Email professor</button>
        ${list.some(a => a.due_at) ? '<button class="btn btn-ghost" data-calall>📅 Add due dates to calendar</button>' : ''}
      </div>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Assignments &amp; grades</h3></div>
        ${list.length ? list.map(a => taskRow(a, { showCourse: false })).join('')
          : '<div class="fl-empty">No assignments posted yet.</div>'}
      </section>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Announcements</h3></div>
        ${anns.map(announcementHtml).join('') || '<div class="fl-empty">No announcements for this course.</div>'}
      </section>
    </div>`;

  wireTasks(main);
  $('[data-back]', main).addEventListener('click', () => go('courses'));
  $('[data-email]', main).addEventListener('click', () => openEmailProfessor(c));
  $('[data-calall]', main)?.addEventListener('click', () => addToCalendar(list.filter(a => a.due_at)));
}

function viewTasks(filter) {
  const now = storyNow();
  const groups = {
    upcoming: D.assignments.filter(a => !isFinished(a) && (!a.due_at || new Date(a.due_at) >= now)),
    overdue:  D.assignments.filter(a => !isFinished(a) && a.due_at && new Date(a.due_at) < now),
    done:     D.assignments.filter(isFinished)
  };
  const list = groups[filter] || groups.upcoming;

  main.innerHTML = `
    <div class="seg fl-seg">
      <button data-f="upcoming" class="${filter === 'upcoming' ? 'on' : ''}">Upcoming · ${groups.upcoming.length}</button>
      <button data-f="overdue" class="${filter === 'overdue' ? 'on' : ''}">Overdue · ${groups.overdue.length}</button>
      <button data-f="done" class="${filter === 'done' ? 'on' : ''}">Completed · ${groups.done.length}</button>
    </div>
    <div class="fl-section">
      ${list.map(a => taskRow(a)).join('') || '<div class="fl-empty">Nothing here.</div>'}
    </div>`;

  $$('[data-f]', main).forEach(b => b.addEventListener('click', () => go('tasks', b.dataset.f)));
  wireTasks(main);
}

function viewAccount() {
  const r = D.record;
  const balance = Number(r.balance) || 0;
  main.innerHTML = `
    <div class="fl-dash">
      ${idCard()}
      ${holdsBanner()}
      <section class="fl-section">
        <div class="fl-section-head"><h3>Student record</h3></div>
        <div class="fl-facts">
          <div><span>Student ID</span>${esc(r.student_id || defaultStudentId(me.id))}</div>
          <div><span>Major</span>${esc(r.major || 'Undeclared')}</div>
          ${r.minor ? `<div><span>Minor</span>${esc(r.minor)}</div>` : ''}
          <div><span>Class</span>${esc(r.year || '—')}</div>
          <div><span>Advisor</span>${esc(r.advisor || '—')}</div>
          <div><span>Standing</span>${esc(r.standing || 'Good standing')}</div>
          <div><span>Email</span><span class="mono">${esc(me.username.toLowerCase())}@juniversity.edu</span></div>
        </div>
      </section>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Bursar</h3></div>
        <div class="fl-bursar ${balance > 0 ? 'owed' : ''}">
          <span>${balance > 0 ? 'Balance due' : balance < 0 ? 'Credit on account' : 'Account balance'}</span>
          <strong>${money(Math.abs(balance))}</strong>
        </div>
      </section>

      <section class="fl-section">
        <div class="fl-section-head"><h3>Unofficial transcript</h3></div>
        <table class="fl-transcript">
          <thead><tr><th>Course</th><th>Credits</th><th>Grade</th></tr></thead>
          <tbody>
            ${D.courses.map(c => `<tr><td><strong>${esc(c.code)}</strong> ${esc(c.title)}</td>
              <td>${esc(String(c.credits))}</td><td>${esc(c._grade.letter || 'IP')}</td></tr>`).join('')
              || '<tr><td colspan="3" class="fl-empty">No coursework yet.</td></tr>'}
          </tbody>
          <tfoot><tr><td>Cumulative GPA</td><td></td><td>${D.gpa == null ? '—' : D.gpa.toFixed(2)}</td></tr></tfoot>
        </table>
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  student actions                                                   */
/* ------------------------------------------------------------------ */

function sheet({ title, body, footer, wide }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="scrim">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3>
          <button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  $$('[data-close]', root).forEach(b => b.addEventListener('click', close));
  $('.scrim', root).addEventListener('click', e => { if (e.target.classList.contains('scrim')) close(); });
  return { root, close };
}

function openEmailProfessor(c) {
  const { root, close } = sheet({
    title: `Email ${c.professor_name}`,
    body: `
      <div class="field"><label>To</label>
        <input value="${esc(c.professor_name)} <${esc(c.professor_addr || 'professor@juniversity.edu')}>" disabled></div>
      <div class="field"><label for="eSubj">Subject</label>
        <input id="eSubj" maxlength="140" value="${esc(c.code)}: "></div>
      <div class="field"><label for="eBody">Message</label>
        <textarea id="eBody" rows="6" placeholder="Dear Professor…"></textarea></div>
      <p class="muted small">Replies arrive in Neomail.</p>
      <div id="eMsg"></div>`,
    footer: `<button class="btn btn-primary" id="eSend">Send</button>`
  });
  $('#eSend', root).addEventListener('click', async (e) => {
    const body = $('#eBody', root).value.trim();
    if (!body) { $('#eMsg', root).innerHTML = '<div class="notice notice-error">Write a message first.</div>'; return; }
    e.target.disabled = true;
    const { error } = await supa.rpc('flight_email_professor', {
      p_course: c.id, p_subject: $('#eSubj', root).value.trim(), p_body: body
    });
    if (error) {
      $('#eMsg', root).innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`;
      e.target.disabled = false; return;
    }
    playSound('sent');
    close();
    toast('Sent. Replies will show up in Neomail.', 'ok');
  });
}

/* Copy due dates into the player's own calendar as reminders, skipping
   any already there. */
async function addToCalendar(list) {
  if (!list.length) return;
  const pad = n => String(n).padStart(2, '0');
  const rows = list.map(a => {
    const d = new Date(a.due_at);
    const c = D.courseById.get(a.course_id);
    return {
      owner_id: me.id, kind: 'reminder', is_public: false,
      title: `${c?.code || 'Class'}: ${a.title}`.slice(0, 120),
      notes: a.description || null,
      start_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      start_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    };
  });

  const { data: existing, error: readErr } = await supa.from('calendar_events')
    .select('title, start_date').eq('owner_id', me.id).in('title', rows.map(r => r.title));
  if (readErr) {
    toast(/does not exist/i.test(readErr.message) ? 'The Calendar app is not set up yet.' : readErr.message, 'error');
    return;
  }
  const have = new Set((existing || []).map(x => x.title + '|' + x.start_date));
  const fresh = rows.filter(r => !have.has(r.title + '|' + r.start_date));
  if (!fresh.length) { toast('Already on your calendar.', 'ok'); return; }

  const { error } = await supa.from('calendar_events').insert(fresh);
  if (error) { toast(error.message, 'error'); return; }
  toast(`Added ${fresh.length} to your calendar.`, 'ok');
}

/* ------------------------------------------------------------------ */
/*  admin                                                             */
/* ------------------------------------------------------------------ */

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function viewAdmin() {
  const [{ data: courses, error }, { data: enr }] = await Promise.all([
    supa.from('flight_courses').select('*').order('code'),
    supa.from('flight_enrollments').select('course_id')
  ]);
  if (error) throw new Error(/does not exist/i.test(error.message)
    ? 'Run sql/flight.sql in Supabase to set up the portal.' : error.message);
  const counts = new Map();
  (enr || []).forEach(e => counts.set(e.course_id, (counts.get(e.course_id) || 0) + 1));

  main.innerHTML = `
    <div class="fl-admin">
      <div class="fl-actions">
        <button class="btn btn-primary" id="aNewCourse">＋ New course</button>
        <button class="btn btn-ghost" id="aStudents">Student records</button>
        <button class="btn btn-ghost" id="aPortalAnn">Portal announcement</button>
      </div>
      <section class="fl-section">
        <div class="fl-section-head"><h3>Courses</h3></div>
        ${(courses || []).map(c => `
          <button class="fl-admin-row" data-acourse="${esc(c.id)}" style="--c:${colorOf(c.color)}">
            <span class="fl-chip" style="--c:${colorOf(c.color)}">${esc(c.code)}</span>
            <span class="fl-admin-row-main"><strong>${esc(c.title)}${c.auto_enroll ? ' <span class="fl-chip fl-chip-portal">Required</span>' : ''}</strong>
              <span class="muted">${esc(c.professor_name)}${c.term ? ' · ' + esc(c.term) : ''}</span></span>
            <span class="muted">${counts.get(c.id) || 0} enrolled ›</span>
          </button>`).join('') || '<div class="fl-empty">No courses yet. Make one to get started.</div>'}
      </section>
    </div>`;

  $('#aNewCourse').addEventListener('click', () => openCourseEditor(null));
  $('#aStudents').addEventListener('click', openStudentRecords);
  $('#aPortalAnn').addEventListener('click', () => openAnnouncementEditor(null));
  $$('[data-acourse]', main).forEach(b => b.addEventListener('click',
    () => go('adminCourse', { id: b.dataset.acourse, tab: 'roster' })));
}

function openCourseEditor(c) {
  const v = c || { code: '', title: '', professor_name: '', professor_addr: '', room: '', schedule: '',
                   office_hours: '', term: '', credits: 3, description: '', color: COLORS[0] };
  const { root, close } = sheet({
    title: c ? 'Edit course' : 'New course', wide: true,
    body: `
      <div class="fl-form">
        <div class="field"><label>Code</label><input id="cfCode" value="${esc(v.code)}" placeholder="CRIM 210"></div>
        <div class="field"><label>Title</label><input id="cfTitle" value="${esc(v.title)}" placeholder="Criminal Procedure"></div>
        <div class="field"><label>Professor</label><input id="cfProf" value="${esc(v.professor_name)}" placeholder="Prof. Hale"></div>
        <div class="field"><label>Professor email</label><input id="cfAddr" class="mono" value="${esc(v.professor_addr || '')}" placeholder="hale@juniversity.edu"></div>
        <div class="field"><label>Meets</label><input id="cfSched" value="${esc(v.schedule || '')}" placeholder="Mon/Wed 10:00–11:15"></div>
        <div class="field"><label>Room</label><input id="cfRoom" value="${esc(v.room || '')}" placeholder="Harlow Hall 204"></div>
        <div class="field"><label>Office hours</label><input id="cfOH" value="${esc(v.office_hours || '')}" placeholder="Thu 2–4pm"></div>
        <div class="field"><label>Term</label><input id="cfTerm" value="${esc(v.term || '')}" placeholder="Fall 2026"></div>
        <div class="field"><label>Credits</label><input id="cfCred" type="number" min="0" step="0.5" value="${esc(String(v.credits))}"></div>
        <div class="field"><label>Colour</label>
          <div class="tints">${COLORS.map(col => `<button type="button" class="tint fl-swatch" data-col="${col}"
            style="--tint:${col};--tint-d:${col}" aria-pressed="${colorOf(v.color) === col}"></button>`).join('')}</div></div>
      </div>
      <div class="field"><label>Description</label><textarea id="cfDesc" rows="3">${esc(v.description || '')}</textarea></div>
      <label class="check">
        <input type="checkbox" id="cfReq" ${v.auto_enroll ? 'checked' : ''}>
        <span>Required course — every student is enrolled automatically, including new sign-ups</span>
      </label>
      <div id="cfMsg"></div>`,
    footer: `${c ? '<button class="btn btn-danger" id="cfDel">Delete course</button>' : ''}
             <button class="btn btn-primary" id="cfSave">${c ? 'Save' : 'Create'}</button>`
  });

  let color = colorOf(v.color);
  $$('[data-col]', root).forEach(b => b.addEventListener('click', () => {
    color = b.dataset.col;
    $$('[data-col]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));

  $('#cfSave', root).addEventListener('click', async (e) => {
    const row = {
      code: $('#cfCode', root).value.trim(), title: $('#cfTitle', root).value.trim(),
      professor_name: $('#cfProf', root).value.trim() || 'Staff',
      professor_addr: $('#cfAddr', root).value.trim() || null,
      schedule: $('#cfSched', root).value.trim() || null, room: $('#cfRoom', root).value.trim() || null,
      office_hours: $('#cfOH', root).value.trim() || null, term: $('#cfTerm', root).value.trim() || null,
      credits: Number($('#cfCred', root).value) || 0,
      description: $('#cfDesc', root).value.trim() || null, color
    };
    // Only send the flag when it is in use, so the editor still works on a
    // database where sql/flight-heroics.sql has not been run.
    const req = $('#cfReq', root).checked;
    if (req || 'auto_enroll' in v) row.auto_enroll = req;
    if (!row.code || !row.title) {
      $('#cfMsg', root).innerHTML = '<div class="notice notice-error">A code and a title are needed.</div>'; return;
    }
    e.target.disabled = true;
    const q = c ? supa.from('flight_courses').update(row).eq('id', c.id).select().single()
                : supa.from('flight_courses').insert(row).select().single();
    const { data, error } = await q;
    if (error) { $('#cfMsg', root).innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`; e.target.disabled = false; return; }
    close();
    toast(c ? 'Course saved.' : 'Course created.', 'ok');
    go('adminCourse', { id: data.id, tab: c ? current.arg?.tab || 'roster' : 'roster' });
  });

  $('#cfDel', root)?.addEventListener('click', async () => {
    if (!confirm(`Delete ${v.code}? Its assignments, grades and announcements go with it.`)) return;
    const { error } = await supa.from('flight_courses').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    close(); toast('Course deleted.', 'ok'); go('admin');
  });
}

async function viewAdminCourse(id, tab = 'roster') {
  const { data: c } = await supa.from('flight_courses').select('*').eq('id', id).maybeSingle();
  if (!c) { main.innerHTML = '<div class="ig-empty">Course not found.</div>'; return; }

  const [{ data: people }, { data: enr }, { data: asg }, { data: ann }] = await Promise.all([
    supa.from('profiles').select('id, username').order('username'),
    supa.from('flight_enrollments').select('*').eq('course_id', id),
    supa.from('flight_assignments').select('*').eq('course_id', id).order('due_at'),
    supa.from('flight_announcements').select('*').eq('course_id', id).order('created_at', { ascending: false })
  ]);
  const assignments = asg || [];
  const { data: grd } = assignments.length
    ? await supa.from('flight_grades').select('*').in('assignment_id', assignments.map(a => a.id))
    : { data: [] };

  const enrolled = new Map((enr || []).map(e => [e.user_id, e]));
  const nameOf = new Map((people || []).map(p => [p.id, p.username]));

  main.innerHTML = `
    <div class="fl-admin" style="--c:${colorOf(c.color)}">
      <button class="btn btn-ghost btn-sm" data-back>‹ All courses</button>
      <div class="fl-course-hero">
        <div>
          <span class="fl-course-code">${esc(c.code)}${c.term ? ` · ${esc(c.term)}` : ''}</span>
          <h2>${esc(c.title)}</h2>
          <span class="fl-course-prof">${esc(c.professor_name)}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="acEdit">Edit course</button>
      </div>
      <div class="seg fl-seg">
        ${[['roster', `Roster · ${enrolled.size}`], ['assignments', `Assignments · ${assignments.length}`],
           ['gradebook', 'Gradebook'], ['announcements', 'Announcements']]
          .map(([k, label]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${label}</button>`).join('')}
      </div>
      <div id="acBody"></div>
    </div>`;

  $('[data-back]', main).addEventListener('click', () => go('admin'));
  $('#acEdit').addEventListener('click', () => openCourseEditor(c));
  $$('[data-tab]', main).forEach(b => b.addEventListener('click', () => go('adminCourse', { id, tab: b.dataset.tab })));
  const body = $('#acBody');

  /* ---- roster ---- */
  if (tab === 'roster') {
    body.innerHTML = `
      <p class="muted small">Tick accounts to enrol them. A final letter overrides the computed grade.</p>
      <div class="fl-roster">
        ${(people || []).map(p => {
          const e = enrolled.get(p.id);
          return `<div class="fl-roster-row">
            <label class="fl-roster-name"><input type="checkbox" data-enrol="${esc(p.id)}" ${e ? 'checked' : ''}> ${esc(p.username)}</label>
            <input class="fl-final" data-final="${esc(p.id)}" placeholder="Final" maxlength="3"
                   value="${esc(e?.final_grade || '')}" ${e ? '' : 'disabled'}>
          </div>`;
        }).join('')}
      </div>`;
    $$('[data-enrol]', body).forEach(cb => cb.addEventListener('change', async () => {
      const uid = cb.dataset.enrol;
      const { error } = cb.checked
        ? await supa.from('flight_enrollments').insert({ course_id: id, user_id: uid })
        : await supa.from('flight_enrollments').delete().eq('course_id', id).eq('user_id', uid);
      if (error) { toast(error.message, 'error'); cb.checked = !cb.checked; return; }
      $(`[data-final="${uid}"]`, body).disabled = !cb.checked;
    }));
    $$('[data-final]', body).forEach(inp => inp.addEventListener('change', async () => {
      const { error } = await supa.from('flight_enrollments')
        .update({ final_grade: inp.value.trim().toUpperCase() || null })
        .eq('course_id', id).eq('user_id', inp.dataset.final);
      if (error) toast(error.message, 'error'); else toast('Final grade saved.', 'ok');
    }));
  }

  /* ---- assignments ---- */
  if (tab === 'assignments') {
    body.innerHTML = `
      <div class="fl-actions"><button class="btn btn-primary btn-sm" id="aaNew">＋ Add assignment</button></div>
      ${assignments.map(a => `
        <div class="fl-admin-row static">
          <span class="fl-admin-row-main"><strong>${esc(a.title)}</strong>
            <span class="muted">${esc(a.category || 'Assignment')} · ${esc(String(a.points))} pts ·
              ${a.due_at ? 'due ' + esc(fullStamp(a.due_at)) : 'no due date'}</span></span>
          <button class="icon-btn" data-aedit="${esc(a.id)}" title="Edit">✎</button>
        </div>`).join('') || '<div class="fl-empty">No assignments yet.</div>'}`;
    $('#aaNew').addEventListener('click', () => openAssignmentEditor(id, null));
    $$('[data-aedit]', body).forEach(b => b.addEventListener('click',
      () => openAssignmentEditor(id, assignments.find(a => a.id === b.dataset.aedit))));
  }

  /* ---- gradebook ---- */
  if (tab === 'gradebook') {
    const students = [...enrolled.keys()].sort((a, b) => (nameOf.get(a) || '').localeCompare(nameOf.get(b) || ''));
    const gmap = new Map((grd || []).map(g => [g.assignment_id + '|' + g.user_id, g]));
    const rowGrade = (uid) => {
      const mine = new Map(assignments.map(a => [a.id, gmap.get(a.id + '|' + uid)]).filter(([, g]) => g));
      const r = courseGrade(enrolled.get(uid), assignments, mine);
      return r.letter ? `${r.letter} <span class="muted">${pctText(r.pct)}</span>` : '<span class="muted">—</span>';
    };

    body.innerHTML = !students.length ? '<div class="fl-empty">Enrol students on the Roster tab first.</div>'
      : !assignments.length ? '<div class="fl-empty">Add assignments first.</div>' : `
      <p class="muted small">Type a score and tab away to save. Clear a box to remove the score. ✎ adds feedback.</p>
      <div class="fl-gb-wrap"><table class="fl-gb">
        <thead><tr><th>Student</th>${assignments.map(a =>
          `<th title="${esc(a.title)}">${esc(a.title)}<small>/${esc(String(a.points))}</small></th>`).join('')}<th>Grade</th></tr></thead>
        <tbody>${students.map(uid => `
          <tr data-row="${esc(uid)}"><td class="fl-gb-name">${esc(nameOf.get(uid) || '?')}</td>
          ${assignments.map(a => {
            const g = gmap.get(a.id + '|' + uid);
            return `<td><div class="fl-gb-cell">
              <input type="number" step="any" data-score="${esc(a.id)}|${esc(uid)}" value="${g?.score ?? ''}">
              <button class="fl-gb-fb ${g?.feedback ? 'has' : ''}" data-fb="${esc(a.id)}|${esc(uid)}" title="Feedback">✎</button>
            </div></td>`;
          }).join('')}
          <td class="fl-gb-total" data-total="${esc(uid)}">${rowGrade(uid)}</td></tr>`).join('')}
        </tbody></table></div>`;

    $$('[data-score]', body).forEach(inp => inp.addEventListener('change', async () => {
      const [aid, uid] = inp.dataset.score.split('|');
      const raw = inp.value.trim();
      let error;
      if (raw === '') {
        ({ error } = await supa.from('flight_grades').delete().eq('assignment_id', aid).eq('user_id', uid));
        if (!error) gmap.delete(aid + '|' + uid);
      } else {
        const prev = gmap.get(aid + '|' + uid);
        const row = { assignment_id: aid, user_id: uid, score: Number(raw),
                      feedback: prev?.feedback || null, updated_at: new Date().toISOString() };
        ({ error } = await supa.from('flight_grades').upsert(row, { onConflict: 'assignment_id,user_id' }));
        if (!error) gmap.set(aid + '|' + uid, row);
      }
      if (error) { toast(error.message, 'error'); return; }
      inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 700);
      $(`[data-total="${uid}"]`, body).innerHTML = rowGrade(uid);
    }));

    $$('[data-fb]', body).forEach(btn => btn.addEventListener('click', () => {
      const [aid, uid] = btn.dataset.fb.split('|');
      const g = gmap.get(aid + '|' + uid);
      const a = assignments.find(x => x.id === aid);
      const { root, close } = sheet({
        title: `${nameOf.get(uid)} — ${a.title}`,
        body: `<div class="field"><label>Score (out of ${esc(String(a.points))})</label>
                 <input type="number" step="any" id="fbScore" value="${g?.score ?? ''}"></div>
               <div class="field"><label>Feedback</label>
                 <textarea id="fbText" rows="4">${esc(g?.feedback || '')}</textarea></div>`,
        footer: '<button class="btn btn-primary" id="fbSave">Save</button>'
      });
      $('#fbSave', root).addEventListener('click', async () => {
        const raw = $('#fbScore', root).value.trim();
        const row = { assignment_id: aid, user_id: uid, score: raw === '' ? null : Number(raw),
                      feedback: $('#fbText', root).value.trim() || null, updated_at: new Date().toISOString() };
        const { error } = await supa.from('flight_grades').upsert(row, { onConflict: 'assignment_id,user_id' });
        if (error) return toast(error.message, 'error');
        close(); toast('Saved.', 'ok');
        go('adminCourse', { id, tab: 'gradebook' });
      });
    }));
  }

  /* ---- announcements ---- */
  if (tab === 'announcements') {
    body.innerHTML = `
      <div class="fl-actions"><button class="btn btn-primary btn-sm" id="anNew">＋ Post announcement</button></div>
      ${(ann || []).map(n => `
        <div class="fl-ann">
          <div class="fl-ann-head"><strong>${esc(n.title)}</strong>
            <span class="fl-ann-time mono">${esc(fullStamp(n.created_at))}</span>
            <button class="icon-btn" data-adel="${esc(n.id)}" title="Delete">🗑</button></div>
          ${n.body ? `<div class="fl-ann-body">${esc(n.body)}</div>` : ''}
        </div>`).join('') || '<div class="fl-empty">Nothing posted yet.</div>'}`;
    $('#anNew').addEventListener('click', () => openAnnouncementEditor(id));
    $$('[data-adel]', body).forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this announcement?')) return;
      const { error } = await supa.from('flight_announcements').delete().eq('id', b.dataset.adel);
      if (error) return toast(error.message, 'error');
      go('adminCourse', { id, tab: 'announcements' });
    }));
  }
}

function openAssignmentEditor(courseId, a) {
  const v = a || { title: '', category: 'Homework', points: 100, due_at: null, description: '' };
  const { root, close } = sheet({
    title: a ? 'Edit assignment' : 'New assignment',
    body: `
      <div class="field"><label>Title</label><input id="afTitle" value="${esc(v.title)}"></div>
      <div class="fl-form">
        <div class="field"><label>Category</label><input id="afCat" value="${esc(v.category || '')}" list="afCats">
          <datalist id="afCats"><option>Homework</option><option>Quiz</option><option>Exam</option>
          <option>Paper</option><option>Project</option><option>Participation</option></datalist></div>
        <div class="field"><label>Points</label><input id="afPts" type="number" min="0" step="any" value="${esc(String(v.points))}"></div>
      </div>
      <div class="field"><label>Due (story date)</label>
        <input id="afDue" type="datetime-local" class="mono" value="${toLocalInput(v.due_at)}"></div>
      <div class="field"><label>Instructions</label><textarea id="afDesc" rows="3">${esc(v.description || '')}</textarea></div>
      <div id="afMsg"></div>`,
    footer: `${a ? '<button class="btn btn-danger" id="afDel">Delete</button>' : ''}
             <button class="btn btn-primary" id="afSave">${a ? 'Save' : 'Add'}</button>`
  });

  $('#afSave', root).addEventListener('click', async (e) => {
    const title = $('#afTitle', root).value.trim();
    if (!title) { $('#afMsg', root).innerHTML = '<div class="notice notice-error">Give it a title.</div>'; return; }
    const due = $('#afDue', root).value;
    const row = { course_id: courseId, title,
                  category: $('#afCat', root).value.trim() || null,
                  points: Number($('#afPts', root).value) || 0,
                  due_at: due ? new Date(due).toISOString() : null,
                  description: $('#afDesc', root).value.trim() || null };
    e.target.disabled = true;
    const { error } = a ? await supa.from('flight_assignments').update(row).eq('id', a.id)
                        : await supa.from('flight_assignments').insert(row);
    if (error) { $('#afMsg', root).innerHTML = `<div class="notice notice-error">${esc(error.message)}</div>`; e.target.disabled = false; return; }
    close(); toast(a ? 'Assignment saved.' : 'Assignment posted.', 'ok');
    go('adminCourse', { id: courseId, tab: 'assignments' });
  });

  $('#afDel', root)?.addEventListener('click', async () => {
    if (!confirm('Delete this assignment and its scores?')) return;
    const { error } = await supa.from('flight_assignments').delete().eq('id', a.id);
    if (error) return toast(error.message, 'error');
    close(); go('adminCourse', { id: courseId, tab: 'assignments' });
  });
}

function openAnnouncementEditor(courseId) {
  const { root, close } = sheet({
    title: courseId ? 'Course announcement' : 'Portal-wide announcement',
    body: `
      ${courseId ? '' : '<p class="muted small">Every student sees this on their portal home.</p>'}
      <div class="field"><label>Title</label><input id="nfTitle" maxlength="140"></div>
      <div class="field"><label>Message</label><textarea id="nfBody" rows="5"></textarea></div>`,
    footer: '<button class="btn btn-primary" id="nfPost">Post</button>'
  });
  $('#nfPost', root).addEventListener('click', async (e) => {
    const title = $('#nfTitle', root).value.trim();
    if (!title) return toast('Give it a title.', 'error');
    e.target.disabled = true;
    const { error } = await supa.from('flight_announcements')
      .insert({ course_id: courseId, title, body: $('#nfBody', root).value.trim() || null });
    if (error) { toast(error.message, 'error'); e.target.disabled = false; return; }
    close(); toast('Posted.', 'ok');
    if (courseId) go('adminCourse', { id: courseId, tab: 'announcements' });
  });
}

async function openStudentRecords() {
  const [{ data: people }, { data: recs }] = await Promise.all([
    supa.from('profiles').select('id, username').order('username'),
    supa.from('flight_students').select('*')
  ]);
  const byId = new Map((recs || []).map(r => [r.user_id, r]));

  const { root } = sheet({
    title: 'Student records', wide: true,
    body: `<p class="muted small">Pick a student to edit their record.</p>
      <div class="fl-roster">${(people || []).map(p => {
        const r = byId.get(p.id) || {};
        return `<button class="fl-admin-row" data-rec="${esc(p.id)}">
          <span class="fl-admin-row-main"><strong>${esc(p.username)}</strong>
            <span class="muted">${esc([r.major, r.year].filter(Boolean).join(' · ') || 'No record yet')}</span></span>
          ${r.holds ? '<span class="fl-chip" style="--c:#F0484F">Hold</span>' : ''} ›</button>`;
      }).join('')}</div>`
  });

  $$('[data-rec]', root).forEach(b => b.addEventListener('click', () => {
    const uid = b.dataset.rec;
    const p = people.find(x => x.id === uid);
    const r = byId.get(uid) || {};
    const f = (k, label, ph = '', type = 'text') =>
      `<div class="field"><label>${label}</label><input id="sr_${k}" type="${type}" ${type === 'number' ? 'step="any"' : ''}
        value="${esc(r[k] ?? '')}" placeholder="${esc(ph)}"></div>`;
    const { root: r2, close } = sheet({
      title: `${p.username} — record`, wide: true,
      body: `<div class="fl-form">
          ${f('student_id', 'Student ID', defaultStudentId(uid))}
          ${f('major', 'Major', 'Criminal Justice')}
          ${f('minor', 'Minor')}
          ${f('year', 'Class', 'Junior')}
          ${f('advisor', 'Advisor', 'Dr. Ames')}
          ${f('standing', 'Standing', 'Good standing')}
          ${f('balance', 'Balance owed ($)', '0', 'number')}
          ${f('gpa_override', 'GPA override', 'computed', 'number')}
        </div>
        <div class="field"><label>Holds <span class="muted">(leave blank for none)</span></label>
          <input id="sr_holds" value="${esc(r.holds || '')}" placeholder="Unpaid parking citations"></div>`,
      footer: '<button class="btn btn-primary" id="srSave">Save record</button>'
    });
    $('#srSave', r2).addEventListener('click', async () => {
      const val = k => $(`#sr_${k}`, r2).value.trim();
      const row = {
        user_id: uid, student_id: val('student_id') || null, major: val('major') || null,
        minor: val('minor') || null, year: val('year') || null, advisor: val('advisor') || null,
        standing: val('standing') || 'Good standing', holds: val('holds') || null,
        balance: Number(val('balance')) || 0,
        gpa_override: val('gpa_override') === '' ? null : Number(val('gpa_override'))
      };
      const { error } = await supa.from('flight_students').upsert(row, { onConflict: 'user_id' });
      if (error) return toast(error.message, 'error');
      close(); toast('Record saved.', 'ok');
    });
  }));
}

/* ------------------------------------------------------------------ */
/*  wiring                                                            */
/* ------------------------------------------------------------------ */

$$('.fl-tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));

// Live: a new assignment, grade or announcement refreshes student views.
// Admin screens are left alone so a half-typed gradebook is not wiped.
let refreshTimer = null;
supa.channel('flight-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_assignments' }, () => liveRefresh())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_grades' }, () => liveRefresh())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_announcements' }, () => liveRefresh())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flight_enrollments' }, () => liveRefresh())
  .subscribe();

function liveRefresh() {
  if (current.name.startsWith('admin') || $('#modalRoot').children.length) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => go(current.name, current.arg), 400);
}

// Moving the story clock changes what is due and overdue.
onClockChange(() => liveRefresh());

// Deep link from a notification.
const wantCourse = new URLSearchParams(location.search).get('course');
go(wantCourse ? 'course' : 'dash', wantCourse);
