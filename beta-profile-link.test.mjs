import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const { betaProfileToken, betaProfileLinkId, findBetaProfile } = require("./beta-profile-link.js");

test("short profile links resolve while full-key links remain valid", () => {
  for (const filename of ["beta1.json", "beta3.json"]) {
    const players = JSON.parse(readFileSync(new URL(`./stats/published/${filename}`, import.meta.url))).players;
    const tokens = players.map((player) => betaProfileLinkId(player, players));
    assert.equal(new Set(tokens).size, players.length);
    for (const player of players) {
      const token = betaProfileLinkId(player, players);
      assert.ok(token.length < player.id.length);
      assert.equal(findBetaProfile(players, token), player);
      assert.equal(findBetaProfile(players, player.id), player);
    }
  }
});

test("ambiguous fingerprints never resolve to the wrong player", () => {
  const players = [{ id: "one" }, { id: "one" }];
  assert.equal(betaProfileLinkId(players[0], players), "one");
  assert.equal(findBetaProfile(players, betaProfileToken("one")), null);
});
