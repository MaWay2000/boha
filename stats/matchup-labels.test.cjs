const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'live-stats.js'), 'utf8');
const context = vm.createContext({
  URLSearchParams,
  getTeamStrengthPercent: team => team.strength,
  getNormalizedTeamUserType: (_, team) => team.result,
  getTeamToneClass: () => 'tone', getTeamStrengthToneClass: () => 'tone',
  getPlayerPowerLabel: account => `${account.power}%`,
  escapeHtml: value => String(value)
});
vm.runInContext(source.slice(source.indexOf('function renderMatchup('), source.indexOf('function getLastUpdateTime(')), context);
function team(size, strength, result) {
  return {strength, result, players: Array.from({length:size}, (_,i)=>({account:{name:result+i,power:strength}}))};
}
test('1v1 matchup layouts keep personal percentages and hide duplicate team-power labels', () => {
  const game = {teams:[team(1,60,'winner'),team(1,80,'loser'),{players:[]}]};
  for (const variant of ['chips','tiles']) {
    const html = context.renderMatchup(game,{variant,includePlayerPower:true});
    assert.doesNotMatch(html,/Team power|class="stats-team-strength/);
    assert.match(html,/winner0\s*\[60%\]/);
    assert.match(html,/loser0\s*\[80%\]/);
    assert.match(html,/Mega win!/);
  }
});
test('team matches and multiplayer FFA retain their team strength labels', () => {
  for (const teams of [[team(2,60,'winner'),team(2,80,'loser')],[team(1,60,'winner'),team(1,80,'loser'),team(1,70,'loser')]]) {
    for (const variant of ['chips','tiles']) {
      assert.equal((context.renderMatchup({teams},{variant}).match(/Team power:/g)||[]).length,teams.length);
    }
  }
});
