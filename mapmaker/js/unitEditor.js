import {normalizeUnitDesigns,defaultUnitStats} from './unitDesigns.js';
import {UNIT_TEXTURE_PARTS,readUnitTexture,clearUnitTextureSources} from './unitTextures.js';
export function mountUnitEditor(panel, {loadStats,onSave,onUse,onDelete,createPreview,readTexture=readUnitTexture}) {
  if (!panel) return null;
  panel.innerHTML = `<div class="unit-editor"><h3>Unit editor</h3>
    <label>Saved design<select data-unit-list><option value="">New design</option></select></label>
    <label>Unit name<input data-unit-name maxlength="80" placeholder="My custom tank"></label>
    <label>Body<select data-unit-body></select></label>
    <label>Legs / propulsion<select data-unit-propulsion></select></label>
    <label>Weapon<select data-unit-weapon></select></label>
    <div class="unit-editor-textures">
      ${UNIT_TEXTURE_PARTS.map(part=>`<label>${part==='legs'?'Legs / propulsion':part[0].toUpperCase()+part.slice(1)} texture<input type="file" accept="image/png,image/jpeg,image/webp" data-unit-texture-${part}></label><small data-unit-texture-name-${part}>Original texture</small> <button type="button" class="action-btn" data-unit-texture-clear-${part}>Restore original</button>`).join('')}
      <p class="unit-editor-hint">PNG, JPG or WebP. Images follow the model’s existing texture layout; large images are resized to 2048 pixels.</p>
    </div>
    <div class="unit-editor-preview" data-unit-preview></div>
    <p class="unit-editor-preview-hint">Drag to rotate · Scroll to zoom</p>
    <div class="unit-editor-stats">
      <label>Body scale (×)<input data-unit-bodyScale type="number" min="0.1" max="10" step="0.1" value="1"></label>
      <label>Legs / propulsion scale (×)<input data-unit-legsScale type="number" min="0.1" max="10" step="0.1" value="1"></label>
      <label>Weapon scale (×)<input data-unit-weaponScale type="number" min="0.1" max="10" step="0.1" value="1"></label>
      <label>Health<input data-unit-health type="number" min="1" max="1000000" step="1"></label>
      <label>Damage per hit<input data-unit-damage type="number" min="1" max="1000000" step="1"></label>
      <label>Kinetic armour<input data-unit-armourKinetic type="number" min="0" max="1000000" step="1"></label>
      <label>Thermal armour<input data-unit-armourHeat type="number" min="0" max="1000000" step="1"></label>
      <label>Speed limit (tiles/sec)<input data-unit-speed type="number" min="0.01" max="64" step="0.01"></label>
    </div>
    <div class="unit-editor-actions"><button type="button" class="action-btn" data-unit-save>Save design</button><button type="button" class="action-btn" data-unit-use disabled>Use in Droids</button><button type="button" class="action-btn" data-unit-delete disabled>Delete design</button></div>
    <p class="unit-editor-hint">Each design has its own stats. Research upgrades, terrain and weapon modifiers still apply in game. Speed is the limit on level ground; damage is the base hit damage.</p>
    <p class="unit-editor-hint">Custom units are saved with the map in one mod file. Install it in mods/&lt;game-version&gt;/autoload.</p>
    <p data-unit-status role="status" aria-live="polite"></p></div>`;
  const q = key => panel.querySelector('[data-unit-' + key + ']');
  let stats = null, designs = [], selected = '', pending = null, busy = false, preview = null;
  let textures={},textureEpoch=0,uploads=0;
  const textureRequests={};
  const keys = ['health','damage','armourKinetic','armourHeat','speed'];
  const scaleKeys=['bodyScale','legsScale','weaponScale'];
  function options(control, values, current) {
    control.replaceChildren();
    for (const [value,text] of values) { const item=document.createElement('option');item.value=value;item.textContent=text;control.append(item); }
    control.value=values.some(v=>v[0]===current)?current:values[0]?.[0]||'';
  }
  function message(text,error=false) {q('status').textContent=text;q('status').classList.toggle('unit-editor-error',error);}
  function propulsionOptions(current) {
    const cyborg=stats.body[q('body').value]?.class==='Cyborgs';
    options(q('propulsion'),Object.values(stats.propulsion).filter(p=>cyborg?p.usageClass==='Cyborg':p.designable).map(p=>[p.id,p.id==='CyborgLegs'?'Cyborg legs':p.name||p.id]),current);
  }
  function weaponOptions(current) {
    const body=stats.body[q('body').value], cyborg=body?.class==='Cyborgs';
    const air = ['Lift','Helicopter'].includes(stats.propulsion[q('propulsion').value]?.type);
    options(q('weapon'),Object.values(stats.weapons).filter(w=>(cyborg?w.usageClass===body.usageClass:w.designable)&&Number(w.damage)>0&&(Number(w.numAttackRuns||0)>0)===air).map(w=>[w.id,w.name||w.id]),current);
  }
  function updatePreview() {
    if (stats) void preview?.setDesign({body:q('body').value,propulsion:q('propulsion').value,weapon:q('weapon').value,textures:{...textures},...Object.fromEntries(scaleKeys.map(k=>[k,Number(q(k).value)||1]))});
  }
  function textureLabels() {
    UNIT_TEXTURE_PARTS.forEach(part=>{
      const t=textures[part];q('texture-name-'+part).textContent=t?t.name+' · '+t.width+' × '+t.height:'Original texture';
      q('texture-clear-'+part).disabled=!t;
    });
  }
  function defaults() {
    const values=defaultUnitStats(q('body').value,q('propulsion').value,q('weapon').value,stats);
    keys.forEach(key=>q(key).value=key==='speed'?String(Math.round(values[key]*100)/100):String(values[key]));
    updatePreview();
  }
  function fill() {
    if (!stats) return;
    const d=designs.find(d=>d.id===selected);
    textureEpoch++;textures={...(d?.textures||{})};textureLabels();
    UNIT_TEXTURE_PARTS.forEach(part=>q('texture-'+part).value='');
    q('name').value=d?.name||'';q('body').value=d?.body||'Body1REC';propulsionOptions(d?.propulsion||'wheeled01');
    scaleKeys.forEach(k=>q(k).value=String(d?.[k]??1));
    weaponOptions(d?.weapon||'MG1Mk1');defaults();if(d)keys.forEach(key=>q(key).value=String(d[key]));
    q('use').disabled=!d||busy;q('delete').disabled=!d||busy;
  }
  function setDesigns(list) {
    designs=list.map(d=>({...d}));if(!designs.some(d=>d.id===selected))selected='';
    options(q('list'),[['','New design'],...designs.map(d=>[d.id,d.name])],selected);fill();
  }
  async function open() {
    if (!preview && createPreview) preview = createPreview(q('preview'));
    preview?.setVisible(true);
    if (!pending) pending=loadStats().then(data=>{stats=data;options(q('body'),Object.values(stats.body).filter(b=>b.designable&&b.class==='Droids'||b.class==='Cyborgs').map(b=>[b.id,b.name||b.id]),'Body1REC');options(q('propulsion'),Object.values(stats.propulsion).filter(p=>p.designable).map(p=>[p.id,p.name||p.id]),'wheeled01');fill();return data;}).catch(error=>{pending=null;message(error.message,true);throw error;});
    await pending; updatePreview(); return stats;
  }
  q('list').addEventListener('change',()=>{selected=q('list').value;fill();message('');});
  q('body').addEventListener('change',()=>{propulsionOptions(q('propulsion').value);weaponOptions(q('weapon').value);defaults();});
  scaleKeys.forEach(k=>q(k).addEventListener('input',updatePreview));
  UNIT_TEXTURE_PARTS.forEach(part=>{
    q('texture-'+part).addEventListener('change',async()=>{
      const input=q('texture-'+part),file=input.files?.[0];if(!file)return;
      const epoch=textureEpoch,request=(textureRequests[part]||0)+1;textureRequests[part]=request;
      uploads++;q('save').disabled=true;
      try {
        const texture=await readTexture(file);
        if(epoch!==textureEpoch||request!==textureRequests[part])return;
        textures={...textures,[part]:texture};textureLabels();updatePreview();message('Texture ready. Save design to keep it.');
      } catch(error){if(epoch===textureEpoch&&request===textureRequests[part])message(error.message,true);}
      finally {uploads--;q('save').disabled=busy||uploads>0;if(epoch===textureEpoch)input.value='';}
    });
    q('texture-clear-'+part).addEventListener('click',()=>{
      textureRequests[part]=(textureRequests[part]||0)+1;
      textures={...textures};delete textures[part];textureLabels();updatePreview();message('Original texture restored. Save design to keep it.');
    });
  });
  q('propulsion').addEventListener('change',()=>{weaponOptions(q('weapon').value);defaults();});
  q('weapon').addEventListener('change',defaults);
  async function action(callback) {
    if (busy||uploads) return;busy=true;q('save').disabled=true;q('use').disabled=true;q('delete').disabled=true;
    try {await open();await callback();} catch(error){message(error.message,true);} finally {busy=false;q('save').disabled=uploads>0;q('use').disabled=!selected;q('delete').disabled=!selected;}
  }
  q('save').addEventListener('click',()=>action(async()=>{
    const id=selected||'u'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)).replace(/-/g,'');
    const draft={id,name:q('name').value,body:q('body').value,propulsion:q('propulsion').value,weapon:q('weapon').value,textures};[...keys,...scaleKeys].forEach(k=>draft[k]=q(k).value);
    const d=normalizeUnitDesigns([draft],stats)[0];await onSave(d);selected=d.id;setDesigns([...designs.filter(x=>x.id!==d.id),d]);message('Design saved. Use in Droids to place it on the map.');
  }));
  q('use').addEventListener('click',()=>action(async()=>{if(selected)await onUse(selected);}));
  q('delete').addEventListener('click',()=>action(async()=>{if(!selected)return;await onDelete(selected);setDesigns(designs.filter(d=>d.id!==selected));selected='';fill();message('Design deleted.');}));
  panel.addEventListener('keydown',event=>event.stopPropagation());
  return {open,setDesigns,close:()=>{preview?.setVisible(false);clearUnitTextureSources('preview');}};
}
