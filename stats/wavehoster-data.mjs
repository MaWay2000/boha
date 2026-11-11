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

export function matchResults(game) {
  const labels = {winner: 'Win', loser: 'Lost', contender: 'Draw'};
  const players = game.status === 'confirmed' ? game.participants || [] : [];
  if (!players.length) return [{label: 'Unknown', result: 'unknown'}];
  const results = players.map(player => ({name: player.name, result: labels[player.result] ? player.result : 'unknown',
    label: labels[player.result] || 'Unknown'}));
  if (results.every(player => player.result === results[0].result)) {
    return [{label: results[0].label, result: results[0].result}];
  }
  return results.map(player => ({...player, label: `${player.name}: ${player.label}`}));
}

export function replaySource(game) {
  const hash = String(game.replaySha256 || '');
  const id = String(game.id || '');
  const replayUrl = /^[a-f0-9]{64}$/.test(hash)
    ? 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/' + hash
    : /^\d{8}_\d{6}_\d+$/.test(id) ? 'https://api.wavehoster.net/v1/replays/' + id : null;
  return replayUrl ? {replayUrl, sourceLabel: 'WaveHoster', sourceUrl: 'https://api.wavehoster.net/v1/replays'} : null;
}
