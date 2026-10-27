(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryScores = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'boha.armory.scores.v1', LIMIT = 10;
  const ENDPOINT = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/armory';
  const PUBLICATION = 'stats/published/armory-scores.json';
  const PUBLICATION_ENDPOINT = 'https://raw.githubusercontent.com/MaWay2000/boha/main/' + PUBLICATION;
  function normalizeName(value) {
    return typeof value === 'string' ? value.normalize('NFC').replace(/\s+/gu, ' ').trim() : '';
  }
  function validName(value) {
    const name = normalizeName(value);
    return [...name].length >= 1 && [...name].length <= 24 && /[\p{L}\p{N}\p{P}\p{S}]/u.test(name) &&
      !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name);
  }
  const identity = name => normalizeName(name).toLowerCase();
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e9;
  function normalizeEntry(value) {
    if (!value || typeof value !== 'object' || !validName(value.name) || !integer(value.score) || value.score < 1 ||
      !integer(value.kills) || !integer(value.bosses) || value.score !== value.kills + value.bosses ||
      !integer(value.wave) || value.wave < 1 || !Number.isFinite(value.power) || value.power < 0 || value.power > 1e12 ||
      !Number.isSafeInteger(value.savedAt) || value.savedAt < 0 || value.savedAt > 8640000000000000) return null;
    return { name: normalizeName(value.name), score: value.score, wave: value.wave, power: value.power,
      kills: value.kills, bosses: value.bosses, savedAt: value.savedAt };
  }
  function compare(a, b) {
    return b.score - a.score || b.wave - a.wave || b.power - a.power || a.savedAt - b.savedAt ||
      (identity(a.name) < identity(b.name) ? -1 : identity(a.name) > identity(b.name) ? 1 : 0);
  }
  function normalizePublication(value) {
    if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.publishedAt) || value.publishedAt <= 0 ||
      value.publishedAt > 8640000000000000 || !Array.isArray(value.entries) || value.entries.length > LIMIT ||
      value.entries.some(row => !normalizeEntry(row))) throw Error('Invalid published leaderboard.');
    return { schemaVersion: 1, publishedAt: value.publishedAt, entries: rank(value.entries) };
  }
  function rank(entries) {
    const best = new Map();
    for (const raw of Array.isArray(entries) ? entries.slice(0, 100) : []) {
      const entry = normalizeEntry(raw);
      if (!entry) continue;
      const key = identity(entry.name), previous = best.get(key);
      if (!previous || compare(entry, previous) < 0) best.set(key, entry);
    }
    return [...best.values()].sort(compare).slice(0, LIMIT);
  }
  function parse(raw) {
    if (typeof raw !== 'string' || raw.length > 65536) return { lastName: '', entries: [] };
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 1) return { lastName: '', entries: [] };
      return { lastName: validName(value.lastName) ? normalizeName(value.lastName) : '', entries: rank(value.entries) };
    } catch { return { lastName: '', entries: [] }; }
  }
  function createStore(win) {
    let memory = { lastName: '', entries: [] }, persistent = true;
    function read() {
      try {
        const stored = parse(win.localStorage.getItem(STORAGE_KEY));
        memory = { lastName: stored.lastName || memory.lastName, entries: rank([...stored.entries, ...memory.entries]) };
      } catch { persistent = false; }
      return memory;
    }
    function write(next) {
      memory = next;
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...next })); persistent = true; }
      catch { persistent = false; }
    }
    read();
    return {
      lastName: () => read().lastName,
      entries: () => read().entries.map(entry => ({ ...entry })),
      isPersistent: () => persistent,
      remember(name) {
        if (!validName(name)) return false;
        const current = read(); write({ ...current, lastName: normalizeName(name) }); return true;
      },
      forgetName() { write({ ...read(), lastName: '' }); },
      record(value) {
        const entry = normalizeEntry(value);
        if (!entry) return false;
        const current = read(), entries = rank([...current.entries, entry]);
        if (JSON.stringify(entries) === JSON.stringify(current.entries)) return false;
        write({ ...current, entries }); return true;
      }
    };
  }
  function createOnline(win, changed = () => {}, endpoint = ENDPOINT) {
    let rows = [], player = '', token = '', pending = null, timer = null, connecting = null, posting = false;
    let generation = 0, sequence = 0, applied = 0, retries = 0, retryFloor = 5000, phase = 'idle', error = '';
    let source = '', publishedAt = 0, liveCheckedAt = 0;
    const report = (next, message = '') => { phase = next; error = message; changed(); };
    const clearTimer = () => { if (timer != null) win.clearTimeout(timer); timer = null; };
    async function request(path, payload, published = false, publishedUrl = PUBLICATION_ENDPOINT) {
      const controller = win.AbortController ? new win.AbortController() : null;
      const timeout = controller && win.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await win.fetch(published ? publishedUrl : endpoint + path, { method: payload ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
          ...(controller ? { signal: controller.signal } : {}),
          ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true } : {}) });
        if (!response.ok) { const failure = Error(response.status === 401 ? 'Session expired — start a new round.' : response.status === 429 ? 'Score service busy — retrying shortly.' : 'Score service unavailable — try again.'); failure.status = response.status; throw failure; }
        const result = await response.json();
        if (published) return normalizePublication(result);
        if (result?.schemaVersion !== 1 || !Array.isArray(result.entries) || result.entries.length > LIMIT || result.entries.some(row => !normalizeEntry(row))) throw Error('Invalid leaderboard response.');
        return result;
      } finally { if (timeout) win.clearTimeout(timeout); }
    }
    const accept = (result, order, origin = 'live') => {
      if (order < applied) return false;
      rows = rank(result.entries); applied = order; source = origin; publishedAt = origin === 'published' ? result.publishedAt : 0;
      if (origin === 'live') liveCheckedAt = Date.now();
      return true;
    };
    function retry() {
      if (!pending || timer != null || retries >= 3) return;
      timer = win.setTimeout(() => { timer = null; pump(); }, Math.min(60000, Math.max(retryFloor, 5000 * 2 ** retries++)));
    }
    function connect() {
      if (connecting || !player) return connecting;
      const current = generation, order = ++sequence;
      report('connecting');
      connecting = request('/sessions', { name: player }).then(result => {
        if (current !== generation) return;
        if (!/^[a-f0-9]{64}$/.test(result.token)) throw Error('Invalid game session.');
        token = result.token; accept(result, order); retries = 0; report('ready');
        return normalizeEntry(result.playerScore);
      }).catch(failure => { if (current === generation) { retryFloor = failure.status === 429 ? 60000 : 5000; report('error', failure.message || 'Score service unavailable.'); } })
        .finally(() => { if (current === generation) { connecting = null; if (token && pending) pump(); else retry(); } });
      return connecting;
    }
    function pump() {
      if (!pending || posting) return;
      if (!token) { connect(); return; }
      const entry = pending, current = generation, order = ++sequence; pending = null; posting = true;
      report('saving');
      request('/scores', { token, score: entry.score, wave: entry.wave, power: entry.power, kills: entry.kills, bosses: entry.bosses }).then(result => {
        if (current !== generation) return;
        accept(result, order); retries = 0; report('ready');
      }).catch(failure => {
        if (current !== generation) return;
        if (!pending || compare(entry, pending) < 0) pending = entry;
        retryFloor = failure.status === 429 ? 60000 : 5000;
        if (failure.status === 401 || failure.status === 422) retries = 3;
        report('error', failure.message || 'Score service unavailable.');
      }).finally(() => {
        if (current !== generation) return;
        posting = false;
        if (pending && phase === 'error') retry();
        else if (pending) schedule();
        else changed();
      });
    }
    function schedule() {
      if (timer == null && pending && retries < 3) timer = win.setTimeout(() => { timer = null; pump(); }, 2000);
    }
    function clear() { generation++; clearTimer(); token = ''; player = ''; pending = null; connecting = null; posting = false; retries = 0; retryFloor = 5000; }
    return {
      entries: () => rows.map(row => ({ ...row })),
      status: () => ({ phase, error, pending: !!pending || posting, source, publishedAt }),
      begin(name) { clear(); if (!validName(name)) return; player = normalizeName(name); return connect(); },
      save(entry) { const value = normalizeEntry(entry); if (!value || value.name !== player) return; pending = value; schedule(); },
      flush() { clearTimer(); pump(); }, clear,
      refresh() {
        const snapshotOrder = ++sequence, order = ++sequence; report('loading');
        // Public copies never contain local personal bests or session tokens.
        // Start both reads together, so a blocked live connection cannot hide the public table.
        // Read the scheduled publication directly: bot commits do not trigger Pages builds.
        const snapshot = request('', null, true).catch(() => request('', null, true, PUBLICATION)).then(result => {
          if ((source !== 'live' || result.publishedAt > liveCheckedAt) && accept(result, snapshotOrder, 'published')) changed();
          return result;
        }).catch(() => null);
        return request('/scores').then(result => {
          if (accept(result, order)) report('ready');
        }).catch(async failure => {
          const result = await snapshot;
          if (order < applied) return;
          if (result && source !== 'live') accept(result, snapshotOrder, 'published');
          report('error', failure.message || 'Leaderboard unavailable.');
        });
      }
    };
  }
  return { STORAGE_KEY, ENDPOINT, PUBLICATION, PUBLICATION_ENDPOINT, LIMIT, normalizeName, validName, normalizeEntry, normalizePublication, compare, rank, parse, createStore, createOnline };
});
