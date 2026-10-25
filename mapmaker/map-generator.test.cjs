const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
  const {generateMap,normalizeGeneratorOptions}=await import('./js/mapGenerator.js');
  const {generateEditorMap}=await import('./js/mapGeneratorUI.js');
  const source=fs.readFileSync(`${__dirname}/js/game.js`,'utf8');
  const arrays=source.slice(source.indexOf('const DEFAULT_TILE_TYPES_BY_TILESET ='),source.indexOf('let selectedTileId'));
  const tileTypes=vm.runInNewContext(arrays+';DEFAULT_TILE_TYPES_BY_TILESET');
  const structureData=JSON.parse(fs.readFileSync(`${__dirname}/structure.json`,'utf8'));
  const featureData=JSON.parse(fs.readFileSync(`${__dirname}/features.json`,'utf8'));
  const catalog={tileTypes,tileCounts:[78,81,80],structures:Object.entries(structureData).map(([id,d])=>({id,sizeX:d.width||2,sizeY:d.breadth||2})),
    features:Object.entries(featureData).map(([id,d])=>({id,sizeX:d.width||1,sizeY:d.breadth||1}))};
  const a=generateMap({},catalog),b=generateMap({},catalog);
  assert.deepEqual(a,b,'same settings and seed reproduce exactly');
  assert.deepEqual(a.report.errors,[],'defaults are valid');
  const metadata={name:'My map',author:'Map creator',license:'MIT',description:'Keep this',version:'3',tags:'custom',created:'2026-10-15',source:'local',slots:'2',scavengers:'1'};
  const edited=generateEditorMap({players:4,scavengers:false},catalog,{...a.snapshot,name:'My map',mapInfo:metadata});
  assert.equal(edited.snapshot.name,'My map');
  assert.deepEqual(edited.snapshot.mapInfo,{...metadata,slots:'4',scavengers:'0'},'generation preserves existing Settings metadata');
  assert(a.report.connected);assert.equal(a.snapshot.droids.length,8);
  for(let i=0;i<4;i++)assert.equal(a.snapshot.droids.filter(d=>d.startpos===i).length,2);
  assert.notDeepEqual(a.snapshot.mapHeights,generateMap({seed:'different'},catalog).snapshot.mapHeights);
  for(let tileset=0;tileset<3;tileset++)for(const players of [2,4,6,10]) {
    const result=generateMap({tileset,players,width:192,height:192,layout:'circle',symmetry:'none'},catalog);
    assert.deepEqual(result.report.errors,[],`valid ${tileset}/${players}: ${result.report.errors}`);
    const ids=[];for(const entries of [result.snapshot.structures,result.snapshot.droids,result.snapshot.features])for(const e of entries){
      ids.push(e.id);assert(e.position[0]>0&&e.position[0]<192*128);assert(e.position[1]>0&&e.position[1]<192*128);
    }assert.equal(new Set(ids).size,ids.length);
  }
  const locked=generateMap({regenerate:'resources',neutralOil:12},catalog,a.snapshot);
  assert.deepEqual(locked.snapshot.mapTiles,a.snapshot.mapTiles);assert.deepEqual(locked.snapshot.droids.map(d=>d.position),a.snapshot.droids.map(d=>d.position));
  assert(generateMap({lockTerrain:true,width:200},catalog,a.snapshot).report.errors.length>0);
  assert.equal(normalizeGeneratorOptions({width:999,players:100}).width,255);
  for(const style of ['lakes','river','coast','islands']) {
    const r=generateMap({water:20,waterStyle:style},catalog);assert(r.report.connected,style+' routes');
  }
  const tiny=generateMap({width:48,height:48,players:10},catalog);assert(tiny.report.errors.length>0,'crowded layouts must be rejected');
  let previous=a.snapshot;
  for(const width of [50,64,48,128,50]){
    const result=generateMap({width,height:128,players:4,layout:'corners',symmetry:'vertical',base:'advanced',baseOil:12},catalog,previous);
    assert.deepEqual(result.report.errors,[],`repeated resizing to ${width}: ${result.report.errors}`);
    assert.equal(result.snapshot.mapW,width);assert(result.report.connected);
    if(width===50)assert(result.report.warnings.some(message=>message.includes('edge distance adjusted')));
    previous=result.snapshot;
  }
  console.log('PASS: seeded generation, all tilesets, 2–10 players, water routes, locks, bounds, IDs, input limits and invalid layouts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
