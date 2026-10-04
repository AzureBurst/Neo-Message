// =====================================================================
//  NEO MESSAGE — one time zone for everyone
//
//  Browsers show dates in the viewer's own time zone, so a player in
//  California would see the story clock three hours behind the GM in
//  New York. This makes every page behave as if the computer were set
//  to the story's time zone instead: the clock, message times, the
//  calendar, due dates and every time you type in read the same for
//  every player, wherever they are.
//
//  The zone defaults to US Eastern. To change it, add a line to
//  js/config.js:   export const STORY_TZ = 'America/Los_Angeles';
//  (any IANA zone name; 'UTC' works too).
//
//  Loaded first by supa.js, before any other app code runs.
// =====================================================================

import * as cfg from './config.js';

const ZONE = validZone(cfg.STORY_TZ) || 'America/New_York';
export const STORY_TZ = ZONE;

function validZone(z) {
  if (!z) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; }
  catch { console.warn(`[tz] Unknown STORY_TZ "${z}", using America/New_York`); return null; }
}

const NativeDate = Date;
const P = NativeDate.prototype;
const native = {
  getTime: P.getTime, setTime: P.setTime,
  toLocaleString: P.toLocaleString, toLocaleDateString: P.toLocaleDateString,
  toLocaleTimeString: P.toLocaleTimeString
};

/* ---------- zone offset (ms to add to UTC to get story wall time) --- */

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric'
});
const cache = new Map();

function offsetAt(t) {
  if (!Number.isFinite(t)) return 0;
  const key = Math.floor(t / 900000);              // offsets change on 15-min boundaries at most
  if (cache.has(key)) return cache.get(key);
  const p = {};
  for (const { type, value } of parts.formatToParts(new NativeDate(t))) p[type] = value;
  let y = +p.year;
  if (p.era === 'BC') y = 1 - y;
  const wall = NativeDate.UTC(y, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const off = wall - (t - (((t % 1000) + 1000) % 1000));
  if (cache.size > 5000) cache.clear();
  cache.set(key, off);
  return off;
}

/** Story wall-clock time (as a UTC-based millisecond count) → real instant. */
function fromWall(w) {
  if (!Number.isFinite(w)) return NaN;
  let t = w - offsetAt(w);
  t = w - offsetAt(t);
  return t;
}
const wallOf = d => { const t = native.getTime.call(d); return new NativeDate(t + offsetAt(t)); };

/* ---------- getters and setters read and write story wall time ------ */

const FIELDS = ['FullYear', 'Month', 'Date', 'Hours', 'Minutes', 'Seconds', 'Milliseconds'];
for (const f of FIELDS) {
  const utcGet = P['getUTC' + f], utcSet = P['setUTC' + f];
  P['get' + f] = function () {
    const t = native.getTime.call(this);
    return Number.isNaN(t) ? NaN : utcGet.call(wallOf(this));
  };
  P['set' + f] = function (...a) {
    const t = native.getTime.call(this);
    const w = Number.isNaN(t)
      ? (f === 'FullYear' ? new NativeDate(0) : new NativeDate(NaN))   // spec: setFullYear on NaN starts at +0
      : wallOf(this);
    utcSet.apply(w, a);
    return native.setTime.call(this, fromWall(native.getTime.call(w)));
  };
}
P.getDay = function () {
  const t = native.getTime.call(this);
  return Number.isNaN(t) ? NaN : P.getUTCDay.call(wallOf(this));
};
P.getYear = function () { return this.getFullYear() - 1900; };
P.getTimezoneOffset = function () {
  const t = native.getTime.call(this);
  return Number.isNaN(t) ? NaN : -offsetAt(t) / 60000;
};

/* ---------- formatting defaults to the story zone ------------------- */

const withZone = (o) => (o && o.timeZone) ? o : { ...(o || {}), timeZone: ZONE };
P.toLocaleString     = function (loc, o) { return native.toLocaleString.call(this, loc, withZone(o)); };
P.toLocaleDateString = function (loc, o) { return native.toLocaleDateString.call(this, loc, withZone(o)); };
P.toLocaleTimeString = function (loc, o) { return native.toLocaleTimeString.call(this, loc, withZone(o)); };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');
P.toDateString = function () {
  if (Number.isNaN(native.getTime.call(this))) return 'Invalid Date';
  const y = this.getFullYear();
  return `${DAYS[this.getDay()]} ${MONS[this.getMonth()]} ${p2(this.getDate())} ${y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')}`;
};
P.toTimeString = function () {
  if (Number.isNaN(native.getTime.call(this))) return 'Invalid Date';
  const m = -this.getTimezoneOffset(), s = m < 0 ? '-' : '+', a = Math.abs(m);
  return `${p2(this.getHours())}:${p2(this.getMinutes())}:${p2(this.getSeconds())} GMT${s}${p2(Math.floor(a / 60))}${p2(a % 60)}`;
};
P.toString = function () {
  if (Number.isNaN(native.getTime.call(this))) return 'Invalid Date';
  return `${this.toDateString()} ${this.toTimeString()}`;
};

/* ---------- Intl formatters made without a zone use the story zone -- */

const NativeDTF = Intl.DateTimeFormat;
function DTF(loc, o) { return new NativeDTF(loc, withZone(o)); }
DTF.prototype = NativeDTF.prototype;
DTF.supportedLocalesOf = NativeDTF.supportedLocalesOf;
Intl.DateTimeFormat = DTF;

/* ---------- new Date(y, m, d, …) and zoneless strings are story time  */

// "2160-09-15T10:40", "2160-09-15 10:40:00" etc. — date AND time with no
// Z or offset. (A date alone, "2160-09-15", is UTC by the standard and
// is left alone.)
const LOCAL_ISO = /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
function parseLocal(s) {
  const m = typeof s === 'string' && s.trim().match(LOCAL_ISO);
  if (!m) return null;
  const ms = m[7] ? +m[7].padEnd(3, '0') : 0;
  return fromWall(NativeDate.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), ms));
}

function StoryDate(...a) {
  if (!new.target) return new StoryDate().toString();
  let t;
  if (a.length >= 2) {
    const n = a.map(Number);
    t = fromWall(NativeDate.UTC(...n));
  } else if (a.length === 1 && typeof a[0] === 'string') {
    const local = parseLocal(a[0]);
    t = local ?? native.getTime.call(new NativeDate(a[0]));
  }
  return t === undefined ? Reflect.construct(NativeDate, a, new.target)
                         : Reflect.construct(NativeDate, [t], new.target);
}
StoryDate.prototype = P;
StoryDate.now = NativeDate.now;
StoryDate.UTC = NativeDate.UTC;
StoryDate.parse = (s) => parseLocal(s) ?? NativeDate.parse(s);
Object.defineProperty(P, 'constructor', { value: StoryDate, writable: true, configurable: true });
globalThis.Date = StoryDate;
