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

/* If you drop a file in, it wins. A missing file costs nothing — the
   error is swallowed and we fall back to the synthesised tone. */
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

const samples = { sent: loadSample('sent'), received: loadSample('received') };

/**
 * Two quick notes, each fading out fast. Sending rises; receiving
 * falls. Opposite shapes are far easier to tell apart mid-conversation
 * than two tones at different pitches, so you know without looking
 * whether that was you or them.
 */
function blip(kind) {
  const notes = kind === 'received' ? [[740, 0], [520, 0.08]]
                                    : [[880, 0], [1320, 0.075]];
  const ac = context();
  if (ac.state === 'suspended') ac.resume();

  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(0.0001, now);

  notes.forEach(([freq, at]) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + at);
    osc.connect(gain);
    osc.start(now + at);
    osc.stop(now + at + 0.14);
  });

  // Incoming is quieter. It arrives unbidden, so it should not startle.
  gain.gain.exponentialRampToValueAtTime(kind === 'received' ? 0.11 : 0.16, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
}

function play(kind) {
  if (isMuted()) return;
  try {
    const s = samples[kind];
    if (s?.ready && s.el) {
      s.el.currentTime = 0;
      s.el.play().catch(() => blip(kind));
    } else {
      blip(kind);
    }
  } catch { /* audio is a nicety — never break messaging over it */ }
}

export const playSent     = () => play('sent');
export const playReceived = () => play('received');
