import {normalizeGeneratorOptions,getGeneratorStarts,getBaseEdgeLimit} from './mapGenerator.js';
import {getTileCount} from './tileset.js';

// Cheap geometric checks only: no terrain generation, objects or renderer work.
export function getGeneratorLimits(input,ranges) {
  const o=normalizeGeneratorOptions(input),limits={};
  for(const [key,[min,max]] of Object.entries(ranges))limits[key]={min,max};
  const fits=c=>{
    if(c.edge>Math.floor(Math.min(c.width,c.height)/3)||c.baseRadius>Math.floor(Math.min(c.width,c.height)/5))return false;
    const starts=getGeneratorStarts(c);
    for(let i=0;i<starts.length;i++)for(let j=0;j<i;j++)if(Math.hypot(starts[i].x-starts[j].x,starts[i].y-starts[j].y)<2*c.baseRadius+6)return false;
    return true;
  };
  const describe={width:'Map width',height:'Map height',players:'Player count',baseRadius:'Base radius',teams:'Total teams'};
  for(const key of ['width','height','players','baseRadius','teams']){
    if(!limits[key])continue;
    const [lo,hi]=ranges[key],allowed=[];
    for(let value=lo;value<=hi;value++){
      const candidate={...o,[key]:value};
      if(key==='players')candidate.teams=Math.min(candidate.teams,value);
      if(key==='teams'&&(o.layout!=='teams'||value>o.players))continue;
      if(fits(candidate))allowed.push(value);
    }
    if(allowed.length){
      limits[key]={min:allowed[0],max:allowed.at(-1),allowed,
        reason:describe[key]+' is limited by the current map size, players, teams, base edge distance and base radius. Allowed now: '+(allowed.length===allowed.at(-1)-allowed[0]+1?allowed[0]+'–'+allowed.at(-1):allowed.join(', '))+'. Adjust those settings to make more space.'};
    } else if(key==='teams'&&o.layout!=='teams') limits[key]={min:1,max:Math.min(5,o.players)};
    else limits[key].reason='These starting positions do not fit the current settings. Increase map size, reduce players or reduce the base radius.';
  }
  const edge=getBaseEdgeLimit(o);
  limits.edge={min:8,max:edge.max??8,minReason:'Minimum supported base edge distance is 8 tiles.',maxReason:edge.reason};
  limits.teams.max=Math.min(limits.teams.max,o.players);
  limits.minHeight.max=o.maxHeight;
  limits.minHeight.maxReason='Minimum height cannot exceed Maximum height ('+o.maxHeight+'). Raise Maximum height first.';
  limits.maxHeight.min=o.minHeight;
  limits.maxHeight.minReason='Maximum height cannot be below Minimum height ('+o.minHeight+'). Lower Minimum height first.';
  const count=getTileCount(o.tileset);
  limits.groundTile.max=count-1;
  limits.groundTile.maxReason='The selected tileset has '+count+' textures, with IDs 0–'+(count-1)+'.';
  limits.textureVariety.max=count;
  limits.textureVariety.maxReason='The selected tileset has '+count+' available textures. Only compatible ground types are used.';
  return limits;
}

export function getGeneratorDependencies(o) {
  const disabled={};
  if(o.layout!=='teams')disabled.teams='Choose Team groups as the starting layout to set Total teams.';
  if(!o.connected){disabled.routes='Enable Require land routes first.';if(!(o.waterStyle==='river'&&Number(o.water)>0))disabled.routeWidth='Enable Require land routes or add river crossings first.';disabled.roads='Enable Require land routes first.';}
  if(!o.connected||!o.roads)disabled.roadWidth='Enable Require land routes and Connect bases with roads first.';
  if(o.waterStyle!=='river'||!Number(o.water)){
    disabled.riverWidth='Set Water shape to River and Water amount above 0 first.';
    disabled.crossings='Set Water shape to River and Water amount above 0 first.';
  }
  if(!Number(o.tanks))disabled.tankWeapon='Add at least one starting tank first.';
  if(!Number(o.defenses))disabled.defenseType='Add at least one defense first.';
  if(!Number(o.scenery)){
    disabled.sceneryStyle='Set Scenery density above 0 first.';
    disabled.symmetricScenery='Set Scenery density above 0 first.';
  } else if(o.symmetry==='none')disabled.symmetricScenery='Choose a Terrain symmetry option first.';
  if(!o.scavengers){disabled.scavCamps='Enable Scavenger camps first.';disabled.scavUnits='Enable Scavenger camps first.';}
  return disabled;
}
