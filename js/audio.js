// Audio sintetizzato con Web Audio API.
// NB: non e' la traccia originale di Moroder (copyright). E' musica generata
// in stile italo-disco/synth: arpeggio + basso + kick four-on-the-floor.
// Anche gli effetti UI sono synth retro, coerenti con la musica.

let ctx, master, musicBus, sfxBus;
let seqId = null, step = 0;
let engineOsc = null, engineGain = null, engineFilter = null;

// File musica per la gara (spazi/parentesi -> URL-encoded). Se manca o l'autoplay
// e' bloccato, si usa il synth come fallback.
const MUSIC_URL = "./Giorgio%20Moroder%20-%20Racer%20(2013).mp3";
let musicEl = null;

const BPM = 123;
const STEP = 60 / BPM / 4; // durata di un sedicesimo (s)

// Progressione Am - F - C - G (i-VI-III-VII), classica italo-disco.
const A = 220.0, C = 261.63, D = 293.66, E = 329.63, F = 349.23, G = 392.0;
const CHORDS = [
  { bass: A / 2, arp: [A, C, E, A * 2] },
  { bass: F / 2, arp: [F, A, C, F * 2] },
  { bass: C / 2, arp: [C, E, G, C * 2] },
  { bass: G / 2, arp: [G, D, G, D * 2] },
];

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
}

// --- helper: nota synth con inviluppo ---
function note(bus, freq, dur, { type = "sawtooth", vol = 0.3, cutoff = 2000, glide = 0 } = {}) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = cutoff;
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp).connect(g).connect(bus);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function noise(bus, dur, vol = 0.3, cutoff = 6000) {
  const t = ctx.currentTime;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp).connect(g).connect(bus);
  src.start(t);
}

function kick() {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(g).connect(musicBus);
  osc.start(t); osc.stop(t + 0.2);
}

// --- sequencer ---
function sequencer() {
  const bar = Math.floor(step / 16) % CHORDS.length;
  const ch = CHORDS[bar];
  const s16 = step % 16;
  if (s16 % 4 === 0) kick();                       // cassa sui battiti
  if (s16 % 2 === 1) noise(musicBus, 0.04, 0.18);  // hi-hat sui controtempi
  if (s16 % 2 === 0) note(musicBus, ch.bass, 0.18, { type: "square", vol: 0.28, cutoff: 700 }); // basso
  note(musicBus, ch.arp[s16 % ch.arp.length] * 2, STEP * 0.9,
       { type: "sawtooth", vol: 0.14, cutoff: 2600 }); // arpeggio
  step++;
}

export const audio = {
  resume() { ensure(); },

  startMusic() {
    ensure();
    // idempotente: se gia' in riproduzione (mp3 o synth) non fare nulla.
    if (musicEl && !musicEl.paused) return;
    if (seqId) return;
    // prova il file mp3; se 404 o autoplay bloccato -> synth
    if (!musicEl) {
      musicEl = new Audio(MUSIC_URL);
      musicEl.loop = true;
      musicEl.preload = "auto";
      musicEl.volume = 0.6;
    }
    musicEl.currentTime = 0;
    musicEl.play()
      .then(() => { this._stopSynth(); })   // mp3 ok: niente synth
      .catch(() => { this._startSynth(); }); // fallback
  },

  _startSynth() {
    ensure();
    if (seqId) return;
    step = 0;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.5);
    seqId = setInterval(sequencer, STEP * 1000);
  },

  _stopSynth() {
    if (!ctx || !seqId) return;
    musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    clearInterval(seqId); seqId = null;
  },

  stopMusic() {
    if (musicEl) { musicEl.pause(); }
    this._stopSynth();
    this.engine(0);
  },

  // suono motore continuo, pitch legato alla velocita' (0..1)
  engine(ratio) {
    ensure();
    if (!engineOsc) {
      engineOsc = ctx.createOscillator(); engineOsc.type = "sawtooth";
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = "lowpass";
      engineFilter.frequency.value = 900;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(60 + ratio * 180, t, 0.05);
    engineGain.gain.setTargetAtTime(ratio > 0.02 ? 0.04 : 0, t, 0.1);
    engineFilter.frequency.setTargetAtTime(500 + ratio * 1800, t, 0.05);
  },

  // ---- effetti UI ----
  click()  { ensure(); note(sfxBus, 660, 0.06, { type: "square", vol: 0.25, cutoff: 4000 }); },
  confirm(){ ensure(); note(sfxBus, 660, 0.08, { type: "square", vol: 0.3 });
             setTimeout(() => note(sfxBus, 990, 0.12, { type: "square", vol: 0.3 }), 70); },
  back()   { ensure(); note(sfxBus, 440, 0.08, { type: "square", vol: 0.25, glide: 0.7 }); },
  count()  { ensure(); note(sfxBus, 880, 0.12, { type: "square", vol: 0.35 }); },
  go()     { ensure(); note(sfxBus, 1320, 0.3, { type: "sawtooth", vol: 0.4, cutoff: 5000 }); },
  lap()    { ensure(); [880, 1320, 1760].forEach((f, i) =>
             setTimeout(() => note(sfxBus, f, 0.1, { type: "square", vol: 0.3 }), i * 60)); },
  crash()  { ensure(); noise(sfxBus, 0.25, 0.5, 300);
             note(sfxBus, 200, 0.3, { type: "sawtooth", vol: 0.3, glide: 0.3 }); },
  finish() { ensure(); [C, E, G, C * 2].forEach((f, i) =>
             setTimeout(() => note(sfxBus, f * 2, 0.18, { type: "square", vol: 0.35 }), i * 110)); },
};
