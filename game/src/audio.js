// audio.js — every sound in Solmar Bay is synthesised with WebAudio.
// There are no audio files: gunfire is filtered noise, the engine is a
// pair of detuned saws, sirens are a wailing triangle, and the ambient
// loop is a slow synthwave chord pad scheduled a bar at a time.
//
// The engine starts muted and wakes on the first user gesture (browser
// autoplay rules). Every method is safe to call before that: it no-ops.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.ambientTimer = null;
    this.chordStep = 0;
  }

  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch { /* silent game is better than a crashed game */ }
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.2, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.12, vol = 0.3, freq = 1200, q = 0.8, delay = 0, sweepTo = null }) {
    if (!this.ctx) return;
    const t0 = this.now() + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  shot(kind) {
    if (kind === 'shotgun') {
      this.noise({ dur: 0.28, vol: 0.55, freq: 700, q: 0.4, sweepTo: 160 });
      this.tone({ freq: 130, freqEnd: 45, type: 'square', dur: 0.16, vol: 0.3 });
    } else if (kind === 'rifle') {
      this.noise({ dur: 0.11, vol: 0.4, freq: 2100, q: 0.7, sweepTo: 500 });
      this.tone({ freq: 190, freqEnd: 70, type: 'square', dur: 0.08, vol: 0.2 });
    } else {
      this.noise({ dur: 0.14, vol: 0.42, freq: 1500, q: 0.6, sweepTo: 320 });
      this.tone({ freq: 160, freqEnd: 60, type: 'square', dur: 0.09, vol: 0.22 });
    }
  }

  punch() {
    this.noise({ dur: 0.07, vol: 0.3, freq: 320, q: 1.2 });
    this.tone({ freq: 95, freqEnd: 50, type: 'sine', dur: 0.09, vol: 0.3 });
  }

  dryFire() { this.tone({ freq: 1900, type: 'square', dur: 0.03, vol: 0.08 }); }
  reload() {
    this.tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.1 });
    this.tone({ freq: 480, type: 'square', dur: 0.04, vol: 0.1, delay: 0.14 });
    this.tone({ freq: 950, type: 'square', dur: 0.04, vol: 0.12, delay: 0.3 });
  }

  blip() { this.tone({ freq: 880, freqEnd: 1320, type: 'sine', dur: 0.09, vol: 0.16 }); }
  cash() {
    this.tone({ freq: 990, type: 'triangle', dur: 0.07, vol: 0.16 });
    this.tone({ freq: 1480, type: 'triangle', dur: 0.11, vol: 0.16, delay: 0.07 });
  }
  hurt() { this.tone({ freq: 220, freqEnd: 110, type: 'sawtooth', dur: 0.14, vol: 0.2 }); }
  crash(intensity = 1) {
    this.noise({ dur: 0.22, vol: 0.25 + 0.3 * Math.min(1, intensity), freq: 300, q: 0.5, sweepTo: 90 });
  }
  door() { this.tone({ freq: 240, freqEnd: 140, type: 'triangle', dur: 0.1, vol: 0.14 }); }

  jingle(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.18, delay: i * 0.11 }));
  }

  // --- standing sounds: engine and siren, started/stopped by main.js ---

  setEngine(on, load = 0) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      oscA.type = 'sawtooth';
      oscB.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.value = 0.0;
      oscA.connect(filter); oscB.connect(filter);
      filter.connect(gain).connect(this.master);
      oscA.start(); oscB.start();
      this.engineNodes = { oscA, oscB, gain, filter };
    }
    if (this.engineNodes) {
      const n = this.engineNodes;
      const t = this.now();
      const rpm = 55 + load * 125;
      n.oscA.frequency.setTargetAtTime(rpm, t, 0.06);
      n.oscB.frequency.setTargetAtTime(rpm * 0.5 + 3, t, 0.06);
      n.filter.frequency.setTargetAtTime(320 + load * 900, t, 0.08);
      n.gain.gain.setTargetAtTime(on ? 0.05 + load * 0.075 : 0, t, 0.09);
      if (!on) {
        const nodes = this.engineNodes;
        this.engineNodes = null;
        window.setTimeout(() => { try { nodes.oscA.stop(); nodes.oscB.stop(); } catch { /* done */ } }, 350);
      }
    }
  }

  setSiren(on, distance = 0) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 845;
      lfo.type = 'sine';
      lfo.frequency.value = 0.65;
      lfoGain.gain.value = 165;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start(); lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    if (this.sirenNodes) {
      const vol = on ? Math.max(0.008, 0.05 - distance * 0.0009) : 0;
      this.sirenNodes.gain.gain.setTargetAtTime(vol, this.now(), 0.15);
      if (!on) {
        const nodes = this.sirenNodes;
        this.sirenNodes = null;
        window.setTimeout(() => { try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* done */ } }, 400);
      }
    }
  }

  // A slow Am–F–C–G pad, one chord every four seconds, kept very quiet.
  startAmbient() {
    if (!this.ctx || this.ambientTimer) return;
    const chords = [
      [110.0, 220.0, 261.6, 329.6],
      [87.3, 174.6, 220.0, 261.6],
      [130.8, 196.0, 261.6, 392.0],
      [98.0, 196.0, 246.9, 293.7],
    ];
    const playChord = () => {
      if (!this.ctx) return;
      const chord = chords[this.chordStep % chords.length];
      this.chordStep++;
      for (const f of chord) {
        this.tone({ freq: f, type: 'triangle', dur: 3.8, vol: 0.016 });
        this.tone({ freq: f * 2.01, type: 'sine', dur: 3.8, vol: 0.006 });
      }
    };
    playChord();
    this.ambientTimer = window.setInterval(playChord, 4000);
  }
}
