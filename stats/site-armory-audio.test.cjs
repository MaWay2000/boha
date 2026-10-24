const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createAudio, MAX_VOICES } = require('../site-armory-audio.js');

function fixture({ suspended = false, deferred = false, rejected = false, broken = false } = {}) {
  const contexts = [], reports = [];
  const param = () => ({ value: 0, events: [],
    setValueAtTime(...args) { this.events.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); } });
  class Node {
    constructor(kind) {
      this.kind = kind; this.connections = []; this.gain = param(); this.frequency = param(); this.Q = param();
      for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = param();
    }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; }
    start(...args) { this.started = args; }
    stop(...args) { (this.stops ||= []).push(args); }
  }
  class Context {
    constructor() {
      if (broken) throw Error('Audio disabled by browser');
      contexts.push(this); this.nodes = []; this.buffers = []; this.state = suspended ? 'suspended' : 'running';
      this.sampleRate = 48000; this.currentTime = 10; this.destination = new Node('destination');
    }
    add(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
    createGain() { return this.add('gain'); }
    createDynamicsCompressor() { return this.add('compressor'); }
    createOscillator() { return this.add('oscillator'); }
    createBufferSource() { return this.add('noise'); }
    createBiquadFilter() { return this.add('filter'); }
    createBuffer(channels, length, rate) {
      const samples = new Float32Array(length), buffer = { channels, length, rate, getChannelData: () => samples };
      this.buffers.push(buffer); return buffer;
    }
    resume() {
      if (rejected) return Promise.reject(Error('Gesture required'));
      if (deferred) return new Promise((resolve, reject) => {
        this.finishResume = () => { this.state = 'running'; resolve(); };
        this.failResume = () => reject(Error('Context closed while resuming'));
      });
      this.state = 'running'; return Promise.resolve();
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const win = { AudioContext: Context }, audio = createAudio(win, state => reports.push(state));
  return { win, audio, contexts, reports, sources: () => contexts.flatMap(ctx => ctx.nodes.filter(node => ['noise', 'oscillator'].includes(node.kind))) };
}

test('audio is lazy, quiet until a firing gesture, and uses a limited-volume compressor output', () => {
  const f = fixture(); assert.equal(f.contexts.length, 0); assert.equal(f.reports.at(-1).state, 'idle');
  f.audio.setEnabled(false); assert.equal(f.audio.play('cannon'), false); assert.equal(f.contexts.length, 0);
  f.audio.setEnabled(true); assert.equal(f.audio.play('unknown'), false); assert.equal(f.contexts.length, 0);
  assert.equal(f.audio.play('cannon'), true);
  const ctx = f.contexts[0];
  assert.equal(ctx.nodes[0].gain.value, .28); assert.equal(ctx.nodes[1].ratio.value, 10);
  assert.equal(ctx.nodes[1].connections[0], ctx.destination);
  assert.equal(ctx.buffers.length, 1); assert.equal(ctx.buffers[0].channels, 1);
});

test('machine gun schedules exactly three short rounds 47ms apart with body and crack layers', () => {
  const f = fixture(); f.audio.play('machinegun');
  const noise = f.sources().filter(node => node.kind === 'noise');
  assert.equal(f.sources().length, 6); assert.equal(noise.length, 3);
  assert.ok(Math.abs(noise[1].started[0] - noise[0].started[0] - .047) < .000001);
  assert.ok(Math.abs(noise[2].started[0] - noise[1].started[0] - .047) < .000001);
  assert.equal(f.reports.at(-1).lastSound, 'machinegun');
});

test('cannon layers an initial crack with low-frequency boom; laser has its own descending pulse', () => {
  const cannon = fixture(); cannon.audio.play('cannon');
  assert.equal(cannon.sources().length, 4);
  const sub = cannon.sources().find(node => node.type === 'sine');
  assert.deepEqual(sub.frequency.events.at(-1).slice(0, 2), ['exponential', 32]);
  const laser = fixture(); laser.audio.play('laser');
  assert.equal(laser.sources().length, 3);
  const pulse = laser.sources().find(node => node.type === 'sawtooth');
  assert.deepEqual(pulse.frequency.events.map(event => event[1]), [1350, 150]);
});

test('all voices have short release envelopes, scheduled stops and complete node cleanup', () => {
  const f = fixture(); f.audio.play('cannon');
  for (const source of f.sources()) {
    assert.ok(source.started[0] >= 10); assert.ok(source.stops[0][0] <= 10.6);
    const gain = f.contexts[0].nodes.find(node => node.kind === 'gain' && node.connections[0] === f.contexts[0].nodes[0] && !node.disconnected);
    assert.equal(gain.gain.events.at(-1)[1], .0001);
    source.onended(); assert.equal(source.disconnected, true);
  }
  assert.equal(f.contexts[0].nodes.filter(node => node.kind === 'filter').every(node => node.disconnected), true);
});

test('mute stops current and scheduled rounds immediately and blocks further playback', () => {
  const f = fixture(); f.audio.play('machinegun'); const count = f.sources().length;
  f.audio.setEnabled(false);
  assert.equal(f.sources().every(node => node.disconnected && node.stops.at(-1).length === 0), true);
  assert.equal(f.audio.play('laser'), false); assert.equal(f.sources().length, count);
  assert.equal(f.reports.at(-1).state, 'muted');
  f.audio.setEnabled(true); f.audio.play('laser'); assert.equal(f.sources().length, count + 3);
  assert.equal(f.contexts.length, 1); assert.equal(f.contexts[0].buffers.length, 1);
});

test('pending audio resume cannot release a delayed shot after stop or mute', async () => {
  for (const action of ['stop', 'mute']) {
    const f = fixture({ suspended: true, deferred: true }); f.audio.play('machinegun');
    if (action === 'stop') f.audio.stop(); else f.audio.setEnabled(false);
    f.contexts[0].finishResume(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.sources().length, 0);
  }
});

test('suspended audio resumes from the firing gesture and failures degrade to silent gameplay', async () => {
  const good = fixture({ suspended: true }); good.audio.play('laser');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(good.sources().length, 3);
  for (const options of [{ broken: true }, { suspended: true, rejected: true }]) {
    const f = fixture(options); assert.doesNotThrow(() => f.audio.play('cannon'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.reports.at(-1).available, false); assert.equal(f.audio.play('laser'), false);
  }
  const missing = createAudio({}, info => assert.equal(info.available, false));
  assert.equal(missing.play('machinegun'), false);
});

test('a cancelled old context resume cannot disable a new audio session', async () => {
  const f = fixture({ suspended: true, deferred: true }); f.audio.play('cannon');
  const old = f.contexts[0]; f.audio.dispose(); f.audio.play('laser');
  old.failResume(); f.contexts[1].finishResume();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.reports.at(-1).available, true); assert.equal(f.reports.at(-1).lastSound, 'laser');
});

test('polyphony is bounded and disposal closes audio; a later firing gesture can recreate it', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.audio.play('machinegun');
  assert.ok(f.sources().filter(node => !node.disconnected).length <= MAX_VOICES);
  f.audio.dispose(); assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.sources().every(node => node.disconnected), true);
  f.audio.play('cannon'); assert.equal(f.contexts.length, 2); assert.equal(f.reports.at(-1).state, 'running');
});

test('audio is self-contained and is loaded before gameplay with accessible mute control', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.ok(html.indexOf('src="site-armory-audio.js') < html.indexOf('src="site-armory.js'));
  assert.match(html, /id="armorySound" aria-label="Gun sounds" aria-pressed="true"/);
  const source = fs.readFileSync(require.resolve('../site-armory-audio.js'), 'utf8');
  assert.doesNotMatch(source, /fetch\(|new Audio\(|https:\/\/|localStorage|setInterval/);
  const game = fs.readFileSync(require.resolve('../site-armory.js'), 'utf8');
  assert.ok(game.indexOf('if (!result.fired) return;') < game.indexOf('sound?.play(weapon)'));
  assert.match(game, /visibilitychange[^\n]*sound\?\.stop\(\)/);
});

test('each gun has a distinct short selection sound, without firing or starting autoplay on load', () => {
  const signatures = [];
  for (const weapon of ['machinegun', 'cannon', 'laser', 'rockets']) {
    const f = fixture(); assert.equal(f.contexts.length, 0);
    assert.equal(f.audio.select(weapon), true); assert.equal(f.reports.at(-1).lastSound, weapon + '-select');
    assert.equal(f.sources().length, 3);
    const signature = f.sources().map(node => [node.kind, node.type, node.frequency.events.map(event => event[1])]);
    signatures.push(JSON.stringify(signature));
    for (const source of f.sources()) assert.ok(source.stops[0][0] < 10.3);
  }
  assert.equal(new Set(signatures).size, 4);
});

test('selection sound respects mute, and selecting another gun cancels old selection sounds', () => {
  const f = fixture(); f.audio.select('cannon');
  const old = f.sources(); f.audio.select('laser');
  assert.equal(old.every(source => source.disconnected), true);
  f.audio.setEnabled(false); const count = f.sources().length;
  assert.equal(f.audio.select('machinegun'), false); assert.equal(f.sources().length, count);
  assert.equal(f.reports.at(-1).state, 'muted');
});

test('rockets have two bounded launch sounds 70ms apart and obey mute and stop', () => {
  const f = fixture(); assert.equal(f.audio.play('rockets'), true);
  assert.equal(f.reports.at(-1).lastSound, 'rockets');
  assert.equal(f.sources().length, 6);
  assert.ok(Math.abs(f.sources()[3].started[0] - f.sources()[0].started[0] - .07) < 1e-9);
  for (const source of f.sources()) assert.ok(source.stops[0][0] < 10.7);
  f.audio.stop(); assert.equal(f.sources().every(source => source.disconnected), true);
  f.audio.setEnabled(false); const count = f.sources().length;
  assert.equal(f.audio.play('rockets'), false); assert.equal(f.sources().length, count);
});
