import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SETTINGS, BOHAN_SETTINGS, STORAGE_KEY, normalizeSettings, readSettings, saveSettings, calculatePersonalRatings } from "./personal-ratings.mjs";

function fixture() {
  const a = { name: "A", mainPublicKey: "a", games: [], elo: 1900, winCount: 7, loseCount: 4, drawCount: 1 };
  const b = { name: "B", mainPublicKey: "b", games: [], elo: 1200, winCount: 3, loseCount: 8, drawCount: 2 };
  function game(id, time, types = ["winner", "loser"]) {
    const slots = [a, b].map((account, position) => ({ account, position, team: position, userType: types[position], elo: 1500, eloDelta: 99 }));
    const value = { id, startDate: time - 1, endDate: time, duration: 600000, alliancesType: 2, slots,
      teams: slots.map(slot => ({ players: [slot], slots: [slot], userType: slot.userType })), players: slots };
    a.games.push(value); b.games.push(value);
    return value;
  }
  const board = { accounts: new Map([["a", a], ["b", b]]), games: [game("first", 10)] };
  return { board, a, b, game };
}
const options = changes => ({ ...CURRENT_SETTINGS, minimumGames: 0, ...changes });

test("K20, K40 and the new-player boost produce distinct known 1v1 ratings", () => {
  const { board } = fixture();
  assert.equal(calculatePersonalRatings(board, options()).accounts.get("a").elo, 1510);
  assert.equal(calculatePersonalRatings(board, options({ k: 40 })).accounts.get("a").elo, 1520);
  assert.equal(calculatePersonalRatings(board, { ...BOHAN_SETTINGS, minimumGames: 0 }).accounts.get("a").elo, 1540);
});

test("preview leaves published ratings, outcomes and source objects untouched", () => {
  const { board, a } = fixture();
  const preview = calculatePersonalRatings(board, options());
  assert.equal(a.elo, 1900);
  assert.equal(a.games[0].slots[0].eloDelta, 99);
  assert.notEqual(preview.accounts.get("a"), a);
  assert.equal(preview.accounts.get("a").winCount, 7);
  assert.equal(preview.accounts.get("a").loseCount, 4);
  assert.equal(preview.accounts.get("a").drawCount, 1);
  assert.equal(preview.accounts.get("a").games[0], preview.games[0]);
});

test("replay ordering is chronological, with a deterministic tie break", () => {
  const { board, game } = fixture();
  const second = game("second", 20, ["loser", "winner"]);
  const first = board.games[0];
  const ordered = calculatePersonalRatings({ ...board, games: [first, second] }, options());
  const reversed = calculatePersonalRatings({ ...board, games: [second, first] }, options());
  assert.equal(ordered.accounts.get("a").elo, reversed.accounts.get("a").elo);
  assert.equal(reversed.games[0].id, "second");
});

test("new-player multiplier decreases, and zero boost games disables it without NaN", () => {
  const { board, game } = fixture();
  board.games.push(game("second", 20));
  const preview = calculatePersonalRatings(board, options({ multiplier: 2, multiplierGames: 1 }));
  assert.equal(preview.games[0].slots[0].eloDelta, 20);
  assert.ok(preview.games[1].slots[0].eloDelta < 10);
  assert.equal(calculatePersonalRatings(board, options({ multiplier: 2, multiplierGames: 0 })).games[0].slots[0].eloDelta, 10);
});

test("minimum games, match duration, crashes and cheats affect rating eligibility", () => {
  const { board } = fixture();
  assert.equal(calculatePersonalRatings(board, CURRENT_SETTINGS).ratedGames, 0);
  for (const change of [{ duration: 1000 }, { crashed: true }, { cheated: true }]) {
    const preview = calculatePersonalRatings({ ...board, games: [{ ...board.games[0], ...change }] }, options());
    assert.equal(preview.ratedGames, 0);
    assert.equal(preview.games[0].slots[0].eloDelta, null);
  }
  assert.equal(calculatePersonalRatings(board, options({ minimumMinutes: 11 })).ratedGames, 0);
});

test("omitted and banned accounts cannot become rated by lowering the minimum", () => {
  const { board, b } = fixture();
  board.accounts.delete("b");
  const hidden = calculatePersonalRatings(board, options());
  assert.equal(hidden.accounts.has("b"), false);
  assert.equal(hidden.games[0].slots[1].account.discounted, true);
  assert.equal(hidden.games[0].slots[1].account.elo, 1500);
  board.accounts.set("b", b);
  b.banned = true;
  assert.equal(calculatePersonalRatings(board, options()).accounts.get("b").elo, 1500);
});

test("equal-team requirement can be toggled and FFA uses player positions", () => {
  const { board, a } = fixture();
  const c = { ...a, mainPublicKey: "c", games: [...a.games] };
  board.accounts.set("c", c);
  board.games[0].slots.push({ account: c, position: 2, team: 0, userType: "winner" });
  assert.equal(calculatePersonalRatings(board, options()).ratedGames, 0);
  assert.equal(calculatePersonalRatings(board, options({ equalTeams: false })).ratedGames, 1);
  board.games[0].alliancesType = 0;
  for (const slot of board.games[0].slots) slot.team = 0;
  assert.equal(calculatePersonalRatings(board, options()).ratedGames, 1);
});

test("draws, zero K and custom starting Elo remain finite", () => {
  const { board } = fixture();
  for (const slot of board.games[0].slots) slot.userType = "contender";
  assert.equal(calculatePersonalRatings(board, options()).accounts.get("a").elo, 1500);
  const preview = calculatePersonalRatings(fixture().board, options({ k: 0, base: 1000 }));
  assert.equal(preview.accounts.get("a").elo, 1000);
  assert.equal(preview.games[0].slots[0].eloDelta, 0);
});

test("conflicting player identities in one game are skipped", () => {
  const { board, a } = fixture();
  board.games[0].slots[1].account = a;
  assert.equal(calculatePersonalRatings(board, options()).ratedGames, 0);
});

test("invalid, nonfinite and out-of-range settings are rejected", () => {
  for (const change of [{ k: NaN }, { k: Infinity }, { k: -1 }, { k: "20" }, { multiplierGames: 0.5 }, { minimumMinutes: 181 }, { equalTeams: 1 }]) {
    assert.throws(() => normalizeSettings({ ...CURRENT_SETTINGS, ...change }));
  }
});

test("only the personal storage key changes; bad or unavailable storage is tolerated", () => {
  const values = new Map([["existing-progress", "keep"]]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(readSettings(storage), null);
  assert.equal(saveSettings(storage, CURRENT_SETTINGS), true);
  assert.deepEqual(readSettings(storage), CURRENT_SETTINGS);
  values.set(STORAGE_KEY, '{"version":1,"settings":{"k":"bad"}}');
  assert.equal(readSettings(storage), null);
  saveSettings(storage, null);
  assert.equal(values.get("existing-progress"), "keep");
  assert.equal(values.has(STORAGE_KEY), false);
  assert.equal(readSettings(undefined), null);
  assert.equal(saveSettings(undefined, CURRENT_SETTINGS), false);
});
