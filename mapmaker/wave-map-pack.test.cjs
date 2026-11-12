const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const {hasWaveRuntime,buildWaveMapPack}=await import('./js/waveMapPack.js');
 const {writeMapScriptSource,readMapScriptSource}=await import('./js/scriptMapImport.js');
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/js/jszip.min.js','utf8'),{module:mod,exports:mod.exports,require,Buffer,Blob,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});const Zip=mod.exports;
 const script={filename:'game.js',source:'setMapData();\n/* MAPMAKER_RUNTIME_BEGIN\nfunction waveTick() {}\nMAPMAKER_RUNTIME_END */',enabled:true,pendingChanges:true};
 assert(hasWaveRuntime(script));assert(!hasWaveRuntime({...script,enabled:false}));assert(!hasWaveRuntime(null));assert(!hasWaveRuntime({...script,source:'// ordinary script'}));
 const map=new Zip();map.file('level.json',JSON.stringify({name:'Wave map',author:'Original author',license:'GPL-2.0-or-later',players:2}));
 map.file('game.map',Buffer.from([1,2,3]));map.file('droid.json','{"version":2,"droids":[]}');
 map.file('multiplay/skirmish/nexus.js','// wave-controlled AI');map.file('stats/weapons.json','{"support":"preserved"}');
 writeMapScriptSource(map,script);const before=Object.keys(map.files).sort();
 const pack=await buildWaveMapPack(map,'Wave map');assert.deepEqual(Object.keys(map.files).sort(),before,'Pack wrapping does not mutate the source archive');
 const reopened=await Zip.loadAsync(await pack.generateAsync({type:'uint8array'}));
 assert(reopened.file('maps/Wave_map.wz'));assert.equal(await reopened.file('multiplay/script/mods/init.js').async('string'),'function waveTick() {}\n');
 assert.equal(await reopened.file('multiplay/skirmish/nexus.js').async('string'),'// wave-controlled AI');assert(reopened.file('stats/weapons.json'));
 assert(!reopened.file('level.json'),'No plain map metadata at the bundle mount root');
 const inner=await Zip.loadAsync(await reopened.file('maps/Wave_map.wz').async('uint8array'));
 assert.deepEqual(await readMapScriptSource(inner),script);assert.deepEqual(await inner.file('game.map').async('uint8array'),new Uint8Array([1,2,3]));
 assert.equal(JSON.parse(await inner.file('level.json').async('string')).license,'GPL-2.0-or-later');
 assert.match(await reopened.file('README.txt').async('string'),/Remove this pack from autoload/);
 const sanitized=await buildWaveMapPack(map,'../map\\bad');assert(!Object.keys(sanitized.files).some(p=>p.includes('..')||p.includes('\\')));
 await assert.rejects(()=>buildWaveMapPack(new Zip(),'plain'),/Enable a wave script/);
 const game=fs.readFileSync(__dirname+'/js/game.js','utf8'),start=game.indexOf('async function buildWzFileBlob('),rest=game.slice(start),end=rest.search(/\n(?:async )?function /);
 const context=vm.createContext({currentMapArchive:map,currentMapExportInfo:{gamma:false},currentMapArchivePath:'game.map',currentMapScript:script,
 getSafeMapBase:()=> 'Wave map',getSaveMapVersion:()=> '1.2',writeMapScriptSource,writeMapVersion:(zip,version)=>zip.file('mapmaker-version.json',JSON.stringify({version})),
 updateStructJson(){},updateFeatureJson(){},updateDroidJson(){},buildMapFileBytes:()=>new Uint8Array([1,2,3]),getTileTypesArchivePath:()=> 'ttypes.ttp',buildTileTypesFileBytes:()=>new Uint8Array([4]),buildWaveMapPack});
 vm.runInContext(rest.slice(0,end),context);
 const ordinary=await Zip.loadAsync(await (await context.buildWzFileBlob(false)).arrayBuffer());assert(ordinary.file('game.map'));assert(!ordinary.file('maps/Wave_map.wz'));
 const output=await Zip.loadAsync(await (await context.buildWzFileBlob(true)).arrayBuffer());assert(output.file('maps/Wave_map.wz'));
 const savedMap=await Zip.loadAsync(await output.file('maps/Wave_map.wz').async('uint8array'));assert(savedMap.file('ttypes.ttp'));assert.equal(JSON.parse(await savedMap.file('mapmaker-version.json').async('string')).version,'1.2');
 console.log('PASS: one-file wave packaging, native exporter integration, normal export, editable script and provenance, AI/support files, safe names and source archive isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
