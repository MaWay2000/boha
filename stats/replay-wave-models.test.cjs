const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(process.env.WAVE_MODEL_ANALYZER_SOURCE||path.join(__dirname,'../replay-analyzer.js'),'utf8');
const assetPath='stats/models/arc-mw-visuals-fccc5ecab427.json';
const bytes=fs.readFileSync(path.join(__dirname,'..',assetPath)),visuals=JSON.parse(bytes);
function fn(name){let start=source.indexOf('  function '+name+'(');if(start<0)start=source.indexOf('  async function '+name+'(');assert(start>=0,name+' exists');const choices=['\n  function ','\n  async function '].map(s=>source.indexOf(s,start+3)).filter(n=>n>start);return source.slice(start,Math.min(...choices));}
function context(extra={}){return vm.createContext({Map,Set,URL,document:{baseURI:'http://localhost/replay-analyzer.html'},window:{location:{origin:'http://localhost'}},...extra});}
test('exact audited mod hashes select checksummed visual data, not unknown mods or stacks',()=>{
 const ctx=context();vm.runInContext(fn('replayModelAssetDescriptor'),ctx);
 const descriptor=ctx.replayModelAssetDescriptor({match:{modHashes:['63b5333af9cd97c5dd8b132733a693727c068c45f08e8f58e91bf3afcf065d97']}});
 assert.equal(descriptor.path,assetPath);assert.equal(descriptor.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 const v159=ctx.replayModelAssetDescriptor({match:{modHashes:['d1e67949610119d8964808329c106f8eef789cc3fd4aefce470e2f03e21a289a']}});
 assert.equal(v159.path,assetPath);assert.equal(v159.sha256,descriptor.sha256);
 const v160=ctx.replayModelAssetDescriptor({match:{modHashes:['0a192b2209eb541aff24c8789e1fb7108c2e7890454f4b3a46eb02a4844e33ce']}});
 assert.equal(v160.path,assetPath);assert.equal(v160.sha256,descriptor.sha256);
 assert.equal(ctx.replayModelAssetDescriptor({match:{modHashes:['unknown']}}),null);
 assert.equal(ctx.replayModelAssetDescriptor({match:{modHashes:['63b5333af9cd97c5dd8b132733a693727c068c45f08e8f58e91bf3afcf065d97','another']}}),null);
});
test('custom body, gun and explicit left/right propulsion models resolve without guessing component IDs as filenames',()=>{
 const ctx=context();for(const name of ['normalizeBattlefieldModelName','battlefieldPiePath','battlefieldDroidParts'])vm.runInContext(fn(name),ctx);
 const native=folder=>JSON.parse(fs.readFileSync(path.join(__dirname,'../mapmaker/pies/components',folder)));
 const library={templateNames:new Map(),bodyDefs:{...native('bodies/body.json'),...visuals.bodyDefs},propDefs:{...native('prop/propulsion.json'),...visuals.propDefs},weaponDefs:{...native('weapons/weapons.json'),...visuals.weaponDefs}};
 let explicitRight=0;
 for(const id of Object.keys(visuals.bodyDefs)){
  const root=id.replace(/_Body$/,'');const prop=root+'_Prop',weapon=root+'_Weapon';
  if(!visuals.propDefs[prop]||!visuals.weaponDefs[weapon])continue;
  const parts=ctx.battlefieldDroidParts({name:id,body:id,propulsion:prop,weapons:[weapon]},library);
  assert(parts.some(p=>p.role==='body'));assert(parts.some(p=>p.role==='weapon'));
  const right=visuals.bodyDefs[id].propulsionExtraModels?.[prop]?.right;
  if(right){assert(parts.some(p=>p.side==='right'&&p.path.endsWith(right)),id+' right propulsion');explicitRight++;}
  for(const part of parts.filter(p=>p.path)){
   const name=part.path.split('/').at(-1).toLowerCase();
   assert(Object.keys(visuals.models).some(k=>k.endsWith('/'+name))||fs.existsSync(path.join(__dirname,'../mapmaker/pies',part.path.toLowerCase()))||fs.existsSync(path.join(__dirname,'../mapmaker/pies',name)),part.path+' exists');
  }
 }
 assert(explicitRight>0,'Explicit custom right-hand propulsion was exercised');
});
test('custom definitions are scoped to a replay and do not overwrite stock library data',()=>{
 const base={bodyDefs:{Stock:{model:'stock.pie'}},propDefs:{},weaponDefs:{}};
 const ctx=context({battlefieldExtraction:{battlefieldVisuals:JSON.parse(bytes)}});vm.runInContext(fn('battlefieldReplayModelLibrary'),ctx);
 const custom=ctx.battlefieldReplayModelLibrary(base);assert(custom.bodyDefs.MMU_wave_tier_60_Body);assert(!base.bodyDefs.MMU_wave_tier_60_Body);
 ctx.battlefieldExtraction={};assert.equal(ctx.battlefieldReplayModelLibrary(base),base);
});
test('model downloads fail closed on a bad checksum before importing or registering models',async()=>{
 const ctx=context({battlefieldVisualAssetPromises:new Map(),fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),calculateReplaySha256:async()=>'bad'});
 for(const name of ['replayModelAssetDescriptor','loadReplayModelAssets'])vm.runInContext(fn(name),ctx);
 await assert.rejects(ctx.loadReplayModelAssets({match:{modHashes:['63b5333af9cd97c5dd8b132733a693727c068c45f08e8f58e91bf3afcf065d97']}}),/checksum/);
});
