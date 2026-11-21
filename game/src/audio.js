// SOLMAR BAY — all sound is synthesised with WebAudio; there are no audio
// files. One-shots (gunfire, punches, pickups, jingles) are built from
// oscillators and filtered noise. The engine and the sirens are standing
// loops whose pitch and volume the simulation drives each frame, and a
// slow synthwave pad progression drifts underneath everything.

class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.siren = null;
    this.ambientTimer = null;
    this.padStep = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  tone(freq, dur, { type = "sine", gain = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { gain = 0.3, freq = 1200, q = 0.8, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  shot(kind) {
    if (kind === "shotgun") {
      this.noise(0.28, { gain: 0.5, freq: 700 });
      this.tone(120, 0.2, { type: "square", gain: 0.25, slide: -70 });
    } else if (kind === "rifle") {
      this.noise(0.1, { gain: 0.32, freq: 1800 });
      this.tone(220, 0.07, { type: "square", gain: 0.16, slide: -120 });
    } else {
      this.noise(0.14, { gain: 0.38, freq: 1400 });
      this.tone(180, 0.09, { type: "square", gain: 0.18, slide: -90 });
    }
  }

  dryFire() {
    this.tone(900, 0.04, { type: "square", gain: 0.08 });
  }

  reload() {
    this.tone(500, 0.05, { type: "square", gain: 0.1 });
    this.tone(700, 0.05, { type: "square", gain: 0.1, delay: 0.12 });
  }

  punch() {
    this.noise(0.08, { gain: 0.25, freq: 400 });
  }

  thud() {
    this.tone(90, 0.16, { type: "sine", gain: 0.4, slide: -40 });
    this.noise(0.1, { gain: 0.15, freq: 300 });
  }

  crash(intensity) {
    this.noise(0.3, { gain: 0.2 + 0.3 * intensity, freq: 500 });
    this.tone(70, 0.3, { type: "triangle", gain: 0.3, slide: -30 });
  }

  pickup() {
    this.tone(880, 0.07, { type: "sine", gain: 0.16 });
    this.tone(1320, 0.1, { type: "sine", gain: 0.16, delay: 0.06 });
  }

  cash() {
    this.tone(990, 0.06, { type: "triangle", gain: 0.18 });
    this.tone(1320, 0.06, { type: "triangle", gain: 0.18, delay: 0.05 });
    this.tone(1760, 0.12, { type: "triangle", gain: 0.18, delay: 0.1 });
  }

  jingle(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((n, i) => this.tone(n, 0.22, { type: "triangle", gain: 0.2, delay: i * 0.11 }));
  }

  door() {
    this.tone(240, 0.07, { type: "square", gain: 0.1 });
    this.tone(180, 0.09, { type: "square", gain: 0.1, delay: 0.09 });
  }

  setEngine(on, load) {
    if (!this.ctx) return;
    if (on && !this.engine) {
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc2.type = "square";
      filter.type = "lowpass";
      filter.frequency.value = 500;
      g.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g).connect(this.master);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, filter, g };
    }
    if (this.engine) {
      const t = this.ctx.currentTime;
      const rpm = 55 + load * 165;
      this.engine.osc.frequency.setTargetAtTime(rpm, t, 0.06);
      this.engine.osc2.frequency.setTargetAtTime(rpm * 1.5 + 3, t, 0.06);
      this.engine.filter.frequency.setTargetAtTime(350 + load * 900, t, 0.08);
      this.engine.g.gain.setTargetAtTime(on ? 0.05 + load * 0.05 : 0, t, 0.09);
      if (!on && load <= 0) {
        const eng = this.engine;
        this.engine = null;
        setTimeout(() => {
          try {
            eng.osc.stop();
            eng.osc2.stop();
          } catch {
            // Already stopped.
          }
        }, 350);
      }
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.siren) {
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 950;
      lfo.frequency.value = 0.55;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.value = 0.028;
      osc.connect(g).connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, g };
    } else if (!on && this.siren) {
      const s = this.siren;
      this.siren = null;
      try {
        s.osc.stop();
        s.lfo.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  startAmbient() {
    if (!this.ctx || this.ambientTimer) return;
    // A slow Am — F — C — G drift, one soft pad chord every four seconds.
    const chords = [
      [110, 164.8, 261.6],
      [87.3, 174.6, 220],
      [130.8, 196, 261.6],
      [98, 146.8, 246.9],
    ];
    const play = () => {
      const chord = chords[this.padStep % chords.length];
      this.padStep++;
      for (const f of chord) {
        this.tone(f, 3.8, { type: "triangle", gain: 0.028 });
        this.tone(f * 2, 3.8, { type: "sine", gain: 0.012 });
      }
    };
    play();
    this.ambientTimer = setInterval(play, 4000);
  }
}

export const audio = new AudioSys();
