export function createFrameMonitor({windowMs=5000,warmupMs=2000,threshold=24}={}) {
 let previous=null,start=null,frames=0,warmUntil=null;
 const reset=()=>{previous=null;start=null;frames=0;warmUntil=null;};
 return {reset, sample(now,active=true){
  if(!active || !Number.isFinite(now)){reset();return null;}
  if(previous===null || now-previous>1000 || now<previous){previous=now;warmUntil=now+warmupMs;start=null;frames=0;return null;}
  previous=now;if(now<warmUntil)return null;
  if(start===null){start=now;frames=0;return null;}frames++;
  const elapsed=now-start;if(elapsed<windowMs)return null;
  const fps=frames*1000/elapsed;start=now;frames=0;return {fps,low:fps<threshold};
 }};
}
export function lowerQuality(value){return value==='high'?'normal':value==='normal'||value==='custom'?'low':null;}
export function mountPerformanceQuality(win, container, {getQuality,setQuality}) {
 const doc=win.document,monitor=createFrameMonitor({windowMs:1000,warmupMs:500}),KEY='warzone2100MapMaker.ui.autoQuality';
 let auto=true,lastChange=-Infinity,lowSince=null;
 try{auto=win.localStorage.getItem(KEY)!=='false';}catch{}
 const dock=doc.createElement('div');dock.id='mapPerformance';dock.setAttribute('aria-label','Map preview performance');
 dock.style.cssText='margin-left:auto;flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:7px;max-width:100%;padding:2px 7px;border:1px solid #477889;border-radius:5px;background:#071923e8;color:#d5eff8;font:12px sans-serif;pointer-events:auto';
 const fps=doc.createElement('span');fps.textContent='FPS —';fps.style.cssText='min-width:48px;font-variant-numeric:tabular-nums';
 const label=doc.createElement('label');label.textContent='Quality ';
 const quality=doc.createElement('select');quality.id='mapPerformanceQuality';quality.setAttribute('aria-label','Map preview quality');quality.title='Low: static 3D and limited zoom-out. Medium: static 3D. High: animated 3D.';quality.style.cssText='background:#102c38;color:#d5eff8;border:1px solid #477889;padding:3px';
 for(const [value,name] of [['high','High'],['normal','Medium'],['low','Low'],['custom','Custom']]){const option=doc.createElement('option');option.value=value;option.textContent=name;option.disabled=value==='custom';quality.append(option);}label.append(quality);
 const autoLabel=doc.createElement('label'),toggle=doc.createElement('input');toggle.type='checkbox';toggle.checked=auto;toggle.setAttribute('aria-label','Automatically lower map quality');autoLabel.append(toggle,doc.createTextNode(' Auto'));
 const notice=doc.createElement('span');notice.setAttribute('role','status');notice.hidden=true;notice.style.flexBasis='100%';
 dock.append(fps,label,autoLabel,notice);
 const toolbar=doc.getElementById('menuBar');
 (toolbar || container).append(dock);
 if(toolbar){
   toolbar.style.height='auto';toolbar.style.minHeight='40px';
   const fit=()=>doc.documentElement.style.setProperty('--menu-height',toolbar.getBoundingClientRect().height+'px');
   if(win.ResizeObserver)new win.ResizeObserver(fit).observe(toolbar);
   win.addEventListener('resize',fit);fit();
 }
 for(const event of ['pointerdown','mousedown','click','wheel','keydown'])dock.addEventListener(event,event=>event.stopPropagation());
 const sync=()=>{quality.value=getQuality();};sync();
 quality.addEventListener('change',()=>{setQuality(quality.value);monitor.reset();lowSince=null;notice.hidden=true;sync();});
 toggle.addEventListener('change',()=>{auto=toggle.checked;monitor.reset();lowSince=null;try{win.localStorage.setItem(KEY,String(auto));}catch{}});
 doc.addEventListener('visibilitychange',()=>{monitor.reset();lowSince=null;fps.textContent='FPS —';});
 return {sync,reset(){monitor.reset();fps.textContent='FPS —';},frame(now){
   const result=monitor.sample(now,!doc.hidden && container.clientWidth>0 && container.clientHeight>0);
   if(!result)return;fps.textContent='FPS '+Math.round(result.fps);sync();
   if(result.low){if(lowSince===null)lowSince=now;}else lowSince=null;
   const next=lowerQuality(getQuality());
   if(auto && lowSince!==null && now-lowSince>=4000 && next && now-lastChange>=10000){lastChange=now;lowSince=null;setQuality(next);sync();monitor.reset();notice.textContent='Low FPS: quality lowered to '+next+'. Your map is unchanged.';notice.hidden=false;}
 }};
}

// Preview-only policy: never changes map objects, terrain, or export data.
export function allowsModelAnimation(quality) { return quality === 'high'; }
export function clampPreviewZoom(value, quality) {
 const zoom=Number.isFinite(value)?value:0.5;
 return Math.max(0.01,Math.min(quality === 'low'?0.6:6,zoom));
}
