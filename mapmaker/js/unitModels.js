import {texturePie} from './unitTextures.js';
// Keep PIE levels, UVs and animation timing intact; resize only spatial data.
export function scalePie(source, scale) {
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 10) throw new Error('Model scale must be between 0.1 and 10.');
  let rows=0, animation=false, integer=false;
  return source.split(/\r?\n/).map(line=>{
    if (rows) {
      if (!line.trim() || line.trim().startsWith('//')) return line;
      rows--;
      const fields=line.trim().split(/\s+/), start=animation?1:0;
      for(let j=start;j<start+3;j++) {
        const n=Number(fields[j])*scale;
        if(!Number.isFinite(n)) throw new Error('Invalid PIE coordinates.');
        fields[j]=String(animation||integer?Math.round(n):Number(n.toFixed(6)));
      }
      return '\t'+fields.join(' ');
    }
    const points=line.match(/^\s*(?:POINTS|CONNECTORS|SHADOWPOINTS)\s+(\d+)/);
    const anim=line.match(/^\s*ANIMOBJECT\s+\d+\s+\d+\s+(\d+)/);
    if(points){rows=Number(points[1]);animation=false;integer=/CONNECTORS/.test(line);}
    if(anim){rows=Number(anim[1]);animation=true;}
    return line;
  }).join('\n');
}

export async function loadUnitPie(path) {
  const base=typeof window!=='undefined'&&window.PIES_BASE?window.PIES_BASE:'pies/';
  for(const candidate of [...new Set([path,path.split('/').pop()])]) {
    const response=await fetch(base+candidate.toLowerCase());
    if(response.ok) return response.text();
  }
  throw new Error('Could not load model '+path);
}

export async function prepareUnitModels(compiled, load=loadUnitPie) {
  const {design:d,body,propulsion,weapon,ids}=compiled, assets=new Map(), pending=new Map();
  let sequence=0;
  async function model(value, folder, scale, part) {
    const texture=d.textures?.[part];
    if(!value || scale===1&&!texture) return value;
    const source=value.includes('/')?value:folder+value;
    const key=source.toLowerCase()+'|'+scale+'|'+part;
    if(pending.has(key)) return pending.get(key);
    // Basenames must be unique: the engine also resolves EVENT models by name.
    const name=ids.template.toLowerCase()+'_'+(++sequence)+'.pie';
    const target='components/bodies/'+name;
    pending.set(key,name);
    let text=scalePie(await load(source),scale);
    if(texture) {
      const textureName='page-'+ids.template.toLowerCase()+'_'+part+'.png';
      assets.set('texpages/'+textureName,texture.dataURL);
      text=texturePie(text,textureName,texture);
    }
    const events=[...text.matchAll(/^\s*EVENT\s+(\d+)\s+(\S+)/gm)];
    for(const event of events) {
      const child=await model(event[2],source.slice(0,source.lastIndexOf('/')+1),scale,part);
      text=text.replace(event[0],'EVENT '+event[1]+' '+child.split('/').pop());
    }
    assets.set(target,text);
    return name;
  }
  const cyborg=body.class==='Cyborgs';
  body.model=await model(body.model,'components/bodies/',cyborg?d.legsScale:d.bodyScale,cyborg?'legs':'body');
  if(cyborg)delete propulsion.model;
  else propulsion.model=await model(propulsion.model,'components/prop/',d.legsScale,'legs');
  const extra=body.propulsionExtraModels?.[ids.propulsion];
  if(extra) {
    // Stock stats imply the right model from the left name; make it explicit before renaming.
    if((d.legsScale!==1||d.textures?.legs)&&extra.left&&!extra.right) {
      const right=extra.left.replace(/^pr([lmh])(whl|trk|htr|vtl)/i,'pr$1r$2');
      if(right!==extra.left)extra.right=right;
    }
    for(const key of ['left','right','still','moving'])if(extra[key])extra[key]=await model(extra[key],'components/prop/',d.legsScale,'legs');
  }
  weapon.mountModel=await model(weapon.mountModel,'components/weapons/',cyborg?d.bodyScale:d.weaponScale,cyborg?'body':'weapon');
  weapon.model=await model(weapon.model,'components/weapons/',d.weaponScale,'weapon');
  return assets;
}
