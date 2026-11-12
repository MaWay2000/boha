const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const {scriptLibraryExamples} = await import('./js/scriptLibrary.js');
  const {writeMapScriptSource, readMapScriptSource} = await import('./js/scriptMapImport.js');
  const entry = scriptLibraryExamples.find(e => e.id === 'arc-timed-tower-defense');
  const runtime = entry.source.match(/\/\* MAPMAKER_RUNTIME_BEGIN\r?\n([\s\S]*?)MAPMAKER_RUNTIME_END \*\//)[1];
  const bodies = JSON.parse(fs.readFileSync(__dirname + '/pies/components/templates.json', 'utf8'));
  let units = [], timers = [], orders = [], net = [], announcements = [], blocked = false, capped = false;
  const context = vm.createContext({
    namespace: prefix => assert.equal(prefix, 'mmwaves_'), maxPlayers:4, scavengerPlayer:10,
    scavengers:1, gameTime:0, HQ: 'HQ', mapWidth:128, mapHeight:128,
    TER_WATER:1, TER_CLIFFFACE:2, DORDER_SCOUT:3,
    enumStruct: p => [{x:42 + (p % 2) * 44, y:42 + Math.floor(p / 2) * 44}],
    enumDroid: () => units, terrainType: () => blocked ? 1 : 0,
    propulsionCanReach: () => true, console: s => announcements.push(s),
    setTimer: (name, ms) => timers.push([name, ms]), removeTimer: name => timers = timers.filter(t => t[0] !== name),
    hackNetOff: () => net.push('off'), hackNetOn: () => net.push('on'),
    orderDroidLoc: (d, order, x, y) => orders.push([d.id, order, x, y]),
    addDroid: (player, x, y, name, body, propulsion, unused1, unused2, weapon) => {
      assert.equal(player, 10); assert.equal(body, bodies.BaBaPeople.body);
      assert.equal(propulsion, bodies.BaBaPeople.propulsion); assert.equal(weapon, bodies.BaBaPeople.weapons[0]);
      assert(x >= 4 && x <= 123 && [4, 123].includes(y));
      if (capped) return null;
      const d = {id:units.length + 1, name}; units.push(d); return d;
    }
  });
  vm.runInContext(runtime, context);
  context.mmwaves_eventStartLevel(); context.mmwaves_eventStartLevel();
  assert.equal(timers.length,1,'Repeated start does not duplicate the timer');
  context.gameTime=59000; context.mmwaves_tick(); assert.equal(units.length,0);
  context.gameTime=60000; blocked=true; context.mmwaves_tick(); assert.equal(units.length,0);
  assert.equal(context.mmwaves_pending,6,'Blocked tile does not lose units');
  blocked=false; capped=true; context.mmwaves_tick(); assert.equal(context.mmwaves_pending,6);
  capped=false;
  for(let t=61;t<=63;t++){context.gameTime=t*1000;context.mmwaves_tick();}
  assert.equal(units.length,6); assert.equal(context.mmwaves_pending,0);
  context.gameTime=104000;context.mmwaves_tick();assert.equal(units.length,6);
  for(let t=105;t<=110;t++){context.gameTime=t*1000;context.mmwaves_tick();}
  assert.equal(units.length,18);
  // Check the persisted global progress and next scheduled wave.
  const saved=JSON.parse(JSON.stringify({index:context.mmwaves_index,pending:context.mmwaves_pending,next:context.mmwaves_nextTime,spawned:context.mmwaves_spawned}));
  assert.equal(saved.index,2);assert.equal(saved.next,150000);
  for(let t=150;t<=158;t++){context.gameTime=t*1000;context.mmwaves_tick();}
  assert.equal(units.length,36);assert.equal(announcements.length,3);assert(orders.length >= 36);
  assert.equal(net.filter(x=>x==='off').length,net.filter(x=>x==='on').length);
  units=[];context.gameTime=159000;context.mmwaves_tick();assert.equal(timers.length,0,'Finished waves stop after surviving units are gone');
  const disabled=vm.createContext({...context,scavengers:0,mmwaves_started:false,setTimer:()=>assert.fail('disabled scavengers must not spawn')});
  vm.runInContext(runtime,disabled);disabled.mmwaves_eventStartLevel();

  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/js/jszip.min.js','utf8'), {module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});
  const JSZip=mod.exports, archive=new JSZip();
  const draft={filename:'multiplay/maps/example/game.js',source:entry.source,enabled:true,pendingChanges:true};
  writeMapScriptSource(archive,draft);
  const reopened=await JSZip.loadAsync(await archive.generateAsync({type:'uint8array'}));
  assert.equal(await reopened.file('multiplay/script/mods/init.js').async('string'),runtime);
  assert.deepEqual(await readMapScriptSource(reopened),draft,'Editable runtime survives save/reopen');
  writeMapScriptSource(reopened,{...draft,enabled:false});
  assert(!reopened.file('multiplay/script/mods/init.js'),'Disable Script removes exported waves');
  assert(!reopened.file('mapmaker-timed-waves.json'));
  writeMapScriptSource(reopened,draft);writeMapScriptSource(reopened,{...draft,source:'// no runtime'});
  assert(!reopened.file('multiplay/script/mods/init.js'),'Replacing the example removes its runtime');
  const existing=new JSZip();existing.file('multiplay/script/mods/init.js','// another mod');
  assert.throws(()=>writeMapScriptSource(existing,draft),/already has a gameplay mod/);
  assert.equal(await existing.file('multiplay/script/mods/init.js').async('string'),'// another mod');
  console.log('PASS: timed waves, batching, attacks, blocked/capped retries, timer completion, runtime export/reopen, disable and mod protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
