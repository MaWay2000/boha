'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {assertNoPrivateFields} = require('./public-export.cjs');
const ENDPOINT = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/data/wavehoster.json';
function scalars(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid WaveHoster record');
  const result = {};
  for (const key of fields.split(' ')) if (Object.hasOwn(value, key)) {
    if (value[key] !== null && typeof value[key] === 'object') throw Error('Invalid WaveHoster field: ' + key);
    result[key] = value[key];
  }
  return result;
}
function list(value) { if (!Array.isArray(value)) throw Error('Invalid WaveHoster list'); return value; }
function strings(value) { return list(value).map(item => { if (typeof item !== 'string') throw Error('Invalid WaveHoster text'); return item; }); }
function sanitizeWaveHoster(input) {
  assertNoPrivateFields(input);
  if (input.format !== 1 || input.source !== 'WaveHoster' || input.ranking !== 'wins-then-best-score') throw Error('Unsupported WaveHoster snapshot');
  const result = scalars(input, 'format source ranking generatedAt');
  result.groups = list(input.groups).map(group => ({...scalars(group, 'id version label matches confirmed'), mods: strings(group.mods),
    players: list(group.players).map(player => ({...scalars(player, 'id name identityVerified games wins losses draws bestScore kills'),
      names: list(player.names || []).map(alias => scalars(alias, 'name games')), publicKeys: strings(player.publicKeys || [])}))}));
  result.games = list(input.games).map(game => ({...scalars(game, 'id group map startedAt durationMilliseconds status modsVerified'),
    players: strings(game.players), participants: list(game.participants || []).map(player => scalars(player, 'id name result score kills'))}));
  assertNoPrivateFields(result);
  return result;
}
function publish(input, destination) {
  const content = JSON.stringify(sanitizeWaveHoster(input)) + '\n';
  if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  const temporary = destination + '.tmp-' + process.pid;
  try { fs.writeFileSync(temporary, content); fs.renameSync(temporary, destination); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return true;
}
async function sync({fetcher = fetch, destination = path.join(__dirname, 'published/wavehoster.json')} = {}) {
  const response = await fetcher(ENDPOINT, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('WaveHoster publication HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw Error('WaveHoster snapshot exceeds the publication limit');
  return publish(JSON.parse(bytes.toString('utf8')), destination);
}
module.exports = {sanitizeWaveHoster, publish, sync};
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  const action = input ? Promise.resolve().then(() => {
    if (!output) throw Error('Supply both input and output snapshot paths');
    return publish(JSON.parse(fs.readFileSync(input, 'utf8')), output);
  }) : sync();
  action.then(changed => console.log(changed ? 'Published public Arc Mod snapshot.' : 'Arc Mod snapshot unchanged.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
