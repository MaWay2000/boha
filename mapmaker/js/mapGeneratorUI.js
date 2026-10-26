import {generatorDefaults,generateMap} from './mapGenerator.js';
import {createLiveMapGeneration} from './liveMapGeneration.js';
import {getTileCount} from './tileset.js';

// Every field is read by the pure generation engine; presets are editable starting points.
const groups=[
 ['Map',['width|Width (tiles)|number|48|255','height|Height (tiles)|number|48|255','players|Players|number|2|10','tileset|Tileset|select|0:Arizona,1:Urban,2:Rockies','seed|Seed|text','preset|Preset|select|arena:Open arena,ntw:NTW-style,hills:Hills,canyon:Canyon,islands:Islands,city:City']],
 ['Layout',['symmetry|Terrain symmetry|select|none:None,vertical:Vertical,horizontal:Horizontal,both:Both axes,rotation:180° rotation','layout|Starting layout|select|corners:Corners (4 players),circle:Circle,edges:Edges,opposite:Opposite edges,teams:Team groups','teams|Team groups (layout only)|number|1|5','edge|Base edge distance|number|8|64','baseRadius|Flat base radius|number|7|24','centreRadius|Central arena radius|number|0|30','routes|Routes per player|number|1|4','routeWidth|Route / ramp width|number|3|14','connected|Require land routes|checkbox']],
 ['Terrain',['terrain|Terrain shape|select|flat:Flat,hills:Rolling hills,mountains:Mountains,plateaus:Plateaus,canyon:Canyon','minHeight|Minimum height|number|0|255','maxHeight|Maximum height|number|0|255','frequency|Hill frequency|number|1|12','smoothness|Smoothing passes|number|0|8','cliffs|High cliffs|checkbox','border|Mountain border width|number|0|8']],
 ['Water and textures',['water|Water amount (%) target|number|0|60','waterStyle|Water shape|select|lakes:Lakes,river:River,coast:Coast,islands:Islands','riverWidth|River width|number|2|16','crossings|River crossings|number|1|6','roads|Connect bases with roads|checkbox','roadWidth|Road width|number|1|5','groundTile|Ground tile ID|number|0|77','textureVariety|Ground texture variety|number|1|'+getTileCount(generatorDefaults.tileset),'transitions|Blend terrain edges|checkbox']],
 ['Starting bases',['base|Starting base|select|trucks:Trucks only,small:Small base,advanced:Advanced base,custom:Custom building list','trucks|Trucks per player|number|1|8','baseBuildings|Custom building IDs (comma separated)|text','modules|Factory modules (other buildings max 1)|number|0|2','orientation|Building / unit facing|select|centre:Face centre,north:North','defenses|Defenses per player|number|0|12','defenseType|Defense building ID|text']],
 ['Starting units',['truckBody|Truck body ID|text','truckPropulsion|Truck propulsion ID|text','tanks|Tanks per player|number|0|12','tankWeapon|Tank weapon ID|text','support|Sensor units per player|number|0|4','cyborgs|Cyborgs per player|number|0|8']],
 ['Oil and resources',['baseOil|Base oil per player|number|0|16','oilDistance|Base oil distance|number|6|24','expansions|Expansion clusters per player|number|0|6','expansionOil|Oil per expansion cluster|number|1|8','neutralOil|Contested centre oil|number|0|40','oilSpacing|Minimum oil spacing|number|2|8','derricks|Prebuild owned oil derricks|checkbox','drums|Neutral oil drums|number|0|20','artifacts|Neutral artifacts|number|0|12']],
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
  const inputs=new Map(),values=new Map(),maxLabels=new Map();
  for(const [title,fields] of groups){
    const details=document.createElement('details');details.open=title==='Map';
    const summary=document.createElement('summary');summary.textContent=title;details.append(summary);
    for(const field of fields){const [key,label,type,min,max]=field.split('|');
      const wrapper=document.createElement('label');wrapper.className='generator-field';
      const text=document.createElement('span');text.textContent=label;
      const control=document.createElement(type==='select'?'select':'input');control.name=key;control.id='gen-'+key;
      if(type==='select')for(const choice of min.split(',')){const [value,name]=choice.split(':');const opt=document.createElement('option');opt.value=value;opt.textContent=name;control.append(opt);}
      else {control.type=type==='number'?'range':type;if(type==='number'){control.min=min;control.max=max;control.step='1';control.setAttribute('aria-label',label);}}
      if(type==='checkbox')control.checked=generatorDefaults[key];else control.value=generatorDefaults[key];
      if(type==='number'){
        wrapper.classList.add('generator-range-field');
        const value=document.createElement('output');value.htmlFor=control.id;value.textContent=control.value;values.set(key,value);
        const title=document.createElement('span');title.className='generator-range-title';title.title=label;title.append(text);
        const track=document.createElement('span');track.className='generator-range-track';
        const low=document.createElement('span');low.textContent=min;low.setAttribute('aria-hidden','true');
        const high=document.createElement('span');high.textContent=max;high.setAttribute('aria-hidden','true');
        maxLabels.set(key,high);
        track.append(low,control,high);wrapper.append(title,track,value);
      }else wrapper.append(text,control);
      details.append(wrapper);inputs.set(key,control);
    }form.append(details);
  }
  const report=document.createElement('div');report.className='generator-report';report.setAttribute('aria-live','polite');host.append(report);
  const syncValues=()=>{
    const variety=inputs.get('textureVariety'),max=getTileCount(inputs.get('tileset').value);
    variety.max=String(max);variety.value=String(Math.max(1,Math.min(max,Number(variety.value)||1)));
    maxLabels.get('textureVariety').textContent=String(max);
    for(const [key,value] of values)value.textContent=inputs.get(key).value;
  };
  const setOptions=o=>{for(const [key,input] of inputs)if(key in o){if(input.type==='checkbox')input.checked=!!o[key];else input.value=o[key];}syncValues();};
  const options=()=>Object.fromEntries([...inputs].map(([k,input])=>[k,input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value]));
  const signature=()=>JSON.stringify(options());
  let appliedOptions=options(),appliedSignature=signature(),submittedOptions=null,submittedSignature=null,updating=false;
  const actions=document.createElement('div');actions.className='generator-update-actions';actions.hidden=true;host.append(actions);
  const update=document.createElement('button');update.type='button';update.className='action-btn generator-update';update.id='generateUpdateMap';update.textContent='Update map';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='action-btn generator-cancel';cancel.textContent='×';cancel.setAttribute('aria-label','Cancel changes');cancel.title='Discard pending changes; keep current map';actions.append(update,cancel);
  const syncButton=()=>{actions.hidden=signature()===appliedSignature&&!updating;update.disabled=updating;cancel.disabled=updating;update.textContent=updating?'Updating map…':'Update map';};
  const status=message=>{report.textContent=message;report.classList.remove('generator-error');};
  const fail=e=>{report.textContent=e.message||String(e);report.classList.add('generator-error');};
  const live=createLiveMapGeneration({bridge,generate:generateEditorMap,automatic:false,onStatus:status,onError:fail,onUndo:()=>{},onResult:(result,applied)=>{
    if(applied){appliedSignature=submittedSignature;appliedOptions=submittedOptions;}
    const r=result.report;status(applied?`${r.structures} buildings · ${r.droids} units · ${r.totalOil} oil · updated on map`:`Map unchanged: ${r.errors[0]}`);
    if(applied&&r.warnings.length){const p=document.createElement('p');p.textContent=r.warnings[0];report.append(p);}
    if(r.errors.length||r.warnings.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${r.errors.length} errors · ${r.warnings.length} warnings`;details.append(summary);
      for(const [prefix,items] of [['Error',r.errors],['Warning',r.warnings]])for(const message of items){const p=document.createElement('p');p.textContent=`${prefix}: ${message}`;details.append(p);}report.append(details);}
    report.classList.toggle('generator-error',!!r.errors.length);
  }});
  const invalidate=()=>{
    syncValues();live.request(options());syncButton();
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
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);form.addEventListener('submit',e=>e.preventDefault());
  inputs.get('preset').addEventListener('change',()=>{
    const selected=inputs.get('preset').value;
    const presets={arena:{terrain:'flat',water:0,roads:false},ntw:{terrain:'flat',water:0,baseOil:12,base:'advanced'},
      hills:{terrain:'hills',water:8},canyon:{terrain:'canyon',water:0,cliffs:true},
      islands:{terrain:'hills',water:45,waterStyle:'islands',connected:false},city:{terrain:'flat',water:0,tileset:1,sceneryStyle:'city',scenery:4}};
    setOptions(presets[selected]||{});invalidate();
  });
  status('Change options to enable Update map.');
}
