import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePublishedRatings, readBohanPreference, writeBohanPreference, BOHAN_PREFERENCE_KEY } from "./bohan-live-rating.mjs";

function fixture() {
  const a = { name: "A", elo: 1700, winCount: 3, loseCount: 2, drawCount: 1, discounted: false, games: [] };
  const b = { name: "B", elo: 1300, winCount: 2, loseCount: 3, drawCount: 1, discounted: false, games: [] };
  const omitted = { name: "Historical only", elo: 1500, winCount: 0, loseCount: 1, drawCount: 0, games: [] };
  const game = (date) => {
    const slots = [a, b, omitted].map(account => ({ account, elo: 1700, eloDelta: 15, userType: "loser" }));
    return { startDate: date - 1, endDate: date, slots, players: slots, teams: [], eloDelta: 15 };
  };
  return { accounts: new Map([["a", a], ["b", b]]), games: [game(20), game(10)] };
}

test("replays fresh Elo in chronological order without changing published facts or exposing profiles", () => {
  const board = fixture();
  let called = false;
  const module = { eloBase: 1500, calculate(games) {
    called = true;
    assert.deepEqual(games.map(g => g.endDate), [10, 20]);
    assert.equal(board.accounts.get("a").elo, 1500);
    assert.equal(board.accounts.get("a").eloCount, 0);
    assert.equal(board.accounts.get("a").winCount, 0);
    for (const game of games) {
      assert.equal(game.eloDelta, undefined);
      assert.equal(game.slots[0].eloDelta, undefined);
      assert.equal(game.slots[2].account.discounted, true);
      assert.equal(game.slots[0].leftGameTime, undefined);
      game.slots[0].account.elo += 20;
      game.slots[0].account.winCount++;
      game.slots[0].eloDelta = 20;
    }
  } };
  const result = calculatePublishedRatings(board, module);
  assert.ok(called);
  assert.equal(result.accounts.get("a").elo, 1540);
  assert.equal(result.accounts.get("a").winCount, 3);
  assert.equal(result.accounts.get("a").loseCount, 2);
  assert.equal(result.accounts.get("a").drawCount, 1);
  assert.equal(result.accounts.size, 2);
  assert.equal(result.games[0].endDate, 20);
  assert.equal(result.games[0].slots[0].userType, "loser");
});

test("bad remote output fails and original records survive calculation errors", () => {
  const board = fixture();
  assert.throws(() => calculatePublishedRatings(board, { eloBase: 1500, calculate() {
    board.accounts.get("a").elo = NaN;
  } }), /invalid rating/);
  assert.equal(board.accounts.get("a").winCount, 3);
  assert.throws(() => calculatePublishedRatings(board, { eloBase: 1500, calculate() {
    throw new Error("Remote API changed");
  } }), /Remote API changed/);
  assert.equal(board.accounts.get("a").loseCount, 2);
});

test("remembers both source selections and tolerates unavailable storage", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readBohanPreference(storage), false);
  writeBohanPreference(storage, true);
  assert.equal(values.get(BOHAN_PREFERENCE_KEY), "true");
  assert.equal(readBohanPreference(storage), true);
  writeBohanPreference(storage, false);
  assert.equal(readBohanPreference(storage), false);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readBohanPreference(blocked), false);
  assert.doesNotThrow(() => writeBohanPreference(blocked, true));
});
