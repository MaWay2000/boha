import {prepareUnitModels} from './unitModels.js';
import {normalizeUnitTextures} from './unitTextures.js';
// Per-design component clones keep stock units and other custom designs independent.
export const UNIT_DESIGNS_PATH = 'mapmaker-unit-designs.json';
const LOADER_PATH = 'mapmaker-unit-loader.json';
const INIT = 'multiplay/script/mods/init.js';
const RUNTIME = 'multiplay/script/mods/mapmaker-units.js';
const LOADER = '\n/* MAPMAKER_UNITS_LOADER_BEGIN */\ninclude("' + RUNTIME + '");\n/* MAPMAKER_UNITS_LOADER_END */\n';
const clone = value => JSON.parse(JSON.stringify(value));
export function normalizeUnitDesigns(input, stats) {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Use at most 100 custom unit designs.');
  const ids = new Set();
  return input.map(d => {
    if (!d || !/^[a-zA-Z0-9_]{1,48}$/.test(d.id) || ids.has(d.id)) throw new Error('Invalid or duplicate unit design ID.');
    ids.add(d.id);
    const name = String(d.name || '').trim();
    if (!name || name.length > 80 || /[\x00-\x1f]/.test(name)) throw new Error('Give the unit a name (up to 80 characters).');
    const b=stats.body[d.body], p=stats.propulsion[d.propulsion], w=stats.weapons[d.weapon];
    const cyborg=b?.class==='Cyborgs';
    if(!b || !p || !w || !(b.designable&&b.class==='Droids'||cyborg) || !(cyborg?p.usageClass==='Cyborg':p.designable) || !(cyborg?w.usageClass===b.usageClass:w.designable)) throw new Error('Choose compatible body, propulsion and weapon components.');
    const air = ['Lift','Helicopter'].includes(stats.propulsion[d.propulsion].type);
    if (air !== (Number(stats.weapons[d.weapon].numAttackRuns || 0) > 0)) throw new Error(air ? 'Choose a VTOL weapon for flying propulsion.' : 'Choose a ground weapon for ground propulsion.');
    const result = {id:d.id,name,body:d.body,propulsion:d.propulsion,weapon:d.weapon};
    for (const [key,min,max] of [['health',1,1000000],['armourKinetic',0,1000000],['armourHeat',0,1000000],['damage',1,1000000],['speed',0.01,64]]) {
      const n = Number(d[key]);
      if (!Number.isFinite(n) || n < min || n > max || (key !== 'speed' && !Number.isInteger(n))) throw new Error('Invalid ' + key + '.');
      result[key] = n;
    }
    for(const key of ['bodyScale','legsScale','weaponScale']) {
      const value=Number(d[key]??1);
      if(!Number.isFinite(value)||value<0.1||value>10)throw new Error('Invalid '+key+' (use 0.1–10).');
      result[key]=value;
    }
    const textures=normalizeUnitTextures(d.textures);
    if(textures)result.textures=textures;
    return result;
  });
}
export function defaultUnitStats(body, propulsion, weapon, stats) {
  const b = stats.body[body], p = stats.propulsion[propulsion], w = stats.weapons[weapon];
  return {health:Math.floor(b.hitpoints * (100 + (p.hitpointPctOfBody || 0)) / 100) + (p.hitpoints || 0) + (w.hitpoints || 0),
    armourKinetic:b.armourKinetic || 0,armourHeat:b.armourHeat || 0,speed:p.speed / 128,damage:w.damage || 1};
}
export function compileUnitDesign(design, stats) {
  const d = normalizeUnitDesigns([design], stats)[0], prefix = 'MMU_' + d.id;
  const ids = {body:prefix + '_Body',propulsion:prefix + '_Prop',weapon:prefix + '_Weapon',template:prefix};
  const body = {...clone(stats.body[d.body]),id:ids.body,name:d.name + ' (' + d.id + ') body',hitpoints:d.health,armourKinetic:d.armourKinetic,armourHeat:d.armourHeat};
  const propulsion = {...clone(stats.propulsion[d.propulsion]),id:ids.propulsion,name:d.name + ' (' + d.id + ') propulsion',speed:Math.round(d.speed * 128),hitpointPctOfBody:0,hitpoints:0};
  const weapon = {...clone(stats.weapons[d.weapon]),id:ids.weapon,name:d.name + ' (' + d.id + ') weapon',damage:d.damage,hitpoints:0};
  // Reach the chosen speed cap on level ground, including heavier VTOL bodies.
  const weight = body.weight * (100 + (propulsion.weight || 0)) / 100 + (weapon.weight || 0);
  const multiplier = stats.propulsiontype[propulsion.type]?.multiplier || 40;
  body.powerOutput = Math.max(body.powerOutput || 0, Math.ceil(propulsion.speed * weight * 4 / multiplier));
  const models = body.propulsionExtraModels?.[d.propulsion];
  if (models) body.propulsionExtraModels[ids.propulsion] = clone(models);
  if(body.class==='Cyborgs')delete propulsion.model; // Cyborg legs are the native body PIE; the torso is the weapon mount.
  const template = {id:ids.template,name:d.name,body:ids.body,propulsion:ids.propulsion,weapons:[ids.weapon],type:body.droidType||'DROID'};
  return {design:d,ids,body,propulsion,weapon,template};
}
export async function readUnitDesigns(zip, stats) {
  const file = zip?.file(UNIT_DESIGNS_PATH);
  if (!file) return [];
  const data = JSON.parse(await file.async('string'));
  if (data.version !== 1) throw new Error('Unsupported unit editor data version.');
  return normalizeUnitDesigns(data.designs, stats);
}
export async function writeUnitDesigns(zip, designs, stats, loadModel) {
  const list = normalizeUnitDesigns(designs, stats);
  const previous = zip.file(UNIT_DESIGNS_PATH) ? JSON.parse(await zip.file(UNIT_DESIGNS_PATH).async('string')) : null;
  const compiled = list.map(d => compileUnitDesign(d, stats));
  const models=new Map();
  for(const c of compiled)for(const [path,text] of await prepareUnitModels(c,loadModel))models.set(path,text);
  for(const path of models.keys())if(zip.file(path)&&!previous?.ownedModels?.includes(path))throw new Error('A model already uses '+path+'.');
  const tables = [['body','body'],['propulsion','propulsion'],['weapons','weapon'],['templates','template']];
  const createdTables = [...(previous?.createdTables || [])];
  const tableWrites = [];
  for (const [file,field] of tables) {
    const path = 'stats/' + file + '.json', existing = zip.file(path);
    if (!compiled.length && !previous) continue;
    const table = existing ? JSON.parse(await existing.async('string')) : clone(stats[file]);
    if (!existing && !createdTables.includes(path)) createdTables.push(path);
    for (const id of previous?.owned?.[file] || []) { if (/^MMU_[a-zA-Z0-9_]+$/.test(id)) delete table[id]; }
    for (const c of compiled) {
      if (table[c[field].id]) throw new Error('A unit component already uses ' + c[field].id + '.');
      table[c[field].id] = c[field];
    }
    tableWrites.push({path,table,remove:!compiled.length && createdTables.includes(path) && JSON.stringify(table) === JSON.stringify(stats[file])});
  }
  for (const entry of tableWrites) { if (entry.remove) zip.remove(entry.path); else zip.file(entry.path,JSON.stringify(entry.table)); }
  for(const path of previous?.ownedModels||[])if(/^(?:components\/bodies\/mmu_[a-z0-9_]+\.pie|texpages\/page-mmu_[a-z0-9_]+\.png)$/.test(path))zip.remove(path);
  for(const [path,text] of models) {
    if(path.startsWith('texpages/'))zip.file(path,text.slice(22),{base64:true});
    else zip.file(path,text);
  }
  let init = zip.file(INIT) ? await zip.file(INIT).async('string') : '';
  init = init.replace(/\n?\/\* MAPMAKER_UNITS_LOADER_BEGIN \*\/[\s\S]*?\/\* MAPMAKER_UNITS_LOADER_END \*\/(?:\r?\n)?/g, '');
  zip.remove(LOADER_PATH); zip.remove(RUNTIME);
  if (compiled.length) {
    const templates = compiled.map(c => c.template);
    const runtime = 'namespace("mmunits_");\nvar mmunits_templates = ' + JSON.stringify(templates) + ';\nfunction mmunits_eventStartLevel() {\n  hackNetOff();\n  try {\n    for (var p = 0; p < maxPlayers; p++) mmunits_templates.forEach(function(t) {\n      [t.body,t.propulsion].concat(t.weapons).forEach(function(id) { makeComponentAvailable(id,p); });\n      makeTemplate(p,t.name,t.body,t.propulsion,"",t.weapons[0]);\n    });\n  } finally { hackNetOn(); }\n}\n';
    zip.file(RUNTIME, runtime);zip.file(INIT, init + LOADER);
    if (!init.trim()) zip.file(LOADER_PATH, JSON.stringify({version:1,path:INIT}));
    zip.file(UNIT_DESIGNS_PATH, JSON.stringify({version:1,designs:list,createdTables,ownedModels:[...models.keys()],owned:Object.fromEntries(tables.map(([file,field]) => [file,compiled.map(c=>c[field].id)]))}));
  } else {
    zip.remove(UNIT_DESIGNS_PATH);
    if (init.trim()) zip.file(INIT,init); else zip.remove(INIT);
  }
}
export async function unwrapUnitMapPack(zip, Zip) {
  const marker = zip.file('mapmaker-unit-pack.json');
  if (!marker) return zip;
  const value = JSON.parse(await marker.async('string'));
  if (value.version !== 1 || !/^maps\/[a-zA-Z0-9_-]+\.wz$/.test(value.mapPath) || !zip.file(value.mapPath)) throw new Error('Invalid custom-unit map pack.');
  return Zip.loadAsync(await zip.file(value.mapPath).async('uint8array'));
}
