import test from 'node:test';
import assert from 'node:assert/strict';
import {matchResults, participantResult, waveResult} from './wavehoster-data.mjs';
import publication from './wavehoster-publication.cjs';
import departures from './arc-departures.cjs';

const game = () => ({id: 'game', status: 'unknown', modsVerified: true, players: ['Defender'], participants: [],
  durationMilliseconds: 100000, waveReached: 7, waveEndedAtMilliseconds: 96000, waveOutcome: 'defeat', waveEndReason: 'scripted-defeat'});
test('host outcome describes defeat and wave without inventing a certified ranking result', () => {
  assert.equal(matchResults(game())[0].label, 'Defeated · Wave 7/60');
  assert.equal(participantResult(game(), {result: 'unknown'}), 'unknown');
});
test('departure is labelled explicitly and retains the existing loss policy', () => {
  const g = {...game(), waveEndReason: 'departure'};
  assert.equal(matchResults(g)[0].label, 'Left game (loss) · Wave 7/60');
  assert.equal(participantResult(g, {result: 'loser', resultReason: 'departure', leftAtMilliseconds: 95000}), 'loser');
});
test('victory requires the final wave; absent and inconsistent evidence remains unresolved', () => {
  assert.equal(waveResult({...game(), waveReached: 60, waveOutcome: 'victory', waveEndReason: 'wave-clear'}).result, 'winner');
  for (const patch of [{modsVerified: false}, {waveReached: 61}, {waveReached: -1}, {waveEndedAtMilliseconds: 100001},
    {waveOutcome: 'victory'}, {waveOutcome: 'other'}, {waveEndReason: 'wave-clear'}, {waveReached: undefined}]) {
    assert.equal(waveResult({...game(), ...patch}), null);
  }
  assert.equal(matchResults({...game(), waveReached: undefined})[0].label, 'Result unavailable');
  assert.equal(waveResult({...game(), status: 'confirmed', participants: [{result: 'winner'}]}), null);
});
test('the publication allowlist preserves only the derived host facts', () => {
  const input = {format: 1, source: 'WaveHoster', ranking: 'wins-then-best-score', groups: [], games: [game()]};
  input.games[0].localLogFilename = 'private';
  const output = publication.sanitizeWaveHoster(input);
  assert.equal(output.games[0].waveReached, 7);
  assert.equal(output.games[0].waveOutcome, 'defeat');
  assert.equal(output.games[0].localLogFilename, undefined);
});

test('matched host endings survive an upstream refresh without borrowing evidence from another group', () => {
  const previous={games:[{...game(),group:'same'}],groups:[]};
  const next={games:[{...game(),group:'same',waveOutcome:undefined}],groups:[]};
  assert.equal(departures.mergeHistory(previous,next).games[0].waveOutcome,'defeat');
  assert.equal(departures.mergeHistory(previous,{games:[{...game(),group:'different',waveOutcome:undefined}],groups:[]}).games[0].waveOutcome,undefined);
});
