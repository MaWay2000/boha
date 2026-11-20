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
  getPlayerPowerPercent: account => account.power,
  escapeHtml: value => String(value)
});
vm.runInContext(source.slice(source.indexOf('function renderMatchup('), source.indexOf('function getLastUpdateTime(')), context);
function team(size, strength, result) {
  return {strength, result, players: Array.from({length:size}, (_,i)=>({account:{name:result+i,power:strength}}))};
}
test('1v1 matchup layouts keep personal percentages and hide duplicate team-power labels', () => {
  const winner = team(1, 43, 'winner'), loser = team(1, 57, 'loser');
  winner.players[0].account.power = 78;
  loser.players[0].account.power = 25;
  const game = {ratingMethod: 'maway-v1', teams: [winner, loser, {players: []}]};
  for (const variant of ['chips','tiles','inline-power']) {
    const html = context.renderMatchup(game,{variant,includePlayerPower:variant !== 'inline-power'});
    assert.doesNotMatch(html,/Team power|class="stats-team-strength/);
    if (variant === 'inline-power') {
      assert.doesNotMatch(html, /\[\d+%\]/);
      assert.match(html, /class="stats-mega-win-star"[^>]*aria-label="Mega win"[^>]*>&#9733;<\/span>\s*<div class="stats-team-roster"><span class="stats-team-player">winner0/);
      assert.equal((html.match(/class="stats-mega-win-star"/g) || []).length, 1);
      assert.doesNotMatch(html, /Mega win!|class="stats-upset-victory"/);
    } else {
      assert.match(html,/winner0\s*\[78%\]/);
      assert.match(html,/loser0\s*\[25%\]/);
      assert.match(html,/Mega win!/);
    }
    const fills = Array.from(html.matchAll(/--team-power-fill: (\d+)%/g), match => Number(match[1]));
    assert.deepEqual(fills, variant === 'inline-power' ? [78, 25] : []);
  }
});

test('inline power keeps full rosters and colored bars without numeric badges', () => {
  const teams = [team(5, 60, 'winner'), team(5, 80, 'loser')];
  const options = {variant: 'inline-power', showVersus: false};
  const html = context.renderMatchup({teams}, options);
  assert.doesNotMatch(html, /class="stats-team-strength"/);
  const pills = Array.from(html.matchAll(/class="stats-team stats-team-inline-power tone stats-team-power-fill" style="--team-power-fill: (\d+)%; --team-power-hue: (\d+)">\s*(?:<span class="stats-mega-win-star"[^>]*>&#9733;<\/span>\s*)?<div class="stats-team-roster">([\s\S]*?)<\/div>/g));
  assert.equal(pills.length, 2);
  for (const [index, [_, fill, hue, roster]] of pills.entries()) {
    assert.equal(Number(fill), teams[index].strength);
    assert.equal(Number(hue), [72, 96][index]);
    assert.equal((roster.match(/class="stats-team-player"/g) || []).length, 5);
    assert.ok(roster.includes(`${teams[index].result}4`));
    assert.doesNotMatch(roster, /\[\d+%\]/);
  }
  const uneven = context.renderMatchup({teams: [team(2, 58, 'winner'), team(3, 97, 'loser')]}, options);
  assert.match(uneven, /--team-power-fill: 58%/);
  assert.match(uneven, /--team-power-fill: 97%/);
  assert.doesNotMatch(uneven, /class="stats-team-strength"/);
  const rated = context.renderMatchup({teams, ratingMethod: 'maway-v1'}, options);
  assert.match(rated, /--team-power-fill: 60%/);
  assert.match(rated, /--team-power-fill: 80%/);
  assert.doesNotMatch(rated, /chance|class="stats-team-strength/);
  assert.doesNotMatch(context.renderMatchup({teams: [team(5, null, 'winner')]}, options), /--team-power-fill/);
});
test('team matches and multiplayer FFA retain their team strength labels', () => {
  for (const teams of [[team(2,60,'winner'),team(2,80,'loser')],[team(1,60,'winner'),team(1,80,'loser'),team(1,70,'loser')]]) {
    for (const variant of ['chips','tiles']) {
      assert.equal((context.renderMatchup({teams},{variant}).match(/Team power:/g)||[]).length,teams.length);
    }
  }
});
