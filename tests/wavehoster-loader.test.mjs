import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshWaveHoster, LIVE_URL} from '../stats/wavehoster-loader.mjs';

const snapshot = hour => ({format: 1, source: 'WaveHoster', ranking: 'wins-then-best-score',
  generatedAt: `2026-11-17T${String(hour).padStart(2, '0')}:00:00Z`, groups: [], games: []});
const response = data => ({ok: true, text: async () => JSON.stringify(data)});
const record = (data, source = 'live') => ({snapshot: data, source, text: JSON.stringify(data)});

test('saved results render first while the newer live feed connects', async () => {
  let release;
  const live = new Promise(resolve => { release = resolve; });
  const updates = [];
  const pending = refreshWaveHoster({fetcher: url => url === LIVE_URL ? live : Promise.resolve(response(snapshot(1))),
    onUpdate: value => updates.push(value.source)});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates, ['github']);
  release(response(snapshot(2)));
  const result = await pending;
  assert.deepEqual(updates, ['github', 'live']);
  assert.equal(result.record.snapshot.generatedAt, snapshot(2).generatedAt);
  assert.equal(result.liveAvailable, true);
});

test('malformed, offline and HTTP failure live feeds fall back to GitHub', async () => {
  for (const failure of [() => {throw Error('offline');}, () => ({ok: false}),
    () => ({ok: true, text: async () => '<html>error</html>'}), () => response({...snapshot(3), groups: [{id: 'bad'}]})]) {
    const result = await refreshWaveHoster({fetcher: async url => url === LIVE_URL ? failure() : response(snapshot(2))});
    assert.equal(result.liveAvailable, false);
    assert.equal(result.record.source, 'github');
  }
});

test('timeouts abort a live request and leave the saved publication available', async () => {
  let aborted = false;
  const result = await refreshWaveHoster({timeoutMs: 10, fetcher: (url, {signal}) => url !== LIVE_URL
    ? Promise.resolve(response(snapshot(2))) : new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true; reject(Error('timeout'));
    }))});
  assert.equal(aborted, true);
  assert.equal(result.record.source, 'github');
});

test('freshness wins over request order and offline refreshes cannot roll back existing results', async () => {
  const result = await refreshWaveHoster({fetcher: async url => response(snapshot(url === LIVE_URL ? 1 : 3))});
  assert.equal(result.record.source, 'github');
  const current = record(snapshot(4));
  const fallback = await refreshWaveHoster({current, fetcher: async url => {
    if (url === LIVE_URL) throw Error('offline');
    return response(snapshot(2));
  }});
  assert.equal(fallback.record, current);
  assert.equal(fallback.liveAvailable, false);
  const cached = await refreshWaveHoster({current, fetcher: async () => {throw Error('offline');}});
  assert.equal(cached.record, current);
  await assert.rejects(refreshWaveHoster({fetcher: async () => {throw Error('offline');}}), /temporarily unavailable/);
});

test('unchanged live snapshots reuse parsed data and healthy refreshes avoid GitHub requests', async () => {
  const current = record(snapshot(2));
  const requests = [], updates = [];
  const result = await refreshWaveHoster({current, onUpdate: value => updates.push(value), fetcher: async (url, options) => {
    requests.push(url);
    assert.equal(options.credentials, 'omit');
    return response(snapshot(2));
  }});
  assert.deepEqual(requests, [LIVE_URL]);
  assert.deepEqual(updates, []);
  assert.equal(result.record.snapshot, current.snapshot);
});

test('a processed live ending replaces saved data with the same source timestamp', async () => {
  const current = record(snapshot(2), 'github');
  const newer = {...snapshot(2), groups: [], games: [{id: 'one', group: 'g', map: 'Wave-Defense', status: 'unknown',
    durationMilliseconds: 60000, players: ['Tester'], participants: [{id: 'one', name: 'Tester', result: 'loser'}]}]};
  const result = await refreshWaveHoster({current, fetcher: async () => response(newer)});
  assert.equal(result.record.snapshot.games[0].participants[0].result, 'loser');
});
