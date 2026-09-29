"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RULES, calculateBeta1, gameChanges, qualifiedGame } = require("./beta1-rating");

test("equal teams start with symmetric result points", () => {
  const teamA = [{ id: "a", rating: 1500, games: 0 }, { id: "b", rating: 1500, games: 0 }];
  const teamB = [{ id: "c", rating: 1500, games: 0 }, { id: "d", rating: 1500, games: 0 }];
  const changes = gameChanges(teamA, teamB, 1);
  assert.deepEqual(changes.map((change) => change.delta), [8, 8, -8, -8]);
  assert.ok(changes.every((change) => change.personalDelta === 0));
});

test("a strong losing teammate can gain points without exceeding the cap", () => {
  const teamA = [{ id: "a", rating: 1500, games: 20 }, { id: "b", rating: 1500, games: 20 }];
  const teamB = [{ id: "c", rating: 1500, games: 20 }, { id: "d", rating: 1500, games: 20 }];
  const performance = new Map([["a", 1], ["b", -1], ["c", 0], ["d", 0]]);
  const changes = gameChanges(teamA, teamB, 0, performance);
  assert.ok(changes[0].delta > 0);
  assert.ok(changes[0].personalDelta <= RULES.personalCap);
  assert.ok(changes.every((change) => Math.abs(change.delta) <= RULES.matchCap));
});

test("draws use equal half-point team result", () => {
  const teamA = [{ id: "a", rating: 1500, games: 20 }, { id: "b", rating: 1500, games: 20 }];
  const teamB = [{ id: "c", rating: 1500, games: 20 }, { id: "d", rating: 1500, games: 20 }];
  assert.ok(gameChanges(teamA, teamB, 0.5).every((change) => change.delta === 0));
});

test("only equal two-team keyed games qualify", () => {
  const ids = ["A", "B", "C", "D"].map((letter) => letter.repeat(43) + "=");
  const known = new Map(ids.map((id) => [id, { id }]));
  const slots = ids.map((id, position) => ({
    id, name: `Player ${position}`, position, team: position < 2 ? 0 : 1,
    userType: position < 2 ? "winner" : "loser"
  }));
  const game = { resultSource: "replay-engine", duration: 300000, slots };
  const match = { players: slots.map((slot) => ({
    position: slot.position, name: slot.name, stats_source: "replay-engine",
    kills: 10, droids_lost: 5, structures_destroyed: 1, droids_built: 20, research_complete: 5
  })) };
  assert.ok(qualifiedGame(game, match, known, RULES));
  assert.equal(qualifiedGame({ ...game, duration: 60000 }, match, known, RULES), null);
  assert.equal(qualifiedGame({ ...game, slots: slots.slice(1) }, match, known, RULES), null);
  assert.equal(qualifiedGame({ ...game, slots: slots.map((slot) => ({ ...slot, team: null })) }, match, known, RULES), null);
});

test("banned accounts are hidden from the published beta snapshot", () => {
  const ids = ["A", "B", "C", "D"].map((letter) => letter.repeat(43) + "=");
  const slots = ids.map((id, position) => ({
    id, name: `Player ${position}`, position, team: position < 2 ? 0 : 1,
    userType: position < 2 ? "winner" : "loser"
  }));
  const leaderboards = {
    generatedAt: "2026-09-29T00:00:00Z",
    leaderboards: { Global: { players: ids.map((id, position) => ({ id, name: slots[position].name, banned: position === 0 })) } },
    games: [{ id: "source:1", sourceMatchId: "1", resultSource: "replay-engine", duration: 300000, startDate: 1,
      mapName: "test", slots }]
  };
  const matches = { matches: [{ source: "source", source_match_id: "1", players: slots.map((slot) => ({
    position: slot.position, name: slot.name, stats_source: "replay-engine",
    kills: 1, droids_lost: 1, structures_destroyed: 1, droids_built: 1, research_complete: 1
  })) }] };
  const result = calculateBeta1(leaderboards, matches);
  assert.equal(result.coverage.rated, 1);
  assert.equal(result.players.length, 3);
  assert.ok(result.players.every((player) => !player.banned));
});
