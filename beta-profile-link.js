"use strict";

// A stable, compact public-key fingerprint for share links (not an account secret).
function betaProfileToken(id) {
  let hash = 0xcbf29ce484222325n;
  for (const character of String(id)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `b${hash.toString(36)}`;
}

function betaProfileLinkId(player, players) {
  const token = betaProfileToken(player.id);
  return players.filter((item) => betaProfileToken(item.id) === token).length === 1
    ? token
    : player.id;
}

function findBetaProfile(players, requested) {
  const exact = players.find((player) => player.id === requested);
  if (exact) return exact;
  const matches = players.filter((player) => betaProfileToken(player.id) === requested);
  return matches.length === 1 ? matches[0] : null;
}

if (typeof module !== "undefined") {
  module.exports = { betaProfileToken, betaProfileLinkId, findBetaProfile };
}
