import {replaySource} from './wavehoster-data.mjs';

export function arcProfileUrl(group, player = '') {
  const params = new URLSearchParams({tab: 'wavehoster', ruleset: group});
  if (player) params.set('player', player);
  return 'index.html?' + params;
}

export function normalizeArcRecentGames(snapshot) {
  if (snapshot?.format !== 1 || snapshot.source !== 'WaveHoster'
      || !Array.isArray(snapshot.groups) || !Array.isArray(snapshot.games)) throw Error('Invalid Arc Mod match list.');
  const groups = new Map(snapshot.groups.filter(group => group && typeof group.id === 'string')
    .map(group => [group.id, new Map((Array.isArray(group.players) ? group.players : [])
      .filter(player => player && typeof player.id === 'string').map(player => [player.id, player]))]));
  return snapshot.games.flatMap(game => {
    if (!game || typeof game.id !== 'string' || !groups.has(game.group) || typeof game.map !== 'string'
        || !Number.isFinite(game.durationMilliseconds) || game.durationMilliseconds < 0) return [];
    if (game.status !== 'confirmed' && game.durationMilliseconds < 180000) return [];
    const startDate = Date.parse(game.startedAt), source = replaySource(game);
    if (!Number.isFinite(startDate) || !source) return [];
    const participants = Array.isArray(game.participants) && game.participants.length
      ? game.participants : (Array.isArray(game.players) ? game.players : []).map(name => ({name}));
    const players = participants.filter(player => player && typeof player.name === 'string').map((player, position) => {
      const identity = groups.get(game.group).get(player.id);
      return {position, userType: game.status === 'confirmed' ? player.result : null,
        account: {id: player.id, name: player.name,
          names: new Map((Array.isArray(identity?.names) ? identity.names : [{name: player.name, games: 1}])
            .filter(alias => alias && typeof alias.name === 'string').map(alias => [alias.name, alias.games])),
          publicKeys: new Set(Array.isArray(identity?.publicKeys) ? identity.publicKeys : []),
          arcProfileUrl: identity ? arcProfileUrl(game.group, player.id) : null}};
    });
    return [{id: 'arc:' + game.id, key: 'arc:' + game.id, source: 'wavehoster', sourceMatchId: game.id,
      sourceLabel: 'Arc Mod', mapName: game.map, mods: '', startDate,
      endDate: startDate + game.durationMilliseconds, duration: game.durationMilliseconds,
      replayUrl: source.replayUrl, replaySha256: game.replaySha256 || null,
      arcMatch: {group: game.group, status: game.status, leaderboardUrl: arcProfileUrl(game.group)},
      players, slots: players, teams: players.map(slot => ({players: [slot], userType: slot.userType}))}];
  });
}

function replayHash(game) {
  return game.replaySha256 || game.replayUrl?.match(/\/replays\/([a-f0-9]{64})(?:[/?#]|$)/)?.[1] || null;
}

export function mergeRecentGames(mainGames, arcGames) {
  const hashes = new Set(mainGames.map(replayHash).filter(Boolean));
  const ids = new Set(mainGames.filter(game => game.source === 'wavehoster').map(game => String(game.sourceMatchId)));
  const combined = [...mainGames];
  for (const game of arcGames) {
    const hash = replayHash(game), id = String(game.sourceMatchId);
    if ((hash && hashes.has(hash)) || ids.has(id)) continue;
    combined.push(game);
    if (hash) hashes.add(hash);
    ids.add(id);
  }
  return combined;
}
