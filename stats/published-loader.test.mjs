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

const liveBase = new URL('https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/live/');
function liveFixture() {
  const state = {liveOnline: true, liveTime: 12, savedTime: 10, liveHash: 'a', savedHash: 'b', perfHash: 'c', corrupt: false, perfOffline: false};
  const calls = [];
  const read = async (url, options) => {
    const live = url.origin === liveBase.origin;
    calls.push({url: String(url), options});
    if (live && !state.liveOnline) throw Error('offline');
    const hash = (live ? state.liveHash : state.savedHash).repeat(64);
    const time = `2026-11-17T${live ? state.liveTime : state.savedTime}:00:00Z`;
    if (url.pathname.endsWith('manifest.json')) return {format: 1, publishedAt: time, files: {
      'leaderboards.json': {sha256: hash}, 'rating-performance.json': {sha256: state.perfHash.repeat(64)}
    }};
    if (url.pathname.endsWith('rating-performance.json')) {
      if (state.perfOffline) throw Error(live ? 'offline' : 'Publication is still updating');
      assert.equal(options.sha256, state.perfHash.repeat(64));
      return {format: 2, games: {one: {kills: state.perfHash === 'c' ? 3 : 5}}};
    }
    if (live && state.corrupt) throw Error('Publication is still updating');
    assert.equal(options.sha256, hash);
    return {format: 1, generatedAt: time, leaderboards: {Global: {players: [{id: 'one', elo: 2100}]}}, games: [{id: live ? 'live' : 'saved'}]};
  };
  return {state, calls, loader: createPublishedLoader({baseUrl, liveBaseUrl: liveBase, read})};
}

test('live publication selects small manifests first and downloads the large payload only once per hash', async () => {
  const f = liveFixture();
  const [first, same] = await Promise.all([f.loader.load(), f.loader.load()]);
  assert.equal(first, same);
  assert.equal(first.payload.games[0].id, 'live');
  assert.equal(first.payload.leaderboards.Global.players[0].elo, 2100);
  assert.equal(f.calls.filter(call => call.url.includes('/leaderboards.json')).length, 1);
  const next = await f.loader.load();
  assert.equal(next.changed, false);
  assert.equal(next.payload, first.payload);
  assert.equal(f.calls.at(-1).url, new URL('manifest.json', liveBase).href);
  assert.equal(f.calls.filter(call => call.url.includes('/leaderboards.json')).length, 1);
  assert.equal(f.calls.some(call => call.url.includes('rating-performance.json')), false);
});

test('live outages, corrupt snapshots and cold starts retain a working GitHub fallback', async () => {
  for (const setting of ['liveOnline', 'corrupt']) {
    const f = liveFixture(); f.state[setting] = setting === 'corrupt';
    const result = await f.loader.load();
    assert.equal(result.payload.games[0].id, 'saved');
    assert.equal(result.liveAvailable, false);
  }
  const f = liveFixture();
  const first = await f.loader.load();
  f.state.liveOnline = false;
  const saved = await f.loader.load();
  assert.equal(saved.payload, first.payload);
  assert.equal(saved.changed, false);
  assert.equal(saved.liveAvailable, false);
  f.state.liveOnline = true; f.state.liveHash = 'd'; f.state.liveTime = 13;
  assert.equal((await f.loader.load()).changed, true);
});

test('newer GitHub data wins over stale hosting data and older manifests cannot roll back the page', async () => {
  const f = liveFixture(); f.state.savedTime = 13;
  const first = await f.loader.load();
  assert.equal(first.payload.games[0].id, 'saved');
  assert.equal(first.liveAvailable, false);
  f.state.savedTime = 10;
  assert.equal((await f.loader.load()).payload, first.payload);
  f.state.liveTime = 14;
  const live = await f.loader.load();
  assert.equal(live.payload.games[0].id, 'live');
  assert.equal(live.liveAvailable, true);
});

test('the host indicator updates when the same snapshot becomes available on the live host', async () => {
  const f = liveFixture();
  f.state.liveHash = f.state.savedHash;
  f.state.liveOnline = false;
  const first = await f.loader.load();
  assert.equal(first.liveAvailable, false);
  f.state.liveOnline = true;
  const next = await f.loader.load();
  assert.equal(next.payload, first.payload);
  assert.equal(next.changed, false);
  assert.equal(next.liveAvailable, true);
});

test('live performance stays lazy, retries failed downloads, and updates without mixing generations', async () => {
  const f = liveFixture(); const {payload} = await f.loader.load();
  f.state.perfOffline = true;
  await assert.rejects(f.loader.loadPerformance(payload), /updating/);
  f.state.perfOffline = false;
  await f.loader.loadPerformance(payload);
  assert.equal(payload.ratingPerformance.one.kills, 3);
  f.state.perfHash = 'd';
  const updated = await f.loader.load();
  assert.equal(updated.payload, payload);
  assert.equal(updated.changed, true);
  await f.loader.loadPerformance(payload);
  assert.equal(payload.ratingPerformance.one.kills, 5);
});

test('the JSON worker permits only our public live files across origins', async () => {
  const source = await readFile(new URL('./published-json-worker.js', import.meta.url), 'utf8');
  const messages = [], requests = [];
  const self = {location: {origin: 'https://example.test'}, postMessage: value => messages.push(value)};
  vm.runInNewContext(source, {self, URL, fetch: async (url, options) => {
    requests.push(String(url)); assert.equal(options.credentials, 'omit');
    return {ok: true, text: async () => '{"ok":true}'};
  }});
  await self.onmessage({data: {url: new URL('leaderboards.json', liveBase).href}});
  assert.equal(messages[0].value.ok, true);
  await self.onmessage({data: {url: 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/worker'}});
  assert.match(messages[1].error, /origin/);
  assert.equal(requests.length, 1);
});
