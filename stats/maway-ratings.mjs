// Maway v1 uses historical Beta 3 arithmetic, replacing the earlier K32 draft.
import {BETA3_RULES,rankPerformance,gameChanges} from './beta3-core.mjs?v=20261108-fields-1';
export const MAWAY_RULES=BETA3_RULES;
export function calculateMawayMatch(game,settings,rows) {
  const teams=game.teams.filter(team=>team.players.length);
  // Original Beta 3 scope: balanced two-team matches, 2v2 or larger.
  if(teams.length!==2||teams[0].players.length!==teams[1].players.length||teams[0].players.length<2
    ||teams.some(team=>team.players.some(slot=>slot.account.bot||slot.account.banned||slot.account.ratingIneligible)))return false;
  const kinds=teams.map(team=>team.userType);
  const outcome=kinds[0]==='winner'&&kinds[1]==='loser'?1:kinds[0]==='loser'&&kinds[1]==='winner'?0:
    kinds.every(type=>type==='contender')?0.5:null;
  if(outcome===null)return false;
  const slots=teams.flatMap(team=>team.players);
  const recorded=slots.map(slot=>{
    const row=rows?.[slot.position];
    return row?.team===slot.team&&row.result===slot.userType?row:null;
  });
  const rules={...BETA3_RULES,establishedK:settings.k,teamScale:settings.ratingScale,personalWeight:settings.personalWeight,
    performanceScale:settings.performanceScale,provisionalExtraK:settings.provisionalExtraK,provisionalGames:settings.provisionalGames,
    personalCap:settings.personalCap,matchCap:settings.matchCap,metrics:settings.metrics};
  const ranked=rankPerformance(recorded,rules);
  const players=teams.map(team=>team.players.map(slot=>({id:String(slot.position),rating:slot.elo,games:slot.account.eloCount})));
  const performance=ranked?new Map(slots.map((slot,i)=>[String(slot.position),ranked[i]])):null;
  const changes=gameChanges(players[0],players[1],outcome,performance,rules);
  const averages=teams.map(team=>team.players.reduce((sum,slot)=>sum+slot.elo,0)/team.players.length);
  game.ratingMethod='maway-v1';game.ratingBasis='beta3';game.eloDelta=0;
  teams.forEach((team,i)=>{team.ratingAverage=averages[i];team.ratingExpected=changes.find(change=>change.id===String(team.players[0].position)).expectedWin;});
  for(const [index,slot] of slots.entries()) {
    const change=changes.find(row=>row.id===String(slot.position));
    const side=teams.findIndex(team=>team.players.includes(slot));
    slot.ratingBreakdown={method:'maway-v1-beta3',teamAverage:averages[side],opponentAverage:averages[1-side],
      expected:change.expectedWin,expectedPerformance:change.expectedPerformance,performanceScore:ranked?.[index].score??null,
      performanceRank:ranked?.[index].rank??null,fieldSize:slots.length,metricRanks:ranked?.[index].ranks??null,
      base:change.resultDelta,adjustment:change.personalDelta,uncapped:change.resultDelta+change.personalDelta,
      capped:Math.abs(change.resultDelta+change.personalDelta)>rules.matchCap,matchCap:rules.matchCap,metrics:rules.metrics,
      performanceAvailable:!!ranked,provisional:slot.account.eloCount<rules.provisionalGames,provisionalGames:rules.provisionalGames,rated:true};
    slot.eloDelta=change.delta;slot.account.elo+=change.delta;slot.account.eloCount++;
    game.eloDelta+=Math.max(0,change.delta);
    if(!Number.isFinite(slot.account.elo))throw new Error('Invalid Maway rating.');
  }
  return true;
}
