// Coinfall sound effects, synthesized with the Web Audio API (no audio files to download).
// Browsers only allow sound after the first click or tap, so everything waits for that.

let ctx = null, master = null, noiseBuf = null, hum = null;
let muted = false, volume = 0.55;
try { muted = localStorage.getItem('coinfall.muted') === '1'; } catch { }

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, ensure, { passive: true }));

function tone(freq, dur, { type = 'sine', vol = 0.25, at = 0, to = null, attack = 0.005 } = {}) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, at = 0, freq = 2000, q = 1, type = 'bandpass', sweep = null } = {}) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  click() { tone(520, 0.05, { type: 'triangle', vol: 0.08 }); },
  chip() { noise(0.05, { vol: 0.35, freq: 3500, q: 3 }); tone(2400, 0.04, { type: 'triangle', vol: 0.06, at: 0.01 }); },
  card() { noise(0.12, { vol: 0.3, freq: 1200, type: 'highpass', sweep: 5000 }); },
  coin() { tone(1320, 0.09, { type: 'square', vol: 0.06 }); tone(1980, 0.18, { type: 'square', vol: 0.06, at: 0.07 }); },
  gem() { tone(880, 0.1, { type: 'triangle', vol: 0.18 }); tone(1320, 0.16, { type: 'triangle', vol: 0.14, at: 0.06 }); },
  tick(p = 1) { tone(1100 * p, 0.02, { type: 'square', vol: 0.04 }); },
  peg() { tone(900 + Math.random() * 700, 0.04, { type: 'sine', vol: 0.06 }); },
  bomb() { noise(0.6, { vol: 0.6, freq: 500, type: 'lowpass', sweep: 80 }); tone(140, 0.45, { type: 'sawtooth', vol: 0.2, to: 40 }); },
  lose() { tone(330, 0.16, { type: 'triangle', vol: 0.16 }); tone(220, 0.3, { type: 'triangle', vol: 0.16, at: 0.12, to: 150 }); },
  win(big = false) {
    const notes = big ? [523, 659, 784, 1047, 1319] : [659, 784, 1047];
    notes.forEach((f, i) => tone(f, big ? 0.32 : 0.22, { type: 'triangle', vol: 0.16, at: i * 0.08 }));
    if (big) notes.forEach((f, i) => tone(f * 2, 0.2, { type: 'sine', vol: 0.05, at: 0.05 + i * 0.08 }));
  },
  cashout() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.06, at: i * 0.05 })); },
  reelStop() { tone(180, 0.09, { type: 'square', vol: 0.12, to: 90 }); noise(0.05, { vol: 0.15, freq: 900 }); },
  flip() { for (let i = 0; i < 8; i++) tone(1500 - i * 80, 0.03, { type: 'square', vol: 0.035, at: i * 0.12 }); },
  spin() { noise(0.4, { vol: 0.12, freq: 600, sweep: 2400 }); },
  boom() { noise(0.9, { vol: 0.7, freq: 900, type: 'lowpass', sweep: 60 }); tone(90, 0.7, { type: 'sawtooth', vol: 0.22, to: 30 }); },
  rain() { for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.08, { type: 'sine', vol: 0.05, at: i * 0.07 }); },
  error() { tone(200, 0.12, { type: 'square', vol: 0.06 }); },
  level() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, { type: 'triangle', vol: 0.15, at: i * 0.09 })); noise(0.5, { vol: 0.08, freq: 6000, type: 'highpass', at: 0.5 }); },
  drop(r) { // case item landed; r = rarity 0..4
    if (r <= 0) tone(520, 0.12, { type: 'triangle', vol: 0.12 });
    else if (r === 1) { tone(660, 0.12, { type: 'triangle', vol: 0.14 }); tone(880, 0.16, { type: 'triangle', vol: 0.12, at: 0.08 }); }
    else { [784, 988, 1175, 1568, 2093].slice(0, r + 1).forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.07, at: i * 0.07 })); if (r >= 3) noise(0.6, { vol: 0.1, freq: 5000, type: 'highpass', at: 0.2 }); }
  },
  // Crash rocket hum: call start(), then set(multiplier) every frame, then stop().
  rocket: {
    start() {
      if (muted || !ensure() || hum) return;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'sine';
      o.frequency.value = 110; o2.frequency.value = 220;
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.3);
      o.connect(g); o2.connect(g); g.connect(master);
      o.start(); o2.start();
      hum = { o, o2, g };
    },
    set(m) { if (!hum) return; const f = 110 + Math.min(600, Math.log(m) * 160); hum.o.frequency.setTargetAtTime(f, ctx.currentTime, 0.05); hum.o2.frequency.setTargetAtTime(f * 2, ctx.currentTime, 0.05); },
    stop() { if (!hum) return; const h = hum; hum = null; try { h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); h.o.stop(ctx.currentTime + 0.3); h.o2.stop(ctx.currentTime + 0.3); } catch { } },
  },
};

export const Sound = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('coinfall.muted', muted ? '1' : '0'); } catch { }
    if (ensure()) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    if (muted) sfx.rocket.stop();
    else sfx.click();
    return muted;
  },
};
