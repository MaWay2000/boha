'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {ENDPOINT, PUBLICATION, normalizePublication} = require('../balloon/site-armory-scores.js');

async function sync({fetcher = fetch, destination = path.resolve(__dirname, '..', PUBLICATION), now = Date.now} = {}) {
  const response = await fetcher(ENDPOINT + '/scores', {
    headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error(`Score publication failed: HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 65536) throw Error('Score publication response too large');
  const data = JSON.parse(text);
  // Allowlist every public field. Never write raw API responses, tokens or private server state.
  const publication = normalizePublication({schemaVersion: data.schemaVersion, entries: data.entries, publishedAt: now()});
  if (fs.existsSync(destination)) {
    const previous = normalizePublication(JSON.parse(fs.readFileSync(destination, 'utf8')));
    if (JSON.stringify(previous.entries) === JSON.stringify(publication.entries)) return false;
  }
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  const temporary = destination + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(publication) + '\n'); fs.renameSync(temporary, destination); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return true;
}
module.exports = {sync};
if (require.main === module) sync().then(changed => console.log(changed ? 'Published shared Top 10.' : 'Shared Top 10 unchanged.'))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
