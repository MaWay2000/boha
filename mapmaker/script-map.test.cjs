const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const scripts = await import('./js/scriptMapImport.js');
  const metadata = await import('./js/archiveImport.js');
  const {loadMapUnified} = await import('./js/maploader.js');
  const mod = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'), {
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,
    setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  const JSZip = mod.exports;
  // Exercise the exact browser-worker code with only realm-local test bindings.
  // No DOM, browser, Node APIs or host functions are passed to the map script.
  function execute(source, seed = 0) {
    const request = JSON.stringify({source,seed});
    const encoded = vm.runInNewContext(
      'let output; const self={postMessage:value=>{output=value;}};' +
      scripts.getScriptMapWorkerSource() +
      'self.onmessage({data:' + request + '}); JSON.stringify(output);',
      {}, {timeout:5000}
    );
    const result = JSON.parse(encoded);
    if (result.error) throw new Error(result.error);
    return scripts.validateScriptMapData(result.data);
  }
  const filename = '10c-Gladiator-test6-48dfeff712235e2959b2f876bc485b8efd45abb477a039cd6908d295173a163c.wz';
  const original = fs.readFileSync(path.join(__dirname,'maps',filename));
  const zip = await JSZip.loadAsync(original,{checkCRC32:true});
  const scriptName = Object.keys(zip.files).find(n=>n.endsWith('/game.js'));
  const source = await zip.file(scriptName).async('string');
  const generated = execute(source);
  assert.equal(generated.width,250);assert.equal(generated.height,250);
  assert.equal(generated.textures.length,62500);assert.equal(generated.heights.length,62500);
  assert.equal(Math.min(...generated.heights),0);assert.equal(Math.max(...generated.heights),510);
  assert.equal(generated.structures.length,90);
  assert.equal(generated.droids.length,0);
  assert(generated.features.length>0);
  for(let player=0;player<10;player++)
    assert.equal(generated.structures.filter(e=>e.player===player).length,9);
  assert.deepEqual(execute(source),generated,'Fixed default seed is reproducible');

  const rand = execute('const values=[gameRand(),gameRand(),gameRand()];' +
    'setMapData(2,2,[0,0,0,0],[0,0,0,0],[],[],values.map(n=>({name:String(n),position:[0,0],direction:0})));',5489);
  assert.deepEqual(rand.features.map(e=>Number(e.name)),[3499211612,581869302,3890346734],'MT19937 reference sequence');

  assert.equal(await scripts.materializeScriptMap(zip,source=>execute(source)),true);
  const retained = await scripts.readMapScriptSource(zip);
  assert.equal(retained.source,source,'Original script remains viewable after materialization');
  assert.equal(retained.filename,scriptName);assert.equal(retained.pendingChanges,false);
  assert(!zip.file(scriptName),'Editable archive no longer runs its original generator on export');
  const gridName = scriptName.replace(/game\.js$/,'game.map');
  const grid = await zip.file(gridName).async('uint8array');
  const parsed = await loadMapUnified(new File([grid],gridName));
  assert.equal(parsed.mapW,250);assert.equal(parsed.mapH,250);
  assert.equal(parsed.mapTiles[0][0],generated.textures[0]&0x1ff);
  assert.equal(Math.max(...parsed.mapHeights.flat()),255,'Script world heights use existing editor height scale');
  const structs = await metadata.readMapArchiveEntities(zip,'struct');
  assert.equal(structs.entries.length,90);
  const info = (await metadata.readMapArchiveMetadata(zip)).data;
  assert.equal(info.author,'arc');assert.equal(info.license,'CC0');
  assert.equal(info.generator,'FlaME 1.29 Windows');
  const exported = await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}));
  assert(exported.file(gridName));assert(!exported.file(scriptName));
  assert.equal((await scripts.readMapScriptSource(exported)).source,source,'Script survives .wz export/reopen');
  const draft = {...retained,source:source.replace('GREEN: 23','GREEN: 6'),pendingChanges:true};
  scripts.writeMapScriptSource(exported,draft);
  assert.deepEqual(await scripts.readMapScriptSource(exported),draft,'Unrun edits survive save/reopen');
  assert.equal((await loadMapUnified(new File([await exported.file(gridName).async('uint8array')],gridName))).mapTiles[0][0],
    parsed.mapTiles[0][0],'Saving a script draft does not regenerate terrain');
  assert.equal(scripts.normalizeMapScriptSource({filename:'../game.js',source:'x'}),null);
  assert.equal(await scripts.readMapScriptSource(new JSZip()),null,'Fixed maps have no invented script');
  assert.deepEqual(fs.readFileSync(path.join(__dirname,'maps',filename)),original,'Original archive stays untouched');
  const fixed = new JSZip();
  fixed.file('game.map',grid);fixed.file('game.js','throw Error("must not run")');
  assert.equal(await scripts.materializeScriptMap(fixed,()=>{throw Error('Unexpected execution');}),false,'Fixed-map path unchanged');

  const fixture = execute('setMapData(2,2,[XFLIP|YFLIP|TRIFLIP|(2<<ROTSHIFT)|12,0,0,0],[10,20,30,40],' +
    '[{name:"A0CommandCentre",position:[64,64],direction:16384,player:-1,modules:0}],' +
    '[{name:"ConstructionDroid",position:[64,64],direction:32768,player:0}],' +
    '[{name:"OilResource",position:[64,64],direction:8192}]);');
  const files = scripts.buildScriptMapFiles(fixture,'game.js').files;
  assert.equal(JSON.parse(files.find(([n])=>n==='struct.json')[1])[0].rotation,90);
  assert.equal(JSON.parse(files.find(([n])=>n==='struct.json')[1])[0].player,10);
  const droid = JSON.parse(files.find(([n])=>n==='droid.json')[1])[0];
  assert.equal(droid.template,'ConstructionDroid');assert.equal(droid.rotation[1],32768);
  const decoded = await loadMapUnified(new File([files[0][1]],'game.map'));
  assert.equal(decoded.mapTiles[0][0],12);assert.equal(decoded.mapRotations[0][0],2);
  assert(decoded.mapXFlip[0][0]&&decoded.mapYFlip[0][0]&&decoded.mapTriFlip[0][0]);
  assert.throws(()=>execute('log("no map");'),/did not call setMapData/);
  assert.throws(()=>execute('throw Error("bad script");'),/bad script/);
  assert.throws(()=>execute('setMapData(999,2,[],[],[],[],[]);'),/dimensions/);
  assert.throws(()=>execute('setMapData(2,2,[],[],[],[],[]);'),/arrays/);
  assert.throws(()=>execute('fetch("https://example.com")'),/fetch/);
  assert.throws(()=>execute('new Worker("x")'),/Worker/);
  assert.throws(()=>execute('while(true){}'),/timed out/);
  const html = scripts.getScriptMapSandboxHtml();
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/worker-src blob:/);
  console.log('PASS: actual Gladiator-test6 -> 250x250, 90 structures, '+generated.features.length+' features; metadata, seed, flags, rotations, droids, export, validation and worker timeout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
