export function combineRulesets(snapshot) {
  const players = new Map();
  for (const group of snapshot.groups) {
    for (const source of group.players) {
      let player = players.get(source.id);
      if (!player) {
        player = {id: source.id, name: source.name, identityVerified: source.identityVerified,
          games: 0, wins: 0, losses: 0, draws: 0, bestScore: null, kills: 0,
          names: new Map(), publicKeys: new Set()};
        players.set(source.id, player);
      }
      for (const stat of ['games', 'wins', 'losses', 'draws', 'kills']) player[stat] += source[stat] || 0;
      if (source.bestScore !== null && source.bestScore !== undefined) {
        player.bestScore = player.bestScore === null ? source.bestScore : Math.max(player.bestScore, source.bestScore);
      }
      for (const alias of source.names || [{name: source.name, games: source.games}]) {
        player.names.set(alias.name, (player.names.get(alias.name) || 0) + alias.games);
      }
      for (const key of source.publicKeys || []) player.publicKeys.add(key);
    }
  }
  const rows = [...players.values()].map(player => ({...player,
    names: [...player.names].map(([name, games]) => ({name, games})).sort((a, b) => b.games - a.games || compareNames(a, b)),
    publicKeys: [...player.publicKeys].sort()
  }));
  rows.sort((a, b) => b.wins - a.wins || (b.bestScore ?? -Infinity) - (a.bestScore ?? -Infinity) || compareNames(a, b));
  return {id: 'all', players: rows, matches: snapshot.games.length,
    confirmed: snapshot.games.filter(game => game.status === 'confirmed').length};
}

function compareNames(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }

// Arc-Mw release numbers are separate from the Warzone engine version.
const waveDefenseVersions = new Map([
  ['e4e44b8b3c4c613be8087e1239fe0d723e9dc3683aac4bb43fcbfc90986dd135', 105],
  ['62827e781783c57c6ca38c399dd250501a4f5ac5242c575057c426c93885e0d6', 105],
  ['603b093ee7bdc8357c569def1fad6a02266c1c7fa91a67aa28563b25f7543f31', 156],
  ['1b8d56e83cd276ddd1476efbf1bfbf31195b5e892ef4fc361c3f57455aae4e30', 157],
  ['7e8766f17fcfb3010a487df97dff4b8fa463072d5e6caabd746404e6ac4a7a4a', 158],
  ['63b5333af9cd97c5dd8b132833a693727c068c45f08e8f58e91bf3afcf065d97', 158],
  ['d1e67949610119d8964808329c106f8eef789cc3fd4aefce470e2f03e21a289a', 159],
  ['0a192b2209eb541aff24c8789e1fb7108c2e7890454f4b3a46eb02a4844e33ce', 160]
]);

// Both archives share the same mod and have no embedded release number.
const factionsReleaseOrder = new Map([
  ['a7a599d47d7fb12799aae1dd9db91006bc30beb97ab7ea1b25cdba9403f4f106', 1],
  ['4e64e1e29554b5032f8d45f5ed6bea46056ee4ef0c002cafa231383b86b0f3c7', 2]
]);

function combineBuilds(groups, gamesByGroup) {
  const builds = new Map();
  for (const group of groups) {
    const id = group.modVersion ? `v${group.modVersion}` : group.id;
    if (!builds.has(id)) builds.set(id, {id, groups: [], games: [], modVersion: group.modVersion});
    const build = builds.get(id);
    build.groups.push(group);
    build.games.push(...(gamesByGroup.get(group.id) || []));
  }
  return [...builds.values()].map(build => ({...combineRulesets(build), id: build.id,
    groupIds: build.groups.map(group => group.id), modVersion: build.modVersion,
    firstPlayed: build.games.reduce((first, game) => game.startedAt && (!first || game.startedAt < first) ? game.startedAt : first, '')
  })).sort((a, b) => (b.modVersion || 0) - (a.modVersion || 0) || b.firstPlayed.localeCompare(a.firstPlayed));
}

function rankModReleases(family, gamesByGroup) {
  const waveDefense = family.name === 'Wave-Defense';
  const latestWins = new Map();
  const groups = family.groups.map(group => {
    const hash = group.mods.length === 1 ? group.mods[0] : undefined;
    const modVersion = waveDefense && (Number.isSafeInteger(group.modVersion) && group.modVersion > 0
      ? group.modVersion : waveDefenseVersions.get(hash)) || undefined;
    const version = waveDefense ? modVersion : factionsReleaseOrder.get(hash);
    const replayWins = new Map();
    for (const game of gamesByGroup.get(group.id) || []) {
      const hostWin = waveDefense && game.status === 'stats-only' && waveResult(game)?.result === 'winner';
      for (const participant of game.participants || []) {
        if (!participant.id || (!hostWin && participantResult(game, participant) !== 'winner')) continue;
        if (!replayWins.has(participant.id)) replayWins.set(participant.id, new Map());
        replayWins.get(participant.id).set(game.replaySha256 || game.id, participant.score);
      }
    }
    return {...group, modVersion, releaseOrder: version, players: group.players.map(player => {
      const scores = replayWins.get(player.id);
      const wins = Math.max(player.wins || 0, scores?.size || 0);
      if (wins && version !== undefined) {
        let bestScore = -Infinity;
        for (const score of scores?.values() || []) if (Number.isFinite(score)) bestScore = Math.max(bestScore, score);
        const latest = latestWins.get(player.id);
        if (!latest || version > latest.version) latestWins.set(player.id, {version, wins, bestScore});
        else if (version === latest.version) {
          latest.wins += wins;
          latest.bestScore = Math.max(latest.bestScore, bestScore);
        }
      }
      return {...player, wins};
    })};
  });
  const ranking = combineRulesets({...family, groups});
  ranking.players.sort((a, b) => {
    const left = latestWins.get(a.id);
    const right = latestWins.get(b.id);
    return (right?.version ?? 0) - (left?.version ?? 0) || (right?.wins ?? 0) - (left?.wins ?? 0) ||
      (right?.bestScore ?? -Infinity) - (left?.bestScore ?? -Infinity);
  });
  const currentVersion = groups.reduce((latest, group) => Math.max(latest, group.releaseOrder ?? 0), 0);
  if (currentVersion > 0) {
    ranking.currentPodium = ranking.players.filter(player => latestWins.get(player.id)?.version === currentVersion)
      .slice(0, 3).map(player => {
        const {wins, bestScore} = latestWins.get(player.id);
        return {...player, wins, bestScore: Number.isFinite(bestScore) ? bestScore : null};
      });
    ranking.testerPodium = combineRulesets({...family, groups: groups.filter(group => group.releaseOrder !== currentVersion)})
      .players.filter(player => player.wins > 0).slice(0, 3);
  }
  ranking.builds = combineBuilds(groups, gamesByGroup);
  return ranking;
}

// Use each combined mod's existing standings, never the cross-mod ALL ranking.
export function modMedals(groups) {
  const medals = new Map();
  for (const group of groups) {
    const podiums = [{players: group.currentPodium ?? group.players.slice(0, 3), tester: false},
      {players: group.testerPodium ?? [], tester: true}];
    for (const {players, tester} of podiums) {
      players.forEach((player, index) => {
        if (!medals.has(player.id)) medals.set(player.id, []);
        medals.get(player.id).push({modId: group.id, modName: group.name, tester,
          place: index + 1, metal: ['gold', 'silver', 'bronze'][index],
          wins: player.wins, bestScore: player.bestScore});
      });
    }
  }
  return medals;
}

const medalPoints = {gold: 3, silver: 2, bronze: 1};

const medalPointTenths = medal => medalPoints[medal.metal] * (medal.tester ? 3 : 10);
export const medalPointValue = medal => medalPointTenths(medal) / 10;

export function rankAllMods(snapshot, medals) {
  const group = combineRulesets(snapshot);
  for (const player of group.players) {
    player.medalPoints = (medals.get(player.id) || []).reduce((total, medal) =>
      total + medalPointTenths(medal), 0) / 10;
  }
  group.players.sort((a, b) => b.medalPoints - a.medalPoints || b.games - a.games ||
    b.kills - a.kills || compareNames(a, b) || a.id.localeCompare(b.id));
  return group;
}

export function participantResult(game, player) {
  if (game.status === 'confirmed') return ['winner', 'loser', 'contender'].includes(player.result) ? player.result : 'unknown';
  if (game.status === 'unknown' && game.modsVerified === true && player.result === 'loser' && player.resultReason === 'departure' &&
      typeof game.durationMilliseconds === 'number' && Number.isFinite(game.durationMilliseconds) &&
      typeof player.leftAtMilliseconds === 'number' && Number.isFinite(player.leftAtMilliseconds) &&
      player.leftAtMilliseconds > 0 && player.leftAtMilliseconds <= game.durationMilliseconds) return 'loser';
  return 'unknown';
}

export function matchResults(game) {
  const wave = waveResult(game);
  if (wave) return [wave];
  const labels = {winner: 'Win', loser: 'Lost', contender: 'Draw'};
  const players = (game.participants || []).filter(player => participantResult(game, player) !== 'unknown');
  if (!players.length) return [{label: game.status === 'pending' ? 'Awaiting analysis' : 'Result unavailable', result: 'unknown',
    title: game.modsVerified !== true ? 'The exact mod has not been verified.' : 'No verified final result or matched host ending is available.'}];
  const results = players.map(player => ({name: player.name, result: participantResult(game, player),
    label: player.resultReason === 'departure' ? 'Left game (loss)' : labels[participantResult(game, player)]}));
  if (game.status !== 'confirmed') for (const name of game.players || []) {
    if (!players.some(player => player.name === name)) results.push({name, result: 'unknown', label: 'Result unavailable'});
  }
  if (results.every(player => player.result === results[0].result)) {
    return [{label: results[0].label, result: results[0].result}];
  }
  return results.map(player => ({...player, label: `${player.name}: ${player.label}`}));
}

export function waveResult(game) {
  if (game.modsVerified !== true || !Number.isFinite(game.durationMilliseconds) || !Number.isInteger(game.waveReached) || game.waveReached < 0 || game.waveReached > 60 ||
      !Number.isFinite(game.waveEndedAtMilliseconds) || game.waveEndedAtMilliseconds <= 0 ||
      game.waveEndedAtMilliseconds > game.durationMilliseconds ||
      !['victory', 'defeat'].includes(game.waveOutcome) ||
      !['wave-clear', 'departure', 'scripted-defeat'].includes(game.waveEndReason) ||
      (game.waveOutcome === 'victory' && (game.waveReached !== 60 || game.waveEndReason !== 'wave-clear')) ||
      (game.waveOutcome === 'defeat' && game.waveEndReason === 'wave-clear')) return null;
  const result = game.waveOutcome === 'victory' ? 'winner' : 'loser';
  if (game.status === 'confirmed' && (game.participants || []).some(player =>
      ['winner', 'loser', 'contender'].includes(player.result) && player.result !== result)) return null;
  const label = game.waveOutcome === 'victory' ? 'Victory' : game.waveEndReason === 'departure' ? 'Left game (loss)' : 'Defeated';
  return {label: `${label} · Wave ${game.waveReached}/60`, result,
    title: game.waveEndReason === 'departure' ? 'A player departure was recorded before the scripted ending. Leaving counts as a loss.' :
      'Ending and wave reached recorded by the host and matched to this exact replay. This does not certify scores or kills.'};
}

export function replaySource(game) {
  const hash = String(game.replaySha256 || '');
  const id = String(game.id || '');
  const replayUrl = /^[a-f0-9]{64}$/.test(hash)
    ? 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/' + hash
    : /^\d{8}_\d{6}_\d+$/.test(id) ? 'https://api.wavehoster.net/v1/replays/' + id : null;
  return replayUrl ? {replayUrl, sourceLabel: 'WaveHoster', sourceUrl: 'https://api.wavehoster.net/v1/replays'} : null;
}


export function moddedArcSnapshot(snapshot) {
  const groups = snapshot.groups.filter(group => group &&
    (group.isMapMod === true || !Array.isArray(group.mods) || group.mods.length > 0));
  const ids = new Set(groups.map(group => group.id));
  return {...snapshot, groups, games: snapshot.games.filter(game => ids.has(game?.group))};
}

// Combine the public view by displayed mod name; keep the recorded snapshot intact.
export function combineModNames(snapshot) {
  const gamesByGroup = new Map();
  for (const game of snapshot.games) {
    if (!gamesByGroup.has(game.group)) gamesByGroup.set(game.group, []);
    gamesByGroup.get(game.group).push(game);
  }
  const families = new Map();
  const ids = new Map();
  for (const group of snapshot.groups) {
    const games = gamesByGroup.get(group.id) || [];
    const maps = new Map();
    for (const game of games) maps.set(game.map, (maps.get(game.map) || 0) + 1);
    const map = [...maps].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Custom mod';
    const name = group.mods.length || group.isMapMod === true ? (map === 'BOHA-Wave-Defense' ? 'Wave-Defense' : map) : 'Unmodded';
    if (!families.has(name)) families.set(name, {name, groups: [], games: []});
    const family = families.get(name);
    family.groups.push(group);
    family.games.push(...games);
    ids.set(group.id, 'mod:' + name);
  }
  const groups = [...families.values()].map(family => ({
    ...(['Wave-Defense', 'FactionsMod'].includes(family.name) ? rankModReleases(family, gamesByGroup) :
      {...combineRulesets(family), builds: combineBuilds(family.groups, gamesByGroup)}),
    id: 'mod:' + family.name, name: family.name,
    groupIds: family.groups.map(group => group.id)
  }));
  return {...snapshot, groups, games: snapshot.games.map(game => ({...game, build: game.group, group: ids.get(game.group) || game.group}))};
}
