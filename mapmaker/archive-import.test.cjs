const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
(async () => {
  const h = await import('./js/archiveImport.js');
  const scripts = await import('./js/scriptMapImport.js');
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'js/jszip.min.js'), 'utf8'),
    {module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});
  const JSZip = mod.exports;
  const filename = '8c-DA-julia-40oil8p-4b0e1970d387ba2ac1b99f5cd1f5abb0ce3c2c1b8c956fe45659496f1f4db98a.wz';
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname,'maps',filename)));
  const originals = Object.keys(zip.files);
  const metadata = (await h.readMapArchiveMetadata(zip)).data;
  assert.equal(metadata.author,'Next'); assert.equal(metadata.license,'CC0');
  assert.equal(metadata.generator,'FlaME 1.29 Windows');
  assert.equal(metadata.created,'2018-05-17 22:50:56');
  assert.equal(metadata.players,8); assert.equal(metadata.tileset,'rockies');
  const droids=await h.readMapArchiveEntities(zip,'droid'), features=await h.readMapArchiveEntities(zip,'feature'), structures=await h.readMapArchiveEntities(zip,'struct');
  assert.equal(droids.entries.length,32); assert.equal(features.entries.length,1485);
  assert.equal(features.entries.filter(e=>e.name==='OilResource').length,320);
  assert.equal(structures.entries.length,775);
  assert.equal(structures.entries.filter(e=>h.mapPlayerIndex(e.player??e.startpos)===10).length,152);
  for(let p=0;p<8;p++) assert.equal(droids.entries.filter(e=>h.mapPlayerIndex(e.player??e.startpos)===p).length,4);
  assert.match(droids.name,/droid\.json$/);
  assert.deepEqual(Object.keys(zip.files),originals,'Source archive unchanged');
  assert.equal(h.metadataText([{name:'A'},{name:'B'}]),'A, B');
  assert.equal(h.metadataText({other:'not author'}),''); assert.equal(h.metadataText(0),'0');
  assert.equal(h.mapPlayerIndex('SCAVENGER'),10);

  const source=fs.readFileSync(path.join(__dirname,'js/game.js'),'utf8');
  function extract(name) {
    const start=source.search(new RegExp('(?:async )?function '+name+'\\('));
    assert(start>=0,name); const rest=source.slice(start), next=rest.search(/\n(?:async )?function /);
    return next<0?rest:rest.slice(0,next);
  }
  const defs=JSON.parse(fs.readFileSync(path.join(__dirname,'structure.json'),'utf8'));
  const groups=structures.entries.map(e=>({userData:{structureExport:{player:e.player??e.startpos,sourceEntry:e,name:e.name}}}));
  const ctx=vm.createContext({...h,...scripts,mapScriptEditor:null,currentMapScript:null,currentMapInfoOverrides:{},currentServerMapMetadata:{author:'Catalogue fallback',license:'Fallback',slots:2},
    currentServerMapSourceName:filename,currentLevelJson:metadata,currentGamJson:null,currentDroidEntries:droids.entries,currentFeatureEntries:features.entries,
    objectsGroup:{children:groups},currentMapArchive:zip,
    getStructureGroupDef:g=>({id:g.userData.structureExport.name,...defs[g.userData.structureExport.name]}),getStructureFootprint:()=>null,
    mapW:149,mapH:171,tilesetIndex:2,TILESETS:[{},{},{name:'rocky mountains'}],
    getCurrentMapFilename:()=>metadata.name,getOfficialTilesetName:()=>'rockies',getSaveObjectSummary:()=>'',getMetadataText:h.metadataText,
    console,loadedDroids:null});
  for(const n of ['getStructurePlayer','getObjectEntryPlayer','getSaveAuthor','getSaveLicense','getSaveMapName','getSaveSourceName',
    'getStructureSaveCategory','getSavePlayerStats','formatSavePlayerStats','formatOilByPlayer','formatHqPositions','getSaveBalanceSummary',
    'getDeclaredPlayerCount','getReadableFileSize','getDetectedMapScavengers','getSaveScavengers','buildSaveResultDetails','readArchiveJson','syncMapScriptEditor','loadArchiveMetadata','loadDroidsFromZip','buildDefaultLevelJson'])
    vm.runInContext(extract(n),ctx);
  const stats=ctx.getSavePlayerStats();
  assert.equal(stats.get(0).structures,78);assert.equal(stats.get(0).droids,4);
  assert.equal(stats.get(10).structures,152);assert.equal(stats.get(10).droids,0);
  const details=ctx.buildSaveResultDetails({size:84141},'','Loaded');
  assert.equal(details.author,'Next');assert.equal(details.license,'CC0');assert.equal(details.madeWith,'FlaME 1.29 Windows');
  assert.equal(details.players,8,'Real archive beats stale catalogue');
  assert.match(details.playerSummary,/Scavengers: 152 structures/);
  assert.match(details.playerSummary,/Player 0: 78 structures, 4 droids/);
  assert(!details.playerSummary.includes('Player 10:'));
  const symmetric=new Map([[0,{droids:4}],[1,{droids:4}],[10,{droids:99,defenses:152}]]);
  assert.equal(ctx.getSaveBalanceSummary(symmetric),'YES'); symmetric.get(1).droids=3;assert.equal(ctx.getSaveBalanceSummary(symmetric),'NO');
  const level=JSON.parse(ctx.buildDefaultLevelJson('test'));assert.equal(level.author,'Next');assert.equal(level.generator,'FlaME 1.29 Windows');
  await ctx.loadArchiveMetadata(zip);assert.equal(ctx.currentDroidEntries.length,32);assert.equal(ctx.currentFeatureEntries.length,1485);
  vm.runInContext('loadDroidEntries = async entries => { loadedDroids = entries; };',ctx);
  await ctx.loadDroidsFromZip(zip);assert.equal(ctx.loadedDroids.length,32);
  // Model-independent check of bounded loading for the real scenery list.
  let active=0, maxActive=0, completed=0;
  ctx.FEATURE_DEFS=[{}];ctx.setTimeout=setTimeout;
  ctx.addLoadedFeature=async () => { active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,0));active--;completed++; };
  vm.runInContext(extract('loadFeaturesFromMetadata'),ctx);
  await ctx.loadFeaturesFromMetadata();
  assert.equal(completed,1485);assert(maxActive<=24,'Bounded feature requests');
  let minimapUpdates=0, importing=true;
  ctx.scene={children:[ctx.objectsGroup]};
  ctx.document={body:{classList:{contains:()=>importing}}};
  ctx.updateMinimap=()=>{minimapUpdates++;};
  vm.runInContext(extract('refreshObjectPreviewLayer'),ctx);
  ctx.refreshObjectPreviewLayer();assert.equal(minimapUpdates,0,'No per-object terrain redraw during import');
  importing=false;ctx.refreshObjectPreviewLayer();assert.equal(minimapUpdates,1,'Normal edits still redraw minimap');

  const modern=new JSZip();
  modern.file('old.lev','// Author: Legacy\n// License: CC0\n// Made with Legacy tool\nplayers 8');
  modern.file('level.json',JSON.stringify({author:{name:'Modern author',extra:'preserve me'},'spdx-license-id':'MIT',madeWith:'Modern tool',players:4}));
  modern.file('droid.json',JSON.stringify({version:2,droids:[{startpos:1,template:'ConstructionDroid'}]}));
  modern.file('droid.ini','[old]\nstartpos=0\ntemplate=Old');
  const m=(await h.readMapArchiveMetadata(modern)).data;
  assert.equal(h.metadataText(m.author),'Modern author');assert.equal(m.author.extra,'preserve me');
  assert.equal(m.license,'MIT');assert.equal(m.generator,'Modern tool');assert.equal(m.players,4);
  assert.equal((await h.readMapArchiveEntities(modern,'droid')).entries.length,1,'No duplicate legacy droids');
  assert.equal((await h.readMapArchiveMetadata(new JSZip())).data,null,'No invented provenance');
  const broken=new JSZip();broken.file('droid.json','{');
  await assert.rejects(()=>h.readMapArchiveEntities(broken,'droid'),SyntaxError);

  // Both dialogs must resolve the same archive metadata, even without catalogue data.
  class Element {
    constructor() {
      this.children=[];
      this.textContent='';
      const classes=new Set(['hidden']);
      this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
    }
    set innerHTML(value) { this.children=[];this.textContent=''; }
    appendChild(child) { this.children.push(child); }
    allText() { return this.textContent+this.children.map(child=>child.allText()).join(''); }
  }
  ctx.document={
    createElement:()=>new Element(),
    createTextNode:text=>{const element=new Element();element.textContent=text;return element;}
  };
  ctx.serverMapLicenseBody=new Element();
  ctx.serverMapLicenseDialog=new Element();
  ctx.serverMapLicenseBackdrop=new Element();
  for(const name of ['getServerMapDisplayName','getLicenseUseText','showServerMapLicenseDialog'])
    vm.runInContext(extract(name),ctx);
  for(const [mapFilename,author,license,advice] of [
    ['10c-ntw_5v5full_rq-787682011d1dbfb6599b6c8b40e8591af54cd5680a464ab7b6c70e9a97710a3c.wz','Red_Queen','GPL 2+',/GPL-compatible/],
    ['6c-WaterEarth-4a7c6108c6e03b4d7b0a330d26b8dcd266e43501e495770fe6d0775aa116975e.wz','core','CC0',/Public sharing: OK/]
  ]) {
    const mapZip=await JSZip.loadAsync(fs.readFileSync(path.join(__dirname,'maps',mapFilename)));
    ctx.currentLevelJson=(await h.readMapArchiveMetadata(mapZip)).data;
    for(const catalogue of [null,{}]) {
      ctx.currentServerMapMetadata=catalogue;
      const summary=ctx.buildSaveResultDetails(null,'','Loaded');
      assert.equal(summary.author,author);assert.equal(summary.license,license);
      ctx.showServerMapLicenseDialog(mapFilename,catalogue);
      const popup=ctx.serverMapLicenseBody.allText();
      assert(popup.includes('Author: '+summary.author),'Popup matches summary author');
      assert(popup.includes('License: '+summary.license),'Popup matches summary license');
      assert.match(popup,advice);
      assert(!popup.includes('license was not found'),'Known archive license is not reported missing');
    }
  }

  console.log('PASS: DA-julia metadata, droids, scavengers, features, summaries, balance, JSON precedence, provenance, and matching author/license dialogs for Red_Queen/GPL 2+ and core/CC0.');
})().catch(e=>{console.error(e);process.exitCode=1;});
