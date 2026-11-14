const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {scalePie,prepareUnitModels}=await import('./js/unitModels.js');
 const {compileUnitDesign,normalizeUnitDesigns,writeUnitDesigns,readUnitDesigns,unwrapUnitMapPack}=await import('./js/unitDesigns.js');
 const {buildWaveMapPack}=await import('./js/waveMapPack.js');
 const {parsePie,registerUnitPieModels,loadPieGeometry}=await import('./js/pie.js');
 const stats=JSON.parse(fs.readFileSync(__dirname+'/js/unitEditorStats.json'));
 const load=async path=>{for(const p of [path,path.split('/').pop()]){const file=__dirname+'/pies/'+p.toLowerCase();if(fs.existsSync(file))return fs.readFileSync(file,'utf8');}throw Error('Missing '+path);};
 const d={id:'giant',name:'Giant cyborg',body:'CyborgLightBody',propulsion:'CyborgLegs',weapon:'CyborgChaingun',health:900,armourKinetic:45,armourHeat:32,speed:3,damage:123,bodyScale:3,legsScale:4,weaponScale:2};
 const original=JSON.stringify(stats),c=compileUnitDesign(d,stats),assets=await prepareUnitModels(c,load);
 assert.equal(c.template.type,'CYBORG');assert.equal(c.propulsion.model,undefined);assert.equal(JSON.stringify(stats),original);
 const find=name=>assets.get('components/bodies/'+name);
 for(const [name,source,scale] of [[c.body.model,'components/bodies/cybd_std.pie',4],[c.weapon.mountModel,'components/weapons/cybody.pie',3],[c.weapon.model,'components/weapons/cy_gun.pie',2]]){
   const before=parsePie(await load(source)),after=parsePie(find(name));
   const a=before.getAttribute('position'),b=after.getAttribute('position');assert.equal(a.count,b.count);
   for(let i=0;i<a.array.length;i++)assert(Math.abs(a.array[i]*scale-b.array[i])<0.00001);
   assert.equal(before.userData.textureName,after.userData.textureName);
   assert.deepEqual(after.userData.connectors,before.userData.connectors.map(p=>p.map(n=>Math.round(n*128*scale)/128)));
 }
 const event=find(c.body.model).match(/EVENT 1 (\S+)/)[1],animation=find(event);
 assert(animation.includes('LEVELS 6'));assert.equal((animation.match(/ANIMOBJECT/g)||[]).length,6);
 const frame=animation.match(/ANIMOBJECT[^\n]+\n\s*([^\n]+)/)[1].trim().split(/\s+/).map(Number);
 assert.deepEqual(frame,[0,0,3352,20732,24760,0,0,1,1,1]);
 const synthetic='PIE 3\nPOINTS 1\n1 2 3\nCONNECTORS 1\n1 0 1\nSHADOWPOINTS 1\n2 4 6\nANIMOBJECT 10 0 1\n0 100 200 300 5 6 7 1 1 1\n';
 assert.match(scalePie(synthetic,1.5),/CONNECTORS 1\n\t2 0 2/);assert.match(scalePie(synthetic,1.5),/0 150 300 450 5 6 7 1 1 1/);
 for(const bad of [0,11,Infinity,NaN])assert.throws(()=>scalePie(synthetic,bad));
 for(const bad of [{weapon:'MG1Mk1'},{propulsion:'wheeled01'},{legsScale:11}])assert.throws(()=>compileUnitDesign({...d,...bad},stats));
 const heavy=compileUnitDesign({...d,id:'heavy',body:'CyborgHeavyBody',weapon:'Cyb-Hvywpn-HPV'},stats);assert.equal(heavy.template.type,'CYBORG_SUPER');const heavyAssets=await prepareUnitModels(heavy,load);assert([...heavyAssets.values()].some(t=>t.includes('ANIMOBJECT')));
 registerUnitPieModels(assets);assert((await loadPieGeometry('components/weapons/'+c.weapon.model)).getAttribute('position').count>0);
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/js/jszip.min.js','utf8'),{module:m,exports:m.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});const Zip=m.exports,z=new Zip();z.file('game.map','grid');
 await writeUnitDesigns(z,[d],stats,load);for(const path of assets.keys())assert(z.file(path));
 const pack=await buildWaveMapPack(z,'Giant');for(const path of assets.keys())assert(pack.file(path));
 const reopened=await unwrapUnitMapPack(await Zip.loadAsync(await pack.generateAsync({type:'uint8array'})),Zip);assert.deepEqual(await readUnitDesigns(reopened,stats),normalizeUnitDesigns([d],stats));
 await writeUnitDesigns(z,[{...d,bodyScale:1,legsScale:1,weaponScale:1}],stats,load);for(const path of assets.keys())assert(!z.file(path));
 await writeUnitDesigns(z,[d],stats,load);await writeUnitDesigns(z,[],stats,load);for(const path of assets.keys())assert(!z.file(path));
 console.log('PASS: light/heavy cyborgs, independent mesh/connectors/animated-leg scales, compatibility, cached preview models, one-file pack/reopen and owned-model cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
