const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
function png(){
 function chunk(type,data){const name=Buffer.from(type),payload=Buffer.concat([name,data]);let crc=0xffffffff;for(const b of payload){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,payload,tail]);}
 const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,0,0,255,0,255,0,255,0,0,0,255,255,255,255,0,255]))),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={png};
if(require.main===module)(async()=>{
 const {normalizeUnitTextures,readUnitTexture,getUnitTextureSource,texturePie}=await import('./js/unitTextures.js');
 const {compileUnitDesign,writeUnitDesigns,readUnitDesigns,unwrapUnitMapPack}=await import('./js/unitDesigns.js');const {prepareUnitModels}=await import('./js/unitModels.js');const {registerUnitPieModels,parsePie}=await import('./js/pie.js');const {buildWaveMapPack}=await import('./js/waveMapPack.js');
 const bytes=png(),dataURL='data:image/png;base64,'+bytes.toString('base64'),texture={name:'My image.png',dataURL};const textures=normalizeUnitTextures({body:texture,legs:texture,weapon:texture});assert.equal(textures.body.width,2);assert.equal(textures.body.height,2);
 for(const invalid of ['https://example.org/image.png','data:image/svg+xml;base64,AAA=','data:image/png;base64,AA=='])assert.throws(()=>normalizeUnitTextures({body:{dataURL:invalid}}));
 const oversized=Buffer.from(bytes);oversized.writeUInt32BE(2049,16);assert.throws(()=>normalizeUnitTextures({legs:{dataURL:'data:image/png;base64,'+oversized.toString('base64')}}),/2048/);
 const priorDocument=global.document,priorBitmap=global.createImageBitmap;let closed=0,drawn=0;global.createImageBitmap=async()=>({width:4096,height:2048,close(){closed++}});const canvas={getContext:()=>({drawImage(){drawn++}}),toDataURL:()=>dataURL};global.document={createElement:()=>canvas};await readUnitTexture({type:'image/jpeg',size:100,name:'photo.jpg'});assert.equal(canvas.width,2048);assert.equal(canvas.height,1024);assert.equal(drawn,1);assert.equal(closed,1);await assert.rejects(()=>readUnitTexture({type:'image/svg+xml',size:2}),/PNG/);global.document=priorDocument;global.createImageBitmap=priorBitmap;
 const stats=JSON.parse(fs.readFileSync(__dirname+'/js/unitEditorStats.json'));
 const design={id:'painted',name:'Painted cyborg',body:'CyborgLightBody',propulsion:'CyborgLegs',weapon:'CyborgChaingun',health:900,armourKinetic:45,armourHeat:32,speed:3,damage:123,textures};
 const load=async path=>{for(const p of [path,path.split('/').pop()]){const file=__dirname+'/pies/'+p.toLowerCase();if(fs.existsSync(file))return fs.readFileSync(file,'utf8');}throw Error(path);};
 const c=compileUnitDesign(design,stats),assets=await prepareUnitModels(c,load);assert.equal([...assets.keys()].filter(p=>p.endsWith('.png')).length,3);registerUnitPieModels(assets);
 for(const [model,part] of [[c.body.model,'legs'],[c.weapon.mountModel,'body'],[c.weapon.model,'weapon']]){const text=assets.get('components/bodies/'+model),name='page-mmu_painted_'+part+'.png';assert(text.includes(name));const geo=parsePie(text);assert.equal(geo.userData.textureName,name);assert.equal(geo.userData.teamColorMask,false);assert.equal(getUnitTextureSource(name),dataURL);}
 const event=assets.get('components/bodies/'+c.body.model).match(/EVENT 1 (\S+)/)[1];assert(assets.get('components/bodies/'+event).includes('page-mmu_painted_legs.png'));
 const original='PIE 2\nTYPE 10200\nTEXTURE 0 old.png 256 256\nLEVELS 1\nLEVEL 1\nPOINTS 3\n0 0 0\n1 0 0\n0 1 0\nPOLYGONS 1\n200 3 0 1 2 0 0 256 0 0 256\n';const changed=texturePie(original,'new.png',textures.body);assert.deepEqual(Array.from(parsePie(original).getAttribute('uv').array),Array.from(parsePie(changed).getAttribute('uv').array));
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/js/jszip.min.js','utf8'),{module:m,exports:m.exports,require,Buffer,setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView});const Zip=m.exports,z=new Zip();z.file('game.map','grid');await writeUnitDesigns(z,[design],stats,load);const pack=await buildWaveMapPack(z,'Painted');
 for(const path of assets.keys())assert(pack.file(path));assert.deepEqual(Buffer.from(await pack.file('texpages/page-mmu_painted_body.png').async('uint8array')),bytes);
 const reopened=await unwrapUnitMapPack(await Zip.loadAsync(await pack.generateAsync({type:'uint8array'})),Zip);assert.deepEqual((await readUnitDesigns(reopened,stats))[0].textures,textures);
 await writeUnitDesigns(z,[{...design,textures:undefined}],stats,load);assert(!z.file('texpages/page-mmu_painted_body.png'));await writeUnitDesigns(z,[design],stats,load);await writeUnitDesigns(z,[],stats,load);assert(!z.file('texpages/page-mmu_painted_legs.png'));
 console.log('PASS: image validation/conversion, independent cyborg textures, preview sources, animated legs, original UVs, PNG mod bytes, reopen and cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
