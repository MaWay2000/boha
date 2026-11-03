const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const scripts = await import('./js/scriptMapImport.js');
  const {mountScriptEditor,getScriptLineNumbers} = await import('./js/scriptEditor.js');
  const decoder = await import('./js/maploader.js');
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'), {
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,
    setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  const JSZip = mod.exports;
  const game = fs.readFileSync(path.join(__dirname,'js/game.js'),'utf8');
  function extract(name) {
    const start = game.search(new RegExp('(?:async )?function '+name+'\\('));
    assert(start>=0,name);
    const rest = game.slice(start), end = rest.search(/\n(?:async )?function /);
    assert(end>0,name);
    return rest.slice(0,end);
  }
  function control() {
    const classes = new Set();
    return {listeners:{},value:'',textContent:'',innerHTML:'',disabled:false,style:{},
      scrollTop:0,scrollLeft:0,clientWidth:600,clientHeight:300,
      addEventListener(type,fn){this.listeners[type]=fn;},
      classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name),contains:name=>classes.has(name)}};
  }
  const elements = {
    '#mapScriptSource':control(),'[data-script-filename]':control(),
    '[data-script-run]':control(),'[data-script-status]':control(),
    '[data-script-line-numbers]':control(),'[data-script-highlight]':control(),'[data-script-highlight-code]':control()
  };
  const panel = {innerHTML:'',querySelector:selector=>elements[selector] ||= control(),addEventListener(){}};
  const edits = [], runs = [], toggles = [];
  let finishRun, failRun = false;
  const editor = mountScriptEditor(panel,{
    onChange:source=>edits.push(source),
    onEnable:enabled=>toggles.push(enabled),
    onRun:async value=>{
      runs.push(value);
      if(failRun) throw Error('Syntax error in script');
      return new Promise(resolve=>{finishRun=resolve;});
    }
  });
  assert(!panel.innerHTML.includes('JavaScript source'),'Redundant language label is removed');
  assert.match(panel.innerHTML,/class="script-header"><span class="script-title">Map script:<\/span><span data-script-filename/,'Filename follows the title in one header');
  assert.match(panel.innerHTML,/aria-label="Map script source"/,'Source still has an accessible name');
  editor.setScript(null);
  assert(elements['#mapScriptSource'].disabled && elements['[data-script-run]'].disabled);
  const enable = elements['[data-script-enable]'];
  assert.equal(enable.checked,false); assert.equal(enable.disabled,false);
  assert.match(panel.innerHTML,/data-script-enable>Enable Script<\/label>/);
  enable.checked=true; enable.listeners.change();
  assert.deepEqual(toggles,[true]); assert.equal(runs.length,0,'Enabling does not run a script');
  assert.equal(elements['[data-script-line-numbers]'].textContent,'1');
  assert.equal(getScriptLineNumbers('a\n\nb\n'),'1\n2\n3\n4');
  const info = {filename:'multiplay/maps/Gladiator/game.js',source:'// original',pendingChanges:false};
  editor.setScript(info);
  assert.equal(enable.checked,true,'Existing scripts default to enabled');
  assert.equal(elements['#mapScriptSource'].value,info.source);
  assert.equal(elements['[data-script-filename]'].textContent,info.filename);
  elements['#mapScriptSource'].value='// edited <script>not HTML</script>\nconst x = 1;\n';
  elements['#mapScriptSource'].listeners.input();
  assert.equal(edits.length,1);assert.equal(runs.length,0,'Typing never runs code');
  assert(!panel.innerHTML.includes('not HTML'),'Source is assigned as textarea text, never HTML');
  assert.equal(elements['[data-script-line-numbers]'].textContent,'1\n2\n3','Numbering follows edits and final blank line');
  assert.match(elements['[data-script-highlight-code]'].innerHTML,/class="token keyword">const/);
  assert.match(elements['[data-script-highlight-code]'].innerHTML,/class="token number">1/);
  assert(!elements['[data-script-highlight-code]'].innerHTML.includes('<script>'),'Source markup is escaped');
  elements['#mapScriptSource'].scrollTop=47;
  elements['#mapScriptSource'].scrollLeft=83;
  elements['#mapScriptSource'].listeners.scroll();
  assert.equal(elements['[data-script-highlight]'].scrollTop,47);
  assert.equal(elements['[data-script-highlight]'].scrollLeft,83);
  assert.equal(elements['[data-script-line-numbers]'].scrollTop,47);
  assert.equal(elements['[data-script-line-numbers]'].scrollLeft,0,'Gutter never scrolls sideways');
  assert.equal(elements['[data-script-highlight]'].style.width,'600px');
  assert.equal(elements['[data-script-highlight]'].style.height,'300px');
  const pending = elements['[data-script-run]'].listeners.click();
  assert(elements['#mapScriptSource'].disabled && elements['[data-script-run]'].disabled);
  assert.equal(enable.disabled,true,'The toggle is disabled while running');
  enable.listeners.change(); assert.equal(toggles.length,1,'Cannot toggle during a run');
  await elements['[data-script-run]'].listeners.click();
  assert.equal(runs.length,1,'Only one run at a time');
  assert.equal(runs[0].source,elements['#mapScriptSource'].value);
  finishRun('Map updated.');await pending;
  assert.equal(elements['[data-script-status]'].textContent,'Map updated.');
  assert(!elements['#mapScriptSource'].disabled);
  failRun=true;await elements['[data-script-run]'].listeners.click();
  assert.equal(elements['[data-script-status]'].textContent,'Syntax error in script');
  assert(elements['[data-script-status]'].classList.contains('script-error'));
  assert(elements['#mapScriptSource'].value.includes('edited'),'Failed script leaves edits visible');
  const keptSource = elements['#mapScriptSource'].value;
  editor.setScript({...info,source:keptSource,enabled:false});
  assert.equal(enable.checked,false); assert.equal(enable.disabled,false);
  assert(elements['#mapScriptSource'].disabled && elements['[data-script-run]'].disabled);
  assert(elements['[data-script-find-open]'].disabled);
  assert.equal(elements['#mapScriptSource'].value,keptSource,'Disabling keeps the source');
  const runCount=runs.length; await elements['[data-script-run]'].listeners.click();
  elements['#mapScriptSource'].listeners.input();
  assert.equal(runs.length,runCount,'A disabled script cannot run');
  editor.setScript({...info,source:keptSource,enabled:true});
  assert(!elements['#mapScriptSource'].disabled); assert.equal(enable.checked,true);

  let enabledDirty = 0, enabledView;
  const enabling = vm.createContext({currentMapScript:null,currentMapArchivePath:'multiplay/maps/Black/game.map',
    mapW:103,mapH:150,mapScriptEditor:{setScript:value=>{enabledView=value;}},markMapDirty:()=>{enabledDirty++;}});
  for(const name of ['syncMapScriptEditor','setMapScriptEnabled','updateMapScriptDraft']) vm.runInContext(extract(name),enabling);
  enabling.setMapScriptEnabled(false); assert.equal(enabledDirty,0);
  enabling.setMapScriptEnabled(true);
  assert.equal(enabling.currentMapScript.filename,'multiplay/maps/Black/game.js','New script uses the current archive folder');
  assert.equal(enabledView.enabled,true); assert.equal(enabling.currentMapScript.pendingChanges,true);
  const starter = enabling.currentMapScript.source;
  const starterResult = JSON.parse(vm.runInNewContext('let result; const self={postMessage:value=>{result=value;}};' +
    scripts.getScriptMapWorkerSource() + 'self.onmessage({data:' + JSON.stringify({source:starter}) + '}); JSON.stringify(result);',{}, {timeout:5000}));
  const starterData = scripts.validateScriptMapData(starterResult.data);
  assert.equal(starterData.width,103); assert.equal(starterData.height,150); assert.equal(starterData.structures.length,0);
  enabling.updateMapScriptDraft(starter+'// my changes\n');
  const authored = enabling.currentMapScript.source;
  enabling.setMapScriptEnabled(false); assert.equal(enabledView.enabled,false);
  assert.equal(enabling.currentMapScript.source,authored);
  enabling.setMapScriptEnabled(true); assert.equal(enabling.currentMapScript.source,authored,'Re-enabling restores edits rather than replacing them');
  assert.equal(enabledDirty,4);
  const disabledArchive = new JSZip();
  scripts.writeMapScriptSource(disabledArchive,{...enabling.currentMapScript,enabled:false});
  disabledArchive.file('multiplay/maps/Black/game.js','// older original script');
  const disabledSaved = await scripts.readMapScriptSource(await JSZip.loadAsync(await disabledArchive.generateAsync({type:'nodebuffer'})));
  assert.equal(disabledSaved.enabled,false); assert.equal(disabledSaved.source,authored,'Disabled authored drafts survive WZ save/reopen');
  disabledArchive.file('mapmaker-script.json','bad JSON');
  assert.equal((await scripts.readMapScriptSource(disabledArchive)).source,'// older original script','Malformed optional drafts still fall back to the original script');

  const data = {width:2,height:2,textures:[6,12,22,23],heights:[0,100,255,510],
    structures:[{name:'A0CommandCentre',position:[64,64],direction:0,modules:0,player:0}],
    droids:[],features:[]};
  let mode = 'success', shownScript = null, rendered = 0, dirty = false, rolledBack = false, failRestore = false;
  const originalArchive = new JSZip();
  originalArchive.file('original.txt','preserve me');
  originalArchive.file('old.map','previous terrain');
  const ctx = vm.createContext({
    ...scripts,...decoder,File,JSZip,Uint8Array,DataView,
    currentMapArchive:originalArchive,currentMapArchivePath:'old.map',currentMapExportInfo:{version:10},
    currentStructArchivePath:'old-struct.json',currentStructJsonStyle:'array',
    currentDroidArchivePath:'old-droid.json',currentFeatureArchivePath:'old-feature.json',
    currentTileTypesArchivePath:'ttypes.ttp',currentGamArchivePath:null,currentLevelArchivePath:null,
    currentMapScript:{...info,source:'// changed',pendingChanges:true},
    currentLevelJson:{author:'arc',license:'CC0'},currentFeatureEntries:[],
    currentLocalSaveId:'original-save',mapDirty:false,mapHistoryBusy:false,savedMapVersion:'1.0',currentGamJson:{version:7},
    currentMapInfoOverrides:{name:'Original map',scavengers:'1'},undoBtn:{},redoBtn:{},
    undoStack:[{old:true}],redoStack:[],localAutosaveTimer:null,
    mapScriptEditor:{setScript:value=>{shownScript=value;}},
    runMapScript:async()=>{
      if(mode==='syntax') throw Error('Script syntax error');
      if(mode==='switch') ctx.currentMapScript={filename:'other/game.js',source:'// other'};
      return data;
    },
    makeLocalSaveSnapshot:()=>({mapW:ctx.mapW,mapH:ctx.mapH,mapTiles:ctx.mapTiles,mapHeights:ctx.mapHeights,
      mapScript:ctx.currentMapScript,mapInfo:{...ctx.currentMapInfoOverrides},levelMetadata:ctx.currentLevelJson,
      structures:ctx.structures,droids:ctx.droids,features:ctx.currentFeatureEntries}),
    setLoadingProgress(){},hideLoadingProgress(){},clearMapObjects(){},
    setMapState:(w,h,tiles,rotations,heights)=>{Object.assign(ctx,{mapW:w,mapH:h,mapTiles:tiles,mapHeights:heights});},
    updateHeightUI(){},
    loadStructureEntries:async entries=>{if(mode==='asset') throw Error('Asset failure');ctx.structures=entries;},
    loadFeaturesFromMetadata:async()=>{},loadDroidEntries:async entries=>{ctx.droids=entries;},
    drawMap3D:()=>{rendered++;},
    markMapDirty:()=>{dirty=true;ctx.mapDirty=true;},setMapDirty:value=>{dirty=value;ctx.mapDirty=value;},scheduleLocalAutosave(){},
    updateMapInfoInputs(){},setFileStatus(){},
    loadLocalSaveSnapshot:async snapshot=>{
      if(failRestore) { failRestore=false;ctx.mapTiles=[[-1]];throw Error('Restore asset failure'); }
      rolledBack=true;ctx.mapW=snapshot.mapW;ctx.mapH=snapshot.mapH;ctx.mapTiles=snapshot.mapTiles;
      ctx.mapHeights=snapshot.mapHeights;ctx.structures=snapshot.structures;ctx.droids=snapshot.droids;
      ctx.currentFeatureEntries=snapshot.features;ctx.currentLevelJson=snapshot.levelMetadata;
      ctx.currentMapScript=snapshot.mapScript;ctx.currentMapArchive=null;ctx.currentStructArchivePath=null;
      ctx.undoStack.length=0;ctx.redoStack.length=0;
      ctx.mapScriptEditor.setScript(ctx.currentMapScript);
    },
    mapW:1,mapH:1,mapTiles:[[99]],mapHeights:[[12]],
    structures:[{name:'Original building',position:[1,1],player:2}],droids:[{name:'Original truck',player:2}]
  });
  for(const name of ['syncMapScriptEditor','getMapExportInfo','getDefaultMapInfoOverrides',
    'captureScriptMapState','restoreScriptMapState','restoreScriptHistory','updateUndoRedoButtons',
    'undo','redo','runEditedMapScript','applyEditedMapScript','applyGeneratedMapSnapshot'])
    vm.runInContext(extract(name),ctx);
  const initialGrid=ctx.mapTiles;
  await assert.rejects(()=>ctx.runEditedMapScript({...ctx.currentMapScript,enabled:false}),/Enable Script/);
  assert.equal(ctx.mapTiles,initialGrid); assert.equal(rendered,0);
  mode='syntax';
  await assert.rejects(()=>ctx.runEditedMapScript(ctx.currentMapScript),/syntax/);
  assert.equal(ctx.mapTiles,initialGrid);assert.equal(rendered,0);assert.equal(dirty,false);
  mode='success';
  const message = await ctx.runEditedMapScript(ctx.currentMapScript);
  assert.match(message,/2 × 2/);assert.equal(ctx.mapW,2);assert.equal(ctx.mapH,2);
  assert.equal(ctx.structures.length,1);assert.equal(ctx.currentMapScript.pendingChanges,false);
  assert.equal(shownScript.source,'// changed');assert.equal(ctx.currentLevelJson.author,'arc');
  assert.equal(ctx.currentLevelJson.license,'CC0');
  assert.equal(ctx.undoStack.length,1);assert.equal(ctx.undoStack[0].type,'script-map');assert(dirty);
  assert.equal(ctx.undoBtn.disabled,false);assert.equal(ctx.redoBtn.disabled,true);
  assert.notEqual(ctx.undoStack[0].state.snapshot.mapTiles,initialGrid,'Checkpoint owns its map data');
  assert.notEqual(ctx.currentMapArchive,originalArchive);
  assert(!originalArchive.file('mapmaker-script.json'),'Run does not mutate previous archive');
  assert(await ctx.currentMapArchive.file('original.txt').async('string'));
  assert.equal(ctx.currentMapArchive.file('old.map'),null,'Run replaces the loaded grid even when its original filename differs');
  assert.equal(await originalArchive.file('old.map').async('string'),'previous terrain','The original archive remains untouched');
  assert.equal((await scripts.readMapScriptSource(ctx.currentMapArchive)).source,'// changed');
  const firstGeneratedArchive=ctx.currentMapArchive;
  const undoing=ctx.undo();
  assert.equal(ctx.mapHistoryBusy,true);assert(ctx.undoBtn.disabled&&ctx.redoBtn.disabled);
  await ctx.redo(); await undoing;
  assert.equal(ctx.mapHistoryBusy,false);assert.equal(ctx.mapW,1);assert.equal(ctx.mapH,1);
  assert.equal(ctx.mapTiles[0][0],99);assert.equal(ctx.mapHeights[0][0],12);
  assert.equal(ctx.structures[0].name,'Original building');assert.equal(ctx.droids[0].name,'Original truck');
  assert.equal(ctx.currentMapArchive,originalArchive);assert.equal(ctx.currentMapArchivePath,'old.map');
  assert.equal(ctx.currentStructArchivePath,'old-struct.json');assert.equal(ctx.currentMapInfoOverrides.scavengers,'1');
  assert.equal(ctx.currentMapScript.pendingChanges,true);assert.equal(ctx.savedMapVersion,'1.0');
  assert.equal(ctx.undoStack.length,0);assert.equal(ctx.redoStack.length,1);
  assert.equal(ctx.undoBtn.disabled,true);assert.equal(ctx.redoBtn.disabled,false);
  await ctx.redo();
  assert.equal(ctx.mapTiles[0][0],6);assert.equal(ctx.mapW,2);assert.equal(ctx.structures.length,1);
  assert.equal(ctx.currentMapArchive,firstGeneratedArchive);assert.equal(ctx.currentMapScript.pendingChanges,false);
  data.textures[0]=53;
  ctx.currentMapScript={...ctx.currentMapScript,source:'// second run',pendingChanges:true};
  await ctx.runEditedMapScript(ctx.currentMapScript);
  assert.equal(ctx.mapTiles[0][0],53);assert.equal(ctx.undoStack.length,2,'Each run adds a checkpoint');
  await ctx.undo();assert.equal(ctx.mapTiles[0][0],6);
  await ctx.undo();assert.equal(ctx.mapTiles[0][0],99);
  await ctx.redo();assert.equal(ctx.mapTiles[0][0],6);
  await ctx.redo();assert.equal(ctx.mapTiles[0][0],53);
  const beforeFailedUndo=JSON.stringify(ctx.makeLocalSaveSnapshot()),beforeUndoCount=ctx.undoStack.length;
  failRestore=true;await ctx.undo();
  assert.equal(JSON.stringify(ctx.makeLocalSaveSnapshot()),beforeFailedUndo,'Failed Undo restores the current map');
  assert.equal(ctx.undoStack.length,beforeUndoCount);assert.equal(ctx.redoStack.length,0);assert.equal(ctx.mapHistoryBusy,false);
  const goodArchive=ctx.currentMapArchive,goodGrid=ctx.mapTiles,goodPath=ctx.currentStructArchivePath;
  ctx.undoStack.push({keep:true});dirty=false;ctx.mapDirty=false;mode='asset';
  const beforeFailedRun=ctx.undoStack.length;
  await assert.rejects(()=>ctx.runEditedMapScript(ctx.currentMapScript),/Asset failure/);
  assert(rolledBack);assert.equal(JSON.stringify(ctx.mapTiles),JSON.stringify(goodGrid));
  assert.equal(ctx.currentMapArchive,goodArchive);assert.equal(ctx.currentStructArchivePath,goodPath);
  assert.equal(ctx.undoStack.length,beforeFailedRun);assert.equal(dirty,false);
  mode='switch';rendered=0;
  await assert.rejects(()=>ctx.runEditedMapScript(ctx.currentMapScript),/map changed/i);
  assert.equal(rendered,0,'Changing maps while generation runs cancels stale results');

  // Generate/Update use the same full-map history as script execution.
  let autosaves=0;
  Object.assign(ctx,{makeLocalSaveId:()=> 'generated-save',saveLocalAutosaveNow:()=>{autosaves++;},setActiveTab(){}});
  const originalState=ctx.captureScriptMapState(),oldHistory=ctx.undoStack.length;
  const generated={...ctx.makeLocalSaveSnapshot(),mapW:3,mapH:1,mapTiles:[[7,8,9]],mapHeights:[[10,11,12]],structures:[{name:'Generated HQ'}],droids:[],features:[],mapScript:null};
  assert.equal(await ctx.applyGeneratedMapSnapshot(generated),'generated-save');
  assert.equal(ctx.mapW,3);assert.equal(ctx.undoStack.length,oldHistory);
  assert.equal(ctx.undoStack.at(-1).source,'generator');assert.equal(ctx.redoStack.length,0);
  assert.equal(ctx.currentMapArchive,null);assert.equal(ctx.undoBtn.disabled,false);
  await ctx.undo();
  assert.equal(JSON.stringify(ctx.makeLocalSaveSnapshot()),JSON.stringify(originalState.snapshot));
  assert.equal(ctx.currentMapArchive,originalState.archive[0]);assert.equal(ctx.currentLocalSaveId,originalState.localSaveId);
  await ctx.redo();assert.equal(ctx.mapW,3);assert.equal(ctx.structures[0].name,'Generated HQ');
  await ctx.applyGeneratedMapSnapshot({...generated,mapTiles:[[20,21,22]]});
  await ctx.undo();assert.equal(ctx.mapTiles[0][0],7);
  await ctx.undo();assert.equal(JSON.stringify(ctx.makeLocalSaveSnapshot()),JSON.stringify(originalState.snapshot));
  await ctx.redo();await ctx.redo();assert.equal(ctx.mapTiles[0][0],20);
  await ctx.undo();await ctx.applyGeneratedMapSnapshot({...generated,mapTiles:[[30,31,32]]});
  assert.equal(ctx.redoStack.length,0,'A new generation clears the abandoned redo branch');
  const beforeFailure=JSON.stringify(ctx.makeLocalSaveSnapshot()),checkpointCount=ctx.undoStack.length,saveCount=autosaves;
  failRestore=true;await assert.rejects(()=>ctx.applyGeneratedMapSnapshot(generated),/Restore asset failure/);
  assert.equal(JSON.stringify(ctx.makeLocalSaveSnapshot()),beforeFailure,'Failed generation restores the map');
  assert.equal(ctx.undoStack.length,checkpointCount);assert.equal(ctx.redoStack.length,0);assert.equal(autosaves,saveCount);assert.equal(ctx.mapHistoryBusy,false);
  ctx.mapHistoryBusy=true;await assert.rejects(()=>ctx.applyGeneratedMapSnapshot(generated),/Wait for/);ctx.mapHistoryBusy=false;
  await ctx.restoreScriptMapState(originalState);

  // Production snapshot includes a copy of the editable source for local saves.
  Object.assign(ctx,{
    getCurrentMapFilename:()=>'Gladiator',tilesetIndex:0,
    mapRotations:[],mapHeights:[],mapXFlip:[],mapYFlip:[],mapTriFlip:[],tileTypesById:[],
    currentMapInfoOverrides:{},currentServerMapMetadata:null,currentServerMapSourceName:'',
    getLocalSaveEntriesFromJson:()=>[],buildStructJson:()=>'[]',buildFeatureJson:()=>'[]',buildDroidJson:()=>'[]'
  });
  vm.runInContext(extract('makeLocalSaveSnapshot'),ctx);
  const snapshot=ctx.makeLocalSaveSnapshot();
  assert.equal(snapshot.mapScript.source,ctx.currentMapScript.source);
  assert.notEqual(snapshot.mapScript,ctx.currentMapScript);
  ctx.currentMapScript.enabled=false;
  const disabledSnapshot=ctx.makeLocalSaveSnapshot();
  assert.equal(disabledSnapshot.mapScript.enabled,false,'Local saves retain the disabled state');
  assert.equal(scripts.normalizeMapScriptSource(disabledSnapshot.mapScript).enabled,false);
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert(html.indexOf('data-tab="script"')>html.indexOf('id="redoBtn"'),'Script tab follows Undo/Redo');
  assert.match(html,/id="scriptPanel" class="panel"/);
// Script-only split layout resizes the viewport without resetting the camera.
  const body = control();
  let viewportResizes = 0, projections = 0;
  const cameraPose = {rotationX:-0.8, rotationY:0.4, zoom:1.3};
  const layout = vm.createContext({
    document:{body}, renderer:{}, cameraState:cameraPose,
    camera:{aspect:1,updateProjectionMatrix:()=>{projections++;}},
    threeContainer:{get offsetWidth(){return body.classList.contains('script-tab-open')?640:850;},offsetHeight:700},
    applyPreviewQuality:()=>{viewportResizes++;}
  });
  vm.runInContext(extract('resizeScriptViewport') + '\n' + extract('updateScriptPanelLayout'),layout);
  layout.updateScriptPanelLayout('file');
  assert.equal(viewportResizes,0,'Ordinary tabs keep their layout');
  layout.updateScriptPanelLayout('script');
  assert(body.classList.contains('script-tab-open'));
  assert.equal(viewportResizes,1);assert.equal(layout.camera.aspect,640/700);
  layout.updateScriptPanelLayout('script');
  assert.equal(viewportResizes,1,'No unnecessary renderer resize');
  layout.updateScriptPanelLayout('file');
  assert(!body.classList.contains('script-tab-open'));
  assert.equal(viewportResizes,2);assert.equal(layout.camera.aspect,850/700);
  assert.equal(projections,2);
  layout.resizeScriptViewport();
  assert.equal(viewportResizes,3,'Width drag refreshes the existing viewport');
  assert.deepEqual(cameraPose,{rotationX:-0.8,rotationY:0.4,zoom:1.3},'Camera orientation and zoom preserved');
  layout.renderer=undefined;
  layout.updateScriptPanelLayout('script');
  assert(body.classList.contains('script-tab-open'),'Layout also works before renderer initialization');
  assert.match(extract('setActiveTab'),/updateScriptPanelLayout\(tab\)/);
  const widthRule=html.match(/body\.script-tab-open\s*\{\s*--editor-panel-width:clamp\(min\(320px, 50vw\), var\(--script-editor-width, min\((\d+)vw,\s*(\d+)px\)\), max\(50vw, calc\(100vw - 300px\)\)\)/);
  assert(widthRule,'Wide editor is scoped to the Script tab');
  assert.match(html,/id="scriptWidthHandle" role="separator" aria-orientation="vertical"/);
  assert.match(html,/#scriptPanel \.script-header\s*\{[^}]*justify-content:flex-start;[^}]*text-align:left;/);
  assert.match(html,/resize:vertical;/,'Existing height resizing is retained');
  assert.match(game,/mountScriptPanelResize\(document\.getElementById\('scriptWidthHandle'\), document\.getElementById\('editPanel'\), resizeScriptViewport\)/);
  assert(!extract('resizeScriptViewport').includes('resetCameraTarget'),'Width changes never reset the camera');
  for(const viewport of [800,1280,1536,1920,2560]) {
    const width=Math.min(viewport*Number(widthRule[1])/100,Number(widthRule[2]));
    assert(viewport-width+1e-6>=viewport*0.4,'Map keeps at least 40% of the viewport');
    if(viewport>=1280) assert(width>430,'Script editor is wider than the standard sidebar');
  }
  console.log('PASS: Script editing, line numbers, highlighting/scroll alignment, explicit run, persistence, rollback and unchanged wide split/camera behavior.');
})().catch(error=>{console.error(error);process.exitCode=1;});
