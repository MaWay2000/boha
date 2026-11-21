'use strict';
const {createHash} = require('node:crypto');
const {gunzipSync} = require('node:zlib');
const API = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/matches/';
const finalResults = new Set(['winner', 'loser', 'contender']);
const validTime = (time, duration) => typeof time === 'number' && Number.isFinite(time) && time > 0 && time <= duration;

function unpack(extended, name) {
  if (extended[name]) return extended[name];
  if (extended[name + 'Encoding'] !== 'gzip+base64' || typeof extended[name + 'GzipBase64'] !== 'string') return null;
  return JSON.parse(gunzipSync(Buffer.from(extended[name + 'GzipBase64'], 'base64'), {maxOutputLength: 32 * 1024 * 1024}));
}

function departureFacts(game, group, response) {
  const match = response.match || response;
  const header = match.replay_analysis || {};
  const analysis = match.telemetry?.engineAnalysis || {};
  if (game.status !== 'unknown' || game.modsVerified !== true ||
      match.replay_sha256 !== game.replaySha256 || Number(match.id) !== game.matchId ||
      header.format?.gameVersion !== group.version || analysis.game?.version !== group.version ||
      JSON.stringify(header.match?.modHashes) !== JSON.stringify(group.mods) ||
      analysis.status !== 'unknown' || analysis.game?.timeout !== false || analysis.game?.cheated !== false) return [];
  const extended = analysis.extended || {};
  const network = unpack(extended, 'recordedNetwork') || {};
  const facts = [];
  for (const human of header.players || []) {
    if (human.spectator !== false || !Number.isInteger(human.ai) || human.ai >= 0 ||
        !Number.isInteger(human.position) || !game.players.includes(human.name)) continue;
    const source = (match.players || []).find(player => Number(player.position_number) === human.position);
    if (finalResults.has(source?.result)) continue;
    let raw = source?.raw_json || {};
    if (typeof raw === 'string') raw = JSON.parse(raw);
    const times = (network.playerDepartures || []).filter(event => event.player === human.position).map(event => event.timeMilliseconds);
    if (source?.stats_source === 'replay-engine') times.push(raw.leftAtMilliseconds, raw.playerLeftGameTime);
    const leftAtMilliseconds = times.filter(time => validTime(time, game.durationMilliseconds)).sort((a, b) => a - b)[0];
    if (leftAtMilliseconds === undefined) continue;
    // No verified identity was published for this unresolved result. Keep a guest entry.
    const identity = source?.stats_source === 'replay-engine' && typeof raw.publicKey === 'string'
      ? group.players.find(player => player.identityVerified === true && player.publicKeys?.includes(raw.publicKey)) : null;
    facts.push({id: identity?.id || createHash('sha256').update('guest:' + human.name).digest('hex').slice(0, 20),
      name: human.name, result: 'loser', resultReason: 'departure', leftAtMilliseconds, score: null, kills: null});
  }
  return facts;
}

async function applyDepartures(snapshot, policy, {fetcher = fetch, now = Date.now(), warn = console.warn} = {}) {
  const {isArcGroup} = await import('./arc-beta.mjs');
  const groups = new Map(snapshot.groups.filter(group => isArcGroup(group, policy)).map(group => [group.id, group]));
  const pending = snapshot.games.filter(game => groups.has(game.group) && game.status === 'unknown' && game.modsVerified === true &&
    /^[a-f0-9]{64}$/.test(game.replaySha256 || '') && Number.isSafeInteger(game.matchId) && game.matchId > 0 &&
    !(Date.parse(game.departureCheckedAt) > now - 6 * 60 * 60 * 1000));
  // Bound API load; cache successful inspections for six hours, including negative results.
  async function worker() {
    while (pending.length) {
      const game = pending.shift();
      try {
        const response = await fetcher(API + game.matchId, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
        if (!response.ok) throw Error('Evidence unavailable');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 32 * 1024 * 1024) throw Error('Evidence too large');
        const facts = departureFacts(game, groups.get(game.group), JSON.parse(bytes.toString('utf8')));
        for (const fact of facts) {
          if (!game.participants.some(player => player.name === fact.name && finalResults.has(player.result))) game.participants.push(fact);
        }
        game.departureCheckedAt = new Date(now).toISOString();
      } catch {
        warn('Departure evidence unavailable for match ' + game.matchId + '; keeping the previous result.');
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return snapshot;
}

async function rebuildArcRankings(snapshot, policy) {
  const {isArcGroup} = await import('./arc-beta.mjs');
  const {participantResult} = await import('./wavehoster-data.mjs');
  for (const group of snapshot.groups.filter(group => isArcGroup(group, policy))) {
    const identities = new Map(group.players.map(player => [player.id, player]));
    const rows = new Map();
    const games = snapshot.games.filter(game => game.group === group.id);
    group.matches = games.length;
    group.confirmed = games.filter(game => game.status === 'confirmed').length;
    for (const game of games) {
      const counted = new Set();
      for (const player of game.participants) {
        const result = participantResult(game, player);
        if (!finalResults.has(result) || !player.id || counted.has(player.id)) continue;
        counted.add(player.id);
        const identity = identities.get(player.id);
        const mainPublicKey = identity?.identityVerified === true ? identity.mainPublicKey : undefined;
        const row = rows.get(player.id) || {id: player.id, name: mainPublicKey ? identity.name : player.name,
          ...(mainPublicKey && {mainPublicKey}),
          identityVerified: identity?.identityVerified === true, publicKeys: identity?.publicKeys || [],
          names: [], games: 0, wins: 0, losses: 0, draws: 0, bestScore: null, kills: 0};
        row.games++;
        row[{winner: 'wins', loser: 'losses', contender: 'draws'}[result]]++;
        const alias = row.names.find(alias => alias.name === player.name);
        if (alias) alias.games++; else row.names.push({name: player.name, games: 1});
        if (game.status === 'confirmed') {
          if (typeof player.score === 'number' && Number.isFinite(player.score)) row.bestScore = Math.max(row.bestScore ?? -Infinity, player.score);
          if (typeof player.kills === 'number' && Number.isFinite(player.kills)) row.kills += player.kills;
        }
        rows.set(player.id, row);
      }
    }
    group.players = [...rows.values()].sort((a, b) => b.wins - a.wins || (b.bestScore ?? -Infinity) - (a.bestScore ?? -Infinity) || a.name.localeCompare(b.name));
    for (const player of group.players) player.names.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  }
  return snapshot;
}

function mergeHistory(previous, next) {
  if (!previous) return next;
  const oldGames = new Map(previous.games.map(game => [game.replaySha256 || game.id, game]));
  next.games = next.games.map(game => {
    const old = oldGames.get(game.replaySha256 || game.id);
    oldGames.delete(game.replaySha256 || game.id);
    if (!old) return game;
    if (old.status === 'confirmed' && game.status !== 'confirmed') return old;
    // Keep matched host evidence if an upstream export temporarily omits it.
    if (old.modsVerified === true && game.modsVerified === true && old.group === game.group &&
        old.durationMilliseconds === game.durationMilliseconds && old.waveOutcome && !game.waveOutcome) {
      for (const key of ['waveReached', 'waveEndedAtMilliseconds', 'waveOutcome', 'waveEndReason']) game[key] = old[key];
    }
    if (game.status !== 'confirmed' && old.departureCheckedAt && old.modsVerified === game.modsVerified) {
      return {...game, departureCheckedAt: old.departureCheckedAt,
        participants: [...game.participants, ...old.participants.filter(player => player.resultReason === 'departure' &&
          !game.participants.some(nextPlayer => nextPlayer.id === player.id))]};
    }
    return game;
  });
  next.games.push(...oldGames.values());
  next.games.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '') || b.id.localeCompare(a.id));
  for (const group of next.groups) {
    const old = previous.groups.find(candidate => candidate.id === group.id);
    if (!old) continue;
    const ids = new Set(group.players.map(player => player.id));
    group.players.push(...old.players.filter(player => !ids.has(player.id)));
  }
  const ids = new Set(next.groups.map(group => group.id));
  next.groups.push(...previous.groups.filter(group => !ids.has(group.id)));
  return next;
}

module.exports = {departureFacts, applyDepartures, rebuildArcRankings, mergeHistory};

