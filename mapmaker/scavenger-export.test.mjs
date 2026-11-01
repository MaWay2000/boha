import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {mapExportOwner} from './js/mapOwnership.mjs';import {buildScriptMapFiles,validateScriptMapData} from './js/scriptMapImport.js';
test('scavenger owners export with the reserved label, not an unused player slot',()=>{
 for(const input of [{startpos:10},{player:10},{player:'scavengers',startpos:3}]){const original=JSON.stringify(input);const out=mapExportOwner(input);assert.equal(out.player,'scavenger');assert.equal('startpos' in out,false);assert.equal(JSON.stringify(input),original);}
 assert.deepEqual(mapExportOwner({startpos:2}),{startpos:2});assert.deepEqual(mapExportOwner({player:'scavenger'},1),{player:1});
});
test('actual structure and droid exporters repair old editor slot-10 ownership without modifying map data',()=>{
 const source=fs.readFileSync(new URL('./js/game.js',import.meta.url),'utf8');const extract=name=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);};
 const ctx=vm.createContext({mapExportOwner,STRUCTURE_DEFS:[{id:'A0BaBaFactory'}],mapW:128,mapH:128,mapHeights:[[20]],getStructurePlayer:()=>10,getDroidPlayer:()=>10,getStructureModuleCount:()=>0,getStructureRotationDegrees:()=>0,getDroidRotationDegrees:()=>0,degreesToWzAngle:()=>0});
 for(const name of ['getStructureExportEntry','getDroidExportEntry'])vm.runInContext(extract(name),ctx);
 const sourceEntry={name:'A0BaBaFactory',startpos:10,position:[64,64]};const group={position:{x:.5,z:.5},userData:{structureExport:{name:'A0BaBaFactory',sourceEntry},droidExport:{startpos:10,body:'B1BaBa',propulsion:'BaBaLegs',weapons:['BabaMG']}}};const before=JSON.stringify(group);
 for(const out of [ctx.getStructureExportEntry(group,'array',1),ctx.getDroidExportEntry(group)]){assert.equal(out.player,'scavenger');assert.equal('startpos' in out,false);}assert.equal(JSON.stringify(group),before);
});
