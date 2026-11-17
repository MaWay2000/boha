const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createHash} = require('node:crypto');
const {gunzipSync} = require('node:zlib');
const {publishMainLive} = require('./main-live-publication.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'main-live-'));
  const source = path.join(directory, 'source'), destination = path.join(directory, 'live');
  fs.mkdirSync(source);
  const boards = {format: 1, generatedAt: '2026-11-17T10:00:00Z', games: [{id: 'game', slots: []}],
    leaderboards: {Global: {matches: 1, players: [{id: 'one', name: 'Tester', elo: 2100, publicKeys: ['public-key'],
      names: {Tester: 1}, favoriteUnits: [], internalDetail: 'omit'}, {id: 'banned', name: 'Excluded', banned: true}],
      ratingEvents: {game: {one: {elo: 2100, eloDelta: 15}, banned: {elo: 2000, eloDelta: -15}}}}}};
  const matches = {format: 1, matches: [{id: 1, source: 'WaveHoster', source_match_id: 'replay', players: [{
    position: 0, team: 0, result: 'winner', score: 100, stats_source: 'replay-engine', kills: 2, droids_lost: 1,
    structures_destroyed: 0, research_complete: 5, droids_built: 4}]}]};
  function write() {
    const manifest = {format: 1, publishedAt: boards.generatedAt, files: {}};
    for (const [name, value] of [['leaderboards.json', boards], ['matches.json', matches]]) {
      const bytes = Buffer.from(JSON.stringify(value) + '\n');
      fs.writeFileSync(path.join(source, name), bytes);
      manifest.files[name] = {sha256: hash(bytes), bytes: bytes.length};
    }
    fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify(manifest));
  }
  write();
  return {directory, source, destination, boards, write};
}

test('main live data retains authoritative Elo, filters private/moderation fields and pins each compressed file', () => {
  const f = fixture();
  try {
    assert.equal(publishMainLive(f), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.destination, 'manifest.json')));
    const read = name => fs.readFileSync(path.join(f.destination, 'blobs', name, manifest.files[name].sha256 + '.json'));
    const boards = JSON.parse(read('leaderboards.json'));
    assert.equal(boards.leaderboards.Global.players.length, 1);
    assert.equal(boards.leaderboards.Global.players[0].elo, 2100);
    assert.deepEqual(boards.leaderboards.Global.players[0].publicKeys, ['public-key']);
    assert.equal(boards.leaderboards.Global.ratingEvents.game.banned, undefined);
    assert.ok(!read('leaderboards.json').includes('omit'));
    assert.equal(JSON.parse(read('rating-performance.json')).games['WaveHoster:replay'][0].kills, 2);
    for (const [name, metadata] of Object.entries(manifest.files)) {
      const bytes = read(name);
      assert.equal(hash(bytes), metadata.sha256);
      const compressed = fs.readFileSync(path.join(f.destination, 'blobs', name, metadata.sha256 + '.json.gz'));
      assert.deepEqual(gunzipSync(compressed), bytes);
    }
    assert.equal(publishMainLive(f), false);
    const oldHash = manifest.files['leaderboards.json'].sha256;
    f.boards.generatedAt = '2026-11-17T11:00:00Z';
    f.boards.leaderboards.Global.players[0].elo = 2120;
    f.write(); publishMainLive(f);
    assert.ok(fs.existsSync(path.join(f.destination, 'blobs/leaderboards.json', oldHash + '.json')));
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});

test('private or incomplete source generations cannot replace the last valid manifest', () => {
  const f = fixture();
  try {
    publishMainLive(f);
    const saved = fs.readFileSync(path.join(f.destination, 'manifest.json'), 'utf8');
    f.boards.leaderboards.Global.players[0].password = 'private';
    f.write();
    assert.throws(() => publishMainLive(f), /Private field/);
    assert.equal(fs.readFileSync(path.join(f.destination, 'manifest.json'), 'utf8'), saved);
    delete f.boards.leaderboards.Global.players[0].password;
    f.boards.generatedAt = '2026-11-17T12:00:00Z'; f.write();
    fs.appendFileSync(path.join(f.source, 'leaderboards.json'), ' ');
    assert.throws(() => publishMainLive(f), /hash\/length/);
    assert.equal(fs.readFileSync(path.join(f.destination, 'manifest.json'), 'utf8'), saved);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});
