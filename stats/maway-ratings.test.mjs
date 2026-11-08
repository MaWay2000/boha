import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BETA3_RULES,rankPerformance,gameChanges} from './beta3-core.mjs';
import {calculatePersonalRatings,MAWAY_SETTINGS,BOHAN_SETTINGS,readSettings,saveSettings,normalizeSettings} from './personal-ratings.mjs';
import {buildPerformance} from './build-rating-performance.cjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`);
// Original Beta 3 screenshot fixture, from stats/beta3-rating.test.js (493d59e).
const stats=[
 [1801179,649,443,27,89,503], [1360248,331,497,19,78,572], [282298,246,542,11,85,529],
 [1637816,496,569,40,93,671], [1118924,340,314,86,93,547], [2833218,641,338,208,98,491]
].map(([score,kills,droids_lost,structures_destroyed,research_complete,droids_built])=>
 ({score,kills,droids_lost,structures_destroyed,research_complete,droids_built}));
test('original Beta 3 screenshot: strong losing player gains exactly 3.2',()=>{
 const ranked=rankPerformance(stats);
 close(ranked[0].score,0.7); assert.equal(ranked[0].rank,2);
 const players=stats.map((_,i)=>({id:String(i),rating:1500,games:20}));
 const performance=new Map(players.map((p,i)=>[p.id,ranked[i]]));
 const changes=gameChanges(players.slice(0,3),players.slice(3),0,performance);
 close(changes[0].resultDelta,-4);close(changes[0].personalDelta,7.2);close(changes[0].delta,3.2);
 assert.ok(changes.every(c=>Math.abs(c.delta)<=15));
});
test('original Beta 3 tied metrics are neutral, without slot-order bias',()=>{
 const identical=stats.map(()=>({...stats[0]}));
 assert.deepEqual(rankPerformance(identical).map(p=>p.score),Array(6).fill(0.5));
});
test('original Beta 3 high-rated player faces higher performance expectations',()=>{
 const ranked=rankPerformance(stats), players=stats.map((_,i)=>({id:String(i),rating:i===0?1900:1500,games:20}));
 const changes=gameChanges(players.slice(0,3),players.slice(3),0,new Map(players.map((p,i)=>[p.id,ranked[i]])));
 assert.ok(changes[0].expectedPerformance>0.8);assert.ok(changes[0].personalDelta<0);assert.ok(changes[0].delta<0);
});
test('missing any of six counters disables performance for the entire match',()=>{
 assert.equal(rankPerformance(stats.map((s,i)=>i===2?{...s,kills:null}:s)),null);
 const p=[0,1,2,3].map(i=>({id:String(i),rating:1500,games:20}));
 const changes=gameChanges(p.slice(0,2),p.slice(2),1);
 assert.ok(changes.every(c=>c.personalDelta===0));close(changes[0].delta,4);
});
test('personal changes cap at ±10 and total changes at ±15, including extreme settings',()=>{
 const p=[0,1,2,3].map(i=>({id:String(i),rating:i<2?5000:0,games:0}));
 const changes=gameChanges(p.slice(0,2),p.slice(2),0,new Map(p.map(v=>[v.id,{score:v.id==='0'?1:0}])),{...BETA3_RULES,establishedK:200,personalWeight:100});
 for(const c of changes){assert.ok(Math.abs(c.personalDelta)<=10);assert.ok(Math.abs(c.delta)<=15);}
});
test('Beta 3 provisional K falls from 12 to 8 across the first 20 matches',()=>{
 for(const [games,expected] of [[0,6],[10,5],[20,4],[100,4]]){
  const p=[0,1,2,3].map(i=>({id:String(i),rating:1500,games}));
  close(gameChanges(p.slice(0,2),p.slice(2),1)[0].delta,expected);
 }
});
function fixture(size=2){
 const accounts=new Map(),slots=[];
 for(let t=0;t<2;t++)for(let i=0;i<size;i++){
  const id=`${t}-${i}`,account={name:id,mainPublicKey:id,games:[],elo:1700};accounts.set(id,account);
  slots.push({position:slots.length,team:t,userType:t?'loser':'winner',account});
 }
 const game={id:'test:1',startDate:1,endDate:2,duration:600000,alliancesType:2,slots};
 slots.forEach(s=>s.account.games.push(game));return {accounts,games:[game]};
}
test('Maway adapter uses Beta 3 and preserves published source records',()=>{
 const b=fixture(5),r=calculatePersonalRatings(b,MAWAY_SETTINGS);
 assert.equal(r.ratedGames,1);
 for(const s of r.games[0].slots)close(s.eloDelta,s.team?-6:6);
 assert.equal(r.games[0].ratingBasis,'beta3');assert.equal(b.accounts.get('0-0').elo,1700);
 assert.equal(r.games[0].slots[0].ratingBreakdown.performanceAvailable,false);
});
test('incomplete identities, bots, crashes, unequal teams and duels are not rated',()=>{
 const unknown=fixture(5);unknown.games[0].slots[9].account.mainPublicKey=null;
 assert.equal(calculatePersonalRatings(unknown,MAWAY_SETTINGS).ratedGames,0);
 const bot=fixture();bot.accounts.get('0-0').bot=true;
 assert.equal(calculatePersonalRatings(bot,MAWAY_SETTINGS).ratedGames,0);
 const crash=fixture();crash.games[0].crashed=true;
 assert.equal(calculatePersonalRatings(crash,MAWAY_SETTINGS).ratedGames,0);
 assert.equal(calculatePersonalRatings(fixture(1),MAWAY_SETTINGS).ratedGames,0);
 const unequal=fixture();unequal.games[0].slots.pop();
 assert.equal(calculatePersonalRatings(unequal,{...MAWAY_SETTINGS,equalTeams:false}).ratedGames,0);
});
test('performance feed retains the six verified metrics, including negative engine scores',()=>{
 const row={position:0,team:0,result:'winner',stats_source:'replay-engine',...stats[0],score:-100};
 const data=buildPerformance([{source:'test',source_match_id:1,players:[row,{...row,position:1,stats_source:'unknown'},{...row,position:2,kills:null}]}]);
 assert.equal(data.format,2);assert.deepEqual(Object.keys(data.games['test:1']),['0']);
 assert.equal(data.games['test:1'][0].score,-100);assert.equal(data.games['test:1'][0].droids_lost,443);
});
test('old draft preferences migrate to Beta 3, without changing the Bohan default',()=>{
 const old={...MAWAY_SETTINGS,algorithm:'maway',k:32,performanceWeight:0.2};
 const migrated=readSettings({getItem:()=>JSON.stringify({version:1,settings:old})});
 assert.equal(migrated.algorithm,'maway-beta3');assert.equal(migrated.k,8);assert.equal(migrated.personalWeight,36);
 assert.deepEqual(readSettings({getItem:()=>null}),BOHAN_SETTINGS);
 for(const personalWeight of [-1,101,NaN])assert.throws(()=>normalizeSettings({...MAWAY_SETTINGS,personalWeight}));
});
test('Maway extra settings persist and reject invalid weights or caps',()=>{
 const settings={...MAWAY_SETTINGS,provisionalExtraK:7,provisionalGames:12,performanceScale:600,personalCap:3,matchCap:9,
  metrics:{score:0.4,kills:0.1,unitKd:0.2,structuresDestroyed:0.1,research:0.1,production:0.1}};
 let stored;
 const storage={setItem:(_,v)=>stored=v,getItem:()=>stored};
 assert.equal(saveSettings(storage,settings),true);assert.deepEqual(readSettings(storage),normalizeSettings(settings));
 for(const change of [{metrics:{...settings.metrics,score:0.3}},{metrics:null},{personalCap:-1},{matchCap:201},
  {provisionalGames:1.5},{performanceScale:null},{provisionalExtraK:Infinity}])assert.throws(()=>normalizeSettings({...settings,...change}));
});
test('Maway controls change actual metric scoring and final caps',()=>{
 const b=fixture(2);
 const rows=Object.fromEntries(b.games[0].slots.map((s,i)=>[s.position,{team:s.team,result:s.userType,
  score:i*100,kills:(4-i)*10,droids_lost:10,structures_destroyed:5,research_complete:50,droids_built:20}]));
 const scoreOnly={score:1,kills:0,unitKd:0,structuresDestroyed:0,research:0,production:0};
 const killOnly={...scoreOnly,score:0,kills:1};
 const a=calculatePersonalRatings(b,{...MAWAY_SETTINGS,metrics:scoreOnly},{'test:1':rows});
 const c=calculatePersonalRatings(b,{...MAWAY_SETTINGS,metrics:killOnly},{'test:1':rows});
 assert.notEqual(a.games[0].slots[0].eloDelta,c.games[0].slots[0].eloDelta);
 const capped=calculatePersonalRatings(b,{...MAWAY_SETTINGS,matchCap:1},{'test:1':rows});
 assert.ok(capped.games[0].slots.every(s=>Math.abs(s.eloDelta)<=1));
 const noBonus=calculatePersonalRatings(b,{...MAWAY_SETTINGS,provisionalGames:0});
 close(noBonus.games[0].slots[0].eloDelta,4);
 const bigBonus=calculatePersonalRatings(b,{...MAWAY_SETTINGS,provisionalExtraK:8});
 close(bigBonus.games[0].slots[0].eloDelta,8);
});
