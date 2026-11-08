const fs = require('node:fs'), path = require('node:path');
function buildPerformance(matches) {
  const games = {};
  for (const match of matches) {
    if (!match.source || !match.source_match_id) continue;
    const rows = {};
    for (const player of match.players || []) {
      if (player.stats_source !== 'replay-engine' || !Number.isSafeInteger(player.position)
        || !Number.isSafeInteger(player.team) || !['winner','loser','contender'].includes(player.result)
        || typeof player.score !== 'number' || !Number.isFinite(player.score)
        || ['kills','droids_lost','structures_destroyed','research_complete','droids_built']
          .some(key => !Number.isSafeInteger(player[key]) || player[key] < 0)) continue;
      rows[player.position] = { team: player.team, result: player.result, score: player.score, kills: player.kills,
        droids_lost: player.droids_lost, structures_destroyed: player.structures_destroyed,
        research_complete: player.research_complete, droids_built: player.droids_built };
    }
    if (Object.keys(rows).length) games[`${match.source}:${match.source_match_id}`] = rows;
  }
  return { format: 2, games };
}
module.exports = { buildPerformance };
if (require.main === module) {
  const directory = path.join(__dirname, 'published');
  const input = JSON.parse(fs.readFileSync(path.join(directory, 'matches.json'), 'utf8'));
  const data = buildPerformance(input.matches);
  fs.writeFileSync(path.join(directory, 'rating-performance.json'), JSON.stringify(data) + '\n');
  console.log(`Built verified performance for ${Object.keys(data.games).length} matches.`);
}
