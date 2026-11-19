const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { test } = require('node:test');

const source = fs.readFileSync(process.env.TERRAIN_ANALYZER_SOURCE || path.join(__dirname, '../replay-analyzer.js'), 'utf8');
const start = source.indexOf('  function replayMapArchiveDescriptor(');
const end = source.indexOf('\n  async function ', start);
assert.ok(start >= 0 && end > start, 'Find map recovery descriptor');
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);

const waveDefense = {
  match: {
    map: 'Wave-Defense',
    mapHash: 'bafefe8477794d5edf9d9dc5addb7f0a5254f0e9987a6a3e486599e06f9f8f39'
  }
};

test('recovers the exact Wave-Defense terrain archive', () => {
  for(const hash of ['d95d5cffff30deefac74e664c798a60554feea15f7828fb45774019a5a379130','fbb11b9ea17a26f961e8129bd40106809b2e6d6c931f0b8e6fda4ca1e3d07e38'])assert.equal(context.replayMapArchiveDescriptor({match:{map:'Wave-Defense',mapHash:hash}}).sha256,'47f0828cc091cd39d58aaf56ae27418852fe3f53e992b342020ed6f57b992d40');
  const descriptor = context.replayMapArchiveDescriptor(waveDefense);
  assert.equal(descriptor.path, 'stats/maps/wave-defense-terrain-47f0828cc091.wz');
  assert.equal(descriptor.sha256, '47f0828cc091cd39d58aaf56ae27418852fe3f53e992b342020ed6f57b992d40');
});

test('v158 uses its changed terrain while historical replays retain their original map', () => {
  const current=context.replayMapArchiveDescriptor({match:{map:'Wave-Defense',mapHash:'2e9aac0518ce74632eb55a40ec66f6207142b49e98b48647a3dab62358f6a86a'}});
  const previous=context.replayMapArchiveDescriptor(waveDefense);
  assert.equal(current.path,'stats/maps/wave-defense-terrain-8c08b592a32d.wz');
  assert.notEqual(current.sha256,previous.sha256);
});

test('does not substitute terrain when either map name or hash differs', () => {
  assert.equal(context.replayMapArchiveDescriptor({
    match: { ...waveDefense.match, map: 'Other map' }
  }), null);
  assert.equal(context.replayMapArchiveDescriptor({
    match: { ...waveDefense.match, mapHash: '0'.repeat(64) }
  }), null);
});

test('the verified archive contains terrain the production parser accepts', async () => {
  const terrainContext = vm.createContext({
    Blob,
    Response,
    DecompressionStream,
    Uint8Array,
    Uint16Array,
    DataView,
    Set,
    Map,
    Math,
    JSON,
    textDecoder: new TextDecoder()
  });
  for (const name of ['decompressZipEntry', 'readEmbeddedZipEntries', 'parseEmbeddedMapTerrain']) {
    const asyncStart = source.indexOf(`  async function ${name}(`);
    const plainStart = source.indexOf(`  function ${name}(`);
    const functionStart = asyncStart >= 0 ? asyncStart : plainStart;
    let functionEnd = source.indexOf('\n  function ', functionStart + 1);
    const asyncEnd = source.indexOf('\n  async function ', functionStart + 1);
    if (asyncEnd >= 0 && (functionEnd < 0 || asyncEnd < functionEnd)) functionEnd = asyncEnd;
    assert.ok(functionStart >= 0 && functionEnd > functionStart, `Find production function ${name}`);
    vm.runInContext(source.slice(functionStart, functionEnd), terrainContext);
  }
  const terrains=[];
  for(const mapHash of [waveDefense.match.mapHash,'2e9aac0518ce74632eb55a40ec66f6207142b49e98b48647a3dab62358f6a86a']){
    const descriptor=context.replayMapArchiveDescriptor({match:{map:'Wave-Defense',mapHash}});
    const archive=fs.readFileSync(path.join(__dirname,'..',descriptor.path));
    assert.equal(crypto.createHash('sha256').update(archive).digest('hex'),descriptor.sha256);
    const entries=await terrainContext.readEmbeddedZipEntries(new Uint8Array(archive),new Set(['game.map','ttypes.ttp','level.json']));
    const terrain=terrainContext.parseEmbeddedMapTerrain(entries);
    assert.ok(terrain,'Terrain should parse');
    assert.equal(terrain.width,80);assert.equal(terrain.height,128);
    assert(terrain.maximumHeight>terrain.minimumHeight);assert(terrain.tileIds.some(id=>id>0));
    assert.equal(terrain.heights.length,terrain.width*terrain.height);terrains.push(terrain);
  }
  const [oldMap,newMap]=terrains;
  const row=94*80;
  assert.equal(Array.from(newMap.heights.slice(row,row+80)).filter(h=>h===38).length,15,'v158 retains the approved 15-tile entrance');
  assert(newMap.heights[row+25]>200,'v158 closes the left bypass with a ridge');
  assert(newMap.heights[row+55]>200,'v158 closes the right bypass with a ridge');
  assert(oldMap.heights[row+25]<50,'Historical replay retains the former wide entrance');
});
