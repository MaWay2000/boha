export function combineRulesets(snapshot) {
  const players = new Map();
  for (const group of snapshot.groups) {
    for (const source of group.players) {
      let player = players.get(source.id);
      if (!player) {
        player = {id: source.id, name: source.name, identityVerified: source.identityVerified,
          games: 0, wins: 0, losses: 0, draws: 0, bestScore: null, kills: 0,
          names: new Map(), publicKeys: new Set()};
        players.set(source.id, player);
      }
      for (const stat of ['games', 'wins', 'losses', 'draws', 'kills']) player[stat] += source[stat] || 0;
      if (source.bestScore !== null && source.bestScore !== undefined) {
        player.bestScore = player.bestScore === null ? source.bestScore : Math.max(player.bestScore, source.bestScore);
      }
      for (const alias of source.names || [{name: source.name, games: source.games}]) {
        player.names.set(alias.name, (player.names.get(alias.name) || 0) + alias.games);
      }
      for (const key of source.publicKeys || []) player.publicKeys.add(key);
    }
  }
  const rows = [...players.values()].map(player => ({...player,
    names: [...player.names].map(([name, games]) => ({name, games})).sort((a, b) => b.games - a.games || compareNames(a, b)),
    publicKeys: [...player.publicKeys].sort()
  }));
  rows.sort((a, b) => b.wins - a.wins || (b.bestScore ?? -Infinity) - (a.bestScore ?? -Infinity) || compareNames(a, b));
  return {id: 'all', players: rows, matches: snapshot.games.length,
    confirmed: snapshot.games.filter(game => game.status === 'confirmed').length};
}

function compareNames(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }

// Use each combined mod's existing standings, never the cross-mod ALL ranking.
export function modMedals(groups) {
  const medals = new Map();
  for (const group of groups) {
    group.players.slice(0, 3).forEach((player, index) => {
      if (!medals.has(player.id)) medals.set(player.id, []);
      medals.get(player.id).push({modId: group.id, modName: group.name,
        place: index + 1, metal: ['gold', 'silver', 'bronze'][index],
        wins: player.wins, bestScore: player.bestScore});
    });
  }
  return medals;
}

export function participantResult(game, player) {
  if (game.status === 'confirmed') return ['winner', 'loser', 'contender'].includes(player.result) ? player.result : 'unknown';
  if (game.status === 'unknown' && game.modsVerified === true && player.result === 'loser' && player.resultReason === 'departure' &&
      typeof game.durationMilliseconds === 'number' && Number.isFinite(game.durationMilliseconds) &&
      typeof player.leftAtMilliseconds === 'number' && Number.isFinite(player.leftAtMilliseconds) &&
      player.leftAtMilliseconds > 0 && player.leftAtMilliseconds <= game.durationMilliseconds) return 'loser';
  return 'unknown';
}

export function matchResults(game) {
  const wave = waveResult(game);
  if (wave) return [wave];
  const labels = {winner: 'Win', loser: 'Lost', contender: 'Draw'};
  const players = (game.participants || []).filter(player => participantResult(game, player) !== 'unknown');
  if (!players.length) return [{label: game.status === 'pending' ? 'Awaiting analysis' : 'Result unavailable', result: 'unknown',
    title: game.modsVerified !== true ? 'The exact mod has not been verified.' : 'No verified final result or matched host ending is available.'}];
  const results = players.map(player => ({name: player.name, result: participantResult(game, player),
    label: player.resultReason === 'departure' ? 'Left game (loss)' : labels[participantResult(game, player)]}));
  if (game.status !== 'confirmed') for (const name of game.players || []) {
    if (!players.some(player => player.name === name)) results.push({name, result: 'unknown', label: 'Result unavailable'});
  }
  if (results.every(player => player.result === results[0].result)) {
    return [{label: results[0].label, result: results[0].result}];
  }
  return results.map(player => ({...player, label: `${player.name}: ${player.label}`}));
}

export function waveResult(game) {
  if (game.modsVerified !== true || !Number.isFinite(game.durationMilliseconds) || !Number.isInteger(game.waveReached) || game.waveReached < 0 || game.waveReached > 60 ||
      !Number.isFinite(game.waveEndedAtMilliseconds) || game.waveEndedAtMilliseconds <= 0 ||
      game.waveEndedAtMilliseconds > game.durationMilliseconds ||
      !['victory', 'defeat'].includes(game.waveOutcome) ||
      !['wave-clear', 'departure', 'scripted-defeat'].includes(game.waveEndReason) ||
      (game.waveOutcome === 'victory' && (game.waveReached !== 60 || game.waveEndReason !== 'wave-clear')) ||
      (game.waveOutcome === 'defeat' && game.waveEndReason === 'wave-clear')) return null;
  const result = game.waveOutcome === 'victory' ? 'winner' : 'loser';
  if (game.status === 'confirmed' && (game.participants || []).some(player =>
      ['winner', 'loser', 'contender'].includes(player.result) && player.result !== result)) return null;
  const label = game.waveOutcome === 'victory' ? 'Victory' : game.waveEndReason === 'departure' ? 'Left game (loss)' : 'Defeated';
  return {label: `${label} · Wave ${game.waveReached}/60`, result,
    title: game.waveEndReason === 'departure' ? 'A player departure was recorded before the scripted ending. Leaving counts as a loss.' :
      'Ending and wave reached recorded by the host and matched to this exact replay. This does not certify scores or kills.'};
}

export function replaySource(game) {
  const hash = String(game.replaySha256 || '');
  const id = String(game.id || '');
  const replayUrl = /^[a-f0-9]{64}$/.test(hash)
    ? 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/' + hash
    : /^\d{8}_\d{6}_\d+$/.test(id) ? 'https://api.wavehoster.net/v1/replays/' + id : null;
  return replayUrl ? {replayUrl, sourceLabel: 'WaveHoster', sourceUrl: 'https://api.wavehoster.net/v1/replays'} : null;
}


// Combine the public view by displayed mod name; keep the recorded snapshot intact.
export function combineModNames(snapshot) {
  const gamesByGroup = new Map();
  for (const game of snapshot.games) {
    if (!gamesByGroup.has(game.group)) gamesByGroup.set(game.group, []);
    gamesByGroup.get(game.group).push(game);
  }
  const families = new Map();
  const ids = new Map();
  for (const group of snapshot.groups) {
    const games = gamesByGroup.get(group.id) || [];
    const maps = new Map();
    for (const game of games) maps.set(game.map, (maps.get(game.map) || 0) + 1);
    const map = [...maps].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Custom mod';
    const name = group.mods.length ? (map === 'BOHA-Wave-Defense' ? 'Wave-Defense' : map) : 'Unmodded';
    if (!families.has(name)) families.set(name, {name, groups: [], games: []});
    const family = families.get(name);
    family.groups.push(group);
    family.games.push(...games);
    ids.set(group.id, 'mod:' + name);
  }
  const groups = [...families.values()].map(family => ({
    ...combineRulesets(family), id: 'mod:' + family.name, name: family.name,
    groupIds: family.groups.map(group => group.id)
  }));
  return {...snapshot, groups, games: snapshot.games.map(game => ({...game, group: ids.get(game.group) || game.group}))};
}
