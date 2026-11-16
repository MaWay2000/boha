import {combineRulesets} from './wavehoster-data.mjs?v=20261116-results-1';

export function isBetaGroup(group, policy) {
  return group.version === policy.gameVersion && group.mods.length === 1 && group.mods[0] === policy.modHash;
}

export function isArcGroup(group, policy) {
  return group.mods.length === 1 && [policy.modHash, ...policy.archiveModHashes].includes(group.mods[0]);
}

export function betaSnapshot(snapshot, policy) {
  const groups = snapshot.groups.filter(group => isBetaGroup(group, policy));
  const ids = new Set(groups.map(group => group.id));
  return {...snapshot, groups, games: snapshot.games.filter(game => ids.has(game.group))};
}

export function betaRanking(snapshot, policy) {
  return {...combineRulesets(betaSnapshot(snapshot, policy)), id: 'beta'};
}

// Credits record observed nicknames, without claiming that equal names prove identity.
// Replay IDs make repeated publications idempotent and retain credits after pruning upstream.
export function collectTesters(snapshot, policy, previous = {format: 1, testers: []}) {
  if (previous.format !== 1 || !Array.isArray(previous.testers)) throw Error('Invalid tester archive');
  const testers = new Map(previous.testers.map(tester => [tester.name, {
    name: tester.name, firstSeenAt: tester.firstSeenAt, lastSeenAt: tester.lastSeenAt,
    replays: new Set(tester.replays)
  }]));
  const arcIds = new Set(snapshot.groups.filter(group => isArcGroup(group, policy)).map(group => group.id));
  for (const game of snapshot.games) {
    if (!arcIds.has(game.group)) continue;
    for (const name of new Set(game.players)) {
      if (!name.trim()) continue;
      const tester = testers.get(name) || {name, firstSeenAt: null, lastSeenAt: null, replays: new Set()};
      tester.replays.add(game.replaySha256 || game.id);
      if (game.startedAt) {
        if (!tester.firstSeenAt || game.startedAt < tester.firstSeenAt) tester.firstSeenAt = game.startedAt;
        if (!tester.lastSeenAt || game.startedAt > tester.lastSeenAt) tester.lastSeenAt = game.startedAt;
      }
      testers.set(name, tester);
    }
  }
  return {format: 1, testers: [...testers.values()].map(tester => ({...tester, replays: [...tester.replays].sort()}))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)};
}

