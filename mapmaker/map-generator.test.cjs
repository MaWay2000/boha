const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
  const {generateMap,normalizeGeneratorOptions,startingBuildingOptions,getStartingBuildingCounts,getBaseEdgeLimit,getGeneratorStarts}=await import('./js/mapGenerator.js');
  const {generateEditorMap}=await import('./js/mapGeneratorUI.js');
  const source=fs.readFileSync(`${__dirname}/js/game.js`,'utf8');
  const arrays=source.slice(source.indexOf('const DEFAULT_TILE_TYPES_BY_TILESET ='),source.indexOf('let selectedTileId'));
  const tileTypes=vm.runInNewContext(arrays+';DEFAULT_TILE_TYPES_BY_TILESET');
  const structureData=JSON.parse(fs.readFileSync(`${__dirname}/structure.json`,'utf8'));
  const featureData=JSON.parse(fs.readFileSync(`${__dirname}/features.json`,'utf8'));
  const catalog={tileTypes,tileCounts:[78,81,80],structures:Object.entries(structureData).map(([id,d])=>({id,sizeX:d.width||2,sizeY:d.breadth||2})),
    features:Object.entries(featureData).map(([id,d])=>({id,sizeX:d.width||1,sizeY:d.breadth||1}))};
  assert.deepEqual(getStartingBuildingCounts('trucks'),{hqCount:1,factoryCount:0,cyborgFactoryCount:0,vtolFactoryCount:0,researchCount:0,powerCount:0,repairCount:0,rearmCount:0,relayCount:0,uplinkCount:0,lassatCount:0});
  for(const [base,factories,power,pads] of [['small',2,3,17],['medium',3,7,33],['full',5,10,50]]){
    const o=normalizeGeneratorOptions({base});
    assert.equal(o.factoryCount,factories);assert.equal(o.cyborgFactoryCount,factories);assert.equal(o.researchCount,factories);
    assert.equal(o.powerCount,power);assert.equal(o.rearmCount,pads);assert.equal(o.hqCount,1);
    assert.equal(o.uplinkCount,0);assert.equal(o.lassatCount,0);
  }
  const trucks=generateMap({base:'trucks'},catalog);
  assert.equal(trucks.snapshot.structures.length,4);
  assert(trucks.snapshot.structures.every(s=>s.name==='A0CommandCentre'));
  assert.equal(trucks.snapshot.droids.length,8);
  assert.equal(getBaseEdgeLimit({width:65,height:128,players:4,layout:'teams',teams:2,baseRadius:12}).max,17);
  assert.equal(getBaseEdgeLimit({width:96,height:128,players:4,layout:'teams',teams:2,baseRadius:12}).max,32);
  assert.equal(getBaseEdgeLimit({width:48,height:48,players:10,layout:'teams',teams:2,baseRadius:12}).max,null);
  for(const layout of ['teams','corners','circle','edges','opposite'])for(const players of [2,4,6,10]){
    const input={width:128,height:192,players,layout,teams:2,baseRadius:12},limit=getBaseEdgeLimit(input);
    if(limit.max===null)continue;
    for(let edge=8;edge<=limit.max;edge++){
      const starts=getGeneratorStarts(normalizeGeneratorOptions({...input,edge}));
      for(let i=0;i<starts.length;i++)for(let j=0;j<i;j++)assert(Math.hypot(starts[i].x-starts[j].x,starts[i].y-starts[j].y)>=30,'allowed edge keeps bases apart');
    }
    assert.match(limit.reason,/width|height|64/);
  }
  const emptyCounts=Object.fromEntries(startingBuildingOptions.map(([key])=>[key,0]));
  for(const [key,,id,max] of startingBuildingOptions){
    assert.equal(normalizeGeneratorOptions({[key]:999})[key],max);
    assert.equal(normalizeGeneratorOptions({[key]:-1})[key],0);
    const counted=generateMap({...emptyCounts,base:'counts',[key]:Math.min(2,max),width:192,height:192,players:2,layout:'opposite',symmetry:'none',baseRadius:24,baseOil:0,expansions:0,neutralOil:0,scenery:0},catalog);
    assert.deepEqual(counted.report.errors,[]);
    for(let player=0;player<2;player++) assert.equal(counted.snapshot.structures.filter(s=>s.startpos===player&&s.name===id).length,Math.min(2,max),id+' count per player');
    assert.equal(counted.snapshot.structures.length,2*Math.min(2,max),'zero counts place nothing');
  }
  const packed=generateMap({...emptyCounts,base:'counts',rearmCount:99,baseRadius:7},catalog);
  assert(packed.report.warnings.some(w=>w.includes('No room')),'crowded counts report placement failures');
  for(const [width,height] of [[255,255],[192,128]]){
    const teamMap=generateMap({width,height,players:4,layout:'teams',teams:2,base:'trucks',baseRadius:7},catalog);
    assert.deepEqual(teamMap.report.errors,[]);
    for(const player of [0,2])assert(teamMap.starts[player].y<height/2,'first team starts at top');
    for(const player of [1,3])assert(teamMap.starts[player].y>height/2,'second team starts at bottom');
    assert(teamMap.starts[0].x!==teamMap.starts[2].x,'teammates spread across the top');
    assert(teamMap.starts[1].x!==teamMap.starts[3].x,'teammates spread across the bottom');
  }
  for(const [width,height,players] of [[190,255,4],[128,128,4],[96,128,4],[255,255,10],[190,255,5]]) {
    const grouped=generateMap({width,height,players,layout:'teams',teams:2,base:'trucks',baseRadius:12},catalog);
    assert.deepEqual(grouped.report.errors,[],'two rows fit '+width+'x'+height+'/'+players);
    const top=grouped.starts.filter((_,i)=>i%2===0),bottom=grouped.starts.filter((_,i)=>i%2===1);
    for(const row of [top,bottom]) {
      assert.equal(row[0].x,grouped.options.edge);
      assert.equal(row.at(-1).x,width-1-grouped.options.edge,'use the whole available row width');
      assert(row.every(p=>p.y===row[0].y),'teammates share an edge');
    }
  }
  const a=generateMap({},catalog),b=generateMap({},catalog);
  assert.equal(a.snapshot.mapInfo.license,'CC0-1.0','generated maps default to CC0');
  assert.equal(a.snapshot.mapInfo.version,'1.0','generated maps default to version 1.0');
  assert.deepEqual(a,b,'same settings and seed reproduce exactly');
  assert.deepEqual(a.report.errors,[],'defaults are valid');
  const metadata={name:'My map',author:'Map creator',license:'MIT',description:'Keep this',version:'3',tags:'custom',created:'2026-10-15',source:'local',slots:'2',scavengers:'1'};
  const edited=generateEditorMap({players:4,scavengers:false},catalog,{...a.snapshot,name:'My map',mapInfo:metadata});
  assert.equal(edited.snapshot.name,'My map');
  assert.deepEqual(edited.snapshot.mapInfo,{...metadata,slots:'4',scavengers:'0'},'generation preserves existing Settings metadata');
  const scavs=generateMap({scavengers:true,scavCamps:2,scavUnits:2},catalog);
  assert.deepEqual(scavs.report.errors,[]);
  assert(scavs.snapshot.structures.some(entry=>entry.player==='scavenger'));
  assert(scavs.snapshot.droids.some(entry=>entry.player==='scavenger'));
  assert(scavs.snapshot.droids.filter(entry=>entry.player==='scavenger').every(entry=>entry.template==='BaBaPeople'),'Generated scavengers use a real game prefab');
  assert(scavs.snapshot.structures.concat(scavs.snapshot.droids).every(entry=>entry.startpos!==10));
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
  for(let tileset=0;tileset<catalog.tileCounts.length;tileset++){
    const count=catalog.tileCounts[tileset];
    assert.equal(normalizeGeneratorOptions({tileset,textureVariety:999}).textureVariety,count,'variety follows the selected tileset');
    assert.equal(normalizeGeneratorOptions({tileset,textureVariety:10}).textureVariety,10,'values above six remain available');
    assert.equal(normalizeGeneratorOptions({tileset,textureVariety:0}).textureVariety,1,'minimum stays one');
  }
  assert.equal(normalizeGeneratorOptions({textureVariety:999},{tileCounts:[12]}).textureVariety,12,'custom catalog count is respected');
  const varied=generateMap({tileset:1,textureVariety:999,water:0,roads:false,border:0,cliffs:false,terrain:'flat'},catalog);
  assert.equal(varied.options.textureVariety,catalog.tileCounts[1],'engine no longer clamps variety to six');
  const usedTiles=new Set(varied.snapshot.mapTiles.flat());
  assert(usedTiles.size>6,'generation actually uses more than six ground textures');
  for(const tile of usedTiles){
    assert(tile>=0&&tile<catalog.tileCounts[1],'generated tile exists');
    assert.equal(tileTypes[1][tile],tileTypes[1][0],'existing ground-type filtering is unchanged');
  }
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
