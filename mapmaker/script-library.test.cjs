const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const {scriptLibraryExamples:examples}=await import('./js/scriptLibrary.js');
 const {getScriptMapWorkerSource,buildScriptMapFiles}=await import('./js/scriptMapImport.js');
 const {mountScriptEditor}=await import('./js/scriptEditor.js');
 const structs=JSON.parse(fs.readFileSync(__dirname+'/structure.json','utf8'));
 const units=JSON.parse(fs.readFileSync(__dirname+'/pies/components/templates.json','utf8'));
 assert.equal(new Set(examples.map(e=>e.id)).size,examples.length);
 assert.equal(new Set(examples.map(e=>e.name)).size,examples.length);
 for(const entry of examples.filter(e=>e.id!=='arc-mw-wave-defense')){
  assert(entry.name&&entry.purpose&&entry.description.length>40);
  for(const seed of [1,42,1234]){
   let output;
   const context=vm.createContext({self:{postMessage:value=>{output=value;}}});
   vm.runInContext(getScriptMapWorkerSource(),context);
   context.self.onmessage({data:{source:entry.source,seed}});
   assert(output&&!output.error,entry.name+': '+output?.error);
   const map=output.data;
   assert.equal(map.width,128);assert.equal(map.height,128);assert(map.textures.every(tile=>tile===0));
   for(let player=0;player<4;player++){
    assert.equal(map.structures.filter(e=>e.player===player&&e.name==='A0CommandCentre').length,1);
    assert.equal(map.droids.filter(e=>e.player===player&&e.name==='ConstructionDroid').length,4);
   }
   assert.equal(map.droids.filter(e=>e.player===10).length,24);
   const occupied=new Set();
   for(const [kind,entries] of [['structure',map.structures],['droid',map.droids],['feature',map.features]])for(const e of entries){
    assert(e.position[0]>0&&e.position[0]<map.width*128&&e.position[1]>0&&e.position[1]<map.height*128);
    const key=e.position.join(',');assert(!occupied.has(key),'objects do not share positions');occupied.add(key);
    if(kind==='structure')assert(structs[e.name],e.name+' exists');
    if(kind==='droid')assert(units[e.name],e.name+' exists');
   }
   if(entry.id==='arc-north-south-lanes')assert(map.droids.filter(e=>e.player===10).every(e=>[4,123].includes(e.position[1]/128)));
   if(entry.id==='arc-scavenger-camps')assert.equal(map.structures.filter(e=>e.player===10).length,8);
   const generated=buildScriptMapFiles(map,'multiplay/maps/library/game.js');
   const exported=JSON.parse(generated.files[2][1]);
   assert(exported.some(e=>e.player==='scavenger'),'export preserves scavenger ownership');
  }
 }
 function control(){return {listeners:{},attributes:{},value:'',style:{setProperty(){}},classList:{toggle(){}},scrollTop:0,scrollLeft:0,clientWidth:600,clientHeight:300,addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(key,value){this.attributes[key]=String(value);},focus(){this.focused=true;},setSelectionRange(){}};}
 const controls={};const panel={style:{setProperty(){}},querySelector:key=>controls[key]||(controls[key]=control()),addEventListener(){}};
 const changes=[],toggles=[],runs=[];let finish;
 const editor=mountScriptEditor(panel,{onChange:s=>changes.push(s),onEnable:value=>toggles.push(value),onRun:async script=>{runs.push(script);return new Promise(resolve=>{finish=resolve;});}});
 editor.setScript(null);
 const open=controls['[data-script-library-open]'],library=controls['[data-script-library]'],choice=controls['[data-script-library-choice]'],load=controls['[data-script-library-load]'];
 assert(library.hidden);assert.equal(open.disabled,false,'Library works without a map script');
 open.listeners.click();assert.equal(library.hidden,false);assert.equal(open.attributes['aria-expanded'],'true');assert.equal(changes.length,0);assert.equal(runs.length,0);
 for(const example of examples){choice.value=example.id;choice.listeners.change();assert.equal(controls['[data-script-library-purpose]'].textContent,example.purpose);assert.equal(controls['[data-script-library-description]'].textContent,example.description);}
 load.listeners.click();assert.deepEqual(toggles,[true]);assert.equal(changes[0],examples.at(-1).source);assert.equal(runs.length,0,'Loading never runs a script');assert(library.hidden);assert.equal(controls['[data-script-enable]'].checked,true);
 editor.setScript({filename:'multiplay/maps/my-map/game.js',source:'// draft',enabled:true});
 open.listeners.click();choice.value=examples[0].id;load.listeners.click();assert.equal(controls['[data-script-filename]'].textContent,'multiplay/maps/my-map/game.js');
 const running=controls['[data-script-run]'].listeners.click();assert.equal(runs.length,1);assert.equal(open.disabled,true);assert.equal(load.disabled,true);
 const count=changes.length;load.listeners.click();assert.equal(changes.length,count,'Cannot replace source while the map is running');
 finish('Done');await running;assert.equal(open.disabled,false);
 open.listeners.click();open.listeners.click();assert(library.hidden,'Library button toggles closed');
 console.log('PASS: named examples run in the actual worker, validate/export objects, preserve ownership, and load explicitly without map execution.');
})().catch(error=>{console.error(error);process.exitCode=1;});
