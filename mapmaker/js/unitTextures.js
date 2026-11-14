export const UNIT_TEXTURE_PARTS=['body','legs','weapon'];
const sources=new Map();
export function normalizeUnitTextures(input) {
  if(input==null)return undefined;
  const result={};
  for(const part of UNIT_TEXTURE_PARTS) {
    const t=input[part];if(t==null)continue;
    if(typeof t.dataURL!=='string'||t.dataURL.length>12*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(t.dataURL))throw new Error('Invalid '+part+' texture. Upload a PNG, JPG or WebP image.');
    const bytes=atob(t.dataURL.slice(22));
    if(bytes.length<33||bytes.slice(0,8)!=='\x89PNG\r\n\x1a\n'||bytes.slice(12,16)!=='IHDR')throw new Error('Invalid PNG texture.');
    const number=offset=>((bytes.charCodeAt(offset)*0x1000000)+(bytes.charCodeAt(offset+1)<<16)+(bytes.charCodeAt(offset+2)<<8)+bytes.charCodeAt(offset+3));
    const width=number(16),height=number(20);
    if(width<1||height<1||width>2048||height>2048)throw new Error('Textures must be at most 2048 × 2048 pixels.');
    result[part]={name:String(t.name||'Texture').slice(0,120),dataURL:t.dataURL,width,height};
  }
  return Object.keys(result).length?result:undefined;
}
export async function readUnitTexture(file) {
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPG or WebP image.');
  if(file.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    const ratio=Math.min(1,2048/bitmap.width,2048/bitmap.height);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const context=canvas.getContext('2d');if(!context)throw new Error('Image conversion is unavailable.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return normalizeUnitTextures({body:{name:file.name,dataURL:canvas.toDataURL('image/png')}}).body;
  } finally {bitmap.close();}
}
export function registerUnitTextureSources(assets) {
  for(const [path,data] of assets)if(path.startsWith('texpages/')&&path.endsWith('.png'))sources.set(path.slice(9).toLowerCase(),data);
}
export function getUnitTextureSource(name) {return sources.get(name.toLowerCase());}
export function clearUnitTextureSources(id) {
  for(const part of UNIT_TEXTURE_PARTS)sources.delete('page-mmu_'+id.toLowerCase()+'_'+part+'.png');
}

export function texturePie(source, name, texture) {
  // Custom artwork uses the model's existing UV layout, without the stock team mask.
  return source.replace(/^(\s*TYPE\s+)([0-9a-f]+)/gim,(_,prefix,flags)=>prefix+(parseInt(flags,16)&~0x10000).toString(16))
    .replace(/^(\s*TEXTURE\s+\d+\s+)\S+(\s+\d+\s+\d+[^\r\n]*)/gm,(_,prefix,size)=>prefix+name+size)
    .replace(/^\s*(?:TCMASK|NORMALMAP|SPECULARMAP)\s+[^\r\n]*/gm,'');
}
