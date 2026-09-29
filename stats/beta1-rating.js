"use strict";

// Experimental, shadow-only rating. This module never changes public ELO.
const RULES = Object.freeze({
  version: "beta1-2026-09-29",
  initialRating: 1500,
  teamScale: 400,
  contributionScale: 400,
  establishedK: 10,
  provisionalExtraK: 6,
  provisionalGames: 20,
  personalWeight: 30,
  personalCap: 8,
  matchCap: 15,
  minimumMinutes: 3,
  minimumPeerSamples: 80,
  metrics: Object.freeze({ combat: 0.45, pressure: 0.25, production: 0.20, technology: 0.10 })
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value) => Math.round(value * 100) / 100;
const keyed = (id) => /^[A-Za-z0-9+/]{43}=$/.test(String(id));

function softmax(values) {
  const top = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - top));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function gameChanges(teamA, teamB, outcomeA, performance = null, rules = RULES) {
  const average = (players) => players.reduce((sum, player) => sum + player.rating, 0) / players.length;
  const expectedA = 1 / (1 + 10 ** ((average(teamB) - average(teamA)) / rules.teamScale));
  const result = [];
  for (const [team, outcome, expected] of [[teamA, outcomeA, expectedA], [teamB, 1 - outcomeA, 1 - expectedA]]) {
    const expectedShare = softmax(team.map((player) => player.rating / rules.contributionScale));
    const values = performance ? team.map((player) => performance.get(player.id)) : [];
    const havePerformance = values.length === team.length && values.every(Number.isFinite);
    const observedShare = havePerformance ? softmax(values) : null;
    team.forEach((player, index) => {
      const k = rules.establishedK + rules.provisionalExtraK *
        Math.max(0, 1 - player.games / rules.provisionalGames);
      const resultDelta = k * (outcome - expected);
      const personalDelta = observedShare
        ? clamp(rules.personalWeight * (observedShare[index] - expectedShare[index]),
          -rules.personalCap, rules.personalCap)
        : 0;
      const delta = clamp(resultDelta + personalDelta, -rules.matchCap, rules.matchCap);
      result.push({
        id: player.id,
        expectedWin: expected,
        expectedShare: expectedShare[index],
        observedShare: observedShare?.[index] ?? null,
        resultDelta,
        personalDelta,
        delta
      });
    });
  }
  return result;
}

function lowerBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function putSorted(sorted, value) {
  sorted.splice(upperBound(sorted, value), 0, value);
}

function bucketKeys(size, map, minutes) {
  const duration = minutes < 15 ? "short" : minutes < 40 ? "medium" : "long";
  return [`${size}|${map}|${duration}`, `${size}|*|${duration}`, `${size}|*|*`];
}

function rawMetrics(player, minutes) {
  const names = ["kills", "droids_lost", "structures_destroyed", "droids_built", "research_complete"];
  if (names.some((name) => !Number.isFinite(Number(player[name])) || player[name] === null || Number(player[name]) < 0)) {
    return null;
  }
  return {
    combat: Math.log((Number(player.kills) + 5) / (Number(player.droids_lost) + 5)),
    pressure: Number(player.structures_destroyed) / minutes,
    production: Number(player.droids_built) / minutes,
    technology: Number(player.research_complete) / minutes
  };
}

function percentile(history, keys, metric, value, minimum) {
  for (const key of keys) {
    const values = history.get(`${key}|${metric}`);
    if (!values || values.length < minimum) continue;
    return (lowerBound(values, value) + upperBound(values, value)) / (2 * values.length);
  }
  return null;
}

function recordMetrics(history, keys, metrics) {
  for (const key of keys) {
    for (const [metric, value] of Object.entries(metrics)) {
      const name = `${key}|${metric}`;
      if (!history.has(name)) history.set(name, []);
      putSorted(history.get(name), value);
    }
  }
}

function qualifiedGame(game, match, knownPlayers, rules) {
  if (game.resultSource !== "replay-engine" || game.cheated || game.crashed ||
      !Number.isFinite(Number(game.duration)) || game.duration < rules.minimumMinutes * 60000 ||
      !Array.isArray(game.slots) || !match || !Array.isArray(match.players)) return null;
  const teams = new Map();
  const seenIds = new Set();
  for (const slot of game.slots) {
    if (!keyed(slot.id) || !knownPlayers.has(slot.id) || knownPlayers.get(slot.id).bot ||
        seenIds.has(slot.id) || slot.team == null || slot.team === "" ||
        !Number.isInteger(Number(slot.team)) || !["winner", "loser", "contender"].includes(slot.userType)) return null;
    seenIds.add(slot.id);
    if (!teams.has(slot.team)) teams.set(slot.team, []);
    teams.get(slot.team).push(slot);
  }
  if (teams.size !== 2) return null;
  const sides = [...teams.values()];
  if (sides[0].length !== sides[1].length || sides[0].length < 2) return null;
  const types = sides.map((side) => [...new Set(side.map((slot) => slot.userType))]);
  if (types.some((type) => type.length !== 1)) return null;
  const pair = types.map((type) => type[0]);
  let outcomeA;
  if (pair[0] === "winner" && pair[1] === "loser") outcomeA = 1;
  else if (pair[0] === "loser" && pair[1] === "winner") outcomeA = 0;
  else if (pair[0] === "contender" && pair[1] === "contender") outcomeA = 0.5;
  else return null;
  const statsByPosition = new Map(match.players.map((player) => [Number(player.position), player]));
  const statistics = sides.flat().map((slot) => {
    const stats = statsByPosition.get(Number(slot.position));
    if (!stats || stats.stats_source !== "replay-engine" ||
        String(stats.name).toLocaleLowerCase() !== String(slot.name).toLocaleLowerCase()) return null;
    return stats;
  });
  return { sides, outcomeA, statistics };
}

function calculateBeta1(leaderboards, matches, rules = RULES) {
  const globalPlayers = leaderboards?.leaderboards?.Global?.players ?? [];
  const knownPlayers = new Map(globalPlayers.map((player) => [player.id, player]));
  const matchById = new Map((matches.matches ?? []).map((match) => [
    `${match.source}:${match.source_match_id}`, match
  ]));
  const accounts = new Map();
  const history = new Map();
  const coverage = { considered: 0, rated: 0, withPersonal: 0, resultOnly: 0 };
  const games = [...(leaderboards.games ?? [])].sort((a, b) =>
    Number(a.startDate) - Number(b.startDate) || String(a.id).localeCompare(String(b.id)));

  for (const game of games) {
    coverage.considered++;
    const qualified = qualifiedGame(game, matchById.get(game.id), knownPlayers, rules);
    if (!qualified) continue;
    const { sides, outcomeA, statistics } = qualified;
    const minutes = game.duration / 60000;
    const keys = bucketKeys(sides[0].length, String(game.mapName ?? ""), minutes);
    const metrics = statistics.map((stats) => stats ? rawMetrics(stats, minutes) : null);
    const haveMetrics = metrics.every(Boolean);
    const performance = new Map();
    if (haveMetrics) {
      sides.flat().forEach((slot, index) => {
        const values = Object.entries(rules.metrics).map(([metric, weight]) => {
          const f = percentile(history, keys, metric, metrics[index][metric], rules.minimumPeerSamples);
          return f === null ? null : weight * (2 * f - 1);
        });
        if (values.every((value) => value !== null)) {
          performance.set(slot.id, values.reduce((sum, value) => sum + value, 0));
        }
      });
    }
    const usePersonal = performance.size === sides.flat().length;
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
    const changes = gameChanges(players[0], players[1], outcomeA, usePersonal ? performance : null, rules);
    for (const change of changes) {
      const account = accounts.get(change.id);
      const before = account.rating;
      const slot = sides.flat().find((item) => item.id === change.id);
      const outcome = slot.userType === "winner" ? "Win" : slot.userType === "loser" ? "Loss" : "Draw";
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
        observedShare: change.observedShare === null ? null : round(100 * change.observedShare),
        expectedShare: round(100 * change.expectedShare)
      });
    }
    coverage.rated++;
    if (usePersonal) coverage.withPersonal++;
    else coverage.resultOnly++;
    // Record the current match only after every participant has been scored.
    if (haveMetrics) metrics.forEach((value) => recordMetrics(history, keys, value));
  }

  const players = [...accounts.values()].filter((account) => !account.banned).map((account) => ({
    ...account,
    rating: round(account.rating),
    provisional: account.games < rules.provisionalGames,
    history: account.history.reverse()
  })).sort((a, b) => b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name));
  return {
    format: 1,
    version: rules.version,
    sourceGeneratedAt: leaderboards.generatedAt,
    coverage,
    rules,
    players
  };
}

module.exports = { RULES, calculateBeta1, gameChanges, qualifiedGame, rawMetrics, softmax };
