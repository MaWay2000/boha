const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const {getNextMapVersion,writeMapVersion,readMapVersion} = await import('./js/mapVersion.js');
  const {readMapArchiveMetadata} = await import('./js/archiveImport.js');
  for (const [current,next] of [['1.0','1.1'],['1.1','1.2'],['1.9','1.10'],['2.0','2.1'],['1','1.1']]) {
    assert.equal(getNextMapVersion(current), next);
  }
  for (const custom of ['', 'beta', 'v1.0', '1.0.3', '1.-1', '1.999999999999999999999']) {
    assert.equal(getNextMapVersion(custom), '', 'Custom/unrepresentable versions are not guessed');
  }
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'), {
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  const archive = new mod.exports();
  const originalLevel = '// Author: Original author\n// License: CC0\nplayers 4';
  const originalMap = Buffer.from([1,2,3,4]);
  archive.file('old.lev',originalLevel); archive.file('game.map',originalMap);
  assert.equal(await readMapVersion(archive),'');
  writeMapVersion(archive,'1.0');
  assert.equal((await readMapArchiveMetadata(archive)).data.versionName,'1.0');
  writeMapVersion(archive,'1.1');
  const reopened = await mod.exports.loadAsync(await archive.generateAsync({type:'nodebuffer'}));
  assert.equal(await readMapVersion(reopened),'1.1');
  const metadata = (await readMapArchiveMetadata(reopened)).data;
  assert.equal(metadata.versionName,'1.1'); assert.equal(metadata.author,'Original author'); assert.equal(metadata.license,'CC0');
  assert.equal(await reopened.file('old.lev').async('string'),originalLevel,'Legacy format is preserved');
  assert.deepEqual(await reopened.file('game.map').async('nodebuffer'),originalMap,'Version metadata does not rewrite terrain');
  reopened.file('level.json',JSON.stringify({name:'Modern map',versionName:'1.0',author:'Modern author',license:'MIT'}));
  assert.equal((await readMapArchiveMetadata(reopened)).data.versionName,'1.1','Latest saved version wins over old embedded metadata');
  reopened.file('mapmaker-version.json','malformed');
  assert.equal((await readMapArchiveMetadata(reopened)).data.versionName,'1.0','Malformed optional metadata cannot prevent loading');
  const source = fs.readFileSync(path.join(__dirname,'js/game.js'),'utf8');
  const extract = name => {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    const rest = source.slice(start), end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  };
  const tracking = vm.createContext({currentLevelJson:{versionName:'1.0'},savedMapVersion:'',mapDirty:true});
  tracking.setMapDirty = value => { tracking.mapDirty = value; };
  vm.runInContext(extract('markMapClean'),tracking); tracking.markMapClean();
  assert.equal(tracking.savedMapVersion,'1.0'); assert.equal(tracking.mapDirty,false,'Loading remembers the recorded version without marking an edit');
  const classic = new mod.exports(); classic.file('old.lev',originalLevel); classic.file('game.map',originalMap);
  const generate = classic.generateAsync.bind(classic);
  classic.generateAsync = options => generate({...options,type:'nodebuffer'});
  const exporting = vm.createContext({currentMapArchive:classic,currentMapExportInfo:{gamma:false},currentMapArchivePath:'game.map',
    currentMapScript:null,getSafeMapBase:() => 'Classic map',getSaveMapVersion:() => '2.1',writeMapVersion,
    updateStructJson(){},updateFeatureJson(){},updateDroidJson(){},writeMapScriptSource(){},
    buildMapFileBytes:() => originalMap,getTileTypesArchivePath:() => 'ttypes.ttp',buildTileTypesFileBytes:() => Buffer.from([0])});
  vm.runInContext(extract('buildWzFileBlob'),exporting);
  const saved = await mod.exports.loadAsync(await exporting.buildWzFileBlob());
  assert.equal((await readMapArchiveMetadata(saved)).data.versionName,'2.1','The production exporter records versions for classic archives too');
  assert.equal(await saved.file('old.lev').async('string'),originalLevel);
  console.log('PASS: minor-version suggestions, custom versions, legacy/modern version metadata export/reopen, and unchanged terrain/attribution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
