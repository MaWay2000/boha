import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLowFpsDetector,isPreviewVisible,freezePreviewItem} from './js/previewPerformance.mjs';

test('previews disable after five continuous seconds below 10 FPS, once per trial',()=>{
 const d=createLowFpsDetector();d.sample(0);
 for(let t=200;t<5000;t+=200)assert.equal(d.sample(t),false);
 assert.equal(d.sample(5000),true);assert.equal(d.sample(6000),false);
 d.reset();d.sample(7000);for(let t=7200;t<12000;t+=200)assert.equal(d.sample(t),false);assert.equal(d.sample(12000),true);
});
test('exactly 10 FPS and normal rendering never disable previews',()=>{
 for(const step of [100,20,10]){const d=createLowFpsDetector();for(let t=0;t<=15000;t+=step)assert.equal(d.sample(t),false);}
});
test('a recovered one-second FPS window resets the five-second streak',()=>{
 const d=createLowFpsDetector();d.sample(0);for(let t=200;t<=4000;t+=200)assert.equal(d.sample(t),false);
 for(let t=4100;t<=5000;t+=100)assert.equal(d.sample(t),false);
 for(let t=5200;t<10000;t+=200)assert.equal(d.sample(t),false);assert.equal(d.sample(10000),true);
});
test('loading, offscreen and hidden-tab samples reset the detector instead of counting as low FPS',()=>{
 const d=createLowFpsDetector();d.sample(0);for(let t=200;t<=4000;t+=200)assert.equal(d.sample(t),false);
 assert.equal(d.sample(20000,false),false);d.sample(30000);
 for(let t=30200;t<35000;t+=200)assert.equal(d.sample(t),false);assert.equal(d.sample(35000),true);
 d.reset();assert.equal(d.sample(NaN),false);assert.equal(d.sample(1000),false);assert.equal(d.sample(500),false);
});
const rect=(x,y,w=100,h=100)=>({left:x,top:y,right:x+w,bottom:y+h,width:w,height:h});
function visibleFixture(box=rect(0,0)){
 const win={innerWidth:800,innerHeight:600};win.parent=win;
 const doc={hidden:false,defaultView:win},element={ownerDocument:doc,getBoundingClientRect:()=>box};return{win,doc,element};
}
test('visibility handles hidden tabs, viewport clipping, gallery clipping and a scrolled parent frame',()=>{
 const f=visibleFixture();assert.equal(isPreviewVisible(f.element),true);f.doc.hidden=true;assert.equal(isPreviewVisible(f.element),false);
 assert.equal(isPreviewVisible(visibleFixture(rect(0,700)).element),false);
 const clipped=visibleFixture(rect(400,0));clipped.element.closest=()=>({getBoundingClientRect:()=>rect(0,0,300,200)});assert.equal(isPreviewVisible(clipped.element),false);
 const nested=visibleFixture(rect(0,100)),parent={innerWidth:800,innerHeight:600};parent.parent=parent;
 nested.win.parent=parent;nested.win.frameElement={getBoundingClientRect:()=>rect(0,-800,800,2000)};
 assert.equal(isPreviewVisible(nested.element),false);
 nested.win.frameElement.getBoundingClientRect=()=>rect(0,-150,800,2000);assert.equal(isPreviewVisible(nested.element),true);
});
test('auto-disable captures a still image, stops resize redraws and releases the GPU context',()=>{
 const calls=[],source={width:320,height:180,replaceWith:n=>calls.push(['replace',n]),remove:()=>calls.push(['remove'])};
 const still={dataset:{},setAttribute(){},getContext:()=>({drawImage:canvas=>calls.push(['copy',canvas])})};
 const item={model:{id:1},renderer:{domElement:source,render:()=>calls.push(['render']),dispose:()=>calls.push(['dispose']),forceContextLoss:()=>calls.push(['release'])},resizeObserver:{disconnect:()=>calls.push(['disconnect'])}};
 freezePreviewItem(item,{createElement:()=>still},model=>calls.push(['model',model.id]));
 assert.deepEqual(calls.map(x=>x[0]),['render','copy','replace','disconnect','model','dispose','release']);assert.equal(still.dataset.engine,'still');assert.equal(still.width,320);assert.equal(item.model,null);assert.equal(item.renderer,null);
});
test('software previews also stop, and failed image capture retains an accessible placeholder',()=>{
 let disposed=0,removed=0,disconnected=0;
 const item={model:{},softwareCanvas:{width:50,height:50,remove(){removed++;}},message:{hidden:true},resizeObserver:{disconnect(){disconnected++;}}};
 freezePreviewItem(item,{createElement:()=>({dataset:{},setAttribute(){},getContext:()=>null})},()=>disposed++);
 assert.equal(item.message.hidden,false);assert.equal(item.message.textContent,'3D preview disabled');assert.equal(disposed,1);assert.equal(removed,1);assert.equal(disconnected,1);assert.equal(item.softwareCanvas,null);
});
