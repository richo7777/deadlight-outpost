// audio.js — Deadlight Outpost: all sound is synthesised with WebAudio.
// No audio files. Lazy init: ensure() must be called from a user gesture.
// Every method is a safe no-op before ensure().
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let ambient = null; // { src, gain, filter }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function ready() { return ctx && master; }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Short oscillator blip with pitch glide and exponential decay.
  function tone({ type = 'sine', from = 440, to = null, dur = 0.15, vol = 0.3, delay = 0, attack = 0.005 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Filtered noise burst.
  function noise({ dur = 0.15, vol = 0.4, delay = 0, filterType = 'lowpass', freq = 2000, q = 0.8 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  function click(delay, freq, vol) {
    tone({ type: 'square', from: freq, to: freq * 0.6, dur: 0.04, vol: vol || 0.18, delay: delay || 0 });
  }

  return {
    ensure,

    shot() {
      if (!ready()) return;
      // Crack: bright noise burst + low sine thump.
      noise({ dur: 0.12, vol: 0.5, filterType: 'highpass', freq: 900 });
      tone({ type: 'sine', from: 160, to: 45, dur: 0.14, vol: 0.55 });
    },

    dryFire() {
      if (!ready()) return;
      click(0, 1400, 0.22);
    },

    reloadStart() {
      if (!ready()) return;
      click(0, 900, 0.2);
      click(0.16, 650, 0.2);
    },

    reloadDone() {
      if (!ready()) return;
      click(0, 1100, 0.22);
      click(0.09, 1500, 0.22);
    },

    groan() {
      if (!ready()) return;
      // Sawtooth gliding down with vibrato, random pitch each time.
      const t0 = ctx.currentTime;
      const base = 95 + Math.random() * 70;
      const dur = 0.6 + Math.random() * 0.5;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, base * 0.55), t0 + dur);
      lfo.type = 'sine';
      lfo.frequency.value = 5 + Math.random() * 3;
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + dur + 0.05);
      lfo.stop(t0 + dur + 0.05);
    },

    bite() {
      if (!ready()) return;
      tone({ type: 'sawtooth', from: 90, to: 50, dur: 0.35, vol: 0.35 });
      noise({ dur: 0.25, vol: 0.25, freq: 350 });
    },

    hit() {
      if (!ready()) return;
      tone({ type: 'sine', from: 200, to: 80, dur: 0.09, vol: 0.4 });
      noise({ dur: 0.06, vol: 0.2, freq: 1200 });
    },

    kill() {
      if (!ready()) return;
      tone({ type: 'triangle', from: 420, to: 110, dur: 0.28, vol: 0.3 });
    },

    pickup() {
      if (!ready()) return;
      tone({ type: 'sine', from: 660, dur: 0.1, vol: 0.25 });
      tone({ type: 'sine', from: 880, dur: 0.16, vol: 0.25, delay: 0.09 });
    },

    horn() {
      if (!ready()) return;
      // Wave horn: sawtooth chord, 0.6 s.
      [220, 277.18, 329.63].forEach((f) => {
        tone({ type: 'sawtooth', from: f, dur: 0.6, vol: 0.12, attack: 0.02 });
      });
      tone({ type: 'sine', from: 110, dur: 0.6, vol: 0.15, attack: 0.02 });
    },

    click() {
      if (!ready()) return;
      tone({ type: 'sine', from: 800, to: 600, dur: 0.05, vol: 0.18 });
    },

    win() {
      if (!ready()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.25, delay: i * 0.12 });
      });
    },

    lose() {
      if (!ready()) return;
      tone({ type: 'sawtooth', from: 300, to: 70, dur: 1.2, vol: 0.22, attack: 0.03 });
      tone({ type: 'sine', from: 150, to: 40, dur: 1.2, vol: 0.2, attack: 0.03 });
    },

    startAmbient() {
      if (!ready() || ambient) return;
      // Looped filtered noise (wind), low gain.
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      // Slow swell so the wind breathes.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1;
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(filter).connect(g).connect(master);
      src.start();
      lfo.start();
      ambient = { src, gain: g, lfo };
    },

    stopAmbient() {
      if (!ambient) return;
      try { ambient.src.stop(); } catch (_) {}
      try { ambient.lfo.stop(); } catch (_) {}
      try { ambient.gain.disconnect(); } catch (_) {}
      ambient = null;
    },

    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },

    get muted() { return muted; },
  };
}
