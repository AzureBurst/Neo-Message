// =====================================================================
//  NEO MESSAGE — sounds
//
//  A short tone when your message goes out. Synthesised with the Web
//  Audio API rather than shipped as a file, so there is nothing to
//  download and nothing to host — but drop a file at assets/sfx/sent.mp3
//  and it takes over.
//
//  Browsers refuse to play audio until the page has been clicked, which
//  is fine here: you cannot send a message without clicking or typing
//  first, so by the time this matters the gesture has happened.
// =====================================================================

const MUTE_KEY = 'neo.muted';

export const isMuted   = () => localStorage.getItem(MUTE_KEY) === '1';
export const setMuted  = (v) => localStorage.setItem(MUTE_KEY, v ? '1' : '0');
export const toggleMute = () => { setMuted(!isMuted()); return isMuted(); };

let ctx = null;
const context = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

/* If you drop a file in, it wins. Missing file costs nothing — the
   error is swallowed and we fall back to the synthesised tone. */
let sample = null;
try {
  sample = new Audio('assets/sfx/sent.mp3');
  sample.preload = 'auto';
  sample.volume = 0.5;
} catch { sample = null; }
let sampleUsable = false;
if (sample) {
  sample.addEventListener('canplaythrough', () => { sampleUsable = true; }, { once: true });
  sample.addEventListener('error', () => { sampleUsable = false; }, { once: true });
}

/**
 * Two quick notes rising a fifth, each fading out fast. Short and dry,
 * so it reads as a confirmation rather than a notification — you will
 * hear it a hundred times in a session.
 */
function blip() {
  const ac = context();
  if (ac.state === 'suspended') ac.resume();

  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(0.0001, now);

  [[880, 0], [1320, 0.075]].forEach(([freq, at]) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + at);
    osc.connect(gain);
    osc.start(now + at);
    osc.stop(now + at + 0.14);
  });

  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
}

export function playSent() {
  if (isMuted()) return;
  try {
    if (sampleUsable) { sample.currentTime = 0; sample.play().catch(() => blip()); }
    else blip();
  } catch { /* audio is a nicety, never break sending over it */ }
}
