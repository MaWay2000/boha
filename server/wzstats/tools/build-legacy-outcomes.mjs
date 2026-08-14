import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'stats/results-snapshot.json'), 'utf8'));
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'stats/player-public-keys.json'), 'utf8'));
const outputPath = path.join(root, 'server/wzstats/data/legacy-outcomes.json');

const matches = [];
for (const result of snapshot.results ?? []) {
  const sourceMatchId = /\/replays\/(\d+)/.exec(result.replayUrl ?? '')?.[1];
  if (!sourceMatchId) continue;

  matches.push({
    legacyOrder: matches.length,
    source: 'bohan',
    sourceMatchId,
    resultSource: 'legacy',
    game: {
      version: result.game?.version ?? '',
      startDate: result.game?.startDate ?? null,
      endDate: result.endDate ?? null,
      duration: result.game?.timeGameEnd ?? 0,
      mapName: result.game?.mapName ?? '',
      mods: result.game?.mods ?? '',
      alliancesType: result.game?.alliancesType ?? 0,
      timeout: Boolean(result.game?.timeout),
      cheated: Boolean(result.game?.cheated),
    },
    players: (result.playerData ?? []).map(player => ({
      name: player.name ?? '',
      publicKey: player.publicKey ?? null,
      canonicalPublicKey: player.publicKey ? (aliases[player.publicKey] ?? player.publicKey) : null,
      position: player.position ?? 0,
      team: player.team ?? 0,
      usertype: player.usertype ?? null,
    })),
  });
}

fs.writeFileSync(outputPath, `${JSON.stringify({ format: 1, generatedAt: new Date().toISOString(), matches })}\n`);
console.log(`Wrote ${matches.length} outcome facts to ${outputPath}`);
