export function normalizeLeaderboardSelection(names, available) {
  const selection = [...new Set(names)].filter(name => name && (!available || available.includes(name)));
  if (selection.includes("Global")) return ["Global"];
  return selection.length ? selection : [available?.includes("Global") ? "Global" : available?.[0] || "Global"];
}

export function toggleLeaderboardSelection(selection, name) {
  if (name === "Global") return ["Global"];
  if (selection.includes(name)) return normalizeLeaderboardSelection(selection.filter(board => board !== name));
  return [...selection.filter(board => board !== "Global"), name];
}

export function appendLeaderboardSelection(params, selection) {
  for (const name of selection) {
    if (name !== "Global") params.append("leaderboard", name);
  }
}

export function buildCombinedLeaderboard(publication, selection) {
  const { games, leaderboards } = publication;
  const gameIds = new Set(selection.flatMap(name => leaderboards[name]?.gameIds || []));
  const playerIds = new Set();
  for (const game of games) {
    if (!gameIds.has(game.id)) continue;
    for (const slot of game.slots || []) {
      if (["winner", "loser", "contender"].includes(slot.userType)) playerIds.add(String(slot.id));
    }
  }

  // The Global publication owns visible identities and moderation exclusions.
  const players = (leaderboards.Global?.players || [])
    .filter(player => playerIds.has(String(player.id)))
    .map(player => ({ ...player, wins: 0, losses: 0, draws: 0, totalKills: 0, favoriteUnits: [] }));
  return { gameIds, players };
}

export function countCombinedResults(games) {
  const resultFields = { winner: "winCount", loser: "loseCount", contender: "drawCount" };
  for (const game of games) {
    const counted = new Set();
    for (const { account, userType } of game.players) {
      if (counted.has(account)) continue;
      counted.add(account);
      account[resultFields[userType]] += 1;
    }
  }
}
