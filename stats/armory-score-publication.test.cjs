const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {sync} = require('./sync-armory-scores.cjs');
const row = {name: 'Online pilot', score: 4, kills: 3, bosses: 1, wave: 1, power: 500, savedAt: 100};
const reply = value => ({ok: true, text: async () => JSON.stringify(value)});

test('publication writes only public fields, preserves unchanged dates, and retains the last good table on failure', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-publication-'));
  const destination = path.join(folder, 'scores.json');
  try {
    let value = {schemaVersion: 1, token: 'private', sessions: ['private'], entries: [{...row, token: 'private', address: 'private'}]};
    const options = {destination, now: () => 1000, fetcher: async () => reply(value)};
    assert.equal(await sync(options), true);
    const original = fs.readFileSync(destination, 'utf8');
    assert.deepEqual(JSON.parse(original), {schemaVersion: 1, publishedAt: 1000, entries: [row]});
    assert.equal(await sync({...options, now: () => 2000}), false);
    assert.equal(fs.readFileSync(destination, 'utf8'), original);
    for (const invalid of [{schemaVersion: 2, entries: []}, {schemaVersion: 1, entries: [{...row, score: 999}]}, {schemaVersion: 1, entries: Array(11).fill(row)}]) {
      value = invalid; await assert.rejects(sync(options));
      assert.equal(fs.readFileSync(destination, 'utf8'), original);
    }
    await assert.rejects(sync({...options, fetcher: async () => ({ok: false, status: 503})}));
    await assert.rejects(sync({...options, fetcher: async () => { throw Error('offline'); }}));
    await assert.rejects(sync({...options, fetcher: async () => ({ok: true, text: async () => ' '.repeat(65537)})}));
    assert.equal(fs.readFileSync(destination, 'utf8'), original);
    value = {schemaVersion: 1, entries: []};
    assert.equal(await sync({...options, now: () => 3000}), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), {schemaVersion: 1, publishedAt: 3000, entries: []});
  } finally { fs.rmSync(folder, {recursive: true, force: true}); }
});
