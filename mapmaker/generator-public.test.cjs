const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const {generateMap} = await import('./js/mapGenerator.js');
  const {mountMapGenerator} = await import(process.env.MAPMAKER_UI_UNDER_TEST||'./js/mapGeneratorUI.js');
  const {loadMapUnified} = await import('./js/maploader.js');
  const {metadataText} = await import('./js/archiveImport.js');
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
      this.classList = {contains:name => names.has(name), add:name => names.add(name), remove:name => names.delete(name),
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
    const initialHost=new Element('div');
    let initialCurrent=generateMap({},catalog).snapshot,initialApplies=0;const overlayStates=[];
    mountMapGenerator(initialHost,{showCliffs:value=>overlayStates.push(value),snapshot:()=>initialCurrent,catalog:async()=>catalog,apply:async snapshot=>{initialCurrent=snapshot;initialApplies++;return 'initial-generated';}});
    const walk=node=>[node,...node.children.flatMap(walk)];
    const controls=walk(initialHost).filter(node=>node.id?.startsWith('gen-'));
    assert(controls.length>60);
    for(const control of controls){
      const helpId=control.attributes['aria-describedby'];
      assert(helpId,control.id+' has linked help');
      const popup=find(initialHost,node=>node.id===helpId);
      assert(popup&&popup.textContent.length>35,control.id+' has a full explanation');
      assert.equal(popup.attributes.role,'tooltip');assert.equal(popup.hidden,true);
    }
    const helpLabel=find(initialHost,node=>node.attributes['aria-describedby']==='generator-help-width'&&node.tagName==='span');
    const popup=find(initialHost,node=>node.id==='generator-help-width');
    helpLabel.getBoundingClientRect=()=>({left:20,right:430,top:80,bottom:100});popup.style={};popup.offsetHeight=80;
    const savedWindow=globalThis.window;globalThis.window={innerWidth:900,innerHeight:700};
    try{
      await helpLabel.emit('mouseenter');assert.equal(popup.hidden,false);assert.equal(popup.style.left,'20px');assert.equal(popup.style.top,'110px','label tooltip keeps its original position');
      await controls[0].emit('mouseenter');assert.equal(popup.style.left,'442px');assert.equal(popup.style.top,'80px','control hover places tooltip on the right without clicking');
      helpLabel.getBoundingClientRect=()=>({left:500,right:650,top:80,bottom:100});await controls[0].emit('mouseenter');assert.equal(popup.style.left,'158px','use left side if the right side has no room');
      helpLabel.getBoundingClientRect=()=>({left:20,right:430,top:80,bottom:100});
      await helpLabel.emit('mouseleave');assert.equal(popup.hidden,true);
      await controls[0].emit('focus');assert.equal(popup.hidden,false);
      await controls[0].emit('blur');assert.equal(popup.hidden,true);
      await helpLabel.emit('focus');
      for(const handler of helpLabel.listeners.keydown)handler({key:'Escape'});
      assert.equal(popup.hidden,true);
    }finally{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
    for(const summary of walk(initialHost).filter(node=>node.tagName==='summary'))assert(summary.attributes['aria-describedby'],'section heading has help');
    const initialEdge=find(initialHost,node=>node.id==='gen-edge');
    assert.equal(Number(initialEdge.max),17,'edge cap follows current dimensions and layout');
    const edgeLabel=find(initialHost,node=>node.tagName==='span'&&node.attributes['aria-describedby']==='generator-help-edge');
    const edgeHelp=find(initialHost,node=>node.id==='generator-help-edge');
    edgeLabel.getBoundingClientRect=()=>({left:20,bottom:100});edgeHelp.style={};edgeHelp.offsetHeight=80;
    const limitWindow=globalThis.window;globalThis.window={innerWidth:900,innerHeight:700};
    try{
      initialEdge.value='17';let blocked=false;
      for(const handler of initialEdge.listeners.keydown)handler({key:'ArrowRight',preventDefault(){blocked=true;}});
      assert(blocked);assert.equal(initialEdge.value,'17');assert.equal(edgeHelp.hidden,false);assert.match(edgeHelp.textContent,/width.*too small/);
      initialEdge.value='99';await initialEdge.emit('input');await find(initialHost,node=>node.tagName==='form').emit('input');assert.equal(initialEdge.value,'17','cannot exceed the current cap');
      find(initialHost,node=>node.id==='gen-width').value='96';await find(initialHost,node=>node.tagName==='form').emit('input');assert.equal(Number(initialEdge.max),32,'larger map increases the cap');
      find(initialHost,node=>node.id==='gen-width').value='65';initialEdge.value='16';await find(initialHost,node=>node.tagName==='form').emit('input');
    }finally{if(limitWindow===undefined)delete globalThis.window;else globalThis.window=limitWindow;}
    const boundsWindow=globalThis.window;globalThis.window={innerWidth:900,innerHeight:700};
    try{
      for(const control of controls.filter(control=>control.type==='range')){
        const label=find(initialHost,node=>node.tagName==='span'&&node.attributes['aria-describedby']===control.attributes['aria-describedby']);
        const hint=find(initialHost,node=>node.id===control.attributes['aria-describedby']);
        label.getBoundingClientRect=()=>({left:20,bottom:100});hint.style={};hint.offsetHeight=80;
        const oldValue=control.value;
        for(const [bound,key] of [['max','ArrowRight'],['min','ArrowLeft']]){
          control.value=control[bound];let prevented=false;
          for(const handler of control.listeners.keydown)handler({key,preventDefault(){prevented=true;}});
          assert(prevented,control.id+' enforces '+bound);assert.equal(hint.hidden,false);assert(hint.textContent.length>20);
          assert.equal(control.value,control[bound]);
        }
        control.value=oldValue;await control.emit('blur');
      }
      const camps=find(initialHost,node=>node.id==='gen-scavCamps');assert.equal(camps.disabled,true);
      const campLabel=find(initialHost,node=>node.tagName==='span'&&node.attributes['aria-describedby']===camps.attributes['aria-describedby']);
      await campLabel.emit('mouseenter');
      assert.match(find(initialHost,node=>node.id===camps.attributes['aria-describedby']).textContent,/Enable Scavenger camps first/);
      await campLabel.emit('mouseleave');
    }finally{if(boundsWindow===undefined)delete globalThis.window;else globalThis.window=boundsWindow;}
    const cliffCheckbox=find(initialHost,node=>node.id==='gen-showCliffs');
    assert.equal(cliffCheckbox.tagName,'button');assert.equal(cliffCheckbox.type,'button');assert.equal(cliffCheckbox.attributes['aria-pressed'],'false','cliff overlay starts off');
    await cliffCheckbox.emit('click');assert.equal(cliffCheckbox.attributes['aria-pressed'],'true');assert.deepEqual(overlayStates,[true]);
    assert.equal(initialApplies,0,'preview does not generate a map');
    const hoverWindow=globalThis.window;globalThis.window={innerWidth:900,innerHeight:700};
    try{
      for(const key of ['waterStyle','cliffs','showCliffs']){
        const control=find(initialHost,node=>node.id==='gen-'+key),label=find(initialHost,node=>node.tagName==='span'&&node.attributes['aria-describedby']===control.attributes['aria-describedby']),hint=find(initialHost,node=>node.id===control.attributes['aria-describedby']);
        label.getBoundingClientRect=()=>({left:20,right:430,top:80,bottom:100});hint.style={};hint.offsetHeight=80;
        const beforeState=control.attributes['aria-checked']||control.attributes['aria-pressed']||control.value;
        await control.emit('mouseenter');assert.equal(hint.hidden,false);assert.equal(hint.style.left,'442px');
        assert.equal(control.attributes['aria-checked']||control.attributes['aria-pressed']||control.value,beforeState,'hover never activates the control');
        await control.emit('mouseleave');assert.equal(hint.hidden,true);
      }
    }finally{if(hoverWindow===undefined)delete globalThis.window;else globalThis.window=hoverWindow;}
    const initialActions=find(initialHost,node=>node.className==='generator-update-actions');
    const initialButton=find(initialHost,node=>node.id==='generateUpdateMap');
    assert.equal(initialActions.hidden,false,'Generate is available immediately');
    assert.equal(initialButton.textContent,'Generate map');
    assert.equal(initialButton.disabled,false);
    assert.equal(initialApplies,0,'Opening still does not generate automatically');
    await initialButton.emit('click');
    assert.equal(initialApplies,1,'Unchanged default settings can generate');
    assert.equal('showCliffs' in initialCurrent,false,'overlay is never saved as map data');
    await cliffCheckbox.emit('click');assert.equal(cliffCheckbox.attributes['aria-pressed'],'false');
    for(const eventName of ['input','change'])for(const listener of find(initialHost,node=>node.tagName==='form').listeners[eventName])listener({target:cliffCheckbox});
    assert.deepEqual(overlayStates,[true,false]);assert.equal(initialApplies,1,'preview toggle does not regenerate');
    assert.equal(initialActions.hidden,true,'preview toggle does not create pending generator changes');
    assert.equal(initialActions.hidden,true,'Successful generation keeps existing no-pending-change behavior');
    const initialWidth=find(initialHost,node=>node.id==='gen-width');initialWidth.value='160';
    await find(initialHost,node=>node.tagName==='form').emit('input');
    assert.equal(initialActions.hidden,false);assert.equal(initialButton.textContent,'Update map');
    initialWidth.value='109';find(initialHost,node=>node.id==='gen-height').value='97';find(initialHost,node=>node.id==='gen-players').value='10';
    await find(initialHost,node=>node.tagName==='form').emit('input');await initialButton.emit('click');
    assert.equal(initialApplies,2,'bounded settings can generate without a spacing error');
    assert(Number(find(initialHost,node=>node.id==='gen-players').value)<10,'player count fits current dimensions');
    find(initialHost,node=>node.id==='gen-defenses').value='1';find(initialHost,node=>node.id==='gen-defenseType').value='InvalidBuilding';
    await find(initialHost,node=>node.tagName==='form').emit('input');await initialButton.emit('click');
    assert.equal(initialApplies,2,'invalid catalog IDs do not replace the map');
    for(const key of ['defenseType'])assert.equal(find(initialHost,node=>node.id==='gen-'+key).attributes['aria-invalid'],'true');
    assert(find(initialHost,node=>node.classList.contains('generator-field-error')),'related labels have error styling');
    initialWidth.value='255';await find(initialHost,node=>node.tagName==='form').emit('input');
    assert.equal(initialWidth.attributes['aria-invalid'],'false','editing clears stale validation');
    assert.equal(find(initialHost,node=>node.classList.contains('generator-field-error')),undefined);
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
    assert.equal(actions.hidden,false);
    assert.equal(update.textContent,'Generate map');
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
    const factories=find(host,node=>node.id==='gen-factoryCount');
    assert.equal(find(host,node=>node.id==='gen-base'),undefined,'Starting base preset selector is removed');
    assert.equal(Number(factories.max),5);
    assert.equal(Number(find(host,node=>node.id==='gen-researchCount').max),20);
    assert.equal(Number(find(host,node=>node.id==='gen-rearmCount').max),99);
    factories.value='3'; await factories.emit('input'); await form.emit('input');

    assert.equal(applied.length,0,'building count changes wait for Update map');
    await actions.children[1].emit('click');
    assert.equal(Number(factories.value),5,'Cancel restores the new factory default');
    const expectedCounts={trucks:4,hqCount:1,factoryCount:5,cyborgFactoryCount:5,vtolFactoryCount:0,researchCount:5,powerCount:10,repairCount:0,rearmCount:0,relayCount:0,uplinkCount:0,lassatCount:0,modules:0,defenses:0};
    for(const [key,value] of Object.entries(expectedCounts))assert.equal(Number(find(host,node=>node.id==='gen-'+key).value),value,key+' screenshot default');
    assert.equal(find(host,node=>node.id==='gen-orientation').value,'north');
    assert.equal(find(host,node=>node.id==='gen-defenseType').value,'GuardTower1');
    width.value = '160'; await form.emit('input');
    assert.equal(applied.length,0,'Changing controls waits for Update map');
    assert.equal(actions.hidden,false);
    await actions.children[1].emit('click');
    assert.equal(Number(width.value),65); assert.equal(applied.length,0,'Cancel leaves the map untouched');
    width.value = '160'; await form.emit('input'); await update.emit('click');
    assert.equal(applied.length,1); assert.equal(current.mapW,160);
    assert.equal(current.name,'Keep this name'); assert.equal(current.mapInfo.author,'Keep this author');
    assert.equal(current.mapInfo.license,'MIT'); assert.equal(actions.hidden,true);
    width.value = '192'; await form.emit('input'); await update.emit('click');
    assert.equal(applied.length,2); assert.equal(current.id,'generated-save','Updates reuse the generated local save');
    const cliffsSwitch=find(host,node=>node.id==='gen-cliffs');
    assert.equal(cliffsSwitch.tagName,'button');assert.equal(cliffsSwitch.type,'button');assert.equal(cliffsSwitch.attributes.role,'switch');
    assert.equal(cliffsSwitch.textContent,'OFF');assert.equal(cliffsSwitch.attributes['aria-checked'],'false');
    await cliffsSwitch.emit('click');
    assert.equal(cliffsSwitch.textContent,'ON');assert.equal(cliffsSwitch.attributes['aria-checked'],'true');
    assert.equal(actions.hidden,false);assert.equal(applied.length,2,'switch waits for Update map');
    await actions.children[1].emit('click');
    assert.equal(cliffsSwitch.textContent,'OFF');assert.equal(cliffsSwitch.attributes['aria-checked'],'false','Cancel restores switch state');
    assert.equal(actions.hidden,true);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }

  if(process.env.MAPMAKER_UI_ONLY==='1'){console.log('PASS: actual local generator UI, label/control hover, positioning, switches and Update/cancel.');return;}

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
    applyGeneratedMapSnapshot:async snapshot=>{const copy=JSON.parse(JSON.stringify(snapshot));copy.id=snapshot.id||'new-save';restored=copy;dirty++;saved++;tab='generate';return copy.id;},
    markMapDirty:() => {dirty++;}, saveLocalAutosaveNow:() => {saved++;}, setActiveTab:value => {tab = value;}
  });
  const mountStart = source.lastIndexOf("mountMapGenerator(document.getElementById('generatePanel'),");
  assert(mountStart >= 0);
  vm.runInContext(source.slice(mountStart),bridgeContext);
  assert.equal(mounted.snapshot().id,'current-save');
  assert.equal(mounted.applyHandlesRollback,true,'Production generation handles full map/history rollback');
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
    currentMapArchive:null,currentLevelJson:null,currentServerMapMetadata:null,currentMapInfoOverrides:generated.mapInfo,
    getSaveMapName:() => generated.name,getOfficialTilesetName:() => 'arizona',getSaveScavengers:() => '0',
    getMetadataText:metadataText,readUserMapInfo:() => ({license:'CC0-1.0'})});
  for (const name of ['buildTileNumber','getReusableMapTail','buildClassicMapFileBytes',
    'getSaveLicense','getSaveMapVersion','buildDefaultLevelJson','buildDefaultGamJson','updateGammaMetadata','isBuilderDroid']) {
    vm.runInContext(extract(name),exportContext);
  }
  const zip = new mod.exports();
  await exportContext.updateGammaMetadata(zip,'Generated map');
  const level = JSON.parse(await zip.file('level.json').async('string'));
  assert.equal(level.mapmakerFormat,'classic40'); assert.equal(level.players,4);
  assert.equal(level.license,generated.mapInfo.license,'Generated archive retains its selected license');
  assert.equal(level.versionName,'1.0','Generated archive starts at version 1.0');
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
