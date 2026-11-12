import {generatorDefaults,generateMap,startingBuildingOptions,getStartingBuildingCounts,getBaseEdgeLimit} from './mapGenerator.js?v=20261101-scav-owner-1';
import {createLiveMapGeneration} from './liveMapGeneration.js';
import {getTileCount} from './tileset.js';
import {getGeneratorLimits,getGeneratorDependencies} from './generatorLimits.js';

const fieldHelp={
  "showCliffs":"Preview cliff tiles with a red tint and X markers. This only changes the editor display; it does not alter terrain or the saved map.",
  "width": "Map width in terrain tiles, from left to right. More tiles give players more space.",
  "height": "Map height in terrain tiles, from top to bottom.",
  "players": "Number of player starting positions to create. Each player receives the same requested starting buildings, units and base oil.",
  "tileset": "Visual terrain set: Arizona desert, Urban city terrain or snowy Rockies. Available ground textures follow this choice.",
  "preset": "A starting point for generator settings. Selecting a preset changes some options; you can adjust them before clicking Generate or Update map.",
  "layout": "Arrangement of player starts. Team groups puts teammates together; two groups use the top and bottom edges. Corners is intended for four players.",
  "teams": "Number of groups for starting positions. With 4 players and 2 teams, two players start at the top and two at the bottom. This only groups bases; choose alliances separately in Warzone before the game.",
  "edge": "Distance in tiles between starting positions and map edges. Larger values move bases farther into the map.",
  "baseRadius": "Radius in tiles of the flattened area around each starting position. Larger bases need more space between players.",
  "centreRadius": "Radius in tiles of the flattened central arena. Set to 0 to disable this central clearing.",
  "routes": "Requested connections from each base. Extra routes connect bases to other starting positions when land routes are enabled.",
  "routeWidth": "Width in tiles of the land corridors and ramps connecting bases. Wider routes leave more room for units to pass.",
  "connected": "Carve land routes from starting positions and check that every player can reach the others by land.",
  "symmetry": "Mirror the generated terrain vertically, horizontally, on both axes, or by a 180-degree rotation. Starting positions are controlled separately by Starting layout.",
  "terrain": "Overall terrain shape: flat land, rolling hills, mountains, stepped plateaus or a canyon.",
  "minHeight": "Lower height used to generate the terrain and flatten base areas. If it exceeds Maximum height, the two values are swapped.",
  "maxHeight": "Upper height used for terrain generation. Larger differences from Minimum height create stronger elevation changes.",
  "frequency": "Frequency of terrain waves. Higher values create more closely spaced hills and valleys.",
  "smoothness": "Number of smoothing passes over the height map. More passes soften abrupt changes in elevation.",
  "cliffs": "All units cant access highest terrain areas (vtols also cant land)",
  "border": "Width in tiles of the raised mountain border around the map. Set to 0 to disable it.",
  "water": "Approximate target amount of water. The final coverage depends on water shape, terrain and the land routes cleared for players.",
  "waterStyle": "Pattern used to place water: scattered lakes, a river, a coast or water surrounding islands.",
  "riverWidth": "Width in tiles of the generated river. Used when Water shape is River.",
  "crossings": "Requested crossings through the river so units can move between its sides.",
  "roads": "Draw road textures along base connections. Requires land routes and a road texture in the selected tileset.",
  "roadWidth": "Width in tiles of road textures along the connecting routes.",
  "groundTile": "Terrain texture ID used as the reference for ground generation. IDs and available textures depend on the tileset.",
  "textureVariety": "Number of compatible ground textures to choose from. More variety adds visual detail; incompatible terrain types are filtered out.",
  "transitions": "Use supported coast-transition textures to blend water edges. Results depend on the tileset transition profiles.",
  "base": "Starting-building preset for each player. Trucks only includes HQ. Small uses 33%, Medium 66%, and Full 100% of standard counts, rounded to whole buildings. Presets exclude satellite uplink and laser satellite buildings. Counts below remain editable.",
  "trucks": "Starting construction trucks for each player, from 1 to 15. The default is 2. Placement still needs enough room around the base.",
  "modules": "Starting upgrade modules: up to two for vehicle and VTOL factories, and at most one for research labs and power generators.",
  "orientation": "Initial facing of generated buildings and units: North or toward the map centre.",
  "defenses": "Number of extra defensive structures requested for each player. Choose their building ID below.",
  "defenseType": "Internal Warzone structure ID to use for the extra defenses, such as GuardTower1. It must exist in the structure catalog.",
  "truckBody": "Internal vehicle body ID for starting trucks. The selected body must exist in the component catalog.",
  "truckPropulsion": "Internal propulsion ID for starting trucks, such as wheeled01. It must exist in the component catalog.",
  "tanks": "Number of starting weapon vehicles requested for each player. Their weapon is selected by Tank weapon ID.",
  "tankWeapon": "Internal weapon ID for starting tanks, such as MG1Mk1. It must exist in the weapon catalog.",
  "support": "Number of starting sensor vehicles requested for each player. These use a sensor turret instead of a weapon.",
  "cyborgs": "Number of starting armed cyborgs requested for each player.",
  "baseOil": "Oil wells requested in the oil cluster near each player base, up to 40. Dense clusters may not fit; check placement warnings.",
  "oilDistance": "Distance in tiles from each base toward the map centre to its base oil cluster.",
  "expansions": "Number of additional oil clusters requested along each player’s route toward the centre.",
  "expansionOil": "Number of oil wells requested in each expansion cluster.",
  "neutralOil": "Number of contested oil wells requested around the map centre, shared between all players.",
  "oilSpacing": "Minimum spacing in tiles between generated oil wells. Larger spacing spreads clusters out and may reduce how many wells fit.",
  "derricks": "Place player-owned oil derricks on their generated oil wells, so those resources start with extractors already built.",
  "drums": "Number of neutral oil drums requested around the map. Collecting them provides a one-time power bonus in the game.",
  "artifacts": "Number of neutral collectible artifacts requested. Placement requires a supported artifact model in the catalog.",
  "scenery": "Amount of decorative scenery requested. Higher values place more objects; bases and routes are kept clear where possible.",
  "sceneryStyle": "Type of scenery to choose from: rocks, trees, ruins or city buildings. Available models depend on the catalog.",
  "symmetricScenery": "Mirror decorative scenery using the Terrain symmetry setting.",
  "scavengers": "Add scavenger camps and units, owned by the scavenger player. Camps too close to player bases can be skipped.",
  "scavCamps": "Number of scavenger camps requested when Scavenger camps is enabled.",
  "scavUnits": "Number of units requested at each scavenger camp.",
  "regenerate": "Choose which generated layers to replace: the whole map, terrain, bases and units, resources, or scenery. Other layers are retained.",
  "lockTerrain": "Keep the current terrain instead of regenerating it. Retained layers require matching map dimensions and tileset.",
  "lockBases": "Keep existing player buildings and units instead of replacing them.",
  "lockResources": "Keep existing resource objects instead of replacing them.",
  "lockScenery": "Keep existing decorative scenery instead of replacing it."
};
for(const [key,label] of startingBuildingOptions) fieldHelp[key]='Number of '+label.toLowerCase()+' requested for each player. Set to 0 to omit this building. This controls initial placement, not how many can be built during the game. If there is not enough room, the generator reports a warning.';
const sectionHelp={
  "Map settings": "Choose map dimensions, player count, tileset and a preset. Settings are applied only when you click Generate or Update map.",
  "Layout": "Arrange player starts, group them into teams, and control the space and routes between bases.",
  "Terrain": "Control terrain symmetry, height, hills, smoothing and the mountain border.",
  "Water and textures": "Choose water patterns, roads, ground textures and coastline blending.",
  "Starting bases": "Adjust the starting buildings and construction trucks for each player. These are placement counts, not game build limits.",
  "Starting units / structures": "Configure starting defenses, additional tanks, sensor vehicles and cyborgs, plus truck components.",
  "Oil and resources": "Control base oil, expansion clusters, contested resources and collectible objects.",
  "Scenery and scavengers": "Add decorative objects and optional scavenger camps.",
  "Keep / regenerate": "Choose which parts of the current map to replace and which layers to preserve."
};

// Every field is read by the pure generation engine; presets are editable starting points.
const groups=[
 ['Map settings',['width|Width (tiles)|number|48|255','height|Height (tiles)|number|48|255','players|Players|number|2|10','preset|Preset|select|arena:Open arena,ntw:NTW-style,hills:Hills,canyon:Canyon,islands:Islands,city:City']],
 ['Starting bases',['trucks|Trucks|number|1|15',...startingBuildingOptions.map(([key,label,,max])=>`${key}|${label}|number|0|${max}`),'modules|Factory modules (other buildings max 1)|number|0|2','orientation|Building / unit facing|select|centre:Face centre,north:North']],
 ['Starting units / structures',['defenses|Defenses|number|0|12','defenseType|Defense building ID|text','truckBody|Truck body ID|text','truckPropulsion|Truck propulsion ID|text','tanks|Tanks|number|0|12','tankWeapon|Tank weapon ID|text','support|Sensor units|number|0|4','cyborgs|Cyborgs|number|0|8']],
 ['Layout',['layout|Starting layout|select|corners:Corners (4 players),circle:Circle,edges:Edges,opposite:Opposite edges,teams:Team groups','teams|Total teams|number|1|5','edge|Base edge distance|number|8|64','baseRadius|Flat base radius|number|7|24','centreRadius|Central arena radius|number|0|30','routes|Routes|number|1|4','routeWidth|Route / ramp width|number|3|14','connected|Require land routes|checkbox']],
 ['Terrain',['tileset|Tileset|select|0:Arizona,1:Urban,2:Rockies','symmetry|Terrain symmetry|select|none:None,vertical:Vertical,horizontal:Horizontal,both:Both axes,rotation:180° rotation','terrain|Terrain shape|select|flat:Flat,hills:Rolling hills,mountains:Mountains,plateaus:Plateaus,canyon:Canyon','minHeight|Minimum height|number|0|255','maxHeight|Maximum height|number|0|255','frequency|Hill frequency|number|1|12','smoothness|Smoothing passes|number|0|8','cliffs|High cliffs|checkbox','showCliffs|Show on map|checkbox','border|Mountain border width|number|0|8']],
 ['Water and textures',['water|Water amount (%) target|number|0|60','waterStyle|Water shape|select|lakes:Lakes,river:River,coast:Coast,islands:Islands','riverWidth|River width|number|2|16','crossings|River crossings|number|1|6','roads|Connect bases with roads|checkbox','roadWidth|Road width|number|1|5','groundTile|Ground tile ID|number|0|77','textureVariety|Ground texture variety|number|1|'+getTileCount(generatorDefaults.tileset),'transitions|Blend terrain edges|checkbox']],
 ['Oil and resources',['baseOil|Base oil|number|0|40','oilDistance|Base oil distance|number|6|24','expansions|Expansion clusters|number|0|6','expansionOil|Oil per expansion cluster|number|1|8','neutralOil|Contested centre oil|number|0|40','oilSpacing|Minimum oil spacing|number|2|8','derricks|Prebuild owned oil derricks|checkbox','drums|Neutral oil drums|number|0|20','artifacts|Neutral artifacts|number|0|12']],
 ['Scenery and scavengers',['scenery|Scenery density|number|0|5','sceneryStyle|Scenery|select|rocks:Rocks,trees:Trees,ruins:Ruins / wrecks,city:City buildings','symmetricScenery|Mirror scenery|checkbox','scavengers|Scavenger camps|checkbox','scavCamps|Camp count|number|1|6','scavUnits|Units per camp|number|0|10']],
 ['Keep / regenerate',['regenerate|Regenerate|select|all:Whole map,terrain:Terrain only,bases:Bases and units only,resources:Resources only,scenery:Scenery only','lockTerrain|Lock terrain|checkbox','lockBases|Lock bases and units|checkbox','lockResources|Lock resources|checkbox','lockScenery|Lock scenery|checkbox']]
];
export function generateEditorMap(settings,catalog,current){
  const result=generateMap({...settings,name:current?.name||generatorDefaults.name},catalog,current);
  const generated=result.snapshot.mapInfo;
  // Descriptive metadata belongs to the existing Settings editor. Only fields
  // describing the generated content must follow the new player/scavenger count.
  result.snapshot.mapInfo={...generated,...current?.mapInfo,slots:generated.slots,scavengers:generated.scavengers};
  return result;
}
export function mountMapGenerator(host,bridge) {
  if(!host)return;
  host.replaceChildren();
  const box=document.createElement('div');box.className='panel-box generator-box';host.append(box);
  const heading=document.createElement('div');heading.className='show-hide-title';heading.textContent='Generate map';box.append(heading);
  const form=document.createElement('form');form.className='generator-form';box.append(form);
  const inputs=new Map(),values=new Map(),maxLabels=new Map(),minLabels=new Map(),supportedRanges=new Map(),fieldLabels=new Map(),sectionLabels=new Map();
  for(const [title,fields] of groups){
    const details=document.createElement('details');details.open=title==='Map settings';
    const summary=document.createElement('summary');summary.textContent=title;sectionLabels.set(title,summary);details.append(summary);
    let cliffRow=null;
    for(const field of fields){const [key,label,type,min,max]=field.split('|');
      const wrapper=document.createElement(['cliffs','showCliffs'].includes(key)?'div':'label');wrapper.className='generator-field';
      const text=document.createElement('span');text.textContent=label;fieldLabels.set(key,text);
      const control=document.createElement(type==='select'?'select':['cliffs','showCliffs'].includes(key)?'button':'input');control.name=key;control.id='gen-'+key;
      if(type==='select')for(const choice of min.split(',')){const [value,name]=choice.split(':');const opt=document.createElement('option');opt.value=value;opt.textContent=name;control.append(opt);}
      else {control.type=['cliffs','showCliffs'].includes(key)?'button':type==='number'?'range':type;if(type==='number'){control.min=min;control.max=max;control.step='1';supportedRanges.set(key,[Number(min),Number(max)]);control.setAttribute('aria-label',label);}}
      if(type==='checkbox')control.checked=generatorDefaults[key]??false;else control.value=generatorDefaults[key];
      if(type==='number'){
        wrapper.classList.add('generator-range-field');
        const value=document.createElement('output');value.htmlFor=control.id;value.textContent=control.value;values.set(key,value);
        const title=document.createElement('span');title.className='generator-range-title';title.title='';title.append(text);
        const track=document.createElement('span');track.className='generator-range-track';
        const low=document.createElement('span');low.textContent=min;low.setAttribute('aria-hidden','true');
        const high=document.createElement('span');high.textContent=max;high.setAttribute('aria-hidden','true');
        maxLabels.set(key,high);minLabels.set(key,low);
        track.append(low,control,high);wrapper.append(title,track,value);
      }else if(key==='showCliffs'){control.className='generator-preview-toggle';control.setAttribute('aria-pressed','false');control.append(text);wrapper.append(control);}
      else if(key==='cliffs'){control.className='generator-on-off';control.setAttribute('role','switch');control.setAttribute('aria-label',label);wrapper.append(text,control);}
      else wrapper.append(text,control);
      if(key==='cliffs'){cliffRow=document.createElement('div');cliffRow.className='generator-cliff-row';details.append(cliffRow);cliffRow.append(wrapper);}
      else if(key==='showCliffs')cliffRow.append(wrapper);
      else details.append(wrapper);
      inputs.set(key,control);
    }form.append(details);
  }
  const fieldPopups=new Map();
  let controlLimits={},dependencyReasons={},pendingKey=null;
  const attachHelp=(label,message,id,keyboardLabel=true)=>{
    if(!message)throw new Error('Missing generator help: '+id);
    label.classList.add('generator-help-label');if(keyboardLabel)label.tabIndex=0;
    label.setAttribute('aria-describedby',id);
    const popup=document.createElement('div');popup.id=id;popup.className='generator-tooltip';popup.hidden=true;popup.setAttribute('role','tooltip');popup.textContent=message;host.append(popup);
    const messageText=message;
    const helpKey=id.startsWith('generator-help-section-')?null:id.slice(15);
    const hide=()=>{popup.hidden=true;};
    const show=(override,besideControl=false)=>{
      popup.textContent=typeof override==='string'?override:((dependencyReasons[helpKey]||'')+' '+messageText).trim();
      const anchor=besideControl?(label.closest?.('.generator-field')||inputs.get(helpKey)||label):label;
      const rect=(anchor.getBoundingClientRect?anchor:label).getBoundingClientRect();
      popup.hidden=false;
      const width=popup.offsetWidth||330,gap=12;
      let left=besideControl?(rect.right??rect.left)+gap:Math.max(8,Math.min(rect.left,window.innerWidth-width-8));
      let top=besideControl?(rect.top??rect.bottom):rect.bottom+10;
      if(besideControl&&left+width>window.innerWidth-8){
        if(rect.left-width-gap>=8)left=rect.left-width-gap;
        else{left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8));top=rect.bottom+10;}
      }
      popup.style.left=left+'px';
      popup.style.top=Math.max(8,Math.min(top,window.innerHeight-popup.offsetHeight-8))+'px';
    };
    const showLabel=()=>show(undefined,helpKey==='showCliffs');
    const showControl=override=>show(override,true);
    label.addEventListener('mouseenter',showLabel);label.addEventListener('mouseleave',hide);
    label.addEventListener('focus',showLabel);label.addEventListener('blur',hide);
    label.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
    host.addEventListener('scroll',hide,true);
    return {show,showControl,hide};
  };
  for(const [key,label] of fieldLabels){
    const help=attachHelp(label,fieldHelp[key],'generator-help-'+key,key!=='showCliffs');
    fieldPopups.set(key,help);
    inputs.get(key).setAttribute('aria-describedby','generator-help-'+key);
    inputs.get(key).addEventListener('mouseenter',()=>help.showControl());
    inputs.get(key).addEventListener('mouseleave',help.hide);
    inputs.get(key).addEventListener('keydown',event=>{if(event.key==='Escape')help.hide();});
    inputs.get(key).addEventListener('focus',()=>{
      const input=inputs.get(key),limit=controlLimits[key],value=Number(input.value);
      if(input.type==='range'&&limit&&(value<=limit.min||value>=limit.max))help.showControl(rangeMessage(key,value<=limit.min));
      else help.showControl();
    });inputs.get(key).addEventListener('blur',help.hide);
  }
  for(const [title,label] of sectionLabels)attachHelp(label,sectionHelp[title],'generator-help-section-'+title.toLowerCase().replace(/[^a-z]+/g,'-'),false);
  const report=document.createElement('div');report.className='generator-report';report.setAttribute('aria-live','polite');host.append(report);
  const readOptions=()=>Object.fromEntries([...inputs].filter(([key])=>key!=='showCliffs').map(([key,input])=>[key,(key==='cliffs'||input.type==='checkbox')?input.checked:input.type==='range'?Number(input.value):input.value]));
  const rangeMessage=(key,lower=false)=>{
    const limit=controlLimits[key],label=fieldLabels.get(key).textContent;
    return (lower?limit?.minReason:limit?.maxReason)||limit?.reason||(label+': '+(lower?'Minimum':'Maximum')+' supported value is '+(lower?limit.min:limit.max)+'.'+(/Count$|^(trucks|tanks|support|cyborgs|baseOil|expansions|expansionOil|neutralOil|drums|artifacts|defenses)$/.test(key)?' Actual placement also depends on available space; check generation warnings.':''));
  };
  const syncValues=(changedKey=null)=>{
    let blocked=null;
    // Existing bounds stop a single edit from silently changing other settings.
    if(changedKey&&controlLimits[changedKey]&&inputs.get(changedKey).type==='range'){
      const input=inputs.get(changedKey),limit=controlLimits[changedKey],requested=Number(input.value);
      let value=Math.max(limit.min,Math.min(limit.max,requested));
      if(limit.allowed&&!limit.allowed.includes(value))value=limit.allowed.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,limit.allowed[0]);
      if(value!==requested){blocked={key:changedKey,lower:requested<limit.min};input.value=String(value);}
    }
    for(let pass=0;pass<6;pass++){
      const raw=readOptions();
      controlLimits=getGeneratorLimits(raw,Object.fromEntries(supportedRanges));
      dependencyReasons=getGeneratorDependencies(raw);
      let adjusted=false;
      for(const key of ['players','teams','edge','baseRadius','width','height',...supportedRanges.keys()]){
        const input=inputs.get(key),limit=controlLimits[key];if(!limit)continue;
        const requested=Number(input.value);
        let value=Math.max(limit.min,Math.min(limit.max,requested));
        if(limit.allowed&&!limit.allowed.includes(value))value=limit.allowed.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,limit.allowed[0]);
        input.min=String(limit.min);input.max=String(limit.max);input.value=String(value);
        input.setAttribute('aria-valuemin',input.min);input.setAttribute('aria-valuemax',input.max);
        minLabels.get(key).textContent=input.min;maxLabels.get(key).textContent=input.max;
        if(requested!==value){adjusted=true;if(['players','teams','edge','baseRadius','width','height'].includes(key))break;}
      }
      for(const [key,input] of inputs)input.disabled=!!dependencyReasons[key];
      if(!adjusted)break;
    }
    const cliffs=inputs.get('cliffs');cliffs.textContent=cliffs.checked?'ON':'OFF';cliffs.setAttribute('aria-checked',String(cliffs.checked));
    for(const [key,value] of values)value.textContent=inputs.get(key).value;
    if(blocked)fieldPopups.get(blocked.key).showControl(rangeMessage(blocked.key,blocked.lower));
  };
  for(const [key,input] of inputs){
    if(input.type!=='range')continue;
    const atLower=()=>Number(input.value)<=Number(input.min),atUpper=()=>Number(input.value)>=Number(input.max);
    const explain=lower=>fieldPopups.get(key).showControl(rangeMessage(key,lower));
    input.addEventListener('input',()=>{pendingKey=key;if(atUpper())explain(false);else if(atLower())explain(true);else fieldPopups.get(key).hide();});
    input.addEventListener('pointerdown',()=>{if(atUpper())explain(false);else if(atLower())explain(true);});
    input.addEventListener('keydown',event=>{
      const up=['ArrowRight','ArrowUp','PageUp','End'].includes(event.key),down=['ArrowLeft','ArrowDown','PageDown','Home'].includes(event.key);
      if((up&&atUpper())||(down&&atLower())){event.preventDefault();explain(down);return;}
      const allowed=controlLimits[key]?.allowed,current=Number(input.value);
      if(allowed&&(up||down)&&!['Home','End'].includes(event.key)){
        const next=up?allowed.find(n=>n>current):allowed.slice().reverse().find(n=>n<current);
        if(next!==undefined&&Math.abs(next-current)>1){event.preventDefault();input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));}
      }
    });
    input.addEventListener('wheel',event=>{if((event.deltaY<0&&atUpper())||(event.deltaY>0&&atLower())){event.preventDefault();explain(event.deltaY>0);}},{passive:false});
  }
  syncValues();
  const setOptions=o=>{for(const [key,input] of inputs)if(key in o){if(key==='cliffs'||input.type==='checkbox')input.checked=!!o[key];else input.value=o[key];}syncValues();};
  const options=readOptions;
  const signature=()=>JSON.stringify(options());
  let appliedOptions=options(),appliedSignature=signature(),submittedOptions=null,submittedSignature=null,updating=false,hasGenerated=false;
  const actions=document.createElement('div');actions.className='generator-update-actions';actions.hidden=false;host.append(actions);
  const update=document.createElement('button');update.type='button';update.className='action-btn generator-update';update.id='generateUpdateMap';update.textContent='Generate map';
  const cancel=document.createElement('button');cancel.hidden=true;cancel.type='button';cancel.className='action-btn generator-cancel';cancel.textContent='×';cancel.setAttribute('aria-label','Cancel changes');cancel.title='Discard pending changes; keep current map';actions.append(update,cancel);
  const syncButton=()=>{actions.hidden=hasGenerated&&signature()===appliedSignature&&!updating;update.disabled=updating;cancel.disabled=updating;cancel.hidden=signature()===appliedSignature;update.textContent=updating?(hasGenerated?'Updating map…':'Generating map…'):(hasGenerated?'Update map':'Generate map');};
  const markErrorFields=errors=>{
    const keys=new Set();
    const rules=[
      [/bases are too close/,['width','height','players','baseRadius']],
      [/current map dimensions and tileset|outside the map boundary/,['width','height','tileset']],
      [/Unknown truck body/,['truckBody']],
      [/Unknown truck propulsion/,['truckPropulsion']],
      [/Unknown tank weapon/,['tankWeapon']],
      [/traversable land route/,['minHeight','maxHeight','water','routeWidth']],
      [/at least one starting truck/,['trucks','baseRadius']],
      [/Building .* unavailable in catalog/,['base','defenseType']]
    ];
    for(const message of errors)for(const [pattern,fields] of rules)if(pattern.test(message))for(const key of fields)keys.add(key);
    for(const [key,label] of fieldLabels){label.classList.toggle('generator-field-error',keys.has(key));inputs.get(key).setAttribute('aria-invalid',String(keys.has(key)));}
  };
  const status=message=>{report.textContent=message;report.classList.remove('generator-error');markErrorFields([]);};
  const fail=e=>{report.textContent=e.message||String(e);report.classList.add('generator-error');};
  const live=createLiveMapGeneration({bridge,generate:generateEditorMap,automatic:false,onStatus:status,onError:fail,onUndo:()=>{},onResult:(result,applied)=>{
    if(applied){hasGenerated=true;appliedSignature=submittedSignature;appliedOptions=submittedOptions;}
    const r=result.report;status(applied?`${r.structures} buildings · ${r.droids} units · ${r.totalOil} oil · updated on map`:`Map unchanged: ${r.errors[0]}`);
    if(applied&&r.warnings.length){const p=document.createElement('p');p.textContent=r.warnings[0];report.append(p);}
    if(r.errors.length||r.warnings.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${r.errors.length} errors · ${r.warnings.length} warnings`;details.append(summary);
      for(const [prefix,items] of [['Error',r.errors],['Warning',r.warnings]])for(const message of items){const p=document.createElement('p');p.textContent=`${prefix}: ${message}`;details.append(p);}report.append(details);}
    report.classList.toggle('generator-error',!!r.errors.length);markErrorFields(r.errors);
  }});
  const invalidate=()=>{
    const key=pendingKey;pendingKey=null;syncValues(key);live.request(options());syncButton();
    if(signature()===appliedSignature&&!updating)status('No unapplied changes.');
  };
  update.addEventListener('click',async()=>{
    if(updating)return;
    submittedOptions=options();submittedSignature=signature();updating=true;syncButton();
    live.request(options());status('Updating map…');
    try{await live.flush();}catch(error){fail(error);}finally{updating=false;syncButton();}
  });
  cancel.addEventListener('click',()=>{
    if(updating)return;
    live.cancel();setOptions(appliedOptions);syncButton();status('Changes cancelled. Current map unchanged.');
  });

  inputs.get('cliffs').addEventListener('click',()=>{const cliffs=inputs.get('cliffs');cliffs.checked=!cliffs.checked;invalidate();});
  const showCliffs=inputs.get('showCliffs');
  let showCliffsEnabled=false;
  showCliffs.addEventListener('click',()=>{showCliffsEnabled=!showCliffsEnabled;showCliffs.setAttribute('aria-pressed',String(showCliffsEnabled));bridge.showCliffs?.(showCliffsEnabled);});
  const onSettingChange=event=>{if(event.target!==showCliffs)invalidate();};
  form.addEventListener('input',onSettingChange);form.addEventListener('change',onSettingChange);form.addEventListener('submit',e=>e.preventDefault());
  inputs.get('preset').addEventListener('change',()=>{
    const selected=inputs.get('preset').value;
    const presets={arena:{terrain:'flat',water:0,roads:false},ntw:{terrain:'flat',water:0,baseOil:12,base:'full'},
      hills:{terrain:'hills',water:8},canyon:{terrain:'canyon',water:0,cliffs:true},
      islands:{terrain:'hills',water:45,waterStyle:'islands',connected:false},city:{terrain:'flat',water:0,tileset:1,sceneryStyle:'city',scenery:4}};
    const settings=presets[selected]||{};
    setOptions({...settings,...(settings.base?getStartingBuildingCounts(settings.base):{})});invalidate();
  });
  status('Click Generate map to use these settings.');
}
