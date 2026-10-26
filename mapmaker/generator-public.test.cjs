const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const {generateMap} = await import('./js/mapGenerator.js');
  const {mountMapGenerator} = await import('./js/mapGeneratorUI.js');
  const {loadMapUnified} = await import('./js/maploader.js');
  const source = fs.readFileSync(path.join(__dirname, 'js/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  function extract(name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    const rest = source.slice(start), end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  }
  const tileTypes = vm.runInNewContext(source.slice(source.indexOf('const DEFAULT_TILE_TYPES_BY_TILESET ='),
    source.indexOf('let selectedTileId')) + ';DEFAULT_TILE_TYPES_BY_TILESET');
  const structures = JSON.parse(fs.readFileSync(path.join(__dirname, 'structure.json'), 'utf8'));
  const features = JSON.parse(fs.readFileSync(path.join(__dirname, 'features.json'), 'utf8'));
  const catalog = {tileTypes, tileCounts:[78,81,80],
    structures:Object.entries(structures).map(([id,def]) => ({id,sizeX:def.width||2,sizeY:def.breadth||2})),
    features:Object.entries(features).map(([id,def]) => ({id,sizeX:def.width||1,sizeY:def.breadth||1}))};
  assert(html.indexOf('data-tab="file"') < html.indexOf('data-tab="generate"'));
  assert(html.indexOf('data-tab="generate"') < html.indexOf('data-tab="settings"'));
  assert.match(html, /id="generatePanel" class="panel"/);
  assert.match(html, /\.generator-update-actions\[hidden\]/);

  // Exercise the actual controls without starting a browser or creating a map tab.
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {};
      this.value = ''; this.hidden = false; this.disabled = false; this.text = '';
      const names = new Set();
      this.classList = {add:name => names.add(name), remove:name => names.delete(name),
        toggle:(name,on) => on ? names.add(name) : names.delete(name)};
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    setAttribute(name,value) { this.attributes[name] = String(value); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    addEventListener(type,callback) { (this.listeners[type] ||= []).push(callback); }
    async emit(type) { for (const callback of this.listeners[type] || []) await callback({preventDefault(){}}); }
  }
  const find = (node,predicate) => predicate(node) ? node : node.children.map(child => find(child,predicate)).find(Boolean);
  const oldDocument = globalThis.document;
  globalThis.document = {createElement:tag => new Element(tag)};
  try {
    const host = new Element('div');
    let current = generateMap({},catalog).snapshot;
    current.name = 'Keep this name'; current.mapInfo.author = 'Keep this author';
    current.mapInfo.license = 'MIT'; current.id = 'original-save';
    const applied = [];
    mountMapGenerator(host, {snapshot:() => current, catalog:async() => catalog,
      apply:async snapshot => { current = {...snapshot,id:snapshot.id||'generated-save'}; applied.push(current); return current.id; }});
    const form = find(host,node => node.tagName === 'form');
    const width = find(host,node => node.id === 'gen-width');
    const tileset = find(host,node => node.id === 'gen-tileset');
    const variety = find(host,node => node.id === 'gen-textureVariety');
    const varietyTrack = find(host,node => node.children.includes(variety));
    const varietyMax = varietyTrack.children.at(-1);
    const varietyValue = find(host,node => node.htmlFor === variety.id);
    const actions = find(host,node => node.className === 'generator-update-actions');
    const update = find(host,node => node.id === 'generateUpdateMap');
    assert.equal(applied.length,0,'Opening Generate does not change the current map');
    assert.equal(actions.hidden,true);
    assert.equal(Number(variety.max),78); assert.equal(varietyMax.textContent,'78');
    variety.value = '70'; await form.emit('input');
    assert.equal(variety.value,'70'); assert.equal(varietyValue.textContent,'70');
    tileset.value = '1'; variety.value = '81'; await form.emit('change');
    assert.equal(Number(variety.max),81); assert.equal(varietyMax.textContent,'81');
    assert.equal(variety.value,'81'); assert.equal(varietyValue.textContent,'81');
    tileset.value = '2'; await form.emit('input');
    assert.equal(Number(variety.max),80); assert.equal(varietyMax.textContent,'80');
    assert.equal(variety.value,'80'); assert.equal(varietyValue.textContent,'80');
    tileset.value = '0'; await form.emit('change');
    assert.equal(Number(variety.max),78); assert.equal(varietyMax.textContent,'78');
    assert.equal(variety.value,'78'); assert.equal(applied.length,0,'Range changes do not regenerate the map');
    await actions.children[1].emit('click');
    assert.equal(Number(variety.value),3); assert.equal(Number(tileset.value),0);
    const preset = find(host,node => node.id === 'gen-preset');
    preset.value = 'city'; await preset.emit('change');
    assert.equal(Number(variety.max),81); assert.equal(varietyMax.textContent,'81','Presets refresh the limit too');
    await actions.children[1].emit('click');
    assert.equal(Number(variety.max),78); assert.equal(Number(variety.value),3);
    width.value = '160'; await form.emit('input');
    assert.equal(applied.length,0,'Changing controls waits for Update map');
    assert.equal(actions.hidden,false);
    await actions.children[1].emit('click');
    assert.equal(Number(width.value),128); assert.equal(applied.length,0,'Cancel leaves the map untouched');
    width.value = '160'; await form.emit('input'); await update.emit('click');
    assert.equal(applied.length,1); assert.equal(current.mapW,160);
    assert.equal(current.name,'Keep this name'); assert.equal(current.mapInfo.author,'Keep this author');
    assert.equal(current.mapInfo.license,'MIT'); assert.equal(actions.hidden,true);
    width.value = '192'; await form.emit('input'); await update.emit('click');
    assert.equal(applied.length,2); assert.equal(current.id,'generated-save','Updates reuse the generated local save');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }

  // Check the production bridge connects generation to the existing editor path.
  let mounted, restored, dirty = 0, saved = 0, tab = null;
  const bridgeContext = vm.createContext({
    document:{getElementById:() => ({})}, mountMapGenerator:(_host,bridge) => {mounted = bridge;},
    makeLocalSaveSnapshot:() => ({name:'Current map'}), currentLocalSaveId:'current-save',
    loadStructureDefs:async() => {}, loadFeatureDefs:async() => {}, loadComponentDefs:async() => {},
    STRUCTURE_DEFS:catalog.structures, FEATURE_DEFS:catalog.features,
    DEFAULT_TILE_TYPES_BY_TILESET:tileTypes, TILESETS:catalog.tileCounts.map(count => ({count})),
    SMART_WATER_TILE_HINTS:{}, bodyDefs:{Body1REC:{}}, propDefs:{wheeled01:{}}, weaponDefs:{MG1Mk1:{}},
    makeLocalSaveId:() => 'new-save', loadLocalSaveSnapshot:async snapshot => {restored = snapshot;},
    markMapDirty:() => {dirty++;}, saveLocalAutosaveNow:() => {saved++;}, setActiveTab:value => {tab = value;}
  });
  const mountStart = source.lastIndexOf("mountMapGenerator(document.getElementById('generatePanel'),");
  assert(mountStart >= 0);
  vm.runInContext(source.slice(mountStart),bridgeContext);
  assert.equal(mounted.snapshot().id,'current-save');
  assert.deepEqual(Array.from((await mounted.catalog()).bodyIds),['Body1REC']);
  const generated = generateMap({water:20,waterStyle:'river'},catalog).snapshot;
  const requested = {...generated,id:'reuse-save'};
  assert.equal(await mounted.apply(requested),'reuse-save');
  assert.notEqual(restored,requested,'Apply takes an independent snapshot');
  assert.equal(restored.exportFormat,'classic40'); assert.equal(dirty,1); assert.equal(saved,1); assert.equal(tab,'generate');

  // Round-trip the generated terrain through the real public binary exporter and importer branch.
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'),{
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  generated.mapRotations[20][20] = 2; generated.mapXFlip[20][20] = true;
  const exportContext = vm.createContext({...generated,Uint8Array,DataView,
    currentMapExportInfo:{gamma:false,version:40,width:generated.mapW,height:generated.mapH,tail:null},
    currentMapArchive:null,currentLevelJson:null,currentMapInfoOverrides:generated.mapInfo,
    getSaveMapName:() => generated.name,getOfficialTilesetName:() => 'arizona',getSaveScavengers:() => '0'});
  for (const name of ['buildTileNumber','getReusableMapTail','buildClassicMapFileBytes',
    'buildDefaultLevelJson','buildDefaultGamJson','updateGammaMetadata','isBuilderDroid']) {
    vm.runInContext(extract(name),exportContext);
  }
  const zip = new mod.exports();
  await exportContext.updateGammaMetadata(zip,'Generated map');
  const level = JSON.parse(await zip.file('level.json').async('string'));
  assert.equal(level.mapmakerFormat,'classic40'); assert.equal(level.players,4);
  const bytes = exportContext.buildClassicMapFileBytes();
  const loadSource = extract('loadMapFile');
  const decodeStart = loadSource.indexOf('const generatedClassic40 =');
  const decodeEnd = loadSource.indexOf('console.log("Loaded map format:", result.format, result);',decodeStart);
  assert(decodeStart >= 0 && decodeEnd > decodeStart);
  let conversions = 0;
  const importContext = vm.createContext({File,fileData:bytes,currentLevelJson:level,
    currentMapExportInfo:{gamma:true,version:40},mapFileName:'game.map',ttypesMap:null,autoTs:0,
    setLoadingProgress(){},setTileset:async() => {},loadMapUnified,
    convertGammaGameMapToClassic:() => {conversions++; return null;}});
  const decoded = await vm.runInContext('(async()=>{' + loadSource.slice(decodeStart,decodeEnd) +
    ';return result;})()',importContext);
  assert.equal(conversions,0,'Marked generated maps bypass gamma reinterpretation');
  assert.equal(importContext.currentMapExportInfo.gamma,false);
  for (let y = 0; y < generated.mapH; y++) for (let x = 0; x < generated.mapW; x++) {
    assert.equal(decoded.mapHeights[y][x],generated.mapHeights[y][x],'Generated height at ' + x + ',' + y);
    assert.equal(decoded.mapTiles[y][x],generated.mapTiles[y][x],'Generated tile at ' + x + ',' + y);
  }
  assert.equal(decoded.mapRotations[20][20],2);
  assert.equal(decoded.mapXFlip[20][20],true);
  importContext.currentLevelJson = {};
  await vm.runInContext('(async()=>{' + loadSource.slice(decodeStart,decodeEnd) + '})()',importContext);
  assert.equal(conversions,1,'Existing unmarked maps keep their original import path');
  const restoreFormat = extract('loadLocalSaveSnapshot').match(/currentMapExportInfo = snapshot\.exportFormat[\s\S]*?;/)[0];
  const restoredFormat = vm.runInNewContext(restoreFormat + 'currentMapExportInfo;',
    {snapshot:generated,currentMapExportInfo:null});
  assert.equal(restoredFormat.gamma,false); assert.equal(restoredFormat.version,40);
  assert.match(extract('makeLocalSaveSnapshot'),/exportFormat:.*'classic40'/);
  assert.equal(exportContext.isBuilderDroid({construct:'Spade1Mk1'}),true,'Custom generated trucks validate as builders');
  assert.equal(exportContext.isBuilderDroid({weapons:['MG1Mk1']}),false);
  console.log('PASS: public generator menu, controls, explicit Update/cancel, editor bridge, saved metadata and terrain round-trip; no browser used.');
})().catch(error => {console.error(error);process.exitCode = 1;});
