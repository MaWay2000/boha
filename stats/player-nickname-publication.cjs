'use strict';

const fs = require('node:fs');
const {createHash} = require('node:crypto');

const validKey = key => typeof key === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(key);
const validId = id => typeof id === 'string' && /^[a-f0-9]{20}$/.test(id);
const arcId = key => createHash('sha256').update(key).digest('hex').slice(0, 20);
const playable = new Set(['winner', 'loser', 'contender']);

function buildNicknameHistory(main, arc) {
  if (main?.format !== 1 || !Array.isArray(main.leaderboards?.Global?.players) || !Array.isArray(main.games)
      || arc?.format !== 1 || !Array.isArray(arc.groups) || !Array.isArray(arc.games)) {
    throw Error('Invalid inputs for recent game nicknames.');
  }
  const mainIds = new Map();
  const keyOwners = new Map();
  for (const player of main.leaderboards.Global.players) {
    if (player.bot || player.banned || !validKey(player.mainPublicKey)) continue;
    const id = arcId(player.mainPublicKey);
    mainIds.set(player.id, id);
    for (const key of [player.mainPublicKey, ...(player.publicKeys || [])].filter(validKey)) {
      const hashed = arcId(key);
      if (!keyOwners.has(hashed)) keyOwners.set(hashed, id);
      else if (keyOwners.get(hashed) !== id) keyOwners.set(hashed, null);
    }
  }

  const arcKeys = new Map();
  for (const group of arc.groups) {
    for (const player of group.players) {
      if (player.identityVerified !== true || !validId(player.id)) continue;
      if (!arcKeys.has(player.id)) arcKeys.set(player.id, new Set());
      for (const key of [player.mainPublicKey, ...(player.publicKeys || [])].filter(validKey)) {
        const owner = keyOwners.get(arcId(key));
        if (owner) arcKeys.get(player.id).add(owner);
      }
    }
  }
  const arcIds = new Map([...arcKeys].map(([id, owners]) => [
    id, keyOwners.get(id) ?? (owners.size === 1 ? owners.values().next().value : id)
  ]));

  // Walk the two feeds together so each history is capped at three distinct replays.
  const matches = [
    ...main.games.map(game => ({game, time: game.startDate, mode: 'main'})),
    ...arc.games.map(game => ({game, time: Date.parse(game.startedAt), mode: 'arc'}))
  ].filter(({time}) => Number.isFinite(time) && time > 0)
    .sort((a, b) => b.time - a.time || String(b.game.id).localeCompare(String(a.game.id)));
  const histories = new Map();
  for (const {game, time, mode} of matches) {
    const stock = mode === 'main';
    const replay = stock
      ? game.replayUrl?.match(/\/([a-f\d]{64})(?:[?#]|$)/i)?.[1] || game.id
      : game.replaySha256 || 'wavehoster:' + game.id;
    for (const player of (stock ? game.slots : game.participants) || []) {
      if (stock && !playable.has(player.userType)) continue;
      const id = (stock ? mainIds : arcIds).get(player.id);
      const name = player.nickname ?? player.name;
      if (!id || typeof name !== 'string' || !name.trim()) continue;
      if (!histories.has(id)) histories.set(id, new Map());
      const recent = histories.get(id);
      if (recent.size < 3 && !recent.has(replay)) recent.set(replay, {name, time, mode});
    }
  }
  const aliases = new Map([...keyOwners, ...arcIds]);
  return {
    format: 1,
    players: Object.fromEntries([...histories].sort().map(([id, games]) => [id, [...games.values()]])),
    aliases: Object.fromEntries([...aliases].sort().filter(([id, owner]) => owner && id !== owner && histories.has(owner)))
  };
}

function publishNicknameHistory(mainPath, arcPath, destination) {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = JSON.stringify(buildNicknameHistory(read(mainPath), read(arcPath))) + '\n';
  if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === data) return false;
  const temporary = destination + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, destination);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return true;
}

module.exports = {buildNicknameHistory, publishNicknameHistory};
if (require.main === module) {
  const [main, arc, output] = process.argv.slice(2);
  if (!main || !arc || !output) throw Error('Supply main and ARC snapshots and an output path.');
  publishNicknameHistory(main, arc, output);
}
