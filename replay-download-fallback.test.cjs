const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/replay-analyzer.js`, 'utf8');
const functionSource = source.slice(source.indexOf('  async function loadReplay()'), source.indexOf('  async function analyzeReplay('));
const id = '1791721516542';
const hash = 'a'.repeat(64);
async function check(origin, match, expectedFallback) {
  const calls = [];
  const context = vm.createContext({
    URL, replayFile: {files: []}, replayUrl: {value: `${origin}/replays/${id}.wzrp`},
    extractReplayId: () => id, extractReplaySha256: () => '', setStatus: () => {},
    wzstatsPublishedUrl: 'https://example.test/matches.json',
    fetch: async url => {
      calls.push(String(url));
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      if (calls.length === 2) return {ok: true, json: async () => ({matches: [match]})};
      return {ok: true, arrayBuffer: async () => 'WZrp'};
    }
  });
  vm.runInContext(functionSource, context);
  if (expectedFallback) {
    assert.equal(await context.loadReplay(), 'WZrp');
    assert.equal(calls[2], `https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/${hash}`);
  } else {
    await assert.rejects(context.loadReplay(), /Failed to fetch/);
    assert.equal(calls.length, origin.includes('retropaganda') ? 2 : 1);
  }
}
(async () => {
  await check('https://warzone2100.retropaganda.info', {source_match_id: id, replay_sha256: hash}, true);
  await check('https://warzone2100.retropaganda.info', {source_match_id: id, replay_sha256: '../invalid'}, false);
  await check('https://other.example', {source_match_id: id, replay_sha256: hash}, false);
  console.log('PASS: stored replay fallback, invalid hash rejection, unrelated origin unchanged.');
})().catch(error => { console.error(error); process.exitCode = 1; });
