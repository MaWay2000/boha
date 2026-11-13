import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPublishedLoader,createJsonReader} from './published-loader.mjs';
const baseUrl=new URL('https://example.test/stats/published/');
const snapshot=()=>({generatedAt:'today',leaderboards:{Global:{players:[]}},games:[{id:'same-match',score:123}]});
function fixture(){let hash='a'.repeat(64),fail=false;const calls=[];
 const read=async(url,options)=>{calls.push({url:String(url),options});if(url.pathname.endsWith('manifest.json'))return{format:1,files:{'leaderboards.json':{sha256:hash}}};if(fail)throw Error('offline');return url.pathname.endsWith('rating-performance.json')?{format:2,games:{one:{kills:4}}}:snapshot();};
 return{calls,loader:createPublishedLoader({baseUrl,read}),version:v=>hash=v.repeat(64),fail:v=>fail=v};}
test('unchanged refreshes fetch only the manifest; large JSON is versioned and calculations remain untouched',async()=>{
 const f=fixture();const first=await f.loader.load();assert.equal(first.changed,true);assert.deepEqual(first.payload.games,snapshot().games);
 const next=await f.loader.load();assert.equal(next.changed,false);assert.equal(first.payload,next.payload);
 assert.equal(f.calls.filter(x=>x.url.includes('/leaderboards.json')).length,1);
 assert.equal(f.calls.filter(x=>x.url.includes('/manifest.json')).length,2);
 assert.equal(f.calls[0].options.cache,'no-cache');assert.match(f.calls[1].url,new RegExp('v='+'a'.repeat(64)));
 assert.equal(f.calls.some(x=>x.url.includes('rating-performance')),false);
 f.version('b');assert.equal((await f.loader.load()).changed,true);
});
test('concurrent refreshes coalesce, failed updates keep the last good version and retry',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.loader.load(),f.loader.load()]);assert.equal(a,b);assert.equal(f.calls.length,2);
 f.version('b');f.fail(true);await assert.rejects(f.loader.load(),/offline/);f.fail(false);
 const next=await f.loader.load();assert.equal(next.changed,true);assert.notEqual(next.payload,a.payload);
});
test('Maway performance loads on demand, coalesces and retries without discarding match data',async()=>{
 const f=fixture(),{payload}=await f.loader.load();f.fail(true);await assert.rejects(f.loader.loadPerformance(payload));f.fail(false);
 await Promise.all([f.loader.loadPerformance(payload),f.loader.loadPerformance(payload)]);
 assert.deepEqual(payload.ratingPerformance,{one:{kills:4}});assert.deepEqual(payload.games,snapshot().games);
 const n=f.calls.length;await f.loader.loadPerformance(payload);assert.equal(f.calls.length,n);
});
test('invalid publication metadata and incomplete snapshots are rejected',async()=>{
 for(const value of [{format:1,files:{}},{format:2,files:{'leaderboards.json':{sha256:'a'.repeat(64)}}}]){
 const loader=createPublishedLoader({baseUrl,read:async()=>value});await assert.rejects(loader.load(),/manifest/);}
 const loader=createPublishedLoader({baseUrl,read:async url=>url.pathname.endsWith('manifest.json')?{format:1,files:{'leaderboards.json':{sha256:'a'.repeat(64)}}}:{games:[]}});await assert.rejects(loader.load(),/incomplete/);
});
test('JSON reader terminates its worker and retains a usable fallback when workers are unavailable',async()=>{
 let worker,terminated=0;const read=createJsonReader({workerFactory:()=>worker={terminate(){terminated++;},postMessage(data){assert.equal(data.cache,'default');queueMicrotask(()=>worker.onmessage({data:{value:{ok:true}}}));}}});
 assert.deepEqual(await read(baseUrl),{ok:true});assert.equal(terminated,1);
 const fallback=createJsonReader({workerFactory(){throw Error('unsupported');},fetchImpl:async()=>({ok:true,text:async()=>String.fromCharCode(0xfeff)+'{"ok":true}\r\n'})});assert.deepEqual(await fallback(baseUrl),{ok:true});
});
test('worker verifies the publication before exposing it and reports corrupt or cross-origin data',async()=>{
 const source=await readFile(new URL('./published-json-worker.js',import.meta.url),'utf8');
 const text=JSON.stringify(snapshot())+'\n';const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex');const messages=[];
 const self={location:{origin:'https://example.test'},crypto:webcrypto,postMessage:value=>messages.push(value)};
 vm.runInNewContext(source,{self,URL,TextEncoder,Uint8Array,fetch:async()=>({ok:true,text:async()=>text})});
 await self.onmessage({data:{url:new URL('leaderboards.json',baseUrl).href,sha256:digest}});assert.deepEqual(JSON.parse(JSON.stringify(messages[0].value)),snapshot());
 await self.onmessage({data:{url:new URL('leaderboards.json',baseUrl).href,sha256:'0'.repeat(64)}});assert.match(messages[1].error,/updating/);
 await self.onmessage({data:{url:'https://outside.test/data'}});assert.match(messages[2].error,/origin/);
});


test('a browser that asynchronously blocks workers falls back to its normal JSON reader',async()=>{
 let worker,terminated=0;
 const read=createJsonReader({workerFactory:()=>worker={terminate(){terminated++;},postMessage(){queueMicrotask(()=>worker.onerror());}},fetchImpl:async()=>({ok:true,text:async()=>'{"ok":true}'})});
 assert.deepEqual(await read(baseUrl),{ok:true});assert.equal(terminated,1);
});
