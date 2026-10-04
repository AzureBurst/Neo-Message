// =====================================================================
//  NEO — sound
//
//  A small palette of interface sounds, synthesised with the Web Audio
//  API so there is nothing to download or host. Any one can be replaced
//  by dropping a file at assets/sfx/<name>.mp3.
//
//  The palette:
//    sent      your message goes out            (two notes rising)
//    received  a message arrives                (two notes falling)
//    unlock    the phone unlocks                (soft ascending triad)
//    open      an app opens                     (quick upward sweep)
//    notify    a notification lands             (gentle two-note bell)
//
//  Everything respects the mute toggle, and browsers only allow audio
//  after the first interaction — which has always happened by the time
//  any of these fire.
// =====================================================================

const MUTE_KEY = 'neo.muted';

export const isMuted    = () => localStorage.getItem(MUTE_KEY) === '1';
export const setMuted   = (v) => localStorage.setItem(MUTE_KEY, v ? '1' : '0');
export const toggleMute = () => { setMuted(!isMuted()); return isMuted(); };

let ctx = null;
const context = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

/* Optional file overrides. A missing file costs nothing. */
function loadSample(name) {
  const slot = { el: null, ready: false };
  try {
    slot.el = new Audio(`assets/sfx/${name}.mp3`);
    slot.el.preload = 'auto';
    slot.el.volume = 0.5;
    slot.el.addEventListener('canplaythrough', () => { slot.ready = true; }, { once: true });
    slot.el.addEventListener('error', () => { slot.ready = false; }, { once: true });
  } catch { slot.el = null; }
  return slot;
}

/* Each sound is notes ([freq, startOffset]) with a peak volume and total
   duration. 'sweep' glides one oscillator between two frequencies. */
const PALETTE = {
  sent:     { notes: [[880, 0], [1320, 0.075]], peak: 0.16, dur: 0.26 },
  received: { notes: [[740, 0], [520, 0.08]],   peak: 0.11, dur: 0.26 },
  unlock:   { notes: [[523, 0], [659, 0.06], [784, 0.12]], peak: 0.12, dur: 0.5 },
  notify:   { notes: [[988, 0], [1319, 0.09]],  peak: 0.11, dur: 0.42, type: 'triangle' },
  open:     { sweep: [320, 900], peak: 0.10, dur: 0.2 }
};

const samples = {};
Object.keys(PALETTE).forEach(n => { samples[n] = loadSample(n); });

function synth(spec) {
  const ac = context();
  if (ac.state === 'suspended') ac.resume();
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(spec.peak, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.dur);

  if (spec.sweep) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.sweep[0], now);
    osc.frequency.exponentialRampToValueAtTime(spec.sweep[1], now + spec.dur * 0.9);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + spec.dur);
  } else {
    spec.notes.forEach(([freq, at]) => {
      const osc = ac.createOscillator();
      osc.type = spec.type || 'sine';
      osc.frequency.setValueAtTime(freq, now + at);
      osc.connect(gain);
      osc.start(now + at);
      osc.stop(now + at + 0.16);
    });
  }
}

export function playSound(name) {
  if (isMuted()) return;
  const spec = PALETTE[name];
  if (!spec) return;
  try {
    const s = samples[name];
    if (s?.ready && s.el) { s.el.currentTime = 0; s.el.play().catch(() => synth(spec)); }
    else synth(spec);
  } catch { /* audio is a nicety — never break the app over it */ }
}

/* Named helpers, so existing callers keep working. */
export const playSent     = () => playSound('sent');
export const playReceived = () => playSound('received');
