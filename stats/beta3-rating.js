"use strict";

// Experimental match-stat rating. This never writes to public ELO or Beta 1.
const { qualifiedGame } = require("./beta1-rating");

const RULES = Object.freeze({
  version: "beta3-2026-09-29",
  initialRating: 1500,
  teamScale: 400,
  performanceScale: 400,
  establishedK: 8,
  provisionalExtraK: 4,
  provisionalGames: 20,
  personalWeight: 36,
  personalCap: 10,
  matchCap: 15,
  minimumMinutes: 3,
  metrics: Object.freeze({ score: 0.25, kills: 0.15, unitKd: 0.30,
    structuresDestroyed: 0.10, research: 0.15, production: 0.05 })
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value) => Math.round(value * 100) / 100;

function readMetrics(stats) {
  const fields = ["score", "kills", "droids_lost", "structures_destroyed", "research_complete", "droids_built"];
  if (!stats || fields.some((field) => stats[field] === null || stats[field] === undefined ||
      !Number.isFinite(Number(stats[field])) || (field !== "score" && Number(stats[field]) < 0))) return null;
  const kills = Number(stats.kills);
  const lost = Number(stats.droids_lost);
  return {
    score: Number(stats.score), kills, unitKd: (kills + 5) / (lost + 5),
    structuresDestroyed: Number(stats.structures_destroyed),
    research: Number(stats.research_complete), production: Number(stats.droids_built)
  };
}

function rankFraction(values, value) {
  if (values.length < 2) return 0.5;
  const less = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return (less + (equal - 1) / 2) / (values.length - 1);
}

function rankPerformance(stats, rules = RULES) {
  const metrics = stats.map(readMetrics);
  if (metrics.some((item) => item === null)) return null;
  const scores = metrics.map((item) => {
    const ranks = Object.fromEntries(Object.keys(rules.metrics).map((metric) => [
      metric, rankFraction(metrics.map((peer) => peer[metric]), item[metric])
    ]));
    return { ranks, score: Object.entries(rules.metrics).reduce((sum, [metric, weight]) =>
      sum + weight * ranks[metric], 0) };
  });
  return scores.map((item) => ({ ranks: item.ranks, score: item.score,
    rank: 1 + scores.filter((peer) => peer.score > item.score + 1e-10).length,
    field: scores.length
  }));
}

function gameChanges(teamA, teamB, outcomeA, performance = null, rules = RULES) {
  const average = (players) => players.reduce((sum, player) => sum + player.rating, 0) / players.length;
  const expectedA = 1 / (1 + 10 ** ((average(teamB) - average(teamA)) / rules.teamScale));
  const field = [...teamA, ...teamB];
  const result = [];
  for (const [team, outcome, expected] of [[teamA, outcomeA, expectedA], [teamB, 1 - outcomeA, 1 - expectedA]]) {
    for (const player of team) {
      const k = rules.establishedK + rules.provisionalExtraK *
        Math.max(0, 1 - player.games / rules.provisionalGames);
      const resultDelta = k * (outcome - expected);
      // Compare the observed match-wide stat rank to the rank predicted by
      // pre-match ratings; otherwise perennial top players inflate forever.
      const expectedPerformance = field.reduce((sum, peer) => peer.id === player.id ? sum :
        sum + 1 / (1 + 10 ** ((peer.rating - player.rating) / rules.performanceScale)), 0) /
        (field.length - 1);
      const personalDelta = performance?.has(player.id)
        ? clamp(rules.personalWeight * (performance.get(player.id).score - expectedPerformance),
          -rules.personalCap, rules.personalCap) : 0;
      result.push({ id: player.id, expectedWin: expected, expectedPerformance, resultDelta, personalDelta,
        delta: clamp(resultDelta + personalDelta, -rules.matchCap, rules.matchCap) });
    }
  }
  return result;
}

function calculateBeta3(leaderboards, matches, rules = RULES) {
  const globalPlayers = leaderboards?.leaderboards?.Global?.players ?? [];
  const knownPlayers = new Map(globalPlayers.map((player) => [player.id, player]));
  const matchById = new Map((matches.matches ?? []).map((match) => [
    `${match.source}:${match.source_match_id}`, match
  ]));
  const accounts = new Map();
  const coverage = { considered: 0, rated: 0, withPersonal: 0, resultOnly: 0 };
  const games = [...(leaderboards.games ?? [])].sort((a, b) =>
    Number(a.startDate) - Number(b.startDate) || String(a.id).localeCompare(String(b.id)));

  for (const game of games) {
    coverage.considered++;
    const qualified = qualifiedGame(game, matchById.get(game.id), knownPlayers, rules);
    if (!qualified) continue;
    const { sides, outcomeA, statistics } = qualified;
    const slots = sides.flat();
    const ranked = rankPerformance(statistics, rules);
    const performance = ranked ? new Map(slots.map((slot, index) => [slot.id, ranked[index]])) : null;
    const players = sides.map((side) => side.map((slot) => {
      if (!accounts.has(slot.id)) {
        const profile = knownPlayers.get(slot.id);
        accounts.set(slot.id, {
          id: slot.id, name: profile.name || slot.name, names: Object.keys(profile.names ?? {}),
          publicKeys: profile.publicKeys ?? [], banned: !!profile.banned,
          rating: rules.initialRating, games: 0, wins: 0, losses: 0, draws: 0, history: []
        });
      }
      return accounts.get(slot.id);
    }));
    const changes = gameChanges(players[0], players[1], outcomeA, performance, rules);
    for (const change of changes) {
      const account = accounts.get(change.id);
      const before = account.rating;
      const slot = slots.find((item) => item.id === change.id);
      const outcome = slot.userType === "winner" ? "Win" : slot.userType === "loser" ? "Loss" : "Draw";
      const play = performance?.get(change.id);
      account.rating += change.delta;
      account.games++;
      if (outcome === "Win") account.wins++;
      else if (outcome === "Loss") account.losses++;
      else account.draws++;
      account.history.push({
        matchId: game.sourceMatchId, date: game.startDate, map: game.mapName,
        teamSize: sides[0].length, outcome, before: round(before), after: round(account.rating),
        delta: round(change.delta), resultDelta: round(change.resultDelta),
        personalDelta: round(change.personalDelta), expectedWin: round(100 * change.expectedWin),
        performanceScore: play ? round(100 * play.score) : null,
        expectedPerformance: play ? round(100 * change.expectedPerformance) : null,
        performanceRank: play?.rank ?? null, fieldSize: play?.field ?? null,
        metricRanks: play ? Object.fromEntries(Object.entries(play.ranks).map(([key, value]) => [key, round(100 * value)])) : null
      });
    }
    coverage.rated++;
    if (performance) coverage.withPersonal++;
    else coverage.resultOnly++;
  }

  const players = [...accounts.values()].filter((account) => !account.banned).map((account) => ({
    ...account, rating: round(account.rating), provisional: account.games < rules.provisionalGames,
    history: account.history.reverse()
  })).sort((a, b) => b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name));
  return { format: 1, version: rules.version, sourceGeneratedAt: leaderboards.generatedAt,
    coverage, rules, players };
}

module.exports = { RULES, readMetrics, rankFraction, rankPerformance, gameChanges, calculateBeta3 };
