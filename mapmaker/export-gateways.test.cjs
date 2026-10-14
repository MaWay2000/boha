const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/js/game.js`,'utf8');
const begin = source.indexOf('function getReusableMapTail(');
const end = source.indexOf('\nfunction ',begin + 1);
const ctx = vm.createContext({Uint8Array,DataView,mapW:20,mapH:40});
vm.runInContext(source.slice(begin,end),ctx);
for(const info of [null,{width:20,height:40,tail:new Uint8Array(0)},{width:30,height:40,tail:new Uint8Array(8)}]) {
  assert.deepEqual(Array.from(ctx.getReusableMapTail(info)),[1,0,0,0,0,0,0,0]);
}
const existing = new Uint8Array([1,0,0,0,1,0,0,0,2,3,4,3]);
assert.equal(ctx.getReusableMapTail({width:20,height:40,tail:existing}),existing);
console.log('PASS: new, missing, resized gateway sections and existing gateway preservation.');
