"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RULES, rankPerformance, gameChanges, calculateBeta3 } = require("./beta3-rating");

const ids = ["A", "B", "C", "D", "E", "F"].map((letter) => letter.repeat(43) + "=");
const names = ["SadaMaza", "Thanquol", "Player is so rusty", "Cedar Tree", "ProPenus", "MLG"];
const stats = [
  [1801179, 649, 443, 27, 89, 503],
  [1360248, 331, 497, 19, 78, 572],
  [282298, 246, 542, 11, 85, 529],
  [1637816, 496, 569, 40, 93, 671],
  [1118924, 340, 314, 86, 93, 547],
  [2833218, 641, 338, 208, 98, 491]
].map(([score, kills, droids_lost, structures_destroyed, research_complete, droids_built], position) => ({
  position, name: names[position], stats_source: "replay-engine", score, kills,
  droids_lost, structures_destroyed, research_complete, droids_built
}));

test("screenshot-like strong losing performance gains about three points", () => {
  const ranked = rankPerformance(stats);
  assert.equal(ranked[0].rank, 2);
  assert.equal(ranked[0].score, 0.7);
  const players = ids.map((id) => ({ id, rating: 1500, games: 20 }));
  const performance = new Map(ids.map((id, index) => [id, ranked[index]]));
  const changes = gameChanges(players.slice(0, 3), players.slice(3), 0, performance);
  assert.equal(changes[0].resultDelta, -4);
  assert.ok(Math.abs(changes[0].delta - 3.2) < 0.001);
  assert.ok(changes.every((change) => Math.abs(change.delta) <= RULES.matchCap));
});

test("metric midranks are centered and ties do not favor slot order", () => {
  const same = stats.map((player) => ({ ...player, score: 5, kills: 5,
    droids_lost: 5, structures_destroyed: 5, research_complete: 5, droids_built: 5 }));
  assert.deepEqual(rankPerformance(same).map((player) => player.score), Array(6).fill(0.5));
});

test("a highly rated player must outperform higher expectations", () => {
  const ranked = rankPerformance(stats);
  const players = ids.map((id, index) => ({ id, rating: index === 0 ? 1900 : 1500, games: 20 }));
  const performance = new Map(ids.map((id, index) => [id, ranked[index]]));
  const changes = gameChanges(players.slice(0, 3), players.slice(3), 0, performance);
  assert.ok(changes[0].expectedPerformance > 0.8);
  assert.ok(changes[0].personalDelta < 0);
  assert.ok(changes[0].delta < 0);
});

test("missing or untrusted match counters use result-only scoring", () => {
  const slots = ids.map((id, position) => ({ id, name: names[position], position,
    team: position < 3 ? 0 : 1, userType: position < 3 ? "loser" : "winner" }));
  const leaderboards = {
    generatedAt: "2026-09-29T00:00:00Z",
    leaderboards: { Global: { players: ids.map((id, position) => ({ id, name: names[position], banned: position === 1 })) } },
    games: [{ id: "source:1", sourceMatchId: "1", resultSource: "replay-engine", duration: 1998000,
      startDate: 1, mapName: "NTW_3v3Full", slots }]
  };
  const matches = { matches: [{ source: "source", source_match_id: "1", players: stats.map((player) => ({ ...player,
    kills: player.position === 2 ? null : player.kills })) }] };
  const result = calculateBeta3(leaderboards, matches);
  assert.equal(result.coverage.rated, 1);
  assert.equal(result.coverage.resultOnly, 1);
  assert.equal(result.players.length, 5);
  assert.ok(result.players.every((player) => player.history[0].performanceRank === null));
});
