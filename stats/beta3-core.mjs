// ES-module port of Beta 3 arithmetic from commit
// 01a19e9ae85a9bdd6e6e16ce9cce4b7e5e66912f (2026-09-29).
export const BETA3_RULES = Object.freeze({ initialRating:1500, teamScale:400, performanceScale:400,
  establishedK:8, provisionalExtraK:4, provisionalGames:20, personalWeight:36, personalCap:10, matchCap:15,
  metrics:Object.freeze({score:0.25,kills:0.15,unitKd:0.30,structuresDestroyed:0.10,research:0.15,production:0.05}) });
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
export function readMetrics(stats) {
  const fields=['score','kills','droids_lost','structures_destroyed','research_complete','droids_built'];
  if(!stats||fields.some(key=>stats[key]===null||stats[key]===undefined||!Number.isFinite(Number(stats[key]))
    ||(key!=='score'&&Number(stats[key])<0))) return null;
  return {score:Number(stats.score),kills:Number(stats.kills),unitKd:(Number(stats.kills)+5)/(Number(stats.droids_lost)+5),
    structuresDestroyed:Number(stats.structures_destroyed),research:Number(stats.research_complete),production:Number(stats.droids_built)};
}
export function rankFraction(values,value) {
  if(values.length<2)return 0.5;
  const less=values.filter(v=>v<value).length, equal=values.filter(v=>v===value).length;
  return (less+(equal-1)/2)/(values.length-1);
}
export function rankPerformance(stats,rules=BETA3_RULES) {
  const metrics=stats.map(readMetrics);
  if(metrics.some(row=>row===null))return null;
  const scores=metrics.map(row=>{
    const ranks=Object.fromEntries(Object.keys(rules.metrics).map(key=>[key,rankFraction(metrics.map(peer=>peer[key]),row[key])]));
    return {ranks,score:Object.entries(rules.metrics).reduce((sum,[key,weight])=>sum+weight*ranks[key],0)};
  });
  return scores.map(row=>({...row,rank:1+scores.filter(peer=>peer.score>row.score+1e-10).length,field:scores.length}));
}
export function gameChanges(teamA,teamB,outcomeA,performance=null,rules=BETA3_RULES) {
  const average=players=>players.reduce((sum,p)=>sum+p.rating,0)/players.length;
  const expectedA=1/(1+10**((average(teamB)-average(teamA))/rules.teamScale));
  const field=[...teamA,...teamB], result=[];
  for(const [team,outcome,expected] of [[teamA,outcomeA,expectedA],[teamB,1-outcomeA,1-expectedA]]) {
    for(const player of team) {
      const k=rules.establishedK+(rules.provisionalGames>0?rules.provisionalExtraK*Math.max(0,1-player.games/rules.provisionalGames):0);
      const resultDelta=k*(outcome-expected);
      const expectedPerformance=field.reduce((sum,peer)=>peer.id===player.id?sum:
        sum+1/(1+10**((peer.rating-player.rating)/rules.performanceScale)),0)/(field.length-1);
      const personalDelta=performance?.has(player.id)
        ?clamp(rules.personalWeight*(performance.get(player.id).score-expectedPerformance),-rules.personalCap,rules.personalCap):0;
      result.push({id:player.id,expectedWin:expected,expectedPerformance,resultDelta,personalDelta,
        delta:clamp(resultDelta+personalDelta,-rules.matchCap,rules.matchCap)});
    }
  }
  return result;
}
