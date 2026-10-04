// =====================================================================
//  FLIGHT PORTAL — grade + date math
//  Pure functions, no imports, so they can be tested on their own.
// =====================================================================

/* Percent floor, letter, grade points. */
export const SCALE = [
  [93, 'A', 4.0], [90, 'A-', 3.7], [87, 'B+', 3.3], [83, 'B', 3.0],
  [80, 'B-', 2.7], [77, 'C+', 2.3], [73, 'C', 2.0], [70, 'C-', 1.7],
  [67, 'D+', 1.3], [63, 'D', 1.0], [60, 'D-', 0.7], [0, 'F', 0.0]
];

export function letterFor(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  for (const [floor, letter] of SCALE) if (pct >= floor) return letter;
  return 'F';
}

export function pointsFor(letter) {
  if (!letter) return null;
  const row = SCALE.find(([, l]) => l === String(letter).trim().toUpperCase());
  return row ? row[2] : null;
}

/* Points-weighted percent across the assignments that have a score.
   Ungraded work does not count against you. */
export function coursePercent(assignments, gradesById) {
  let earned = 0, possible = 0;
  for (const a of assignments) {
    const g = gradesById.get(a.id);
    if (!g || g.score == null || !(Number(a.points) > 0)) continue;
    earned += Number(g.score);
    possible += Number(a.points);
  }
  return possible > 0 ? (earned / possible) * 100 : null;
}

/* The grade a student sees: the GM's letter override if set, otherwise
   the letter for the computed percent. */
export function courseGrade(enrollment, assignments, gradesById) {
  const pct = coursePercent(assignments, gradesById);
  const override = enrollment?.final_grade?.trim();
  return { pct, letter: override || letterFor(pct), overridden: !!override };
}

/* Credit-weighted GPA over courses that have a usable letter. */
export function gpa(rows) {
  let q = 0, cr = 0;
  for (const r of rows) {
    const p = pointsFor(r.letter);
    const c = Number(r.credits) || 0;
    if (p == null || c <= 0) continue;
    q += p * c; cr += c;
  }
  return cr > 0 ? Math.round((q / cr) * 100) / 100 : null;
}

/* Whole calendar days from `now` to `then`, in local time. */
export function dayDiff(then, now) {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

/* Human due-date label relative to the story clock. */
export function dueLabel(dueIso, now, done = false) {
  if (!dueIso) return { text: 'No due date', tone: 'later' };
  const due = new Date(dueIso);
  const d = dayDiff(due, now);
  if (done) return { text: 'Done', tone: 'done' };
  if (due < now) {
    if (d === 0) return { text: 'Due earlier today', tone: 'overdue' };
    if (d === -1) return { text: 'Overdue · due yesterday', tone: 'overdue' };
    return { text: `Overdue · ${-d} days`, tone: 'overdue' };
  }
  if (d === 0) return { text: 'Due today', tone: 'soon' };
  if (d === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (d < 7)  return { text: `Due in ${d} days`, tone: 'soon' };
  return {
    text: 'Due ' + due.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    tone: 'later'
  };
}

/* ------------------------------------------------------------------ */
/*  meeting times                                                     */
/*  Reads the free-text "Meets" field of a course, e.g.               */
/*    "Mon/Wed/Fri 9:00–10:00 AM"                                     */
/*    "Tue/Thu 1:00–2:30 PM; Fri 9:30 AM–12:00 PM"                    */
/*  into [{ day: 1..7 (Mon..Sun), start: minutes, end: minutes }].    */
/*  Anything it cannot read is skipped rather than guessed at.        */
/* ------------------------------------------------------------------ */

const DAY_INDEX = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

function clock(h, m, mer) {
  h = Number(h); m = Number(m || 0);
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

export function parseMeetings(text) {
  const out = [];
  for (const seg of String(text || '').split(';')) {
    const days = [...seg.toLowerCase().matchAll(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*/g)]
      .map(m => DAY_INDEX[m[1]]);
    const t = seg.toLowerCase().match(
      /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!days.length || !t) continue;
    let [, sh, sm, smer, eh, em, emer] = t;
    // A bare start borrows the end's AM/PM, unless that would put it
    // after the end ("11:30–12:30 PM" means 11:30 AM).
    if (!smer && emer) {
      smer = emer;
      if (clock(sh, sm, smer) > clock(eh, em, emer)) smer = 'am';
    }
    // No AM/PM anywhere: hours 1–7 are afternoon classes.
    const guess = h => (Number(h) >= 1 && Number(h) <= 7 ? 'pm' : null);
    const start = clock(sh, sm, smer || guess(sh));
    const end   = clock(eh, em, emer || guess(eh));
    if (end <= start) continue;
    for (const day of new Set(days)) out.push({ day, start, end });
  }
  return out;
}

export function fmtClock(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
