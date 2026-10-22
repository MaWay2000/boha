const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
(async()=>{
  const THREE=await import('./js/three.module.js');
  const {parsePie}=await import('./js/pie.js');
  const h=await import('./js/archiveImport.js');
  const {STRUCTURE_TURRETS}=await import('./js/structure_turrets.js');
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'),{module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});
  const game=fs.readFileSync(path.join(__dirname,'js/game.js'),'utf8');
  function extract(name){
    const start=game.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);
    const rest=game.slice(start),end=rest.search(/\n(?:async )?function /);return end<0?rest:rest.slice(0,end);
  }
  const rawDefs=JSON.parse(fs.readFileSync(path.join(__dirname,'structure.json'),'utf8'));
  const sensors=JSON.parse(fs.readFileSync(path.join(__dirname,'sensor.json'),'utf8'));
  const defsCtx=vm.createContext({window:{},fetch:async()=>({ok:true,json:async()=>rawDefs}),STRUCTURE_DEFS:[],populateStructureSelect(){},isOilSpotDef:()=>false,OIL_SPOT_DEF:{id:'OilResource'},console});
  vm.runInContext(extract('loadStructureDefs'),defsCtx);await defsCtx.loadStructureDefs();
  vm.runInContext(extract('getStructureRenderDef'),defsCtx);
  const pieCache=new Map();
  async function loadPieGeometry(name){
    const key=name.toLowerCase();if(pieCache.has(key))return pieCache.get(key);
    const file=path.join(__dirname,'pies',key);if(!fs.existsSync(file))throw Error('Missing PIE: '+key);
    const geometry=parsePie(fs.readFileSync(file,'utf8'));pieCache.set(key,geometry);return geometry;
  }
  const groupSource=fs.readFileSync(path.join(__dirname,'js/structureGroup.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  for(const prefix of ['6c-Black-','8c-NTW_4v4-','8c-DA-julia-40oil8p-']){
    const loads=[],owned=[];
    class TextureLoader{load(url,ok,progress,error){const texture=new THREE.Texture();loads.push({url,texture,error});return texture;}}
    const ctx=vm.createContext({THREE:{...THREE,TextureLoader},STRUCTURE_TURRETS,loadPieGeometry,
      getSensorModels:id=>{const s=sensors[id];return s?[s.sensorModel,s.mountModel].filter(Boolean):[];},
      window:{TEX_BASE:'classic/texpages/texpages/'},console:{...console,warn:()=>{}}});
    vm.runInContext(groupSource,ctx);
    const name=fs.readdirSync(path.join(__dirname,'maps')).find(n=>n.startsWith(prefix));
    const zip=await mod.exports.loadAsync(fs.readFileSync(path.join(__dirname,'maps',name)));
    const structures=(await h.readMapArchiveEntities(zip,'struct')).entries;
    const textureRefs=new Set();
    for(const entry of structures){
      const def=defsCtx.STRUCTURE_DEFS.find(d=>d.id.toLowerCase()===String(entry.name).toLowerCase());
      if(!def)continue;
      const group=await ctx.buildStructureGroup(defsCtx.getStructureRenderDef(def,entry.modules),0,def.sizeX,def.sizeY);
      group.traverse(o=>{if(o.material?.map)textureRefs.add(o.material.map);if(o.material?.userData?.teamColorMask)textureRefs.add(o.material.userData.teamColorMask);});
      owned.push(group);
    }
    assert.equal(loads.length,new Set(loads.map(t=>t.url)).size,'One texture allocation per URL');
    assert.equal(textureRefs.size,loads.length,'Building materials share those texture objects');
    let bytes=0;
    for(const {url} of loads){const png=fs.readFileSync(path.join(__dirname,url));bytes+=png.readUInt32BE(16)*png.readUInt32BE(20)*4*4/3;}
    assert(bytes<50*1048576,'Structure textures remain below 50 MiB for this fixture');
    const a=ctx.createPieMaterial('page-11-player-buildings.png',null,true);
    const b=ctx.createPieMaterial('page-11-player-buildings.png',0.4,true);
    assert.equal(a.map,b.map);assert.equal(a.userData.teamColorMask,b.userData.teamColorMask);
    assert.notEqual(a,b);assert.notEqual(a.userData.teamColor,b.userData.teamColor);
    a.userData.teamColor.set(0xff0000);b.userData.teamColor.set(0x0000ff);
    assert.notEqual(a.userData.teamColor.getHex(),b.userData.teamColor.getHex());
    assert.equal(a.opacity,1);assert.equal(b.opacity,0.4);
    let disposed=0;a.map.addEventListener('dispose',()=>disposed++);
    ctx.disposeUnsharedTexture(a.map);assert.equal(disposed,0,'Deleting one object cannot dispose a shared texture');
    const standalone=new THREE.Texture();standalone.addEventListener('dispose',()=>disposed++);
    ctx.disposeUnsharedTexture(standalone);assert.equal(disposed,1,'Unshared textures still release normally');
    vm.runInContext(extract('disposeObject3D'),ctx);
    for(const group of owned)ctx.disposeObject3D(group);
    assert.equal(disposed,1,'Actual object cleanup retains cached textures');
    const old=ctx.getSharedStructureTexture('retry.png');loads.at(-1).error();
    const replacement=ctx.getSharedStructureTexture('retry.png');assert.notEqual(old,replacement,'Failed texture loads may retry');
    assert(!old.userData.mapmakerSharedStructureTexture);
    for(const {texture} of loads)texture.dispose();
    console.log(name+': '+textureRefs.size+' shared textures, '+(bytes/1048576).toFixed(1)+' MiB; colours, opacity and disposal PASS');
  }

  let active=0,maxActive=0,completed=0,walls=0;
  const ctx=vm.createContext({
    STRUCTURE_DEFS:[{id:'test',sizeX:2,sizeY:2}],foldLegacyStructureModules:entries=>entries,
    parseStructureRotation:()=>({rot:0,rotDeg:0}),mapW:20,mapH:20,mapHeights:Array.from({length:20},()=>Array(20).fill(0)),HEIGHT_SCALE:1,setTimeout,
    addLoadedStructure:async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,0));active--;completed++;},
    refreshAllWallConnections:async()=>{assert.equal(active,0);assert.equal(completed,80);walls++;},
    console:{error:e=>{throw e;}}
  });
  vm.runInContext(extract('loadStructureEntries'),ctx);
  await ctx.loadStructureEntries(Array.from({length:80},()=>({name:'test',position:[256,256]})));
  assert.equal(maxActive,16);assert.equal(completed,80);assert.equal(walls,1);
  console.log('PASS: structures load at most 16 at a time; every entry finishes before wall refresh.');
})().catch(e=>{console.error(e);process.exitCode=1;});
