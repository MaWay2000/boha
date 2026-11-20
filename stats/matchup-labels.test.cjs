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
  for (const variant of ['chips','tiles','inline-power']) {
    const html = context.renderMatchup(game,{variant,includePlayerPower:true});
    assert.doesNotMatch(html,/Team power|class="stats-team-strength/);
    assert.match(html,/winner0\s*\[60%\]/);
    assert.match(html,/loser0\s*\[80%\]/);
    assert.match(html,/Mega win!/);
  }
});

test('inline power keeps each full 5v5 roster and its power badge in the same pill', () => {
  const teams = [team(5, 60, 'winner'), team(5, 80, 'loser')];
  const options = {variant: 'inline-power', includePlayerPower: true, showVersus: false};
  const html = context.renderMatchup({teams}, options);
  const pills = Array.from(html.matchAll(/class="stats-team stats-team-inline-power tone">\s*<div class="stats-team-roster">([\s\S]*?)<\/div>\s*<span class="stats-team-strength" title="Team power">([^<]+)<\/span>/g));
  assert.equal(pills.length, 2);
  for (const [index, [_, roster, badge]] of pills.entries()) {
    assert.equal((roster.match(/class="stats-team-player"/g) || []).length, 5);
    assert.ok(roster.includes(`${teams[index].result}4 [${teams[index].strength}%]`));
    assert.equal(badge, `${teams[index].strength}% power`);
  }
  assert.match(context.renderMatchup({teams, ratingMethod: 'maway-v1'}, options), /title="Pre-match chance">60% chance/);
});
test('team matches and multiplayer FFA retain their team strength labels', () => {
  for (const teams of [[team(2,60,'winner'),team(2,80,'loser')],[team(1,60,'winner'),team(1,80,'loser'),team(1,70,'loser')]]) {
    for (const variant of ['chips','tiles']) {
      assert.equal((context.renderMatchup({teams},{variant}).match(/Team power:/g)||[]).length,teams.length);
    }
  }
});
