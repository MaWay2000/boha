(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryAudio = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_VOICES = 32;
  function createAudio(win, onState = () => {}) {
    const Context = win.AudioContext || win.webkitAudioContext;
    let context = null, output = null, limiter = null, noiseBuffer = null;
    let enabled = true, available = !!Context, generation = 0;
    const voices = new Set();
    const report = (lastSound = '') => onState({ enabled, available, state: !available ? 'unavailable' : !enabled ? 'muted' : context?.state || 'idle', lastSound });
    function stop() {
      generation++;
      for (const voice of [...voices]) voice.stop();
    }
    function initialize() {
      if (context) return;
      // Created only by a weapon-selection/firing gesture, never on page load.
      context = new Context({ latencyHint: 'interactive' });
      output = context.createGain(); output.gain.value = .28;
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 10;
      limiter.attack.value = .003; limiter.release.value = .15;
      output.connect(limiter); limiter.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    function voice(source, filter, time, duration, level) {
      while (voices.size >= MAX_VOICES) voices.values().next().value.stop();
      const gain = context.createGain();
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.linearRampToValueAtTime(level, time + .002);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      source.connect(filter || gain);
      if (filter) filter.connect(gain);
      gain.connect(output);
      let ended = false;
      const cleanup = () => {
        if (ended) return;
        ended = true; source.onended = null;
        source.disconnect(); filter?.disconnect(); gain.disconnect(); voices.delete(handle);
      };
      const handle = { stop() { try { source.stop(); } catch {} cleanup(); } };
      voices.add(handle); source.onended = cleanup;
      try { source.start(time, 0, duration); source.stop(time + duration + .01); }
      catch (error) { handle.stop(); throw error; }
    }
    function noise(time, duration, level, type, frequency) {
      const source = context.createBufferSource(); source.buffer = noiseBuffer;
      const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .7;
      voice(source, filter, time, duration, level);
    }
    function tone(time, duration, level, type, from, to) {
      const source = context.createOscillator(); source.type = type;
      source.frequency.setValueAtTime(from, time);
      source.frequency.exponentialRampToValueAtTime(to, time + duration);
      voice(source, null, time, duration, level);
    }
    function schedule(kind, action) {
      const time = context.currentTime + .008;
      if (action === 'select') {
        if (kind === 'machinegun') {
          noise(time, .035, .35, 'highpass', 2400);
          noise(time + .075, .045, .4, 'bandpass', 1600);
          tone(time + .075, .07, .2, 'triangle', 190, 90);
        } else if (kind === 'cannon') {
          noise(time, .14, .36, 'bandpass', 480);
          tone(time, .18, .34, 'triangle', 220, 65);
          noise(time + .14, .04, .3, 'highpass', 2100);
        } else if (kind === 'rockets') {
          noise(time, .08, .28, 'bandpass', 850);
          noise(time + .09, .06, .32, 'highpass', 1800);
          tone(time + .07, .15, .23, 'triangle', 110, 280);
        } else {
          tone(time, .14, .19, 'sine', 380, 760);
          tone(time + .1, .12, .14, 'triangle', 950, 1500);
          noise(time, .025, .08, 'bandpass', 3000);
        }
      } else if (kind === 'machinegun') {
        for (let i = 0; i < 3; i++) {
          const at = time + i * .047;
          noise(at, .062, .65, 'highpass', 950);
          tone(at, .075, .38, 'triangle', 180, 65);
        }
      } else if (kind === 'cannon') {
        noise(time, .045, .9, 'highpass', 1600);
        noise(time, .48, .85, 'lowpass', 650);
        tone(time, .52, .9, 'sine', 155, 32);
        tone(time, .24, .24, 'triangle', 82, 38);
      } else if (kind === 'rockets') {
        for (let i = 0; i < 2; i++) {
          const at = time + i * .07;
          noise(at, .35, .45, 'bandpass', 1100);
          tone(at, .26, .22, 'sawtooth', 90, 360);
          noise(at + .12, .4, .55, 'lowpass', 450);
        }
      } else {
        tone(time, .23, .3, 'sawtooth', 1350, 150);
        tone(time, .16, .25, 'sine', 2350, 340);
        noise(time, .07, .12, 'bandpass', 3000);
      }
      report(action === 'select' ? kind + '-select' : kind);
    }
    function unavailable() { stop(); available = false; report(); }
    function play(kind, action = 'fire') {
      if (!enabled || !available || !['machinegun', 'cannon', 'laser', 'rockets'].includes(kind)) return false;
      if (!['fire', 'select'].includes(action)) return false;
      try {
        initialize();
        const token = generation;
        if (context.state === 'running') schedule(kind, action);
        else context.resume().then(() => {
          // A pending resume must never fire a delayed burst after mute/disarm.
          if (enabled && available && token === generation && context?.state === 'running') {
            try { schedule(kind, action); } catch { unavailable(); }
          }
        }).catch(() => { if (token === generation) unavailable(); });
        return true;
      } catch { unavailable(); return false; }
    }
    function setEnabled(value) { enabled = !!value; if (!enabled) stop(); report(); }
    function dispose() {
      stop();
      const previous = context;
      context = null; output?.disconnect(); limiter?.disconnect(); output = limiter = noiseBuffer = null;
      if (previous && previous.state !== 'closed') { try { previous.close().catch(() => {}); } catch {} }
      report();
    }
    report();
    function select(kind) { stop(); return play(kind, 'select'); }
    return { play, select, stop, dispose, setEnabled, isEnabled: () => enabled };
  }
  return { MAX_VOICES, createAudio };
});
