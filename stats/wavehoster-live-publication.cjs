'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {publishBeta} = require('./wavehoster-publication.cjs');

// Run outside the HTTP server: evidence lookups must never block their own API.
async function publishLive({source, destination, seed, policyPath, apiBase, fetcher = fetch, now = Date.now()}) {
  const input = fs.readFileSync(source);
  const policyBytes = fs.readFileSync(policyPath || path.join(__dirname, 'arc-beta.json'));
  const seedBytes = seed && fs.existsSync(seed) ? fs.readFileSync(seed) : null;
  if (input.length > 32 * 1024 * 1024 || seedBytes?.length > 32 * 1024 * 1024) throw Error('Arc Mod snapshot exceeds the publication limit');
  const hash = createHash('sha256').update(input).update(policyBytes);
  if (seedBytes) hash.update(seedBytes);
  for (const dependency of ['wavehoster-live-publication.cjs', 'wavehoster-publication.cjs', 'arc-departures.cjs', 'arc-beta.mjs', 'wavehoster-data.mjs', 'public-export.cjs']) {
    hash.update(fs.readFileSync(path.join(__dirname, dependency)));
  }
  const fingerprint = hash.digest('hex');
  const statePath = destination + '.state.json';
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  if (fs.existsSync(destination) && state?.fingerprint === fingerprint && now < state.retryAt) return false;
  const deadline = Date.now() + 15000;
  let evidenceFailures = 0;
  const evidenceFetcher = (url, options) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Evidence refresh budget exceeded');
    if (apiBase && String(url).startsWith('https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/matches/')) {
      url = apiBase.replace(/\/$/, '') + '/matches/' + String(url).split('/').at(-1);
    }
    return fetcher(url, {...options, signal: AbortSignal.timeout(Math.min(5000, remaining))});
  };
  const snapshot = JSON.parse(input.toString('utf8'));
  const options = {
    policy: JSON.parse(policyBytes.toString('utf8')), seedSnapshot: seedBytes ? JSON.parse(seedBytes.toString('utf8')) : null,
    fetcher: evidenceFetcher, now, warn: () => { evidenceFailures++; }
  };
  // Make new games available immediately with retained, verified endings. Additional
  // departure evidence is filled in afterwards with bounded API work.
  const initialChange = await publishBeta(snapshot, destination, {...options, inspectDepartures: false});
  const enrichedChange = await publishBeta(snapshot, destination, options);
  const temporary = statePath + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(temporary, JSON.stringify({fingerprint, checkedAt: now,
      retryAt: now + (evidenceFailures ? 30000 : 60 * 60 * 1000)}) + '\n');
    fs.renameSync(temporary, statePath);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return initialChange || enrichedChange;
}

module.exports = {publishLive};
if (require.main === module) {
  const [source, destination, seed, policyPath, apiBase] = process.argv.slice(2);
  if (!source || !destination) { console.error('Supply source and destination snapshot paths.'); process.exitCode = 1; }
  else publishLive({source, destination, seed, policyPath, apiBase})
    .then(changed => { if (changed) console.log('Published live Arc Mod results.'); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
