import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelPreloader, createRenderCheck, boundedAsset} from '../balloon/site-armory-preload.mjs';
const deferred = () => {let resolve; const promise = new Promise(done => {resolve=done;}); return {promise, resolve};};
const settle = async () => {for(let i=0;i<20;i++)await Promise.resolve();};

test('preparation waits for every validated model, coalesces callers and bounds parallel work', async () => {
  const waits=Array.from({length:7},deferred), states=[]; let active=0, peak=0;
  const prepare=createModelPreloader({items:async()=>waits, load:async item=>{peak=Math.max(peak,++active);await item.promise;active--;return item;},
    validate:model=>assert.ok(waits.includes(model)), onState:state=>states.push(state)});
  const first=prepare(); assert.equal(prepare(),first); await settle(); assert.equal(peak,3);
  waits.slice(0,6).forEach(item=>item.resolve()); await settle();
  assert.equal(states.at(-1).status,'loading'); assert.equal(states.at(-1).ready,6);
  waits[6].resolve(); await first;
  assert.deepEqual(states.at(-1),{status:'ready',ready:7,total:7});
  const count=states.length; await prepare(); assert.equal(states.length,count); assert.ok(peak<=3);
});

test('one incomplete model blocks readiness and a later retry can recover', async () => {
  let broken=true; const states=[];
  const prepare=createModelPreloader({items:async()=>['good','broken'],load:async key=>{if(key==='broken'&&broken)throw Error('offline');return key;},onState:state=>states.push(state)});
  await assert.rejects(prepare(),/offline/); assert.equal(states.at(-1).status,'error');
  assert.ok(!states.some(state=>state.status==='ready'));
  broken=false; await prepare(); assert.equal(states.at(-1).status,'ready');
});

test('a disposed renderer cannot publish late readiness', async () => {
  const wait=deferred(), states=[]; let active=true;
  const prepare=createModelPreloader({items:async()=>['late'],load:()=>wait.promise,onState:state=>states.push(state),active:()=>active});
  const pending=prepare(); await settle(); active=false; wait.resolve({}); await assert.rejects(pending,/cancelled/);
  assert.ok(!states.some(state=>state.status==='ready'));
});

test('readiness requires loaded textures and an actual rendered model', () => {
  const canvas={dataset:{}}, image={complete:true,naturalWidth:64};
  const model={traverse:visit=>visit({isMesh:true,material:{map:{image}}})};
  const validate=createRenderCheck((value,out)=>{assert.equal(value,model);out.dataset.triangles='12';},{createElement:()=>canvas});
  validate(model); image.complete=false; assert.throws(()=>validate(model),/texture not ready/);
  image.complete=true; image.naturalWidth=0; assert.throws(()=>validate(model),/texture not ready/);
  image.naturalWidth=64;
  const blank=createRenderCheck((value,out)=>{out.dataset.triangles='0';},{createElement:()=>canvas});
  assert.throws(()=>blank(model),/visible triangles/);
});

test('a stalled asset times out and disposes late texture arrivals', async () => {
  const wait=deferred(); let disposed=false;
  await assert.rejects(boundedAsset(wait.promise,5),/timed out/);
  wait.resolve({dispose(){disposed=true;}}); await settle(); assert.equal(disposed,true);
});
