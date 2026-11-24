'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const fields = {
  root: 'format generatedAt resultPolicy coverage games leaderboards',
  board: 'matches validMatches gameIds ratingEvents players',
  player: 'id mainPublicKey publicKeys name names bot games elo wins losses draws discounted totalKills favoriteUnits invalid',
  unit: 'signature name bodyId propulsionId weaponIds count',
  game: 'id source sourceLabel sourceMatchId resultSource replayUrl startDate endDate duration mapName mods alliancesType timeout cheated crashed slots',
  slot: 'id name nickname position team userType',
  event: 'elo eloDelta',
  match: 'id source source_label source_match_id started_at ended_at duration_ms map game replay_sha256 replay_filename players replay_url',
  matchPlayer: 'match_id position name team result score kills droids_built droids_lost structures_built structures_lost structures_destroyed research_complete power oil_rigs remaining_droids remaining_structures stats_source'
};
const forbidden = /^(?:password|passwd|passwordHash|db_password|api_key|apiKey|client_secret|access_token|authorization|privateKey|private_key|visitorId|visitor_id|sessionId|session_id|userAgent|user_agent|ip|ipAddress|ip_address|email|banReason|ban_reason|banAudit|ban_audit|adminNotes|admin_notes)$/i;
function assertNoPrivateFields(value, location = '$', allowModerationFlag = false) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key) || (!allowModerationFlag && key === 'banned')) {
      throw new Error(`Private field rejected at ${location}.${key}`);
    }
    // Nicknames are user data, not field names in a structural schema.
    if (key !== 'names') assertNoPrivateFields(child, `${location}.${key}`, allowModerationFlag);
  }
}
function pick(value, schema) {
  return Object.fromEntries(fields[schema].split(' ').filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}
function excludedPlayer(player) {
  const value = player?.elo;
  const elo = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  return Boolean(player?.banned) || (Number.isFinite(elo) && elo <= -2000);
}
function publicReplayUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid replay URL in publication.'); }
  if (url.username || url.password) throw new Error('Authenticated replay URL must not be published.');
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    if (!/^\/wzstats\/api\/v1\/replays\/[a-f0-9]{64}$/.test(url.pathname) || url.search || url.hash) throw new Error('Unexpected local replay URL.');
    // Preserve the public replay address used before the local server recovery.
    return 'https://desktop-0467j9q.tail41fd3a.ts.net' + url.pathname;
  }
  if (/^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)
      || /(?:^|\.)local$/i.test(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('Private replay URL must not be published.');
  return value;
}
function sanitizeLeaderboards(input) {
  assertNoPrivateFields(input, '$', true);
  if (input.format !== 1 || !input.leaderboards?.Global || !Array.isArray(input.games)) throw new Error('Unsupported leaderboard export.');
  const excluded = new Set(Object.values(input.leaderboards).flatMap(board => (board.players || []).filter(excludedPlayer).map(player => String(player.id))));
  const output = pick(input, 'root');
  output.games = input.games.map(game => ({...pick(game, 'game'), ...(Object.hasOwn(game, 'replayUrl') ? {replayUrl: publicReplayUrl(game.replayUrl)} : {}), slots: (game.slots || []).map(slot => pick(slot, 'slot'))}));
  output.leaderboards = Object.fromEntries(Object.entries(input.leaderboards).map(([name, board]) => {
    const next = pick(board, 'board');
    next.players = (board.players || []).filter(player => !excluded.has(String(player.id))).map(player => ({
      ...pick(player, 'player'), favoriteUnits: (player.favoriteUnits || []).map(unit => pick(unit, 'unit'))
    }));
    next.ratingEvents = Object.fromEntries(Object.entries(board.ratingEvents || {}).map(([id, events]) => [id,
      Object.fromEntries(Object.entries(events).filter(([playerId]) => !excluded.has(String(playerId))).map(([playerId, event]) => [playerId, pick(event, 'event')]))
    ]));
    return [name, next];
  }));
  assertNoPrivateFields(output);
  return output;
}
function sanitizeMatches(input) {
  assertNoPrivateFields(input);
  if (input.format !== 1 || !Array.isArray(input.matches)) throw new Error('Unsupported match export.');
  return {format: 1, matches: input.matches.map(match => ({...pick(match, 'match'), ...(Object.hasOwn(match, 'replay_url') ? {replay_url: publicReplayUrl(match.replay_url)} : {}), players: (match.players || []).map(player => pick(player, 'matchPlayer'))}))};
}
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function exportDirectory(inputDirectory, outputDirectory) {
  const read = name => JSON.parse(fs.readFileSync(path.join(inputDirectory, name), 'utf8'));
  const manifest = read('manifest.json');
  if (manifest.format !== 1 || !manifest.files) throw new Error('Unsupported publication manifest.');
  for (const [name, metadata] of Object.entries(manifest.files)) {
    if (!['matches.json', 'leaderboards.json'].includes(name)) throw new Error('Unexpected publication file.');
    const content = fs.readFileSync(path.join(inputDirectory, name));
    if (digest(content) !== metadata.sha256 || (metadata.bytes !== undefined && content.length !== metadata.bytes)) throw new Error(`Invalid input hash/length: ${name}`);
  }
  const leaderboards = sanitizeLeaderboards(read('leaderboards.json'));
  const matches = sanitizeMatches(read('matches.json'));
  const files = {'leaderboards.json': encode(leaderboards), 'matches.json': encode(matches)};
  const next = {format: 1, publishedAt: manifest.publishedAt, files: {}};
  for (const [name, buffer] of Object.entries(files)) {
    next.files[name] = {sha256: digest(buffer), bytes: buffer.length};
    if (name === 'matches.json') next.files[name].matchesCount = matches.matches.length;
  }
  files['manifest.json'] = encode(next);
  fs.mkdirSync(outputDirectory, {recursive: true});
  // Manifest is written last. Never modify the private input publication.
  for (const [name, buffer] of Object.entries(files)) {
    const target = path.join(outputDirectory, name), temporary = target + '.tmp-' + process.pid;
    if (fs.existsSync(target) && fs.readFileSync(target).equals(buffer)) continue;
    fs.writeFileSync(temporary, buffer); fs.renameSync(temporary, target);
  }
  return next;
}
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node public-export.cjs INPUT_DIRECTORY OUTPUT_DIRECTORY');
  exportDirectory(path.resolve(input), path.resolve(output));
  console.log('Privacy-filtered public stats exported.');
}
module.exports = {sanitizeLeaderboards, sanitizeMatches, assertNoPrivateFields, exportDirectory};
