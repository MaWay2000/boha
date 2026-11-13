const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const create=require('./youtube-loader.js');
function fixture(){const scripts=[],timers=new Map();let id=0;
 const win={document:{head:{append:s=>scripts.push(s)},createElement:()=>({remove(){this.removed=true;}})},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 return{win,scripts,timers,load:create(win)};}
test('YouTube makes no startup request, coalesces Play clicks and clears its timeout when ready',async()=>{
 const f=fixture();assert.equal(f.scripts.length,0);const a=f.load(),b=f.load();assert.equal(a,b);assert.equal(f.scripts.length,1);assert.equal(f.scripts[0].src,'https://www.youtube.com/iframe_api');
 f.win.YT={Player:function(){}};f.win.onYouTubeIframeAPIReady();await a;assert.equal(f.timers.size,0);await f.load();assert.equal(f.scripts.length,1);
});
test('blocked or timed-out YouTube requests offer a fresh retry',async()=>{
 const f=fixture();const first=f.load();f.scripts[0].onerror();await assert.rejects(first,/retry/);assert.equal(f.scripts[0].removed,true);
 const second=f.load();[...f.timers.values()][0]();await assert.rejects(second,/timed out/);
 const third=f.load();f.win.YT={Player:function(){}};f.win.onYouTubeIframeAPIReady();await third;assert.equal(f.scripts.length,3);
});
function playerFixture(){const source=fs.readFileSync(require.resolve('./player.js'),'utf8'),calls=[],timers=new Map();let resolveApi,rejectApi,id=0,requests=0;
 const status={textContent:'',hidden:true};const context={console,TRACKS:[{id:'a'},{id:'b'}],vol:{value:'30'},playerBar:{classList:{remove(){}}},document:{getElementById:()=>status},clampNumber:(x,a,b)=>Math.max(a,Math.min(b,x)),isTrackEnabled:i=>i===0||i===1,getFirstEnabledTrackIndex:()=>0,findEnabledTrackFrom:i=>(i+1)%2,updateTimebar(){},syncPlaylistSelection(){},updateIcon(){},unlockAudio(){context.audioUnlocked=true;},setVol(){},loadYouTube:()=>{requests++;return new Promise((resolve,reject)=>{resolveApi=resolve;rejectApi=reject;});}};
 context.window={setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 context.YT=context.window.YT={Player:function(_,options){this.options=options;for(const method of ['loadVideoById','cueVideoById','playVideo','pauseVideo','unMute','destroy'])this[method]=(...args)=>calls.push([method,...args]);},PlayerState:{PLAYING:1,PAUSED:2,ENDED:0}};
 vm.createContext(context);vm.runInContext('var player,playing=false,playerInitialized=false,playerReady=false,youtubeRequested=false,pendingPlayback=null,youtubeReadyTimer=0,currentTrackIndex=0,shuffleEnabled=false,audioUnlocked=false;',context);
 for(const name of ['hasPlayerMethod','stopPlayback','loadTrack','playTrack','initYouTubePlayer','setRadioStatus','requestYouTubePlayback','playPause','nextTrack']){
 const a=source.indexOf('function '+name+'('),next=source.indexOf('\nfunction ',a+1);vm.runInContext(source.slice(a,next<0?source.length:next),context);}
 return{context,calls,status,timers,requests:()=>requests,ready:async()=>{resolveApi();await Promise.resolve();context.player.options.events.onReady();},fail:async()=>{rejectApi(Error('retry'));await Promise.resolve();await Promise.resolve();}};
}
test('first Play loads once, honors the latest queued track, then supports pause and resume',async()=>{
 const f=playerFixture(),c=f.context;assert.equal(f.requests(),0);assert.equal(c.player,undefined);
 c.playPause();c.playPause();assert.equal(f.requests(),1);assert.equal(f.calls.length,0);
 c.nextTrack();await f.ready();assert.deepEqual(f.calls.find(x=>x[0]==='loadVideoById'),['loadVideoById','b']);assert.ok(f.calls.some(x=>x[0]==='unMute'));
 c.playPause();assert.equal(c.playing,false);assert.equal(f.calls.at(-1)[0],'pauseVideo');c.playPause();assert.equal(c.playing,true);assert.equal(f.calls.at(-1)[0],'playVideo');
 c.player.options.events.onAutoplayBlocked();assert.equal(c.playing,false);assert.match(f.status.textContent,/Press Play/);
});
test('a playlist Play is playback intent, and a failed first load can be retried',async()=>{
 const f=playerFixture(),c=f.context;c.playTrack(1);assert.equal(f.requests(),1);await f.fail();assert.equal(c.youtubeRequested,false);c.playPause();assert.equal(f.requests(),2);await f.ready();assert.ok(f.calls.some(x=>x[0]==='loadVideoById'&&x[1]==='b'));
});
test('the radio HTML has no eager YouTube request and idle animation polling is absent',()=>{
 const html=fs.readFileSync(require.resolve('./index.html'),'utf8'),source=fs.readFileSync(require.resolve('./player.js'),'utf8');
 assert.doesNotMatch(html,/<script[^>]+src="https:\/\/www.youtube.com/);assert.doesNotMatch(source,/setInterval\(animateBars/);assert.match(source,/if \(playing && !document.hidden\) visualTimer/);
});
