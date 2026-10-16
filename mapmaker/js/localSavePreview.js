// Save-list thumbnails are independent of the editor scene: no models or assets.
const colors=['#c9a96a','#9a7c42','#7a4e37','#4d7a47','#8e4b38','#9a6a8f','#9a9b94','#246e96','#6b5a4f','#73553b','#d8e7f0','#91a5a8'];
const players=['#ff6666','#69aaff','#73dc75','#ffe16b','#c599ff','#ffad68','#73e4e2','#ff8bca','#e6e6e6','#a8ba70','#adadad'];
const rgb=hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));
export function buildLocalSavePreview(snapshot){
  const width=Number(snapshot?.mapW),height=Number(snapshot?.mapH);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>512||height>512||!Array.isArray(snapshot?.mapTiles)||!Array.isArray(snapshot?.mapHeights))return null;
  const pixels=new Uint8ClampedArray(width*height*4);
  const palette=colors.map(rgb),land=[palette[0],[116,128,128],[176,189,190]][snapshot.tilesetIndex]||palette[0];
  let min=Infinity,max=-Infinity;
  for(const row of snapshot.mapHeights)for(const v of row||[]){if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}
  const span=Math.max(1,max-min);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const tile=Number(snapshot.mapTiles[y]?.[x])||0,type=Number(snapshot.tileTypesById?.[tile])||0;
    const base=type===0?land:(palette[type]||land),z=Number(snapshot.mapHeights[y]?.[x])||0;
    const left=Number(snapshot.mapHeights[y]?.[Math.max(0,x-1)])||z,up=Number(snapshot.mapHeights[Math.max(0,y-1)]?.[x])||z;
    const relief=Math.max(-.24,Math.min(.24,(left+up-2*z)/100));
    const shade=.78+.30*(z-(Number.isFinite(min)?min:0))/span+relief+((tile%7)-3)*.012;
    const i=(y*width+x)*4;
    for(let c=0;c<3;c++)pixels[i+c]=Math.max(0,Math.min(255,Math.round(base[c]*shade)));
    pixels[i+3]=255;
  }
  const markers=[];
  const add=(entry,color,radius)=>{
    const pos=entry?.position,x=Number(Array.isArray(pos)?pos[0]:pos?.x)/128,y=Number(Array.isArray(pos)?pos[1]:pos?.y)/128;
    if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<width&&y<height)markers.push({x,y,color,radius});
  };
  for(const entry of snapshot.features||[])if(/oilresource/i.test(entry.name||''))add(entry,'#ffd447',1.2);
  for(const entry of [...(snapshot.structures||[]),...(snapshot.droids||[])]){
    const owner=Number(entry.startpos??entry.player??-1);
    add(entry,Number.isInteger(owner)&&owner>=0?players[owner%players.length]:'#c5cbd1',1.6);
  }
  return {width,height,pixels,markers,tileset:['Arizona','Urban','Rockies'][snapshot.tilesetIndex]||'Terrain'};
}
export function drawLocalSavePreview(canvas,caption,snapshot){
  if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#101923';ctx.fillRect(0,0,canvas.width,canvas.height);
  const preview=buildLocalSavePreview(snapshot);
  if(!preview){if(caption)caption.textContent=snapshot?'Preview unavailable for this save.':'Select a local save to preview.';canvas.setAttribute('aria-label','No saved map preview');return;}
  const {width,height,pixels,markers}=preview,source=document.createElement('canvas');source.width=width;source.height=height;
  const sourceCtx=source.getContext('2d'),image=sourceCtx.createImageData(width,height);image.data.set(pixels);sourceCtx.putImageData(image,0,0);
  const scale=Math.min((canvas.width-12)/width,(canvas.height-12)/height),w=width*scale,h=height*scale,ox=(canvas.width-w)/2,oy=(canvas.height-h)/2;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(source,ox,oy,w,h);
  for(const dot of markers){ctx.fillStyle=dot.color;ctx.beginPath();ctx.arc(ox+dot.x*scale,oy+dot.y*scale,dot.radius,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#748a9d';ctx.strokeRect(ox-.5,oy-.5,w+1,h+1);
  canvas.setAttribute('aria-label','Terrain preview: '+(snapshot.name||'Untitled Map'));
  if(caption)caption.textContent=width+' × '+height+' · '+preview.tileset+' · dots: players / oil';
}
