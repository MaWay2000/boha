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
