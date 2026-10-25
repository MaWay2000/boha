const assert=require('node:assert/strict');
(async()=>{
  const {createLiveMapGeneration}=await import('./js/liveMapGeneration.js');
  const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
  let map={name:'original',id:'original-id'}, calls=[],active=0,maxActive=0,gate=null,errors=[];
  const bridge={snapshot:()=>map,catalog:async()=>({}),apply:async snapshot=>{
    active++;maxActive=Math.max(maxActive,active);calls.push({...snapshot});
    if(gate){const wait=gate;gate=null;await wait;}
    map={...snapshot,id:snapshot.id||'generated-id'};active--;return map.id;
  }};
  const live=createLiveMapGeneration({bridge,delay:5,
    generate:options=>({snapshot:{name:options.name},report:{errors:options.bad?['invalid']:[]}}),
    onStatus:()=>{},onResult:()=>{},onError:error=>errors.push(error),onUndo:()=>{}});
  await tick();assert.equal(calls.length,0,'mount does not overwrite map');
  live.request({name:'discarded'});live.request({name:'first'});await tick();await live.flush();
  assert.equal(calls.length,1,'rapid changes are debounced');assert.equal(map.name,'first');
  live.request({name:'second'});await live.flush();assert.equal(map.id,'generated-id');
  assert.equal(calls[1].id,'generated-id','live updates reuse a local save');
  live.request({name:'invalid',bad:true});assert.equal(await live.flush(),false);assert.equal(map.name,'second');
  live.request({name:'cancelled'});await live.undo();await tick();
  assert.deepEqual(map,{name:'original',id:'original-id'},'undo restores baseline and cancels pending work');
  live.request({name:'pending-invalid'});live.reject(Error('incomplete field'));await tick();
  assert.equal(map.name,'original');assert.equal(errors.length,1);
  let release;gate=new Promise(resolve=>{release=resolve;});
  live.request({name:'slow'});const inFlight=live.flush();await tick();
  live.request({name:'latest'});const latest=live.flush();release();await Promise.all([inFlight,latest]);
  assert.equal(maxActive,1,'updates never overlap');assert.equal(map.name,'latest');
  assert.equal(await live.flush(),true);await live.undo();assert.equal(map.name,'original');
  let releaseUndo;gate=new Promise(resolve=>{releaseUndo=resolve;});
  live.request({name:'cancel-during-apply'});const applying=live.flush();await tick();
  const undoing=live.undo();releaseUndo();await Promise.all([applying,undoing]);
  assert.equal(map.name,'original','undo waits for in-flight apply');
  const apply=bridge.apply;let failOnce=true;
  bridge.apply=async snapshot=>{if(failOnce){failOnce=false;map={name:'partial'};throw Error('apply failed');}return apply(snapshot);};
  live.request({name:'failure'});assert.equal(await live.flush(),false);
  assert.equal(map.name,'original','failed apply rolls back');assert.equal(errors.length,2);
  const manual=createLiveMapGeneration({bridge,automatic:false,delay:1,
    generate:options=>({snapshot:{name:options.name},report:{errors:[]}}),
    onStatus:()=>{},onResult:()=>{},onError:error=>{throw error;},onUndo:()=>{}});
  const count=calls.length;
  manual.request({name:'slider-position-1'});manual.request({name:'slider-position-2'});await tick();
  assert.equal(calls.length,count,'slider changes must not apply automatically');
  assert.equal(await manual.flush(),true);assert.equal(map.name,'slider-position-2');
  assert.equal(calls.length,count+1,'Update map applies only the latest options once');
  manual.request({name:'next-click'});await tick();assert.equal(map.name,'slider-position-2');
  await manual.flush();assert.equal(map.name,'next-click','repeated manual updates work');
  manual.request({name:'discard-me'});manual.cancel();await tick();
  assert.equal(await manual.flush(),true);assert.equal(map.name,'next-click','cancel discards pending options without undoing the current map');
  live.request({name:'automatic-cancel'});live.cancel();await tick();assert.equal(map.name,'next-click','cancel also clears the debounce timer');
  console.log('Live generation: debounce, serialization, invalid input, stable save ID, undo and rollback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
