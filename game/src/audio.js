// WebAudio synth only — no audio files. Engine hum, two-tone sirens,
// gunshots, pickup blips, a mission jingle and a slow synthwave loop.
// Everything starts on the first user gesture (browser autoplay policy).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || !enabled) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || !enabled) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* ignore */ }
  }

  // A slow synthwave bass line: A minor, one note per beat, plus a pad fifth.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (!enabled || !ctx) return;
      const note = BASS[musicStep % BASS.length];
      tone(note, 0.5, 'triangle', 0.1);
      if (musicStep % 4 === 0) tone(note * 2, 0.9, 'sine', 0.05);
      musicStep += 1;
    }, 480);
  }

  return {
    unlock() {
      if (ensure()) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        startMusic();
      }
    },
    setEngine(speed, driving) {
      if (!ctx) return;
      const target = driving ? 0.02 + Math.min(0.09, Math.abs(speed) * 0.002) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 2.2, ctx.currentTime, 0.1);
    },
    setSiren(on, time) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(Math.sin(time * 4) > 0 ? 750 : 950, ctx.currentTime, 0.05);
    },
    gunshot() { noise(0.16, 0.5, 2600); tone(180, 0.1, 'square', 0.12, 60); },
    punch() { noise(0.08, 0.25, 700); },
    pickup() { tone(880, 0.12, 'sine', 0.2); tone(1320, 0.18, 'sine', 0.15); },
    crash() { noise(0.3, 0.4, 500); },
    jingle() { [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => tone(f, 0.25, 'triangle', 0.2), i * 120)); },
    fail() { [330, 262, 196].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'sawtooth', 0.12), i * 150)); },
    toggle() { enabled = !enabled; return enabled; },
    isEnabled() { return enabled; },
  };
}
