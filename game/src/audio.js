// audio.js — every sound in SOLMAR BAY is synthesised with WebAudio at the
// moment it is needed: engine hum, police sirens, gunfire, pickup blips,
// the mission jingle and a slow synthwave pad under the city. There are no
// audio files. The context is created lazily on the first user gesture and
// every method quietly does nothing until then, so headless runs and the
// title screen never error.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineNodes = null;
  let sirenNodes = null;
  let ambientNodes = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gain, filterFreq) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter).connect(amp).connect(master);
    src.start(t0);
  }

  return {
    unlock,
    shot(kind) {
      if (kind === 'shotgun') {
        noiseBurst(0.22, 0.8, 900);
        tone(120, 0.16, 'square', 0.3, 0, 40);
      } else if (kind === 'rifle') {
        noiseBurst(0.07, 0.4, 2400);
      } else if (kind === 'fist') {
        noiseBurst(0.06, 0.3, 500);
      } else {
        noiseBurst(0.1, 0.5, 1700);
        tone(220, 0.07, 'square', 0.18, 0, 90);
      }
    },
    dryFire() {
      tone(1400, 0.03, 'square', 0.08);
    },
    blip() {
      tone(880, 0.07, 'square', 0.16);
      tone(1318, 0.09, 'square', 0.14, 0.06);
    },
    cash() {
      tone(988, 0.06, 'triangle', 0.2);
      tone(1319, 0.06, 'triangle', 0.2, 0.05);
      tone(1568, 0.12, 'triangle', 0.2, 0.1);
    },
    jingle(win) {
      const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
      notes.forEach((n, i) => tone(n, 0.16, 'triangle', 0.22, i * 0.11));
    },
    hurt() {
      tone(160, 0.14, 'sawtooth', 0.25, 0, 70);
    },
    crash(intensity) {
      noiseBurst(0.18, Math.min(0.7, 0.2 + intensity * 0.1), 700);
    },
    // Continuous engine voice while driving; speed 0..1, on=false parks it.
    engine(speed, on) {
      if (!ctx || !master) return;
      if (!on) {
        if (engineNodes) {
          engineNodes.amp.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
        }
        return;
      }
      if (!engineNodes) {
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();
        oscA.type = 'sawtooth';
        oscB.type = 'square';
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        amp.gain.value = 0.0001;
        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(amp).connect(master);
        oscA.start();
        oscB.start();
        engineNodes = { oscA, oscB, filter, amp };
      }
      const t = ctx.currentTime;
      const rpm = 55 + speed * 165;
      engineNodes.oscA.frequency.setTargetAtTime(rpm, t, 0.06);
      engineNodes.oscB.frequency.setTargetAtTime(rpm * 1.5 + 3, t, 0.06);
      engineNodes.filter.frequency.setTargetAtTime(320 + speed * 900, t, 0.08);
      engineNodes.amp.gain.setTargetAtTime(0.05 + speed * 0.075, t, 0.09);
    },
    // Two-tone siren; distance 0..1 fades it.
    siren(on, closeness) {
      if (!ctx || !master) return;
      if (!on) {
        if (sirenNodes) sirenNodes.amp.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenNodes) {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const amp = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 1050;
        lfo.type = 'square';
        lfo.frequency.value = 0.65;
        lfoGain.gain.value = 330;
        lfo.connect(lfoGain).connect(osc.frequency);
        amp.gain.value = 0.0001;
        osc.connect(amp).connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { osc, amp };
      }
      sirenNodes.amp.gain.setTargetAtTime(0.012 + closeness * 0.05, ctx.currentTime, 0.15);
    },
    // The synthwave pad: two detuned saws through a slow-breathing lowpass.
    ambient(on) {
      if (!ctx || !master) return;
      if (!on) {
        if (ambientNodes) ambientNodes.amp.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
        return;
      }
      if (ambientNodes) {
        ambientNodes.amp.gain.setTargetAtTime(0.028, ctx.currentTime, 0.6);
        return;
      }
      const amp = ctx.createGain();
      amp.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 480;
      filter.connect(amp).connect(master);
      const oscs = [];
      for (const freq of [110, 164.8, 220, 277.2]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = (freq % 7) - 3;
        osc.connect(filter);
        osc.start();
        oscs.push(osc);
      }
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 210;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      amp.gain.setTargetAtTime(0.028, ctx.currentTime, 1.2);
      ambientNodes = { amp, oscs };
    },
  };
}
