const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const metadata = await import('./js/archiveImport.js');
  const decoder = await import('./js/maploader.js');
  const converter = await import('./js/convert.js');
  const scripts = await import('./js/scriptMapImport.js');
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'), {
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,
    setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  const JSZip = mod.exports;
  function executeScript(source) {
    const encoded = vm.runInNewContext(
      'let output; const self={postMessage:value=>{output=value;}};' +
      scripts.getScriptMapWorkerSource() +
      'self.onmessage({data:' + JSON.stringify({source,seed:0}) + '}); JSON.stringify(output);',
      {}, {timeout:5000}
    );
    const result = JSON.parse(encoded);
    if (result.error) throw new Error(result.error);
    return result.data;
  }
  const source = fs.readFileSync(path.join(__dirname,'js/game.js'),'utf8');
  function extract(name, endMarker) {
    const start = source.search(new RegExp('(?:async )?function '+name+'\\('));
    assert(start >= 0, name);
    const rest = source.slice(start);
    const end = endMarker ? rest.indexOf(endMarker) : rest.search(/\n(?:async )?function /);
    assert(end > 0, 'End of '+name);
    return rest.slice(0,end);
  }
  function element(hidden = false) {
    const classes = new Set(hidden ? ['hidden'] : []);
    return {
      style:{},textContent:'',innerHTML:'',
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n)}
    };
  }
  function harness(bytes, filename) {
    const timers = [], events = {loaded:0,license:0,draws:0,structures:0,features:0,overlay:''};
    const ctx = vm.createContext({
      JSZip,File,Uint8Array,DataView,console:{log(){},error(){}},window:{},
      document:{body:element(),getElementById:()=>null},
      loadingOverlay:element(true),loadingDetail:element(),loadingBarInner:element(),loadingPercent:element(),
      overlayMsg:element(),fileListDiv:element(),infoDiv:element(),mapFilenameSpan:null,
      currentLevelJson:null,mapW:1,mapH:1,threeContainer:{},mapXFlip:[],mapYFlip:[],mapTriFlip:[],
      tileImages:[],tileTypesById:[],tilesetIndex:0,selectedTileId:0,
      setTimeout:(fn,delay)=>{timers.push({fn,delay});},
      setFileStatus(){},setCurrentMapName(){},resetLoadedMetadata(){},
      updateMapInfoInputs(){},applyUserMapInfoToMapInfo(){},
      ...decoder,...converter,
      materializeScriptMap:zip=>scripts.materializeScriptMap(zip,executeScript),
      getTilesetIndexFromName:()=>0,setTileset:async()=>{},
      loadStructuresFromZip:async zip=>{events.structures=(await metadata.readMapArchiveEntities(zip,'struct')).entries.length;},
      loadFeaturesFromMetadata:async()=>{events.features=ctx.currentFeatureEntries.length;},
      loadDroidsFromZip:async()=>{},
      updateHeightUI(){},resetCameraTarget(){},setLoadedMapInfo(){},markMapClean(){},
      getLoadedMapDisplayName:name=>name,getCurrentMapFilename:()=>filename,
      getDefaultTileTypesForTileset:()=>[],renderTexturePalette(){},
      drawMap3D:()=>{events.draws++;},
      showOverlay:message=>{events.overlay=message;},hideOverlay:()=>{events.overlay='';},
      buildSaveResultDetails:()=>({}),showSaveResult:()=>{events.loaded++;},
      showServerMapLicenseDialog:()=>{events.license++;},
      consumeUnsavedPromptSkip:()=>true,confirmUnsavedChanges:()=>true,
      getServerMapLicenseInfo:async()=>null,getServerMapDisplayName:()=>filename,
      fetchBlobWithProgress:async()=>new Blob([bytes])
    });
    ctx.loadArchiveMetadata = async zip => {
      ctx.currentLevelJson = (await metadata.readMapArchiveMetadata(zip)).data;
      ctx.currentFeatureEntries = (await metadata.readMapArchiveEntities(zip,'feature')).entries;
      ctx.currentMapScript = await scripts.readMapScriptSource(zip);
    };
    for(const name of ['setLoadingProgress','hideLoadingProgress','getMapExportInfo','parseTileTypes',
      'showLoadedMapInfo','scheduleServerMapLicenseNotice'])
      vm.runInContext(extract(name),ctx);
    vm.runInContext(extract('loadMapFile',"\ndocument.getElementById('wzLoader').addEventListener"),ctx);
    vm.runInContext(extract('loadServerMap','\nwindow.loadServerMap'),ctx);
    return {ctx,events,timers,flush:()=>timers.splice(0).sort((a,b)=>a.delay-b.delay).forEach(t=>t.fn())};
  }
  function assertFailed(run) {
    run.flush();
    assert(run.ctx.loadingOverlay.classList.contains('hidden'),'Failure hides loading popup');
    assert(!run.ctx.document.body.classList.contains('loading-map'),'Failure clears loading state');
    assert.equal(run.events.loaded,0,'No map-loaded popup after failure');
    assert.equal(run.events.license,0,'No license popup after failure');
    assert.equal(run.events.draws,0,'Failed map was not drawn');
  }
  const gladiator = '10c-Gladiator-test6-48dfeff712235e2959b2f876bc485b8efd45abb477a039cd6908d295173a163c.wz';
  const gladiatorBytes = fs.readFileSync(path.join(__dirname,'maps',gladiator));
  let run = harness(gladiatorBytes,gladiator);
  await run.ctx.loadServerMap(gladiator);
  assert.equal(run.events.draws,1,'Script-generated map draws through normal loader');
  assert.equal(run.ctx.mapW,250);assert.equal(run.ctx.mapH,250);
  assert.equal(run.events.structures,90);assert.equal(run.events.features,560);
  assert.equal(run.ctx.currentLevelJson.author,'arc');assert.equal(run.ctx.currentLevelJson.license,'CC0');
  assert(run.ctx.currentMapScript.source.includes('setMapData('),'Script remains available to the editor');
  run.flush();
  assert.equal(run.events.loaded,1);assert.equal(run.events.license,1);
  assert(run.ctx.loadingOverlay.classList.contains('hidden'));

  const unsupported = new JSZip();
  unsupported.file('readme.txt','No grid or generator');
  const unsupportedBytes = await unsupported.generateAsync({type:'nodebuffer'});
  run = harness(unsupportedBytes,'unsupported.wz');
  assert.equal(await run.ctx.loadMapFile(new File([unsupportedBytes],'unsupported.wz')),false);
  assertFailed(run);
  assert.match(run.events.overlay,/Failed to load map/);
  run = harness(unsupportedBytes,'unsupported.wz');
  await run.ctx.loadServerMap('unsupported.wz');
  assertFailed(run);

  const badScript = new JSZip();
  badScript.file('game.js','throw Error("script failure");');
  run = harness(await badScript.generateAsync({type:'nodebuffer'}),'bad-script.wz');
  await run.ctx.loadServerMap('bad-script.wz');
  assertFailed(run);

  run = harness(Buffer.from('not a zip'),'broken.wz');
  await run.ctx.loadServerMap('broken.wz');
  assertFailed(run);

  const malformed = new JSZip();
  malformed.file('multiplay/maps/broken/game.map','not a map grid');
  const malformedBytes = await malformed.generateAsync({type:'nodebuffer'});
  run = harness(malformedBytes,'broken-grid.wz');
  await run.ctx.loadServerMap('broken-grid.wz');
  assertFailed(run);

  run = harness(Buffer.alloc(0),'download-failed.wz');
  run.ctx.fetchBlobWithProgress = async()=>{throw Error('Download failed');};
  await run.ctx.loadServerMap('download-failed.wz');
  assertFailed(run);

  const working = '6c-WaterEarth-4a7c6108c6e03b4d7b0a330d26b8dcd266e43501e495770fe6d0775aa116975e.wz';
  const workingBytes = fs.readFileSync(path.join(__dirname,'maps',working));
  run = harness(workingBytes,working);
  await run.ctx.loadServerMap(working);
  assert.equal(run.events.draws,1,'Working archive still draws');
  assert.deepEqual(run.timers.map(t=>t.delay),[600,650,700],'Successful popup timings unchanged');
  run.flush();
  assert.equal(run.events.loaded,1,'Working map still shows its summary');
  assert.equal(run.events.license,1,'Working server map still shows its license');
  assert(run.ctx.loadingOverlay.classList.contains('hidden'));

  const workingZip = await JSZip.loadAsync(workingBytes);
  const gridName = Object.keys(workingZip.files).find(n=>n.endsWith('game.map'));
  const grid = await workingZip.file(gridName).async('nodebuffer');
  run = harness(grid,'game.map');
  assert.equal(await run.ctx.loadMapFile(new File([grid],'game.map')),true,'Raw-map success reported');
  run.flush();
  assert.equal(run.events.loaded,1);
  assert.equal(run.events.license,0);
  console.log('PASS: Gladiator-test6 loads terrain, structures and scenery; failed scripts/ZIPs/grids/downloads show no popups; fixed/raw-map loads and successful popup timings are unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
