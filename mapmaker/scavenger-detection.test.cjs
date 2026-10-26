const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const {mapPlayerIndex} = await import('./js/archiveImport.js');
  const source = fs.readFileSync(path.join(__dirname, 'js/game.js'), 'utf8');
  function extract(name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    const rest = source.slice(start), end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  }
  const input = {value:'', options:[{value:'', textContent:'Auto (No)'}, {value:'0'}, {value:'1'}]};
  let scheduled = 0;
  const ctx = vm.createContext({
    mapPlayerIndex, objectsGroup:{children:[]}, currentDroidEntries:[],
    currentMapInfoOverrides:{scavengers:''}, currentLevelJson:{scavs:1},
    currentServerMapMetadata:{scavs:1}, settingsMapScavengersInput:input, mapDirty:false,
    scheduleLocalAutosave:() => {scheduled++;},
    currentMapExportInfo:null, currentMapArchive:null, tilesetIndex:0, mapW:128, mapH:128,
    getSaveMapName:() => 'Scavenger test', getOfficialTilesetName:() => 'arizona',
    getSaveMapVersion:() => '1.0',
    buildDefaultLevelJson:() => '{"author":{"name":"Original author"},"license":"CC0","scavs":1}',
    buildDefaultGamJson:() => '{}'
  });
  for (const name of ['getStructurePlayer', 'getObjectEntryPlayer', 'getDetectedMapScavengers',
    'getSaveScavengers', 'updateScavengerInfoInput', 'setMapDirty', 'markMapDirty',
    'markMapClean', 'setMapInfoOverrideField', 'updateGammaMetadata']) {
    vm.runInContext(extract(name), ctx);
  }
  function expectAuto(value, message) {
    const originalOverrides = JSON.stringify(ctx.currentMapInfoOverrides);
    ctx.updateScavengerInfoInput();
    assert.equal(ctx.getDetectedMapScavengers(), value, message);
    assert.equal(ctx.getSaveScavengers(), value);
    assert.equal(input.value, '');
    assert.equal(input.options[0].textContent, value === '1' ? 'Auto (Yes)' : 'Auto (No)');
    assert.equal(JSON.stringify(ctx.currentMapInfoOverrides), originalOverrides,
      'Detection never freezes Auto into an override');
  }
  expectAuto('0', 'Missing objects are No, regardless of stale metadata');
  vm.runInContext(extract('getDefaultMapInfoOverrides'), ctx);
  const restoreSource = extract('loadLocalSaveSnapshot');
  const restoreStart = restoreSource.indexOf('  currentMapInfoOverrides =');
  const restoreEnd = restoreSource.indexOf('  updateMapInfoInputs();', restoreStart);
  assert(restoreStart >= 0 && restoreEnd > restoreStart);
  for (const previous of ['0','1','']) {
    ctx.snapshot = {mapInfo:{name:'Saved map',author:'Original author',license:'MIT',scavengers:previous}};
    vm.runInContext(restoreSource.slice(restoreStart, restoreEnd), ctx);
    expectAuto('0', 'Settings defaults to Auto when restoring a saved or generated map');
    assert.equal(ctx.currentMapInfoOverrides.name, 'Saved map');
    assert.equal(ctx.currentMapInfoOverrides.author, 'Original author');
    assert.equal(ctx.currentMapInfoOverrides.license, 'MIT');
  }
  ctx.objectsGroup = null;
  expectAuto('0', 'No scene objects before loading is safe');
  ctx.objectsGroup = {children:[
    {userData:{structureExport:{player:0, name:'A0BaBaBunker'}}},
    {userData:{featureExport:{player:10, name:'OilResource'}}},
    {userData:{}}
  ]};
  expectAuto('0', 'Human-owned scavenger models, oil and preview groups are not scavenger ownership');
  ctx.objectsGroup.children.push({userData:{structureExport:{player:10}}});
  expectAuto('1', 'Numeric scavenger owner');
  ctx.objectsGroup.children.pop();
  ctx.objectsGroup.children.push({userData:{structureExport:{sourceEntry:{player:'ScAvEnGeRs'}}}});
  expectAuto('1', 'Text scavenger owner');
  ctx.objectsGroup.children[3].userData.structureExport = {sourceEntry:{startpos:10}};
  expectAuto('1', 'Legacy structure startpos');
  ctx.objectsGroup.children.pop();
  ctx.currentDroidEntries = [{player:0}, {player:'scavenger'}];
  expectAuto('1', 'Droid-only scavenger map');
  ctx.currentDroidEntries = [{startpos:10}];
  expectAuto('1', 'Legacy droid startpos');

  ctx.markMapClean();
  assert.equal(ctx.mapDirty, false);
  assert.equal(input.options[0].textContent, 'Auto (Yes)', 'Loaded map refreshes after all entities are restored');
  ctx.currentDroidEntries.length = 0;
  ctx.markMapDirty();
  assert.equal(input.options[0].textContent, 'Auto (No)', 'Deleting the last scavenger refreshes the field');
  assert.equal(ctx.mapDirty, true);
  assert.equal(scheduled, 1, 'Ordinary autosave behavior is unchanged');
  ctx.currentDroidEntries.push({player:10});
  ctx.markMapDirty();
  assert.equal(input.options[0].textContent, 'Auto (Yes)', 'Adding or undoing removal refreshes the field');
  ctx.currentDroidEntries[0].player = 1;
  ctx.markMapDirty();
  assert.equal(input.options[0].textContent, 'Auto (No)', 'Owner changes are reflected');

  ctx.setMapInfoOverrideField('scavengers', '1', false);
  assert.equal(input.value, '1'); assert.equal(ctx.getSaveScavengers(), '1', 'Manual Yes is retained');
  ctx.currentDroidEntries.push({player:10});
  ctx.setMapInfoOverrideField('scavengers', '0', false);
  assert.equal(input.value, '0'); assert.equal(ctx.getSaveScavengers(), '0', 'Manual No is retained');
  assert.equal(input.options[0].textContent, 'Auto (Yes)', 'Automatic result remains visible as an option');
  ctx.setMapInfoOverrideField('scavengers', '', false);
  expectAuto('1', 'Switching back to Auto resumes live detection');

  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'js/jszip.min.js'), 'utf8'), {
    module:mod, exports:mod.exports, require, Buffer, setTimeout, clearTimeout,
    setImmediate, clearImmediate, Uint8Array, ArrayBuffer, DataView
  });
  for (const [override, droids, expected] of [
    ['', [{player:10}], 1], ['', [], 0], ['0', [{player:10}], 0], ['1', [], 1]
  ]) {
    ctx.currentMapInfoOverrides = {scavengers:override};
    ctx.currentDroidEntries = droids;
    const zip = new mod.exports();
    await ctx.updateGammaMetadata(zip, 'Scavenger test');
    const level = JSON.parse(await zip.file('level.json').async('string'));
    assert.equal(level.scavs, expected, 'Saved numeric metadata matches the selected detection mode');
    assert.deepEqual(level.author, {name:'Original author'});
    assert.equal(level.license, 'CC0', 'Unrelated provenance is unchanged');
  }

  const archive = await import('./js/archiveImport.js');
  for (const [filename, expected] of [
    ['8c-DA-julia-40oil8p-4b0e1970d387ba2ac1b99f5cd1f5abb0ce3c2c1b8c956fe45659496f1f4db98a.wz', '1'],
    ['6c-WaterEarth-4a7c6108c6e03b4d7b0a330d26b8dcd266e43501e495770fe6d0775aa116975e.wz', '0']
  ]) {
    const zip = await mod.exports.loadAsync(fs.readFileSync(path.join(__dirname, 'maps', filename)));
    const structs = await archive.readMapArchiveEntities(zip, 'struct');
    const droids = await archive.readMapArchiveEntities(zip, 'droid');
    ctx.objectsGroup = {children:structs.entries.map(entry =>
      ({userData:{structureExport:{sourceEntry:entry}}}))};
    ctx.currentDroidEntries = droids.entries;
    ctx.currentMapInfoOverrides = {scavengers:''};
    expectAuto(expected, 'Real map: ' + filename);
  }
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const ownerContext = vm.createContext({document:{createElement:() => ({})}});
  vm.runInContext(extract('populatePlayerSelect'), ownerContext);
  for (const tab of ['Structures', 'Objects', 'Droids']) {
    const select = {value:'3', options:[], appendChild(option) {this.options.push(option);}};
    ownerContext.populatePlayerSelect(select);
    assert.equal(select.options.length, 11, tab + ' keeps all owner slots');
    for (let player = 0; player < 10; player++) {
      assert.equal(select.options[player].textContent, 'Player ' + player);
      assert.equal(select.options[player].value, String(player));
    }
    assert.equal(select.options[10].textContent, 'Player 10 (Scavengers)', tab + ' labels the scavenger slot');
    assert.equal(select.options[10].value, '10', 'The underlying owner value is unchanged');
    assert.equal(select.value, '3', 'Current owner selection is unchanged');
    ownerContext.populatePlayerSelect(select);
    assert.equal(select.options.length, 11, 'Repeated refresh does not duplicate options');
  }
  assert.doesNotThrow(() => ownerContext.populatePlayerSelect(null));
  assert.match(html, /id="settingsMapScavengersInput">\s*<option value="">Auto \(No\)<\/option>/);
  assert.match(extract('updateMapInfoInputs'), /updateScavengerInfoInput\(\)/);
  assert.match(extract('setActiveTab'), /if \(tab === 'settings'\) updateScavengerInfoInput\(\)/);
  assert.match(extract('buildSaveResultDetails'), /scavengers: getSaveScavengers\(\)/);
  console.log('PASS: scavenger autodetection, structures/droids, ownership, live refresh, overrides, saved metadata and real maps.');
})().catch(error => {console.error(error); process.exitCode = 1;});
