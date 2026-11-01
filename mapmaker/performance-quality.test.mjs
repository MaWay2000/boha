import {test} from 'node:test';import assert from 'node:assert/strict';import {createFrameMonitor,lowerQuality,mountPerformanceQuality,allowsModelAnimation,clampPreviewZoom} from './js/performanceQuality.mjs';
function samples(step,active=true){const m=createFrameMonitor();const result=[];for(let t=0;t<14000;t+=step){const r=m.sample(t,active);if(r)result.push(r);}return result;}
test('actual render frames detect sustained slow rendering after warmup',()=>{const slow=samples(50);assert.ok(slow.length);assert.ok(slow.every(r=>r.low&&Math.abs(r.fps-20)<1));assert.ok(samples(16).every(r=>!r.low&&r.fps>60));});
test('hidden frames and long pauses cannot trigger a low-FPS recommendation',()=>{assert.deepEqual(samples(50,false),[]);const m=createFrameMonitor();m.sample(0);assert.equal(m.sample(30000),null);for(let t=30016;t<35000;t+=16)assert.equal(m.sample(t),null);m.reset();assert.equal(m.sample(50000),null);});
test('automatic quality steps down gradually and never below Low',()=>{assert.equal(lowerQuality('high'),'normal');assert.equal(lowerQuality('normal'),'low');assert.equal(lowerQuality('custom'),'low');assert.equal(lowerQuality('low'),null);});

test('FPS dock stays in the toolbar and sustained low FPS lowers quality',()=>{
 class Element{constructor(){this.children=[];this.style={setProperty(){}};this.listeners={};this.clientWidth=800;this.clientHeight=600;}append(...items){this.children.push(...items);}setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}getBoundingClientRect(){return {height:40};}}
 const toolbar=new Element(),container=new Element();const doc={hidden:false,documentElement:new Element(),getElementById:()=>toolbar,createElement:()=>new Element(),createTextNode:value=>value,addEventListener(){}};
 const win={document:doc,localStorage:{getItem(){return null;},setItem(){}},addEventListener(){}};let quality='high';
 const hud=mountPerformanceQuality(win,container,{getQuality:()=>quality,setQuality:value=>{quality=value;}});
 assert.equal(toolbar.children[0].id,'mapPerformance');assert.equal(container.children.length,0);
 for(let now=0;now<2500;now+=50)hud.frame(now);
 assert.equal(toolbar.children[0].children[0].textContent,'FPS 20');assert.equal(quality,'high');
 for(let now=2500;now<7000;now+=50)hud.frame(now);assert.equal(quality,'normal');
});

test('Low and Medium keep models static; only High animates',()=>{assert.equal(allowsModelAnimation('low'),false);assert.equal(allowsModelAnimation('normal'),false);assert.equal(allowsModelAnimation('high'),true);});
test('Low limits zoom-out but preserves close editing zoom; higher modes retain full overview',()=>{assert.equal(clampPreviewZoom(6,'low'),0.6);assert.equal(clampPreviewZoom(0.05,'low'),0.05);assert.equal(clampPreviewZoom(6,'normal'),6);assert.equal(clampPreviewZoom(6,'high'),6);assert.equal(clampPreviewZoom(-1,'low'),0.01);assert.equal(clampPreviewZoom(NaN,'low'),0.5);});
