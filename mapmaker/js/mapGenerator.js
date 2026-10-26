// Pure, deterministic generation: no DOM, renderer, network or editor mutations.
import {getTileCount} from './tileset.js';
export const generatorDefaults = {
  name:'Generated battlefield', width:128, height:128, players:4, tileset:0, seed:'map-1',
  preset:'arena', symmetry:'both', layout:'corners', teams:2, edge:16, baseRadius:12,
  terrain:'hills', minHeight:20, maxHeight:65, frequency:4, smoothness:3, cliffs:false,
  border:3, centreRadius:10, routes:2, routeWidth:5, connected:true,
  water:0, waterStyle:'lakes', riverWidth:5, crossings:2, roads:true, roadWidth:2,
  groundTile:0, textureVariety:3, transitions:true,
  base:'small', trucks:2, tanks:0, support:0, cyborgs:0, truckBody:'Body1REC',
  truckPropulsion:'wheeled01', tankWeapon:'MG1Mk1', orientation:'centre', modules:0,
  baseBuildings:'A0CommandCentre,A0LightFactory,A0ResearchFacility,A0PowerGenerator',
  defenses:0, defenseType:'GuardTower1',
  baseOil:4, oilDistance:10, expansions:2, expansionOil:2, neutralOil:8, oilSpacing:3,
  derricks:false, drums:0, artifacts:0, scenery:1, sceneryStyle:'rocks', symmetricScenery:true,
  scavengers:false, scavCamps:2, scavUnits:2,
  author:'', license:'CC0-1.0', description:'', version:'1', tags:'generated',
  regenerate:'all', lockTerrain:false, lockBases:false, lockResources:false, lockScenery:false
};
export function seededRandom(seed) {
  let a=2166136261;
  for(const c of String(seed)) a=Math.imul(a^c.charCodeAt(0),16777619);
  return () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const grid=(w,h,value)=>Array.from({length:h},()=>Array(w).fill(value));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function normalizeGeneratorOptions(input={},catalog={}) {
  const o={...generatorDefaults,...input};
  const ranges={width:[48,255],height:[48,255],players:[2,10],teams:[1,5],edge:[8,64],baseRadius:[7,24],
    minHeight:[0,255],maxHeight:[0,255],frequency:[1,12],smoothness:[0,8],border:[0,8],centreRadius:[0,30],
    routes:[1,4],routeWidth:[3,14],water:[0,60],riverWidth:[2,16],crossings:[1,6],roadWidth:[1,5],
    groundTile:[0,77],trucks:[1,8],tanks:[0,12],support:[0,4],cyborgs:[0,8],modules:[0,2],
    defenses:[0,12],baseOil:[0,16],oilDistance:[6,24],expansions:[0,6],expansionOil:[1,8],neutralOil:[0,40],
    oilSpacing:[2,8],drums:[0,20],artifacts:[0,12],scenery:[0,5],scavCamps:[1,6],scavUnits:[0,10],tileset:[0,2]};
  for(const [k,[lo,hi]] of Object.entries(ranges)) o[k]=clamp(Math.round(Number(o[k])||0),lo,hi);
  o.textureVariety=clamp(Math.round(Number(o.textureVariety)||0),1,catalog.tileCounts?.[o.tileset]||getTileCount(o.tileset));
  if(o.minHeight>o.maxHeight) [o.minHeight,o.maxHeight]=[o.maxHeight,o.minHeight];
  o.seed=String(o.seed||'map-1').slice(0,100);
  o.edge=Math.min(o.edge,Math.floor(Math.min(o.width,o.height)/3));
  o.baseRadius=Math.min(o.baseRadius,Math.floor(Math.min(o.width,o.height)/5));
  return o;
}
function mirrorPoints(p,o) {
  const w=o.width-1,h=o.height-1;
  if(o.symmetry==='vertical') return [p,{x:w-p.x,y:p.y}];
  if(o.symmetry==='horizontal') return [p,{x:p.x,y:h-p.y}];
  if(o.symmetry==='both') return [p,{x:w-p.x,y:p.y},{x:p.x,y:h-p.y},{x:w-p.x,y:h-p.y}];
  if(o.symmetry==='rotation') return [p,{x:w-p.x,y:h-p.y}];
  return [p];
}
function canonical(x,y,o) {
  if(o.symmetry==='vertical'||o.symmetry==='both') x=Math.min(x,o.width-1-x);
  if(o.symmetry==='horizontal'||o.symmetry==='both') y=Math.min(y,o.height-1-y);
  if(o.symmetry==='rotation' && y>=(o.height/2)) {x=o.width-1-x;y=o.height-1-y;}
  return {x,y};
}
export function generateMap(input={},catalog={},previous=null) {
  const o=normalizeGeneratorOptions(input,catalog),w=o.width,h=o.height;
  const random=seededRandom(o.seed), warnings=[], errors=[];
  // A narrow map must spread corner starts out, not keep the old inset and
  // reject every subsequent edit because the bases overlap in the middle.
  if(o.layout==='corners'&&o.players===4){
    const inset=Math.floor((Math.min(w,h)-1-(2*o.baseRadius+6))/2);
    if(o.edge>inset){warnings.push(`Base edge distance adjusted from ${o.edge} to ${inset} tiles to fit four corner bases on this map.`);o.edge=inset;}
  }
  const centre={x:(w-1)/2,y:(h-1)/2};
  const types=catalog.tileTypes?.[o.tileset]||Array(96).fill(0);
  const tileCount=catalog.tileCounts?.[o.tileset]||getTileCount(o.tileset);
  const waterTile=types[17]===7?17:types.slice(0,tileCount).findIndex(t=>t===7);
  const landTiles=types.map((t,i)=>i<tileCount&&t===types[o.groundTile]&&t!==7&&t!==8?i:-1).filter(i=>i>=0);
  const land=types[o.groundTile]===7||types[o.groundTile]===8?landTiles[0]??0:Math.min(o.groundTile,tileCount-1);
  const road=types.slice(0,tileCount).findIndex(t=>t===6);
  const cliffTile=types.slice(0,tileCount).findIndex(t=>t===8);
  const snapshot={version:1,exportFormat:'classic40',name:o.name,savedAt:0,tilesetIndex:o.tileset,mapW:w,mapH:h,
    mapTiles:grid(w,h,land),mapHeights:grid(w,h,o.minHeight),mapRotations:grid(w,h,0),
    mapXFlip:grid(w,h,false),mapYFlip:grid(w,h,false),mapTriFlip:grid(w,h,false),tileTypesById:types.slice(),
    structureStyle:'array',mapInfo:{name:o.name,slots:String(o.players),author:o.author,license:o.license,
      description:o.description,version:o.version,tags:o.tags,scavengers:o.scavengers?'1':'0'},structures:[],droids:[],features:[]};
  const blocked=grid(w,h,false), reserved=grid(w,h,false), routeMask=grid(w,h,false);
  const starts=[];
  if(o.layout==='corners' && o.players===4) starts.push({x:o.edge,y:o.edge},{x:w-1-o.edge,y:o.edge},{x:o.edge,y:h-1-o.edge},{x:w-1-o.edge,y:h-1-o.edge});
  else for(let i=0;i<o.players;i++) {
    let angle=-Math.PI/2+i*2*Math.PI/o.players;
    if(o.layout==='teams') {const team=i%o.teams,slot=Math.floor(i/o.teams),n=Math.ceil(o.players/o.teams);angle=team*2*Math.PI/o.teams+(slot-(n-1)/2)*0.28;}
    let rx=(w-1)/2-o.edge,ry=(h-1)/2-o.edge;
    let sx=Math.cos(angle),sy=Math.sin(angle);
    if(o.layout==='edges'||o.layout==='opposite') {const scale=1/Math.max(Math.abs(sx),Math.abs(sy));sx*=scale;sy*=scale;}
    starts.push({x:Math.round(centre.x+rx*sx),y:Math.round(centre.y+ry*sy)});
  }
  for(let i=0;i<starts.length;i++) for(let j=0;j<i;j++) if(dist(starts[i],starts[j])<2*o.baseRadius+6) errors.push(`Player ${i+1} and ${j+1} bases are too close. Increase size or reduce base radius.`);
  const waves=Array.from({length:5},()=>({x:random()*6+1,y:random()*6+1,p:random()*Math.PI*2}));
  const field=(x,y)=>waves.reduce((s,a)=>s+Math.sin(x/w*a.x*o.frequency+y/h*a.y*o.frequency+a.p),0)/waves.length;
  const applyDisk=(cx,cy,r,fn)=>{for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++) for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++) if(Math.hypot(x-cx,y-cy)<=r) fn(x,y);};
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const p=canonical(x,y,o); let n=(field(p.x,p.y)+1)/2;
    if(o.terrain==='flat') n=0;
    if(o.terrain==='plateaus') n=Math.round(n*3)/3;
    if(o.terrain==='canyon') n=Math.min(1,Math.abs(p.x-centre.x)/(w*.3));
    if(o.terrain==='mountains') n=n*n;
    snapshot.mapHeights[y][x]=Math.round(o.minHeight+n*(o.maxHeight-o.minHeight));
    const variety=landTiles.slice(0,o.textureVariety);
    snapshot.mapTiles[y][x]=variety.length?variety[Math.floor((field(p.x+12,p.y+37)+1)/2*variety.length)%variety.length]:land;
    let wet=false;
    if(o.water>0 && waterTile>=0) {
      if(o.waterStyle==='river') wet=Math.abs(p.x-centre.x-Math.sin(p.y/h*6)*w*.07)<o.riverWidth/2;
      else if(o.waterStyle==='coast') wet=p.x< w*o.water/100;
      else if(o.waterStyle==='islands') wet=n<o.water/100+.15;
      else wet=field(p.x+52,p.y+73)<-1+o.water/60;
    }
    if(wet) {snapshot.mapTiles[y][x]=waterTile; blocked[y][x]=true; snapshot.mapHeights[y][x]=o.minHeight;}
    if(x<o.border||y<o.border||x>=w-o.border||y>=h-o.border) {blocked[y][x]=true;snapshot.mapHeights[y][x]=o.maxHeight;if(cliffTile>=0)snapshot.mapTiles[y][x]=cliffTile;}
  }
  for(let pass=0;pass<o.smoothness;pass++) {
    const old=snapshot.mapHeights; snapshot.mapHeights=old.map((row,y)=>row.map((v,x)=>{
      if(blocked[y][x]) return v;
      return Math.round((v+(old[y-1]?.[x]??v)+(old[y+1]?.[x]??v)+(row[x-1]??v)+(row[x+1]??v))/5);
    }));
  }
  if(o.cliffs) for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    if(snapshot.mapHeights[y][x]>o.minHeight+(o.maxHeight-o.minHeight)*.72) {blocked[y][x]=true;if(cliffTile>=0)snapshot.mapTiles[y][x]=cliffTile;}
  }
  const clearDisk=(p,r)=>applyDisk(p.x,p.y,r,(x,y)=>{blocked[y][x]=false;snapshot.mapTiles[y][x]=land;snapshot.mapHeights[y][x]=o.minHeight;});
  clearDisk(centre,o.centreRadius);
  starts.forEach(p=>clearDisk(p,o.baseRadius));
  const carve=(a,b,r)=>{const steps=Math.ceil(dist(a,b)*2);for(let t=0;t<=steps;t++){
    const p={x:a.x+(b.x-a.x)*t/Math.max(1,steps),y:a.y+(b.y-a.y)*t/Math.max(1,steps)};
    applyDisk(p.x,p.y,r,(x,y)=>{blocked[y][x]=false;routeMask[y][x]=true;snapshot.mapHeights[y][x]=o.minHeight;snapshot.mapTiles[y][x]=land;});
  }};
  if(o.connected) starts.forEach((p,i)=>{
    carve(p,centre,o.routeWidth/2);
    for(let n=1;n<o.routes;n++) carve(p,starts[(i+n)%starts.length],o.routeWidth/2);
  });
  if(o.waterStyle==='river' && o.water>0) for(let n=0;n<o.crossings;n++) {
    const y=Math.round((n+1)*h/(o.crossings+1));carve({x:centre.x-w*.2,y},{x:centre.x+w*.2,y},o.routeWidth/2);
  }
  if(o.roads&&road>=0) for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(routeMask[y][x]) {
    if(starts.some(p=>Math.abs((y-p.y)*(centre.x-p.x)-(x-p.x)*(centre.y-p.y))/Math.max(1,dist(p,centre))<=o.roadWidth/2)) snapshot.mapTiles[y][x]=road;
  }
  const structures=catalog.structures||[], features=catalog.features||[];
  const findStruct=id=>structures.find(d=>d.id===id);
  let nextId=1;
  const canPlace=(x,y,sx=1,sy=1)=>{
    if(x<o.border+1||y<o.border+1||x+sx>=w-o.border||y+sy>=h-o.border) return false;
    for(let dy=-1;dy<=sy;dy++) for(let dx=-1;dx<=sx;dx++) if(blocked[y+dy]?.[x+dx]||reserved[y+dy]?.[x+dx]) return false;
    return true;
  };
  const occupy=(x,y,sx=1,sy=1)=>{for(let dy=0;dy<sy;dy++)for(let dx=0;dx<sx;dx++)reserved[y+dy][x+dx]=true;};
  const facing=p=>o.orientation==='centre'?((Math.atan2(centre.y-p.y,centre.x-p.x)*65536/(2*Math.PI)+65536)%65536)|0:0;
  const putStructure=(id,p,owner,offset=0)=>{
    const def=findStruct(id); if(!def){errors.push(`Building ${id} unavailable in catalog. Choose an existing structure ID.`);return false;}
    const sx=def.sizeX||2,sy=def.sizeY||2;
    for(let k=offset;k<offset+400;k++) {const angle=k*2.39996,r=Math.sqrt(k)*1.4;
      const x=Math.round(p.x+Math.cos(angle)*r-sx/2),y=Math.round(p.y+Math.sin(angle)*r-sy/2);
      if(!canPlace(x,y,sx,sy)||dist({x,y},p)>o.baseRadius+5)continue;
      clearDisk({x:x+sx/2,y:y+sy/2},Math.max(sx,sy)); occupy(x,y,sx,sy);
      const entry={id:nextId++,name:id,position:[(x+sx/2)*128,(y+sy/2)*128,o.minHeight*2],rotation:[facing(p),0,0],startpos:owner};
      if(o.modules&&['A0LightFactory','A0VTolFactory1','A0ResearchFacility','A0PowerGenerator'].includes(id))entry.modules=['A0LightFactory','A0VTolFactory1'].includes(id)?o.modules:1;
      snapshot.structures.push(entry);return true;
    } warnings.push(`No room for ${id} at player ${owner}.`);return false;
  };
  const putDroid=(p,owner,role,index)=>{
    for(let k=0;k<300;k++) {const angle=(index+k)*2.39996,r=4+Math.sqrt(index+k)*.8;
      const x=Math.round(p.x+Math.cos(angle)*r),y=Math.round(p.y+Math.sin(angle)*r);
      if(!canPlace(x,y)||dist({x,y},p)>o.baseRadius+3)continue;
      occupy(x,y); const truck=role==='truck',cyborg=role==='cyborg';
      const d={id:nextId++,name:role,startpos:owner,position:[(x+.5)*128,(y+.5)*128,snapshot.mapHeights[y][x]*2],rotation:[facing(p),0,0],
        body:cyborg?'CyborgLightBody':truck?o.truckBody:'Body1REC',propulsion:cyborg?'CyborgLegs':truck?o.truckPropulsion:'wheeled01'};
      if(truck){if(o.truckBody==='Body1REC'&&o.truckPropulsion==='wheeled01')d.template='ConstructionDroid';d.construct='Spade1Mk1';}
      else d.weapons=[role==='support'?'SensorTurret1Mk1':cyborg?'CyborgChaingun':o.tankWeapon];
      if(role==='support'){delete d.weapons;d.sensor='SensorTurret1Mk1';}
      snapshot.droids.push(d);return true;
    }warnings.push(`No room for ${role} at player ${owner}.`);return false;
  };
  const baseLists={trucks:[],small:['A0CommandCentre','A0LightFactory','A0ResearchFacility','A0PowerGenerator'],
    advanced:['A0CommandCentre','A0LightFactory','A0ResearchFacility','A0PowerGenerator','A0RepairCentre3','A0CyborgFactory','A0VTolFactory1']};
  starts.forEach((p,i)=>{
    const list=o.base==='custom'?o.baseBuildings.split(',').map(x=>x.trim()).filter(Boolean):baseLists[o.base]||baseLists.small;
    list.forEach(id=>putStructure(id,p,i));
    for(let n=0;n<o.defenses;n++)putStructure(o.defenseType,p,i,20+n*3);
    for(const [role,count] of [['truck',o.trucks],['tank',o.tanks],['support',o.support],['cyborg',o.cyborgs]])for(let n=0;n<count;n++)putDroid(p,i,role,n);
  });
  const oilPoints=[];
  const putFeature=(id,x,y,role='scenery',owner=null)=>{
    const def=features.find(d=>d.id===id||d.featureName===id);
    const sx=def?.sizeX||1,sy=def?.sizeY||1;
    if(!canPlace(x,y,sx,sy))return false;
    occupy(x,y,sx,sy);
    snapshot.features.push({id:nextId++,name:id,position:[(x+sx/2)*128,(y+sy/2)*128,snapshot.mapHeights[y][x]*2],rotation:[0,0,0],generatorRole:role,generatorOwner:owner});return true;
  };
  const putOil=(p,count,owner)=>{let placed=0;
    for(let k=0;k<count*80&&placed<count;k++){
      const a=k*2.39996,r=Math.sqrt(k)*o.oilSpacing*.5;
      const x=Math.round(p.x+Math.cos(a)*r),y=Math.round(p.y+Math.sin(a)*r);
      if(x<2||y<2||x>=w-2||y>=h-2||oilPoints.some(q=>dist(q,{x,y})<o.oilSpacing))continue;
      clearDisk({x,y},2);
      if(!putFeature('OilResource',x,y,'resources',owner))continue;
      oilPoints.push({x,y,owner});placed++;
      if(o.derricks&&owner!==null) snapshot.structures.push({id:nextId++,name:'A0ResourceExtractor',position:[(x+.5)*128,(y+.5)*128,o.minHeight*2],rotation:[0,0,0],startpos:owner,generatorRole:'resources'});
    }if(placed<count)warnings.push(`Oil cluster placed ${placed}/${count} wells; reduce density or enlarge map.`);
  };
  starts.forEach((p,i)=>{
    const angle=Math.atan2(centre.y-p.y,centre.x-p.x);
    putOil({x:p.x+Math.cos(angle)*o.oilDistance,y:p.y+Math.sin(angle)*o.oilDistance},o.baseOil,i);
    for(let n=0;n<o.expansions;n++) {
      const t=(n+1)/(o.expansions+2),q={x:p.x+(centre.x-p.x)*t,y:p.y+(centre.y-p.y)*t};
      if(o.connected)carve(p,q,o.routeWidth/2);
      putOil(q,o.expansionOil,i);
    }
  });
  putOil(centre,o.neutralOil,null);
  const findFeature=re=>features.find(d=>re.test(d.id))?.id;
  for(const [count,re,kind] of [[o.drums,/OilDrum/i,'resources'],[o.artifacts,/Artefact|Artifact|^Crate$/i,'resources']]){
    const id=findFeature(re);if(count&&!id)warnings.push(`${re.source} is unavailable in this tileset catalog.`);
    if(id)for(let n=0;n<count;n++)for(let k=0;k<100;k++)if(putFeature(id,Math.floor(random()*w),Math.floor(random()*h),kind))break;
  }
  if(o.scavengers) for(let n=0;n<o.scavCamps;n++) {
    const p={x:Math.round(centre.x+Math.cos(n*6.28/o.scavCamps)*w*.2),y:Math.round(centre.y+Math.sin(n*6.28/o.scavCamps)*h*.2)};
    if(starts.some(s=>dist(s,p)<o.baseRadius*2)){warnings.push('Scavenger camp skipped near a player base.');continue;}
    for(const id of ['A0BaBaFactory','A0BaBaPowerGenerator'])putStructure(id,p,10);
    for(let k=0;k<o.scavUnits;k++)putDroid(p,10,'tank',k);
  }
  const styles={trees:/Tree|Pine/i,rocks:/Boulder|Rock/i,ruins:/Ruin|Wreck/i,city:/Building|Skyscraper|Warehouse/i};
  const scenery=features.filter(d=>(styles[o.sceneryStyle]||styles.rocks).test(d.id));
  if(o.scenery&&!scenery.length)warnings.push('No matching scenery models available.');
  for(let n=0;n<Math.floor(w*h*o.scenery/1000)&&scenery.length;n++) {
    const p={x:Math.floor(random()*w),y:Math.floor(random()*h)},def=scenery[Math.floor(random()*scenery.length)];
    for(const q of o.symmetricScenery?mirrorPoints(p,o):[p]) {
      const x=Math.round(q.x),y=Math.round(q.y);
      if(starts.some(s=>dist(s,q)<o.baseRadius+3)||routeMask[y]?.[x]||dist(q,centre)<o.centreRadius)continue;
      putFeature(def.featureName||def.id,x,y);
    }
  }
  // Selective regeneration retains the untouched editor layers, not an old seed's layers.
  const keep=k=>o[`lock${k[0].toUpperCase()+k.slice(1)}`]||(o.regenerate!=='all'&&o.regenerate!==k);
  if(previous&&['terrain','bases','resources','scenery'].some(keep)) {
    if(previous.mapW!==w||previous.mapH!==h||previous.tilesetIndex!==o.tileset)errors.push('Locked/selective layers require the current map dimensions and tileset.');
    else {
      if(keep('terrain'))for(const k of ['mapTiles','mapHeights','mapRotations','mapXFlip','mapYFlip','mapTriFlip','tileTypesById'])snapshot[k]=clone(previous[k]);
      const role=e=>e.generatorRole||(/OilResource|OilDrum|Artefact|Artifact/.test(e.name)?'resources':'scenery');
      snapshot.features=[...snapshot.features.filter(e=>!keep(role(e))),...(previous.features||[]).filter(e=>keep(role(e))).map(clone)];
      snapshot.structures=[...snapshot.structures.filter(e=>!keep(e.generatorRole==='resources'?'resources':'bases')),...(previous.structures||[]).filter(e=>keep(e.generatorRole==='resources'?'resources':'bases')).map(clone)];
      if(keep('bases'))snapshot.droids=clone(previous.droids||[]);
      warnings.push('Retained layers may alter balance or connectivity; review the validation report.');
    }
  }
  if(o.transitions && !keep('terrain')) {
    // Reuse the editor's tileset-specific coast profiles, not arbitrary tile IDs.
    const hints=catalog.waterHints?.[o.tileset]||{};
    const wet=snapshot.mapTiles.map(row=>row.map(tile=>types[tile]===7));
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(wet[y][x]) {
      const key=[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>wet[y+dy][x+dx]?'1':'0').join('');
      const hint=hints[key];if(hint){snapshot.mapTiles[y][x]=hint.tile;snapshot.mapRotations[y][x]=hint.rot;}
    }
    if(o.water&&!Object.keys(hints).length)warnings.push('This tileset has no coast-transition profiles; water uses a plain fill.');
  }
  if(o.roads&&!o.connected)warnings.push('Roads between bases require land routes; isolated-map roads are not drawn.');
  if(catalog.bodyIds&&!catalog.bodyIds.includes(o.truckBody))errors.push('Unknown truck body ID.');
  if(catalog.propulsionIds&&!catalog.propulsionIds.includes(o.truckPropulsion))errors.push('Unknown truck propulsion ID.');
  if(o.tanks&&catalog.weaponIds&&!catalog.weaponIds.includes(o.tankWeapon))errors.push('Unknown tank weapon ID.');
  let uniqueId=1;
  for(const entries of [snapshot.structures,snapshot.droids,snapshot.features]) for(const entry of entries)entry.id=uniqueId++;
  // Final pass validates the actual merged terrain, including locked layers.
  const passable=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&![7,8].includes(types[snapshot.mapTiles[y][x]]);
  const seen=new Set(),queue=[]; const first=starts[0];
  if(passable(first.x,first.y)){queue.push(first);seen.add(first.y*w+first.x);}
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,key=y*w+x;
    if(!seen.has(key)&&passable(x,y)&&Math.abs(snapshot.mapHeights[y][x]-snapshot.mapHeights[p.y][p.x])<=12){seen.add(key);queue.push({x,y});}}}
  const connected=starts.every(p=>seen.has(p.y*w+p.x));
  if(o.connected&&!connected)errors.push('Not all starts have a traversable land route. Reduce height range/water or widen routes.');
  if(!o.connected&&!connected)warnings.push('Island/isolated starts: ground units cannot reach every player.');
  const actualOil=snapshot.features.filter(f=>f.name==='OilResource');
  const occupied=new Set();
  for(const entries of [snapshot.structures,snapshot.features,snapshot.droids])for(const entry of entries){
    const def=structures.find(s=>s.id===entry.name)||features.find(s=>s.id===entry.name);
    const sx=def?.sizeX||1,sy=def?.sizeY||1;
    const x=Math.round(entry.position[0]/128-sx/2),y=Math.round(entry.position[1]/128-sy/2);
    if(x<0||y<0||x+sx>w||y+sy>h)errors.push('An object lies outside the map boundary.');
    for(let dy=0;dy<sy;dy++)for(let dx=0;dx<sx;dx++){
      const key=(y+dy)*w+x+dx;
      if(occupied.has(key)&&entry.name!=='OilResource')warnings.push('Some object footprints overlap; inspect retained layers or reduce density.');
      occupied.add(key);
    }
  }
  const perPlayer=starts.map((p,i)=>({player:i,trucks:snapshot.droids.filter(d=>d.startpos===i&&(d.construct||/Construction/.test(d.template||''))).length,
    structures:snapshot.structures.filter(s=>s.startpos===i).length,oil:actualOil.filter(q=>q.generatorOwner===i).length,
    baseSpace:Math.round(Math.PI*o.baseRadius**2)}));
  if(perPlayer.some(p=>!p.trucks))errors.push('Every player needs at least one starting truck.');
  if(new Set(perPlayer.map(p=>p.oil)).size>1)warnings.push('Players have unequal assigned oil counts.');
  if(new Set(perPlayer.map(p=>p.structures)).size>1)warnings.push('Players have unequal building counts.');
  if(o.symmetry!=='none'&&![2,4].includes(o.players))warnings.push('Terrain is mirrored, but this player count is not perfectly mirror-balanced.');
  if(!o.transitions)warnings.push('Texture transitions disabled: hard terrain edges are expected.');
  return {snapshot,starts,options:o,report:{errors:[...new Set(errors)],warnings:[...new Set(warnings)],connected,perPlayer,
    totalOil:actualOil.length,structures:snapshot.structures.length,droids:snapshot.droids.length,features:snapshot.features.length}};
}
